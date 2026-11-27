// Sunset Courier — the flight model. An arcade model with sim flavour:
// lift and stall, pitch/roll/yaw, flaps and gear, throttle discipline,
// fuel burn and damage. Speeds in m/s, angles in radians, heights in m.
(function () {
  'use strict';

  const SC = window.SunsetCourier;
  const clamp = SC.clamp;
  const lerp = SC.lerp;
  const approach = SC.approach;

  const G = 9.81;
  const MAX_THRUST = 15; // m/s^2 at full throttle
  const DRAG_K = 0.0032; // drag = k * v^2
  const STALL_CLEAN = 27; // m/s
  const STALL_FLAPS = 22; // m/s, flaps down
  const ROTATE_SPEED = 30; // m/s, lift-off on the runway
  const GEAR_HEIGHT = 1.5; // wheels to centreline
  const RUNWAY_START_Y = 8 + GEAR_HEIGHT; // runway surface + gear height

  /** Forward unit vector from yaw (0 = north, -Z) and pitch (up positive). */
  function forwardVector(yaw, pitch) {
    const cp = Math.cos(pitch);
    return {
      x: Math.sin(yaw) * cp,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cp,
    };
  }

  /** Level-up vector after pitch, before roll. */
  function levelUpVector(yaw, pitch) {
    return {
      x: -Math.sin(yaw) * Math.sin(pitch),
      y: Math.cos(pitch),
      z: Math.cos(yaw) * Math.sin(pitch),
    };
  }

  /**
   * Image of the model's +X axis in world space (independent of pitch).
   * The model faces +Z with its +X on the port side, so this is the
   * NEGATIVE of the pilot's right: (-cos yaw, 0, -sin yaw). The sign
   * matters — with +cos the (right, up, forward) basis is left-handed
   * and three.js drops the rotation entirely when it is fed to
   * Matrix4.makeBasis / Quaternion.setFromRotationMatrix.
   */
  function rightVector(yaw) {
    return { x: -Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  }

  /** Full orientation basis with roll applied (bank right positive). */
  function orientationBasis(yaw, pitch, roll) {
    const f = forwardVector(yaw, pitch);
    const up0 = levelUpVector(yaw, pitch);
    const r0 = rightVector(yaw);
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    return {
      forward: f,
      up: {
        x: up0.x * c + r0.x * s,
        y: up0.y * c + r0.y * s,
        z: up0.z * c + r0.z * s,
      },
      right: {
        x: r0.x * c - up0.x * s,
        y: r0.y * c - up0.y * s,
        z: r0.z * c - up0.z * s,
      },
    };
  }

  function createFlight(terrain) {
    const state = {
      x: 0,
      y: RUNWAY_START_Y,
      z: 250,
      yaw: 0, // heading north, down the runway
      pitch: 0,
      roll: 0,
      speed: 0,
      throttle: 0,
      flaps: 0, // 0..1, animates toward target
      flapsTarget: 0,
      gearDown: true,
      gearAnim: 1, // 1 = fully down
      fuel: 100,
      damage: 0,
      onGround: true,
      landed: false, // set on touchdown; the rollout brake only applies then
      engineOut: false,
      verticalSpeed: 0,
      stalled: false,
      time: 0,
    };

    function stallSpeed() {
      return lerp(STALL_CLEAN, STALL_FLAPS, state.flaps);
    }

    function reset(start) {
      state.x = start.x;
      state.y = start.y;
      state.z = start.z;
      state.yaw = start.yaw;
      state.pitch = start.pitch || 0;
      state.roll = 0;
      state.speed = start.speed || 0;
      state.throttle = start.throttle || 0;
      state.flaps = start.flaps || 0;
      state.flapsTarget = start.flaps || 0;
      state.gearDown = start.gearDown !== undefined ? start.gearDown : true;
      state.gearAnim = state.gearDown ? 1 : 0;
      state.fuel = start.fuel !== undefined ? start.fuel : 100;
      state.damage = 0;
      state.landed = false;
      state.onGround = start.onGround !== undefined ? start.onGround : true;
      state.engineOut = false;
      state.verticalSpeed = 0;
      state.stalled = false;
      state.time = 0;
    }

    /** One physics step. Returns events: { crashed, landed, touchedDown }. */
    function update(dt, input) {
      const events = { crashed: null, landed: false, touchedDown: false };
      state.time += dt;

      // Throttle: W/S nudge it, Shift/Ctrl jump it.
      if (input.throttleUp) state.throttle = clamp(state.throttle + 0.55 * dt, 0, 1);
      if (input.throttleDown) state.throttle = clamp(state.throttle - 0.55 * dt, 0, 1);
      if (input.throttleMax) state.throttle = 1;
      if (input.throttleCut) state.throttle = 0;

      // Flaps and gear animate toward their targets.
      state.flaps = approach(state.flaps, state.flapsTarget, 0.5 * dt);
      const gearTarget = state.gearDown ? 1 : 0;
      state.gearAnim = approach(state.gearAnim, gearTarget, 0.8 * dt);

      // Fuel burn: idle sips, full throttle drinks.
      if (!state.onGround || state.throttle > 0.05) {
        state.fuel = Math.max(
          0,
          state.fuel - (0.10 + state.throttle * 0.72) * dt
        );
      }
      if (state.fuel <= 0 && !state.engineOut) {
        state.engineOut = true;
        state.throttle = 0;
      }

      const stall = stallSpeed();
      const liftFactor = clamp(state.speed / stall, 0, 1.3);
      state.stalled = state.speed < stall && !state.onGround;
      const authority = 0.25 + 0.75 * clamp(state.speed / 30, 0.15, 1);

      if (state.onGround) {
        // Takeoff roll: steer with the rudder, rotate with the elevator.
        state.yaw += input.rudder * 0.5 * dt * clamp(state.speed / 20, 0.2, 1);
        state.pitch = approach(state.pitch, 0, 1.5 * dt);
        state.roll = approach(state.roll, 0, 2 * dt);
        const thrust = state.engineOut ? 0 : state.throttle * MAX_THRUST;
        const drag = DRAG_K * state.speed * state.speed;
        state.speed = Math.max(0, state.speed + (thrust - drag) * dt);
        state.x += Math.sin(state.yaw) * state.speed * dt;
        state.z += -Math.cos(state.yaw) * state.speed * dt;
        state.y = terrain.heightAt(state.x, state.z) + GEAR_HEIGHT;
        if (state.speed >= ROTATE_SPEED && input.elevator > 0.15) {
          state.onGround = false;
          state.landed = false;
          state.pitch = 0.08;
        }
        state.verticalSpeed = 0;
        return events;
      }

      // Airborne: elevator, ailerons, rudder.
      const elev = state.stalled ? input.elevator * 0.45 : input.elevator;
      state.pitch = clamp(
        state.pitch + elev * 0.7 * authority * dt,
        -0.55,
        0.6
      );
      state.roll = clamp(
        state.roll + input.aileron * 1.9 * authority * dt,
        -1.2,
        1.2
      );
      if (Math.abs(input.aileron) < 0.05) {
        state.roll = approach(state.roll, 0, 0.35 * dt);
      }
      // Coordinated turn from bank, plus a touch of rudder.
      const turnRate = (-Math.tan(state.roll) * G) / Math.max(state.speed, 18);
      state.yaw += (turnRate * 0.85 + input.rudder * 0.28) * dt;

      // Stall: the nose drops and the wing stops flying.
      if (state.stalled) {
        state.pitch = Math.max(state.pitch - 0.3 * dt, -0.4);
      }

      // Thrust, drag and the gravity bill for climbing.
      const thrust = state.engineOut ? 0 : state.throttle * MAX_THRUST;
      const drag = DRAG_K * state.speed * state.speed;
      const accel = thrust - drag - G * Math.sin(state.pitch) * 0.9;
      state.speed = Math.max(0, state.speed + accel * dt);

      // Move along the flight path, plus a sink when the wing is stalled.
      const f = forwardVector(state.yaw, state.pitch);
      const sink = Math.max(0, stall - state.speed) * 0.85;
      const vy = f.y * state.speed - sink;
      state.verticalSpeed = vy;
      state.x += f.x * state.speed * dt;
      state.y += vy * dt;
      state.z += f.z * state.speed * dt;

      // Stay inside the valley; the rim mountains turn you back.
      const r = Math.sqrt(state.x * state.x + state.z * state.z);
      if (r > 1950) {
        const nx = state.x / r;
        const nz = state.z / r;
        state.x = nx * 1950;
        state.z = nz * 1950;
        state.yaw += Math.PI; // turn back toward the valley
      }
      if (state.y > 900) state.y = 900;

      // Ground and water contact.
      const groundY = terrain.heightAt(state.x, state.z);
      const riverD = terrain.riverDistance(state.x, state.z);
      if (riverD < 26 && state.y <= terrain.waterY + 0.6) {
        events.crashed = 'ditched in the river';
        return events;
      }
      if (state.y <= groundY + GEAR_HEIGHT) {
        const nearRunway =
          Math.abs(state.x) < terrain.runway.halfWidth + 6 &&
          Math.abs(state.z) < terrain.runway.halfLength + 6;
        const descent = -vy;
        const gentle = descent < 4.5;
        const slow = state.speed < 48;
        const level = Math.abs(state.roll) < 0.25 && Math.abs(state.pitch) < 0.16;
        if (nearRunway && state.gearDown && gentle && slow && level) {
          state.y = groundY + GEAR_HEIGHT;
          state.onGround = true;
          state.landed = true;
          state.pitch = 0;
          state.roll = 0;
          events.landed = true;
          events.touchedDown = true;
          return events;
        }
        if (nearRunway && state.gearDown && descent < 7 && slow && level) {
          // A hard landing: bent metal, but the plane survives.
          state.damage = Math.min(100, state.damage + 35);
          state.y = groundY + GEAR_HEIGHT;
          state.onGround = true;
          state.landed = true;
          state.pitch = 0;
          state.roll = 0;
          events.touchedDown = true;
          if (state.damage >= 100) events.crashed = 'airframe broke up on landing';
          return events;
        }
        if (!state.gearDown) {
          events.crashed = 'belly landing — gear was up';
        } else if (!nearRunway && gentle && slow && level) {
          events.crashed = 'rough-field landing off the runway';
        } else if (descent >= 7) {
          events.crashed = 'hit the ground too hard';
        } else {
          events.crashed = 'hit the terrain';
        }
        return events;
      }
      return events;
    }

    /** Rolling friction after a landing; returns true once stopped. */
    function rollOut(dt) {
      state.speed = Math.max(0, state.speed - 9 * dt);
      state.x += Math.sin(state.yaw) * state.speed * dt;
      state.z += -Math.cos(state.yaw) * state.speed * dt;
      state.y = terrain.heightAt(state.x, state.z) + GEAR_HEIGHT;
      return state.speed < 1.5;
    }

    return {
      state,
      stallSpeed,
      reset,
      update,
      rollOut,
      orientationBasis: () => orientationBasis(state.yaw, state.pitch, state.roll),
      forwardVector: () => forwardVector(state.yaw, state.pitch),
      headingDegrees: () => SC.headingDegrees(state.yaw),
    };
  }

  SC.Flight = { createFlight, forwardVector, orientationBasis, RUNWAY_START_Y };
})();
