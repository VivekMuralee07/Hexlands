package com.hexlands.app

import android.content.Context
import android.content.SharedPreferences
import java.security.SecureRandom

/** What the app remembers on the device: the anonymous player ID, your name, and the seat of the game you are in (to come back to it). */
class Prefs(context: Context) {
    private val p: SharedPreferences = context.getSharedPreferences("hexlands", Context.MODE_PRIVATE)

    /** A random ID that stays on this device. The leaderboard counts your games under it; there is no account. */
    val pid: String
        get() = p.getString("pid", null)?.takeIf { Regex("^[a-f0-9]{32}$").matches(it) } ?: newPid().also { p.edit().putString("pid", it).apply() }

    var name: String
        get() = p.getString("name", "") ?: ""
        set(v) { p.edit().putString("name", v).apply() }

    var sessionCode: String?
        get() = p.getString("sessionCode", null)
        private set(v) { p.edit().putString("sessionCode", v).apply() }
    var sessionToken: String?
        get() = p.getString("sessionToken", null)
        private set(v) { p.edit().putString("sessionToken", v).apply() }

    fun saveSession(code: String, token: String) { sessionCode = code; sessionToken = token }
    fun clearSession() { sessionCode = null; sessionToken = null }

    var vibrate: Boolean
        get() = p.getBoolean("vibrate", true)
        set(v) { p.edit().putBoolean("vibrate", v).apply() }

    /** Your record on this device: games finished and games won. A game is counted once (the key is the room and its turn number). */
    val recordGames: Int get() = p.getInt("recordGames", 0)
    val recordWins: Int get() = p.getInt("recordWins", 0)
    fun recordResult(key: String, won: Boolean) {
        val seen = (p.getString("recordSeen", "") ?: "").split(",").filter { it.isNotEmpty() }
        if (key in seen) return
        p.edit().putString("recordSeen", (seen + key).takeLast(30).joinToString(",")).putInt("recordGames", recordGames + 1).putInt("recordWins", recordWins + if (won) 1 else 0).apply()
    }

    private fun newPid(): String {
        val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
