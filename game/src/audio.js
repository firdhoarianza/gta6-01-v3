// Small synthesized vehicle cues, created only after a user gesture so browsers allow playback.
export function createAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return { horn() {}, radio() {} };
  let context = null;
  function ready() { context ??= new AudioContext(); if (context.state === 'suspended') context.resume(); return context; }
  function horn() {
    const audio = ready(), now = audio.currentTime, gain = audio.createGain(), filter = audio.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1150; gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42); filter.connect(gain); gain.connect(audio.destination);
    for (const [frequency, level] of [[350, 0.7], [440, 0.5]]) { const oscillator = audio.createOscillator(); oscillator.type = 'sawtooth'; oscillator.frequency.value = frequency; const voice = audio.createGain(); voice.gain.value = level; oscillator.connect(voice); voice.connect(filter); oscillator.start(now); oscillator.stop(now + 0.44); }
  }
  function radio() {
    const audio = ready(), now = audio.currentTime, oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660, now); oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.09); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + 0.2);
  }
  return { horn, radio };
}
