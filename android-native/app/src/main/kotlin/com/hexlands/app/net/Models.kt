package com.hexlands.app.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The same JSON the web app reads. Unknown fields are ignored, so the server can grow without breaking old apps. */
val HexJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    isLenient = true
}

val RESOURCES = listOf("wood", "brick", "sheep", "wheat", "ore")
val RESOURCE_LABEL = mapOf("wood" to "Wood", "brick" to "Brick", "sheep" to "Sheep", "wheat" to "Hay", "ore" to "Ore")

// ---------- the board (sent once per game, and again when fog is uncovered) ----------

@Serializable
data class Board(
    val name: String = "",
    val key: String = "",
    val tiles: List<Tile> = emptyList(),
    val vertices: List<Vertex> = emptyList(),
    val edges: List<Edge> = emptyList(),
    val ports: List<Port> = emptyList(),
)

/** A hex. [vertices] are its six corners in order around the hex. Coordinates are in board units (a hex has radius 1). */
@Serializable
data class Tile(
    val id: Int,
    val x: Double,
    val y: Double,
    val terrain: String = "fog",
    val number: Int? = null,
    val fog: Boolean = false,
    val vertices: List<Int> = emptyList(),
)

@Serializable
data class Vertex(val id: Int, val x: Double, val y: Double, val port: String? = null)

@Serializable
data class Edge(val id: Int, val v: List<Int>)

@Serializable
data class Port(val edge: Int = 0, val type: String = "any", val x: Double = 0.0, val y: Double = 0.0, val vx: List<List<Double>> = emptyList())

// ---------- the game, as one player sees it ----------

@Serializable
data class GameState(
    val code: String = "",
    val phase: String = "lobby",           // lobby | setup | main | ended
    val you: Int = -1,                     // your seat; -1 for a spectator
    val version: Int = 0,
    val vpTarget: Int = 10,
    val mapName: String = "",
    val opts: Options = Options(),
    val players: List<PlayerView> = emptyList(),
    val me: MeView? = null,
    val buildings: Map<String, Building> = emptyMap(),   // vertex id -> building
    val roads: Map<String, Int> = emptyMap(),            // edge id -> seat
    val robber: Int = 0,
    val turn: Int = 0,
    val turnNumber: Int = 0,
    val rolled: Boolean = false,
    val dice: List<Int>? = null,
    val subphase: String? = null,          // robber | discard | diamond | roadBuilding
    val pendingDiscards: Map<String, Int> = emptyMap(),
    val pendingDiamond: Map<String, Int> = emptyMap(),
    val freeRoads: Int = 0,
    val devPlayed: Boolean = false,
    val setup: SetupView? = null,
    val trade: TradeView? = null,
    val largestArmy: Holder? = null,
    val longestRoad: Holder? = null,
    val bank: Map<String, Int> = emptyMap(),
    val devLeft: Int = 0,
    val log: List<LogLine> = emptyList(),
    val winner: Int? = null,
    val legal: Legal? = null,
    val undo: UndoInfo? = null,
    val robberOptions: List<Int>? = null,
    val spectator: Boolean = false,
    val net: NetInfo? = null,
    val timer: TimerView? = null,
    val heist: HeistInfo? = null,
    val cutRoads: List<Int> = emptyList(),   // roads an opposing settlement has cut off: they stay, but no longer link to your towns
)

@Serializable
data class Options(
    val discardLimit: Int = 7,
    val discardMode: String = "half",
    val timer: Int = 0,
    val friendlyRobber: Boolean = false,
    val balancedDice: Boolean = false,
)

@Serializable
data class PlayerView(
    val name: String = "",
    val host: Boolean = false,
    val bot: String? = null,               // easy | medium | hard; also set while a bot plays for an absent person
    val takenOver: String? = null,
    val ready: Boolean = false,
    val colorId: String? = null,
    val color: String? = null,             // "#rrggbb"
    val connected: Boolean = false,
    val cards: Int = 0,
    val devCount: Int = 0,
    val knights: Int = 0,
    val pieces: Pieces = Pieces(),
    val vp: Int = 0,
    val roadLen: Int = 0,
    val stats: Stats = Stats(),
    val res: Map<String, Int>? = null,     // only in a finished game
)

@Serializable
data class Pieces(val road: Int = 0, val settlement: Int = 0, val city: Int = 0)

@Serializable
data class Stats(
    val collected: Int = 0,
    val stolen: Int = 0,
    val bankTrades: Int = 0,
    val playerTrades: Int = 0,
    val sevens: Int = 0,
)

@Serializable
data class MeView(
    val res: Map<String, Int> = emptyMap(),
    val heistBought: Boolean = false,
    val dev: List<DevCard> = emptyList(),
    val ratios: Map<String, Int> = emptyMap(),   // how many of a resource the bank (or a harbour) takes for one card
)

@Serializable
data class DevCard(val type: String = "", val fresh: Boolean = false)

@Serializable
data class Building(val p: Int = 0, val type: String = "settlement")

@Serializable
data class SetupView(val expect: String = "settlement", val last: Int? = null, val round: Int = 1, val step: Int = 0)

@Serializable
data class TradeView(
    val from: Int = 0,
    val give: Map<String, Int> = emptyMap(),
    val get: Map<String, Int> = emptyMap(),
    val accepted: List<Int> = emptyList(),
    val declined: List<Int> = emptyList(),
    val counters: Map<String, Counter> = emptyMap(),
    val id: Int = 0,
)

