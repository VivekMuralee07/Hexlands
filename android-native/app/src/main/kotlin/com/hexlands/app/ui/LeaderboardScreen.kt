package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.UiState
import com.hexlands.app.net.LbBots
import com.hexlands.app.net.LbReply
import com.hexlands.app.net.LbRow
import com.hexlands.app.net.RecentGame

private val MODES = listOf("ranked" to "Ranked", "multi" to "Multiplayer", "all" to "All games")
private val ABOUT = mapOf(
    "ranked" to "Public games with at least two different people. The same group counts three times a day at most.",
    "multi" to "Every game with two or more people, public or private.",
    "all" to "Every game, against bots too.",
)
private val PERIODS = listOf("all" to "All time", "30" to "30 days", "7" to "7 days")
private val SORTS = listOf("wins" to "Most wins", "rate" to "Win rate", "vp" to "Average points")
private val SORT_LABEL = mapOf("wins" to "Wins", "rate" to "Win rate", "vp" to "Average points")
private val LEVEL = mapOf("easy" to "Easy", "medium" to "Medium", "hard" to "Hard")

private val Gold1 = Color(0xFFFFD23F); private val Silver = Color(0xFFD5DCE6); private val Bronze = Color(0xFFD9955A)

fun timeAgo(nowMs: Long, then: Long): String {
    val m = maxOf(0L, (nowMs - then) / 60000)
    if (m < 2) return "just now"
    if (m < 60) return "$m min ago"
    val h = (m + 30) / 60
    if (h < 24) return "$h h ago"
    val d = (h + 12) / 24
    return if (d == 1L) "yesterday" else "$d days ago"
}

/** A coloured circle with the player's first letter; the colour comes from the name, so a player always looks the same. */
@Composable
private fun Avatar(name: String, size: Dp = 38.dp) {
    var h = 0; for (ch in name.lowercase()) h = (h * 31 + ch.code) % 360
    Box(Modifier.size(size).clip(CircleShape).background(Color.hsv(h.toFloat(), 0.55f, 0.7f)), contentAlignment = Alignment.Center) {
        Text(name.firstOrNull()?.uppercase() ?: "?", fontWeight = FontWeight.ExtraBold, color = Color.White, fontSize = (size.value * 0.45f).sp)
    }
}

/** The win rate as a ring with the percentage in the middle. */
@Composable
private fun Donut(pct: Int, size: Dp = 56.dp) {
    Box(Modifier.size(size).semantics { contentDescription = "Win rate $pct percent" }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val w = size.toPx() * 0.12f
            drawArc(Color.White.copy(alpha = 0.15f), 0f, 360f, false, Offset(w / 2, w / 2), Size(this.size.width - w, this.size.height - w), style = Stroke(w))
            drawArc(Gold1, -90f, 360f * pct / 100f, false, Offset(w / 2, w / 2), Size(this.size.width - w, this.size.height - w), style = Stroke(w, cap = StrokeCap.Round))
        }
        Text("$pct%", fontWeight = FontWeight.ExtraBold, fontSize = (size.value * 0.27f).sp)
    }
}

/** The last five results, the oldest on the left: green won, red lost, grey not played yet. */
@Composable
private fun Form(form: List<Int>) {
    val words = if (form.isEmpty()) "no games yet" else form.joinToString(", ") { if (it == 1) "won" else "lost" }
    Row(Modifier.semantics { contentDescription = "Last games, newest first: $words" }, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (j in 0 until 5) {
            val x = form.getOrNull(4 - j)
            Box(Modifier.size(width = 14.dp, height = 8.dp).clip(RoundedCornerShape(3.dp)).background(when (x) { 1 -> Good; 0 -> Bad; else -> Color.White.copy(alpha = 0.18f) }))
        }
    }
}

@Composable
private fun WinBar(pct: Int, modifier: Modifier = Modifier) {
    Box(modifier.height(6.dp).clip(RoundedCornerShape(3.dp)).background(Color.White.copy(alpha = 0.15f))) {
        Box(Modifier.fillMaxWidth(pct / 100f).height(6.dp).background(Gold1))
    }
}

@Composable
private fun Tile(value: String, label: String, modifier: Modifier = Modifier, small: Boolean = false) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.08f)).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.ExtraBold, fontSize = if (small) 13.sp else 20.sp, textAlign = TextAlign.Center)
        Text(label, fontSize = 10.sp, color = FoamDim, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Detail(r: LbRow, now: Long) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.08f)).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) { Donut(r.winRate, 48.dp); Text("Win rate", fontSize = 10.sp, color = FoamDim) }
            Tile("${r.avgVp}", "Average points", Modifier.weight(1f))
            Tile("${r.bestVp}", "Best game", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Tile((if (r.streak > 0) "🔥 " else "") + r.streak, "Win streak", Modifier.weight(1f))
            Tile(r.favMap.ifEmpty { "–" }, "Favourite map", Modifier.weight(1f), small = true)
            Tile(timeAgo(now, r.lastPlayed), "Last played", Modifier.weight(1f), small = true)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Text("Last 5 games", fontSize = 12.sp, color = FoamDim); Form(r.form) }
    }
}

