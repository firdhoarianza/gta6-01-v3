// Small instanced sidewalk crowd with deterministic routes and soft avoidance.
const THREE = globalThis.THREE;

const CROWD_NAMES = ['Mara', 'Sol', 'Tavi', 'Nico', 'Rin', 'Cleo'];
const CROWD_COLORS = ['#4c8391', '#b46d57', '#68719b', '#be9b54', '#52765f', '#a56583'];
const CROWD_JOBS = ['dock clerk', 'night baker', 'ferry hand', 'studio runner', 'market keeper'];
const CITY_WALK_LIMIT = 575;

function makeCrowdInstances(scene, count) {
  const bodyGeometry = new THREE.CapsuleGeometry(0.26, 0.58, 3, 6);
  const headGeometry = new THREE.SphereGeometry(0.19, 8, 6);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#4c8391', roughness: 0.78 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#bd8c70', roughness: 0.84 });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, count);
  bodies.castShadow = true;
  heads.castShadow = true;
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bodies, heads);
  return { bodies, heads, bodyGeometry, headGeometry, bodyMaterial, headMaterial };
}

function sidewalkPoint(rng) {
  const avenue = Math.floor(rng.range(-5, 6)) * 100;
  const along = rng.range(-545, 545);
  const side = rng.chance(0.5) ? 1 : -1;
  if (rng.chance(0.5)) {
    return { x: avenue + side * 10, z: along, axis: 'z' };
  }
  return { x: along, z: avenue + side * 10, axis: 'x' };
}

function createPedestrianRecord(rng) {
  const point = sidewalkPoint(rng);
  const street = Math.round(rng.range(-5, 5)) * 100;
  return {
    name: rng.pick(CROWD_NAMES),
    x: point.x,
    z: point.z,
    axis: point.axis,
    direction: rng.chance(0.5) ? 1 : -1,
    speed: rng.range(0.65, 1.35),
    phase: rng.range(0, Math.PI * 2),
    yielding: 0,
    crossing: { street, crossing: rng.chance(0.5) },
    job: rng.pick(CROWD_JOBS),
    patience: rng.range(1.5, 4.5),
  };
}

function wrapCoordinate(value, limit) {
  if (value > limit) return -limit;
  if (value < -limit) return limit;
  return value;
}

/** Creates an instanced, low draw-call crowd that yields to nearby actors. */
export function createPedestrians(scene, rng, count = 26) {
  const instances = makeCrowdInstances(scene, count);
  const dummy = new THREE.Object3D();
  const pedestrians = [];
  for (let index = 0; index < count; index += 1) {
    const pedestrian = createPedestrianRecord(rng);
    pedestrian.color = rng.pick(CROWD_COLORS);
    pedestrians.push(pedestrian);
    instances.bodies.setColorAt(index, new THREE.Color(pedestrian.color));
  }
  if (instances.bodies.instanceColor) instances.bodies.instanceColor.needsUpdate = true;

  function update(dt, followedPosition, vehicles = []) {
    for (let index = 0; index < pedestrians.length; index += 1) {
      const pedestrian = pedestrians[index];
      const nearPlayer = Math.hypot(pedestrian.x - followedPosition.x, pedestrian.z - followedPosition.z) < 11;
      let avoidanceX = 0;
      let avoidanceZ = 0;
      let threatened = nearPlayer;
      for (const vehicle of vehicles) {
        const position = vehicle.root?.position ?? vehicle.position;
        if (!position) continue;
        const dx = pedestrian.x - position.x;
        const dz = pedestrian.z - position.z;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared < 64) {
          const distance = Math.max(0.25, Math.sqrt(distanceSquared));
          avoidanceX += dx / distance;
          avoidanceZ += dz / distance;
          threatened = true;
        }
      }
      pedestrian.yielding += ((threatened ? 1 : 0) - pedestrian.yielding) * (1 - Math.exp(-5 * dt));
      pedestrian.patience = threatened
        ? Math.max(0, pedestrian.patience - dt)
        : Math.min(4.5, pedestrian.patience + dt * 0.24);
      const pace = pedestrian.patience < 0.25 ? 0.5 : 1;
      const drift = pedestrian.direction * pedestrian.speed * pace * (1 - pedestrian.yielding * 0.72) * dt;
      if (pedestrian.axis === 'x') {
        pedestrian.x += drift + avoidanceX * pedestrian.yielding * dt * 1.8;
        pedestrian.x = wrapCoordinate(pedestrian.x, CITY_WALK_LIMIT);
      } else {
        pedestrian.z += drift + avoidanceZ * pedestrian.yielding * dt * 1.8;
        pedestrian.z = wrapCoordinate(pedestrian.z, CITY_WALK_LIMIT);
      }
      dummy.position.set(pedestrian.x + avoidanceX * pedestrian.yielding * 0.24, 0.92, pedestrian.z + avoidanceZ * pedestrian.yielding * 0.24);
      dummy.position.y += Math.abs(Math.sin(pedestrian.phase)) * Math.min(0.055, pedestrian.speed * 0.035);
      dummy.rotation.set(0, pedestrian.axis === 'x' ? (pedestrian.direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (pedestrian.direction > 0 ? 0 : Math.PI), 0);
      dummy.scale.set(1, 1 - pedestrian.yielding * 0.08, 1);
      dummy.updateMatrix();
      instances.bodies.setMatrixAt(index, dummy.matrix);
      dummy.position.y = 1.66;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      instances.heads.setMatrixAt(index, dummy.matrix);
      pedestrian.phase += dt * pedestrian.speed * 4;
    }
    instances.bodies.instanceMatrix.needsUpdate = true;
    instances.heads.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    scene.remove(instances.bodies, instances.heads);
    instances.bodyGeometry.dispose();
    instances.headGeometry.dispose();
    instances.bodyMaterial.dispose();
    instances.headMaterial.dispose();
  }

  function nearest(position, radius = 14) {
    let nearestPedestrian = null;
    let nearestDistance = radius * radius;
    for (const pedestrian of pedestrians) {
      const dx = pedestrian.x - position.x;
      const dz = pedestrian.z - position.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) {
        nearestPedestrian = pedestrian;
        nearestDistance = distance;
      }
    }
    return nearestPedestrian;
  }

  update(0, { x: 0, z: 0 });
  return { pedestrians, update, dispose, nearest, instances };
}
