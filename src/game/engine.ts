import { LEVELS, GROUND_Y, type LevelDef, type EnemyKind } from "./levels";
import { sfx } from "./audio";

export const VIEW_W = 960;
export const VIEW_H = 600;
const GRAVITY = 0.9;

export type HudState = {
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  level: number;
  levelName: string;
  score: number;
  enemiesLeft: number;
  weapon: string;
  wave: number;
  waves: number;
  bossHp: number | null;
  combo: number;
};

export type GameCallbacks = {
  onHud: (s: HudState) => void;
  onLevelComplete: (score: number) => void;
  onGameOver: (score: number) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number; grav: number;
};

type Floater = { x: number; y: number; life: number; text: string; color: string };

class Bullet {
  x: number; y: number; vx: number; dead = false; trail: { x: number; y: number }[] = [];
  constructor(x: number, y: number, dir: number) {
    this.x = x; this.y = y; this.vx = 15 * dir;
  }
  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
    this.x += this.vx;
  }
  get rect(): Rect { return { x: this.x - 5, y: this.y - 3, w: 10, h: 6 }; }
}

type Anim = "idle" | "run" | "jump" | "punch" | "kick" | "knee" | "hurt" | "dead" | "dash" | "block";

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
  invuln = 0;
  dead = false;
  deathT = 0;
  attackT = 0;
  attackKind: "punch" | "kick" | "knee" = "punch";
  attackHit = false;
  cooldown = 0;

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
    if (this.attackKind === "kick") return { reach: 56, y: 46, h: 26 };
    if (this.attackKind === "knee") return { reach: 40, y: 40, h: 24 };
    return { reach: 48, y: 56, h: 22 };
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
  constructor(x: number) { super(x, GROUND_Y, 120); }
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; dmg: number; w: number; h: number; score: number }> = {
  grunt: { hp: 45, speed: 1.6, dmg: 6, w: 32, h: 74, score: 100 },
  brute: { hp: 90, speed: 1.4, dmg: 10, w: 40, h: 84, score: 200 },
  elite: { hp: 140, speed: 2.2, dmg: 13, w: 36, h: 80, score: 350 },
  boss: { hp: 900, speed: 2.0, dmg: 18, w: 56, h: 116, score: 2000 },
};

class Enemy extends Fighter {
  kind: EnemyKind;
  speed: number; dmg: number; score: number;
  thinkT = 0; dodgeT = 0; aggression: number; reaction: number;
  bossPhase = 1; specialT = 0; specialCd = 200;
  knockT = 0;
  constructor(kind: EnemyKind, x: number, scale: LevelDef["enemyScale"]) {
    const s = ENEMY_STATS[kind];
    super(x, GROUND_Y, Math.round(s.hp * scale.hp));
    this.kind = kind;
    this.w = s.w; this.h = s.h;
    this.speed = s.speed * scale.speed;
    this.dmg = s.dmg * scale.damage;
    this.score = s.score;
    this.aggression = scale.aggression;
    this.reaction = scale.reaction;
  }
}

