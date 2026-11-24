package com.hexlands.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.net.GameState
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.RESOURCE_LABEL
import com.hexlands.app.net.hand
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The trade window, opened by tapping a resource card (or the Trade button): trade with the other players (an offer to everyone, with their answers and
 * counter-offers) or with the bank.
 */
@Composable
fun TradeDialog(game: GameState, vm: GameViewModel, give0: String?, canTrade: Boolean, onClose: () -> Unit) {
    var tab by remember { mutableStateOf(0) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Trade") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                TabRow(selectedTabIndex = tab, containerColor = Color.Transparent) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Players") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Bank") })
                }
                if (!canTrade) Text("You can trade on your turn, after you roll the dice.", color = FoamDim, fontSize = 13.sp)
                if (tab == 0) PlayersPane(game, vm, give0, canTrade) else if (canTrade) BankPane(game, give0) { give, get, times -> onClose(); vm.bankTrade(give, get, times) }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}

@Composable
private fun PlayersPane(game: GameState, vm: GameViewModel, give0: String?, canTrade: Boolean) {
    val give = remember { mutableStateMapOf<String, Int>().also { m -> if (give0 != null && (game.hand(give0)) > 0) m[give0] = 1 } }
    val get = remember { mutableStateMapOf<String, Int>() }
    val mine = game.trade?.takeIf { it.from == game.you }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (mine != null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NavyDark).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Your offer", fontWeight = FontWeight.Bold, color = Gold)
                Text("You give ${resText(mine.give)}.  You get ${resText(mine.get)}.", fontSize = 13.sp)
                game.players.forEachIndexed { i, p ->
                    if (i == game.you) return@forEachIndexed
                    val counter = mine.counters[i.toString()]
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(p.name, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        when {
                            counter != null -> {
                                Text("counter: gives ${resText(counter.give)}, wants ${resText(counter.get)}", Modifier.weight(2f), fontSize = 11.sp, color = FoamDim)
                                GoldButton(onClick = { vm.act("confirm") { put("with", i); put("counter", true) } }, padding = androidx.compose.foundation.layout.PaddingValues(12.dp, 6.dp)) { Text("Take", fontSize = 12.sp) }
                                OutlinedButton(onClick = { vm.act("declineCounter") { put("with", i) } }) { Text("No", fontSize = 12.sp) }
                            }
                            i in mine.accepted -> GoldButton(onClick = { vm.act("confirm") { put("with", i) } }, padding = androidx.compose.foundation.layout.PaddingValues(12.dp, 6.dp)) { Text("Accepted: trade", fontSize = 12.sp) }
                            i in mine.declined -> Text("declined", color = Bad, fontSize = 12.sp)
                            else -> Text("thinking…", color = FoamDim, fontSize = 12.sp)
                        }
                    }
                }
                OutlinedButton(onClick = { vm.act("cancelTrade") }) { Text("Cancel offer") }
            }
        }
        if (canTrade) {
            Text("Offer a trade to everyone", fontWeight = FontWeight.Bold, color = Gold)
            Row(Modifier.fillMaxWidth()) {
                Text("", Modifier.weight(1.1f))
                Text("You give", Modifier.weight(1f), fontSize = 12.sp, color = FoamDim)
                Text("You get", Modifier.weight(1f), fontSize = 12.sp, color = FoamDim)
            }
            RESOURCES.forEach { k ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1.1f), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(RESOURCE_COLOR[k] ?: Color.Gray))
                        Text(" ${RESOURCE_LABEL[k]} (${game.hand(k)})", fontSize = 13.sp)
                    }
                    Stepper(give[k] ?: 0, max = game.hand(k), enabled = (get[k] ?: 0) == 0, Modifier.weight(1f)) { give[k] = it }
                    Stepper(get[k] ?: 0, max = 9, enabled = (give[k] ?: 0) == 0, Modifier.weight(1f)) { get[k] = it }
                }
            }
            val ok = give.values.sum() > 0 && get.values.sum() > 0
            GoldButton(
                onClick = {
                    vm.act("offer") {
                        put("give", buildJsonObject { give.forEach { (k, n) -> if (n > 0) put(k, n) } })
                        put("get", buildJsonObject { get.forEach { (k, n) -> if (n > 0) put(k, n) } })
                    }
                    give.clear(); get.clear()
                },
                enabled = ok, modifier = Modifier.fillMaxWidth(),
            ) { Text(if (mine != null) "Replace my offer" else "Send offer", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun Stepper(n: Int, max: Int, enabled: Boolean, modifier: Modifier, onChange: (Int) -> Unit) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { onChange(n - 1) }, enabled = enabled && n > 0, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp), modifier = Modifier.size(32.dp)) { Text("−", fontSize = 18.sp) }
        Text("$n", Modifier.padding(horizontal = 2.dp), fontWeight = FontWeight.Bold)
        TextButton(onClick = { onChange(n + 1) }, enabled = enabled && n < max, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp), modifier = Modifier.size(32.dp)) { Text("+", fontSize = 18.sp) }
    }
}
