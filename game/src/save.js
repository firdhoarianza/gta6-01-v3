// Versioned local progress storage for Vista Bay.
const STORAGE_KEY = 'vista-bay-low-tide';
const SCHEMA_VERSION = 2;

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    money: 250,
    missions: [],
    weapons: ['Unarmed', 'Sidearm'],
    selectedWeapon: 'Unarmed',
    settings: {
      dayCycle: true,
      radioStation: 'Sable FM',
      weather: 'clear',
      volume: 0.76,
    },
    updatedAt: 0,
  };
}

function normalize(value) {
  const defaults = defaultState();
  const source = value && typeof value === 'object' ? value : {};
  const settings = source.settings && typeof source.settings === 'object'
    ? source.settings
    : {};
  return {
    version: SCHEMA_VERSION,
    money: Number.isFinite(source.money) ? Math.max(0, source.money) : defaults.money,
    missions: Array.isArray(source.missions) ? source.missions.filter((item) => typeof item === 'string') : [],
    weapons: Array.isArray(source.weapons) ? source.weapons.filter((item) => typeof item === 'string') : defaults.weapons,
    selectedWeapon: typeof source.selectedWeapon === 'string' ? source.selectedWeapon : defaults.selectedWeapon,
    settings: {
      dayCycle: settings.dayCycle !== false,
      radioStation: typeof settings.radioStation === 'string' ? settings.radioStation : defaults.settings.radioStation,
      weather: settings.weather === 'rain' ? 'rain' : 'clear',
      volume: Number.isFinite(settings.volume) ? Math.min(1, Math.max(0, settings.volume)) : defaults.settings.volume,
    },
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : 0,
  };
}

function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return defaultState();
  }
  const version = Number(parsed.version) || 1;
  if (version === 1) {
    parsed.settings = {
      dayCycle: parsed.settings?.dayCycle !== false,
      radioStation: parsed.radioStation || 'Sable FM',
      weather: 'clear',
      volume: 0.76,
    };
  }
  return normalize(parsed);
}

/** Creates localStorage accessors and automatic progress checkpoints. */
export function createSave() {
  let state = defaultState();

  function load() {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!stored) {
        state = defaultState();
        return structuredClone(state);
      }
      state = migrate(JSON.parse(stored));
      return structuredClone(state);
    } catch (error) {
      state = defaultState();
      return structuredClone(state);
    }
  }

  function save(patch = {}) {
    state = normalize({ ...state, ...patch, updatedAt: Date.now() });
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      return false;
    }
  }

  function updateSettings(settings) {
    state.settings = { ...state.settings, ...settings };
    save({ settings: state.settings });
  }

  function completeMission(missionId, reward = 0) {
    const completed = new Set(state.missions);
    completed.add(missionId);
    save({ missions: [...completed], money: state.money + Math.max(0, reward) });
    return state;
  }

  function checkpointOnPause(progress = {}) {
    save(progress);
  }

  function checkpointOnMissionComplete(missionId, reward = 0) {
    completeMission(missionId, reward);
  }

  function getState() {
    return structuredClone(state);
  }

  function reset() {
    state = defaultState();
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch (error) {
      return false;
    }
    return true;
  }

  return {
    load,
    save,
    updateSettings,
    completeMission,
    checkpointOnPause,
    checkpointOnMissionComplete,
    getState,
    reset,
  };
}
