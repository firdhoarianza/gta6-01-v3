// Procedural third-person avatar, capsule-like collision footprint, and collision-aware follow camera.
import { CAMERA, PLAYER } from './config.js';
import { applyVehicleCollision } from './vehicles.js';
const THREE = globalThis.THREE;
const mat = (color, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness });

function createAvatar(scene) {
  const root = new THREE.Group(), shirt = mat('#e47653'), pants = mat('#26364d'), skin = mat('#bb846a'), shoes = mat('#e4d0b0');
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.62, 4, 7), shirt); torso.position.y = 1.13; torso.castShadow = true; root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin); head.position.y = 1.75; head.castShadow = true; root.add(head);
  const limbs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 3, 6), pants); leg.position.set(side * 0.19, 0.48, 0); leg.castShadow = true; root.add(leg); limbs.push({ mesh: leg, phase: side * Math.PI });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.44, 3, 6), shirt); arm.position.set(side * 0.43, 1.12, 0); arm.rotation.z = side * -0.12; arm.castShadow = true; root.add(arm); limbs.push({ mesh: arm, phase: side * Math.PI + Math.PI });
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.34), shoes); foot.position.set(side * 0.19, 0.13, -0.04); root.add(foot);
  }
  scene.add(root); return { root, limbs };
}

function circleAabb(x, z, r, box) {
  const px = THREE.MathUtils.clamp(x, box.minX, box.maxX), pz = THREE.MathUtils.clamp(z, box.minZ, box.maxZ);
  return (x - px) ** 2 + (z - pz) ** 2 < r * r;
}

function capsuleBuildingOverlap(x, z, feetY, radius, height, box) {
  const top = feetY + height;
  if (top < (box.minY ?? 0) || feetY > (box.maxY ?? Infinity)) return false;
  return circleAabb(x, z, radius, box);
}

