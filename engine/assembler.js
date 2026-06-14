// Tourist Dungeon — THE ASSEMBLER (Master Directive P2). Builds dungeon levels whose ROOMS
// ARE AUTHORED VAULTS (stamped from TD_VAULTLIB via the TD_VAULTFMT parser, variation chunks
// resolved) hung off a corridor spine — never blank rectangles.
//
//  - SPINE = a thin corridor lattice: a 1-row tooth above each band + flanking left/right
//    trunks. Circulation only; a tiny MINORITY of the floor.
//  - ROOMS are the BULK: each band is a row of AUTHORED VAULTS, selected by height tier +
//    weight and STAMPED (their walls/pillars/loot/irregular shapes are the room character),
//    placed adjacent (shared wall = spacing law), each wired to the tooth through a real door.
//
// Output (for TD_LAWS.check + the renderer):
//   { w, h, grid, tag, entry, stairs, rooms:[{name,...}], type, minRooms }
//
// LOAD ORDER (REQUIRED): rng.js, vaultfmt.js, vaultlib.js, lawsuite.js, assembler.js.
//   The assembler PARSES + STAMPS authored vaults, so it HARD-DEPENDS on TD_VAULTFMT and
//   TD_VAULTLIB. Without them generate() THROWS (it used to return null silently — which read
//   as "0/60, generates nothing" in a harness that forgot the deps). TD_LAWS is needed only by
//   the gated entry points (generateGated / generateForLevel).
// Classic script: assigns global TD_ASSEMBLER.
"use strict";

