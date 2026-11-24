package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.net.GameState
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.hand
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private val Paper = Color(0xFFF5F1E6)
private val Ink = Color(0xFF3C4A5E)

// ---- small pictures for the panel ----
private fun DrawScope.bankIcon(c: Color) {
    val w = size.width; val h = size.height
    drawPath(Path().apply { moveTo(w * 0.5f, h * 0.1f); lineTo(w * 0.92f, h * 0.38f); lineTo(w * 0.08f, h * 0.38f); close() }, c)
    for (i in 0 until 4) drawRect(c, Offset(w * (0.16f + i * 0.2f), h * 0.44f), androidx.compose.ui.geometry.Size(w * 0.1f, h * 0.34f))
    drawRect(c, Offset(w * 0.06f, h * 0.82f), androidx.compose.ui.geometry.Size(w * 0.88f, h * 0.09f))
}
private fun DrawScope.peopleIcon(c: Color) {
    val w = size.width; val h = size.height
    fun person(cx: Float, top: Float, r: Float) {
        drawCircle(c, r, Offset(cx * w, top * h))
        drawPath(Path().apply { moveTo((cx - 0.2f) * w, (top + 0.5f) * h); quadraticTo(cx * w, (top - 0.02f + r / h + 0.1f) * h, (cx + 0.2f) * w, (top + 0.5f) * h); close() }, c)
    }
    person(0.5f, 0.32f, w * 0.13f); person(0.22f, 0.42f, w * 0.1f); person(0.78f, 0.42f, w * 0.1f)
}
private fun DrawScope.personIcon(c: Color) {
    val w = size.width; val h = size.height
    drawCircle(c, w * 0.17f, Offset(w * 0.5f, h * 0.34f))
    drawPath(Path().apply { moveTo(w * 0.2f, h * 0.82f); quadraticTo(w * 0.5f, h * 0.38f, w * 0.8f, h * 0.82f); close() }, c)
}
private fun DrawScope.checkIcon(c: Color) {
    val w = size.width; val h = size.height
    drawPath(Path().apply { moveTo(w * 0.62f, h * 0.55f); lineTo(w * 0.76f, h * 0.7f); lineTo(w * 0.98f, h * 0.38f) }, c, style = Stroke(w * 0.1f, cap = StrokeCap.Round))
}
private fun DrawScope.arrow(c: Color, down: Boolean) {
    val w = size.width; val h = size.height
    val p = Path().apply {
        if (down) { moveTo(w * 0.35f, 0f); lineTo(w * 0.65f, 0f); lineTo(w * 0.65f, h * 0.5f); lineTo(w, h * 0.5f); lineTo(w * 0.5f, h); lineTo(0f, h * 0.5f); lineTo(w * 0.35f, h * 0.5f) }
        else { moveTo(w * 0.35f, h); lineTo(w * 0.65f, h); lineTo(w * 0.65f, h * 0.5f); lineTo(w, h * 0.5f); lineTo(w * 0.5f, 0f); lineTo(0f, h * 0.5f); lineTo(w * 0.35f, h * 0.5f) }
        close()
    }
    drawPath(p, c)
}

/** A round button that holds one of the pictures above. */
@Composable
private fun RoundButton(description: String, enabled: Boolean = true, onClick: () -> Unit, strong: Boolean = false, icon: DrawScope.() -> Unit) {
    val face = if (!enabled) Brush.verticalGradient(listOf(Color(0xFF2E5C8E), Color(0xFF244B77))) else Brush.verticalGradient(listOf(Color(0xFF3FC3EA), Color(0xFF1B8FC4)))
    Box(
        Modifier.size(56.dp).shadow(if (enabled) 6.dp else 0.dp, CircleShape).clip(CircleShape).background(face)
            .border(2.dp, Color.White.copy(alpha = if (enabled) 0.95f else 0.35f), CircleShape)
            .clickable(enabled = enabled, onClick = onClick).semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) { Canvas(Modifier.size(30.dp)) { icon() } }
}

