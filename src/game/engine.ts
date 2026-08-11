import { LEVELS, GROUND_Y, type LevelDef, type EnemyKind } from "./levels";
import { ENEMIES } from "./enemies";
import { INTERACTIVE_STATS, type InteractiveKind } from "./interactives";
import { addCurrency } from "./secrets";
import { getUpgradeMods, type UpgradeMods } from "./upgrades";
import { getDifficultyMods, readDifficulty, type Difficulty, type DifficultyMods } from "./difficulty";
import { unlockAchievement, type AchievementId } from "./achievements";
import { sfx } from "./audio";
import { music, type MusicIntensity } from "./music";
import {
  WEAPONS,
  WEAPON_ORDER,
  createLoadout,
  type WeaponId,
  type WeaponLoadout,
} from "./weapons";

export const VIEW_W = 960;
export const VIEW_H = 600;
const GRAVITY = 0.9;
const SPECIAL_MAX = 100;
/** Focus Mode duration in frames (~2.4s at 60fps). */
const FOCUS_DURATION = 145;
const FOCUS_DAMAGE = 1.22;
const FOCUS_ENEMY_SPEED = 0.48;
/** Perfect-dodge timing window (enemy attackT frames). Tight on purpose. */
const PERFECT_DODGE_LO = 11;
const PERFECT_DODGE_HI = 15;
const PERFECT_SLOW_FRAMES = 30;
const COUNTER_WINDOW = 48;
const STUN_FRAMES = 52;
/** Combo thresholds for finisher unlock. */
const FINISHER_BASIC = 5;
const FINISHER_ULT = 10;
const FINISHER_SLOW_BASIC = 16;
const FINISHER_SLOW_ULT = 24;
const KILL_SLOW_FRAMES = 18;
const SHAKE_STORE = "shadow-vs-ivory-shake";
const SHAKE_MAX = 14;

export type HudState = {
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  reserve: number;
  reloading: boolean;
  level: number;
  levelName: string;
  score: number;
  enemiesLeft: number;
  weapon: string;
  wave: number;
  waves: number;
  bossHp: number | null;
  bossPhase: number | null;
  combo: number;
  special: number;
  specialMax: number;
  focusActive: boolean;
  counterReady: boolean;
  finisherReady: boolean;
  finisherTier: 0 | 1 | 2;
  secretsFound: number;
  secretsTotal: number;
  objective: string;
  objectiveProgress: string;
  arenaTimer: number | null;
  bonusObjective: string | null;
  bonusDone: boolean;
};

export type LevelRank = "S" | "A" | "B" | "C";

export type LevelResult = {
  score: number;
  rank: LevelRank;
  maxCombo: number;
  timeSec: number;
  damageTaken: number;
  secretsFound: number;
  secretsTotal: number;
  /** Newly unlocked this run (already persisted). */
  achievements: AchievementId[];
};

export type GameCallbacks = {
  onHud: (s: HudState) => void;
  onLevelComplete: (result: LevelResult) => void;
  onGameOver: (score: number) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number; grav: number;
  kind?: "spark" | "ring";
};

type Floater = { x: number; y: number; life: number; text: string; color: string };

class Bullet {
  x: number; y: number; vx: number; vy: number;
  dead = false;
  trail: { x: number; y: number }[] = [];
  damage: number;
  knock: number;
  life: number;
  color: string;
  constructor(
    x: number,
    y: number,
    dir: number,
    opts: { speed: number; angle: number; damage: number; knock: number; range: number; color: string },
  ) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(opts.angle) * opts.speed * dir;
    // Keep vertical component small relative to facing
    this.vy = Math.sin(opts.angle) * opts.speed;
    this.damage = opts.damage;
    this.knock = opts.knock;
    this.life = opts.range;
    this.color = opts.color;
  }
  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.dead = true;
  }
  get rect(): Rect { return { x: this.x - 5, y: this.y - 3, w: 10, h: 6 }; }
}

type Anim = "idle" | "run" | "jump" | "punch" | "kick" | "knee" | "finisher" | "hurt" | "dead" | "dash" | "block";
type AttackKind = "punch" | "kick" | "knee" | "finisher";

abstract class Fighter {
  x: number; y: number; vx = 0; vy = 0;
  w = 34; h = 76;
  dir: 1 | -1 = 1;
  hp: number; maxHp: number;
  onGround = false;
  anim: Anim = "idle";
  animT = 0;
  phase = 0;
  hurtT = 0;
  /** Brief white flash overlay after taking a hit. */
  flashT = 0;
  invuln = 0;
  dead = false;
  deathT = 0;
  attackT = 0;
  attackKind: AttackKind = "punch";
  attackHit = false;
  cooldown = 0;
  /** Stored when launching a finisher so damage uses the spent combo tier. */
  finisherTier: 0 | 1 | 2 = 0;

  constructor(x: number, y: number, hp: number) {
    this.x = x; this.y = y; this.hp = hp; this.maxHp = hp;
  }
  get rect(): Rect { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  physics(level: LevelDef) {
    this.vy += GRAVITY;
    this.x += this.vx;
    const prevY = this.y;
    this.y += this.vy;
    this.onGround = false;
    if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; }
    for (const p of level.platforms) {
      if (this.vy >= 0 && prevY <= p.y + 4 && this.y >= p.y && this.x > p.x - 10 && this.x < p.x + p.w + 10) {
        this.y = p.y; this.vy = 0; this.onGround = true;
      }
    }
    if (this.x < 20) this.x = 20;
    if (this.x > level.width - 20) this.x = level.width - 20;
  }

  hurtBoxOffsets(): { reach: number; y: number; h: number } {
    if (this.attackKind === "finisher") {
      return this.finisherTier >= 2
        ? { reach: 110, y: 78, h: 70 }
        : { reach: 86, y: 70, h: 56 };
    }
    if (this.attackKind === "kick") return { reach: 64, y: 54, h: 30 };
    if (this.attackKind === "knee") return { reach: 46, y: 48, h: 28 };
    return { reach: 54, y: 66, h: 26 };
  }
  attackRect(): Rect | null {
    if (this.attackT <= 0) return null;
    const o = this.hurtBoxOffsets();
    return {
      x: this.dir === 1 ? this.x + 6 : this.x - 6 - o.reach,
      y: this.y - o.y,
      w: o.reach,
      h: o.h,
    };
  }
}

class Player extends Fighter {
  ammo = 12; maxAmmo = 12; reloadT = 0; shootCd = 0;
  dashT = 0; dashCd = 0;
  combo = 0; comboT = 0;
  maxCombo = 0;
  weaponId: WeaponId = "pistol";
  loadout: Record<WeaponId, WeaponLoadout>;
  private ammoMul: number;
  constructor(x: number, levelId: number, mods: UpgradeMods) {
    super(x, GROUND_Y, 120 + mods.bonusHp);
    this.ammoMul = mods.ammoMul;
    this.loadout = createLoadout(levelId, mods.ammoMul);
    this.syncAmmoFromLoadout();
  }
  magCap(id: WeaponId = this.weaponId) {
    return Math.max(1, Math.round(WEAPONS[id].magSize * this.ammoMul));
  }
  reserveCap(id: WeaponId = this.weaponId) {
    return Math.max(1, Math.round(WEAPONS[id].maxReserve * this.ammoMul));
  }
  syncAmmoFromLoadout() {
    const slot = this.loadout[this.weaponId];
    this.ammo = slot.mag;
    this.maxAmmo = this.magCap();
  }
  stashAmmoToLoadout() {
    this.loadout[this.weaponId].mag = this.ammo;
  }
}

class EnemyShot {
  x: number; y: number; vx: number; vy: number;
  damage: number;
  life: number;
  dead = false;
  constructor(x: number, y: number, dir: number, speed: number, damage: number, range: number) {
    this.x = x;
    this.y = y;
    this.vx = dir * speed;
    this.vy = 0;
    this.damage = damage;
    this.life = range;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.dead = true;
  }
  get rect(): Rect { return { x: this.x - 5, y: this.y - 4, w: 10, h: 8 }; }
}

/** Runtime interactive prop (crate, barrel, barrier, etc.). */
class Prop {
  kind: InteractiveKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  vx = 0;
  vy = 0;
  dead = false;
  movable: boolean;
  explosive: boolean;
  score: number;
  knockMul: number;
  hitFlash = 0;
  /** Prevent multi-hit from same attack swing. */
  hitStamp = -1;
  constructor(kind: InteractiveKind, x: number, y: number) {
    const s = INTERACTIVE_STATS[kind];
    this.kind = kind;
    this.w = s.w;
    this.h = s.h;
    this.x = x;
    this.y = y;
    this.hp = s.hp;
    this.maxHp = s.hp;
    this.movable = s.movable;
    this.explosive = s.explosive;
    this.score = s.score;
    this.knockMul = s.knockMul;
  }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
}

class Enemy extends Fighter {
  kind: EnemyKind;
  speed: number; dmg: number; score: number; knockRes: number;
  thinkT = 0; dodgeT = 0; aggression: number; reaction: number;
  bossPhase = 1; specialT = 0; specialCd = 200;
  knockT = 0;
  stunT = 0;
  flank = 0;
  shieldHp = 0;
  shieldMax = 0;
  shieldBreakT = 0;
  fireCd = 0;
  huntTarget = false;
  /** Windup before a named boss move resolves. */
  telegraphT = 0;
  bossMove: null | "charge" | "slam" | "volley" | "combo" = null;
  lastPhase = 1;
  /** Brief vulnerability / no-attack window after a big move. */
  recoverT = 0;
  constructor(kind: EnemyKind, x: number, scale: LevelDef["enemyScale"], flank = 0, hunt = false) {
    const s = ENEMIES[kind];
    super(x, GROUND_Y, Math.round(s.hp * scale.hp));
    this.kind = kind;
    this.w = s.w; this.h = s.h;
    this.speed = s.speed * scale.speed;
    this.dmg = s.dmg * scale.damage;
    this.score = s.score;
    this.knockRes = s.knockRes;
    this.aggression = scale.aggression;
    this.reaction = scale.reaction;
    this.flank = flank;
    this.huntTarget = hunt;
    if (hunt) {
      this.hp = Math.round(this.hp * 1.15);
      this.maxHp = this.hp;
      this.score = Math.round(this.score * 1.5);
    }
    if (s.shieldHp) {
      this.shieldMax = Math.round(s.shieldHp * scale.hp);
      this.shieldHp = this.shieldMax;
    }
    if (kind === "miniboss" || kind === "boss") this.specialCd = 160;
    if (kind === "ranged") this.fireCd = 20;
  }

  isGuarding(againstX: number) {
    if (this.kind !== "shielded" || this.shieldHp <= 0 || this.shieldBreakT > 0 || this.stunT > 0) return false;
    // Facing the threat = frontal block
    return Math.sign(againstX - this.x) === this.dir || Math.abs(againstX - this.x) < 12;
  }
}

