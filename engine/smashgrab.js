// Tourist Dungeon — TD_SMASHGRAB [v3]: a THROWAWAY §24 fun-test (sibling of TD_CONTRAPTION, NOT
// canon). The intended loop, faithfully: LOOT treasure before you commit (treasure = WEIGHT), then
// grab the artifact to TRIP a closing SLAB DOOR and SPRINT out — but only if you stayed light
// enough to sprint. An impassable CHASM splits the vault (you see across it but route AROUND), and
// the chasm is where the un-taken artifact falls. Self-contained, DOM-free, deterministic — trivial
// to delete or promote. Reuses TD_FEEL juice + the primitive-pickup pattern. Assigns TD_SMASHGRAB.
//
// FIREWALL: placeholder pickups only — no monsters/traps/swimming/secret-doors/treasure-economy.
"use strict";

var TD_SMASHGRAB = (function () {
  // ====================== TUNABLES (tweak here to iterate the feel) ======================
  var TUNE = {
    ESCAPE_TURNS: 32,        // the slab-door budget: door-steps to fully seal the exit after the trip
                             // (tuned so a LIGHT sprint from the far artifact just makes it; over-loaded
                             //  doubles the door pace and seals first)
    WEIGHT_PER_TREASURE: 2,  // each grabbed treasure adds this much LOAD
    SPRINT_THRESHOLD: 4,     // LOAD strictly above this => SPRINT disabled (the door gains on you 2x)
    HEAVY_PACE: 2,           // door-steps per move when over-loaded (vs 1 when sprinting)
    TREMOR: "hard",          // collapse shake severity: soft | med | hard
    RECOVERY_DEPTH: 3        // the fallen artifact is flagged to reappear this many levels deeper (stub)
  };
  // the rigged vault (authored, no generation): # wall, . floor, @ entry, > exit, ~ impassable chasm,
  // A/B artifacts (FAR side, across the chasm), $ treasure (on the route). Entry+exit share the
  // bottom-right by the chasm GAP; the artifacts are top-left — you must route AROUND to reach them.
  var ROWS = [
    "#####################",
    "#..A.....B..........#",
    "#...................#",
    "#......$......$.....#",
    "#...................#",
    "#~~~~~~~~~~~~~~~~~...#",
    "#~~~~~~~~~~~~~~~~~...#",
    "#...................#",
    "#....$........$.....#",
    "#...................#",
    "#...................#",
    "#...........@..>....#",
    "#####################"
  ];
  var TELLS = [
    "A cold draft pours up out of the split in the floor; the Bureau does not heat a room it expects you to leave.",
    "Scratched by the lip of the chasm, a rhyme half-rubbed away: 'take but the one, and run, and run.'",
    "The far stones ring hollow even from here — something is wound tight beneath the worked floor."
  ];
  var ARTNAMES = { A: "the Reliquary Ledger", B: "the Brass Astrolabe" };

  var W = ROWS[0].length, H = ROWS.length;
  function baseTile(x, y) { return (y >= 0 && y < H && x >= 0 && x < W) ? ROWS[y][x] : "#"; }
  var ENTRY = null, EXIT = null, ARTS = [], TREAS = [], CREV = [];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var c = ROWS[y][x];
    if (c === "@") ENTRY = { x: x, y: y };
    else if (c === ">") EXIT = { x: x, y: y };
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
      treas: TREAS.map(function (t, i) { return { i: i, x: t.x, y: t.y, taken: false }; }),
      load: 0, tripped: false, doorClosed: 0, carried: null, treasCarried: 0,
      dead: false, escaped: false, fallenPending: null, runs: 0
    };
  }
  function reset() { var runs = S ? S.runs : 0; S = fresh(); S.runs = runs; }

  function walkBase(x, y) { var c = baseTile(x, y); return c !== "#" && c !== "~"; }   // chasm (~) and walls block; you can SEE across the chasm but not cross it
  function artAt(x, y) { for (var i = 0; i < S.arts.length; i++) { var a = S.arts[i]; if (!a.taken && !a.fallen && a.x === x && a.y === y) return a; } return null; }
  function treasAt(x, y) { for (var i = 0; i < S.treas.length; i++) { var t = S.treas[i]; if (!t.taken && t.x === x && t.y === y) return t; } return null; }
  function sprintable() { return S.load <= TUNE.SPRINT_THRESHOLD; }
  function doorRemaining() { var pace = sprintable() ? 1 : TUNE.HEAVY_PACE; return Math.max(0, Math.ceil((TUNE.ESCAPE_TURNS - S.doorClosed) / pace)); }

  function enter(n) { reset(); S.active = true; S.runs += 1; return { tell: TELLS[((n || 0) % TELLS.length + TELLS.length) % TELLS.length] }; }
  function leave() { if (S) S.active = false; }
  function active() { return !!(S && S.active); }
  function over() { return !!(S && (S.dead || S.escaped)); }

  // light the collapse: start the slab door, drop the UN-TAKEN artifact into the chasm (it falls
  // into the same dark you couldn't cross), flag it to reappear deeper (recovery stub).
  function trip() {
    if (S.tripped) return null;
    S.tripped = true; S.doorClosed = 0;
    var fell = null;
    S.arts.forEach(function (a) { if (!a.taken && !a.fallen) { a.fallen = true; fell = a; } });
    if (fell) {
      var nearest = null, best = 1e9;
      CREV.forEach(function (c) { var d = Math.abs(c.x - fell.x) + Math.abs(c.y - fell.y); if (d < best) { best = d; nearest = c; } });
      if (nearest) { fell.x = nearest.x; fell.y = nearest.y; }
      S.fallenPending = { id: fell.id, name: fell.name, depth: TUNE.RECOVERY_DEPTH };
    }
    return {
      tremor: true, severity: TUNE.TREMOR, tile: { x: S.player.x, y: S.player.y },
      float: "EXPEDITED EGRESS, per ordinance.",
      fell: fell ? { id: fell.id, name: fell.name, x: fell.x, y: fell.y } : null,
      lines: ["A SLAB grinds down over the exit — the vault is sealing itself."].concat(
        fell ? [fell.name + " tumbles into the chasm, into the dark you could not cross. (You will find it again, deeper — level " + TUNE.RECOVERY_DEPTH + ".)"] : [])
    };
  }

  // grab whatever is underfoot. TREASURE adds weight and does NOT trip. The ARTIFACT trips the door.
  function get() {
    if (!S.active || over()) return { got: false };
    var t = treasAt(S.player.x, S.player.y);
    if (t) { t.taken = true; S.treasCarried += 1; S.load += TUNE.WEIGHT_PER_TREASURE; return { got: true, treasure: true, load: S.load, sprintable: sprintable() }; }
    var a = artAt(S.player.x, S.player.y);
    if (!a) return { got: false };
    if (S.carried) return { got: false, reason: "You can carry only one artifact through a collapse." };
    a.taken = true; S.carried = { id: a.id, name: a.name };
    return { got: true, artifact: true, carried: S.carried, ev: trip() };
  }

  // each move is a turn: when tripped, the slab descends by the current PACE (1 sprinting, HEAVY_PACE
  // over-loaded). Reach the exit before it seals => ESCAPE; the slab sealing first => crushed.
  function move(dir) {
    if (!S.active || over()) return { moved: false };
    var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
    var d = D[dir]; if (!d) return { moved: false };
    var nx = S.player.x + d[0], ny = S.player.y + d[1];
    if (!walkBase(nx, ny)) return { moved: false };
    S.player.x = nx; S.player.y = ny;
    var res = { moved: true };
    if (S.tripped && !over()) {
      S.doorClosed += sprintable() ? 1 : TUNE.HEAVY_PACE;
      if (nx === EXIT.x && ny === EXIT.y && S.doorClosed < TUNE.ESCAPE_TURNS) {
        S.escaped = true; res.escaped = true; res.relief = true; res.carried = S.carried;
        res.float = "EGRESS STAMPED."; res.lines = ["You roll under the slab as it slams home" + (S.carried ? ", " + S.carried.name + " still in hand." : ", empty-handed but breathing.") + (S.treasCarried ? " (" + S.treasCarried + " trinket" + (S.treasCarried === 1 ? "" : "s") + " too.)" : "")];
      } else if (S.doorClosed >= TUNE.ESCAPE_TURNS) {
        S.dead = true; res.dead = true; res.float = "SUMMARILY VOIDED."; res.lines = ["The slab seals. The Bureau records the cause as 'avarice, in excess of egress.'"];
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
      crevasse: CREV.slice(), exit: { x: EXIT.x, y: EXIT.y }, entry: { x: ENTRY.x, y: ENTRY.y },
      tripped: S.tripped, doorClosed: S.doorClosed, doorProgress: TUNE.ESCAPE_TURNS ? Math.min(1, S.doorClosed / TUNE.ESCAPE_TURNS) : 0,
      doorRemaining: doorRemaining(), escapeTurns: TUNE.ESCAPE_TURNS,
      load: S.load, treasCarried: S.treasCarried, sprintable: sprintable(), carried: S.carried,
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
