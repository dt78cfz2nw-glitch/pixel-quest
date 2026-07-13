import { useEffect, useRef } from "react";
import { playLevelUp } from "../lib/audio";

// ─── ZoneDiscoveryPopup ───────────────────────────────────────────────────────
// Animated overlay shown when the player discovers a new zone for the first time.
// pointer-events: none — does not block game interaction underneath.
// Total animation: 0.3s fade-in → 2.4s visible → 0.3s fade-out = 3s total.

interface ZoneDiscoveryPopupProps {
  /** Display name of the discovered zone */
  zoneName: string;
  /** Called after the full 3s animation completes */
  onComplete: () => void;
}

export function ZoneDiscoveryPopup({
  zoneName,
  onComplete,
}: ZoneDiscoveryPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Play chime on mount and schedule completion
  useEffect(() => {
    // Reuse level-up chime — a positive triumphant sound
    try {
      playLevelUp();
    } catch {
      // Audio not available — non-fatal
    }

    const timer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 90,
        animation: "discovery-fade 3s ease forwards",
      }}
      data-ocid="zone-discovery-popup"
    >
      {/* Zone name — large centered */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "clamp(22px, 4vw, 32px)",
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textShadow:
            "0 0 20px rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.8)",
          textAlign: "center",
          padding: "0 12px",
        }}
      >
        {zoneName}
      </div>

      {/* Achievement banner */}
      <div
        style={{
          marginTop: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "clamp(12px, 2.5vw, 16px)",
          fontWeight: 600,
          color: "#FFD700",
          letterSpacing: "0.06em",
          textShadow:
            "0 0 12px rgba(255, 215, 0, 0.7), 0 2px 6px rgba(0,0,0,0.8)",
          textAlign: "center",
          padding: "4px 16px 5px",
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,215,0,0.35)",
          borderRadius: 4,
        }}
      >
        ✦ Discovered: {zoneName}! ✦
      </div>

      <style>{`
        @keyframes discovery-fade {
          0%   { opacity: 0; transform: translateY(8px); }
          10%  { opacity: 1; transform: translateY(0);   }
          80%  { opacity: 1; transform: translateY(0);   }
          100% { opacity: 0; transform: translateY(-6px);}
        }
      `}</style>
    </div>
  );
}
