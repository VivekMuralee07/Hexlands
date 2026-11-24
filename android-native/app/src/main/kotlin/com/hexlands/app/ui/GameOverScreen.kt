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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.GameState
import com.hexlands.app.net.PlayerView
import com.hexlands.app.net.parseColor
import kotlinx.coroutines.delay
import kotlin.math.sin

/** What the points of one player are made of: the pieces on the board, the two bonuses, and the Victory Point cards held. */
data class PointsBreakdown(val settlements: Int, val cities: Int, val longestRoad: Boolean, val largestArmy: Boolean, val hiddenVp: Int)

fun GameState.breakdown(seat: Int) = PointsBreakdown(
    settlements = buildings.values.count { it.p == seat && it.type == "settlement" },
    cities = buildings.values.count { it.p == seat && it.type == "city" },
    longestRoad = longestRoad?.p == seat, largestArmy = largestArmy?.p == seat,
    hiddenVp = players.getOrNull(seat)?.devReveal?.count { it == "vp" } ?: 0,
)

/** The players in finishing order: the winner first, then by points, then by cities, then by cards collected (the same order as the web game). */
fun GameState.finishingOrder(): List<Int> = players.indices.sortedWith(
    compareByDescending<Int> { it == winner }.thenByDescending { players[it].vp }.thenByDescending { breakdown(it).cities }.thenByDescending { players[it].stats.collected },
)

/** One thing a player stood out for ("Biggest harvest", "Road builder"...). */
data class Highlight(val emoji: String, val title: String, val names: List<String>, val text: String)

private fun plural(n: Int, word: String, many: String = word + "s") = "$n ${if (n == 1) word else many}"

/** Who stood out in the game, as on the web: the top player (or players, on a tie) in a handful of categories, and how close the finish was. A category nobody scored in is left out. */
fun gameHighlights(g: GameState): List<Highlight> {
    val ps = g.players
    fun top(emoji: String, title: String, value: (PlayerView) -> Int, say: (Int) -> String): Highlight? {
        val vals = ps.map(value); val best = vals.maxOrNull() ?: return null
        if (best <= 0) return null
        return Highlight(emoji, title, ps.filterIndexed { i, _ -> vals[i] == best }.map { it.name }, say(best))
    }
    val out = listOfNotNull(
        top("🌾", "Biggest harvest", { it.stats.collected }) { "$it cards collected" },
        top("🤝", "Busiest trader", { it.stats.bankTrades + it.stats.playerTrades }) { plural(it, "trade") },
        top("🗡️", "Boldest thief", { it.stats.stolen }) { "stole ${plural(it, "card")}" },
        top("🎯", "Robber magnet", { it.stats.robberOn }) { "the robber sat on them ${plural(it, "time")}" },
        top("🎲", "Lucky sevens", { it.stats.sevens }) { "rolled ${plural(it, "seven")}" },
        top("🛡️", "Knight commander", { it.knights }) { "${plural(it, "knight")} played" },
        top("🛣️", "Road builder", { 15 - it.pieces.road }) { "${plural(it, "road")} built" },
        top("🃏", "Card collector", { it.stats.devBought }) { "bought ${plural(it, "development card")}" },
    ).toMutableList()
    val pts = ps.map { it.vp }.sortedDescending()
    val w = ps.getOrNull(g.winner ?: -1)
    if (pts.size > 1 && w != null) {
        val m = pts[0] - pts[1]
        out.add(0, Highlight("🏆", if (m <= 1) "Photo finish" else "Final margin", listOf(w.name), if (m == 0) "won on the tiebreak" else "won by ${plural(m, "point")}"))
    }
    return out.take(7)
}

/** A confetti-free bit of sparkle: a few gold stars that twinkle around the trophy. */
@Composable
private fun Sparkles(modifier: Modifier = Modifier) {
    val t by rememberClock()
    Canvas(modifier) {
        for (i in 0 until 9) {
            val ang = i * 0.7f + t * 0.4f
            val r = size.minDimension * (0.34f + 0.14f * ((i * 5) % 3))
            val c = Offset(size.width / 2 + r * kotlin.math.cos(ang), size.height / 2 + r * sin(ang))
            val a = (0.5f + 0.5f * sin(t * 3f + i)).coerceIn(0f, 1f)
            drawCircle(Color(0xFFFFE27A).copy(alpha = 0.8f * a), 3.5f + 3f * a, c)
        }
    }
}

