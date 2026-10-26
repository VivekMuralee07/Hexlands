# Hexlands

A multiplayer island-settling game for 2–4 players in the browser. Gather lumber, brick, wool, grain and ore, trade, build, and race to the points target.

- Join with a 5-character room code or an invite link (`/room/ABCDE`)
- Bots fill empty seats (up to 4 players total), each set to Easy, Medium or Hard
- Beat themes when a game starts and finishes, plus sound for every click, resource card, dice roll and build
- Leaderboard at the end: ranking, points breakdown, game stats and a dice chart
- 8 maps: Classic Island, India, United States, United Kingdom, Australia, Japan, Italy, Brazil
- Map editor: paint terrain, place numbers, save your design, play it
- Full rules: snake-order setup, robber and discards on 7, development cards, Longest Road, Largest Army, harbors, bank and player trades
- Works on phones (pinch and drag to zoom) and desktops
- No dependencies: plain Node.js, no database

## Run locally

Requires Node.js 18 or newer.

```bash
npm start            # http://localhost:3000
npm test             # 32 tests, including full bot-vs-bot games and a live server game
```

Open two browser windows (or a phone on the same network at `http://<your-ip>:3000`) to play against yourself.

## Put it on GitHub

This version is **flat**: all 16 files sit side by side at the top level of `main`, with no folders. Upload them all at once.

1. On github.com, create a new empty repository.
2. Click **uploading an existing file**.
3. Unzip the download, select every file inside, and drag them onto the upload area.
4. Keep **Commit directly to the main branch** selected and click **Commit changes**.

The repo front page should list: `app.js`, `art.js`, `bots.js`, `bots.test.js`, `engine.test.js`, `game.js`, `index.html`, `maps.js`, `package.json`, `README.md`, `render.yaml`, `server.js`, `server.test.js`, `sound.js`, `style.css` (and `.gitignore` if your file browser shows hidden files; it is optional).

Only `index.html`, `app.js`, `art.js`, `sound.js` and `style.css` are sent to browsers. The server code, tests and config are never served.

## Deploy on Render

**Option A: Blueprint (uses `render.yaml`)**
1. Render dashboard → **New** → **Blueprint**
2. Connect your GitHub account and pick the `hexlands` repo
3. Click **Apply**. Render builds and gives you a URL like `https://hexlands.onrender.com`

**Option B: Web Service by hand**
1. Render dashboard → **New** → **Web Service** → pick the repo
2. Runtime: **Node**, Build command: `npm install`, Start command: `npm start`
3. Health check path: `/healthz`
4. Create the service

Every push to `main` redeploys automatically.

### Things to know about hosting

- Games live in server memory. A redeploy or restart ends running games; players see a message and return to the home screen.
- Render's free plan sleeps after about 15 minutes with no traffic. The first visit after that takes 30–60 seconds to wake up, and any idle rooms are gone. A paid instance stays awake.
- Idle rooms are cleaned up automatically (30 minutes with nobody connected, or 6 hours total).
- Live updates use Server-Sent Events over normal HTTPS, which Render supports with no extra setup.

## How to play

1. One player creates a room, picks a map and a points target, and shares the code.
2. Others enter their name and the code, then the host starts. Turn order is random.
3. **Setup:** each player places a settlement and a road, then again in reverse order. The second settlement collects one of each neighboring resource.
4. **Your turn:** roll the dice. Every tile with that number pays its resource to adjacent settlements (1) and cities (2). Then build, trade, play a development card, and end your turn.
5. **Rolling a 7:** anyone holding more than 7 cards discards half; the roller moves the robber (which blocks that tile) and steals a card from a neighbor.

| Build | Cost | Notes |
|---|---|---|
| Road | lumber, brick | Connects to your roads or towns |
| Settlement | lumber, brick, wool, grain | 1 point, needs a road, two edges from any town |
| City | 2 grain, 3 ore | 2 points, replaces a settlement, doubles its harvest |
| Development card | wool, grain, ore | Knight, Road Building, Year of Plenty, Monopoly, or a hidden point |

Longest Road (5+) and Largest Army (3+ knights) are worth 2 points each. Harbors let you trade 3:1 (any) or 2:1 (one resource) with the bank instead of 4:1. You win when you reach the target on your own turn.

If a player drops out, the host sees **Skip offline player** on their card and can keep the game moving; the player can rejoin from the same browser and pick up where they left off.

## Bots

In the waiting room, the host picks a difficulty and presses **Add bot**. Bots take open seats, so a table can be any mix of people and bots up to 4. The host can change a bot's difficulty or remove it until the game starts.

| Level | How it plays |
|---|---|
| Easy | Places settlements loosely, builds in random order, rarely trades. Good for learning. |
| Medium | Picks strong spots, builds cities and settlements first, trades with the bank toward its next build. |
| Hard | Weighs scarce resources and harbors, chases Largest Army and Longest Road, aims the robber at the leader, and refuses trades that would help a player close to winning. |

In testing, medium beat easy in 99% of games, and hard beat medium in about 60% (200 games each).

Bots only use information a human could see: public points, card counts and the bank. They respond to your trade offers, discard on 7s and move the robber on their own. Each bot move has a short pause so you can follow along, and bots pause while no human is connected.

## Sound

All sound is generated in the browser, so there are no audio files.

- A beat theme plays when a game starts and a victory theme when it finishes.
- Buttons click; tapping a resource card plays its own note; dice rattle; builds, steals, the robber, new cards and your turn each have a sound.
- Use the speaker and music-note buttons in the waiting room or the top bar to switch sound effects and music on or off. The choice is remembered.

Browsers only allow sound after your first tap, so sound starts once you've clicked anything on the page.

## Leaderboard

When someone wins, the leaderboard shows every player ranked, with:
- a points breakdown (settlements, cities, Longest Road, Largest Army, hidden point cards)
- stats: resources harvested, cards stolen, trades, knights, development cards bought
- a chart of how often each dice number came up versus fair odds
- your win record on this device

Press **Results** to reopen it after closing.

## Map editor

From **Create a room**, choose **Your own map** (or **Copy into editor** on any preset).

- Pick a terrain and tap or drag across the grid. **Sea** removes tiles.
- Pick a number and tap tiles to place it, or press **Auto numbers** (keeps 6s and 8s apart).
- Tiles without a number get one when the game starts. Harbors are placed automatically.
- 7 to 60 tiles; separate islands are allowed. Your map is saved in your browser.

## Project layout

```
server.js         HTTP server, rooms, live updates (SSE), bot timing
game.js           Rules engine; the server is the only authority on game state
bots.js           Bot decisions for easy, medium and hard
maps.js           Country maps, board generation, custom map validation
index.html        Page shell              } sent to browsers
app.js            Screens, board, input, map editor, leaderboard
art.js            Vector artwork
sound.js          Synthesized effects and beat themes
style.css         Styles
engine.test.js    Rules tests and full simulated games
bots.test.js      Bot games at every level and strength checks
server.test.js    HTTP, live updates and a full human-vs-bots game
render.yaml       Render blueprint
package.json
```

### Adding a country map

Add an entry to `PRESETS` in `maps.js`. The `mask` is rows of `X` (land) and `.` (sea); odd rows sit half a hex to the right. `weights` sets the terrain mix and `deserts` the desert count. Run `npm test` to check every map still generates a playable board.

## Credits

Original code and artwork. Game rules are inspired by classic hex-tile trading board games; no trademarked names or artwork are used.
