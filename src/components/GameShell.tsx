import { useCallback, useEffect, useRef, useState } from "react";
import { Game, LEVELS, VIEW_H, VIEW_W, type HudState, type LevelRank } from "@/game/engine";
import MobileControls from "@/components/MobileControls";
import { useTouchGameplay } from "@/hooks/use-touch-gameplay";
import {
  UPGRADES,
  awardClearCurrency,
  buyUpgrade,
  costForNext,
  maxRank,
  readCurrency,
  readUpgradeLevels,
  type UpgradeId,
  type UpgradeLevels,
} from "@/game/upgrades";
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  readDifficulty,
  writeDifficulty,
  type Difficulty,
} from "@/game/difficulty";
import { ACHIEVEMENTS, readUnlocked, type AchievementId } from "@/game/achievements";

type Screen = "menu" | "levels" | "upgrades" | "achievements" | "play" | "complete" | "gameover" | "victory";

/** Screen Orientation lock/unlock aren't in the standard TS DOM lib yet — widely supported on Chromium/Android. */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait" | "any" | "natural") => Promise<void>;
  unlock?: () => void;
};

const STORE_KEY = "shadow-vs-ivory-progress";

const emptyHud: HudState = {
  hp: 120, maxHp: 120, ammo: 12, maxAmmo: 12, reserve: 48, reloading: false,
  level: 1, levelName: "", score: 0, enemiesLeft: 0, weapon: "Handgun / Fists",
  wave: 1, waves: 1, bossHp: null, bossPhase: null, combo: 0,
  special: 0, specialMax: 100, focusActive: false, counterReady: false,
  finisherReady: false, finisherTier: 0,
  secretsFound: 0, secretsTotal: 0,
  objective: "", objectiveProgress: "", arenaTimer: null,
  bonusObjective: null, bonusDone: false,
};


