package com.hexlands.app.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import com.hexlands.app.net.RESOURCE_LABEL
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.DrawStyle
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.hexlands.app.net.Board
import com.hexlands.app.net.Port
import com.hexlands.app.net.Tile
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin

/*
 * The look of the board, copied from the web version (art.js and app.js) so both show the same picture: vivid flat tiles with a thick slab
 * edge, a cream outline, shallow water and sand around the island, cream number tokens, harbours with a ship and a jetty, fog as a cloud,
 * the diamond and the Blue Flame Cup. Everything here is drawn in the web's own units (a hex is 120 units tall; one board unit is 60),
 * so the numbers below are the numbers in the web code.
 */

/** The colour of each kind of tile. */
val TERRAIN_COLOR = mapOf(
    "forest" to Color(0xFF14943A), "hills" to Color(0xFFE2632A), "pasture" to Color(0xFF92B40A), "fields" to Color(0xFFF3BA23),
    "mountains" to Color(0xFFA3A9A5), "desert" to Color(0xFFCAC284), "diamond" to Color(0xFF17204A), "goblet" to Color(0xFF1B2430),
)
/** The same colours for the five resources (hand cards, harbours). */
val RESOURCE_COLOR = mapOf(
    "wood" to Color(0xFF14943A), "brick" to Color(0xFFE2632A), "sheep" to Color(0xFF92B40A), "wheat" to Color(0xFFF3BA23), "ore" to Color(0xFFA3A9A5),
)
private val SIDE = mapOf(
    "diamond" to Color(0xFF0C1534), "goblet" to Color(0xFF0D141C), "forest" to Color(0xFF0A7A2C), "hills" to Color(0xFFA83F0E),
    "pasture" to Color(0xFF5E9A08), "fields" to Color(0xFFB38A05), "mountains" to Color(0xFF5F78A8), "desert" to Color(0xFFB49A52),
)
val SEA_COLOR = Color(0xFF0A68A6)

private fun shade(c: Color, f: Float): Color =
    if (f < 0) Color(c.red * (1 + f), c.green * (1 + f), c.blue * (1 + f), c.alpha) else Color(c.red + (1 - c.red) * f, c.green + (1 - c.green) * f, c.blue + (1 - c.blue) * f, c.alpha)

private const val U = 60f   // one board unit in drawing units

private val HEX = listOf(0f to -60f, 52f to -30f, 52f to 30f, 0f to 60f, -52f to 30f, -52f to -30f)
private fun hexPath(scale: Float = 1f, dx: Float = 0f, dy: Float = 0f): Path = Path().apply {
    moveTo(dx + HEX[0].first * scale, dy + HEX[0].second * scale)
    for (i in 1 until 6) lineTo(dx + HEX[i].first * scale, dy + HEX[i].second * scale)
    close()
}
private fun path(d: String): Path = PathParser().parsePathString(d).toPath()

/** Pieces of a symbol, in the web's coordinates. */
private sealed interface Prim {
    data class P(val d: String) : Prim
    data class R(val x: Float, val y: Float, val w: Float, val h: Float, val rx: Float) : Prim
    data class E(val cx: Float, val cy: Float, val rx: Float, val ry: Float, val rot: Float = 0f) : Prim
    data class C(val cx: Float, val cy: Float, val r: Float) : Prim
}

