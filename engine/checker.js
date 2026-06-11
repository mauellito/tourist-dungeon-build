// Tourist Dungeon engine — the checker (JS).
// Faithful port of the six obligations in design/checker-spec.md and the
// reference oracle tests/checker_ref.py. A generated dungeon must pass all six
// before it is allowed to ship. Classic script: assigns the global TD_CHECK.
//
// This is the in-engine checker so the game can self-verify. The Python
// reference (tests/checker_ref.py) is run independently in tests as a second
// opinion; the two must always agree.
"use strict";

var TD_CHECK = (function () {

  function yl(w) { return w.year_length || 365; }
  function ad(w) { return w.arrival_day || 1; }
  function edgesFrom(w, node) { return w.edges.filter(function (e) { return e.from === node; }); }

  function subset(a, bSet) { for (var i = 0; i < a.length; i++) { if (!bSet.has(a[i])) return false; } return true; }
  function union(flagsSet, arr) { var s = new Set(flagsSet); (arr || []).forEach(function (x) { s.add(x); }); return s; }
  function hasWindows(w) { return w.edges.some(function (e) { return e.window; }); }
  // Day only matters when some edge is windowed; otherwise collapse it out of
  // the state key so the search space does not multiply by the calendar.
  function keyOf(node, flags, day, hw) {
    return node + "|" + Array.from(flags).sort().join(",") + "|" + (hw ? day : 0);
  }

  function canTake(e, flags, day, respectWindows) {
    if (!subset(e.requires || [], flags)) return false;
    if (respectWindows && e.window) { if (!(e.window[0] <= day && day <= e.window[1])) return false; }
    return true;
  }

  // reachable nodes/states from a starting (node,flags,day)
  function reachFrom(w, startNode, startFlags, startDay, respectWindows) {
    var cap = yl(w) + 1;
    var hw = hasWindows(w);
    var seen = new Set([keyOf(startNode, startFlags, startDay, hw)]);
    var stack = [[startNode, startFlags, startDay]];
    var nodes = new Set([startNode]);
    var states = [[startNode, startFlags, startDay]];
    while (stack.length) {
      var cur = stack.pop();
      var node = cur[0], flags = cur[1], day = cur[2];
      var outs = edgesFrom(w, node);
      for (var i = 0; i < outs.length; i++) {
        var e = outs[i];
        if (!canTake(e, flags, day, respectWindows)) continue;
        var nd = Math.min(day + 1, cap);
        var nf = union(flags, e.grants);
        nodes.add(e.to);
        var k = keyOf(e.to, nf, nd, hw);
        if (!seen.has(k)) { seen.add(k); stack.push([e.to, nf, nd]); states.push([e.to, nf, nd]); }
      }
    }
    return { nodes: nodes, states: states };
  }

  function requiredSet(w) {
    var s = new Set();
    Object.keys(w.nodes).forEach(function (n) { if (w.nodes[n].required) s.add(n); });
    return s;
  }

  function reachableNodes(w, respectWindows) {
    return reachFrom(w, w.start, new Set(), ad(w), respectWindows).nodes;
  }

  function inter(setA, setB) { var s = new Set(); setA.forEach(function (x) { if (setB.has(x)) s.add(x); }); return s; }
  function isSubset(a, b) { var ok = true; a.forEach(function (x) { if (!b.has(x)) ok = false; }); return ok; }
  function setEq(a, b) { return a.size === b.size && isSubset(a, b); }

  // OBL-01
  function reachability(w) { return isSubset(requiredSet(w), reachableNodes(w, true)); }

  // OBL-04
  function temporalWindows(w) {
    var req = requiredSet(w);
    return setEq(inter(req, reachableNodes(w, true)), inter(req, reachableNodes(w, false)));
  }

  // OBL-03
  function noOrphanedSignals(w) {
    var sigs = w.signals || {};
    var byId = {}; w.edges.forEach(function (e) { byId[e.id] = e; });
    var ids = Object.keys(sigs);
    for (var i = 0; i < ids.length; i++) {
      var s = sigs[ids[i]];
      var tel = s.telegraphs == null ? null : s.telegraphs;
      if (tel !== null && !byId[tel]) return false;
      if (s.channel === "OBJ") {
        if (tel === null) return false;
        var e = byId[tel];
        var consequential = e.one_way || (e.requires && e.requires.length) || e.window;
        if (!consequential) return false;
      }
    }
    return true;
  }

  // OBL-02
  function noUnsignaledUnwinnable(w) {
    var all = reachFrom(w, w.start, new Set(), ad(w), true);
    var globalReq = inter(requiredSet(w), all.nodes);
    function objTelegraphs(eid) {
      var sigs = w.signals || {};
      return Object.keys(sigs).some(function (k) { return sigs[k].channel === "OBJ" && sigs[k].telegraphs === eid; });
    }
    for (var i = 0; i < w.edges.length; i++) {
      var e = w.edges[i];
      if (!e.one_way) continue;
      var dangerous = false;
      for (var j = 0; j < all.states.length; j++) {
        var st = all.states[j];
        if (st[0] !== e.from) continue;
        if (!canTake(e, st[1], st[2], true)) continue;
        var post = reachFrom(w, e.to, union(st[1], e.grants), Math.min(st[2] + 1, yl(w) + 1), true);
        var stranded = false;
        globalReq.forEach(function (r) { if (!post.nodes.has(r)) stranded = true; });
        if (stranded) { dangerous = true; break; }
      }
      if (dangerous && !objTelegraphs(e.id)) return false;
    }
    return true;
  }

  // OBL-05
  function sequence(w) {
    var granted = new Set();
    w.edges.forEach(function (e) { (e.grants || []).forEach(function (g) { granted.add(g); }); });
    for (var i = 0; i < w.edges.length; i++) {
      var reqs = w.edges[i].requires || [];
      for (var k = 0; k < reqs.length; k++) { if (!granted.has(reqs[k])) return false; }
    }
    var obtainable = new Set();
    var changed = true;
    while (changed) {
      changed = false;
      for (var j = 0; j < w.edges.length; j++) {
        var e = w.edges[j];
        if (subset(e.requires || [], obtainable)) {
          (e.grants || []).forEach(function (g) { if (!obtainable.has(g)) { obtainable.add(g); changed = true; } });
        }
      }
    }
    for (var m = 0; m < w.edges.length; m++) {
      var rr = w.edges[m].requires || [];
      for (var n = 0; n < rr.length; n++) { if (!obtainable.has(rr[n])) return false; }
    }
    return true;
  }

  // OBL-06 — returns a path (array of edge ids) visiting all required, or null.
  function solve(w) {
    var req = requiredSet(w);
    var cap = yl(w) + 1;
    var hw = hasWindows(w);
    var startVis = new Set(); if (req.has(w.start)) startVis.add(w.start);
    if (isSubset(req, startVis)) return [];
    function visKey(node, flags, day, vis) {
      return node + "|" + Array.from(flags).sort().join(",") + "|" + (hw ? day : 0) + "|" + Array.from(vis).sort().join(",");
    }
    var start = [w.start, new Set(), ad(w), startVis, []];
    var seen = new Set([visKey(start[0], start[1], start[2], start[3])]);
    var stack = [start];
    while (stack.length) {
      var cur = stack.pop();
      var node = cur[0], flags = cur[1], day = cur[2], vis = cur[3], path = cur[4];
      var outs = edgesFrom(w, node);
      for (var i = 0; i < outs.length; i++) {
        var e = outs[i];
        if (!canTake(e, flags, day, true)) continue;
        var nf = union(flags, e.grants);
        var nvis = new Set(vis); if (req.has(e.to)) nvis.add(e.to);
        var nd = Math.min(day + 1, cap);
        var npath = path.concat([e.id]);
        if (isSubset(req, nvis)) return npath;
        var k = visKey(e.to, nf, nd, nvis);
        if (!seen.has(k)) { seen.add(k); stack.push([e.to, nf, nd, nvis, npath]); }
      }
    }
    return null;
  }

  function oneTrueRun(w) { return solve(w) !== null; }

  var OBLIGATIONS = {
    reachability: reachability,
    no_unsignaled_unwinnable: noUnsignaledUnwinnable,
    no_orphaned_signals: noOrphanedSignals,
    temporal_windows: temporalWindows,
    sequence: sequence,
    one_true_run: oneTrueRun
  };

  function verify(w) {
    var results = {};
    var pass = true;
    Object.keys(OBLIGATIONS).forEach(function (k) {
      var ok = !!OBLIGATIONS[k](w);
      results[k] = ok;
      if (!ok) pass = false;
    });
    return { pass: pass, results: results };
  }

  return {
    verify: verify,
    solve: solve,
    requiredSet: requiredSet,
    OBLIGATIONS: OBLIGATIONS
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_CHECK; }