@Composable
private fun PlayerRow(r: LbRow, sort: String, now: Long) {
    var open by remember { mutableStateOf(false) }
    val tint = when (r.rank) { 1 -> Gold1; 2 -> Silver; 3 -> Bronze; else -> null }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (r.you) NavyLight else NavyDark)
            .clickable { open = !open }.padding(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(30.dp).clip(CircleShape).background(tint ?: Color.White.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Text("${r.rank ?: "–"}", fontWeight = FontWeight.ExtraBold, color = if (tint != null) Color(0xFF2A1B00) else Foam, fontSize = 14.sp)
            }
            Avatar(r.name)
            Column(Modifier.weight(1f)) {
                Text(buildString { append(r.name); if (r.tag.isNotEmpty()) append(" #${r.tag}"); if (r.you) append(" (you)") }, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("${r.wins}W ${r.losses}L · ${r.games} played", fontSize = 11.sp, color = FoamDim)
            }
            Column(horizontalAlignment = Alignment.End, modifier = Modifier.width(96.dp)) {
                val (big, unit) = when (sort) { "rate" -> "${r.winRate}%" to "win rate"; "vp" -> "${r.avgVp}" to "avg pts"; else -> "${r.wins}" to (if (r.wins == 1) "win" else "wins") }
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) { Text(big, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Gold1); Text(unit, fontSize = 10.sp, color = FoamDim) }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    WinBar(r.winRate, Modifier.weight(1f)); if (sort != "rate") Text("${r.winRate}%", fontSize = 10.sp, color = FoamDim)
                }
            }
            Text(if (open) "▴" else "▾", color = FoamDim)
        }
        if (open) Detail(r, now)
    }
}

@Composable
private fun YourStanding(r: LbRow, total: Int) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(NavyLight).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Avatar(r.name, 46.dp)
        Column(Modifier.weight(1f)) {
            Text(r.name, fontWeight = FontWeight.ExtraBold)
            Text(if (r.rank != null) "Rank #${r.rank} of $total" else "Not ranked yet: play ${r.need} more ${if (r.need == 1) "game" else "games"}", fontSize = 12.sp, color = FoamDim)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 4.dp)) {
                Text("${r.wins} won", fontSize = 12.sp, fontWeight = FontWeight.Bold); Text("${r.games} played", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                if (r.streak > 1) Text("🔥 ${r.streak} in a row", fontSize = 12.sp, color = Gold1)
            }
            Box(Modifier.padding(top = 6.dp)) { Form(r.form) }
        }
        Donut(r.winRate)
    }
}

@Composable
private fun BotsSection(b: LbBots) {
    val share = if (b.games > 0) Math.round(100f * b.botWins / b.games) else 0
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Bots", fontWeight = FontWeight.ExtraBold, color = Gold1, fontSize = 16.sp)
        Text(if (b.games > 0) "Bots won ${b.botWins} of the ${b.games} games they played in ($share%)." else "No finished games with bots yet. Bot results count from games that finish after this update.", fontSize = 12.sp, color = FoamDim)
        b.levels.forEach { l ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(NavyDark).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) { Text("🤖") }
                Column(Modifier.weight(1f)) {
                    Text("${LEVEL[l.level] ?: l.level} bots", fontWeight = FontWeight.Bold)
                    Text(if (l.games > 0) "${l.wins}W ${l.losses}L · ${l.games} played · avg ${l.avgVp} pts · best ${l.bestVp}" else "no games yet", fontSize = 11.sp, color = FoamDim)
                }
                if (l.games > 0) Column(horizontalAlignment = Alignment.End, modifier = Modifier.width(80.dp)) {
                    Text("${l.winRate}%", fontWeight = FontWeight.ExtraBold, color = Gold1); WinBar(l.winRate)
                }
            }
        }
        Text("Win rate is wins out of bot seats played. With four players everyone wins about 25% by chance.", fontSize = 11.sp, color = FoamDim)
    }
}

/** What the leaderboard answered: totals, your standing, the ranked list, and (for All games) how the bots do. */
@Composable
fun LeaderboardBody(r: LbReply, now: Long, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!r.enabled) { Text("The leaderboard is not switched on for this server yet.", color = FoamDim); return }
        r.error?.let { Text(it, color = FoamDim); return }
        val you = r.rows.firstOrNull { it.you } ?: r.me
        r.summary?.takeIf { it.games > 0 }?.let { sm ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Tile("${sm.games}", "games played", Modifier.weight(1f)); Tile("${sm.players}", if (sm.players == 1) "player ranked" else "players ranked", Modifier.weight(1f)); Tile("${sm.avgTurns}", "turns per game", Modifier.weight(1f))
            }
            if (sm.topMap.isNotEmpty()) Text("Most played map: ${sm.topMap}", fontSize = 12.sp, color = FoamDim)
        }
        you?.let { YourStanding(it, r.total) }
        if (r.rows.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("🏆", fontSize = 40.sp)
                Text("Nobody is ranked here yet", fontWeight = FontWeight.Bold)
                Text("A player appears after ${r.minGames} finished ${if (r.minGames == 1) "game" else "games"} in this list${if (r.period == "all") "" else " and period"}. Win a few and you could be first.", fontSize = 12.sp, color = FoamDim, textAlign = TextAlign.Center)
            }
        } else {
            Row(Modifier.fillMaxWidth()) { Text("Rank and player", Modifier.weight(1f), fontSize = 11.sp, color = FoamDim); Text("${SORT_LABEL[r.sort] ?: "Wins"} and win rate", fontSize = 11.sp, color = FoamDim) }
            r.rows.forEach { PlayerRow(it, r.sort, now) }
            val me = r.me
            if (me != null && me.rank != null && r.rows.none { it.you }) { Text("…", Modifier.fillMaxWidth(), textAlign = TextAlign.Center, color = FoamDim); PlayerRow(me, r.sort, now) }
        }
        r.bots?.let { BotsSection(it) }
        if (r.rows.isNotEmpty()) Text("${r.total} ${if (r.total == 1) "player" else "players"} ranked (at least ${r.minGames} games each). Tap a player for details. Your ID is stored on this device, so clearing the app data starts you from zero.", fontSize = 11.sp, color = FoamDim)
    }
}

