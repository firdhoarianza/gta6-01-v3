// Procedural avatar motion, camera spring, and vehicle transitions.
import { CAMERA, PLAYER } from './config.js';

const THREE = globalThis.THREE;
const CITY_EDGE = 593;

function makeMaterial(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function addLimb(root, geometry, material, position, pivotHeight) {
  const pivot = new THREE.Group();
  pivot.position.set(position[0], pivotHeight, position[2]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -pivotHeight + position[1];
  mesh.castShadow = true;
  pivot.add(mesh);
  root.add(pivot);
  return pivot;
}

function createAvatar(scene) {
  const root = new THREE.Group();
  const shirt = makeMaterial('#e47653');
  const pants = makeMaterial('#26364d');
  const skin = makeMaterial('#bb846a');
  const shoes = makeMaterial('#e4d0b0');
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.62, 4, 7), shirt);
  torso.position.y = 1.13;
  torso.castShadow = true;
  root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 9), skin);
  head.position.y = 1.75;
  head.castShadow = true;
  root.add(head);
  const limbs = [];
  const feet = [];
  for (const side of [-1, 1]) {
    const leg = addLimb(root, new THREE.CapsuleGeometry(0.14, 0.45, 3, 7), pants, [side * 0.19, 0.48, 0], 0.73);
    const arm = addLimb(root, new THREE.CapsuleGeometry(0.105, 0.44, 3, 7), shirt, [side * 0.43, 1.12, 0], 1.42);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.34), shoes);
    foot.position.set(side * 0.19, 0.13, -0.04);
    root.add(foot);
    limbs.push({ pivot: leg, phase: side * Math.PI, kind: 'leg' });
    limbs.push({ pivot: arm, phase: side * Math.PI + Math.PI, kind: 'arm' });
    feet.push(foot);
  }
  scene.add(root);
  return { root, limbs, feet, torso, head };
}

function circleOverlapsBox(x, z, radius, box) {
  const nearestX = THREE.MathUtils.clamp(x, box.minX, box.maxX);
  const nearestZ = THREE.MathUtils.clamp(z, box.minZ, box.maxZ);
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2;
}

function capsuleBuildingOverlap(x, z, feetY, radius, height, box) {
  const top = feetY + height;
  if (top < (box.minY ?? 0) || feetY > (box.maxY ?? Infinity)) {
    return false;
  }
  return circleOverlapsBox(x, z, radius, box);
}

