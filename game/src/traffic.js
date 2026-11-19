// Lightweight road-graph traffic. Cars choose the next connected junction with a mild forward bias.
import { createVehicle } from './vehicles.js';
const THREE = globalThis.THREE;
const TYPES = ['sedan', 'taxi', 'sports', 'van', 'pickup', 'police'];

function nearestNode(graph, x, z) {
  let best = graph.nodes[0], distance = Infinity;
  for (const node of graph.nodes) { const d = (node.x - x) ** 2 + (node.z - z) ** 2; if (d < distance) { best = node; distance = d; } }
  return best;
}

export function createTraffic(scene, graph, rng) {
  const traffic = [], maxCars = 22, temp = new THREE.Vector3();
  function spawn(player) {
    const angle = rng() * Math.PI * 2, radius = rng.range(70, 190), x = THREE.MathUtils.clamp(player.x + Math.cos(angle) * radius, -565, 565), z = THREE.MathUtils.clamp(player.z + Math.sin(angle) * radius, -565, 565);
    const node = nearestNode(graph, x, z), next = graph.nodes[rng.pick(node.links)];
    const yaw = Math.atan2(next.x - node.x, -(next.z - node.z));
    const laneOffset = rng.chance(0.5) ? 2 : -2;
    const car = createVehicle(rng.pick(TYPES), node.x + laneOffset, node.z, yaw, { ai: true, routeNode: node.id, targetNode: next.id, laneOffset });
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

  function update(dt, player, playerVehicle = null) {
    while (traffic.length < maxCars && rng.chance(dt * 1.5)) spawn(player.position ?? player);
    for (let i = traffic.length - 1; i >= 0; i--) {
      const car = traffic[i], pos = car.root.position, target = graph.nodes[car.targetNode], from = graph.nodes[car.routeNode];
      const dx = target.x - pos.x, dz = target.z - pos.z, length = Math.hypot(dx, dz);
      const desiredYaw = Math.atan2(dx, -dz);
      let delta = THREE.MathUtils.euclideanModulo(desiredYaw - car.yaw + Math.PI, Math.PI * 2) - Math.PI;
      car.yaw += THREE.MathUtils.clamp(delta, -1.55 * dt, 1.55 * dt);
      let blocked = false;
      for (const other of traffic) { if (other === car) continue; if (pos.distanceToSquared(other.root.position) < 23) { blocked = true; break; } }
      if (playerVehicle && pos.distanceToSquared(playerVehicle.root.position) < 28) blocked = true;
      if (pos.distanceToSquared(player.position ?? player) < 16 && !playerVehicle) blocked = true;
      const closeToTurn = length < 12;
      const desiredSpeed = blocked ? 0 : car.spec.speed * (closeToTurn ? 0.3 : 0.53);
      car.speed += THREE.MathUtils.clamp(desiredSpeed - car.speed, -10 * dt, 7 * dt);
      const forward = new THREE.Vector3(Math.sin(car.yaw), 0, -Math.cos(car.yaw)); car.velocity.lerp(forward.multiplyScalar(car.speed), 1 - Math.exp(-5 * dt)); pos.addScaledVector(car.velocity, dt);
      car.root.rotation.y = car.yaw;
      for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt / 0.38;
      if (pos.distanceToSquared(new THREE.Vector3(target.x, 0, target.z)) < 15) {
        const nextId = chooseNext(car, target, from.id, player.position ?? player);
        car.routeNode = target.id; car.targetNode = nextId;
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
  return { traffic, update, nearest, remove };
}
