// Sunset Courier — the HUD: altitude, speed, heading and compass,
// throttle, fuel, score, warnings, and the lit instrument cluster shown
// in cockpit view, plus the menu / pause / end screens.
(function () {
  'use strict';

  const SC = window.SunsetCourier;
  const clamp = SC.clamp;

  function createHud() {
    const el = {};
    const ids = [
      'hud', 'alt', 'speed', 'heading', 'compass', 'throttle', 'fuel', 'score',
      'vspeed', 'gear', 'flaps', 'warning', 'message', 'objective',
      'instruments', 'menu', 'pauseScreen', 'endScreen', 'endTitle',
      'endLines', 'endScore', 'missionName', 'clock',
    ];
    for (const id of ids) el[id] = document.getElementById(id);

    const ictx = el.instruments ? el.instruments.getContext('2d') : null;

    function compassStrip(deg) {
      // A 120-degree window of ticks at fixed headings, so the cardinal
      // points and degree numbers slide through as the plane turns.
      const marks = [];
      const base = Math.floor((deg - 60) / 15) * 15;
      for (let h = base; h <= deg + 60; h += 15) {
        const wrapped = ((h % 360) + 360) % 360;
        let offset = wrapped - deg;
        if (offset > 180) offset -= 360;
        if (offset < -180) offset += 360;
        if (Math.abs(offset) > 60) continue;
        const label = wrapped % 90 === 0 ? ['N', 'E', 'S', 'W'][(wrapped / 90) % 4] : wrapped % 45 === 0 ? String(wrapped) : '';
        marks.push({ offset, label, major: wrapped % 45 === 0 });
      }
      return marks;
    }

    function drawCompass(deg) {
      if (!el.compass) return;
      let html = '';
      for (const m of compassStrip(deg)) {
        const left = 50 + (m.offset / 60) * 44;
        html += '<span class="ctick' + (m.major ? ' major' : '') + '" style="left:' + left.toFixed(1) + '%">' + (m.label || '·') + '</span>';
      }
      el.compass.innerHTML = html + '<span class="cneedle">▼</span>';
    }

    /** Lit instrument cluster: attitude, airspeed, altimeter, fuel, ball. */
    function drawInstruments(s) {
      if (!ictx || !el.instruments) return;
      const c = ictx;
      const W = el.instruments.width;
      const H = el.instruments.height;
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(12, 16, 22, 0.82)';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255, 210, 140, 0.55)';
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, W - 1, H - 1);

      // Attitude indicator (left): sky/brown ball rolled and pitched.
      const ax = 62;
      const ay = 62;
      const ar = 44;
      c.save();
      c.beginPath();
      c.arc(ax, ay, ar, 0, Math.PI * 2);
      c.clip();
      c.translate(ax, ay);
      c.rotate(-s.roll);
      const pitchPx = clamp(s.pitch, -0.5, 0.5) * 90;
      c.fillStyle = '#3a6ea8';
      c.fillRect(-ar - 4, -ar - 4 - pitchPx, ar * 2 + 8, ar + 4 + pitchPx);
      c.fillStyle = '#7a5230';
      c.fillRect(-ar - 4, -pitchPx, ar * 2 + 8, ar + 4 + pitchPx);
      c.strokeStyle = '#f5f2e8';
      c.beginPath();
      c.moveTo(-ar, -pitchPx);
      c.lineTo(ar, -pitchPx);
      c.stroke();
      c.restore();
      // Fixed wings marker.
      c.strokeStyle = '#ffd27a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ax - 26, ay);
      c.lineTo(ax - 8, ay);
      c.moveTo(ax + 8, ay);
      c.lineTo(ax + 26, ay);
      c.stroke();
      c.fillStyle = '#ffd27a';
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('ATT', ax, ay + ar + 14);

      // Airspeed tape (middle).
      const spd = Math.round(s.speed * 3.6);
      c.fillStyle = '#f5f2e8';
      c.font = 'bold 22px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(spd, 150, 48);
      c.font = '11px system-ui, sans-serif';
      c.fillStyle = '#9fb4c4';
      c.fillText('KM/H', 150, 66);
      c.strokeStyle = '#4a6a80';
      c.beginPath();
      c.moveTo(150, 76);
      c.lineTo(150, 118);
      c.stroke();
      c.fillStyle = spd < 95 ? '#ff5a4a' : '#59ff7a';
      c.fillRect(146, 76 + (1 - clamp(spd / 260, 0, 1)) * 42, 8, 4);

      // Altimeter (right): needle over a dial.
      const alt = Math.round(s.altitude);
      c.fillStyle = '#f5f2e8';
      c.font = 'bold 22px system-ui, sans-serif';
      c.fillText(alt, 252, 48);
      c.font = '11px system-ui, sans-serif';
      c.fillStyle = '#9fb4c4';
      c.fillText('ALT M', 252, 66);
      c.save();
      c.translate(252, 96);
      c.strokeStyle = '#4a6a80';
      c.beginPath();
      c.arc(0, 0, 22, 0, Math.PI * 2);
      c.stroke();
      const a = -Math.PI / 2 + (clamp(s.altitude, 0, 500) / 500) * Math.PI * 2;
      c.strokeStyle = '#ffd27a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
      c.stroke();
      c.restore();

      // Fuel gauge and turn ball (bottom row).
      c.fillStyle = '#9fb4c4';
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText('FUEL', 18, 140);
      c.fillStyle = '#22303c';
      c.fillRect(60, 130, 120, 10);
      c.fillStyle = s.fuel < 20 ? '#ff5a4a' : '#59ff7a';
      c.fillRect(60, 130, 120 * clamp(s.fuel / 100, 0, 1), 10);
      c.fillStyle = '#f5f2e8';
      c.fillText(Math.round(s.fuel) + '%', 188, 140);
      c.fillStyle = '#9fb4c4';
      c.fillText('TURN', 232, 140);
      c.fillStyle = '#22303c';
      c.beginPath();
      c.arc(272, 134, 9, 0, Math.PI * 2);
      c.fill();
      const ballX = 272 + clamp(-s.roll * 18, -7, 7);
      c.fillStyle = '#ffd27a';
      c.beginPath();
      c.arc(ballX, 134, 4, 0, Math.PI * 2);
      c.fill();
    }

    let lastHud = 0;
    function update(s, now) {
      if (!el.hud) return;
      if (now - lastHud < 90) return; // ~11 Hz is plenty for the DOM
      lastHud = now;
      el.alt.textContent = Math.round(s.altitude) + ' m';
      el.speed.textContent = Math.round(s.speed * 3.6) + ' km/h';
      const deg = Math.round(s.heading);
      el.heading.textContent = deg + '° ' + SC.compassPoint(deg);
      drawCompass(deg);
      el.throttle.textContent = Math.round(s.throttle * 100) + '%';
      el.fuel.textContent = Math.round(s.fuel) + '%';
      el.fuel.classList.toggle('low', s.fuel < 20);
      el.score.textContent = s.score;
      el.vspeed.textContent = (s.verticalSpeed >= 0 ? '+' : '') + s.verticalSpeed.toFixed(1) + ' m/s';
      el.gear.textContent = s.gearDown ? 'GEAR DOWN' : 'GEAR UP';
      el.gear.classList.toggle('warn', !s.gearDown && !s.onGround);
      el.flaps.textContent = s.flaps > 0.5 ? 'FLAPS DOWN' : 'FLAPS UP';
      el.clock.textContent = SC.formatTime(s.time);
      if (s.stalled) {
        el.warning.textContent = 'STALL — NOSE DOWN, ADD POWER';
        el.warning.classList.add('show');
      } else if (s.engineOut) {
        el.warning.textContent = 'FUEL EMPTY — GLIDE TO THE RUNWAY';
        el.warning.classList.add('show');
      } else {
        el.warning.classList.remove('show');
      }
      if (s.cockpit) drawInstruments(s);
    }

    let messageTimer = null;
    function showMessage(text, ms) {
      if (!el.message) return;
      el.message.textContent = text;
      el.message.classList.add('show');
      if (messageTimer) clearTimeout(messageTimer);
      messageTimer = setTimeout(() => el.message.classList.remove('show'), ms || 2600);
    }

    function setObjective(text) {
      if (el.objective) el.objective.textContent = text;
    }

    function show(screen) {
      // screen: 'menu' | 'flying' | 'paused' | 'over'
      if (el.menu) el.menu.classList.toggle('hidden', screen !== 'menu');
      if (el.pauseScreen) el.pauseScreen.classList.toggle('hidden', screen !== 'paused');
      if (el.endScreen) el.endScreen.classList.toggle('hidden', screen !== 'over');
      if (el.hud) el.hud.classList.toggle('hidden', screen === 'menu');
    }

    function showEnd(title, lines, score) {
      if (el.endTitle) el.endTitle.textContent = title;
      if (el.endLines) el.endLines.innerHTML = lines.map((l) => '<div>' + l + '</div>').join('');
      if (el.endScore) el.endScore.textContent = 'Score: ' + score;
      show('over');
    }

    function setMissionName(name) {
      if (el.missionName) el.missionName.textContent = name;
    }

    return {
      update,
      showMessage,
      setObjective,
      show,
      showEnd,
      setMissionName,
      drawInstruments,
    };
  }

  SC.Hud = { createHud };
})();
