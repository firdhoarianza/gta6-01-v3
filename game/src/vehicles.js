// Arcade vehicle bodies and handling. Forward is local -Z, so steering and traffic share yaw conventions.
import { VEHICLE } from './config.js';
const THREE = globalThis.THREE;
const WHEEL_RADIUS = 0.38;

export const CAR_TYPES = {
  sedan: { name: 'Sundown', color: '#4d91a0', size: [1.9, 1.15, 4.15], speed: 29, accel: 0.93 },
  sports: { name: 'Veloce', color: '#d14e58', size: [2, 0.95, 4.25], speed: 40, accel: 1.25 },
  taxi: { name: 'Yellowbird', color: '#e8bd4f', size: [1.95, 1.25, 4.2], speed: 27, accel: 0.82 },
  police: { name: 'County Unit', color: '#e7e8e4', size: [2, 1.3, 4.5], speed: 36, accel: 1.1 },
  van: { name: 'Courier', color: '#d4d2c9', size: [2.05, 1.8, 4.8], speed: 25, accel: 0.78 },
  pickup: { name: 'Coastline', color: '#78906d', size: [2.05, 1.42, 4.55], speed: 28, accel: 0.88 },
};
const material = (color, roughness = 0.48, metalness = 0.12) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function buildCar(type, colorOverride) {
  const spec = CAR_TYPES[type] ?? CAR_TYPES.sedan, root = new THREE.Group();
  const bodyMat = material(colorOverride ?? spec.color), dark = material('#222831', 0.34, 0.25), glass = new THREE.MeshStandardMaterial({ color: '#385565', roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.82 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(...spec.size), bodyMat); body.position.y = spec.size[1] * 0.52; body.castShadow = true; body.receiveShadow = true; root.add(body);
  const cabinZ = type === 'van' ? -0.18 : -0.25, cabinH = type === 'van' ? 1.15 : 0.74;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.size[0] * 0.77, cabinH, spec.size[2] * 0.48), glass); cabin.position.set(0, spec.size[1] + cabinH * 0.35, cabinZ); cabin.castShadow = true; root.add(cabin);
  if (type === 'pickup') { const bed = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.45, 1.4), dark); bed.position.set(0, 1.25, 1.15); root.add(bed); }
  if (type === 'taxi') { const roof = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.35), material('#f3dd9a')); roof.position.set(0, 1.87, -0.15); root.add(roof); }
  const wheelMat = material('#17191e', 0.76), hubMat = material('#b2b7b4', 0.28, 0.72), wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.24, 12);
  const wheels = [];
  for (const x of [-spec.size[0] * 0.53, spec.size[0] * 0.53]) for (const z of [-spec.size[2] * 0.32, spec.size[2] * 0.34]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.4, z); wheel.castShadow = true; root.add(wheel); wheels.push(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 10), hubMat); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); root.add(hub);
  }
  for (const x of [-0.64, 0.64]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.09), new THREE.MeshStandardMaterial({ color: '#fff2d1', emissive: '#fff0bd', emissiveIntensity: 0.7 })); head.position.set(x, 0.74, -spec.size[2] / 2 - 0.035); root.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.19, 0.09), new THREE.MeshStandardMaterial({ color: '#c83242', emissive: '#e92035', emissiveIntensity: 0.45 })); tail.position.set(x, 0.73, spec.size[2] / 2 + 0.035); root.add(tail);
  }
  if (type === 'police') {
    for (const [x, color] of [[-0.34, '#4f91ff'], [0.34, '#ff3b63']]) { const light = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 })); light.position.set(x, 2.08, -0.12); root.add(light); }
  }
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), new THREE.MeshBasicMaterial({ color: '#4a4d50', transparent: true, opacity: 0.48 })); smoke.position.set(0, 1.1, spec.size[2] * 0.58); smoke.visible = false; root.add(smoke);
  return { root, spec, wheels, smoke };
}

export function createVehicle(type = 'sedan', x = 0, z = 0, yaw = 0, options = {}) {
  const built = buildCar(type, options.color), { root, spec, wheels, smoke } = built;
  root.position.set(x, 0, z); root.rotation.y = yaw;
  const vehicle = { type, name: spec.name, root, spec, wheels, smoke, speed: 0, velocity: new THREE.Vector3(), steer: 0, yaw, damage: 0, occupied: false, ai: options.ai ?? false, hornTime: 0, collisionTimer: 0, routeNode: options.routeNode ?? null, targetNode: options.targetNode ?? null, laneOffset: options.laneOffset ?? 0, turnTimer: 0 };
  vehicle.setDamage = (amount = 0.1) => {
    vehicle.damage = Math.min(1, vehicle.damage + Math.max(0, amount));
    vehicle.smoke.visible = vehicle.damage > 0.18;
    return vehicle.damage;
  };
  vehicle.setHorn = (time = 0.22) => { vehicle.hornTime = time; };
  return vehicle;
}

