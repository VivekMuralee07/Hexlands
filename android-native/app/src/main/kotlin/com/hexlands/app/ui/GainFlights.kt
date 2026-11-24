package com.hexlands.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.RESOURCES
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** One card on its way: the resource, who gets it, and the tile it came from (null when that cannot be told). */
data class GainFlight(val res: String, val player: Int, val tile: Int?, val delayMs: Long)

/** How long each card takes, and how long the next one waits: slow enough to watch. */
const val FLIGHT_MS = 2000
const val FLIGHT_GAP_MS = 380L
/** The dice take about this long to tumble, so the cards set off after that. */
const val AFTER_DICE_MS = 850L

private val TERRAIN_RES = mapOf("forest" to "wood", "hills" to "brick", "pasture" to "sheep", "fields" to "wheat", "mountains" to "ore")

/**
 * The cards a roll paid out, one flight per card (at most 6 per kind and 24 in all, as on the web). Each starts on a tile with the rolled number that
 * makes that resource and has the player's settlement or city next to it, and ends at the player. A 7 pays nothing.
 */
fun gainFlights(board: Board, game: GameState): List<GainFlight> {
    val roll = game.lastRoll ?: return emptyList()
    val sum = roll.dice.sum()
    if (sum == 7) return emptyList()
    val out = ArrayList<GainFlight>()
    for (i in game.players.indices) {
        val gains = roll.gains.getOrNull(i) ?: continue
        for (k in RESOURCES) {
            val n = gains[k] ?: 0
            if (n <= 0) continue
            val sources = board.tiles.filter { t ->
                t.number == sum && t.id != game.robber && TERRAIN_RES[t.terrain] == k && t.vertices.any { v -> game.buildings[v.toString()]?.p == i }
            }
            repeat(min(n, 6)) { c ->
                if (out.size < 24) out += GainFlight(k, i, sources.getOrNull(c % max(1, sources.size))?.id, AFTER_DICE_MS + out.size * FLIGHT_GAP_MS)
            }
        }
    }
    return out
}

private val Smooth = CubicBezierEasing(0.4f, 0.1f, 0.3f, 1f)

/** A card that rises off its tile, then drifts in an arc to the player, shrinking a little as it arrives. */
@Composable
private fun FlyingCard(f: GainFlight, from: Offset, to: Offset) {
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) { delay(f.delayMs); p.animateTo(1f, tween(FLIGHT_MS, easing = Smooth)) }
    val t = p.value
    if (t <= 0f || t >= 1f) return
    val scale = if (t < 0.22f) 0.4f + (1.25f - 0.4f) * (t / 0.22f) else 1.25f + (0.8f - 1.25f) * ((t - 0.22f) / 0.78f)
    val alpha = when { t < 0.1f -> t / 0.1f; t > 0.9f -> (1f - t) / 0.1f * 0.9f + 0.0f; else -> 1f }.coerceIn(0f, 1f)
    Box(
        Modifier.offset {
            val x = from.x + (to.x - from.x) * t
            val y = from.y + (to.y - from.y) * t - 46.dp.toPx() * sin(PI.toFloat() * t)
            IntOffset((x - 17.dp.toPx()).toInt(), (y - 22.dp.toPx()).toInt())
        }.size(34.dp, 44.dp).graphicsLayer { scaleX = scale; scaleY = scale; this.alpha = alpha },
    ) { ResourceCard(f.res, Modifier.fillMaxSize()) }
}

/** All the flights of one roll, drawn over the whole game screen. [from] and [to] give screen positions inside the same box. */
@Composable
fun GainFlights(flights: List<GainFlight>, from: (GainFlight) -> Offset, to: (GainFlight) -> Offset) {
    Box(Modifier.fillMaxSize()) { flights.forEach { f -> FlyingCard(f, from(f), to(f)) } }
}
