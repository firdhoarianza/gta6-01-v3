// Pointer lock + edge-triggered key presses and continuously held driving/walking controls.
export const ACTION = { INTERACT: 'interact', WEAPON1: 'weapon1', WEAPON2: 'weapon2', WEAPON3: 'weapon3', RELOAD: 'reload', HORN: 'horn', RADIO: 'radio', PAUSE: 'pause', ACTIVITY: 'activity', DAY: 'day', WEATHER: 'weather', FIRE: 'fire', CONFIRM: 'confirm' };
export const MOVEMENT_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const KEYS = {
  KeyE: ACTION.INTERACT, Digit1: ACTION.WEAPON1, Digit2: ACTION.WEAPON2, Digit3: ACTION.WEAPON3,
  KeyR: ACTION.RELOAD, KeyH: ACTION.HORN, KeyN: ACTION.RADIO, KeyP: ACTION.PAUSE, Escape: ACTION.PAUSE,
  Enter: ACTION.CONFIRM,
  KeyM: ACTION.ACTIVITY, KeyT: ACTION.DAY, KeyY: ACTION.WEATHER,
};

export function createInput(canvas) {
  const down = new Set(), pressed = new Set();
  const pointer = { dx: 0, dy: 0, locked: false };
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { pointer.locked = document.pointerLockElement === canvas; });
  canvas.addEventListener('mousedown', (event) => {
    down.add('Mouse' + (event.button === 2 ? 'Right' : 'Left'));
    if (event.button === 0) {
      pressed.add(ACTION.FIRE);
    }
  });
  window.addEventListener('mouseup', (event) => {
    down.delete('Mouse' + (event.button === 2 ? 'Right' : 'Left'));
  });
  document.addEventListener('mousemove', (event) => { if (pointer.locked) { pointer.dx += event.movementX; pointer.dy += event.movementY; } });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Tab' || event.code === 'F3') {
      event.preventDefault();
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (!down.has(event.code) && !event.repeat) { down.add(event.code); const action = KEYS[event.code]; if (action) pressed.add(action); }
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  window.addEventListener('blur', () => { down.clear(); pointer.dx = 0; pointer.dy = 0; });
  document.addEventListener('pointerlockchange', () => {
    if (!pointer.locked) {
      down.delete('MouseLeft');
      down.delete('MouseRight');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      down.clear();
      pressed.clear();
      pointer.dx = 0;
      pointer.dy = 0;
    }
  });
  return {
    held(code) { return down.has(code); },
    clear() {
      down.clear();
      pressed.clear();
      pointer.dx = 0;
      pointer.dy = 0;
    },
    axis(positive, negative) { return (down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0); },
    move() {
      const horizontal = this.axis('KeyD', 'KeyA') + this.axis('ArrowRight', 'ArrowLeft');
      const vertical = this.axis('KeyS', 'KeyW') + this.axis('ArrowDown', 'ArrowUp');
      return { x: Math.sign(horizontal), z: Math.sign(vertical) };
    },
    take(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    takeAll() { const values = new Set(pressed); pressed.clear(); return values; },
    look() { const delta = { x: pointer.dx, y: pointer.dy }; pointer.dx = 0; pointer.dy = 0; return delta; },
    get locked() { return pointer.locked; },
  };
}
