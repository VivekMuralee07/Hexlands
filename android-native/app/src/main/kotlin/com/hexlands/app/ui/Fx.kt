package com.hexlands.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.GameState
import com.hexlands.app.net.parseColor
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// ---- drawing helpers used inside the board canvas ----

/** Dust when a piece lands: a ring that grows and fades, and a few specks thrown outwards. [p] runs 0..1 over the puff. */
internal fun DrawScope.landingPuff(c: Offset, r: Float, p: Float) {
    if (p <= 0f || p >= 1f) return
    val a = (1f - p)
    drawCircle(Color.White.copy(alpha = 0.55f * a), r * (0.6f + 1.3f * p), c, style = Stroke(r * 0.12f * a + 1f))
    for (i in 0 until 6) {
        val ang = i * (PI.toFloat() / 3f) + 0.4f
        val d = r * (0.5f + 1.1f * p)
        drawCircle(Color(0xFFF3E7C8).copy(alpha = 0.7f * a), r * 0.13f * a + 0.8f, Offset(c.x + cos(ang) * d, c.y + sin(ang) * d * 0.7f))
    }
}

/** The thud of the robber landing: two rings spreading over the hex. */
internal fun DrawScope.robberRipple(c: Offset, k: Float, p: Float) {
    if (p <= 0f || p >= 1f) return
    for (i in 0 until 2) {
        val q = (p - i * 0.18f).coerceIn(0f, 1f)
        if (q <= 0f) continue
        drawCircle(Color(0xFFFF6B57).copy(alpha = 0.7f * (1f - q)), k * (0.2f + 0.7f * q), c, style = Stroke(k * 0.05f * (1f - q) + 1.5f))
    }
}

/** After a roll the hexes that paid out pulse with a golden ring so you can see where the cards come from. */
internal fun DrawScope.paidPulse(c: Offset, k: Float, p: Float) {
    if (p <= 0f || p >= 1f) return
    val fade = if (p < 0.15f) p / 0.15f else if (p > 0.7f) (1f - p) / 0.3f else 1f
    val beat = 0.5f + 0.5f * sin(p * 14f)
    drawCircle(Color(0xFFFFD23F).copy(alpha = (0.22f + 0.2f * beat) * fade), k * 0.78f, c)
    drawCircle(Color(0xFFFFE27A).copy(alpha = 0.9f * fade), k * 0.78f, c, style = Stroke(k * 0.06f))
}

/** A little life on the land, different for each terrain: drifting leaf motes over forests, a light ripple over fields, heat shimmer over the desert. */
internal fun DrawScope.terrainLife(terrain: String, id: Int, c: Offset, k: Float, t: Float) {
    when (terrain) {
        "forest" -> for (i in 0 until 2) {
            val ph = t * 0.6f + id * 1.7f + i * 3.1f
            drawCircle(Color(0xFFD7F7A0).copy(alpha = 0.55f * (0.5f + 0.5f * sin(ph * 1.3f))), k * 0.035f, Offset(c.x + cos(ph) * k * 0.42f, c.y - k * 0.25f + sin(ph * 0.8f) * k * 0.18f + ((ph * 7f) % 6f) * k * 0.02f))
        }
        "fields" -> {
            val x = ((t * 0.5f + id * 0.37f) % 1.6f - 0.3f) * k * 1.1f - k * 0.5f
            drawLine(Color(0xFFFFF1A6).copy(alpha = 0.22f), Offset(c.x + x, c.y - k * 0.5f), Offset(c.x + x - k * 0.25f, c.y + k * 0.5f), k * 0.12f)
        }
        "desert" -> for (i in 0 until 2) {
            val y = c.y + k * (0.18f + 0.22f * i)
            val p = Path()
            var x = -0.5f
            while (x <= 0.5f) { val px = c.x + x * k; val py = y + sin(x * 14f + t * 2f + i) * k * 0.025f; if (x == -0.5f) p.moveTo(px, py) else p.lineTo(px, py); x += 0.1f }
            drawPath(p, Color.White.copy(alpha = 0.14f), style = Stroke(k * 0.025f))
        }
        "mountains" -> drawCircle(Color.White.copy(alpha = 0.18f * (0.5f + 0.5f * sin(t * 1.5f + id))), k * 0.03f, Offset(c.x + k * 0.2f, c.y - k * 0.3f))
    }
}

