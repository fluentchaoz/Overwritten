# OVERWRITTEN

A horde-survivor roguelike made entirely of text characters.

You are a file that crawled out of the Recycle Bin. Cross the filesystem, outlast the
system's attempts to purge you, and reach the internet. When you die you return to the
Recycle Bin and spend **Recovered Bytes** on permanent upgrades.

## Play

Open `index.html` in a browser (no build step, no dependencies), or serve the folder:

    python3 -m http.server 8000

| Key | Action |
|---|---|
| WASD / arrows | move |
| MOUSE | aim (you always fire, the cursor decides where) |
| SPACE | your **dash program** (default `ctrl+z`: rewind ~1s of position **and** integrity) |
| RIGHT-CLICK / Q | your **special attack** (charges from bits, kills and time) |
| click / 1-3 / arrows + ENTER | pick a level-up patch, `R` rerolls |
| P / ESC | pause |
| M | mute / unmute sound |

Weapons fire constantly and point at your cursor (`ping` and `tail -f` have no direction and just work). The **Lock-On** passive adds aim assist: Lv1 snaps to enemies near your cursor line, Lv2 a wide cone, Lv3 aims for you. Add `?t=530` to the URL to start a run at 530 seconds (the boss arrives at 540), and `?unlock=1` to unlock every form, dash program and special so you can try them all.

## Loadout (chosen in the Recycle Bin)

**Dash programs** (SPACE), pick one:

| Program | What it does |
|---|---|
| `ctrl+z` Undo *(default)* | rewind ~1s of position and integrity |
| `ctrl+c/v` Copy-Paste | press once to drop an anchor, again to teleport back to it |
| `ctrl+s` Quicksave | press once to save position and integrity, again to reload them |
| `shift+del` Delete | dash through enemies, deleting weak ones |
| `alt+tab` Switch Window | phase out for 0.7s: invulnerable, 2x speed, cannot attack |
| `F5` Refresh | hop away with a shockwave that shoves enemies and clears shots |

**Special attacks** (right-click / Q). The bar charges from bits, kills and a slow trickle; each special needs a different amount:

| Special | Needs | What it does |
|---|---|---|
| Task Manager *(default)* | 100 | freeze everything but you for 3s |
| `kill -9` | 45 | delete the enemy nearest your cursor (bosses lose 12%) |
| `sudo !!` | 70 | weapon damage x2 and faster fire for 6s |
| Blue Screen | 85 | stun everything on screen for 2.2s (bosses immune) |
| Safe Mode | 80 | enemies lose abilities for 6s, you move faster |
| `fork()` | 90 | a copy of you orbits and fires your weapons for 10s |
| `format c:` | 100 | wipe the screen (elites -50%, bosses -6%), but it also deletes loose XP |

## The "sentient file" passives

Level-up options (3 levels each) that change *how* you play rather than adding numbers:
**Shadow Copy** (a delayed ghost fires your weapons), **Fork Bomb** (shots split on hit), **Undelete** (kills come back as ghost allies),
**Zombie Process** (infect an enemy into an ally), **Read-Only** (cap damage per hit), **Hidden** (stand still and enemies lose you),
**Garbage Collection** (periodic stop-the-world sweep), **Compression** (zip a crowd into one archive that drops big XP),
**Encryption** (orbiting cipher ring blocks shots), **Symlink** (shortcut portals, usable by enemies too), **Spoofed IP** (decoy),
**Port Scan** (reveal and defuse trojans, vacuum chests), **Registry Edit** (gamble: rewrites a random game rule),
**Memory Leak** (grow stronger over time as the screen corrupts), plus **Lock-On** aim assist.
New Recycle Bin upgrades: **Fast Cache** (dash cooldown), **Overclock** (special charge rate), **Startup Entry** (start with free passives).

## Tuning the difficulty

The onslaught is controlled by `OW.TUNING` at the top of `js/data.js`: spawn rate and population growth,
enemy HP growth, Purge pacing, elite timing, and the **ebb and flow** (`waveAmp` / `wavePeriod`), a surge-and-lull
rhythm so the pressure comes in waves instead of constantly. Enemy types unlock via `from:` on each entry in `OW.ENEMIES`.

## Sound

All effects are synthesized live with the Web Audio API in the spirit of the Atari 2600's TIA chip
(square and 25% pulse waves, short-period "buzz" noise, 4-bit volume steps rewritten every 1/60s, crushed to a
coarse bit depth). There are no audio files and no music. Sounds fall off with distance, pickups climb in pitch
while you keep scooping, and busy fights are compressed so they crunch instead of clipping.
Open `sfx.html` to audition every effect.

## Slice contents

- **C:\Temp**: Purge starts at 3:00 and escalates every minute; **DISK CLEANUP.EXE** arrives at 9:00; beat it and reach the `>>>` UPLINK portal.
- **Enemies** (nothing hostile is smaller than 2 characters): swarmer `-0`, flicker `<>`, bloat `[#]`, spyware `(o)`, worm `=@~=~=~`, trojan `(+)`, plus elites with `* ! &` modifiers.
- **Weapons**: grep, ping, cat, tail -f, rm, cron. `grep` evolves into `grep -r` (max level + Regex passive).
- **Recycle Bin**: permanent upgrades, three playable forms (`.txt`, `.exe`, `.tmp`), revive-once backup.

## Layout

    index.html      page + canvas
    js/data.js      enemies, weapons, passives, forms, meta upgrades
    js/game.js      simulation (no DOM; runs in Node)
    js/powers.js    dash programs, specials, sentient-file passives (no DOM)
    js/audio.js     procedural Atari-style sound effects (Web Audio)
    js/main.js      rendering, input, menus, save (localStorage)
    sfx.html        sound test page
    tools/simtest.js  headless smoke test:  node tools/simtest.js 700 txt 3
    tools/powertest.js  checks every dash/special/passive does what it claims:  node tools/powertest.js
