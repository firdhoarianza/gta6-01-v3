// Procedural Vista Bay: six districts share a regular, navigable street skeleton.
import { CITY, COLORS } from './config.js';

const THREE = globalThis.THREE;
const BUILDING_COLORS = ['#d38a70', '#bd9d78', '#8899a0', '#c9b79d', '#a67688', '#728b87', '#d5b769', '#69798d'];
const PARKED_CAR_COUNT = 36;
const DISTRICTS = [
  { name: 'Glass Mile', x: [-560, -260], z: [-560, -220], style: 'tower' },
  { name: 'Mar Azul', x: [-560, -220], z: [270, 560], style: 'beach' },
  { name: 'Tin Harbor', x: [250, 560], z: [260, 560], style: 'port' },
  { name: 'Citrus Heights', x: [260, 560], z: [-560, -260], style: 'suburb' },
  { name: 'Crown Hill', x: [-250, 230], z: [-560, -250], style: 'hill' },
  { name: 'Neon Row', x: [-180, 260], z: [-190, 230], style: 'strip' },
];

function canvasTexture(draw, width = 256, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; return texture;
}

function windowTexture(rng, emissive) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#343a4a'; ctx.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 22) for (let x = 6; x < w; x += 19) {
      ctx.fillStyle = rng() > 0.28 ? (emissive ? (rng() > 0.5 ? '#ffd293' : '#ff8d9a') : '#77bdc4') : '#242b39'; ctx.fillRect(x, y, 12, 14);
    }
  });
}

function box(parent, material, x, y, z, sx, sy, sz, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y + sy / 2, z); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function makeRoadGraph() {
  const nodes = [], edges = [], coords = [];
  for (let i = -6; i <= 6; i++) coords.push(i * CITY.block);
  const idAt = (xi, zi) => xi * coords.length + zi;
  coords.forEach((x, xi) => coords.forEach((z, zi) => nodes.push({ id: idAt(xi, zi), x, z, links: [] })));
  const connect = (a, b) => { const A = nodes[a], B = nodes[b]; edges.push({ a, b, length: Math.hypot(B.x - A.x, B.z - A.z) }); A.links.push(b); B.links.push(a); };
  coords.forEach((_, xi) => coords.forEach((__, zi) => {
    if (xi < coords.length - 1) connect(idAt(xi, zi), idAt(xi + 1, zi));
    if (zi < coords.length - 1) connect(idAt(xi, zi), idAt(xi, zi + 1));
  }));
  return { nodes, edges };
}

function addTree(scene, x, z, scale = 1, bark, leaf) {
  bark ??= new THREE.MeshStandardMaterial({ color: '#8f6347' }); leaf ??= new THREE.MeshStandardMaterial({ color: '#32765d', roughness: 0.85 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 4 * scale, 7), bark); trunk.position.set(x, 2 * scale, z); trunk.castShadow = true; scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.05 * scale, 7, 5), leaf); crown.scale.set(1, 0.55, 1); crown.position.set(x, 4.5 * scale, z); crown.castShadow = true; scene.add(crown);
}

function districtAt(x, z) { return DISTRICTS.find((d) => x >= d.x[0] && x <= d.x[1] && z >= d.z[0] && z <= d.z[1]) ?? { name: 'Vista Bay', style: 'midrise' }; }

function createResidentialMaterials() {
  return ['#d9bb91', '#b87965', '#e3d2ad', '#95a59b'].map((color) => (
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  ));
}