@Serializable
data class Counter(val give: Map<String, Int> = emptyMap(), val get: Map<String, Int> = emptyMap())

@Serializable
data class Holder(val p: Int = 0, val len: Int? = null, val size: Int? = null)

@Serializable
data class LogLine(val text: String = "", val at: Long = 0)

/** Where this player may build right now (vertex and edge ids). Worked out by the server, so the app needs no rules of its own. */
@Serializable
data class Legal(
    val settlements: List<Int> = emptyList(),
    val cities: List<Int> = emptyList(),
    val roads: List<Int> = emptyList(),
)

/** The Heist card: what it costs, and how many cities you need before you may buy it (once per game). */
@Serializable
data class HeistInfo(val cost: Map<String, Int> = emptyMap(), val need: Int = 3)

@Serializable
data class UndoInfo(val left: Int = 0)

@Serializable
data class NetInfo(
    val public: Boolean = false,
    val countdown: Long? = null,
    val fillIn: Long? = null,
    val watching: Int = 0,
)

@Serializable
data class TimerView(val setting: Int = 0, val limit: Int = 0, val left: Double? = null)

// ---------- lists and replies ----------

@Serializable
data class SessionReply(
    val code: String = "",
    val token: String = "",
    val created: Boolean = false,
    val host: String = "",
    val spectator: Boolean = false,
)

@Serializable
data class RoomCard(
    val code: String = "",
    val host: String = "",
    val map: String = "",
    val vp: Int = 10,
    val timer: Int = 0,
    val players: Int = 0,
    val max: Int = 4,
    val bots: Int = 0,
)

@Serializable
data class LiveCard(
    val code: String = "",
    val host: String = "",
    val map: String = "",
    val vp: Int = 10,
    val turn: Int = 0,
    val watching: Int = 0,
    val players: List<LivePlayer> = emptyList(),
)

@Serializable
data class LivePlayer(val name: String = "", val bot: Boolean = false, val color: String? = null)

/** A map the host can choose (the server's list: Classic, the countries, and the special maps). */
@Serializable
data class MapInfo(val key: String = "", val name: String = "", val blurb: String = "", val category: String = "misc")

@Serializable
data class MapsReply(val maps: List<MapInfo> = emptyList())

/** A map's board made from a seed; asking the server for the same seed in the waiting room gives exactly this board. */
@Serializable
data class PreviewReply(val seed: Long = 0, val board: Board = Board())

// ---------- the leaderboard (the same data the web game shows) ----------

@Serializable
data class LbRow(
    val rank: Int? = null, val name: String = "", val tag: String = "", val wins: Int = 0, val losses: Int = 0, val games: Int = 0,
    val winRate: Int = 0, val avgVp: Double = 0.0, val bestVp: Int = 0,
    val form: List<Int> = emptyList(),   // the last five results, newest first: 1 won, 0 lost
    val streak: Int = 0, val lastPlayed: Long = 0, val favMap: String = "", val you: Boolean = false, val need: Int = 0,
)

@Serializable
data class LbBotLevel(val level: String = "", val games: Int = 0, val wins: Int = 0, val losses: Int = 0, val winRate: Int = 0, val avgVp: Double = 0.0, val bestVp: Int = 0)

@Serializable
data class LbBots(val games: Int = 0, val botWins: Int = 0, val levels: List<LbBotLevel> = emptyList())

@Serializable
data class LbSummary(val games: Int = 0, val players: Int = 0, val avgTurns: Int = 0, val topMap: String = "")

@Serializable
data class LbReply(
    val enabled: Boolean = false, val mode: String = "ranked", val sort: String = "wins", val period: String = "all",
    val rows: List<LbRow> = emptyList(), val bots: LbBots? = null, val me: LbRow? = null, val total: Int = 0, val minGames: Int = 1,
    val summary: LbSummary? = null, val error: String? = null,
)

@Serializable
data class RecentWinner(val name: String = "", val vp: Int = 0, val bot: String? = null)

@Serializable
data class RecentGame(
    val id: Int = 0, val at: Long = 0, val map: String = "", val turns: Int = 0, val target: Int = 10, val seats: Int = 0, val humans: Int = 0,
    val ranked: Boolean = false, val vp: Int = 0, val won: Boolean = false, val left: Boolean = false, val winner: RecentWinner? = null,
)

@Serializable
data class RecentReply(val enabled: Boolean = false, val games: List<RecentGame> = emptyList())

@Serializable
data class RoomsReply(val rooms: List<RoomCard> = emptyList(), val live: List<LiveCard> = emptyList())

@Serializable
data class ClosedReason(val reason: String = "")

// ---------- helpers the screens use ----------

/** "#rrggbb" to an ARGB int; a grey when the colour is missing. */
fun parseColor(hex: String?): Long {
    val h = hex?.removePrefix("#") ?: return 0xFF8A9BB0
    return (h.toLongOrNull(16) ?: 0x8A9BB0) or 0xFF000000
}

fun GameState.myPlayer(): PlayerView? = players.getOrNull(you)
fun GameState.isMyTurn(): Boolean = you >= 0 && turn == you
fun GameState.hand(res: String): Int = me?.res?.get(res) ?: 0
fun GameState.totalCards(): Int = RESOURCES.sumOf { hand(it) }
fun GameState.cities(): Int = 4 - (myPlayer()?.pieces?.city ?: 4)
fun GameState.canAfford(cost: Map<String, Int>): Boolean = cost.all { (k, n) -> hand(k) >= n }
