// Sunset Courier — all sounds are synthesised with WebAudio: engine hum
// tied to the throttle, wind tied to speed, a ring chime, a touchdown
// thud and a stall warning. No audio files, no network.
(function () {
  'use strict';

  const SC = window.SunsetCourier;
  const clamp = SC.clamp;

  function createAudio() {
    let ctx = null;
    let master = null;
    let engineOsc = null;
    let engineSub = null;
    let engineFilter = null;
    let engineGain = null;
    let windSource = null;
    let windFilter = null;
    let windGain = null;
    let muted = false;
    let started = false;

    function ensure() {
      if (ctx) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(ctx.destination);

        // Engine: a sawtooth plus a sub sine through a low-pass.
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 62;
        engineSub = ctx.createOscillator();
        engineSub.type = 'sine';
        engineSub.frequency.value = 31;
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 320;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineSub.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
        engineSub.start();

        // Wind: looped noise through a band-pass.
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        windSource = ctx.createBufferSource();
        windSource.buffer = buf;
        windSource.loop = true;
        windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 600;
        windFilter.Q.value = 0.6;
        windGain = ctx.createGain();
        windGain.gain.value = 0;
        windSource.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(master);
        windSource.start();
        started = true;
        return true;
      } catch (e) {
        ctx = null;
        return false;
      }
    }

    /** Call from a user gesture (menu click, key press). */
    function resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    }

    /** Continuous engine and wind, called every frame. */
    function update(throttle, speed, airborne) {
      if (!ctx || !started) return;
      const t = ctx.currentTime;
      const freq = 58 + throttle * 95 + speed * 0.35;
      engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      engineSub.frequency.setTargetAtTime(freq / 2, t, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + throttle * 900, t, 0.1);
      const target = airborne || throttle > 0.05 ? 0.045 + throttle * 0.085 : 0.0;
      engineGain.gain.setTargetAtTime(target, t, 0.12);
      const windTarget = clamp(speed / 70, 0, 1) * 0.11;
      windGain.gain.setTargetAtTime(windTarget, t, 0.15);
      windFilter.frequency.setTargetAtTime(350 + speed * 9, t, 0.15);
    }

    function tone(freq, dur, type, gain, when) {
      if (!ctx || !started) return;
      const t0 = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain || 0.16, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    /** Two-note chime when a ring is threaded. */
    function ringChime() {
      tone(880, 0.35, 'sine', 0.18, 0);
      tone(1318.5, 0.5, 'sine', 0.15, 0.09);
    }

    /** Low thud on touchdown; intensity 0..1. */
    function touchdown(intensity) {
      if (!ctx || !started) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t0);
      osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35 * intensity + 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.35);
    }

    /** Short square beep for the stall warning. */
    function stallBeep() {
      tone(660, 0.12, 'square', 0.05, 0);
    }

    /** Small click for menu buttons. */
    function click() {
      tone(1200, 0.07, 'sine', 0.08, 0);
    }

    function setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.9;
    }

    function isMuted() {
      return muted;
    }

    return {
      resume,
      update,
      ringChime,
      touchdown,
      stallBeep,
      click,
      setMuted,
      isMuted,
    };
  }

  SC.Audio = { createAudio };
})();
