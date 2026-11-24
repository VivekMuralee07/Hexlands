package com.hexlands.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Alignment
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.parseColor
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Lets the game screen ask where a board point is on the screen now (the board zooms and moves). */
class BoardView { var toScreen: (Double, Double) -> Offset = { _, _ -> Offset.Zero } }

/** What a tap on the board hit: a corner, a road spot, or a hex. Only spots the server says are legal can be hit. */
sealed interface Tap {
    data class Corner(val id: Int) : Tap
    data class Road(val id: Int) : Tap
    data class Hex(val id: Int) : Tap
}

/** The spot the player has picked and not yet confirmed. */
data class Picked(val tap: Tap)

private val GOLD = Color(0xFFFFD23F)

private class Bounds(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double) {
    val w get() = maxX - minX
    val h get() = maxY - minY
    val cx get() = (minX + maxX) / 2
    val cy get() = (minY + maxY) / 2
}

private fun boundsOf(board: Board): Bounds {
    val xs = board.vertices.map { it.x } + board.ports.map { it.x }
    val ys = board.vertices.map { it.y } + board.ports.map { it.y }
    if (xs.isEmpty()) return Bounds(-1.0, -1.0, 1.0, 1.0)
    return Bounds(xs.min() - 0.9, ys.min() - 0.9, xs.max() + 0.9, ys.max() + 0.9)
}