private val SHAPES: Map<String, List<Prim>> = mapOf(
    "forest" to listOf(Prim.P("M0,-14 L8,-3 H4 L10,5 H2 V13 H-2 V5 H-10 L-4,-3 H-8Z")),
    "hills" to listOf(Prim.R(-13f, -11f, 12f, 7f, 1.2f), Prim.R(1f, -11f, 12f, 7f, 1.2f), Prim.R(-7f, -2.5f, 14f, 7f, 1.2f), Prim.R(-13f, 6f, 12f, 7f, 1.2f), Prim.R(1f, 6f, 12f, 7f, 1.2f)),
    "pasture" to listOf(
        Prim.E(-11.5f, -1f, 4f, 4.8f), Prim.C(-4f, -3f, 6f), Prim.C(3f, -5f, 6.5f), Prim.C(10f, -2f, 5.5f), Prim.C(2f, 3f, 7f), Prim.C(-5f, 3f, 5.5f),
        Prim.R(-7.5f, 7f, 3.4f, 7f, 1.5f), Prim.R(1f, 8f, 3.4f, 6f, 1.5f), Prim.R(7f, 5f, 3.4f, 8f, 1.5f),
    ),
    "fields" to listOf(
        Prim.R(-1.2f, -8f, 2.4f, 22f, 1f), Prim.E(0f, -11f, 3f, 5.2f), Prim.E(-5f, -3f, 3f, 5.2f, -30f), Prim.E(5f, -3f, 3f, 5.2f, 30f),
        Prim.E(-5.5f, 5f, 3f, 5.2f, -30f), Prim.E(5.5f, 5f, 3f, 5.2f, 30f),
    ),
    "mountains" to listOf(Prim.P("M-14,12 L-10,0 L-3,-4 L3,2 L1,12Z"), Prim.P("M-2,12 L2,-3 L8,-8 L14,4 L12,12Z"), Prim.P("M-7,-3 L-2,-11 L5,-7 L2,-1Z")),
    "desert" to listOf(Prim.R(-3.2f, -13f, 6.4f, 26f, 3.2f), Prim.R(-11f, -7f, 4.6f, 12f, 2.3f), Prim.R(-11f, 2f, 9f, 4.6f, 2.3f), Prim.R(6.4f, -9f, 4.6f, 12f, 2.3f), Prim.R(2f, -1f, 9f, 4.6f, 2.3f)),
)

private fun DrawScope.prim(p: Prim, color: Color, style: DrawStyle) {
    when (p) {
        is Prim.P -> drawPath(path(p.d), color, style = style)
        is Prim.R -> drawRoundRect(color, Offset(p.x, p.y), Size(p.w, p.h), CornerRadius(p.rx), style)
        is Prim.E -> rotate(p.rot, Offset(p.cx, p.cy)) { drawOval(color, Offset(p.cx - p.rx, p.cy - p.ry), Size(p.rx * 2, p.ry * 2), style = style) }
        is Prim.C -> drawCircle(color, p.r, Offset(p.cx, p.cy), style = style)
    }
}

/** A white symbol with a dark outline (a tree, bricks, a sheep, wheat, mountains, a cactus). */
private fun DrawScope.glyph(kind: String) {
    val shapes = SHAPES[kind] ?: return
    val base = TERRAIN_COLOR[kind] ?: return
    val ink = Color(base.red * 0.45f, base.green * 0.45f, base.blue * 0.45f)
    val fill = if (kind == "desert") Color(0xFF6BB05A) else Color(0xFFFFFDF3)
    val pos: DrawScope.(DrawScope.() -> Unit) -> Unit = { body ->
        if (kind == "desert") withTransform({ scale(1.55f, 1.55f, Offset.Zero) }) { body() }
        else withTransform({ translate(0f, -42f); scale(0.8f, 0.8f, Offset.Zero) }) { body() }
    }
    pos {
        for (s in shapes) prim(s, ink, Stroke(3.4f, join = StrokeJoin.Round))
        for (s in shapes) prim(s, fill, Fill)
        if (kind == "pasture") drawCircle(ink, 1.2f, Offset(-12.5f, -2f))
    }
}

