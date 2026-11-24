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
import androidx.compose.ui.graphics.drawscope.withTransform
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

/** The part of the board that must be on the screen, in board units. */
internal class Bounds(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double) {
    val w get() = maxX - minX
    val h get() = maxY - minY
    val cx get() = (minX + maxX) / 2
    val cy get() = (minY + maxY) / 2
}

/**
 * The board fitted as tightly as it can be: the hex corners with a little room for the coast, and the harbour ships (which stand out from the coast, with a mast above
 * them) where they stick out. The margin used to be the same on every side and 0.9 wide, which left a wide empty frame round the island.
 */
internal fun boundsOf(board: Board): Bounds {
    if (board.vertices.isEmpty()) return Bounds(-1.0, -1.0, 1.0, 1.0)
    var minX = board.vertices.minOf { it.x } - 0.45; var maxX = board.vertices.maxOf { it.x } + 0.45
    var minY = board.vertices.minOf { it.y } - 0.45; var maxY = board.vertices.maxOf { it.y } + 0.45
    for (p in board.ports) {
        minX = minOf(minX, p.x - 0.55); maxX = maxOf(maxX, p.x + 0.55)
        minY = minOf(minY, p.y - 0.85); maxY = maxOf(maxY, p.y + 0.5)
    }
    return Bounds(minX, minY, maxX, maxY)
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
    var landedAt by remember { mutableFloatStateOf(-100f) }   // when the robber last came down (for the thud)
    // the hexes that paid out light up after the dice have settled
    val rollSeq = game.lastRoll?.seq
    var seenRoll by remember { mutableStateOf(rollSeq) }
    var rollAt by remember { mutableFloatStateOf(-100f) }
    androidx.compose.runtime.LaunchedEffect(rollSeq) { if (rollSeq != seenRoll) { seenRoll = rollSeq; rollAt = clock } }
    // Longest Road changes hands: that player's roads glow for a moment
    var awardSeat by remember { mutableStateOf(game.longestRoad?.p) }
    var awardAt by remember { mutableFloatStateOf(-100f) }
    androidx.compose.runtime.LaunchedEffect(game.longestRoad?.p) { if (game.longestRoad?.p != awardSeat) { awardSeat = game.longestRoad?.p; awardAt = clock } }
    androidx.compose.runtime.LaunchedEffect(game.robber) {
        if (game.robber != robTo) {
            robFrom = robTo; robTo = game.robber
            if (anim) { hop.snapTo(0f); hop.animateTo(1f, tween(550)); landedAt = clock } else hop.snapTo(1f)
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
        drawBoardArt(board, screen(0.0, 0.0), k, measurer, sea = false)   // the sea behind it is the animated SeaBackground
        if (anim) for (t in board.tiles) if (!t.fog) terrainLife(t.terrain, t.id, screen(t.x, t.y), k, clock)
        // the hexes that paid out pulse after a roll
        if (anim && game.lastRoll != null) {
            val sum = game.lastRoll.dice.sum()
            val pp = (clock - rollAt - 0.85f) / 2.4f
            if (sum != 7 && pp in 0f..1f) for (t in board.tiles) if (t.number == sum && t.id != robTo) paidPulse(screen(t.x, t.y), k, pp)
        }
        // roads
        for ((eid, seat) in game.roads) {
            val e = board.edges.getOrNull(eid.toIntOrNull() ?: continue) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            val pa = screen(a.x, a.y); val pb = screen(b.x, b.y)
            val g = pop("r$eid")
            val cut = if (eid.toIntOrNull() in cutRoads) 0.5f else 1f   // a road an opposing settlement has cut off is shown faded
            if (anim && seat == awardSeat && clock - awardAt in 0f..2.6f) drawLine(Color(0xFFFFE27A).copy(alpha = 0.5f + 0.4f * kotlin.math.sin((clock - awardAt) * 9f)), pa, pb, strokeWidth = k * 0.42f, cap = StrokeCap.Round)
            drawLine(Color.Black.copy(alpha = 0.7f * cut), pa, pb, strokeWidth = k * 0.27f * g, cap = StrokeCap.Round)
            drawLine(Color(parseColor(game.players.getOrNull(seat)?.color)).copy(alpha = cut), pa, pb, strokeWidth = k * 0.18f * g, cap = StrokeCap.Round)
            if (anim) landingPuff((pa + pb) / 2f, k * 0.2f, (clock - (births["r$eid"] ?: -10f)) / 0.7f)
        }
        // buildings
        for ((vid, b) in game.buildings) {
            val v = board.vertices.getOrNull(vid.toIntOrNull() ?: continue) ?: continue
            val vc = screen(v.x, v.y)
            if (anim && game.phase == "ended" && b.p == game.winner) winnerHalo(vc, k, clock)
            house(vc, k * 0.32f * pop("b$vid${b.type}"), Color(parseColor(game.players.getOrNull(b.p)?.color)), b.type == "city")
            if (anim) landingPuff(vc, k * 0.3f, (clock - (births["b$vid${b.type}"] ?: -10f)) / 0.7f)
        }
        // the robber
        board.tiles.getOrNull(robTo)?.let { t ->
            val to = screen(t.x, t.y)
            val from = board.tiles.getOrNull(robFrom)?.let { screen(it.x, it.y) } ?: to
            val h = hop.value
            val c = from + (to - from) * h + Offset(0f, -kotlin.math.sin(Math.PI.toFloat() * h) * k * 0.6f)
            if (anim) {
                val blocked = (clock - landedAt) in 0f..60f || hop.value >= 1f
                if (blocked) drawCircle(Color(0xFF101830).copy(alpha = 0.3f), k * 0.34f, to)   // the number it blocks is greyed
                drawOval(Color.Black.copy(alpha = 0.3f), Offset(c.x - k * 0.22f, to.y + k * 0.05f), androidx.compose.ui.geometry.Size(k * 0.44f * (1f - 0.35f * kotlin.math.sin(Math.PI.toFloat() * h)), k * 0.1f))
                robberRipple(to, k, (clock - landedAt) / 1.0f)
            }
            robberFigure(c, k)
        }
        if (anim) dayNightTint(clock)
        // the spots the player may tap: white transparent bubbles (on a road, at its middle)
        val spotTint = Color.White
        for (id in roadSpots) {
            if (picked == Tap.Road(id)) continue   // the preview piece is drawn there instead
            val e = board.edges.getOrNull(id) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            bubbleSpot(screen((a.x + b.x) / 2, (a.y + b.y) / 2), k * 0.34f, pulse, spotTint)
        }
        for (id in cornerSpots) {
            if (picked == Tap.Corner(id)) continue   // the preview piece is drawn there instead
            val v = board.vertices.getOrNull(id) ?: continue
            bubbleSpot(screen(v.x, v.y), k * 0.4f, pulse, spotTint)
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

private fun svgPath(d: String): Path = androidx.compose.ui.graphics.vector.PathParser().parsePathString(d).toPath()
private val SETTLEMENT_BODY = svgPath("M-13,10 L-14,-3 L-7,-14 L7,-14 L14,-3 L13,10Z")
private val CITY_MAIN = svgPath("M-23,12 L-24,-3 L-15,-17 L1,-17 L10,-3 L9,12Z")
private val CITY_WING = svgPath("M9,12 V0 L12,-4 H22 L24,0 V12Z")

/**
 * The web game's pieces: a barn-style settlement or a city with a wing, in the player's colour, with a lighter left roof, a darker right roof, a ridge line, a dark
 * door and a thick dark outline, inside a white halo so they stand out on any tile. [r] sets the size (the callers pass about a third of a hex's radius);
 * (0, 0) is the corner it stands on.
 */
internal fun DrawScope.house(c: Offset, r: Float, color: Color, city: Boolean) {
    val s = r * (if (city) 0.0677f else 0.0896f)
    val ink = tone(color, -0.6f); val lt = tone(color, 0.3f); val dk = tone(color, -0.2f); val door = Color(0xFF150808)
    withTransform({ translate(c.x, c.y); scale(s, s, Offset.Zero) }) {
        // a soft shadow under the piece
        drawOval(Color.Black.copy(alpha = 0.3f), Offset(if (city) -26f else -16f, 8f), androidx.compose.ui.geometry.Size(if (city) 54f else 32f, 9f))
        val halo = Stroke(8f, join = StrokeJoin.Round)
        val line = Stroke(3.2f, join = StrokeJoin.Round)
        val thin = Stroke(2f)
        if (!city) {
            drawPath(SETTLEMENT_BODY, Color.White); drawPath(SETTLEMENT_BODY, Color.White, style = halo)
            drawPath(SETTLEMENT_BODY, color)
            drawPath(svgPath("M-14,-3 L-7,-14 H0 V-3Z"), lt); drawPath(svgPath("M0,-14 H7 L14,-3 H0Z"), dk)
            drawPath(SETTLEMENT_BODY, ink, style = line)
            drawPath(svgPath("M-14,-3 H14 M0,-14 V-3"), ink, style = thin)
            drawPath(svgPath("M-3,10 V6.4 a3,3 0 0 1 6,0 V10Z"), door)
        } else {
            drawPath(CITY_MAIN, Color.White); drawPath(CITY_MAIN, Color.White, style = halo); drawPath(CITY_WING, Color.White); drawPath(CITY_WING, Color.White, style = halo)
            drawPath(CITY_MAIN, color)
            drawPath(svgPath("M-24,-3 L-15,-17 H-7 V-3Z"), lt); drawPath(svgPath("M-7,-17 H1 L10,-3 H-7Z"), dk)
            drawPath(CITY_WING, color); drawPath(svgPath("M9,0 L12,-4 H22 L24,0Z"), dk)
            drawPath(CITY_MAIN, ink, style = line); drawPath(CITY_WING, ink, style = line)
            drawPath(svgPath("M-24,-3 H10 M-7,-17 V-3"), ink, style = thin)
            drawPath(svgPath("M-10,12 V8.2 a3,3 0 0 1 6,0 V12Z"), door)
            drawRoundRect(door, Offset(-18f, 1f), androidx.compose.ui.geometry.Size(3.8f, 5f), androidx.compose.ui.geometry.CornerRadius(0.8f))
            drawRoundRect(door, Offset(-1f, 1f), androidx.compose.ui.geometry.Size(3.8f, 5f), androidx.compose.ui.geometry.CornerRadius(0.8f))
            drawRoundRect(door, Offset(14.5f, 4f), androidx.compose.ui.geometry.Size(4.4f, 3.8f), androidx.compose.ui.geometry.CornerRadius(0.8f))
        }
    }
}

/** The robber: a hooded figure with red eyes, as on the web (its 32 x 32 picture scaled to 44 units and set up and to the left of the tile's middle). [k] is pixels per board unit. */
internal fun DrawScope.robberFigure(tileCentre: Offset, k: Float) {
    val u = k / 60f
    withTransform({ translate(tileCentre.x - 58f * u, tileCentre.y - 42f * u); scale(44f / 32f * u, 44f / 32f * u, Offset.Zero) }) {
        drawOval(Color.Black.copy(alpha = 0.4f), Offset(7f, 27.3f), androidx.compose.ui.geometry.Size(18f, 4.4f))
        drawPath(svgPath("M6,29 C6,17 10,11 16,11 C22,11 26,17 26,29Z"), Color(0xFF23232B))
        drawPath(svgPath("M6,29 C6,17 10,11 16,11 L16,29Z"), Color(0xFF3A3A46))
        drawCircle(Color(0xFF2B2B34), 6f, Offset(16f, 8.5f))
        drawPath(svgPath("M10.5,9 C10.5,4 13,2.5 16,2.5 C19,2.5 21.5,4 21.5,9 C21.5,12 19,13 16,13 C13,13 10.5,12 10.5,9Z"), Color(0xFF15151B))
        drawOval(Color(0xFFFF4A3D), Offset(12f, 7.9f), androidx.compose.ui.geometry.Size(3.2f, 2.2f))
        drawOval(Color(0xFFFF4A3D), Offset(16.8f, 7.9f), androidx.compose.ui.geometry.Size(3.2f, 2.2f))
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


/**
 * A transparent bubble marking a place you may build: a glassy, see-through sphere (the board shows through it) that breathes gently, with a soft tint, a bright rim
 * and a small highlight, so it reads as "put a piece here". [r] is the bubble's radius and [tint] the colour of the glass (white).
 */
internal fun DrawScope.bubbleSpot(c: Offset, r: Float, pulse: Float, tint: Color = Color.White) {
    val br = r * (0.86f + 0.14f * pulse)   // breathes between 86% and 100%
    // the glass: nearly clear in the middle, a little frosted towards the edge
    drawCircle(
        androidx.compose.ui.graphics.Brush.radialGradient(0f to Color.White.copy(alpha = 0.06f), 0.7f to tint.copy(alpha = 0.14f), 1f to tint.copy(alpha = 0.32f), center = c, radius = br),
        br, c,
    )
    // the rim
    drawCircle(Color.White.copy(alpha = 0.55f + 0.3f * pulse), br, c, style = Stroke(max(1.5f, br * 0.06f)))
    drawCircle(tint.copy(alpha = 0.55f), br * 0.9f, c, style = Stroke(max(1f, br * 0.05f)))
    // the shine: a bright arc at the top left and a small spot below it
    drawArc(Color.White.copy(alpha = 0.85f), 200f, 62f, false, Offset(c.x - br * 0.72f, c.y - br * 0.72f), androidx.compose.ui.geometry.Size(br * 1.44f, br * 1.44f), style = Stroke(max(2f, br * 0.09f), cap = androidx.compose.ui.graphics.StrokeCap.Round))
    drawCircle(Color.White.copy(alpha = 0.7f), br * 0.07f, Offset(c.x + br * 0.42f, c.y + br * 0.46f))
}
