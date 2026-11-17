# Keystomp

A multiplayer keyboard clicker for the browser, built with **Three.js** and **Colyseus** for Bloxity (listed as **⚡ Keystomp!**, slug
`keystomp`). You're tiny on a giant wooden desk in a giant sunny bedroom. **Run and jump across giant keyboards: every key you land on is
a click.** Clicks fill the bar at the top of the screen, and a full bar gets you a **NEW KEYBOARD**: a fancier one further down the desk,
with its own switch sound, where every press is worth more. Type the word on the monitor by stomping its letters in order, grab the
Golden Key, jump on the giant mouse's buttons for a **MEGA CLICK**, race the **Click Speed Test**, hatch **Desk Buddies** out of Buddy
Boxes, and **Reboot** for a multiplier that stays.

The genre, the core loop and the feel (walk and jump on giant keys for clicks, a top bar that fills to "get a new keyboard", fancier
keyboards with bigger multipliers, a click speed test, titles over your head) follow the Roblox game *Your Actual Keyboard*, studied from
its page and screenshots. Everything players see and hear is our own: the name, the desk and the bedroom, the nine keyboards and their
switches, the monitor's Word Hunt, the Golden Keys, the giant mice, the Desk Buddies and their boxes, Reboot, the HUD and its art, the
text, the sounds and the music.

**There are no in-app purchases.** Everything costs Clicks (from stomping) or Gems (from quests, daily tasks, gifts, the wheel, every
fifth word, Reboots, the daily reward and codes). No Bux are spent anywhere.

