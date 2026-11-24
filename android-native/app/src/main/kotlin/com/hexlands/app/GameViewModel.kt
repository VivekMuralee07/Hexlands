package com.hexlands.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.hexlands.app.net.ApiException
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexApi
import com.hexlands.app.net.RoomsReply
import com.hexlands.app.net.Session
import com.hexlands.app.net.StreamEvent
import com.hexlands.app.update.UpdateInfo
import com.hexlands.app.update.UpdateState
import com.hexlands.app.update.Updater
import okhttp3.OkHttpClient
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** Everything the screens show. */
data class UiState(
    val session: Session? = null,
    val board: Board? = null,
    val game: GameState? = null,
    val busy: Boolean = false,
    val reconnecting: Boolean = false,
    /** A short message to show once (the server's reason for a refusal, for example). */
    val message: String? = null,
    /** Shown on the home screen: why you were sent back (the game ended, the room closed...). */
    val notice: String? = null,
    val rooms: RoomsReply? = null,
    val roomsError: String? = null,
    /** A room code from an invite link, ready to join. */
    val joinCode: String = "",
    val update: UpdateState = UpdateState.Idle,
    /** The maps the host can choose from, loaded when the picker opens. */
    val maps: List<com.hexlands.app.net.MapInfo>? = null,
    /** A preview board for each map looked at so far (each from its own seed). */
    val previews: Map<String, com.hexlands.app.net.PreviewReply> = emptyMap(),
)

class GameViewModel(private val app: Application) : AndroidViewModel(app) {
    val prefs = Prefs(app)
    private val updateHttp = OkHttpClient()
    private val api = HexApi(BuildConfig.SERVER_URL, prefs.pid)

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var stream: Job? = null

    init {
        // Come back to the game you were in, if the server still has it.
        val code = prefs.sessionCode
        val token = prefs.sessionToken
        if (code != null && token != null) connect(Session(code, token))
        if (BuildConfig.SELF_UPDATE) checkForUpdate()
    }

    val name: String get() = prefs.name

    fun setName(n: String) { prefs.name = n.trim().take(16) }
    fun setJoinCode(code: String) = _ui.update { it.copy(joinCode = code.uppercase().filter { c -> c.isLetterOrDigit() }.take(5)) }
    fun showMessage(text: String) = _ui.update { it.copy(message = text) }
    fun consumeMessage() = _ui.update { it.copy(message = null) }
    fun consumeNotice() = _ui.update { it.copy(notice = null) }

    // ---------- getting into a room ----------

    fun quickPlay() = enter { api.quickPlay(prefs.name) }
    fun createRoom(public: Boolean) = enter { api.create(prefs.name, public) }
    fun joinRoom(code: String) = enter { api.join(code, prefs.name) }
    fun watchRoom(code: String) = enter(spectator = true) { api.watch(code) }

    private fun enter(spectator: Boolean = false, call: suspend () -> com.hexlands.app.net.SessionReply) {
        if (_ui.value.busy) return
        _ui.update { it.copy(busy = true, notice = null) }
        viewModelScope.launch {
            try {
                val r = call()
                connect(Session(r.code, r.token, spectator || r.spectator))
            } catch (e: ApiException) {
                _ui.update { it.copy(message = e.message) }
            } finally {
                _ui.update { it.copy(busy = false) }
            }
        }
    }

    private fun connect(session: Session) {
        stream?.cancel()
        if (!session.spectator) prefs.saveSession(session.code, session.token)
        _ui.update { it.copy(session = session, board = null, game = null, reconnecting = false) }
        stream = viewModelScope.launch {
            api.events(session).collect { ev ->
                when (ev) {
                    is StreamEvent.BoardMsg -> _ui.update { it.copy(board = ev.board) }
                    is StreamEvent.StateMsg -> _ui.update { it.copy(game = ev.state, reconnecting = false) }
                    is StreamEvent.Reconnecting -> _ui.update { it.copy(reconnecting = true) }
                    is StreamEvent.Closed -> goHome(if (ev.reason == "empty") "The game was ended because all the players left." else "This room has closed.")
                    is StreamEvent.Gone -> goHome("That game is no longer there.")
                }
            }
        }
    }

    /** Leaves the room for good. A running game goes on with a bot in your seat (or ends, if you were the last person). */
    fun leave() {
        val s = _ui.value.session ?: return
        goHome(null)
        if (!s.spectator) viewModelScope.launch { runCatching { api.leave(s) } }
    }

    private fun goHome(notice: String?) {
        stream?.cancel(); stream = null
        prefs.clearSession()
        _ui.update { it.copy(session = null, board = null, game = null, reconnecting = false, notice = notice) }
    }

    // ---------- playing ----------

    /** Sends an action. The server's reason for a refusal is shown as a message. Returns the server's reply, or null if refused. */
    fun act(type: String, onDone: ((JsonObject?) -> Unit)? = null, extra: (JsonObjectBuilder.() -> Unit)? = null) {
        val s = _ui.value.session ?: return
        viewModelScope.launch {
            try {
                val reply = api.act(s, type, extra)
                onDone?.invoke(reply)
            } catch (e: ApiException) {
                _ui.update { it.copy(message = e.message) }
                onDone?.invoke(null)
            }
        }
    }

