/** Lightweight procedural music director — synthesized loops that react to combat intensity. */

import { getAudioContext } from "./audio";

export type MusicIntensity = "calm" | "combat" | "boss" | "danger";

const STORE = "shadow-vs-ivory-music";
const BPM = 132;
const STEP_DUR = 60 / BPM / 4; // 16th note, seconds
const SCHEDULE_AHEAD = 0.16; // seconds
const SCHEDULE_INTERVAL_MS = 40;
const STEPS = 16;

type Pattern = {
  kick: boolean[];
  hat: boolean[];
  snare: boolean[];
  /** Semitone offsets from root; null = rest. */
  bass: (number | null)[];
  lead: (number | null)[];
};

function steps(active: number[]): boolean[] {
  const out = new Array(STEPS).fill(false);
  for (const i of active) out[i] = true;
  return out;
}

const PATTERNS: Record<MusicIntensity, Pattern> = {
  calm: {
    kick: steps([0, 8]),
    hat: steps([2, 6, 10, 14]),
    snare: steps([]),
    bass: [0, null, null, null, 0, null, null, null, 5, null, null, null, 3, null, null, null],
    lead: new Array(STEPS).fill(null),
  },
  combat: {
    kick: steps([0, 4, 8, 10, 12]),
    hat: steps([0, 2, 4, 6, 8, 10, 12, 14]),
    snare: steps([4, 12]),
    bass: [0, null, 0, null, 5, null, 5, null, 3, null, 3, null, 7, null, 7, null],
    lead: [12, null, 15, null, 12, null, 10, null, 12, null, 15, null, 19, null, 15, null],
  },
  boss: {
    kick: steps([0, 2, 4, 6, 8, 10, 12, 14]),
    hat: steps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    snare: steps([4, 12, 15]),
    bass: [0, 0, 3, 3, 5, 5, 7, 7, 0, 0, 3, 3, 10, 10, 7, 7],
    lead: [12, 15, 19, 15, 12, 10, 12, 15, 19, 22, 19, 15, 12, 15, 19, 22],
  },
  danger: {
    kick: steps([0, 3, 6, 9, 12]),
    hat: steps([]),
    snare: steps([0, 6, 12]),
    bass: [-2, null, -2, null, -2, null, -2, null, -2, null, -2, null, -2, null, -2, null],
    lead: new Array(STEPS).fill(null),
  },
};

/** Root frequency (A1-ish) for bass/lead semitone offsets. */
const ROOT = 58;
function noteFreq(semis: number) {
  return ROOT * Math.pow(2, semis / 12);
}

class MusicDirector {
  private running = false;
  private muted = false;
  private volume = 0.55;
  private intensity: MusicIntensity = "calm";
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private master: GainNode | null = null;
  private duckGain: GainNode | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORE);
      this.muted = raw === "0";
    }
  }

  private ensureGraph() {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (!this.master) {
      this.duckGain = ctx.createGain();
      this.duckGain.gain.value = 1;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.duckGain).connect(ctx.destination);
    }
    return ctx;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== "undefined") window.localStorage.setItem(STORE, muted ? "0" : "1");
    const ctx = this.ensureGraph();
    if (ctx && this.master) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : this.volume, ctx.currentTime + 0.2);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setIntensity(next: MusicIntensity) {
    this.intensity = next;
  }

  /** Temporarily lower music while paused, without stopping the scheduler. */
  setDucked(ducked: boolean) {
    const ctx = this.ensureGraph();
    if (!ctx || !this.duckGain) return;
    this.duckGain.gain.cancelScheduledValues(ctx.currentTime);
    this.duckGain.gain.linearRampToValueAtTime(ducked ? 0.28 : 1, ctx.currentTime + 0.25);
  }

  start() {
    if (this.running) return;
    const ctx = this.ensureGraph();
    if (!ctx) return;
    this.running = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.scheduleLoop(), SCHEDULE_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleLoop() {
    const ctx = getAudioContext();
    if (!ctx || !this.master) return;
    while (this.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(ctx, this.step, this.nextTime);
      this.nextTime += STEP_DUR;
      this.step = (this.step + 1) % STEPS;
    }
  }

  private scheduleStep(ctx: AudioContext, step: number, time: number) {
    const pat = PATTERNS[this.intensity];
    const master = this.master!;
    if (pat.kick[step]) this.kick(ctx, master, time);
    if (pat.hat[step]) this.hat(ctx, master, time);
    if (pat.snare[step]) this.snare(ctx, master, time);
    const bassNote = pat.bass[step];
    if (bassNote != null) this.bass(ctx, master, time, bassNote);
    const leadNote = pat.lead[step];
    if (leadNote != null) this.lead(ctx, master, time, leadNote);
  }

  private kick(ctx: AudioContext, dest: GainNode, t: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  private hat(ctx: AudioContext, dest: GainNode, t: number) {
    const frames = Math.floor(ctx.sampleRate * 0.035);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.value = 0.1;
    src.connect(filt).connect(g).connect(dest);
    src.start(t);
  }

  private snare(ctx: AudioContext, dest: GainNode, t: number) {
    const frames = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(filt).connect(g).connect(dest);
    src.start(t);
  }

  private bass(ctx: AudioContext, dest: GainNode, t: number, semis: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(noteFreq(semis), t);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_DUR * 1.8);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + STEP_DUR * 2);
  }

  private lead(ctx: AudioContext, dest: GainNode, t: number, semis: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = this.intensity === "boss" ? "square" : "triangle";
    osc.frequency.setValueAtTime(noteFreq(semis + 12), t);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_DUR * 1.4);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + STEP_DUR * 1.5);
  }
}

export const music = new MusicDirector();