private fun DrawScope.diamondFace() {
    drawRect(TERRAIN_COLOR.getValue("diamond"), Offset(-60f, -60f), Size(120f, 120f))
    drawCircle(Brush.radialGradient(listOf(Color(0xFF7FDCFF).copy(alpha = 0.7f), Color(0xFF2A4FB0).copy(alpha = 0f)), Offset.Zero, 66f), 58f, Offset.Zero)
    val gem = path("M-46,-20 L-27,-48 L27,-48 L46,-20 L0,52 Z")
    drawPath(gem, Brush.linearGradient(listOf(Color(0xFFE2F9FF), Color(0xFF56C8FF), Color(0xFF2468D8)), Offset(-46f, -48f), Offset(46f, 52f)))
    drawPath(gem, Color(0xFFE8FBFF), style = Stroke(2.4f, join = StrokeJoin.Round))
    drawPath(path("M-46,-20 H46 M-27,-48 L-12,-20 L0,52 M27,-48 L12,-20 L0,52 M-27,-48 L0,-20 L27,-48 M-12,-20 L0,-48 L12,-20"), Color.White.copy(alpha = 0.55f), style = Stroke(1.6f, join = StrokeJoin.Round))
    drawPath(path("M-27,-48 L-12,-20 L-46,-20 Z"), Color.White.copy(alpha = 0.38f))
    drawPath(path("M-40,-46 l2.5,6 l6,2.5 l-6,2.5 l-2.5,6 l-2.5,-6 l-6,-2.5 l6,-2.5z"), Color.White)
    drawPath(path("M40,8 l2,5 l5,2 l-5,2 l-2,5 l-2,-5 l-5,-2 l5,-2z"), Color(0xFFCFEEFF))
}

private fun DrawScope.gobletFace() {
    drawRect(TERRAIN_COLOR.getValue("goblet"), Offset(-60f, -60f), Size(120f, 120f))
    drawPath(path("M-52,22 l9,-6 l10,7 l-8,9Z M30,30 l12,-8 l9,9 l-12,6Z M-20,-50 l10,4 l-3,10 l-9,-5Z M38,-34 l9,3 l-2,9 l-9,-4Z M-44,-24 l8,-3 l5,8 l-9,3Z"), Color(0xFF26323F))
    drawCircle(Brush.radialGradient(listOf(Color(0xFF5EC2FF).copy(alpha = 0.6f), Color(0xFF2A6FD8).copy(alpha = 0.24f), Color(0xFF2A6FD8).copy(alpha = 0f)), Offset(0f, -4f), 58f), 56f, Offset(0f, -4f))
    val ink = Color(0xFF1E150C)
    withTransform({ translate(0f, 6f) }) {
        drawOval(Color(0xFF120D07).copy(alpha = 0.7f), Offset(-23f, 34f), Size(46f, 12f))
        drawPath(path("M-21,38 Q-12,29 -6,24 L6,24 Q12,29 21,38 Z"), Color(0xFF4A3826)); drawPath(path("M-21,38 Q-12,29 -6,24 L6,24 Q12,29 21,38 Z"), ink, style = Stroke(2f, join = StrokeJoin.Round))
        drawRoundRect(Color(0xFF5A4630), Offset(-5.5f, 4f), Size(11f, 22f), CornerRadius(3f)); drawRoundRect(ink, Offset(-5.5f, 4f), Size(11f, 22f), CornerRadius(3f), Stroke(2f))
        val bowl = path("M-25,-14 L-20,2 Q-14,19 0,21 Q14,19 20,2 L25,-14 Z")
        drawPath(bowl, Color(0xFF5D4A33)); drawPath(bowl, ink, style = Stroke(2.4f, join = StrokeJoin.Round))
        val rim = path("M-25,-14 L-17,-18 L-10,-13 L-3,-18 L4,-13 L11,-18 L18,-13 L25,-14 L23,-9 L-23,-9 Z")
        drawPath(rim, Color(0xFF7E6542)); drawPath(rim, ink, style = Stroke(2f, join = StrokeJoin.Round))
    }
    withTransform({ translate(0f, -8f); scale(0.85f, 0.85f, Offset.Zero); translate(0f, 8f) }) {
        drawPath(path("M-17,-8 C-26,-30 -10,-34 -14,-56 C-2,-46 2,-38 0,-30 C8,-40 12,-50 8,-60 C24,-44 28,-22 18,-8 Z"), Color(0xFF2F7BFF))
        drawPath(path("M-12,-8 C-18,-24 -6,-28 -8,-44 C0,-36 3,-30 2,-24 C9,-32 10,-40 7,-48 C18,-36 20,-20 13,-8 Z"), Color(0xFF79CCFF))
        drawPath(path("M-6,-8 C-9,-18 -2,-22 -3,-32 C2,-27 4,-22 3,-18 C7,-23 8,-28 6,-34 C11,-26 11,-16 7,-8 Z"), Color(0xFFEFFCFF))
    }
}

