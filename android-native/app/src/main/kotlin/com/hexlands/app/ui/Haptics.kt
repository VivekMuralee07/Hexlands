package com.hexlands.app.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

/** The feel of the key moments of a game: a light tick for a piece, a firmer knock for a city, a heavy thud for the robber, a rising run for an award, a long swell for the win. */
object Haptics {
    private val PATTERNS: Map<String, LongArray> = mapOf(
        "place" to longArrayOf(0, 22),
        "city" to longArrayOf(0, 30, 50, 45),
        "gain" to longArrayOf(0, 14),
        "offer" to longArrayOf(0, 25, 70, 25),
        "turn" to longArrayOf(0, 40, 70, 40),
        "robber" to longArrayOf(0, 120, 60, 200),
        "seven" to longArrayOf(0, 70, 40, 70, 40, 160),
        "award" to longArrayOf(0, 25, 45, 35, 45, 50, 45, 90),
        "win" to longArrayOf(0, 40, 60, 40, 60, 40, 60, 220, 80, 320),
        "end" to longArrayOf(0, 90, 80, 150),
    )

    fun play(context: Context, kind: String) {
        val pattern = PATTERNS[kind] ?: return
        val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1))
        else @Suppress("DEPRECATION") v.vibrate(pattern, -1)
    }
}
