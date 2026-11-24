package com.hexlands.app

import com.hexlands.app.audio.Effects
import com.hexlands.app.audio.Sound
import com.hexlands.app.audio.Themes
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** The sounds are made from maths, so they can be checked without a speaker: every effect is there, audible, not clipped and not endless. */
class SynthTest {
    private fun peak(p: ShortArray) = (p.maxOfOrNull { abs(it.toInt()) } ?: 0) / 32768.0

    @Test fun everyEffectIsAudibleAndNotEndless() {
        for (name in Effects.NAMES) {
            val pcm = Effects.render(name, if (name == "res" || name == "note") "wood" else null)
            assertTrue("$name makes sound", pcm.isNotEmpty())
            assertTrue("$name is loud enough (peak ${peak(pcm)})", peak(pcm) > 0.05)
            assertTrue("$name does not clip hard (peak ${peak(pcm)})", peak(pcm) <= 0.96)
            assertTrue("$name is under 2.6 s (${pcm.size / 44100.0} s)", pcm.size < 44100 * 2.6)
        }
    }

    @Test fun eachResourceHasItsOwnNote() {
        val wood = Effects.render("note", "wood"); val ore = Effects.render("note", "ore")
        assertFalse("wood and ore do not sound the same", wood.contentEquals(ore))
    }

    @Test fun theSoundsAreTheSameEveryTime() {
        assertArrayEquals(Effects.render("dice"), Effects.render("dice"))
    }

    @Test fun anUnknownEffectIsSilentNotAnError() { assertTrue(Effects.render("nothing").isEmpty()) }

    @Test fun theTwoThemesAreAboutEightSecondsAndAudible() {
        for (name in listOf("start", "finish")) {
            val pcm = Themes.render(name, 16000)
            assertTrue("$name lasts 8 to 14 s (${pcm.size / 16000.0} s)", pcm.size in 16000 * 8..16000 * 14)
            assertTrue("$name is audible and not clipped (peak ${peak(pcm)})", peak(pcm) in 0.1..0.96)
        }
    }

    @Test fun playingBeforeTheAppHasStartedTheSoundDoesNothing() {
        Sound.play("click"); Sound.theme("start"); Sound.stopTheme()   // not initialized: silent, no error (this is how the screen tests run)
    }
}
