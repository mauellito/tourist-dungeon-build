// Tourist Dungeon engine — TD_UI: presentation / quality-of-life logic.
// DOM-free so it can be unit-tested headlessly. play-map.html wires these into
// the canvas, the sidebar, and the input loop. NOTHING here changes generation,
// the checker, or game rules: auto-explore only issues the same move() a player
// would; labels/threats/palette only read the view; barks are flavour the Bureau
// adds to the log. Municipal voice; OBJ-true.
//
// COLOR DISCIPLINE (Brogue rule, standing law — see CLAUDE.md): every colour in
// the UI means exactly one thing, and that meaning is defined ONCE, here, in
// PALETTE. Creatures, items, doors, signals, criticals each own a hue. Glyphs
// (not colour) distinguish kinds within a category. No decorative colour.
"use strict";

var TD_UI = (function () {
  // ---- the single source of truth for colour ------------------------------
  var PALETTE = {
    // category hues (each means exactly one thing)
    player:   "#f5c542",   // gold — you, and damage you deal
    creature: "#ff6b4a",   // orange-red — any creature (glyph tells the kind)
    item:     "#46c8c0",   // teal — any item on the floor
    door:     "#5fd35f",   // green — any door, stair, or passage
    signal:   "#b98cff",   // violet — any signal plaque / lookout
    critical: "#ff2d1f",   // pure red — critical messages, the --more-- halt, damage taken
    senses:   "#7fa8c9",   // steel blue — the SENSES channel (perceived atmosphere)
    redlight:  "#d21f4a",  // TOWN C.1: REDDER crimson-magenta — the red-light district (distinct from critical orange-red #ff2d1f)
    nature:    "#5a8a4a",  // green — trees, gardens, the park
    npc:       "#d9b36a",  // warm tan — friendly townsfolk (the crowd, not a threat)
    rampart:   "#7d7468",  // stone — the TOWN perimeter wall (fortification, not architecture)
    fence:     "#9a8458",  // weathered wood — an enclosure fence (see-through)
    gate:      "#caa15a",  // brass — a gate (passage through a barrier)
    storefront: "#b5763e", // terracotta — commercial frontage (shop sign / window / awning)
    fixture:    "#8f8a7a", // pewter — fixed street furniture (lamppost, bench, crate, well, hitching post)
    // building-KIND hues (E2: read a building's function from its glyph colour)
    civic:     "#9aa6b8", // slate — civic / bureaucratic (bank, agency, kiosk, tim, the dungeon office)
    lodging:   "#b58fd0", // lavender — lodging (hotel, motel)
    faith:     "#dcc879", // pale gold — faith (the church)
    vice:      "#d21f4a", // = redlight crimson — vice (red-light businesses)
    // damage-number meanings (kept consistent with the category rules)
    dmgDealt: "#f5c542",   // = player gold (your output)
    dmgTaken: "#ff2d1f",   // = critical red (harm to you)
    // terrain / chrome (functional, not decorative)
    voidc:      "#07060a",
    floor:      "#9b8e72", floorDim:    "#4a4438",
    floorBg:    "#574d3c", floorBgDim:  "#2a2620",
    wall:       "#c6b48a", wallDim:     "#5f564a",
    water:      "#1d3346", waterGlyph:  "#6fa0c4",
    // C3 ground surfaces (functional terrain texture, one meaning each)
    cobble:     "#8d8a82", dirt: "#8a6f4a", stone: "#a6a29a", grass: "#5a8a4a", sand: "#c2a86a", plank: "#9a7d50",
    doorBg:     "#403225", pendingBg:   "#7a5f1e", stoopBg: "#5a4a1f",
    // TOWN A — building CATEGORY hues (TUNABLE): civic slate-blue, commerce warm tan, food+lodging amber/gold,
    // vice/red-light magenta, maritime sea-teal. (civic + vice already above; food + maritime added here.)
    food:       "#d9a441", maritime: "#3fa3a3",
    // GATE 1 — the CHURCH landmark reads in a SANCTIFIED jewel tone (cool amethyst/stained-glass), set
    // apart from the civic slate so it's findable across town. One meaning: faith/sanctified.
    sanctified: "#9a6fe0", sanctifiedBg: "#241a3a",
    // danger tints for the threats panel (severity, a defined meaning)
    dangerHigh: "#ff2d1f", dangerMed: "#e0902a", dangerLow: "#caa15a",
    // COMBAT JUICE: the MUTED hit-tick (a blow fully absorbed / de-minimis) — a quiet grey pulse,
    // deliberately colourless so it reads as "nothing got through", distinct from the player/critical hues.
    muted: "#6a6356",
    // P2 (clean glyph pass) — terrain/chrome BACKGROUNDS migrated out of inline draw() literals so EVERY
    // colour the renderer paints is defined ONCE here (Brogue colour discipline). Values are unchanged.
    roomDoorBg:   "#37301f",   // a plain / room doorway tile bg (distinct from the lit-stoop doorBg)
    groundRlBg:   "#3a1622",   // red-lit district ground bg
    groundGrassBg:"#28331d", groundSandBg:"#3b3320", groundPlankBg:"#2e2417", groundStoneBg:"#34322c", groundDirtBg:"#2c2418",
    cobbleBg:     "#42454a", cobbleBgDim: "#26282b",   // main-street cobble, lit / remembered
    rampartBg:    "#23211c",   // town perimeter rampart bg
    chasm:        "#0a0a0c", chasmGlyph: "#3a3a44",    // a chasm tile bg + its dotted floor-edge glyph
    hpbarBg:      "#2a0d0a",   // the depleted track behind a creature's health pip
    lookRing:     "#f4e3a0",   // the inspect/look cursor ring
    // P3 (colour grammar) — the dungeon's SEMANTIC category hues (each means exactly one thing). Distinct
    // from the town set above. Hostile uses the existing dangerLow/Med/High severity ramp via bandColor().
    bureau:       "#4fb0d6",   // Bureau / municipal structure (cyan-blue) — the § structures
    ancient:      "#e0a83a",   // Ancient / temple stone (amber-gold)
    corruption:   "#c44fd6",   // Corruption / blight (magenta-purple)
    organic:      "#6fae54",   // Organic / fungal growth (green)
    artifact:     "#ffe9a8",   // an Artifact (bright gold-white) — the ◊
    rubble:       "#8a857c",   // rubble / debris (grey, below worked stone)
    unknownC:     "#9fb0c0"    // Unknown / unclassified (pale steel — a flicker in render)
  };
  // the category hues that the Brogue rule requires to be distinct
  var CATEGORY_KEYS = ["player", "creature", "item", "door", "signal", "critical"];

  var DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1]
  };
  function key(x, y) { return x + "," + y; }

  // ---- view helpers --------------------------------------------------------
  function visCreatures(v) { return v.creatures || []; }           // view already filters to visible
  function creatureAtV(v, x, y) { var cs = v.creatures || []; for (var i = 0; i < cs.length; i++) if (cs[i].x === x && cs[i].y === y) return cs[i]; return null; }
  function meterWarn(v) {
    var m = v.meters || {}, hg = v.hunger || { rung: 0 };
    return (hg.rung >= 2) || (m.fatigue >= 70) || (m.hp < 0.25 * (m.hpMax || 100));
  }
  // the set of "notable" tile keys currently visible (doors, plain doors, signals, items)
  function notableSet(v) {
    var s = {}, vis = {};
    (v.visible || []).forEach(function (k) { vis[k] = 1; });
    function add(map) { Object.keys(map || {}).forEach(function (k) { if (vis[k]) s[k] = 1; }); }
    add(v.doors); add(v.plain); add(v.features); add(v.items);
    return s;
  }
  function hasNew(now, base) { for (var k in now) if (!base[k]) return true; return false; }

  // =========================================================== AUTO-EXPLORE =
  // Walk toward the nearest unexplored frontier, one tile at a time, halting the
  // INSTANT anything notable appears. Never crosses a door (so never a one-way),
  // never steps onto a creature (so never starts a fight), never commits.
  function stepToFrontier(v) {
    var exp = {}; (v.explored || []).forEach(function (k) { exp[k] = 1; });
    var W = v.w, H = v.h, P = v.player;
    function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
    function floorAt(x, y) { return inb(x, y) && v.grid[y][x] === "."; }
    function pathable(x, y) {
      var k = key(x, y);
      if (!floorAt(x, y) || !exp[k]) return false;          // only known floor
      if (v.doors && v.doors[k]) return false;               // never path onto a door/stair
      if (v.plain && v.plain[k] && !v.plain[k].open) return false;
      if (creatureAtV(v, x, y)) return false;
      return true;
    }
    function isFrontier(x, y) {
      for (var d in DIRS) { var nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (inb(nx, ny) && !exp[key(nx, ny)]) return true; }
      return false;
    }
    var start = key(P.x, P.y), q = [[P.x, P.y]], seen = {}, prev = {};
    seen[start] = 1;
    while (q.length) {
      var c = q.shift(), ck = key(c[0], c[1]);
      if (ck !== start && isFrontier(c[0], c[1])) {
        var k = ck; while (prev[k] && prev[k].from !== start) k = prev[k].from;
        return prev[k] ? prev[k].dir : null;
      }
      for (var d in DIRS) {
        var nx = c[0] + DIRS[d][0], ny = c[1] + DIRS[d][1], kk = key(nx, ny);
        if (!seen[kk] && pathable(nx, ny)) { seen[kk] = 1; prev[kk] = { from: ck, dir: d }; q.push([nx, ny]); }
      }
    }
    return null;
  }

  function autoExplore(sim, opts) {
    opts = opts || {};
    var MAX = opts.max || 300;
    var v0 = sim.view();
    if (visCreatures(v0).length) return { moved: 0, stoppedBy: "creature", say: "A creature is in view; the Bureau will not have you stroll past it." };
    var startWarn = meterWarn(v0);
    var baseline = notableSet(v0);
    var moved = 0, stoppedBy = "explored";
    while (moved < MAX) {
      var v = sim.view();
      if (v.dead || v.won) { stoppedBy = "end"; break; }
      var dir = stepToFrontier(v);
      if (!dir) { stoppedBy = "explored"; break; }
      var r = sim.move(dir);
      if (!r || !r.moved) { stoppedBy = "blocked"; break; }
      moved++;
      var v2 = sim.view();
      if (visCreatures(v2).length) { stoppedBy = "creature"; break; }
      if ((v2.items || {})[key(v2.player.x, v2.player.y)]) { stoppedBy = "item"; break; }
      if (hasNew(notableSet(v2), baseline)) { stoppedBy = "notable"; break; }
      if (!startWarn && meterWarn(v2)) { stoppedBy = "meter"; break; }
    }
    return { moved: moved, stoppedBy: stoppedBy };
  }

  // =========================================================== LABELS ========
  // Every visible item / creature / door / signal gets a label, all at once.
  function labels(v) {
    var out = [], vis = {};
    (v.visible || []).forEach(function (k) { vis[k] = 1; });
    function xyOf(k) { var p = k.split(","); return { x: +p[0], y: +p[1] }; }
    Object.keys(v.items || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k); out.push({ x: p.x, y: p.y, cat: "item", text: v.items[k].name }); } });
    Object.keys(v.features || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k); out.push({ x: p.x, y: p.y, cat: "signal", text: v.features[k].label || "a notice" }); } });
    Object.keys(v.doors || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k), d = v.doors[k]; out.push({ x: p.x, y: p.y, cat: "door", text: doorLabel(d) }); } });
    Object.keys(v.plain || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k); out.push({ x: p.x, y: p.y, cat: "door", text: v.plain[k].open ? "an open inner door" : "a shut inner door" }); } });
    (v.creatures || []).forEach(function (c) { out.push({ x: c.x, y: c.y, cat: "creature", text: c.name }); });
    return out;
  }
  function doorLabel(d) {
    if (d.brass) return "the Brass Door";
    if (d.type === "stair_down") return "a stair down";
    if (d.type === "stair_up") return "a stair up";
    if (d.type === "oneway") return "a one-way stair";
    if (d.takeable === false) return "a barred door";
    return d.label || "a door";
  }

  // =========================================================== THREATS =======
  // Every creature in view, with HP and a danger severity.
  function threats(v) {
    return (v.creatures || []).filter(function (c) { return !c.friendly; }).map(function (c) {   // friendly townsfolk are not threats
      return {
        name: c.name, glyph: c.glyph, kind: c.kind, x: c.x, y: c.y,
        hp: c.hp, maxHp: c.maxHp,
        danger: c.dmg >= 14 ? "high" : c.dmg >= 9 ? "med" : "low"
      };
    });
  }

  // =========================================================== --more-- ======
  // A critical-tier message HALTS the game: input is consumed as acknowledgment
  // until every pending critical has been read. moreGate scans messages after
  // the last-acknowledged index for any urgent line.
  function moreGate(messages, ackIndex) {
    messages = messages || [];
    for (var i = Math.max(0, ackIndex | 0); i < messages.length; i++) {
      var m = messages[i];
      if (m && m.urgent) return { blocked: true, index: i, text: (m && m.text) || "" };
    }
    return { blocked: false, index: messages.length };
  }

  // =========================================================== BUREAU BARKS ==
  // The Bureau speaks during play: sparing, never-repeating, rate-limited,
  // OBJ-true one-liners reacting to real events.
  var BARK_LINES = {
    first_kill:     "The Bureau notes your first reduction of local fauna; it is recorded, not congratulated.",
    first_descent:  "You have gone down. The Bureau reminds you the deep fixtures are one-way by design.",
    famished_entry: "You arrive Famished. The Bureau does not provision those who decline to provision themselves.",
    low_hp:         "You persist below a quarter of your allotment. The Bureau admires your economy with blood.",
    lingering:      "You have lingered. Nothing is metered on this level, but the indulgence is noted."
  };
  function Barker(opts) {
    opts = opts || {};
    var cooldown = (opts.cooldown != null) ? opts.cooldown : 18;
    var fired = {}, lastTurn = -99999;
    return {
      lines: BARK_LINES,
      // attempt a bark for an event id at the given turn; returns the line or null
      react: function (id, turn) {
        if (!BARK_LINES[id] || fired[id]) return null;
        if ((turn - lastTurn) < cooldown) return null;
        fired[id] = true; lastTurn = turn;
        return BARK_LINES[id];
      },
      hasFired: function (id) { return !!fired[id]; }
    };
  }

  // E2 — classify a building by FUNCTION so its glyph can be coloured by kind
  // (civic / lodging / faith / commerce / vice). Glyph still tells the specific
  // building; colour tells the category at a glance.
  // TOWN A — five legible CATEGORIES (redundant cue: this colour + the glyph + the named sign). Glyph still
  // tells the specific building; colour tells the category at a glance. Editable.
  var BUILDING_KIND = {
    // CIVIC (slate-blue)
    bank: "civic", customs: "civic", agency: "civic", kiosk: "civic", tim: "civic", office: "civic", DUNGEON: "civic", boat: "civic",
    // FAITH (sanctified jewel tone) — GATE 1: the church is its own landmark category, not civic
    church: "faith",
    // FOOD + LODGING (amber/gold)
    tavern: "food", saloon: "food", restaurant: "food", coffee: "food", chinese: "food", hotel: "food", motel: "food",
    // VICE / RED-LIGHT (magenta) — GATE 4: the bodega moved OUT to commerce (it's an enterable shop now)
    redlit: "vice", redshop: "vice", palmreader: "vice", tattoo: "vice",   // R3: tattoo recategorised to the RLD
    // MARITIME (sea-teal)
    chandlery: "maritime", warehouse: "maritime", clamshack: "maritime", spa: "maritime"
    // everything else (store/apothecary/bodega/bookstore/fence/tailor/cobbler/barber/bakery/grocer/tattoo/blacksmith/gift…) = COMMERCE (warm tan)
  };
  var CATEGORY_COLOR = { civic: "civic", food: "food", vice: "vice", maritime: "maritime", commerce: "storefront", faith: "sanctified", lodging: "food" };
  // TOWN palette (R1) — a RESTRAINED, DESATURATED, CLOSE-VALUED municipal set: the town reads as one
  // coherent faded paint job, not a colour wheel. The GLYPH + door identify a building; this tint is only a
  // soft background cue, so categories differ SUBTLY (a hint of hue, same low value). FLAG: tones tunable.
  var TOWN_TONE = {
    civic:     "#868d96",   // faded slate (cool grey)
    commerce:  "#979080",   // faded tan (warm grey)
    food:      "#9b9484",   // faded ochre-grey
    lodging:   "#9b9484",
    vice:      "#94858f",   // greyed mauve (not crimson)
    maritime:  "#828f8c",   // greyed sea-grey
    faith:     "#8b86a0"    // greyed lavender (church still reads via its † + footprint)
  };
  function buildingCategory(id) { return BUILDING_KIND[id] || "commerce"; }   // commerce is the default frontage
  function townTone(cat) { return TOWN_TONE[cat] || TOWN_TONE.commerce; }     // TOWN — the muted tone for a category (mass tint + front glyph)
  function buildingColor(id) { return townTone(buildingCategory(id)); }       // R1: fronts now read the MUTED tone (no confetti of bright letters)
  function categoryColor(cat) { return townTone(cat); }                       // R1: building MASS tint uses the muted tone too

  // ===================================================================
  // PREMIUM-ASCII RENDERER — P1: the TILE-CELL DATA CONTRACT (DOM-free, testable).
  // play-map.html draw() will CONSUME these (P2+); no game logic lives in render.
  // Binds to REAL fields ONLY: terrain char, entity.glyph/.band/.kind/.friendly,
  // the explored/visible Sets, and REVEAL. It never invents an absent field.
  // ===================================================================

  // Glyph vocabulary ONLY for objects that currently have NO live glyph. Live glyphs
  // (bestiary creature.glyph, tenant glyphs, gen2 terrain chars) are AUTHORITATIVE and are
  // NEVER overwritten here. FLAG (collisions with live terrain chars — the LIVE char wins,
  // these premium forms are offered for a future P2 opt-in only): live stairs are "<"/">"
  // (not ▲/▼), live floor is "." (not ·), live water is "~" (draw already upglyphs it to ≈),
  // live door is "+"/"'" (matches). So ▲/▼/· here are vocabulary, not a silent reassignment.
  var RENDER_GLYPHS = {
    player: "@", doomDoor: "Ω", bureau: "§", shrine: "†", corpse: "☠", artifact: "◊",
    marker: "⚑", water: "≈", ancientWall: "▓", rubble: "▒", dust: "░",
    up: "▲", down: "▼", door: "+", floor: "·", alarm: "!", unknown: "?"
  };
  // terrain char -> semantic category (keys are the LIVE gen2/town chars; authoritative).
  var TERRAIN_CAT = {
    ".": "floor", "#": "stone", "=": "stone", "+": "door", "'": "door",
    "<": "exit", ">": "exit", "~": "water", "?": "unknown", "$": "item",
    "X": "void", "t": "nature", ":": "fence"
  };
  // CREATURE colour by THREAT BAND (1..6) — the danger signal, on the shared severity ramp the threats
  // panel uses (one meaning: severity). band derives from the REAL creature.band; family/element are NOT
  // pursued as hues this phase (they are dropped at the mapmode spawn copy — FLAG: re-expose at
  // mapmode.js:815 if family/element hues are ever wanted). Higher band = hotter = more lethal.
  function bandColor(band) {
    var b = band || 1;
    return b >= 5 ? PALETTE.dangerHigh : b >= 3 ? PALETTE.dangerMed : PALETTE.dangerLow;
  }
  // TOWN colour by tenant ACT (kiosk/agency/hotel/spa/food/shop/rest/vault/blessing/boat/flavor...).
  // Routes the act to its town CATEGORY and through the MUTED TOWN_TONE — so "derive town colour from act"
  // is satisfied WITHOUT undoing the deliberate muted-town palette (FLAG: the recent mute-the-palette
  // directive governs town saturation; the vivid grammar above is for the DUNGEON, not the town).
  var ACT_CAT = {
    kiosk: "civic", agency: "civic", vault: "civic", tim: "civic",
    hotel: "food", rest: "food", food: "food",
    spa: "maritime", boat: "maritime",
    shop: "commerce", flavor: "commerce",
    blessing: "faith"
  };
  function actCategory(act) { return ACT_CAT[act] || "commerce"; }
  function actColor(act) { return townTone(actCategory(act)); }

  // category -> { fg, bg } resolved from PALETTE (NEVER a literal hex). The colour grammar:
  // Bureau=cyan, Ancient=amber-gold, Hostile=red/orange (by band), Corruption=magenta, Organic=green,
  // Water=cyan, Stone/rubble=grey, Artifact=gold-white, Unknown=pale flicker.
  function cellColors(cat, band) {
    var P = PALETTE;
    switch (cat) {
      case "player":     return { fg: P.player, bg: null };
      case "hostile":    return { fg: bandColor(band), bg: null };
      case "npc":        return { fg: P.npc, bg: null };
      case "floor":      return { fg: P.floor, bg: P.floorBg };
      case "stone":      return { fg: P.wall, bg: null };
      case "rubble":     return { fg: P.rubble, bg: null };
      case "door":       return { fg: P.door, bg: P.doorBg };
      case "exit":       return { fg: P.door, bg: null };
      case "water":      return { fg: P.waterGlyph, bg: P.water };
      case "item":       return { fg: P.item, bg: null };
      case "artifact":   return { fg: P.artifact, bg: null };
      case "nature":     return { fg: P.nature, bg: null };
      case "organic":    return { fg: P.organic, bg: null };
      case "fence":      return { fg: P.fence, bg: null };
      case "bureau":     return { fg: P.bureau, bg: null };
      case "ancient":    return { fg: P.ancient, bg: null };
      case "corruption": return { fg: P.corruption, bg: null };
      case "unknown":    return { fg: P.unknownC, bg: null };
      case "void":       return { fg: P.voidc, bg: P.voidc };
      default:           return { fg: P.muted, bg: null };
    }
  }
  function chebyshev(ax, ay, bx, by) { var dx = Math.abs(ax - bx), dy = Math.abs(ay - by); return dx > dy ? dx : dy; }
  function inSet(s, k) { return s ? (s.has ? s.has(k) : s.indexOf(k) >= 0) : false; }   // accept a Set OR an array of keys

  // Derive ONE cell's render contract from real world state. Returns null for an
  // UNDISCOVERED cell (undiscovered = unrendered). Pure: no DOM, no globals touched.
  // o = { x, y, terrain, entity?, player:{x,y}, reveal?, explored, visible, isPlayer?, justRevealed?, lowHealth? }
  function deriveCell(o) {
    var k = key(o.x, o.y);
    if (!inSet(o.explored, k)) return null;                 // undiscovered → unrendered
    var visible = inSet(o.visible, k);
    var reveal = o.reveal || 4;
    var ent = o.entity || null, terrain = o.terrain || "";
    var cat, glyph, band = null, animState = null, entityId = null, terrainId = terrain || null;

    if (ent && visible) {                                   // an entity shows ONLY where visible (no remembered monsters)
      glyph = ent.glyph || RENDER_GLYPHS.unknown;
      if (ent.kind === "player" || o.isPlayer) { cat = "player"; animState = "pulse"; }
      else if (ent.friendly) { cat = "npc"; }
      else { cat = "hostile"; band = ent.band || 1; animState = "threat"; }
      entityId = ent.id || ent.name || ent.kind || null;
    } else {                                                // bare terrain (or a remembered, no-longer-visible cell)
      cat = TERRAIN_CAT[terrain] || (terrain ? "floor" : "unknown");
      glyph = terrain || RENDER_GLYPHS.unknown;
      if (glyph === RENDER_GLYPHS.artifact) animState = "shimmer";
      else if (glyph === RENDER_GLYPHS.doomDoor) animState = "oscillate";
      else if (glyph === RENDER_GLYPHS.corpse || glyph === RENDER_GLYPHS.dust) animState = "drift";
    }
    if (o.justRevealed) animState = "reveal";               // a tile entering memory this turn flares once
    if (cat === "player" && o.lowHealth) animState = "warn"; // the low-health warning pulse rides the player glyph

    var col = cellColors(cat, band);
    // light: 1 at the player, falling to 0 at REVEAL; a remembered (not-visible) cell is unlit (drawn dim).
    var light = visible ? Math.max(0, Math.min(1, 1 - chebyshev(o.x, o.y, o.player.x, o.player.y) / reveal)) : 0;
    var cell = { x: o.x, y: o.y, glyph: glyph, category: cat, fg: col.fg, bg: col.bg,
                 light: light, discovered: true, visible: visible, terrainId: terrainId, animState: animState };
    if (entityId != null) cell.entityId = entityId;
    if (band != null) cell.threatBand = band;
    return cell;
  }

  return {
    RENDER_GLYPHS: RENDER_GLYPHS, TERRAIN_CAT: TERRAIN_CAT, cellColors: cellColors, deriveCell: deriveCell,
    bandColor: bandColor, actColor: actColor, actCategory: actCategory,
    PALETTE: PALETTE, CATEGORY_KEYS: CATEGORY_KEYS,
    buildingCategory: buildingCategory, buildingColor: buildingColor, categoryColor: categoryColor, townTone: townTone, TOWN_TONE: TOWN_TONE,
    autoExplore: autoExplore, stepToFrontier: stepToFrontier,
    labels: labels, threats: threats, moreGate: moreGate,
    Barker: Barker, BARK_LINES: BARK_LINES,
    _meterWarn: meterWarn, _notableSet: notableSet
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_UI; }
