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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.offset
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
import androidx.compose.animation.core.animateFloat
import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Path
import kotlinx.coroutines.delay
import androidx.compose.ui.geometry.Offset
import kotlin.math.max
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import kotlin.math.sin
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
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
import com.hexlands.app.net.cities
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
        "robber" -> if (mine) "Move the robber: tap a glowing circle" else "$cur is moving the robber"
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
    data object Dev : GameDialog
    data class Pick(val card: String) : GameDialog   // monopoly | yearOfPlenty
    data object Log : GameDialog
    data object Info : GameDialog
}

@Composable
fun GameScreen(ui: UiState, game: GameState, vm: GameViewModel, animate: Boolean = true, tradeOpenAtStart: Boolean = false, onTutorial: (() -> Unit)? = null) {
    val board = ui.board
    val context = LocalContext.current
    val spectating = game.spectator || ui.session?.spectator == true
    val myTurn = game.isMyTurn()
    val legal = game.legal ?: Legal()
    var picked by remember { mutableStateOf<Tap?>(null) }
    var dialog by remember { mutableStateOf<GameDialog?>(null) }
    var showResults by remember { mutableStateOf(true) }
    // A seven was rolled and you hold too many cards: you pick the ones to give back by tapping them in your hand.
    val needDiscard = if (!spectating && game.subphase == "discard") (game.pendingDiscards[game.you.toString()] ?: 0) else 0
    val discardPick = remember { androidx.compose.runtime.mutableStateMapOf<String, Int>() }
    LaunchedEffect(needDiscard) { discardPick.clear() }
    var tradeOpen by remember { mutableStateOf(tradeOpenAtStart) }
    val tradeGive = remember { androidx.compose.runtime.mutableStateMapOf<String, Int>() }
    val tradeGet = remember { androidx.compose.runtime.mutableStateMapOf<String, Int>() }
    val canTrade = myTurn && game.phase == "main" && game.rolled && game.subphase == null
    LaunchedEffect(game.turnNumber) { tradeGive.clear(); tradeGet.clear() }
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

    val pickedKind = when {
        pickedNow == null -> null
        heistMode -> "heist"
        pickedNow is Tap.Road -> "road"
        pickedNow is Tap.Corner && pickedNow.id in legal.cities -> "city"
        else -> "settlement"
    }
    fun onTap(t: Tap) {
        when (t) {
            is Tap.Hex -> {
                val b = board ?: return
                val victims = b.tiles[t.id].vertices.mapNotNull { game.buildings[it.toString()] }.map { it.p }.filter { it != game.you }.distinct()
                if (victims.size >= 2) dialog = GameDialog.Steal(t.id, victims.map { it to (game.players.getOrNull(it)?.name ?: "?") })
                else vm.act("robber") { put("tile", t.id) }
            }
            else -> if (picked == t) {
                picked = null
                when (t) {
                    is Tap.Corner -> if (pickedKind == "heist") { heistMode = false; vm.act("playDev") { put("card", "heist"); put("vertex", t.id) } } else vm.act(if (pickedKind == "city") "city" else "settle") { put("vertex", t.id) }
                    is Tap.Road -> vm.act("road") { put("edge", t.id) }
                    else -> {}
                }
            } else picked = t
        }
    }

    // The cards of a roll fly from their tiles to the players who were paid. A roll already on the screen when you arrive is not replayed.
    val rollSeq = game.lastRoll?.seq
    var seenRoll by remember { mutableStateOf(rollSeq) }
    var flights by remember { mutableStateOf(emptyList<GainFlight>()) }
    val boardView = remember { BoardView() }
    var rootPos by remember { mutableStateOf(Offset.Zero) }
    var boardBounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
    var stripBounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
    var handBounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
    val flightsOn = animate && LocalAnimate.current
    LaunchedEffect(rollSeq) {
        if (rollSeq != null && rollSeq != seenRoll) {
            seenRoll = rollSeq
            if (flightsOn && board != null) {
                val list = gainFlights(board, game)
                flights = list
                delay((list.maxOfOrNull { it.delayMs } ?: 0L) + FLIGHT_MS + 300L)
                flights = emptyList()
            }
        }
    }

    Box(Modifier.fillMaxSize().onGloballyPositioned { rootPos = it.positionInWindow() }) {
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.onGloballyPositioned { stripBounds = it.boundsInWindow() }) { PlayersStrip(game) }
        // whose turn it is, and the move timer
        if (game.phase == "setup" || game.phase == "main") Row(Modifier.fillMaxWidth().background(NavyDark).padding(start = 10.dp, end = 12.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            TurnPill(game)
            Box(Modifier.weight(1f))
            MoveClock(game)
        }
        Row(Modifier.fillMaxWidth().background(NavyDark).padding(start = 12.dp, end = 4.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                (if (heistMode) "Heist: tap an opponent's settlement to steal it" else bannerText(game)) + if (ui.reconnecting) "  ·  Reconnecting…" else "",
                Modifier.weight(1f).padding(vertical = 6.dp),
                color = Gold, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
            )
            if (!spectating) {
                HeaderIconButton(HeaderIcon.Log, "Game log") { dialog = GameDialog.Log }
                HeaderIconButton(HeaderIcon.Info, "Game info") { dialog = GameDialog.Info }
                HeaderIconButton(HeaderIcon.Leave, "Leave the game") { vm.leave() }
            }
        }

        // A bot is playing this seat (you were away, or the timer ran out twice): say so, and offer the seat back.
        val mineSeat = game.players.getOrNull(game.you)
        if (!spectating && mineSeat?.takenOver != null && game.phase != "ended") {
            Row(Modifier.fillMaxWidth().background(NavyLight).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (mineSeat.takenOver == "left") "You left, so a bot is playing your seat." else "A bot is playing for you because you were away.", Modifier.weight(1f), fontSize = 13.sp)
                GoldButton(onClick = { vm.act("reclaim") }, padding = androidx.compose.foundation.layout.PaddingValues(14.dp, 7.dp)) { Text("Take back control", fontWeight = FontWeight.Bold, fontSize = 12.sp) }
            }
        }

        Box(Modifier.weight(1f).fillMaxWidth().onGloballyPositioned { boardBounds = it.boundsInWindow() }) {
            if (board == null) Text("Loading the board…", Modifier.align(Alignment.Center))
            else BoardCanvas(board, game, cornerSpots, roadSpots, hexSpots, pickedNow, ::onTap, animate = animate, previewKind = pickedKind, view = boardView)
            // Hints sit on top of the board, never beside it: a bar that appeared below would shrink the board and move the spot you just tapped.
            val hint = when {
                pickedNow != null -> if (pickedKind == "heist") "Tap it again to steal this settlement" else "Tap it again to build a $pickedKind"
                heistMode -> if (heistTargets.isEmpty()) "No opponent has a settlement to steal." else "Tap one of the glowing settlements."
                else -> null
            }
            if (hint != null) Row(
                Modifier.align(Alignment.TopCenter).padding(top = 6.dp).background(NavyDark.copy(alpha = 0.92f), RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(hint, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Gold)
                TextButton(onClick = { picked = null; heistMode = false }) { Text("Cancel") }
            }
            if (needDiscard > 0) DiscardPanel(
                game, needDiscard, discardPick,
                onSend = { vm.act("discard") { put("res", kotlinx.serialization.json.buildJsonObject { discardPick.forEach { (k, n) -> if (n > 0) put(k, n) } }) } },
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp),
            )
            if (tradeOpen && needDiscard == 0 && !spectating) TradePanel(
                game, vm, tradeGive, tradeGet, canTrade, onClose = { tradeOpen = false },
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp),
            )
            game.dice?.let { d ->
                if (d.size == 2) Row(
                    Modifier.align(Alignment.TopStart).padding(8.dp).background(NavyDark.copy(alpha = 0.85f), RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    DiceView(d, roll = game.turnNumber to d)
                    Text("${d[0] + d[1]}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Gold)
                }
            }
            // The one button for the moment sits at the bottom corner of the board: Roll, then End in the same place.
            val free = game.phase == "main" && myTurn && game.subphase == null
            if (!spectating && !tradeOpen) Column(
                Modifier.align(Alignment.BottomEnd).padding(12.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (game.undo != null) GlassButton(onClick = { vm.act("undo") }) { Text("↶ Undo (${game.undo.left})", fontSize = 13.sp) }
                if (free) {
                    val pulse = if (LocalAnimate.current && !game.rolled) androidx.compose.animation.core.rememberInfiniteTransition(label = "roll").animateFloat(
                        1f, 1.08f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(700), androidx.compose.animation.core.RepeatMode.Reverse), label = "p").value else 1f
                    RoundTurnButton(roll = !game.rolled, pulse = pulse) { vm.act(if (game.rolled) "endTurn" else "roll") }
                }
            }
            if (game.phase == "ended" && game.winner != null && animate) Confetti()
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

        if (spectating) {
            Row(Modifier.fillMaxWidth().background(NavyDark).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("You are watching. You see what every player sees.", Modifier.weight(1f), fontSize = 13.sp, color = FoamDim)
                OutlinedButton(onClick = { dialog = GameDialog.Log }) { Text("Log") }
                OutlinedButton(onClick = { vm.leave() }) { Text("Stop") }
            }
        } else {
            Box(Modifier.onGloballyPositioned { handBounds = it.boundsInWindow() }) {
            HandRow(game, discardPick, onDev = { dialog = GameDialog.Dev }) { k ->
                if (needDiscard > 0) {
                    if (discardPick.values.sum() < needDiscard && (discardPick[k] ?: 0) < game.hand(k)) discardPick[k] = (discardPick[k] ?: 0) + 1
                    return@HandRow
                }
                if (!tradeOpen) { tradeOpen = true; picked = null }
                // with the panel open, a card from your hand goes into what you give
                if (canTrade && (tradeGet[k] ?: 0) == 0 && (tradeGive[k] ?: 0) < game.hand(k)) tradeGive[k] = (tradeGive[k] ?: 0) + 1
            }
            }
        }
    }

    // the cards of the last roll, flying from their tiles to the players
    if (flights.isNotEmpty()) {
        fun toRoot(o: Offset) = o - rootPos
        GainFlights(
            flights,
            from = { f -> val t = f.tile?.let { board?.tiles?.getOrNull(it) }
                if (t != null) toRoot(boardBounds.topLeft + boardView.toScreen(t.x, t.y)) else toRoot(boardBounds.center) },
            to = { f ->
                if (f.player == game.you) {
                    // the card of that resource in your hand: the hand row is six equal cells (five resources and the Dev card)
                    val w = handBounds.width; val pad = 8f; val gap = 8f; val cell = (w - 22f - 5 * gap) / 6f
                    val cx = handBounds.left + pad + cell * (RESOURCES.indexOf(f.res) + 0.5f) + gap * RESOURCES.indexOf(f.res)
                    toRoot(Offset(cx, handBounds.center.y))
                } else {
                    val n = max(1, game.players.size)
                    toRoot(Offset(stripBounds.left + stripBounds.width * (f.player + 0.5f) / n, stripBounds.center.y))
                }
            },
        )
    }
    }

    // ---------- windows ----------
    if (!spectating && game.subphase == "diamond" && (game.pendingDiamond[game.you.toString()] ?: 0) > 0) {
        DiamondDialog(game) { picks -> vm.act("diamond") { put("res", buildJsonArray { picks.forEach { add(it) } }) } }
    }
    when (val d = dialog) {
        is GameDialog.Steal -> StealDialog(d.victims, onClose = { dialog = null }) { v -> dialog = null; vm.act("robber") { put("tile", d.tile); put("victim", v) } }
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
        is GameDialog.Info -> InfoDialog(game, onClose = { dialog = null }, onTutorial = onTutorial?.let { open -> { dialog = null; open() } })
        null -> {}
    }
    if (game.phase == "ended" && showResults) {
        ResultsDialog(game, spectating, onAgain = { vm.act("rematch") }, onLeave = { vm.leave() }, onClose = { showResults = false })
    }
    LaunchedEffect(game.phase) { if (game.phase == "ended") showResults = true }
}

