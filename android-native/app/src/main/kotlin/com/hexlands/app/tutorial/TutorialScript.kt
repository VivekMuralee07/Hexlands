package com.hexlands.app.tutorial

import com.hexlands.app.net.Port

// What the tutorial player shows. A chapter is a few steps; a step is a caption and a short timeline of scenes (each scene replaces the one before).
// This follows the web game's tutorial (tutorial.js) chapter by chapter, with the same captions, drawn with the app's own pieces.

/** A point on the board, in board units (a hex has radius 1). */
data class Pt(val x: Double, val y: Double)

/** Where a flying card starts or ends. */
sealed interface Anchor {
    data class Tile(val id: Int) : Anchor
    data class Chip(val player: Int) : Anchor          // a player's chip at the top of the stage
    data class BelowChip(val player: Int) : Anchor     // a little below it (the bank, for discards)
    data object Hand : Anchor                          // your cards at the bottom
    data object Bank : Anchor                          // the bank icon of the trade panel
}

data class Flight(val res: String, val from: Anchor, val to: Anchor, val delayMs: Long = 0)          // res "back" = a card face-down
data class Label(val text: String, val at: Pt, val big: Boolean = false)
data class PanelRow(val label: String, val cost: Map<String, Int> = emptyMap(), val points: String? = null, val note: String? = null, val icon: String? = null)
data class Panel(val title: String, val rows: List<PanelRow>)
data class Bubble(val player: Int, val text: String, val good: Boolean)
data class Reveal(val kind: String, val name: String)

/** The trade panel, as in the game: what is in your hand, what you ask for and give, the rates, and which buttons are lit. [pulse] marks what the "finger" is tapping. */
data class Trade(
    val hand: Map<String, Int>, val give: Map<String, Int> = emptyMap(), val get: Map<String, Int> = emptyMap(),
    val rates: Map<String, Int> = DEFAULT_RATES, val hint: String = "Pick what you want, then what you give.",
    val bank: Boolean = false, val players: Boolean = false, val buys: List<String> = emptyList(),
    val pulse: Set<String> = emptySet(), val flash: Set<String> = emptySet(),
)

val DEFAULT_RATES = mapOf("wood" to 4, "brick" to 4, "sheep" to 4, "wheat" to 4, "ore" to 4)

data class Scene(
    val moment: Moment,
    val glowTiles: List<Int> = emptyList(),
    val spotCorners: List<Int> = emptyList(), val spotEdges: List<Int> = emptyList(),
    val port: Port? = null,                              // a harbour and its two corners, highlighted
    val ghostRoad: Int? = null, val ghostCorner: Int? = null,   // the piece you are about to build (with a green tick)
    val ghostCity: Boolean = false,
    val flashCorner: Int? = null,
    val extraHouses: List<Pt> = emptyList(),             // a settlement drawn at a harbour corner
    val dice: List<Int>? = null,
    val flights: List<Flight> = emptyList(),
    val labels: List<Label> = emptyList(),
    val panel: Panel? = null,
    val trade: Trade? = null,
    val pulseHand: String? = null,
    val bubbles: List<Bubble> = emptyList(),
    val reveal: Reveal? = null,
    val trophy: Boolean = false,
    val longestRoadLabelAt: Int? = null,                 // an edge: "Longest Road +2" appears there
)

data class Frame(val atMs: Long, val scene: Scene)
data class TutStepScript(val caption: String, val durMs: Long, val frames: List<Frame>)
data class Chapter(val title: String, val steps: List<TutStepScript>)

