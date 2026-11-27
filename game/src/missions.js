// Sunset Courier — missions: glowing target rings, the runway landing,
// and the timed courier run. Rings are torus meshes; passing one is a
// plane-crossing test against the ring's own plane.
(function () {
  'use strict';

  const SC = window.SunsetCourier;
  const clamp = SC.clamp;

  const RING_RADIUS = 14;
  const RING_TUBE = 0.9;

  /** Ring route for the rally: a scenic loop over the valley. */
  const RALLY_RINGS = [
    { x: 0, y: 110, z: -900 },
    { x: -520, y: 140, z: -620 },
    { x: -820, y: 120, z: 80 },
    { x: -320, y: 160, z: 720 },
    { x: 420, y: 130, z: 900 },
    { x: 720, y: 100, z: 220 },
  ];

  /** Courier rings, then a landing on the runway. */
  const COURIER_RINGS = [
    { x: 0, y: 110, z: -700 },
    { x: -620, y: 130, z: -120 },
    { x: 180, y: 150, z: 620 },
    { x: 640, y: 110, z: 320 },
  ];

  const MISSIONS = {
    rally: {
      id: 'rally',
      name: 'Ring Rally',
      blurb: 'Thread all six rings over Amber Valley, in order. Smooth flying beats fast flying.',
      rings: RALLY_RINGS,
      needsLanding: false,
      parTime: 150,
      start: { x: 0, y: 9.5, z: 250, yaw: 0, speed: 0, throttle: 0, onGround: true, gearDown: true },
    },
    landing: {
      id: 'landing',
      name: 'Bush Landing',
      blurb: 'You are 1.8 km out, 220 m up. Put the Kestrel down gentle, slow and on the centreline — gear down.',
      rings: [],
      needsLanding: true,
      parTime: 120,
      start: { x: 0, y: 220, z: 1800, yaw: 0, speed: 46, throttle: 0.32, onGround: false, gearDown: false },
    },
    courier: {
      id: 'courier',
      name: 'Courier Run',
      blurb: 'Four rings, then land on the runway. The clock and the fuel gauge are both running — every litre left is points.',
      rings: COURIER_RINGS,
      needsLanding: true,
      parTime: 180,
      start: { x: 0, y: 9.5, z: 250, yaw: 0, speed: 0, throttle: 0, onGround: true, gearDown: true },
    },
  };

  function createMissions(scene) {
    const group = new THREE.Group();
    group.name = 'missionRings';
    scene.add(group);

    const nextMat = new THREE.MeshBasicMaterial({ color: 0x37e6ff });
    const doneMat = new THREE.MeshBasicMaterial({ color: 0x59ff7a });
    const missedMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a });
    const idleMat = new THREE.MeshBasicMaterial({ color: 0x8fa8b8 });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x37e6ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });
    const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 10, 40);
    const haloGeo = new THREE.TorusGeometry(RING_RADIUS + 2.5, 1.6, 8, 40);

    let active = null; // { mission, rings: [{mesh, halo, pos, normal, passed, missed}], index, score, time, finished }

    function directionToNext(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      return { x: dx / len, y: dy / len, z: dz / len };
    }

    function start(missionId, startPos) {
      clearRings();
      const mission = MISSIONS[missionId];
      const rings = mission.rings.map((r, i) => {
        const next = mission.rings[i + 1] || { x: 0, y: 30, z: 0 };
        const normal = directionToNext(r, next);
        const mesh = new THREE.Mesh(ringGeo, i === 0 ? nextMat : idleMat);
        mesh.position.set(r.x, r.y, r.z);
        mesh.lookAt(r.x + normal.x, r.y + normal.y, r.z + normal.z);
        mesh.name = 'ring' + i;
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.copy(mesh.position);
        halo.quaternion.copy(mesh.quaternion);
        group.add(mesh);
        group.add(halo);
        return { pos: r, normal, mesh, halo, passed: false, missed: false, prevSide: null };
      });
      active = {
        mission,
        rings,
        index: 0,
        ringScore: 0,
        ringsPassed: 0,
        ringsMissed: 0,
        time: 0,
        finished: false,
        landed: false,
        landingBonus: 0,
      };
      return active;
    }

    function clearRings() {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
      }
      active = null;
    }

    /** Check ring crossings for the plane at (x, y, z). Returns events. */
    function update(dt, plane, flightState) {
      const events = [];
      if (!active || active.finished) return events;
      active.time += dt;
      // Pulse the next ring so the pilot can find it.
      const next = active.rings[active.index];
      if (next) {
        const pulse = 1 + 0.06 * Math.sin(active.time * 4);
        next.mesh.scale.set(pulse, pulse, pulse);
        next.halo.scale.set(pulse, pulse, pulse);
        next.halo.material.opacity = 0.12 + 0.08 * Math.sin(active.time * 4);
      }
      if (!next) return events;
      const px = plane.x - next.pos.x;
      const py = plane.y - next.pos.y;
      const pz = plane.z - next.pos.z;
      const side = px * next.normal.x + py * next.normal.y + pz * next.normal.z;
      if (next.prevSide !== null && Math.sign(side) !== Math.sign(next.prevSide)) {
        const dist = Math.sqrt(px * px + py * py + pz * pz);
        if (dist < RING_RADIUS) {
          next.passed = true;
          next.mesh.material = doneMat;
          next.halo.visible = false;
          active.ringsPassed++;
          active.ringScore += 250;
          active.index++;
          events.push({ type: 'ring', ring: active.ringsPassed, total: active.rings.length, points: 250 });
          const following = active.rings[active.index];
          if (following) following.mesh.material = nextMat;
          if (active.index >= active.rings.length && !active.mission.needsLanding) {
            active.finished = true;
            events.push({ type: 'missionComplete', reason: 'rings' });
          }
        } else {
          next.missed = true;
          next.mesh.material = missedMat;
          next.halo.visible = false;
          active.ringsMissed++;
          active.index++;
          events.push({ type: 'ringMissed', ring: active.ringsPassed + active.ringsMissed, total: active.rings.length });
          const following = active.rings[active.index];
          if (following) following.mesh.material = nextMat;
          if (active.index >= active.rings.length && !active.mission.needsLanding) {
            active.finished = true;
            events.push({ type: 'missionComplete', reason: 'rings' });
          }
        }
      }
      next.prevSide = side;
      return events;
    }

    /** Score a landing: softness, centreline and speed all count. */
    function scoreLanding(flightState, descentRate) {
      if (!active) return 0;
      let bonus = 500;
      bonus += Math.round(clamp(1 - descentRate / 4.5, 0, 1) * 300); // gentle
      bonus += Math.round(clamp(1 - Math.abs(flightState.x) / 24, 0, 1) * 200); // centreline
      bonus += Math.round(clamp(1 - flightState.speed / 48, 0, 1) * 100); // slow
      bonus -= Math.round(flightState.damage * 2);
      active.landingBonus = Math.max(0, bonus);
      active.landed = true;
      if (!active.mission.needsLanding) return active.landingBonus;
      if (active.index >= active.rings.length) {
        active.finished = true;
      }
      return active.landingBonus;
    }

    /** Courier time and fuel bonus, added when the run ends on the runway. */
    function finishBonuses() {
      if (!active) return { timeBonus: 0, fuelBonus: 0 };
      const timeBonus = Math.max(0, Math.round((active.mission.parTime - active.time) * 5));
      const fuelBonus = 0; // fuel is read from the flight state by the caller
      return { timeBonus, fuelBonus };
    }

    function totalScore(flightState) {
      if (!active) return 0;
      let score = active.ringScore + active.landingBonus;
      if (active.mission.id === 'courier' && active.finished) {
        score += Math.max(0, Math.round((active.mission.parTime - active.time) * 5));
        score += Math.round(flightState.fuel * 2);
      }
      return score;
    }

    return {
      missions: MISSIONS,
      start,
      clear: clearRings,
      update,
      scoreLanding,
      finishBonuses,
      totalScore,
      get active() {
        return active;
      },
    };
  }

  SC.Missions = { createMissions, RING_RADIUS, MISSIONS };
})();
