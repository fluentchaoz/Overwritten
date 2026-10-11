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
| SPACE | `ctrl+z`: rewind ~1s of position **and** integrity (14s cooldown) |
| 1-3 / arrows + ENTER | pick a level-up patch, `R` rerolls |
| P / ESC | pause |

Weapons fire automatically. Add `?t=530` to the URL to start a run at 530 seconds (the boss arrives at 540).

## Slice contents

- **C:\Temp**: Purge starts at 3:00 and escalates every minute; **DISK CLEANUP.EXE** arrives at 9:00; beat it and reach the `>>>` UPLINK portal.
- **Enemies** (nothing hostile is smaller than 2 characters): swarmer `-0`, flicker `<>`, bloat `[#]`, spyware `(o)`, worm `=@~=~=~`, trojan `(+)`, plus elites with `* ! &` modifiers.
- **Weapons**: grep, ping, cat, tail -f, rm, cron. `grep` evolves into `grep -r` (max level + Regex passive).
- **Recycle Bin**: permanent upgrades, three playable forms (`.txt`, `.exe`, `.tmp`), revive-once backup.

## Layout

    index.html      page + canvas
    js/data.js      enemies, weapons, passives, forms, meta upgrades
    js/game.js      simulation (no DOM; runs in Node)
    js/main.js      rendering, input, menus, save (localStorage)
    tools/simtest.js  headless smoke test:  node tools/simtest.js 700 txt 3