It shares its engine with the other Legion games (the server, Bloxity login and avatars, the top games' character animation, the camera
and lighting rig, the quality system, profiles, saves, play stats, test scripts and the deploy workflow). It was forked from Clicky Keys
(the same genre: walking on keys) with the newest engine and Bloxity integration from Rocket Ravine dropped in.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client. **`main.js`**: boot and warm-up, you on the shared physics, pressing and stomping keys with prediction, the combo, the word, Golden Keys, Mega Clicks, the Speed Test, the guide arrows, the camera, keyboard / mouse / touch / controller, everyone else smoothed on the server's clock, networking. **`world.js`**: the bedroom, the desk, nine computer setups (keyboard, live monitor, giant mouse, Buddy Box), the plaza, the props. **`keys.js`**: every keycap (legends, press and pop-in in the vertex shader; round typewriter keys). **`buddies.js`**: the 36 Desk Buddies (built from recipes, instanced per kind) and their menu portraits. **`asmr.js`**: every switch sound synthesised at load. **`ui.js`** + `index.html`: HUD and panels. **`bloxity.js`**: the whole Boxity SDK integration. **`avatar.js`**: Bloxity avatars (slot list, character kit, custom characters). The rest (engine, fx, audio, animator, chars, signs) is the Legion engine. |
| `server/` | Colyseus 0.18 server. **`DeskRoom.js`** (the `desk` room): every press (a key you've got, near you, a token bucket of 16 a second), the combo (never more than the server saw), words, Golden Keys, Mega Clicks, the Speed Test (at most 20 clicks a second), keyboards, upgrades, Buddy Boxes, Reboot, rewards, codes, bots, the move guard. **`bloxity.js`**: identity, rewarded-ad tokens, leaderboards, profile stats. **`legion-room-reporter.js`**: Boxity's cross-pod room directory. `profiles.js` / `saves.js` / `stats.js`: saves (MongoDB on Legion, a JSON file locally), play stats. |
| `shared/` | **`config.js`**: keyboards, the press formula, combo, upgrades, Reboot, Desk Buddies and boxes, words, titles, the wheel, tasks, quests, rewards, codes, the boards. **`world.js`**: where everything stands on the desk, the 60% key layout, key lookup, the mice, the solids. `physics.js`: walking and jumping. |
| `tests/` | The test scripts (see Testing), the setup-page and cover generators |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game by `node tests/covers.mjs` (git-ignored) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:3149
```

For development, run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5691. The dev server tells the page it
runs against a local Boxity (`window.BLOXITY_ENV`, injected only by the Vite dev server).

- Dev builds, or a build with `VITE_QA=1`, expose `window.__qa`: the autopilot, perf readings, teleports.
- For testing only, `QA=1` on the server lets the client give itself Clicks, Gems, keyboards, buddies, Golden Keys (`__qa.give`). It is
  refused on Legion.

## Gameplay

- **The press.** Walk onto a key and it goes down with its keyboard's own switch sound: a click. Click anywhere (or tap CLICK, or
  ENTER) to press the key under you again. **A jump stomps**: landing presses the key under you and the nearest few round it. Each
  press is worth the keyboard's multiplier x Click Power x Reboot x Desk Buddies (x2 with a boost).
- **The combo.** Presses less than a second apart build a combo: every 10 in a row is +0.1, up to x2 (Combo Keeper: up to x3.5 and
  slower to fade). Past 40 a trail in your keyboard's colour follows you, past 120 an aura; the music changes to the faster song.
  **Combo milestones** pay a lump once a combo: 50 (25 presses' worth), 100 (60), 200 (150), 300 (250), 500 (500).
- **Every key you touch lights up** in your keyboard's colour and fades (other players' too, under their feet); a stomp sends a ring
  across the keys and jolts the camera.
- **Nine keyboards** down the desk: **Office Classic** x1, **Bubblegum** x3 (2,500 clicks), **Midnight Mech** x8 (25K), **Retro
  Typewriter** x20 (200K, round keys), **RGB Gamer** x50 (1.5M, rainbow legends), **Frostbyte** x125 (12M), **Lava Forge** x300
  (150M), **Royal Gold** x800 (2.5B), **Galaxy** x2,000 (40B). The bar at the top counts clicks this boot; a full bar unlocks the next
  keyboard (its glass comes off and its keys pop up in a wave). Locked keyboards sit under glass.
- **The monitor's Word Hunt.** Each keyboard's monitor shows a word ("CAT", "STOMP", "KEYBOARD"...) and what you've typed. Stomp its
  letters in order (the next letter's key has a green column of light over it): 20 presses' worth per letter, and Gems every fifth word.
  Words get longer on the later keyboards.
- **Golden Keys.** Every 12-22 seconds a key turns gold on any keyboard someone's on, for 12 seconds: whoever stomps it first gets 25
  presses' worth (x the combo).
- **KEY FRENZY.** Every 2½-4 minutes (the first one 1-2 minutes in) the whole desk's keys flash through the rainbow for 20 seconds and
  every press, Golden Key and Mega Click pays x3; the top bar counts it down and the music speeds up. The server starts and ends it.
- **The giant mice.** Each keyboard has a giant mouse beside it: jump onto its buttons for a **MEGA CLICK** (20 presses' worth, x the
  combo, every 1.4 s).
- **The Click Speed Test.** Stand on the yellow pad in the plaza: 3, 2, 1, then ten seconds of clicking (mouse, tap, SPACE or ENTER) as
  fast as you can. Each click is worth 3 presses at your best keyboard; a new best pays Gems and goes on the leaderboard.
- **The Tech Shop** (for Clicks): Click Power, Turbo Sneakers, Auto Typer (presses for you on a keyboard, and keeps typing while you're
  away), Lucky Keys (a press may CRIT x10), Combo Keeper, Spring Shoes (bigger stomps), Buddy Slots.
- **Desk Buddies.** Nine Buddy Boxes, one in front of each keyboard, each with four buddies (Common to Legendary): an eraser, a sticky
  note, a floppy disk, a cookie, a milk carton, a computer mouse, a cassette, a puzzle cube, a pixel ghost, a snowball, a fire sprite, a
  crown, a planet, a UFO and more (36). Three on your team at first, up to six; they hop after you and multiply every press. Finding a
  box's four pays Gems.
- **Reboot.** Once the RGB Gamer's bar is full (then each next keyboard, then the Galaxy's bar five times over): back to the Office
  keyboard with no Clicks or upgrades (Buddy Slots and your Desk Buddies stay), x1 more on every press for good, and Gems.
- **The guide.** Someone new gets seven steps, one at a time, in the quest's place (STEP n/7), with the floor arrows pointing at each:
  walk onto the keyboard, 20 presses, a stomp, a word typed, a new keyboard, a Buddy Box, an upgrade. The part of the HUD a step is
  about is outlined; the word chip waits until the step that needs it. Saved on the server (`tut`), skipped for anyone with 400+
  presses. A Golden Key near you gets an arrow at the screen's edge (a marker over it once it's on screen).
- **And:** a chain of 30 quests at the top of the screen, three daily tasks a day, a 7-day daily reward, seven free playtime gifts, the
  Prize Wheel (a free spin every 7 minutes, up to 3 saved), x2 Clicks for Gems or FREE for a rewarded ad, codes (`KEYSTOMP`, `CLACK`,
  `QWERTY`, `BLOXITY`, `LEGION`, `TYPEFAST`), titles over your head by lifetime clicks, the two boards behind the spawn.
- **Pacing** (`node tests/economy.mjs`, a simulated efficient player at 8 presses a second; real players are slower): Bubblegum at
  about 1 minute, Midnight Mech at 3, Retro Typewriter at 6, RGB Gamer and the first Reboot at 11, Frostbyte at 22, Lava Forge at 34,
  Royal Gold at 47, Galaxy at 77 minutes. At 5 presses a second: 2, 4, 8, 15, 31, 47, 65 and 111 minutes.
- **Multiplayer.** Up to 16 players share a desk and its keyboards; everyone sees each other's keys go down, their combo trails, their
  Desk Buddies and Mega Clicks, and races them to the Golden Keys. When it's quiet a few bots stomp the first keyboards; each real
  player sends one home.
- **The server decides** every press (a key you've got, near where you stand, a token bucket of 16 a second; the Auto Typer has its
  own, its level's rate; the client keeps a slightly stricter bucket of its own, so it never shows a press the server would turn away), the combo (it never
  believes more than it counted), every word, Golden Key, Mega Click (you have to be on the button), Speed Test click (20 a second at
  most), purchase and move (a speed budget, a height limit). Your own movement and your counter run on your device: each answer takes
  off the presses it covers, so nothing jumps back over a long round trip. Others are drawn a little in the past on the server's clock,
  between snapshots stamped with server time, the delay following how late their snapshots really arrive.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | The stick |
| Press the key under you | Click anywhere, Enter (walking onto one presses it too) | X | CLICK (hold: keep clicking), or tap the world |
| Jump (stomps keys) | Space | A | JUMP |
| Use (Tech Shop, Speed Test, Reboot, a Buddy Box) | E | X | Tap the bubble |
| Camera | Drag, wheel | Right stick | Drag, pinch |
| To your best keyboard | R | | TO KEYS |
| Buddies / Upgrades / Keyboards / Wheel / Quests / Shop | B / U / K / F / Q / G | RB / LB / Y | The buttons |

P is never bound (on CrazyGames it opens Boxity's pause menu), and there is no fullscreen button of the game's own.

## Boxity integration

Everything Boxity is in `client/src/bloxity.js` (client) and `server/src/bloxity.js` (server); the developer's answers are in
`BLOXITY_CODE_METADATA.md`.

- **Environment.** Every Boxity URL comes from `env()` (`Legion.SDK.environment()`, else `window.BLOXITY_ENV`, else prod) on the client
  and the `BLOXITY_*` variables on the server. Nothing reads its own hostname. The SDK loads from
  `https://sdk.bloxity.io/v1/legion-sdk.min.js` before the game's code; `init({ gameSlug: 'keystomp' })` runs once.
- **Matchmaking.** Each connect resolves a pod with `Legion.SDK.net.resolveEndpoint('keystomp')` (a new Client each time, retried with a
  backoff for up to a minute while a server wakes) and joins `desk` there; an unexpected close resolves again and rejoins. Nothing opens
  a socket to `keystomp.host.bloxity.io`. `?roomId=` joins that room through its pod's relay first (Open Rooms, invites), else
  matchmaking. The room's `maxClients` is 16, so party play and CrazyGames' play-with-friends work through the matchmaker.
- **Open Rooms.** `server/src/legion-room-reporter.js` (`installRoomReporter()` after `listen`) pushes this pod's rooms to Boxity's
  directory every 2 s (a no-op locally).
- **Identity.** One `onUserChanged` subscription. The server verifies the game token (`POST /v1/auth/game-token/verify` with the game
  slug) and only ever uses the returned user id; guests are ids the server keys from the browser's own id, never an account. A sign-in
  mid-game is verified on the same connection (nobody leaves their room). A guest's progress moves into an account that has none yet
  (the browser's own guest save, or the first `carriedFrom` guest), once only.
- **Avatars.** The whole look: skin with face, shirt and pants (`getSkinTextureUrlFor`), the six body parts, proportions, hat, back, and
  every slot from `avatar.getAccessorySlots()` (so slots Boxity adds later just work), hands and shoes following their bones with the
  shoulder / leg spread. When `character.canDress(key)` is true the platform character kit dresses the rig instead (proportions stay the
  game's). A player wearing their own uploaded character (`characterId`) gets its GLB, its accessories fitted with
  `characterAccessoryMatrix`. Only ids are replicated, `characterId` included.
- **Emotes** (registered on boot, played and replicated), **chat bubbles** (`Legion.SDK.chat.onMessage`, over the sender's head),
  **settings** (volume, music, quality, camera sensitivity, FPS; the game's own Settings panel saves back with `settings.set`),
  **lifecycle** (`loadingStep` / `loadingEnd` as soon as it has joined, `gameplayStart` / `gameplayEnd` round the panels, `updateRoom`,
  `playerJoined` / `playerInRoom`).
- **Ads.** Ad breaks pause and mute everything. Screens declared: `panel`, `results` (the Speed Test's card), `gameplay` (no gameplay
  banners); each is reported as it opens. Rewarded ad `double-clicks` (FREE 2X CLICKS), granted by the server only after
  `POST /v1/ads/reward/verify`. No death screen: nothing can kill you.
- **Leaderboards.** `clicks`, `speed`, `playtime`, `keyboards`, declared on the client, reported by the server in batches from
  server-owned state (`POST /v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report`).

## Graphics and performance

Matte Lambert (and unlit) materials only: no reflections, environment maps, bloom or post-processing. The top games' light rig
(hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping), a warm indoor mood: the sky shows through the bedroom's windows,
the room's air hazes the far walls.

- **The keys** are sculpted keycaps: rounded corners, a skirt tapering up, a rounded top edge, a spherical dish, the rows sculpted like a
  real board's (the number row tallest and leaning back, the bottom rows leaning forward). A wide key keeps a 1u key's corners and dish
  rim (the shader stretches only its middle) and its legend is never stretched. They stand in a dark plate (it shows between them; the
  skirts darken down into it) inside a bezel they stand proud of; pressed, a key comes down to just under your feet. The RGB Gamer's
  plate glows through the rainbow between its black keys, the other lit boards' softly in their colour. The Retro Typewriter's keys are
  round caps with a nickel ring on a stem, its rows stepping up toward the back. The detailed cap (132 triangles) is drawn within
  about 170 studs of the camera, a simple one (40) beyond and on Low.
- **The desk** is long oak boards painted pixel by pixel while loading: flat-sawn grain (stripes drifting into stretched arches), fine
  pores, each board its own shade, rounded dark seams and staggered end joints, a gentle large-scale shade over the whole top, a
  normal map on High. The bedroom floor is the same boards, darker. The spawn mousepad has a stitched edge.
- Each setup sits on its own desk mat with a glowing edge, a raised rim and an underglow in its keyboard's colour; the monitors have
  an oval foot, an arm, a chin with a logo, a lit back. Soft contact shadows (one instanced draw) sit under the setups and props.
- The desk's static things are merged per area (the plaza, each setup, the props) and batched, so a setup off screen isn't drawn; the
  room is one batch that throws and takes no shadows. A bevelled block's bevel is capped at a few times its thinnest side, so long flat
  things (desk mats, the mousepad, a keyboard's bezel, the desk's lip) get small rounded edges, not corners cut a quarter of their length. The desk top is one textured plane (the slab under it sits a hair lower, so
  the two never fight over the same pixels).
- Each keyboard's keys are one instanced draw; a press, a stomp, a keyboard's pop-in, a key lighting up and the Frenzy's rainbow all
  happen in the shader (a key lighting up writes two floats; the lit keys go up once a frame).
  Keyboards far from the camera aren't drawn (360 studs; 320 on Low).
- The Desk Buddies are one instanced mesh per kind on screen; the mouse buttons one instanced mesh for all nine mice; every floating sign
  one draw.
- The live monitor is one canvas redrawn only when what it shows changes (a few times a second at most, fewer on Low); name tags redraw
  only when their number changes.
- Every shader (keys, buddies, avatar, effects) and every HUD panel is warmed up behind the loading screen; every switch sound and both
  songs are synthesised while loading (the songs into loops).
- The frame-rate watch lowers the resolution first, then the quality; phones and weak PCs start on Low.
- The HUD has no endless animations with blurred shadows (they repainted the page every frame and cost a desktop 40 long frames in
  8 s of stomping); messages queue (the big words wait for each other and for panels; toasts merge repeats, three at most).

Measured with `node tests/perf.mjs` on this PC (headless Chrome, 2026-11-16), at the spawn and stomping a keyboard on the autopilot with
the bots about:

| Profile | Spawn | Stomping |
|---|---|---|
| Desktop, Medium, 1600x900 | 143 fps | 129 fps, no frame over 50 ms |
| Weak laptop, Low, 1366x768, CPU throttled 4x | 126 fps | 79 fps, no frame over 50 ms |
| Phone portrait, Low, 390x844 @2x | 72 fps (every other refresh) | 72 fps |

Loading takes about 5 s on a desktop and about 10 s on the weak-laptop profile.

The sculpted keys and the wooden desk (2026-11-17), measured back to back against the code before them under the same conditions
(another browser was rendering the game on this PC at the time, so the absolute numbers ran lower than the table): spawn on a desktop
124 / 118 fps before, 121 / 118 after; stomping 104 before, 105 after; the weak laptop 56 / 35 before, 62 / 42 after. The GPU's own
time for a spawn frame went from 3.77 to 3.94 ms.

## Testing

Run one browser suite at a time (they share the test ports 3163 and 5691).

- `node tests/server.test.mjs 3163` (with a server started `QA=1 PORT=3163`): 45 checks of the loop and its guards (no press from across
  the desk, a burst of 100 presses held to the bucket, a claimed 9,999 combo paid as counted, nothing on a locked keyboard, a word typed,
  a Golden Key, a Mega Click only on the button, a 200-stud move snapped back, a Speed Test held to 20 clicks a second, a new keyboard,
  upgrades, Buddy Boxes only at their machine, Reboot, codes, quests, the daily reward, a combo milestone (paying again when the
  combo really starts again, never for a faked restart), a Key Frenzy paying x3, warps to a keyboard you've got (and not to a locked
  one), only real marks saved, two players on the desk).
- `node tests/smoke.mjs [portrait]`: the spawn, the autopilot stomping and typing, a new keyboard, a Golden Key, a Mega Click, the Speed
  Test and its result, a Key Frenzy, every panel, a Buddy Box opening, with screenshots and console errors (none).
- `node tests/screens.mjs [size]`: every screen at 390x844, 360x800, 375x667, 844x390 and 1280x720, checked for overlaps, things cut
  off and the Bloxity corner (all clean).
- `node tests/prod.mjs` (after `npm run build`): the production build with real input only: walking onto the keyboard and across it
  (the Clicks counter climbs), clicking, a stomp, a panel opened with U and closed with Esc, no console errors.
- `node tests/perf.mjs`, `node tests/cpuprof.mjs`, `node tests/programs.mjs`: the frame rates above, a CPU profile of the weak-laptop
  stomp, the shader programs. `node tests/gpucost.mjs` and `node tests/stompcost.mjs`: the frame rate with each part of the scene (or
  the HUD, the key lighting, the floating numbers) switched off in turn, to find what a slow frame is spent on. `ONLY=desktop,laptop`
  picks perf.mjs's profiles.
- `node tests/layout.mjs` (no browser): the layout checked: five rows of 15 units in the 60% ANSI order, every key's middle and edges
  mapping back to it on all nine boards, no overlaps, nothing in the bezel, every letter and digit typeable, 3,600 words typeable.
- `node tests/boards.mjs [low|medium|high]`: every keyboard from above, and the desk from the spawn, for checking the layout by eye.
- `node tests/looks.mjs [tag] [low|medium|high]`: close-ups for judging the look (the keys from a player's height and from above, the
  RGB Gamer, the Typewriter, the Midnight Mech, the desk round a setup, the spawn, the floor past the desk's edge).
- `node tests/economy.mjs [minutes] [presses a second]`: the pacing above.
- `node tests/covers.mjs`, `node tests/setup-page.mjs`: the store covers and `bloxity-setup.html`.
- `node tests/live-smoke.mjs [url] [portrait]`: opens the hosted game (prod by default), waits for it to join, fails on any console
  error or failed request, and saves a screenshot.

## Deploying

`.github/workflows/deploy.yml`: every push to `main` deploys the prod channel (`dev`: the playtest channel) to Bloxity prod, and to
Bloxity stage as well once the repo has `LEGION_DEPLOY_TOKEN_STAGE`. A manual run deploys any branch to the platform you pick (staging
or prod). The platforms are separate jobs of one matrix (`fail-fast: false`); a staging job only ever reads the stage token. The room
size (16) goes to the deploy as `roomSize`. Secrets: `LEGION_DEPLOY_TOKEN` (hosting.bloxity.io) and, for stage,
`LEGION_DEPLOY_TOKEN_STAGE` (hosting.stage.bloxity.io; see docs.bloxity.io > Environments > Getting your game onto stage). After the
first run, make the GHCR package `keystomp-server` public (from a public repo it already is). `bloxity-setup.html` has every field of
the Create New Game form and the hosting steps.

## Hosting

Live at **https://keystomp.play.bloxity.io** (first deployed on 17 November 2026). The repository is `asivixlp44-cmyk/keystomp`; every
push to `main` runs `.github/workflows/deploy.yml`, which builds the server image, rolls it out on Legion and uploads the client (it
needs the `LEGION_DEPLOY_TOKEN` secret). It was pushed to `LEGiON-Platforms/keystomp` first, but that organisation has not run GitHub
Actions since 30 October 2026, so it never deployed from there. After the first deploy, `node tests/live-smoke.mjs` (and
`node tests/live-smoke.mjs https://keystomp.play.bloxity.io/ portrait`) joined the live game on a desktop and a portrait phone with no
errors, and the server's `/health` reported its database connected.
