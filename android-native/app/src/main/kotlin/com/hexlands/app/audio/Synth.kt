package com.hexlands.app.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tanh

// The game's sound, made from nothing: the same effects and the same two beat themes as the web game (sound.js), but rendered here into PCM samples instead of
// being played live with Web Audio. Everything is synthesized (oscillators, noise and filters shaped by envelopes), so the app carries no audio files.

enum class Wave { SINE, TRIANGLE, SQUARE, SAW }
enum class Filt { LOW, HIGH, BAND }

/** A second-order filter (the usual "audio EQ cookbook" low-pass, high-pass and band-pass). */
private class Biquad(private val rate: Int, private val kind: Filt, private var freq: Double, private val q: Double) {
    private var b0 = 0.0; private var b1 = 0.0; private var b2 = 0.0; private var a1 = 0.0; private var a2 = 0.0
    private var x1 = 0.0; private var x2 = 0.0; private var y1 = 0.0; private var y2 = 0.0
    init { set(freq) }
    fun set(f: Double) {
        freq = f.coerceIn(20.0, rate * 0.45)
        val w = 2 * PI * freq / rate; val cw = cos(w); val alpha = sin(w) / (2 * q)
        val a0 = 1 + alpha
        when (kind) {
            Filt.LOW -> { b0 = (1 - cw) / 2 / a0; b1 = (1 - cw) / a0; b2 = b0 }
            Filt.HIGH -> { b0 = (1 + cw) / 2 / a0; b1 = -(1 + cw) / a0; b2 = b0 }
            Filt.BAND -> { b0 = alpha / a0; b1 = 0.0; b2 = -alpha / a0 }
        }
        a1 = -2 * cw / a0; a2 = (1 - alpha) / a0
    }
    fun next(x: Double): Double {
        val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = x; y2 = y1; y1 = y
        return y
    }
}

/** A buffer that sounds are mixed into, the way the web game schedules them on an audio clock: [t] is always seconds from the start. */
class Mix(val rate: Int, seconds: Double, private val seed: Long = 12345) {
    val buf = FloatArray((rate * seconds).toInt())
    private var rng = seed
    private fun noiseSample(): Double { rng = rng * 6364136223846793005L + 1442695040888963407L; return ((rng ushr 33).toInt() / 1073741824.0) - 1.0 }

    /** Exponential attack then decay, like Web Audio's exponentialRampToValueAtTime from 0.0001. */
    private fun env(x: Double, peak: Double, attack: Double, decay: Double): Double {
        if (x < 0 || x > attack + decay) return 0.0
        val lo = 0.0001
        return if (x < attack) lo * (peak / lo).pow(x / max(attack, 1e-9)) else peak * (lo / peak).pow((x - attack) / max(decay, 1e-9))
    }

    fun tone(type: Wave, f: Double, t: Double, peak: Double, attack: Double, decay: Double, to: Double? = null, filter: Double? = null) {
        val start = (t * rate).toInt(); val total = attack + decay; val n = ((total + 0.05) * rate).toInt()
        val lp = filter?.let { Biquad(rate, Filt.LOW, it, 0.7071) }
        var phase = 0.0
        for (i in 0 until n) {
            val idx = start + i; if (idx < 0 || idx >= buf.size) continue
            val x = i.toDouble() / rate
            val fr = if (to != null) f * (to / f).pow(min(1.0, x / total)) else f
            phase += fr / rate; phase -= kotlin.math.floor(phase)
            var s = when (type) {
                Wave.SINE -> sin(2 * PI * phase)
                Wave.TRIANGLE -> 2 / PI * asin(sin(2 * PI * phase))
                Wave.SQUARE -> if (phase < 0.5) 1.0 else -1.0
                Wave.SAW -> 2 * phase - 1
            }
            s *= env(x, peak, attack, decay)
            if (lp != null) s = lp.next(s)
            buf[idx] += s.toFloat()
        }
    }