@Composable
private fun PlayersStrip(game: GameState) {
    Row(Modifier.fillMaxWidth().background(NavyDark).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        game.players.forEachIndexed { i, p -> PlayerCard(game, i, p, Modifier.weight(1f)) }
    }
}

/** One player, as on the web: avatar, name and points badge; cards, development cards, knights and longest road; the pieces left; and a bar towards the target. */
@Composable
private fun PlayerCard(game: GameState, i: Int, p: com.hexlands.app.net.PlayerView, modifier: Modifier) {
    val color = Color(parseColor(p.color))
    val turn = game.turn == i && game.phase != "ended"
    val left = game.vpTarget - p.vp
    val shape = RoundedCornerShape(14.dp)
    val bg = if (turn) Color(color.red * 0.45f + 0.1f, color.green * 0.45f + 0.1f, color.blue * 0.45f + 0.1f) else Color(0xFF14294F)
    Box(modifier.clip(shape).background(bg).border(if (turn) 2.5.dp else 0.dp, if (turn) Color.White else Color.Transparent, shape)) {
        // a stripe in the player's colour down the left edge
        // (matchParentSize: a bar that filled the height itself would make the card as tall as the whole screen)
        Box(Modifier.matchParentSize()) { Box(Modifier.align(Alignment.CenterStart).fillMaxHeight().width(4.dp).background(color)) }
        Column(Modifier.padding(start = 9.dp, end = 5.dp, top = 6.dp, bottom = 3.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (p.bot != null) Text("🤖", fontSize = 11.sp) else Box(Modifier.size(8.dp).clip(CircleShape).background(if (p.connected) Good else Color.Gray))
                Text(
                    p.name, Modifier.weight(1f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold,
                    textDecoration = if (i == game.you) androidx.compose.ui.text.style.TextDecoration.Underline else null,
                )
                Box(Modifier.size(24.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                    Text("${p.vp}", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = if (left in 1..2) Color(0xFFB36B00) else Color(0xFF14294F))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                StatPair(p.cards) { drawRoundRect(Color(0xFFF2D27A), Offset(size.width * 0.1f, size.height * 0.1f), androidx.compose.ui.geometry.Size(size.width * 0.8f, size.height * 0.8f), androidx.compose.ui.geometry.CornerRadius(3f)) }
                StatPair(p.devCount) { drawRoundRect(Color(0xFF2F6FE0), Offset.Zero, size, androidx.compose.ui.geometry.CornerRadius(3f)); drawLine(Color.White, Offset(size.width * 0.5f, size.height * 0.3f), Offset(size.width * 0.5f, size.height * 0.55f), size.width * 0.14f); drawCircle(Color.White, size.width * 0.08f, Offset(size.width * 0.5f, size.height * 0.75f)) }
                StatPair(p.knights, if (game.largestArmy?.p == i) Gold else Foam) {
                    drawPath(Path().apply { moveTo(size.width * 0.5f, 0f); lineTo(size.width, size.height * 0.2f); lineTo(size.width * 0.9f, size.height * 0.65f); lineTo(size.width * 0.5f, size.height); lineTo(size.width * 0.1f, size.height * 0.65f); lineTo(0f, size.height * 0.2f); close() }, Color(0xFFB3BCC7))
                    drawLine(Color(0xFFC62828), Offset(size.width * 0.5f, size.height * 0.2f), Offset(size.width * 0.5f, size.height * 0.75f), size.width * 0.16f); drawLine(Color(0xFFC62828), Offset(size.width * 0.28f, size.height * 0.42f), Offset(size.width * 0.72f, size.height * 0.42f), size.width * 0.16f)
                }
                StatPair(p.roadLen, if (game.longestRoad?.p == i) Gold else Foam) { drawArc(Color.White, 180f, 180f, false, Offset(size.width * 0.1f, size.height * 0.25f), androidx.compose.ui.geometry.Size(size.width * 0.8f, size.height * 0.9f), style = Stroke(size.width * 0.18f, cap = StrokeCap.Round)) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                StatPair(p.pieces.road, FoamDim) { rotate(-35f) { drawRoundRect(color, Offset(0f, size.height * 0.35f), androidx.compose.ui.geometry.Size(size.width, size.height * 0.3f), androidx.compose.ui.geometry.CornerRadius(3f)) } }
                StatPair(p.pieces.settlement, FoamDim) { drawPath(Path().apply { moveTo(size.width * 0.5f, 0f); lineTo(size.width, size.height * 0.45f); lineTo(size.width * 0.85f, size.height); lineTo(size.width * 0.15f, size.height); lineTo(0f, size.height * 0.45f); close() }, color) }
                StatPair(p.pieces.city, FoamDim) { drawPath(Path().apply { moveTo(0f, size.height); lineTo(0f, size.height * 0.4f); lineTo(size.width * 0.35f, size.height * 0.4f); lineTo(size.width * 0.35f, size.height * 0.1f); lineTo(size.width * 0.65f, 0f); lineTo(size.width * 0.65f, size.height * 0.4f); lineTo(size.width, size.height * 0.4f); lineTo(size.width, size.height); close() }, color) }
            }
            Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = 0.15f))) {
                Box(Modifier.fillMaxWidth((p.vp.toFloat() / game.vpTarget).coerceIn(0f, 1f)).height(3.dp).background(color))
            }
        }
    }
}

/** A small icon and a number. */
@Composable
private fun StatPair(n: Int, textColor: Color = Foam, icon: androidx.compose.ui.graphics.drawscope.DrawScope.() -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        androidx.compose.foundation.Canvas(Modifier.size(10.dp)) { icon() }
        Text("$n", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = textColor, maxLines = 1)
    }
}