/** The light of the hour: over a few minutes the whole board warms to dusk, cools to night and comes back to day. Always subtle, never hiding anything. */
internal fun DrawScope.dayNightTint(t: Float) {
    val phase = (t / 240f) % 1f   // one day = 4 minutes
    val dusk = (sin(phase * 2f * PI.toFloat()) * 0.5f + 0.5f)
    val night = (sin(phase * 2f * PI.toFloat() - PI.toFloat() / 2f) * 0.5f + 0.5f)
    drawRect(Color(0xFFFF8A3D).copy(alpha = 0.06f * dusk * dusk))
    drawRect(Color(0xFF0B1B50).copy(alpha = 0.14f * night * night))
}

/** The winner's pieces glow gold just before the results come up. */
internal fun DrawScope.winnerHalo(c: Offset, k: Float, t: Float) {
    val pulse = 0.6f + 0.4f * sin(t * 5f)
    drawCircle(Brush.radialGradient(listOf(Color(0xFFFFE27A).copy(alpha = 0.75f * pulse), Color.Transparent), c, k * 0.55f), k * 0.55f, c)
}

// ---- sea life, drawn by the sea background ----

internal fun DrawScope.seaLife(t: Float) {
    val w = size.width; val h = size.height
    // gulls crossing in a V that flaps
    for (i in 0 until 3) {
        val x = ((t * 0.018f + i * 0.31f) % 1.3f - 0.15f) * w
        val y = h * (0.12f + 0.06f * i) + sin(t * 0.4f + i) * 6f
        val flap = sin(t * 5f + i) * 5f
        val p = Path().apply { moveTo(x - 12f, y + flap); quadraticTo(x - 5f, y - 6f, x, y); quadraticTo(x + 5f, y - 6f, x + 12f, y + flap) }
        drawPath(p, Color.White.copy(alpha = 0.55f), style = Stroke(2.2f, cap = androidx.compose.ui.graphics.StrokeCap.Round))
    }
    // two small boats rocking on the waves
    for (i in 0 until 2) {
        val x = ((t * 0.012f * (if (i == 0) 1f else -1f) + 0.3f + i * 0.4f) % 1.2f + 1.2f) % 1.2f * w - 0.1f * w
        val y = h * (0.9f - 0.12f * i)
        val rock = sin(t * 1.4f + i * 2f) * 4f
        withTransform({ translate(x, y); rotate(rock, Offset.Zero) }) {
            drawPath(Path().apply { moveTo(-14f, 0f); lineTo(14f, 0f); lineTo(9f, 7f); lineTo(-9f, 7f); close() }, Color(0xFF7A4A1E).copy(alpha = 0.8f))
            drawLine(Color(0xFF3B2410).copy(alpha = 0.8f), Offset(0f, 0f), Offset(0f, -16f), 1.6f)
            drawPath(Path().apply { moveTo(1f, -15f); lineTo(12f, -4f); lineTo(1f, -4f); close() }, Color.White.copy(alpha = 0.85f))
        }
    }
    // glints
    for (i in 0 until 9) {
        val gx = w * ((i * 0.137f + 0.07f) % 1f); val gy = h * ((i * 0.291f + 0.11f) % 1f)
        val a = (sin(t * 1.6f + i * 2.3f) * 0.5f + 0.5f)
        drawCircle(Color.White.copy(alpha = 0.5f * a * a), 2.2f, Offset(gx, gy))
    }
}