var TD_ASSEMBLER = (function () {

  // bandH (room height between teeth) is decoupled from room WIDTH so "large rooms" = wide,
  // not tall — bandH sets coverage, kept so L3 lands in 35-55%. Each band = a WINDING tooth
  // (2 rows: sr, sr+1) + gutter + bandH room rows + gutter, so sweepGap = bandH + 4.
  var BUNDLES = {
    STANDARD: { w: 49, h: 35, tiers: [5, 6, 7], loops: [3, 4], minRooms: 10, trunkW: 2 },
    WARREN:   { w: 47, h: 33, tiers: [5, 6, 7], loops: [3, 5], minRooms: 8, trunkW: 1 },
    HALLS:    { w: 53, h: 37, tiers: [6, 7], loops: [2, 3], minRooms: 6, trunkW: 2 }
  };
  var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // ---- TYPE STANDARD parameters + per-level DRIFT (Dungeon Type STANDARD v1). paramsFor
  // rolls a drift band per (seed, level) — 50% base / 20% ±5% / 20% ±10% / 10% ±15% — and
  // jitters each numeric knob within it, yielding the level's TARGET BAND. The gate validates
  // each level against THIS band (a +15% outlier is sanctioned, not a failure). ----
  var STANDARD_BASE = { roomMin: 10, roomMax: 20, sizeSpreadMax: 3, regularMax: 0.50, straightMax: 0.30, corridorMin: 0.20, deadEndsMin: 1, secretsMin: 3, loopsMin: 1 };
  function _h(a, b, c) { var h = (a >>> 0) ^ 0x9e3779b9; h = Math.imul(h ^ (b >>> 0), 16777619) >>> 0; h = Math.imul(h ^ ((c || 0) >>> 0), 16777619) >>> 0; return h >>> 0; }
  function driftBandOf(seed, level) { var r = (_h(seed, level, 7) % 1000) / 1000; return r < 0.5 ? 0 : (r < 0.7 ? 0.05 : (r < 0.9 ? 0.10 : 0.15)); }
  function paramsFor(seed, level) {
    var band = driftBandOf(seed, level), rng = TD_RNG.make(_h(seed, level, 13) || 1);
    function roll() { return (rng.next() * 2 - 1) * band; }                  // signed jitter in [-band, +band]
    function cl(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    var B0 = STANDARD_BASE;
    return {
      drift: band,
      roomMin: B0.roomMin,                                                    // hard floor — never drifts below 10
      roomMax: Math.max(B0.roomMin, Math.round(B0.roomMax * (1 + roll()))),
      sizeSpreadMax: B0.sizeSpreadMax,
      regularMax: cl(B0.regularMax * (1 + roll()), 0.20, 0.80),
      straightMax: cl(B0.straightMax * (1 + roll()), 0.12, 0.50),
      corridorMin: cl(B0.corridorMin * (1 + roll()), 0.12, 0.35),
      deadEndsMin: B0.deadEndsMin,
      secretsMin: Math.max(1, Math.round(B0.secretsMin * (1 + roll()))),
      loopsMin: B0.loopsMin
    };
  }

  function generate(seed, typeName) {
    var B = BUNDLES[typeName] || BUNDLES.STANDARD;
    var rng = TD_RNG.make(((seed >>> 0) ^ 0x1a2b3c4d) || 1);
    var W = B.w, H = B.h, grid = [], tag = [];
    for (var y = 0; y < H; y++) { var gr = [], tr = []; for (var x = 0; x < W; x++) { gr.push("#"); tr.push("wall"); } grid.push(gr); tag.push(tr); }
    function inb(x, y) { return x >= 1 && y >= 1 && x < W - 1 && y < H - 1; }
    function walk(x, y) { return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== "#"; }
    function setc(x, y, g, t) { grid[y][x] = g; tag[y][x] = t; }
    function carveC(x, y) { if (inb(x, y) && grid[y][x] === "#") setc(x, y, ".", "corridor"); }

    var corridorCells = [];
    function push(x, y) { corridorCells.push([x, y]); }

    // THE WIRE-IN: rooms ARE authored vaults. The assembler PARSES the vault library
    // (TD_VAULTLIB via TD_VAULTFMT) and STAMPS a selected vault into each room slot, resolving
    // its variation chunks — it never draws a blank rectangle. The spine (winding teeth + a thin
    // trunk) is circulation ONLY; the rooms' character (pillars, irregular walls, loot, secret
    // caches) comes entirely from the authored vaults.
    if (typeof TD_VAULTFMT === "undefined" || typeof TD_VAULTLIB === "undefined")
      throw new Error("TD_ASSEMBLER needs TD_VAULTFMT (vaultfmt.js) + TD_VAULTLIB (vaultlib.js) loaded BEFORE assembler.js. Load order: rng.js, vaultfmt.js, vaultlib.js, lawsuite.js, assembler.js.");
    var POOL = TD_VAULTLIB.all(), trunkW = B.trunkW || 2, TIERS = B.tiers || [5, 6, 7];

    // vault tag -> the assembler/law vocabulary. Walkable: room/door/stair/feature; else wall
    // (a pillar 'o' and a secret-cache '?' are authored rock inside the room — they render as #).
    function mapTag(t) {
      if (t === "floor" || t === "loot" || t === "landmark") return "room";   // $/G are floor here (room); their CONTENT is a runtime concern. Keeping them "room" preserves room connectivity, so a $/G in a pillared vault's middle row doesn't split its floor into doorless sub-regions (D1/L11).
      if (t === "water") return "feature";
      if (t === "door") return "door";
      if (t === "stair") return "stair";
      return "wall";                                                          // wall, pillar (o), secret cache (?) -> authored rock, renders as #
    }
    // a WINDING tooth in rows [sr, sr+1] running trunk-to-trunk: horizontal runs of <=3 then a
    // 1-cell vertical jog, so corridor straight-runs stay <=30% (no straight filing-cabinet lane).
    function windTooth(sr) {
      var up = sr, low = sr + 1, x = 1, row = up;
      carveC(x, row); push(x, row);
      while (x < W - 2) {
        var lim = Math.min(2, (W - 2) - x);
        for (var k = 0; k < lim; k++) { x++; carveC(x, row); push(x, row); }
        if (x < W - 2) { row = (row === up) ? low : up; carveC(x, row); push(x, row); }
      }
      carveC(W - 2, row); push(W - 2, row);
    }
    function weightedPick(cands) {
      var tot = 0, i; for (i = 0; i < cands.length; i++) tot += (cands[i].weight || 10);
      var r = rng.int(0, tot - 1), acc = 0;
      for (i = 0; i < cands.length; i++) { acc += (cands[i].weight || 10); if (r < acc) return cands[i]; }
      return cands[cands.length - 1];
    }
    function isSecretVault(v) { return v.tags && v.tags.indexOf("secret") >= 0; }
    // stamp a resolved vault at (ox, oy). asCache => a hidden CACHE: its interior is tagged
    // "feature" (not "room"), so a tiny secret vault is content behind a secret door, not a
    // room that would trip L8/L11. Returns the placed record (name + bbox + interior cells).
    function stampVault(v, ox, oy, pseed, asCache) {
      var r = TD_VAULTFMT.resolve(v, pseed), floor = [];
      for (var yy = 0; yy < r.h; yy++) for (var xx = 0; xx < r.w; xx++) {
        var gx = ox + xx, gy = oy + yy;
        if (!(gx >= 1 && gy >= 1 && gx < W - 1 && gy < H - 1)) continue;
        var mt = mapTag(r.tags[yy][xx]);
        if (asCache && mt === "room") mt = "feature";
        setc(gx, gy, r.grid[yy][xx], mt);
        if (mt === "room" || (asCache && mt === "feature")) floor.push([gx, gy]);
      }
      return { name: v.name, x0: ox, y0: oy, x1: ox + r.w - 1, y1: oy + r.h - 1, floor: floor, vault: v, cache: !!asCache };
    }
    // connect a CACHE up to the tooth via a SECRET door (telegraphed at runtime) above a feature
    // cell — the Secret Grammar / Purpose law: secret content reached only through a secret.
    function connectCache(p) {
      var bTop = p.y0, tRow = bTop - 1, dcol = -1, x;
      for (x = p.x0 + 1; x <= p.x1 - 1; x++) if (grid[bTop][x] === "#" && tag[bTop + 1] && tag[bTop + 1][x] === "feature") { setc(x, bTop, ".", "secret"); dcol = x; break; }
      if (dcol < 0) return false;
      if (grid[tRow][dcol] === "#") { setc(dcol, tRow, ".", "corridor"); push(dcol, tRow); }
      p.cx = dcol; p.cy = bTop + 1; return true;
    }
    // connect a stamped vault UP to the tooth directly above its top wall (tRow = p.y0 - 1). The
    // connect door must sit above a ROOM cell (so the room component owns a door onto a corridor,
    // D1) — never above a feature/pillar. Prefer an authored top-edge door; else punch one.
    function connectUp(p) {
      var bTop = p.y0, tRow = bTop - 1, dcol = -1, x;
      for (x = p.x0 + 1; x <= p.x1 - 1; x++) if (tag[bTop][x] === "door" && tag[bTop + 1] && tag[bTop + 1][x] === "room") { dcol = x; break; }
      if (dcol < 0) for (x = p.x0 + 1; x <= p.x1 - 1; x++) if (grid[bTop][x] === "#" && tag[bTop + 1] && tag[bTop + 1][x] === "room") { setc(x, bTop, ".", "door"); dcol = x; break; }
      if (dcol < 0) return false;                             // no room cell under the top wall (rejected upstream)
      if (grid[tRow][dcol] === "#") { setc(dcol, tRow, ".", "corridor"); push(dcol, tRow); }   // ensure the tooth meets the door
      p.cx = dcol; p.cy = bTop + 1; return true;
    }
    // seal every door that does NOT open onto walkable cells on both sides, so each surviving
    // door is a clean through-passage (L4). Run to a FIXPOINT over ALL doors: sealing a dangling
    // door can strand its neighbour door, so one pass is not enough. Connect doors survive (their
    // tooth-corridor side is never a door, so they stay through). Adjacent vaults whose facing
    // edge doors line up also stay open — a free authored room<->room link.
    function sealDoorsFixpoint() {
      var changed = true;
      while (changed) {
        changed = false;
        for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
          if (tag[y][x] === "door") {
            var thru = (walk(x - 1, y) && walk(x + 1, y)) || (walk(x, y - 1) && walk(x, y + 1));
            if (!thru) { setc(x, y, "#", "wall"); changed = true; }
          }
        }
      }
    }

    // ---- SPINE + VAULT BANDS (top-down). Each band is a 1-row tooth + a row of authored vaults
    // (height == a vault tier, so they fit exactly), placed ADJACENT (shared wall = spacing law).
    // The tooth sits directly above the vaults; the next tooth sits directly below, so an S-edge
    // door auto-links a vault to the band below (an authored loop). Two flanking trunks (left,
    // right) face the side borders and stitch every tooth together. ----
    var rooms = [], lastBot = 0, y = 1;
    while (y + 2 + TIERS[0] <= H - 1) {
      var tRow = y; windTooth(tRow);                           // 2-row winding tooth (rows tRow, tRow+1)
      var bTop = tRow + 2, rem = (H - 2) - bTop;               // vaults sit below the 2-row tooth
      var tier = TIERS[rng.int(0, TIERS.length - 1)];
      while (tier > rem && tier > TIERS[0]) tier--;
      if (tier > rem) break;
      var bBot = bTop + tier - 1, ox = 2;                      // x=1 left trunk; vault left wall at x=2
      while (ox < W - 3) {
        var maxW = (W - 2) - ox;                               // leave x=W-2 for the right trunk
        // occasionally drop a SECRET CACHE (tiny secret vault) instead of a room — only in a
        // tier-5 band so its 4-tall body leaves just one faced row below (no buried rock).
        var wantCache = rng.chance(0.30) && tier === 5;
        var cands = wantCache
          ? POOL.filter(function (v) { return isSecretVault(v) && v.w <= maxW && v.h <= tier; })
          : POOL.filter(function (v) { return v.h === tier && v.w <= maxW && !isSecretVault(v); });
        if (wantCache && !cands.length) { wantCache = false; cands = POOL.filter(function (v) { return v.h === tier && v.w <= maxW && !isSecretVault(v); }); }
        if (!cands.length) break;
        var v = weightedPick(cands);
        var p = stampVault(v, ox, bTop, (seed >>> 0) + ox * 131 + tRow * 17 + 1, wantCache);
        var ok = wantCache ? connectCache(p) : connectUp(p);
        if (ok) { rooms.push(p); if (!wantCache) lastBot = bBot; }   // only keep a vault we could wire to the spine
        ox = p.x1 + 1;                                         // next vault shares the boundary wall
      }
      y = bBot + 1;                                            // next tooth sits directly below this band's bottom wall
    }
    if (rooms.length < 4) return null;
    if (lastBot < H - 4) windTooth(H - 3);                     // bottom winding tooth faces the lower border
    for (var ty = 1; ty <= H - 2; ty++) {
      carveC(1, ty); if (tag[ty][1] === "corridor") push(1, ty);                                  // left trunk (faces the left border)
      carveC(W - 2, ty); if (tag[ty][W - 2] === "corridor") push(W - 2, ty);                      // right trunk (faces the right border)
    }
    sealDoorsFixpoint();                                       // now all corridors exist: seal dangling authored doors

    // ---- DEAD ENDS earn it: any corridor cell that is a dead-end gets a feature (D2). ----
    function walkN(x, y) { var n = 0; for (var i = 0; i < 4; i++) if (walk(x + D4[i][0], y + D4[i][1])) n++; return n; }
    corridorCells.forEach(function (c) {
      if (grid[c[1]][c[0]] === "." && tag[c[1]][c[0]] === "corridor" && walkN(c[0], c[1]) === 1) {
        var legit = false; for (var i = 0; i < 4; i++) { var t = tag[c[1] + D4[i][1]][c[0] + D4[i][0]]; if (t === "door" || t === "feature" || t === "secret" || t === "stair") legit = true; }
        if (!legit) setc(c[0], c[1], ".", "feature");
      }
    });

    // ---- STAIRS: up + down placed inside two authored vaults. The stair cell is retagged from
    // "room", so it must be a LEAF (fewest room neighbours) — never a bridge whose removal would
    // split a pillared vault into a doorless/tiny sub-region (D1/L11). ----
    function safeStairCell(p) {
      var best = null, bestDeg = 9;
      for (var k = 0; k < p.floor.length; k++) {
        var c = p.floor[k]; if (c[0] === p.cx && c[1] === p.cy) continue;     // not the connect-door's room cell
        var deg = 0; for (var d = 0; d < 4; d++) if (tag[c[1] + D4[d][1]] && tag[c[1] + D4[d][1]][c[0] + D4[d][0]] === "room") deg++;
        if (deg < bestDeg) { bestDeg = deg; best = c; }
      }
      return best || (p.floor.length ? p.floor[0] : null);
    }
    var stairs = [];
    var normalRooms = rooms.filter(function (r) { return !r.cache; });          // stairs live in rooms, never in hidden caches
    var upR = normalRooms[0], dnR = normalRooms[normalRooms.length - 1];
    var u = upR && safeStairCell(upR); if (u) { setc(u[0], u[1], ".", "stair"); stairs.push({ x: u[0], y: u[1], kind: "up", hidden: false }); }
    var dn = dnR && safeStairCell(dnR); if (dn) { setc(dn[0], dn[1], ".", "stair"); stairs.push({ x: dn[0], y: dn[1], kind: "down", hidden: rng.chance(0.4) }); }

    return { w: W, h: H, grid: grid, tag: tag, entry: { x: corridorCells[0][0], y: corridorCells[0][1] }, stairs: stairs, rooms: rooms, type: typeName || "STANDARD", minRooms: B.minRooms };
  }

  // generateForLevel — the DRIFT gate in action: produce a STANDARD level that passes BOTH the
  // spatial laws (L1-L11/D1-D4) AND its own drifted target band (paramsFor(seed,level)). Each
  // retry reseeds, so the generator's natural variance (room sizes, zigzag, loops) explores the
  // space until a map lands inside the level's band. Returns the best-effort map if none fully
  // conform within the attempt budget (with .passed=false and the failing checks).
  function generateForLevel(seed, level, typeName, attempts) {
    attempts = attempts || 160;
    var t = paramsFor(seed, level), best = null, bestScore = -1;
    for (var i = 0; i < attempts; i++) {
      var m = generate((seed >>> 0) * 1009 + (level >>> 0) * 31 + i + 1, typeName || "STANDARD");
      if (!m) continue;
      var v = (typeof TD_LAWS !== "undefined") ? TD_LAWS.check(m) : { pass: true, laws: {} };
      if (!v.pass) continue;
      var c = TD_LAWS.conformsType(m, t);
      if (c.pass) return { map: m, laws: v.laws, type: c, band: t, attempt: i + 1, passed: true };
      var score = Object.keys(c.checks).filter(function (k) { return c.checks[k].pass; }).length;
      if (score > bestScore) { bestScore = score; best = { map: m, laws: v.laws, type: c, band: t, attempt: i + 1, passed: false }; }
    }
    return best;
  }

  function generateGated(seed, typeName, attempts) {
    attempts = attempts || 80;
    var best = null, bestPass = -1;
    for (var i = 0; i < attempts; i++) {
      var m = generate(seed * 1009 + i, typeName);
      if (!m) continue;
      var v = (typeof TD_LAWS !== "undefined") ? TD_LAWS.check(m) : { pass: true, laws: {} };
      if (v.pass) return { map: m, laws: v.laws, attempt: i + 1, passed: true };
      var np = Object.keys(v.laws).filter(function (k) { return v.laws[k].pass; }).length;
      if (np > bestPass) { bestPass = np; best = { map: m, laws: v.laws, attempt: i + 1, passed: false }; }
    }
    return best;
  }

  return { generate: generate, generateGated: generateGated, generateForLevel: generateForLevel, BUNDLES: BUNDLES, paramsFor: paramsFor, driftBandOf: driftBandOf, STANDARD_BASE: STANDARD_BASE };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_ASSEMBLER; }
