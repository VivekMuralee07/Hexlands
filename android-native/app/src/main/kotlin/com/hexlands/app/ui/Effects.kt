package com.hexlands.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

private val PIPS = listOf(
    emptyList(), listOf(4), listOf(0, 8), listOf(0, 4, 8), listOf(0, 2, 6, 8), listOf(0, 2, 4, 6, 8), listOf(0, 2, 3, 5, 6, 8),
)

/** One die face. */
@Composable
private fun Die(value: Int, size: Dp, spin: Float) {
    Canvas(Modifier.size(size)) {
        rotate(spin) {
            drawRoundRect(Color(0xFF8A7A5A), Offset(2f, 5f), this.size, CornerRadius(this.size.width * 0.2f))
            drawRoundRect(Color(0xFFFFF8E6), Offset.Zero, Size(this.size.width - 2f, this.size.height - 2f), CornerRadius(this.size.width * 0.2f))
            val cell = this.size.width / 3.4f
            val red = value == 1
            for (p in PIPS[value.coerceIn(1, 6)]) {
                val cx = this.size.width * (0.2f + 0.3f * (p % 3)); val cy = this.size.height * (0.2f + 0.3f * (p / 3))
                drawCircle(if (red) Color(0xFFD32F2F) else Color(0xFF222222), cell * 0.28f, Offset(cx, cy))
            }
        }
    }
}

/** The two dice. When [roll] changes they tumble for a moment (faces flicker, they spin and drop), then show the real numbers. */
@Composable
fun DiceView(dice: List<Int>, roll: Any, modifier: Modifier = Modifier) {
    val animate = LocalAnimate.current
    val t = remember(roll) { Animatable(if (animate) 0f else 1f) }
    var tick by remember(roll) { androidx.compose.runtime.mutableIntStateOf(0) }
    LaunchedEffect(roll) {
        if (!animate) return@LaunchedEffect
        val job = launch { while (true) { delay(70); tick++ } }
        t.animateTo(1f, tween(750))
        job.cancel()
    }
    val rolling = t.value < 1f
    val rnd = Random(tick)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        dice.take(2).forEachIndexed { i, d ->
            val face = if (rolling) rnd.nextInt(1, 7) else d
            val spin = (1f - t.value) * (if (i == 0) 540f else -420f)
            Die(face, 40.dp, spin)
        }
    }
}

/** Paper falling over the whole screen, for the winner. */
@Composable
fun Confetti(modifier: Modifier = Modifier) {
    val t by rememberClock()
    val bits = remember { List(70) { Random(it * 31 + 7).let { r -> floatArrayOf(r.nextFloat(), r.nextFloat(), 0.5f + r.nextFloat(), r.nextFloat() * 6.28f, r.nextInt(5).toFloat()) } } }
    val colors = listOf(Color(0xFFFFD23F), Color(0xFFFF6B6B), Color(0xFF4CC9F0), Color(0xFF4CD964), Color(0xFFFFFFFF))
    Canvas(modifier.fillMaxSize()) {
        for (b in bits) {
            val fall = ((t * 0.25f * b[2] + b[1]) % 1f)
            val x = size.width * b[0] + sin(t * 2f * b[2] + b[3]) * 24f
            val y = size.height * fall * 1.1f - 20f
            rotate((t * 180f * b[2] + b[3] * 57f), Offset(x, y)) {
                drawRect(colors[b[4].toInt()], Offset(x - 6f, y - 3f), Size(12f, 7f))
            }
        }
    }
}
