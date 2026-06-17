// Tourist Dungeon — TD_SMASHGRAB: a THROWAWAY §24 fun-proof prototype (sibling of TD_CONTRAPTION,
// NOT canon mechanics). One job: make the trip -> manage -> progress loop PLAYABLE and TUNABLE so
// we can judge whether it is FUN (tense squeeze / manageable consequence / retry-pull / tell reads
// as voice). Self-contained, DOM-free, deterministic — trivial to delete or promote. Reuses
// TD_FEEL (juice) + TD_VOICES.IMPACT (severity floats) via the play-map harness; mirrors the
// TD_CONTRAPTION patterns. Classic script: assigns global TD_SMASHGRAB.
"use strict";

var TD_SMASHGRAB = (function () {
  // ====================== TUNABLES (tweak here to iterate the feel) ======================
  var TUNE = {
    ESCAPE_TURNS: 20,        // N — turns to reach the exit after the trip (≈ the v17 wicket feel)
    TREMOR: "hard",          // collapse shake severity: soft | med | hard
    COLLAPSE_PACE: 1,        // turns per collapse stage (reserved hook; 1 = clock ticks every turn)
    RECOVERY_DEPTH: 3        // the fallen artifact is flagged to reappear this many levels deeper (stub)
  };
  // the rigged vault (fixed): # wall, . floor, @ entry, A/B placeholder artifacts, > exit, ~ crevasse(pit)
  var ROWS = [
    "#################",
    "#.......>.......#",
    "#...............#",
    "#..A.........B..#",
    "#...............#",
    "#......~~~......#",
    "#...............#",
    "#...............#",
    "#...............#",
    "#.......@.......#",
    "#################"
  ];
  // the rigged TELL, in the secret-grammar register (cold draft / scratched rhyme / hollow note) —
  // it must LOOK loaded via the voice channel, never a popup.
  var TELLS = [
    "A cold draft fingers the back of your neck; the Bureau does not heat rooms it expects you to leave.",
    "Scratched into the lintel, a rhyme half-rubbed away: 'take but the one, and run, and run.'",
    "The floor rings hollow underfoot — something is wound tight beneath the worked stone."
  ];

  var W = ROWS[0].length, H = ROWS.length;
  function baseTile(x, y) { return (y >= 0 && y < H && x >= 0 && x < W) ? ROWS[y][x] : "#"; }
  var ENTRY = null, EXIT = null, ARTS = [], CREV = [];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var c = ROWS[y][x];
    if (c === "@") ENTRY = { x: x, y: y };
    else if (c === ">") EXIT = { x: x, y: y };
    else if (c === "A" || c === "B") ARTS.push({ id: c, x: x, y: y });
    else if (c === "~") CREV.push({ x: x, y: y });
  }
  var ARTNAMES = { A: "the Reliquary Ledger", B: "the Brass Astrolabe" };   // placeholder artifacts

  // ====================== state ======================
  var S = null;
  function fresh() {
    return {
      active: false, player: { x: ENTRY.x, y: ENTRY.y },
      arts: ARTS.map(function (a) { return { id: a.id, name: ARTNAMES[a.id], x: a.x, y: a.y, taken: false, fallen: false }; }),
      tripped: false, clock: 0, carried: null, dead: false, escaped: false,
      fallenPending: null, runs: 0
    };
  }
  function reset() { var runs = S ? S.runs : 0; S = fresh(); S.runs = runs; }

  function walkBase(x, y) { var c = baseTile(x, y); return c === "." || c === "@" || c === ">" || c === "A" || c === "B"; }   // crevasse (~) and walls block
  function artAt(x, y) { for (var i = 0; i < S.arts.length; i++) { var a = S.arts[i]; if (!a.taken && !a.fallen && a.x === x && a.y === y) return a; } return null; }

  // enter the rigged vault — returns the TELL to read in the voice channel (n picks the line)
  function enter(n) { reset(); S.active = true; S.runs += 1; return { tell: TELLS[((n || 0) % TELLS.length + TELLS.length) % TELLS.length] }; }
  function leave() { if (S) S.active = false; }
  function active() { return !!(S && S.active); }
  function over() { return !!(S && (S.dead || S.escaped)); }

  // light the collapse: start the clock, drop the UN-TAKEN artifact into the crevasse (R3),
  // flag it to reappear deeper (recovery stub), and return the Tremor descriptor for the juice.
  function trip() {
    if (S.tripped) return null;
    S.tripped = true; S.clock = TUNE.ESCAPE_TURNS;
    var fell = null;
    S.arts.forEach(function (a) { if (!a.taken && !a.fallen) { a.fallen = true; fell = a; } });
    if (fell) S.fallenPending = { id: fell.id, name: fell.name, depth: TUNE.RECOVERY_DEPTH };
    return {
      tremor: true, severity: TUNE.TREMOR,
      tile: { x: S.player.x, y: S.player.y },
      float: "EXPEDITED EGRESS, per ordinance.",          // Bureau, momentous (TD_VOICES.IMPACT-style)
      fell: fell ? { id: fell.id, name: fell.name, x: fell.x, y: fell.y } : null,
      lines: ["A THRESHOLD TREMOR — the vault begins to fold itself shut."].concat(
        fell ? [fell.name + " tumbles into the crevasse, into the dark below. (You will find it again, deeper — level " + (TUNE.RECOVERY_DEPTH) + ".)"] : [])
    };
  }

  function tick() {   // one turn of the collapse; returns true on the turn it crushes you
    if (!S.tripped || S.dead || S.escaped) return false;
    S.clock -= 1;
    if (S.clock <= 0) { S.clock = 0; S.dead = true; return true; }
    return false;
  }

  // grab the artifact underfoot -> carry it (ONE only) and LIGHT THE COLLAPSE. Returns the trip ev.
  function get() {
    if (!S.active || over()) return { got: false };
    var a = artAt(S.player.x, S.player.y);
    if (!a) return { got: false };
    if (S.carried) return { got: false, reason: "You can carry only one through a collapse." };
    a.taken = true; S.carried = { id: a.id, name: a.name };
    var ev = trip();
    return { got: true, carried: S.carried, ev: ev };
  }

  // move on the vault grid. Each step is a turn: when tripped, the clock ticks; reaching the exit
  // while tripped ESCAPES (peril ends); the clock hitting zero CRUSHES you.
  function move(dir) {
    if (!S.active || over()) return { moved: false };
    var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
    var d = D[dir]; if (!d) return { moved: false };
    var nx = S.player.x + d[0], ny = S.player.y + d[1];
    if (!walkBase(nx, ny)) return { moved: false };
    S.player.x = nx; S.player.y = ny;
    var crushed = tick();
    var res = { moved: true, clock: S.clock };
    if (S.tripped && !S.dead && nx === EXIT.x && ny === EXIT.y) {
      S.escaped = true;
      res.escaped = true; res.relief = true; res.carried = S.carried;
      res.float = "EGRESS STAMPED.";                       // the §24 ebb — relief beat
      res.lines = ["You clear the threshold as it seals behind you. " + (S.carried ? "You still hold " + S.carried.name + "." : "Empty-handed, but breathing.")];
    } else if (crushed) {
      res.dead = true;
      res.float = "SUMMARILY VOIDED.";                     // death-as-disclosure
      res.lines = ["The vault finishes folding. The Bureau will record the cause as 'over-ambition.'"];
    }
    return res;
  }

  function view() {
    return {
      w: W, h: H, rows: ROWS, base: baseTile,
      player: { x: S.player.x, y: S.player.y },
      arts: S.arts.map(function (a) { return { id: a.id, name: a.name, x: a.x, y: a.y, taken: a.taken, fallen: a.fallen }; }),
      crevasse: CREV.slice(), exit: { x: EXIT.x, y: EXIT.y }, entry: { x: ENTRY.x, y: ENTRY.y },
      tripped: S.tripped, clock: S.clock, escapeTurns: TUNE.ESCAPE_TURNS, carried: S.carried,
      dead: S.dead, escaped: S.escaped, fallenPending: S.fallenPending, runs: S.runs
    };
  }

  reset();
  return {
    TUNE: TUNE, enter: enter, leave: leave, active: active, over: over,
    move: move, get: get, tick: tick, trip: trip, view: view,
    _state: function () { return S; }
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_SMASHGRAB; }
