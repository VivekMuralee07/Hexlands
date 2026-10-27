# Hexlands

A multiplayer island-settling game for 2–4 players in the browser. Gather wood, brick, sheep, hay and ore, trade, build, and race to the points target.

- Join with a 5-character room code or an invite link (`/room/ABCDE`)
- 16 maps: Classic Island, India, United States, United Kingdom, Australia, Japan, Italy, Brazil, France, Spain, Germany, China, Canada, Mexico, Argentina and New Zealand, plus a map editor
- Bots (Easy, Medium, Hard) can fill any empty seat, up to 4 players in total
- Host options before each game: points to win, discard limit and amount, move timer, friendly robber, balanced dice
- Flat, colorful board with a slim border and a map-name label: moving sea, windmills, chimney smoke, flying resource cards, confetti on a win
- Bank bar and player cards: points badge (crown for the leader), development cards, knights, cards in hand, longest road, and roads, settlements and cities left to build
- Robber: a ring appears around the number token of every hex where it can go
- Discarding on a 7: your cards are shown one by one; tap the ones to give back (a meter fills as you pick, Auto-pick helps), then they fly to the bank. Other players' discards fly to the bank too.
- Placement spots are glassy circles: big ones when you are placing one kind of piece (setup, or a single build), smaller ones with the piece drawn inside when roads, settlements and cities are all possible. A light-blue card above the map shows the piece you are placing.
- Harbors are little ships with a billowing sail showing the symbol and ratio (? for 3:1), tied to the coast by wooden jetties
- Tap to build: once you have rolled and can afford a road, settlement or city, every legal spot glows on the map. Tap a spot to build there, with no button first. The Road, Settle and City buttons still work as filters.
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
npm test             # 53 tests, including full simulated games
```

Open two browser windows (or a phone on the same network at `http://<your-ip>:3000`) to play against yourself.

## Put it on GitHub

All 28 files sit side by side at the top level of `main`, with no folders. Upload them all at once.

1. On github.com, create a new empty repository.
2. Click **uploading an existing file**.
3. Unzip the download, select every file inside, and drag them onto the upload area.
4. Keep **Commit directly to the main branch** selected and click **Commit changes**.

To update an existing repo, do the same: files with the same name are replaced, and the new ones (`rules.test.js`) are added. Render redeploys automatically.

The repo front page should list the 28 files: `app.js`, `art.js`, `assetlinks.json`, `apple-touch-icon.png`, `bots.js`, `bots.test.js`, `engine.test.js`, `game.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon.svg`, `index.html`, `manifest.webmanifest`, `maps.js`, `package.json`, `README.md`, `render.yaml`, `rules.test.js`, `screenshot-game-wide.png`, `screenshot-game.png`, `screenshot-home.png`, `server.js`, `server.test.js`, `sound.js`, `style.css`, `sw.js` (and `.gitignore` if your file browser shows hidden files; it is optional).

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