function addParkedCars(scene, rng, colors) {
  const geometry = new THREE.BoxGeometry(2.2, 1.15, 4.4);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0.2 });
  const cars = new THREE.InstancedMesh(geometry, material, PARKED_CAR_COUNT);
  cars.castShadow = true;
  cars.receiveShadow = true;
  cars.frustumCulled = true;
  const dummy = new THREE.Object3D();
  let index = 0;
  for (let attempt = 0; attempt < 160 && index < cars.count; attempt += 1) {
    const x = rng.range(-560, 560);
    const z = rng.range(-560, 475);
    const avenueEdge = Math.abs((x + 600) % 100 - 50);
    const streetEdge = Math.abs((z + 600) % 100 - 50);
    if (avenueEdge < 29 || streetEdge < 29) continue;
    const district = DISTRICTS.find((entry) => x >= entry.x[0] && x <= entry.x[1] && z >= entry.z[0] && z <= entry.z[1]);
    if (district?.style === 'beach' || district?.style === 'port') continue;
    dummy.position.set(x, 0.65, z);
    dummy.rotation.set(0, rng.pick([0, Math.PI / 2]), 0);
    dummy.updateMatrix();
    cars.setMatrixAt(index, dummy.matrix);
    cars.setColorAt(index, new THREE.Color(rng.pick(colors)));
    index += 1;
  }
  cars.count = index;
  cars.instanceMatrix.needsUpdate = true;
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  scene.add(cars);
  return cars;
}

