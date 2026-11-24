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
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.put

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
)

class GameViewModel(app: Application) : AndroidViewModel(app) {
    val prefs = Prefs(app)
    private val api = HexApi(BuildConfig.SERVER_URL, prefs.pid)

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var stream: Job? = null

    init {
        // Come back to the game you were in, if the server still has it.
        val code = prefs.sessionCode
        val token = prefs.sessionToken
        if (code != null && token != null) connect(Session(code, token))
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

    // ---------- the room list ----------

    fun loadRooms() {
        viewModelScope.launch {
            try { _ui.update { it.copy(rooms = api.rooms(), roomsError = null) } }
            catch (e: ApiException) { _ui.update { it.copy(roomsError = e.message) } }
        }
    }

    fun shareLink(code: String) = "${BuildConfig.SERVER_URL}/room/$code"
}