private fun distToSegment(p: Offset, a: Offset, b: Offset): Float {
    val ab = b - a
    val len2 = ab.x * ab.x + ab.y * ab.y
    if (len2 == 0f) return (p - a).getDistance()
    val t = (((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2).coerceIn(0f, 1f)
    return (p - (a + ab * t)).getDistance()
}

/**
 * The board: hexes, number tokens, harbours, roads, settlements and cities, the robber, and the glowing spots the player may tap.
 * Pinch to zoom and drag to move; a Fit button appears to bring the whole board back. [cornerSpots], [roadSpots] and [hexSpots] come from the server.
 */
@Composable
fun BoardCanvas(
    board: Board,
    game: GameState,
    cornerSpots: Set<Int>,
    roadSpots: Set<Int>,
    hexSpots: Set<Int>,
    picked: Tap?,
    onTap: (Tap) -> Unit,
    modifier: Modifier = Modifier,
    animate: Boolean = true,
    previewKind: String? = null,
    view: BoardView? = null,
) {
    val measurer = rememberTextMeasurer()
    var zoom by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    val bounds = remember(board) { boundsOf(board) }
    // The glow on the spots you may tap pulses. [animate] = false holds it steady (the screenshot tests need a screen that is ever idle).
    val pulse = if (animate) rememberInfiniteTransition(label = "pulse").animateFloat(0.35f, 0.95f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "pulse").value else 0.8f
    val anim = animate && LocalAnimate.current
    val cutRoads = remember(game.cutRoads) { game.cutRoads.toSet() }
    val clock by rememberClock()
    // Pieces pop in when they appear: the first time a road or building is seen after the board has been shown, its birth time is noted.
    val births = remember { HashMap<String, Float>() }
    var shown by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(Unit) { shown = true }
    fun pop(key: String): Float {
        if (!anim) return 1f
        val born = births.getOrPut(key) { if (shown) clock else -10f }
        val p = ((clock - born) / 0.45f).coerceIn(0f, 1f)
        val q = p - 1f
        return if (p >= 1f) 1f else (1f + 2.70158f * q * q * q + 1.70158f * q * q).coerceAtLeast(0f)   // ease-out-back: overshoots, then settles
    }
    // The robber hops from tile to tile along an arc.
    var robFrom by remember { mutableStateOf(game.robber) }
    var robTo by remember { mutableStateOf(game.robber) }
    val hop = remember { androidx.compose.animation.core.Animatable(1f) }
    androidx.compose.runtime.LaunchedEffect(game.robber) {
        if (game.robber != robTo) {
            robFrom = robTo; robTo = game.robber
            if (anim) { hop.snapTo(0f); hop.animateTo(1f, tween(550)) } else hop.snapTo(1f)
        }
    }
    val density = LocalDensity.current
    val slop = with(density) { 30.dp.toPx() }

    fun scale(): Float = if (size.width == 0) 1f else min(size.width / bounds.w.toFloat(), size.height / bounds.h.toFloat()) * zoom
    fun screen(x: Double, y: Double): Offset {
        val k = scale()
        return Offset(size.width / 2f + pan.x + ((x - bounds.cx) * k).toFloat(), size.height / 2f + pan.y + ((y - bounds.cy) * k).toFloat())
    }

    view?.toScreen = { x, y -> screen(x, y) }   // so the screen can place things (the cards flying from the tiles) on the board

    val tapNow = rememberUpdatedState { at: Offset ->
        var found: Tap? = null
        var best = Float.MAX_VALUE
        for (id in cornerSpots) {
            val v = board.vertices.getOrNull(id) ?: continue
            val d = (screen(v.x, v.y) - at).getDistance()
            if (d < slop && d < best) { best = d; found = Tap.Corner(id) }
        }
        if (found == null) for (id in roadSpots) {
            val e = board.edges.getOrNull(id) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            val d = distToSegment(at, screen(a.x, a.y), screen(b.x, b.y))
            if (d < slop && d < best) { best = d; found = Tap.Road(id) }
        }
        if (found == null) for (id in hexSpots) {
            val t = board.tiles.getOrNull(id) ?: continue
            val d = (screen(t.x, t.y) - at).getDistance()
            if (d < max(scale() * 0.85f, slop) && d < best) { best = d; found = Tap.Hex(id) }
        }
        found?.let(onTap)
    }

    Box(modifier.fillMaxSize().testTag("board")) {
    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                detectTransformGestures { centroid, panChange, zoomChange, _ ->
                    val newZoom = (zoom * zoomChange).coerceIn(0.8f, 4f)
                    val k = newZoom / zoom
                    val c = centroid - Offset(size.width / 2f, size.height / 2f)
                    var p = c * (1 - k) + pan * k + panChange
                    val maxX = size.width * newZoom / 1.5f; val maxY = size.height * newZoom / 1.5f
                    p = Offset(p.x.coerceIn(-maxX, maxX), p.y.coerceIn(-maxY, maxY))
                    zoom = newZoom; pan = p
                }
            }
            .pointerInput(Unit) {
                // Only a plain tap here: a double-tap handler would make every tap wait about 0.3 s to be sure it is not a double-tap.
                detectTapGestures(onTap = { tapNow.value(it) })
            },
    ) {
        if (size.width == 0) return@Canvas
        val k = scale()
        drawBoardArt(board, screen(0.0, 0.0), k, measurer)
        // roads
        for ((eid, seat) in game.roads) {
            val e = board.edges.getOrNull(eid.toIntOrNull() ?: continue) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            val pa = screen(a.x, a.y); val pb = screen(b.x, b.y)
            val g = pop("r$eid")
            val cut = if (eid.toIntOrNull() in cutRoads) 0.5f else 1f   // a road an opposing settlement has cut off is shown faded
            drawLine(Color.Black.copy(alpha = 0.7f * cut), pa, pb, strokeWidth = k * 0.27f * g, cap = StrokeCap.Round)
            drawLine(Color(parseColor(game.players.getOrNull(seat)?.color)).copy(alpha = cut), pa, pb, strokeWidth = k * 0.18f * g, cap = StrokeCap.Round)
        }
        // buildings
        for ((vid, b) in game.buildings) {
            val v = board.vertices.getOrNull(vid.toIntOrNull() ?: continue) ?: continue
            house(screen(v.x, v.y), k * 0.32f * pop("b$vid${b.type}"), Color(parseColor(game.players.getOrNull(b.p)?.color)), b.type == "city")
        }
        // the robber
        board.tiles.getOrNull(robTo)?.let { t ->
            val to = screen(t.x, t.y)
            val from = board.tiles.getOrNull(robFrom)?.let { screen(it.x, it.y) } ?: to
            val h = hop.value
            val c = from + (to - from) * h + Offset(0f, -k * 0.05f - kotlin.math.sin(Math.PI.toFloat() * h) * k * 0.6f)
            drawCircle(Color(0xFF222222), k * 0.16f, c + Offset(0f, k * 0.14f))
            drawCircle(Color(0xFF222222), k * 0.1f, c - Offset(0f, k * 0.08f))
            drawCircle(Color.White.copy(alpha = 0.5f), k * 0.16f, c + Offset(0f, k * 0.14f), style = Stroke(max(1f, k * 0.015f)))
        }
        // the spots the player may tap: glowing circles (on a road, at its middle)
        for (id in roadSpots) {
            if (picked == Tap.Road(id)) continue   // the preview piece is drawn there instead
            val e = board.edges.getOrNull(id) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            glowSpot(screen((a.x + b.x) / 2, (a.y + b.y) / 2), k * 0.36f, pulse)
        }
        for (id in cornerSpots) {
            if (picked == Tap.Corner(id)) continue   // the preview piece is drawn there instead
            val v = board.vertices.getOrNull(id) ?: continue
            glowSpot(screen(v.x, v.y), k * 0.42f, pulse)
        }
        // the piece you would place, shown in your colour while you decide (tap it again to place it)
        val mine = Color(parseColor(game.players.getOrNull(game.you)?.color))
        val bob = if (anim) 1f + 0.08f * kotlin.math.sin(clock * 6f) else 1f
        when (picked) {
            is Tap.Road -> board.edges.getOrNull(picked.id)?.let { e ->
                val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
                drawLine(Color.White, screen(a.x, a.y), screen(b.x, b.y), strokeWidth = k * 0.33f * bob, cap = StrokeCap.Round)
                drawLine(mine, screen(a.x, a.y), screen(b.x, b.y), strokeWidth = k * 0.22f * bob, cap = StrokeCap.Round)
            }
            is Tap.Corner -> board.vertices.getOrNull(picked.id)?.let { v ->
                val c0 = screen(v.x, v.y)
                drawCircle(Color.White.copy(alpha = 0.35f), k * 0.5f * bob, c0)
                house(c0, k * 0.36f * bob, mine, previewKind == "city")
            }
            else -> {}
        }
        // where the robber may go: a glowing, see-through circle inside each of those hexes (the number underneath stays readable)
        val hexGlow = 0.6f + 0.4f * pulse
        for (id in hexSpots) {
            val t = board.tiles.getOrNull(id) ?: continue
            val c = screen(t.x, t.y)
            val r = k * 0.8f   // the hex's inner radius is 0.87
            drawCircle(
                androidx.compose.ui.graphics.Brush.radialGradient(
                    0f to Color.White.copy(alpha = 0.22f * hexGlow), 0.5f to Color(0xFFFFEB99).copy(alpha = 0.42f * hexGlow), 0.9f to Color(0xFFFFD23F).copy(alpha = 0.62f * hexGlow), 1f to Color.Transparent,
                    center = c, radius = r,
                ),
                r, c,
            )
            drawCircle(Color(0xFFFFD23F).copy(alpha = 0.9f * hexGlow), r * 0.9f, c, style = Stroke(max(3f, k * 0.06f)))
            drawCircle(Color.White.copy(alpha = 0.8f * hexGlow), r * 0.9f, c, style = Stroke(max(1.2f, k * 0.02f)))
        }
    }
    if (zoom != 1f || pan != Offset.Zero) {
        TextButton(
            onClick = { zoom = 1f; pan = Offset.Zero },
            modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).background(Color(0xFF071E4C).copy(alpha = 0.85f), RoundedCornerShape(10.dp)),
        ) { Text("Fit") }
    }
    }
}

