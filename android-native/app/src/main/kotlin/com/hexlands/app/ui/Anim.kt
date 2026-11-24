package com.hexlands.app.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.sin

/** Animations on or off. The screenshot tests switch them off, because a screen that moves forever never goes idle. */
val LocalAnimate = compositionLocalOf { true }

/** Seconds since the screen appeared, counting up smoothly (it stays at 0 when animations are off). */
@Composable
fun rememberClock(): State<Float> {
    if (!LocalAnimate.current) return remember { mutableFloatStateOf(0f) }
    return rememberInfiniteTransition(label = "clock").animateFloat(0f, 1000f, infiniteRepeatable(tween(1_000_000, easing = LinearEasing)), label = "t")
}

/** A block that fades and slides up into place, [index] x 80 ms after the screen opens (so a column of them arrives one after another). */
@Composable
fun Appear(index: Int, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val animate = LocalAnimate.current
    var shown by remember { mutableStateOf(!animate) }
    LaunchedEffect(Unit) { if (animate) { delay(80L * index); shown = true } }
    val p by animateFloatAsState(if (shown) 1f else 0f, tween(450, easing = FastOutSlowInEasing), label = "appear")
    Box(modifier.graphicsLayer { alpha = p; translationY = (1f - p) * 36.dp.toPx() }) { content() }
}

private val PillShape = RoundedCornerShape(50)

/** The main button: glossy gold, a little shadow, and a springy squeeze when pressed. */
@Composable
fun GoldButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    padding: PaddingValues = PaddingValues(horizontal = 22.dp, vertical = 12.dp),
    content: @Composable RowScope.() -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.95f else 1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMedium), label = "press")
    val face = if (enabled) Brush.verticalGradient(listOf(Color(0xFFFFE887), Color(0xFFFFC72E), Color(0xFFE79A0B))) else SolidColor(Color(0xFF3B4B6B))
    Box(
        modifier.graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(if (enabled) 8.dp else 0.dp, PillShape, ambientColor = Color(0xFF7A4B00), spotColor = Color(0xFF7A4B00))
            .clip(PillShape).background(face)
            // the gloss on the top half is painted, not a child: a child that fills half the height would make a button without a set height fill the screen
            .drawBehind { if (enabled) drawRect(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.5f), Color.Transparent), endY = size.height * 0.5f), size = androidx.compose.ui.geometry.Size(size.width, size.height * 0.5f)) }
            .border(1.5.dp, if (enabled) Color(0xFF8A5A00).copy(alpha = 0.55f) else Color.Transparent, PillShape)
            .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides if (enabled) Color(0xFF3A2A00) else Color(0xFF8FA0C0)) {
            Row(Modifier.padding(padding), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center, content = content)
        }
    }
}

/** The second kind of button: frosted glass with a light edge. */
@Composable
fun GlassButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.95f else 1f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMedium), label = "press")
    Box(
        modifier.graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(PillShape).background(Color.White.copy(alpha = if (pressed) 0.24f else 0.14f))
            .border(1.2.dp, Color.White.copy(alpha = 0.45f), PillShape)
            .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides if (enabled) Foam else FoamDim.copy(alpha = 0.5f)) {
            Row(Modifier.padding(horizontal = 18.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center, content = content)
        }
    }
}

/** The sea: a deep blue gradient with a few lines of waves drifting across it, and slow patches of light. */
@Composable
fun SeaBackground(modifier: Modifier = Modifier) {
    val t by rememberClock()
    Canvas(modifier.fillMaxSize()) {
        drawRect(Brush.verticalGradient(listOf(Color(0xFF0F82CC), Color(0xFF0A62A4), Color(0xFF07407D), Color(0xFF052B5A))))
        val w = size.width; val h = size.height
        for (i in 0 until 6) {
            val y0 = h * (0.08f + i * 0.17f)
            val amp = 7.dp.toPx() * (1f + 0.25f * (i % 3)); val speed = (0.35f + 0.12f * i) * (if (i % 2 == 0) 1f else -1f)
            val path = Path()
            var x = -12f
            while (x <= w + 12f) {
                val y = y0 + sin((x / w * 2f * PI.toFloat() * (1.6f + 0.3f * i)) + t * speed) * amp
                if (x < 0f) path.moveTo(x, y) else path.lineTo(x, y)
                x += 14f
            }
            drawPath(path, Color.White.copy(alpha = 0.07f + 0.012f * i), style = Stroke(width = 2.4.dp.toPx(), cap = StrokeCap.Round))
        }
        for (i in 0 until 5) {
            val cx = w * (0.15f + 0.2f * i) + sin(t * 0.18f + i * 1.7f) * w * 0.06f
            val cy = h * (0.2f + 0.15f * ((i * 3) % 5)) + sin(t * 0.14f + i) * h * 0.03f
            drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.07f), Color.Transparent), Offset(cx, cy), w * 0.35f), w * 0.35f, Offset(cx, cy))
        }
        seaLife(t)
    }
}