export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [unlocked, setUnlocked] = useState(1);
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [paused, setPaused] = useState(false);
  const [total, setTotal] = useState(0);
  const [lastRank, setLastRank] = useState<LevelRank | null>(null);
  const [lastLevelScore, setLastLevelScore] = useState(0);
  const [lastSecrets, setLastSecrets] = useState({ found: 0, total: 0 });
  const [lastIvoryGain, setLastIvoryGain] = useState(0);
  const [currency, setCurrency] = useState(0);
  const [upgradeLevels, setUpgradeLevels] = useState<UpgradeLevels>(() => readUpgradeLevels());
  const [shakeLabel, setShakeLabel] = useState(() => {
    const s = typeof window !== "undefined" ? window.localStorage.getItem("shadow-vs-ivory-shake") : null;
    return s === "0" ? "Off" : s === "0.5" ? "Reduced" : "On";
  });
  const [musicOn, setMusicOn] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => readDifficulty());
  const [unlockedAchievements, setUnlockedAchievements] = useState(() => readUnlocked());
  const [lastAchievements, setLastAchievements] = useState<AchievementId[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { showTouchControls, isPortrait } = useTouchGameplay();

  const fsSupported = typeof document !== "undefined" && !!document.fullscreenEnabled;

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frameRef.current?.requestFullscreen?.();
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Lock page scroll behind the fullscreen gameplay viewport.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (screen !== "play") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [screen]);

  // Exit OS fullscreen + release the orientation lock when leaving gameplay.
  useEffect(() => {
    if (screen === "play") return;
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen();
    }
    if (typeof window !== "undefined") {
      (window.screen.orientation as LockableOrientation | undefined)?.unlock?.();
    }
  }, [screen]);

  // Mobile gameplay: try to go fullscreen + lock to landscape. Desktop is untouched
  // (guarded by showTouchControls, same coarse-pointer signal used for touch UI).
  // Best-effort only — unsupported/rejected attempts fall back to the rotate hint.
  useEffect(() => {
    if (screen !== "play" || !showTouchControls) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    let cancelled = false;
    const tryLockLandscape = async () => {
      try {
        if (frameRef.current && !document.fullscreenElement) {
          await frameRef.current.requestFullscreen();
        }
      } catch {
        // Fullscreen rejected (no user gesture, unsupported, etc). Continue anyway —
        // orientation lock can still work on some browsers without fullscreen.
      }
      if (cancelled) return;
      try {
        await (window.screen.orientation as LockableOrientation | undefined)?.lock?.("landscape");
      } catch {
        // Orientation Lock API unsupported/rejected — the rotate hint covers this.
      }
    };
    void tryLockLandscape();
    return () => {
      cancelled = true;
    };
  }, [screen, showTouchControls]);

  const chooseDifficulty = useCallback((d: Difficulty) => {
    writeDifficulty(d);
    setDifficulty(d);
  }, []);

  const refreshMeta = useCallback(() => {
    setCurrency(readCurrency());
    setUpgradeLevels(readUpgradeLevels());
    setUnlockedAchievements(readUnlocked());
  }, []);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORE_KEY) : null;
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) setUnlocked(Math.min(5, Math.max(1, n)));
    }
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (screen === "menu" || screen === "levels" || screen === "upgrades" || screen === "achievements" || screen === "complete" || screen === "victory") {
      refreshMeta();
    }
  }, [screen, refreshMeta]);

  const stop = useCallback(() => {
    gameRef.current?.destroy();
    gameRef.current = null;
  }, []);

  const startLevel = useCallback((idx: number) => {
    setLevelIndex(idx);
    setPaused(false);
    setHud({ ...emptyHud, level: idx + 1 });
    setLastAchievements([]);
    setScreen("play");
  }, []);

  const purchase = useCallback((id: UpgradeId) => {
    if (!buyUpgrade(id)) return;
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (screen !== "play") { stop(); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new Game(canvas, levelIndex, {
      onHud: setHud,
      onLevelComplete: (result) => {
        setLastRank(result.rank);
        setLastLevelScore(result.score);
        setLastSecrets({ found: result.secretsFound, total: result.secretsTotal });
        setLastAchievements(result.achievements);
        if (result.achievements.length > 0) setUnlockedAchievements(readUnlocked());
        const gained = awardClearCurrency(result.rank);
        setLastIvoryGain(gained);
        setCurrency(readCurrency());
        setTotal((t) => t + result.score);
        const next = levelIndex + 2;
        if (levelIndex === LEVELS.length - 1) {
          setScreen("victory");
        } else {
          setUnlocked((u) => {
            const nu = Math.max(u, next);
            window.localStorage.setItem(STORE_KEY, String(nu));
            return nu;
          });
          setScreen("complete");
        }
      },
      onGameOver: () => setScreen("gameover"),
    });
    gameRef.current = g;
    g.start();
    setMusicOn(!g.isMusicMuted());
    return () => { g.destroy(); gameRef.current = null; };
  }, [screen, levelIndex, stop]);

  useEffect(() => {
    // Freeze the engine while the rotate-to-landscape hint blocks the screen, without
    // surfacing the manual Pause overlay for it.
    gameRef.current?.setPaused(paused || (showTouchControls && isPortrait));
  }, [paused, showTouchControls, isPortrait]);

  useEffect(() => {
    if (screen !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") setPaused((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100);
  const specialPct = Math.max(0, Math.min(100, (hud.special / Math.max(1, hud.specialMax)) * 100));
  const specialReady = hud.special >= hud.specialMax && !hud.focusActive;

  return (
    <div className={`game-shell${screen === "menu" ? " game-shell--menu" : ""}${screen === "levels" ? " game-shell--levels" : ""}${screen === "upgrades" ? " game-shell--upgrades" : ""}${screen === "achievements" ? " game-shell--upgrades" : ""}${screen === "complete" ? " game-shell--complete" : ""}${screen === "play" ? " game-shell--play" : ""}${screen === "play" && showTouchControls ? " game-shell--touch" : ""}`}>
      <div ref={frameRef} className={`game-frame${screen === "play" ? " game-frame--play" : ""}${screen === "play" && showTouchControls ? " game-frame--touch" : ""}`}>
        {screen === "play" && (
          <>
            <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="game-canvas" />
            <div className="hud">
              <div className="hud-left">
                <div className="hud-name">SHADOW</div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${hpPct}%` }} />
                  <span className="bar-label">{hud.hp} / {hud.maxHp}</span>
                </div>
                <div className={`bar bar-special${specialReady ? " ready" : ""}${hud.focusActive ? " focus" : ""}`}>
                  <div className="bar-fill bar-fill-special" style={{ width: `${hud.focusActive ? 100 : specialPct}%` }} />
                  <span className="bar-label">
                    {hud.focusActive ? "FOCUS" : specialReady ? "FOCUS READY · Q" : "SPECIAL"}
                  </span>
                </div>
                {hud.objective && (
                  <div className="hud-objective">
                    <span className="hud-objective-label">{hud.objective}</span>
                    <span className="hud-objective-progress">{hud.objectiveProgress}</span>
                    {hud.arenaTimer != null && (
                      <span className={`hud-objective-timer${hud.arenaTimer <= 10 ? " urgent" : ""}`}>
                        {hud.arenaTimer}s
                      </span>
                    )}
                    {hud.bonusObjective && (
                      <span className={`hud-objective-bonus${hud.bonusDone ? " done" : ""}`}>
                        {hud.bonusDone ? "Bonus ✓" : hud.bonusObjective}
                      </span>
                    )}
                  </div>
                )}
                <div className="hud-row">
                  <span className="chip">{hud.weapon}</span>
                  <span className={`chip ${hud.reloading ? "chip-warn" : ""}`}>
                    {hud.reloading ? "RELOADING…" : `AMMO ${hud.ammo}/${hud.maxAmmo} · ${hud.reserve}`}
                  </span>
                  {hud.combo > 1 && <span className="chip chip-combo">COMBO ×{hud.combo}</span>}
                  {hud.counterReady && <span className="chip chip-counter">COUNTER</span>}
                  {hud.finisherReady && (
                    <span className={`chip chip-finisher${hud.finisherTier >= 2 ? " chip-finisher--ult" : ""}`}>
                      {hud.finisherTier >= 2 ? "ULT FINISHER · F" : "FINISHER READY · F"}
                    </span>
                  )}
                </div>
              </div>
              <div className="hud-right">
                <div className="stat"><b>{hud.score}</b><span>Score</span></div>
                <div className="stat"><b>{hud.enemiesLeft}</b><span>Ivory left</span></div>
                <div className="stat"><b>{hud.wave}/{hud.waves}</b><span>Wave</span></div>
                {hud.secretsTotal > 0 && (
                  <div className="stat"><b>{hud.secretsFound}/{hud.secretsTotal}</b><span>Secrets</span></div>
                )}
                <div className="stat"><b>{hud.level}</b><span>Level</span></div>
                {fsSupported && (
                  <button
                    className="btn btn-ghost btn-sm btn-fullscreen"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? "⤡" : "⤢"}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setPaused((v) => !v)}>
                  {paused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
            {hud.bossHp !== null && (
              <div className="boss-bar">
                <span>
                  {hud.level >= 5 && hud.wave >= hud.waves ? "IVORY WARLORD" : "IVORY COMMANDER"}
                  {hud.bossPhase != null && (
                    <em className="boss-phase">
                      {hud.bossPhase >= 3 ? " · RAGE" : ` · PHASE ${hud.bossPhase}`}
                    </em>
                  )}
                </span>
                <div className="bar bar-boss">
                  <div className="bar-fill bar-fill-boss" style={{ width: `${hud.bossHp}%` }} />
                </div>
              </div>
            )}
            <MobileControls
              gameRef={gameRef}
              enabled={showTouchControls && !paused && !isPortrait}
              specialReady={specialReady}
              focusActive={hud.focusActive}
              finisherReady={hud.finisherReady}
              finisherTier={hud.finisherTier}
            />
            {showTouchControls && isPortrait && (
              <div className="mobile-rotate-hint" role="status">
                <span className="mobile-rotate-hint-icon" aria-hidden="true">⟳</span>
                <span className="mobile-rotate-hint-text">Rotate your phone to play.</span>
              </div>
            )}
            {paused && (
              <div className="overlay">
                <div className="panel">
                  <h2>Paused</h2>
                  <div className="panel-actions">
                    <button className="btn" onClick={() => setPaused(false)}>Resume</button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        const g = gameRef.current;
                        if (!g) return;
                        const next = g.getShakeScale() === 0 ? 1 : g.getShakeScale() === 1 ? 0.5 : 0;
                        g.setShakeScale(next as 0 | 0.5 | 1);
                        setShakeLabel(next === 0 ? "Off" : next === 0.5 ? "Reduced" : "On");
                      }}
                    >
                      Screen shake: {shakeLabel}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        const g = gameRef.current;
                        if (!g) return;
                        const muted = g.toggleMusicMuted();
                        setMusicOn(!muted);
                      }}
                    >
                      Music: {musicOn ? "On" : "Off"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setPaused(false); startLevel(levelIndex); }}>Restart level</button>
                    <button className="btn btn-ghost" onClick={() => { setPaused(false); setScreen("levels"); }}>Level select</button>
                    <button className="btn btn-ghost" onClick={() => { setPaused(false); setScreen("menu"); }}>Main menu</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {screen === "menu" && (
          <div className="screen screen-menu">
            <div className="menu-fx" aria-hidden="true">
              <span className="menu-fx-grid" />
              <span className="menu-fx-glow menu-fx-glow--a" />
              <span className="menu-fx-glow menu-fx-glow--b" />
              <span className="menu-fx-scan" />
            </div>
            <p className="eyebrow menu-enter menu-enter--1">VECTOR ARENA BRAWLER</p>
            <h1 className="title menu-title menu-enter menu-enter--2">Nigga Fighters</h1>
            <p className="lede menu-enter menu-enter--3">
              Black king, aura maxed, too locked in to ever switch lanes;
              Built different, no cap—turning every L into legendary gains.
            </p>
            <p className="menu-ivory menu-enter menu-enter--3" aria-label={`${currency} Ivory currency`}>
              Ivory <strong>{currency}</strong>
            </p>
            <div className="panel-actions menu-actions menu-enter menu-enter--4">
              <button className="btn btn-lg btn-menu-primary" onClick={() => startLevel(0)}>
                Start game
              </button>
              <button className="btn btn-ghost btn-lg btn-menu-secondary" onClick={() => setScreen("levels")}>
                Level select
              </button>
              <button className="btn btn-ghost btn-lg btn-menu-secondary" onClick={() => setScreen("upgrades")}>
                Upgrades
              </button>
              <button className="btn btn-ghost btn-lg btn-menu-secondary" onClick={() => setScreen("achievements")}>
                Achievements
              </button>
            </div>
          </div>
        )}

        {screen === "levels" && (
          <div className="screen screen-levels">
            <div className="levels-fx" aria-hidden="true">
              <span className="levels-fx-grid" />
              <span className="levels-fx-glow levels-fx-glow--a" />
              <span className="levels-fx-glow levels-fx-glow--b" />
              <span className="levels-fx-curve" />
            </div>
            <h2 className="title-sm levels-title levels-enter levels-enter--title">Choose a level</h2>
            <p className="levels-ivory levels-enter levels-enter--title">Ivory <strong>{currency}</strong></p>
            <div className="difficulty-row levels-enter levels-enter--title" role="group" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`difficulty-btn${difficulty === d ? " active" : ""}`}
                  onClick={() => chooseDifficulty(d)}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
            <div className="level-grid levels-grid">
              {LEVELS.map((l, i) => {
                const locked = i + 1 > unlocked;
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`level-card levels-card ${locked ? "locked" : "unlocked"} levels-enter`}
                    style={{ animationDelay: `${0.14 + i * 0.07}s` }}
                    disabled={locked}
                    onClick={() => startLevel(i)}
                    aria-label={locked ? `Level ${l.id} locked: ${l.name}` : `Play level ${l.id}: ${l.name}`}
                  >
                    <span className="level-num">{l.id}</span>
                    <b>{l.name}</b>
                    <span className="level-tag">{l.tagline}</span>
                    {locked && <span className="level-lock">Locked</span>}
                  </button>
                );
              })}
            </div>
            <div className="levels-nav levels-enter levels-enter--btn">
              <button
                type="button"
                className="btn btn-ghost btn-levels-back"
                onClick={() => setScreen("menu")}
              >
                Back to menu
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setScreen("upgrades")}
              >
                Upgrades
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setScreen("achievements")}
              >
                Achievements
              </button>
            </div>
          </div>
        )}

        {screen === "upgrades" && (
          <div className="screen screen-upgrades">
            <div className="upgrades-fx" aria-hidden="true">
              <span className="upgrades-fx-grid" />
              <span className="upgrades-fx-glow upgrades-fx-glow--a" />
              <span className="upgrades-fx-glow upgrades-fx-glow--b" />
            </div>
            <h2 className="title-sm upgrades-title upgrades-enter upgrades-enter--1">Upgrades</h2>
            <p className="lede upgrades-lede upgrades-enter upgrades-enter--2">
              Spend Ivory from clears and secrets. Bonuses apply on the next run.
            </p>
            <p className="upgrades-ivory upgrades-enter upgrades-enter--2">
              Ivory <strong>{currency}</strong>
            </p>
            <ul className="upgrade-list">
              {UPGRADES.map((u, i) => {
                const rank = upgradeLevels[u.id] ?? 0;
                const max = maxRank(u);
                const cost = costForNext(u.id, upgradeLevels);
                const maxed = cost == null;
                const canBuy = !maxed && currency >= (cost ?? 0);
                return (
                  <li
                    key={u.id}
                    className="upgrade-row upgrades-enter"
                    style={{ animationDelay: `${0.18 + i * 0.05}s` }}
                  >
                    <div className="upgrade-copy">
                      <b>{u.name}</b>
                      <span>{u.blurb}</span>
                      <span className="upgrade-rank">Rank {rank}/{max}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm upgrade-buy"
                      disabled={!canBuy}
                      onClick={() => purchase(u.id)}
                    >
                      {maxed ? "MAX" : `Buy · ${cost}`}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn btn-ghost upgrades-back upgrades-enter upgrades-enter--btn"
              onClick={() => setScreen("menu")}
            >
              Back to menu
            </button>
          </div>
        )}

        {screen === "achievements" && (
          <div className="screen screen-upgrades">
            <div className="upgrades-fx" aria-hidden="true">
              <span className="upgrades-fx-grid" />
              <span className="upgrades-fx-glow upgrades-fx-glow--a" />
              <span className="upgrades-fx-glow upgrades-fx-glow--b" />
            </div>
            <h2 className="title-sm upgrades-title upgrades-enter upgrades-enter--1">Achievements</h2>
            <p className="lede upgrades-lede upgrades-enter upgrades-enter--2">
              {ACHIEVEMENTS.filter((a) => unlockedAchievements[a.id]).length}/{ACHIEVEMENTS.length} unlocked
            </p>
            <ul className="upgrade-list">
              {ACHIEVEMENTS.map((a, i) => {
                const done = unlockedAchievements[a.id];
                return (
                  <li
                    key={a.id}
                    className={`upgrade-row achievement-row${done ? " unlocked" : ""} upgrades-enter`}
                    style={{ animationDelay: `${0.18 + i * 0.05}s` }}
                  >
                    <div className="upgrade-copy">
                      <b>{a.name}</b>
                      <span>{a.description}</span>
                    </div>
                    <span className={`achievement-badge${done ? " done" : ""}`}>
                      {done ? "Unlocked" : "Locked"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn btn-ghost upgrades-back upgrades-enter upgrades-enter--btn"
              onClick={() => setScreen("menu")}
            >
              Back to menu
            </button>
          </div>
        )}

        {screen === "complete" && (
          <div className="screen screen-complete">
            <div className="complete-fx" aria-hidden="true">
              <span className="complete-fx-grid" />
              <span className="complete-fx-glow complete-fx-glow--a" />
              <span className="complete-fx-glow complete-fx-glow--b" />
              <span className="complete-fx-curve" />
            </div>
            <p className="eyebrow complete-eyebrow complete-enter complete-enter--1">
              Level {levelIndex + 1} cleared
            </p>
            <h2 className="title-sm complete-title complete-enter complete-enter--2">Area secured</h2>
            {lastRank && (
              <p className="complete-rank complete-enter complete-enter--2">Rank {lastRank}</p>
            )}
            <p className="lede complete-meta complete-enter complete-enter--3">
              Level score <strong className="complete-score">{lastLevelScore || total}</strong>
              {" · "}
              Total <strong className="complete-score">{total}</strong>
              {lastSecrets.total > 0 && (
                <>
                  {" · "}
                  Secrets <strong className="complete-score">{lastSecrets.found}/{lastSecrets.total}</strong>
                </>
              )}
              {lastIvoryGain > 0 && (
                <>
                  {" · "}
                  Ivory <strong className="complete-score">+{lastIvoryGain}</strong>
                </>
              )}
              . Level {levelIndex + 2} unlocked.
            </p>
            {lastAchievements.length > 0 && (
              <div className="achievement-toast complete-enter complete-enter--3">
                {lastAchievements.map((id) => {
                  const def = ACHIEVEMENTS.find((a) => a.id === id);
                  return def ? <span key={id} className="achievement-chip">🏆 {def.name}</span> : null;
                })}
              </div>
            )}
            <div className="panel-actions complete-actions">
              <button
                type="button"
                className="btn btn-lg btn-complete-primary complete-enter complete-enter--4"
                onClick={() => startLevel(levelIndex + 1)}
              >
                Next level
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-lg btn-complete-replay complete-enter complete-enter--5"
                onClick={() => startLevel(levelIndex)}
              >
                Replay level
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-lg btn-complete-select complete-enter complete-enter--6"
                onClick={() => setScreen("upgrades")}
              >
                Upgrades
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-lg btn-complete-select complete-enter complete-enter--6"
                onClick={() => setScreen("levels")}
              >
                Level select
              </button>
            </div>
          </div>
        )}

        {screen === "gameover" && (
          <div className="screen">
            <p className="eyebrow">Shadow is down</p>
            <h2 className="title-sm">Game over</h2>
            <p className="lede">Score this run: {hud.score}</p>
            <div className="panel-actions">
              <button className="btn btn-lg" onClick={() => startLevel(levelIndex)}>Restart level</button>
              <button className="btn btn-ghost" onClick={() => setScreen("levels")}>Level select</button>
              <button className="btn btn-ghost" onClick={() => setScreen("menu")}>Main menu</button>
            </div>
          </div>
        )}

        {screen === "victory" && (
          <div className="screen screen-victory">
            <p className="eyebrow">Level 5 complete</p>
            <h2 className="title">Victory</h2>
            <p className="lede">
              The Ivory warlord has fallen. Final score {total}
              {lastIvoryGain > 0 && <> · Ivory +{lastIvoryGain}</>}.
            </p>
            {lastAchievements.length > 0 && (
              <div className="achievement-toast">
                {lastAchievements.map((id) => {
                  const def = ACHIEVEMENTS.find((a) => a.id === id);
                  return def ? <span key={id} className="achievement-chip">🏆 {def.name}</span> : null;
                })}
              </div>
            )}
            <div className="panel-actions">
              <button className="btn btn-lg" onClick={() => { setTotal(0); startLevel(0); }}>Play again</button>
              <button className="btn btn-ghost" onClick={() => setScreen("upgrades")}>Upgrades</button>
              <button className="btn btn-ghost" onClick={() => setScreen("levels")}>Level select</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