/** Creates a controllable walker and collision-aware third-person camera. */
export function createPlayer(scene, spawn, colliders, camera, audio = null) {
  const avatar = createAvatar(scene);
  const player = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw,
    vertical: 0,
    grounded: true,
    crouched: false,
    aiming: false,
    inVehicle: null,
    weapon: 0,
    radio: 0,
    activity: 'Free roam',
    avatar: avatar.root,
    limbs: avatar.limbs,
    cameraYaw: spawn.yaw,
    cameraPitch: -0.12,
    health: 1,
    armor: 0.35,
  };
  const desiredVelocity = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const cameraRay = new THREE.Raycaster();
  const cameraBlockers = colliders.map((collider) => collider.mesh).filter(Boolean);
  let animationTime = 0;
  let footstepPhase = 0;
  let previousPlanarSpeed = 0;
  let jumpAge = 0;
  let transitionBlend = 0;
  let wasInVehicle = false;

  function updateMouse(input) {
    const mouse = input.look();
    player.cameraYaw -= mouse.x * CAMERA.sensitivity;
    player.cameraPitch = THREE.MathUtils.clamp(
      player.cameraPitch - mouse.y * CAMERA.sensitivity,
      -0.82,
      0.48,
    );
  }

  function move(dt, input, world) {
    updateMouse(input);
    if (player.inVehicle) {
      updateCamera(dt, world);
      return;
    }
    player.aiming = input.held('MouseRight') || input.held('KeyQ');
    player.crouched = input.held('KeyF');
    const movement = input.move();
    const inputLength = Math.hypot(movement.x, movement.z);
    const running = input.held('ShiftLeft') || input.held('ShiftRight');
    const walkSpeed = running ? PLAYER.sprint : PLAYER.walk;
    const forward = new THREE.Vector3(Math.sin(player.cameraYaw), 0, -Math.cos(player.cameraYaw));
    const right = new THREE.Vector3(Math.cos(player.cameraYaw), 0, Math.sin(player.cameraYaw));
    desiredVelocity.set(0, 0, 0);
    if (inputLength > 0) {
      desiredVelocity.addScaledVector(right, movement.x / inputLength);
      desiredVelocity.addScaledVector(forward, -movement.z / inputLength);
      desiredVelocity.normalize();
      desiredVelocity.multiplyScalar(player.crouched ? walkSpeed * 0.42 : walkSpeed);
    }
    const response = 1 - Math.exp(-12 * dt);
    player.velocity.x += (desiredVelocity.x - player.velocity.x) * response;
    player.velocity.z += (desiredVelocity.z - player.velocity.z) * response;
    const jumpPressed = input.held('Space') && player.grounded && !player.crouched;
    if (jumpPressed) {
      player.velocity.y = PLAYER.jump;
      player.grounded = false;
      jumpAge = 0;
    }
    if (!player.grounded) {
      jumpAge += dt;
      player.velocity.y -= PLAYER.gravity * dt;
      player.vertical += player.velocity.y * dt;
      if (player.vertical <= 0) {
        player.vertical = 0;
        player.velocity.y = 0;
        player.grounded = true;
      }
    }
    resolveWalkingCollision(dt);
    animateAvatar(dt, inputLength, running, jumpPressed);
    if (world) {
      updateCamera(dt, world);
    }
  }

  function resolveWalkingCollision(dt) {
    const radius = PLAYER.radius;
    let nextX = player.position.x + player.velocity.x * dt;
    let nextZ = player.position.z + player.velocity.z * dt;
    const height = player.crouched ? PLAYER.crouchHeight : PLAYER.height;
    for (const collider of colliders) {
      if (capsuleBuildingOverlap(nextX, player.position.z, player.vertical, radius, height, collider)) {
        nextX = player.position.x;
        player.velocity.x = 0;
      }
      if (capsuleBuildingOverlap(nextX, nextZ, player.vertical, radius, height, collider)) {
        nextZ = player.position.z;
        player.velocity.z = 0;
      }
    }
    player.position.x = THREE.MathUtils.clamp(nextX, -CITY_EDGE, CITY_EDGE);
    player.position.z = THREE.MathUtils.clamp(nextZ, -CITY_EDGE, CITY_EDGE);
    const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    if (planarSpeed > 0.45) {
      const facing = Math.atan2(player.velocity.x, -player.velocity.z);
      const difference = THREE.MathUtils.euclideanModulo(facing - player.yaw + Math.PI, Math.PI * 2) - Math.PI;
      player.yaw += difference * (1 - Math.exp(-13 * dt));
    }
    player.avatar.position.set(player.position.x, player.vertical, player.position.z);
    player.avatar.rotation.y = player.yaw;
  }

  function animateAvatar(dt, inputLength, running, jumped) {
    animationTime += dt;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const stride = running ? 12.5 : 9.2;
    const movementFactor = Math.min(1, speed / (running ? PLAYER.sprint : PLAYER.walk));
    const jumping = !player.grounded;
    const crouchScale = player.crouched ? 0.78 : 1;
    player.avatar.scale.y += (crouchScale - player.avatar.scale.y) * (1 - Math.exp(-9 * dt));
    const sway = Math.sin(animationTime * 1.4) * 0.025;
    avatar.torso.rotation.z = sway + (player.aiming ? 0.08 : 0);
    avatar.head.rotation.x = player.aiming ? -0.08 : 0;
    if (jumping) {
      player.limbs.forEach((limb) => {
        limb.pivot.rotation.x = limb.kind === 'leg' ? -0.35 : 0.45;
      });
    } else if (player.crouched) {
      player.limbs.forEach((limb) => {
        limb.pivot.rotation.x = limb.kind === 'leg' ? -0.82 : 0.68;
      });
    } else {
      player.limbs.forEach((limb) => {
        const amplitude = limb.kind === 'leg' ? 0.66 : 0.48;
        limb.pivot.rotation.x = Math.sin(animationTime * stride + limb.phase) * movementFactor * amplitude;
      });
    }
    if (jumped) {
      jumpAge = 0;
    }
    const nextPhase = Math.floor(animationTime * stride / Math.PI);
    if (movementFactor > 0.48 && nextPhase !== footstepPhase && player.grounded) {
      footstepPhase = nextPhase;
      if (audio?.footstep) {
        audio.footstep(running ? 1 : 0.68);
      }
    }
    if (movementFactor < 0.08) {
      avatar.torso.rotation.x = Math.sin(animationTime * 1.7) * 0.018;
    } else {
      avatar.torso.rotation.x = 0;
    }
    previousPlanarSpeed = speed;
  }

  function updateCamera(dt, world) {
    const vehicle = player.inVehicle;
    const position = vehicle ? vehicle.root.position : player.position;
    const targetHeight = vehicle ? 1.12 : PLAYER.height * 0.67;
    const blendTarget = vehicle ? 1 : 0;
    transitionBlend += (blendTarget - transitionBlend) * (1 - Math.exp(-4.6 * dt));
    const aimPull = player.aiming && !vehicle ? 2.3 : 0;
    const distance = THREE.MathUtils.lerp(CAMERA.distance, 5.1, aimPull / 2.3);
    const fovKick = Math.min(9, Math.abs(previousPlanarSpeed) * 0.24);
    const baseFov = player.aiming && !vehicle ? 48 : CAMERA.fov;
    const targetFov = baseFov + fovKick;
    world.camera.fov += (targetFov - world.camera.fov) * (1 - Math.exp(-5 * dt));
    world.camera.updateProjectionMatrix();
    lookTarget.set(position.x, position.y + targetHeight, position.z);
    const horizontal = distance * Math.cos(player.cameraPitch);
    cameraTarget.set(
      lookTarget.x - Math.sin(player.cameraYaw) * horizontal,
      lookTarget.y + CAMERA.height + Math.sin(player.cameraPitch) * distance,
      lookTarget.z + Math.cos(player.cameraYaw) * horizontal,
    );
    cameraDirection.copy(cameraTarget).sub(lookTarget);
    const cameraDistance = cameraDirection.length();
    cameraDirection.normalize();
    cameraRay.set(lookTarget, cameraDirection);
    cameraRay.far = cameraDistance;
    const hits = cameraRay.intersectObjects(cameraBlockers, false);
    if (hits.length > 0) {
      cameraTarget.copy(hits[0].point).addScaledVector(cameraDirection, -0.42);
    }
    const smooth = CAMERA.smooth + transitionBlend * 2.5;
    world.camera.position.lerp(cameraTarget, 1 - Math.exp(-smooth * dt));
    world.camera.lookAt(lookTarget);
  }

  function syncVehicle(dt, world) {
    if (!player.inVehicle) {
      return;
    }
    player.position.copy(player.inVehicle.root.position);
    player.avatar.position.set(player.position.x, -100, player.position.z);
    updateCamera(dt, world);
  }

  function enter(vehicle) {
    player.inVehicle = vehicle;
    vehicle.occupied = true;
    player.avatar.visible = false;
    player.position.copy(vehicle.root.position);
    wasInVehicle = true;
  }

  function exit() {
    if (!player.inVehicle) {
      return null;
    }
    const vehicle = player.inVehicle;
    const side = new THREE.Vector3(Math.cos(vehicle.yaw), 0, Math.sin(vehicle.yaw));
    player.position.copy(vehicle.root.position).addScaledVector(side, 1.8);
    player.position.y = 0;
    player.yaw = vehicle.yaw;
    player.cameraYaw = vehicle.yaw;
    player.inVehicle = null;
    vehicle.occupied = false;
    player.avatar.visible = true;
    wasInVehicle = false;
    return vehicle;
  }

  function respawn(point) {
    player.position.set(point.x, 0, point.z);
    player.vertical = 0;
    player.velocity.set(0, 0, 0);
    player.inVehicle = null;
    player.avatar.visible = true;
    player.health = 1;
    player.armor = 0.35;
  }

  function footstep(intensity = 1) {
    if (audio?.footstep) {
      audio.footstep(intensity);
    }
  }

  camera.position.set(player.position.x + 0.5, 4, player.position.z + 8);
  camera.lookAt(player.position.x, 1, player.position.z);
  return { player, move, updateCamera, syncVehicle, enter, exit, respawn, footstep };
}
