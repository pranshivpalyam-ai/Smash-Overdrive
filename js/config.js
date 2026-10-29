/**
 * config.js — every tunable number in Smash Overdrive lives here.
 *
 * Rules of thumb:
 *  - Distances are in world units. The court is 10 wide and 34 long.
 *  - Times are in milliseconds unless the name says otherwise (dt in seconds
 *    only ever appears inside the simulation code).
 *  - Colours are indices into PALETTE (the shared 32-colour palette) unless the
 *    comment says they are an RGB multiplier.
 *
 * Nothing in here imports anything, so it can be loaded by the game-logic
 * modules, the renderer and the 2D UI alike.
 */

/**
 * The 32-colour palette shared by the 3D scene (quantised in a shader pass)
 * and the 2D pixel-art UI. Index numbers are referenced throughout CONFIG.
 * Keep it at exactly 32 entries — the quantise shader loops over that many.
 */
export const PALETTE = [
  '#0a0a12', //  0 black
  '#26263a', //  1 dark navy grey
  '#4e4e66', //  2 slate
  '#8e8ea6', //  3 grey
  '#c8c8d8', //  4 silver / light grey
  '#f4f4f8', //  5 white
  '#173f22', //  6 darkest green
  '#256b31', //  7 dark green (shade under objects, off-court grass)
  '#2f8a3d', //  8 grass stripe A
  '#3a9c48', //  9 grass stripe B
  '#78cc5a', // 10 lime
  '#c8e648', // 11 tennis-ball yellow-green
  '#a4b870', // 12 muted yellow-green (far-ball tint lands here)
  '#f2f5a0', // 13 pale yellow highlight
  '#f7c245', // 14 gold (grip icon, blonde hair)
  '#e8843a', // 15 orange
  '#b8532e', // 16 rust / clay
  '#7a3520', // 17 dark rust
  '#142a5e', // 18 deep blue (sky zenith, navy shorts)
  '#2a58c0', // 19 blue
  '#6ea6e8', // 20 sky blue
  '#bfdcf4', // 21 pale horizon
  '#38d0c8', // 22 cyan (laser, strings)
  '#d83a4a', // 23 red
  '#f08ac8', // 24 pink
  '#7a3ad0', // 25 purple
  '#f8dcc0', // 26 skin — pale
  '#e6b48a', // 27 skin — light
  '#c48a5e', // 28 skin — tan
  '#8e5a3a', // 29 skin — brown
  '#5a3220', // 30 skin — deep / dark brown hair
  '#3a1e12', // 31 darkest brown
];