private val RES5 = listOf("wood", "brick", "sheep", "wheat", "ore")
private val RES_LABEL = mapOf("wood" to "Wood", "brick" to "Brick", "sheep" to "Sheep", "wheat" to "Hay", "ore" to "Ore")
private val TERRAIN_RES = mapOf("forest" to "wood", "hills" to "brick", "pasture" to "sheep", "fields" to "wheat", "mountains" to "ore")
private val TERRAIN_LABEL = mapOf("forest" to "Forest", "hills" to "Hills", "pasture" to "Pasture", "fields" to "Fields", "mountains" to "Mountains")
private val COST_ROAD = mapOf("wood" to 1, "brick" to 1)
private val COST_SETTLEMENT = mapOf("wood" to 1, "brick" to 1, "sheep" to 1, "wheat" to 1)
private val COST_CITY = mapOf("wheat" to 2, "ore" to 3)
private val COST_DEV = mapOf("sheep" to 1, "wheat" to 1, "ore" to 1)
private val DEV = mapOf(
    "knight" to ("Knight" to "Move the robber and steal a card. Three knights earn Largest Army."),
    "vp" to ("Victory Point" to "Worth 1 point. Stays hidden until the game ends."),
    "roadBuilding" to ("Road Building" to "Place 2 roads for free."),
    "yearOfPlenty" to ("Year of Plenty" to "Take any 2 resources from the bank."),
    "monopoly" to ("Monopoly" to "Name a resource. Every player hands you all of it."),
    "heist" to ("Heist" to "Steal any opponent's settlement. You can buy it once per game."),
)

private fun article(w: String) = if (w.firstOrNull()?.lowercaseChar() in listOf('a', 'e', 'i', 'o', 'u')) "an" else "a"

