package com.hexlands.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import com.hexlands.app.audio.Sound
import com.hexlands.app.net.GameState
import kotlinx.coroutines.delay

private fun GameState.counts(): Triple<Int, Int, Int> = Triple(roads.size, buildings.values.count { it.type == "settlement" }, buildings.values.count { it.type == "city" })

/**
 * The sounds of a game, from what changes between one state and the next, as in the web game: the dice (and a low note when it is a 7), cards arriving,
 * the clack of a road, a settlement or a city, the robber moving, a development card bought, a trade offered and made, and a bell when it is your move.
 * The same moments are felt too: [haptic] gets the kind of moment (place, city, gain, offer, turn, robber, seven, award, win, end) and decides whether the phone buzzes.
 * It draws nothing, and a roll or move already there when you arrive is not played again.
 */
@Composable
fun GameSounds(game: GameState, haptic: (String) -> Unit = {}) {
    val prev = remember { arrayOfNulls<GameState>(1) }
    LaunchedEffect(game) {
        val p = prev[0]; prev[0] = game
        if (p == null) return@LaunchedEffect
        val roll = game.lastRoll
        if (roll != null && roll.seq != p.lastRoll?.seq) {
            Sound.play("dice")
            if (roll.dice.sum() == 7) { delay(900); Sound.play("seven"); haptic("seven") }
            else if (roll.gains.getOrNull(game.you)?.values?.sum()?.let { it > 0 } == true) { delay(AFTER_DICE_MS + 1500); Sound.play("gain"); haptic("gain") }   // when the first card lands
        }
        val (r0, s0, c0) = p.counts(); val (r1, s1, c1) = game.counts()
        val mineToPlace = p.you >= 0 && p.turn == p.you   // only your own pieces are felt, not everyone's
        if (c1 > c0) { Sound.play("city"); if (mineToPlace) haptic("city") }
        else if (s1 > s0) { Sound.play("settle"); if (mineToPlace) haptic("place") }
        else if (r1 > r0) { Sound.play("road"); if (mineToPlace) haptic("place") }
        if (game.robber != p.robber) { Sound.play("robber"); haptic("robber") }
        // Longest Road or Largest Army changes hands: a fanfare
        if ((game.longestRoad != null && game.longestRoad.p != p.longestRoad?.p) || (game.largestArmy != null && game.largestArmy.p != p.largestArmy?.p)) { Sound.play("award"); haptic("award") }
        if (game.players.sumOf { it.devCount } > p.players.sumOf { it.devCount }) Sound.play("devbuy")
        val tr = game.trade
        if (tr != null && tr.id != p.trade?.id && tr.from != game.you) { Sound.play("offer"); haptic("offer") }
        val newest = game.log.lastOrNull()
        if (newest != null && newest != p.log.lastOrNull() && newest.text.contains(" traded ")) Sound.play("coin")
        val mineNow = game.phase != "ended" && game.you >= 0 && game.turn == game.you && (game.phase == "setup" || game.phase == "main")
        val minePrev = p.phase != "ended" && p.you >= 0 && p.turn == p.you && (p.phase == "setup" || p.phase == "main")
        if (mineNow && !minePrev) { Sound.play("turn"); haptic("turn") }
        if (game.phase == "ended" && p.phase != "ended") haptic(if (game.you >= 0 && game.winner == game.you) "win" else "end")
    }
}