private fun DrawScope.centeredText(measurer: TextMeasurer, text: String, center: Offset, style: TextStyle) {
    val r = measurer.measure(text, style)
    drawText(r, topLeft = center - Offset(r.size.width / 2f, r.size.height / 2f))
}

/** [c] lightened ([f] > 0) or darkened ([f] < 0). */
private fun tone(c: Color, f: Float): Color =
    if (f < 0) Color(c.red * (1 + f), c.green * (1 + f), c.blue * (1 + f), c.alpha) else Color(c.red + (1 - c.red) * f, c.green + (1 - c.green) * f, c.blue + (1 - c.blue) * f, c.alpha)

/**
 * A settlement (a cottage with a chimney) or a city (a big hall with a tall tower and a flag), in the player's colour: lit on the left and shaded on the right
 * so it reads as solid, with a darker roof, a door, windows and a soft shadow on the ground. [r] is about half the piece's width; (0, 0) is the corner it stands on.
 */
internal fun DrawScope.house(c: Offset, r: Float, color: Color, city: Boolean) {
    fun p(vararg pts: Pair<Float, Float>): Path = Path().apply {
        moveTo(c.x + pts[0].first * r, c.y + pts[0].second * r)
        for (i in 1 until pts.size) lineTo(c.x + pts[i].first * r, c.y + pts[i].second * r)
        close()
    }
    val ink = Color(0xFF14110F).copy(alpha = 0.9f)
    val line = Stroke(max(1.4f, r * 0.09f), join = StrokeJoin.Round)
    val lit = tone(color, 0.14f); val dim = tone(color, -0.16f)
    val roofLit = tone(color, -0.22f); val roofDim = tone(color, -0.42f)
    val glass = Color(0xFFFFF0A8); val door = tone(color, -0.6f)
    // the shadow on the ground
    drawOval(Color.Black.copy(alpha = 0.28f), Offset(c.x - (if (city) 1.45f else 1.05f) * r, c.y + 0.62f * r), androidx.compose.ui.geometry.Size((if (city) 2.9f else 2.1f) * r, 0.5f * r))
    fun win(x: Float, y: Float, w: Float, h: Float) { drawRect(glass, Offset(c.x + x * r, c.y + y * r), androidx.compose.ui.geometry.Size(w * r, h * r)); drawRect(ink, Offset(c.x + x * r, c.y + y * r), androidx.compose.ui.geometry.Size(w * r, h * r), style = Stroke(max(1f, r * 0.05f))) }
    if (!city) {
        // walls: the left half lit, the right half in shade
        drawPath(p(-0.8f to -0.05f, 0f to -0.05f, 0f to 0.8f, -0.8f to 0.8f), lit)
        drawPath(p(0f to -0.05f, 0.8f to -0.05f, 0.8f to 0.8f, 0f to 0.8f), dim)
        // chimney, then the roof over it
        drawPath(p(0.38f to -0.85f, 0.66f to -0.85f, 0.66f to -0.3f, 0.38f to -0.3f), roofDim); drawPath(p(0.38f to -0.85f, 0.66f to -0.85f, 0.66f to -0.3f, 0.38f to -0.3f), ink, style = line)
        drawPath(p(-1.0f to 0.0f, 0f to -1.0f, 0f to 0.0f), roofLit)
        drawPath(p(0f to -1.0f, 1.0f to 0.0f, 0f to 0.0f), roofDim)
        drawPath(p(-1.0f to 0.0f, 0f to -1.0f, 1.0f to 0.0f), ink, style = line)
        drawPath(p(-0.8f to -0.02f, -0.8f to 0.8f, 0.8f to 0.8f, 0.8f to -0.02f), ink, style = line)
        // a door and a window
        drawPath(p(-0.22f to 0.8f, -0.22f to 0.38f, 0.22f to 0.38f, 0.22f to 0.8f), door); drawPath(p(-0.22f to 0.8f, -0.22f to 0.38f, 0.22f to 0.38f, 0.22f to 0.8f), ink, style = Stroke(max(1f, r * 0.06f)))
        win(0.36f, 0.2f, 0.32f, 0.3f)
    } else {
        // the hall on the left and the tower on the right
        drawPath(p(-1.3f to 0.05f, -0.2f to 0.05f, -0.2f to 0.8f, -1.3f to 0.8f), lit)
        drawPath(p(-0.2f to -0.5f, 0.45f to -0.5f, 0.45f to 0.8f, -0.2f to 0.8f), dim)
        drawPath(p(0.45f to -0.5f, 1.15f to -0.5f, 1.15f to 0.8f, 0.45f to 0.8f), tone(color, -0.3f))
        // roofs: the hall's gable, the tower's point
        drawPath(p(-1.45f to 0.05f, -0.75f to -0.6f, -0.05f to 0.05f), roofLit)
        drawPath(p(-0.75f to -0.6f, -0.05f to 0.05f, -0.75f to 0.05f), roofDim)
        drawPath(p(-1.45f to 0.05f, -0.75f to -0.6f, -0.05f to 0.05f), ink, style = line)
        drawPath(p(0.3f to -0.5f, 0.8f to -1.3f, 1.3f to -0.5f), roofLit)
        drawPath(p(0.8f to -1.3f, 1.3f to -0.5f, 0.8f to -0.5f), roofDim)
        drawPath(p(0.3f to -0.5f, 0.8f to -1.3f, 1.3f to -0.5f), ink, style = line)
        drawPath(p(-1.3f to 0.03f, -1.3f to 0.8f, -0.2f to 0.8f, -0.2f to -0.5f, 0.45f to -0.5f), ink, style = line)
        drawPath(p(0.45f to -0.5f, 1.15f to -0.5f, 1.15f to 0.8f, 0.45f to 0.8f), ink, style = line)
        // a flag on the tower
        drawLine(ink, Offset(c.x + 0.8f * r, c.y - 1.3f * r), Offset(c.x + 0.8f * r, c.y - 1.75f * r), strokeWidth = max(1.4f, r * 0.08f))
        drawPath(p(0.8f to -1.75f, 1.2f to -1.62f, 0.8f to -1.48f), Color(0xFFFFD23F)); drawPath(p(0.8f to -1.75f, 1.2f to -1.62f, 0.8f to -1.48f), ink, style = Stroke(max(1f, r * 0.05f)))
        // an arched door, windows
        drawPath(p(-0.95f to 0.8f, -0.95f to 0.42f, -0.55f to 0.42f, -0.55f to 0.8f), door); drawPath(p(-0.95f to 0.8f, -0.95f to 0.42f, -0.55f to 0.42f, -0.55f to 0.8f), ink, style = Stroke(max(1f, r * 0.06f)))
        win(-0.4f, 0.22f, 0.26f, 0.26f); win(0.2f, 0.12f, 0.2f, 0.22f)
        win(0.62f, -0.2f, 0.34f, 0.3f); win(0.62f, 0.38f, 0.34f, 0.3f)
    }
}

/** A whole map drawn to fit its box (no pieces, no taps): the map previews and thumbnails. */
@Composable
fun BoardPreview(board: Board, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val bounds = remember(board) { boundsOf(board) }
    Canvas(modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val k = min(size.width / bounds.w.toFloat(), size.height / bounds.h.toFloat())
        val origin = Offset(size.width / 2f - (bounds.cx * k).toFloat(), size.height / 2f - (bounds.cy * k).toFloat())
        drawBoardArt(board, origin, k, measurer)
    }
}

/** A glowing circle: a soft golden halo that pulses, with a bright dot and a white rim in the middle. [r] is the halo's radius. */
internal fun DrawScope.glowSpot(c: Offset, r: Float, pulse: Float) {
    drawCircle(
        androidx.compose.ui.graphics.Brush.radialGradient(
            0f to GOLD.copy(alpha = 0.85f * pulse), 0.55f to GOLD.copy(alpha = 0.4f * pulse), 1f to Color.Transparent, center = c, radius = r,
        ),
        r, c,
    )
    drawCircle(GOLD.copy(alpha = 0.5f + 0.5f * pulse), r * 0.36f, c)
    drawCircle(Color.White, r * 0.36f, c, style = Stroke(max(1.5f, r * 0.07f)))
}
