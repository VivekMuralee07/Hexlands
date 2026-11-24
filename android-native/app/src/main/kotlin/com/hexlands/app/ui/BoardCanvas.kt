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
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.parseColor
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

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
) {
    val measurer = rememberTextMeasurer()
    var zoom by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    val bounds = remember(board) { boundsOf(board) }
    // The glow on the spots you may tap pulses. [animate] = false holds it steady (the screenshot tests need a screen that is ever idle).
    val pulse = if (animate) rememberInfiniteTransition(label = "pulse").animateFloat(0.35f, 0.95f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "pulse").value else 0.8f
    val density = LocalDensity.current
    val slop = with(density) { 30.dp.toPx() }

    fun scale(): Float = if (size.width == 0) 1f else min(size.width / bounds.w.toFloat(), size.height / bounds.h.toFloat()) * zoom
    fun screen(x: Double, y: Double): Offset {
        val k = scale()
        return Offset(size.width / 2f + pan.x + ((x - bounds.cx) * k).toFloat(), size.height / 2f + pan.y + ((y - bounds.cy) * k).toFloat())
    }

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

    Box(modifier.fillMaxSize()) {
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
            drawLine(Color.Black.copy(alpha = 0.7f), pa, pb, strokeWidth = k * 0.17f, cap = StrokeCap.Round)
            drawLine(Color(parseColor(game.players.getOrNull(seat)?.color)), pa, pb, strokeWidth = k * 0.11f, cap = StrokeCap.Round)
        }
        // buildings
        for ((vid, b) in game.buildings) {
            val v = board.vertices.getOrNull(vid.toIntOrNull() ?: continue) ?: continue
            house(screen(v.x, v.y), k * 0.2f, Color(parseColor(game.players.getOrNull(b.p)?.color)), b.type == "city")
        }
        // the robber
        board.tiles.getOrNull(game.robber)?.let { t ->
            val c = screen(t.x, t.y) + Offset(0f, -k * 0.05f)
            drawCircle(Color(0xFF222222), k * 0.16f, c + Offset(0f, k * 0.14f))
            drawCircle(Color(0xFF222222), k * 0.1f, c - Offset(0f, k * 0.08f))
            drawCircle(Color.White.copy(alpha = 0.5f), k * 0.16f, c + Offset(0f, k * 0.14f), style = Stroke(max(1f, k * 0.015f)))
        }
        // the spots the player may tap
        val glow = GOLD.copy(alpha = pulse)
        for (id in roadSpots) {
            val e = board.edges.getOrNull(id) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            val sel = picked == Tap.Road(id)
            drawLine(if (sel) Color(0xFF4CD964) else glow, screen(a.x, a.y), screen(b.x, b.y), strokeWidth = k * (if (sel) 0.2f else 0.14f), cap = StrokeCap.Round)
        }
        for (id in cornerSpots) {
            val v = board.vertices.getOrNull(id) ?: continue
            val c = screen(v.x, v.y); val sel = picked == Tap.Corner(id)
            drawCircle(if (sel) Color(0xFF4CD964) else glow, k * (if (sel) 0.26f else 0.2f), c)
            drawCircle(Color.White, k * (if (sel) 0.26f else 0.2f), c, style = Stroke(max(1.5f, k * 0.03f)))
        }
        for (id in hexSpots) {
            val t = board.tiles.getOrNull(id) ?: continue
            val c = screen(t.x, t.y); val sel = picked == Tap.Hex(id)
            drawCircle(if (sel) Color(0xFF4CD964) else Color.White.copy(alpha = pulse), k * 0.78f, c, style = Stroke(max(2f, k * (if (sel) 0.1f else 0.06f))))
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

/** A little house (settlement) or a bigger one with a tower (city), in the player's colour. */
private fun DrawScope.house(c: Offset, r: Float, color: Color, city: Boolean) {
    fun poly(vararg pts: Pair<Float, Float>): Path = Path().apply {
        moveTo(c.x + pts[0].first * r, c.y + pts[0].second * r)
        for (i in 1 until pts.size) lineTo(c.x + pts[i].first * r, c.y + pts[i].second * r)
        close()
    }
    val shape = if (city) poly(-1.25f to 0.75f, -1.25f to -0.15f, -0.45f to -0.15f, -0.45f to -0.75f, 0.2f to -1.2f, 0.85f to -0.75f, 0.85f to -0.15f, 1.25f to -0.15f, 1.25f to 0.75f)
    else poly(-0.85f to 0.7f, -0.85f to -0.1f, 0f to -0.95f, 0.85f to -0.1f, 0.85f to 0.7f)
    drawPath(shape, color)
    drawPath(shape, Color.Black.copy(alpha = 0.85f), style = Stroke(max(1.5f, r * 0.16f)))
}
