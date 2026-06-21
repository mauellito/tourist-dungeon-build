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

  // onomatopoeia in the municipal / death-verb register (flavour; EVENT channel — what happened),
  // keyed by the same severity CATEGORIES as TD_VOICES.IMPACT. This is the standalone FALLBACK; at
  // runtime apply() prefers the richer TD_VOICES bank so the float matches the event's severity.
  var ONO = {
    "glancing-hit": ["NOTED.", "FILED.", "LOGGED."],
    "solid-hit": ["PROCESSED.", "ASSESSED.", "STAMPED."],
    "crit": ["SUMMARILY VOIDED.", "STRUCK FROM THE ROLL.", "FINALISED."],
    "kill": ["VOIDED.", "DISCONTINUED.", "STRUCK OFF."],
    "player-hit": ["DOCKED.", "A DEMERIT.", "PENALISED."],
    "player-death": ["DECEASED — PERMITTED.", "FILED UNDER FINAL.", "STAMPED: CONCLUDED."],
    "pickup": ["ACQUIRED.", "REQUISITIONED.", "LOGGED IN."],
    "descend": ["DESCENT AUTHORISED.", "MIND THE STEP.", "DOWN ONE LEVEL."]
  };
  function ono(kind, n) { var p = ONO[kind] || ONO["solid-hit"]; return p[((n || 0) % p.length + p.length) % p.length]; }
  // pull a float word for a severity category — the TD_VOICES bank if present, else the fallback.
  function impactWord(cat, n) { return (typeof TD_VOICES !== "undefined" && TD_VOICES.impact) ? TD_VOICES.impact(cat, n) : ono(cat, n); }

  // tuning: durations (ms) and shake magnitudes (px) per intensity — all feedback resolves < 200ms
  var DUR = { flash: 140, float: 950, pop: 160, shake: 180, vignette: 220, step: 90, shimmer: 700 };
  var SHAKE = { soft: 2, med: 4, hard: 7 };
  var PULSE_GAP = 120;   // ms between banded hit-pulses (quick, sequential, never a strobe)

  // ---- the TESTABLE CORE: which hooks fire for an action event ----
  // ev fields (all optional, booleans unless noted): moved, attacked, killed, got, descended,
  // tookDamage, dead, crit. Returns an ordered list of hook ids (e.g. "shake:med","float:kill").
  // float hooks carry a SEVERITY CATEGORY (matching TD_VOICES.IMPACT): glancing-hit / solid-hit /
  // crit / kill / player-hit / player-death / pickup / descend — so the word matches the event.
  function feelFor(ev) {
    ev = ev || {};
    var hooks = [];
    if (ev.dead) { return ["shake:hard", "vignette", "shimmer:death", "float:player-death"]; }
    if (ev.killed) hooks.push(ev.crit ? "shake:hard" : "shake:med", "flash:target", ev.crit ? "float:crit" : "float:kill");
    else if (ev.attacked) hooks.push("shake:soft", "flash:target", ev.glancing ? "float:glancing-hit" : "float:solid-hit");
    if (ev.tookDamage) hooks.push("shake:soft", "vignette", "float:player-hit");
    if (ev.got) hooks.push("pop", "flash:self", "float:pickup");
    if (ev.descended) hooks.push("shimmer:descend", "float:descend");
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
      else if (kind === "flash") {
        var ft = arg === "self" ? self : tgt, col = ev.killed ? "critical" : "player";
        if (arg === "target" && typeof ev.band === "number") {
          // BANDED HIT-PULSE: N quick tile-pulses by damage as % of target max HP (1..5, capped).
          // band 0 == fully absorbed / de-minimis => one MUTED tick (deliberately NOT a band-1 pulse).
          if (ev.band <= 0) push("flash", now, DUR.flash, { tile: ft, color: "muted" });
          else { var nb = ev.band > 5 ? 5 : ev.band; for (var bi = 0; bi < nb; bi++) push("flash", now + bi * PULSE_GAP, DUR.flash, { tile: ft, color: col }); }
        } else push("flash", now, DUR.flash, { tile: ft, color: col });
      }
      else if (kind === "vignette") push("vignette", now, DUR.vignette, {});
      else if (kind === "pop") push("pop", now, DUR.pop, { tile: self });
      else if (kind === "step") push("step", now, DUR.step, {});
      else if (kind === "shimmer") push("shimmer", now, DUR.shimmer, { mode: arg });
      else if (kind === "float") {
        var fk = arg, str = impactWord(fk, n);   // contextual word from the voice bank (severity-matched)
        var col = (fk === "player-hit" || fk === "player-death") ? "dmgTaken" : (fk === "pickup" ? "item" : (fk === "descend" ? "signal" : "dmgDealt"));
        push("float", now, DUR.float, { tile: (fk === "player-hit" || fk === "player-death" || fk === "pickup" || fk === "descend") ? self : (tgt || self), text: str, color: col, fkind: fk });
      }
    });
    return hooks;
  }

  // active(now) — effects still running, each with progress p in [0,1]. hasActive drives the idle
  // guard: false => the renderer holds a single static frame (no rAF, no animation).
  function active(now) {
    var out = [];
    // p<0 => not started yet (a scheduled/staggered effect): hold it OUT until its t0, so banded
    // hit-pulses fire SEQUENTIALLY rather than all-at-once. p>=1 => finished.
    for (var i = 0; i < effects.length; i++) { var e = effects[i], p = (now - e.t0) / e.dur; if (p >= 0 && p < 1) { var o = {}; for (var k in e) o[k] = e[k]; o.p = p; out.push(o); } }
    return out;
  }
  // floats are CSS-driven (the DOM handles their rise/fade), so they do NOT keep the canvas loop
  // alive — only canvas effects (shake/flash/vignette/pop/step/shimmer) count toward "active".
  function hasActive(now) { for (var i = 0; i < effects.length; i++) { var e = effects[i]; if (e.kind !== "float" && (now - e.t0) < e.dur) return true; } return false; }
  function prune(now) { effects = effects.filter(function (e) { return (now - e.t0) < e.dur; }); }

  // exposed primitives so other modules (e.g. TD_SMASHGRAB) can fire feel directly:
  // a custom float-text, a shake, and a tile-flash — all honour the juice-off toggle.
  function floatText(tile, text, color, now) { if (enabled) push("float", now, DUR.float, { tile: tile, text: text, color: color || "dmgDealt", fkind: "custom" }); return text; }
  function shake(intensity, now) { if (enabled) push("shake", now, DUR.shake, { mag: SHAKE[intensity] || SHAKE.soft }); }
  function flash(tile, color, now) { if (enabled) push("flash", now, DUR.flash, { tile: tile, color: color || "critical" }); }

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
    floatText: floatText, shake: shake, flash: flash,
    lastHooks: function () { return lastHooks; }, _effects: function () { return effects; }, DUR: DUR, SHAKE: SHAKE
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_FEEL; }
