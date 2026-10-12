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
| SPACE | `ctrl+z`: rewind ~1s of position **and** integrity (14s cooldown) |
| click / 1-3 / arrows + ENTER | pick a level-up patch, `R` rerolls |
| P / ESC | pause |
| M | mute / unmute sound |

Weapons fire constantly and point at your cursor (`ping` and `tail -f` have no direction and just work). The **Lock-On** passive adds aim assist: Lv1 snaps to enemies near your cursor line, Lv2 a wide cone, Lv3 aims for you. Add `?t=530` to the URL to start a run at 530 seconds (the boss arrives at 540).

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
    js/audio.js     procedural Atari-style sound effects (Web Audio)
    js/main.js      rendering, input, menus, save (localStorage)
    sfx.html        sound test page
    tools/simtest.js  headless smoke test:  node tools/simtest.js 700 txt 3
