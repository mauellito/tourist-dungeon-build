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
    ESCAPE_TURNS: 20,        // slab-door budget: door-steps to fully seal (lower = faster descent)
    WEIGHT_PER_TREASURE: 2,  // each grabbed treasure adds this much LOAD
    SPRINT_THRESHOLD: 4,     // LOAD strictly above this => SPRINT disabled (the slab gains 2x on you)
    HEAVY_PACE: 2,           // door-steps per move when over-loaded (vs 1 when sprinting)
    TREMOR: "hard"           // collapse shake severity: soft | med | hard
  };
  var RECOVERY_DEPTH = 3;    // the fallen artifact is flagged to reappear this many levels deeper (stub)

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
      treas: TREAS.map(function (t) { return { x: t.x, y: t.y, taken: false }; }),
      load: 0, tripped: false, doorClosed: 0, carried: null, treasCarried: 0,
      passedSlab: false, dead: false, escaped: false, fallenPending: null, runs: 0
    };
  }
  function reset() { var runs = S ? S.runs : 0; S = fresh(); S.runs = runs; }

  function sealed() { return S.tripped && S.doorClosed >= TUNE.ESCAPE_TURNS; }
  function walkBase(x, y) {
    var c = baseTile(x, y);
    if (c === "#" || c === "~") return false;            // walls + chasm block; you SEE across the chasm but cannot cross
    if (SLAB && x === SLAB.x && y === SLAB.y && sealed()) return false;   // the slab, once fully down, is a wall
    return true;
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
      lines: ["A SLAB grinds loose over the escape passage — RUN."].concat(
        fell ? [fell.name + " tumbles into the chasm, into the dark you could not cross. (You will find it again, deeper — level " + RECOVERY_DEPTH + ".)"] : [])
    };
  }

  function get() {
    if (!S.active || over()) return { got: false };
    var t = treasAt(S.player.x, S.player.y);
    if (t) { t.taken = true; S.treasCarried += 1; S.load += TUNE.WEIGHT_PER_TREASURE; return { got: true, treasure: true, sfx: "loot", load: S.load, sprintable: sprintable() }; }
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
      S.doorClosed += sprintable() ? 1 : TUNE.HEAVY_PACE;
      res.grind = true;                                   // host repeats the stone-grind cue while it descends
      if (SLAB && nx >= SLAB.x && ny === SLAB.y) S.passedSlab = true;   // crossed under the slab in time
      if (nx === EXIT.x && ny === EXIT.y) {
        S.escaped = true; res.escaped = true; res.sfx = "chime"; res.carried = S.carried;
        res.lines = ["You roll clear of the passage" + (S.carried ? ", " + S.carried.name + " still in hand." : ", empty-handed but breathing.") + (S.treasCarried ? " (" + S.treasCarried + " trinket" + (S.treasCarried === 1 ? "" : "s") + " too.)" : "")];
      } else if (sealed() && !S.passedSlab) {
        S.dead = true; res.dead = true; res.sfx = "slam"; res.lines = ["The slab slams home across the passage. The Bureau records the cause as 'avarice, in excess of egress.'"];
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
      treas: S.treas.map(function (t) { return { x: t.x, y: t.y, taken: t.taken }; }),
      crevasse: CREV.slice(), exit: { x: EXIT.x, y: EXIT.y }, entry: { x: ENTRY.x, y: ENTRY.y }, slab: SLAB ? { x: SLAB.x, y: SLAB.y } : null,
      tripped: S.tripped, sealed: sealed(), doorClosed: S.doorClosed, doorProgress: TUNE.ESCAPE_TURNS ? Math.min(1, S.doorClosed / TUNE.ESCAPE_TURNS) : 0,
      doorRemaining: doorRemaining(), escapeTurns: TUNE.ESCAPE_TURNS, escapeLen: escapeLen(),
      load: S.load, treasCarried: S.treasCarried, sprintable: sprintable(), passedSlab: S.passedSlab, carried: S.carried,
      dead: S.dead, escaped: S.escaped, fallenPending: S.fallenPending, runs: S.runs
    };
  }

  reset();
  return {
    TUNE: TUNE, enter: enter, leave: leave, active: active, over: over,
    move: move, get: get, trip: trip, view: view, _state: function () { return S; }
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_SMASHGRAB; }
