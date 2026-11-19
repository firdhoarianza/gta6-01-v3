// Deterministic camera-ready Vista Bay scenes for ?shot=start|play|end.
import { createVehicle } from './vehicles.js';

const THREE = globalThis.THREE;
const SHOT_CAMERA_DISTANCE = 10;
const SHOT_READY_FRAME = 12;

function addHelicopter(scene) {
  const helicopter = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#263541', roughness: 0.54, metalness: 0.32 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#70b9c4', emissive: '#174752', emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 4.1), bodyMaterial);
  body.castShadow = true;
  helicopter.add(body);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), glassMaterial);
  cabin.scale.set(0.96, 0.75, 0.8);
  cabin.position.set(0, 0.42, -0.72);
  helicopter.add(cabin);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 3.7), bodyMaterial);
  tail.position.set(0, 0.18, 3.45);
  helicopter.add(tail);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 7), bodyMaterial);
  mast.position.y = 0.78;
  helicopter.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.03;
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: '#18232d', roughness: 0.7 });
  for (let index = 0; index < 4; index += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 7.4), bladeMaterial);
    blade.rotation.y = index * Math.PI / 2;
    rotor.add(blade);
  }
  helicopter.add(rotor);
  const lamp = new THREE.SpotLight('#fff0b5', 150, 95, Math.PI / 7, 0.42, 1.2);
  lamp.position.set(0, -0.3, 0.2);
  const target = new THREE.Object3D();
  target.position.set(0, -34, -7);
  helicopter.add(target);
  lamp.target = target;
  helicopter.add(lamp);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(7.2, 36, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe7a2', transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.set(0, -18, -3.5);
  beam.rotation.x = Math.PI;
  helicopter.add(beam);
  helicopter.position.set(8, 38, -23);
  helicopter.rotation.y = -0.18;
  helicopter.userData.rotor = rotor;
  scene.add(helicopter);
  return helicopter;
}

function addShotTraffic(scene, traffic, playerCar, rng, includePolice = false) {
  const parkedTraffic = [];
  for (const [type, x, z, yaw] of [
    ['taxi', -23, -43, 0],
    ['sedan', -5, 41, Math.PI],
    ['van', -28, 66, 0],
    ['pickup', 24, -71, Math.PI],
    ['sports', 11, 88, Math.PI],
  ]) {
    const car = createVehicle(type, x, z, yaw, { color: rng.pick(['#d27955', '#68a19b', '#d2b45f', '#7184a7']) });
    car.speed = rng.range(3, 8);
    scene.add(car.root);
    parkedTraffic.push(car);
  }
  const policeCars = [];
  const policeStarts = includePolice ? [[-12, 26, 0.3], [13, 34, -0.4]] : [];
  for (const [x, z, yaw] of policeStarts) {
    const police = createVehicle('police', x, z, yaw, { ai: true });
    police.speed = 8;
    police.chaseTarget = playerCar;
    scene.add(police.root);
    traffic.traffic.push(police);
    policeCars.push(police);
  }
  return { parkedTraffic, policeCars };
}