/** A number that counts up to its value, so the score "ticks in". */
@Composable
private fun CountUp(to: Int, delayMs: Long, style: TextStyle, modifier: Modifier = Modifier) {
    val animate = LocalAnimate.current
    var shown by remember { mutableIntStateOf(if (animate) 0 else to) }
    LaunchedEffect(to) { if (animate) { delay(delayMs); val steps = to.coerceAtLeast(1); for (i in 1..to) { shown = i; delay(450L / steps) } } }
    Text("$shown", modifier, style = style)
}

private val MEDAL = listOf(Color(0xFFFFD23F), Color(0xFFD5DCE6), Color(0xFFD9955A))

@Composable
private fun Avatar(p: PlayerView, size: androidx.compose.ui.unit.Dp) {
    val c = Color(parseColor(p.color))
    Box(Modifier.size(size).clip(CircleShape).background(c).border(2.dp, Color.White.copy(alpha = 0.9f), CircleShape), contentAlignment = Alignment.Center) {
        if (p.bot != null) Text("🤖", fontSize = (size.value * 0.5f).sp) else Text(p.name.firstOrNull()?.uppercase() ?: "?", fontWeight = FontWeight.ExtraBold, color = Color.White, fontSize = (size.value * 0.46f).sp)
    }
}

/** The podium: the first three on blocks that rise one after another, the winner in the middle and tallest, with a crown. */
@Composable
private fun Podium(g: GameState, order: List<Int>) {
    val animate = LocalAnimate.current
    val top = order.take(3)
    // the stage shows the second place on the left, the winner in the middle and the third on the right
    val slots = listOfNotNull(top.getOrNull(1)?.let { 1 to it }, top.getOrNull(0)?.let { 0 to it }, top.getOrNull(2)?.let { 2 to it })
    val maxVp = (g.players.maxOfOrNull { it.vp } ?: 1).coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().height(190.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
        slots.forEach { (rank, seat) ->
            val p = g.players[seat]
            val rise = remember { Animatable(if (animate) 0f else 1f) }
            LaunchedEffect(Unit) { if (animate) { delay(500L + (2 - rank) * 350L); rise.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessLow)) } }
            val frac = (0.38f + 0.62f * p.vp.toFloat() / maxVp) * (if (rank == 0) 1f else 0.9f)
            val color = Color(parseColor(p.color))
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Box { Avatar(p, if (rank == 0) 52.dp else 42.dp); if (rank == 0) Text("👑", fontSize = 22.sp, modifier = Modifier.align(Alignment.TopCenter).graphicsLayer { translationY = -22.dp.toPx() }) }
                Text(p.name + if (seat == g.you) " (you)" else "", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(top = 2.dp))
                Box(
                    Modifier.fillMaxWidth().height((110.dp * frac) * rise.value).clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                        .background(Brush.verticalGradient(listOf(color.copy(alpha = 0.95f), color.copy(alpha = 0.55f)))).border(1.5.dp, MEDAL[rank].copy(alpha = 0.9f), RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 4.dp)) {
                        Text("${rank + 1}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MEDAL[rank])
                        Text("${p.vp} pts", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun Chip(text: String, color: Color = Gold) {
    Text(text, Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.16f)).border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color)
}

/** One player's line in the final standings: medal, avatar, name, what the points are made of, what they did, and the score counting up. */
@Composable
private fun StandingRow(g: GameState, rank: Int, seat: Int, index: Int) {
    val p = g.players[seat]; val b = g.breakdown(seat); val s = p.stats
    val color = Color(parseColor(p.color)); val champ = seat == g.winner
    Appear(index + 3) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (champ) Color(0xFF2B2A12) else NavyDark).border(if (champ) 2.dp else 0.dp, if (champ) Gold else Color.Transparent, RoundedCornerShape(16.dp)).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.size(30.dp).clip(CircleShape).background(MEDAL.getOrNull(rank) ?: Color.White.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                Text("${rank + 1}", fontWeight = FontWeight.ExtraBold, color = if (rank < 3) Color(0xFF2A1B00) else Foam)
            }
            Avatar(p, 38.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(p.name + if (seat == g.you) " (you)" else "", fontWeight = FontWeight.ExtraBold, maxLines = 1, color = if (champ) Gold else Foam)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (b.settlements > 0) Chip("🏠 ${b.settlements} +${b.settlements}")
                    if (b.cities > 0) Chip("🏰 ${b.cities} +${b.cities * 2}")
                    if (b.longestRoad) Chip("🛣️ Longest Road +2")
                    if (b.largestArmy) Chip("🛡️ Largest Army +2")
                    if (b.hiddenVp > 0) Chip("⭐ ${b.hiddenVp} hidden +${b.hiddenVp}")
                }
                Text("🌾 ${s.collected} harvested · 🗡️ ${s.stolen} stolen · 🤝 ${s.bankTrades + s.playerTrades} trades · 🛡️ ${p.knights} knights · 🃏 ${s.devBought} dev", fontSize = 10.sp, color = FoamDim)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CountUp(p.vp, 900L + index * 150L, TextStyle(fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = if (champ) Gold else Foam))
                Text("pts", fontSize = 10.sp, color = FoamDim)
            }
        }
    }
}

