import { useCallback, useEffect, useRef, useState } from "react";
import { type AudioMode, cycleAudioMode, getAudioMode } from "../lib/audio";
import type { CharacterClass, ZoneId } from "../types/game";
import { ZONE_DIFFICULTY } from "../types/game";

// ─── Zone Labels & Colors ─────────────────────────────────────────────────────

const ZONE_LABELS: Record<ZoneId, string> = {
  meadow_hub: "Meadow Hub",
  aurelion: "Aurelion",
  wilderness: "Wilderness",
  forest_depths: "Forest Depths",
  wolf_forest: "Wolf Forest",
  tiger_jungle: "Tiger Jungle",
  bear_forest: "Bear Forest",
  ancient_ruins: "Ancient Ruins",
  crystal_ruins: "Crystal Ruins",
  cyclops_lair: "Cyclops Lair",
  goblin_warrens: "Goblin Warrens",
  bat_cave: "Bat Cave",
  deep_cave: "Deep Cave",
  hub_basement: "Hub Basement",
  wilderness_dungeon: "Underground Cave",
  forest_dungeon: "Forest Dungeon",
  dark_forest: "Dark Forest",
  ancient_ruins_deep: "Ancient Ruins Deep",
  cave_interior: "Cave Interior",
  boss_chamber: "⚠ Boss Chamber",
  cursed_swamp: "⚠ Cursed Swamp",
  floating_ruins: "⚠ Floating Ruins",
  pirate_island: "⚠ Pirate Island",
  cursed_galleon: "⚠ The Cursed Galleon",
  thunder_isle: "⚡ Thunder Isle",
};

const ZONE_COLORS: Record<ZoneId, string> = {
  meadow_hub: "oklch(0.72 0.15 145)",
  aurelion: "oklch(0.60 0.18 275)",
  wilderness: "oklch(0.68 0.16 55)",
  forest_depths: "oklch(0.55 0.18 155)",
  wolf_forest: "oklch(0.50 0.14 145)",
  tiger_jungle: "oklch(0.58 0.18 90)",
  bear_forest: "oklch(0.52 0.14 130)",
  ancient_ruins: "oklch(0.60 0.14 70)",
  crystal_ruins: "oklch(0.55 0.18 280)",
  cyclops_lair: "oklch(0.50 0.18 20)",
  goblin_warrens: "oklch(0.48 0.12 100)",
  bat_cave: "oklch(0.38 0.06 280)",
  deep_cave: "oklch(0.35 0.05 260)",
  hub_basement: "oklch(0.48 0.08 258)",
  wilderness_dungeon: "oklch(0.45 0.07 258)",
  forest_dungeon: "oklch(0.44 0.09 258)",
  dark_forest: "oklch(0.32 0.10 145)",
  ancient_ruins_deep: "oklch(0.40 0.06 255)",
  cave_interior: "oklch(0.36 0.05 40)",
  boss_chamber: "oklch(0.50 0.20 25)",
  cursed_swamp: "oklch(0.42 0.14 155)",
  floating_ruins: "oklch(0.45 0.16 270)",
  pirate_island: "oklch(0.58 0.18 55)",
  cursed_galleon: "oklch(0.44 0.12 40)",
  thunder_isle: "oklch(0.48 0.16 270)",
};

// ─── Zone Difficulty Skulls ───────────────────────────────────────────────────

function ZoneDifficultyBadge({ zoneId }: { zoneId: ZoneId }) {
  const diff = ZONE_DIFFICULTY[zoneId];
  if (diff === "beginner") return null;

  if (diff === "boss") {
    return (
      <span
        title="Boss / Dangerous zone"
        style={{
          fontSize: 10,
          lineHeight: 1,
          filter: "drop-shadow(0 0 3px #a855f7)",
          color: "#a855f7",
          flexShrink: 0,
        }}
        aria-label="Dangerous zone"
      >
        💀
      </span>
    );
  }

  const count = diff === "intermediate" ? 1 : 2;
  const color = diff === "intermediate" ? "#fbbf24" : "#f87171";
  const skullKeys = ["s0", "s1", "s2"] as const;
  return (
    <span
      title={`${diff} zone`}
      style={{ flexShrink: 0, lineHeight: 1 }}
      aria-label={`${diff} difficulty`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={skullKeys[i]}
          style={{
            fontSize: 9,
            color,
            filter: `drop-shadow(0 0 2px ${color}88)`,
          }}
        >
          💀
        </span>
      ))}
    </span>
  );
}

