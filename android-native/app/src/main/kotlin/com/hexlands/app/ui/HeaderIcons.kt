package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

enum class HeaderIcon { Log, Info, Leave }

/** A small round icon button for the strip under the players: the game log, the game info, and leaving. */
@Composable
fun HeaderIconButton(kind: HeaderIcon, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(36.dp).clip(CircleShape).clickable(onClick = onClick).semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(20.dp)) {
            val w = size.width; val h = size.height; val c = Foam; val sw = w * 0.1f
            when (kind) {
                HeaderIcon.Log -> for (i in 0 until 3) {
                    val y = h * (0.2f + i * 0.3f)
                    drawCircle(c, sw * 0.9f, Offset(w * 0.1f, y))
                    drawLine(c, Offset(w * 0.28f, y), Offset(w * 0.95f, y), strokeWidth = sw, cap = StrokeCap.Round)
                }
                HeaderIcon.Info -> {
                    drawCircle(c, w * 0.46f, center, style = Stroke(sw))
                    drawCircle(c, sw * 0.8f, Offset(w * 0.5f, h * 0.3f))
                    drawLine(c, Offset(w * 0.5f, h * 0.45f), Offset(w * 0.5f, h * 0.75f), strokeWidth = sw * 1.3f, cap = StrokeCap.Round)
                }
                HeaderIcon.Leave -> {
                    // a doorway with an arrow going out of it
                    drawPath(Path().apply { moveTo(w * 0.45f, h * 0.1f); lineTo(w * 0.1f, h * 0.1f); lineTo(w * 0.1f, h * 0.9f); lineTo(w * 0.45f, h * 0.9f) }, c, style = Stroke(sw, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    drawLine(c, Offset(w * 0.3f, h * 0.5f), Offset(w * 0.92f, h * 0.5f), strokeWidth = sw, cap = StrokeCap.Round)
                    drawPath(Path().apply { moveTo(w * 0.72f, h * 0.28f); lineTo(w * 0.94f, h * 0.5f); lineTo(w * 0.72f, h * 0.72f) }, c, style = Stroke(sw, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
    }
}
