// Pointer lock + edge-triggered key presses and continuously held driving/walking controls.
export const ACTION = { INTERACT: 'interact', WEAPON1: 'weapon1', WEAPON2: 'weapon2', WEAPON3: 'weapon3', RELOAD: 'reload', HORN: 'horn', RADIO: 'radio', PAUSE: 'pause', ACTIVITY: 'activity', DAY: 'day', CONFIRM: 'confirm' };
const KEYS = {
  KeyE: ACTION.INTERACT, Digit1: ACTION.WEAPON1, Digit2: ACTION.WEAPON2, Digit3: ACTION.WEAPON3,
  KeyR: ACTION.RELOAD, KeyH: ACTION.HORN, KeyN: ACTION.RADIO, KeyP: ACTION.PAUSE, Escape: ACTION.PAUSE,
  Enter: ACTION.CONFIRM,
  KeyM: ACTION.ACTIVITY, KeyT: ACTION.DAY,
};

export function createInput(canvas) {
  const down = new Set(), pressed = new Set();
  const pointer = { dx: 0, dy: 0, locked: false };
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { pointer.locked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', (event) => { if (pointer.locked) { pointer.dx += event.movementX; pointer.dy += event.movementY; } });
  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (!down.has(event.code) && !event.repeat) { down.add(event.code); const action = KEYS[event.code]; if (action) pressed.add(action); }
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  window.addEventListener('blur', () => { down.clear(); pointer.dx = 0; pointer.dy = 0; });
  return {
    held(code) { return down.has(code); },
    axis(positive, negative) { return (down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0); },
    move() { return { x: this.axis('KeyD', 'KeyA') + this.axis('ArrowRight', 'ArrowLeft'), z: this.axis('KeyS', 'KeyW') + this.axis('ArrowDown', 'ArrowUp') }; },
    take(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    takeAll() { const values = new Set(pressed); pressed.clear(); return values; },
    look() { const delta = { x: pointer.dx, y: pointer.dy }; pointer.dx = 0; pointer.dy = 0; return delta; },
    get locked() { return pointer.locked; },
  };
}
