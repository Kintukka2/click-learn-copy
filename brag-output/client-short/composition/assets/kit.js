/* Steplight film kit: small pure helpers shared by the scenes. Everything is a function of timeline time. */
(function () {
  // A plate is a 2x capture of a 1440x900 screen (2880x1800 px). cam(s, cx, cy, fx, fy) returns the
  // transform that shows CSS point (cx, cy) at frame point (fx, fy) with plate scale s (s = 1 is 2x UI).
  function cam(s, cx, cy, fx, fy) {
    fx = fx === undefined ? 960 : fx;
    fy = fy === undefined ? 540 : fy;
    var x = fx - 2 * cx * s;
    var y = fy - 2 * cy * s;
    // keep the plate covering the frame
    x = Math.min(0, Math.max(1920 - 2880 * s, x));
    y = Math.min(0, Math.max(1080 - 1800 * s, y));
    return { x: x, y: y, scale: s };
  }
  // Where a CSS point of the screen lands in the frame for a given camera.
  function toFrame(c, cx, cy) {
    return { x: c.x + 2 * cx * c.scale, y: c.y + 2 * cy * c.scale };
  }
  // A box in plate pixels from a CSS box, with padding in CSS px.
  function plateBox(el, b, pad) {
    pad = pad || 0;
    el.style.left = 2 * (b.x - pad) + "px";
    el.style.top = 2 * (b.y - pad) + "px";
    el.style.width = 2 * (b.w + 2 * pad) + "px";
    el.style.height = 2 * (b.h + 2 * pad) + "px";
  }
  // Typing driven by time: returns an updater for tl.time().
  function typer(el, text, t0, cps, caret) {
    var chars = Array.from(text);
    return function (t) {
      var n = Math.max(0, Math.min(chars.length, Math.floor((t - t0) * cps + 1e-6)));
      if (t < t0) n = 0;
      el.textContent = chars.slice(0, n).join("") + (caret && n < chars.length && t >= t0 ? "|" : "");
    };
  }
  // A slot-machine word: shows options[i] for each [time, index] pair.
  function roller(el, options, times) {
    return function (t) {
      var idx = 0;
      for (var i = 0; i < times.length; i++) if (t >= times[i][0]) idx = times[i][1];
      if (el.__i !== idx) {
        el.innerHTML = options[idx];
        el.__i = idx;
      }
    };
  }
  // Counter driven by time.
  function counter(el, from, to, t0, dur, fmt) {
    return function (t) {
      var p = Math.max(0, Math.min(1, (t - t0) / dur));
      p = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt ? fmt(from + (to - from) * p) : String(Math.round(from + (to - from) * p));
    };
  }
  // Run every updater whenever the timeline renders (seek-safe).
  function drive(tl, updaters) {
    var run = function () {
      var t = tl.time();
      for (var i = 0; i < updaters.length; i++) updaters[i](t);
    };
    tl.eventCallback("onUpdate", run);
    run();
    return run;
  }
  window.SL = { cam: cam, toFrame: toFrame, plateBox: plateBox, typer: typer, roller: roller, counter: counter, drive: drive };
})();
