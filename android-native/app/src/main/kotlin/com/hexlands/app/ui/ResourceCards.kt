package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.RESOURCE_LABEL

/** Card colours, light at the top and deeper at the bottom, like the cards in a hand. */
private val GOLD_RING = Color(0xFFFFD23F)
private val CARD_TOP = mapOf("wood" to Color(0xFF47C255), "brick" to Color(0xFFE08A72), "sheep" to Color(0xFFA9DB2A), "wheat" to Color(0xFFF6BC57), "ore" to Color(0xFFA9C4BC))
private val CARD_BOTTOM = mapOf("wood" to Color(0xFF1F8A2E), "brick" to Color(0xFFB45A44), "sheep" to Color(0xFF6F9F0B), "wheat" to Color(0xFFD38F2A), "ore" to Color(0xFF6C8C86))

private fun DrawScope.logs(s: Float = size.minDimension) {
    fun log(x: Float, y: Float) {
        val w = 0.58f * s; val h = 0.17f * s
        drawRoundRect(Color(0xFF5E3A1A), Offset(x * s, y * s + 2f), Size(w, h), CornerRadius(h / 2))
        drawRoundRect(Color(0xFF9A6330), Offset(x * s, y * s), Size(w, h), CornerRadius(h / 2))
        drawRoundRect(Color(0xFFC08A4F), Offset(x * s + h / 2, y * s + h * 0.15f), Size(w - h, h * 0.22f), CornerRadius(h * 0.1f))
        val c = Offset(x * s + w - h / 2, y * s + h / 2)
        drawCircle(Color(0xFFEBCB92), h / 2, c)
        drawCircle(Color(0xFF9A6330), h / 2, c, style = Stroke(1.6f))
        drawCircle(Color(0xFFB98446), h * 0.3f, c, style = Stroke(1.4f))
        drawCircle(Color(0xFFB98446), h * 0.1f, c)
    }
    log(0.14f, 0.62f); log(0.2f, 0.44f); log(0.12f, 0.26f)
}

private fun DrawScope.bricks(s: Float = size.minDimension) {
    fun brick(x: Float, y: Float) {
        val w = 0.27f * s; val h = 0.15f * s
        drawRoundRect(Color(0xFF7A2A18), Offset(x * s, y * s + 1.5f), Size(w, h), CornerRadius(h * 0.2f))
        drawRoundRect(Color(0xFFC9482B), Offset(x * s, y * s), Size(w, h), CornerRadius(h * 0.2f))
        drawRoundRect(Color(0xFFE8704B), Offset(x * s + 2f, y * s + 1.5f), Size(w - 4f, h * 0.3f), CornerRadius(h * 0.1f))
    }
    brick(0.14f, 0.64f); brick(0.43f, 0.64f); brick(0.28f, 0.47f); brick(0.57f, 0.47f); brick(0.14f, 0.3f); brick(0.43f, 0.3f); brick(0.3f, 0.13f)
}

private fun DrawScope.sheep(s: Float = size.minDimension) {
    fun p(x: Float, y: Float) = Offset(x * s, y * s)
    // legs and head first, then the fleece over them
    for (x in listOf(0.38f, 0.5f, 0.64f, 0.74f)) drawRoundRect(Color(0xFF2B2B2B), p(x - 0.02f, 0.62f), Size(0.05f * s, 0.18f * s), CornerRadius(3f))
    for ((x, y, r) in listOf(Triple(0.42f, 0.52f, 0.17f), Triple(0.56f, 0.46f, 0.18f), Triple(0.68f, 0.54f, 0.15f), Triple(0.5f, 0.6f, 0.15f), Triple(0.36f, 0.6f, 0.11f), Triple(0.66f, 0.64f, 0.11f))) {
        drawCircle(Color(0xFFD6D6CE), r * s + 1.5f, p(x, y)); drawCircle(Color(0xFFF7F7F2), r * s, p(x, y))
    }
    drawCircle(Color(0xFF2B2B2B), 0.1f * s, p(0.24f, 0.5f))
    drawOval(Color(0xFF2B2B2B), p(0.2f, 0.34f), Size(0.07f * s, 0.12f * s))
    drawCircle(Color.White, 0.02f * s, p(0.22f, 0.48f))
}

private fun DrawScope.wheat(s: Float = size.minDimension) {
    fun p(x: Float, y: Float) = Offset(x * s, y * s)
    val ink = Color(0xFF9A6A08); val gold = Color(0xFFF7C948)
    drawLine(ink, p(0.5f, 0.88f), p(0.5f, 0.2f), strokeWidth = 0.035f * s)
    for (i in 0 until 4) {
        val y = 0.32f + i * 0.14f
        for (side in listOf(-1f, 1f)) rotate(side * 35f, p(0.5f + side * 0.08f, y)) {
            val tl = p(0.5f + side * 0.08f - 0.05f, y - 0.09f); val sz = Size(0.1f * s, 0.18f * s)
            drawOval(ink, tl - Offset(1.2f, 1.2f), Size(sz.width + 2.4f, sz.height + 2.4f)); drawOval(gold, tl, sz)
        }
    }
    drawOval(ink, p(0.45f, 0.1f) - Offset(1.2f, 1.2f), Size(0.1f * s + 2.4f, 0.2f * s + 2.4f)); drawOval(gold, p(0.45f, 0.1f), Size(0.1f * s, 0.2f * s))
}