/** Stages shot scenes and returns a tiny deterministic animation driver. */
export function createShotDirector(options) {
  const { world, player, enter, playerCars, traffic, pedestrians, hud, rng } = options;
  const shot = new URLSearchParams(globalThis.location.search).get('shot');
  const validShot = ['start', 'play', 'end'].includes(shot) ? shot : null;
  const state = { shot: validShot, frame: 0, renderedFrames: 0, elapsed: 0, car: null, helicopter: null, police: [], extraTraffic: [] };
  const origin = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const carTargetScratch = new THREE.Vector3();

  function clearStage() {
    if (state.helicopter) {
      world.scene.remove(state.helicopter);
      state.helicopter = null;
    }
    for (const car of state.extraTraffic) {
      world.scene.remove(car.root);
    }
    for (const police of state.police) {
      const index = traffic.traffic.indexOf(police);
      if (index >= 0) traffic.traffic.splice(index, 1);
      world.scene.remove(police.root);
    }
    state.extraTraffic.length = 0;
    state.police.length = 0;
  }

  function stageStart() {
    clearStage();
    world.setTimeOfDay(0.39);
    world.setWeather('clear');
    player.avatar.visible = true;
    player.position.set(-86, 0, 93);
    player.cameraYaw = 0.24;
    world.camera.position.set(-240, 118, 240);
    world.camera.fov = 52;
    world.camera.lookAt(12, 28, -40);
    world.camera.updateProjectionMatrix();
    hud.setWantedLevel(0);
    hud.setPursuit(0);
    hud.setDamage(0);
    hud.setObjective('LOW TIDE', 'The streets are warm. The water is rising.');
  }

  function stagePlay() {
    clearStage();
    world.setTimeOfDay(0.39);
    world.setWeather('clear');
    player.health = 1;
    player.armor = 0.35;
    player.avatar.visible = false;
    const car = playerCars.find((entry) => entry.type === 'sports') ?? playerCars[0];
    car.root.position.set(-14, 0, -48);
    car.yaw = 0.12;
    car.root.rotation.y = car.yaw;
    car.speed = 18;
    car.velocity.set(0, 0, -18);
    enter(car);
    state.car = car;
    const staged = addShotTraffic(world.scene, traffic, car, rng);
    state.extraTraffic = staged.parkedTraffic;
    state.police.length = 0;
    for (const [index, pedestrian] of pedestrians.pedestrians.entries()) {
      const side = index % 2 === 0 ? 1 : -1;
      pedestrian.axis = 'z';
      pedestrian.x = -14 + side * (7 + Math.floor(index / 2) * 1.15);
      pedestrian.z = -82 + (index % 7) * 12;
      pedestrian.direction = index % 3 === 0 ? -1 : 1;
    }
    pedestrians.update(0, car.root.position, staged.parkedTraffic);
    player.position.copy(car.root.position);
    player.cameraYaw = -0.18;
    player.cameraPitch = -0.1;
    world.camera.fov = 68;
    world.camera.updateProjectionMatrix();
    hud.setWantedLevel(0);
    hud.setPursuit(0);
    hud.setObjective('DOWNTOWN RUN', 'A green light and a long way to the coast');
    hud.showDialogue('RADIO · CITRUS AM', 'The late sun is holding over Neon Row.');
  }

  function stageEnd() {
    clearStage();
    world.setTimeOfDay(0.75);
    world.setWeather('rain');
    player.health = 0.72;
    player.armor = 0.18;
    player.avatar.visible = false;
    const car = playerCars.find((entry) => entry.type === 'sports') ?? playerCars[0];
    car.root.position.set(-7, 0, -12);
    car.yaw = 0.42;
    car.root.rotation.y = car.yaw;
    car.speed = 25;
    car.velocity.set(Math.sin(car.yaw) * 25, 0, -Math.cos(car.yaw) * 25);
    enter(car);
    state.car = car;
    const staged = addShotTraffic(world.scene, traffic, car, rng, true);
    state.extraTraffic = staged.parkedTraffic;
    state.police = staged.policeCars;
    state.police[0].root.position.set(-13, 0, 8);
    state.police[1].root.position.set(7, 0, 19);
    state.police[0].speed = 21;
    state.police[1].speed = 19;
    for (const [index, pedestrian] of pedestrians.pedestrians.entries()) {
      const side = index % 2 === 0 ? 1 : -1;
      pedestrian.axis = 'z';
      pedestrian.x = -7 + side * (9 + Math.floor(index / 2) * 1.2);
      pedestrian.z = -42 + (index % 8) * 12;
      pedestrian.direction = index % 3 === 0 ? -1 : 1;
    }
    pedestrians.update(0, car.root.position, [...state.police]);
    state.helicopter = addHelicopter(world.scene);
    player.position.copy(car.root.position);
    player.cameraYaw = -0.2;
    player.cameraPitch = -0.08;
    world.camera.fov = 72;
    world.camera.updateProjectionMatrix();
    hud.setWantedLevel(4);
    hud.setPursuit(0);
    hud.update({
      position: player.position, heading: car.yaw, district: 'Neon Row', districts: [], police: [], mission: null,
      wanted: 4, health: player.health, armor: player.armor, damage: 0, weapon: 'Unarmed', ammo: 0, reserve: 0,
      driving: true, speed: car.speed * 3.6, weather: world.weather, pursuit: 0,
    }, 0);
    hud.setHealth(0.72);
    hud.setArmor(0.18);
    hud.setObjective('NIGHT SHIFT', 'County units closing from the boardwalk');
    hud.showDialogue('DISPATCH', 'Unit Four, keep the bay road sealed.');
  }

  function stage() {
    if (!state.shot) return false;
    if (state.shot === 'start') stageStart();
    if (state.shot === 'play') stagePlay();
    if (state.shot === 'end') stageEnd();
  const focusPosition = state.car?.root.position ?? player.position;
  world.update(4.5, false, focusPosition);
    if (state.shot === 'start') {
      world.camera.layers.enableAll();
    }
    return true;
  }

  function updateShot(dt) {
    if (!state.shot) return;
    state.frame += 1;
    state.elapsed += dt;
    const followedPosition = state.car?.root.position ?? player.position;
    world.update(dt, false, followedPosition);
    if (state.shot === 'start') {
      world.camera.position.x += Math.sin(state.elapsed * 0.12) * dt * 2.2;
      world.camera.position.y += Math.sin(state.elapsed * 0.24) * dt * 0.4;
      world.camera.lookAt(12, 28, -40);
      return;
    }
    if (state.car) {
      const direction = new THREE.Vector3(Math.sin(state.car.yaw), 0, -Math.cos(state.car.yaw));
      state.car.root.position.addScaledVector(direction, state.car.speed * dt);
      state.car.root.position.x = THREE.MathUtils.clamp(state.car.root.position.x, -580, 580);
      state.car.root.position.z = THREE.MathUtils.clamp(state.car.root.position.z, -580, 580);
      player.position.copy(state.car.root.position);
      state.car.root.rotation.z = Math.sin(state.elapsed * 2.3) * 0.014;
      for (const wheel of state.car.wheels) wheel.rotation.x += state.car.speed * dt / 0.38;
    }
    for (let index = 0; index < state.extraTraffic.length; index += 1) {
      const vehicle = state.extraTraffic[index];
      const direction = new THREE.Vector3(Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw));
      vehicle.root.position.addScaledVector(direction, vehicle.speed * dt * 0.3);
      vehicle.root.position.x += Math.sin(state.elapsed * 0.28 + index) * dt * 0.22;
      for (const wheel of vehicle.wheels) {
        wheel.rotation.x += vehicle.speed * dt * 0.3 / 0.38;
      }
    }
    for (let index = 0; index < state.police.length; index += 1) {
      const police = state.police[index];
      const targetPosition = carTargetScratch.copy(state.car.root.position);
      targetPosition.x += index === 0 ? -5 : 5;
      targetPosition.z += 11 + index * 5;
      police.root.position.lerp(targetPosition, 1 - Math.exp(-dt * (0.3 + index * 0.08)));
      police.yaw = Math.atan2(state.car.root.position.x - police.root.position.x, -(state.car.root.position.z - police.root.position.z));
      police.root.rotation.y = police.yaw;
      police.root.position.y = Math.abs(Math.sin(state.elapsed * 3 + index)) * 0.035;
    }
    if (state.helicopter) {
      state.helicopter.userData.rotor.rotation.y += dt * 18;
      state.helicopter.position.x = state.car.root.position.x + 10 + Math.sin(state.elapsed * 0.24) * 9;
      state.helicopter.position.z = state.car.root.position.z - 22 + Math.cos(state.elapsed * 0.2) * 7;
      state.helicopter.rotation.y = Math.sin(state.elapsed * 0.18) * 0.16;
      const spotlight = state.helicopter.children.find((child) => child.isSpotLight);
      spotlight.target.position.set(0, -34, -7);
    }
    if (pedestrians) pedestrians.update(dt, followedPosition, [state.car, ...state.police]);
    const cameraYaw = state.car.yaw - (state.shot === 'end' ? 0.23 : 0.18);
    const chaseCameraDistance = state.shot === 'end' ? SHOT_CAMERA_DISTANCE + 1.5 : SHOT_CAMERA_DISTANCE;
    origin.set(followedPosition.x - Math.sin(cameraYaw) * chaseCameraDistance, 5.1, followedPosition.z + Math.cos(cameraYaw) * chaseCameraDistance);
    world.camera.position.lerp(origin, 1 - Math.exp(-dt * 4.8));
    lookAt.set(followedPosition.x + Math.sin(state.car.yaw) * 4, 1.3, followedPosition.z - Math.cos(state.car.yaw) * 4);
    world.camera.lookAt(lookAt);
  }

  function frameRendered() {
    state.renderedFrames += 1;
    window.__SHOT_FRAME_COUNT__ = state.renderedFrames;
    if (state.renderedFrames >= SHOT_READY_FRAME) {
      window.__SHOT_READY__ = true;
    }
  }

  return { shot: state.shot, stage, updateShot, frameRendered, state };
}