    fun noise(t: Double, peak: Double, dur: Double, kind: Filt, freq: Double, q: Double = 1.0, attack: Double = 0.002, sweepTo: Double? = null) {
        val start = (t * rate).toInt(); val n = ((attack + dur + 0.05) * rate).toInt()
        val f = Biquad(rate, kind, freq, q)
        for (i in 0 until n) {
            val idx = start + i; if (idx < 0 || idx >= buf.size) continue
            val x = i.toDouble() / rate
            if (sweepTo != null && i % 32 == 0) f.set(freq * (sweepTo / freq).pow(min(1.0, x / dur)))
            buf[idx] += (f.next(noiseSample()) * env(x, peak, attack, dur)).toFloat()
        }
    }

    /** Peak and how long the sound stays audible, for trimming and for the tests. */
    fun peak(): Float = buf.maxOfOrNull { abs(it) } ?: 0f
    fun audibleSamples(): Int { var last = 0; for (i in buf.indices) if (abs(buf[i]) > 0.01f) last = i; return last }

    /** The mix as 16-bit samples: a gentle limiter (the web game uses a compressor) so loud moments do not clip. [gain] is the bus level. */
    fun toPcm(gain: Double, tailSeconds: Double = 0.05): ShortArray {
        val len = min(buf.size, audibleSamples() + (tailSeconds * rate).toInt())
        return ShortArray(len) { i -> (tanh(buf[i] * gain * 1.4) / 1.4 * 32767 * 0.95).toInt().coerceIn(-32768, 32767).toShort() }
    }
}

private fun note(n: Int) = 440.0 * 2.0.pow((n - 69) / 12.0)

/** The sound effects, one function each, in the same words as the web's sound.js. */
object Effects {
    val NAMES = listOf("click", "res", "note", "road", "settle", "city", "place", "dice", "card", "gain", "steal", "gem", "heist", "fire", "devbuy", "turn", "robber", "seven", "discard", "offer", "coin", "award", "error", "tick")
    private val NOTE = mapOf("wood" to 293.66, "brick" to 329.63, "sheep" to 392.0, "wheat" to 440.0, "ore" to 523.25)

    private fun Mix.sweep(t: Double, f0: Double, f1: Double, dur: Double, peak: Double, q: Double = 1.2, kind: Filt = Filt.BAND) =
        noise(t, peak, dur, kind, f0, q, attack = min(0.02, dur / 3), sweepTo = f1)
    private fun Mix.knock(t: Double, f: Double = 190.0, peak: Double = 0.5, len: Double = 0.09) {
        tone(Wave.SINE, f, t, peak, 0.002, len, to = f * 0.5); noise(t, peak * 0.5, 0.04, Filt.BAND, f * 5, 2.0)
    }
    private fun Mix.bell(t: Double, f: Double, peak: Double = 0.22) = doubleArrayOf(1.0, 2.76, 5.4).forEachIndexed { i, m -> tone(Wave.SINE, f * m, t, peak / (i + 1), 0.003, 1.1 / (i + 1)) }
    private fun Mix.click(t: Double) { tone(Wave.TRIANGLE, 1700.0, t, 0.45, 0.002, 0.035, to = 1100.0); noise(t, 0.18, 0.02, Filt.HIGH, 5000.0) }

