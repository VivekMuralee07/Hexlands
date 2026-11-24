package com.hexlands.app.tutorial

import android.content.Context
import com.hexlands.app.net.Board
import com.hexlands.app.net.HexJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** A building on a corner in the recorded game. */
@Serializable
data class TutBuilding(val p: Int = 0, val type: String = "settlement")

/** The board and hands at one moment of the recorded game: who has what, where the robber is, how many points and cards each player has. */
@Serializable
data class Moment(
    val b: Map<String, TutBuilding> = emptyMap(),   // corner id -> building
    val r: Map<String, Int> = emptyMap(),           // road id -> player
    val robber: Int = 0,
    val hand: Map<String, Int> = emptyMap(),        // the hand of the player the tutorial follows ("You")
    val cards: List<Int> = emptyList(),             // cards held, per player
    val vp: List<Int> = emptyList(),                // points, per player
)

@Serializable
data class TutPlayer(val name: String = "", val color: String = "#ffffff")

/** One recorded move (settle, road, roll, build-road, bank, seven, ...). Its kind-specific fields stay in [data]; [at] is the board after it. */
@Serializable
data class TutStep(val kind: String, val at: Moment = Moment(), val data: JsonObject = JsonObject(emptyMap())) {
    fun int(key: String): Int? = data[key]?.let { (it as? JsonPrimitive)?.intOrNull }
    fun string(key: String): String? = (data[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
    fun ints(key: String): List<Int> = (data[key] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
    fun objects(key: String): List<JsonObject> = (data[key] as? JsonArray)?.map { it.jsonObject } ?: emptyList()
    /** A JSON object of player id -> number (the discards of a seven). */
    fun intMap(key: String): Map<Int, Int> = (data[key] as? JsonObject)?.mapNotNull { (k, v) -> k.toIntOrNull()?.let { it to v.jsonPrimitive.int } }?.toMap() ?: emptyMap()
}

/** The recorded game the tutorial replays: a real game played with the Hexlands engine (see tutorial-record.js on the web side). */
class TutorialRecord(val seed: Int, val board: Board, val players: List<TutPlayer>, val me: Int, val steps: List<TutStep>) {
    fun step(kind: String) = steps.first { it.kind == kind }
    fun steps(kind: String) = steps.filter { it.kind == kind }
    /** The moment before anything was built. */
    val empty = Moment(
        robber = board.tiles.indexOfFirst { it.terrain == "desert" }.coerceAtLeast(0),
        hand = mapOf("wood" to 0, "brick" to 0, "sheep" to 0, "wheat" to 0, "ore" to 0), cards = players.map { 0 }, vp = players.map { 0 },
    )

    companion object {
        fun parse(json: String): TutorialRecord {
            val o = HexJson.parseToJsonElement(json).jsonObject
            val steps = o.getValue("steps").jsonArray.map { e ->
                val so = e.jsonObject
                TutStep(
                    so.getValue("kind").jsonPrimitive.content,
                    HexJson.decodeFromJsonElement(Moment.serializer(), so.getValue("at")),
                    JsonObject(so.filterKeys { it != "kind" && it != "at" }),
                )
            }
            return TutorialRecord(
                o.getValue("seed").jsonPrimitive.int,
                HexJson.decodeFromJsonElement(Board.serializer(), o.getValue("board")),
                HexJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(TutPlayer.serializer()), o.getValue("players")),
                o.getValue("me").jsonPrimitive.int, steps,
            )
        }
        fun load(context: Context): TutorialRecord = parse(context.assets.open("tutorial.json").bufferedReader().use { it.readText() })
    }
}
