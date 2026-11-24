package com.hexlands.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.rememberTextMeasurer
import com.hexlands.app.net.Board
import com.hexlands.app.net.Tile
import androidx.compose.ui.unit.dp
import kotlin.math.sin

/** The classic 19-hex island, laid out by hand, for the front page. It uses the real board art, so it looks like the game. */
private val heroBoard: Board = run {
    val terrain = listOf("mountains", "pasture", "forest", "fields", "hills", "pasture", "hills", "fields", "forest", "desert", "forest", "mountains", "forest", "mountains", "fields", "pasture", "hills", "fields", "pasture")
    val numbers = listOf(10, 2, 9, 12, 6, 4, 10, 9, 0, 11, 3, 8, 8, 3, 4, 5, 5, 6, 11)
    val tiles = ArrayList<Tile>()
    var i = 0
    for (r in -2..2) for (q in -2..2) {
        if (kotlin.math.abs(q + r) > 2) continue
        tiles.add(Tile(i, 1.7320508 * (q + r / 2.0), 1.5 * r, terrain[i], numbers[i].takeIf { it > 0 }))
        i++
    }
    Board(name = "hero", key = "hero", tiles = tiles)
}

/** The island on the sea, bobbing gently and tilting a little, as if floating. */
@Composable
fun IslandHero(modifier: Modifier = Modifier) {
    val t by rememberClock()
    val measurer = rememberTextMeasurer()
    Canvas(modifier.fillMaxWidth().aspectRatio(1.05f)) {
        val k = size.width / 10.2f
        val bob = sin(t * 1.3f) * 5.dp.toPx()
        val tilt = sin(t * 0.7f) * 1.2f
        rotate(tilt, Offset(size.width / 2, size.height / 2)) {
            drawBoardArt(heroBoard, Offset(size.width / 2, size.height / 2 + bob), k, measurer, sea = false)
        }
    }
}