/** One hex: contact shadow, the slab's two side layers, the coloured top with its symbol, the light and shade, and the cream outline. */
private fun DrawScope.tileArt(t: Tile) {
    val side = SIDE[t.terrain] ?: Color(0xFF444444)
    withTransform({ scale(0.955f, 0.955f, Offset.Zero) }) {
        drawPath(hexPath(dy = 15f), Color(0xFF3A2508).copy(alpha = 0.3f))
        drawPath(hexPath(dy = 10f), shade(side, -0.35f))
        drawPath(hexPath(dy = 5f), side)
        clipPath(hexPath()) {
            when (t.terrain) {
                "diamond" -> diamondFace()
                "goblet" -> gobletFace()
                else -> { drawRect(TERRAIN_COLOR[t.terrain] ?: Color(0xFF607080), Offset(-60f, -60f), Size(120f, 120f)); glyph(t.terrain) }
            }
        }
        drawPath(hexPath(), Brush.linearGradient(
            0f to Color.White.copy(alpha = 0.26f), 0.38f to Color.White.copy(alpha = 0f), 0.68f to Color.Black.copy(alpha = 0f), 1f to Color.Black.copy(alpha = 0.2f),
            start = Offset(-52f, -60f), end = Offset(-15.6f, 60f),
        ))
        withTransform({ scale(0.93f, 0.93f, Offset.Zero) }) {
            drawPath(path("M-52,30 L-52,-30 L0,-60 L52,-30"), Color.White.copy(alpha = 0.45f), style = Stroke(3f, join = StrokeJoin.Round))
            drawPath(path("M52,-30 L52,30 L0,60 L-52,30"), Color.Black.copy(alpha = 0.22f), style = Stroke(3f, join = StrokeJoin.Round))
        }
        drawPath(hexPath(), Color(0xFFFFF8E0), style = Stroke(3.6f, join = StrokeJoin.Round))
        drawPath(hexPath(0.94f), Color.White.copy(alpha = 0.25f), style = Stroke(1.5f))
    }
}

/** A fluffy grey cloud in place of a hidden tile; the outline is the same every time. */
private fun cloudPath(t: Tile, scale: Float, amp: Float): Path {
    val n = 48; val seed = t.id * 1.7 + 3; val p6 = PI / 3
    val pts = (0 until n).map { i ->
        val a = i.toDouble() / n * PI * 2
        val k = (((a + p6 / 2) % p6) + p6) % p6 - p6 / 2
        val edge = 60 * cos(PI / 6) / cos(k)
        val wob = amp * (sin(a * 7 + seed) * 0.6 + sin(a * 13 + seed * 2.3) * 0.4)
        Offset((cos(a) * (edge + wob) * scale).toFloat(), (sin(a) * (edge + wob) * scale).toFloat())
    }
    fun mid(p: Offset, q: Offset) = Offset((p.x + q.x) / 2, (p.y + q.y) / 2)
    return Path().apply {
        val m0 = mid(pts[n - 1], pts[0]); moveTo(m0.x, m0.y)
        for (i in 0 until n) { val m = mid(pts[i], pts[(i + 1) % n]); quadraticTo(pts[i].x, pts[i].y, m.x, m.y) }
        close()
    }
}

