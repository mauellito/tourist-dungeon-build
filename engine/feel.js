// Tourist Dungeon — TD_FEEL: the game-feel layer. A small, DOM-free, testable module that
// (1) maps a fundamental action to the set of feel HOOKS it fires (feelFor — the testable core),
// (2) schedules timed visual EFFECTS (shake / tile-flash / float-text / shimmer / vignette / step
// ease) the renderer reads each frame, and (3) holds the idle-stillness guard: when nothing is
// active, hasActive() is false and the renderer must NOT animate (motion = signal).
//
// All timing is injected (callers pass `now` in ms) so it is deterministic under test. No DOM, no
// colour literals — the renderer resolves hook colours through TD_UI.PALETTE. A sound layer can
// subscribe via onSound; absent one, nothing blocks. Classic script: assigns global TD_FEEL.
"use strict";

var TD_FEEL = (function () {
  var EASE = {
    linear: function (t) { return t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  };
  function ease(kind, t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return (EASE[kind] || EASE.linear)(t); }

  // onomatopoeia in the municipal / death-verb register (flavour; EVENT channel — what happened)
  var ONO = {
    hit: ["NOTED.", "FILED.", "STAMPED.", "PROCESSED.", "LOGGED.", "ASSESSED."],
    kill: ["VOIDED.", "STRUCK OFF.", "DISCONTINUED.", "CONCLUDED.", "EXPUNGED."],
    crit: ["SUMMARILY VOIDED.", "STRUCK FROM THE REGISTER.", "FINALISED."],
    hurt: ["DOCKED.", "DEMERIT.", "PENALISED."],
    item: ["ACQUIRED.", "REQUISITIONED.", "LOGGED IN."],
    death: ["DECEASED — PERMITTED.", "FILED UNDER FINAL.", "STAMPED: CONCLUDED."]
  };
  function ono(kind, n) { var p = ONO[kind] || ONO.hit; return p[((n || 0) % p.length + p.length) % p.length]; }

  // tuning: durations (ms) and shake magnitudes (px) per intensity — all feedback resolves < 200ms
  var DUR = { flash: 140, float: 950, pop: 160, shake: 180, vignette: 220, step: 90, shimmer: 700 };
  var SHAKE = { soft: 2, med: 4, hard: 7 };

  // ---- the TESTABLE CORE: which hooks fire for an action event ----
  // ev fields (all optional, booleans unless noted): moved, attacked, killed, got, descended,
  // tookDamage, dead, crit. Returns an ordered list of hook ids (e.g. "shake:med","float:kill").
  function feelFor(ev) {
    ev = ev || {};
    var hooks = [];
    if (ev.dead) { return ["shake:hard", "vignette", "shimmer:death", "float:death"]; }
    if (ev.killed) hooks.push(ev.crit ? "shake:hard" : "shake:med", "flash:target", ev.crit ? "float:crit" : "float:kill");
    else if (ev.attacked) hooks.push("shake:soft", "flash:target", "float:hit");
    if (ev.tookDamage) hooks.push("shake:soft", "vignette", "float:hurt");
    if (ev.got) hooks.push("pop", "flash:self", "float:item");
    if (ev.descended) hooks.push("shimmer:descend");
    if (ev.moved && !ev.attacked && !ev.tookDamage && !ev.got) hooks.push("step");
    return hooks;
  }

  // ---- effect scheduling (what the renderer reads) ----
  var effects = [], enabled = true, soundCb = null, lastHooks = [];
  function onSound(cb) { soundCb = cb; }            // a sound layer subscribes here; absent -> no-op
  function setEnabled(on) { enabled = !!on; if (!enabled) effects.length = 0; }   // "juice off" toggle
  function isEnabled() { return enabled; }
  function clear() { effects.length = 0; }

  function push(kind, now, dur, data) { var e = { kind: kind, t0: now, dur: dur }; if (data) for (var key in data) e[key] = data[key]; effects.push(e); return e; }

  // apply(ev, now [, n]) — schedule the effects for an action and return the hook ids that fired.
  // n seeds onomatopoeia variety (pass a turn counter). When disabled, fires sound + returns hooks
  // but schedules NO visual effects (so "juice off" is still readable for telemetry).
  function apply(ev, now, n) {
    var hooks = feelFor(ev); lastHooks = hooks;
    var tgt = ev.target || null, self = ev.self || null;
    hooks.forEach(function (h) {
      if (soundCb) soundCb(h, ev);
      if (!enabled) return;
      var kind = h.split(":")[0], arg = h.split(":")[1];
      if (kind === "shake") push("shake", now, DUR.shake, { mag: SHAKE[arg] || SHAKE.soft });
      else if (kind === "flash") push("flash", now, DUR.flash, { tile: arg === "self" ? self : tgt, color: ev.killed ? "critical" : "player" });
      else if (kind === "vignette") push("vignette", now, DUR.vignette, {});
      else if (kind === "pop") push("pop", now, DUR.pop, { tile: self });
      else if (kind === "step") push("step", now, DUR.step, {});
      else if (kind === "shimmer") push("shimmer", now, DUR.shimmer, { mode: arg });
      else if (kind === "float") {
        var fk = arg, str = ono(fk, n), col = (fk === "hurt" || fk === "death") ? "dmgTaken" : (fk === "item" ? "item" : "dmgDealt");
        push("float", now, DUR.float, { tile: tgt || self, text: str, color: col, fkind: fk });
      }
    });
    return hooks;
  }

  // active(now) — effects still running, each with progress p in [0,1]. hasActive drives the idle
  // guard: false => the renderer holds a single static frame (no rAF, no animation).
  function active(now) {
    var out = [];
    for (var i = 0; i < effects.length; i++) { var e = effects[i], p = (now - e.t0) / e.dur; if (p < 1) { var o = {}; for (var k in e) o[k] = e[k]; o.p = p < 0 ? 0 : p; out.push(o); } }
    return out;
  }
  // floats are CSS-driven (the DOM handles their rise/fade), so they do NOT keep the canvas loop
  // alive — only canvas effects (shake/flash/vignette/pop/step/shimmer) count toward "active".
  function hasActive(now) { for (var i = 0; i < effects.length; i++) { var e = effects[i]; if (e.kind !== "float" && (now - e.t0) < e.dur) return true; } return false; }
  function prune(now) { effects = effects.filter(function (e) { return (now - e.t0) < e.dur; }); }

  // aggregate screen-shake offset {dx,dy} at time now (decays with each shake's progress)
  function shakeOffset(now) {
    var dx = 0, dy = 0;
    active(now).forEach(function (e) {
      if (e.kind !== "shake") return;
      var decay = 1 - e.p, amp = e.mag * decay;
      var ph = (now - e.t0) * 0.08;
      dx += Math.cos(ph * 1.7 + e.t0) * amp; dy += Math.sin(ph * 2.3 + e.t0) * amp;
    });
    return { dx: dx, dy: dy };
  }

  return {
    ease: ease, EASE: EASE, ono: ono, ONO: ONO, feelFor: feelFor, apply: apply,
    active: active, hasActive: hasActive, prune: prune, clear: clear, shakeOffset: shakeOffset,
    onSound: onSound, setEnabled: setEnabled, isEnabled: isEnabled,
    lastHooks: function () { return lastHooks; }, _effects: function () { return effects; }, DUR: DUR, SHAKE: SHAKE
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_FEEL; }
