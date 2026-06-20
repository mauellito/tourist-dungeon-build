// Tourist Dungeon — tests/sim.js : the HEADLESS BALANCE SIM (Gate 1). Drives the pure
// TD_RESOLVE core over N runs of the smash-and-grab loop under bracketed POLICIES and prints a
// per-policy distribution: win-rate, time-to-kill, death-cause, loot-per-life. Turns "play an hour
// and guess" into "read the distribution in seconds." It MEASURES the extracted numbers — it does
// not change any of them.
//
// Runtime-agnostic: under Node it `require`s the engine modules and runs as a CLI
// (`node tests/sim.js [N] [seed]`); in a browser / headless-Chrome the engine globals are already
// present (tests/run_sim.py injects them) and it exposes TD_SIM.{runAll,format}.
//
// SIM ASSUMPTIONS (modeling knobs, NOT game tuning): the en-route combat gauntlet — how many foes
// you meet and the player HP pool — is a sim overlay so the combat death-cause is populated; it uses
// the real TD_RESOLVE combat numbers. Documented here so it is never mistaken for balance data.
"use strict";

(function () {
  var R, RNG;
  if (typeof TD_RESOLVE !== "undefined") { R = TD_RESOLVE; RNG = TD_RNG; }
  else { R = require("../engine/resolve.js"); RNG = require("../engine/rng.js"); }

  var SIM = { PLAYER_HP: 100, MAX_FOES: 5, FOE_CHANCE: 0.35 };   // sim overlay (see header)
  var POLICIES = ["greedy", "cautious", "random"];

  // BFS toward the exit avoiding walls/chasm and (live) rubble — recomputed each step as it spreads
  function stepToward(S, tx, ty) {
    var L = R.SG.layout, D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var q = [[S.player.x, S.player.y]], seen = {}, prev = {}; seen[S.player.x + "," + S.player.y] = 1;
    while (q.length) {
      var c = q.shift();
      if (c[0] === tx && c[1] === ty) { var k = tx + "," + ty; while (prev[k] && prev[k].f !== S.player.x + "," + S.player.y) k = prev[k].f; return prev[k] ? prev[k].d : null; }
      for (var d in D) {
        var nx = c[0] + D[d][0], ny = c[1] + D[d][1], kk = nx + "," + ny, ch = L.baseTile(nx, ny);
        if (seen[kk] || ch === "#" || ch === "~" || R.SG.rubble(S, nx, ny)) continue;
        seen[kk] = 1; prev[kk] = { f: c[0] + "," + c[1], d: d }; q.push([nx, ny]);
      }
    }
    return null;   // boxed in by rubble
  }
  function flee(S) {
    var L = R.SG.layout, guard = 0;
    while (!R.SG.over(S) && guard++ < 400) {
      var dir = stepToward(S, L.EXIT.x, L.EXIT.y);
      if (!dir) { S.dead = true; S.swallowed = true; break; }   // the collapse boxed you in
      R.SG.move(S, dir);
    }
  }

  // one run under a policy: loot -> grab artifact (trip) -> fight the gauntlet (costs time) -> flee
  function oneRun(rng, policy) {
    var S = R.SG.newState(); S.active = true; var T = R.SG.TUNE;
    var treas = S.treas.slice().sort(function (a, b) { return b.value - a.value; });
    var chosen;
    if (policy === "greedy") chosen = treas;
    else if (policy === "cautious") chosen = treas.slice(0, Math.floor(T.SPRINT_THRESHOLD / T.WEIGHT_PER_TREASURE));  // grab only while sprint stays safe
    else chosen = treas.filter(function () { return rng.chance(0.5); });   // random
    chosen.forEach(function (t) { S.player.x = t.x; S.player.y = t.y; R.SG.get(S); });
    var a = S.arts[0]; S.player.x = a.x; S.player.y = a.y; R.SG.get(S);   // grab the artifact -> trips collapse + slab

    // en-route combat gauntlet (faithful TD_RESOLVE math; sim decides how many foes)
    var kinds = Object.keys(R.COMBAT.CREATURES), n = 0, rounds = 0, hpLost = 0, kills = 0;
    for (var i = 0; i < SIM.MAX_FOES; i++) if (rng.chance(SIM.FOE_CHANCE)) n++;
    for (var c = 0; c < n; c++) {
      var cr = R.COMBAT.CREATURES[rng.pick(kinds)];
      var rk = R.ttk(cr.hp, R.COMBAT.PLAYER_DMG);     // turns to kill at fixed player damage
      rounds += rk; hpLost += (rk - 1) * cr.dmg; kills++;   // it lands (rk-1) blows before you finish it
    }
    var cause, loot = 0;
    if (hpLost >= SIM.PLAYER_HP) { cause = "combat"; }      // the gauntlet killed you
    else {
      S.doorClosed += rounds;                               // time spent fighting lets both threats gain
      flee(S);
      cause = S.escaped ? "escape" : (S.swallowed ? "collapse" : "slab");
      if (S.escaped) loot = S.score;
    }
    return { cause: cause, loot: loot, kills: kills, rounds: rounds, ttk: kills ? rounds / kills : null };
  }

  function median(xs) { if (!xs.length) return 0; var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : 0; }

  function runPolicy(policy, N, seed) {
    var rng = RNG.make(seed), runs = [];
    for (var i = 0; i < N; i++) runs.push(oneRun(rng, policy));
    var wins = runs.filter(function (r) { return r.cause === "escape"; }).length;
    var ttks = runs.filter(function (r) { return r.ttk != null; }).map(function (r) { return r.ttk; });
    var cause = { collapse: 0, slab: 0, combat: 0 };
    runs.forEach(function (r) { if (r.cause !== "escape") cause[r.cause]++; });
    return {
      policy: policy, N: N, wins: wins, winRate: wins / N,
      ttkMean: mean(ttks), ttkMedian: median(ttks),
      death: cause, lootPerLife: mean(runs.map(function (r) { return r.loot; }))
    };
  }

  function runAll(opts) {
    opts = opts || {}; var N = opts.N || 1000, seed = (opts.seed == null ? 1234 : opts.seed) >>> 0;
    var byPolicy = {}; POLICIES.forEach(function (p) { byPolicy[p] = runPolicy(p, N, seed); });
    return { N: N, seed: seed, sim: SIM, policies: byPolicy, flags: flagsFor(byPolicy) };
  }

  // R3: expose the numbers, don't judge — auto-flag degenerate signals
  function flagsFor(bp) {
    var f = [];
    POLICIES.forEach(function (p) {
      var r = bp[p];
      if (r.winRate > 0.95) f.push(p + ": win-rate " + pct(r.winRate) + " > 95% (trivial)");
      if (r.winRate < 0.05) f.push(p + ": win-rate " + pct(r.winRate) + " < 5% (unwinnable)");
      var deaths = r.N - r.wins;
      if (deaths > 0) ["collapse", "slab", "combat"].forEach(function (k) {
        if (r.death[k] / deaths > 0.70) f.push(p + ": " + pct(r.death[k] / deaths) + " of deaths are " + k + " (>70%, one-note)");
      });
    });
    var g = bp.greedy, c = bp.cautious;
    if (Math.abs(g.winRate - c.winRate) < 0.05 && Math.abs(g.lootPerLife - c.lootPerLife) < 0.05 * (c.lootPerLife || 1))
      f.push("greed-doesn't-matter: greedy ≈ cautious (win-rate & loot within 5%)");
    return f;
  }

  function pct(x) { return (x * 100).toFixed(1) + "%"; }
  function pad(s, n) { s = "" + s; while (s.length < n) s += " "; return s; }
  function padL(s, n) { s = "" + s; while (s.length < n) s = " " + s; return s; }

  function format(res) {
    var L = [];
    L.push("TOURIST DUNGEON — headless balance sim   (N=" + res.N + " per policy, seed=" + res.seed + ")");
    L.push("sim overlay: PLAYER_HP=" + res.sim.PLAYER_HP + "  foes 0.." + res.sim.MAX_FOES + " @ p=" + res.sim.FOE_CHANCE + "  (combat uses real TD_RESOLVE numbers)");
    L.push("");
    L.push(pad("policy", 10) + padL("win%", 8) + padL("TTK(md)", 9) + padL("collapse", 10) + padL("slab", 8) + padL("combat", 8) + padL("loot/life", 11));
    L.push(new Array(64).join("-"));
    POLICIES.forEach(function (p) {
      var r = res.policies[p], deaths = r.N - r.wins || 1;
      L.push(pad(p, 10) + padL(pct(r.winRate), 8) + padL(r.ttkMedian.toFixed(1), 9)
        + padL(pct(r.death.collapse / deaths), 10) + padL(pct(r.death.slab / deaths), 8)
        + padL(pct(r.death.combat / deaths), 8) + padL("$" + r.lootPerLife.toFixed(1), 11));
    });
    L.push(new Array(64).join("-"));
    L.push("(collapse/slab/combat are shares of that policy's DEATHS; loot/life averages over all runs)");
    L.push("");
    if (res.flags.length) { L.push("DEGENERACY FLAGS:"); res.flags.forEach(function (x) { L.push("  ⚑ " + x); }); }
    else L.push("DEGENERACY FLAGS: none — distribution looks non-degenerate.");
    return L.join("\n");
  }

  // ===================== THE NEW COMBAT MODEL (gear + two-function + encumbrance) =====================
  // MEASURE only. Runs the 3 policies through the REAL TD_RESOLVE.hit()/damage()/read() + TD_BURDEN,
  // gear from the roster: greed grabs coin -> heavier -> worse evasion + slower tempo -> caught more.
  // SIM OVERLAY (placeholder modeling knobs, NOT balance data): player stat block, the foe gauntlet,
  // coin drop per kill, and the band->evasion / band->tempo mappings. Real numbers are in TD_RESOLVE.
  // SIM OVERLAY knobs (placeholder modeling assumptions, NOT game numbers): the foe gauntlet, the
  // per-kill loot drop, and the band->evasion / band->tempo mappings (the live band->evasion is the
  // descent-slice's job; this stands in for it so the instrument can exercise the encumbrance path).
  // CALIBRATION R0: the floor model is SOURCED FROM TD_GEN2 (the live floor), never a hardcoded snapshot.
  // Per run we draw a real gen2 'worked' 54x34 floor, measure its walkable cells, and derive the foe
  // count + coin loot from the SAME live densities the game spawns with (TD_MAP.CREATURE_DENSITY /
  // COIN_DENSITY / COIN_GOLD_*). So the sim can't go stale when the floor changes again.
  var SIM_C = {
    PLAYER_STATS: { might: 560, dex: 560, con: 560, int: 500, per: 560, lucky: 500, intuition: 560, appearance: 500, charm: 500, grit: 540 },
    CAUTIOUS_CAP: "laden",                                       // cautious stops short of this band (stays light)
    ENC_EVASION: { unencumbered: 0, laden: 2, strained: 5, overloaded: 9 },   // band -> extra evasion-dulling (placeholder)
    ENC_TEMPO:   { unencumbered: 0, laden: 0, strained: 1, overloaded: 2 },   // band -> extra foe blows (slower) (placeholder)
    FLOOR_POOL: 120                                              // gen2 'worked' floors sampled for the walkable distribution
  };
  var B = (typeof TD_BURDEN !== "undefined") ? TD_BURDEN : (typeof require !== "undefined" ? require("../engine/burden.js") : null);

  // ----- LIVE FLOOR MODEL (sourced from gen2 + mapmode densities; single source of truth) -----
  function liveDensities() {
    var MAP = (typeof TD_MAP !== "undefined") ? TD_MAP : (typeof require !== "undefined" ? require("../engine/mapmode.js") : null);
    if (!MAP || typeof MAP.CREATURE_DENSITY !== "number" || !MAP.COIN_MIX) throw new Error("balance sim needs TD_MAP densities + COIN_MIX — load engine/mapmode.js");
    return { creature: MAP.CREATURE_DENSITY, coin: MAP.COIN_DENSITY, mix: MAP.COIN_MIX };
  }
  // roll a floor's coin as DENOMINATION heaps from the live COIN_MIX (same distribution mapmode spawns).
  function rollHeaps(rng, nHeaps, mix) {
    var tot = 0; mix.forEach(function (m) { tot += m.weight; });
    var heaps = [];
    for (var i = 0; i < nHeaps; i++) {
      var r = rng.int(1, tot), acc = 0, pick = mix[mix.length - 1];
      for (var j = 0; j < mix.length; j++) { acc += mix[j].weight; if (r <= acc) { pick = mix[j]; break; } }
      heaps.push({ den: pick.den, count: rng.int(pick.min, pick.max) });
    }
    return heaps;
  }
  // live walkable = cells that become "." in composeNodeGen2 (wall/pillar 'o', chasm 'X', water '~' excluded —
  // matching mapmode.walkableCount which counts only ".").
  function gen2Walkable(grid) { var skip = { "#": 1, "o": 1, "X": 1, "~": 1 }, n = 0; for (var y = 0; y < grid.length; y++) { var row = grid[y]; for (var x = 0; x < row.length; x++) if (!skip[row[x]]) n++; } return n; }
  var _floorPool = null;
  function floorPool() {
    if (_floorPool) return _floorPool;
    var GEN2 = (typeof TD_GEN2 !== "undefined") ? TD_GEN2 : (typeof require !== "undefined" ? require("../engine/gen2.js") : null);
    if (!GEN2) throw new Error("balance sim needs TD_GEN2 — load engine/gen2.js");
    var pool = [];                                                // fixed seeds 1..POOL -> deterministic, captures per-floor variation
    for (var s = 1; s <= SIM_C.FLOOR_POOL; s++) { var lvl = GEN2.generateLevel(s, { grammar: "worked" }); pool.push({ w: gen2Walkable(lvl.grid), area: lvl.w * lvl.h, W: lvl.w, H: lvl.h }); }
    _floorPool = pool; return pool;
  }
  function creatureFighter(kind) {
    var c = R.COMBAT.CREATURES[kind];   // synthesize a stat block from the bestiary hp/dmg (PLACEHOLDER sim mapping)
    return {
      kind: kind, hp: c.hp,
      stats: { might: 380 + c.dmg * 14, dex: 470, con: 320 + c.hp * 6, int: 300, per: 420, lucky: 500, intuition: 380, appearance: 400, charm: 300, grit: 420 },
      weapon: { name: c.name, type: "blade", base: c.dmg, acc: 0 },
      armor: R.GEAR.ARMOR.light
    };
  }
  function oneCombatRun(rng, policy, dens, pool) {
    var ps = SIM_C.PLAYER_STATS, pw = R.GEAR.WEAPONS.longsword, pa = R.GEAR.ARMOR.light;
    var php = (typeof TD_STATS !== "undefined") ? TD_STATS.DERIVED.hpMax(ps) : 100;
    var purse = { copper: 0, silver: 0, gold: 0 }, carried = [pw];   // armour's encumbrance is intrinsic (applied to evasion); loot weight is the burden
    var patk = { stats: ps, weapon: pw, armor: pa };
    var kinds = Object.keys(R.COMBAT.CREATURES);
    // SOURCE the floor from gen2: a real 'worked' 54x34 floor's walkable count -> the LIVE densities.
    var floor = pool[rng.int(0, pool.length - 1)], walk = floor.w;
    var nFoes = Math.round(walk * dens.creature);                              // live spawnCreatures density (max(1,..) is moot at this size)
    var heaps = rollHeaps(rng, Math.round(walk * dens.coin), dens.mix);        // live spawnCoins: DENOMINATION heaps
    // policy decides which heaps to pocket: greedy hoovers ALL (bulk -> weight); cautious takes only the
    // high-value-low-weight GOLD (stays light); random takes ~half. Coins go to the purse BY DENOMINATION.
    function grab(h) { return policy === "greedy" ? true : policy === "cautious" ? (h.den === "gold") : rng.chance(0.5); }
    var rounds = 0, kills = 0, dead = false;
    for (var f = 0; f < nFoes && !dead; f++) {
      var cr = creatureFighter(rng.pick(kinds)), chp = cr.hp;
      var band = B ? B.compute(ps, carried, purse).band.key : "unencumbered";   // accrued purse weight bites THIS fight
      var enc = SIM_C.ENC_EVASION[band] || 0, tempo = SIM_C.ENC_TEMPO[band] || 0;
      var pdef = { stats: ps, weapon: pw, armor: { name: pa.name, robustness: pa.robustness, encumbrance: pa.encumbrance + enc } };
      var guard = 0;
      while (chp > 0 && !dead && guard++ < 60) {
        if (R.hit(patk, cr, rng).hit) chp -= R.damage(patk, cr, rng).damage;     // player swings
        rounds++;
        if (chp <= 0) { kills++; break; }
        for (var t = 0; t <= tempo && !dead; t++) {                              // foe swings (+ tempo extra when you're slow)
          if (R.hit(cr, pdef, rng).hit) { php -= R.damage(cr, pdef, rng).damage; if (php <= 0) dead = true; }
        }
      }
      if (!dead) {                                                               // pocket this stretch of the floor's coin heaps
        for (var hi = f; hi < heaps.length; hi += (nFoes || 1)) { var h = heaps[hi]; if (grab(h)) purse[h.den] += h.count; }
      }
    }
    var win = !dead, loot = win && B ? B.purseValue(purse) : 0;
    var endBand = B ? B.compute(ps, carried, purse).band.key : "unencumbered";
    return { cause: dead ? "combat" : "survive", win: win, loot: loot, ttk: kills ? rounds / kills : null, kills: kills, walk: walk, nFoes: nFoes, band: endBand };
  }
  function runCombatPolicy(policy, N, seed, dens, pool) {
    var rng = RNG.make(seed), runs = [];
    for (var i = 0; i < N; i++) runs.push(oneCombatRun(rng, policy, dens, pool));
    var wins = runs.filter(function (r) { return r.win; }).length;
    var ttks = runs.filter(function (r) { return r.ttk != null; }).map(function (r) { return r.ttk; });
    return { policy: policy, N: N, wins: wins, winRate: wins / N, ttkMean: mean(ttks), ttkMedian: median(ttks),
      death: { combat: N - wins }, lootPerLife: mean(runs.map(function (r) { return r.loot; })),
      avgWalk: mean(runs.map(function (r) { return r.walk; })), avgFoes: mean(runs.map(function (r) { return r.nFoes; })) };
  }
  function runCombat(opts) {
    opts = opts || {}; var N = opts.N || 1000, seed = (opts.seed == null ? 1234 : opts.seed) >>> 0;
    var dens = liveDensities(), pool = floorPool();
    var poolW = pool.map(function (p) { return p.w; }), poolArea = pool[0] ? pool[0].area : 0;
    var floorMeta = { W: pool[0] ? pool[0].W : 0, H: pool[0] ? pool[0].H : 0, area: poolArea, avgWalk: mean(poolW), walkPct: poolArea ? mean(poolW) / poolArea : 0, density: dens };
    var bp = {}; POLICIES.forEach(function (p) { bp[p] = runCombatPolicy(p, N, seed, dens, pool); });
    var f = [];   // combat-model is combat-only by design (no collapse/slab) -> skip the single-death-cause flag; keep win-rate + greed-matters
    POLICIES.forEach(function (p) { var r = bp[p]; if (r.winRate > 0.95) f.push(p + ": win-rate " + pct(r.winRate) + " > 95% (trivial)"); if (r.winRate < 0.05) f.push(p + ": win-rate " + pct(r.winRate) + " < 5% (unwinnable)"); });
    if (Math.abs(bp.greedy.winRate - bp.cautious.winRate) < 0.05 && Math.abs(bp.greedy.lootPerLife - bp.cautious.lootPerLife) < 0.05 * (bp.cautious.lootPerLife || 1)) f.push("greed-doesn't-matter: greedy ≈ cautious");
    return { N: N, seed: seed, sim: SIM_C, floor: floorMeta, policies: bp, flags: f };
  }
  function formatCombat(res) {
    var L = [];
    L.push("TOURIST DUNGEON — balance sim: NEW COMBAT MODEL (two-function + gear + encumbrance)   (N=" + res.N + ", seed=" + res.seed + ")");
    var fl = res.floor || {};
    L.push("FLOOR sourced from TD_GEN2 'worked' " + fl.W + "x" + fl.H + ": avg walkable " + Math.round(fl.avgWalk || 0) + " cells (" + pct(fl.walkPct || 0) + " of floor), " + SIM_C.FLOOR_POOL + "-floor pool");
    var mixStr = (fl.density && fl.density.mix) ? fl.density.mix.map(function (m) { return m.den + " x" + m.weight; }).join("/") : "?";
    L.push("derived per floor: foes = round(walk x " + (fl.density ? fl.density.creature : "?") + ") ~ " + (res.policies.greedy ? res.policies.greedy.avgFoes.toFixed(1) : "?") + " | coin = round(walk x " + (fl.density ? fl.density.coin : "?") + ") DENOMINATION heaps [" + mixStr + "] (greedy hoovers all -> weight; cautious takes gold; real TD_RESOLVE + TD_BURDEN)");
    L.push("");
    L.push(pad("policy", 10) + padL("win%", 8) + padL("TTK(md)", 9) + padL("combat-deaths", 15) + padL("loot/life", 11));
    L.push(new Array(56).join("-"));
    POLICIES.forEach(function (p) { var r = res.policies[p]; L.push(pad(p, 10) + padL(pct(r.winRate), 8) + padL(r.ttkMedian.toFixed(1), 9) + padL((r.N - r.wins) + "/" + r.N, 15) + padL("$" + r.lootPerLife.toFixed(0), 11)); });
    L.push(new Array(56).join("-"));
    L.push("(combat is the only death mode in this model; loot/life = gold value carried out, 0 on death)");
    L.push("");
    if (res.flags.length) { L.push("DEGENERACY FLAGS:"); res.flags.forEach(function (x) { L.push("  ⚑ " + x); }); }
    else L.push("DEGENERACY FLAGS: none — distribution looks non-degenerate.");
    return L.join("\n");
  }

  var API = { runAll: runAll, runPolicy: runPolicy, format: format, flagsFor: flagsFor, POLICIES: POLICIES, SIM: SIM,
              runCombat: runCombat, formatCombat: formatCombat, SIM_C: SIM_C };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.TD_SIM = API;

  // Node CLI: node tests/sim.js [N] [seed]
  if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    var N = parseInt(process.argv[2], 10) || 1000, seed = parseInt(process.argv[3], 10); if (isNaN(seed)) seed = 1234;
    console.log(format(runAll({ N: N, seed: seed })));
  }
})();
