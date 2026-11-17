import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the server's clock, everyone on the desk, and the Golden Keys lying about. Private progress (Clicks,
// Gems, quests...) goes only to its owner in "profile" / "lite". Positions carry a server-time stamp (t): other clients smooth them on
// that timeline.
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    bx: t.string().default(''),      // their Boxity account id (chat bubbles find them by it); '' for a guest or a bot
    bot: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.float32().default(0),
    t: t.float64().default(0),       // when they were there (server ms)
    anim: t.uint8().default(0),      // 0 idle, 1 walk, 2 air
    title: t.string().default(''),
    tc: t.float64().default(0),      // lifetime clicks (their name tag)
    tier: t.uint8().default(0),      // the best keyboard they have this boot
    cb: t.uint8().default(0),        // their combo's step (0: none; flames round them from 4)
    team: t.string().default(''),    // their Desk Buddies, comma separated
    av: t.string().default(''),      // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

export const GameState = schema({
    now: t.float64().default(0),     // the server's clock, every patch
    gold: t.string().default(''),    // the Golden Keys: "setup:key" pairs, ";" between them
    frenzy: t.float64().default(0),  // KEY FRENZY until then (server ms; 0: none)
    players: t.map(PlayerState),
}, 'GameState');
