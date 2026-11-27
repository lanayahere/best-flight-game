// Sunset Courier — Amber Valley: procedural terrain, river, fields, town,
// runway, trees, clouds and the sunset sky. The height function is analytic
// so the flight model can ask for the ground height at any point.
(function () {
  'use strict';

  const SC = window.SunsetCourier;
  const clamp = SC.clamp;
  const lerp = SC.lerp;
  const smoothstep = SC.smoothstep;
  const hashGrid = SC.hashGrid;
  const makeRng = SC.makeRng;

  const WORLD_SIZE = 4000; // metres, centred on the origin
  const WATER_Y = 3.0;
  const RUNWAY = { x: 0, z: 0, halfWidth: 18, halfLength: 350, height: 8 };
  const TOWN = { x: 520, z: -380, halfX: 260, halfZ: 300, height: 10 };

  // Golden-hour palette.
  const COL = {
    grassLow: [0.30, 0.48, 0.17],
    grassHigh: [0.44, 0.56, 0.21],
    fieldGold: [0.78, 0.62, 0.28],
    fieldGreen: [0.35, 0.52, 0.22],
    fieldPlough: [0.55, 0.38, 0.22],
    townGround: [0.55, 0.52, 0.46],
    rock: [0.52, 0.45, 0.38],
    sand: [0.80, 0.70, 0.48],
  };

  // Wheat and crop rectangles: [centreX, centreZ, halfX, halfZ, colour key].
  const FIELDS = [
    [-950, -250, 260, 190, 'fieldGold'],
    [-650, 650, 300, 220, 'fieldGreen'],
    [550, -1050, 280, 200, 'fieldGold'],
    [1050, 550, 260, 190, 'fieldGreen'],
    [-1250, 950, 320, 200, 'fieldPlough'],
    [250, 1150, 300, 200, 'fieldGold'],
    [-350, -1150, 240, 180, 'fieldGreen'],
    [1250, -750, 220, 160, 'fieldPlough'],
  ];

  /** Centre line of the river, which runs north-south on the east side. */
  function riverX(z) {
    return 950 + 420 * Math.sin(z * 0.00085) + 180 * Math.sin(z * 0.0023 + 1.7);
  }

  function riverDistance(x, z) {
    return Math.abs(x - riverX(z));
  }

  /** Value noise: smooth interpolation of the seeded grid hash. */
  function valueNoise(x, z, seed) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = hashGrid(ix, iz, seed);
    const b = hashGrid(ix + 1, iz, seed);
    const c = hashGrid(ix, iz + 1, seed);
    const d = hashGrid(ix + 1, iz + 1, seed);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
  }

  function fbm(x, z, octaves, seed) {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      total += valueNoise(x * freq, z * freq, seed + o * 101) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return total / norm; // 0..1
  }

  /** Ground height in metres at any (x, z). The mesh is built from this. */
  function heightAt(x, z) {
    // Rolling hills, two scales.
    let h = (fbm(x * 0.0009, z * 0.0009, 4, 11) - 0.5) * 110;
    h += (fbm(x * 0.004 + 13.7, z * 0.004 - 7.3, 2, 29) - 0.5) * 16;
    h += 12;
    // River channel carves down toward the water.
    const rd = riverDistance(x, z);
    h -= 17 * smoothstep(85, 12, rd);
    // The airfield is graded flat.
    const rDist = Math.max(Math.abs(x) / 150, Math.abs(z) / 520);
    h = lerp(h, RUNWAY.height, smoothstep(1.0, 0.45, rDist));
    // The town sits on a levelled shelf.
    const tDist = Math.max(Math.abs(x - TOWN.x) / 300, Math.abs(z - TOWN.z) / 340);
    h = lerp(h, TOWN.height, smoothstep(1.0, 0.55, tDist));
    // Mountains ring the valley rim.
    const r = Math.sqrt(x * x + z * z);
    h += smoothstep(1550, 1950, r) * 130;
    return h;
  }

  /** Slope estimate from the height function, for placing trees. */
  function slopeAt(x, z) {
    const e = 6;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.sqrt(dx * dx + dz * dz);
  }

  function insideRunway(x, z, margin) {
    return Math.abs(x) < RUNWAY.halfWidth + margin && Math.abs(z) < RUNWAY.halfLength + margin;
  }

  function insideTown(x, z, margin) {
    return (
      Math.abs(x - TOWN.x) < TOWN.halfX + margin &&
      Math.abs(z - TOWN.z) < TOWN.halfZ + margin
    );
  }

  function groundColour(x, z, h) {
    const n = hashGrid(Math.floor(x / 18), Math.floor(z / 18), 77);
    let c = [
      lerp(COL.grassLow[0], COL.grassHigh[0], clamp(h / 90, 0, 1)),
      lerp(COL.grassLow[1], COL.grassHigh[1], clamp(h / 90, 0, 1)),
      lerp(COL.grassLow[2], COL.grassHigh[2], clamp(h / 90, 0, 1)),
    ];
    // Fields paint the valley floor in gold and green.
    for (let i = 0; i < FIELDS.length; i++) {
      const f = FIELDS[i];
      if (Math.abs(x - f[0]) < f[2] && Math.abs(z - f[1]) < f[3]) {
        c = COL[f[4]].slice();
        break;
      }
    }
    if (insideTown(x, z, 0)) c = COL.townGround.slice();
    // Sandy banks along the river, rock on steep ground.
    if (riverDistance(x, z) < 55 && h < 9) c = COL.sand.slice();
    if (slopeAt(x, z) > 0.55) c = COL.rock.slice();
    const v = 0.9 + n * 0.2;
    return [c[0] * v, c[1] * v, c[2] * v];
  }

  function buildTerrainMesh(scene) {
    const SEG = 150;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const c = groundColour(x, z, h);
      colours[i * 3] = c[0];
      colours[i * 3 + 1] = c[1];
      colours[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'valleyTerrain';
    scene.add(mesh);
    return mesh;
  }

  function buildRiver(scene) {
    // A ribbon of water following the river spline, just above the channel.
    const pts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const z = -1950 + (3900 * i) / N;
      pts.push([riverX(z), z]);
    }
    const verts = [];
    const idx = [];
    const W = 17;
    for (let i = 0; i <= N; i++) {
      const [cx, cz] = pts[i];
      const [nx, nz] = pts[Math.min(N, i + 1)];
      const [px, pz] = pts[Math.max(0, i - 1)];
      let dx = nx - px;
      let dz = nz - pz;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= len;
      dz /= len;
      // Perpendicular in the XZ plane.
      verts.push(cx - dz * W, WATER_Y, cz + dx * W);
      verts.push(cx + dz * W, WATER_Y, cz - dx * W);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(verts, 3)
    );
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({
      color: 0x3f6f8e,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'riverWater';
    scene.add(mesh);
    return mesh;
  }

  function buildRunway(scene) {
    const group = new THREE.Group();
    group.name = 'marigoldRunway';
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(RUNWAY.halfWidth * 2, RUNWAY.halfLength * 2),
      new THREE.MeshLambertMaterial({ color: 0x2e2e33 })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(RUNWAY.x, RUNWAY.height + 0.15, RUNWAY.z);
    group.add(strip);
    // Centreline dashes and threshold bars.
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
    for (let z = -RUNWAY.halfLength + 40; z < RUNWAY.halfLength - 30; z += 44) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 18), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(RUNWAY.x, RUNWAY.height + 0.3, z);
      group.add(dash);
    }
    for (const end of [-1, 1]) {
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 8), dashMat);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(RUNWAY.x + k * 6.4, RUNWAY.height + 0.3, end * (RUNWAY.halfLength - 22));
        group.add(bar);
      }
    }
    // Edge lights, warm white, every 70 m.
    const lightGeo = new THREE.SphereGeometry(0.7, 8, 6);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    for (let z = -RUNWAY.halfLength; z <= RUNWAY.halfLength; z += 70) {
      for (const side of [-1, 1]) {
        const lamp = new THREE.Mesh(lightGeo, lightMat);
        lamp.position.set(side * (RUNWAY.halfWidth + 3), RUNWAY.height + 1.0, z);
        group.add(lamp);
      }
    }
    scene.add(group);
    // Windsock beside the threshold.
    const sock = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    pole.position.y = 3.5;
    sock.add(pole);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 3.4, 10, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xff7a2a, side: THREE.DoubleSide })
    );
    cone.rotation.z = Math.PI / 2;
    cone.position.set(1.8, 6.6, 0);
    sock.add(cone);
    sock.position.set(RUNWAY.halfWidth + 14, RUNWAY.height, -RUNWAY.halfLength + 30);
    scene.add(sock);
    return group;
  }

  function buildTown(scene) {
    const group = new THREE.Group();
    group.name = 'marigoldTown';
    const rng = makeRng(20261126);
    const wallCols = [0xd8c3a5, 0xcbb59a, 0xe0d0b8, 0xcfb49a];
    const roofCols = [0xa44a2a, 0x8f3d24, 0x7a5a3a];
    const wallMat = wallCols.map(
      (c) => new THREE.MeshLambertMaterial({ color: c })
    );
    const roofMat = roofCols.map(
      (c) => new THREE.MeshLambertMaterial({ color: c })
    );
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    let placed = 0;
    let guard = 0;
    while (placed < 26 && guard++ < 400) {
      const x = TOWN.x + (rng() - 0.5) * (TOWN.halfX * 2 - 60);
      const z = TOWN.z + (rng() - 0.5) * (TOWN.halfZ * 2 - 60);
      if (Math.abs(x - TOWN.x) < 40 && Math.abs(z - TOWN.z) < 40) continue; // square
      const w = 8 + rng() * 8;
      const d = 7 + rng() * 7;
      const hgt = 5 + rng() * 5;
      const gy = heightAt(x, z);
      const house = new THREE.Group();
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(w, hgt, d),
        wallMat[Math.floor(rng() * wallMat.length)]
      );
      walls.position.y = hgt / 2;
      house.add(walls);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.sqrt(w * w + d * d) * 0.62, 3 + rng() * 2, 4),
        roofMat[Math.floor(rng() * roofMat.length)]
      );
      roof.position.y = hgt + 1.6;
      roof.rotation.y = Math.PI / 4;
      house.add(roof);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), winMat);
      win.position.set(0, hgt * 0.55, d / 2 + 0.06);
      house.add(win);
      house.position.set(x, gy - 0.4, z);
      house.rotation.y = (rng() - 0.5) * 0.9;
      group.add(house);
      placed++;
    }
    // Church tower on the square.
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(7, 22, 7),
      new THREE.MeshLambertMaterial({ color: 0xd8cdb8 })
    );
    tower.position.set(TOWN.x, heightAt(TOWN.x, TOWN.z) + 10.6, TOWN.z);
    group.add(tower);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(5.2, 9, 4),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
    );
    spire.position.set(TOWN.x, heightAt(TOWN.x, TOWN.z) + 26, TOWN.z);
    spire.rotation.y = Math.PI / 4;
    group.add(spire);
    scene.add(group);
    return group;
  }

  function buildTrees(scene) {
    const rng = makeRng(5150);
    const COUNT = 520;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.4, 5);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4126 });
    const leafGeo = new THREE.ConeGeometry(2.4, 8.5, 6);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f5d2a });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, COUNT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let placed = 0;
    let guard = 0;
    while (placed < COUNT && guard++ < 8000) {
      const x = (rng() - 0.5) * 3800;
      const z = (rng() - 0.5) * 3800;
      if (insideRunway(x, z, 60)) continue;
      if (insideTown(x, z, 30)) continue;
      if (riverDistance(x, z) < 55) continue;
      const h = heightAt(x, z);
      if (h < WATER_Y + 2) continue;
      if (slopeAt(x, z) > 0.5) continue;
      const scale = 0.8 + rng() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      s.set(scale, scale * (0.9 + rng() * 0.4), scale);
      pos.set(x, h + 1.6 * scale, z);
      m.compose(pos, q, s);
      trunks.setMatrixAt(placed, m);
      pos.set(x, h + (3.4 + 4.0) * scale, z);
      m.compose(pos, q, s);
      leaves.setMatrixAt(placed, m);
      placed++;
    }
    trunks.count = placed;
    leaves.count = placed;
    trunks.name = 'treeTrunks';
    leaves.name = 'treeTops';
    scene.add(trunks);
    scene.add(leaves);
    return { trunks, leaves };
  }

  function buildClouds(scene) {
    const rng = makeRng(8080);
    const clouds = [];
    const mat = new THREE.MeshLambertMaterial({
      color: 0xfff2e0,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 13; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rng() * 3);
      for (let p = 0; p < puffs; p++) {
        const r = 14 + rng() * 22;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
        puff.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 8, (rng() - 0.5) * 34);
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(
        (rng() - 0.5) * 3600,
        260 + rng() * 130,
        (rng() - 0.5) * 3600
      );
      cloud.name = 'cloud' + i;
      scene.add(cloud);
      clouds.push(cloud);
    }
    return clouds;
  }

  function buildSky(scene) {
    // Gradient dome: deep dusk blue overhead, warm orange at the horizon.
    const geo = new THREE.SphereGeometry(6000, 24, 14);
    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const top = [0.16, 0.26, 0.48];
    const mid = [0.85, 0.52, 0.30];
    const low = [1.0, 0.72, 0.42];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 6000; // -1..1
      let c;
      if (y > 0.12) {
        const t = clamp((y - 0.12) / 0.6, 0, 1);
        c = [lerp(mid[0], top[0], t), lerp(mid[1], top[1], t), lerp(mid[2], top[2], t)];
      } else {
        const t = clamp((y + 0.25) / 0.37, 0, 1);
        c = [lerp(low[0], mid[0], t), lerp(low[1], mid[1], t), lerp(low[2], mid[2], t)];
      }
      colours[i * 3] = c[0];
      colours[i * 3 + 1] = c[1];
      colours[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const dome = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
    );
    dome.name = 'sunsetSky';
    scene.add(dome);
    // Low sun disc in the west.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(190, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false })
    );
    sun.position.set(-4200, 520, -3800);
    sun.lookAt(0, 300, 0);
    sun.name = 'lowSun';
    scene.add(sun);
    scene.fog = new THREE.Fog(0xe89a5e, 900, 5400);
    return dome;
  }

  function buildLights(scene) {
    const sun = new THREE.DirectionalLight(0xffc98a, 1.35);
    sun.position.set(-3200, 1500, -2600);
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xffd9a8, 0x5a6b4a, 0.75);
    scene.add(hemi);
    return { sun, hemi };
  }

  /** Build the whole valley and return the queryable terrain. */
  function buildValley(scene) {
    buildSky(scene);
    buildLights(scene);
    buildTerrainMesh(scene);
    buildRiver(scene);
    buildRunway(scene);
    buildTown(scene);
    buildTrees(scene);
    const clouds = buildClouds(scene);
    return {
      heightAt,
      slopeAt,
      riverX,
      riverDistance,
      waterY: WATER_Y,
      runway: RUNWAY,
      town: TOWN,
      worldSize: WORLD_SIZE,
      insideRunway,
      insideTown,
      clouds,
      update(dt) {
        for (let i = 0; i < clouds.length; i++) {
          clouds[i].position.x += 2.2 * dt;
          if (clouds[i].position.x > 2000) clouds[i].position.x = -2000;
        }
      },
    };
  }

  SC.Terrain = {
    buildValley,
    heightAt,
    riverX,
    riverDistance,
    waterY: WATER_Y,
    runway: RUNWAY,
    town: TOWN,
    worldSize: WORLD_SIZE,
  };
})();
