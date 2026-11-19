const STATIONS = [
  { name: 'Sable FM', style: 'synthwave', root: 110, notes: [0, 7, 12, 10, 3, 7, 15, 12] },
  { name: 'Citrus AM', style: 'lofi', root: 82.41, notes: [0, 3, 7, 10, 5, 8, 12, 7] },
  { name: 'Coastline Radio', style: 'house', root: 55, notes: [0, 7, 10, 12, 3, 10, 14, 7] },
];

const WEAPON_TONES = [170, 105, 70];

function makeNoiseBuffer(context, seconds = 1) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function setTarget(parameter, value, time, glide = 0.04) {
  parameter.cancelScheduledValues(time);
  parameter.setTargetAtTime(value, time, glide);
}

/** Creates the procedural audio engine and station controls. */
export function createAudio(onStation = () => {}) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) {
    return {
      resume() {},
      engine() {},
      skid() {},
      shot() {},
      siren() {},
      horn() {},
      crash() {},
      pickup() {},
      footstep() {},
      radio() {},
      setStation() {},
      station: () => STATIONS[0].name,
      update() {},
    };
  }

  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const musicBus = context.createGain();
  const effectsBus = context.createGain();
  const ambienceBus = context.createGain();
  const noiseBuffer = makeNoiseBuffer(context, 2);
  master.gain.value = 0.76;
  musicBus.gain.value = 0.56;
  effectsBus.gain.value = 0.72;
  ambienceBus.gain.value = 0.2;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;
  master.connect(compressor);
  compressor.connect(context.destination);
  musicBus.connect(master);
  effectsBus.connect(master);
  ambienceBus.connect(master);

  let engineOscillator = null;
  let engineFilter = null;
  let engineGain = null;
  let skidGain = null;
  let ambienceStarted = false;
  let sirenTimer = 0;
  let sirenPhase = 0;
  let stationIndex = 0;
  let sequencerTimer = 0;
  let sequencerStep = 0;
  let stepLength = 60 / 104 / 4;

  function resume() {
    if (context.state === 'suspended') {
      context.resume();
    }
    if (!ambienceStarted) {
      startAmbience();
      ambienceStarted = true;
    }
  }

  function startAmbience() {
    const ocean = context.createBufferSource();
    const oceanFilter = context.createBiquadFilter();
    const oceanGain = context.createGain();
    const oceanLfo = context.createOscillator();
    const oceanDepth = context.createGain();
    ocean.buffer = noiseBuffer;
    ocean.loop = true;
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.value = 310;
    oceanGain.gain.value = 0.08;
    oceanLfo.frequency.value = 0.13;
    oceanDepth.gain.value = 0.045;
    oceanLfo.connect(oceanDepth);
    oceanDepth.connect(oceanGain.gain);
    ocean.connect(oceanFilter);
    oceanFilter.connect(oceanGain);
    oceanGain.connect(ambienceBus);
    ocean.start();
    oceanLfo.start();

    const wind = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    const windGain = context.createGain();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 760;
    windGain.gain.value = 0.024;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambienceBus);
    wind.start();
  }

  function ensureEngine() {
    if (engineOscillator) {
      return;
    }
    engineOscillator = context.createOscillator();
    engineFilter = context.createBiquadFilter();
    engineGain = context.createGain();
    engineOscillator.type = 'sawtooth';
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 230;
    engineGain.gain.value = 0;
    engineOscillator.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(effectsBus);
    engineOscillator.start();

    const sub = context.createOscillator();
    const subGain = context.createGain();
    sub.type = 'triangle';
    sub.frequency.value = 38;
    subGain.gain.value = 0.055;
    sub.connect(subGain);
    subGain.connect(engineGain);
    sub.start();
  }

  function engine(rpm = 0, throttle = 0, driving = false) {
    ensureEngine();
    const now = context.currentTime;
    const normalizedRpm = Math.max(0, Math.min(1, rpm));
    const load = Math.max(0, Math.min(1, throttle));
    const pitch = 42 + normalizedRpm * 154;
    setTarget(engineOscillator.frequency, pitch, now, 0.08);
    setTarget(engineFilter.frequency, 150 + normalizedRpm * 760 + load * 400, now, 0.09);
    setTarget(engineGain.gain, driving ? 0.045 + normalizedRpm * 0.075 : 0, now, 0.12);
  }

  function skid(amount = 0) {
    const intensity = Math.max(0, Math.min(1, amount));
    if (!skidGain) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      skidGain = context.createGain();
      source.buffer = noiseBuffer;
      source.loop = true;
      filter.type = 'bandpass';
      filter.frequency.value = 1700;
      filter.Q.value = 0.7;
      source.connect(filter);
      filter.connect(skidGain);
      skidGain.connect(effectsBus);
      source.start();
    }
    setTarget(skidGain.gain, intensity * 0.12, context.currentTime, 0.08);
  }

  function transientNoise(level, duration, filterFrequency = 1800) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrequency, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + duration);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(effectsBus);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function tone(frequency, length, waveform, level, destination = effectsBus) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + length + 0.02);
  }

  function shot(weapon = 0) {
    const body = WEAPON_TONES[weapon] ?? WEAPON_TONES[0];
    transientNoise(0.32, weapon === 1 ? 0.09 : 0.14, 4300);
    tone(body, 0.19, 'triangle', 0.46);
    tone(body * 0.48, 0.26, 'sine', 0.28);
  }

  function siren(enabled = true, pan = 0) {
    if (sirenTimer > 0) {
      return;
    }
    sirenTimer = enabled ? 0.32 : 0;
    if (!enabled) {
      return;
    }
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const gain = context.createGain();
    gain.gain.value = 0.16;
    gain.connect(panner);
    panner.connect(effectsBus);
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    const baseTone = sirenPhase % 2 === 0 ? 660 : 880;
    oscillator.frequency.value = baseTone * (1 + panner.pan.value * 0.055);
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.28);
    sirenPhase += 1;
  }

  function horn() {
    tone(392, 0.42, 'sawtooth', 0.18);
    tone(494, 0.42, 'sawtooth', 0.16);
  }

  function crash(impact = 1) {
    const force = Math.max(0.25, Math.min(1.5, impact));
    transientNoise(0.42 * force, 0.36, 950);
    tone(72, 0.32, 'sine', 0.34 * force);
  }

  function pickup() {
    tone(740, 0.1, 'sine', 0.2);
    setTimeout(() => tone(990, 0.16, 'sine', 0.18), 75);
  }

  function footstep(intensity = 1) {
    const weight = Math.max(0.2, Math.min(1, intensity));
    transientNoise(0.045 * weight, 0.055, 520);
    tone(92, 0.045, 'triangle', 0.025 * weight);
  }

  function drum(kind) {
    if (kind === 'kick') {
      tone(95, 0.16, 'sine', 0.25, musicBus);
      return;
    }
    if (kind === 'snare') {
      transientNoise(0.09, 0.11, 4600);
      return;
    }
    transientNoise(0.025, 0.035, 7800);
  }

  function noteFrequency(root, semitones) {
    return root * Math.pow(2, semitones / 12);
  }

  function playStep() {
    const station = STATIONS[stationIndex];
    const step = sequencerStep % 16;
    const scaleNote = station.notes[Math.floor(step / 2) % station.notes.length];
    const leadNote = station.notes[(step * 3) % station.notes.length] + 12;
    if (station.style === 'synthwave') {
      tone(noteFrequency(station.root, scaleNote), step % 4 === 0 ? 0.28 : 0.13, 'triangle', 0.075, musicBus);
      if (step % 2 === 0) {
        tone(noteFrequency(station.root * 4, leadNote), 0.12, 'square', 0.035, musicBus);
      }
    }
    if (station.style === 'lofi') {
      tone(noteFrequency(station.root, scaleNote - 12), 0.2, 'triangle', 0.06, musicBus);
      const chord = [0, 3, 7].map((offset) => noteFrequency(station.root * 2, scaleNote + offset));
      for (const frequency of chord) {
        tone(frequency, 0.22, 'triangle', 0.025, musicBus);
      }
      if (step % 4 === 2) {
        tone(noteFrequency(station.root * 4, leadNote), 0.18, 'sine', 0.022, musicBus);
      }
      if (step % 2 === 0) {
        transientNoise(0.018, 0.12, 2800);
      }
    }
    if (station.style === 'house') {
      tone(noteFrequency(station.root, 0), 0.18, 'sawtooth', 0.095, musicBus);
      if (step % 2 === 1) {
        tone(noteFrequency(station.root * 4, leadNote), 0.09, 'square', 0.04, musicBus);
      }
    }
    if (step % 4 === 0) {
      drum('kick');
    } else if (step % 4 === 2 && station.style !== 'house') {
      drum('snare');
    }
    if (step % 2 === 1 || station.style === 'house') {
      drum('hat');
    }
    sequencerStep = (sequencerStep + 1) % 16;
  }

  function setStation(index) {
    stationIndex = (index + STATIONS.length) % STATIONS.length;
    sequencerStep = 0;
    const station = STATIONS[stationIndex];
    stepLength = 60 / (station.style === 'house' ? 122 : station.style === 'lofi' ? 84 : 104) / 4;
    onStation(station.name);
  }

  function radio() {
    setStation(stationIndex + 1);
  }

  function selectStation(name) {
    const index = STATIONS.findIndex((station) => station.name === name);
    if (index >= 0) {
      setStation(index);
    }
  }

  function update(dt) {
    sirenTimer = Math.max(0, sirenTimer - dt);
    if (context.state !== 'running') {
      return;
    }
    sequencerTimer += dt;
    sequencerTimer = Math.min(sequencerTimer, stepLength * 2);
    while (sequencerTimer >= stepLength) {
      sequencerTimer -= stepLength;
      playStep();
    }
  }

  function station() {
    return STATIONS[stationIndex].name;
  }

  return { resume, engine, skid, shot, siren, horn, crash, pickup, footstep, radio, setStation: selectStation, station, update };
}
