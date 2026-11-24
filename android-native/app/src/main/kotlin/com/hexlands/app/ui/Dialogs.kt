package com.hexlands.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.GameState
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.RESOURCE_LABEL
import com.hexlands.app.net.canAfford
import com.hexlands.app.net.cities
import com.hexlands.app.net.hand

/** A seven was rolled and you hold too many cards: choose which to give back. Cannot be dismissed; the server asks for exactly this many. */
@Composable
fun DiscardDialog(game: GameState, onSend: (Map<String, Int>) -> Unit) {
    val need = game.pendingDiscards[game.you.toString()] ?: 0
    val chosen = remember { mutableStateMapOf<String, Int>() }
    val total = chosen.values.sum()
    AlertDialog(
        onDismissRequest = {},
        title = { Text("The robber strikes!") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("You hold more than ${game.opts.discardLimit} cards. Choose $need to give back to the bank. ($total of $need)")
                RESOURCES.forEach { k ->
                    val have = game.hand(k); val n = chosen[k] ?: 0
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) { ResourceIcon(k, 28.dp); Text("  $have", fontWeight = FontWeight.Bold) }
                        OutlinedButton(onClick = { chosen[k] = n - 1 }, enabled = n > 0) { Text("−") }
                        Text("$n", Modifier.padding(horizontal = 12.dp), fontWeight = FontWeight.Bold)
                        OutlinedButton(onClick = { chosen[k] = n + 1 }, enabled = n < have && total < need) { Text("+") }
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onSend(chosen.toMap()) }, enabled = total == need) { Text("Discard") } },
    )
}

/** More than one player could be robbed: choose whom. */
@Composable
fun StealDialog(victims: List<Pair<Int, String>>, onClose: () -> Unit, onPick: (Int) -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Steal from whom?") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { victims.forEach { (seat, name) -> Button(onClick = { onPick(seat) }, modifier = Modifier.fillMaxWidth()) { Text(name) } } } },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}

private val DEV_NAME = mapOf("knight" to "Knight", "vp" to "Victory point", "roadBuilding" to "Road Building", "yearOfPlenty" to "Year of Plenty", "monopoly" to "Monopoly", "heist" to "Heist")
private val DEV_TEXT = mapOf(
    "knight" to "Move the robber and steal a card. Three knights played earn Largest Army.",
    "vp" to "Counts for one point automatically.",
    "roadBuilding" to "Build two roads for free.",
    "yearOfPlenty" to "Take any two resources from the bank.",
    "monopoly" to "Name a resource: every other player gives you all of theirs.",
    "heist" to "Steal an opponent's settlement and make it yours.",
)

/** Your development cards, Play for the ones that can be played now, and buying the Heist card (once per game, after enough cities). */
@Composable
fun DevDialog(game: GameState, hasHeistTargets: Boolean, onClose: () -> Unit, onBuyHeist: () -> Unit, onPlay: (String) -> Unit) {
    val cards = game.me?.dev ?: emptyList()
    val groups = cards.groupBy { it.type }
    val mine = game.isMine()
    val canPlayNow = game.phase == "main" && mine && game.subphase == null && !game.devPlayed
    val heist = game.heist
    val cities = game.cities()
    val boughtHeist = game.me?.heistBought == true
    val canBuyHeist = !boughtHeist && heist != null && cities >= heist.need && mine && game.phase == "main" && game.rolled && game.subphase == null && game.canAfford(heist.cost)
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Development cards") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (heist != null && !boughtHeist) item {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Heist card", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                            Button(onClick = onBuyHeist, enabled = canBuyHeist) { Text("Buy") }
                        }
                        Text("${DEV_TEXT["heist"]} Costs ${resText(heist.cost)}. You need ${heist.need} cities first (you have $cities), and you can buy it once per game.", fontSize = 12.sp, color = FoamDim)
                    }
                }
                if (groups.isEmpty()) item { Text("You have no cards yet. Buy one for sheep, hay and ore.") }
                items(groups.entries.toList()) { (type, list) ->
                    val ready = list.count { !it.fresh }
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("${DEV_NAME[type] ?: type} × ${list.size}", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                            val playable = type != "vp" && canPlayNow && ready > 0 && (type != "heist" || hasHeistTargets)
                            if (playable) Button(onClick = { onPlay(type) }) { Text("Play") }
                            else if (type != "vp") Text(
                                when { ready == 0 -> "Next turn"; !canPlayNow -> "On your turn"; type == "heist" && !hasHeistTargets -> "Nothing to steal"; else -> "" },
                                fontSize = 12.sp, color = FoamDim,
                            )
                        }
                        Text(DEV_TEXT[type] ?: "", fontSize = 12.sp, color = FoamDim)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}

private fun GameState.isMine() = you >= 0 && turn == you

/** Pick [count] resources (Monopoly: one; Year of Plenty: two, the same twice is fine). */
@Composable
fun PickResourcesDialog(title: String, count: Int, onClose: () -> Unit, onPick: (List<String>) -> Unit) {
    val picks = remember { mutableStateOf(listOf<String>()) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                RESOURCES.forEach { k -> OutlinedButton(onClick = { if (picks.value.size < count) picks.value = picks.value + k }, modifier = Modifier.fillMaxWidth()) { ResourceIcon(k, 28.dp) } }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Chosen:", color = FoamDim)
                    if (picks.value.isEmpty()) Text("none yet", color = FoamDim)
                    picks.value.forEach { ResourceIcon(it, 24.dp) }
                }
            }
        },
        confirmButton = { Button(onClick = { onPick(picks.value) }, enabled = picks.value.size == count) { Text("OK") } },
        dismissButton = { Row { TextButton(onClick = { picks.value = emptyList() }) { Text("Clear") }; TextButton(onClick = onClose) { Text("Cancel") } } },
    )
}

