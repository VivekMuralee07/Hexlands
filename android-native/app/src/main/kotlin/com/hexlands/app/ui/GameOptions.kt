package com.hexlands.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.net.GameState

/** One option: its name and what it does on the left, the control on the right. */
@Composable
private fun OptionRow(title: String, note: String, control: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(note, fontSize = 11.sp, color = FoamDim)
        }
        control()
    }
}

@Composable
private fun StepperControl(value: Int, min: Int, max: Int, suffix: String, enabled: Boolean, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (enabled) TextButton(onClick = { onChange(value - 1) }, enabled = value > min, modifier = Modifier.size(40.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("−", fontSize = 20.sp) }
        Text("$value$suffix", fontWeight = FontWeight.ExtraBold, color = Gold)
        if (enabled) TextButton(onClick = { onChange(value + 1) }, enabled = value < max, modifier = Modifier.size(40.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("+", fontSize = 20.sp) }
    }
}

/**
 * The game's rules as the host sets them in the waiting room: points to win, the discard limit and amount on a 7, the move timer, friendly robber and
 * balanced dice. Everyone sees them; only the host can change them (the server refuses anyone else). Same options and limits as the web game.
 */
@Composable
fun GameOptions(game: GameState, host: Boolean, vm: GameViewModel) {
    val o = game.opts
    Card(colors = CardDefaults.cardColors(containerColor = NavyDark), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Game rules", fontWeight = FontWeight.ExtraBold, color = Gold)
            OptionRow("Points to win", "The first player to reach this on their own turn wins.") {
                StepperControl(game.vpTarget, 5, 20, "", host) { vm.setOption("vpTarget", it) }
            }
            OptionRow("Discard limit", "On a 7, anyone holding more cards than this must discard.") {
                StepperControl(o.discardLimit, 7, 15, " cards", host) { vm.setOption("discardLimit", it) }
            }
            OptionRow("Cards discarded", "How many they must give up.") {
                if (host) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    FilterChip(selected = o.discardMode == "half", onClick = { vm.setOption("discardMode", "half") }, label = { Text("Half") })
                    FilterChip(selected = o.discardMode == "four", onClick = { vm.setOption("discardMode", "four") }, label = { Text("4") })
                } else Text(if (o.discardMode == "four") "4 cards" else "Half", fontWeight = FontWeight.ExtraBold, color = Gold)
            }
            OptionRow("Move timer", "When time runs out, the game plays that step for the player. Setup placements always get 60 seconds.") {
                if (host) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(0 to "Off", 15 to "15s", 30 to "30s", 60 to "60s").forEach { (v, label) ->
                        FilterChip(selected = o.timer == v, onClick = { vm.setOption("timer", v) }, label = { Text(label, fontSize = 12.sp) })
                    }
                } else Text(if (o.timer == 0) "Off" else "${o.timer} s", fontWeight = FontWeight.ExtraBold, color = Gold)
            }
            OptionRow("Friendly robber", "The robber stays off players with 2 points or fewer.") {
                Switch(checked = o.friendlyRobber, onCheckedChange = { vm.setOption("friendlyRobber", it) }, enabled = host)
            }
            OptionRow("Balanced dice", "Dice come from a deck of 36 rolls, with recent totals and 7s balanced between players.") {
                Switch(checked = o.balancedDice, onCheckedChange = { vm.setOption("balancedDice", it) }, enabled = host)
            }
        }
    }
}
