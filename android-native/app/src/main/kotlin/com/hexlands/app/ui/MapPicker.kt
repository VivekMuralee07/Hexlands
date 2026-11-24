package com.hexlands.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.MapInfo

private val TABS = listOf("countries" to "Countries", "misc" to "Other maps")

/** Every map, in two tabs (the countries, and Classic plus the special maps), with the one in use marked. */
@Composable
fun MapList(maps: List<MapInfo>, currentKey: String?, onPick: (MapInfo) -> Unit) {
    var tab by remember(maps, currentKey) { mutableStateOf(maps.firstOrNull { it.key == currentKey }?.category ?: "misc") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TabRow(selectedTabIndex = TABS.indexOfFirst { it.first == tab }.coerceAtLeast(0), containerColor = Color.Transparent) {
            TABS.forEach { (k, label) -> Tab(selected = tab == k, onClick = { tab = k }, text = { Text("$label (${maps.count { it.category == k }})") }) }
        }
        LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(maps.filter { it.category == tab }) { m ->
                val sel = m.key == currentKey
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (sel) NavyLight else NavyDark)
                        .border(if (sel) 2.dp else 0.dp, if (sel) Gold else Color.Transparent, RoundedCornerShape(12.dp))
                        .clickable { onPick(m) }.padding(12.dp),
                ) {
                    Row { Text(m.name, Modifier.weight(1f), fontWeight = FontWeight.Bold, color = if (sel) Gold else Foam); if (sel) Text("In use", color = Gold, fontSize = 12.sp) }
                    Text(m.blurb, fontSize = 12.sp, color = FoamDim, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
    }
}

/** The host's map window in the waiting room. */
@Composable
fun MapPickerDialog(maps: List<MapInfo>?, currentKey: String?, onLoad: () -> Unit, onClose: () -> Unit, onPick: (MapInfo) -> Unit) {
    LaunchedEffect(Unit) { onLoad() }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Choose the map") },
        text = { if (maps == null) Text("Loading the maps…") else MapList(maps, currentKey) { onPick(it); onClose() } },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