@Composable
fun LogDialog(game: GameState, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Ship's log") },
        text = { LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) { items(game.log.takeLast(40).reversed()) { Text(it.text, fontSize = 13.sp) } } },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}

@Composable
fun InfoDialog(game: GameState, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Game info") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Room ${game.code} · first to ${game.vpTarget} points", fontWeight = FontWeight.Bold)
                Text("Road: ${resText(COST_ROAD)}")
                Text("Settlement (1 point): ${resText(COST_SETTLEMENT)}")
                Text("City (2 points): ${resText(COST_CITY)}")
                Text("Development card: ${resText(COST_DEV)}")
                Text("Longest Road (5+ roads) and Largest Army (3+ knights) are worth 2 points each.", color = FoamDim, fontSize = 13.sp)
                Text("Bank: ${RESOURCES.joinToString(" · ") { "${RESOURCE_LABEL[it]} ${game.bank[it] ?: 0}" }} · ${game.devLeft} development cards left", color = FoamDim, fontSize = 13.sp)
                game.me?.ratios?.let { r -> Text("Your bank rates: ${RESOURCES.joinToString(" · ") { "${RESOURCE_LABEL[it]} ${r[it] ?: 4}:1" }}", color = FoamDim, fontSize = 13.sp) }
                val o = game.opts
                Text("Rules of this game", fontWeight = FontWeight.Bold, color = Gold, modifier = Modifier.padding(top = 4.dp))
                Text("Points to win: ${game.vpTarget} · Discard limit: ${o.discardLimit} cards, ${if (o.discardMode == "four") "4 cards" else "half the hand"} given up", fontSize = 13.sp, color = FoamDim)
                Text("Move timer: ${if (o.timer > 0) "${o.timer} seconds (setup placements get 60)" else "off"} · Friendly robber: ${if (o.friendlyRobber) "on" else "off"} · Balanced dice: ${if (o.balancedDice) "on" else "off"}", fontSize = 13.sp, color = FoamDim)
                Text("Pinch to zoom the board and drag to move it; tap Fit to see all of it again.", color = FoamDim, fontSize = 13.sp)
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}

@Composable
fun ResultsDialog(game: GameState, spectating: Boolean, onAgain: () -> Unit, onLeave: () -> Unit, onClose: () -> Unit) {
    val winner = game.players.getOrNull(game.winner ?: -1)
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("${winner?.name ?: "Someone"} wins!") },
        text = { ResultsBody(game, spectating) },
        confirmButton = { if (!spectating) Button(onClick = onAgain) { Text("Play again") } else TextButton(onClick = onLeave) { Text("Leave") } },
        dismissButton = { Row { TextButton(onClick = onClose) { Text("View board") }; if (!spectating) TextButton(onClick = onLeave) { Text("Leave") } } },
    )
}

/** The standings of a finished game: rank, name, points, and what each player did. */
@Composable
fun ResultsBody(game: GameState, spectating: Boolean) {
    val winner = game.players.getOrNull(game.winner ?: -1)
    val ranked = game.players.withIndex().sortedWith(compareByDescending<IndexedValue<com.hexlands.app.net.PlayerView>> { it.index == game.winner }.thenByDescending { it.value.vp })
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("${winner?.name ?: "Someone"} wins!", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = Gold)
        Text("${game.turnNumber} turns on ${game.mapName}", color = FoamDim)
        ranked.forEachIndexed { r, (i, p) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${r + 1}.", Modifier.padding(end = 8.dp), color = Gold, fontWeight = FontWeight.Bold)
                Column(Modifier.weight(1f)) {
                    Text(p.name + if (i == game.you) " (you)" else "", fontWeight = FontWeight.Bold)
                    Text("${p.stats.collected} cards harvested · ${p.stats.bankTrades + p.stats.playerTrades} trades · ${p.knights} knights", fontSize = 11.sp, color = FoamDim)
                }
                Text("${p.vp}", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = if (i == game.winner) Gold else Foam)
            }
        }
        if (spectating) Text("You watched this game.", color = FoamDim, fontSize = 12.sp)
    }
}

/** The diamond has opened: pick your cards from the bank (as many as you earned, or as many as the bank has). Cannot be dismissed. */
@Composable
fun DiamondDialog(game: GameState, onSend: (List<String>) -> Unit) {
    val picks = remember { mutableStateOf(listOf<String>()) }
    val need = game.pendingDiamond[game.you.toString()] ?: 0
    val n = minOf(need, RESOURCES.sumOf { game.bank[it] ?: 0 })
    AlertDialog(
        onDismissRequest = {},
        title = { Text("The diamond opens!") },
        text = { DiamondBody(game, n, picks.value, onPick = { picks.value = picks.value + it }, onClear = { picks.value = emptyList() }) },
        confirmButton = { Button(onClick = { onSend(picks.value) }, enabled = picks.value.size == n) { Text("Take cards") } },
    )
}

@Composable
fun DiamondBody(game: GameState, n: Int, picks: List<String>, onPick: (String) -> Unit, onClear: () -> Unit) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Choose $n card${if (n == 1) "" else "s"} from the bank. You can take the same kind more than once.")
        RESOURCES.forEach { k ->
            val left = (game.bank[k] ?: 0) - picks.count { it == k }
            OutlinedButton(onClick = { onPick(k) }, enabled = picks.size < n && left > 0, modifier = Modifier.fillMaxWidth()) {
                ResourceIcon(k, 26.dp); Text("   ${picks.count { it == k }} chosen, $left in the bank")
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${picks.size} of $n chosen", Modifier.weight(1f), color = if (picks.size == n) Good else FoamDim)
            TextButton(onClick = onClear, enabled = picks.isNotEmpty()) { Text("Clear") }
        }
    }
}
