package com.hexlands.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.Board
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.RESOURCE_LABEL
import com.hexlands.app.net.parseColor
import com.hexlands.app.tutorial.Anchor
import com.hexlands.app.tutorial.Chapter
import com.hexlands.app.tutorial.Flight
import com.hexlands.app.tutorial.Moment
import com.hexlands.app.tutorial.Pt
import com.hexlands.app.tutorial.Scene
import com.hexlands.app.tutorial.Trade
import com.hexlands.app.tutorial.TutorialRecord
import com.hexlands.app.tutorial.buildChapters
import kotlinx.coroutines.delay
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** Where board units land on the stage: the whole board fitted to [size] (the same fit as the game's board). */
private class Fit(board: Board, size: IntSize) {
    private val xs = board.vertices.map { it.x } + board.ports.map { it.x }
    private val ys = board.vertices.map { it.y } + board.ports.map { it.y }
    private val minX = (xs.minOrNull() ?: -1.0) - 0.9; private val maxX = (xs.maxOrNull() ?: 1.0) + 0.9
    private val minY = (ys.minOrNull() ?: -1.0) - 0.9; private val maxY = (ys.maxOrNull() ?: 1.0) + 0.9
    // the stage keeps the top for the player chips and the bottom for the hand, so the board is fitted into the middle
    val k = if (size.width == 0) 1f else min(size.width / (maxX - minX).toFloat(), size.height * 0.62f / (maxY - minY).toFloat())
    val origin = Offset(size.width / 2f - (((minX + maxX) / 2) * k).toFloat(), size.height * 0.47f - (((minY + maxY) / 2) * k).toFloat())
    fun at(p: Pt) = Offset(origin.x + (p.x * k).toFloat(), origin.y + (p.y * k).toFloat())
}

private fun DrawScope.hexOutline(c: Offset, k: Float): Path = Path().apply {
    val r = k * 0.97f
    for (i in 0 until 6) {
        val a = Math.toRadians(60.0 * i - 90.0)
        val x = c.x + (r * kotlin.math.cos(a)).toFloat(); val y = c.y + (r * sin(a)).toFloat()
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

/** The board of the tutorial: the real art, the recorded pieces (new ones pop in), and whatever the current scene points at. */
@Composable
private fun TutorialBoard(board: Board, scene: Scene, colors: List<Color>, me: Int, fit: Fit, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val clock by rememberClock()
    val animate = LocalAnimate.current
    val births = remember { HashMap<String, Float>() }
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { started = true }
    fun pop(key: String): Float {
        if (!animate) return 1f
        val born = births.getOrPut(key) { if (started) clock else -10f }
        val p = ((clock - born) / 0.45f).coerceIn(0f, 1f); val q = p - 1f
        return if (p >= 1f) 1f else (1f + 2.70158f * q * q * q + 1.70158f * q * q).coerceAtLeast(0f)
    }
    val pulse = if (animate) 0.6f + 0.4f * (0.5f + 0.5f * sin(clock * 6f)) else 0.9f
    Canvas(modifier) {
        val k = fit.k
        drawBoardArt(board, fit.origin, k, measurer)
        val m = scene.moment
        // tiles that are being pointed at
        for (id in scene.glowTiles) {
            val t = board.tiles.getOrNull(id) ?: continue
            val c = fit.at(Pt(t.x, t.y)); val path = hexOutline(c, k)
            drawPath(path, Color(0xFFFFD23F).copy(alpha = 0.22f * pulse)); drawPath(path, Color(0xFFFFD23F).copy(alpha = pulse), style = Stroke(max(3f, k * 0.07f), join = StrokeJoin.Round))
        }
        // roads
        for ((eid, p) in m.r) {
            val e = board.edges.getOrNull(eid.toIntOrNull() ?: continue) ?: continue
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
            val pa = fit.at(Pt(a.x, a.y)); val pb = fit.at(Pt(b.x, b.y)); val g = pop("r$eid")
            drawLine(Color.Black.copy(alpha = 0.7f), pa, pb, strokeWidth = k * 0.27f * g, cap = StrokeCap.Round)
            drawLine(colors.getOrElse(p) { Color.Gray }, pa, pb, strokeWidth = k * 0.18f * g, cap = StrokeCap.Round)
        }
        // buildings
        for ((vid, bd) in m.b) {
            val v = board.vertices.getOrNull(vid.toIntOrNull() ?: continue) ?: continue
            house(fit.at(Pt(v.x, v.y)), k * 0.32f * pop("b$vid${bd.type}${bd.p}"), colors.getOrElse(bd.p) { Color.Gray }, bd.type == "city")
        }
        for (pt in scene.extraHouses) house(fit.at(pt), k * 0.32f * pop("x${pt.x}"), colors.getOrElse(me) { Color.Gray }, false)
        // the robber
        board.tiles.getOrNull(m.robber)?.let { t ->
            robberFigure(fit.at(Pt(t.x, t.y)), k)
        }
        // a harbour and its two corners
        scene.port?.let { p ->
            drawCircle(Color(0xFFFFD23F).copy(alpha = pulse), k * 0.62f, fit.at(Pt(p.x, p.y)), style = Stroke(max(3f, k * 0.07f)))
            p.vx.forEach { v -> glowSpot(fit.at(Pt(v[0], v[1])), k * 0.42f, pulse) }
        }
        // spots you may build on
        for (id in scene.spotEdges) board.edges.getOrNull(id)?.let { e -> val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]; glowSpot(fit.at(Pt((a.x + b.x) / 2, (a.y + b.y) / 2)), k * 0.36f, pulse) }
        for (id in scene.spotCorners) board.vertices.getOrNull(id)?.let { glowSpot(fit.at(Pt(it.x, it.y)), k * 0.42f, pulse) }
        // the piece you are about to build, with a green tick
        scene.ghostRoad?.let { id -> board.edges.getOrNull(id)?.let { e ->
            val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]; val pa = fit.at(Pt(a.x, a.y)); val pb = fit.at(Pt(b.x, b.y))
            drawLine(Color.White, pa, pb, strokeWidth = k * 0.33f, cap = StrokeCap.Round); drawLine(colors.getOrElse(me) { Color.Gray }, pa, pb, strokeWidth = k * 0.22f, cap = StrokeCap.Round)
            tick((pa + pb) / 2f - Offset(0f, k * 0.5f), k)
        } }
        scene.ghostCorner?.let { id -> board.vertices.getOrNull(id)?.let { v ->
            val c = fit.at(Pt(v.x, v.y)); drawCircle(Color.White.copy(alpha = 0.35f), k * 0.5f, c); house(c, k * 0.36f, colors.getOrElse(me) { Color.Gray }, scene.ghostCity); tick(c - Offset(0f, k * 0.75f), k)
        } }
        scene.flashCorner?.let { id -> board.vertices.getOrNull(id)?.let { v -> drawCircle(Color(0xFFFFD23F).copy(alpha = pulse), k * 0.5f, fit.at(Pt(v.x, v.y)), style = Stroke(max(3f, k * 0.08f))) } }
    }
}

private fun DrawScope.tick(c: Offset, k: Float) {
    val s = k * 0.3f
    drawRoundRect(Color(0xFF1F9D45), c - Offset(s, s), androidx.compose.ui.geometry.Size(2 * s, 2 * s), androidx.compose.ui.geometry.CornerRadius(s * 0.4f))
    drawRoundRect(Color.White, c - Offset(s, s), androidx.compose.ui.geometry.Size(2 * s, 2 * s), androidx.compose.ui.geometry.CornerRadius(s * 0.4f), style = Stroke(max(2f, s * 0.2f)))
    drawPath(Path().apply { moveTo(c.x - s * 0.5f, c.y); lineTo(c.x - s * 0.1f, c.y + s * 0.4f); lineTo(c.x + s * 0.55f, c.y - s * 0.4f) }, Color.White, style = Stroke(max(2.5f, s * 0.25f), cap = StrokeCap.Round, join = StrokeJoin.Round))
}

/** A card flying across the stage from where it was paid to where it goes. */
@Composable
private fun Fly(f: Flight, from: Offset, to: Offset) {
    val animate = LocalAnimate.current
    val p = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(Unit) { if (animate) { delay(60 + f.delayMs); p.animateTo(1f, tween(900, easing = FastOutSlowInEasing)) } }
    if (p.value <= 0f || (animate && p.value >= 1f)) return
    val pos = Offset(from.x + (to.x - from.x) * p.value, from.y + (to.y - from.y) * p.value - 30f * sin(Math.PI.toFloat() * p.value))
    Box(Modifier.offset { IntOffset((pos.x - 16.dp.toPx()).toInt(), (pos.y - 20.dp.toPx()).toInt()) }.size(32.dp, 40.dp)) {
        if (f.res == "back") Box(Modifier.fillMaxSize().clip(RoundedCornerShape(6.dp)).background(Color(0xFF3F52A8)).border(1.5.dp, Color.White, RoundedCornerShape(6.dp)))
        else ResourceCard(f.res, Modifier.fillMaxSize())
    }
}

@Composable
private fun PlayerChip(name: String, color: Color, vp: Int, cards: Int, isMe: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(12.dp)).background(NavyDark.copy(alpha = 0.92f)).border(if (isMe) 2.dp else 1.dp, color, RoundedCornerShape(12.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
        Text(if (isMe) "You" else name, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
        Text("★$vp", fontSize = 11.sp, color = Gold)
        Text("🂠$cards", fontSize = 11.sp, color = FoamDim)
    }
}

private val EMOJI = mapOf("settlement" to "🏠", "city" to "🏰", "road" to "🛣️", "knight" to "🛡️", "vp" to "⭐", "roadBuilding" to "🛣️", "yearOfPlenty" to "🎁", "monopoly" to "💰", "heist" to "🥷", "dev" to "🃏")

@Composable
private fun InfoPanel(panel: com.hexlands.app.tutorial.Panel, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(NavyDark.copy(alpha = 0.96f)).border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(16.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(panel.title, fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 16.sp)
        panel.rows.forEach { row ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.icon?.let { Text(EMOJI[it] ?: "", fontSize = 18.sp) }
                Column(Modifier.weight(1f)) {
                    Text(row.label, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    row.note?.let { Text(it, fontSize = 11.sp, color = FoamDim) }
                }
                if (row.cost.isNotEmpty()) CostPictures(row.cost, 20.dp)
                row.points?.let { Text(it, fontWeight = FontWeight.ExtraBold, color = Gold, fontSize = 18.sp) }
            }
        }
    }
}

/** The trade panel as in the game, driven by the tutorial: same cards, rows and round buttons; [pulse] says what the "finger" is tapping. */
@Composable
private fun TradeDemo(t: Trade, modifier: Modifier = Modifier) {
    Row(modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Paper).padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Canvas(Modifier.size(28.dp)) { bankIcon(Color(0xFF8C7A55)) }
                Row(Modifier.weight(1f).padding(start = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    RESOURCES.forEach { k -> ResourceCard(k, Modifier.weight(1f), count = t.get[k]?.takeIf { it > 0 }, highlight = "want:$k" in t.pulse) }
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Paper).padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Emblem(Color(0xFFDCE3EE)) { peopleIcon(Color(0xFF5B6B84)) }
                    Canvas(Modifier.size(width = 22.dp, height = 28.dp)) { arrow(Color(0xFF2FB344), down = true) }
                    if (t.get.isEmpty()) Text("Tap what you want above", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink.copy(alpha = 0.75f))
                    else t.get.filterValues { it > 0 }.forEach { (k, n) -> ResourceCard(k, Modifier.width(44.dp), count = n) }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Emblem(Color(0xFFD8392B)) { personIcon(Color.White) }
                    Canvas(Modifier.size(width = 22.dp, height = 28.dp)) { arrow(Color(0xFFD8392B), down = false) }
                    if (t.give.isEmpty()) Text("Tap cards in your hand", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink.copy(alpha = 0.75f))
                    else t.give.filterValues { it > 0 }.forEach { (k, n) -> ResourceCard(k, Modifier.width(44.dp), count = n) }
                }
                Text(t.hint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ink)
            }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(NavyDark).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RESOURCES.forEach { k ->
                    val n = (t.hand[k] ?: 0) - (t.give[k] ?: 0)
                    if ((t.hand[k] ?: 0) > 0) ResourceCard(k, Modifier.weight(1f), count = n, chip = "${t.rates[k] ?: 4}:1", dim = n == 0, highlight = "hand:$k" in t.pulse || k in t.flash)
                    else Box(Modifier.weight(1f))
                }
            }
            if (t.buys.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                t.buys.forEach { b ->
                    GoldButton(onClick = {}, modifier = Modifier.then(if ("buy:$b" in t.pulse) Modifier.border(3.dp, Color.White, RoundedCornerShape(50)) else Modifier), padding = androidx.compose.foundation.layout.PaddingValues(14.dp, 8.dp)) {
                        Text(if (b == "dev") "Buy a Dev card" else "Buy the Heist", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RoundButton("Trade with the bank", enabled = t.bank, onClick = {}) { withTransform({ scale(0.72f, 0.72f, Offset.Zero) }) { bankIcon(Color.White) }; checkIcon(Color.White) }
            RoundButton("Send the offer to the players", enabled = t.players, onClick = {}) { withTransform({ scale(0.72f, 0.72f, Offset.Zero) }) { peopleIcon(Color.White) }; checkIcon(Color.White) }
        }
    }
}

/**
 * The animated tutorial: a recorded game replayed chapter by chapter (the same as the web game's tutorial), with a caption, play/pause, back and next,
 * and a dot for each chapter. With animations off (the screen tests) a step shows its final picture and nothing advances by itself.
 */
@Composable
fun TutorialScreen(record: TutorialRecord, onClose: () -> Unit, startChapter: Int = 0, startStep: Int = 0, embedded: Boolean = false) {
    val chapters = remember(record) { buildChapters(record) }
    val animate = LocalAnimate.current
    var chIdx by remember { mutableIntStateOf(startChapter.coerceIn(0, chapters.lastIndex)) }
    var stIdx by remember { mutableIntStateOf(startStep) }
    var playing by remember { mutableStateOf(animate) }
    val ch: Chapter = chapters[chIdx]
    val step = ch.steps[stIdx.coerceIn(0, ch.steps.lastIndex)]
    var frame by remember { mutableIntStateOf(0) }
    var runId by remember { mutableIntStateOf(0) }

    fun go(c: Int, s: Int) { chIdx = c.coerceIn(0, chapters.lastIndex); stIdx = s; runId++ }
    fun next() { if (stIdx + 1 < ch.steps.size) go(chIdx, stIdx + 1) else if (chIdx + 1 < chapters.size) go(chIdx + 1, 0) else playing = false }
    fun prev() { if (stIdx > 0) go(chIdx, stIdx - 1) else if (chIdx > 0) go(chIdx - 1, chapters[chIdx - 1].steps.lastIndex) }

    // play the step: each frame at its time, then (when playing) on to the next step
    LaunchedEffect(chIdx, stIdx, runId, playing) {
        if (!animate) { frame = step.frames.lastIndex; return@LaunchedEffect }
        frame = 0
        var t = 0L
        for (i in step.frames.indices) {
            val at = step.frames[i].atMs
            if (at > t) { delay(at - t); t = at }
            frame = i
        }
        if (playing) { delay(max(0L, step.durMs - t)); next() }
    }

    val scene = step.frames[frame.coerceIn(0, step.frames.lastIndex)].scene
    val colors = remember(record) { record.players.map { Color(parseColor(it.color)) } }
    var stage by remember { mutableStateOf(IntSize.Zero) }
    val fit = remember(record, stage) { Fit(record.board, stage) }
    val density = LocalDensity.current

    Column(Modifier.fillMaxSize().background(Navy).then(if (embedded) Modifier else Modifier.safeDrawingPadding())) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = if (embedded) 6.dp else 0.dp, bottom = if (embedded) 4.dp else 0.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${chIdx + 1}. ${ch.title}", Modifier.weight(1f), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Gold)
            if (!embedded) Text("✕", Modifier.clip(CircleShape).clickable(onClick = onClose).padding(12.dp).semantics { contentDescription = "Close the tutorial" }, fontSize = 18.sp)
        }
        Box(Modifier.weight(1f).fillMaxWidth().onSizeChanged { stage = it }) {
            if (stage.width > 0) {
                TutorialBoard(record.board, scene, colors, record.me, fit, Modifier.fillMaxSize())
                // player chips
                Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    record.players.forEachIndexed { i, p ->
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            PlayerChip(p.name, colors[i], scene.moment.vp.getOrElse(i) { 0 }, scene.moment.cards.getOrElse(i) { 0 }, i == record.me)
                            scene.bubbles.filter { it.player == i }.forEach { bub ->
                                Text(bub.text, Modifier.padding(top = 4.dp).clip(RoundedCornerShape(10.dp)).background(if (bub.good) Color(0xFF1F9D45) else Color(0xFFC62828)).padding(horizontal = 8.dp, vertical = 3.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                // labels on the board
                scene.labels.forEach { l ->
                    val c = fit.at(l.at)
                    Text(l.text, Modifier.offset { IntOffset((c.x - 60.dp.toPx()).toInt(), (c.y - 40.dp.toPx()).toInt()) }.width(120.dp).clip(RoundedCornerShape(10.dp)).background(NavyDark.copy(alpha = 0.92f)).border(1.dp, Gold, RoundedCornerShape(10.dp)).padding(vertical = 3.dp),
                        textAlign = TextAlign.Center, fontWeight = FontWeight.ExtraBold, fontSize = if (l.big) 16.sp else 12.sp, color = Gold)
                }
                scene.longestRoadLabelAt?.let { e ->
                    val bd = record.board.edges[e]; val a = record.board.vertices[bd.v[0]]; val b = record.board.vertices[bd.v[1]]
                    val c = fit.at(Pt((a.x + b.x) / 2, (a.y + b.y) / 2))
                    Text("Longest Road +2", Modifier.offset { IntOffset((c.x - 70.dp.toPx()).toInt(), (c.y - 50.dp.toPx()).toInt()) }.width(140.dp).clip(RoundedCornerShape(10.dp)).background(NavyDark).border(1.dp, Gold, RoundedCornerShape(10.dp)).padding(vertical = 4.dp), textAlign = TextAlign.Center, fontWeight = FontWeight.ExtraBold, color = Gold)
                }
                scene.dice?.let { d -> if (d.size == 2) Row(Modifier.align(Alignment.TopStart).padding(top = 64.dp, start = 10.dp).clip(RoundedCornerShape(12.dp)).background(NavyDark.copy(alpha = 0.9f)).padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DiceView(d, roll = d); Text("${d[0] + d[1]}", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Gold) } }
                scene.reveal?.let { rv ->
                    Column(Modifier.align(Alignment.Center).clip(RoundedCornerShape(16.dp)).background(NavyDark).border(2.dp, Gold, RoundedCornerShape(16.dp)).padding(horizontal = 24.dp, vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(EMOJI[rv.kind] ?: "🃏", fontSize = 36.sp); Text(rv.name, fontWeight = FontWeight.ExtraBold, color = Gold)
                    }
                }
                if (scene.trophy) { Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) { Text("🏆", fontSize = 64.sp); Text("You win!", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Gold) }; if (animate) Confetti() }
                scene.panel?.let { InfoPanel(it, Modifier.align(Alignment.Center).padding(horizontal = 14.dp)) }
                // flying cards (a new set each time the scene changes)
                key(chIdx, stIdx, frame, runId) {
                    scene.flights.forEach { f ->
                        fun pos(a: Anchor): Offset = with(density) { when (a) {
                            is Anchor.Tile -> fit.at(Pt(record.board.tiles[a.id].x, record.board.tiles[a.id].y))
                            is Anchor.Chip -> Offset(stage.width * (a.player + 0.5f) / record.players.size, 22.dp.toPx())
                            is Anchor.BelowChip -> Offset(stage.width * (a.player + 0.5f) / record.players.size, 140.dp.toPx())
                            Anchor.Hand -> Offset(stage.width * 0.4f, stage.height - 120.dp.toPx())
                            Anchor.Bank -> Offset(stage.width * 0.08f, stage.height - 330.dp.toPx())
                        } }
                        Fly(f, pos(f.from), pos(f.to))
                    }
                }
                // the trade panel or your hand
                val trade = scene.trade
                if (trade != null) TradeDemo(trade, Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp))
                else Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(NavyDark.copy(alpha = 0.92f)).padding(start = 8.dp, end = 14.dp, top = 12.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RESOURCES.forEach { k ->
                        val n = scene.moment.hand[k] ?: 0
                        ResourceCard(k, Modifier.weight(1f), count = n.takeIf { it > 0 }, label = RESOURCE_LABEL[k], dim = n == 0, goldBadge = true, highlight = scene.pulseHand == k)
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().background(NavyDark).padding(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(step.caption, Modifier.fillMaxWidth().semantics { contentDescription = step.caption }, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally)) {
                chapters.forEachIndexed { i, c ->
                    Box(Modifier.size(width = 18.dp, height = 18.dp).clickable { go(i, 0) }.semantics { contentDescription = c.title }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(if (i == chIdx) 11.dp else 8.dp).clip(CircleShape).background(if (i == chIdx) Gold else if (i < chIdx) Good.copy(alpha = 0.8f) else Color.White.copy(alpha = 0.3f)))
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                GlassButton(onClick = { playing = false; prev() }) { Text("◀") }
                GoldButton(onClick = {
                    playing = !playing
                    if (playing && chIdx == chapters.lastIndex && stIdx == ch.steps.lastIndex) go(0, 0) else runId++
                }, modifier = Modifier.width(110.dp)) { Text(if (playing) "❚❚ Pause" else "▶ Play", fontWeight = FontWeight.Bold) }
                GlassButton(onClick = { playing = false; next() }) { Text("▶") }
            }
        }
    }
}
