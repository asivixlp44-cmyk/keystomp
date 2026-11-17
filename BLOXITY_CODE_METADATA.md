---
game: Keystomp
slug: keystomp
canDie: false
hasScore: true
multiplayer: true
hostedOnBoxity: true
roomSize: 16
gameplayAds: false
inAppPurchases: false
---

# Keystomp: Boxity integration notes

Answers from the developer (2026-11-16):

- **canDie: false.** Nothing can kill the player: it's a clicker on a desk with no hazards. The desk's edge stops you (you can't walk
  off it), so there is no fall either. The game does not use `deathScreen`. Boxity's "Reset Character" (`respawn_request`) sends you
  back to the spawn at once.
- **hasScore: true.** Four boards, declared in `shared/config.js` (`LEADERBOARDS`) and submitted by the server from server-owned state
  (`server/src/bloxity.js`, `server/src/DeskRoom.js`):

  | id | label | order | mode | format | reset |
  |---|---|---|---|---|---|
  | `clicks` | Total clicks | desc | sum | compact | weekly |
  | `speed` | Click speed (clicks in 10 s) | desc | best | number | none |
  | `playtime` | Playtime (min) | desc | sum | number | none |
  | `keyboards` | Keyboards unlocked | desc | best | number | none |

  The developer asked for "Best clicks/sec". Boards hold whole numbers, so `speed` is the number of clicks in the 10-second Click Speed
  Test (clicks a second x 10), counted by the server (at most 20 a second).
- **Gameplay banners: off.** Screens declared: `panel` (Buddies, a Buddy Box, Tech Shop, Prize Wheel, Reboot, Keyboards, Shop, Quests,
  Daily, Gifts, Ranks, Settings), `results` (the Click Speed Test's result card), `gameplay` (no banners). There is no start menu and no
  lobby screen.
- **No in-app purchases.** Everything costs Clicks or Gems earned in the game, so there is no Gems purchase or webhook.
- **Rewarded ad:** `double-clicks` (the FREE 2X CLICKS button, shown only while `ads.isAvailable()`) gives x2 Clicks for 10 minutes. The
  server checks the token with `POST {BLOXITY_API_URL}/v1/ads/reward/verify` before granting.

Where things live:

- Client SDK wrapper: `client/src/bloxity.js` (the only `onUserChanged` subscription, the environment helper `env()`, avatar slots, the
  character kit, custom characters, chat, ads, leaderboards, settings).
- Avatars: `client/src/avatar.js` (every slot from `avatar.getAccessorySlots()`, the platform character kit when `character.canDress`,
  custom characters from `avatar.getCharacterFor`, skins from `avatar.getSkinTextureUrlFor`).
- Server: identity `POST /v1/auth/game-token/verify` (with `carriedFrom` guest progress), rewarded-ad verify, leaderboards report,
  profile stats: `server/src/bloxity.js`. Guest progress adoption: `server/src/profiles.js` (`adoptGuestProgress`). Open Rooms:
  `server/src/legion-room-reporter.js` (`installRoomReporter()` after `listen`).
- Matchmaking: `client/src/main.js` `serverEndpoint()` resolves a pod with `Legion.SDK.net.resolveEndpoint('keystomp')` on every
  connect (a new Client each time, retried for up to a minute). No socket ever opens to `keystomp.host.bloxity.io`. `?roomId=` joins that
  room through its pod's relay first (`{playUrl}/v1/dir/keystomp/list`), else normal matchmaking.
