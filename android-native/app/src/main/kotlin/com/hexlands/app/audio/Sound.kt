package com.hexlands.app.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Plays the game's synthesized sounds (see [Effects] and [Themes]). Rendering and playing happen off the main thread; the first play of an effect
 * renders it and later plays reuse it. Does nothing until [init] has been called (so the screen tests stay silent), and each of sound effects
 * and music can be switched off; the choice is kept on the device.
 */
object Sound {
    private var prefs: android.content.SharedPreferences? = null
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "hexlands-sound").apply { isDaemon = true } }
    private val cache = ConcurrentHashMap<String, ShortArray>()
    private val main = Handler(Looper.getMainLooper())
    private var themeTrack: AudioTrack? = null
    private var lastClick = 0L

    @Volatile var sfxOn = true; private set
    @Volatile var musicOn = true; private set

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("hexlands-sound", Context.MODE_PRIVATE)
        prefs = p; sfxOn = p.getBoolean("sfx", true); musicOn = p.getBoolean("music", true)
        // render the effects used most while the front page is on the screen, so the first tap is not late
        io.execute { listOf("click", "res:wood", "dice", "road", "settle", "city", "coin", "robber", "seven", "turn", "gain").forEach { render(it.substringBefore(':'), it.substringAfter(':', "").ifEmpty { null }) } }
    }

    private fun render(name: String, arg: String?): ShortArray = cache.getOrPut("$name:${arg ?: ""}") { Effects.render(name, arg) }

    fun play(name: String, arg: String? = null) {
        if (!sfxOn || prefs == null) return
        if (name == "click") { val now = System.currentTimeMillis(); if (now - lastClick < 60) return; lastClick = now }
        io.execute { val pcm = render(name, arg); if (pcm.isNotEmpty()) playPcm(pcm, 44100, AudioAttributes.USAGE_GAME) }
    }

    /** Plays "start" (the game begins) or "finish" (it is over) once. */
    fun theme(name: String) {
        if (!musicOn || prefs == null) return
        io.execute {
            stopThemeNow()
            val pcm = cache.getOrPut("theme:$name") { Themes.render(name, 32000) }
            if (pcm.isNotEmpty()) themeTrack = playPcm(pcm, 32000, AudioAttributes.USAGE_MEDIA)
        }
    }

    fun stopTheme() { if (prefs != null) io.execute { stopThemeNow() } }
    private fun stopThemeNow() { themeTrack?.let { t -> runCatching { t.stop(); t.release() } }; themeTrack = null }

    fun setSfx(on: Boolean) { sfxOn = on; prefs?.edit()?.putBoolean("sfx", on)?.apply(); if (on) play("click") }
    fun setMusic(on: Boolean) { musicOn = on; prefs?.edit()?.putBoolean("music", on)?.apply(); if (on) theme("start") else stopTheme() }

    private fun playPcm(pcm: ShortArray, rate: Int, usage: Int): AudioTrack? = try {
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(pcm.size * 2).setTransferMode(AudioTrack.MODE_STATIC).build()
        track.write(pcm, 0, pcm.size)
        track.play()
        main.postDelayed({ runCatching { track.release() } }, pcm.size * 1000L / rate + 400)   // let it finish, then give the player back
        track
    } catch (e: Exception) { null }
}
