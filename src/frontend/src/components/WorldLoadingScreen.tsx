import { useEffect, useRef, useState } from "react";
import type { ZoneId } from "../types/game";

// ─── Zone atmosphere gradients ────────────────────────────────────────────────

const ZONE_GRADIENTS: Record<string, string> = {
  meadow_hub:
    "radial-gradient(ellipse at 50% 40%, oklch(0.28 0.10 145) 0%, oklch(0.14 0.05 145) 55%, oklch(0.08 0.02 160) 100%)",
  aurelion:
    "radial-gradient(ellipse at 50% 40%, oklch(0.24 0.12 275) 0%, oklch(0.14 0.08 270) 55%, oklch(0.07 0.04 260) 100%)",
  forest_depths:
    "radial-gradient(ellipse at 50% 40%, oklch(0.22 0.08 145) 0%, oklch(0.12 0.05 145) 55%, oklch(0.07 0.02 155) 100%)",
  dark_forest:
    "radial-gradient(ellipse at 50% 40%, oklch(0.16 0.06 145) 0%, oklch(0.09 0.04 145) 55%, oklch(0.05 0.01 160) 100%)",
  cave_interior:
    "radial-gradient(ellipse at 50% 40%, oklch(0.18 0.04 260) 0%, oklch(0.10 0.02 260) 55%, oklch(0.05 0 0) 100%)",
  deep_cave:
    "radial-gradient(ellipse at 50% 40%, oklch(0.16 0.04 260) 0%, oklch(0.09 0.02 260) 55%, oklch(0.05 0 0) 100%)",
  ancient_ruins:
    "radial-gradient(ellipse at 50% 40%, oklch(0.22 0.04 55) 0%, oklch(0.13 0.02 55) 55%, oklch(0.07 0.01 60) 100%)",
  boss_chamber:
    "radial-gradient(ellipse at 50% 40%, oklch(0.22 0.12 25) 0%, oklch(0.12 0.07 25) 55%, oklch(0.06 0.03 20) 100%)",
  cursed_swamp:
    "radial-gradient(ellipse at 50% 40%, oklch(0.20 0.08 155) 0%, oklch(0.11 0.04 155) 55%, oklch(0.06 0.02 160) 100%)",
  floating_ruins:
    "radial-gradient(ellipse at 50% 40%, oklch(0.20 0.10 270) 0%, oklch(0.12 0.06 270) 55%, oklch(0.06 0.03 260) 100%)",
  pirate_island:
    "radial-gradient(ellipse at 50% 40%, oklch(0.28 0.10 195) 0%, oklch(0.18 0.06 195) 55%, oklch(0.09 0.04 200) 100%)",
  cursed_galleon:
    "radial-gradient(ellipse at 50% 40%, oklch(0.18 0.06 200) 0%, oklch(0.10 0.04 200) 55%, oklch(0.05 0.02 210) 100%)",
};

const FALLBACK_GRADIENT =
  "radial-gradient(ellipse at 50% 40%, oklch(0.20 0.06 260) 0%, oklch(0.11 0.04 260) 55%, oklch(0.06 0.02 260) 100%)";

// ─── Loading tips ─────────────────────────────────────────────────────────────