    /** Renders one effect (with [arg] for the ones that take one: the resource for "res"). */
    fun render(name: String, arg: String? = null, rate: Int = 44100): ShortArray {
        val m = Mix(rate, 2.6)
        val t = 0.005
        when (name) {
            "click" -> m.click(t)
            "res" -> { m.click(t); val f = NOTE[arg] ?: 440.0; m.tone(Wave.SINE, f, t + 0.01, 0.5, 0.004, 0.26); m.tone(Wave.SINE, f * 2, t + 0.01, 0.12, 0.003, 0.12) }
            "note" -> { val f = NOTE[arg] ?: 440.0; m.tone(Wave.SINE, f, t, 0.5, 0.004, 0.26); m.tone(Wave.SINE, f * 2, t, 0.12, 0.003, 0.12) }   // the tone of a resource without the click
            "road" -> { m.knock(t, 240.0, 0.42, 0.06); m.knock(t + 0.085, 190.0, 0.5, 0.09) }
            "settle", "place" -> { m.knock(t, 150.0, 0.95, 0.12); m.tone(Wave.TRIANGLE, 660.0, t + 0.07, 0.2, 0.004, 0.25) }
            "city" -> { m.knock(t, 120.0, 0.65, 0.14); m.knock(t + 0.11, 150.0, 0.55, 0.12); doubleArrayOf(523.0, 659.0, 784.0).forEachIndexed { i, f -> m.tone(Wave.TRIANGLE, f, t + 0.2 + i * 0.07, 0.12, 0.004, 0.42) } }
            "dice" -> {   // shaken in a cup, then tumbling
                for (i in 0 until 9) m.noise(t + i * 0.045 + (i * 7 % 5) * 0.004, 0.16, 0.03, Filt.BAND, 1800.0 + (i * 37 % 22) * 100.0, 5.0)
                var at = t + 0.42; var gap = 0.09
                for (i in 0 until 7) { m.tone(Wave.SQUARE, 900.0 + (i * 53 % 9) * 100.0, at, 0.12 * (1 - i * 0.1), 0.001, 0.025, filter = 3500.0); m.noise(at, 0.2 * (1 - i * 0.1), 0.03, Filt.BAND, 2500.0 + (i * 29 % 15) * 100.0, 4.0); at += gap; gap *= 0.8 }
                m.knock(at + 0.02, 170.0, 0.35, 0.1)
            }
            "card" -> m.sweep(t, 700.0, 5200.0, 0.18, 3.0, 2.0)
            "gain" -> { m.sweep(t, 700.0, 5200.0, 0.18, 2.0, 2.0); doubleArrayOf(660.0, 880.0).forEachIndexed { i, f -> m.tone(Wave.SINE, f, t + 0.12 + i * 0.06, 0.16, 0.003, 0.2) } }
            "steal" -> { m.sweep(t, 900.0, 4200.0, 0.16, 0.9, 2.0); m.sweep(t + 0.1, 4200.0, 900.0, 0.16, 0.8, 2.0) }
            "gem" -> { doubleArrayOf(880.0, 1175.0, 1568.0, 2093.0, 2637.0).forEachIndexed { i, f -> m.tone(Wave.SINE, f, t + i * 0.085, 0.2, 0.002, 0.55) }; m.noise(t, 0.1, 0.25, Filt.HIGH, 8000.0, 0.7) }
            "heist" -> {   // sneaking steps, then coins
                doubleArrayOf(392.0, 349.0, 311.0, 262.0).forEachIndexed { i, f -> m.tone(Wave.TRIANGLE, f, t + i * 0.13, 0.3, 0.003, 0.2) }
                m.knock(t + 0.58, 120.0, 0.5, 0.12)
                doubleArrayOf(1568.0, 2093.0, 2637.0).forEachIndexed { i, f -> m.tone(Wave.SINE, f, t + 0.72 + i * 0.07, 0.22, 0.001, 0.42) }
                m.noise(t + 0.7, 0.14, 0.06, Filt.HIGH, 7000.0)
            }
            "fire" -> {   // a whoosh and crackle
                m.sweep(t, 300.0, 2600.0, 0.8, 1.7, 0.8); m.noise(t + 0.05, 0.45, 1.1, Filt.HIGH, 1800.0, 0.7)
                doubleArrayOf(0.0, 0.12, 0.26, 0.41, 0.6, 0.8).forEachIndexed { i, d -> m.noise(t + d, 0.5, 0.05, Filt.BAND, 2400.0 + i * 500.0, 4.0) }
                m.tone(Wave.SAW, 82.0, t, 0.25, 0.05, 0.9, to = 55.0, filter = 300.0)
            }
            "devbuy" -> { m.noise(t, 0.7, 0.05, Filt.BAND, 3500.0, 1.0); m.noise(t + 0.07, 0.55, 0.05, Filt.BAND, 2500.0, 1.0); m.tone(Wave.SINE, 500.0, t + 0.1, 0.12, 0.01, 0.16, to = 900.0) }
            "turn" -> { m.bell(t, 784.0); m.bell(t + 0.17, 1046.5) }   // a soft two-note bell
            "robber" -> { m.tone(Wave.SINE, 90.0, t, 1.0, 0.005, 0.35, to = 45.0); m.tone(Wave.SAW, 70.0, t + 0.12, 0.2, 0.02, 0.5, to = 50.0, filter = 300.0); m.noise(t, 0.2, 0.12, Filt.LOW, 400.0) }
            "seven" -> { m.tone(Wave.SAW, 110.0, t, 0.3, 0.02, 0.55, to = 82.0, filter = 500.0); m.tone(Wave.SAW, 116.5, t, 0.24, 0.02, 0.55, to = 87.0, filter = 500.0); m.knock(t, 70.0, 0.9, 0.3) }
            "discard" -> { m.sweep(t, 6000.0, 400.0, 0.4, 0.9, 0.9, Filt.LOW); doubleArrayOf(0.0, 0.07, 0.14).forEach { d -> m.tone(Wave.SINE, 520.0, t + d, 0.14, 0.002, 0.1, to = 200.0) } }
            "offer" -> { m.tone(Wave.SINE, 988.0, t, 0.3, 0.003, 0.22); m.tone(Wave.SINE, 1319.0, t + 0.1, 0.3, 0.003, 0.32) }
            "coin" -> { doubleArrayOf(2093.0, 2637.0, 3136.0).forEachIndexed { i, f -> m.tone(Wave.SINE, f, t + i * 0.055, 0.25, 0.001, 0.36) }; m.noise(t, 0.12, 0.05, Filt.HIGH, 7000.0) }
            "award" -> { doubleArrayOf(392.0, 523.0, 659.0, 784.0).forEachIndexed { i, f -> m.tone(Wave.SAW, f, t + i * 0.1, 0.1, 0.01, 0.38, filter = 2200.0) }; m.tone(Wave.TRIANGLE, 1046.5, t + 0.42, 0.2, 0.01, 0.8); m.bell(t + 0.42, 1568.0, 0.1) }
            "error" -> { m.tone(Wave.SQUARE, 150.0, t, 0.3, 0.004, 0.09, filter = 900.0); m.tone(Wave.SQUARE, 120.0, t + 0.11, 0.3, 0.004, 0.12, filter = 900.0) }
            "tick" -> m.tone(Wave.SQUARE, 1500.0, t, 0.4, 0.002, 0.03, filter = 3000.0)
            else -> return ShortArray(0)
        }
        return m.toPcm(0.55)
    }
}