/** How often each dice total came up (bars), against what fair dice would give (dots). */
@Composable
private fun DiceChart(counts: List<Int>) {
    val rolls = counts.drop(2).sum().coerceAtLeast(1); val max = (counts.drop(2).maxOrNull() ?: 1).coerceAtLeast(1)
    val animateIt = LocalAnimate.current
    val grow = remember { Animatable(if (animateIt) 0f else 1f) }
    LaunchedEffect(Unit) { if (grow.value < 1f) { delay(700); grow.animateTo(1f, tween(900, easing = FastOutSlowInEasing)) } }
    val measurer = androidx.compose.ui.text.rememberTextMeasurer()
    Canvas(Modifier.fillMaxWidth().height(150.dp).semantics { contentDescription = "Dice rolls this game: " + (2..12).joinToString(", ") { "$it rolled ${counts.getOrElse(it) { 0 }} times" } }) {
        val bw = size.width / 11f; val chartH = size.height - 18.dp.toPx() - 18.dp.toPx()   // room under the bars for the baseline and above them for the count
        for (n in 2..12) {
            val c = counts.getOrElse(n) { 0 }; val x = (n - 2) * bw
            val h = c.toFloat() / max * chartH * grow.value
            val exp = (6 - kotlin.math.abs(7 - n)) / 36f * rolls / max * chartH
            val col = when (n) { 7 -> Color(0xFFE0664F); 6, 8 -> Color(0xFFF0CD78); else -> Color(0xFF7FB3C2) }
            drawRoundRect(col, Offset(x + 4f, size.height - 18.dp.toPx() - h), Size(bw - 8f, h), androidx.compose.ui.geometry.CornerRadius(5f))
            drawCircle(Color.White.copy(alpha = 0.75f), 3.2f, Offset(x + bw / 2, size.height - 18.dp.toPx() - exp))
            // how many times this number fell, on top of its bar
            val label = measurer.measure("$c", TextStyle(fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Color.White))
            drawText(label, topLeft = Offset(x + bw / 2 - label.size.width / 2f, size.height - 18.dp.toPx() - h - label.size.height - 2f))
        }
    }
    Row(Modifier.fillMaxWidth()) { for (n in 2..12) Text("$n", Modifier.weight(1f), textAlign = TextAlign.Center, fontSize = 10.sp, color = FoamDim) }
}

/**
 * The end of the game, full screen: the trophy drops in and the winner is crowned, the podium rises, every player's points are broken down (and count up),
 * highlights say who stood out, and the dice of the whole game are charted. Confetti falls for the winner. Buttons: play again, look at the board, leave.
 */