    /** Trades with the bank: [times] cards of [get] for the bank's price in [give]. Stops at the first refusal and shows its reason. */
    fun bankTrade(give: String, get: String, times: Int) {
        val s = _ui.value.session ?: return
        viewModelScope.launch {
            try { repeat(times) { api.act(s, "bankTrade") { put("give", give); put("get", get) } } }
            catch (e: ApiException) { _ui.update { it.copy(message = e.message) } }
        }
    }

    // ---------- updating the app (test build only) ----------

    /** Looks for a newer build. [quiet] = true says nothing when there is none (the check at start-up); false shows "up to date" or the problem. */
    fun checkForUpdate(quiet: Boolean = true) {
        if (!BuildConfig.SELF_UPDATE) return
        val now = _ui.value.update
        if (now is UpdateState.Checking || now is UpdateState.Downloading) return
        _ui.update { it.copy(update = UpdateState.Checking) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { Updater.fetchLatest(updateHttp, BuildConfig.UPDATE_REPO) } }
            val next = result.fold(
                onSuccess = { latest -> Updater.newerThan(BuildConfig.VERSION_CODE, latest)?.let { UpdateState.Available(it) } ?: if (quiet) UpdateState.Idle else UpdateState.UpToDate },
                onFailure = { if (quiet) UpdateState.Idle else UpdateState.Failed("Could not check for updates. Check your connection.") },
            )
            _ui.update { it.copy(update = next) }
        }
    }

    /** Downloads the new build, then hands it to Android's installer. */
    fun startUpdate() {
        val info: UpdateInfo = (_ui.value.update as? UpdateState.Available)?.info ?: (_ui.value.update as? UpdateState.Failed)?.let { lastInfo } ?: return
        lastInfo = info
        _ui.update { it.copy(update = UpdateState.Downloading(info, 0)) }
        viewModelScope.launch {
            Updater.download(updateHttp, info, Updater.updatesDir(app)).collect { r ->
                r.fold(
                    onSuccess = { (pct, file) ->
                        if (file == null) _ui.update { it.copy(update = UpdateState.Downloading(info, pct)) }
                        else { _ui.update { it.copy(update = UpdateState.Ready(info, file)) }; installUpdate() }
                    },
                    onFailure = { e -> _ui.update { it.copy(update = UpdateState.Failed(e.message ?: "The download failed.")) } },
                )
            }
        }
    }
    private var lastInfo: UpdateInfo? = null

    /** Starts Android's installer for the downloaded build; the first time, sends you to the setting that allows installing from this app. */
    fun installUpdate() {
        val ready = _ui.value.update as? UpdateState.Ready ?: return
        if (!Updater.canInstall(app)) {
            Updater.openInstallPermissionSettings(app)
            _ui.update { it.copy(message = "Allow installing from Hexlands, then come back and tap Install.") }
            return
        }
        Updater.install(app, ready.file)
    }

    // ---------- choosing the map (the host, in the waiting room) ----------

    fun loadMaps() {
        if (_ui.value.maps != null) return
        viewModelScope.launch {
            try { _ui.update { it.copy(maps = api.maps().maps) } }
            catch (e: ApiException) { _ui.update { it.copy(message = e.message) } }
        }
    }

    /** Makes a preview of a map once; the server answers with a board and the seed it was made from. */
    fun loadPreview(key: String) {
        if (_ui.value.previews.containsKey(key) || !requested.add(key)) return
        viewModelScope.launch {
            try { val p = api.preview(key); _ui.update { it.copy(previews = it.previews + (key to p)) } }
            catch (e: ApiException) { requested.remove(key) }
        }
    }
    private val requested = mutableSetOf<String>()

    /** The server swaps the board (the exact layout of the preview when a seed is given); the new one arrives on the live stream like any other change. */
    fun chooseMap(key: String, seed: Long? = null) = act("setMap") { put("preset", key); if (seed != null) put("seed", seed) }

    /** The host changes one of the game options in the waiting room (points to win, discard, move timer, friendly robber, balanced dice). */
    fun setOption(key: String, value: Int) = act("setOptions") { putJsonObject("opts") { put(key, value) } }
    fun setOption(key: String, value: Boolean) = act("setOptions") { putJsonObject("opts") { put(key, value) } }
    fun setOption(key: String, value: String) = act("setOptions") { putJsonObject("opts") { put(key, value) } }

    // ---------- the room list ----------

    fun loadRooms() {
        viewModelScope.launch {
            try { _ui.update { it.copy(rooms = api.rooms(), roomsError = null) } }
            catch (e: ApiException) { _ui.update { it.copy(roomsError = e.message) } }
        }
    }

    fun shareLink(code: String) = "${BuildConfig.SERVER_URL}/room/$code"
}
