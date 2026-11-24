package com.hexlands.app.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.net.GameState
import com.hexlands.app.net.myPlayer
import com.hexlands.app.net.parseColor
import kotlinx.serialization.json.put

/** The waiting room: who is here, bots, ready ticks, and the start button for the host. */
@Composable
fun LobbyScreen(game: GameState, vm: GameViewModel) {
    val context = LocalContext.current
    var botLevel by remember { mutableStateOf("easy") }
    val me = game.myPlayer()
    val amHost = me?.host == true
    val humans = game.players.filter { it.bot == null }
    val needReady = humans.size >= 2
    val allReady = humans.all { it.ready }
    val canStart = amHost && game.players.size >= 2 && (!needReady || allReady)
    val countdown = game.net?.countdown
    var showMaps by remember { mutableStateOf(false) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    if (showMaps) MapPickerDialog(ui.maps, ui.board?.key, onLoad = { vm.loadMaps() }, onClose = { showMaps = false }) { vm.chooseMap(it.key) }

    Box(Modifier.fillMaxSize()) {
    SeaBackground()
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Waiting room", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Gold, modifier = Modifier.weight(1f))
            Text(if (game.net?.public == true) "Public" else "Private", color = FoamDim)
        }

        Card(colors = CardDefaults.cardColors(containerColor = NavyDark), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Room code", color = FoamDim, fontSize = 12.sp)
                Text(game.code, fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, color = Gold, letterSpacing = 6.sp)
                Button(onClick = {
                    val link = vm.shareLink(game.code)
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Join my Hexlands game")
                        putExtra(Intent.EXTRA_TEXT, "Join my Hexlands game! Room code: ${game.code}\n$link")
                    }
                    context.startActivity(Intent.createChooser(send, "Invite a friend"))
                }) { Text("Share invite") }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${game.mapName} · ${game.vpTarget} points to win${if (game.opts.timer > 0) " · ${game.opts.timer}s move timer" else ""}", Modifier.weight(1f), color = FoamDim)
            if (amHost) GlassButton(onClick = { showMaps = true }) { Text("Change map", fontSize = 13.sp) }
        }

        Text("Players (${game.players.size} of 4)", fontWeight = FontWeight.Bold)
        game.players.forEachIndexed { i, p ->
            Card(colors = CardDefaults.cardColors(containerColor = NavyLight), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(Color(parseColor(p.color))))
                    Column(Modifier.weight(1f)) {
                        Text(p.name + if (i == game.you) " (you)" else "", fontWeight = FontWeight.Bold)
                        val tags = listOfNotNull(if (p.host) "Host" else null, p.bot?.let { "${it.replaceFirstChar { c -> c.uppercase() }} bot" })
                        if (tags.isNotEmpty()) Text(tags.joinToString(" · "), fontSize = 12.sp, color = FoamDim)
                    }
                    if (p.bot == null && needReady) Text(if (p.ready) "Ready" else "Not ready", color = if (p.ready) Good else FoamDim, fontSize = 13.sp)
                    if (p.bot != null && amHost) TextButton(onClick = { vm.act("removeBot") { put("seat", i) } }) { Text("Remove") }
                }
            }
        }

        if (amHost && game.players.size < 4) {
            Text("Add a bot", fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                listOf("easy", "medium", "hard").forEach { l ->
                    FilterChip(selected = botLevel == l, onClick = { botLevel = l }, label = { Text(l.replaceFirstChar { it.uppercase() }) })
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { vm.act("addBot") { put("level", botLevel) } }) { Text("Add bot") }
                OutlinedButton(onClick = { vm.act("fillBots") { put("level", botLevel) } }) { Text("Fill with bots") }
            }
        }

        if (countdown != null) Text("Everyone is ready. Starting in ${(countdown + 999) / 1000}…", color = Gold, fontWeight = FontWeight.Bold)
        else if (game.net?.public == true && game.players.size < 4) Text("Waiting for more players…", color = FoamDim)

        if (needReady && me != null && me.bot == null) {
            Button(onClick = { vm.act("ready") { put("value", !me.ready) } }, modifier = Modifier.fillMaxWidth()) { Text(if (me.ready) "Not ready" else "I'm ready") }
        }
        if (amHost) {
            GoldButton(onClick = { vm.act("start") }, enabled = canStart, modifier = Modifier.fillMaxWidth()) { Text("Start game", fontWeight = FontWeight.Bold) }
            if (game.players.size < 2) Text("Add a bot or share the code: you need at least one more player.", color = FoamDim, fontSize = 12.sp)
            else if (needReady && !allReady) Text("Waiting for everyone to tap \"I'm ready\".", color = FoamDim, fontSize = 12.sp)
        } else Text("The host starts the game.", color = FoamDim)

        TextButton(onClick = { vm.leave() }) { Text("Leave room") }
    }
    }
}
