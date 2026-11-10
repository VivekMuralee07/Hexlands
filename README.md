# Hexlands

A multiplayer island-settling game for 2–4 players in the browser. Gather wood, brick, sheep, hay and ore, trade, build, and race to the points target.

- Join with a 5-character room code or an invite link (`/room/ABCDE`)
- 20 maps in two categories. Countries (15): India, United States, United Kingdom, Australia, Japan, Italy, Brazil, France, Spain, Germany, China, Canada, Mexico, Argentina and New Zealand. Misc maps (5): Classic Island, Blue Flame Cup, Hidden Vault, Hay Hollows and US 2.0. There is also a map editor. The host picks the category and map on the create screen, and can change or shuffle the map in the waiting room until the game starts. Country maps are traced from simplified real outlines, so the shapes and proportions follow the real countries (Italy is a boot with Sicily and Sardinia, Argentina is tall and thin, Canada wraps around Hudson Bay). The number of tiles grows with the country's real area, softened so small countries stay playable: 24 tiles for the United Kingdom, 52 for India, 61 for Australia, 66 for Canada. The terrain colours are saturated so each resource stands out.
- Hidden Vault: the same size as Blue Flame Cup, but all land with no lake or outer fog. A diamond hex with an 8 sits in the middle, buried under two full rings of fog (18 tiles). Fog works as on Blue Flame Cup: a road tip or settlement touching a fog tile uncovers it, and an ordinary tile pays the player one card. When the game starts, Blue Flame Cups are hidden at random in that fog, two more than there are players (4 cups for 2 players, 5 for 3, 6 for 4). A cup works exactly as on Blue Flame Cup: whoever unlocks one loses all their wood, sheep and hay, and blue fire sweeps the screen. The first two settlements cannot touch the fog, so nobody starts on the diamond: you have to build roads through the fog to reach it. The diamond never pays a fixed resource: when an 8 is rolled, every settlement on it lets its owner choose any 2 cards from the bank and every city 3, in a floating window (the robber blocks it like any tile; the move timer, offline players and bots choose automatically). A burst of light and gems plays over the diamond. Everything else gets random terrain and numbers as on other maps.
- Hay Hollows: a big hexagon of 73 tiles (the Hidden Vault is 61). The centre is a desert with the robber; every other tile is hay (Fields) numbered 6, 8 or 9, 24 of each. All 12 harbors are 3:1 (any resource), three at random places on each of the top, right, bottom and left. No fog. From a player's third settlement on (the first one built after setup), every hay tile numbered 6, 8 or 9 that the new settlement touches changes into a random other resource (wood, brick, sheep or ore, each tile chosen on its own) with a random number that is not 6, 8 or 9. Upgrading to a city changes nothing. The Heist card works as on every map. It cannot be copied into the map editor.
- US 2.0: the United States four times as big: exactly 144 hexes traced from the real outline (about 255 km per hex), with the Great Lakes cut out of the north, 8 deserts and 25 harbors around the coast (10 are 3:1; wood, brick, sheep, hay and ore each have three 2:1). The bank holds 144 of each resource. The map opens zoomed in (about 11 hexes across) so numbers stay readable: slide it with one finger, pinch or use the wheel to zoom out and see all of it, and double tap to come back to the starting view. It is the heaviest map, but it slides smoothly on most phones.
- Blue Flame Cup: a hexagon of 55 tiles around a lake with a desert island in the middle. The two rings around the lake are forest, and all six harbors float in the lake and are 2:1 wood. Everything else is fog: 30 tiles hide a random resource that is never wood. A road or settlement touching a fog tile (a road counts as touching it with either tip, not only along its side) uncovers it for everyone (it then shows its terrain and number), and the player who uncovered it receives one card of that tile's resource from the bank. The robber cannot be moved onto fog, bots cannot see under it either, and nothing can be settled beside only the desert island. The map's trap: when the game starts, one Blue Flame Cup is hidden in the fog for every player (3 players, 3 cups). A cup has no resource and no number. The player who unlocks one loses every wood, sheep and hay card to the bank, and a blue fire sweeps across every player's screen. On this map the first two settlements cannot touch the fog.
- Bots (Easy, Medium, Hard) can fill any empty seat, up to 4 players in total
- Host options before each game: points to win, discard limit and amount, move timer, friendly robber, balanced dice
- Flat, colorful board with a slim border and a map-name label: moving sea, windmills, chimney smoke, flying resource cards, confetti on a win
- Bank bar and player cards: points badge (crown for the leader), development cards, knights, cards in hand, longest road, and roads, settlements and cities left to build
- Robber: a ring appears around the number token of every hex where it can go
- Discarding on a 7: your cards are shown one by one; tap the ones to give back (a meter fills as you pick, Auto-pick helps), then they fly to the bank. Other players' discards fly to the bank too.
- Placement spots are glassy circles: big ones when you are placing one kind of piece (setup, or a single build), smaller ones with the piece drawn inside when roads, settlements and cities are all possible. A light-blue card above the map shows the piece you are placing.
- Harbors are little ships with a billowing sail showing the symbol and ratio (? for 3:1), tied to the coast by wooden jetties
- Trade window: pick what you want in the top row, tap cards in your hand to offer them, then press the bank tick (exact bank or harbor rate) or the players tick. Your bank rates show under each card in your hand.
- Every public card movement flies slowly across the screen as the real resource: bank trades (to and from the bank), player trades (both ways), Year of Plenty and starting cards, as well as dice income, discards, steals and Monopoly.
- Development cards: the ones you hold show in your hand by type with a count. Tap the purple pile in the bank bar to see how many of each kind are still unseen, how many have been played, and what you hold.
- House colors: in the waiting room tap your house to pick from 10 colors (no duplicates). The host can recolor bots. Colors are kept when the game starts.
- Clean game screen: no top bar. The map has two small icons in its top-right corner: messages (phones and narrow windows; wide windows keep the log in its own column) and Leave. Sound and music are in the waiting room and on the home screen, and the rules are on the home screen.
- Stolen cards (robber or Knight) and Monopoly cards fly across the screen from the player who lost them to the player who gets them. Only the thief and the victim see which card it was; everyone else sees a face-down card.
- Terms, privacy, reporting and muting (needed for Google Play, because the game has chat). The first time someone opens the game, a dialog asks them to agree to the Terms of Use and Privacy Policy; it cannot be skipped, and it appears again if `LEGAL_VERSION` changes. The same texts are public pages at `/terms` and `/privacy` (use the `/privacy` address as the privacy policy URL in the Play Console) and are linked from the home screen. Every chat message from another player has a **⋯** menu with **Report this message** (six reasons and an optional note) and **Mute** (hides that player's messages on this device; a bar above the log lists who is muted and lets you unmute). The text lives in `legal.js`. If you change what the game collects (accounts, ads, analytics), change that file and raise `VERSION` there and `LEGAL_VERSION` in `app.js` together; a test checks they match.
- Settings for the legal pages and reports (Render asks for them when you deploy, or add them under Environment): `OPERATOR_NAME` (your name or company, shown in both pages), `CONTACT_EMAIL` (shown as the contact address; also use it as the developer email in the Play listing) and, optionally, `ADMIN_KEY`. Reports are written to the server log as lines starting with `REPORT`, and with `ADMIN_KEY` set you can read the latest 200 at `/api/admin/reports?key=YOUR_KEY` (they are kept in memory, so they disappear when the server restarts).
- Info button: the round "i" at the right end of the bank bar opens a window with three tabs. Costs (road, settlement, city, development card and Heist card), Points (what a settlement, city, Longest Road, Largest Army and Victory Point card are worth, and who holds the two bonuses now) and Settings (points to win, discard limit and amount, move timer, friendly robber, balanced dice).
- Heist card (every map): each player may buy one Heist card per game for 1 wood, 1 brick, 1 hay, 2 sheep and 1 ore, but only after building 3 cities (4 in games to more than 10 points). It works like a development card (play it on a later turn, one per turn). Playing it lets you tap any opponent's settlement, never a city, and steal it: it stays where it is and becomes yours, so a point changes hands. If exactly two of the victim's roads touch that settlement, both come with it (you need two road pieces left), so you keep a settlement with its two roads; the preview shows which roads you take. Stolen settlements and roads can cut or free other roads. A masked thief, a spotlight and a burst of coins play across every player's screen. Medium and Hard bots use it too.
- Tap to build: once you have rolled and can afford a road, settlement or city, every legal spot glows on the map. Tap a spot and the piece appears there in your colour with a small green ✓ square above it; only tapping the square builds it (tap another spot to move the preview).
- Rolling and ending: when it is your turn, a dice button appears at the bottom right of the map; tap it to roll. After rolling, a green End button takes its place; tap it to end your turn. Knights and other development cards are played by tapping the Dev card in your hand.
- Dice: two plain, independent dice. Every total has its natural chance: 7 comes up 6 times in 36, 6 and 8 five times, 5 and 9 four times, 4 and 10 three times, 3 and 11 twice, 2 and 12 once. Nothing is planned or evened out. (The host can still switch on Balanced dice in the room options; it is off by default.)
- Numbers: every map uses the standard number set (2 3 3 4 4 5 5 6 6 8 8 9 9 10 10 11 11 12), repeated for bigger maps.
- Zooming: pinch or use the mouse wheel; double tap the map to fit it to the screen again. The map keeps its size and position during the game: when the hint above it or the bars around it change height, a little more or less sea shows instead of the map rescaling.
- Speed and the map: the whole map is drawn once and is always there (on every map): sliding only moves that picture and zooming only resizes it, so nothing is generated while you slide or zoom, and the map can never look unfinished at its edges. The map also may not be slid so far that the centre of the screen leaves it, and this limit applies while your finger is moving, so it never jumps back when you let go. For speed the map has no endless animations (they made the phone repaint the whole map every frame), and number tokens and harbors use drawn shadows instead of blur filters. On a phone-speed test this took Classic from about 4 frames a second to 60, and US 2.0 from about 4 to 15–60 while sliding.
- Buying: the Dev card and the Heist are bought inside the trade window (tap any resource card to open it). Each button appears there only when you can afford it, and the Heist only once you have the cities it needs.
- Tap any resource card in your hand to trade: it opens the trade window with that card offered. Keep tapping cards to offer more.
- A bar above the map shows the instruction, move timer, dice and setup order, so nothing covers the board
- Longest Road and Largest Army are announced on screen the moment they change hands
- Bigger number tokens, pieces, dice and harbor plates; light gaps between hexes
- Beat themes at the start and finish, a click on every button, and a note for each resource card
- Leaderboard at the end with points breakdown, stats and a dice chart
- Tap the gold **i** on the start page (or **Rules** in a game) for a short rules guide
- Installable as an app (PWA): manifest, service worker, a miniature-island icon, home-screen shortcuts and an Install button; ready for PWABuilder
- No dependencies: plain Node.js, no database

## Run locally

Requires Node.js 18 or newer.

```bash
npm start            # http://localhost:3000
npm test             # 163 tests: rules, full simulated games, matchmaking, leaderboard, saved games, and browser screen tests (about a minute)
```

GitHub Actions (`.github/workflows/test.yml`) runs `npm test` on Node 22 for every pull request and every push to `main`, and a newer push cancels an older run. To stop a failing run from being merged, turn on branch protection for `main` (Settings, Branches) and require the **npm test** check.

Open two browser windows (or a phone on the same network at `http://<your-ip>:3000`) to play against yourself.

## Put it on GitHub

All 32 files sit side by side at the top level of `main`, with no folders. Upload them all at once.

1. On github.com, create a new empty repository.
2. Click **uploading an existing file**.
3. Unzip the download, select every file inside, and drag them onto the upload area.
4. Keep **Commit directly to the main branch** selected and click **Commit changes**.

To update an existing repo, do the same: files with the same name are replaced, and the new ones (`legal.js`) are added. Render redeploys automatically.

The repo front page should list the 32 files: `app.js`, `art.js`, `assetlinks.json`, `apple-touch-icon.png`, `bots.js`, `bots.test.js`, `engine.test.js`, `game.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon.svg`, `index.html`, `legal.js`, `manifest.webmanifest`, `maps.js`, `matchmaking.test.js`, `package.json`, `README.md`, `render.yaml`, `rules.test.js`, `screenshot-game-wide.png`, `screenshot-game.png`, `screenshot-home.png`, `server.js`, `server.test.js`, `sound.js`, `style.css`, `sw.js`, `tutorial.js`, `tutorial-record.js` (and `.gitignore` if your file browser shows hidden files; it is optional).

Only the web app itself is sent to browsers: the page, scripts, styles, icons, screenshots, the manifest and the service worker. The server code, tests and config are never served.

## Deploy on Render

**Option A: Blueprint (uses `render.yaml`)**
1. Render dashboard → **New** → **Blueprint**
2. Connect your GitHub account and pick the repo
3. Click **Apply**. Render builds and gives you a URL like `https://hexlands.onrender.com`

**Option B: Web Service by hand**
1. Render dashboard → **New** → **Web Service** → pick the repo
2. Runtime: **Node**, Build command: `npm install`, Start command: `npm start`
3. Health check path: `/healthz`

### Things to know about hosting

- Games live in server memory. A redeploy or restart ends running games; players see a message and return to the home screen.
- Render's free plan sleeps after about 15 minutes with no traffic. The first visit after that takes 30–60 seconds, and idle rooms are gone. A paid instance stays awake.
- Idle rooms are cleaned up automatically (30 minutes with nobody connected, or 6 hours total).
- Live updates use Server-Sent Events over normal HTTPS, which Render supports with no extra setup.

## Playing with people from anywhere

Anyone in the world can open your Render address. Public play is **on by default**, and new rooms start as Public. To close it, set `PUBLIC_ROOMS` to `off` in the Render dashboard (Environment); a restart applies it, with no code change. While it is off, the home screen shows only *Create a room* and join by code, and the server refuses Quick play and public rooms. When it is on, these parts help strangers find each other:

- **Quick play** (home screen) joins the fullest open public room, or opens a new public room (Classic Island, 10 points, 30 second move timer).
- **Public rooms** shows the list of waiting public rooms (host name, map, points, timer, seats). The list refreshes every few seconds.
- **Create a room** has a Private / Public switch. The host can flip it in the waiting room. Public rooms start with the move timer on.
- **Waiting room, public rooms:** everyone taps *I'm ready*; when all four seats are taken and every human is ready, a 5 second countdown starts the game. After a minute with no new player the host sees *Play with bots*. People who disappear from a public waiting room lose their seat after 30 seconds; an empty room closes.
- **Host hand-over:** if the host leaves or stays offline for 20 seconds, the next connected human becomes host.
- **Ready before start:** with two or more people in the room, the host can start only when every person (the host too) has tapped *I'm ready*. One person with bots can start at once. Changing the map or options clears the ticks.
- **Dropped connections (every running game, public or private):** when a player's connection drops, a bot (medium) plays their seat within about 3 seconds (a page reload is not a drop). Everyone sees *"X is away. A bot plays for them"* and an AWAY tag on the seat. The moment the player comes back (reopening the app, or the connection returning) the bot hands the seat straight back, however long they were gone, and the move clock starts fresh. The player who dropped sees a *Connection lost* card with *Reconnect*.
- **Leaving and idling:** tapping Leave in a running game hands the seat to a bot at once, **for good**: there is no Reconnect and the seat cannot be taken back. A player who lets the move timer run out twice in a row also gets a bot, but can tap *Take back control*.
- **In-game info button:** shows the room code, Public or Private, and buttons to copy the code or the invite link.
- **Chat in public rooms** is free text, with a basic filter: links are refused, bad words are starred out, six messages per ten seconds. Report and mute work as before.

Protection against abuse (all in server memory, nothing stored): per internet address, 20 new rooms an hour, 5 rooms open at a time, 40 joins a minute, and a lock-out after 10 wrong room codes in 10 minutes. The address is read from `cf-connecting-ip` (Cloudflare, which Render uses), falling back to `x-forwarded-for`. Names are cleaned on the server (no hidden characters, 16 characters, "Player 4821" when empty, staff-like names refused). The word list is short; add your own words with the `BLOCKED_WORDS` setting (comma separated). Limits and numbers are constants near the top of `server.js`.

Honest limits of this version: one server holds all rooms, so a restart ends every game; there is no ban list, accounts or automatic muting after repeated reports yet (you read reports at `/api/admin/reports?key=...`); and the server has not been load-tested.

## Animated tutorial

The info page (the **i** button on the home screen) opens with **Watch the animated tutorial**, and the waiting room has a **How to play** button. It plays 15 short chapters in about 3½ minutes: the island, the goal, setup, rolling and collecting, building (with the green ✓), trading, harbors (3:1 and 2:1), buying from the trade window, the robber, development cards, Longest Road, the Heist, winning, the special maps, and playing online. The three trading chapters show the game's own trade window, with a finger doing the tapping: opening it from a card in your hand, picking what you want, giving cards until the bank rate is met, trading with the bank, offering a deal to players (who accept or decline), how a 3:1 harbor turns every rate into 3:1 and a resource harbor turns that one resource into 2:1, and the Buy a Dev card and Buy the Heist buttons, which appear only when you can afford them. Each step has a one or two sentence caption; Back, Play/Pause and Next control it, and the dots jump to a chapter.

It is an animation drawn with the game's own art, not a video file, so it is small (about 40 KB), sharp on every screen, works offline, and matches the game. The moves it shows were recorded from a real game played with the Hexlands engine: the bots chose the setup spots, and the demo turns (a roll that pays three players, two roads, a settlement, a city, a bank trade, a 7 with discards and a steal, a development card and a Knight, Longest Road, three cities and the Heist) were played through the normal rules.

If you change the rules, record it again: `node tutorial-record.js` (optionally with a seed). A test checks that every recorded move is still legal and that `tutorial.js` holds the current recording.

## How to play

1. One player creates a room and picks a map. In the waiting room the host sets the game options, adds bots if wanted, and shares the code.
2. Others enter their name and the code. The host starts; turn order is random.
3. **Setup:** players place a settlement and a connected road in turn order (1, 2, 3, 4), then again in reverse (4, 3, 2, 1). The last player therefore places two settlements back to back. The second settlement collects one card for each neighboring tile. A strip at the top of the board shows the order and whose placement is next.
4. **Your turn:** roll. Every tile with that number pays 1 card to each adjacent settlement and 2 to each city. Then trade, build, play a development card, and end your turn.
5. **Rolling a 7:** nobody collects. Players over the discard limit discard; the roller moves the robber and steals a card from a neighbor.

| Resource | Tile |
|---|---|
| Wood | Forest |
| Brick | Hills |
| Sheep | Pasture |
| Hay | Fields |
| Ore | Mountains |

| Build | Cost | Notes |
|---|---|---|
| Road | wood, brick | Connects to your own roads, settlements or cities |
| Settlement | wood, brick, sheep, hay | 1 point; touches your road; two roads from any other settlement or city |
| City | 2 hay, 3 ore | 2 points; replaces a settlement and pays double |
| Development card | sheep, hay, ore | One of 25 cards (below) |

**Road placement.** A new road must connect to one of your own roads, settlements or cities. It may continue from the end of another road, so a settlement is not needed at its far end. It can never start on the far side of a corner holding another player's settlement or city. A settlement must touch one of your roads (after setup), and the open end of a single road is fine. If an opponent's settlement cuts a chain, the far part stays on the board (drawn faded) and you can keep building from its end, as in the official rules. During setup, the road must touch the settlement you just placed. (The dotted white lines leading to the round harbor signs are harbor piers, not roads.)

**Development cards** (25 on the classic board): 14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty, 2 Monopoly. One per turn, never on the turn you bought it. Knights move the robber; Victory Point cards stay hidden until you win.

**Bonuses:** Longest Road (5 or more connected roads) and Largest Army (3 or more Knights) are worth 2 points each, and you must beat the holder to take them. An opponent's settlement built in the middle of a road cuts it.

Harbors let you trade 3:1 (any) or 2:1 (one resource) with the bank instead of 4:1. You win when you reach the target on your own turn.

## Game options

The host chooses these in the waiting room, before pressing Start. Everyone can see them.

| Option | Choices | What it does |
|---|---|---|
| Points to win | 5–20 (default 10) | First to reach it on their own turn wins |
| Discard limit | 7–15 (default 7) | On a 7, players holding more than this many cards must discard |
| Cards discarded | Half, or 4 | Half of the hand rounded down (official: nine cards means discard four), or exactly 4 |
| Move timer | Off, 15s, 30s, 60s | The clock restarts after each action. When it runs out, the game plays that step for the player: rolls the dice, moves the robber, discards, or ends the turn. Setup placements always get 60 seconds. Bots are never timed. |
| Friendly robber | On / Off | The robber can't be placed next to a player with 2 points or fewer, and such players can't be robbed. If no tile qualifies, it goes to the desert. |
| Balanced dice | On / Off | The colonist.io method. Rolls come from a deck of all 36 combinations that is refilled when fewer than 13 are left. A total that came up in the last 5 rolls is held back (34% less likely for each time). 7s are also shared out between players: someone who just rolled 7s, or has rolled more than their share, gets fewer |

## Bots

In the waiting room, the host picks a difficulty and presses **Add bot**. Bots take open seats, so a table can be any mix of people and bots up to 4. The host can change a bot's difficulty or remove it until the game starts.

| Level | How it plays |
|---|---|
| Easy | Places settlements loosely, builds in random order, rarely trades. Good for learning. |
| Medium | Picks strong spots, builds cities and settlements first, trades with the bank toward its next build. |
| Hard | Weighs scarce resources and harbors, chases Largest Army and Longest Road, aims the robber at the leader, and refuses trades that would help a player close to winning. |

In testing, medium beat easy in 99% of games, and hard beat medium in about 60% (200 games each). Bots only use information a human could see. They follow every option above, including the friendly robber.

## Sound

All sound is generated in the browser, so there are no audio files. A beat theme plays when a game starts and a victory theme when it finishes. Effects are modeled on a physical table: wooden knocks for roads, settlements and cities (each different), a dice cup that rattles and tumbles, card slides when you collect, steal or buy a card, a soft two-note bell for your turn, coins for trades, a quiet ping for a trade offer, a low thump for the robber and a darker sting for a 7, a whoosh when cards are discarded, a short fanfare when someone takes Longest Road or Largest Army, and a tick in the last 5 seconds of your clock. Tapping a resource card plays its own note. Use the speaker and music buttons to switch effects and music on or off; the choice is remembered. Browsers only allow sound after your first tap.

## Leaderboard

When someone wins, the leaderboard ranks every player with a points breakdown (settlements, cities, Longest Road, Largest Army, hidden point cards), stats (resources harvested, cards stolen, trades, knights, development cards bought), a dice chart against fair odds, and your win record on this device. Press **Results** to reopen it.

## Map editor

From **Create a room**, choose **Your own map** (or **Copy into editor** on any preset).

- Pick a terrain and tap or drag across the grid. **Sea** removes tiles.
- Pick a number and tap tiles to place it, or press **Auto numbers** (keeps 6s and 8s apart).
- Tiles without a number get one when the game starts. Harbors are placed automatically.
- 7 to 60 tiles; separate islands are allowed. Your map is saved in your browser.

## Make an Android app (APK) with PWABuilder

The game is a Progressive Web App, so PWABuilder can wrap it as an Android app. The icon is a miniature island of seven hexes with all five resources and a number token.

1. Deploy to Render first. PWABuilder needs your public HTTPS address, such as `https://hexlands.onrender.com`.
2. Open pwabuilder.com, paste the address and press **Start**. The report should show a valid manifest, a service worker and HTTPS.
3. Choose **Package for stores**, then **Android**. Suggested options: package ID like `com.yourname.hexlands`, app name `Hexlands`, display mode `Standalone`, status bar color `#0b3a7a`, splash color `#0a68a6`, and let PWABuilder create a **new signing key**.
4. Download the zip. It holds the signed APK (install it on a phone), an `.aab` file (for Google Play), the signing key and its password file (keep these safe: you need them for every update), and an `assetlinks.json`.
5. Put the `assetlinks.json` from the zip in this repo, either in a folder called `.well-known` (`.well-known/assetlinks.json`) or flat next to the other files. The `.well-known` copy takes priority. Commit, and Render redeploys; the file is then served at `/.well-known/assetlinks.json`. Until Android can verify it, the app shows a browser address bar at the top. Afterwards it runs full screen.
6. Install the APK: copy it to the phone, allow "install unknown apps" for your file manager, then open the file.

Notes:
- Updating the game never needs a new APK. The app loads your live site, so a push to GitHub is enough.
- On Render's free plan the server sleeps when idle, so the first launch after a quiet spell can take up to a minute.
- Without the internet the app opens its shell but cannot start a game, because games run on the server.
- Browsers that support installing also show an **Install the app** button on the home screen.

Still seeing the address bar? Work through these in order:
1. Open `https://YOUR-SITE/.well-known/assetlinks.json` in your phone's browser. You should see the JSON from PWABuilder, not `[]`. If it shows `[]`, the file is not in the repo yet or Render has not finished deploying.
2. Check that the file's `package_name` is exactly the package ID you chose in PWABuilder, and that `sha256_cert_fingerprints` holds the fingerprint of the key that signed the APK you installed (it is in the signing key info file in the zip). If you later publish on Google Play with Play App Signing, add Google's fingerprint as a second entry.
3. Ask Google to confirm the link by opening this address (fill in the three parts): `https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://YOUR-SITE&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=YOUR.PACKAGE.ID&target.android_app.certificate.sha256_fingerprint=YOUR:SHA256:FINGERPRINT`. It should answer `"linked": true`.
4. Android remembers a failed check. Uninstall the app and install the APK again (or clear Chrome's data), then open the app twice.
5. On Render's free plan, wake the site first by opening it in a browser. If the server is asleep while the app launches, the check can time out.

## Leaderboard (SQLite)

Finished games are saved to a SQLite file so wins add up across games and survive restarts. The home screen has a **Leaderboard** button: most wins first, with three tabs.

- **Ranked** (the default): games that began in a **public room** with **two or more different people**. The same group of people counts as ranked **3 times in 24 hours**; further games between them still count under Multiplayer. This is what makes it hard to farm wins with a friend.
- **Multiplayer**: every game with two or more people, public or private.
- **All games**: every game, against bots too.

Each list has a **period** (all time, last 30 days, last 7 days) and a **sort** order (most wins, win rate, average points). The window shows, from the top:

- **Totals** for the list: games played, players ranked, turns per game, and the most played map.
- **Your standing**: rank, win rate ring, wins and games, a win streak, and your last five results (green won, red lost).
- **A podium** for the top three, then everyone else with their record (for example 5W 7L) and a win-rate bar.
- **Details on tap** for any player: win rate, average points, best game, current win streak, favourite map, when they last played, and their last five results.

A player is listed in a tab only after **3 finished games** in it (`LEADERBOARD_MIN_GAMES` changes that number). Until then they see "Play N more games to be ranked". Two listed players with the same name get a short tag from their ID (for example `Ann #a3f9`), so nobody can pass as someone else. A game against bots or one person alone never counts as ranked. Databases made by the first version are upgraded automatically when the server starts; their old games count under Multiplayer and All games.

- **No accounts.** The app makes a random player ID once and keeps it on the device. It is sent when you create or join a room and is never shown to other players or in the leaderboard. Clearing the app data starts a player from zero.
- **What is stored** when a game ends: room code, map, time, points to win, turns, and for each person (never bots) their display name, player ID, points, and whether they won or left. A seat that a bot took over counts as a game played and never as the win.
- **Where.** `DB_PATH` sets the file (default `./data/hexlands.db`, which is ignored by git). `render.yaml` adds a 1 GB persistent disk mounted at `/var/data` and sets `DB_PATH=/var/data/hexlands.db`; without a disk the file is lost on every deploy. A service with a disk runs as one instance.
- **Node 22.5 or later** is needed (the built-in `node:sqlite`, nothing to install). On an older Node the game runs as before and the leaderboard says it is off.
- **Backups.** The disk survives restarts and crashes but is not a backup. Copy `hexlands.db` somewhere safe now and then.
- **Privacy.** The Terms and Privacy Policy (`legal.js`) now describe this storage, and the version date changed, so everyone is asked to agree again. Please read the new text and adjust it to how you run the game.
- **Games in progress survive a restart or a crash.** While the server runs, every room that changed is saved to the same database about 1.5 seconds later, and all rooms are saved when the host stops the server (SIGTERM). When the server starts, the saved rooms are loaded again: players reconnect by themselves and keep their seats (the seat codes are saved too), and bots and the move clock start again. A player who does not come back within about 45 seconds gets the usual bot takeover. A crash can lose the last second or two of moves. A finished game is removed from the saved rooms (its result is already in the leaderboard), and saves older than 6 hours are dropped. The room owner's IP address is never saved.

## Make an Android app with Capacitor

An alternative to PWABuilder: a native Android Studio project in `android/`, managed by [Capacitor](https://capacitorjs.com). Like the PWABuilder app it is a shell that loads the live site, so a push to GitHub updates the game without a new APK. Settings are in `capacitor.config.json`:

- `appId`: the package ID. It is set to the existing PWABuilder one (`com.vivek.hexlands_r2fs.twa`) so a build with the same signing key replaces that app. Change it before the first Play upload if you want a different ID; it can never change afterwards.
- `server.url`: your deployed HTTPS address (`https://hexlands-r2fs.onrender.com`). Change it if the site moves.
- `www/index.html`: the page shown when the server cannot be reached.

You need Node 18+, JDK 17+ and the Android SDK (Android Studio installs both the SDK and a JDK).

```
npm install
npm run android:open      # opens the project in Android Studio; press Run to install on a phone
npm run android:debug     # or build android/app/build/outputs/apk/debug/app-debug.apk from the command line
npm run android:release   # builds the .aab for Google Play (needs a signing key, see below)
```

Run `npm run cap:sync` after changing `capacitor.config.json` or upgrading the Capacitor packages.

**Signing a release.** In Android Studio choose Build, Generate Signed Bundle, create a keystore and keep it and its passwords safe (you need them for every update). Do not commit the keystore. With Play App Signing, add Google's certificate fingerprint to `assetlinks.json` as described above.

Notes:
- The launcher icon, splash screen and status bar colour are already set to the Hexlands icon and colours.
- The same Render notes apply: a sleeping free server makes the first launch slow, and without internet the app shows the "could not reach the game server" page.

## Publish on Google Play

You need: a Play Console developer account (one-time fee, identity checks), the live HTTPS site, and the signed `.aab` from PWABuilder (previous section).

**Before you build the Android package**
1. In Render set `OPERATOR_NAME` and `CONTACT_EMAIL` (the Terms and Privacy pages show them) and `ADMIN_KEY` (to read chat reports). Check `https://YOUR-SITE/privacy` and `/terms` open without logging in.
2. Use a paid Render instance. Google's reviewers open the app on their own schedule; a sleeping free server looks like a broken app.
3. Pick the package ID now (for example `com.yourname.hexlands`). It can never change after the first upload.

**In Play Console (Create app: Game, Free)**
1. *Store listing:* use the texts below, the 512 px `icon-512.png`, a 1024 x 500 feature graphic, and 2 to 8 phone screenshots (`screenshot-home.png`, `screenshot-game.png`; take more of your own if you like).
2. *App content:* Privacy policy URL `https://YOUR-SITE/privacy`. Ads: **No**. App access: **All functionality available without login**. Target audience: **13 and older** (not children; do not pick the under-13 groups). News app, government, health, financial features: **No**.
3. *Content rating (IARC questionnaire):* no violence beyond abstract board-game moves, no sexual content, no gambling, no purchases. Answer **Yes** to "users can interact or exchange content" (the chat). Expect an "Everyone 10+" or "Teen" style result with a "users interact" notice.
4. *User-generated content:* Google requires reporting, blocking and terms. Hexlands has report and mute on every chat message, a word filter, rate limits, and Terms of Use. If a form asks, say reports are reviewed through the admin report list.
5. *Data safety:* see the suggested answers below. Check them against Google's own definitions before you submit; you are the one who signs the form.
6. *Release:* upload the `.aab` to **Closed testing** first. Turn on **Play App Signing** when asked.
7. *Digital Asset Links:* after the first upload open Play Console, Setup, **App integrity**, copy the **App signing key certificate SHA-256**, and add it as a second fingerprint in `assetlinks.json` (next to PWABuilder's own). Commit it, let Render deploy, and check the app opens without an address bar.

**New personal accounts (created after 13 Nov 2023):** Play requires a closed test with at least 12 testers who stay opted in for 14 continuous days (testers should actually open the app, because Google also checks engagement) before you can apply for production access. Organization accounts are exempt. Public Quick play needs other people online: ask your testers to open the app together at set times.

**Store listing text**
- App name: `Hexlands`
- Short description (80 characters max): `Build and trade on a hex island. Play online with anyone, friends or bots.`
- Full description:

> Hexlands is a fast multiplayer strategy game of trading and building on a hex island.
>
> Roll the dice, collect wood, brick, sheep, hay and ore, trade with other players or the bank, and race to build roads, settlements and cities. First to the points target wins.
>
> PLAY YOUR WAY
> - Quick play: join an open public game with players from anywhere, or open your own.
> - Create a private room and share the code with friends.
> - Fill empty seats with bots at three difficulty levels.
>
> 19 MAPS
> Classic Island, 15 country maps, and special maps with hidden fog tiles, a diamond vault, and the Hay Hollows map where the board changes as you settle.
>
> FEATURES
> - 2 to 4 players, with a move timer so games keep moving
> - Heist card: steal an opponent's settlement
> - Map editor: design your own island
> - Sound effects and music, a leaderboard and dice statistics at the end of every game
> - Report and mute other players in public games
>
> Hexlands is an independent game and is not affiliated with any other board game or publisher.

**Suggested Data safety answers** (verify before submitting)
- Data collected and sent off the device:
  - **Name**: the display name the player types.
  - **Messages: other in-app messages**: chat, visible to the other players in the room.
  - **User IDs** (or "Device or other IDs", whichever Google's definition fits better): a random session code that lets you rejoin a game, and a **random player ID** made once on the device and used to add up wins for the leaderboard.
  - **App activity: other actions** (or the nearest category): the result of each finished game (points, win or loss, room code, map and time), stored with the player ID. This is what the leaderboard is built from.
- Purpose: App functionality (the game, rejoining, and the leaderboard) and Fraud prevention, security and compliance (for reports and limits). Not used for advertising, analytics or personalization. **Not sold, not shared with third parties.** Other players in the same room see the name and messages, and anyone can see the leaderboard (display names with wins, games played and win rate); the player ID itself is never shown. That is how the game works, but check Google's definition of "sharing" and answer as it asks.
- Collection is required for the game to work; players choose their own display name. Leaderboard results are collected whenever a game is played; there is no setting to turn them off.
- Data is encrypted in transit (HTTPS). Games in progress and chat live in server memory and, while the game is going on, in a saved copy in the database so it survives a restart; that copy is deleted when the game ends or the room closes. **Finished game results are kept in a database until deletion is requested** (the database is on the Render disk, `DB_PATH`). Reports are kept up to 90 days. Users can ask for deletion by email (the contact in the Privacy Policy), quoting the player ID; there are no accounts. If the form asks whether you provide a way to request deletion, say yes and describe it this way.
- The answers must match the Privacy Policy at `/privacy` (`legal.js`). If you change what is stored, change both, and bump the version in `legal.js` and `app.js` so players are asked to agree again.
- IP addresses are used in memory for rate limits (up to an hour) and are in the hosting provider's logs. If Google's form treats that as collected data, declare it too rather than leave it out.

**Updates:** the app loads your live site, so a normal `git push` updates the game for everyone. Upload a new `.aab` only when you change the package itself (icon, name, colors, target level). If the Console says the target API level is too old, build a fresh package in PWABuilder, keep the same signing key, and upload it as a new version.

## Accessibility

What is in place (checked by `ui.test.js`, which runs the axe rules for WCAG 2.2 AA on the home screen, the Leaderboard window, the game, the trade window and the info window, and fails on any finding):

- **Zoom:** the page can be pinch-zoomed (the old `maximum-scale=1` was removed). Inputs are at least 16px on phones, so the browser does not zoom by itself when one is focused.
- **Keyboard:** Tab reaches every button. On the map, every glowing spot is a button (Tab to it, Enter or Space to choose; focus then moves to the green tick, and Enter builds). The robber's targets work the same way. A yellow outline shows where the focus is.
- **Windows:** each has a name (its title), Escape closes it (except the ones that must be answered), Tab stays inside, the page behind is made inert, and focus goes back to the button that opened it.
- **Screen readers:** the status line under the top bar and the turn pill are announced when they change; the dice result has a text label; icons and buttons have names that start with the text shown on them (for example "Fit: reset zoom"); the page has one main area and a level 1 heading on every screen.
- **Contrast:** text meets 4.5:1. The "your turn" pill darkens the player's colour until white text reads well.
- **Touch targets:** the main controls on phones are about 42 to 44px; nothing is below 30px.
- **Motion:** with "reduce motion" switched on in the device, animations are cut to almost nothing.

Not covered: the map is read as a picture, so a screen-reader user hears what can be chosen but not the layout of the board; the animated tutorial and the map editor have not been checked; and this has been tested with automatic rules and a keyboard, not yet with a real screen reader (VoiceOver or TalkBack). A pass with one of those is the next step.

## Project layout

```
server.js         HTTP server, rooms, live updates (SSE), matchmaking, limits, filters, bot and move-clock timing
game.js           Rules engine; the server is the only authority on game state
bots.js           Bot decisions for easy, medium and hard
maps.js           Country maps, board generation, custom map validation
index.html        Page shell              } sent to browsers
app.js            Screens, board, input, map editor, lobby options, leaderboard
art.js            Vector artwork
sound.js          Synthesized effects and beat themes
style.css         Styles
engine.test.js    Core rules and full simulated games
rules.test.js     Setup order, host options, discard limit, friendly robber, balanced dice, timer, road rule
bots.test.js      Bot games at every level and strength checks
server.test.js    HTTP, live updates, options and timer over the wire, a full human-vs-bots game
matchmaking.test.js  Public rooms, Quick play, ready countdown, bots standing in, host hand-over, limits, filters
sw.js             Service worker (offline shell; never touches game traffic)
manifest.webmanifest  App name, colors, icons, screenshots and shortcuts
icon*.png, icon.svg, apple-touch-icon.png, screenshot-*.png  App icons and store images
assetlinks.json   Android app verification (replace with PWABuilder's file)
db.js             SQLite leaderboard storage (node:sqlite)
capacitor.config.json  Capacitor settings for the native Android app
android/          Capacitor Android Studio project
www/              Offline page for the Capacitor app
render.yaml       Render blueprint
package.json
```

### Adding a country map

Add an entry to `PRESETS` in `maps.js`. The `mask` is rows of `X` (land) and `.` (sea); odd rows sit half a hex to the right. `weights` sets the terrain mix and `deserts` the desert count. Run `npm test` to check every map still generates a playable board.

## Credits

Original code and artwork. Game rules follow the standard hex-tile trading board game rules plus common online options; no trademarked names or artwork are used.