/** The two beat themes: a 16-step drum grid per bar plus chords, bass and lead, four bars (about 8 seconds), then a closing hit. "start" sets sail, "finish" is the victory tune. */
object Themes {
    class Theme(
        val bpm: Int, val kick: String, val snare: String, val hat: String, val chords: List<List<Int>>, val bass: List<Pair<Int, Int>>,
        val lead: List<List<Triple<Int, Int, Int>>>, val fill: String, val coda: List<Int>? = null,
    )
    val ALL = mapOf(
        "start" to Theme(116, "1000001010000000", "0000100000001000", "1010101010101011",
            listOf(listOf(50, 57, 62), listOf(46, 53, 58), listOf(48, 55, 60), listOf(50, 57, 62)),   // Dm, Bb, C, Dm: setting sail
            listOf(0 to 50, 6 to 50, 10 to 57, 12 to 50),
            listOf(
                listOf(Triple(0, 74, 2), Triple(3, 77, 1), Triple(4, 79, 3), Triple(8, 81, 2), Triple(12, 79, 4)),
                listOf(Triple(0, 77, 2), Triple(4, 74, 2), Triple(8, 72, 4), Triple(12, 74, 4)),
                listOf(Triple(0, 76, 2), Triple(3, 79, 1), Triple(4, 81, 3), Triple(8, 84, 2), Triple(12, 81, 4)),
                listOf(Triple(0, 86, 6), Triple(8, 81, 2), Triple(12, 74, 4)),
            ), "1010101011111111"),
        "finish" to Theme(124, "1000100010001010", "0000100000001001", "1111111111111111",
            listOf(listOf(53, 57, 60), listOf(48, 55, 60), listOf(46, 53, 58), listOf(48, 52, 55)),   // F, C, Bb, C: victory
            listOf(0 to 41, 4 to 41, 8 to 48, 10 to 41, 12 to 41, 14 to 48),
            listOf(
                listOf(Triple(0, 72, 2), Triple(2, 77, 2), Triple(4, 81, 4), Triple(8, 79, 2), Triple(10, 77, 2), Triple(12, 79, 4)),
                listOf(Triple(0, 76, 4), Triple(4, 79, 4), Triple(8, 84, 8)),
                listOf(Triple(0, 82, 2), Triple(2, 81, 2), Triple(4, 77, 4), Triple(8, 74, 2), Triple(10, 77, 2), Triple(12, 82, 4)),
                listOf(Triple(0, 84, 3), Triple(3, 84, 1), Triple(4, 84, 4), Triple(8, 88, 8)),
            ), "1011101111111111", coda = listOf(53, 60, 65, 69, 72, 77)),
    )

