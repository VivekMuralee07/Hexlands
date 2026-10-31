# Hexlands

A multiplayer island-settling game for 2–4 players in the browser. Gather wood, brick, sheep, hay and ore, trade, build, and race to the points target.

- Join with a 5-character room code or an invite link (`/room/ABCDE`)
- 18 maps in two categories. Countries (15): India, United States, United Kingdom, Australia, Japan, Italy, Brazil, France, Spain, Germany, China, Canada, Mexico, Argentina and New Zealand. Misc maps (3): Classic Island, Blue Flame Cup and Hidden Vault. There is also a map editor. The host picks the category and map on the create screen, and can change or shuffle the map in the waiting room until the game starts.
- Hidden Vault: the same size as Blue Flame Cup, but all land with no lake or outer fog. A diamond hex with an 8 sits in the middle, buried under two full rings of fog (18 tiles). Fog works as on Blue Flame Cup: a road tip or settlement touching a fog tile uncovers it, and an ordinary tile pays the player one card. When the game starts, Blue Flame Cups are hidden at random in that fog, two more than there are players (4 cups for 2 players, 5 for 3, 6 for 4). A cup works exactly as on Blue Flame Cup: whoever unlocks one loses all their wood, sheep and hay, and blue fire sweeps the screen. The first two settlements cannot touch the fog, so nobody starts on the diamond: you have to build roads through the fog to reach it. The diamond never pays a fixed resource: when an 8 is rolled, every settlement on it lets its owner choose any 2 cards from the bank and every city 3, in a floating window (the robber blocks it like any tile; the move timer, offline players and bots choose automatically). A burst of light and gems plays over the diamond. Everything else gets random terrain and numbers as on other maps.
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
- Tap to build: once you have rolled and can afford a road, settlement or city, every legal spot glows on the map. Tap a spot and the piece appears there in your color; tap the piece to build it, tap another spot to move it, or tap the sea to cancel. There are no Road, Settle, City or Trade buttons; the bottom bar only has Roll dice, Dev card and End turn.
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
npm test             # 88 tests, including full simulated games
```

Open two browser windows (or a phone on the same network at `http://<your-ip>:3000`) to play against yourself.

## Put it on GitHub

All 29 files sit side by side at the top level of `main`, with no folders. Upload them all at once.

1. On github.com, create a new empty repository.
2. Click **uploading an existing file**.
3. Unzip the download, select every file inside, and drag them onto the upload area.
4. Keep **Commit directly to the main branch** selected and click **Commit changes**.

To update an existing repo, do the same: files with the same name are replaced, and the new ones (`legal.js`) are added. Render redeploys automatically.

The repo front page should list the 29 files: `app.js`, `art.js`, `assetlinks.json`, `apple-touch-icon.png`, `bots.js`, `bots.test.js`, `engine.test.js`, `game.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon.svg`, `index.html`, `legal.js`, `manifest.webmanifest`, `maps.js`, `package.json`, `README.md`, `render.yaml`, `rules.test.js`, `screenshot-game-wide.png`, `screenshot-game.png`, `screenshot-home.png`, `server.js`, `server.test.js`, `sound.js`, `style.css`, `sw.js` (and `.gitignore` if your file browser shows hidden files; it is optional).

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
| Balanced dice | On / Off | Rolls come from a shuffled deck of all 36 combinations, reshuffled when 12 are left, with a 30% chance of skipping a card that repeats the previous total |

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

## Project layout

```
server.js         HTTP server, rooms, live updates (SSE), bot and move-clock timing
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
sw.js             Service worker (offline shell; never touches game traffic)
manifest.webmanifest  App name, colors, icons, screenshots and shortcuts
icon*.png, icon.svg, apple-touch-icon.png, screenshot-*.png  App icons and store images
assetlinks.json   Android app verification (replace with PWABuilder's file)
render.yaml       Render blueprint
package.json
```

### Adding a country map

Add an entry to `PRESETS` in `maps.js`. The `mask` is rows of `X` (land) and `.` (sea); odd rows sit half a hex to the right. `weights` sets the terrain mix and `deserts` the desert count. Run `npm test` to check every map still generates a playable board.

## Credits

Original code and artwork. Game rules follow the standard hex-tile trading board game rules plus common online options; no trademarked names or artwork are used.