export function createCity(scene, rng) {
  const roadGraph = makeRoadGraph(), spawnPoints = [], colliders = [], districts = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.size, CITY.size), new THREE.MeshStandardMaterial({ color: '#547665', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.13; ground.receiveShadow = true; scene.add(ground);
  const asphalt = new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.94 });
  const stripe = new THREE.MeshStandardMaterial({ color: COLORS.lane, roughness: 0.7 });
  const dashPositions = [];
  for (let i = 0; i < 13; i++) {
    const c = -600 + i * 100, width = i % 3 === 0 ? CITY.avenue : CITY.road;
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(width, CITY.size), asphalt); ns.rotation.x = -Math.PI / 2; ns.position.set(c, 0.005, 0); scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(CITY.size, width), asphalt); ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.006, c); scene.add(ew);
    if (i % 3 === 0) for (let p = -550; p < 550; p += 25) { dashPositions.push([c, 0.02, p, 0], [p, 0.021, c, Math.PI / 2]); }
  }
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 0.95 });
  const sidewalkInstances = new THREE.InstancedMesh(new THREE.PlaneGeometry(1200, 3), sidewalkMat, 52), sidewalkDummy = new THREE.Object3D();
  let sidewalkIndex = 0;
  for (let i = 0; i < 13; i++) {
    const c = -600 + i * 100, width = i % 3 === 0 ? CITY.avenue : CITY.road, edge = width / 2 + 1.5;
    for (const side of [-1, 1]) {
      sidewalkDummy.position.set(c + side * edge, 0.012, 0); sidewalkDummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2); sidewalkDummy.updateMatrix(); sidewalkInstances.setMatrixAt(sidewalkIndex++, sidewalkDummy.matrix);
      sidewalkDummy.position.set(0, 0.013, c + side * edge); sidewalkDummy.rotation.set(-Math.PI / 2, 0, 0); sidewalkDummy.updateMatrix(); sidewalkInstances.setMatrixAt(sidewalkIndex++, sidewalkDummy.matrix);
    }
  }
  sidewalkInstances.instanceMatrix.needsUpdate = true; scene.add(sidewalkInstances);
  // Hundreds of repeated lane dashes in two draw calls instead of hundreds of meshes.
  const dashInstances = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 8), stripe, dashPositions.length);
  const dummy = new THREE.Object3D();
  dashPositions.forEach(([x, y, z, rotation], i) => { dummy.position.set(x, y, z); dummy.rotation.set(-Math.PI / 2, 0, rotation); dummy.updateMatrix(); dashInstances.setMatrixAt(i, dummy.matrix); });
  dashInstances.instanceMatrix.needsUpdate = true; scene.add(dashInstances);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1200, 92), new THREE.MeshStandardMaterial({ color: COLORS.sand, roughness: 0.92 })); sand.rotation.x = -Math.PI / 2; sand.position.set(-20, -0.03, 575); scene.add(sand);
  const waterMat = new THREE.MeshStandardMaterial({ color: COLORS.ocean, roughness: 0.23, metalness: 0.24, emissive: '#063d50', emissiveIntensity: 0.18 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(CITY.ocean, CITY.ocean), waterMat); ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.32, 2720); scene.add(ocean);

  const buildingMaterials = BUILDING_COLORS.map((color) => { const texture = windowTexture(rng, true); return new THREE.MeshStandardMaterial({ color, map: texture, emissive: '#f0a568', emissiveMap: texture, emissiveIntensity: 0.43, roughness: 0.72 }); });
  const residentialMaterials = createResidentialMaterials();
  const roofMat = new THREE.MeshStandardMaterial({ color: '#4a4a50', roughness: 0.95 });
  for (let gx = -6; gx < 6; gx++) for (let gz = -6; gz < 6; gz++) {
    const cx = gx * 100 + 50, cz = gz * 100 + 50, district = districtAt(cx, cz);
    if (district.style === 'beach' || district.style === 'port' || (district.style === 'hill' && rng() < 0.32)) continue;
    const sx = rng.range(46, 77), sz = rng.range(43, 73), x = cx + rng.range(-8, 8), z = cz + rng.range(-8, 8);
    let h = rng.range(12, 42);
    if (district.style === 'tower') h = rng.range(55, 155);
    if (district.style === 'suburb') h = rng.range(6, 13);
    if (district.style === 'strip') h = rng.range(12, 29);
    if (district.style === 'hill') h = rng.range(7, 30);
    const mat = district.style === 'suburb' ? rng.pick(residentialMaterials) : rng.pick(buildingMaterials);
    const mesh = box(scene, mat, x, 0, z, sx, h, sz); mesh.userData.district = district.name;
    if (district.style === 'tower' || district.style === 'strip') box(scene, roofMat, x + 2, h, z + 2, sx - 4, rng.range(1, 3), sz - 4, false);
    if (district.style === 'strip' && rng.chance(0.45)) {
      const neon = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.58, 1.1, 0.28), new THREE.MeshStandardMaterial({ color: '#ff78ae', emissive: '#ff348a', emissiveIntensity: 1.4 })); neon.position.set(x, h * 0.55, z + sz / 2 + 0.17); scene.add(neon);
    }
    colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, minY: 0, maxY: h, name: district.name, mesh }); districts.push({ name: district.name, x, z, height: h });
    if (district.style === 'suburb' && rng.chance(0.48)) addTree(scene, x + sx / 2 + 3, z - sz / 2, rng.range(0.7, 1));
  }

  const containerMats = ['#d55f45', '#346e83', '#d2a044', '#708d75'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  for (let i = 0; i < 38; i++) { const x = rng.range(270, 570), z = rng.range(280, 545), w = rng.range(9, 17), d = rng.range(20, 38), h = rng.range(4, 10); const cargo = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rng.pick(containerMats)); cargo.position.set(x, h / 2, z); cargo.castShadow = true; scene.add(cargo); }
  const craneMat = new THREE.MeshStandardMaterial({ color: '#e39b4f' });
  for (const x of [340, 485]) { const parts = [[x, 21, 360, 3, 42, 3], [x + 12, 21, 360, 3, 42, 3], [x + 6, 41, 360, 22, 2, 3], [x + 17, 20, 360, 2, 38, 2]]; for (const p of parts) { const m = new THREE.Mesh(new THREE.BoxGeometry(p[3], p[4], p[5]), craneMat); m.position.set(p[0], p[1], p[2]); scene.add(m); } }

  // Crown Hill rises behind the northern blocks in faceted coastal scrub ridges.
  const hillMat = new THREE.MeshStandardMaterial({ color: '#526e5d', roughness: 1, flatShading: true });
  for (const [x, z, radius, height] of [[-230, -520, 76, 52], [-125, -505, 91, 77], [18, -526, 86, 63], [155, -500, 76, 46]]) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 9, 4), hillMat); hill.position.set(x, height / 2 - 0.5, z); hill.castShadow = true; hill.receiveShadow = true; scene.add(hill);
  }

  const lampLocations = [];
  const addLamp = (x, z) => lampLocations.push([x, z]);
  const palmBark = new THREE.MeshStandardMaterial({ color: '#8f6347' });
  const palmLeaf = new THREE.MeshStandardMaterial({ color: '#32765d', roughness: 0.85 });
  const palmGeometry = new THREE.CylinderGeometry(0.22, 0.34, 4, 7), crownGeometry = new THREE.SphereGeometry(2.05, 7, 5);
  const palms = [], crownDummy = new THREE.Object3D();
  for (let x = -560; x < 530; x += 30) {
    const scale = rng.range(0.8, 1.18); palms.push([x, 532, scale]); addLamp(x + 12, 505);
  }
  const trunks = new THREE.InstancedMesh(palmGeometry, palmBark, palms.length), crowns = new THREE.InstancedMesh(crownGeometry, palmLeaf, palms.length);
  palms.forEach(([x, z, scale], i) => {
    crownDummy.position.set(x, 2 * scale, z); crownDummy.scale.set(scale, scale, scale); crownDummy.updateMatrix(); trunks.setMatrixAt(i, crownDummy.matrix);
    crownDummy.position.set(x, 4.5 * scale, z); crownDummy.scale.set(scale, 0.55 * scale, scale); crownDummy.updateMatrix(); crowns.setMatrixAt(i, crownDummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true; scene.add(trunks, crowns);
  for (let x = -560; x <= 560; x += 100) for (let z = -560; z <= 560; z += 100) if ((Math.abs(x / 100) % 3 === 0 || Math.abs(z / 100) % 3 === 0) && rng.chance(0.54)) addLamp(x + 10, z + 10);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#39424a', roughness: 0.7 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffd8a0', emissive: '#ff9f63', emissiveIntensity: 1.1 });
  const lampParts = [
    { geometry: new THREE.CylinderGeometry(0.12, 0.17, 6.2, 6), material: lampMat, offset: [0, 3.1, 0] },
    { geometry: new THREE.BoxGeometry(1.3, 0.12, 0.12), material: lampMat, offset: [0.55, 6, 0] },
    { geometry: new THREE.SphereGeometry(0.22, 8, 6), material: bulbMat, offset: [1.1, 5.85, 0] },
  ];
  const lampDummy = new THREE.Object3D();
  for (const part of lampParts) {
    const instances = new THREE.InstancedMesh(part.geometry, part.material, lampLocations.length);
    lampLocations.forEach(([x, z], i) => { lampDummy.position.set(x + part.offset[0], part.offset[1], z + part.offset[2]); lampDummy.rotation.set(0, 0, 0); lampDummy.updateMatrix(); instances.setMatrixAt(i, lampDummy.matrix); });
    instances.instanceMatrix.needsUpdate = true; scene.add(instances);
  }

  const park = new THREE.Mesh(new THREE.PlaneGeometry(145, 118), new THREE.MeshStandardMaterial({ color: '#477456', roughness: 1 })); park.rotation.x = -Math.PI / 2; park.position.set(165, 0.015, -5); scene.add(park);
  for (const [x, z] of [[110, -45], [220, -45], [110, 35], [220, 35], [165, -55], [165, 55]]) addTree(scene, x, z, 0.95);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 0.8, 24), new THREE.MeshStandardMaterial({ color: '#81c6c4', metalness: 0.38, roughness: 0.2 })); fountain.position.set(165, 0.4, -5); scene.add(fountain);

  const parkedColors = ['#bb515b', '#e2c78c', '#38858e', '#576985', '#e7834e'];
  const parkedCars = addParkedCars(scene, rng, parkedColors);

  spawnPoints.push({ x: -38, z: 12, yaw: 0 });
  return { roadGraph, spawnPoints, colliders, districts, districtZones: DISTRICTS, ocean, waterMat, roadMaterial: asphalt, lampMaterial: bulbMat, parkedCars, districtList: DISTRICTS.map(({ name }) => name) };
}