type Pickup = { x: number; y: number; kind: "ammo" | "health"; taken: boolean; bob: number };

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private keys: Record<string, boolean> = {};
  private level: LevelDef;
  private player: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
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

  constructor(private canvas: HTMLCanvasElement, levelIndex: number, private cb: GameCallbacks) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.level = LEVELS[levelIndex];
    this.player = new Player(120);
    this.pickups = [
      ...this.level.ammoPickups.map((p) => ({ ...p, kind: "ammo" as const, taken: false, bob: Math.random() * 6 })),
      ...this.level.healthPickups.map((p) => ({ ...p, kind: "health" as const, taken: false, bob: Math.random() * 6 })),
    ];
    this.buildScenery();
    this.spawnWave();
  }

  private rng = (() => { let s = 1337; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); })();

  private buildScenery() {
    const W = this.level.width;
    for (let i = 0; i < 26; i++) this.clouds.push({ x: this.rng() * W, y: 40 + this.rng() * 180, s: 0.6 + this.rng() * 1.2, sp: 0.08 + this.rng() * 0.12 });
    for (let i = 0; i < 18; i++) this.mountains.push({ x: (i * W) / 18 + this.rng() * 120, h: 140 + this.rng() * 160, w: 260 + this.rng() * 220 });
    for (let i = 0; i < 22; i++) this.hills.push({ x: (i * W) / 22 + this.rng() * 100, r: 120 + this.rng() * 160, c: this.rng() > 0.5 ? "#8fd694" : "#7ac98a" });
    for (let i = 0; i < 34; i++) this.trees.push({ x: 60 + this.rng() * (W - 120), s: 0.7 + this.rng() * 0.7 });
    for (let i = 0; i < 22; i++) this.rocks.push({ x: 60 + this.rng() * (W - 120), s: 0.6 + this.rng() * 0.8 });
    for (let i = 0; i < 50; i++) this.plants.push({ x: 40 + this.rng() * (W - 80), s: 0.6 + this.rng() * 0.8 });
    for (let i = 0; i < Math.max(2, Math.floor(W / 900)); i++) this.houses.push({ x: 300 + this.rng() * (W - 600), s: 0.8 + this.rng() * 0.5, hue: this.rng() });
  }

  start() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.raf = requestAnimationFrame(this.loop);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
  setPaused(p: boolean) { this.paused = p; }

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
    p.dashT = 14; p.dashCd = 45; p.invuln = Math.max(p.invuln, 12);
    p.vx = 11 * p.dir;
    sfx.dash();
    this.puff(p.x, p.y, 10);
  }
  private shoot() {
    const p = this.player;
    if (p.dead || p.shootCd > 0 || p.reloadT > 0) return;
    if (p.ammo <= 0) { sfx.dryFire(); this.reload(); return; }
    p.ammo--; p.shootCd = 11;
    const bx = p.x + p.dir * 26;
    const by = p.y - 46;
    this.bullets.push(new Bullet(bx, by, p.dir));
    sfx.shoot();
    this.shake = Math.max(this.shake, 4);
    for (let i = 0; i < 6; i++)
      this.particles.push({ x: bx, y: by, vx: p.dir * (2 + Math.random() * 3), vy: (Math.random() - 0.5) * 2, life: 12, max: 12, color: "#ffd58a", size: 2 + Math.random() * 2, grav: 0 });
    this.pushHud();
  }
  private reload() {
    const p = this.player;
    if (p.reloadT > 0 || p.ammo === p.maxAmmo) return;
    p.reloadT = 70;
    sfx.reload();
    this.pushHud();
  }
  private melee(kind: "punch" | "kick" | "knee") {
    const p = this.player;
    if (p.dead || p.attackT > 0 || p.cooldown > 0) return;
    p.attackKind = kind;
    p.attackT = kind === "punch" ? 14 : kind === "kick" ? 20 : 17;
    p.cooldown = kind === "punch" ? 7 : 12;
    p.attackHit = false;
    p.anim = kind;
    if (kind === "punch") sfx.punch(); else if (kind === "kick") sfx.kick(); else sfx.knee();
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
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 22, max: 22, color, size: 2 + Math.random() * 3, grav: 0.18 });
    }
  }
  private floater(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, color, life: 45 });
  }

  private spawnWave() {
    const wave = this.level.waves[this.waveIndex];
    if (!wave) return;
    for (const e of wave) {
      const en = new Enemy(e.kind, e.x, this.level.enemyScale);
      en.dir = e.x > this.player.x ? -1 : 1;
      this.enemies.push(en);
      this.puff(e.x, GROUND_Y, 12);
    }
  }

  private damageEnemy(en: Enemy, dmg: number, knock: number, srcDir: number) {
    if (en.dead) return;
    en.hp -= dmg;
    en.hurtT = 14;
    en.anim = "hurt";
    en.vx = knock * srcDir;
    en.knockT = 10;
    this.impact(en.x + srcDir * 10, en.y - en.h * 0.6, "#fff3c4", 10);
    this.floater(en.x, en.y - en.h - 8, `${Math.round(dmg)}`, "#ffffff");
    this.shake = Math.max(this.shake, 5);
    this.hitStop = Math.max(this.hitStop, 3);
    sfx.hit();
    if (en.hp <= 0) {
      en.dead = true; en.anim = "dead"; en.deathT = 0; en.vy = -6; en.vx = knock * 0.6 * srcDir;
      this.score += en.score;
      sfx.defeat();
      this.impact(en.x, en.y - en.h * 0.5, "#e8eef7", 18);
      this.floater(en.x, en.y - en.h - 26, `+${en.score}`, "#ffe98a");
    }
  }

  private damagePlayer(dmg: number, srcDir: number) {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;
    p.hp -= dmg;
    p.invuln = 60;
    p.hurtT = 16;
    p.anim = "hurt";
    p.vx = 7 * srcDir;
    p.vy = -5;
    p.combo = 0;
    this.shake = Math.max(this.shake, 9);
    this.hitStop = Math.max(this.hitStop, 4);
    sfx.playerHurt();
    this.impact(p.x, p.y - 46, "#ffb3b3", 14);
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.anim = "dead"; p.deathT = 0;
      this.finished = true;
      sfx.lose();
      setTimeout(() => this.cb.onGameOver(this.score), 900);
    }
    this.pushHud();
  }

  // ---- update ----
  private update() {
    this.time++;
    const p = this.player;
    const lvl = this.level;

    // timers
    p.shootCd = Math.max(0, p.shootCd - 1);
    p.cooldown = Math.max(0, p.cooldown - 1);
    p.dashCd = Math.max(0, p.dashCd - 1);
    p.invuln = Math.max(0, p.invuln - 1);
    p.hurtT = Math.max(0, p.hurtT - 1);
    p.comboT = Math.max(0, p.comboT - 1);
    if (p.comboT === 0) p.combo = 0;
    if (p.dashT > 0) p.dashT--;
    if (p.reloadT > 0) {
      p.reloadT--;
      if (p.reloadT === 0) { p.ammo = p.maxAmmo; this.pushHud(); }
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
    } else {
      p.vx *= 0.85;
      p.deathT++;
    }

    p.physics(lvl);
    // obstacle collision (player)
    for (const o of lvl.obstacles) {
      if (overlap(p.rect, o)) {
        if (p.vy > 0 && p.y - p.vy <= o.y + 6) { p.y = o.y; p.vy = 0; p.onGround = true; }
        else { p.x = p.x < o.x + o.w / 2 ? o.x - p.w / 2 - 1 : o.x + o.w + p.w / 2 + 1; p.vx = 0; }
      }
    }

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
      for (const en of this.enemies) {
        if (en.dead) continue;
        if (overlap(ar, en.rect)) {
          p.attackHit = true;
          p.combo = Math.min(9, p.combo + 1);
          p.comboT = 90;
          const base = p.attackKind === "punch" ? 10 : p.attackKind === "kick" ? 15 : 18;
          const airBonus = !p.onGround ? 1.4 : 1;
          const comboBonus = 1 + p.combo * 0.12;
          this.damageEnemy(en, base * airBonus * comboBonus, p.attackKind === "kick" ? 9 : 6, p.dir);
          break;
        }
      }
    }

    // bullets
    for (const b of this.bullets) {
      b.update();
      if (b.x < this.camera - 100 || b.x > this.camera + VIEW_W + 100) b.dead = true;
      for (const o of lvl.obstacles) if (overlap(b.rect, o)) { b.dead = true; this.impact(b.x, b.y, "#d9d3c7", 6); }
      for (const en of this.enemies) {
        if (en.dead) continue;
        if (overlap(b.rect, en.rect)) {
          b.dead = true;
          this.damageEnemy(en, en.kind === "boss" ? 16 : 22, 4, Math.sign(b.vx));
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // enemies
    for (const en of this.enemies) {
      en.hurtT = Math.max(0, en.hurtT - 1);
      en.cooldown = Math.max(0, en.cooldown - 1);
      en.knockT = Math.max(0, en.knockT - 1);
      en.dodgeT = Math.max(0, en.dodgeT - 1);
      en.specialCd = Math.max(0, en.specialCd - 1);
      if (en.dead) {
        en.deathT++;
        en.vx *= 0.9;
        en.physics(lvl);
        continue;
      }
      if (en.attackT > 0) en.attackT--;

      const dx = p.x - en.x;
      const dist = Math.abs(dx);
      const detect = 520 + en.aggression * 260;
      en.dir = dx >= 0 ? 1 : -1;

      if (en.kind === "boss") {
        const ratio = en.hp / en.maxHp;
        en.bossPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      }

      if (en.knockT > 0 || en.hurtT > 0) {
        en.vx *= 0.85;
      } else if (p.dead) {
        en.vx *= 0.8;
      } else if (dist < detect) {
        const range = en.kind === "boss" ? 74 : 48;
        // occasional dodge
        if (en.dodgeT === 0 && this.bulletIncoming(en) && Math.random() < 0.05 * en.reaction) {
          en.dodgeT = 40;
          en.vy = -13;
          en.vx = -en.dir * 3;
          sfx.dash();
        } else if (dist > range) {
          const spd = en.speed * (en.kind === "boss" ? 1 + (en.bossPhase - 1) * 0.22 : 1);
          en.vx = en.dir * spd;
          // hop over obstacles
          for (const o of lvl.obstacles) {
            if (en.onGround && Math.abs(en.x + en.dir * 30 - (o.x + o.w / 2)) < o.w / 2 + 20) { en.vy = -15; }
          }
          if (en.onGround && p.y < en.y - 60 && dist < 160) en.vy = -16;
          en.anim = "run";
        } else {
          en.vx *= 0.7;
          if (en.attackT === 0 && en.cooldown === 0) {
            const kinds: ("punch" | "kick" | "knee")[] = en.kind === "boss" && en.specialCd === 0 ? ["knee"] : ["punch", "kick"];
            en.attackKind = kinds[Math.floor(Math.random() * kinds.length)];
            en.attackT = 20;
            en.attackHit = false;
            en.cooldown = Math.max(18, Math.round((70 - en.aggression * 26) / (en.reaction || 1)));
            en.anim = en.attackKind;
            if (en.kind === "boss" && en.attackKind === "knee") { en.specialCd = 260; en.vx = en.dir * 8; }
          }
        }
      } else {
        en.vx *= 0.8;
        en.anim = "idle";
      }

      en.physics(lvl);
      for (const o of lvl.obstacles) {
        if (overlap(en.rect, o)) {
          if (en.vy > 0 && en.y - en.vy <= o.y + 6) { en.y = o.y; en.vy = 0; en.onGround = true; }
          else { en.x = en.x < o.x + o.w / 2 ? o.x - en.w / 2 - 1 : o.x + o.w + en.w / 2 + 1; }
        }
      }

      if (en.hurtT > 0) en.anim = "hurt";
      else if (en.attackT > 0) en.anim = en.attackKind;
      else if (!en.onGround) en.anim = "jump";
      else if (Math.abs(en.vx) > 0.5) en.anim = "run";
      en.phase += Math.abs(en.vx) * 0.16 + 0.03;

      const er = en.attackRect();
      if (er && !en.attackHit && en.attackT < 14 && overlap(er, p.rect)) {
        en.attackHit = true;
        this.damagePlayer(en.dmg * (en.attackKind === "kick" ? 1.2 : 1), en.dir);
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
        if (pk.kind === "ammo") { p.ammo = p.maxAmmo; this.floater(p.x, p.y - 90, "AMMO FULL", "#9ad9ff"); }
        else {
          const heal = 40 - (this.level.id >= 4 ? 15 : 0);
          p.hp = Math.min(p.maxHp, p.hp + heal); this.floater(p.x, p.y - 90, `+${heal} HP`, "#a8f0b0");
        }
        this.pushHud();
      }
    }

    // waves
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (alive === 0 && !this.finished) {
      if (this.waveIndex < this.level.waves.length - 1) {
        this.waveDelay++;
        if (this.waveDelay > 70) { this.waveDelay = 0; this.waveIndex++; this.spawnWave(); }
      } else if (this.enemies.length === 0) {
        this.finished = true;
        this.score += 500 + Math.round(p.hp) * 5;
        sfx.win();
        setTimeout(() => this.cb.onLevelComplete(this.score), 700);
      }
    }

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
  }

  private bulletIncoming(en: Enemy) {
    return this.player.x !== en.x && Math.abs(this.player.x - en.x) < 380 && (this.keys[" "] || this.bullets.some((b) => Math.abs(b.x - en.x) < 260 && Math.sign(b.vx) === Math.sign(en.x - b.x)));
  }

  private pushHud() {
    const boss = this.enemies.find((e) => e.kind === "boss" && !e.dead);
    this.cb.onHud({
      hp: Math.max(0, Math.round(this.player.hp)),
      maxHp: this.player.maxHp,
      ammo: this.player.ammo,
      maxAmmo: this.player.maxAmmo,
      reloading: this.player.reloadT > 0,
      level: this.level.id,
      levelName: this.level.name,
      score: this.score,
      enemiesLeft: this.enemies.filter((e) => !e.dead).length + this.level.waves.slice(this.waveIndex + 1).reduce((a, w) => a + w.length, 0),
      weapon: "Handgun / Fists",
      wave: this.waveIndex + 1,
      waves: this.level.waves.length,
      bossHp: boss ? Math.round((boss.hp / boss.maxHp) * 100) : null,
      combo: this.player.combo,
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
    this.drawPickups();
    for (const en of this.enemies) this.drawFighter(en, "#fdfdfb", "#e6e2d8", "#cfc9bb");
    this.drawFighter(this.player, "#2b2f3a", "#1b1e26", "#3d4353");
    this.drawBullets();
    this.drawParticles();
    this.drawFloaters();
    g.restore();

    // vignette / warm light
    const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 640);
    vg.addColorStop(0, "rgba(255,240,200,0)");
    vg.addColorStop(1, "rgba(80,110,90,0.16)");
    g.fillStyle = vg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

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
      const x = t.x - cam;
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

  private drawPickups() {
    const g = this.ctx;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const y = p.y + Math.sin(p.bob) * 5;
      g.save();
      g.shadowColor = p.kind === "ammo" ? "rgba(90,170,255,0.7)" : "rgba(110,220,140,0.7)";
      g.shadowBlur = 16;
      g.fillStyle = p.kind === "ammo" ? "#5aa9ff" : "#63d98a";
      g.beginPath(); g.roundRect(p.x - 14, y - 14, 28, 28, 9); g.fill();
      g.restore();
      g.fillStyle = "#ffffff";
      g.font = "700 14px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(p.kind === "ammo" ? "A" : "+", p.x, y + 1);
      g.textBaseline = "alphabetic";
    }
  }

  private drawBullets() {
    const g = this.ctx;
    for (const b of this.bullets) {
      g.strokeStyle = "rgba(255,214,120,0.5)";
      g.lineWidth = 3; g.lineCap = "round";
      if (b.trail.length > 1) {
        g.beginPath();
        g.moveTo(b.trail[0].x, b.trail[0].y);
        for (const t of b.trail) g.lineTo(t.x, t.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.save();
      g.shadowColor = "rgba(255,200,80,0.9)"; g.shadowBlur = 12;
      g.fillStyle = "#ffd76a";
      g.beginPath(); g.ellipse(b.x, b.y, 6, 3.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  private drawParticles() {
    const g = this.ctx;
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
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
    const scale = !isPlayer && en.kind === "boss" ? 1.5 : !isPlayer && en.kind === "brute" ? 1.15 : 1;

    // shadow
    g.fillStyle = "rgba(30,60,40,0.18)";
    g.beginPath();
    g.ellipse(f.x, GROUND_Y + 4, 26 * scale, 8, 0, 0, Math.PI * 2);
    g.fill();

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
    g.scale(f.dir * scale, scale);

    const walk = Math.sin(f.phase * 2);
    const run = f.anim === "run" ? walk : 0;
    const airborne = !f.onGround && !f.dead;
    const atk = f.attackT > 0 ? 1 - f.attackT / 20 : 0;

    const H = f.h;
    const hipY = -H * 0.46;
    const headY = -H * 0.86;

    // legs
    g.strokeStyle = dark;
    g.lineWidth = 11; g.lineCap = "round";
    const legSwing = airborne ? 0.5 : run * 0.6;
    const kick = f.anim === "kick" ? Math.sin(atk * Math.PI) * 1.5 : 0;
    const knee = f.anim === "knee" ? Math.sin(atk * Math.PI) * 1.2 : 0;
    g.beginPath();
    g.moveTo(0, hipY);
    g.lineTo(Math.sin(legSwing) * 14, hipY + H * 0.26);
    g.lineTo(Math.sin(legSwing) * 20, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(0, hipY);
    if (kick) {
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
    if (!isPlayer && (en.kind === "elite" || en.kind === "boss")) {
      g.fillStyle = en.kind === "boss" ? "#ff8a5c" : "#ffce5c";
      g.beginPath(); g.roundRect(-13, headY - 16, 28, 6, 3); g.fill();
    }

    // arms
    g.strokeStyle = accent; g.lineWidth = 9;
    const shoulderY = headY + 20;
    const punching = f.anim === "punch" ? Math.sin(atk * Math.PI) : 0;
    // back arm
    g.beginPath();
    g.moveTo(-4, shoulderY);
    g.lineTo(-12 - run * 8, shoulderY + 18);
    g.lineTo(-10 - run * 12, shoulderY + 34);
    g.stroke();
    // front arm (gun for player)
    g.beginPath();
    g.moveTo(4, shoulderY);
    if (isPlayer && (f as Player).shootCd > 5) {
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

    g.restore();

    // health bar above enemies
    if (!isPlayer && !f.dead) {
      const w = 46 * scale;
      const y = f.y - f.h * scale - 16;
      g.fillStyle = "rgba(20,30,25,0.35)";
      g.beginPath(); g.roundRect(f.x - w / 2, y, w, 6, 3); g.fill();
      const pct = Math.max(0, f.hp / f.maxHp);
      g.fillStyle = en.kind === "boss" ? "#ff7a5c" : en.kind === "elite" ? "#ffb04d" : "#ffffff";
      g.beginPath(); g.roundRect(f.x - w / 2, y, w * pct, 6, 3); g.fill();
    }
  }
}

export { LEVELS };