/** Soft clouds drifting at three depths; the near ones are bigger, faster and lighter (a parallax). */
@Composable
fun CloudLayer(modifier: Modifier = Modifier) {
    val t by rememberClock()
    Canvas(modifier.fillMaxSize()) {
        for (layer in 0 until 3) {
            val speed = 0.006f * (layer + 1); val sc = 0.6f + 0.35f * layer; val alpha = 0.035f + 0.025f * layer
            for (i in 0 until 3) {
                val x = (((t * speed + i * 0.37f + layer * 0.17f) % 1.4f) - 0.2f) * size.width
                val y = size.height * (0.06f + 0.13f * layer + 0.21f * i) + sin(t * 0.2f + i) * 4f * (layer + 1)
                val r = size.width * 0.09f * sc
                for ((dx, dy, rr) in listOf(Triple(-1.1f, 0.2f, 0.7f), Triple(0f, 0f, 1f), Triple(1.2f, 0.15f, 0.8f), Triple(0.3f, -0.45f, 0.7f))) {
                    val cc = Offset(x + dx * r, y + dy * r)
                    drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = alpha), Color.Transparent), cc, r * rr * 1.5f), r * rr * 1.5f, cc)
                }
            }
        }
    }
}

// ---- messages and moments, drawn over the game ----

/** Coins hop from the top (the table) down to your hand when a trade goes through. */
@Composable
fun TradeCoins(trigger: Any?, modifier: Modifier = Modifier) {
    val animate = LocalAnimate.current
    if (trigger == null || !animate) return
    Box(modifier.fillMaxSize()) {
        for (i in 0 until 5) {
            val prog = remember(trigger) { Animatable(0f) }
            LaunchedEffect(trigger) { delay(i * 90L); prog.animateTo(1f, tween(900, easing = FastOutSlowInEasing)) }
            if (prog.value in 0.001f..0.999f) Text(
                "🪙", fontSize = 22.sp,
                modifier = Modifier.align(Alignment.TopCenter).graphicsLayer {
                    translationX = ((i - 2) * 36.dp.toPx()) * (1f - prog.value * 0.4f)
                    translationY = (120.dp.toPx() + prog.value * (size.height.coerceAtLeast(1f) + 520.dp.toPx())) - 60.dp.toPx() * sin(prog.value * PI.toFloat())
                    alpha = 1f - prog.value * 0.3f; rotationZ = prog.value * 360f
                },
            )
        }
    }
}

/** A development card turning over at the centre of the screen when you buy one (the back first, then the front). */
@Composable
fun DevReveal(tick: Int, title: String, modifier: Modifier = Modifier) {
    val flip = remember { Animatable(0f) }
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(tick) {
        if (tick > 0) { show = true; flip.snapTo(0f); flip.animateTo(1f, tween(800, easing = FastOutSlowInEasing)); delay(900); show = false }
    }
    if (!show) return
    val front = flip.value > 0.5f
    val ry = if (front) (flip.value - 1f) * 180f else flip.value * 180f
    Box(
        modifier.size(width = 120.dp, height = 168.dp).graphicsLayer { rotationY = ry; cameraDistance = 14f * density; val s = 1f + 0.12f * sin(flip.value * PI.toFloat()); scaleX = s; scaleY = s }
            .clip(RoundedCornerShape(14.dp)).background(Brush.verticalGradient(if (front) listOf(Color(0xFFFFE887), Color(0xFFE79A0B)) else listOf(Color(0xFF3F52A8), Color(0xFF222F6B))))
            .border(3.dp, Color.White, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (front) Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🃏", fontSize = 44.sp); Text(title, fontWeight = FontWeight.ExtraBold, color = Color(0xFF3A2A00), fontSize = 14.sp)
        } else Text("★", fontSize = 56.sp, color = Gold)
    }
}

