package com.hexlands.app.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.UiState
import com.hexlands.app.net.GameState
import com.hexlands.app.net.Legal
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.RESOURCE_LABEL
import com.hexlands.app.net.canAfford
import com.hexlands.app.net.hand
import com.hexlands.app.net.isMyTurn
import com.hexlands.app.net.parseColor
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put

val COST_ROAD = mapOf("wood" to 1, "brick" to 1)
val COST_SETTLEMENT = mapOf("wood" to 1, "brick" to 1, "sheep" to 1, "wheat" to 1)
val COST_CITY = mapOf("wheat" to 2, "ore" to 3)
val COST_DEV = mapOf("sheep" to 1, "wheat" to 1, "ore" to 1)

/** What to say at the top: whose move it is and what to do. */
fun bannerText(g: GameState): String {
    val cur = g.players.getOrNull(g.turn)?.name ?: ""
    val mine = g.isMyTurn()
    if (g.phase == "ended") return "${g.players.getOrNull(g.winner ?: -1)?.name ?: "Someone"} wins!"
    if (g.phase == "setup") {
        val s = g.setup
        return if (mine) {
            if (s?.expect == "settlement") "Place your ${if (s.round == 1) "first" else "second"} settlement on a glowing corner" else "Place a road next to that settlement"
        } else "$cur is placing a ${s?.expect ?: "piece"}"
    }
    return when (g.subphase) {
        "discard" -> { val n = g.pendingDiscards[g.you.toString()] ?: 0; if (n > 0) "A seven! Discard $n cards" else "A seven! Waiting for players to discard" }
        "robber" -> if (mine) "Move the robber: tap a ringed hex" else "$cur is moving the robber"
        "roadBuilding" -> if (mine) "Place ${g.freeRoads} free road${if (g.freeRoads == 1) "" else "s"}" else "$cur is placing free roads"
        "diamond" -> { val n = g.pendingDiamond[g.you.toString()] ?: 0; if (n > 0) "The diamond opens! Choose $n cards from the bank" else "The diamond opens: players are choosing their cards" }
        else -> if (mine) (if (!g.rolled) "Your turn: roll the dice" else "Build, trade, or end your turn") else "$cur's turn"
    }
}

fun resText(m: Map<String, Int>): String = RESOURCES.filter { (m[it] ?: 0) > 0 }.joinToString(", ") { "${m[it]} ${RESOURCE_LABEL[it]}" }.ifEmpty { "nothing" }

private fun needsMe(g: GameState): Boolean =
    g.phase != "ended" && g.you >= 0 && ((g.turn == g.you && (g.phase == "setup" || g.phase == "main")) ||
        (g.pendingDiscards[g.you.toString()] ?: 0) > 0 || (g.pendingDiamond[g.you.toString()] ?: 0) > 0)

private fun buzz(context: Context) {
    val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 90, 60, 90), -1))
    else @Suppress("DEPRECATION") v.vibrate(longArrayOf(0, 90, 60, 90), -1)
}

private sealed interface GameDialog {
    data class Steal(val tile: Int, val victims: List<Pair<Int, String>>) : GameDialog
    data class Bank(val give: String?) : GameDialog
    data object Dev : GameDialog
    data class Pick(val card: String) : GameDialog   // monopoly | yearOfPlenty
    data object Log : GameDialog
    data object Info : GameDialog
}

