// Tourist Dungeon engine — the state-graph interpreter (playable layer).
// A generic, text-rendering walker over a world-graph: render the current node,
// offer the takeable outgoing edges as choices (objective signals telegraph
// one-ways BEFORE you commit — LAW-7 in play), track flags/day/visited, and
// recognise completion when every required node has been visited (a walked One
// True Run). Classic script: assigns the global TD_INTERP.
"use strict";

var TD_INTERP = (function () {

  function yl(w) { return w.year_length || 365; }
  function ad(w) { return w.arrival_day || 1; }

  function create(world) {
    var required = [];
    Object.keys(world.nodes).forEach(function (n) { if (world.nodes[n].required) required.push(n); });

    var state = {
      node: world.start,
      flags: new Set(),
      day: ad(world),
      visited: new Set([world.start]),
      visitedRequired: new Set(required.indexOf(world.start) >= 0 ? [world.start] : []),
      log: []
    };

    function outEdges(node) { return world.edges.filter(function (e) { return e.from === node; }); }

    function takeable(e) {
      var reqs = e.requires || [];
      for (var i = 0; i < reqs.length; i++) { if (!state.flags.has(reqs[i])) return { ok: false, reason: "needs " + reqs[i].replace(/_/g, " ") }; }
      if (e.window) {
        if (!(e.window[0] <= state.day && state.day <= e.window[1])) {
          return { ok: false, reason: "opens only on days " + e.window[0] + "–" + e.window[1] + " (today is day " + state.day + ")" };
        }
      }
      return { ok: true };
    }

    // OBJ signals that telegraph a given edge (the honest tell, shown before commit)
    function objTellsFor(edgeId) {
      var sigs = world.signals || {};
      var out = [];
      Object.keys(sigs).forEach(function (k) {
        if (sigs[k].channel === "OBJ" && sigs[k].telegraphs === edgeId && sigs[k].text) out.push(sigs[k].text);
      });
      return out;
    }

    function requiredRemaining() {
      return required.filter(function (n) { return !state.visitedRequired.has(n); });
    }

    function isComplete() { return requiredRemaining().length === 0; }

    function view() {
      var nodeMeta = world.nodes[state.node] || {};
      var opts = outEdges(state.node).map(function (e) {
        var t = takeable(e);
        return {
          id: e.id,
          label: e.label || ("Go to " + e.to),
          to: e.to,
          one_way: !!e.one_way,
          tells: objTellsFor(e.id),
          takeable: t.ok,
          reason: t.ok ? null : t.reason
        };
      });
      return {
        node: state.node,
        title: nodeMeta.title || state.node,
        desc: nodeMeta.desc || "",
        level: nodeMeta.level,
        day: state.day,
        options: opts,
        requiredTotal: required.length,
        requiredDone: state.visitedRequired.size,
        requiredRemaining: requiredRemaining(),
        complete: isComplete()
      };
    }

    function choose(edgeId) {
      var here = outEdges(state.node);
      var e = null;
      for (var i = 0; i < here.length; i++) { if (here[i].id === edgeId) { e = here[i]; break; } }
      if (!e) return { ok: false, reason: "no such way from here" };
      var t = takeable(e);
      if (!t.ok) return { ok: false, reason: t.reason };
      state.day = Math.min(state.day + 1, yl(world) + 1);
      (e.grants || []).forEach(function (g) { state.flags.add(g); });
      state.node = e.to;
      state.visited.add(e.to);
      if (world.nodes[e.to] && world.nodes[e.to].required) state.visitedRequired.add(e.to);
      state.log.push(e.id);
      return { ok: true, to: e.to, complete: isComplete() };
    }

    return {
      world: world,
      state: state,
      view: view,
      choose: choose,
      isComplete: isComplete,
      requiredRemaining: requiredRemaining
    };
  }

  return { create: create };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_INTERP; }
