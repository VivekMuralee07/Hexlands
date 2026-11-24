package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.GameState
import kotlinx.coroutines.delay

/** Whose step the clock is counting, for the label under the time. */
fun clockWho(g: GameState): String {
    val pending = when (g.subphase) { "discard" -> g.pendingDiscards; "diamond" -> g.pendingDiamond; else -> null }
    if (pending != null) {
        val mine = pending.containsKey(g.you.toString())
        return if (g.subphase == "diamond") (if (mine) "You choose" else "Choosing") else (if (mine) "You discard" else "Discarding")
    }
    return if (g.turn == g.you) "You" else g.players.getOrNull(g.turn)?.name ?: ""
}

/**
 * The move timer, as in the web game: a ring that empties, the time left, and whose step it is. Green, then yellow at 10 seconds and red at 5.
 * The server sends how long is left with each state; this counts down from there.
 */
/** The seconds left on the move timer (counted down from what the server sent with the state), or null when there is no clock. */
@Composable
fun rememberSecsLeft(game: GameState): Pair<Int, Float>? {
    val tm = game.timer ?: return null
    val left0 = tm.left ?: return null
    if (tm.limit <= 0 || game.phase == "ended" || game.phase == "lobby") return null
    val received = remember(game) { System.currentTimeMillis() }
    var now by remember(game) { mutableLongStateOf(received) }
    if (LocalAnimate.current) LaunchedEffect(game) { while (true) { now = System.currentTimeMillis(); delay(250) } }
    val leftMs = (left0 - (now - received)).coerceAtLeast(0.0)
    return kotlin.math.ceil(leftMs / 1000.0).toInt() to (leftMs / (tm.limit * 1000.0)).toFloat().coerceIn(0f, 1f)
}

/**
 * The move timer, as in the web game: a ring that empties, the time left, and whose step it is. Green, then yellow at 10 seconds and red at 5.
 * The server sends how long is left with each state; this counts down from there.
 */
@Composable
fun MoveClock(game: GameState, modifier: Modifier = Modifier) {
    val (secs, frac) = rememberSecsLeft(game) ?: return
    val color = when { secs <= 5 -> Color(0xFFFF6B57); secs <= 10 -> Color(0xFFFFD23F); else -> Color(0xFF6CF08A) }
    val who = clockWho(game)
    Row(modifier.semantics { contentDescription = "$secs seconds left for $who" }, verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(30.dp)) {
            val w = 4.dp.toPx()
            drawArc(Color.White.copy(alpha = 0.2f), 0f, 360f, false, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), style = Stroke(w))
            drawArc(color, -90f, 360f * frac, false, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), style = Stroke(w, cap = StrokeCap.Round))
        }
        Column(Modifier.padding(start = 6.dp)) {
            Text("${secs / 60}:${(secs % 60).toString().padStart(2, '0')}", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = color)
            Text(who, fontSize = 10.sp, color = FoamDim, maxLines = 1)
        }
    }
}
