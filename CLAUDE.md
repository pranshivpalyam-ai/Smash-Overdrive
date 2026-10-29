# Smash Overdrive — Tennis Game

Browser-based tennis game. Entry point is `index.html`, game code lives in `js/`, styles in `style.css`.

## Running the game locally

Open a terminal in this folder and start the local web server:

```
python serve.py
```

(`serve.py` is a plain `http.server` with `Cache-Control: no-store`, so the browser always fetches the current
JavaScript. `python -m http.server 8123` also works, but Chrome will then cache the modules for hours and a
normal refresh can show stale code.)

Then open in a browser:

```
http://127.0.0.1:8123/index.html
```

### Useful URLs

Debug HUD:

```
http://127.0.0.1:8123/index.html?debug=1
```

Autoplay bot:

```
http://127.0.0.1:8123/index.html?debug=1&bot=1
```

With `?debug=1` the running level is exposed as `window.__game` in the browser console (the audio object is
`window.__audio` and the state actions are `window.__actions`), so you can force a smash with:

```
__game.smash = 1; __game.smashReady = true;
```

### If something doesn't update

- Check the **BUILD** stamp top-right of the title screen against `CONFIG.build` in `js/config.js`
  (also logged to the browser console). If it is older, the browser is serving cached files.
- Force-refresh with `Ctrl + F5`
- Clear the save via **Settings → Reset Progress**
- Or open the game in an Incognito/Private window

## Sharing the game

`build.mjs` packs the game without touching the sources (run it again after any change):

```
node build.mjs
```

- `dist/SmashOverdrive.html` is the whole game in one file, Three.js included. It plays offline from a
  double-click, email, OneDrive or a USB stick. Send this to people who just want to play.
- `dist/web/` is a plain static website (Three.js from the pinned CDN). Upload the folder to any static host.
- Online link: https://claude.ai/artifact/Mt2vt5p7uEJV5UUjsBCq3t (the `dist/web` build published as a Claude
  artifact; sharing is set from that page's Share menu). Republish from Claude Code by passing that URL.

The single file embeds every module through an import map of `data:` URLs, so the untouched ES modules run
as-is; nothing is transpiled.

## Test checklist

### Title Screen

- Verify the new **Controls** button appears next to the grip display.
- Click it and confirm:
  - Movement keys are shown.
  - Swing/pause controls are shown.
  - Escape and Close dismiss the popup.

### Gameplay

Start Level 1 and check:

- Balls feel easier to hit (the active hit window is 75% of the swing, up 25% from 60%).
- Swing animation lasts noticeably longer.
- No baseline marker is visible.
- Ball speed feels slightly slower on higher levels.
- The camera sits further back and higher (`CONFIG.camera`): the full width of the court is visible from
  about the first service line onward, the player is about half as tall on screen as before, and incoming
  balls rarely need the off-screen edge arrows.

### Hitbox, Lives, Targets

- The racquet hit volume is a capsule running from the head 65% of the way back along the handle toward the
  body (`CONFIG.swing.bodyExtend`, radius tapering to `bodyExtendRadius`). A ball that slips inside the head
  is still hit. Clean Hits and return angles are still judged from the head.
- The HUD shows **5 hearts** (`CONFIG.lives.perLevel`).
- Return targets rise by 2 per level: 10, 12, 14, 16 ... (`CONFIG.levels.targetStep`).

### Stadium

Both sides and the far end of the court are enclosed by 3D stepped stands (`js/stands.js`, `CONFIG.stands`).

- Seven concrete tiers with a light edge strip, a dark back wall and a top rail. The bowl is tall enough to
  tower over the side walls, and from the centre of the baseline both side stands are in view from about the
  service line onward, with the far stand filling the top of the frame.
- Blocky spectators in mixed shirt and skin colours sit in every row, swaying slightly.
- The crowd hops on every hit and return, more for a Clean Hit, most for a Smash.
- The old flat backdrop remains behind the far stand as an upper deck.