export function updateVehicle(vehicle, input, dt) {
  if (vehicle.ai) return;
  const throttle = (input.held('KeyW') || input.held('ArrowUp') ? 1 : 0) - (input.held('KeyS') || input.held('ArrowDown') ? 1 : 0);
  const steer = (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) - (input.held('KeyA') || input.held('ArrowLeft') ? 1 : 0);
  const handbrake = input.held('Space');
  if (throttle > 0) vehicle.speed += VEHICLE.accel * vehicle.spec.accel * dt;
  else if (throttle < 0) vehicle.speed += (vehicle.speed > 1 ? -VEHICLE.brake : -VEHICLE.accel) * dt;
  else vehicle.speed *= Math.max(0, 1 - dt * (handbrake ? 2.8 : 0.62));
  vehicle.speed = THREE.MathUtils.clamp(vehicle.speed, -VEHICLE.reverseSpeed, vehicle.spec.speed);
  const normalized = Math.min(1, Math.abs(vehicle.speed) / 7);
  const speedGrip = THREE.MathUtils.lerp(1, 0.74, Math.max(0, normalized - 0.45));
  vehicle.yaw += steer * VEHICLE.steer * speedGrip * normalized * dt * (vehicle.speed < 0 ? -1 : 1) * (handbrake ? 1.34 : 1);
  vehicle.root.rotation.y = vehicle.yaw;
  vehicle.root.rotation.z += (0 - vehicle.root.rotation.z) * (1 - Math.exp(-5.5 * dt));
  const forward = new THREE.Vector3(Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw));
  const grip = handbrake ? VEHICLE.driftGrip : VEHICLE.grip;
  const lateralDirection = new THREE.Vector3(Math.cos(vehicle.yaw), 0, Math.sin(vehicle.yaw));
  let lateralSpeed = vehicle.velocity.dot(lateralDirection);
  if (handbrake && Math.abs(steer) > 0) {
    lateralSpeed += steer * Math.min(5, Math.abs(vehicle.speed) * 0.18) * dt;
  }
  const gripResponse = 1 - Math.exp(-grip * dt);
  const targetVelocity = forward.multiplyScalar(vehicle.speed);
  const retainedLateralSpeed = lateralSpeed * Math.exp(-grip * dt * (handbrake ? 0.34 : 1));
  vehicle.velocity.lerp(targetVelocity, gripResponse);
  const currentLateralSpeed = vehicle.velocity.dot(lateralDirection);
  vehicle.velocity.addScaledVector(lateralDirection, retainedLateralSpeed - currentLateralSpeed);
  vehicle.root.position.addScaledVector(vehicle.velocity, dt);
  for (const wheel of vehicle.wheels) wheel.rotation.x += vehicle.speed * dt / 0.38;
  vehicle.damage = Math.max(0, vehicle.damage - dt * 0.002);
  vehicle.smoke.visible = vehicle.damage > 0.18;
  vehicle.smoke.material.opacity = Math.min(0.62, vehicle.damage * 0.55);
  vehicle.smoke.scale.setScalar(0.82 + vehicle.damage * 0.8 + Math.sin(vehicle.damage * 70 + vehicle.speed) * 0.04);
  vehicle.smoke.position.y = 1.08 + Math.sin(vehicle.damage * 22) * 0.08;
  vehicle.hornTime = Math.max(0, vehicle.hornTime - dt);
  vehicle.collisionTimer = Math.max(0, vehicle.collisionTimer - dt);
}

export function applyVehicleCollision(vehicle, impulse = 5) {
  if (vehicle.collisionTimer > 0) return false;
  vehicle.speed *= -THREE.MathUtils.clamp(0.12 + impulse * 0.012, 0.12, 0.34);
  vehicle.setDamage(impulse * 0.04);
  vehicle.collisionTimer = 0.42;
  vehicle.root.rotation.z = THREE.MathUtils.clamp(vehicle.root.rotation.z + (vehicle.velocity.x >= 0 ? 1 : -1) * 0.035, -0.12, 0.12);
  return true;
}