@Composable
fun GameOverScreen(
    game: GameState, spectating: Boolean, recordGames: Int, recordWins: Int,
    onAgain: () -> Unit, onLeave: () -> Unit, onViewBoard: () -> Unit,
) {
    val order = remember(game) { game.finishingOrder() }
    val winner = game.players.getOrNull(game.winner ?: -1)
    val iWon = !spectating && game.winner == game.you
    val animate = LocalAnimate.current
    val drop = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(Unit) { if (animate) drop.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessLow)) }
    val glow by rememberClock()
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF14295C), Color(0xFF0A1A3F), Color(0xFF060F26)))).safeDrawingPadding()) {
        if (animate && winner != null) Confetti(Modifier.fillMaxSize())
        Column(Modifier.fillMaxSize()) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                // the trophy and who won
                Box(Modifier.size(150.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) { drawCircle(Brush.radialGradient(listOf(Color(0xFFFFD23F).copy(alpha = 0.35f + 0.1f * sin(glow * 2f)), Color.Transparent), center, size.minDimension / 2f), size.minDimension / 2f) }
                    if (animate) Sparkles(Modifier.fillMaxSize())
                    Text("🏆", fontSize = 82.sp, modifier = Modifier.graphicsLayer { translationY = (1f - drop.value) * -260.dp.toPx(); scaleX = 0.6f + 0.4f * drop.value; scaleY = 0.6f + 0.4f * drop.value; rotationZ = (1f - drop.value) * 25f })
                }
                Appear(0) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "${winner?.name ?: "Someone"} wins!", fontSize = 34.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
                            style = TextStyle(brush = Brush.verticalGradient(listOf(Color(0xFFFFF1A6), Color(0xFFFFC72E), Color(0xFFE08A00)))),
                        )
                        Text(
                            when { iWon -> "Your island, your victory."; winner?.bot != null -> "The bot takes it this time. Rematch?"; spectating -> "You watched this game."; else -> "Well played. Rematch?" },
                            fontSize = 14.sp, color = Foam, textAlign = TextAlign.Center,
                        )
                        Text("${plural(game.turnNumber, "turn")} on ${game.mapName} · first to ${game.vpTarget} points", fontSize = 12.sp, color = FoamDim, modifier = Modifier.padding(top = 2.dp))
                    }
                }
                Appear(1) { Podium(game, order) }
                Appear(2) { Text("Final standings", fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 16.sp, modifier = Modifier.fillMaxWidth()) }
                order.forEachIndexed { r, seat -> StandingRow(game, r, seat, r) }

                val highlights = remember(game) { gameHighlights(game) }
                if (highlights.isNotEmpty()) {
                    Appear(order.size + 3) { Text("Highlights", fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 16.sp, modifier = Modifier.fillMaxWidth()) }
                    highlights.forEachIndexed { i, h ->
                        Appear(order.size + 4 + i) {
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(NavyDark).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) { Text(h.emoji, fontSize = 20.sp) }
                                Column { Text(h.title, fontWeight = FontWeight.Bold, fontSize = 13.sp); Text("${h.names.joinToString(" & ")} · ${h.text}", fontSize = 11.sp, color = FoamDim) }
                            }
                        }
                    }
                }
                if (game.diceCounts.drop(2).sum() > 0) {
                    Appear(order.size + 12) {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(NavyDark).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Dice this game", fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 14.sp)
                            DiceChart(game.diceCounts)
                            Text("Bars show how often each number came up; dots show what fair dice would average.", fontSize = 10.sp, color = FoamDim)
                        }
                    }
                }
                if (!spectating) Text("🏆 Your record on this device: ${plural(recordWins, "win")} in ${plural(recordGames, "game")}.", fontSize = 12.sp, color = FoamDim, textAlign = TextAlign.Center)
            }
            // the buttons stay at the bottom
            Row(Modifier.fillMaxWidth().background(Color(0xFF060F26)).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassButton(onClick = onViewBoard, modifier = Modifier.weight(1f)) { Text("View board", fontSize = 13.sp) }
                GlassButton(onClick = onLeave, modifier = Modifier.weight(1f)) { Text("Leave", fontSize = 13.sp) }
                if (!spectating) GoldButton(onClick = onAgain, modifier = Modifier.weight(1.4f)) { Text("Play again", fontWeight = FontWeight.ExtraBold) }
            }
        }
    }
}