@Composable
fun GameScreen(ui: UiState, game: GameState, vm: GameViewModel, animate: Boolean = true) {
    val board = ui.board
    val context = LocalContext.current
    val spectating = game.spectator || ui.session?.spectator == true
    val myTurn = game.isMyTurn()
    val legal = game.legal ?: Legal()
    var picked by remember { mutableStateOf<Tap?>(null) }
    var dialog by remember { mutableStateOf<GameDialog?>(null) }
    var showResults by remember { mutableStateOf(true) }
    var heistMode by remember { mutableStateOf(false) }   // choosing an opponent's settlement to steal

    // A buzz when it becomes your move.
    val needs = needsMe(game)
    var wasNeeded by remember { mutableStateOf(false) }
    LaunchedEffect(needs) {
        if (needs && !wasNeeded && vm.prefs.vibrate) buzz(context)
        wasNeeded = needs
    }

    val heistTargets = game.buildings.filter { (_, b) -> b.p != game.you && b.type == "settlement" }.keys.mapNotNull { it.toIntOrNull() }.toSet()
    LaunchedEffect(myTurn, game.subphase) { if (!myTurn || game.subphase != null) heistMode = false }
    val cornerSpots = if (heistMode) heistTargets else (legal.settlements + legal.cities).toSet()
    val roadSpots = if (heistMode) emptySet() else legal.roads.toSet()
    val hexSpots = if (game.subphase == "robber" && myTurn) (game.robberOptions ?: emptyList()).toSet() else emptySet()
    val pickedNow = picked?.takeIf { (it is Tap.Corner && it.id in cornerSpots) || (it is Tap.Road && it.id in roadSpots) }

    fun onTap(t: Tap) {
        when (t) {
            is Tap.Hex -> {
                val b = board ?: return
                val victims = b.tiles[t.id].vertices.mapNotNull { game.buildings[it.toString()] }.map { it.p }.filter { it != game.you }.distinct()
                if (victims.size >= 2) dialog = GameDialog.Steal(t.id, victims.map { it to (game.players.getOrNull(it)?.name ?: "?") })
                else vm.act("robber") { put("tile", t.id) }
            }
            else -> picked = if (picked == t) null else t
        }
    }

    Column(Modifier.fillMaxSize()) {
        PlayersStrip(game)
        Text(
            (if (heistMode) "Heist: tap an opponent's settlement to steal it" else bannerText(game)) + if (ui.reconnecting) "  ·  Reconnecting…" else "",
            Modifier.fillMaxWidth().background(NavyDark).padding(horizontal = 12.dp, vertical = 6.dp),
            color = Gold, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        )

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (board == null) Text("Loading the board…", Modifier.align(Alignment.Center))
            else BoardCanvas(board, game, cornerSpots, roadSpots, hexSpots, pickedNow, ::onTap, animate = animate)
            game.dice?.let { d ->
                if (d.size == 2) Text(
                    "Dice  ${d[0]} + ${d[1]} = ${d[0] + d[1]}",
                    Modifier.align(Alignment.BottomStart).padding(8.dp).background(NavyDark.copy(alpha = 0.85f), RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        // Another player's trade offer to you.
        val t = game.trade
        if (t != null && t.from != game.you && !spectating) {
            Card(colors = CardDefaults.cardColors(containerColor = NavyLight), modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${game.players.getOrNull(t.from)?.name ?: "A player"} offers a trade", fontWeight = FontWeight.Bold)
                    Text("You get ${resText(t.give)}.  You give ${resText(t.get)}.")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { vm.act("respond") { put("accept", true) } }, enabled = game.canAfford(t.get)) { Text(if (game.canAfford(t.get)) "Accept" else "Not enough cards") }
                        OutlinedButton(onClick = { vm.act("respond") { put("accept", false) } }) { Text("Decline") }
                    }
                }
            }
        }

        if (heistMode && pickedNow == null) {
            Row(Modifier.fillMaxWidth().background(NavyDark).padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (heistTargets.isEmpty()) "No opponent has a settlement to steal." else "Tap one of the glowing settlements.", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                OutlinedButton(onClick = { heistMode = false }) { Text("Cancel") }
            }
        }
        // Confirm the spot you tapped.
        if (pickedNow != null) {
            val what = when {
                heistMode -> "heist"
                pickedNow is Tap.Road -> "road"
                pickedNow is Tap.Corner && pickedNow.id in legal.cities -> "city"
                else -> "settlement"
            }
            Row(Modifier.fillMaxWidth().background(NavyDark).padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (what == "heist") "Steal this settlement?" else "Build a $what here?", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                OutlinedButton(onClick = { picked = null }) { Text("Cancel") }
                Button(onClick = {
                    val p = pickedNow
                    picked = null
                    when (p) {
                        is Tap.Corner -> if (what == "heist") { heistMode = false; vm.act("playDev") { put("card", "heist"); put("vertex", p.id) } } else vm.act(if (what == "city") "city" else "settle") { put("vertex", p.id) }
                        is Tap.Road -> vm.act("road") { put("edge", p.id) }
                        else -> {}
                    }
                }) { Text(if (what == "heist") "Steal" else "Build") }
            }
        }

        if (spectating) {
            Row(Modifier.fillMaxWidth().background(NavyDark).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("You are watching. You see what every player sees.", Modifier.weight(1f), fontSize = 13.sp, color = FoamDim)
                OutlinedButton(onClick = { dialog = GameDialog.Log }) { Text("Log") }
                OutlinedButton(onClick = { vm.leave() }) { Text("Stop") }
            }
        } else {
            HandRow(game) { dialog = GameDialog.Bank(it) }
            ActionRow(game, myTurn, vm, onBank = { dialog = GameDialog.Bank(null) }, onDev = { dialog = GameDialog.Dev }, onLog = { dialog = GameDialog.Log }, onInfo = { dialog = GameDialog.Info })
        }
    }

    // ---------- windows ----------
    if (!spectating && game.subphase == "discard" && (game.pendingDiscards[game.you.toString()] ?: 0) > 0) {
        DiscardDialog(game) { res -> vm.act("discard") { put("res", kotlinx.serialization.json.buildJsonObject { res.forEach { (k, n) -> if (n > 0) put(k, n) } }) } }
    }
    if (!spectating && game.subphase == "diamond" && (game.pendingDiamond[game.you.toString()] ?: 0) > 0) {
        DiamondDialog(game) { picks -> vm.act("diamond") { put("res", buildJsonArray { picks.forEach { add(it) } }) } }
    }
    when (val d = dialog) {
        is GameDialog.Steal -> StealDialog(d.victims, onClose = { dialog = null }) { v -> dialog = null; vm.act("robber") { put("tile", d.tile); put("victim", v) } }
        is GameDialog.Bank -> BankDialog(game, d.give, onClose = { dialog = null }) { give, get, times -> dialog = null; vm.bankTrade(give, get, times) }
        is GameDialog.Dev -> DevDialog(game, hasHeistTargets = heistTargets.isNotEmpty(), onClose = { dialog = null }, onBuyHeist = { dialog = null; vm.act("buyHeist") }) { card ->
            dialog = null
            when (card) {
                "heist" -> { heistMode = true; picked = null }
                "monopoly", "yearOfPlenty" -> dialog = GameDialog.Pick(card)
                else -> vm.act("playDev") { put("card", card) }
            }
        }
        is GameDialog.Pick -> PickResourcesDialog(
            title = if (d.card == "monopoly") "Monopoly: pick a resource" else "Year of Plenty: pick two resources", count = if (d.card == "monopoly") 1 else 2,
            onClose = { dialog = null },
        ) { picks ->
            dialog = null
            vm.act("playDev") {
                put("card", d.card)
                if (d.card == "monopoly") put("res", picks[0]) else put("res", buildJsonArray { picks.forEach { add(it) } })
            }
        }
        is GameDialog.Log -> LogDialog(game) { dialog = null }
        is GameDialog.Info -> InfoDialog(game) { dialog = null }
        null -> {}
    }
    if (game.phase == "ended" && showResults) {
        ResultsDialog(game, spectating, onAgain = { vm.act("rematch") }, onLeave = { vm.leave() }, onClose = { showResults = false })
    }
    LaunchedEffect(game.phase) { if (game.phase == "ended") showResults = true }
}

