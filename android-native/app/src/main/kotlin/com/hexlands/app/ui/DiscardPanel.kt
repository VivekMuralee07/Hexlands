package com.hexlands.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.GameState
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.totalCards

/**
 * A seven was rolled and you hold too many cards. There is no window: tap the cards in your hand to pick the ones to give back (they show here, and
 * come out of the count in your hand at once), tap a card here to put it back, and tap the tick when you have picked enough.
 */
@Composable
fun DiscardPanel(game: GameState, need: Int, pick: SnapshotStateMap<String, Int>, onSend: () -> Unit, modifier: Modifier = Modifier) {
    val total = pick.values.sum()
    val kinds = RESOURCES.filter { (pick[it] ?: 0) > 0 }
    Row(modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Paper).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("The robber strikes!", fontWeight = FontWeight.ExtraBold, color = Color(0xFFB3261E), fontSize = 17.sp)
            Text(
                "You hold ${game.totalCards()} cards, more than ${game.opts.discardLimit}. Tap the cards in your hand to give back $need.",
                fontSize = 13.sp, color = Ink,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("$total of $need", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = if (total == need) Good else Ink)
                if (kinds.isEmpty()) Text("nothing picked yet", fontSize = 13.sp, color = Ink.copy(alpha = 0.6f))
                else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    kinds.forEach { k -> ResourceCard(k, Modifier.width(54.dp), count = pick[k], onClick = { val n = (pick[k] ?: 0) - 1; if (n <= 0) pick.remove(k) else pick[k] = n }) }
                }
            }
        }
        RoundButton("Discard the picked cards", enabled = total == need, onClick = onSend) { checkIcon(androidx.compose.ui.graphics.Color.White) }
    }
}