/** A short flourish when a development card is played: the sword swings across for a knight, the card pops otherwise. */
@Composable
fun PlayedFlourish(emoji: String?, label: String, tick: Int, modifier: Modifier = Modifier) {
    if (emoji == null) return
    val p = remember(tick) { Animatable(0f) }
    LaunchedEffect(tick) { p.animateTo(1f, tween(1100)) }
    if (p.value >= 1f) return
    Column(modifier.graphicsLayer { alpha = if (p.value > 0.75f) (1f - p.value) * 4f else 1f }, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(emoji, fontSize = 72.sp, modifier = Modifier.graphicsLayer { rotationZ = -70f + 140f * FastOutSlowInEasing.transform((p.value * 1.6f).coerceAtMost(1f)); val s = 0.6f + 0.6f * sin(p.value * PI.toFloat()); scaleX = s; scaleY = s })
        Text(label, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Gold)
    }
}

/** "+2 Kira" floating up from where the score is, in the player's colour. */
@Composable
fun PointsFloat(who: String?, points: Int, color: Color, tick: Int, modifier: Modifier = Modifier) {
    if (who == null) return
    val p = remember(tick) { Animatable(0f) }
    LaunchedEffect(tick) { p.animateTo(1f, tween(1500)) }
    if (p.value >= 1f) return
    Text(
        "+$points  $who", modifier.graphicsLayer { translationY = -p.value * 90.dp.toPx(); alpha = if (p.value > 0.6f) (1f - p.value) / 0.4f else 1f; val s = 0.8f + 0.4f * FastOutSlowInEasing.transform((p.value * 4f).coerceAtMost(1f)); scaleX = s; scaleY = s }
            .clip(RoundedCornerShape(50)).background(color).border(2.dp, Color.White, RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 5.dp),
        fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Color.White,
    )
}

/** A light sweep across the players' strip when the turn changes hands, and a banner that names whose move it is. */
@Composable
fun TurnSweep(turn: Int, modifier: Modifier = Modifier) {
    val animate = LocalAnimate.current
    val p = remember { Animatable(1f) }
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(turn) { if (first) { first = false; return@LaunchedEffect }; if (animate) { p.snapTo(0f); p.animateTo(1f, tween(800, easing = FastOutSlowInEasing)) } }
    if (p.value >= 1f) return
    Canvas(modifier) {
        val x = -size.width * 0.3f + p.value * size.width * 1.6f
        drawRect(Brush.horizontalGradient(listOf(Color.Transparent, Color.White.copy(alpha = 0.32f), Color.Transparent), startX = x - size.width * 0.18f, endX = x + size.width * 0.18f))
    }
}

@Composable
fun TurnBanner(name: String?, mine: Boolean, color: Color, tick: Int, modifier: Modifier = Modifier) {
    if (name == null) return
    val p = remember(tick) { Animatable(0f) }
    LaunchedEffect(tick) { p.animateTo(1f, tween(1300)) }
    if (p.value >= 1f) return
    val inP = FastOutSlowInEasing.transform((p.value * 4f).coerceAtMost(1f)); val outP = if (p.value > 0.75f) (p.value - 0.75f) * 4f else 0f
    Text(
        if (mine) "Your turn!" else "$name's turn",
        modifier.graphicsLayer { translationX = (-1f + inP) * 220.dp.toPx() + outP * 220.dp.toPx(); alpha = 1f - outP }
            .clip(RoundedCornerShape(50)).background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.95f), color.copy(alpha = 0.6f)))).border(2.dp, Color.White.copy(alpha = 0.9f), RoundedCornerShape(50))
            .padding(horizontal = 22.dp, vertical = 8.dp),
        fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Color.White,
    )
}

/** Dims the board and rings the winner while the game ends, before the results come up. */
@Composable
fun EndDim(active: Boolean, modifier: Modifier = Modifier) {
    val a by androidx.compose.animation.core.animateFloatAsState(if (active) 0.5f else 0f, tween(900), label = "dim")
    if (a > 0f) Box(modifier.fillMaxSize().background(Color(0xFF050C22).copy(alpha = a)))
}

fun GameState.colorOf(seat: Int): Color = players.getOrNull(seat)?.color?.let { Color(parseColor(it)) } ?: Gold