@Composable
private fun Emblem(color: Color, icon: DrawScope.() -> Unit) {
    Box(Modifier.size(46.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) { Canvas(Modifier.size(28.dp)) { icon() } }
}

/**
 * The trade panel, drawn over the board: tap what you want in the top row, tap cards in your hand (below) for what you give, then send the offer to the
 * other players, or trade with the bank at its rate. [give] and [get] are what has been picked so far.
 */
@Composable
fun TradePanel(
    game: GameState, vm: GameViewModel, give: SnapshotStateMap<String, Int>, get: SnapshotStateMap<String, Int>,
    canTrade: Boolean, onClose: () -> Unit, modifier: Modifier = Modifier,
) {
    val mine = game.trade?.takeIf { it.from == game.you }
    fun ratio(k: String) = game.me?.ratios?.get(k) ?: 4
    // a bank trade is one kind for another: you give a multiple of the rate, and get that many cards
    val giveKinds = give.filterValues { it > 0 }.keys; val getKinds = get.filterValues { it > 0 }.keys
    val bankOk = canTrade && giveKinds.size == 1 && getKinds.size == 1 && giveKinds.first() != getKinds.first() &&
        give.getValue(giveKinds.first()) == get.getValue(getKinds.first()) * ratio(giveKinds.first()) && (game.bank[getKinds.first()] ?: 0) >= get.getValue(getKinds.first())
    val offerOk = canTrade && give.values.sum() > 0 && get.values.sum() > 0 && giveKinds.none { it in getKinds }

    Row(modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (mine != null) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Paper).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Your offer is open", fontWeight = FontWeight.Bold, color = Ink)
                Text("You give ${resText(mine.give)}.  You get ${resText(mine.get)}.", fontSize = 12.sp, color = Ink)
                game.players.forEachIndexed { i, p ->
                    if (i == game.you) return@forEachIndexed
                    val counter = mine.counters[i.toString()]
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(p.name, Modifier.weight(1f), fontWeight = FontWeight.SemiBold, color = Ink, fontSize = 13.sp)
                        when {
                            counter != null -> {
                                Text("counter: gives ${resText(counter.give)}, wants ${resText(counter.get)}", Modifier.weight(2f), fontSize = 11.sp, color = Ink)
                                GoldButton(onClick = { vm.act("confirm") { put("with", i); put("counter", true) } }, padding = androidx.compose.foundation.layout.PaddingValues(12.dp, 5.dp)) { Text("Take", fontSize = 12.sp) }
                                GlassTextButton("No") { vm.act("declineCounter") { put("with", i) } }
                            }
                            i in mine.accepted -> GoldButton(onClick = { vm.act("confirm") { put("with", i) } }, padding = androidx.compose.foundation.layout.PaddingValues(12.dp, 5.dp)) { Text("Accepted: trade", fontSize = 12.sp) }
                            i in mine.declined -> Text("declined", color = Bad, fontSize = 12.sp)
                            else -> Text("thinking…", color = Ink.copy(alpha = 0.6f), fontSize = 12.sp)
                        }
                    }
                }
                GlassTextButton("Cancel offer") { vm.act("cancelTrade") }
            }

            // what you want: the bank and the players have every kind
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Paper).padding(horizontal = 10.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Canvas(Modifier.size(34.dp)) { bankIcon(Color(0xFF8C7A55)) }
                Row(Modifier.weight(1f).padding(start = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RESOURCES.forEach { k ->
                        ResourceCard(k, Modifier.weight(1f), count = get[k]?.takeIf { it > 0 }, onClick = { if ((give[k] ?: 0) == 0) get[k] = (get[k] ?: 0) + 1 })
                    }
                }
            }

            // the offer so far
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Paper).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Emblem(Color(0xFFDCE3EE)) { peopleIcon(Color(0xFF5B6B84)) }
                    Canvas(Modifier.size(width = 26.dp, height = 32.dp)) { arrow(Color(0xFF2FB344), down = true) }
                    if (getKinds.isEmpty()) Text("Tap what you want above", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Ink.copy(alpha = 0.75f))
                    else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        getKinds.forEach { k -> ResourceCard(k, Modifier.width(56.dp), count = get[k], onClick = { val n = (get[k] ?: 0) - 1; if (n <= 0) get.remove(k) else get[k] = n }) }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.copy(alpha = 0.15f)))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Emblem(Color(0xFFD8392B)) { personIcon(Color.White) }
                    Canvas(Modifier.size(width = 26.dp, height = 32.dp)) { arrow(Color(0xFFD8392B), down = false) }
                    if (giveKinds.isEmpty()) Text("Tap cards in your hand", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink.copy(alpha = 0.75f))
                    else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        giveKinds.forEach { k -> ResourceCard(k, Modifier.width(56.dp), count = give[k], onClick = { val n = (give[k] ?: 0) - 1; if (n <= 0) give.remove(k) else give[k] = n }) }
                    }
                }
                Text(
                    if (!canTrade) "You can trade on your turn, after you roll the dice." else "Pick what you want, then what you give.",
                    fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink,
                )
            }

            // the bank's prices for what you hold
            val rates = RESOURCES.filter { game.hand(it) >= ratio(it) }
            if (rates.isNotEmpty()) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(NavyDark).padding(horizontal = 10.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rates.forEach { k ->
                    ResourceCard(k, Modifier.width(54.dp), count = game.hand(k) / ratio(k), chip = "${ratio(k)}:1", onClick = {
                        if ((get[k] ?: 0) == 0) { val have = game.hand(k); val n = (give[k] ?: 0) + ratio(k); give[k] = if (n <= have) n else ratio(k) }
                    })
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            RoundButton("Trade with the bank", enabled = bankOk, onClick = {
                val g = giveKinds.first(); val w = getKinds.first(); val times = get.getValue(w)
                give.clear(); get.clear(); vm.bankTrade(g, w, times)
            }) { withTransform({ scale(0.72f, 0.72f, Offset.Zero) }) { bankIcon(Color.White) }; checkIcon(Color.White) }
            RoundButton("Send the offer to the players", enabled = offerOk, onClick = {
                vm.act("offer") {
                    put("give", buildJsonObject { give.forEach { (k, n) -> if (n > 0) put(k, n) } })
                    put("get", buildJsonObject { get.forEach { (k, n) -> if (n > 0) put(k, n) } })
                }
                give.clear(); get.clear()
            }) { withTransform({ scale(0.72f, 0.72f, Offset.Zero) }) { peopleIcon(Color.White) }; checkIcon(Color.White) }
            RoundButton("Close the trade panel", onClick = onClose) {
                drawLine(Color.White, Offset(size.width * 0.2f, size.height * 0.2f), Offset(size.width * 0.8f, size.height * 0.8f), strokeWidth = size.width * 0.14f, cap = StrokeCap.Round)
                drawLine(Color.White, Offset(size.width * 0.8f, size.height * 0.2f), Offset(size.width * 0.2f, size.height * 0.8f), strokeWidth = size.width * 0.14f, cap = StrokeCap.Round)
            }
        }
    }
}

@Composable
private fun GlassTextButton(text: String, onClick: () -> Unit) {
    Text(text, Modifier.clip(RoundedCornerShape(50)).border(1.dp, Ink.copy(alpha = 0.4f), RoundedCornerShape(50)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 5.dp), fontSize = 12.sp, color = Ink, fontWeight = FontWeight.SemiBold)
}