@Composable
private fun HandRow(game: GameState, discarding: Map<String, Int>, onDev: () -> Unit, onTapResource: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().background(NavyDark).padding(start = 8.dp, end = 14.dp, top = 12.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RESOURCES.forEach { k ->
            val n = game.hand(k) - (discarding[k] ?: 0)   // cards you have picked to discard are taken out of the count at once
            // When a hand count goes up the card bumps and a "+n" floats away from it.
            val gain = remember { Animatable(1f) }
            var shownGain by remember { mutableStateOf(0) }
            var prev by remember { mutableStateOf(n) }
            val animate = LocalAnimate.current
            LaunchedEffect(n) {
                if (n > prev && animate) { shownGain = n - prev; gain.snapTo(0f); gain.animateTo(1f, tween(1000)) }
                prev = n
            }
            val bump = 1f + 0.18f * sin(Math.PI.toFloat() * gain.value)
            Box(Modifier.weight(1f)) {
                ResourceCard(
                    k, Modifier.fillMaxWidth().graphicsLayer { scaleX = bump; scaleY = bump }, count = n.takeIf { it > 0 }, label = RESOURCE_LABEL[k],
                    dim = n == 0, goldBadge = true, chip = discarding[k]?.takeIf { it > 0 }?.let { "−$it" }, onClick = { onTapResource(k) },
                )
                if (gain.value < 1f) Text(
                    "+$shownGain", Modifier.align(Alignment.TopCenter).graphicsLayer { translationY = -gain.value * 56.dp.toPx() - 8.dp.toPx(); alpha = 1f - gain.value * gain.value },
                    color = Good, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp,
                )
            }
        }
        DevTile(game.me?.dev?.size ?: 0, Modifier.weight(1f), onDev)
    }
}

