// Tourist Dungeon — TD_SMASHGRAB [v4]: a THROWAWAY §24 fun-test (sibling of TD_CONTRAPTION, NOT
// canon). The real game is CORRIDORS and the escape is a CHASE: a short 1-wide APPROACH corridor ->
// a LOOT CHAMBER (treasure + two artifacts + an impassable chasm you route around) -> a 1-wide
// ESCAPE corridor with a stone SLAB that grinds DOWN across it on the grab (a true funnel — no
// routing around it). Loot = WEIGHT; stay light enough to SPRINT under the slab before it seals.
// Self-contained, DOM-free, deterministic. Reuses TD_FEEL (shake/flash) + emits SFX cue hints the
// host plays via TD_SFX. Assigns TD_SMASHGRAB.
//
// FIREWALL: placeholder pickups only — no monsters/traps/swimming/secret-doors/economy/real temple.
"use strict";

var TD_SMASHGRAB = (function () {
  // ====================== TUNABLES (tweak here to iterate the feel) ======================
  var TUNE = {
    ESCAPE_TURNS: 20,        // slab-door budget: ticks to fully seal the slab ahead (lower = faster)
    WEIGHT_PER_TREASURE: 2,  // each grabbed treasure adds this much LOAD
    SPRINT_THRESHOLD: 4,     // LOAD strictly above this => SPRINT disabled (both threats gain 2x on you)
    HEAVY_PACE: 2,           // ticks per move when over-loaded (vs 1 when sprinting)
    COLLAPSE_DELAY: 4,       // a head-start: ticks before the collapse-edge starts advancing (telegraph)
    COLLAPSE_RATE: 0.7,      // cells the death-edge advances per tick (< 1 so a LIGHT run outruns it)
    TREMOR: "hard"           // grab/seal shake severity: soft | med | hard
  };
  var RECOVERY_DEPTH = 3;    // the fallen artifact is flagged to reappear this many levels deeper (stub)
  // each $ scores; the richest sit DEEP (right half, by the chasm / the grab point) so the greediest
  // loot is the most dangerous to fetch and the most expensive minute to spend carrying it out.
  var TREASVAL = { "6,5": 15, "6,10": 25, "15,5": 30, "15,10": 50 };

  // Authored vault (no generation). # wall, . floor, ~ impassable chasm, @ entry, > exit,
  // A/B artifacts, $ treasure, = the slab cell (a normal corridor floor that the slab grinds down
  // over). APPROACH (left, 1-wide, row 7) -> CHAMBER (cols 5-18, chasm at col 11 splits it; reach
  // the right side only over the top rows 1-2) -> ESCAPE (right, 1-wide, row 7, with the slab '=').
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
    "#####......~.......############",
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

  // ====================== state ======================
  var S = null;
  function fresh() {
    return {
      active: false, player: { x: ENTRY.x, y: ENTRY.y },
      arts: ARTS.map(function (a) { return { id: a.id, name: ARTNAMES[a.id], x: a.x, y: a.y, taken: false, fallen: false }; }),
      treas: TREAS.map(function (t) { return { x: t.x, y: t.y, taken: false, value: TREASVAL[t.x + "," + t.y] || 5 }; }),
      load: 0, score: 0, tripped: false, doorClosed: 0, carried: null, treasCarried: 0,
      passedSlab: false, dead: false, escaped: false, swallowed: false, fallenPending: null, runs: 0,
      origin: null, dist: null   // collapse: BFS distance-from-grab-point, computed at trip
    };
  }
  function reset() { var runs = S ? S.runs : 0; S = fresh(); S.runs = runs; }

  function sealed() { return S.tripped && S.doorClosed >= TUNE.ESCAPE_TURNS; }
  // the collapse death-edge: a frontier measured in BFS distance-from-the-grab-point. After a short
  // head-start it advances COLLAPSE_RATE cells per tick; every floor cell it has passed is rubble.
  function frontier() { return S.tripped ? Math.max(0, (S.doorClosed - TUNE.COLLAPSE_DELAY)) * TUNE.COLLAPSE_RATE : -1; }
  function distAt(x, y) { return S.dist ? S.dist[x + "," + y] : undefined; }
  function rubble(x, y) { if (!S.tripped || !S.dist) return false; var d = S.dist[x + "," + y]; return (d !== undefined) && d <= frontier(); }
  function playerLead() { var d = distAt(S.player.x, S.player.y); return (d === undefined) ? 99 : (d - frontier()); }   // cells of clear floor behind you

  function walkBase(x, y) {
    var c = baseTile(x, y);
    if (c === "#" || c === "~") return false;            // walls + chasm block; you SEE across the chasm but cannot cross
    if (SLAB && x === SLAB.x && y === SLAB.y && sealed()) return false;   // the slab, once fully down, is a wall
    if (rubble(x, y)) return false;                       // collapsed floor is impassable rubble — no going back
    return true;
  }
  // BFS distance over the floor graph from the grab point (slab passable, chasm/walls blocked)
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
  function artAt(x, y) { for (var i = 0; i < S.arts.length; i++) { var a = S.arts[i]; if (!a.taken && !a.fallen && a.x === x && a.y === y) return a; } return null; }
  function treasAt(x, y) { for (var i = 0; i < S.treas.length; i++) { var t = S.treas[i]; if (!t.taken && t.x === x && t.y === y) return t; } return null; }
  function sprintable() { return S.load <= TUNE.SPRINT_THRESHOLD; }
  function doorRemaining() { var pace = sprintable() ? 1 : TUNE.HEAVY_PACE; return Math.max(0, Math.ceil((TUNE.ESCAPE_TURNS - S.doorClosed) / pace)); }
  function escapeLen() { return SLAB ? Math.abs(EXIT.x - SLAB.x) + Math.abs(SLAB.x - 19) : 0; }   // rough escape-corridor length (info)

  function enter(n) { reset(); S.active = true; S.runs += 1; return { tell: TELLS[((n || 0) % TELLS.length + TELLS.length) % TELLS.length] }; }
  function leave() { if (S) S.active = false; }
  function active() { return !!(S && S.active); }
  function over() { return !!(S && (S.dead || S.escaped)); }

  function trip() {
    if (S.tripped) return null;
    S.tripped = true; S.doorClosed = 0;
    S.origin = { x: S.player.x, y: S.player.y }; S.dist = computeDist(S.player.x, S.player.y);   // the collapse spreads from the grab point
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

  function get() {
    if (!S.active || over()) return { got: false };
    var t = treasAt(S.player.x, S.player.y);
    if (t) { t.taken = true; S.treasCarried += 1; S.load += TUNE.WEIGHT_PER_TREASURE; S.score += t.value; return { got: true, treasure: true, value: t.value, score: S.score, sfx: "loot", load: S.load, sprintable: sprintable() }; }
    var a = artAt(S.player.x, S.player.y);
    if (!a) return { got: false };
    if (S.carried) return { got: false, reason: "You can carry only one artifact through a collapse." };
    a.taken = true; S.carried = { id: a.id, name: a.name };
    return { got: true, artifact: true, carried: S.carried, ev: trip() };
  }

  function move(dir) {
    if (!S.active || over()) return { moved: false };
    var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
    var d = D[dir]; if (!d) return { moved: false };
    var nx = S.player.x + d[0], ny = S.player.y + d[1];
    if (!walkBase(nx, ny)) return { moved: false };
    S.player.x = nx; S.player.y = ny;
    var res = { moved: true, sfx: "step" };
    if (S.tripped && !over()) {
      var f0 = Math.floor(frontier());
      S.doorClosed += sprintable() ? 1 : TUNE.HEAVY_PACE;   // one clock drives BOTH threats; over-loaded => 2x
      res.grind = true;
      res.crash = Math.floor(frontier()) > f0;              // a band of floor just fell -> tile-crash cue
      res.lead = playerLead();                               // cells of clear floor still behind you
      res.proximity = Math.max(0, Math.min(1, 1 - res.lead / 8));   // 0 far .. 1 right behind you (juice scale)
      if (SLAB && nx >= SLAB.x && ny === SLAB.y) S.passedSlab = true;
      if (nx === EXIT.x && ny === EXIT.y) {                  // reaching the exit wins, whatever is at your heels
        S.escaped = true; res.escaped = true; res.sfx = "chime"; res.carried = S.carried; res.score = S.score;
        res.lines = ["You roll clear of the passage as it folds shut behind you" + (S.carried ? ", " + S.carried.name + " still in hand." : ", empty-handed but breathing.") + (S.score ? " ESCAPED with $" + S.score + " in loot." : "")];
      } else if (playerLead() <= 0) {                        // the death-edge reached your tile -> SWALLOWED (distinct from the slab)
        S.dead = true; S.swallowed = true; res.dead = true; res.sfx = "crash"; res.scoreLost = S.score;
        res.lines = ["The floor drops out from under you and the dark takes everything — the Bureau files it under 'reabsorbed, with effects.'" + (S.score ? " ($" + S.score + " lost.)" : "")];
      } else if (sealed() && !S.passedSlab) {                // sealed off ahead by the slab -> SUMMARILY VOIDED
        S.dead = true; res.dead = true; res.sfx = "slam"; res.scoreLost = S.score;
        res.lines = ["The slab slams home across the passage. The Bureau records the cause as 'avarice, in excess of egress.'" + (S.score ? " ($" + S.score + " lost.)" : "")];
      }
    }
    res.doorRemaining = doorRemaining();
    return res;
  }

  function view() {
    return {
      w: W, h: H, base: baseTile,
      player: { x: S.player.x, y: S.player.y },
      arts: S.arts.map(function (a) { return { id: a.id, name: a.name, x: a.x, y: a.y, taken: a.taken, fallen: a.fallen }; }),
      treas: S.treas.map(function (t) { return { x: t.x, y: t.y, taken: t.taken, value: t.value }; }),
      crevasse: CREV.slice(), exit: { x: EXIT.x, y: EXIT.y }, entry: { x: ENTRY.x, y: ENTRY.y }, slab: SLAB ? { x: SLAB.x, y: SLAB.y } : null,
      tripped: S.tripped, sealed: sealed(), doorClosed: S.doorClosed, doorProgress: TUNE.ESCAPE_TURNS ? Math.min(1, S.doorClosed / TUNE.ESCAPE_TURNS) : 0,
      doorRemaining: doorRemaining(), escapeTurns: TUNE.ESCAPE_TURNS, escapeLen: escapeLen(),
      collapse: { active: S.tripped, frontier: Math.round(frontier() * 100) / 100, origin: S.origin, lead: S.tripped ? playerLead() : null, proximity: S.tripped ? Math.max(0, Math.min(1, 1 - playerLead() / 8)) : 0 },
      rubble: rubble, dist: distAt,
      load: S.load, score: S.score, treasCarried: S.treasCarried, sprintable: sprintable(), passedSlab: S.passedSlab, carried: S.carried,
      dead: S.dead, escaped: S.escaped, swallowed: S.swallowed, fallenPending: S.fallenPending, runs: S.runs
    };
  }

  reset();
  return {
    TUNE: TUNE, enter: enter, leave: leave, active: active, over: over,
    move: move, get: get, trip: trip, view: view, _state: function () { return S; }
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_SMASHGRAB; }