type Pickup =
  | { x: number; y: number; kind: "ammo" | "health"; taken: boolean; bob: number }
  | { x: number; y: number; kind: "weapon"; weapon: WeaponId; taken: boolean; bob: number };

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private keys: Record<string, boolean> = {};
  private level: LevelDef;
  private player: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyShots: EnemyShot[] = [];
  private props: Prop[] = [];
  private particles: Particle[] = [];
  private propHitId = 0;
  private floaters: Floater[] = [];
  private pickups: Pickup[] = [];
  private camera = 0;
  private shake = 0;
  private waveIndex = 0;
  private waveDelay = 0;
  private score = 0;
  private paused = false;
  private finished = false;
  private time = 0;
  private hudTick = 0;
  private clouds: { x: number; y: number; s: number; sp: number }[] = [];
  private hills: { x: number; r: number; c: string }[] = [];
  private trees: { x: number; s: number }[] = [];
  private rocks: { x: number; s: number }[] = [];
  private plants: { x: number; s: number }[] = [];
  private houses: { x: number; s: number; hue: number }[] = [];
  private mountains: { x: number; h: number; w: number }[] = [];
  private hitStop = 0;
  private lockX: number | null = null;
  private awaitingTrigger = false;
  private checkpointIdx = -1;
  private checkpointFlags: boolean[] = [];
  /** Wave index frozen when the latest checkpoint was activated. */
  private checkpointWaveIndex = 0;
  private secretFlags: boolean[] = [];
  private damageTaken = 0;
  private usedWeapon = false;
  private huntKilled = false;
  private extractReached = false;
  private arenaTimerT = 0;
  private arenaActive = false;
  private arenaClearedInTime = false;
  private arenaFailed = false;
  private bonusDone = false;
  private waveClearBonus = 0;
  private respawning = false;
  private respawnT = 0;
  private specialMeter = 0;
  private focusT = 0;
  private lastComboForSpecial = 0;
  private perfectSlowT = 0;
  private counterT = 0;
  private counterTarget: Enemy | null = null;
  private finisherSlowT = 0;
  private lastFinisherAnnounce = 0;
  private killSlowT = 0;
  private screenFlash = 0;
  /** 0 = off, 0.5 = reduced, 1 = full. Persisted for settings later. */
  private shakeScale = 1;
  private mods: UpgradeMods = getUpgradeMods();
  private difficulty: Difficulty = "normal";
  private diffMods: DifficultyMods = getDifficultyMods("normal");
  private dodgeLo = PERFECT_DODGE_LO;
  private dodgeHi = PERFECT_DODGE_HI;

  constructor(private canvas: HTMLCanvasElement, levelIndex: number, private cb: GameCallbacks) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.level = LEVELS[levelIndex] ?? LEVELS[0]!;
    this.mods = getUpgradeMods();
    this.difficulty = readDifficulty();
    this.diffMods = getDifficultyMods(this.difficulty);
    this.dodgeLo = Math.max(1, PERFECT_DODGE_LO - this.diffMods.dodgeWindowPad);
    this.dodgeHi = PERFECT_DODGE_HI + this.diffMods.dodgeWindowPad;
    this.player = new Player(120, this.level.id, this.mods);
    this.checkpointFlags = this.level.checkpoints.map(() => false);
    this.secretFlags = (this.level.secrets ?? []).map(() => false);
    this.pickups = [
      ...this.level.ammoPickups.map((p) => ({ ...p, kind: "ammo" as const, taken: false, bob: Math.random() * 6 })),
      ...this.level.healthPickups.map((p) => ({ ...p, kind: "health" as const, taken: false, bob: Math.random() * 6 })),
      ...(this.level.weaponPickups ?? []).map((p) => ({
        x: p.x,
        y: p.y,
        kind: "weapon" as const,
        weapon: p.weapon,
        taken: false,
        bob: Math.random() * 6,
      })),
    ];
    this.buildScenery();
    this.props = (this.level.interactives ?? []).map((d) => new Prop(d.kind, d.x, d.y));
    this.spawnWave();
    this.applyWaveLock();
    this.shakeScale = Game.readShakeScale();
  }

  static readShakeScale(): number {
    if (typeof window === "undefined") return 1;
    const raw = window.localStorage.getItem(SHAKE_STORE);
    if (raw === "0") return 0;
    if (raw === "0.5") return 0.5;
    return 1;
  }

  getShakeScale() { return this.shakeScale; }

  setShakeScale(scale: 0 | 0.5 | 1) {
    this.shakeScale = scale;
    if (typeof window !== "undefined") window.localStorage.setItem(SHAKE_STORE, String(scale));
  }

  private rng = (() => { let s = 1337; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); })();

  private buildScenery() {
    const W = this.level.width;
    for (let i = 0; i < 26; i++) this.clouds.push({ x: this.rng() * W, y: 40 + this.rng() * 180, s: 0.6 + this.rng() * 1.2, sp: 0.08 + this.rng() * 0.12 });
    for (let i = 0; i < 18; i++) this.mountains.push({ x: (i * W) / 18 + this.rng() * 120, h: 140 + this.rng() * 160, w: 260 + this.rng() * 220 });
    for (let i = 0; i < 22; i++) this.hills.push({ x: (i * W) / 22 + this.rng() * 100, r: 120 + this.rng() * 160, c: this.rng() > 0.5 ? "#8fd694" : "#7ac98a" });
    for (let i = 0; i < 16; i++) this.trees.push({ x: 60 + this.rng() * (W - 120), s: 0.7 + this.rng() * 0.7 });
    for (let i = 0; i < 22; i++) this.rocks.push({ x: 60 + this.rng() * (W - 120), s: 0.6 + this.rng() * 0.8 });
    for (let i = 0; i < 50; i++) this.plants.push({ x: 40 + this.rng() * (W - 80), s: 0.6 + this.rng() * 0.8 });
    for (let i = 0; i < Math.max(2, Math.floor(W / 900)); i++) this.houses.push({ x: 300 + this.rng() * (W - 600), s: 0.8 + this.rng() * 0.5, hue: this.rng() });
  }

  start() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.raf = requestAnimationFrame(this.loop);
    music.setIntensity(this.computeMusicIntensity());
    music.start();
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    music.stop();
  }
  setPaused(p: boolean) {
    this.paused = p;
    music.setDucked(p);
  }
  isMusicMuted() { return music.isMuted(); }
  toggleMusicMuted() { return music.toggleMuted(); }

  private computeMusicIntensity(): MusicIntensity {
    const p = this.player;
    const bossAlive = this.enemies.some((e) => (e.kind === "boss" || e.kind === "miniboss") && !e.dead);
    if (!p.dead && p.hp / p.maxHp <= 0.25) return "danger";
    if (bossAlive) return "boss";
    if (this.enemies.some((e) => !e.dead)) return "combat";
    return "calm";
  }

  /** Shared held input — keyboard and touch both use this map. */
  setHeld(action: "left" | "right" | "up" | "shift" | "fire", down: boolean) {
    const map = {
      left: "ArrowLeft",
      right: "ArrowRight",
      up: "ArrowUp",
      shift: "Shift",
      fire: " ",
    } as const;
    const k = map[action];
    if (down) {
      if (this.keys[k]) return;
      this.keys[k] = true;
      if (this.paused || this.finished) return;
      if (action === "up") this.jump();
      if (action === "shift") this.dash();
      if (action === "fire") this.shoot();
    } else {
      this.keys[k] = false;
    }
  }

  /** Shared tap/actions — same methods keyboard uses. */
  tap(action: "jump" | "fire" | "punch" | "kick" | "knee" | "dodge" | "special" | "nextWeapon" | "finisher") {
    if (this.paused || this.finished) return;
    if (action === "jump") this.jump();
    else if (action === "fire") this.shoot();
    else if (action === "punch") this.melee("punch");
    else if (action === "kick") this.melee("kick");
    else if (action === "knee") this.melee("knee");
    else if (action === "dodge") this.dash();
    else if (action === "special") this.activateFocus();
    else if (action === "nextWeapon") this.cycleWeapon(1);
    else if (action === "finisher") this.tryFinisher();
  }

  /** Clear touch/keyboard held flags (e.g. when overlay loses focus). */
  clearHeld() {
    this.keys["ArrowLeft"] = false;
    this.keys["ArrowRight"] = false;
    this.keys["ArrowUp"] = false;
    this.keys["Shift"] = false;
    this.keys[" "] = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    if (this.keys[k]) return;
    this.keys[k] = true;
    if (this.paused || this.finished) return;
    if (k === " ") this.shoot();
    if (k === "a") this.melee("punch");
    if (k === "s") this.melee("kick");
    if (k === "d") this.melee("knee");
    if (k === "r") this.reload();
    if (k === "ArrowUp") this.jump();
    if (k === "Shift") this.dash();
    if (k === "q") this.activateFocus();
    if (k === "f") this.tryFinisher();
    if (k === "1") this.equipWeapon("pistol");
    if (k === "2") this.equipWeapon("shotgun");
    if (k === "3") this.equipWeapon("smg");
    if (k === "4") this.equipWeapon("heavy");
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys[k] = false;
  };

  // ---- player actions ----
  private jump() {
    const p = this.player;
    if (p.dead || !p.onGround) return;
    p.vy = -17;
    p.onGround = false;
    sfx.jump();
    this.puff(p.x, p.y, 8);
  }
  private dash() {
    const p = this.player;
    if (p.dead || p.dashCd > 0) return;
    p.dashT = 14; p.dashCd = this.mods.dodgeCd; p.invuln = Math.max(p.invuln, 12);
    p.vx = 11 * p.dir;
    sfx.dash();
    this.puff(p.x, p.y, 10);
    this.tryPerfectDodge();
  }

  /** Narrow iframe: dodge in late windup / early active frames of a nearby enemy attack. */
  private tryPerfectDodge() {
    const p = this.player;
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const en of this.enemies) {
      if (en.dead || en.stunT > 0 || en.attackT <= 0) continue;
      if (en.attackT < this.dodgeLo || en.attackT > this.dodgeHi) continue;
      const dist = Math.abs(en.x - p.x);
      const threat = en.kind === "boss" ? 92 : en.kind === "miniboss" ? 78 : en.kind === "brute" ? 68 : 62;
      if (dist > threat) continue;
      if (Math.abs(en.y - p.y) > 70) continue;
      // Must be attacking toward the player (or already overlapping)
      if (dist > 24 && Math.sign(p.x - en.x) !== en.dir) continue;
      if (dist < bestDist) {
        best = en;
        bestDist = dist;
      }
    }
    if (best) this.triggerPerfectDodge(best);
  }

  private triggerPerfectDodge(en: Enemy) {
    const p = this.player;
    en.attackT = 0;
    en.attackHit = true;
    en.stunT = STUN_FRAMES;
    en.hurtT = 12;
    en.cooldown = Math.max(en.cooldown, 40);
    en.vx = -en.dir * 4;
    this.perfectSlowT = PERFECT_SLOW_FRAMES;
    this.counterT = COUNTER_WINDOW;
    this.counterTarget = en;
    this.gainSpecial(18);
    this.floater(p.x, p.y - 125, "PERFECT DODGE", "#ffffff");
    this.floater(en.x, en.y - en.h - 20, "STUNNED", "#e8e8e8");
    this.impact(en.x, en.y - en.h * 0.5, "#ffffff", 18);
    this.addShake(6);
    this.hitStop = Math.max(this.hitStop, 7);
    p.invuln = Math.max(p.invuln, 18);
    sfx.perfectDodge();
    this.pushHud();
  }
  private shoot() {
    const p = this.player;
    if (p.dead || p.shootCd > 0 || p.reloadT > 0) return;
    const def = WEAPONS[p.weaponId];
    if (p.ammo <= 0) { sfx.dryFire(); this.reload(); return; }
    p.ammo--;
    p.loadout[p.weaponId].mag = p.ammo;
    this.usedWeapon = true;
    const focusRate = this.focusT > 0 ? 0.72 : 1;
    p.shootCd = Math.max(3, Math.round(def.fireRate * focusRate));
    const bx = p.x + p.dir * 26;
    const by = p.y - 46;
    for (let i = 0; i < def.pellets; i++) {
      const angle = (Math.random() - 0.5) * 2 * def.spread;
      this.bullets.push(new Bullet(bx, by, p.dir, {
        speed: def.bulletSpeed,
        angle,
        damage: def.damage,
        knock: def.knock,
        range: def.range,
        color: def.color,
      }));
    }
    sfx.shoot();
    this.addShake(def.id === "heavy" ? 8 : def.id === "shotgun" ? 6 : 4);
    for (let i = 0; i < 6; i++)
      this.particles.push({
        x: bx, y: by,
        vx: p.dir * (2 + Math.random() * 3),
        vy: (Math.random() - 0.5) * 2,
        life: 12, max: 12, color: def.color, size: 2 + Math.random() * 2, grav: 0,
      });
    this.pushHud();
  }
  private reload() {
    const p = this.player;
    const def = WEAPONS[p.weaponId];
    const slot = p.loadout[p.weaponId];
    const mag = p.magCap();
    if (p.reloadT > 0 || p.ammo >= mag || slot.reserve <= 0) return;
    p.reloadT = Math.max(18, Math.round(def.reloadTime * this.mods.reloadMul));
    sfx.reload();
    this.pushHud();
  }

  private finishReload() {
    const p = this.player;
    const slot = p.loadout[p.weaponId];
    const need = p.magCap() - p.ammo;
    const take = Math.min(need, slot.reserve);
    slot.reserve -= take;
    p.ammo += take;
    slot.mag = p.ammo;
    this.pushHud();
  }

  private equipWeapon(id: WeaponId) {
    const p = this.player;
    if (p.dead || p.reloadT > 0) return;
    const slot = p.loadout[id];
    if (!slot?.unlocked) {
      this.floater(p.x, p.y - 100, "LOCKED", "#d0d0d0");
      return;
    }
    if (p.weaponId === id) return;
    p.stashAmmoToLoadout();
    p.weaponId = id;
    p.syncAmmoFromLoadout();
    p.shootCd = Math.max(p.shootCd, 8);
    this.floater(p.x, p.y - 100, WEAPONS[id].name.toUpperCase(), "#ffffff");
    this.pushHud();
  }

  private cycleWeapon(dir: 1 | -1) {
    const p = this.player;
    const start = WEAPON_ORDER.indexOf(p.weaponId);
    for (let i = 1; i <= WEAPON_ORDER.length; i++) {
      const idx = (start + dir * i + WEAPON_ORDER.length * 3) % WEAPON_ORDER.length;
      const id = WEAPON_ORDER[idx]!;
      if (p.loadout[id].unlocked) {
        this.equipWeapon(id);
        return;
      }
    }
  }

  private unlockWeapon(id: WeaponId, reserveBonus = 0) {
    const p = this.player;
    const def = WEAPONS[id];
    const slot = p.loadout[id];
    const wasLocked = !slot.unlocked;
    const mag = p.magCap(id);
    const maxRes = p.reserveCap(id);
    slot.unlocked = true;
    if (wasLocked) {
      slot.mag = mag;
      slot.reserve = Math.min(maxRes, Math.max(slot.reserve, Math.floor(maxRes * 0.35) + reserveBonus));
    } else {
      slot.reserve = Math.min(maxRes, slot.reserve + Math.max(2, Math.floor(mag / 2) + reserveBonus));
    }
    this.equipWeapon(id);
    this.floater(p.x, p.y - 115, `${def.name.toUpperCase()} ACQUIRED`, "#ffe98a");
  }
  private melee(kind: "punch" | "kick" | "knee") {
    const p = this.player;
    if (p.dead || p.attackT > 0 || p.cooldown > 0) return;
    const focus = this.focusT > 0;
    p.attackKind = kind;
    p.finisherTier = 0;
    p.attackT = Math.max(10, Math.round((kind === "punch" ? 14 : kind === "kick" ? 20 : 17) * (focus ? 0.78 : 1)));
    p.cooldown = Math.max(4, Math.round((kind === "punch" ? 7 : 12) * (focus ? 0.7 : 1)));
    p.attackHit = false;
    p.anim = kind;
    if (kind === "punch") sfx.punch(); else if (kind === "kick") sfx.kick(); else sfx.knee();
  }

  private currentFinisherTier(): 0 | 1 | 2 {
    if (this.player.combo >= FINISHER_ULT) return 2;
    if (this.player.combo >= FINISHER_BASIC) return 1;
    return 0;
  }

  private tryFinisher() {
    const p = this.player;
    if (p.dead || this.respawning || p.attackT > 0 || p.cooldown > 0 || p.dashT > 0) return;
    const tier = this.currentFinisherTier();
    if (tier === 0) {
      this.floater(p.x, p.y - 100, `COMBO ×${FINISHER_BASIC}+`, "#d0d0d0");
      return;
    }
    p.finisherTier = tier;
    p.attackKind = "finisher";
    p.attackT = tier === 2 ? 30 : 24;
    p.cooldown = tier === 2 ? 22 : 16;
    p.attackHit = false;
    p.anim = "finisher";
    p.vx = p.dir * (tier === 2 ? 5.5 : 3.5);
    p.invuln = Math.max(p.invuln, tier === 2 ? 22 : 16);
    this.finisherSlowT = tier === 2 ? FINISHER_SLOW_ULT : FINISHER_SLOW_BASIC;
    this.hitStop = Math.max(this.hitStop, tier === 2 ? 10 : 7);
    this.addShake(tier === 2 ? 9 : 6);
    // Spend combo as the finisher cost; tier already stored on player.
    p.combo = 0;
    p.comboT = 0;
    this.lastComboForSpecial = 0;
    this.lastFinisherAnnounce = 0;
    this.floater(p.x, p.y - 128, tier === 2 ? "ULTIMATE FINISHER" : "FINISHER", "#ffffff");
    this.impact(p.x + p.dir * 20, p.y - 50, "#ffffff", tier === 2 ? 22 : 14);
    sfx.finisher();
    this.pushHud();
  }

  /** Fill special meter from combat events. Perfect-dodge hook ready for later step. */
  gainSpecial(amount: number) {
    if (this.focusT > 0 || amount <= 0) return;
    const prev = this.specialMeter;
    const scaled = amount * this.mods.specialMul;
    this.specialMeter = Math.min(SPECIAL_MAX, this.specialMeter + scaled);
    if (prev < SPECIAL_MAX && this.specialMeter >= SPECIAL_MAX) {
      this.floater(this.player.x, this.player.y - 110, "FOCUS READY", "#ffffff");
    }
  }

  private activateFocus() {
    const p = this.player;
    if (p.dead || this.respawning || this.focusT > 0) return;
    if (this.specialMeter < SPECIAL_MAX) return;
    this.specialMeter = 0;
    this.focusT = FOCUS_DURATION;
    this.floater(p.x, p.y - 120, "FOCUS MODE", "#f0f0f0");
    this.impact(p.x, p.y - 40, "rgba(255,255,255,0.85)", 16);
    this.addShake(5);
    sfx.focus();
    this.pushHud();
  }

  // ---- helpers ----
  private puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++)
      this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 8, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 26, max: 26, color: "rgba(255,255,255,0.85)", size: 3 + Math.random() * 4, grav: 0.02 });
  }
  private impact(x: number, y: number, color = "#ffe9a8", n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 22, max: 22, color, size: 2 + Math.random() * 3, grav: 0.18, kind: "spark" });
    }
  }
  /** Expanding ring + sparks for melee/strong hits. */
  private impactBurst(x: number, y: number, color: string, power: "light" | "heavy" | "kill" | "gun") {
    const n = power === "kill" ? 18 : power === "heavy" ? 14 : power === "gun" ? 8 : 10;
    this.impact(x, y, color, n);
    this.particles.push({
      x, y, vx: 0, vy: 0,
      life: power === "kill" ? 18 : 12,
      max: power === "kill" ? 18 : 12,
      color,
      size: power === "kill" ? 28 : power === "heavy" ? 20 : 12,
      grav: 0,
      kind: "ring",
    });
  }
  private addShake(amount: number) {
    if (this.shakeScale <= 0 || amount <= 0) return;
    const next = Math.min(SHAKE_MAX, Math.max(this.shake, amount * this.shakeScale));
    this.shake = next;
  }
  private floater(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, color, life: 45 });
  }

  /** Static obstacles + living solid props. */
  private solidBlocks(): Rect[] {
    const list: Rect[] = this.level.obstacles.map((o) => ({ ...o }));
    for (const p of this.props) {
      if (!p.dead) list.push(p.rect);
    }
    return list;
  }

  private collideActorWithSolids(actor: { x: number; y: number; vx: number; vy: number; w: number; h: number; onGround: boolean; rect: Rect }) {
    for (const o of this.solidBlocks()) {
      if (!overlap(actor.rect, o)) continue;
      if (actor.vy > 0 && actor.y - actor.vy <= o.y + 6) {
        actor.y = o.y;
        actor.vy = 0;
        actor.onGround = true;
      } else {
        actor.x = actor.x < o.x + o.w / 2 ? o.x - actor.w / 2 - 1 : o.x + o.w + actor.w / 2 + 1;
        actor.vx = 0;
      }
    }
  }

  private damageProp(prop: Prop, dmg: number, knock: number, srcDir: number) {
    if (prop.dead) return;
    prop.hp -= dmg;
    prop.hitFlash = 8;
    if (prop.movable) {
      prop.vx += knock * srcDir * prop.knockMul * 0.55;
      prop.vy -= 1.5;
    }
    this.impact(prop.cx, prop.cy, prop.explosive ? "#ffb35c" : "#e8dfd0", 8);
    this.addShake(prop.explosive ? 5 : 3);
    this.hitStop = Math.max(this.hitStop, 2);
    sfx.hitLight();
    if (prop.hp <= 0) this.destroyProp(prop, srcDir);
  }

  private destroyProp(prop: Prop, srcDir: number) {
    if (prop.dead) return;
    prop.dead = true;
    this.score += prop.score;
    this.floater(prop.cx, prop.y - 12, `+${prop.score}`, "#ffe98a");
    this.impactBurst(prop.cx, prop.cy, prop.explosive ? "#ff8a5c" : "#efe6d6", prop.explosive ? "heavy" : "light");
    sfx.propBreak();
    if (prop.explosive) this.detonateProp(prop);
    else {
      this.addShake(5);
      // Soft debris kick
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: prop.cx, y: prop.cy,
          vx: (Math.random() - 0.5) * 6 + srcDir * 2,
          vy: -2 - Math.random() * 4,
          life: 28, max: 28,
          color: "#d2c4ae", size: 3 + Math.random() * 3, grav: 0.25, kind: "spark",
        });
      }
    }
    this.pushHud();
  }

  private detonateProp(prop: Prop) {
    sfx.explode();
    this.addShake(12);
    this.hitStop = Math.max(this.hitStop, 8);
    this.screenFlash = Math.max(this.screenFlash, 0.3);
    this.killSlowT = Math.max(this.killSlowT, 10);
    this.impactBurst(prop.cx, prop.cy, "#ffb35c", "kill");
    this.floater(prop.cx, prop.y - 24, "BOOM", "#ffb35c");
    const radius = 110;
    for (const en of this.enemies) {
      if (en.dead) continue;
      const dx = en.x - prop.cx;
      const dy = (en.y - en.h * 0.5) - prop.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        this.damageEnemy(en, 28 + 32 * falloff, 10 * falloff, dx >= 0 ? 1 : -1, "melee");
      }
    }
    const p = this.player;
    if (!p.dead) {
      const dx = p.x - prop.cx;
      const dy = (p.y - p.h * 0.5) - prop.cy;
      if (Math.hypot(dx, dy) < radius * 0.85) {
        this.damagePlayer(10, dx >= 0 ? 1 : -1);
      }
    }
    // Chain: nearby explosives take splash
    for (const other of this.props) {
      if (other.dead || other === prop) continue;
      const dist = Math.hypot(other.cx - prop.cx, other.cy - prop.cy);
      if (dist < radius * 0.75) {
        this.damageProp(other, other.explosive ? 40 : 22, 8, other.cx >= prop.cx ? 1 : -1);
      }
    }
  }

  private updateProps() {
    const lvl = this.level;
    const p = this.player;
    for (const prop of this.props) {
      if (prop.dead) continue;
      prop.hitFlash = Math.max(0, prop.hitFlash - 1);
      if (prop.movable) {
        prop.vy += GRAVITY * 0.85;
        prop.x += prop.vx;
        prop.y += prop.vy;
        prop.vx *= prop.vy === 0 && Math.abs(prop.vx) < 0.15 ? 0 : 0.94;
        // Ground
        if (prop.y + prop.h >= GROUND_Y) {
          prop.y = GROUND_Y - prop.h;
          prop.vy = 0;
          prop.vx *= 0.82;
        }
        // Platforms
        for (const plat of lvl.platforms) {
          if (prop.vy >= 0 && prop.y + prop.h >= plat.y && prop.y + prop.h <= plat.y + 16 &&
              prop.x + prop.w > plat.x + 4 && prop.x < plat.x + plat.w - 4) {
            prop.y = plat.y - prop.h;
            prop.vy = 0;
            prop.vx *= 0.85;
          }
        }
        // Static obstacles only (not other props — avoid jitter)
        for (const o of lvl.obstacles) {
          if (!overlap(prop.rect, o)) continue;
          if (prop.vy > 0 && prop.y + prop.h - prop.vy <= o.y + 6) {
            prop.y = o.y - prop.h;
            prop.vy = 0;
          } else {
            prop.x = prop.cx < o.x + o.w / 2 ? o.x - prop.w - 1 : o.x + o.w + 1;
            prop.vx *= -0.4;
          }
        }
        // Player shove
        if (!p.dead && overlap(p.rect, prop.rect)) {
          const push = Math.sign(prop.cx - p.x) || p.dir;
          prop.vx += push * 0.55;
          if (Math.abs(p.vx) > 2) prop.vx += p.vx * 0.15;
        }
        if (prop.x < 20) { prop.x = 20; prop.vx = Math.abs(prop.vx) * 0.4; }
        if (prop.x + prop.w > lvl.width - 20) { prop.x = lvl.width - 20 - prop.w; prop.vx = -Math.abs(prop.vx) * 0.4; }
      }
    }
  }

  private spawnWave() {
    const wave = this.level.waves[this.waveIndex];
    if (!wave) return;
    const base = this.level.enemyScale;
    const dm = this.diffMods.enemyScaleMul;
    const scale = {
      speed: base.speed * dm.speed,
      hp: base.hp * dm.hp,
      damage: base.damage * dm.damage,
      aggression: base.aggression * dm.aggression,
      reaction: base.reaction * dm.reaction,
    };
    wave.enemies.forEach((e, i) => {
      const flank = this.level.id >= 3 && i % 2 === 0 ? -1 : this.level.id >= 3 ? 1 : 0;
      const en = new Enemy(e.kind, e.x, scale, flank, !!e.hunt);
      en.dir = e.x > this.player.x ? -1 : 1;
      this.enemies.push(en);
      this.puff(e.x, GROUND_Y, 12);
      this.impact(e.x, GROUND_Y - 40, "rgba(255,255,255,0.7)", 8);
      if (e.hunt) this.floater(e.x, GROUND_Y - 110, "HUNT TARGET", "#ffb04d");
    });
    this.applyWaveLock();
    this.floater(this.player.x, this.player.y - 100, `WAVE ${this.waveIndex + 1}`, "#ffffff");
    if (wave.timed) this.startArenaTimer();
  }

  private startArenaTimer() {
    const sec = this.level.objective.arenaTimeSec ?? 50;
    this.arenaTimerT = Math.round(sec * 60);
    this.arenaActive = true;
    this.arenaFailed = false;
    this.floater(this.player.x, this.player.y - 140, "TIMED ARENA", "#ffb35c");
    this.pushHud();
  }

  private applyWaveLock() {
    const wave = this.level.waves[this.waveIndex];
    this.lockX = wave?.lockX ?? null;
  }

  private remainingEnemyCount() {
    const future = this.level.waves
      .slice(this.waveIndex + 1)
      .reduce((a, w) => a + w.enemies.length, 0);
    return this.enemies.filter((e) => !e.dead).length + future;
  }

  private updateArenaTimer(alive: number) {
    if (!this.arenaActive || this.finished) return;
    if (alive === 0) return;
    this.arenaTimerT--;
    if (this.arenaTimerT <= 0) {
      this.arenaTimerT = 0;
      this.arenaActive = false;
      this.arenaFailed = true;
      this.floater(this.player.x, this.player.y - 140, "ARENA TIME UP", "#ff8a5c");
      for (const en of this.enemies) {
        if (en.dead) continue;
        en.dmg *= 1.15;
        en.speed *= 1.08;
      }
      this.score = Math.max(0, this.score - 200);
      this.pushHud();
    }
  }

  private updateObjectiveState(p: Player, _alive: number) {
    if (this.finished || this.respawning) return;
    const obj = this.level.objective;

    if (obj.type === "checkpoint" && !this.extractReached) {
      const need = obj.requireWaves ?? this.level.waves.length;
      const cleared = this.enemies.filter((e) => !e.dead).length === 0 && this.waveIndex >= this.level.waves.length - 1
        ? this.level.waves.length
        : this.waveIndex;
      const extractX = obj.extractX ?? this.level.width - 200;
      if (cleared >= need && p.x >= extractX) {
        this.extractReached = true;
        this.floater(p.x, p.y - 130, "EXTRACT SECURED", "#d7ffe8");
        this.tryCompleteLevel();
      }
    }
  }

  private updateBonusObjective() {
    const bonus = this.level.objective.bonus;
    if (!bonus || this.bonusDone) return;
    if (bonus.type === "secrets") {
      const found = this.secretFlags.filter(Boolean).length;
      if (found >= bonus.count) {
        this.bonusDone = true;
        this.score += 250;
        this.floater(this.player.x, this.player.y - 150, "BONUS OBJECTIVE", "#ffe9a8");
        this.pushHud();
      }
    }
  }

  private objectiveSatisfied(): boolean {
    const obj = this.level.objective;
    const alive = this.enemies.filter((e) => !e.dead).length;
    const wavesDone = alive === 0 && this.waveIndex >= this.level.waves.length - 1;
    switch (obj.type) {
      case "elimination":
      case "survival":
      case "timed_arena":
      case "boss":
        return wavesDone;
      case "elite_hunt":
        return wavesDone && (this.huntKilled || !this.levelHasHuntTarget());
      case "checkpoint":
        return this.extractReached;
      default:
        return wavesDone;
    }
  }

  private levelHasHuntTarget() {
    return this.level.waves.some((w) => w.enemies.some((e) => e.hunt));
  }

  private tryCompleteLevel() {
    if (this.finished || !this.objectiveSatisfied()) return;
    const p = this.player;
    this.finished = true;
    this.score += 500 + Math.round(p.hp) * 5;
    if (this.arenaClearedInTime) this.score += 150;
    if (this.bonusDone) this.score += 100;
    const rank = this.computeRank();
    sfx.win();
    this.floater(p.x, p.y - 130, `RANK ${rank}`, "#ffffff");
    const secretsFound = this.secretFlags.filter(Boolean).length;
    const secretsTotal = (this.level.secrets ?? []).length;
    const timeSec = Math.round(this.time / 60);
    const achievements = this.evaluateAchievements(secretsFound, secretsTotal, timeSec);
    setTimeout(() => this.cb.onLevelComplete({
      score: this.score,
      rank,
      maxCombo: p.maxCombo,
      timeSec,
      damageTaken: Math.round(this.damageTaken),
      secretsFound,
      secretsTotal,
      achievements,
    }), 700);
  }

  private evaluateAchievements(secretsFound: number, secretsTotal: number, timeSec: number): AchievementId[] {
    const p = this.player;
    const unlocked: AchievementId[] = [];
    const maybe = (cond: boolean, id: AchievementId) => {
      if (cond && unlockAchievement(id)) unlocked.push(id);
    };
    maybe(this.damageTaken <= 0, "noDamage");
    maybe(p.maxCombo >= 10, "combo10");
    maybe(!this.usedWeapon, "meleeOnly");
    maybe(this.level.targetTimeSec != null && timeSec <= this.level.targetTimeSec, "speedRunner");
    maybe(this.level.id === LEVELS.length, "bossSlayer");
    maybe(secretsTotal > 0 && secretsFound >= secretsTotal, "secretHunter");
    return unlocked;
  }

  private objectiveProgressText(): string {
    if (this.arenaActive) {
      return `Timed arena · ${Math.ceil(this.arenaTimerT / 60)}s · ${this.enemies.filter((e) => !e.dead).length} left`;
    }
    const obj = this.level.objective;
    const alive = this.enemies.filter((e) => !e.dead).length;
    switch (obj.type) {
      case "elimination":
        return `Waves ${Math.min(this.waveIndex + 1, this.level.waves.length)}/${this.level.waves.length} · ${this.remainingEnemyCount()} left`;
      case "survival":
        return `Survive wave ${Math.min(this.waveIndex + 1, this.level.waves.length)}/${this.level.waves.length}`;
      case "checkpoint": {
        const need = obj.requireWaves ?? this.level.waves.length;
        const cleared = alive === 0 && this.waveIndex >= this.level.waves.length - 1
          ? this.level.waves.length
          : this.waveIndex;
        if (cleared < need) return `Clear waves ${cleared}/${need} then extract`;
        return this.extractReached ? "Extract secured" : "Reach the extract zone →";
      }
      case "elite_hunt": {
        const huntAlive = this.enemies.some((e) => e.huntTarget && !e.dead);
        const huntPending = this.level.waves.slice(this.waveIndex).some((w) => w.enemies.some((e) => e.hunt));
        if (this.huntKilled) {
          return alive > 0 || this.waveIndex < this.level.waves.length - 1
            ? "Target down · finish remaining"
            : "Hunt complete";
        }
        if (huntAlive) return "Eliminate the marked elite";
        if (huntPending) return "Advance to find the hunt target";
        return "Locate hunt target";
      }
      case "timed_arena":
        return `Waves ${Math.min(this.waveIndex + 1, this.level.waves.length)}/${this.level.waves.length}`;
      case "boss":
        return alive > 0 && this.enemies.some((e) => e.kind === "boss" && !e.dead)
          ? "Defeat the Warlord"
          : `Approach · wave ${Math.min(this.waveIndex + 1, this.level.waves.length)}/${this.level.waves.length}`;
      default:
        return "";
    }
  }

  private computeRank(): LevelRank {
    const timeSec = this.time / 60;
    const hpRatio = this.player.hp / this.player.maxHp;
    const secrets = this.level.secrets ?? [];
    const found = this.secretFlags.filter(Boolean).length;
    let points = 0;
    points += Math.min(40, this.score / 200);
    points += Math.min(25, this.player.maxCombo * 3);
    points += Math.max(0, 20 - this.damageTaken / 8);
    points += Math.max(0, 15 - timeSec / 40);
    points += hpRatio * 15;
    if (secrets.length > 0) points += (found / secrets.length) * 10;
    if (points >= 85) return "S";
    if (points >= 68) return "A";
    if (points >= 48) return "B";
    return "C";
  }

  private activateCheckpoints() {
    const p = this.player;
    this.level.checkpoints.forEach((cp, i) => {
      if (!this.checkpointFlags[i] && p.x >= cp.x) {
        this.checkpointFlags[i] = true;
        this.checkpointIdx = i;
        this.checkpointWaveIndex = this.waveIndex;
        this.floater(cp.x, GROUND_Y - 90, "CHECKPOINT", "#d7ffe8");
        this.impact(cp.x, GROUND_Y - 20, "#c8ffd8", 14);
        sfx.pickup();
      }
    });
  }

  private checkSecrets() {
    const p = this.player;
    const secrets = this.level.secrets;
    if (!secrets?.length) return;
    for (let i = 0; i < secrets.length; i++) {
      if (this.secretFlags[i]) continue;
      const s = secrets[i]!;
      if (!overlap(p.rect, s)) continue;
      this.secretFlags[i] = true;
      this.discoverSecret(s);
    }
  }

  private discoverSecret(s: (NonNullable<LevelDef["secrets"]>)[number]) {
    const p = this.player;
    this.floater(p.x, p.y - 130, "SECRET FOUND", "#ffe9a8");
    this.impactBurst(p.x, p.y - 40, "#ffe9a8", "heavy");
    this.screenFlash = Math.max(this.screenFlash, 0.16);
    this.addShake(4);
    sfx.pickup();
    for (const r of s.rewards) {
      if (r.type === "score") {
        this.score += r.amount;
        this.floater(p.x + 20, p.y - 150, `+${r.amount}`, "#ffe98a");
      } else if (r.type === "ammo") {
        const amt = Math.round(r.amount * this.diffMods.ammoMul);
        const slot = p.loadout[p.weaponId];
        slot.reserve = Math.min(p.reserveCap(), slot.reserve + amt);
        this.floater(p.x - 10, p.y - 150, `+${amt} AMMO`, "#9ad9ff");
      } else if (r.type === "health") {
        const amt = Math.round(r.amount * this.diffMods.healMul);
        p.hp = Math.min(p.maxHp, p.hp + amt);
        this.floater(p.x, p.y - 170, `+${amt} HP`, "#a8f0b0");
      } else if (r.type === "weapon") {
        this.unlockWeapon(r.weapon, 2);
      } else if (r.type === "currency") {
        addCurrency(r.amount);
        this.floater(p.x + 30, p.y - 170, `+${r.amount} IVORY`, "#e8dcc8");
      } else if (r.type === "collectible") {
        this.score += 150;
        this.floater(p.x - 24, p.y - 190, r.label ?? "RELIC", "#ffffff");
      }
    }
    this.pushHud();
  }

  private beginRespawn() {
    if (this.respawning) return;
    this.respawning = true;
    this.respawnT = 50;
    // Stop in-flight combat so the wipe/respawn is deterministic
    this.hitStop = 0;
    this.counterT = 0;
    this.counterTarget = null;
    this.floater(this.player.x, this.player.y - 110, "RESPAWN…", "#ffe0a8");
  }

  private finishRespawn() {
    const p = this.player;
    const cp = this.level.checkpoints[this.checkpointIdx];
    if (!cp) {
      this.respawning = false;
      this.finished = true;
      sfx.lose();
      setTimeout(() => this.cb.onGameOver(this.score), 400);
      return;
    }

    // Restore combat to the wave saved at the checkpoint — no duplicate later waves,
    // and bosses/hunts/timers reset cleanly via a fresh spawnWave().
    this.waveIndex = this.checkpointWaveIndex;
    this.enemies = [];
    this.enemyShots = [];
    this.bullets = [];
    this.awaitingTrigger = false;
    this.waveDelay = 0;
    this.arenaActive = false;
    this.arenaTimerT = 0;
    this.arenaFailed = false;
    this.arenaClearedInTime = false;
    this.lockX = null;
    this.focusT = 0;
    this.perfectSlowT = 0;
    this.finisherSlowT = 0;
    this.killSlowT = 0;
    this.counterT = 0;
    this.counterTarget = null;

    const huntWaveIdx = this.level.waves.findIndex((w) => w.enemies.some((e) => e.hunt));
    if (huntWaveIdx < 0 || huntWaveIdx >= this.checkpointWaveIndex) {
      this.huntKilled = false;
    }

    p.dead = false;
    p.deathT = 0;
    p.hp = Math.round(p.maxHp * 0.55);
    p.x = cp.x;
    p.y = GROUND_Y;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 140;
    p.hurtT = 0;
    p.flashT = 0;
    p.attackT = 0;
    p.cooldown = 0;
    p.dashT = 0;
    p.reloadT = 0;
    p.anim = "idle";
    p.combo = 0;
    p.comboT = 0;
    this.lastComboForSpecial = 0;
    this.lastFinisherAnnounce = 0;

    // Pickups / props / secrets stay as-is (no re-duplication of taken loot).
    this.score = Math.max(0, this.score - 150);
    this.respawning = false;
    this.camera = Math.max(0, Math.min(this.level.width - VIEW_W, cp.x - VIEW_W * 0.4));

    this.spawnWave();
    this.puff(cp.x, GROUND_Y, 16);
    this.impact(cp.x, GROUND_Y - 40, "#ffffff", 16);
    this.floater(cp.x, GROUND_Y - 100, "CHECKPOINT RESTORE", "#d7ffe8");
    this.pushHud();
  }

  private damageEnemy(en: Enemy, dmg: number, knock: number, srcDir: number, source: "melee" | "gun" | "finisher" = "melee") {
    if (en.dead) return;

    // Shielded: frontal punch/gun chip the guard. Kick, knee, air, counter, finisher pierce.
    if (en.kind === "shielded" && en.shieldHp > 0 && en.shieldBreakT <= 0 && source !== "finisher") {
      const guarding = en.isGuarding(this.player.x);
      const pierce =
        this.counterT > 0 && this.counterTarget === en ||
        !this.player.onGround ||
        (source === "melee" && (this.player.attackKind === "kick" || this.player.attackKind === "knee"));
      if (guarding && !pierce) {
        const chip = source === "gun" ? dmg * 0.55 : dmg * 0.9;
        en.shieldHp = Math.max(0, en.shieldHp - chip);
        en.hurtT = 6;
        en.vx = knock * 0.2 * srcDir * en.knockRes;
        this.impact(en.x + srcDir * 8, en.y - en.h * 0.55, "#d8dde6", 8);
        this.floater(en.x, en.y - en.h - 8, "BLOCKED", "#cfd6e0");
        this.addShake(3);
        this.hitStop = Math.max(this.hitStop, 2);
        en.flashT = Math.max(en.flashT, 4);
        sfx.hitLight();
        if (en.shieldHp <= 0) {
          en.shieldBreakT = 110;
          en.stunT = Math.max(en.stunT, 28);
          this.floater(en.x, en.y - en.h - 36, "GUARD BREAK", "#ffffff");
          this.impactBurst(en.x, en.y - en.h * 0.5, "#ffffff", "heavy");
          this.addShake(8);
          this.hitStop = Math.max(this.hitStop, 6);
          this.screenFlash = Math.max(this.screenFlash, 0.15);
        }
        return;
      }
      if (guarding && pierce && source === "melee") {
        en.shieldHp = Math.max(0, en.shieldHp - dmg * 0.35);
      }
    }
    if (source === "finisher" && en.kind === "shielded" && en.shieldHp > 0) {
      en.shieldHp = 0;
      en.shieldBreakT = 130;
      this.floater(en.x, en.y - en.h - 40, "GUARD BREAK", "#ffffff");
    }

    const focusMul = this.focusT > 0 ? FOCUS_DAMAGE : 1;
    const isCounter = this.counterT > 0 && this.counterTarget === en && source === "melee";
    const counterMul = isCounter ? 1.55 : 1;
    const finalDmg = dmg * focusMul * counterMul;
    const willKill = en.hp - finalDmg <= 0;
    en.hp -= finalDmg;
    en.hurtT = 14;
    en.flashT = source === "finisher" || isCounter || willKill ? 10 : 7;
    en.anim = "hurt";
    en.vx = knock * srcDir * en.knockRes * (isCounter || source === "finisher" ? 1.35 : willKill ? 1.2 : 1);
    if (willKill) en.vy = Math.min(en.vy, -4.5);
    en.knockT = en.kind === "brute" || en.kind === "miniboss" || en.kind === "boss" || en.kind === "shielded" ? 6 : 10;
    if (source === "finisher") {
      en.stunT = Math.max(en.stunT, this.player.finisherTier >= 2 ? 36 : 22);
      en.attackT = 0;
      en.cooldown = Math.max(en.cooldown, 30);
    }
    const hitColor = isCounter || source === "finisher" || this.focusT > 0 || willKill ? "#ffffff" : source === "gun" ? "#ffd76a" : "#fff3c4";
    const burstPower = willKill ? "kill" : source === "finisher" || isCounter || knock >= 9 ? "heavy" : source === "gun" ? "gun" : "light";
    this.impactBurst(en.x + srcDir * 10, en.y - en.h * 0.6, hitColor, burstPower);
    this.floater(en.x, en.y - en.h - 8, `${Math.round(finalDmg)}`, "#ffffff");
    if (isCounter) {
      this.floater(en.x, en.y - en.h - 36, "COUNTER", "#ffe9a8");
      this.gainSpecial(10);
      this.counterT = 0;
      this.counterTarget = null;
      this.hitStop = Math.max(this.hitStop, 8);
      this.addShake(8);
      this.screenFlash = Math.max(this.screenFlash, 0.22);
    }
    if (source === "finisher") {
      const bonus = this.player.finisherTier >= 2 ? 220 : 110;
      this.score += bonus;
      this.floater(en.x - 18, en.y - en.h - 40, `+${bonus}`, "#ffe98a");
      this.gainSpecial(14);
      this.hitStop = Math.max(this.hitStop, this.player.finisherTier >= 2 ? 12 : 8);
      this.addShake(this.player.finisherTier >= 2 ? 11 : 9);
      this.screenFlash = Math.max(this.screenFlash, 0.28);
    }
    const heavy = en.kind === "boss" || en.kind === "miniboss" || en.kind === "brute" || knock >= 8 || isCounter || source === "finisher" || willKill;
    this.addShake(heavy ? 7 : source === "gun" ? 3 : 4);
    this.hitStop = Math.max(this.hitStop, willKill ? 7 : heavy ? 5 : 3);
    if (willKill) sfx.hitKill();
    else if (source === "gun") sfx.hitGun();
    else if (heavy) sfx.hitHeavy();
    else sfx.hitLight();
    this.gainSpecial(source === "melee" ? 8 : source === "finisher" ? 6 : 5);
    if (en.hp <= 0) {
      en.dead = true; en.anim = "dead"; en.deathT = 0; en.vy = -6; en.vx = knock * 0.6 * srcDir * en.knockRes;
      en.flashT = 12;
      this.killSlowT = Math.max(this.killSlowT, KILL_SLOW_FRAMES);
      this.screenFlash = Math.max(this.screenFlash, 0.18);
      const comboMul = 1 + this.player.combo * 0.15;
      const finisherMul = source === "finisher" ? (this.player.finisherTier >= 2 ? 1.85 : 1.45) : 1;
      const gained = Math.round(en.score * comboMul * (isCounter ? 1.25 : 1) * finisherMul);
      this.score += gained;
      this.gainSpecial(12);
      if (this.counterTarget === en) {
        this.counterT = 0;
        this.counterTarget = null;
      }
      sfx.defeat();
      this.impactBurst(en.x, en.y - en.h * 0.5, "#e8eef7", "kill");
      this.floater(en.x, en.y - en.h - 26, `+${gained}`, "#ffe98a");
      if (this.player.combo > 1) this.floater(en.x + 24, en.y - en.h - 44, `×${this.player.combo}`, "#ffffff");
      if (en.huntTarget) {
        this.huntKilled = true;
        this.floater(en.x, en.y - en.h - 60, "TARGET DOWN", "#ffb04d");
        this.score += 400;
        this.pushHud();
      }
    }
  }

  private damagePlayer(dmg: number, srcDir: number) {
    const p = this.player;
    if (p.dead || p.invuln > 0 || this.respawning) return;
    p.hp -= dmg;
    this.damageTaken += dmg;
    p.invuln = 60;
    p.hurtT = 16;
    p.flashT = 10;
    p.anim = "hurt";
    p.vx = 7 * srcDir;
    p.vy = -5;
    p.combo = 0;
    this.lastComboForSpecial = 0;
    this.lastFinisherAnnounce = 0;
    this.addShake(9);
    this.hitStop = Math.max(this.hitStop, 4);
    this.screenFlash = Math.max(this.screenFlash, 0.2);
    sfx.playerHurt();
    this.impactBurst(p.x, p.y - 46, "#ffb3b3", "heavy");
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.anim = "dead"; p.deathT = 0;
      if (this.checkpointIdx >= 0) {
        this.beginRespawn();
      } else {
        this.finished = true;
        sfx.lose();
        setTimeout(() => this.cb.onGameOver(this.score), 900);
      }
    }
    this.pushHud();
  }

  // ---- update ----
  private update() {
    this.time++;
    const p = this.player;
    const lvl = this.level;

    // timers
    const focus = this.focusT > 0;
    const tick = focus ? 2 : 1;
    p.shootCd = Math.max(0, p.shootCd - tick);
    p.cooldown = Math.max(0, p.cooldown - tick);
    p.dashCd = Math.max(0, p.dashCd - 1);
    p.invuln = Math.max(0, p.invuln - 1);
    p.hurtT = Math.max(0, p.hurtT - 1);
    p.comboT = Math.max(0, p.comboT - 1);
    if (p.comboT === 0) {
      p.combo = 0;
      this.lastComboForSpecial = 0;
      this.lastFinisherAnnounce = 0;
    }
    if (p.dashT > 0) p.dashT--;
    if (this.focusT > 0) this.focusT--;
    if (this.perfectSlowT > 0) this.perfectSlowT--;
    if (this.finisherSlowT > 0) this.finisherSlowT--;
    if (this.killSlowT > 0) this.killSlowT--;
    if (this.screenFlash > 0) this.screenFlash = Math.max(0, this.screenFlash - 0.045);
    p.flashT = Math.max(0, p.flashT - 1);
    if (this.counterT > 0) {
      this.counterT--;
      if (this.counterT === 0) this.counterTarget = null;
    }
    if (this.respawning) {
      this.respawnT--;
      if (this.respawnT <= 0) this.finishRespawn();
    }
    if (p.reloadT > 0) {
      p.reloadT--;
      if (p.reloadT === 0) this.finishReload();
    }

    if (!p.dead) {
      const left = this.keys["ArrowLeft"];
      const right = this.keys["ArrowRight"];
      const sprint = this.keys["Shift"];
      const base = sprint ? 6.4 : 4.4;
      if (p.dashT > 0) {
        p.vx = 11 * p.dir;
      } else if (p.attackT > 0 && p.onGround) {
        p.vx *= 0.7;
      } else {
        if (left && !right) { p.vx = -base; p.dir = -1; }
        else if (right && !left) { p.vx = base; p.dir = 1; }
        else p.vx *= p.onGround ? 0.6 : 0.9;
      }
      if (p.attackT > 0) p.attackT--;
      // Hold-to-fire (SMG auto + sustained fire for others)
      if (this.keys[" "]) this.shoot();
    } else {
      p.vx *= 0.85;
      p.deathT++;
    }

    p.physics(lvl);
    // arena lock during active wave
    if (this.lockX != null && this.enemies.some((e) => !e.dead) && p.x > this.lockX) {
      p.x = this.lockX;
      p.vx = Math.min(0, p.vx);
    }
    this.activateCheckpoints();
    this.checkSecrets();
    // obstacle + prop collision (player)
    this.collideActorWithSolids(p);

    // player anim state
    if (!p.dead) {
      if (p.hurtT > 0) p.anim = "hurt";
      else if (p.attackT > 0) p.anim = p.attackKind;
      else if (p.dashT > 0) p.anim = "dash";
      else if (!p.onGround) p.anim = "jump";
      else if (Math.abs(p.vx) > 0.6) p.anim = "run";
      else p.anim = "idle";
      p.phase += Math.abs(p.vx) * 0.16 + 0.03;
    }

    // melee hits
    const ar = p.attackRect();
    if (ar && !p.attackHit) {
      if (p.attackKind === "finisher") {
        // Active window mid-animation — hit all enemies in the wide finisher box once.
        const maxAtk = p.finisherTier >= 2 ? 30 : 24;
        const progress = 1 - p.attackT / maxAtk;
        if (progress >= 0.35 && progress <= 0.72) {
          let any = false;
          this.propHitId++;
          for (const en of this.enemies) {
            if (en.dead) continue;
            const near = Math.abs(en.x - p.x) < (p.finisherTier >= 2 ? 130 : 100) && Math.abs(en.y - p.y) < 90;
            if (near || overlap(ar, en.rect)) {
              const base = p.finisherTier >= 2 ? 78 : 48;
              const knock = p.finisherTier >= 2 ? 14 : 11;
              this.damageEnemy(en, base, knock, p.dir, "finisher");
              any = true;
            }
          }
          for (const prop of this.props) {
            if (prop.dead || prop.hitStamp === this.propHitId) continue;
            if (overlap(ar, prop.rect) || Math.abs(prop.cx - p.x) < 100) {
              prop.hitStamp = this.propHitId;
              this.damageProp(prop, p.finisherTier >= 2 ? 60 : 40, 12, p.dir);
              any = true;
            }
          }
          if (any) {
            p.attackHit = true;
            this.impact(p.x + p.dir * 40, p.y - 48, "#ffffff", p.finisherTier >= 2 ? 28 : 18);
          }
        }
      } else {
        let hitSomething = false;
        for (const en of this.enemies) {
          if (en.dead) continue;
          if (overlap(ar, en.rect)) {
            hitSomething = true;
            p.attackHit = true;
            p.combo = Math.min(12, p.combo + 1);
            p.maxCombo = Math.max(p.maxCombo, p.combo);
            p.comboT = 100 + this.mods.comboExtra;
            this.announceFinisherReady(p.combo);
            if (p.combo >= 3 && p.combo > this.lastComboForSpecial) {
              this.gainSpecial(2 + Math.floor(p.combo / 3));
              this.lastComboForSpecial = p.combo;
            }
            const base = p.attackKind === "punch" ? 10 : p.attackKind === "kick" ? 15 : 18;
            const airBonus = !p.onGround ? 1.4 : 1;
            const comboBonus = 1 + p.combo * 0.12;
            const knock = p.attackKind === "kick" ? 9 : p.attackKind === "knee" ? 8 : 6;
            this.damageEnemy(en, base * airBonus * comboBonus * this.mods.meleeMul, knock, p.dir, "melee");
            if (p.attackKind === "knee" || p.attackKind === "kick") this.addShake(7);
            break;
          }
        }
        if (!hitSomething) {
          for (const prop of this.props) {
            if (prop.dead) continue;
            if (overlap(ar, prop.rect)) {
              p.attackHit = true;
              const base = p.attackKind === "punch" ? 12 : p.attackKind === "kick" ? 18 : 16;
              const knock = p.attackKind === "kick" ? 10 : 7;
              this.damageProp(prop, base, knock, p.dir);
              break;
            }
          }
        }
      }
    }

    // bullets
    for (const b of this.bullets) {
      b.update();
      if (b.x < this.camera - 100 || b.x > this.camera + VIEW_W + 100) b.dead = true;
      for (const o of this.solidBlocks()) if (overlap(b.rect, o)) {
        b.dead = true;
        this.impact(b.x, b.y, "#d9d3c7", 6);
        sfx.bulletImpact();
        // Damage props when bullets strike them
        for (const prop of this.props) {
          if (!prop.dead && overlap(b.rect, prop.rect)) {
            this.damageProp(prop, b.damage * 0.85, b.knock, Math.sign(b.vx) || 1);
            break;
          }
        }
      }
      for (const en of this.enemies) {
        if (en.dead) continue;
        if (overlap(b.rect, en.rect)) {
          b.dead = true;
          p.combo = Math.min(12, p.combo + 1);
          p.maxCombo = Math.max(p.maxCombo, p.combo);
          p.comboT = 90 + this.mods.comboExtra;
          this.announceFinisherReady(p.combo);
          if (p.combo >= 3 && p.combo > this.lastComboForSpecial) {
            this.gainSpecial(2 + Math.floor(p.combo / 3));
            this.lastComboForSpecial = p.combo;
          }
          const bulletDmg = b.damage * (en.kind === "boss" ? 0.75 : en.kind === "miniboss" ? 0.85 : 1);
          this.damageEnemy(en, bulletDmg, b.knock, Math.sign(b.vx) || p.dir, "gun");
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // enemies
    for (const en of this.enemies) {
      en.hurtT = Math.max(0, en.hurtT - 1);
      en.flashT = Math.max(0, en.flashT - 1);
      en.cooldown = Math.max(0, en.cooldown - 1);
      en.knockT = Math.max(0, en.knockT - 1);
      en.dodgeT = Math.max(0, en.dodgeT - 1);
      en.specialCd = Math.max(0, en.specialCd - 1);
      en.stunT = Math.max(0, en.stunT - 1);
      en.fireCd = Math.max(0, en.fireCd - 1);
      en.telegraphT = Math.max(0, en.telegraphT - 1);
      en.recoverT = Math.max(0, en.recoverT - 1);
      if (en.shieldBreakT > 0) {
        en.shieldBreakT--;
        if (en.shieldBreakT === 0 && en.shieldMax > 0) en.shieldHp = en.shieldMax;
      }
      if (en.dead) {
        en.deathT++;
        en.vx *= 0.9;
        en.physics(lvl);
        continue;
      }
      if (en.stunT > 0) {
        en.vx *= 0.7;
        en.attackT = 0;
        en.telegraphT = 0;
        en.bossMove = null;
        en.anim = "hurt";
        en.physics(lvl);
        this.collideActorWithSolids(en);
        continue;
      }
      if (en.attackT > 0) en.attackT--;

      const def = ENEMIES[en.kind];
      const dx = p.x - en.x;
      const dist = Math.abs(dx);
      const detect = 520 + en.aggression * 280;
      const desiredX = p.x + en.flank * (48 + en.aggression * 30);
      const approachDx = desiredX - en.x;
      en.dir = (Math.abs(approachDx) > 8 ? approachDx : dx) >= 0 ? 1 : -1;

      if (en.kind === "boss" || en.kind === "miniboss") {
        const ratio = en.hp / en.maxHp;
        en.bossPhase = ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
      }

      if (en.knockT > 0 || en.hurtT > 0) {
        en.vx *= 0.85;
      } else if (p.dead || this.respawning) {
        en.vx *= 0.8;
        en.attackT = 0;
        en.telegraphT = 0;
        en.bossMove = null;
      } else if (en.kind === "boss" || en.kind === "miniboss") {
        this.updateBossCombat(en, p, dist, def);
      } else if (dist < detect) {
        const range = def.meleeRange;
        const dodgeChance = 0.035 * en.reaction * def.dodgeMul;
        const wantDodge =
          en.dodgeT === 0 &&
          (
            this.bulletIncoming(en) ||
            (en.kind === "dodger" && p.attackT > 8 && p.attackT < 18 && dist < 70) ||
            (en.kind === "elite" && p.attackT > 10 && dist < 58 && Math.random() < 0.35)
          );
        if (wantDodge && Math.random() < (en.kind === "dodger" ? Math.min(0.85, dodgeChance * 1.4) : dodgeChance)) {
          en.dodgeT = en.kind === "dodger" ? 34 : en.kind === "fast" ? 28 : 40;
          en.vy = en.kind === "dodger" ? -11 : -13;
          en.vx = -en.dir * (en.kind === "dodger" || en.kind === "fast" ? 5.2 : 3);
          if (en.kind === "dodger" && Math.random() < 0.45) en.vx = en.dir * 4.2; // sidestep past
          sfx.dash();
        } else if (en.kind === "ranged") {
          this.updateRangedEnemy(en, dist, def);
        } else if (dist > range) {
          let spd = en.speed;
          if (en.kind === "fast" || en.kind === "dodger") spd *= 1.05;
          if (en.kind === "shielded" && en.shieldHp > 0) spd *= 0.9;
          if (this.focusT > 0 || this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0) {
            spd *= this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0
              ? (this.finisherSlowT > 0 ? 0.28 : this.killSlowT > 0 ? 0.35 : 0.4)
              : FOCUS_ENEMY_SPEED;
          }
          en.vx = en.dir * spd;
          for (const o of lvl.obstacles) {
            if (en.onGround && Math.abs(en.x + en.dir * 30 - (o.x + o.w / 2)) < o.w / 2 + 20) { en.vy = -15; }
          }
          if (en.onGround && p.y < en.y - 60 && dist < 180) en.vy = -16;
          en.anim = en.kind === "shielded" && en.shieldHp > 0 && en.shieldBreakT <= 0 ? "block" : "run";
        } else {
          en.vx *= 0.65;
          if (en.attackT === 0 && en.cooldown === 0) {
            const kinds: ("punch" | "kick" | "knee")[] =
              en.kind === "fast" || en.kind === "dodger"
                ? ["punch", "punch", "kick"]
                : en.kind === "brute"
                  ? ["kick", "punch", "kick"]
                  : en.kind === "shielded"
                    ? ["punch", "kick"]
                    : ["punch", "kick"];
            en.attackKind = kinds[Math.floor(Math.random() * kinds.length)] ?? "punch";
            en.attackT = def.attackFrames;
            en.attackHit = false;
            en.cooldown = Math.max(14, Math.round((def.attackCd - en.aggression * 26) / (en.reaction || 1)));
            en.anim = en.attackKind;
          } else if (en.kind === "shielded" && en.shieldHp > 0 && en.attackT === 0) {
            en.anim = "block";
          }
        }
      } else {
        en.vx *= 0.8;
        en.anim = en.kind === "shielded" && en.shieldHp > 0 ? "block" : "idle";
      }

      en.physics(lvl);
      this.collideActorWithSolids(en);

      if (en.hurtT > 0) en.anim = "hurt";
      else if (en.telegraphT > 0) en.anim = "block";
      else if (en.attackT > 0) en.anim = en.attackKind;
      else if (!en.onGround) en.anim = "jump";
      else if (Math.abs(en.vx) > 0.5 && en.anim !== "block") en.anim = "run";
      en.phase += Math.abs(en.vx) * 0.16 + 0.03;

      const er = en.attackRect();
      if (er && !en.attackHit && en.attackT < 14 && overlap(er, p.rect)) {
        en.attackHit = true;
        const mul = en.attackKind === "kick" ? 1.2 : en.attackKind === "knee" ? 1.35 : 1;
        const phaseMul = (en.kind === "boss" || en.kind === "miniboss") ? (1 + (en.bossPhase - 1) * 0.12) : 1;
        this.damagePlayer(en.dmg * mul * phaseMul, en.dir);
      }
    }

    // enemy projectiles
    for (const sh of this.enemyShots) {
      sh.update();
      if (sh.x < this.camera - 80 || sh.x > this.camera + VIEW_W + 80) sh.dead = true;
      for (const o of this.solidBlocks()) if (overlap(sh.rect, o)) {
        sh.dead = true;
        this.impact(sh.x, sh.y, "#e8e2d4", 5);
        for (const prop of this.props) {
          if (!prop.dead && overlap(sh.rect, prop.rect)) {
            this.damageProp(prop, sh.damage, 5, Math.sign(sh.vx) || 1);
            break;
          }
        }
      }
      if (!sh.dead && !p.dead && overlap(sh.rect, p.rect)) {
        sh.dead = true;
        this.damagePlayer(sh.damage, Math.sign(sh.vx) || 1);
        this.impact(sh.x, sh.y, "#ffe0a8", 8);
      }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);

    // soft separation so packs don't stack
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i]!;
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j]!;
        if (b.dead) continue;
        const d = b.x - a.x;
        if (Math.abs(d) < 36 && Math.abs(a.y - b.y) < 40) {
          const push = (36 - Math.abs(d)) * 0.35 * Math.sign(d || 1);
          a.x -= push; b.x += push;
        }
      }
    }

    // remove long-dead
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deathT > 90));

    // pickups
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.bob += 0.06;
      if (Math.abs(pk.x - p.x) < 34 && Math.abs(pk.y - (p.y - 30)) < 60) {
        pk.taken = true;
        sfx.pickup();
        this.impact(pk.x, pk.y, pk.kind === "ammo" ? "#9ad9ff" : pk.kind === "weapon" ? "#ffe98a" : "#a8f0b0", 14);
        if (pk.kind === "ammo") {
          const def = WEAPONS[p.weaponId];
          const slot = p.loadout[p.weaponId];
          const mag = p.magCap();
          const maxRes = p.reserveCap();
          const add = Math.round(Math.max(mag, Math.floor(maxRes * 0.25)) * this.diffMods.ammoMul);
          slot.reserve = Math.min(maxRes, slot.reserve + add);
          if (p.ammo < mag && slot.reserve > 0) {
            const need = mag - p.ammo;
            const take = Math.min(need, slot.reserve);
            slot.reserve -= take;
            p.ammo += take;
            slot.mag = p.ammo;
          }
          this.floater(p.x, p.y - 90, `+AMMO ${def.name.toUpperCase()}`, "#9ad9ff");
        } else if (pk.kind === "weapon") {
          this.unlockWeapon(pk.weapon);
        } else {
          const heal = Math.round(Math.max(18, 42 - (this.level.id - 1) * 5) * this.diffMods.healMul);
          p.hp = Math.min(p.maxHp, p.hp + heal); this.floater(p.x, p.y - 90, `+${heal} HP`, "#a8f0b0");
        }
        this.pushHud();
      }
    }

    // waves / completion
    const alive = this.enemies.filter((e) => !e.dead).length;
    this.updateArenaTimer(alive);
    this.updateObjectiveState(p, alive);
    this.updateBonusObjective();

    if (alive === 0 && !this.finished && !this.respawning) {
      this.lockX = null;
      if (this.arenaActive) {
        this.arenaActive = false;
        if (!this.arenaFailed) {
          this.arenaClearedInTime = true;
          const bonus = 350;
          this.score += bonus;
          this.floater(p.x, p.y - 140, `ARENA CLEAR +${bonus}`, "#ffe98a");
        }
        this.arenaTimerT = 0;
      }
      if (this.waveIndex < this.level.waves.length - 1) {
        const next = this.level.waves[this.waveIndex + 1]!;
        if (next.triggerX != null && p.x < next.triggerX) {
          this.awaitingTrigger = true;
        } else {
          this.waveDelay++;
          if (this.waveDelay > 55) {
            this.waveDelay = 0;
            this.awaitingTrigger = false;
            this.waveClearBonus += 150;
            this.score += 150;
            this.floater(p.x, p.y - 120, "+150 WAVE", "#ffe98a");
            this.waveIndex++;
            this.spawnWave();
          }
        }
      } else if (this.enemies.length === 0) {
        // Last wave cleared — finish if objective allows (non-checkpoint).
        if (this.level.objective.type !== "checkpoint") {
          this.tryCompleteLevel();
        }
      }
    }

    if (this.awaitingTrigger && !this.finished) {
      const next = this.level.waves[this.waveIndex + 1];
      if (next?.triggerX != null && p.x >= next.triggerX && alive === 0) {
        this.awaitingTrigger = false;
        this.waveDelay = 0;
        this.waveClearBonus += 150;
        this.score += 150;
        this.floater(p.x, p.y - 120, "+150 WAVE", "#ffe98a");
        this.waveIndex++;
        this.spawnWave();
      }
    }

    this.updateProps();

    // particles / floaters
    for (const pt of this.particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.grav; pt.life--; }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const f of this.floaters) { f.y -= 0.9; f.life--; }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    // camera
    const target = Math.max(0, Math.min(this.level.width - VIEW_W, p.x - VIEW_W * 0.4));
    this.camera += (target - this.camera) * 0.12;
    this.shake *= 0.85;

    if (++this.hudTick % 6 === 0) this.pushHud();
    if (this.hudTick % 12 === 0) music.setIntensity(this.computeMusicIntensity());
  }

  private updateBossCombat(en: Enemy, p: Player, dist: number, def: (typeof ENEMIES)[EnemyKind]) {
    // Phase change announce
    if (en.bossPhase !== en.lastPhase) {
      en.lastPhase = en.bossPhase;
      const label = en.bossPhase === 3 ? (en.kind === "boss" ? "RAGE" : "PHASE 3") : `PHASE ${en.bossPhase}`;
      this.floater(en.x, en.y - en.h - 30, label, en.bossPhase === 3 ? "#ff8a5c" : "#ffe9a8");
      this.impactBurst(en.x, en.y - en.h * 0.5, "#ffffff", "heavy");
      this.addShake(en.kind === "boss" ? 10 : 7);
      this.screenFlash = Math.max(this.screenFlash, 0.2);
      en.specialCd = Math.max(en.specialCd, 50);
      en.recoverT = Math.max(en.recoverT, 24);
      en.telegraphT = 0;
      en.bossMove = null;
      sfx.hitHeavy();
      this.pushHud();
    }

    // Resolve telegraph → unique move (dodge window ends when attack begins)
    if (en.telegraphT === 1 && en.bossMove) {
      this.resolveBossMove(en, p);
    }
    if (en.telegraphT > 0) {
      en.vx *= 0.45;
      en.dir = p.x >= en.x ? 1 : -1;
      en.anim = "block";
      // Pulse warning particles
      if (en.telegraphT % 8 === 0) {
        this.impact(en.x + en.dir * 30, en.y - 40, "#ffb35c", 4);
      }
      return;
    }

    // Punish window after big attacks
    if (en.recoverT > 0) {
      en.vx *= 0.55;
      en.anim = "hurt";
      return;
    }

    const range = def.meleeRange + (en.bossPhase >= 2 ? 8 : 0);
    let spd = en.speed * (1 + (en.bossPhase - 1) * (en.kind === "boss" ? 0.32 : 0.2));
    if (this.focusT > 0 || this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0) {
      spd *= this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0
        ? (this.finisherSlowT > 0 ? 0.28 : this.killSlowT > 0 ? 0.35 : 0.4)
        : FOCUS_ENEMY_SPEED;
    }

    // Prefer specials at mid range; close for basic attacks
    if (en.specialCd === 0 && en.attackT === 0 && en.cooldown === 0 && dist < 340) {
      this.beginBossTelegraph(en, dist);
      return;
    }

    if (dist > range) {
      en.vx = en.dir * spd;
      if (en.onGround && p.y < en.y - 60 && dist < 200) en.vy = -16;
      en.anim = "run";
    } else {
      en.vx *= 0.6;
      if (en.attackT === 0 && en.cooldown === 0) {
        // Basic telegraphed-enough melee — longer frames for dodge window
        const kinds: ("punch" | "kick" | "knee")[] =
          en.bossPhase >= 3 ? ["kick", "knee", "punch"] : en.bossPhase >= 2 ? ["kick", "punch", "kick"] : ["punch", "kick"];
        en.attackKind = kinds[Math.floor(Math.random() * kinds.length)] ?? "punch";
        en.attackT = Math.round(def.attackFrames * (en.bossPhase >= 3 ? 0.9 : 1.15));
        en.attackHit = false;
        const baseCd = en.bossPhase >= 3 ? def.attackCd * 0.7 : en.bossPhase >= 2 ? def.attackCd * 0.85 : def.attackCd;
        en.cooldown = Math.max(12, Math.round(baseCd / (en.reaction || 1)));
        en.anim = en.attackKind;
      }
    }
  }

  private beginBossTelegraph(en: Enemy, dist: number) {
    const isBoss = en.kind === "boss";
    let move: NonNullable<Enemy["bossMove"]> = "charge";
    if (en.bossPhase === 1) {
      move = dist > 90 ? "charge" : "slam";
    } else if (en.bossPhase === 2) {
      move = Math.random() < 0.55 ? "slam" : "charge";
    } else {
      // Rage: warlord gets volleys; commanders get combo pressure
      if (isBoss) {
        const roll = Math.random();
        move = roll < 0.34 ? "volley" : roll < 0.67 ? "slam" : "combo";
      } else {
        move = Math.random() < 0.5 ? "combo" : "slam";
      }
    }
    en.bossMove = move;
    en.telegraphT = isBoss
      ? (move === "volley" ? 48 : move === "slam" ? 42 : 36)
      : (move === "slam" ? 34 : 28);
    en.specialCd = isBoss
      ? (en.bossPhase >= 3 ? 110 : en.bossPhase >= 2 ? 150 : 190)
      : (en.bossPhase >= 3 ? 130 : 170);
    en.dir = this.player.x >= en.x ? 1 : -1;
    en.vx = 0;
    const tag = move === "charge" ? "!" : move === "slam" ? "SLAM" : move === "volley" ? "VOLLEY" : "COMBO";
    this.floater(en.x, en.y - en.h - 24, tag, "#ffb35c");
    this.impact(en.x, en.y - 20, "#ffb35c", 6);
    sfx.hitLight();
  }

  private resolveBossMove(en: Enemy, p: Player) {
    const move = en.bossMove;
    en.bossMove = null;
    if (!move) return;
    const isBoss = en.kind === "boss";
    en.dir = p.x >= en.x ? 1 : -1;

    if (move === "charge") {
      en.attackKind = "knee";
      en.attackT = 26;
      en.attackHit = false;
      en.cooldown = 22;
      en.vx = en.dir * (isBoss ? 11 : 8.5);
      en.anim = "knee";
      en.recoverT = 28;
      this.addShake(8);
      sfx.dash();
      return;
    }

    if (move === "slam") {
      en.attackKind = "kick";
      en.attackT = 20;
      en.attackHit = true; // slam uses AoE instead of hurtbox
      en.cooldown = 30;
      en.vy = -8;
      en.anim = "kick";
      en.recoverT = isBoss ? 36 : 30;
      this.addShake(isBoss ? 12 : 9);
      this.hitStop = Math.max(this.hitStop, 6);
      this.impactBurst(en.x, en.y - 10, "#ffb35c", "heavy");
      this.floater(en.x, en.y - en.h - 20, "SLAM", "#ff8a5c");
      sfx.hitHeavy();
      const radius = isBoss ? 120 : 95;
      const dmg = en.dmg * (isBoss ? 1.55 : 1.35) * (1 + (en.bossPhase - 1) * 0.1);
      if (!p.dead && Math.abs(p.x - en.x) < radius && Math.abs(p.y - en.y) < 90) {
        this.damagePlayer(dmg, en.dir);
      }
      // Soft chip nearby props
      for (const prop of this.props) {
        if (prop.dead) continue;
        if (Math.hypot(prop.cx - en.x, prop.cy - (en.y - 40)) < radius) {
          this.damageProp(prop, 18, 8, prop.cx >= en.x ? 1 : -1);
        }
      }
      return;
    }

    if (move === "volley") {
      en.attackKind = "punch";
      en.attackT = 18;
      en.attackHit = true;
      en.cooldown = 26;
      en.recoverT = 40;
      en.anim = "punch";
      this.floater(en.x, en.y - en.h - 20, "VOLLEY", "#ffe0a8");
      sfx.shoot();
      const shots = 3 + en.bossPhase;
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.12;
        const bx = en.x + en.dir * 28;
        const by = en.y - 52 + spread * 40;
        const shot = new EnemyShot(bx, by, en.dir, 8.2, en.dmg * 0.55, 75);
        shot.vy = spread * 6;
        this.enemyShots.push(shot);
      }
      this.addShake(6);
      return;
    }

    if (move === "combo") {
      en.attackKind = "punch";
      en.attackT = 16;
      en.attackHit = false;
      en.cooldown = 8;
      en.vx = en.dir * 4;
      en.anim = "punch";
      en.recoverT = 18;
      // Queue a follow-up via short specialCd so another basic lands soon
      en.specialCd = Math.max(en.specialCd, 70);
      this.addShake(5);
      sfx.punch();
    }
  }

  private updateRangedEnemy(en: Enemy, dist: number, def: (typeof ENEMIES)[EnemyKind]) {
    const p = this.player;
    const preferMin = def.preferMin ?? 170;
    const preferMax = def.preferMax ?? 290;
    let spd = en.speed;
    if (this.focusT > 0 || this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0) {
      spd *= this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0
        ? (this.finisherSlowT > 0 ? 0.28 : this.killSlowT > 0 ? 0.35 : 0.4)
        : FOCUS_ENEMY_SPEED;
    }
    if (dist < preferMin - 20) {
      en.vx = -en.dir * spd * 1.15;
      en.anim = "run";
    } else if (dist > preferMax) {
      en.vx = en.dir * spd;
      en.anim = "run";
    } else {
      en.vx *= 0.55;
      en.anim = "idle";
    }
    // Close pressure: brief melee
    if (dist < (def.meleeRange + 8) && en.attackT === 0 && en.cooldown === 0 && Math.random() < 0.35) {
      en.attackKind = "punch";
      en.attackT = def.attackFrames;
      en.attackHit = false;
      en.cooldown = def.attackCd;
      en.anim = "punch";
      return;
    }
    if (en.fireCd === 0 && dist >= preferMin - 40 && dist <= preferMax + 80 && Math.abs(p.y - en.y) < 90) {
      en.fireCd = Math.max(28, Math.round((def.fireCd ?? 55) / en.reaction));
      const bx = en.x + en.dir * 22;
      const by = en.y - 48;
      this.enemyShots.push(new EnemyShot(
        bx,
        by,
        en.dir,
        def.shotSpeed ?? 7.5,
        (def.shotDmg ?? 7) * en.aggression * 0.85 + (def.shotDmg ?? 7) * 0.4,
        def.shotRange ?? 70,
      ));
      sfx.shoot();
      this.impact(bx, by, "#ffe0a8", 4);
    }
  }

  private announceFinisherReady(combo: number) {
    if (combo >= FINISHER_ULT && this.lastFinisherAnnounce < FINISHER_ULT) {
      this.lastFinisherAnnounce = FINISHER_ULT;
      this.floater(this.player.x, this.player.y - 118, "FINISHER READY", "#ffffff");
      this.pushHud();
    } else if (combo >= FINISHER_BASIC && this.lastFinisherAnnounce < FINISHER_BASIC) {
      this.lastFinisherAnnounce = FINISHER_BASIC;
      this.floater(this.player.x, this.player.y - 118, "FINISHER READY", "#ffffff");
      this.pushHud();
    }
  }

  private bulletIncoming(en: Enemy) {
    return this.player.x !== en.x && Math.abs(this.player.x - en.x) < 380 && (this.keys[" "] || this.bullets.some((b) => Math.abs(b.x - en.x) < 260 && Math.sign(b.vx) === Math.sign(en.x - b.x)));
  }

  private pushHud() {
    const boss = this.enemies.find((e) => (e.kind === "boss" || e.kind === "miniboss") && !e.dead);
    this.cb.onHud({
      hp: Math.max(0, Math.round(this.player.hp)),
      maxHp: this.player.maxHp,
      ammo: this.player.ammo,
      maxAmmo: this.player.maxAmmo,
      reserve: this.player.loadout[this.player.weaponId].reserve,
      reloading: this.player.reloadT > 0,
      level: this.level.id,
      levelName: this.level.name,
      score: this.score,
      enemiesLeft: this.remainingEnemyCount(),
      weapon: `${WEAPONS[this.player.weaponId].name} / Fists`,
      wave: this.waveIndex + 1,
      waves: this.level.waves.length,
      bossHp: boss ? Math.round((boss.hp / boss.maxHp) * 100) : null,
      bossPhase: boss ? boss.bossPhase : null,
      combo: this.player.combo,
      special: Math.round(this.specialMeter),
      specialMax: SPECIAL_MAX,
      focusActive: this.focusT > 0,
      counterReady: this.counterT > 0 && !!this.counterTarget && !this.counterTarget.dead,
      finisherReady: this.currentFinisherTier() > 0,
      finisherTier: this.currentFinisherTier(),
      secretsFound: this.secretFlags.filter(Boolean).length,
      secretsTotal: (this.level.secrets ?? []).length,
      objective: this.level.objective.label,
      objectiveProgress: this.objectiveProgressText(),
      arenaTimer: this.arenaActive ? Math.max(0, Math.ceil(this.arenaTimerT / 60)) : null,
      bonusObjective: this.level.objective.bonus?.label ?? null,
      bonusDone: this.bonusDone,
    });
  }

  // ---- render ----
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.paused) {
      if (this.hitStop > 0) this.hitStop--;
      else this.update();
    }
    this.render();
  };

  private render() {
    const g = this.ctx;
    const cam = Math.round(this.camera);
    g.save();
    g.clearRect(0, 0, VIEW_W, VIEW_H);

    // sky
    const sky = g.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, "#6cc4f5");
    sky.addColorStop(0.45, "#a9dcf8");
    sky.addColorStop(0.8, "#e7f6ff");
    sky.addColorStop(1, "#f6fbe9");
    g.fillStyle = sky;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    // sun glow
    const sun = g.createRadialGradient(760, 110, 10, 760, 110, 220);
    sun.addColorStop(0, "rgba(255,248,214,0.95)");
    sun.addColorStop(1, "rgba(255,248,214,0)");
    g.fillStyle = sun;
    g.fillRect(500, -110, 520, 460);

    if (this.shake > 0.3) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    this.drawMountains(cam);
    this.drawClouds(cam);
    this.drawHills(cam);
    this.drawGround(cam);
    this.drawScenery(cam);

    g.save();
    g.translate(-cam, 0);
    this.drawPlatforms();
    this.drawObstacles();
    this.drawProps();
    this.drawCheckpoints();
    this.drawSecretClues();
    this.drawExtractZone();
    this.drawPickups();
    for (const en of this.enemies) {
      const tint =
        en.kind === "fast" ? (["#f7f7f7", "#d9d9d9", "#bdbdbd"] as const)
        : en.kind === "brute" ? (["#f4f1ea", "#d8d0c4", "#b8ae9e"] as const)
        : en.kind === "shielded" ? (["#eef2f7", "#c5ced9", "#8e9aab"] as const)
        : en.kind === "ranged" ? (["#faf6ee", "#e2d8c4", "#b9a88a"] as const)
        : en.kind === "dodger" ? (["#f5f5f7", "#cacad2", "#9a9aa8"] as const)
        : en.kind === "elite" ? (["#fffaf0", "#ebe2d2", "#d2c4ae"] as const)
        : en.kind === "miniboss" ? (["#fff8ef", "#e8dcc8", "#cbb89a"] as const)
        : (["#fdfdfb", "#e6e2d8", "#cfc9bb"] as const);
      this.drawFighter(en, tint[0], tint[1], tint[2]);
    }
    this.drawFighter(this.player, "#2b2f3a", "#1b1e26", "#3d4353");
    this.drawBullets();
    this.drawEnemyShots();
    this.drawParticles();
    this.drawFloaters();
    g.restore();

    // vignette / warm light
    const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 640);
    vg.addColorStop(0, "rgba(255,240,200,0)");
    vg.addColorStop(1, "rgba(80,110,90,0.16)");
    g.fillStyle = vg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.focusT > 0) {
      const pulse = 0.1 + 0.06 * Math.sin(this.time * 0.18);
      const fg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 80, VIEW_W / 2, VIEW_H / 2, 520);
      fg.addColorStop(0, `rgba(255,255,255,${0.04 + pulse * 0.35})`);
      fg.addColorStop(0.55, "rgba(0,0,0,0)");
      fg.addColorStop(1, `rgba(0,0,0,${0.28 + pulse})`);
      g.fillStyle = fg;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.strokeStyle = `rgba(255,255,255,${0.18 + pulse})`;
      g.lineWidth = 2;
      g.strokeRect(10, 10, VIEW_W - 20, VIEW_H - 20);
    } else if (this.perfectSlowT > 0 || this.finisherSlowT > 0 || this.killSlowT > 0) {
      const t = this.finisherSlowT > 0
        ? this.finisherSlowT / FINISHER_SLOW_ULT
        : this.killSlowT > 0
          ? this.killSlowT / KILL_SLOW_FRAMES
          : this.perfectSlowT / PERFECT_SLOW_FRAMES;
      const fg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 60, VIEW_W / 2, VIEW_H / 2, 480);
      fg.addColorStop(0, `rgba(255,255,255,${(this.finisherSlowT > 0 ? 0.18 : this.killSlowT > 0 ? 0.14 : 0.12) * t})`);
      fg.addColorStop(1, `rgba(0,0,0,${(this.finisherSlowT > 0 ? 0.32 : this.killSlowT > 0 ? 0.26 : 0.22) * t})`);
      g.fillStyle = fg;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.screenFlash > 0.01) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.35, this.screenFlash)})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.level.hint && this.time < 420) {
      g.globalAlpha = this.time > 340 ? (420 - this.time) / 80 : 1;
      g.fillStyle = "rgba(20,30,25,0.55)";
      g.beginPath();
      const tw = 700;
      g.roundRect(VIEW_W / 2 - tw / 2, 470, tw, 44, 22);
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = "600 15px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(this.level.hint, VIEW_W / 2, 497);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  private drawMountains(cam: number) {
    const g = this.ctx;
    const off = cam * 0.15;
    for (const m of this.mountains) {
      const x = m.x - off;
      if (x < -m.w || x > VIEW_W + m.w) continue;
      const grad = g.createLinearGradient(0, GROUND_Y - m.h, 0, GROUND_Y);
      grad.addColorStop(0, "#bcd8ea");
      grad.addColorStop(1, "#9fc3dd");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - m.w / 2, GROUND_Y - 40);
      g.quadraticCurveTo(x - m.w * 0.2, GROUND_Y - m.h, x, GROUND_Y - m.h);
      g.quadraticCurveTo(x + m.w * 0.25, GROUND_Y - m.h * 0.9, x + m.w / 2, GROUND_Y - 40);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath();
      g.moveTo(x - 26, GROUND_Y - m.h + 34);
      g.quadraticCurveTo(x, GROUND_Y - m.h, x + 24, GROUND_Y - m.h + 34);
      g.quadraticCurveTo(x, GROUND_Y - m.h + 18, x - 26, GROUND_Y - m.h + 34);
      g.fill();
    }
  }

  private drawClouds(cam: number) {
    const g = this.ctx;
    for (const c of this.clouds) {
      const x = c.x - cam * 0.25 - this.time * c.sp * 0.2;
      const px = ((x % (this.level.width + 600)) + this.level.width + 600) % (this.level.width + 600) - 300;
      if (px < -260 || px > VIEW_W + 260) continue;
      g.save();
      g.globalAlpha = 0.9;
      g.fillStyle = "#ffffff";
      const s = c.s;
      g.beginPath();
      g.ellipse(px, c.y, 52 * s, 26 * s, 0, 0, Math.PI * 2);
      g.ellipse(px + 42 * s, c.y + 6 * s, 38 * s, 20 * s, 0, 0, Math.PI * 2);
      g.ellipse(px - 44 * s, c.y + 8 * s, 34 * s, 18 * s, 0, 0, Math.PI * 2);
      g.ellipse(px + 8 * s, c.y - 18 * s, 34 * s, 22 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  private drawHills(cam: number) {
    const g = this.ctx;
    const off = cam * 0.45;
    for (const h of this.hills) {
      const x = h.x - off;
      if (x < -h.r * 2 || x > VIEW_W + h.r * 2) continue;
      g.fillStyle = h.c;
      g.beginPath();
      g.ellipse(x, GROUND_Y + 20, h.r, h.r * 0.62, 0, Math.PI, Math.PI * 2);
      g.fill();
    }
  }

  private drawGround(cam: number) {
    const g = this.ctx;
    const grad = g.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
    grad.addColorStop(0, "#63c95f");
    grad.addColorStop(0.25, "#4fb856");
    grad.addColorStop(1, "#2f8c45");
    g.fillStyle = grad;
    g.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.fillRect(0, GROUND_Y, VIEW_W, 5);
    // grass blades
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const bx = ((i * 37 - cam) % VIEW_W + VIEW_W) % VIEW_W;
      const by = GROUND_Y + 8 + ((i * 53) % 60);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + 3, by - 8);
      g.stroke();
    }
  }

  private drawScenery(cam: number) {
    const g = this.ctx;
    // houses (mid parallax)
    for (const h of this.houses) {
      const x = h.x - cam * 0.8;
      if (x < -200 || x > VIEW_W + 200) continue;
      const s = h.s;
      const w = 120 * s, hh = 90 * s;
      g.fillStyle = "rgba(30,60,40,0.12)";
      g.beginPath(); g.ellipse(x + w / 2, GROUND_Y + 6, w * 0.6, 10, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = h.hue > 0.5 ? "#fff6e3" : "#ffeccd";
      g.beginPath(); g.roundRect(x, GROUND_Y - hh, w, hh, 8); g.fill();
      g.fillStyle = h.hue > 0.5 ? "#e98a72" : "#f0a15f";
      g.beginPath();
      g.moveTo(x - 10, GROUND_Y - hh + 4);
      g.lineTo(x + w / 2, GROUND_Y - hh - 40 * s);
      g.lineTo(x + w + 10, GROUND_Y - hh + 4);
      g.closePath(); g.fill();
      g.fillStyle = "#bfe3f7";
      g.beginPath(); g.roundRect(x + 18 * s, GROUND_Y - hh + 22 * s, 26 * s, 24 * s, 5); g.fill();
      g.beginPath(); g.roundRect(x + 70 * s, GROUND_Y - hh + 22 * s, 26 * s, 24 * s, 5); g.fill();
      g.fillStyle = "#a97c50";
      g.beginPath(); g.roundRect(x + w / 2 - 14 * s, GROUND_Y - 44 * s, 28 * s, 44 * s, 6); g.fill();
    }
    // rocks
    for (const r of this.rocks) {
      const x = r.x - cam;
      if (x < -80 || x > VIEW_W + 80) continue;
      g.fillStyle = "rgba(30,60,40,0.12)";
      g.beginPath(); g.ellipse(x, GROUND_Y + 4, 26 * r.s, 7, 0, 0, Math.PI * 2); g.fill();
      const rg = g.createLinearGradient(0, GROUND_Y - 30 * r.s, 0, GROUND_Y);
      rg.addColorStop(0, "#cfd6dd"); rg.addColorStop(1, "#9fa9b4");
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(x, GROUND_Y - 8 * r.s, 24 * r.s, 16 * r.s, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.fillRect(x - 24 * r.s, GROUND_Y - 8 * r.s, 48 * r.s, 8 * r.s);
    }
    // plants
    for (const pl of this.plants) {
      const x = pl.x - cam;
      if (x < -30 || x > VIEW_W + 30) continue;
      g.strokeStyle = "#3f9e52"; g.lineWidth = 3; g.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(x + i * 4, GROUND_Y);
        g.quadraticCurveTo(x + i * 10, GROUND_Y - 14 * pl.s, x + i * 16, GROUND_Y - 20 * pl.s);
        g.stroke();
      }
      if (pl.s > 1.1) { g.fillStyle = "#ffd6e7"; g.beginPath(); g.arc(x + 16, GROUND_Y - 22 * pl.s, 4, 0, Math.PI * 2); g.fill(); }
    }
    // trees
    for (const t of this.trees) {
      const x = t.x - cam * 0.88;
      if (x < -140 || x > VIEW_W + 140) continue;
      const s = t.s;
      g.fillStyle = "rgba(30,60,40,0.14)";
      g.beginPath(); g.ellipse(x, GROUND_Y + 6, 44 * s, 10 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#a9754e";
      g.beginPath(); g.roundRect(x - 7 * s, GROUND_Y - 74 * s, 14 * s, 74 * s, 6 * s); g.fill();
      const cg = g.createRadialGradient(x - 14 * s, GROUND_Y - 116 * s, 6, x, GROUND_Y - 100 * s, 66 * s);
      cg.addColorStop(0, "#8fe08a"); cg.addColorStop(1, "#3fa257");
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, GROUND_Y - 104 * s, 46 * s, 38 * s, 0, 0, Math.PI * 2);
      g.ellipse(x - 32 * s, GROUND_Y - 84 * s, 30 * s, 24 * s, 0, 0, Math.PI * 2);
      g.ellipse(x + 32 * s, GROUND_Y - 86 * s, 32 * s, 26 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawPlatforms() {
    const g = this.ctx;
    for (const p of this.level.platforms) {
      g.fillStyle = "rgba(30,60,40,0.14)";
      g.beginPath(); g.ellipse(p.x + p.w / 2, GROUND_Y + 4, p.w * 0.4, 10, 0, 0, Math.PI * 2); g.fill();
      const grad = g.createLinearGradient(0, p.y, 0, p.y + 34);
      grad.addColorStop(0, "#6fd06c"); grad.addColorStop(0.3, "#4bb45a"); grad.addColorStop(1, "#b98f63");
      g.fillStyle = grad;
      g.beginPath(); g.roundRect(p.x, p.y, p.w, 34, 12); g.fill();
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.beginPath(); g.roundRect(p.x + 4, p.y + 2, p.w - 8, 5, 4); g.fill();
    }
  }

  private drawObstacles() {
    const g = this.ctx;
    for (const o of this.level.obstacles) {
      g.fillStyle = "rgba(30,60,40,0.16)";
      g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + o.h + 4, o.w * 0.7, 9, 0, 0, Math.PI * 2); g.fill();
      const grad = g.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
      grad.addColorStop(0, "#e5dccb"); grad.addColorStop(1, "#c2b39a");
      g.fillStyle = grad;
      g.beginPath(); g.roundRect(o.x, o.y, o.w, o.h, 10); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 2;
      g.beginPath(); g.roundRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8, 8); g.stroke();
    }
  }

  private drawProps() {
    const g = this.ctx;
    for (const prop of this.props) {
      if (prop.dead) continue;
      const { x, y, w, h, kind } = prop;
      g.fillStyle = "rgba(30,60,40,0.15)";
      g.beginPath(); g.ellipse(x + w / 2, y + h + 3, w * 0.55, 7, 0, 0, Math.PI * 2); g.fill();

      if (kind === "barrel" || kind === "explosive") {
        const grad = g.createLinearGradient(x, y, x + w, y);
        if (kind === "explosive") {
          grad.addColorStop(0, "#c45a3a");
          grad.addColorStop(0.5, "#e07848");
          grad.addColorStop(1, "#a84830");
        } else {
          grad.addColorStop(0, "#8a6b45");
          grad.addColorStop(0.5, "#b08955");
          grad.addColorStop(1, "#6e5336");
        }
        g.fillStyle = grad;
        g.beginPath(); g.roundRect(x, y, w, h, w * 0.45); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.25)";
        g.lineWidth = 2;
        g.beginPath(); g.roundRect(x + 5, y + 8, w - 10, h - 16, 8); g.stroke();
        if (kind === "explosive") {
          g.fillStyle = "#2a2a2a";
          g.fillRect(x + w * 0.42, y - 6, 5, 8);
          g.fillStyle = "#ffd76a";
          g.beginPath(); g.arc(x + w * 0.5, y - 8, 3, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === "barrier" || kind === "door") {
        const grad = g.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, kind === "door" ? "#d8c4a0" : "#cfc6b4");
        grad.addColorStop(1, kind === "door" ? "#9a8160" : "#9e9584");
        g.fillStyle = grad;
        g.beginPath(); g.roundRect(x, y, w, h, 4); g.fill();
        g.strokeStyle = "rgba(40,40,40,0.35)";
        g.lineWidth = 2;
        g.strokeRect(x + 3, y + 6, w - 6, h - 12);
        if (kind === "door") {
          g.fillStyle = "#5a5044";
          g.beginPath(); g.arc(x + w - 8, y + h * 0.55, 3, 0, Math.PI * 2); g.fill();
        }
      } else {
        // crate / cover
        const grad = g.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, kind === "cover" ? "#c4b089" : "#d7c49a");
        grad.addColorStop(1, kind === "cover" ? "#8f7a52" : "#a89060");
        g.fillStyle = grad;
        g.beginPath(); g.roundRect(x, y, w, h, 6); g.fill();
        g.strokeStyle = "rgba(60,40,20,0.35)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x + 4, y + h / 2); g.lineTo(x + w - 4, y + h / 2);
        g.moveTo(x + w / 2, y + 4); g.lineTo(x + w / 2, y + h - 4);
        g.stroke();
      }

      if (prop.hitFlash > 0) {
        g.globalAlpha = Math.min(0.55, prop.hitFlash / 8);
        g.fillStyle = "#ffffff";
        g.beginPath(); g.roundRect(x, y, w, h, 6); g.fill();
        g.globalAlpha = 1;
      }
      // HP pip for tougher props
      if (prop.maxHp >= 50 && prop.hp < prop.maxHp) {
        const bw = w;
        const by = y - 8;
        g.fillStyle = "rgba(20,30,25,0.4)";
        g.beginPath(); g.roundRect(x, by, bw, 4, 2); g.fill();
        g.fillStyle = "#ffffff";
        g.beginPath(); g.roundRect(x, by, bw * (prop.hp / prop.maxHp), 4, 2); g.fill();
      }
    }
  }

  private drawCheckpoints() {
    const g = this.ctx;
    this.level.checkpoints.forEach((cp, i) => {
      const on = this.checkpointFlags[i];
      g.save();
      g.strokeStyle = on ? "rgba(40,40,40,0.85)" : "rgba(80,80,80,0.45)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cp.x, GROUND_Y);
      g.lineTo(cp.x, GROUND_Y - 70);
      g.stroke();
      g.fillStyle = on ? "rgba(20,20,20,0.9)" : "rgba(120,120,120,0.55)";
      g.beginPath();
      g.moveTo(cp.x, GROUND_Y - 70);
      g.lineTo(cp.x + 34, GROUND_Y - 58);
      g.lineTo(cp.x, GROUND_Y - 46);
      g.closePath();
      g.fill();
      g.restore();
    });
    if (this.lockX != null && this.enemies.some((e) => !e.dead)) {
      g.fillStyle = "rgba(20,20,20,0.18)";
      g.fillRect(this.lockX - 6, GROUND_Y - 140, 12, 140);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(this.lockX - 2, GROUND_Y - 140, 4, 140);
    }
  }

  /** Faint shimmer markers — subtle only, never a map icon. */
  private drawSecretClues() {
    const secrets = this.level.secrets;
    if (!secrets?.length) return;
    const g = this.ctx;
    for (let i = 0; i < secrets.length; i++) {
      if (this.secretFlags[i]) continue;
      const s = secrets[i]!;
      const pulse = 0.12 + 0.08 * Math.sin(this.time * 0.08 + i);
      g.fillStyle = `rgba(255, 235, 180, ${pulse})`;
      g.beginPath();
      g.ellipse(s.clueX, s.clueY, 10, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(20, 30, 40, ${0.08 + pulse * 0.35})`;
      g.beginPath();
      g.roundRect(s.x + 8, s.y + 10, s.w - 16, Math.min(40, s.h - 20), 8);
      g.fill();
    }
  }

  private drawExtractZone() {
    const obj = this.level.objective;
    if (obj.type !== "checkpoint" || this.extractReached) return;
    const x = obj.extractX ?? this.level.width - 200;
    const g = this.ctx;
    const pulse = 0.2 + 0.15 * Math.sin(this.time * 0.1);
    g.fillStyle = `rgba(180, 255, 210, ${pulse * 0.35})`;
    g.fillRect(x - 20, GROUND_Y - 120, 40, 120);
    g.strokeStyle = `rgba(180, 255, 210, ${0.4 + pulse})`;
    g.lineWidth = 2;
    g.strokeRect(x - 20, GROUND_Y - 120, 40, 120);
    g.fillStyle = `rgba(220, 255, 230, ${0.5 + pulse * 0.4})`;
    g.font = "700 12px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("EXTRACT", x, GROUND_Y - 130);
  }

  private drawPickups() {
    const g = this.ctx;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const y = p.y + Math.sin(p.bob) * 5;
      const isWeapon = p.kind === "weapon";
      const isAmmo = p.kind === "ammo";
      g.save();
      g.shadowColor = isAmmo ? "rgba(90,170,255,0.7)" : isWeapon ? "rgba(255,220,120,0.75)" : "rgba(110,220,140,0.7)";
      g.shadowBlur = 16;
      g.fillStyle = isAmmo ? "#5aa9ff" : isWeapon ? "#ffd76a" : "#63d98a";
      g.beginPath(); g.roundRect(p.x - 14, y - 14, 28, 28, 9); g.fill();
      g.restore();
      g.fillStyle = "#ffffff";
      g.font = "700 11px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      const label = isAmmo ? "A" : isWeapon ? (p.weapon === "shotgun" ? "SG" : p.weapon === "smg" ? "SMG" : p.weapon === "heavy" ? "HV" : "P") : "+";
      g.fillText(label, p.x, y + 1);
      g.textBaseline = "alphabetic";
    }
  }

  private drawBullets() {
    const g = this.ctx;
    for (const b of this.bullets) {
      g.strokeStyle = "rgba(255,214,120,0.5)";
      g.lineWidth = 3; g.lineCap = "round";
      const t0 = b.trail[0];
      if (t0) {
        g.beginPath();
        g.moveTo(t0.x, t0.y);
        for (const t of b.trail) g.lineTo(t.x, t.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.save();
      g.shadowColor = b.color; g.shadowBlur = 12;
      g.fillStyle = b.color;
      g.beginPath(); g.ellipse(b.x, b.y, 6, 3.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  private drawEnemyShots() {
    const g = this.ctx;
    for (const s of this.enemyShots) {
      g.fillStyle = "#f0e2c0";
      g.beginPath(); g.ellipse(s.x, s.y, 7, 3.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255, 200, 120, 0.45)";
      g.beginPath(); g.ellipse(s.x - Math.sign(s.vx) * 6, s.y, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
    }
  }

  private drawParticles() {
    const g = this.ctx;
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === "ring") {
        g.globalAlpha = a * 0.7;
        g.strokeStyle = p.color;
        g.lineWidth = 2 + (1 - a) * 2;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1.1 - a * 0.55), 0, Math.PI * 2);
        g.stroke();
      } else {
        g.globalAlpha = a;
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  private drawFloaters() {
    const g = this.ctx;
    g.textAlign = "center";
    for (const f of this.floaters) {
      g.globalAlpha = Math.min(1, f.life / 25);
      g.font = "700 16px ui-sans-serif, system-ui, sans-serif";
      g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,0.35)";
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }

  private drawFighter(f: Fighter, body: string, dark: string, accent: string) {
    const g = this.ctx;
    const isPlayer = f instanceof Player;
    const en = f as Enemy;
    const scale = !isPlayer && en.kind === "boss" ? 1.5
      : !isPlayer && (en.kind === "brute" || en.kind === "miniboss") ? (en.kind === "miniboss" ? 1.28 : 1.15)
      : !isPlayer && en.kind === "shielded" ? 1.08
      : !isPlayer && (en.kind === "fast" || en.kind === "dodger") ? 0.9
      : 1;

    // shadow
    g.fillStyle = "rgba(30,60,40,0.18)";
    g.beginPath();
    g.ellipse(f.x, GROUND_Y + 4, 26 * scale, 8, 0, 0, Math.PI * 2);
    g.fill();

    // Boss telegraph warning ring (dodge window cue)
    if (!isPlayer && en.telegraphT > 0) {
      const pulse = 0.35 + 0.35 * Math.sin(this.time * 0.35);
      const r = 40 + (en.bossMove === "slam" ? 50 : 20) * (1 - en.telegraphT / 50);
      g.strokeStyle = `rgba(255, 140, 80, ${pulse})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(f.x, GROUND_Y + 2, r, 12, 0, 0, Math.PI * 2);
      g.stroke();
    }

    g.save();
    g.translate(f.x, f.y);
    if (f.dead) {
      const t = Math.min(1, f.deathT / 30);
      g.translate(0, t * 26 * scale);
      g.rotate((f.dir === 1 ? 1 : -1) * t * 1.35);
      g.globalAlpha = 1 - Math.max(0, (f.deathT - 55) / 35);
    }
    if (f.hurtT > 0 && !f.dead) g.translate((Math.random() - 0.5) * 3, 0);
    if (isPlayer && (f as Player).invuln > 0 && Math.floor(this.time / 4) % 2 === 0) g.globalAlpha = 0.55;
    if (f.flashT > 0 && !f.dead) g.globalAlpha = Math.min(g.globalAlpha, 0.55 + (f.flashT / 12) * 0.45);
    g.scale(f.dir * scale, scale);

    const walk = Math.sin(f.phase * 2);
    const run = f.anim === "run" ? walk : 0;
    const airborne = !f.onGround && !f.dead;
    const finisherAnim = f.anim === "finisher";
    const atkDenom = finisherAnim ? (f.finisherTier >= 2 ? 30 : 24) : 20;
    const atk = f.attackT > 0 ? 1 - f.attackT / atkDenom : 0;

    const H = f.h;
    const hipY = -H * 0.46;
    const headY = -H * 0.86;

    // legs
    g.strokeStyle = dark;
    g.lineWidth = 11; g.lineCap = "round";
    const legSwing = airborne ? 0.5 : run * 0.6;
    const kick = f.anim === "kick" ? Math.sin(atk * Math.PI) * 1.5 : 0;
    const knee = f.anim === "knee" ? Math.sin(atk * Math.PI) * 1.2 : 0;
    const finisherKick = finisherAnim ? Math.sin(Math.min(1, atk * 1.15) * Math.PI) * (f.finisherTier >= 2 ? 2.1 : 1.7) : 0;
    g.beginPath();
    g.moveTo(0, hipY);
    g.lineTo(Math.sin(legSwing) * 14, hipY + H * 0.26);
    g.lineTo(Math.sin(legSwing) * 20, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(0, hipY);
    if (finisherKick) {
      g.lineTo(20 + finisherKick * 12, hipY + 4 - finisherKick * 16);
      g.lineTo(42 + finisherKick * 22, hipY - 2 - finisherKick * 20);
    } else if (kick) {
      g.lineTo(16 + kick * 10, hipY + 8 - kick * 12);
      g.lineTo(34 + kick * 18, hipY + 4 - kick * 16);
    } else if (knee) {
      g.lineTo(14 + knee * 8, hipY + 6 - knee * 14);
      g.lineTo(6, hipY + 16 - knee * 10);
    } else {
      g.lineTo(-Math.sin(legSwing) * 14, hipY + H * 0.26);
      g.lineTo(-Math.sin(legSwing) * 20, 0);
    }
    g.stroke();

    // torso
    const torsoG = g.createLinearGradient(0, headY, 0, hipY);
    torsoG.addColorStop(0, accent);
    torsoG.addColorStop(1, body);
    g.fillStyle = torsoG;
    g.beginPath();
    g.roundRect(-14, headY + 10, 28, hipY - headY - 4, 12);
    g.fill();
    // belt
    g.fillStyle = dark;
    g.beginPath(); g.roundRect(-14, hipY - 10, 28, 8, 4); g.fill();

    // head
    g.fillStyle = isPlayer ? "#f0c9a4" : "#f3d7bb";
    g.beginPath(); g.arc(2, headY - 4, 13, 0, Math.PI * 2); g.fill();
    // hair / mask
    g.fillStyle = isPlayer ? dark : "#efeae0";
    g.beginPath(); g.arc(2, headY - 8, 13, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(-11, headY - 9, 26, 4);
    // eye
    g.fillStyle = "#22252c";
    g.beginPath(); g.arc(9, headY - 3, 2.1, 0, Math.PI * 2); g.fill();
    if (!isPlayer && (en.kind === "elite" || en.kind === "boss" || en.kind === "miniboss")) {
      g.fillStyle = en.kind === "boss" ? "#ff8a5c" : en.kind === "miniboss" ? "#ffb04d" : "#ffce5c";
      g.beginPath(); g.roundRect(-13, headY - 16, 28, 6, 3); g.fill();
    }
    if (!isPlayer && en.kind === "fast") {
      g.fillStyle = "#9aa0a8";
      g.beginPath(); g.roundRect(-10, headY - 14, 22, 4, 2); g.fill();
    }
    if (!isPlayer && en.kind === "dodger") {
      g.fillStyle = "#7a8494";
      g.beginPath(); g.roundRect(-11, headY - 15, 24, 5, 2); g.fill();
    }
    if (!isPlayer && en.kind === "ranged") {
      g.fillStyle = "#c4a574";
      g.beginPath(); g.roundRect(-9, headY - 14, 20, 4, 2); g.fill();
    }
    if (!isPlayer && en.kind === "shielded" && en.shieldHp > 0 && en.shieldBreakT <= 0) {
      g.fillStyle = "rgba(180, 195, 215, 0.85)";
      g.beginPath();
      g.roundRect(10, headY + 8, 14, 36, 4);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.55)";
      g.lineWidth = 2;
      g.stroke();
    }

    // arms
    g.strokeStyle = accent; g.lineWidth = 9;
    const shoulderY = headY + 20;
    const punching = f.anim === "punch" ? Math.sin(atk * Math.PI) : 0;
    const finishing = finisherAnim ? Math.sin(Math.min(1, atk * 1.2) * Math.PI) : 0;
    // back arm
    g.beginPath();
    g.moveTo(-4, shoulderY);
    if (finishing) {
      g.lineTo(-18 - finishing * 8, shoulderY + 6);
      g.lineTo(-28 - finishing * 14, shoulderY - 4 - finishing * 10);
    } else {
      g.lineTo(-12 - run * 8, shoulderY + 18);
      g.lineTo(-10 - run * 12, shoulderY + 34);
    }
    g.stroke();
    // front arm (gun for player)
    g.beginPath();
    g.moveTo(4, shoulderY);
    if (finishing) {
      g.lineTo(22 + finishing * 16, shoulderY - 2);
      g.lineTo(44 + finishing * 28, shoulderY - 8 - finishing * 6);
    } else if (isPlayer && (f as Player).shootCd > 5) {
      g.lineTo(18, shoulderY + 4);
      g.lineTo(30, shoulderY + 4);
    } else if (punching) {
      g.lineTo(16 + punching * 10, shoulderY + 4);
      g.lineTo(30 + punching * 18, shoulderY + 2);
    } else {
      g.lineTo(12 + run * 8, shoulderY + 16);
      g.lineTo(14 + run * 10, shoulderY + 32);
    }
    g.stroke();
    if (finishing > 0.35) {
      g.fillStyle = `rgba(255,255,255,${0.25 + finishing * 0.35})`;
      g.beginPath();
      g.arc(36 + finishing * 20, shoulderY - 6, 10 + finishing * 8, 0, Math.PI * 2);
      g.fill();
    }

    if (isPlayer) {
      const shooting = (f as Player).shootCd > 5;
      g.fillStyle = "#3a3f4b";
      const gx = shooting ? 32 : 16;
      const gy = shooting ? shoulderY + 4 : shoulderY + 32;
      g.beginPath(); g.roundRect(gx - 4, gy - 5, 20, 8, 3); g.fill();
      g.beginPath(); g.roundRect(gx - 2, gy + 1, 7, 10, 3); g.fill();
      if ((f as Player).shootCd > 8) {
        g.fillStyle = "rgba(255,214,120,0.95)";
        g.beginPath(); g.arc(gx + 20, gy - 1, 8, 0, Math.PI * 2); g.fill();
      }
    }

    if (f.flashT > 0 && !f.dead) {
      g.globalAlpha = Math.min(0.75, f.flashT / 10);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.roundRect(-16, headY + 6, 32, hipY - headY + 4, 12);
      g.fill();
      g.beginPath(); g.arc(2, headY - 4, 14, 0, Math.PI * 2); g.fill();
    }

    g.restore();

    // health bar above enemies
    if (!isPlayer && !f.dead) {
      const w = 46 * scale;
      const y = f.y - f.h * scale - 16;
      g.fillStyle = "rgba(20,30,25,0.35)";
      g.beginPath(); g.roundRect(f.x - w / 2, y, w, 6, 3); g.fill();
      const pct = Math.max(0, f.hp / f.maxHp);
      g.fillStyle = en.kind === "boss" ? "#ff7a5c" : en.huntTarget ? "#ffb04d" : en.kind === "elite" ? "#ffb04d" : "#ffffff";
      g.beginPath(); g.roundRect(f.x - w / 2, y, w * pct, 6, 3); g.fill();
      if (en.huntTarget) {
        g.fillStyle = "#ffb04d";
        g.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText("HUNT", f.x, y - 6);
      }
    }
  }
}

export { LEVELS };
