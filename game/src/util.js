// Sunset Courier — small shared helpers: seeded random numbers and math.
// Every other game file reads these through the SunsetCourier namespace.
(function () {
  'use strict';

  /** Deterministic PRNG (mulberry32) so the valley is the same every load. */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function nextRandom() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Integer hash of a 2D grid point, stable for a given seed. */
  function hashGrid(ix, iz, seed) {
    let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
  }

  /** Smoothstep between two edges. */
  function smoothstep(edge0, edge1, x) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Move `value` toward `target` by at most `step`. */
  function approach(value, target, step) {
    if (value < target) return Math.min(target, value + step);
    if (value > target) return Math.max(target, value - step);
    return value;
  }

  /** Wrap an angle in radians to (-PI, PI]. */
  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle <= -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  /** Heading in degrees, 0 = north, clockwise. */
  function headingDegrees(yaw) {
    let deg = (-yaw * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  /** Compass point name for a heading in degrees. */
  function compassPoint(deg) {
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return points[Math.round(deg / 45) % 8];
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  const SC = (window.SunsetCourier = window.SunsetCourier || {});
  SC.makeRng = makeRng;
  SC.hashGrid = hashGrid;
  SC.smoothstep = smoothstep;
  SC.clamp = clamp;
  SC.lerp = lerp;
  SC.approach = approach;
  SC.wrapAngle = wrapAngle;
  SC.headingDegrees = headingDegrees;
  SC.compassPoint = compassPoint;
  SC.formatTime = formatTime;
})();