/** The leaderboard, full screen: three lists, a period and a sort order; tap a player for details. */
@Composable
fun LeaderboardScreen(ui: UiState, vm: GameViewModel, onBack: () -> Unit, onRecent: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadLeaderboard() }
    val now = remember(ui.lb) { System.currentTimeMillis() }
    Column(Modifier.fillMaxSize().background(Navy).safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Back", fontWeight = FontWeight.Bold) }
            Text("Leaderboard", Modifier.weight(1f), fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Gold1, textAlign = TextAlign.Center)
            TextButton(onClick = onRecent) { Text("My games") }
        }
        TabRow(selectedTabIndex = MODES.indexOfFirst { it.first == ui.lbMode }.coerceAtLeast(0), containerColor = Color.Transparent) {
            MODES.forEach { (k, label) -> Tab(selected = ui.lbMode == k, onClick = { vm.loadLeaderboard(mode = k) }, text = { Text(label, fontSize = 13.sp) }) }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(ABOUT[ui.lbMode] ?: "", fontSize = 12.sp, color = FoamDim)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { PERIODS.forEach { (k, l) -> FilterChip(selected = ui.lbPeriod == k, onClick = { vm.loadLeaderboard(period = k) }, label = { Text(l, fontSize = 12.sp) }) } }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { SORTS.forEach { (k, l) -> FilterChip(selected = ui.lbSort == k, onClick = { vm.loadLeaderboard(sort = k) }, label = { Text(l, fontSize = 12.sp) }) } }
            when {
                ui.lbError != null -> Text(ui.lbError, color = FoamDim)
                ui.lb == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold1) }
                else -> LeaderboardBody(ui.lb, now, Modifier.then(if (ui.lbLoading) Modifier.background(Color.Transparent) else Modifier))
            }
        }
    }
}

@Composable
private fun RecentRow(g: RecentGame, now: Long) {
    val who = when {
        g.won -> "You won"
        g.left -> "You left"
        g.winner != null -> "${if (g.winner.bot != null) (LEVEL[g.winner.bot] ?: "") + " bot" else g.winner.name} won with ${g.winner.vp}"
        else -> "Finished"
    }
    val others = when { g.humans > 1 -> "${g.humans} players"; g.seats > 1 -> "vs bots"; else -> "solo" }
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (g.won) NavyLight else NavyDark).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(if (g.won) Good else Color.White.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) { Text(if (g.won) "★" else "·", fontWeight = FontWeight.ExtraBold, color = if (g.won) Color(0xFF053B1A) else Foam) }
        Column(Modifier.weight(1f)) {
            Text(buildString { append(if (g.won) "Won" else "Lost"); append(" · ${g.vp} of ${g.target} points") }, fontWeight = FontWeight.Bold)
            Text(who, fontSize = 12.sp)
            Text("${g.map.ifEmpty { "Map" }} · ${g.turns} turns · $others${if (g.ranked) " · Ranked" else ""}", fontSize = 11.sp, color = FoamDim)
        }
        Text(timeAgo(now, g.at), fontSize = 11.sp, color = FoamDim)
    }
}

/** Your last ten finished games from this device. */
@Composable
fun RecentGamesScreen(ui: UiState, vm: GameViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadRecent() }
    val now = remember(ui.recent) { System.currentTimeMillis() }
    Column(Modifier.fillMaxSize().background(Navy).safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Leaderboard", fontWeight = FontWeight.Bold) }
            Text("My recent games", Modifier.weight(1f), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Gold1, textAlign = TextAlign.Center)
            Box(Modifier.width(88.dp))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val r = ui.recent
            when {
                ui.recentError != null -> Text(ui.recentError, color = FoamDim)
                r == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold1) }
                !r.enabled -> Text("Game history is not switched on for this server yet.", color = FoamDim)
                r.games.isEmpty() -> Text("No finished games yet. Finish a game and it shows up here.", color = FoamDim)
                else -> r.games.forEach { RecentRow(it, now) }
            }
        }
    }
}