export function createPlayer(scene, spawn, colliders, camera) {
  const avatar = createAvatar(scene);
  const player = { position: new THREE.Vector3(spawn.x, 0, spawn.z), velocity: new THREE.Vector3(), yaw: spawn.yaw, vertical: 0, grounded: true, crouched: false, inVehicle: null, weapon: 1, radio: 0, activity: 'Free roam', avatar: avatar.root, limbs: avatar.limbs, cameraYaw: spawn.yaw, cameraPitch: -0.12 };
  const desired = new THREE.Vector3(), look = new THREE.Vector3(), cameraRay = new THREE.Raycaster();
  const cameraBlockers = colliders.map((collider) => collider.mesh).filter(Boolean);

  function move(dt, input, world) {
    const mouse = input.look(); player.cameraYaw -= mouse.x * CAMERA.sensitivity; player.cameraPitch = THREE.MathUtils.clamp(player.cameraPitch - mouse.y * CAMERA.sensitivity, -0.72, 0.42);
    if (player.inVehicle) return;
    player.crouched = input.held('KeyF');
    const moveInput = input.move(), length = Math.hypot(moveInput.x, moveInput.z), speed = input.held('ShiftLeft') || input.held('ShiftRight') ? PLAYER.sprint : PLAYER.walk;
    const forward = new THREE.Vector3(Math.sin(player.cameraYaw), 0, -Math.cos(player.cameraYaw));
    const right = new THREE.Vector3(Math.cos(player.cameraYaw), 0, Math.sin(player.cameraYaw));
    desired.set(0, 0, 0);
    if (length > 0) desired.addScaledVector(right, moveInput.x / length).addScaledVector(forward, -moveInput.z / length).normalize().multiplyScalar(player.crouched ? speed * 0.43 : speed);
    const lerp = 1 - Math.exp(-12 * dt); player.velocity.x += (desired.x - player.velocity.x) * lerp; player.velocity.z += (desired.z - player.velocity.z) * lerp;
    if (input.held('Space') && player.grounded && !player.crouched) { player.velocity.y = PLAYER.jump; player.grounded = false; }
    if (!player.grounded) { player.velocity.y -= PLAYER.gravity * dt; player.vertical += player.velocity.y * dt; if (player.vertical <= 0) { player.vertical = 0; player.velocity.y = 0; player.grounded = true; } }
    const r = PLAYER.radius;
    let nx = player.position.x + player.velocity.x * dt, nz = player.position.z + player.velocity.z * dt;
    for (const collider of colliders) {
      const height = player.crouched ? PLAYER.crouchHeight : PLAYER.height;
      if (capsuleBuildingOverlap(nx, player.position.z, player.vertical, r, height, collider)) { nx = player.position.x; player.velocity.x = 0; }
      if (capsuleBuildingOverlap(nx, nz, player.vertical, r, height, collider)) { nz = player.position.z; player.velocity.z = 0; }
    }
    player.position.x = THREE.MathUtils.clamp(nx, -CITY_EDGE, CITY_EDGE); player.position.z = THREE.MathUtils.clamp(nz, -CITY_EDGE, CITY_EDGE);
    if (length > 0.1) { const facing = Math.atan2(desired.x, -desired.z); const turn = THREE.MathUtils.euclideanModulo(facing - player.yaw + Math.PI, Math.PI * 2) - Math.PI; player.yaw += turn * (1 - Math.exp(-12 * dt)); }
    player.avatar.position.set(player.position.x, player.vertical, player.position.z); player.avatar.rotation.y = player.yaw;
    player.avatar.scale.y = player.crouched ? 0.82 : 1;
    const moving = Math.min(1, Math.hypot(player.velocity.x, player.velocity.z) / speed);
    const time = performance.now() * 0.012;
    for (const limb of player.limbs) limb.mesh.rotation.x = Math.sin(time + limb.phase) * moving * 0.62;
    if (world) updateCamera(dt, world);
  }

  function updateCamera(dt, world) {
    const targetPos = player.inVehicle ? player.inVehicle.root.position : player.position;
    const yaw = player.cameraYaw, pitch = player.cameraPitch;
    const focusHeight = player.inVehicle ? 1.15 : CAMERA.lookHeight;
    look.set(targetPos.x, targetPos.y + focusHeight, targetPos.z);
    const horizontal = CAMERA.distance * Math.cos(pitch);
    desired.set(look.x - Math.sin(yaw) * horizontal, look.y + CAMERA.height + Math.sin(pitch) * CAMERA.distance, look.z + Math.cos(yaw) * horizontal);
    const origin = look.clone(), direction = desired.clone().sub(origin), distance = direction.length(); direction.normalize();
    cameraRay.set(origin, direction); cameraRay.far = distance;
    const hits = cameraRay.intersectObjects(cameraBlockers, false);
    const target = hits.length ? hits[0].point.clone().addScaledVector(direction, -0.45) : desired;
    camera.position.lerp(target, 1 - Math.exp(-CAMERA.smooth * dt)); camera.lookAt(look);
  }

  function syncVehicle(dt, world) { if (!player.inVehicle) return; const p = player.inVehicle.root.position; player.position.copy(p); player.avatar.position.set(p.x, -100, p.z); updateCamera(dt, world); }
  function enter(vehicle) { player.inVehicle = vehicle; vehicle.occupied = true; player.avatar.visible = false; player.position.copy(vehicle.root.position); }
  function exit() { if (!player.inVehicle) return null; const vehicle = player.inVehicle; const side = new THREE.Vector3(Math.cos(vehicle.yaw), 0, Math.sin(vehicle.yaw)); player.position.copy(vehicle.root.position).addScaledVector(side, 1.8); player.position.y = 0; player.yaw = vehicle.yaw; player.inVehicle = null; vehicle.occupied = false; player.avatar.visible = true; return vehicle; }
  function respawn(point) { player.position.set(point.x, 0, point.z); player.vertical = 0; player.velocity.set(0, 0, 0); player.inVehicle = null; player.avatar.visible = true; }

  camera.position.set(player.position.x + 0.5, 4, player.position.z + 8);
  camera.lookAt(player.position.x, 1, player.position.z);
  return { player, move, updateCamera, syncVehicle, enter, exit, respawn };
}

const CITY_EDGE = 593;