export const CONFIG = {
  // Shown bottom-right of the title screen and logged to the console. Bump it with every change so a
  // stale browser cache is obvious at a glance: if the title screen shows an older stamp, hard-refresh.
  build: '2026-10-28.4',

  // ───────────────────────────────────────────────────────────── rendering ──
  render: {
    baseWidth: 480,          // internal render target width at renderScale 1.0 (portrait 9:16)
    baseHeight: 854,         // internal render target height at renderScale 1.0
    renderScale: 1.0,        // 0.5–1.0. Lower = chunkier pixels and cheaper frames
    maxPixelRatio: 2,        // cap on devicePixelRatio for the final upscaled canvas
    dither: 0.0,             // 0–1. Ordered (Bayer 4x4) dither strength before palette quantisation
    vertexSnap: false,       // snap vertices to a coarse grid (PS1 wobble). Can hurt depth reading
    vertexSnapGrid: 0.5,     // 0.25–1.0. Fraction of the render-target resolution used as the snap grid
    shadowMapSize: 1024,     // 512–2048. Single directional shadow map resolution
    autoScale: true,         // step renderScale down automatically on sustained frame drops
    autoScaleMinFps: 45,     // average fps below this (over autoScaleWindowMs) triggers a step down
    autoScaleWindowMs: 3000, // how long a drop must be sustained before stepping down
    autoScaleStep: 0.1,      // how much renderScale drops per step
    autoScaleFloor: 0.5,     // never auto-scale below this
  },

  // ─────────────────────────────────────────────────────────────── lighting ──
  lighting: {
    hemisphereSky: 21,          // palette index for the hemisphere light's sky colour (pale: mid-tones make it too dim)
    hemisphereGround: 12,       // palette index for the hemisphere light's ground colour
    hemisphereIntensity: 2.4,   // 1.0–3.0. Fills the shaded back of the player so it does not quantise to grey
    sunColor: 5,                // palette index for the directional light colour
    sunIntensity: 2.2,          // 1.0–3.5
    sunDirection: [0.25, 1.0, 0.45], // direction TOWARDS the sun: high and slightly behind the camera so the
                                     // player's back (what you see) is lit. Shadows fall away down the court
    shadowRadius: 2,            // PCF soft-shadow blur radius, 1–4
    fog: false,                 // linear fog toward the horizon colour (a depth cue in its own right)
    fogNear: 20,                // world units from the camera where fog starts
    fogFar: 70,                 // world units where fog is fully opaque
    fogColor: 21,               // palette index
  },

  // ───────────────────────────────────────────────────────────────── camera ──
  camera: {
    back: 6.0,           // world units behind the player (positive z). Further back = more court in view
    height: 3.8,         // world units above the ground. Higher = the court fills more of the frame
    pitchDeg: 22,        // degrees pitched down. Never changes at runtime. Steeper trades sky for court
    fov: 68,             // vertical field of view in degrees. The render target is portrait (9:16), so the
                         // horizontal view is narrow: these four values together show the full court width
                         // from about z = -8 onward and ~5.4 units of width at the player's own z
    near: 0.1,           // near clip plane
    far: 160,            // far clip plane — must clear the sky sphere
    damping: 0.12,       // per-frame lerp factor at 60fps toward the player's x (0.05 floaty – 0.3 tight)
    xMargin: 0.0,        // extra clamp inset from the walls; 0 lets the camera reach the sidelines exactly
    rollDeg: 1.5,        // max roll in degrees at full lateral speed (1–2 recommended)
    rollDamping: 0.1,    // per-frame lerp toward the target roll
    kickDistance: 0.18,  // how far the camera kicks backward on a hit
    kickReturn: 9,       // per-second decay rate of the kick (higher = snappier)
    shakeAmount: 0.14,   // max random offset when a life is lost
    shakeReturn: 7,      // per-second decay rate of the shake
  },

  // ────────────────────────────────────────────────────────────────── court ──
  court: {
    halfWidth: 5,          // x from -halfWidth to +halfWidth. Inner faces of the walls
    length: 34,            // z from 0 (baseline) to -length (far baseline)
    wallHeight: 0.9,       // side wall height
    wallThickness: 0.3,    // side wall thickness (outside the halfWidth)
    wallColor: 16,         // palette index — muted rust reads well against green
    wallCapColor: 15,      // palette index for the lighter top rail
    wallBackZ: 2.5,        // walls run from +wallBackZ to -(length + wallFarExtra)
    wallFarExtra: 1.5,
    groundHalfWidth: 16,   // the grass plane extends this far in x so the far frustum never sees void
    groundBackZ: 6,        // grass extends this far behind the baseline
    groundFarZ: -46,       // grass extends this far past the far baseline
    texelsPerUnit: 24,     // grass texture resolution (16 chunky – 32 crisp)
    stripeWidth: 2.0,      // width of each mown stripe (across the court, along z)
    grassA: 8,             // palette index of stripe A
    grassB: 9,             // palette index of stripe B
    grassOutside: 7,       // palette index of grass outside the walls
    noiseAmount: 0.35,     // 0–1 dithered noise between the two greens
    lineColor: 5,          // palette index for court markings
    lineWidth: 0.14,       // width of lines running along the court (sidelines, centre line)
    crossLineWidth: 0.3,   // width of lines running across the court. Wider than real: the low camera
                           // foreshortens them heavily and they are valuable depth landmarks
    baselineWidth: 0.4,    // the baseline at z = 0 is bold
    groundMipmaps: true,   // mipmap the grass texture so the far court does not shimmer in motion
    lineInset: 0.18,       // sidelines sit this far inside the walls
    serviceLineZ: [-10, -24], // z of the two service lines
    netLineZ: -17,         // a thin line where the net would be, purely decorative
    centreMarkLength: 0.5, // length of the centre service mark on the baseline
    scuffCount: 160,       // number of worn patches eroded out of the lines
    dirtCount: 500,        // number of dark dirt specks on the grass
    backdropZ: -44,        // z of the stand/fence silhouette
    backdropHeight: 7,     // height of the backdrop plane
    skyTop: 18,            // palette index — sky zenith
    skyMid: 20,            // palette index — sky mid
    skyHorizon: 21,        // palette index — horizon band
    concedeZ: 0.5,         // a ball crossing this z costs a life
  },

  // ───────────────────────────────────────────────────────────────── stands ──
  // The stadium bowl: stepped tiers on both sides and across the far end, with an animated crowd.
  stands: {
    enabled: true,
    tiers: 7,                // rows of seating (7 makes a tall bowl that towers over the side walls)
    tierHeight: 0.75,        // rise per tier
    tierDepth: 1.0,          // depth per tier (tread)
    sideGap: 0.4,            // gap between the outer face of the court wall and the first side tier
    farFrontZ: -36.8,        // z of the far stand's front face (court walls end at -35.5)
    concreteA: 2,            // palette index — alternating tier colours
    concreteB: 1,
    edgeColor: 3,            // palette index — light strip along each step edge and the top rails
    edgeWidth: 0.12,
    edgeHeight: 0.06,
    backWallColor: 1,        // palette index — wall enclosing the top tier
    backWallExtra: 1.6,      // back wall rises this far above the top tread
    backWallThickness: 0.3,
    seatSpacing: 0.6,        // distance between spectators along a row
    seatInset: 0.62,         // spectators sit this far back from the step edge
    seatJitter: 0.14,        // random offset so rows do not look machine-placed
    fill: 0.86,              // fraction of seats occupied
    bodyWidth: 0.36,         // seated spectator body block
    bodyHeight: 0.5,
    bodyDepth: 0.3,
    headSize: 0.22,
    shirtColors: [23, 19, 5, 14, 15, 24, 25, 22, 4, 18, 10, 11, 16], // palette indices
    skinColors: [26, 27, 28, 29, 30],
    idleBob: 0.02,           // idle vertical sway amplitude
    idleSpeed: 1.6,          // idle sway cycles per second (randomised ±30% per spectator)
    fidgetChance: 0.3,       // fraction of the crowd that sways more
    fidgetBoost: 1.5,        // extra sway multiplier for fidgeters
    cheerJump: 0.3,          // hop height at full cheer
    cheerSpeed: 9,           // hop cycles per second during a cheer
    cheerDecay: 2.0,         // per-second decay of the cheer
    cheerMax: 1.2,
    cheerHit: 0.45,          // cheer strength per event
    cheerClean: 0.8,
    cheerReturn: 0.35,
    cheerSmash: 1.2,
  },

  // ───────────────────────────────────────────────────────────────── player ──
  player: {
    height: 1.8,           // total model height in world units
    maxSpeed: 7.5,         // units/sec lateral. 6 sluggish – 9 twitchy
    accelTime: 0.09,       // seconds to reach max speed from rest
    frictionTime: 0.09,    // seconds to stop from max speed
    edgeInset: 0.35,       // how far the player's centre stays inside the walls
    fadeDistance: 3.0,     // a ball within this z-distance and behind the player (from the camera) fades the body
    fadeAlpha: 0.75,       // opacity while faded
    fadeSpeed: 8,          // per-second lerp rate for the fade in/out
    idleBobAmount: 0.03,   // vertical idle bob amplitude
    idleBobSpeed: 2.4,     // idle bob cycles per second
    runCycleSpeed: 7,      // run-cycle steps per second at full speed
    runLeanDeg: 9,         // body lean into the direction of travel at full speed
    touchDeadZone: 0.15,   // world units. Touch drag stops moving when within this of the target x
  },

  // ────────────────────────────────────────────────────────────────── swing ──
  swing: {
    durationMs: 240,       // total swing time (160 was too hard to time; 1.5x longer)
    activeStart: 0.125,    // fraction of the swing where the hit volume switches on (middle 75%:
    activeEnd: 0.875,      // widened 25% from the original 0.2–0.8 window)
    cooldownMs: 200,       // time after a swing ends before another can start
    hitRadius: 0.55,       // radius of the swept hit sphere at the racquet head
    bodyExtend: 0.65,      // the hit volume also runs from the head this fraction of the way back along the
                           // handle toward the body (a swept capsule, not just a sphere). Balls that slip
                           // inside the head still get hit. Clean Hits and return angles still use the head
    bodyExtendRadius: 0.4, // radius of the hit volume at the body end of that capsule (tapers from hitRadius)
    reach: 1.0,            // distance from the shoulder to the racquet head centre
    headHeight: 1.0,       // height of the racquet head through the swing (matches ball.height)
    arcStartDeg: 10,       // swing arc start angle: 0 = directly right of the player, 90 = straight ahead
    arcEndDeg: 170,        // swing arc end angle, symmetric about straight ahead. A narrower arc keeps the
                           // head in front of the player for more of the active window (easier timing)
    sweetSpotRadius: 0.25, // contact within this distance of the head centre is a Clean Hit
    reflectMultiplier: 1.4,// outgoing speed = incoming * this
    maxReturnSpeed: 34,    // cap on outgoing ball speed
    maxReturnAngleDeg: 40, // outgoing x angle at the edge of the racquet head
    slowmoMs: 60,          // hit slowdown duration
    slowmoScale: 0.3,      // time scale during the slowdown
    flashMs: 90,           // racquet flash duration
    particleCount: 14,     // particles in the contact burst (Clean Hit doubles it)
  },

  // ────────────────────────────────────────────────────────────────── balls ──
  ball: {
    radius: 0.12,          // tennis ball radius
    height: 1.0,           // constant flight height. No gravity, ever
    spawnZ: -34,           // spawn plane, equals -court.length
    exitZ: -34,            // a returning ball crossing this z counts as returned
    maxAngleDeg: 35,       // spawn direction cap, measured from straight-on
    speedSpread: 0.08,     // ±fraction of random speed variation per ball
    maxBalls: 24,          // pool size. Hard cap on balls in flight (all rendering is instanced)
    spinRate: 1.0,         // visual spin, multiplies speed / radius
  },

  // ───────────────────────────────────────────────────────── difficulty ramp ──
  difficulty: {
    spawnIntervalBase: 1800,  // ms between spawns at level 1
    spawnIntervalDecay: 0.91, // multiplied per level (≈ -9%)
    spawnIntervalFloor: 450,  // ms — never faster than this
    speedBase: 10,            // units/sec at level 1
    speedGrowth: 1.05,        // multiplied per level (+5%)
    speedCeiling: 30,         // units/sec cap
    pairsFromLevel: 3,        // pairs can spawn from this level
    triplesFromLevel: 6,      // triples can spawn from this level
    pairChance: 0.3,          // chance a spawn becomes a pair (when allowed)
    tripleChance: 0.18,       // chance a spawn becomes a triple (when allowed, checked first)
    groupSpacingX: 2.4,       // minimum x separation of predicted baseline crossings inside a group
    groupSpacingMs: 700,      // time separation between balls in a group. Must exceed swing duration +
                              // cooldown (520ms) plus travel time, or the second ball is unreturnable
    reachSafety: 0.85,        // fraction of the player's theoretical reach used for the reachability check
    spawnRerolls: 10,         // attempts to find a reachable spawn before taking the nearest
    /** Spawn interval in ms for a 1-based level. */
    spawnInterval(level) {
      return Math.max(this.spawnIntervalFloor, this.spawnIntervalBase * Math.pow(this.spawnIntervalDecay, level - 1));
    },
    /** Base ball speed in units/sec for a 1-based level (before ±speedSpread). */
    ballSpeed(level) {
      return Math.min(this.speedCeiling, this.speedBase * Math.pow(this.speedGrowth, level - 1));
    },
  },

  // ───────────────────────────────────────────────────────────────── levels ──
  levels: {
    count: 12,             // levels shown on the level select grid
    targetBase: 10,        // level 1 target
    targetStep: 2,         // added per level
    targetCap: 40,         // never more than this
    /** Balls that must reach the far baseline to clear a 1-based level. */
    returnTarget(level) {
      return Math.min(this.targetCap, this.targetBase + this.targetStep * (level - 1));
    },
  },

  // ────────────────────────────────────────────────────────────────── lives ──
  lives: {
    perLevel: 4,           // lives per attempt
    hitStopMs: 700,        // freeze after a life is lost. Player is invulnerable and cannot swing
    graceMs: 250,          // after the hit-stop, balls crossing the baseline are removed without costing a life
    vignettePulses: 2,     // red vignette pulses during the hit-stop
    iconShatterParticles: 12, // particles when a life icon breaks
  },

  // ────────────────────────────────────────────────────────────────── score ──
  score: {
    perReturn: 100,        // base score per ball that reaches the far baseline
    cleanHitBonus: 0.5,    // +50% for a sweet-spot return
    comboStep: 5,          // consecutive returns per multiplier step
    comboMax: 5,           // maximum multiplier
  },

  // ───────────────────────────────────────────────────────────── smash meter ──
  // A bar beside the player fills on every racquet contact. When full, the next
  // hit is a SMASH: the hit ball and every other ball on court are launched
  // straight down the court at smash speed, and each one counts as a return.
  smash: {
    regularFill: 0.10,     // meter gained by a normal hit
    cleanFill: 0.30,       // meter gained by a Clean Hit
    speedMultiplier: 3,    // smashed balls travel at this multiple of the normal return speed
    slowmoMs: 130,         // hit slowdown on the smash itself (longer than a normal hit)
    shakeStrength: 2.6,    // camera shake as a multiple of the lost-life shake
    kickStrength: 2.2,     // camera kick-back as a multiple of a normal hit
    flashMs: 180,          // white screen flash duration
    burstCount: 36,        // particles at the point of contact
    barOffsetX: -0.8,      // bar position relative to the player (negative = their left; the racquet is on the right)
    barZ: 0.1,             // bar z position (just behind the baseline)
    barBottomY: 0.2,       // bottom of the bar
    barHeight: 1.0,        // bar height when full
    barWidth: 0.1,         // bar width
    barBorder: 0.04,       // dark border around the bar
    barBackColor: 1,       // palette index of the empty bar
    barFillColor: 14,      // palette index of the fill (gold)
    barReadyColor: 5,      // palette index the fill pulses to when the smash is ready
    readyPulseHz: 5,       // pulse rate when ready
    trailColor: 5,         // palette index of the white streak behind smashed balls
    trailScale: 3.0,       // streak quad size relative to the normal trail (the ball covers ~0.7 units a frame)
    trailOpacity: 1.0,     // streak opacity at the ball
  },

  // ──────────────────────────────────────────────────────────── grip economy ──
  grip: {
    perReturn: 10,             // grip per ball returned
    perLifeRemaining: 25,      // grip per life left at level clear
    failedBallMultiplier: 1.0, // multiplier on ball grip when the level is failed (no life bonus)
    replayBallMultiplier: 0.0, // multiplier on ball grip when replaying an already-beaten level (life bonus still paid)
    tallyLineMs: 550,          // delay between tally lines on the level complete screen
    countUpMs: 900,            // duration of the total counting up into the balance
  },

  // ──────────────────────────────────────────────────────────── overcharges ──
  overcharges: {
    titaniumNet: {
      cost: 300,
      charges: 2,            // hits before it snaps
      z: 0.9,                // net plane position behind the player
      height: 1.2,           // net height
      speedMultiplier: 1.2,  // ball speed multiplier on deflection
      sagAmount: 0.25,       // how far the net droops after the first hit
      debrisCount: 18,       // debris pieces when it snaps
      color: 4,              // palette index (silver)
      dullColor: 3,          // palette index after the first hit
    },
    stickyClay: {
      cost: 550,
      speedMultiplier: 0.5,  // all balls move at this fraction of speed for the whole level
      tint: [1.0, 0.82, 0.62], // RGB multiplier washed over the court texture
      dustRate: 14,          // dust particles per second dragged behind each ball while clay is active
      dustColor: 16,         // palette index of the dust
    },
    laserForehand: {
      cost: 600,
      radius: 0.9,           // destroy radius around the beam line (1.5x the original 0.6)
      holdMs: 140,           // full-brightness hold
      fadeMs: 220,           // fade out duration
      coreColor: 5,          // palette index (white core)
      glowColor: 22,         // palette index (cyan glow)
      coreRadius: 0.12,      // visual core cylinder radius (1.5x)
      glowRadius: 0.45,      // visual glow shell radius (1.5x)
    },
    multiballFrenzy: {
      cost: 500,
      splitAngleDeg: 14,     // the twin leaves at this angle from the hit ball's direction
      color: 11,             // palette index of the split burst
      burstCount: 10,
    },
    magnetisedGrip: {
      cost: 400,
      range: 2.6,            // incoming balls within this z-distance of the baseline are pulled
      pullSpeed: 2.4,        // units/sec the ball drifts toward the centre of the swing arc
      maxShift: 0.55,        // total drift per ball. Caps the assist: a ball more than this off still misses
      color: 24,             // palette index of the pull sparkle (pink)
      sparkRate: 10,         // sparkle particles per second per ball being pulled
    },
    gripGlorify: {
      cost: 175,
      lifeMultiplier: 5,     // grip per life remaining is multiplied by this at level clear
    },
  },

  // ─────────────────────────────────────────────────────── shop / cosmetics ──
  // Each option: { name, color (palette index) or style, price }. Index 0 is always the default.
  cosmetics: {
    character: {
      skinTone: { label: 'Skin tone', options: [
        { name: 'Pale',  color: 26, price: 0 },
        { name: 'Light', color: 27, price: 0 },
        { name: 'Tan',   color: 28, price: 0 },
        { name: 'Brown', color: 29, price: 0 },
        { name: 'Deep',  color: 30, price: 0 },
      ] },
      hairStyle: { label: 'Hair style', options: [
        { name: 'Short', style: 'short', price: 0 },
        { name: 'Buzz',  style: 'buzz',  price: 120 },
        { name: 'Bun',   style: 'bun',   price: 120 },
        { name: 'Spiky', style: 'spiky', price: 120 },
      ] },
      hairColor: { label: 'Hair colour', options: [
        { name: 'Black',  color: 0,  price: 0 },
        { name: 'Brown',  color: 30, price: 0 },
        { name: 'Blonde', color: 14, price: 80 },
        { name: 'Red',    color: 16, price: 80 },
        { name: 'Pink',   color: 24, price: 80 },
      ] },
      shirtColor: { label: 'Shirt', options: [
        { name: 'White',  color: 5,  price: 0 },
        { name: 'Red',    color: 23, price: 100 },
        { name: 'Blue',   color: 19, price: 100 },
        { name: 'Lime',   color: 10, price: 100 },
        { name: 'Purple', color: 25, price: 100 },
        { name: 'Orange', color: 15, price: 100 },
      ] },
      shortsColor: { label: 'Shorts', options: [
        { name: 'Navy',  color: 18, price: 0 },
        { name: 'White', color: 5,  price: 100 },
        { name: 'Black', color: 1,  price: 100 },
        { name: 'Red',   color: 23, price: 100 },
      ] },
    },
    racquet: {
      frameColor: { label: 'Frame', options: [
        { name: 'Black', color: 1,  price: 0 },
        { name: 'Red',   color: 23, price: 150 },
        { name: 'Blue',  color: 19, price: 150 },
        { name: 'Gold',  color: 14, price: 150 },
        { name: 'White', color: 5,  price: 150 },
      ] },
      stringColor: { label: 'Strings', options: [
        { name: 'White', color: 5,  price: 0 },
        { name: 'Black', color: 1,  price: 90 },
        { name: 'Red',   color: 23, price: 90 },
        { name: 'Cyan',  color: 22, price: 90 },
        { name: 'Pink',  color: 24, price: 90 },
        { name: 'Lime',  color: 10, price: 90 },
      ] },
      gripTape: { label: 'Grip tape', options: [
        { name: 'White', color: 5,  price: 0 },
        { name: 'Black', color: 0,  price: 90 },
        { name: 'Blue',  color: 19, price: 90 },
        { name: 'Red',   color: 23, price: 90 },
      ] },
    },
    previewTurntableSpeed: 0.6, // radians/sec for the shop's 3D preview
  },

  // ───────────────────────────────────────────────────────────── depth cues ──
  // Every cue is individually toggleable. Test them one at a time.
  depthCues: {
    groundShadow: true,        // dark elliptical blob under each ball — the most important cue
    shadowRadius: 0.17,        // blob radius at ground level
    shadowHeightGrowth: 0.25,  // radius grows by this fraction per unit of ball height
    shadowStretchZ: 1.5,       // blob is stretched along z so it reads as an ellipse from the low camera
    shadowOpacity: 0.8,        // 0–1. Needs to be strong: the shadow-map shadow is already dark and this must read over it
    shadowColor: 0,            // palette index
    ballsCastShadowMap: false, // balls also cast into the directional shadow map. Off: the sun angle offsets it
                               // from the blob shadow and two shadows per ball read worse than one

    marker: false,             // ring on the grass where the ball will cross the baseline. Off: it made
                               // reading the approach too easy. Kept as a toggle for testing
    markerFarScale: 1.1,       // ring diameter when the ball is at the far end
    markerNearScale: 0.45,     // ring diameter when the ball reaches the baseline
    markerFarOpacity: 0.7,     // ring opacity at the far end (below ~0.5 it blends into the grass after quantisation)
    markerNearOpacity: 1.0,    // ring opacity at the baseline
    markerFarColor: 13,        // palette index when far
    markerNearColor: 5,        // palette index when near

    trail: true,               // fading quads behind each ball
    trailLength: 10,           // 8–12 quads
    trailSampleMs: 28,         // ms between trail samples (shorter = tighter trail)
    trailStartScale: 0.9,      // quad size (as a fraction of ball diameter) right behind the ball
    trailEndScale: 0.25,       // quad size at the tail
    trailOpacity: 0.7,         // opacity of the newest quad
    trailColor: 13,            // palette index

    distanceTint: true,        // far balls cooler and desaturated, near balls warm
    tintFar: [1.2, 1.15, 2.2],    // RGB multiplier at the far end. Pushes the ball toward pale yellow (palette 13):
                                  // a plain darkening/desaturation quantises to grass green and the ball disappears
    tintNear: [1.0, 0.98, 0.9],   // RGB multiplier at the baseline

    sizeBoost: true,           // render far balls larger than perspective would
    sizeBoostFar: 1.3,         // scale at the far end
    sizeBoostNearZ: -6,        // scale is 1.0 from this z toward the player
    sizeBoostFarZ: -34,        // scale is sizeBoostFar at this z

    offscreenArrows: true,     // edge arrows when a ball is horizontally outside the frustum
  },

  // ─────────────────────────────────────────────────────────────── effects ──
  fx: {
    particleSize: 0.06,        // edge length of a particle cube
    particleGravity: -6,       // units/sec² applied to burst particles (0 for none)
    hitBurstSpeed: 3.5,        // initial particle speed on a hit
    wallPuffCount: 8,          // dust particles per wall bounce
    wallPuffColor: 27,         // palette index
    scuffLifeMs: 2500,         // wall scuff decal fade time
    scuffSize: 0.35,           // wall scuff decal size
    sparkleCount: 16,          // particles when a ball is returned past the far baseline
    sparkleColor: 13,          // palette index
    flourishColor: 22,         // palette index for the level-clear flourish
    cooldownArcColor: 4,       // palette index of the swing cooldown arc under the player
    cooldownArcRadius: 0.45,   // radius of the cooldown arc
  },

  // ────────────────────────────────────────────────────────────────── ui ──
  ui: {
    fontScale: 3,              // pixel multiplier for body text (5x7 glyphs)
    titleScale: 7,             // pixel multiplier for the title lettering
    titlePanSpeed: 0.35,       // world units/sec the idle title camera slides sideways
    titlePanRange: 2.5,        // how far it slides each way
    cleanHitFlashMs: 700,      // how long CLEAN HIT stays on screen
    hudTextScale: 2,           // pixel multiplier for HUD text
    completeDelayMs: 900,      // pause after the last return before the complete screen shows
    failedDelayMs: 800,        // pause after the last life before the failed screen shows
  },

  // ────────────────────────────────────────────────────────────────── input ──
  input: {
    touchTapMaxMs: 220,        // a touch shorter than this on the upper half counts as a tap (swing)
    touchTapMaxMove: 18,       // css px. A touch that moves more than this is a drag, not a tap
    touchZoneSplit: 0.5,       // fraction of the screen height; below = move zone, above = swing zone
    arrowZoneWidth: 0.22,      // fraction of the width for each held on-screen arrow zone
  },

  // ────────────────────────────────────────────────────────────────── audio ──
  audio: {
    enabled: false,            // off by default
    volume: 0.4,               // 0–1 master (every bus below is relative to this)
    sfxVolume: 1.25,           // sound-effects bus (hits, smash, lives, menus)
    crowd: {
      volume: 1.0,             // crowd bus gain relative to master
      cleanHit: 0.7,           // cheer strength on a Clean Hit
      smash: 1.05,             // 1.5x the Clean Hit cheer
      win: 0.7,                // level complete: same strength as a Clean Hit, held longer
      boo: 0.22,               // quiet boo when the last life is lost
      cheerMs: 1600,           // length of a hit/smash cheer
      winMs: 3200,             // length of the level-complete cheer
      booMs: 2200,             // length of the boo
    },
    music: {
      volume: 0.27,            // music bus gain relative to master; well under the effects
      bpm: 150,                // tempo of the 8-bit adventure loop
      lookaheadMs: 25,         // scheduler tick
      scheduleAhead: 0.15,     // seconds of notes queued in advance
      fadeOutMs: 250,          // fade when leaving the play screen
    },
  },

  // ───────────────────────────────────────────────────────────────── save ──
  save: {
    key: 'smash-overdrive',    // localStorage key
    version: 1,                // bump to invalidate old saves
  },

  // ───────────────────────────────────────────────────────────── performance ──
  performance: {
    maxDt: 1 / 30,             // simulation step clamp in seconds (prevents tunnelling after a tab switch)
    particlePool: 256,         // pooled particles
    scuffPool: 24,             // pooled wall scuff decals
  },
};

/** Convert a palette index to a CSS hex string. */
export function paletteHex(index) {
  return PALETTE[index];
}
