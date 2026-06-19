// Tourist Dungeon — TD_RESOLVE: the PURE, deterministic resolution core. No DOM, no render, no
// timers. This is the single source of truth for two systems' math:
//   (1) COMBAT — attack / damage / hp / death (the current game uses fixed damage, no rolls, so it
//       is already deterministic; a TD_RNG seed can be threaded later without changing these ops).
//   (2) SMASH-AND-GRAB — the greed / weight / loot-value / collapse / slab / escape resolution,
//       lifted out of smashgrab.js so it operates on an explicit state object (many independent
//       runs can coexist — that is what the headless balance sim needs).
// mapmode.js and smashgrab.js call INTO this module; they no longer own the math. Gate 1 EXTRACTS
// and MEASURES only — not one combat/loot number changed here vs. where it used to live.
//
// Runtime-agnostic: assigns global TD_RESOLVE (browser/headless-Chrome) and module.exports (Node).
"use strict";

var TD_RESOLVE = (function () {
  // ============================ COMBAT (pure) ============================
  var COMBAT = {
    PLAYER_DMG: 20, FALL_DMG: 25, STARVE_HP: 2, EXHAUST_HP: 1,
    // creature stats (the single source of truth; glyph/name are content carried alongside)
    CREATURES: {
      wanderer: { hp: 30, dmg: 8, name: "a shuffling nocent thing", glyph: "r" },
      lurker: { hp: 45, dmg: 16, name: "a patient lurker", glyph: "L" },
      chaser: { hp: 26, dmg: 11, name: "a fervent docent", glyph: "d" }
    }
  };
  // one blow against a target: returns its new hp (floored at 0) and whether it died
  function strike(targetHp, dmg) { var hp = targetHp - dmg; return { hp: hp < 0 ? 0 : hp, killed: hp <= 0 }; }
  // damage applied to the player (or any hp pool): new hp + whether it reached 0
  function applyDamage(hp, amount) { var n = hp - amount; return { hp: n < 0 ? 0 : n, dead: n <= 0 }; }
  // turns-to-kill at a fixed per-hit damage (deterministic combat => exact)
  function ttk(hp, perHit) { return perHit > 0 ? Math.ceil(hp / perHit) : Infinity; }

  // ============= TWO-FUNCTION COMBAT MODEL (combat track R3) =============
  // HIT (accuracy vs evasion, gap-scaled + Lucky's universal thumb) is SEPARATE from DAMAGE
  // (Might + weapon - armor robustness, deterministic; rare crit; de-minimis if armor eats it).
  // Reads the ten-stat spine via TD_STATS (internal numbers; the player sees FEEL-WORDS only).
  // STUB gear only (one generic weapon + a couple armor tiers) — rosters are the next directive.
  // ALL MAGNITUDES ARE PLACEHOLDER — calibration is a later balance-sim pass. Do NOT hand-tune.
  // Live wire-in to mapmode (creatures carry stat blocks) is deferred to the descent-slice pass;
  // the legacy flat PLAYER_DMG path above stays until then.
  var GEAR = {
    WEAPONS: { plain: { name: "a plain blade", base: 12, type: "blade", acc: 0 } },                 // STUB: one generic weapon
    ARMOR: { none: { name: "unarmored", robustness: 0, encumbrance: 0 },                            // STUB: a couple armor tiers
             light: { name: "light armour", robustness: 3, encumbrance: 1 },
             heavy: { name: "heavy armour", robustness: 8, encumbrance: 4 } }
  };
  function _S() { return (typeof TD_STATS !== "undefined") ? TD_STATS : null; }
  function fighter(stats, weapon, armor) { return { stats: stats, weapon: weapon || GEAR.WEAPONS.plain, armor: armor || GEAR.ARMOR.none }; }

  // HIT: gap = attacker accuracy - defender evasion. The roll is GAP-SCALED — a clear gap is reliable
  // (sigmoid saturates), a close gap is swingy (~50/50). Lucky adds its bounded +/-10% thumb. PLACEHOLDER.
  function hit(att, def, rng) {
    var S = _S(); if (!S) return { hit: true, p: 1, gap: 0 };
    var acc = S.DERIVED.accuracy(att.stats) + ((att.weapon && att.weapon.acc) || 0);
    var eva = S.DERIVED.evasion(def.stats) - ((def.armor && def.armor.encumbrance) || 0);   // bulky armour dulls evasion
    var gap = acc - eva;
    var p = 1 / (1 + Math.exp(-gap * 0.15));                       // PLACEHOLDER slope: clear gap -> reliable, gap~0 -> swingy
    p = Math.max(0.02, Math.min(0.98, p + S.luckyThumb(att.stats)));   // Lucky's universal thumb (+/-10% human)
    var roll = rng ? rng.next() : 0.5;
    return { hit: roll < p, p: p, gap: gap };
  }

  // DAMAGE (on a hit): deterministic Might + weapon - armor robustness; a rare crit SPIKE; a hit may
  // land for DE MINIMIS (1) when armour eats the blow. PLACEHOLDER magnitudes.
  function damage(att, def, rng) {
    var S = _S();
    var raw = ((att.weapon && att.weapon.base) || 0) + (S ? S.DERIVED.damageBonus(att.stats) : 0);
    var rob = (def.armor && def.armor.robustness) || 0;
    var crit = rng ? (rng.next() < 0.05) : false;                  // PLACEHOLDER crit rate
    if (crit) raw = Math.round(raw * 1.5);
    var dmg = raw - rob, deMinimis = false;
    if (dmg < 1) { dmg = raw > 0 ? 1 : 0; deMinimis = true; }      // armour ate it -> a hit still lands for de minimis
    return { damage: dmg, crit: crit, deMinimis: deMinimis };
  }

  // THE READ: Per PERCEIVES (OBJ, honest — vague-not-false at low Per; eyes miss, never lie); Intuition
  // INTERPRETS (SUBJ confidence — can MISLEAD at low Intuition). Surfaced as FEEL-WORDS, never numbers.
  var THREAT_WORDS = ["harmless", "slight", "an even match", "dangerous", "deadly", "overwhelming"];
  function _threatBand(v) { var t = 0, B = [-999, -8, -2, 4, 12, 22]; for (var i = 0; i < B.length; i++) if (v >= B[i]) t = i; return t; }
  function read(observer, target, rng) {
    var S = _S(); if (!S) return { seen: { channel: "seen", obj: "OBJ", word: "unknown" }, sense: { channel: "intuition", obj: "SUBJ", word: "unsure" } };
    var threat = ((target.weapon && target.weapon.base) || 0) + S.DERIVED.damageBonus(target.stats) + S.DERIVED.accuracy(target.stats);
    var trueBand = _threatBand(threat);
    var per = S.DERIVED.perceive(observer.stats), intu = S.DERIVED.interpret(observer.stats);
    // OBJ (Per): the true band, hedged-but-never-false at low Per (vague, not wrong).
    var hedge = per < 350;
    var seen = { channel: "seen", obj: "OBJ", word: THREAT_WORDS[trueBand], vague: hedge };
    // SUBJ (Intuition): a judgment. High Intuition -> matches truth; LOW Intuition -> may drift a band (mislead).
    var senseBand = trueBand, confident = intu >= 670;
    if (intu < 500) { var drift = rng ? (rng.next() < (500 - intu) / 700 ? (rng.next() < 0.5 ? -1 : 1) : 0) : 0; senseBand = Math.max(0, Math.min(THREAT_WORDS.length - 1, trueBand + drift)); }
    var sense = { channel: "intuition", obj: "SUBJ", word: THREAT_WORDS[senseBand], confident: confident, reliable: senseBand === trueBand };
    return { seen: seen, sense: sense };
  }

  // ====================== SMASH-AND-GRAB (pure) ======================
  var SG = (function () {
    var TUNE = {
      // ---- CALIBRATED (post-Gate-1 balance pass). The slab (timer) is the primary generic threat;
      // the collapse is DEMOTED to a conditional edge that only catches runs SLOWED by a fight (it does
      // not chase a clean sprinter — DELAY ~6 ticks of head-start), and a stronger footrace rate is
      // reserved for the chasm SET-PIECE. These two split the deaths so no single cause dominates. ----
      ESCAPE_TURNS: 17,        // slab-door budget: ticks to fully seal the slab ahead (THE primary generic threat)
      WEIGHT_PER_TREASURE: 2,  // each grabbed treasure adds this much LOAD
      SPRINT_THRESHOLD: 2,     // LOAD strictly above this => SPRINT disabled. Cautious can keep ONE treasure light.
      HEAVY_PACE: 1.165,       // ticks/move when over-loaded (vs 1 sprinting) — the weight-as-pressure term
      COLLAPSE_SETPIECE: false,    // the chasm set-piece flips this true to use the strong footrace rate below
      COLLAPSE_DELAY: 5.9,         // head-start before the edge advances — long enough that a clean run outpaces it
      COLLAPSE_RATE: 0.88,         // generic edge speed — catches runs that LOST TIME (a fight), not clean sprinters
      COLLAPSE_RATE_SETPIECE: 1.0, // strong footrace speed, reserved for the chasm/collapse set-piece only
      TREMOR: "hard",          // grab/seal shake severity: soft | med | hard
      LOOT: null               // optional per-treasure VALUE override (array, in TREAS order); else TREASVAL
    };
    var RECOVERY_DEPTH = 3;
    // Loot is valued for GREED-BY-QUANTITY: near-flat values so carrying MORE (greedy) banks more than
    // carrying the best two (cautious). A steep "richest-deep" gradient is reserved for set-pieces — under
    // a steep gradient the cautious top-two haul rivals the greedy total and greed cannot pay (calibration).
    var TREASVAL = { "6,5": 25, "6,10": 25, "15,5": 25, "15,10": 25 };
    var ROWS = [
      "###############################",
      "#####..............############",
      "#####..............############",
      "#####......~.......############",
      "#####......~.......############",
      "#####.$....~...$...############",
      "#####......~.......############",
      "#@.........~............=....>#",
      "#####......~.......############",
      "#####......~.A..B..############",
      "#####.$....~...$...############",
      "#####......~.......############",
      "#####......~.......############",
      "#####..............############",
      "###############################"
    ];
    var TELLS = [
      "A cold draft pours up out of the split in the chamber floor; the Bureau does not heat a room it expects you to leave.",
      "Scratched by the lip of the chasm, a rhyme half-rubbed away: 'take but the one, and run, and run.'",
      "Above the escape passage hangs a slab on a worn iron pin — it has dropped before."
    ];
    var ARTNAMES = { A: "the Reliquary Ledger", B: "the Brass Astrolabe" };

    var W = ROWS[0].length, H = ROWS.length;
    function baseTile(x, y) { return (y >= 0 && y < H && x >= 0 && x < W) ? ROWS[y][x] : "#"; }
    var ENTRY = null, EXIT = null, SLAB = null, ARTS = [], TREAS = [], CREV = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = ROWS[y][x];
      if (c === "@") ENTRY = { x: x, y: y };
      else if (c === ">") EXIT = { x: x, y: y };
      else if (c === "=") SLAB = { x: x, y: y };
      else if (c === "A" || c === "B") ARTS.push({ id: c, x: x, y: y });
      else if (c === "$") TREAS.push({ x: x, y: y });
      else if (c === "~") CREV.push({ x: x, y: y });
    }

    function newState() {
      return {
        active: false, player: { x: ENTRY.x, y: ENTRY.y },
        arts: ARTS.map(function (a) { return { id: a.id, name: ARTNAMES[a.id], x: a.x, y: a.y, taken: false, fallen: false }; }),
        treas: TREAS.map(function (t, i) { return { x: t.x, y: t.y, taken: false, value: (TUNE.LOOT && TUNE.LOOT[i] != null) ? TUNE.LOOT[i] : (TREASVAL[t.x + "," + t.y] || 5) }; }),
        load: 0, score: 0, tripped: false, doorClosed: 0, carried: null, treasCarried: 0,
        passedSlab: false, dead: false, escaped: false, swallowed: false, fallenPending: null, runs: 0,
        origin: null, dist: null
      };
    }

    function sealed(S) { return S.tripped && S.doorClosed >= TUNE.ESCAPE_TURNS; }
    function frontier(S) { var rate = TUNE.COLLAPSE_SETPIECE ? TUNE.COLLAPSE_RATE_SETPIECE : TUNE.COLLAPSE_RATE; return S.tripped ? Math.max(0, (S.doorClosed - TUNE.COLLAPSE_DELAY)) * rate : -1; }
    function distAt(S, x, y) { return S.dist ? S.dist[x + "," + y] : undefined; }
    function rubble(S, x, y) { if (!S.tripped || !S.dist) return false; var d = S.dist[x + "," + y]; return (d !== undefined) && d <= frontier(S); }
    function playerLead(S) { var d = distAt(S, S.player.x, S.player.y); return (d === undefined) ? 99 : (d - frontier(S)); }

    function walkBase(S, x, y) {
      var c = baseTile(x, y);
      if (c === "#" || c === "~") return false;
      if (SLAB && x === SLAB.x && y === SLAB.y && sealed(S)) return false;
      if (rubble(S, x, y)) return false;
      return true;
    }
    function computeDist(ox, oy) {
      var D = [[0, -1], [0, 1], [-1, 0], [1, 0]], dist = {}, q = [[ox, oy]]; dist[ox + "," + oy] = 0;
      while (q.length) {
        var c = q.shift(), cd = dist[c[0] + "," + c[1]];
        for (var i = 0; i < 4; i++) {
          var nx = c[0] + D[i][0], ny = c[1] + D[i][1], k = nx + "," + ny, t = baseTile(nx, ny);
          if (dist[k] !== undefined || t === "#" || t === "~") continue;
          dist[k] = cd + 1; q.push([nx, ny]);
        }
      }
      return dist;
    }
    function artAt(S, x, y) { for (var i = 0; i < S.arts.length; i++) { var a = S.arts[i]; if (!a.taken && !a.fallen && a.x === x && a.y === y) return a; } return null; }
    function treasAt(S, x, y) { for (var i = 0; i < S.treas.length; i++) { var t = S.treas[i]; if (!t.taken && t.x === x && t.y === y) return t; } return null; }
    function sprintable(S) { return S.load <= TUNE.SPRINT_THRESHOLD; }
    function doorRemaining(S) { var pace = sprintable(S) ? 1 : TUNE.HEAVY_PACE; return Math.max(0, Math.ceil((TUNE.ESCAPE_TURNS - S.doorClosed) / pace)); }
    function escapeLen() { return SLAB ? Math.abs(EXIT.x - SLAB.x) + Math.abs(SLAB.x - 19) : 0; }
    function tell(n) { return TELLS[((n || 0) % TELLS.length + TELLS.length) % TELLS.length]; }
    function over(S) { return !!(S && (S.dead || S.escaped)); }

    function trip(S) {
      if (S.tripped) return null;
      S.tripped = true; S.doorClosed = 0;
      S.origin = { x: S.player.x, y: S.player.y }; S.dist = computeDist(S.player.x, S.player.y);
      var fell = null;
      S.arts.forEach(function (a) { if (!a.taken && !a.fallen) { a.fallen = true; fell = a; } });
      if (fell) {
        var nearest = null, best = 1e9;
        CREV.forEach(function (c) { var d = Math.abs(c.x - fell.x) + Math.abs(c.y - fell.y); if (d < best) { best = d; nearest = c; } });
        if (nearest) { fell.x = nearest.x; fell.y = nearest.y; }
        S.fallenPending = { id: fell.id, name: fell.name, depth: RECOVERY_DEPTH };
      }
      return {
        tremor: true, severity: TUNE.TREMOR, tile: { x: S.player.x, y: S.player.y }, sfx: "grab",
        float: "EXPEDITED EGRESS, per ordinance.",
        fell: fell ? { id: fell.id, name: fell.name, x: fell.x, y: fell.y } : null,
        lines: ["The far wall buckles — the floor is COMING DOWN behind you, and a slab grinds loose ahead. RUN."].concat(
          fell ? [fell.name + " tumbles into the chasm, into the dark you could not cross. (You will find it again, deeper — level " + RECOVERY_DEPTH + ".)"] : [])
      };
    }

    function get(S) {
      if (!S.active || over(S)) return { got: false };
      var t = treasAt(S, S.player.x, S.player.y);
      if (t) { t.taken = true; S.treasCarried += 1; S.load += TUNE.WEIGHT_PER_TREASURE; S.score += t.value; return { got: true, treasure: true, value: t.value, score: S.score, sfx: "loot", load: S.load, sprintable: sprintable(S) }; }
      var a = artAt(S, S.player.x, S.player.y);
      if (!a) return { got: false };
      if (S.carried) return { got: false, reason: "You can carry only one artifact through a collapse." };
      a.taken = true; S.carried = { id: a.id, name: a.name };
      return { got: true, artifact: true, carried: S.carried, ev: trip(S) };
    }

    function move(S, dir) {
      if (!S.active || over(S)) return { moved: false };
      var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
      var d = D[dir]; if (!d) return { moved: false };
      var nx = S.player.x + d[0], ny = S.player.y + d[1];
      if (!walkBase(S, nx, ny)) return { moved: false };
      S.player.x = nx; S.player.y = ny;
      var res = { moved: true, sfx: "step" };
      if (S.tripped && !over(S)) {
        var f0 = Math.floor(frontier(S));
        S.doorClosed += sprintable(S) ? 1 : TUNE.HEAVY_PACE;
        res.grind = true;
        res.crash = Math.floor(frontier(S)) > f0;
        res.lead = playerLead(S);
        res.proximity = Math.max(0, Math.min(1, 1 - res.lead / 8));
        if (SLAB && nx >= SLAB.x && ny === SLAB.y) S.passedSlab = true;
        if (nx === EXIT.x && ny === EXIT.y) {
          S.escaped = true; res.escaped = true; res.sfx = "chime"; res.carried = S.carried; res.score = S.score;
          res.lines = ["You roll clear of the passage as it folds shut behind you" + (S.carried ? ", " + S.carried.name + " still in hand." : ", empty-handed but breathing.") + (S.score ? " ESCAPED with $" + S.score + " in loot." : "")];
        } else if (playerLead(S) <= 0) {
          S.dead = true; S.swallowed = true; res.dead = true; res.sfx = "crash"; res.scoreLost = S.score;
          res.lines = ["The floor drops out from under you and the dark takes everything — the Bureau files it under 'reabsorbed, with effects.'" + (S.score ? " ($" + S.score + " lost.)" : "")];
        } else if (sealed(S) && !S.passedSlab) {
          S.dead = true; res.dead = true; res.sfx = "slam"; res.scoreLost = S.score;
          res.lines = ["The slab slams home across the passage. The Bureau records the cause as 'avarice, in excess of egress.'" + (S.score ? " ($" + S.score + " lost.)" : "")];
        }
      }
      res.doorRemaining = doorRemaining(S);
      return res;
    }

    function view(S) {
      return {
        w: W, h: H, base: baseTile,
        player: { x: S.player.x, y: S.player.y },
        arts: S.arts.map(function (a) { return { id: a.id, name: a.name, x: a.x, y: a.y, taken: a.taken, fallen: a.fallen }; }),
        treas: S.treas.map(function (t) { return { x: t.x, y: t.y, taken: t.taken, value: t.value }; }),
        crevasse: CREV.slice(), exit: { x: EXIT.x, y: EXIT.y }, entry: { x: ENTRY.x, y: ENTRY.y }, slab: SLAB ? { x: SLAB.x, y: SLAB.y } : null,
        tripped: S.tripped, sealed: sealed(S), doorClosed: S.doorClosed, doorProgress: TUNE.ESCAPE_TURNS ? Math.min(1, S.doorClosed / TUNE.ESCAPE_TURNS) : 0,
        doorRemaining: doorRemaining(S), escapeTurns: TUNE.ESCAPE_TURNS, escapeLen: escapeLen(),
        collapse: { active: S.tripped, frontier: Math.round(frontier(S) * 100) / 100, origin: S.origin, lead: S.tripped ? playerLead(S) : null, proximity: S.tripped ? Math.max(0, Math.min(1, 1 - playerLead(S) / 8)) : 0 },
        rubble: function (x, y) { return rubble(S, x, y); }, dist: function (x, y) { return distAt(S, x, y); },
        load: S.load, score: S.score, treasCarried: S.treasCarried, sprintable: sprintable(S), passedSlab: S.passedSlab, carried: S.carried,
        dead: S.dead, escaped: S.escaped, swallowed: S.swallowed, fallenPending: S.fallenPending, runs: S.runs
      };
    }

    return {
      TUNE: TUNE, TREASVAL: TREASVAL, ROWS: ROWS, RECOVERY_DEPTH: RECOVERY_DEPTH,
      layout: { W: W, H: H, ENTRY: ENTRY, EXIT: EXIT, SLAB: SLAB, ARTS: ARTS, TREAS: TREAS, CREV: CREV, baseTile: baseTile },
      newState: newState, over: over, tell: tell,
      sealed: sealed, frontier: frontier, distAt: distAt, rubble: rubble, playerLead: playerLead,
      walkBase: walkBase, computeDist: computeDist, sprintable: sprintable, doorRemaining: doorRemaining, escapeLen: escapeLen,
      trip: trip, get: get, move: move, view: view
    };
  })();

  return {
    COMBAT: COMBAT, strike: strike, applyDamage: applyDamage, ttk: ttk, SG: SG,
    GEAR: GEAR, fighter: fighter, hit: hit, damage: damage, read: read
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_RESOLVE; }