private fun DrawScope.token(n: Int, measurer: TextMeasurer, u: Float) {
    val pips = 6 - abs(7 - n); val red = n == 6 || n == 8
    val ink = if (red) Color(0xFFD4140D) else Color.Black
    drawCircle(Color(0xFF0B1E33).copy(alpha = 0.32f), 31f, Offset(0f, 3.5f))
    val face = Brush.radialGradient(listOf(Color(0xFFFFFAF0), Color(0xFFE6D6B0)), Offset(-6.2f, -9.3f), 49.6f)
    drawCircle(face, 31f, Offset.Zero)
    drawCircle(if (red) Color(0xFFA31A14) else Color(0xFF6B5A3A), 31f, Offset.Zero, style = Stroke(2.4f))
    drawCircle(Color(0xFFC9B48A), 26.5f, Offset.Zero, style = Stroke(1f))
    val size = if (n >= 10) 29f else 35f
    val layout = measurer.measure(n.toString(), TextStyle(fontSize = size.toSp(), fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Serif, color = ink))
    drawText(layout, topLeft = Offset(-layout.size.width / 2f, -layout.size.height / 2f - 3f))
    for (i in 0 until pips) drawCircle(ink, 3.3f, Offset((i - (pips - 1) / 2f) * 7.4f, 19f))
}

private fun DrawScope.port(p: Port, measurer: TextMeasurer) {
    val px = p.x.toFloat() * U; val py = p.y.toFloat() * U
    val any = p.type == "any"
    // short wooden jetties from the two coast corners, pointing towards the ship
    for (end in p.vx) {
        if (end.size != 2) continue
        val x = end[0].toFloat() * U; val y = end[1].toFloat() * U
        val dx = px - x; val dy = py - y; val len = hypot(dx, dy).coerceAtLeast(1f); val l = min(30f, len * 0.62f)
        val e = Offset(x + dx / len * l, y + dy / len * l)
        drawLine(Color(0xFF7A4310), Offset(x, y), e, 15f, StrokeCap.Butt)
        drawLine(Color(0xFFE9A23A), Offset(x, y), e, 12f, StrokeCap.Butt)
    }
    withTransform({ translate(px, py) }) {
        drawOval(Color(0xFFBFE9FB).copy(alpha = 0.85f), Offset(-25f, 17.5f), Size(50f, 11f))
        drawOval(Color.White.copy(alpha = 0.7f), Offset(-19f, 20.5f), Size(38f, 7f))
        drawRect(Color(0xFF6B3D12), Offset(-1.3f, -40f), Size(2.6f, 12f))
        drawPath(path("M2,-41 h13 M4,-36.5 h11"), Color.White, style = Stroke(2.6f, cap = StrokeCap.Round))
        val hull = path("M-18,-28 Q-25,-9 -16,7 H16 Q25,-9 18,-28 Q0,-35 -18,-28Z")
        drawPath(hull, Color.White); drawPath(hull, Color(0xFFC4D1DE), style = Stroke(1.6f, join = StrokeJoin.Round))
        if (any) {
            val q = measurer.measure("?", TextStyle(fontSize = 24f.toSp(), fontWeight = FontWeight.ExtraBold, color = Color(0xFF5C3B2A)))
            drawText(q, topLeft = Offset(-q.size.width / 2f, -9f - q.size.height * 0.7f))
        } else {
            drawCircle(RESOURCE_COLOR[p.type] ?: Color.Gray, 9f, Offset(0f, -17f))
            drawCircle(Color.White, 9f, Offset(0f, -17f), style = Stroke(1.5f))
        }
        val r = measurer.measure(if (any) "3:1" else "2:1", TextStyle(fontSize = 12f.toSp(), fontWeight = FontWeight.Bold, color = Color(0xFF6B4A38)))
        drawText(r, topLeft = Offset(-r.size.width / 2f, 2.5f - r.size.height * 0.75f))
        val base = path("M-20,8 H20 L14,20 Q0,25 -14,20Z")
        drawPath(base, Color(0xFFD98B2B)); drawPath(base, Color(0xFF7A4310), style = Stroke(2f, join = StrokeJoin.Round))
        drawPath(path("M-19,10.5 H19"), Color(0xFFF6C866), style = Stroke(2.4f))
    }
}

