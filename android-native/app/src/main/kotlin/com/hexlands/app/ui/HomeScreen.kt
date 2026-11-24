package com.hexlands.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import com.hexlands.app.BuildConfig
import com.hexlands.app.update.UpdateState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.GameViewModel
import com.hexlands.app.UiState
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(ui: UiState, vm: GameViewModel) {
    var name by remember { mutableStateOf(vm.name) }
    var publicRoom by remember { mutableStateOf(true) }
    var showRooms by remember { mutableStateOf(false) }

    fun needName(then: () -> Unit) {
        if (name.trim().isEmpty()) vm.showMessage("Enter your name first.") else { vm.setName(name); then() }
    }

    Box(Modifier.fillMaxSize()) {
    SeaBackground()
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Appear(0) { IslandHero(Modifier.fillMaxWidth(0.78f)) }
        Appear(1) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "HEXLANDS", fontSize = 40.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp,
                    style = androidx.compose.ui.text.TextStyle(
                        brush = Brush.verticalGradient(listOf(Color(0xFFFFF1A6), Color(0xFFFFC72E), Color(0xFFE08A00))),
                        shadow = Shadow(Color(0xAA000000), Offset(0f, 6f), 14f),
                    ),
                )
                Text("Build, trade and settle the island", color = Foam.copy(alpha = 0.85f))
            }
        }

        UpdateCard(ui, vm)

        ui.notice?.let {
            Card(colors = CardDefaults.cardColors(containerColor = NavyDark), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(it, Modifier.weight(1f))
                    TextButton(onClick = { vm.consumeNotice() }) { Text("OK") }
                }
            }
        }

        Appear(2) {
            OutlinedTextField(
                value = name, onValueChange = { name = it.take(16) }, label = { Text("Your name") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words), modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
            )
        }

        Appear(3) {
            GoldButton(onClick = { needName { vm.quickPlay() } }, enabled = !ui.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Quick play", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    Text("Join a public game with players from anywhere", fontSize = 11.sp)
                }
            }
        }

        Appear(4) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassButton(onClick = { showRooms = true; vm.loadRooms() }, modifier = Modifier.weight(1f)) { Text("Public rooms") }
                GlassButton(onClick = { needName { vm.createRoom(publicRoom) } }, enabled = !ui.busy, modifier = Modifier.weight(1f)) { Text("Create a room") }
            }
        }
        Appear(5) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(selected = publicRoom, onClick = { publicRoom = true }, label = { Text("Public") })
                FilterChip(selected = !publicRoom, onClick = { publicRoom = false }, label = { Text("Private") })
                Text(if (publicRoom) "Anyone can find it" else "Only people with the code", color = FoamDim, fontSize = 12.sp)
            }
        }

        Appear(6) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("or join a friend", color = FoamDim, fontSize = 13.sp)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = ui.joinCode, onValueChange = { vm.setJoinCode(it) }, label = { Text("Room code") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters), modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(16.dp),
                    )
                    GoldButton(onClick = { needName { vm.joinRoom(ui.joinCode) } }, enabled = !ui.busy && ui.joinCode.length == 5) { Text("Join", fontWeight = FontWeight.Bold) }
                    GlassButton(onClick = { vm.watchRoom(ui.joinCode) }, enabled = !ui.busy && ui.joinCode.length == 5) { Text("Watch") }
                }
            }
        }

        if (ui.busy) CircularProgressIndicator(color = Gold)

        if (BuildConfig.SELF_UPDATE) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Version ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})", color = FoamDim, fontSize = 11.sp)
                TextButton(onClick = { vm.checkForUpdate(false) }, enabled = ui.update !is UpdateState.Checking && ui.update !is UpdateState.Downloading) {
                    Text(if (ui.update is UpdateState.Checking) "Checking…" else "Check for updates", fontSize = 11.sp)
                }
            }
        }
    }
    }

    if (showRooms) RoomsDialog(ui, vm, onClose = { showRooms = false }, needName = ::needName)
}

