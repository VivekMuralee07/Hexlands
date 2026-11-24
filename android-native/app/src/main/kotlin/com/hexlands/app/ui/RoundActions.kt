package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private fun DrawScope.miniDie(topLeft: Offset, side: Float, angle: Float, face: Color, pip: Color, pips: List<Int>) {
    rotate(angle, Offset(topLeft.x + side / 2, topLeft.y + side / 2)) {
        drawRoundRect(Color.Black.copy(alpha = 0.25f), topLeft + Offset(1.5f, 2.5f), Size(side, side), CornerRadius(side * 0.22f))
        drawRoundRect(face, topLeft, Size(side, side), CornerRadius(side * 0.22f))
        for (p in pips) drawCircle(pip, side * 0.075f, Offset(topLeft.x + side * (0.25f + 0.25f * (p % 3)), topLeft.y + side * (0.25f + 0.25f * (p / 3))))
    }
}

private fun DrawScope.diceIcon() {
    val w = size.width
    miniDie(Offset(w * 0.02f, w * 0.3f), w * 0.5f, -14f, Color(0xFFFFFBF0), Color(0xFF222222), listOf(0, 4, 8))
    miniDie(Offset(w * 0.46f, w * 0.1f), w * 0.5f, 12f, Color(0xFFE04A3A), Color.White, listOf(0, 2, 4, 6, 8))
}

private fun DrawScope.skipIcon() {
    val w = size.width; val h = size.height; val c = Color.White
    drawPath(Path().apply { moveTo(w * 0.08f, h * 0.15f); lineTo(w * 0.5f, h * 0.5f); lineTo(w * 0.08f, h * 0.85f); close() }, c)
    drawPath(Path().apply { moveTo(w * 0.46f, h * 0.15f); lineTo(w * 0.88f, h * 0.5f); lineTo(w * 0.46f, h * 0.85f); close() }, c)
    drawRoundRect(c, Offset(w * 0.86f, h * 0.15f), Size(w * 0.1f, h * 0.7f), CornerRadius(3f))
}

/** The big round button at the corner of the board: Roll (gold, dice) before you roll, End (green, skip arrows) after. Same place, same size. */
@Composable
fun RoundTurnButton(roll: Boolean, pulse: Float, onClick: () -> Unit) {
    val face = if (roll) Brush.verticalGradient(listOf(Color(0xFFFFE27A), Color(0xFFFFB81C), Color(0xFFE08A00)))
    else Brush.verticalGradient(listOf(Color(0xFF45D77D), Color(0xFF1FAE5B), Color(0xFF127A41)))
    Box(
        Modifier.size(82.dp).graphicsLayer { scaleX = pulse; scaleY = pulse }.shadow(10.dp, CircleShape).clip(CircleShape).background(face)
            .border(3.dp, Color.White.copy(alpha = 0.95f), CircleShape).clickable(onClick = onClick)
            .semantics { contentDescription = if (roll) "Roll the dice" else "End your turn" },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Canvas(Modifier.size(38.dp)) { if (roll) diceIcon() else skipIcon() }
            Text(
                if (roll) "Roll" else "End", Modifier.padding(top = 2.dp).then(if (roll) Modifier else Modifier.background(Color(0xFF0E5A30), RoundedCornerShape(50)).padding(horizontal = 10.dp)),
                fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = if (roll) Color(0xFF4A2E00) else Color.White,
            )
        }
    }
}