/** Sea, the island's coast rings, ports, tiles and number tokens, in the web's order. [origin] is where board point (0, 0) is on the screen; [k] is pixels per board unit. */
fun DrawScope.drawBoardArt(board: Board, origin: Offset, k: Float, measurer: TextMeasurer, sea: Boolean = true) {
    if (sea) drawRect(SEA_COLOR)
    val u = k / U
    withTransform({ translate(origin.x, origin.y); scale(u, u, Offset.Zero) }) {
        val land = board.tiles.filter { it.terrain != "fog" }
        fun ring(scale: Float, color: Color, dy: Float = 0f, alpha: Float = 1f) {
            val all = Path()
            for (t in land) all.addPath(hexPath(scale, t.x.toFloat() * U, t.y.toFloat() * U + dy))
            drawPath(all, color.copy(alpha = alpha))
        }
        // the island's shadow on the water, then the shallows and the sand
        ring(1.42f, Color(0xFF021B3D), 30f, 0.09f); ring(1.36f, Color(0xFF021B3D), 22f, 0.12f); ring(1.32f, Color(0xFF021B3D), 14f, 0.14f)
        ring(1.31f, Color(0xFF4F9FCB)); ring(1.27f, Color(0xFF7BD0F9)); ring(1.2f, Color(0xFFDFEADD)); ring(1.17f, Color(0xFFF0D9A2)); ring(1.09f, Color(0xFFDFB86D))
        // fog
        for (t in board.tiles.filter { it.terrain == "fog" }) withTransform({ translate(t.x.toFloat() * U, t.y.toFloat() * U) }) {
            drawPath(cloudPath(t, 1.03f, 5f), Color(0xFFA9AFB8)); drawPath(cloudPath(t, 1.03f, 5f), Color(0xFFA9AFB8), style = Stroke(5f, join = StrokeJoin.Round))
            drawPath(cloudPath(t, 0.97f, 4f), Color(0xFFC9CCD1)); drawPath(cloudPath(t, 0.72f, 3f), Color(0xFFE3E5E8).copy(alpha = 0.8f))
        }
        for (p in board.ports) port(p, measurer)
        val sorted = land.sortedWith(compareBy({ it.y }, { it.x }))
        for (t in sorted) withTransform({ translate(t.x.toFloat() * U, t.y.toFloat() * U) }) { tileArt(t) }
        for (t in sorted) { val n = t.number ?: continue; withTransform({ translate(t.x.toFloat() * U, t.y.toFloat() * U) }) { token(n, measurer, u) } }
    }
}

private val RESOURCE_TERRAIN = mapOf("wood" to "forest", "brick" to "hills", "sheep" to "pasture", "wheat" to "fields", "ore" to "mountains")

/** The picture for a resource: a log tree for wood, bricks, a sheep, wheat for hay, mountains for ore. Same drawings as on the board. */
@androidx.compose.runtime.Composable
fun ResourceIcon(resource: String, size: androidx.compose.ui.unit.Dp, modifier: Modifier = Modifier) {
    val kind = RESOURCE_TERRAIN[resource] ?: return
    val label = RESOURCE_LABEL[resource] ?: resource
    androidx.compose.foundation.Canvas(modifier.size(size).semantics { contentDescription = label }) {
        val shapes = SHAPES[kind] ?: return@Canvas
        val base = TERRAIN_COLOR[kind] ?: return@Canvas
        val ink = Color(base.red * 0.45f, base.green * 0.45f, base.blue * 0.45f)
        val s = this.size.minDimension / 34f
        withTransform({ translate(this.size.width / 2f, this.size.height / 2f); scale(s, s, Offset.Zero) }) {
            for (p in shapes) prim(p, ink, Stroke(3.2f, join = StrokeJoin.Round))
            for (p in shapes) prim(p, Color(0xFFFFFDF3), Fill)
            if (kind == "pasture") drawCircle(ink, 1.2f, Offset(-12.5f, -2f))
        }
    }
}