// ─── Ping Indicator ───────────────────────────────────────────────────────────

interface PingIndicatorProps {
  /** Average ping in ms. Undefined = no data yet. */
  pingMs?: number;
}

function PingIndicator({ pingMs }: PingIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(() => {
    setShowTooltip(true);
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(false), 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  let dotColor = "#6b7280"; // grey — no data
  let dotLabel = "No ping data";
  if (pingMs !== undefined) {
    if (pingMs < 100) {
      dotColor = "#4ade80";
      dotLabel = "Good connection";
    } else if (pingMs < 300) {
      dotColor = "#fbbf24";
      dotLabel = "Fair connection";
    } else {
      dotColor = "#f87171";
      dotLabel = "Poor connection";
    }
  }

  return (
    <button
      type="button"
      aria-label={`Network ping${pingMs !== undefined ? `: ${pingMs}ms` : ""}`}
      data-ocid="ping-indicator"
      onClick={handleTap}
      style={{
        position: "relative",
        width: 20,
        height: 20,
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
        padding: 0,
      }}
    >
      {/* Dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 4px ${dotColor}`,
          display: "block",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            right: 0,
            whiteSpace: "nowrap",
            background: "oklch(0.08 0 0 / 0.95)",
            border: `1px solid ${dotColor}66`,
            borderRadius: 4,
            padding: "2px 6px",
            fontFamily: "var(--font-mono), monospace",
            fontSize: 9,
            fontWeight: 700,
            color: dotColor,
            pointerEvents: "none",
            zIndex: 60,
          }}
        >
          {pingMs !== undefined ? `${pingMs}ms` : dotLabel}
        </div>
      )}
    </button>
  );
}

// ─── XP helpers ───────────────────────────────────────────────────────────────

function xpForLevel(n: number) {
  return Math.floor(100 * 1.25 ** (n - 1));
}
function cumulativeXpAtLevel(n: number): number {
  let total = 0;
  for (let i = 1; i < n; i++) total += xpForLevel(i);
  return total;
}
function computeLevelFromXp(totalXp: number): number {
  let lv = 1;
  let acc = 0;
  while (lv < 60) {
    const needed = xpForLevel(lv);
    if (acc + needed > totalXp) break;
    acc += needed;
    lv++;
  }
  return lv;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PortraitTopBarProps {
  username: string;
  selectedClass: CharacterClass;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  currentZoneId?: ZoneId;
  tileX: number;
  tileY: number;
  coins: number;
  onSettingsOpen?: () => void;
  onLogout?: () => void;
  /** Called when the hamburger menu button is tapped */
  onMenuOpen?: () => void;
  /** Average ping in ms (undefined = no data yet) */
  pingMs?: number;
  /** If true, class indicator is hidden (guest accounts have no class) */
  isGuest?: boolean;
  /** Frost slow active (0-1 duration ratio) */
  frostSlowRatio?: number;
  /** Poison active (0-1 duration ratio) */
  poisonRatio?: number;
}

export function PortraitTopBar({
  username,
  selectedClass,
  level,
  hp,
  maxHp,
  mp,
  maxMp,
  xp,
  currentZoneId,
  coins,
  onSettingsOpen,
  onLogout,
  onMenuOpen,
  pingMs,
  isGuest = false,
  frostSlowRatio = 0,
  poisonRatio = 0,
}: PortraitTopBarProps) {
  // ── Animated HP bar (smooth drain/fill over 0.3s) ──
  const animatedHpRef = useRef<number>(hp);
  const [animatedHp, setAnimatedHp] = useState<number>(hp);
  const hpAnimFrameRef = useRef<number>(0);

  useEffect(() => {
    const target = hp;
    const current = animatedHpRef.current;
    if (current === target) return;
    if (hpAnimFrameRef.current) cancelAnimationFrame(hpAnimFrameRef.current);
    let lastT = 0;
    const DURATION_MS = 300;
    const tick = (t: number) => {
      if (!lastT) lastT = t;
      const dt = t - lastT;
      lastT = t;
      const diff = target - animatedHpRef.current;
      const step = (diff / DURATION_MS) * dt;
      const clampedStep =
        diff > 0 ? Math.min(diff, step) : Math.max(diff, step);
      const next = animatedHpRef.current + clampedStep;
      animatedHpRef.current = next;
      setAnimatedHp(next);
      if (Math.abs(next - target) > 0.5) {
        hpAnimFrameRef.current = requestAnimationFrame(tick);
      } else {
        animatedHpRef.current = target;
        setAnimatedHp(target);
      }
    };
    hpAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (hpAnimFrameRef.current) cancelAnimationFrame(hpAnimFrameRef.current);
    };
  }, [hp]);

  // ── Animated MP bar (smooth drain/fill over 0.3s) ──
  const animatedMpRef = useRef<number>(mp);
  const [animatedMp, setAnimatedMp] = useState<number>(mp);
  const mpAnimFrameRef = useRef<number>(0);

  useEffect(() => {
    const target = mp;
    const current = animatedMpRef.current;
    if (current === target) return;
    if (mpAnimFrameRef.current) cancelAnimationFrame(mpAnimFrameRef.current);
    let lastT = 0;
    const DURATION_MS = 300;
    const tick = (t: number) => {
      if (!lastT) lastT = t;
      const dt = t - lastT;
      lastT = t;
      const diff = target - animatedMpRef.current;
      const step = (diff / DURATION_MS) * dt;
      const clampedStep =
        diff > 0 ? Math.min(diff, step) : Math.max(diff, step);
      const next = animatedMpRef.current + clampedStep;
      animatedMpRef.current = next;
      setAnimatedMp(next);
      if (Math.abs(next - target) > 0.5) {
        mpAnimFrameRef.current = requestAnimationFrame(tick);
      } else {
        animatedMpRef.current = target;
        setAnimatedMp(target);
      }
    };
    mpAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (mpAnimFrameRef.current) cancelAnimationFrame(mpAnimFrameRef.current);
    };
  }, [mp]);

  const hpPct = Math.max(0, Math.min(1, maxHp > 0 ? animatedHp / maxHp : 0));
  const mpPct = Math.max(0, Math.min(1, maxMp > 0 ? animatedMp / maxMp : 0));
  const isLowMana = (maxMp > 0 ? mp / maxMp : 0) < 0.2;
  const isLowHp = (maxHp > 0 ? hp / maxHp : 0) < 0.3;

  // ── Logout confirmation state ──
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ── Audio mode toggle ──
  const [audioMode, setAudioModeState] = useState<AudioMode>(getAudioMode);

  // ── Animated XP bar ──
  const animatedXpRef = useRef<number>(xp);
  const [animatedXp, setAnimatedXp] = useState<number>(xp);
  const [xpBarFlashGold, setXpBarFlashGold] = useState(false);
  const xpAnimFrameRef = useRef<number>(0);
  const prevLevelRef = useRef<number>(level);

  useEffect(() => {
    const target = xp;
    const current = animatedXpRef.current;
    if (current === target) return;
    if (level !== prevLevelRef.current) {
      animatedXpRef.current = target;
      setAnimatedXp(target);
      prevLevelRef.current = level;
      return;
    }
    if (xpAnimFrameRef.current) cancelAnimationFrame(xpAnimFrameRef.current);
    let lastT = 0;
    const tick = (t: number) => {
      if (!lastT) lastT = t;
      const dt = t - lastT;
      lastT = t;
      const speed = Math.max((target - animatedXpRef.current) / 0.3, 200);
      const step = (speed * dt) / 1000;
      const prev = animatedXpRef.current;
      let next = Math.min(target, prev + step);
      const levelAtPrev = computeLevelFromXp(prev);
      const levelAtNext = computeLevelFromXp(next);
      if (levelAtNext > levelAtPrev) {
        setXpBarFlashGold(true);
        setTimeout(() => setXpBarFlashGold(false), 150);
      }
      animatedXpRef.current = next;
      setAnimatedXp(next);
      if (next < target) {
        xpAnimFrameRef.current = requestAnimationFrame(tick);
      }
    };
    xpAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (xpAnimFrameRef.current) cancelAnimationFrame(xpAnimFrameRef.current);
    };
  }, [xp, level]);

  const animLevel = computeLevelFromXp(animatedXp);
  const animXpThisLevel = cumulativeXpAtLevel(animLevel);
  const animXpInLevel = Math.max(0, animatedXp - animXpThisLevel);
  const animXpNeededInLevel = xpForLevel(animLevel);
  const xpPct = Math.max(
    0,
    Math.min(
      1,
      animXpNeededInLevel > 0 ? animXpInLevel / animXpNeededInLevel : 0,
    ),
  );

  const zoneColor = currentZoneId
    ? ZONE_COLORS[currentZoneId]
    : "oklch(0.50 0 0)";
  const zoneLabel = currentZoneId ? ZONE_LABELS[currentZoneId] : "";

  void frostSlowRatio;
  void poisonRatio;

  return (
    <div
      data-ocid="portrait-top-bar"
      style={{
        width: "100%",
        height: 72,
        background: "rgba(0,0,0,0.85)",
        borderBottom: "1px solid oklch(0.22 0 0 / 0.8)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        paddingTop: "max(env(safe-area-inset-top, 0px), 0px)",
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: 4,
        boxSizing: "border-box",
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      {/* ── Row 1: Name/Level + Zone/Coins + Ping + Minimap + Settings ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6 }}
      >
        {/* Left: Name + Level badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
            flex: "0 0 auto",
          }}
        >
          {/* Class dot — hidden for guests */}
          {!isGuest && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 1,
                background:
                  selectedClass === "mage"
                    ? "oklch(0.55 0.18 260)"
                    : "oklch(0.6 0.22 25)",
                flexShrink: 0,
                display: "inline-block",
              }}
              aria-hidden="true"
            />
          )}
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 12,
              fontWeight: 700,
              color: "oklch(0.92 0 0)",
              letterSpacing: "0.04em",
              maxWidth: 80,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            data-ocid="portrait-username"
          >
            {username}
          </span>
          {/* Level badge */}
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, oklch(0.60 0.18 60), oklch(0.45 0.14 50))",
              border: "1.5px solid oklch(0.80 0.18 70)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9,
              fontWeight: 900,
              color: "oklch(0.98 0.06 80)",
              flexShrink: 0,
              boxShadow: "0 0 6px oklch(0.75 0.18 65 / 0.4)",
            }}
            data-ocid="portrait-level-badge"
          >
            {level}
          </span>
          {/* Class indicator — hidden for guest accounts */}
          {!isGuest && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "1px 5px",
                borderRadius: 3,
                background:
                  selectedClass === "mage"
                    ? "oklch(0.55 0.18 260 / 0.18)"
                    : "oklch(0.60 0.22 25 / 0.18)",
                border: `1px solid ${selectedClass === "mage" ? "oklch(0.55 0.18 260 / 0.55)" : "oklch(0.60 0.22 25 / 0.55)"}`,
                flexShrink: 0,
              }}
              data-ocid="portrait-class-badge"
              aria-label={`Class: ${selectedClass}`}
            >
              <span aria-hidden="true" style={{ fontSize: 9, lineHeight: 1 }}>
                {selectedClass === "mage" ? "🪄" : "⚔️"}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 7,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color:
                    selectedClass === "mage"
                      ? "oklch(0.72 0.18 260)"
                      : "oklch(0.72 0.22 25)",
                }}
              >
                {selectedClass === "mage" ? "MAGE" : "WARRIOR"}
              </span>
            </span>
          )}
        </div>

        {/* Center: zone name + difficulty skulls */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {zoneLabel && (
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 9,
                fontWeight: 700,
                color: zoneColor,
                textShadow: `0 0 5px ${zoneColor}55`,
                letterSpacing: "0.04em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
              data-ocid="portrait-zone-name"
            >
              {zoneLabel}
            </span>
          )}
          {currentZoneId && <ZoneDifficultyBadge zoneId={currentZoneId} />}
        </div>

        {/* Right: coins + ping + minimap + settings */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {/* Coins */}
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 10,
              fontWeight: 700,
              color: "oklch(0.72 0.16 80)",
            }}
            data-ocid="portrait-coins"
          >
            🪙{coins}
          </span>

          {/* Ping indicator */}
          <PingIndicator pingMs={pingMs} />

          {/* Audio mode toggle */}
          <button
            type="button"
            aria-label={`Audio: ${audioMode}`}
            data-ocid="portrait-audio-mode-btn"
            title={`Audio: ${audioMode}`}
            onClick={() => {
              const next = cycleAudioMode();
              setAudioModeState(next);
            }}
            style={{
              width: 30,
              height: 30,
              background: "oklch(0.14 0 0 / 0.6)",
              border: "1px solid oklch(0.30 0 0 / 0.5)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              cursor: "pointer",
              flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {audioMode === "both"
              ? "🔊"
              : audioMode === "music"
                ? "🎵"
                : audioMode === "sfx"
                  ? "🔔"
                  : "🔇"}
          </button>

          {/* Settings gear */}
          <button
            type="button"
            onClick={onSettingsOpen}
            aria-label="Settings"
            data-ocid="portrait-settings-btn"
            style={{
              width: 30,
              height: 30,
              background: "oklch(0.14 0 0 / 0.6)",
              border: "1px solid oklch(0.30 0 0 / 0.5)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              cursor: "pointer",
              color: "oklch(0.60 0 0)",
              flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            ⚙
          </button>

          {/* Hamburger menu button */}
          <button
            type="button"
            onClick={onMenuOpen}
            aria-label="Game menu"
            data-ocid="portrait-menu-btn"
            style={{
              width: 30,
              height: 30,
              background: "oklch(0.14 0 0 / 0.6)",
              border: "1px solid oklch(0.30 0 0 / 0.5)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
              padding: 0,
            }}
          >
            <svg
              width="16"
              height="12"
              viewBox="0 0 16 12"
              fill="none"
              aria-hidden="true"
            >
              <rect y="0" width="16" height="2" rx="1" fill="oklch(0.60 0 0)" />
              <rect y="5" width="16" height="2" rx="1" fill="oklch(0.60 0 0)" />
              <rect
                y="10"
                width="16"
                height="2"
                rx="1"
                fill="oklch(0.60 0 0)"
              />
            </svg>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            aria-label="Logout"
            data-ocid="portrait-logout-btn"
            style={{
              height: 30,
              padding: "0 8px",
              background: "oklch(0.14 0 0 / 0.6)",
              border: "1px solid oklch(0.30 0 0 / 0.5)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
              color: "oklch(0.50 0 0)",
              flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            LOGOUT
          </button>
        </div>
      </div>

      {/* ── Logout confirmation modal ── */}
      {showLogoutConfirm && (
        <dialog
          data-ocid="logout-confirm-dialog"
          open
          aria-label="Confirm logout"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(4px)",
            border: "none",
            padding: 0,
            margin: 0,
            width: "100vw",
            height: "100vh",
            maxWidth: "unset",
            maxHeight: "unset",
          }}
          onClick={() => setShowLogoutConfirm(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowLogoutConfirm(false);
          }}
        >
          <div
            style={{
              background: "oklch(0.10 0 0 / 0.98)",
              border: "1px solid oklch(0.28 0 0 / 0.8)",
              borderRadius: 10,
              padding: "24px 28px",
              maxWidth: 280,
              width: "90vw",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 13,
                fontWeight: 700,
                color: "oklch(0.88 0 0)",
                margin: 0,
                textAlign: "center",
              }}
            >
              Logout?
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 10,
                color: "oklch(0.55 0 0)",
                margin: 0,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              Your progress is saved.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                data-ocid="logout-confirm-button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout?.();
                }}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 6,
                  background: "oklch(0.50 0.20 25 / 0.85)",
                  border: "1.5px solid oklch(0.65 0.22 25 / 0.70)",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "oklch(0.95 0.06 25)",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                data-ocid="logout-cancel-button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 6,
                  background: "oklch(0.14 0 0 / 0.70)",
                  border: "1px solid oklch(0.30 0 0 / 0.5)",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "oklch(0.50 0 0)",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* ── Row 2: HP + MP bars + XP bar + minimap ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 2,
        }}
      >
        {/* HP + MP stacked */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minWidth: 0,
          }}
        >
          {/* HP bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 9,
                fontWeight: 700,
                color: "oklch(0.65 0.18 15)",
                letterSpacing: "0.04em",
                width: 16,
                flexShrink: 0,
              }}
            >
              HP
            </span>
            <div
              className={isLowHp ? "hp-low-pulse" : ""}
              style={{
                flex: 1,
                height: 9,
                background: "rgba(0,0,0,0.7)",
                borderRadius: 999,
                border: isLowHp
                  ? "1px solid rgba(220,20,60,0.70)"
                  : "1px solid rgba(180,30,30,0.35)",
                overflow: "hidden",
                position: "relative",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
              }}
              data-ocid="portrait-hp-bar"
            >
              <div
                style={{
                  width: `${Math.max(2, hpPct * 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: isLowHp
                    ? "linear-gradient(90deg, #8b0000, #cc2222, #ff2222)"
                    : "linear-gradient(90deg, #8b0000, #cc2222, #ff5555)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,120,120,0.5), inset 0 -1px 0 rgba(0,0,0,0.3)",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 8,
                color: "oklch(0.50 0 0)",
                width: 44,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {hp}/{maxHp}
            </span>
          </div>

          {/* MP bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 9,
                fontWeight: 700,
                color: isLowMana
                  ? "oklch(0.55 0.20 255)"
                  : "oklch(0.55 0.16 255)",
                letterSpacing: "0.04em",
                width: 16,
                flexShrink: 0,
              }}
            >
              MP
            </span>
            <div
              className={isLowMana ? "mana-warning-pulse" : ""}
              style={{
                flex: 1,
                height: 9,
                background: "rgba(0,0,0,0.7)",
                borderRadius: 999,
                border: isLowMana
                  ? "1px solid rgba(50,80,220,0.70)"
                  : "1px solid rgba(30,50,180,0.35)",
                overflow: "hidden",
                position: "relative",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
              }}
              data-ocid="portrait-mp-bar"
            >
              <div
                style={{
                  width: `${Math.max(2, mpPct * 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: isLowMana
                    ? "linear-gradient(90deg, #001a66, #2244cc, #4466ff)"
                    : "linear-gradient(90deg, #001a66, #2244cc, #5577ff)",
                  boxShadow:
                    "inset 0 1px 0 rgba(100,180,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.3)",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 8,
                color: "oklch(0.50 0 0)",
                width: 44,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {mp}/{maxMp}
            </span>
          </div>

          {/* XP bar (thin) */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 8,
                fontWeight: 700,
                color: "oklch(0.65 0.14 75)",
                letterSpacing: "0.04em",
                width: 16,
                flexShrink: 0,
              }}
            >
              XP
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "rgba(0,0,0,0.7)",
                borderRadius: 999,
                border: xpBarFlashGold
                  ? "1px solid #FFD700"
                  : "1px solid rgba(120,90,0,0.35)",
                overflow: "hidden",
                transition: "border-color 0.1s",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
              }}
              className={xpBarFlashGold ? "xp-bar-glow" : ""}
              data-ocid="portrait-xp-bar"
            >
              <div
                style={{
                  width: `${Math.max(1, xpPct * 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: xpBarFlashGold
                    ? "#FFD700"
                    : "linear-gradient(90deg, #8b6914, #ffd700, #daa520)",
                  transition: "width 0.05s linear, background 0.1s",
                  boxShadow: "inset 0 1px 0 rgba(255,240,100,0.4)",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 7,
                color: "oklch(0.42 0 0)",
                width: 44,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {Math.max(0, Math.round(animXpInLevel))}/{animXpNeededInLevel}
            </span>
          </div>
        </div>

        {/* Status effect icons — frost/poison/shield active indicators */}
        {(frostSlowRatio > 0 || poisonRatio > 0) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              paddingLeft: 4,
              flexShrink: 0,
            }}
            data-ocid="portrait-status-effects"
            aria-label="Active status effects"
          >
            {frostSlowRatio > 0 && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.75)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  position: "relative",
                }}
                title="Frost slowed"
              >
                <span aria-hidden="true">🧊</span>
                <svg
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: 20,
                    height: 20,
                  }}
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="rgba(100,200,255,0.4)"
                    strokeWidth="2"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="rgba(100,200,255,0.9)"
                    strokeWidth="2"
                    strokeDasharray={`${frostSlowRatio * 50.27} 50.27`}
                    strokeLinecap="round"
                    transform="rotate(-90 10 10)"
                  />
                </svg>
              </div>
            )}
            {poisonRatio > 0 && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.75)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  position: "relative",
                }}
                title="Poisoned"
              >
                <span aria-hidden="true">☠</span>
                <svg
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: 20,
                    height: 20,
                  }}
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="rgba(100,220,100,0.4)"
                    strokeWidth="2"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="rgba(100,220,100,0.9)"
                    strokeWidth="2"
                    strokeDasharray={`${poisonRatio * 50.27} 50.27`}
                    strokeLinecap="round"
                    transform="rotate(-90 10 10)"
                  />
                </svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