private fun DrawScope.ore(s: Float = size.minDimension) {
    fun poly(vararg pts: Pair<Float, Float>) = Path().apply { moveTo(pts[0].first * s, pts[0].second * s); for (i in 1 until pts.size) lineTo(pts[i].first * s, pts[i].second * s); close() }
    val body = poly(0.14f to 0.74f, 0.24f to 0.46f, 0.5f to 0.26f, 0.78f to 0.4f, 0.88f to 0.74f, 0.5f to 0.86f)
    drawPath(body, Color(0xFF3F4A56), style = Stroke(3f))
    drawPath(body, Color(0xFF7A8B9C))
    drawPath(poly(0.24f to 0.46f, 0.5f to 0.26f, 0.5f to 0.62f, 0.14f to 0.74f), Color(0xFFA9BCCD))
    drawPath(poly(0.5f to 0.62f, 0.78f to 0.4f, 0.88f to 0.74f, 0.5f to 0.86f), Color(0xFF55616E))
    val c = Offset(0.4f * s, 0.44f * s); val r = 0.07f * s
    drawPath(Path().apply { moveTo(c.x, c.y - r); lineTo(c.x + r * 0.28f, c.y - r * 0.28f); lineTo(c.x + r, c.y); lineTo(c.x + r * 0.28f, c.y + r * 0.28f); lineTo(c.x, c.y + r); lineTo(c.x - r * 0.28f, c.y + r * 0.28f); lineTo(c.x - r, c.y); lineTo(c.x - r * 0.28f, c.y - r * 0.28f); close() }, Color.White)
}

/** The picture for a resource (logs, bricks, a sheep, an ear of wheat, a rock), drawn on a pale circle when [backdrop] is true. */
@Composable
fun ResourceArt(resource: String, size: Dp, modifier: Modifier = Modifier, backdrop: Boolean = false) {
    val label = RESOURCE_LABEL[resource] ?: resource
    Canvas(modifier.size(size).semantics { contentDescription = label }) {
        if (backdrop) drawCircle(Color(0xFFF2E8D5).copy(alpha = 0.85f), this.size.minDimension / 2f)
        when (resource) { "wood" -> logs(); "brick" -> bricks(); "sheep" -> sheep(); "wheat" -> wheat(); "ore" -> ore() }
    }
}

/** A hand card: coloured, with the resource's picture on a pale circle, an optional count badge at the corner, an optional name and an optional chip (like "4:1"). */
@Composable
fun ResourceCard(
    resource: String,
    modifier: Modifier = Modifier,
    count: Int? = null,
    label: String? = null,
    chip: String? = null,
    dim: Boolean = false,
    goldBadge: Boolean = false,
    highlight: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(12.dp)
    val name = (RESOURCE_LABEL[resource] ?: resource) + (count?.let { ", $it" } ?: "")
    Box(modifier.aspectRatio(0.76f).semantics { contentDescription = name }.let { if (onClick != null) it.clickable(onClick = onClick) else it }) {
        Box(
            Modifier.fillMaxSize().clip(shape)
                .background(Brush.verticalGradient(listOf((CARD_TOP[resource] ?: Color.Gray).copy(alpha = if (dim) 0.4f else 1f), (CARD_BOTTOM[resource] ?: Color.DarkGray).copy(alpha = if (dim) 0.4f else 1f))))
                .border(if (highlight) 3.dp else 1.5.dp, if (highlight) GOLD_RING else Color.White.copy(alpha = if (dim) 0.35f else 0.9f), shape),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Canvas(Modifier.fillMaxWidth(0.72f).aspectRatio(1f)) {
                    drawCircle(Color(0xFFF2E8D5).copy(alpha = if (dim) 0.45f else 0.88f), size.minDimension / 2f)
                    val s = size.minDimension
                    withTransform({ translate((size.width - s * 0.94f) / 2f, s * 0.04f); scale(0.94f, 0.94f, Offset.Zero) }) {
                        when (resource) { "wood" -> logs(); "brick" -> bricks(); "sheep" -> sheep(); "wheat" -> wheat(); "ore" -> ore() }
                    }
                }
                if (label != null) Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = if (dim) 0.6f else 1f))
            }
            if (chip != null) Text(
                chip, Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp).background(Color.White, RoundedCornerShape(50)).padding(horizontal = 6.dp),
                fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF263447),
            )
        }
        if (count != null) Box(
            Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-6).dp).size(24.dp).clip(CircleShape).background(Color(0xFF1F3F9A))
                .border(1.5.dp, if (goldBadge) Gold else Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("$count", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold) }
    }
}


/** A resource's picture drawn into a square of side [s] whose top-left corner is the current origin (used on the harbours of the board). */
internal fun DrawScope.resourceGlyph(resource: String, s: Float) {
    when (resource) { "wood" -> logs(s); "brick" -> bricks(s); "sheep" -> sheep(s); "wheat" -> wheat(s); "ore" -> ore(s) }
}
