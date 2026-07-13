import { useEffect, useRef, useState } from "react";
import type { CharacterClass } from "../types/game";

// ─── Types ──────────────────────────────────────────────────────────────────

type SpellType =
  | "arcane"
  | "frost"
  | "shadow"
  | "flame"
  | "physical"
  | "heal"
  | "player_hit";

interface DamageNumber {
  id: string;
  x: number;
  y: number;
  value: number;
  isCrit: boolean;
  spellType: SpellType;
  born: number;
}

interface ComboDisplay {
  count: number;
  x: number;
  y: number;
  born: number;
}

interface StatGains {
  hpGain: number;
  mpGain: number;
  atkGain: number;
  newHp: number;
  newMp: number;
  newAtk: number;
}

interface LevelUpBanner {
  id: string;
  born: number;
  newLevel?: number;
  statGains?: StatGains;
}

interface GoldParticle {
  id: string;
  angle: number;
  speed: number;
  born: number;
}

interface WorldEventToastState {
  id: string;
  text: string;
  born: number;
}

// ─── Colors per spell type ─────────────────────────────────────────────────

const SPELL_COLORS: Record<SpellType, string> = {
  arcane: "#00e5ff",
  frost: "#b3e5fc",
  shadow: "#ce93d8",
  flame: "#ff9800",
  physical: "#ffffff",
  heal: "#66bb6a",
  player_hit: "#f44336",
};

// ─── CombatOverlay ───────────────────────────────────────────────────────────

interface CombatOverlayProps {
  /** Pixel scale applied to the canvas container (portrait mode portraitScale) */
  scale: number;
  /** Canvas logical width in CSS px at scale=1 */
  canvasW: number;
  /** Canvas logical height in CSS px at scale=1 */
  canvasH: number;
  selectedClass: CharacterClass;
}

