// Sunset Courier — the Kestrel bush plane, built from primitives.
// The model faces +Z (its nose), so the flight code can aim it with a
// basis of (right, up, forward). No textures, no external files.
(function () {
  'use strict';

  const SC = window.SunsetCourier;

  /** Build the aircraft group and return its animated parts. */
  function buildAircraft(scene) {
    const group = new THREE.Group();
    group.name = 'kestrelPlane';

    const cream = new THREE.MeshLambertMaterial({ color: 0xf2e3c2 });
    const orange = new THREE.MeshLambertMaterial({ color: 0xe86a1f });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const glass = new THREE.MeshPhongMaterial({
      color: 0x2a4a5e,
      shininess: 90,
      transparent: true,
      opacity: 0.92,
    });

    // Fuselage: a tapered body along Z (nose at +Z).
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.6, 12), cream);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0, -0.4);
    group.add(body);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.1, 12), cream);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 2.9);
    group.add(nose);
    const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 2.2, 10), cream);
    tailCone.rotation.x = Math.PI / 2;
    tailCone.position.set(0, 0.15, -4.2);
    group.add(tailCone);
    // Sunset stripe along each flank.
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 4.6), orange);
      stripe.position.set(side * 0.82, -0.05, -0.2);
      group.add(stripe);
    }

    // Canopy: a glasshouse over the cockpit.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), glass);
    canopy.scale.set(0.95, 0.75, 1.7);
    canopy.position.set(0, 0.62, 1.15);
    group.add(canopy);
    // Instrument glare shield inside the canopy.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.25), dark);
    panel.position.set(0, 0.35, 1.85);
    panel.rotation.x = -0.35;
    group.add(panel);

    // Main wing, low and straight, with orange tips.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 1.7), cream);
    wing.position.set(0, -0.15, 0.55);
    group.add(wing);
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 1.7), orange);
      tip.position.set(side * 5.45, -0.15, 0.55);
      group.add(tip);
    }
    // Tail: horizontal stabiliser and fin.
    const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.15), cream);
    stab.position.set(0, 0.35, -4.9);
    group.add(stab);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.5), orange);
    fin.position.set(0, 0.95, -4.9);
    group.add(fin);

    // Propeller: hub plus two blades, spinning around the nose axis.
    const prop = new THREE.Group();
    prop.position.set(0, 0, 3.55);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), dark);
    hub.rotation.x = Math.PI / 2;
    prop.add(hub);
    const bladeGeo = new THREE.BoxGeometry(0.28, 2.6, 0.1);
    for (const a of [0, Math.PI]) {
      const blade = new THREE.Mesh(bladeGeo, dark);
      blade.rotation.z = a;
      blade.position.y = 0;
      prop.add(blade);
    }
    // Spinner cone.
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), orange);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.45;
    prop.add(spinner);
    group.add(prop);

    // Landing gear: two mains and a tail wheel, on one group so they retract.
    const gear = new THREE.Group();
    gear.name = 'landingGear';
    const legMat = dark;
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), legMat);
      leg.position.set(side * 0.85, -0.85, 0.9);
      leg.rotation.z = side * 0.25;
      gear.add(leg);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.05, -1.45, 0.9);
      gear.add(wheel);
    }
    const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 10), dark);
    tailWheel.rotation.z = Math.PI / 2;
    tailWheel.position.set(0, -0.75, -4.4);
    gear.add(tailWheel);
    group.add(gear);

    // Navigation lights: red port, green starboard, white tail strobe.
    const navLights = {};
    // The model's +X is its port side (nose +Z, up +Y), so the red port
    // lamp sits at +X and the green starboard lamp at -X.
    const lightDefs = [
      ['port', 5.7, -0.15, 0.55, 0xff2a1a],
      ['starboard', -5.7, -0.15, 0.55, 0x2aff5a],
      ['tail', 0, 0.6, -5.35, 0xffffff],
    ];
    for (const [name, x, y, z, colour] of lightDefs) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        new THREE.MeshBasicMaterial({ color: colour })
      );
      lamp.position.set(x, y, z);
      lamp.name = 'navLight_' + name;
      group.add(lamp);
      navLights[name] = lamp;
    }

    scene.add(group);
    return {
      group,
      propeller: prop,
      gear,
      navLights,
      /** Spin the propeller; speed 0..1 of full throttle. */
      spinPropeller(dt, throttle) {
        prop.rotation.z -= (6 + throttle * 34) * dt;
      },
      /** Blink the tail strobe; call every frame with elapsed time. */
      blinkStrobe(time) {
        const on = Math.sin(time * 6) > 0.86;
        navLights.tail.visible = on;
      },
      /** Show or hide the gear (retracted into the belly when up). */
      setGearDown(down) {
        gear.visible = down;
      },
    };
  }

  SC.Aircraft = { buildAircraft };
})();