    /** Renders a theme to 16-bit samples (mono). */
    fun render(name: String, rate: Int = 32000): ShortArray {
        val th = ALL[name] ?: return ShortArray(0)
        val s16 = 60.0 / th.bpm / 4; val t0 = 0.08
        val m = Mix(rate, t0 + 64 * s16 + 4.0)
        for (bar in 0 until 4) {
            val tb = t0 + bar * 16 * s16; val last = bar == 3
            for (i in 0 until 16) {
                val t = tb + i * s16
                if (th.kick[i] == '1') m.tone(Wave.SINE, 140.0, t, 0.9, 0.002, 0.22, to = 42.0)
                val sn = if (last) th.fill else th.snare
                if (sn[i] == '1') { m.noise(t, if (last && th.snare[i] != '1') 0.18 else 0.38, 0.12, Filt.BAND, 1900.0, 0.8); m.tone(Wave.TRIANGLE, 190.0, t, 0.18, 0.002, 0.07) }
                if (th.hat[i] == '1') m.noise(t, if (i % 4 == 0) 0.09 else 0.05, if (i == 15) 0.14 else 0.035, Filt.HIGH, 7500.0, 1.0)
            }
            th.chords[bar].forEach { n -> m.tone(Wave.TRIANGLE, note(n + 12), tb, 0.06, 0.04, 16 * s16 * 0.95, filter = 1800.0) }
            th.bass.forEach { (st, n) -> m.tone(Wave.SAW, note(n - 12 + (th.chords[bar][0] - th.chords[0][0])), tb + st * s16, 0.22, 0.005, s16 * 1.8, filter = 420.0) }
            th.lead[bar].forEach { (st, n, len) -> m.tone(Wave.SQUARE, note(n), tb + st * s16, 0.08, 0.008, len * s16 * 0.95, filter = 2600.0) }
        }
        val end = t0 + 64 * s16   // the closing hit: kick, crash and the tonic chord
        m.tone(Wave.SINE, 140.0, end, 0.9, 0.002, 0.4, to = 40.0)
        m.noise(end, 0.25, 1.4, Filt.HIGH, 5000.0, 0.7)
        (th.coda ?: th.chords[0].map { it + 12 }).forEach { n -> m.tone(Wave.TRIANGLE, note(n + (if (th.coda != null) 0 else 12)), end, 0.07, 0.01, 1.8, filter = 2400.0) }
        return m.toPcm(0.42, tailSeconds = 0.2)
    }
}
