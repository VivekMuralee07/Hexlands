package com.hexlands.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text("Hexlands", fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, color = Gold)
        Text("Build, trade and settle the island", color = FoamDim)
        Spacer(Modifier.height(4.dp))

        ui.notice?.let {
            Card(colors = CardDefaults.cardColors(containerColor = NavyDark), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(it, Modifier.weight(1f))
                    TextButton(onClick = { vm.consumeNotice() }) { Text("OK") }
                }
            }
        }

        OutlinedTextField(
            value = name, onValueChange = { name = it.take(16) }, label = { Text("Your name") }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words), modifier = Modifier.fillMaxWidth(),
        )

        Button(onClick = { needName { vm.quickPlay() } }, enabled = !ui.busy, modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Quick play", fontWeight = FontWeight.Bold)
                Text("Join a public game with players from anywhere", fontSize = 11.sp)
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { showRooms = true; vm.loadRooms() }, modifier = Modifier.weight(1f)) { Text("Public rooms") }
            OutlinedButton(onClick = { needName { vm.createRoom(publicRoom) } }, enabled = !ui.busy, modifier = Modifier.weight(1f)) { Text("Create a room") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            FilterChip(selected = publicRoom, onClick = { publicRoom = true }, label = { Text("Public") })
            FilterChip(selected = !publicRoom, onClick = { publicRoom = false }, label = { Text("Private") })
            Text(if (publicRoom) "Anyone can find it" else "Only people with the code", color = FoamDim, fontSize = 12.sp)
        }

        Text("or join a friend", color = FoamDim, fontSize = 13.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = ui.joinCode, onValueChange = { vm.setJoinCode(it) }, label = { Text("Room code") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters), modifier = Modifier.weight(1f),
            )
            Button(onClick = { needName { vm.joinRoom(ui.joinCode) } }, enabled = !ui.busy && ui.joinCode.length == 5) { Text("Join") }
            OutlinedButton(onClick = { vm.watchRoom(ui.joinCode) }, enabled = !ui.busy && ui.joinCode.length == 5) { Text("Watch") }
        }

        if (ui.busy) CircularProgressIndicator(color = Gold)
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