/** The tutorial, chapter by chapter, from the recorded game [r]. */
fun buildChapters(r: TutorialRecord): List<Chapter> {
    val b = r.board; val me = r.me; val P = r.players
    fun sc(m: Moment, f: Scene.() -> Scene = { this }) = Scene(m).f()
    fun fr(at: Long, s: Scene) = Frame(at, s)
    fun one(s: Scene) = listOf(fr(0, s))
    fun tile(id: Int) = b.tiles[id].let { Pt(it.x, it.y) }
    fun corner(id: Int) = b.vertices[id].let { Pt(it.x, it.y) }
    fun edgeMid(id: Int): Pt { val e = b.edges[id]; val a = b.vertices[e.v[0]]; val c = b.vertices[e.v[1]]; return Pt((a.x + c.x) / 2, (a.y + c.y) / 2) }
    val empty = r.empty
    val setupMoves = r.steps.filter { it.kind == "settle" || it.kind == "road" }
    val afterSetup = setupMoves.last().at
    fun portFor(any: Boolean): Port? = b.ports.filter { if (any) it.type == "any" else it.type != "any" }.sortedBy { it.y }.firstOrNull()
    val r2 = portFor(false)?.type ?: "sheep"
    val r2n = RES_LABEL[r2] ?: "Sheep"
    val handNow = mapOf("wood" to 4, "brick" to 1, "sheep" to 2, "wheat" to 2, "ore" to 0)
    val other = (me + 1) % P.size; val third = (me + 2) % P.size
    val buildCity = r.step("build-city")

    val ch = mutableListOf<Chapter>()

    // 1. The island
    ch += Chapter("The island", listOf(
        TutStepScript("Hexlands is played on an island of hex tiles. Each tile produces one resource.", 4200, one(sc(empty))),
        TutStepScript("Forest gives wood, hills give brick, pasture gives sheep, fields give hay, mountains give ore.", 6000,
            listOf("forest", "hills", "pasture", "fields", "mountains").mapIndexed { i, k ->
                val t = b.tiles.first { it.terrain == k }
                fr(i * 1100L, sc(empty) { copy(glowTiles = b.tiles.filter { it.terrain == k }.map { it.id }, labels = listOf(Label("${RES_LABEL[TERRAIN_RES[k]]} · ${TERRAIN_LABEL[k]}", Pt(t.x, t.y)))) })
            }),
        TutStepScript("Every tile has a number. Red 6 and 8 come up most often; the dots under a number show how often it rolls.", 5000,
            one(sc(empty) { copy(glowTiles = b.tiles.filter { it.number == 6 || it.number == 8 }.map { it.id }) })),
        TutStepScript("The desert produces nothing. The robber starts there.", 3800, one(sc(empty) { copy(glowTiles = listOf(empty.robber)) })),
    ))

    // 2. Goal
    ch += Chapter("Goal", listOf(
        TutStepScript("Be the first to reach the points target (10 by default) on your own turn.", 6500, one(sc(empty) { copy(panel = Panel("Points", listOf(
            PanelRow("Settlement", points = "1", icon = "settlement"), PanelRow("City", points = "2", icon = "city"), PanelRow("Longest Road", points = "2", icon = "road"),
            PanelRow("Largest Army", points = "2", icon = "knight"), PanelRow("Victory Point card", points = "1", icon = "vp")))) })),
    ))

    // 3. Setup
    val lastMine = setupMoves.last { it.kind == "settle" && it.int("p") == me }
    ch += Chapter("Setup", listOf(
        TutStepScript("Everyone places a settlement and a road, in turn order. Then the order runs backwards: 1, 2, 3, 3, 2, 1.", 600L * setupMoves.size + 1200,
            listOf(fr(0, sc(empty))) + setupMoves.mapIndexed { i, m ->
                val flights = if (m.kind == "settle") m.objects("start").mapIndexed { j, c -> Flight(c["res"]!!.toString().trim('"'), Anchor.Tile(c["tile"]!!.toString().toInt()), Anchor.Chip(m.int("p")!!), j * 120L) } else emptyList()
                fr(i * 600L, sc(m.at) { copy(flights = flights) })
            }),
        TutStepScript("Your second settlement pays one card from every tile it touches, so you start with a few resources.", 4200,
            one(sc(setupMoves.last().at) { copy(
                glowTiles = lastMine.objects("start").map { it["tile"]!!.toString().toInt() },
                flights = lastMine.objects("start").mapIndexed { j, c -> Flight(c["res"]!!.toString().trim('"'), Anchor.Tile(c["tile"]!!.toString().toInt()), Anchor.Chip(me), 300 + j * 200L) },
            ) })),
    ))

    // 4. Roll and collect
    val roll = r.step("roll")
    val pays = roll.objects("pays")
    ch += Chapter("Roll and collect", listOf(
        TutStepScript("On your turn, tap the dice. Every tile with the rolled number pays: 1 card for each settlement next to it, 2 for each city.", 6000, listOf(
            fr(0, sc(afterSetup) { copy(dice = roll.ints("dice")) }),
            fr(900, sc(afterSetup) { copy(dice = roll.ints("dice"), glowTiles = pays.map { it["tile"]!!.toString().toInt() }.distinct(),
                flights = pays.mapIndexed { j, x -> Flight(x["res"]!!.toString().trim('"'), Anchor.Tile(x["tile"]!!.toString().toInt()), Anchor.Chip(x["p"]!!.toString().toInt()), 400 + j * 160L) }) }),
            fr(2400, sc(roll.at) { copy(dice = roll.ints("dice")) }),
        )),
    ))

    // 5. Building
    val roads = r.steps("build-road"); val bs = r.step("build-settle"); val bc = buildCity
    ch += Chapter("Building", listOf(
        TutStepScript("Building costs resources: road, settlement, city, or a development card.", 5500, one(sc(roll.at) { copy(panel = Panel("Costs", listOf(
            PanelRow("Road", COST_ROAD), PanelRow("Settlement", COST_SETTLEMENT), PanelRow("City", COST_CITY), PanelRow("Development card", COST_DEV)))) })),
        TutStepScript("Spots you can build on glow. Tap one: the piece appears with a green ✓. Tap the ✓ to build it.", 5200, buildList {
            val e = roads[0].int("e")!!; val opts = roads[0].ints("options").ifEmpty { listOf(e) }
            add(fr(0, sc(roll.at) { copy(spotEdges = opts) }))
            add(fr(1700, sc(roll.at) { copy(spotEdges = opts, ghostRoad = e) }))
            add(fr(3000, sc(roads[0].at)))
            if (roads.size > 1) add(fr(3800, sc(roads[1].at)))
        }),
        TutStepScript("A settlement needs one of your roads and no other town on the corners next to it.", 4600, buildList {
            val v = bs.int("v")!!; val opts = bs.ints("options").ifEmpty { listOf(v) }
            add(fr(0, sc(roads.last().at) { copy(spotCorners = opts) }))
            add(fr(1600, sc(roads.last().at) { copy(spotCorners = opts, ghostCorner = v) }))
            add(fr(2900, sc(bs.at)))
        }),
        TutStepScript("A city replaces a settlement and pays double.", 3600, listOf(fr(0, sc(bs.at)), fr(900, sc(bc.at) { copy(flashCorner = bc.int("v")) }))),
    ))

    // 6. Trading
    fun trade(hand: Map<String, Int>, o: Trade.() -> Trade = { this }) = sc(bc.at) { copy(trade = Trade(hand).o()) }
    val h0 = mapOf("wood" to 0, "brick" to 1, "sheep" to 2, "wheat" to 2, "ore" to 1)
    ch += Chapter("Trading", listOf(
        TutStepScript("To trade, tap any card in your hand. The trade window opens with that card already offered.", 4200, listOf(
            fr(0, sc(bc.at)), fr(500, sc(bc.at) { copy(pulseHand = "wood") }),
            fr(1300, trade(handNow) { copy(give = mapOf("wood" to 1)) }),
        )),
        TutStepScript("The top row is what you can get. Tap the card you want: it moves to the \"you get\" row.", 4200, listOf(
            fr(0, trade(handNow) { copy(give = mapOf("wood" to 1)) }),
            fr(600, trade(handNow) { copy(give = mapOf("wood" to 1), pulse = setOf("want:ore")) }),
            fr(1300, trade(handNow) { copy(give = mapOf("wood" to 1), get = mapOf("ore" to 1), hint = "Bank rate for Wood is 4 to 1: give 4 Wood for 1 Ore, or offer this to players.") }),
        )),
        TutStepScript("Now tap cards in your hand to give. The small number on each card is your bank rate: 4:1 means 4 of that card for any 1 card.", 5400,
            listOf(fr(0, trade(handNow) { copy(give = mapOf("wood" to 1), get = mapOf("ore" to 1)) })) + listOf(2, 3, 4).mapIndexed { i, n ->
                fr(500L + i * 900, trade(handNow) { copy(give = mapOf("wood" to n), get = mapOf("ore" to 1), pulse = setOf("hand:wood"), bank = n == 4, hint = if (n == 4) "Bank: 4 Wood for 1 Ore" else "Give ${4 - n} more Wood for the bank rate.") })
            }),
        TutStepScript("When the rate is met, the bank button lights up. Tap it: 4 wood go to the bank and the ore comes to you.", 4400, listOf(
            fr(0, trade(handNow) { copy(give = mapOf("wood" to 4), get = mapOf("ore" to 1), bank = true, hint = "Bank: 4 Wood for 1 Ore") }),
            fr(500, trade(handNow) { copy(give = mapOf("wood" to 4), get = mapOf("ore" to 1), bank = true, pulse = setOf("bank"), hint = "Bank: 4 Wood for 1 Ore") }),
            fr(1100, sc(bc.at) { copy(trade = Trade(handNow, give = mapOf("wood" to 4), get = mapOf("ore" to 1), bank = true, hint = "Bank: 4 Wood for 1 Ore"), flights = List(4) { Flight("wood", Anchor.Hand, Anchor.Bank, it * 120L) } + Flight("ore", Anchor.Bank, Anchor.Hand, 900)) }),
            fr(2800, trade(h0) { copy(hint = "Traded 4 Wood for 1 Ore.") }),
        )),
        TutStepScript("Trading with players: pick what you want and what you give, then tap the players button. They accept or decline, and you choose who to trade with.", 7200, buildList {
            add(fr(0, trade(h0)))
            add(fr(400, trade(h0) { copy(pulse = setOf("want:brick")) }))
            add(fr(800, trade(h0) { copy(get = mapOf("brick" to 1)) }))
            add(fr(1300, trade(h0) { copy(get = mapOf("brick" to 1), pulse = setOf("hand:sheep")) }))
            add(fr(1700, trade(h0) { copy(get = mapOf("brick" to 1), give = mapOf("sheep" to 1), players = true, hint = "Offer this deal to the other players.") }))
            add(fr(2300, trade(h0) { copy(get = mapOf("brick" to 1), give = mapOf("sheep" to 1), players = true, pulse = setOf("players"), hint = "Offer this deal to the other players.") }))
            add(fr(2900, trade(h0) { copy(get = mapOf("brick" to 1), give = mapOf("sheep" to 1), hint = "Waiting for answers…") }))
            add(fr(3400, sc(bc.at) { copy(trade = Trade(h0, give = mapOf("sheep" to 1), get = mapOf("brick" to 1), hint = "Waiting for answers…"), bubbles = buildList { add(Bubble(other, "✓ Accept", true)); if (P.size > 2) add(Bubble(third, "✗ No", false)) }) }))
            add(fr(4400, sc(bc.at) { copy(trade = Trade(h0, give = mapOf("sheep" to 1), get = mapOf("brick" to 1), hint = "Tap the player who accepted."), bubbles = listOf(Bubble(other, "✓ Accept", true)), flights = listOf(Flight("sheep", Anchor.Hand, Anchor.Chip(other)), Flight("brick", Anchor.Chip(other), Anchor.Hand, 400))) }))
            add(fr(5700, trade(mapOf("wood" to 0, "brick" to 2, "sheep" to 1, "wheat" to 2, "ore" to 1)) { copy(hint = "Traded a Sheep for a Brick.") }))
        }),
    ))

    // 7. Harbors
    val any = portFor(true); val res = portFor(false)
    val houseAt = { p: Port? -> p?.vx?.firstOrNull()?.let { listOf(Pt(it[0], it[1])) } ?: emptyList() }
    ch += Chapter("Harbors: 3:1 and 2:1", listOf(
        TutStepScript("Harbors sit on the coast. Each one touches two corners. With a settlement or city on one of those corners, the harbor is yours to use.", 4800, one(sc(bc.at) { copy(port = any, labels = any?.let { listOf(Label("3:1", Pt(it.x, it.y), big = true)) } ?: emptyList()) })),
        TutStepScript("A ? harbor (3:1) changes every bank rate in the trade window from 4:1 to 3:1: any 3 matching cards buy 1 card of your choice.", 5600, listOf(
            fr(0, sc(bc.at) { copy(port = any, labels = any?.let { listOf(Label("3:1", Pt(it.x, it.y), big = true)) } ?: emptyList()) }),
            fr(300, sc(bc.at) { copy(port = any, extraHouses = houseAt(any)) }),
            fr(1300, sc(bc.at) { copy(port = any, extraHouses = houseAt(any), trade = Trade(mapOf("wood" to 3, "brick" to 1, "sheep" to 2, "wheat" to 3, "ore" to 1), hint = "Every rate is 4:1 without a harbor.")) }),
            fr(2700, sc(bc.at) { copy(port = any, extraHouses = houseAt(any), trade = Trade(mapOf("wood" to 3, "brick" to 1, "sheep" to 2, "wheat" to 3, "ore" to 1), rates = RES5.associateWith { 3 }, flash = RES5.toSet(), hint = "With a 3:1 harbor every rate is 3:1.")) }),
        )),
        TutStepScript("A resource harbor (2:1, it shows that resource) makes only that resource 2:1: here ${article(r2n)} $r2n harbor, so 2 ${r2n.lowercase()} buy any 1 card. Your other cards keep their rate.", 6000, run {
            val rr = res?.type ?: "sheep"; val rl = RES_LABEL[rr] ?: rr
            val hand = mapOf("wood" to 3, "brick" to 1, "sheep" to 2, "wheat" to 3, "ore" to 1) + (rr to 2)
            listOf(
                fr(0, sc(bc.at) { copy(port = res, labels = res?.let { listOf(Label("2:1", Pt(it.x, it.y), big = true)) } ?: emptyList()) }),
                fr(300, sc(bc.at) { copy(port = res, extraHouses = houseAt(res)) }),
                fr(1300, sc(bc.at) { copy(port = res, extraHouses = houseAt(res), trade = Trade(hand, hint = "Every rate is 4:1 without a harbor.")) }),
                fr(2700, sc(bc.at) { copy(port = res, extraHouses = houseAt(res), trade = Trade(hand, rates = DEFAULT_RATES + (rr to 2), flash = setOf(rr), hint = "With ${article(rl)} $rl harbor, $rl is 2:1.")) }),
            )
        }),
    ))

    // 8. Buying from the trade window
    val buyDev = r.step("buydev"); val cities = r.step("cities")
    ch += Chapter("Buying from the trade window", listOf(
        TutStepScript("Development cards are bought in the trade window. When you hold sheep, hay and ore, a Buy a Dev card button appears there. Tap it to draw a card.", 5600, listOf(
            fr(0, sc(bc.at)),
            fr(300, sc(bc.at) { copy(trade = Trade(mapOf("wood" to 0, "brick" to 2, "sheep" to 1, "wheat" to 2, "ore" to 1), buys = listOf("dev"), hint = "You can afford a development card.")) }),
            fr(1700, sc(bc.at) { copy(trade = Trade(mapOf("wood" to 0, "brick" to 2, "sheep" to 1, "wheat" to 2, "ore" to 1), buys = listOf("dev"), pulse = setOf("buy:dev"), hint = "You can afford a development card.")) }),
            fr(2300, sc(bc.at) { copy(trade = Trade(mapOf("wood" to 0, "brick" to 2, "sheep" to 0, "wheat" to 1, "ore" to 0), hint = "Bought a development card."), reveal = Reveal(buyDev.string("card") ?: "knight", DEV[buyDev.string("card") ?: "knight"]?.first ?: "Card")) }),
        )),
        TutStepScript("Once you have 3 cities and can pay wood, brick, 2 sheep, hay and ore, a Buy the Heist button appears too. You can buy it once per game.", 5800, listOf(
            fr(0, sc(cities.at)),
            fr(300, sc(cities.at) { copy(trade = Trade(mapOf("wood" to 1, "brick" to 1, "sheep" to 2, "wheat" to 1, "ore" to 1), buys = listOf("heist"), hint = "3 cities: you can buy the Heist.")) }),
            fr(1800, sc(cities.at) { copy(trade = Trade(mapOf("wood" to 1, "brick" to 1, "sheep" to 2, "wheat" to 1, "ore" to 1), buys = listOf("heist"), pulse = setOf("buy:heist"), hint = "3 cities: you can buy the Heist.")) }),
            fr(2300, sc(cities.at) { copy(trade = Trade(mapOf("wood" to 0, "brick" to 0, "sheep" to 0, "wheat" to 0, "ore" to 0), hint = "Bought the Heist card. Play it on a later turn."), reveal = Reveal("heist", "Heist")) }),
        )),
    ))

    // 9. The robber and 7
    val bank = r.step("bank"); val seven = r.step("seven"); val rob = r.step("robber")
    ch += Chapter("The robber and 7", listOf(
        TutStepScript("A roll of 7 brings out the robber. Nobody collects anything.", 3600, one(sc(bank.at) { copy(dice = seven.ints("dice")) })),
        TutStepScript("Anyone holding more than 7 cards must discard half of them.", 3800, listOf(fr(0, sc(bank.at))) + r.steps("discard").mapIndexed { j, d ->
            fr(300L + j * 500, sc(d.at) { copy(flights = List(minOf(d.int("n") ?: 0, 4)) { Flight("back", Anchor.Chip(d.int("p")!!), Anchor.BelowChip(d.int("p")!!), it * 120L) }) })
        }),
        TutStepScript("Then move the robber onto any tile. That tile pays nothing while the robber stands on it.", 4000, listOf(
            fr(0, sc(r.steps("discard").last().at)),
            fr(300, sc(r.steps("discard").last().at.copy(robber = rob.int("tile")!!)) { copy(glowTiles = listOf(rob.int("tile")!!)) }),
        )),
        TutStepScript("Finally, steal one random card from a player with a town on that tile.", 3600, listOf(
            fr(0, sc(r.steps("discard").last().at.copy(robber = rob.int("tile")!!)) { copy(flights = listOf(Flight(rob.string("card") ?: "back", Anchor.Chip(rob.int("victim")!!), Anchor.Chip(me)))) }),
            fr(1200, sc(rob.at)),
        )),
    ))

    // 10. Development cards
    val knight = r.step("knight")
    ch += Chapter("Development cards", listOf(
        TutStepScript("A development card costs sheep, hay and ore (bought in the trade window). It stays hidden in your hand until you play it.", 4400, one(sc(buyDev.at) { copy(reveal = Reveal(buyDev.string("card") ?: "knight", DEV[buyDev.string("card") ?: "knight"]?.first ?: "Card")) })),
        TutStepScript("Play one card a turn by tapping the Dev card in your hand (not on the turn you bought it).", 7000, one(sc(buyDev.at) { copy(panel = Panel("The cards", listOf("knight", "roadBuilding", "yearOfPlenty", "monopoly", "vp").map { PanelRow(DEV[it]!!.first, note = DEV[it]!!.second, icon = it) })) })),
        TutStepScript("A Knight moves the robber and steals a card. The first player with 3 Knights gets Largest Army: 2 points.", 4600, listOf(
            fr(0, sc(buyDev.at.copy(robber = knight.int("tile")!!)) { copy(glowTiles = listOf(knight.int("tile")!!)) }),
            fr(1300, sc(knight.at) { copy(flights = listOf(Flight("back", Anchor.Chip(knight.int("victim")!!), Anchor.Chip(me)))) }),
        )),
    ))

    // 11. Longest Road
    val longest = r.step("longest"); val chain = longest.ints("chain")
    ch += Chapter("Longest Road", listOf(
        TutStepScript("The first player with 5 connected roads earns Longest Road: 2 points. A longer road takes it away.", 5600,
            chain.mapIndexed { i, _ ->
                val keep = chain.drop(i + 1).map { it.toString() }.toSet()
                fr(i * 350L, sc(longest.at.copy(r = longest.at.r.filterKeys { it !in keep })))
            } + fr(chain.size * 350L + 300, sc(longest.at) { copy(longestRoadLabelAt = chain.lastOrNull()) })),
    ))

    // 12. The Heist
    val heist = r.step("heist")
    ch += Chapter("The Heist", listOf(
        TutStepScript("Once you have 3 cities you may buy the Heist card, once per game (4 cities when playing to more than 10 points).", 4600, one(sc(cities.at) { copy(reveal = Reveal("heist", "Heist")) })),
        TutStepScript("Play it to steal an opponent's settlement where it stands, together with its 2 roads if exactly 2 of their roads touch it.", 5000, listOf(fr(0, sc(cities.at)), fr(500, sc(heist.at) { copy(flashCorner = heist.int("v")) }))),
    ))

    // 13. Winning
    ch += Chapter("Winning", listOf(
        TutStepScript("Reach the points target on your own turn and you win the game!", 4200, one(sc(heist.at) { copy(trophy = true) })),
    ))

    // 14. Special maps
    ch += Chapter("Special maps", listOf(
        TutStepScript("Some maps add a twist. Read the map card before you start.", 8000, one(sc(empty) { copy(panel = Panel("Special maps", listOf(
            PanelRow("Blue Flame Cup", note = "Fog hides tiles. A road that reaches the fog uncovers it and pays you. A hidden cup burns all your wood, sheep and hay."),
            PanelRow("Hidden Vault", note = "A diamond 8 under the fog: when 8 is rolled, its towns pick free cards."),
            PanelRow("Hay Hollows", note = "Every tile starts as hay. Settling after setup turns the hay next to you into other resources."),
            PanelRow("US 2.0", note = "A giant 144-tile map: slide with one finger, pinch to zoom, tap Fit to see it all."),
        ))) })),
    ))

    // 15. Playing online
    ch += Chapter("Playing online", listOf(
        TutStepScript("Play with anyone, with friends, or with bots.", 8500, one(sc(empty) { copy(panel = Panel("Online", listOf(
            PanelRow("Quick play", note = "joins an open public game. Create a room and share the code with friends, or fill seats with bots."),
            PanelRow("Ready", note = "Everyone taps I'm ready before the host can start."),
            PanelRow("Timer", note = "Public games use a move timer so turns keep moving."),
            PanelRow("Leaving", note = "If you lose connection a bot plays for you until you come back. Leaving on purpose gives your seat to a bot for good."),
            PanelRow("Chat", note = "Be kind. Report or mute a message you don't like."),
        ))) })),
    ))
    return ch
}
