package com.hexlands.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.RESOURCE_LABEL

val COST_HEIST = mapOf("wood" to 1, "brick" to 1, "sheep" to 2, "wheat" to 1, "ore" to 1)

/** A cost shown as pictures: one icon per card. */
@Composable
fun CostPictures(cost: Map<String, Int>, size: androidx.compose.ui.unit.Dp = 22.dp) {
    Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
        RESOURCES.forEach { k -> repeat(cost[k] ?: 0) { ResourceIcon(k, size) } }
    }
}

private class Section(val title: String, val paragraphs: List<String>, val bullets: Boolean = false)

/** The web game's "How to play" text, section by section (same wording). */
private val SECTIONS = listOf(
    Section("Goal", listOf("Be the first to reach the points target on your own turn (10 by default; the host can change it). Settlements are worth 1 point, cities 2, Longest Road 2, Largest Army 2, and each hidden Victory Point card 1.")),
    Section("Setup", listOf("Each player places a settlement and a road touching it, in turn order. Then it runs backwards, so the last player places both of theirs back to back. Your second settlement pays one card for every tile it touches.")),
    Section("Your turn", listOf(
        "Roll the dice. Every tile showing that number pays each settlement next to it 1 card and each city 2.",
        "Trade with other players, or with the bank at 4 to 1 (3 to 1 or 2 to 1 with a harbor).",
        "Build, or buy a development card.",
        "End your turn.",
    ), bullets = true),
    Section("Where pieces can go", listOf(
        "A settlement needs a free corner at least two roads away from every other settlement and city, and it must touch one of your roads (except during setup). The open end of a single road is fine.",
        "A road must connect to one of your own roads, settlements or cities. It can run on from the end of another road, but never through a corner holding another player's settlement or city. A road can't be placed on its own, away from your network.",
        "If an opponent builds on a corner of your road, the road stays but the far side is drawn faded: it no longer links back to your towns and no longer counts as one chain for Longest Road. You can still build onward from its far end.",
    ), bullets = true),
    Section("Rolling a 7", listOf("Nobody collects. Anyone holding more cards than the discard limit (7 by default) discards half, rounded down: tap the cards in your hand to pick them. Then the roller moves the robber to another tile, which blocks that tile, and steals one random card from a player next to it.")),
    Section("Development cards", listOf("25 cards: 14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty, 2 Monopoly. You can play one per turn, but not on the turn you bought it. Knights move the robber; three played Knights earn Largest Army. Victory Point cards stay hidden until you win.")),
    Section("Heist card", listOf("Each player may buy one Heist card per game, but only once they have built 3 cities (4 cities in games played to more than 10 points). It counts as a development card, so you play it on a later turn and only one development card per turn. Playing it lets you steal any opponent's settlement (never a city). The settlement stays where it is and becomes yours, so they lose a point and you gain one. If exactly two of their roads touch it, both come with it (as long as you have two road pieces left), so the settlement keeps its two roads. Taking settlements and roads can cut or free other roads.")),
    Section("Bonuses", listOf("Longest Road: 5 or more connected roads, and you must beat the holder to take it. An opponent's settlement built in the middle can cut a road. Largest Army: 3 or more Knights played, and you must beat the holder.")),
    Section("Host options", listOf(
        "Discard limit and amount: how many cards you can hold safely, and whether you lose half or exactly 4.",
        "Move timer: 15, 30 or 60 seconds. If it runs out, the game plays that step for you. Setup placements get 60 seconds.",
        "Friendly robber: the robber can't go next to a player with 2 points or fewer.",
        "Balanced dice: rolls come from a deck (like colonist.io), so totals stay close to the odds, repeats are rarer, and 7s are shared out between players.",
    ), bullets = true),
    Section("Bots", listOf("The host can fill empty seats with Easy, Medium or Hard bots, up to 4 players in total.")),
)

private val TERRAIN_FOR = mapOf("wood" to "Forest", "brick" to "Hills", "sheep" to "Pasture", "wheat" to "Fields", "ore" to "Mountains")

/** The full rules, as on the web game's "How to play" window, with the costs and resources shown as pictures. */
@Composable
fun RulesText(modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SECTIONS.forEachIndexed { i, sec ->
            // the resources and the building costs come right after "Your turn", as on the web
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(sec.title, fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 15.sp)
                sec.paragraphs.forEachIndexed { n, p -> Text(if (sec.bullets && sec.title == "Your turn") "${n + 1}. $p" else if (sec.bullets) "• $p" else p, fontSize = 13.sp, color = Foam) }
            }
            if (sec.title == "Your turn") {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Resources", fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 15.sp)
                    RESOURCES.forEach { k ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ResourceIcon(k, 26.dp); Text("${RESOURCE_LABEL[k]}", fontWeight = FontWeight.Bold, fontSize = 13.sp); Text("from ${TERRAIN_FOR[k]}", fontSize = 12.sp, color = FoamDim)
                        }
                    }
                    Text("Desert makes nothing.", fontSize = 12.sp, color = FoamDim)
                }
                CostsList()
            }
        }
    }
}

/** What each thing costs, with a picture for every card. */
@Composable
fun CostsList(modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Building", fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 15.sp)
        listOf(
            Triple("Road", COST_ROAD, "Extends your network."),
            Triple("Settlement", COST_SETTLEMENT, "1 point."),
            Triple("City", COST_CITY, "2 points. Replaces a settlement and pays double."),
            Triple("Development card", COST_DEV, "Drawn from a deck of 25."),
            Triple("Heist card", COST_HEIST, "Once per player, after 3 cities (4 above 10 points)."),
        ).forEach { (name, cost, note) ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) { Text(name, fontWeight = FontWeight.Bold, fontSize = 13.sp); Text(note, fontSize = 11.sp, color = FoamDim) }
                CostPictures(cost)
            }
        }
    }
}