### Smash Meter

A vertical bar stands just to the left of the player.

- Each regular hit fills it by 10%, each Clean Hit by 30%.
- When full it pulses gold/white and **SMASH READY** flashes.
- The next hit is a Smash:
  - The hit ball flies straight down the court at 3x return speed with a white streak.
  - Every other ball on court is launched the same way.
  - Each one counts toward the level target (watch the returns counter jump).
  - The screen shakes, flashes white, and (with audio on) a bass crack plays.
- The bar empties after the smash and starts filling again.

All numbers live in `CONFIG.smash` in `js/config.js`.

### Soundtrack

Turn audio on in **Settings**, then start any level.

- An 8-bit adventure loop (pulse lead, square arpeggio, triangle bass, noise drums, 150 BPM, 8 bars in
  E minor) starts with the level. It is generated by `js/music.js`; there are no audio files.
- It is noticeably quieter than the hit, smash and life-lost sound effects (`CONFIG.audio.music.volume`).
  Effects run through their own bus (`CONFIG.audio.sfxVolume`).

### Crowd Sounds

Synthesised in `js/crowd.js`, levels in `CONFIG.audio.crowd`. With audio on:

- A **Clean Hit** (the ball meets the sweet spot of the racquet head; **CLEAN HIT** flashes on the HUD) gets a
  crowd cheer on top of the clean-pop sound: a roar with scattered claps lasting about a second and a half.
  Ordinary hits do not cheer, and Clean Hits are the minority of hits, so listen for the HUD flash.
- A **Smash** gets the same cheer 1.5x louder.
- **Level complete** gets a longer cheer at Clean Hit volume under the fanfare.
- **Losing the last life** gets a quiet, low boo under the fail sound.
- Ordinary hits and returns make the crowd hop but not shout.
- It is silent on the title, level select, shop, settings, complete and failed screens.
- Pausing fades it out; resuming continues from where it left off. Starting a new level restarts it
  from the top.
- Turning audio off in settings stops it.

### Laser Forehand Width

The beam's destroy radius and its visual core/glow cylinders are 1.5x wider than before
(`CONFIG.overcharges.laserForehand.radius` 0.9, `coreRadius` 0.12, `glowRadius` 0.45). A ball that
previously just missed the beam's edge is now destroyed.

### New Overcharges

Buy from **Shop → Overcharges**, toggle on the level select screen (the six cards wrap onto two rows).

- **Multiball Frenzy (500 grip)**: every ball you hit back splits into two with a small burst. Both count as returns. The spawner sends fewer new balls to compensate.
- **Magnetised Grip (400 grip)**: incoming balls near the baseline drift toward the centre of your swing with pink sparkles. The drift is capped (`maxShift`), so a ball well off to the side is still missed.
- **Grip Glorify (175 grip)**: on the level complete screen the tally reads `LIVES n X 125` with a `GRIP GLORIFY X5` note under it, instead of `X 25`.

### Difficulty Ramp

Compare approximate ball speeds:

| Level | Ball speed |
|-------|------------|
| 1     | 10.0 u/s   |
| 2     | 10.5 u/s   |
| 3     | 11.0 u/s   |
| 4     | 11.6 u/s   |
| 5     | 12.2 u/s   |

This should feel much gentler than the previous +10% growth per level.

### Shop

To test purchase confirmations:

1. Earn some grip or use an existing save.
2. Open **Shop → Character** or **Shop → Racquet**.
3. Select an item you don't own.
4. A confirmation popup should appear with:
   - Item name
   - Cost
   - Cancel
   - Buy

Free or already-owned items should still equip immediately.

### Replay Reward Rule

1. Clear Level 1.
2. Replay Level 1.
3. On completion, verify:
   - Grip is awarded only from lives remaining.
   - No grip is awarded from returned balls.
