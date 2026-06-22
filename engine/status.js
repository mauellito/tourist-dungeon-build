// Tourist Dungeon — TD_STATUS: a GENERIC, EXPANDABLE status-effect engine. A status is {id, turns}
// on a combatant (the player's meters, or a creature). Each turn the host TICKS the combatant's
// statuses; the registry DEF says what fires (DoT via ctx.hurt, regen via ctx.heal, fear via a flinch
// chance). New statuses drop in by adding a DEF — no engine changes. Durations + DoT/regen amounts are
// META (numeric, like HP/turn) and TUNABLE (FLAG); the player only ever SEES the feel-word.
"use strict";

var TD_STATUS = (function () {
  // registry (TUNABLE): word = the feel-word shown; dot = damage/turn; regen = heal/turn; curable = an
  // antidote clears it; flinch = chance/turn a feared actor's action falters; foeOnly = a creature self-buff.
  var DEFS = {
    poison: { word: "poisoned",      curable: true,  dot: 2 },
    bleed:  { word: "bleeding",      curable: false, dot: 3 },
    fear:   { word: "afraid",        curable: false, flinch: 0.30 },
    regen:  { word: "regenerating",  curable: false, regen: 5, foeOnly: true }
  };
  function list(c) { if (!c.statuses) c.statuses = []; return c.statuses; }
  function find(c, id) { if (!c || !c.statuses) return null; for (var i = 0; i < c.statuses.length; i++) if (c.statuses[i].id === id) return c.statuses[i]; return null; }
  function has(c, id) { return !!find(c, id); }
  function apply(c, id, turns) { if (!c || !DEFS[id]) return null; var s = find(c, id); if (s) { s.turns = Math.max(s.turns, turns); } else { list(c).push({ id: id, turns: turns }); } return find(c, id); }
  function clear(c, id) { if (!c || !c.statuses) return false; var n = c.statuses.length; c.statuses = c.statuses.filter(function (s) { return s.id !== id; }); return c.statuses.length < n; }
  function clearCurable(c) { if (!c || !c.statuses) return 0; var n = c.statuses.length; c.statuses = c.statuses.filter(function (s) { return !(DEFS[s.id] && DEFS[s.id].curable); }); return n - c.statuses.length; }
  // TICK: for each active status fire its effect (DoT/regen via ctx), decrement, expire at 0. Returns the
  // events { id, word, expired } the host turns into telegraphs. Effects are applied through ctx so the
  // engine itself touches no combat math.
  function tick(c, ctx) {
    ctx = ctx || {};
    if (!c || !c.statuses || !c.statuses.length) return [];
    var ev = [], keep = [];
    for (var i = 0; i < c.statuses.length; i++) {
      var s = c.statuses[i], d = DEFS[s.id]; if (!d) continue;
      if (d.dot && ctx.hurt) ctx.hurt(d.dot, s.id);
      if (d.regen && ctx.heal) ctx.heal(d.regen, s.id);
      ev.push({ id: s.id, word: d.word, ticked: true });
      s.turns -= 1;
      if (s.turns > 0) keep.push(s); else ev[ev.length - 1].expired = true;
    }
    c.statuses = keep;
    return ev;
  }
  function surface(c) { if (!c || !c.statuses) return []; return c.statuses.map(function (s) { return (DEFS[s.id] || {}).word || s.id; }); }
  function def(id) { return DEFS[id]; }
  function active(c) { return (c && c.statuses) ? c.statuses.slice() : []; }

  return { DEFS: DEFS, apply: apply, has: has, find: find, clear: clear, clearCurable: clearCurable, tick: tick, surface: surface, def: def, active: active };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_STATUS; }