const TIPS = [
  "Tip: Mana regenerates faster at higher levels",
  "Tip: PVP is enabled outside safe cities",
  "Tip: Elite monsters reward everyone on the map",
  "Tip: Visit Aurelion to craft powerful items",
  "Tip: Sprint drains mana — use it wisely",
  "Tip: World events trigger every 15 minutes",
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorldLoadingScreenProps {
  characterName: string;
  destinationZone: ZoneId;
  onLoadComplete: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorldLoadingScreen({
  characterName,
  destinationZone,
  onLoadComplete,
}: WorldLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);
  const doneRef = useRef(false);
  const startRef = useRef(Date.now());

  // ── Progress bar: fills over ~1000ms with slight easing ──
  const onLoadCompleteRef = useRef(onLoadComplete);
  onLoadCompleteRef.current = onLoadComplete;

  useEffect(() => {
    const MIN_DISPLAY_MS = 1200;
    startRef.current = Date.now();

    // Animate progress from 0 → 100 over MIN_DISPLAY_MS
    const STEPS = 60;
    const INTERVAL = MIN_DISPLAY_MS / STEPS;
    let step = 0;

    const id = setInterval(() => {
      step++;
      // Ease-out curve: fast start, slow finish
      const t = step / STEPS;
      const eased = 1 - (1 - t) ** 2.5;
      setProgress(Math.min(100, Math.round(eased * 100)));

      if (step >= STEPS) {
        clearInterval(id);
        // After bar fills, fade to black then fire callback
        if (!doneRef.current) {
          doneRef.current = true;
          // Ensure minimum time has elapsed
          const elapsed = Date.now() - startRef.current;
          const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
          setTimeout(() => {
            setFadingOut(true);
            setTimeout(() => onLoadCompleteRef.current(), 350);
          }, remaining);
        }
      }
    }, INTERVAL);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tip rotation every 2 seconds ──
  useEffect(() => {
    const rotate = () => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex((i) => (i + 1) % TIPS.length);
        setTipVisible(true);
      }, 300);
    };
    const id = setInterval(rotate, 2000);
    return () => clearInterval(id);
  }, []);

  const zoneGradient = ZONE_GRADIENTS[destinationZone] ?? FALLBACK_GRADIENT;

  return (
    <div
      data-ocid="world-loading-screen"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        background: zoneGradient,
        opacity: fadingOut ? 0 : 1,
        transition: fadingOut
          ? "opacity 0.35s ease-in"
          : "opacity 0.4s ease-out",
        zIndex: 9000,
        overflow: "hidden",
        paddingBottom: "env(safe-area-inset-bottom, 24px)",
      }}
    >
      {/* ── Scanline overlay ── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, oklch(0 0 0 / 0.05) 0px, oklch(0 0 0 / 0.05) 1px, transparent 1px, transparent 3px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* ── Vignette ── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, oklch(0 0 0 / 0.70) 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* ── Floating particles ── */}
      <LoadingParticles />

      {/* ── Top: Logo + subtitle + loading text ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          paddingTop: "clamp(48px, 12vh, 96px)",
          position: "relative",
          zIndex: 10,
          animation: "wls-fadeInDown 0.5s ease-out both",
        }}
      >
        {/* Logo */}
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(2.4rem, 8vw, 4rem)",
            letterSpacing: "0.25em",
            color: "#FFD700",
            textShadow:
              "0 0 24px rgba(255,215,0,0.9), 0 0 60px rgba(255,215,0,0.5), 0 0 100px rgba(255,165,0,0.3)",
            animation: "wls-goldPulse 2.4s ease-in-out infinite",
            margin: 0,
            lineHeight: 1.1,
            userSelect: "none",
          }}
        >
          PIXEL QUEST
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "clamp(0.7rem, 2vw, 0.9rem)",
            fontWeight: 500,
            letterSpacing: "0.35em",
            color: "oklch(0.65 0.12 60)",
            textTransform: "uppercase",
            margin: 0,
            opacity: 0.9,
          }}
        >
          A Blockchain RPG Adventure
        </p>

        {/* Loading for */}
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "clamp(0.75rem, 2vw, 0.9rem)",
            fontWeight: 600,
            color: "oklch(0.75 0.14 60)",
            letterSpacing: "0.08em",
            marginTop: 16,
          }}
        >
          Loading world for{" "}
          <span style={{ color: "#FFD700" }}>{characterName}</span>…
        </p>
      </div>

      {/* ── Bottom: tips + progress bar ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          position: "relative",
          zIndex: 10,
          paddingBottom: 40,
          animation: "wls-fadeInUp 0.5s ease-out 0.2s both",
        }}
      >
        {/* Tip text */}
        <p
          data-ocid="world-loading-tip"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "clamp(0.65rem, 2vw, 0.78rem)",
            color: "oklch(0.60 0.06 260)",
            textAlign: "center",
            letterSpacing: "0.04em",
            lineHeight: 1.5,
            minHeight: "2.4em",
            opacity: tipVisible ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        >
          {TIPS[tipIndex]}
        </p>

        {/* Gold loading bar */}
        <div
          style={{
            width: "100%",
            height: 8,
            borderRadius: 4,
            background: "oklch(0.12 0.02 60 / 0.8)",
            border: "1px solid oklch(0.30 0.06 60 / 0.5)",
            overflow: "hidden",
            boxShadow: "0 0 12px oklch(0 0 0 / 0.5)",
          }}
        >
          <div
            data-ocid="world-loading-bar"
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 4,
              background:
                "linear-gradient(90deg, #FFA500 0%, #FFD700 50%, #FFEC80 100%)",
              boxShadow:
                "0 0 12px rgba(255,215,0,0.6), 0 0 24px rgba(255,165,0,0.3)",
              transition: "width 0.05s linear",
            }}
          />
        </div>

        {/* Progress label */}
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.2em",
            color: "oklch(0.40 0.04 60)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {progress < 100 ? `${progress}%` : "Ready!"}
        </p>
      </div>

      {/* ── Keyframe styles ── */}
      <style>{`
        @keyframes wls-goldPulse {
          0%, 100% {
            text-shadow: 0 0 24px rgba(255,215,0,0.9), 0 0 60px rgba(255,215,0,0.5), 0 0 100px rgba(255,165,0,0.3);
          }
          50% {
            text-shadow: 0 0 40px rgba(255,215,0,1.0), 0 0 80px rgba(255,215,0,0.7), 0 0 130px rgba(255,165,0,0.5);
          }
        }
        @keyframes wls-fadeInDown {
          from { opacity: 0; transform: translateY(-20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wls-fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wls-floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 0.7; }
          100% { transform: translateY(-100vh) scale(0.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Ambient particles ────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

function LoadingParticles() {
  const particles: Particle[] = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: 5 + (i / 18) * 90,
    size: 2 + (i % 3) * 1.5,
    delay: (i * 0.37) % 4,
    duration: 5 + (i % 5),
    color: i % 3 === 0 ? "#FFD700" : i % 3 === 1 ? "#FFEC80" : "#ffffff",
  }));

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            bottom: `-${p.size * 2}px`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            opacity: 0.7,
            animation: `wls-floatUp ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