@Composable
private fun PlayersStrip(game: GameState) {
    Row(Modifier.fillMaxWidth().background(NavyDark).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        game.players.forEachIndexed { i, p ->
            val color = Color(parseColor(p.color))
            val turn = game.turn == i && game.phase != "ended"
            val left = game.vpTarget - p.vp
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(NavyLight)
                    .border(if (turn) 2.dp else 0.dp, if (turn) Gold else Color.Transparent, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp, vertical = 4.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(color))
                    Text(p.name + if (i == game.you) " (you)" else "", Modifier.padding(start = 4.dp).weight(1f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                    Text("${p.vp}", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = if (left in 1..2) Gold else Foam)
                }
                Text("${p.cards} cards · ${p.devCount} dev", fontSize = 10.sp, color = FoamDim, maxLines = 1)
                Text("⚔ ${p.knights}  road ${p.roadLen}", fontSize = 10.sp, color = if (game.largestArmy?.p == i || game.longestRoad?.p == i) Gold else FoamDim, maxLines = 1)
                LinearProgressIndicator(
                    progress = { (p.vp.toFloat() / game.vpTarget).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(4.dp).padding(top = 1.dp),
                    color = if (left in 1..2) Gold else color, trackColor = Color.White.copy(alpha = 0.15f),
                )
            }
        }
    }
}

@Composable
private fun HandRow(game: GameState, onTapResource: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().background(NavyDark).padding(horizontal = 6.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        RESOURCES.forEach { k ->
            val n = game.hand(k)
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background((RESOURCE_COLOR[k] ?: Color.Gray).copy(alpha = if (n > 0) 1f else 0.35f))
                    .clickable { onTapResource(k) }.padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("$n", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black.copy(alpha = 0.85f))
                Text(RESOURCE_LABEL[k] ?: k, fontSize = 11.sp, color = Color.Black.copy(alpha = 0.8f))
            }
        }
    }
}

@Composable
private fun ActionRow(game: GameState, myTurn: Boolean, vm: GameViewModel, onBank: () -> Unit, onDev: () -> Unit, onLog: () -> Unit, onInfo: () -> Unit) {
    val free = game.phase == "main" && myTurn && game.subphase == null
    val devCards = game.me?.dev?.size ?: 0
    Row(
        Modifier.fillMaxWidth().background(NavyDark).horizontalScroll(rememberScrollState()).padding(horizontal = 6.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        if (free && !game.rolled) Button(onClick = { vm.act("roll") }, modifier = Modifier.height(48.dp)) { Text("Roll dice", fontWeight = FontWeight.Bold) }
        if (free && game.rolled) Button(onClick = { vm.act("endTurn") }, modifier = Modifier.height(48.dp)) { Text("End turn", fontWeight = FontWeight.Bold) }
        if (game.undo != null) OutlinedButton(onClick = { vm.act("undo") }) { Text("↶ Undo (${game.undo.left})") }
        OutlinedButton(onClick = onBank, enabled = free && game.rolled) { Text("Bank trade") }
        OutlinedButton(onClick = { vm.act("buyDev") }, enabled = free && game.rolled && game.devLeft > 0 && game.canAfford(COST_DEV)) { Text("Buy card") }
        OutlinedButton(onClick = onDev) { Text("Cards ($devCards)") }
        OutlinedButton(onClick = onLog) { Text("Log") }
        OutlinedButton(onClick = onInfo) { Text("Info") }
        TextButton(onClick = { vm.leave() }) { Text("Leave") }
    }
}