export function CombatOverlay({ scale, canvasW, canvasH }: CombatOverlayProps) {
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [combo, setCombo] = useState<ComboDisplay | null>(null);
  const [levelUpBanners, setLevelUpBanners] = useState<LevelUpBanner[]>([]);
  const [goldParticles, setGoldParticles] = useState<GoldParticle[]>([]);
  const [worldEventToast, setWorldEventToast] =
    useState<WorldEventToastState | null>(null);
  const animRef = useRef<number>(0);
  const MAX_PARTICLES = 30;

  // ── Animate: remove expired entries each RAF ────────────────────────────────
  useEffect(() => {
    const DAMAGE_TTL = 700;
    const COMBO_TTL = 1200;
    const PARTICLE_TTL = 900;

    const tick = () => {
      const now = Date.now();
      setDamageNumbers((prev) => prev.filter((d) => now - d.born < DAMAGE_TTL));
      setCombo((c) => (c && now - c.born < COMBO_TTL ? c : null));
      setGoldParticles((prev) =>
        prev.filter((p) => now - p.born < PARTICLE_TTL),
      );
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Listen for level-up and world event custom events ─────────────────────
  useEffect(() => {
    const onLevelUp = (e: Event) => {
      const detail = (
        e as CustomEvent<{ newLevel?: number; statGains?: StatGains }>
      ).detail;
      const id = `lu_${Date.now()}_${Math.random()}`;
      setLevelUpBanners((prev) => [
        ...prev.slice(-2),
        {
          id,
          born: Date.now(),
          newLevel: detail?.newLevel,
          statGains: detail?.statGains,
        },
      ]);
      // Spawn 8 golden particles bursting from center bottom-third
      const now = Date.now();
      const particles: GoldParticle[] = Array.from({ length: 8 }, (_, i) => ({
        id: `gp_${now}_${i}`,
        angle: (i / 8) * Math.PI * 2,
        speed: 40 + Math.random() * 30,
        born: now,
      }));
      setGoldParticles((prev) => [...prev, ...particles].slice(-MAX_PARTICLES));
      setTimeout(() => {
        setLevelUpBanners((prev) => prev.filter((b) => b.id !== id));
      }, 3500);
    };
    const onWorldEvent = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      setWorldEventToast({ id: `we_${Date.now()}`, text, born: Date.now() });
      setTimeout(() => setWorldEventToast(null), 4500);
    };
    window.addEventListener("player_level_up", onLevelUp);
    window.addEventListener("world_event_toast", onWorldEvent as EventListener);
    return () => {
      window.removeEventListener("player_level_up", onLevelUp);
      window.removeEventListener(
        "world_event_toast",
        onWorldEvent as EventListener,
      );
    };
  }, []);

  // ── Listen for combat events dispatched by useGameLoop ─────────────────────
  useEffect(() => {
    const onCombatEvent = (
      e: CustomEvent<{
        damage: number;
        isCrit: boolean;
        spellType: SpellType;
        tileX: number;
        tileY: number;
        cameraX: number;
        cameraY: number;
      }>,
    ) => {
      const { damage, isCrit, spellType, tileX, tileY, cameraX, cameraY } =
        e.detail;
      // Convert tile coords to pixel coords on canvas
      const TILE_SIZE = 32;
      const px = tileX * TILE_SIZE - cameraX + TILE_SIZE / 2;
      const py = tileY * TILE_SIZE - cameraY - TILE_SIZE / 2;
      setDamageNumbers((prev) => {
        const next: DamageNumber[] = [
          ...prev,
          {
            id: `dmg_${Date.now()}_${Math.random()}`,
            x: px,
            y: py,
            value: damage,
            isCrit,
            spellType,
            born: Date.now(),
          },
        ];
        return next.slice(-MAX_PARTICLES);
      });
    };

    const onWarriorCombo = (
      e: CustomEvent<{ count: number; x: number; y: number }>,
    ) => {
      const { count, x, y } = e.detail;
      if (count < 2) return;
      setCombo({ count, x: x * 32 + 16, y: y * 32 - 8, born: Date.now() });
    };

    window.addEventListener(
      "combat_damage_number",
      onCombatEvent as EventListener,
    );
    window.addEventListener("warrior_combo", onWarriorCombo as EventListener);
    return () => {
      window.removeEventListener(
        "combat_damage_number",
        onCombatEvent as EventListener,
      );
      window.removeEventListener(
        "warrior_combo",
        onWarriorCombo as EventListener,
      );
    };
  }, []);

  const now = Date.now();
  const DAMAGE_TTL = 700;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasW,
        height: canvasH,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 20,
        transform: `scale(${scale})`,
        transformOrigin: "top center",
      }}
      data-ocid="combat-overlay"
    >
      {/* World event toast — slides in from top */}
      {worldEventToast &&
        (() => {
          const age = now - worldEventToast.born;
          const SHOW_MS = 4000;
          const FADE_MS = 400;
          const opacity =
            age > SHOW_MS - FADE_MS
              ? Math.max(0, (SHOW_MS - age) / FADE_MS)
              : 1;
          return (
            <div
              key={worldEventToast.id}
              style={{
                position: "absolute",
                top: 60,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.88)",
                border: "1px solid rgba(255,215,0,0.5)",
                borderRadius: 8,
                padding: "7px 18px",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: 12,
                color: "#ffd700",
                textShadow: "0 0 8px rgba(255,215,0,0.5)",
                whiteSpace: "nowrap",
                opacity,
                userSelect: "none",
                letterSpacing: "0.04em",
                boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
              }}
            >
              {worldEventToast.text}
            </div>
          );
        })()}

      {/* Golden level-up particles */}
      {goldParticles.map((p) => {
        const age = now - p.born;
        const TTL = 900;
        const progress = Math.min(1, age / TTL);
        const opacity = Math.max(0, 1 - progress * progress);
        const dist = p.speed * progress;
        const px = canvasW / 2 + Math.cos(p.angle) * dist;
        const py = canvasH * 0.65 + Math.sin(p.angle) * dist;
        const size = Math.max(1, 6 - progress * 4);
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: px - size / 2,
              top: py - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: progress < 0.4 ? "#fff" : "#ffd700",
              boxShadow: `0 0 ${4 + size}px #ffd700`,
              opacity,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Level-up rising banners + stat popup card */}
      {levelUpBanners.map((b) => {
        const age = now - b.born;
        const TTL = 2000;
        const progress = Math.min(1, age / TTL);
        const riseY = progress * 50;
        const opacity = Math.max(0, 1 - Math.max(0, (age - 1400) / 600));
        // Stat popup fades in from 400ms, fades out after 3000ms
        const statOpacity =
          age < 400
            ? age / 400
            : age > 3000
              ? Math.max(0, (3500 - age) / 500)
              : 1;
        return (
          <div key={b.id}>
            {/* LEVEL UP! rising text */}
            <div
              style={{
                position: "absolute",
                top: Math.floor(canvasH / 2) - 40 - riseY,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 900,
                fontSize: 22,
                background:
                  "linear-gradient(180deg, #ffe066 0%, #ffd700 50%, #ff9900 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 8px rgba(255,215,0,0.9))",
                letterSpacing: "0.18em",
                opacity,
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              ✨ LEVEL UP!
            </div>
            {/* Stat gains popup card */}
            {b.statGains && statOpacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: Math.floor(canvasH / 2) + 20,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(8,8,22,0.93)",
                  border: "1.5px solid rgba(255,215,0,0.6)",
                  borderRadius: 10,
                  padding: "12px 20px",
                  minWidth: 200,
                  opacity: statOpacity,
                  userSelect: "none",
                  pointerEvents: "none",
                  boxShadow:
                    "0 0 20px rgba(255,215,0,0.25), 0 4px 16px rgba(0,0,0,0.7)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 800,
                    fontSize: 14,
                    color: "#ffd700",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}
                >
                  ⬆ Level {b.newLevel}!
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: "rgba(255,255,255,0.75)",
                    lineHeight: 1.7,
                    letterSpacing: "0.04em",
                  }}
                >
                  <span style={{ color: "#f87171" }}>HP</span>{" "}
                  {b.statGains.newHp - b.statGains.hpGain}→{b.statGains.newHp}
                  {" | "}
                  <span style={{ color: "#60a5fa" }}>MP</span>{" "}
                  {b.statGains.newMp - b.statGains.mpGain}→{b.statGains.newMp}
                  {" | "}
                  <span style={{ color: "#fb923c" }}>ATK</span>{" "}
                  {b.statGains.newAtk - b.statGains.atkGain}→
                  {b.statGains.newAtk}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Floating damage numbers */}
      {damageNumbers.map((d) => {
        const progress = Math.min(1, (now - d.born) / DAMAGE_TTL);
        const opacity = Math.max(0, 1 - progress);
        const riseY = progress * 25;
        const color = d.isCrit ? "#ffd700" : SPELL_COLORS[d.spellType];
        const fontSize = d.isCrit ? 18 : 14;
        return (
          <div
            key={d.id}
            style={{
              position: "absolute",
              left: d.x,
              top: d.y - riseY,
              transform: "translateX(-50%)",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              fontSize,
              color,
              textShadow:
                "1px 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.7)",
              opacity,
              whiteSpace: "nowrap",
              userSelect: "none",
              pointerEvents: "none",
              letterSpacing: d.isCrit ? "0.04em" : undefined,
            }}
          >
            {d.isCrit ? `✦ ${d.value}!` : String(d.value)}
          </div>
        );
      })}

      {/* Warrior combo counter */}
      {combo &&
        (() => {
          const progress = Math.min(1, (now - combo.born) / 1200);
          const opacity = Math.max(0, 1 - progress * progress);
          const scale2 = combo.count >= 5 ? 1.3 : 1;
          const color =
            combo.count >= 7
              ? "#FFD700"
              : combo.count >= 5
                ? "#FF8844"
                : "#FFAA22";
          return (
            <div
              key={`combo_${combo.born}`}
              style={{
                position: "absolute",
                left: combo.x,
                top: combo.y,
                transform: `translateX(-50%) scale(${scale2})`,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 900,
                fontSize: 14,
                color,
                textShadow: `0 0 8px ${color}88, 0 0 2px rgba(0,0,0,0.9)`,
                opacity,
                whiteSpace: "nowrap",
                userSelect: "none",
                pointerEvents: "none",
                letterSpacing: "0.08em",
              }}
            >
              x{combo.count}
              {combo.count >= 7
                ? " RAMPAGE!"
                : combo.count >= 5
                  ? " COMBO!"
                  : ""}
            </div>
          );
        })()}
    </div>
  );
}
