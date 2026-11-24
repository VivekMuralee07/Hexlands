package com.hexlands.app.net

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.serializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.IOException
import java.util.concurrent.TimeUnit

/** An answer from the server that says no, with the reason it gives (shown to the player as it is). */
class ApiException(message: String, val status: Int = 0) : Exception(message)

/** Who you are in a room: the room code and your seat token (or a spectator token). */
data class Session(val code: String, val token: String, val spectator: Boolean = false)

/** What comes down the live stream. */
sealed interface StreamEvent {
    data class BoardMsg(val board: Board) : StreamEvent
    data class StateMsg(val state: GameState) : StreamEvent
    /** The server ended the room on purpose; [reason] is "empty" when every player left. */
    data class Closed(val reason: String) : StreamEvent
    /** The connection dropped; the stream is trying again. */
    data object Reconnecting : StreamEvent
    /** The server no longer knows this seat or room; the stream is over. */
    data class Gone(val status: Int) : StreamEvent
}

/**
 * The game server's API: plain JSON over HTTP for actions, and a Server-Sent Events stream for everything that changes.
 * [pid] is this device's anonymous player ID (the same kind the web app keeps), used for the leaderboard.
 */
class HexApi(
    private val baseUrl: String,
    private val pid: String,
    client: OkHttpClient = OkHttpClient(),
) {
    private val http = client.newBuilder().callTimeout(30, TimeUnit.SECONDS).build()
    // The live stream stays open for as long as the game does: no read timeout. The server sends a ping every 20 seconds.
    private val streamHttp = client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).retryOnConnectionFailure(true).build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    // ---------- starting and joining ----------

    suspend fun quickPlay(name: String): SessionReply = post("/api/quickplay", buildJsonObject { put("name", name); put("pid", pid) })

    suspend fun create(name: String, public: Boolean, preset: String = "classic", vpTarget: Int = 10): SessionReply =
        post("/api/create", buildJsonObject {
            put("name", name); put("pid", pid); put("public", public); put("vpTarget", vpTarget)
            putJsonObject("map") { put("preset", preset) }
        })

    suspend fun join(code: String, name: String, token: String? = null): SessionReply =
        post("/api/join", buildJsonObject {
            put("code", code.trim().uppercase()); put("name", name); put("pid", pid)
            if (token != null) put("token", token)
        })

    suspend fun watch(code: String, token: String? = null): SessionReply =
        post("/api/watch", buildJsonObject { put("code", code.trim().uppercase()); if (token != null) put("token", token) })

    suspend fun leave(session: Session) {
        post<JsonObject>("/api/leave", buildJsonObject { put("code", session.code); put("token", session.token) })
    }

    // ---------- playing ----------

    /** Sends one game action, for example `action("roll")` or `action("settle") { put("vertex", 12) }`. Throws [ApiException] with the server's reason. */
    suspend fun act(session: Session, type: String, extra: (kotlinx.serialization.json.JsonObjectBuilder.() -> Unit)? = null): JsonObject =
        post("/api/action", buildJsonObject {
            put("code", session.code); put("token", session.token)
            putJsonObject("action") { put("type", type); extra?.invoke(this) }
        })

    // ---------- lists ----------

    suspend fun rooms(): RoomsReply = get("/api/rooms")

    /** The leaderboard: [mode] ranked | multi | all, [period] all | 30 | 7 (days), [sort] wins | rate | vp. Your own standing is marked with the device ID. */
    suspend fun leaderboard(mode: String, period: String, sort: String): LbReply = get("/api/leaderboard?mode=$mode&period=$period&sort=$sort&pid=$pid")

    /** This device's last ten finished games. */
    suspend fun recent(): RecentReply = get("/api/recent?pid=$pid")

    /** Every map the game has. */
    suspend fun maps(): MapsReply = get("/api/maps")

    /** One map's board (a random layout, or the one for [seed]). */
    suspend fun preview(key: String): PreviewReply = get("/api/preview?map=$key")

    // ---------- the live stream ----------

    /**
     * Everything that happens in the room, as it happens. If the connection drops it says [StreamEvent.Reconnecting] and tries again every two
     * seconds until the collector stops listening, unless the server says the seat or room is gone.
     */
    fun events(session: Session): Flow<StreamEvent> = callbackFlow {
        val url = "$baseUrl/api/events?code=${enc(session.code)}&token=${enc(session.token)}"
        var source: EventSource? = null
        val factory = EventSources.createFactory(streamHttp)
        val job = launch {
            while (isActive) {
                val finished = kotlinx.coroutines.CompletableDeferred<Boolean>()   // true: give up, false: try again
                val listener = object : EventSourceListener() {
                    override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                        try {
                            when (type) {
                                "board" -> trySend(StreamEvent.BoardMsg(HexJson.decodeFromString(Board.serializer(), data)))
                                "state" -> trySend(StreamEvent.StateMsg(HexJson.decodeFromString(GameState.serializer(), data)))
                                "closed" -> {
                                    val why = runCatching { HexJson.decodeFromString(ClosedReason.serializer(), data).reason }.getOrDefault("")
                                    trySend(StreamEvent.Closed(why)); finished.complete(true)
                                }
                            }
                        } catch (e: Exception) { /* a message this version cannot read: skip it, the next state replaces it */ }
                    }
                    override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                        val code = response?.code ?: 0
                        if (code == 404 || code == 410) { trySend(StreamEvent.Gone(code)); finished.complete(true) }
                        else finished.complete(false)
                    }
                    override fun onClosed(eventSource: EventSource) { finished.complete(false) }
                }
                source = factory.newEventSource(Request.Builder().url(url).header("Accept", "text/event-stream").build(), listener)
                val giveUp = finished.await()
                source?.cancel()
                if (giveUp) { close(); return@launch }
                trySend(StreamEvent.Reconnecting)
                delay(2000)
            }
        }
        awaitClose { job.cancel(); source?.cancel() }
    }

    // ---------- plumbing ----------

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    private suspend inline fun <reified T> post(path: String, body: JsonObject): T where T : Any =
        call(Request.Builder().url(baseUrl + path).post(body.toString().toRequestBody(jsonType)).build())

    private suspend inline fun <reified T> get(path: String): T where T : Any =
        call(Request.Builder().url(baseUrl + path).get().build())

    private suspend inline fun <reified T> call(request: Request): T {
        val text = withContext(Dispatchers.IO) { execute(request) }
        return HexJson.decodeFromString(HexJson.serializersModule.serializer<T>(), text)
    }

    private suspend fun execute(request: Request): String = suspendCancellableCoroutine { cont: CancellableContinuation<String> ->
        val call = http.newCall(request)
        cont.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) cont.resumeWith(Result.failure(ApiException("Cannot reach the game server. Check your connection and try again.")))
            }
            override fun onResponse(call: Call, response: Response) {
                response.use { r ->
                    val text = r.body?.string().orEmpty()
                    if (r.isSuccessful) { if (cont.isActive) cont.resumeWith(Result.success(text)); return }
                    val reason = runCatching { HexJson.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                    val message = reason ?: if (r.code in 502..504) "The game server is starting up. Try again in a minute." else "Something went wrong (${r.code})."
                    if (cont.isActive) cont.resumeWith(Result.failure(ApiException(message, r.code)))
                }
            }
        })
    }
}
