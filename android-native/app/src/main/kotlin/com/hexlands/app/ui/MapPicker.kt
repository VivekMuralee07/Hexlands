package com.hexlands.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.net.MapInfo
import com.hexlands.app.net.PreviewReply

private val SECTIONS = listOf("countries" to "Countries", "misc" to "Other maps")

/**
 * Every map in one list (the countries, then Classic and the special maps), each with a small picture of its board. Tapping one shows it large
 * above the list, with its description; "Use this map" gives the room exactly that layout.
 */
@Composable
fun MapChooser(
    maps: List<MapInfo>, currentKey: String?, previews: Map<String, PreviewReply>,
    onWant: (String) -> Unit, onUse: (MapInfo, Long) -> Unit, modifier: Modifier = Modifier,
) {
    var selected by remember(maps) { mutableStateOf(currentKey ?: maps.firstOrNull()?.key) }
    val sel = maps.firstOrNull { it.key == selected }
    LaunchedEffect(selected) { selected?.let(onWant) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // the big preview
        Box(Modifier.fillMaxWidth().size(width = 320.dp, height = 230.dp).clip(RoundedCornerShape(14.dp)).background(SEA_COLOR), contentAlignment = Alignment.Center) {
            val pv = selected?.let { previews[it] }
            if (pv == null) CircularProgressIndicator(color = Gold) else BoardPreview(pv.board, Modifier.fillMaxWidth().size(width = 320.dp, height = 230.dp).padding(6.dp))
        }
        if (sel != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(sel.name, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Gold)
                    Text(sel.blurb, fontSize = 12.sp, color = FoamDim)
                }
            }
            val pv = previews[sel.key]
            GoldButton(onClick = { if (pv != null) onUse(sel, pv.seed) }, enabled = pv != null, modifier = Modifier.fillMaxWidth()) {
                Text(if (sel.key == currentKey) "Draw this map again" else "Use this map", fontWeight = FontWeight.Bold)
            }
        }
        // all the maps
        LazyColumn(Modifier.heightIn(max = 260.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SECTIONS.forEach { (cat, title) ->
                val list = maps.filter { it.category == cat }
                if (list.isEmpty()) return@forEach
                item(key = "h-$cat") { Text("$title (${list.size})", Modifier.padding(top = 6.dp), fontWeight = FontWeight.Bold, color = Gold, fontSize = 13.sp) }
                items(list, key = { it.key }) { m ->
                    LaunchedEffect(m.key) { onWant(m.key) }
                    val on = m.key == selected
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (on) NavyLight else NavyDark)
                            .border(if (on) 2.dp else 0.dp, if (on) Gold else Color.Transparent, RoundedCornerShape(12.dp))
                            .clickable { selected = m.key }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)).background(SEA_COLOR), contentAlignment = Alignment.Center) {
                            previews[m.key]?.let { BoardPreview(it.board, Modifier.size(64.dp).padding(2.dp)) }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(m.name, fontWeight = FontWeight.Bold, color = if (m.key == currentKey) Gold else Foam)
                            Text(if (m.key == currentKey) "In use" else m.blurb, fontSize = 11.sp, color = FoamDim, maxLines = 2)
                        }
                    }
                }
            }
        }
    }
}

/** The host's map window in the waiting room. */
@Composable
fun MapPickerDialog(
    maps: List<MapInfo>?, currentKey: String?, previews: Map<String, PreviewReply>,
    onLoad: () -> Unit, onWant: (String) -> Unit, onClose: () -> Unit, onUse: (MapInfo, Long) -> Unit,
) {
    LaunchedEffect(Unit) { onLoad() }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Choose the map") },
        text = { if (maps == null) Text("Loading the maps…") else MapChooser(maps, currentKey, previews, onWant, onUse = { m, seed -> onUse(m, seed); onClose() }) },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
