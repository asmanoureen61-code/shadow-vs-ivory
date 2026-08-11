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

/** Shared context accessor so other audio modules (e.g. music) reuse the same node graph. */
export function getAudioContext(): AudioContext | null {
  return ac();
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
  propBreak: () => {
    noise(0.1, 0.04);
    tone({ freq: 220, dur: 0.08, type: "triangle", slideTo: 90, gain: 0.035 });
  },
  explode: () => {
    noise(0.22, 0.07);
    tone({ freq: 120, dur: 0.2, type: "sawtooth", slideTo: 40, gain: 0.06 });
    setTimeout(() => tone({ freq: 80, dur: 0.18, type: "triangle", slideTo: 35, gain: 0.04 }), 50);
  },
  /** Light melee / small tick. */
  hit: () => tone({ freq: 240, dur: 0.08, type: "square", slideTo: 120, gain: 0.04 }),
  hitLight: () => {
    tone({ freq: 320, dur: 0.06, type: "triangle", slideTo: 180, gain: 0.035 });
    noise(0.04, 0.02);
  },
  hitHeavy: () => {
    tone({ freq: 160, dur: 0.12, type: "sawtooth", slideTo: 70, gain: 0.055 });
    noise(0.1, 0.045);
  },
  hitGun: () => {
    tone({ freq: 480, dur: 0.05, type: "square", slideTo: 200, gain: 0.03 });
    noise(0.05, 0.025);
  },
  hitKill: () => {
    tone({ freq: 280, dur: 0.14, type: "triangle", slideTo: 90, gain: 0.05 });
    setTimeout(() => tone({ freq: 160, dur: 0.16, type: "sawtooth", slideTo: 60, gain: 0.04 }), 40);
    noise(0.12, 0.04);
  },
  bulletImpact: () => {
    tone({ freq: 520, dur: 0.04, type: "square", slideTo: 160, gain: 0.025 });
    noise(0.05, 0.02);
  },
  playerHurt: () => tone({ freq: 180, dur: 0.18, type: "sawtooth", slideTo: 70, gain: 0.05 }),
  defeat: () => tone({ freq: 320, dur: 0.3, type: "triangle", slideTo: 80, gain: 0.05 }),
  jump: () => tone({ freq: 420, dur: 0.1, type: "sine", slideTo: 700, gain: 0.04 }),
  dash: () => noise(0.16, 0.03),
  focus: () => {
    tone({ freq: 520, dur: 0.12, type: "sine", gain: 0.045 });
    setTimeout(() => tone({ freq: 780, dur: 0.18, type: "triangle", slideTo: 420, gain: 0.04 }), 70);
  },
  perfectDodge: () => {
    tone({ freq: 880, dur: 0.08, type: "sine", gain: 0.05 });
    setTimeout(() => tone({ freq: 1320, dur: 0.12, type: "triangle", slideTo: 660, gain: 0.04 }), 60);
    noise(0.1, 0.025);
  },
  finisher: () => {
    tone({ freq: 180, dur: 0.1, type: "sawtooth", slideTo: 90, gain: 0.055 });
    setTimeout(() => tone({ freq: 520, dur: 0.12, type: "square", slideTo: 220, gain: 0.045 }), 50);
    setTimeout(() => noise(0.16, 0.06), 80);
    setTimeout(() => tone({ freq: 980, dur: 0.1, type: "sine", gain: 0.04 }), 140);
  },
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