/** Waiting public rooms to join, and running public games to watch. Refreshes every few seconds while open. */
@Composable
private fun RoomsDialog(ui: UiState, vm: GameViewModel, onClose: () -> Unit, needName: (() -> Unit) -> Unit) {
    LaunchedEffect(Unit) { while (true) { delay(4000); vm.loadRooms() } }
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
        title = { Text("Public rooms") },
        text = {
            val rooms = ui.rooms
            if (rooms == null) {
                Text(ui.roomsError ?: "Loading…")
            } else LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Text("Waiting for players", fontWeight = FontWeight.Bold, color = Gold) }
                if (rooms.rooms.isEmpty()) item { Text("No public rooms are waiting right now. Open one, and others can join you.", color = FoamDim) }
                items(rooms.rooms) { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${r.host}'s room", fontWeight = FontWeight.Bold)
                            Text("${r.map} · ${r.vp} points${if (r.timer > 0) " · ${r.timer}s timer" else ""}", fontSize = 12.sp, color = FoamDim)
                        }
                        Text("${r.players}/${r.max}", Modifier.padding(horizontal = 8.dp), color = Gold, fontWeight = FontWeight.Bold)
                        Button(onClick = { needName { onClose(); vm.joinRoom(r.code) } }) { Text("Join") }
                    }
                }
                item { Spacer(Modifier.height(8.dp)); Text("Live games you can watch", fontWeight = FontWeight.Bold, color = Gold) }
                if (rooms.live.isEmpty()) item { Text("No public game is running right now.", color = FoamDim) }
                items(rooms.live) { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(r.players.joinToString(", ") { it.name }, fontWeight = FontWeight.Bold)
                            Text("${r.map} · turn ${r.turn}${if (r.watching > 0) " · ${r.watching} watching" else ""}", fontSize = 12.sp, color = FoamDim)
                        }
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(onClick = { onClose(); vm.watchRoom(r.code) }) { Text("Watch") }
                    }
                }
            }
        },
    )
}

/** Shown on the test build when a newer build exists: what changed, a progress bar while it downloads, and the install button. */
@Composable
private fun UpdateCard(ui: UiState, vm: GameViewModel) {
    val u = ui.update
    if (!BuildConfig.SELF_UPDATE || u is UpdateState.Idle || u is UpdateState.Checking) return
    Card(colors = CardDefaults.cardColors(containerColor = NavyDark.copy(alpha = 0.85f)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (u) {
                is UpdateState.UpToDate -> Text("You have the newest build.", color = Good)
                is UpdateState.Failed -> {
                    Text(u.message, color = Bad)
                    TextButton(onClick = { vm.checkForUpdate(false) }) { Text("Try again") }
                }
                is UpdateState.Available -> {
                    Text("A new build is ready (${u.info.versionCode})", fontWeight = FontWeight.Bold, color = Gold)
                    if (u.info.notes.isNotBlank()) Text(u.info.notes.lines().first().take(120), fontSize = 12.sp, color = FoamDim)
                    GoldButton(onClick = { vm.startUpdate() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Update now" + if (u.info.sizeBytes > 0) " (${u.info.sizeBytes / 1_000_000} MB)" else "", fontWeight = FontWeight.Bold)
                    }
                }
                is UpdateState.Downloading -> {
                    Text("Downloading… ${u.percent}%", fontWeight = FontWeight.Bold)
                    LinearProgressIndicator(progress = { u.percent / 100f }, Modifier.fillMaxWidth(), color = Gold)
                }
                is UpdateState.Ready -> {
                    Text("Ready to install", fontWeight = FontWeight.Bold, color = Gold)
                    GoldButton(onClick = { vm.installUpdate() }, modifier = Modifier.fillMaxWidth()) { Text("Install", fontWeight = FontWeight.Bold) }
                }
                else -> {}
            }
        }
    }
}
