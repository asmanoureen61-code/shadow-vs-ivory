let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number; slideTo?: number };

export function tone({ freq, dur, type = "square", gain = 0.06, slideTo }: Tone) {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur + 0.02);
}

export function noise(dur = 0.12, gain = 0.05) {
  const c = ac();
  if (!c) return;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  shoot: () => tone({ freq: 720, dur: 0.09, type: "square", slideTo: 180, gain: 0.05 }),
  dryFire: () => tone({ freq: 130, dur: 0.06, type: "triangle", gain: 0.04 }),
  reload: () => {
    tone({ freq: 300, dur: 0.06, type: "triangle" });
    setTimeout(() => tone({ freq: 460, dur: 0.08, type: "triangle" }), 140);
  },
  punch: () => noise(0.08, 0.05),
  kick: () => noise(0.12, 0.06),
  knee: () => tone({ freq: 200, dur: 0.1, type: "sawtooth", slideTo: 90, gain: 0.05 }),
  hit: () => tone({ freq: 240, dur: 0.1, type: "square", slideTo: 120, gain: 0.045 }),
  playerHurt: () => tone({ freq: 180, dur: 0.18, type: "sawtooth", slideTo: 70, gain: 0.05 }),
  defeat: () => tone({ freq: 320, dur: 0.3, type: "triangle", slideTo: 80, gain: 0.05 }),
  jump: () => tone({ freq: 420, dur: 0.1, type: "sine", slideTo: 700, gain: 0.04 }),
  dash: () => noise(0.16, 0.03),
  pickup: () => {
    tone({ freq: 660, dur: 0.08, type: "sine" });
    setTimeout(() => tone({ freq: 990, dur: 0.12, type: "sine" }), 80);
  },
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.18, type: "sine", gain: 0.05 }), i * 130));
  },
  lose: () => {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.24, type: "triangle", gain: 0.05 }), i * 160));
  },
};
