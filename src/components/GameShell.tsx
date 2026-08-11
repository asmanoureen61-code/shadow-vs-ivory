import { useCallback, useEffect, useRef, useState } from "react";
import { Game, LEVELS, VIEW_H, VIEW_W, type HudState } from "@/game/engine";

type Screen = "menu" | "levels" | "play" | "complete" | "gameover" | "victory";

const STORE_KEY = "shadow-vs-ivory-progress";

const emptyHud: HudState = {
  hp: 120, maxHp: 120, ammo: 12, maxAmmo: 12, reloading: false,
  level: 1, levelName: "", score: 0, enemiesLeft: 0, weapon: "Handgun / Fists",
  wave: 1, waves: 1, bossHp: null, combo: 0,
};


export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [unlocked, setUnlocked] = useState(1);
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [paused, setPaused] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORE_KEY) : null;
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) setUnlocked(Math.min(5, Math.max(1, n)));
    }
  }, []);

  const stop = useCallback(() => {
    gameRef.current?.destroy();
    gameRef.current = null;
  }, []);

  const startLevel = useCallback((idx: number) => {
    setLevelIndex(idx);
    setPaused(false);
    setHud({ ...emptyHud, level: idx + 1 });
    setScreen("play");
  }, []);

  useEffect(() => {
    if (screen !== "play") { stop(); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new Game(canvas, levelIndex, {
      onHud: setHud,
      onLevelComplete: (score) => {
        setTotal((t) => t + score);
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
    return () => { g.destroy(); gameRef.current = null; };
  }, [screen, levelIndex, stop]);

  useEffect(() => {
    gameRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    if (screen !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") setPaused((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100);

  return (
    <div className="game-shell">
      <div className="game-frame">
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
                <div className="hud-row">
                  <span className="chip">{hud.weapon}</span>
                  <span className={`chip ${hud.reloading ? "chip-warn" : ""}`}>
                    {hud.reloading ? "RELOADING…" : `AMMO ${hud.ammo}/${hud.maxAmmo}`}
                  </span>
                  {hud.combo > 1 && <span className="chip chip-combo">COMBO ×{hud.combo}</span>}
                </div>
              </div>
              <div className="hud-right">
                <div className="stat"><b>{hud.score}</b><span>Score</span></div>
                <div className="stat"><b>{hud.enemiesLeft}</b><span>Ivory left</span></div>
                <div className="stat"><b>{hud.wave}/{hud.waves}</b><span>Wave</span></div>
                <div className="stat"><b>{hud.level}</b><span>Level</span></div>
                <button className="btn btn-ghost btn-sm" onClick={() => setPaused((v) => !v)}>
                  {paused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
            {hud.bossHp !== null && (
              <div className="boss-bar">
                <span>IVORY WARLORD</span>
                <div className="bar bar-boss">
                  <div className="bar-fill bar-fill-boss" style={{ width: `${hud.bossHp}%` }} />
                </div>
              </div>
            )}
            {paused && (
              <div className="overlay">
                <div className="panel">
                  <h2>Paused</h2>
                  <div className="panel-actions">
                    <button className="btn" onClick={() => setPaused(false)}>Resume</button>
                    <button className="btn btn-ghost" onClick={() => { setPaused(false); startLevel(levelIndex); }}>Restart level</button>
                    <button className="btn btn-ghost" onClick={() => { setPaused(false); setScreen("levels"); }}>Level select</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {screen === "menu" && (
          <div className="screen screen-menu">
            <p className="eyebrow">Vector arena brawler</p>
            <h1 className="title">Shadow <em>vs</em> Ivory</h1>
            <p className="lede">
              Shadow fights in black tactical gear against the Ivory faction in white.
              Fictional factions, colour-coded only. Five levels, handgun and hand-to-hand combat.
            </p>
            <div className="panel-actions">
              <button className="btn btn-lg" onClick={() => startLevel(0)}>Start game</button>
              <button className="btn btn-ghost btn-lg" onClick={() => setScreen("levels")}>Level select</button>
            </div>
          </div>
        )}

        {screen === "levels" && (
          <div className="screen">
            <h2 className="title-sm">Choose a level</h2>
            <div className="level-grid">
              {LEVELS.map((l, i) => {
                const locked = i + 1 > unlocked;
                return (
                  <button
                    key={l.id}
                    className={`level-card ${locked ? "locked" : ""}`}
                    disabled={locked}
                    onClick={() => startLevel(i)}
                  >
                    <span className="level-num">{l.id}</span>
                    <b>{l.name}</b>
                    <span className="level-tag">{l.tagline}</span>
                    {locked && <span className="level-lock">Locked</span>}
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost" onClick={() => setScreen("menu")}>Back to menu</button>
          </div>
        )}

        {screen === "complete" && (
          <div className="screen">
            <p className="eyebrow">Level {levelIndex + 1} cleared</p>
            <h2 className="title-sm">Area secured</h2>
            <p className="lede">Total score {total}. Level {levelIndex + 2} unlocked.</p>
            <div className="panel-actions">
              <button className="btn btn-lg" onClick={() => startLevel(levelIndex + 1)}>Next level</button>
              <button className="btn btn-ghost" onClick={() => startLevel(levelIndex)}>Replay level</button>
              <button className="btn btn-ghost" onClick={() => setScreen("levels")}>Level select</button>
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
            <p className="lede">The Ivory warlord has fallen. Final score {total}.</p>
            <div className="panel-actions">
              <button className="btn btn-lg" onClick={() => { setTotal(0); startLevel(0); }}>Play again</button>
              <button className="btn btn-ghost" onClick={() => setScreen("levels")}>Level select</button>
            </div>
          </div>
        )}
      </div>
      <p className="footnote">
        Best played on desktop with a keyboard. Shadow and Ivory are fictional factions distinguished only by outfit colour.
      </p>
    </div>
  );
}
