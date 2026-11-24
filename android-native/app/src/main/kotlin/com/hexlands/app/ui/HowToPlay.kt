package com.hexlands.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hexlands.app.tutorial.TutorialRecord

/**
 * The page behind the "i" button on the front page: the animated tutorial (a recorded game replayed with captions) on one tab, and the rules in words
 * (the web game's full "How to play" text, with costs and points) on the other.
 */
@Composable
fun HowToPlayScreen(record: TutorialRecord, onClose: () -> Unit, startTab: Int = 0) {
    var tab by remember { mutableIntStateOf(startTab) }
    Column(Modifier.fillMaxSize().background(Navy).safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onClose) { Text("‹ Back", fontWeight = FontWeight.Bold) }
            Text("How to play", Modifier.weight(1f), fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Gold, textAlign = TextAlign.Center)
            Box(Modifier.width(72.dp))
        }
        TabRow(selectedTabIndex = tab, containerColor = Color.Transparent) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Watch the tutorial") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Read the rules") })
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (tab == 0) TutorialScreen(record, onClose = onClose, embedded = true)
            else Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                Text("The whole game in words. Watch the tutorial for the same thing in moving pictures.", fontSize = 13.sp, color = FoamDim, modifier = Modifier.padding(bottom = 12.dp))
                RulesText()
            }
        }
    }
}
