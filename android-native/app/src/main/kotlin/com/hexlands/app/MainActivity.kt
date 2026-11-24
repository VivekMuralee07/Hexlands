package com.hexlands.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hexlands.app.ui.GameScreen
import com.hexlands.app.ui.Gold
import com.hexlands.app.ui.HexlandsTheme
import com.hexlands.app.ui.HomeScreen
import com.hexlands.app.ui.LeaderboardScreen
import com.hexlands.app.ui.RecentGamesScreen
import com.hexlands.app.ui.TutorialScreen
import com.hexlands.app.ui.LobbyScreen
import com.hexlands.app.ui.Navy

class MainActivity : ComponentActivity() {
    private val vm: GameViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.hexlands.app.audio.Sound.init(this)
        enableEdgeToEdge()   // draw behind the status and navigation bars, so the sea fills the whole screen
        openInvite(intent)
        setContent { HexlandsTheme { App(vm) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openInvite(intent)
    }

    /** An invite link (https://<server>/room/ABCDE) puts its code in the join box. */
    private fun openInvite(intent: Intent?) {
        val path = intent?.data?.path ?: return
        Regex("^/room/([A-Za-z0-9]{5})$").find(path)?.let { vm.setJoinCode(it.groupValues[1]) }
    }
}

@Composable
private fun App(vm: GameViewModel) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var confirmLeave by remember { mutableStateOf(false) }
    // full-screen pages opened from the front page: the leaderboard, your recent games, the tutorial
    var page by remember { mutableStateOf<String?>(null) }
    val appContext = androidx.compose.ui.platform.LocalContext.current
    val tutorial = remember { com.hexlands.app.tutorial.TutorialRecord.load(appContext) }
    BackHandler(enabled = page != null && ui.session == null) { page = if (page == "recent") "leaderboard" else null }

    LaunchedEffect(ui.message) {
        ui.message?.let { com.hexlands.app.audio.Sound.play("error"); snackbar.showSnackbar(it); vm.consumeMessage() }
    }
    // the start and finish themes, when a game begins and when it ends
    var prevPhase by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(ui.game?.phase) {
        val ph = ui.game?.phase
        if (prevPhase == "lobby" && ph == "setup") com.hexlands.app.audio.Sound.theme("start")
        if (prevPhase != null && prevPhase != "ended" && ph == "ended") com.hexlands.app.audio.Sound.theme("finish")
        prevPhase = ph
    }
    BackHandler(enabled = ui.session != null) {
        // Leaving is permanent in a running game (a bot takes the seat), so ask first.
        if (ui.game?.phase == "lobby" || ui.session?.spectator == true) vm.leave() else confirmLeave = true
    }
    // the tutorial can be opened from the front page and from the i window in a game; Back closes it first
    BackHandler(enabled = page == "tutorial") { page = null }

    Box(
        Modifier.fillMaxSize().background(Navy).pointerInput(Unit) {
            // a click sound for every tap anywhere (a touch that moves, like a drag or a pinch, is not a tap). It only watches; nothing is consumed.
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                val up = waitForUpOrCancellation(PointerEventPass.Initial)
                if (up != null && (up.position - down.position).getDistance() < viewConfiguration.touchSlop) com.hexlands.app.audio.Sound.play("click")
            }
        },
    ) {
        val game = ui.game
        val key = when { page == "tutorial" -> 4; ui.session == null -> 0; game == null -> 1; game.phase == "lobby" -> 2; else -> 3 }
        AnimatedContent(
            targetState = key,
            transitionSpec = { (fadeIn(tween(350)) + scaleIn(tween(350), initialScale = 0.96f)) togetherWith fadeOut(tween(200)) },
            label = "screen",
        ) { k ->
        // The front page and the waiting room draw the sea under the system bars themselves; the others keep inside them.
        Box(if (k == 0 || k == 2) Modifier.fillMaxSize() else Modifier.fillMaxSize().safeDrawingPadding()) {
        when {
            page == "tutorial" -> TutorialScreen(tutorial, onClose = { page = null })
            ui.session == null && page == "leaderboard" -> LeaderboardScreen(ui, vm, onBack = { page = null }, onRecent = { page = "recent" })
            ui.session == null && page == "recent" -> RecentGamesScreen(ui, vm, onBack = { page = "leaderboard" })
            ui.session == null -> HomeScreen(ui, vm, onLeaderboard = { page = "leaderboard" }, onTutorial = { page = "tutorial" })
            game == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Gold)
                    Text("Connecting…", Modifier.padding(top = 12.dp))
                    TextButton(onClick = { vm.leave() }) { Text("Cancel") }
                }
            }
            game.phase == "lobby" && game.spectator -> Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Waiting for the next game…")
                    Button(onClick = { vm.leave() }, modifier = Modifier.padding(top = 12.dp)) { Text("Stop watching") }
                }
            }
            game.phase == "lobby" -> LobbyScreen(game, vm)
            else -> GameScreen(ui, game, vm, onTutorial = { page = "tutorial" })
        }
        }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp))
    }

    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("Leave this game?") },
            text = { Text("A bot will play your seat for the rest of the game, and you will not be able to come back. If you are the last person, the game ends.") },
            confirmButton = { TextButton(onClick = { confirmLeave = false; vm.leave() }) { Text("Leave") } },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("Stay") } },
        )
    }
}