/** The last card in the hand row: your development cards (and where the Heist card is bought). */
@Composable
private fun DevTile(count: Int, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Box(modifier.aspectRatio(0.76f).clickable(onClick = onClick)) {
        Column(
            Modifier.fillMaxSize().clip(shape).background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFF3F52A8), Color(0xFF222F6B))))
                .border(1.5.dp, Color.White.copy(alpha = if (count > 0) 0.9f else 0.35f), shape),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            Text("★", fontSize = 26.sp, color = Gold.copy(alpha = if (count > 0) 1f else 0.5f))
            Text("Dev", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = if (count > 0) 1f else 0.6f))
        }
        if (count > 0) Box(
            Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-6).dp).size(24.dp).clip(CircleShape).background(Color(0xFF1F3F9A)).border(1.5.dp, Gold, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("$count", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold) }
    }
}

/** The pill in the colour of the player whose turn it is, with the time left in it: "Your turn 0:29". */
@Composable
private fun TurnPill(game: GameState, modifier: Modifier = Modifier) {
    val p = game.players.getOrNull(game.turn) ?: return
    val color = Color(parseColor(p.color))
    val mine = game.turn == game.you
    val secs = rememberSecsLeft(game)?.first
    Row(
        modifier.clip(RoundedCornerShape(50)).background(color).border(3.dp, Color.White.copy(alpha = 0.92f), RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) { Box(Modifier.size(10.dp).clip(CircleShape).background(color)) }
        Text(if (mine) "Your turn" else "${p.name}'s turn", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (secs != null) Text("${secs / 60}:${(secs % 60).toString().padStart(2, '0')}", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.White.copy(alpha = 0.85f), maxLines = 1, softWrap = false)
    }
}
