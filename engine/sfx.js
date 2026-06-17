// Tourist Dungeon — TD_SFX: a THROWAWAY procedural sound stub for the §24 fun-test (sibling of
// TD_SMASHGRAB / TD_CONTRAPTION, NOT canon; it graduates to a real engine audio module later).
// Pure Web Audio — oscillators + a noise burst, NO asset files. The AudioContext is created lazily
// and unlocked on the first user gesture (browser autoplay policy); with no audio available
// (headless), every cue still RECORDS itself so tests can assert the hooks fire without testing
// audio output. On/off + volume tunables. Assigns global TD_SFX.
"use strict";

var TD_SFX = (function () {
  var ctx = null, master = null, enabled = true, vol = 0.35, fired = [];

  function unlock() {
    if (ctx) { if (ctx.state === "suspended" && ctx.resume) { try { ctx.resume(); } catch (e) {} } return; }
    try {
      var AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    } catch (e) { ctx = null; master = null; }
  }

  function setEnabled(on) { enabled = !!on; }
  function isEnabled() { return enabled; }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; }
  function volume() { return vol; }
  function lastCues() { return fired.slice(-16); }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ctx) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      g.gain.setValueAtTime(Math.max(0.0001, (gain || 0.5)), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master || ctx.destination); o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function noise(dur, gain) {
    if (!ctx) return;
    try {
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);   // decaying hiss
      var n = ctx.createBufferSource(); n.buffer = b;
      var g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(Math.max(0.0001, gain || 0.4), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(g); g.connect(master || ctx.destination); n.start(t); n.stop(t + dur);
    } catch (e) {}
  }

  // each cue is a tiny procedural one-shot — telegraph & punctuate, never blind/deafen
  var CUES = {
    step:   function () { tone(150, 0.05, "square", 0.10); },                                  // dry footstep tick
    loot:   function () { tone(620, 0.07, "triangle", 0.22); tone(960, 0.10, "triangle", 0.16); }, // bright pickup
    grab:   function () { tone(240, 0.20, "sawtooth", 0.34, 90); noise(0.12, 0.22); },         // the artifact STING
    rumble: function () { tone(48, 0.55, "sine", 0.40); noise(0.5, 0.20); },                   // low collapse rumble
    grind:  function () { noise(0.10, 0.16); tone(72, 0.10, "square", 0.14, 58); },            // repeating stone grind
    slam:   function () { noise(0.28, 0.6); tone(46, 0.32, "square", 0.5, 30); },              // heavy SLAB seal
    chime:  function () { tone(880, 0.14, "sine", 0.30); tone(1320, 0.24, "sine", 0.22); },    // bright escape
    thud:   function () { tone(80, 0.20, "sine", 0.42); noise(0.14, 0.3); }                    // dull caught
  };

  // cue(name) — record the hook (always, so "did it fire?" is testable) and play it if enabled+audio
  function cue(name) {
    fired.push(name);
    if (!enabled) return;
    if (!ctx) unlock();
    var f = CUES[name]; if (f) f();
  }

  return {
    unlock: unlock, cue: cue, setEnabled: setEnabled, isEnabled: isEnabled,
    setVolume: setVolume, volume: volume, lastCues: lastCues, CUES: CUES,
    _hasAudio: function () { return !!ctx; }
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_SFX; }
