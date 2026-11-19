// Lightweight road-graph traffic. Cars choose the next connected junction with a mild forward bias.
import { createVehicle } from './vehicles.js';
const THREE = globalThis.THREE;
const TYPES = ['sedan', 'taxi', 'sports', 'van', 'pickup', 'police'];
const POLICE_DISPATCH_SECONDS = 7.5;

function nearestNode(graph, x, z) {
  let best = graph.nodes[0], distance = Infinity;
  for (const node of graph.nodes) { const d = (node.x - x) ** 2 + (node.z - z) ** 2; if (d < distance) { best = node; distance = d; } }
  return best;
}

export function createTraffic(scene, graph, rng) {
  const traffic = [];
  const maxCars = 22;
  const playerTargetScratch = new THREE.Vector3();
  const waypointScratch = new THREE.Vector3();
  let dispatchCooldown = 0;
  function spawn(player, forcedType = null) {
    const angle = rng() * Math.PI * 2, radius = rng.range(70, 190), x = THREE.MathUtils.clamp(player.x + Math.cos(angle) * radius, -565, 565), z = THREE.MathUtils.clamp(player.z + Math.sin(angle) * radius, -565, 565);
    const node = nearestNode(graph, x, z), next = graph.nodes[rng.pick(node.links)];
    const yaw = Math.atan2(next.x - node.x, -(next.z - node.z));
    const laneOffset = rng.chance(0.5) ? 2 : -2;
    const car = createVehicle(forcedType ?? rng.pick(TYPES), node.x + laneOffset, node.z, yaw, { ai: true, routeNode: node.id, targetNode: next.id, laneOffset });
    car.speed = rng.range(8, 16); scene.add(car.root); traffic.push(car);
  }

  function chooseNext(car, node, previous, player) {
    const options = node.links.filter((id) => id !== previous); if (!options.length) return previous;
    // Prefer routes pointing along current heading while occasionally making a cross-street turn.
    const heading = new THREE.Vector2(Math.sin(car.yaw), -Math.cos(car.yaw));
    const weighted = [];
    for (const id of options) {
      const n = graph.nodes[id], dir = new THREE.Vector2(n.x - node.x, n.z - node.z).normalize();
      const dot = heading.x * dir.x + heading.y * dir.y, weight = dot > 0.5 ? 4 : 1;
      for (let i = 0; i < weight; i++) weighted.push(id);
    }
    return rng.pick(weighted);
  }

  function update(dt, player, playerVehicle = null, wanted = 0) {
    dispatchCooldown = Math.max(0, dispatchCooldown - dt);
    const playerPosition = playerTargetScratch.copy(player.position ?? player);
    const hasNearbyPolice = traffic.some((car) => car.type === 'police' && car.root.position.distanceToSquared(playerPosition) < 150 ** 2);
    if (wanted > 0 && !hasNearbyPolice && dispatchCooldown <= 0) {
      spawn(playerPosition, 'police');
      dispatchCooldown = POLICE_DISPATCH_SECONDS;
    }
    const crowdTarget = wanted > 0 ? maxCars - 2 : maxCars;
    while (traffic.length < crowdTarget && rng.chance(dt * 1.5)) spawn(playerPosition);
    for (let i = traffic.length - 1; i >= 0; i--) {
      const car = traffic[i], pos = car.root.position, target = graph.nodes[car.targetNode], from = graph.nodes[car.routeNode];
      const dx = target.x - pos.x, dz = target.z - pos.z, length = Math.hypot(dx, dz);
      const playerPosition = playerTargetScratch.copy(player.position ?? player);
      const distanceToPlayer = Math.hypot(playerPosition.x - pos.x, playerPosition.z - pos.z);
      const isPursuing = car.type === 'police' && wanted > 0 && distanceToPlayer < 190;
      const desiredYaw = isPursuing
        ? Math.atan2(playerPosition.x - pos.x, -(playerPosition.z - pos.z))
        : Math.atan2(dx, -dz);
      let delta = THREE.MathUtils.euclideanModulo(desiredYaw - car.yaw + Math.PI, Math.PI * 2) - Math.PI;
      car.yaw += THREE.MathUtils.clamp(delta, -1.55 * dt, 1.55 * dt);
      let blocked = false;
      for (const other of traffic) {
        if (other === car) continue;
        const distanceSquared = pos.distanceToSquared(other.root.position);
        if (distanceSquared < 19) {
          blocked = true;
          break;
        }
      }
      if (playerVehicle && pos.distanceToSquared(playerVehicle.root.position) < 28) blocked = true;
      if (pos.distanceToSquared(player.position ?? player) < 16 && !playerVehicle) blocked = true;
      const closeToTurn = length < 12;
      let intersectionYield = false;
      if (closeToTurn) {
        for (const other of traffic) {
          if (other === car || other.routeNode === car.routeNode) continue;
          const otherTarget = graph.nodes[other.targetNode];
          const sameJunction = Math.hypot(otherTarget.x - target.x, otherTarget.z - target.z) < 1;
          const otherApproaching = Math.hypot(other.root.position.x - otherTarget.x, other.root.position.z - otherTarget.z) < 18;
          if (sameJunction && otherApproaching && other.speed > car.speed) {
            intersectionYield = true;
            break;
          }
        }
      }
      const approachSpeed = isPursuing
        ? car.spec.speed * 0.7
        : closeToTurn ? car.spec.speed * 0.2 : car.spec.speed * 0.53;
      const desiredSpeed = blocked || intersectionYield ? 0 : approachSpeed;
      const acceleration = blocked ? 14 : 7;
      car.speed += THREE.MathUtils.clamp(desiredSpeed - car.speed, -14 * dt, acceleration * dt);
      const forward = new THREE.Vector3(Math.sin(car.yaw), 0, -Math.cos(car.yaw)); car.velocity.lerp(forward.multiplyScalar(car.speed), 1 - Math.exp(-5 * dt)); pos.addScaledVector(car.velocity, dt);
      car.root.rotation.y = car.yaw;
      car.root.position.y = Math.sin((car.routeNode + car.targetNode) * 0.17 + pos.x * 0.03) * 0.018;
      for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt / 0.38;
      waypointScratch.set(target.x - pos.x, 0, target.z - pos.z);
      if (waypointScratch.lengthSq() < 15) {
        const nextId = chooseNext(car, target, from.id, player.position ?? player);
        car.routeNode = target.id; car.targetNode = nextId;
      }
      car.turnTimer = Math.max(0, car.turnTimer - dt);
      if (closeToTurn && car.turnTimer === 0) {
        car.turnTimer = 0.35;
        car.speed = Math.min(car.speed, car.spec.speed * 0.24);
      }
      const playerPos = player.position ?? player;
      if (Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z) > 310) { scene.remove(car.root); traffic.splice(i, 1); }
    }
  }
  function nearest(position, maxDistance = 5.5) {
    let result = null, best = maxDistance ** 2;
    for (const car of traffic) { const d = car.root.position.distanceToSquared(position); if (d < best) { result = car; best = d; } }
    return result;
  }
  function remove(car) { const i = traffic.indexOf(car); if (i >= 0) { scene.remove(car.root); traffic.splice(i, 1); } }
  function policeNearby(position, radius = 32) {
    const radiusSquared = radius * radius;
    return traffic.some((car) => car.type === 'police' && car.root.position.distanceToSquared(position) <= radiusSquared);
  }
  return { traffic, update, nearest, remove, policeNearby };
}
