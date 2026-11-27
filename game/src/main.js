// Sunset Courier — game wiring: renderer, input, camera, state machine,
// the frame loop and the deterministic shot presets used for screenshots.
(function () {
  'use strict';

  const SC = window.SunsetCourier;
  const clamp = SC.clamp;

  const SHOT_PRESETS = {
    // Chase view over the valley, runway ahead, HUD live.
    chase: { mission: 'rally', x: -140, y: 150, z: 620, yaw: 0.5, pitch: 0.02, speed: 58, throttle: 0.72, gearDown: true, camera: 'chase' },
    // Cockpit view, instruments lit, town and fields ahead.
    cockpit: { mission: 'rally', x: 260, y: 120, z: 250, yaw: -0.35, pitch: 0.0, speed: 52, throttle: 0.66, gearDown: true, camera: 'cockpit' },
    // Threading the third rally ring: lined up on its approach axis.
    ring: { mission: 'rally', x: -898, y: 113, z: -20, yaw: 2.48, pitch: 0.02, speed: 56, throttle: 0.7, gearDown: true, camera: 'chase', ringIndex: 2 },
    // Final approach: gear and flaps down, runway ahead.
    landing: { mission: 'landing', x: 0, y: 55, z: 700, yaw: 0, pitch: -0.05, speed: 40, throttle: 0.34, gearDown: true, flaps: 1, camera: 'chase' },
  };

  function startGame() {
    const container = document.getElementById('game');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
    camera.position.set(0, 60, 400);

    const terrain = SC.Terrain.buildValley(scene);
    const aircraft = SC.Aircraft.buildAircraft(scene);
    const flight = SC.Flight.createFlight(terrain);
    const missions = SC.Missions.createMissions(scene);
    const audio = SC.Audio.createAudio();
    const hud = SC.Hud.createHud();

    // ---- input -------------------------------------------------------
    const keys = {};
    const input = {
      elevator: 0, aileron: 0, rudder: 0,
      throttleUp: false, throttleDown: false,
      throttleMax: false, throttleCut: false,
    };
    const KEYMAP = {
      ArrowUp: 'elevatorUp', ArrowDown: 'elevatorDown',
      ArrowLeft: 'aileronLeft', ArrowRight: 'aileronRight',
      KeyA: 'rudderLeft', KeyD: 'rudderRight',
      KeyW: 'throttleUp', KeyS: 'throttleDown',
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys[e.code] = true;
      audio.resume();
      if (e.code === 'KeyF') toggleFlaps();
      if (e.code === 'KeyG') toggleGear();
      if (e.code === 'KeyC') toggleCamera();
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'KeyR') resetFlight();
      if (e.code === 'KeyM') toggleMute();
      if (e.code === 'Escape') backToMenu();
      if (e.code === 'Digit1') startMission('rally');
      if (e.code === 'Digit2') startMission('landing');
      if (e.code === 'Digit3') startMission('courier');
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      for (const k of Object.keys(keys)) keys[k] = false;
    });
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.querySelectorAll('[data-mission]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.resume();
        audio.click();
        startMission(btn.getAttribute('data-mission'));
      });
    });
    const resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) resumeBtn.addEventListener('click', () => { audio.click(); togglePause(); });
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', () => { audio.click(); backToMenu(); });
    const againBtn = document.getElementById('againBtn');
    if (againBtn) againBtn.addEventListener('click', () => { audio.click(); startMission(currentMission); });
    const endMenuBtn = document.getElementById('endMenuBtn');
    if (endMenuBtn) endMenuBtn.addEventListener('click', () => { audio.click(); backToMenu(); });

    function readInput() {
      input.elevator = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
      input.aileron = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      input.rudder = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      input.throttleUp = !!keys.KeyW;
      input.throttleDown = !!keys.KeyS;
      input.throttleMax = !!keys.ShiftLeft || !!keys.ShiftRight;
      input.throttleCut = !!keys.ControlLeft || !!keys.ControlRight;
    }

    // ---- game state --------------------------------------------------
    let screen = 'menu'; // menu | flying | paused | over
    let currentMission = 'rally';
    let cameraMode = 'chase'; // chase | cockpit
    let muted = false;
    let score = 0;
    let missionTime = 0;
    let stallBeepAt = 0;
    const camPos = new THREE.Vector3(0, 60, 400);
    const camTarget = new THREE.Vector3(0, 30, 0);

    function toggleFlaps() {
      if (screen !== 'flying') return;
      flight.state.flapsTarget = flight.state.flapsTarget > 0.5 ? 0 : 1;
      hud.showMessage(flight.state.flapsTarget > 0.5 ? 'Flaps down' : 'Flaps up');
    }
    function toggleGear() {
      if (screen !== 'flying') return;
      flight.state.gearDown = !flight.state.gearDown;
      hud.showMessage(flight.state.gearDown ? 'Gear down' : 'Gear up — mind the belly');
    }
    function toggleCamera() {
      if (screen !== 'flying') return;
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
      document.getElementById('instruments').classList.toggle('hidden', cameraMode !== 'cockpit');
      hud.showMessage(cameraMode === 'cockpit' ? 'Cockpit view' : 'Chase view');
    }
    function toggleMute() {
      muted = !muted;
      audio.setMuted(muted);
      hud.showMessage(muted ? 'Sound muted (M to unmute)' : 'Sound on');
    }
    function togglePause() {
      if (screen === 'flying') {
        screen = 'paused';
        hud.show('paused');
      } else if (screen === 'paused') {
        screen = 'flying';
        hud.show('flying');
      }
    }
    function backToMenu() {
      if (screen === 'menu') return;
      screen = 'menu';
      missions.clear();
      hud.show('menu');
    }
    function resetFlight() {
      if (screen !== 'flying' && screen !== 'over') return;
      startMission(currentMission);
    }

    function startMission(missionId) {
      currentMission = missionId;
      const m = missions.missions[missionId];
      flight.reset(m.start);
      missions.start(missionId, m.start);
      score = 0;
      missionTime = 0;
      screen = 'flying';
      hud.setMissionName(m.name);
      hud.setObjective(m.blurb);
      hud.show('flying');
      document.getElementById('instruments').classList.toggle('hidden', cameraMode !== 'cockpit');
      hud.showMessage(m.name + ' — ' + m.blurb, 4200);
      // Chase camera snaps behind the plane on (re)start.
      const basis = flight.orientationBasis();
      camPos.set(
        flight.state.x - basis.forward.x * 15 + basis.up.x * 4.5,
        flight.state.y - basis.forward.y * 15 + basis.up.y * 4.5 + 1,
        flight.state.z - basis.forward.z * 15 + basis.up.z * 4.5
      );
    }

    function endFlight(title, lines) {
      screen = 'over';
      hud.showEnd(title, lines, score);
    }

    function crashFlight(reason) {
      audio.touchdown(1);
      const lines = [
        'Mission: ' + missions.missions[currentMission].name,
        'Cause: ' + reason,
        'Rings: ' + (missions.active ? missions.active.ringsPassed + ' / ' + missions.active.rings.length : '0'),
        'Damage: ' + Math.round(flight.state.damage) + '% — the Kestrel will fly again after repairs.',
      ];
      endFlight('Crashed', lines);
    }

    function completeMission(reason) {
      const a = missions.active;
      const lines = [];
      if (a) {
        lines.push('Rings: ' + a.ringsPassed + ' / ' + a.rings.length + '  (+' + a.ringScore + ')');
        if (a.landed) lines.push('Landing bonus: +' + a.landingBonus);
        if (currentMission === 'courier') {
          lines.push('Time: ' + SC.formatTime(a.time) + ' (par ' + SC.formatTime(a.mission.parTime) + ')');
          lines.push('Fuel left: ' + Math.round(flight.state.fuel) + '%');
        }
        if (reason === 'rings') lines.push('All rings threaded. Clean flying.');
        if (reason === 'landed') lines.push('Down safe on Marigold Field.');
      }
      endFlight('Mission complete', lines);
    }

    // ---- shot presets (deterministic states for screenshots) ---------
    function applyShotPreset(name) {
      const p = SHOT_PRESETS[name];
      if (!p) return false;
      startMission(p.mission);
      const s = flight.state;
      s.x = p.x;
      s.y = p.y;
      s.z = p.z;
      s.yaw = p.yaw;
      s.pitch = p.pitch || 0;
      s.roll = 0;
      s.speed = p.speed;
      s.throttle = p.throttle;
      s.onGround = false;
      s.gearDown = p.gearDown;
      s.gearAnim = p.gearDown ? 1 : 0;
      s.flaps = p.flaps || 0;
      s.flapsTarget = p.flaps || 0;
      cameraMode = p.camera;
      document.getElementById('instruments').classList.toggle('hidden', cameraMode !== 'cockpit');
      if (p.ringIndex !== undefined && missions.active) {
        // Mark earlier rings done so the shot frames the live one.
        for (let i = 0; i < p.ringIndex; i++) {
          const r = missions.active.rings[i];
          if (r) {
            r.passed = true;
            r.mesh.material = new THREE.MeshBasicMaterial({ color: 0x59ff7a });
            r.halo.visible = false;
          }
        }
        missions.active.index = p.ringIndex;
        missions.active.ringsPassed = p.ringIndex;
        const live = missions.active.rings[p.ringIndex];
        if (live) live.mesh.material = new THREE.MeshBasicMaterial({ color: 0x37e6ff });
      }
      return true;
    }

    // ---- frame loop --------------------------------------------------
    const clock = { last: performance.now() };
    const planeMatrix = new THREE.Matrix4();
    const tmpRight = new THREE.Vector3();
    const tmpUp = new THREE.Vector3();
    const tmpFwd = new THREE.Vector3();

    function placeAircraftMesh() {
      const basis = flight.orientationBasis();
      tmpRight.set(basis.right.x, basis.right.y, basis.right.z);
      tmpUp.set(basis.up.x, basis.up.y, basis.up.z);
      tmpFwd.set(basis.forward.x, basis.forward.y, basis.forward.z);
      planeMatrix.makeBasis(tmpRight, tmpUp, tmpFwd);
      aircraft.group.quaternion.setFromRotationMatrix(planeMatrix);
      aircraft.group.position.set(flight.state.x, flight.state.y, flight.state.z);
    }

    function updateCamera(dt, time) {
      const s = flight.state;
      const basis = flight.orientationBasis();
      if (cameraMode === 'cockpit') {
        // Just ahead of the nose, clear of the canopy glass and above
        // the propeller disc (blades reach y 1.3), looking forward over
        // the spinner: the view a pilot actually gets.
        camera.position.set(
          s.x + basis.up.x * 1.6 + basis.forward.x * 3.0,
          s.y + basis.up.y * 1.6 + basis.forward.y * 3.0,
          s.z + basis.up.z * 1.6 + basis.forward.z * 3.0
        );
        camera.up.set(basis.up.x, basis.up.y, basis.up.z);
        camera.lookAt(
          s.x + basis.forward.x * 120,
          s.y + basis.forward.y * 120 - 3,
          s.z + basis.forward.z * 120
        );
      } else {
        const desired = new THREE.Vector3(
          s.x - basis.forward.x * 15 + basis.up.x * 4.2,
          s.y - basis.forward.y * 15 + basis.up.y * 4.2 + 0.8,
          s.z - basis.forward.z * 15 + basis.up.z * 4.2
        );
        const k = 1 - Math.exp(-5.5 * dt);
        camPos.lerp(desired, k);
        // Never let the camera sink under the terrain.
        const ground = terrain.heightAt(camPos.x, camPos.z) + 2.5;
        if (camPos.y < ground) camPos.y = ground;
        camera.position.copy(camPos);
        camera.up.set(0, 1, 0);
        camTarget.set(
          s.x + basis.forward.x * 26,
          s.y + basis.forward.y * 26 + 1,
          s.z + basis.forward.z * 26
        );
        camera.lookAt(camTarget);
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = clamp((now - clock.last) / 1000, 0.001, 0.05);
      clock.last = now;
      const time = now / 1000;

      terrain.update(dt);
      aircraft.spinPropeller(dt, flight.state.throttle);
      aircraft.blinkStrobe(time);

      if (screen === 'flying') {
        readInput();
        const events = flight.update(dt, input);
        missionTime += dt;
        if (flight.state.stalled && time - stallBeepAt > 0.9) {
          stallBeepAt = time;
          audio.stallBeep();
        }
        // Mission events.
        const mevents = missions.update(dt, flight.state, flight.state);
        for (const ev of mevents) {
          if (ev.type === 'ring') {
            audio.ringChime();
            hud.showMessage('Ring ' + ev.ring + ' of ' + ev.total + ' — +' + ev.points + ' pts');
          } else if (ev.type === 'ringMissed') {
            hud.showMessage('Ring missed — next one is lit');
          } else if (ev.type === 'missionComplete') {
            score = missions.totalScore(flight.state);
            completeMission('rings');
          }
        }
        if (events.crashed) {
          crashFlight(events.crashed);
        } else if (events.landed) {
          audio.touchdown(clamp(1 - Math.abs(flight.state.verticalSpeed) / 4.5, 0.2, 1));
          const bonus = missions.scoreLanding(flight.state, Math.abs(flight.state.verticalSpeed));
          hud.showMessage('Touchdown — landing bonus +' + bonus);
        } else if (events.touchedDown) {
          audio.touchdown(0.5);
          hud.showMessage('Hard landing — airframe damage ' + Math.round(flight.state.damage) + '%');
        }
        if (flight.state.onGround && flight.state.landed && flight.state.throttle < 0.2 && !events.crashed) {
          const stopped = flight.rollOut(dt);
          if (stopped && missions.active && missions.active.landed) {
            score = missions.totalScore(flight.state);
            completeMission('landed');
          } else if (stopped && missions.active && !missions.active.needsLanding && missions.active.finished) {
            score = missions.totalScore(flight.state);
            completeMission('rings');
          }
        }
        score = missions.active ? missions.totalScore(flight.state) : score;
        audio.update(flight.state.throttle, flight.state.speed, !flight.state.onGround);
        // HUD snapshot.
        hud.update(
          {
            altitude: flight.state.y - terrain.heightAt(flight.state.x, flight.state.z),
            speed: flight.state.speed,
            heading: flight.headingDegrees(),
            throttle: flight.state.throttle,
            fuel: flight.state.fuel,
            score,
            verticalSpeed: flight.state.verticalSpeed,
            gearDown: flight.state.gearDown,
            flaps: flight.state.flaps,
            onGround: flight.state.onGround,
            stalled: flight.state.stalled,
            engineOut: flight.state.engineOut,
            time: missionTime,
            pitch: flight.state.pitch,
            roll: flight.state.roll,
            cockpit: cameraMode === 'cockpit',
          },
          now
        );
      }

      placeAircraftMesh();
      aircraft.setGearDown(flight.state.gearAnim > 0.5);
      updateCamera(dt, time);
      renderer.render(scene, camera);
    }

    // ---- boot --------------------------------------------------------
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    hud.show('menu');
    if (shot && SHOT_PRESETS[shot]) {
      applyShotPreset(shot);
    } else {
      // Menu backdrop: the plane parked on the runway at golden hour.
      flight.reset({ x: 0, y: SC.Flight.RUNWAY_START_Y, z: 250, yaw: 0.35, speed: 0, throttle: 0, onGround: true, gearDown: true });
      placeAircraftMesh();
      camPos.set(-24, 16, 285);
      camera.position.copy(camPos);
      camera.lookAt(0, 10, 240);
    }
    requestAnimationFrame(frame);

    // Small handle for the automated play-test (not a cheat: read-only state
    // plus the same setters the keyboard uses).
    window.__SF = {
      get screen() { return screen; },
      get mission() { return currentMission; },
      state: flight.state,
      missions,
      flight,
      terrain,
      aircraft,
      camera,
      place(x, y, z, yaw, speed) {
        const s = flight.state;
        s.x = x; s.y = y; s.z = z;
        if (yaw !== undefined) s.yaw = yaw;
        if (speed !== undefined) s.speed = speed;
        s.onGround = false;
      },
      setThrottle(v) { flight.state.throttle = clamp(v, 0, 1); },
      startMission,
      applyShotPreset,
    };
    return window.__SF;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
  } else {
    startGame();
  }
})();
