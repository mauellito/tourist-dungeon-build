// Tourist Dungeon engine — topology metrics (Phase 3 tuning instrumentation).
// Quantifies "loop-feel" and structure so tuning is measurable and
// regression-guarded (bible §LOOP PRIMACY: the crawl loop is the product).
// Classic script: assigns the global TD_METRICS.
"use strict";

var TD_METRICS = (function () {

  function measure(w) {
    var nodeIds = Object.keys(w.nodes);
    var N = nodeIds.length;
    var E = w.edges.length;

    var oneWays = w.edges.filter(function (e) { return e.one_way; }).length;
    var windowed = w.edges.filter(function (e) { return e.window; }).length;

    var levels = 0;
    nodeIds.forEach(function (n) { var L = w.nodes[n].level; if (typeof L === "number" && L > levels) levels = L; });

    var required = nodeIds.filter(function (n) { return w.nodes[n].required; });

    // sealed pockets: required nodes whose every incoming edge is one-way
    // (i.e. reachable only by an irreversible arc — from elsewhere).
    var inEdges = {};
    w.edges.forEach(function (e) { (inEdges[e.to] = inEdges[e.to] || []).push(e); });
    var sealedPockets = required.filter(function (n) {
      var ins = inEdges[n] || [];
      return ins.length > 0 && ins.every(function (e) { return e.one_way; });
    }).length;

    // express shortcuts: edges leaving the start that jump to a deeper level.
    var startLevel = (w.nodes[w.start] && w.nodes[w.start].level) || 0;
    var express = w.edges.filter(function (e) {
      if (e.from !== w.start) return false;
      var lv = w.nodes[e.to] && w.nodes[e.to].level;
      return typeof lv === "number" && lv > startLevel + 1;
    }).length;

    // cyclomatic number E - N + components: independent cycles ("loop-feel").
    var cyclomatic = E - N + countComponents(w, nodeIds);

    return {
      nodes: N,
      edges: E,
      levels: levels,
      required: required.length,
      one_ways: oneWays,
      windowed: windowed,
      sealed_pockets: sealedPockets,
      express: express,
      cyclomatic: cyclomatic,
      avg_branching: Math.round((E / N) * 100) / 100
    };
  }

  // connected components over the UNDIRECTED projection (for the cycle count)
  function countComponents(w, nodeIds) {
    var adj = {};
    nodeIds.forEach(function (n) { adj[n] = []; });
    w.edges.forEach(function (e) {
      if (e.from === e.to) return; // ignore self-loops for components
      adj[e.from].push(e.to);
      adj[e.to].push(e.from);
    });
    var seen = {}, comps = 0;
    nodeIds.forEach(function (start) {
      if (seen[start]) return;
      comps++;
      var stack = [start];
      seen[start] = true;
      while (stack.length) {
        var n = stack.pop();
        adj[n].forEach(function (m) { if (!seen[m]) { seen[m] = true; stack.push(m); } });
      }
    });
    return comps;
  }

  return { measure: measure };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_METRICS; }
