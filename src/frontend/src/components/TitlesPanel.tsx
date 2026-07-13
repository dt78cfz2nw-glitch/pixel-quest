import { useEffect, useState } from "react";
import type { TitleId } from "../types/game";
import { TITLE_LABELS } from "../types/game";

// ─── Title metadata ───────────────────────────────────────────────────────────

interface TitleMeta {
  id: TitleId;
  label: string;
  description: string;
  icon: string;
}

const TITLE_META: TitleMeta[] = [
  {
    id: "novice",
    label: "Novice",
    description: "Default title — all adventurers begin here.",
    icon: "🌱",
  },
  {
    id: "monster_hunter",
    label: "Monster Hunter",
    description: "Kill 100 monsters in total.",
    icon: "⚔",
  },
  {
    id: "treasure_seeker",
    label: "Treasure Seeker",
    description: "Collect 10 treasure chests from world events.",
    icon: "💰",
  },
  {
    id: "survivor",
    label: "Survivor",
    description: "Survive 10 minutes in a PVP zone without dying.",
    icon: "🛡",
  },
  {
    id: "veteran",
    label: "Veteran",
    description: "Reach level 20.",
    icon: "✦",
  },
  {
    id: "champion",
    label: "Champion",
    description: "Reach level 40.",
    icon: "👑",
  },
  {
    id: "pirate_slayer",
    label: "Pirate Slayer",
    description: "Defeat 50 pirates on Pirate Island.",
    icon: "🏴‍☠️",
  },
  {
    id: "ghost",
    label: "Ghost",
    description: "Kill 3 players in PVP without dying once.",
    icon: "👻",
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface TitlesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  earnedTitles: TitleId[];
  activeTitleId: TitleId;
  isGuest: boolean;
  onSelectTitle: (titleId: TitleId) => void;
}

// ─── TitlesPanel Component ────────────────────────────────────────────────────

export function TitlesPanel({
  isOpen,
  onClose,
  earnedTitles,
  activeTitleId,
  isGuest,
  onSelectTitle,
}: TitlesPanelProps) {
  const [panelVisible, setPanelVisible] = useState(false);

  // Slide-in animation
  useEffect(() => {
    if (!isOpen) {
      setPanelVisible(false);
      return;
    }
    const t = setTimeout(() => setPanelVisible(true), 10);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Escape key closes panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{
          background: "rgba(0,0,0,0.55)",
          zIndex: 200,
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        aria-hidden="true"
        data-ocid="titles-panel.backdrop"
      />

      {/* Panel — slides up from bottom */}
      <dialog
        open
        className="fixed inset-x-0 bottom-0 flex justify-center bg-transparent p-0 m-0 max-w-none max-h-none w-full"
        style={{ zIndex: 201, pointerEvents: "none", border: "none" }}
        data-ocid="titles-panel.dialog"
        aria-label="Titles"
      >
        <div
          style={{
            width: "min(520px, 100vw)",
            maxHeight: "88vh",
            background: "rgba(0,0,0,0.92)",
            border: "1px solid oklch(0.82 0.16 85 / 0.45)",
            borderBottom: "none",
            borderRadius: "8px 8px 0 0",
            boxShadow:
              "0 -8px 48px rgba(0,0,0,0.7), 0 0 0 1px oklch(0.82 0.16 85 / 0.15)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
            transform: panelVisible ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 10px",
              borderBottom: "1px solid oklch(0.22 0 0 / 0.7)",
              flexShrink: 0,
            }}
          >
            <div>
              <div
                className="font-mono font-bold tracking-widest uppercase"
                style={{
                  fontSize: "clamp(0.85rem, 3vw, 1.05rem)",
                  color: "#FFE87C",
                  textShadow: "0 0 12px rgba(255,232,124,0.4)",
                  letterSpacing: "0.2em",
                }}
              >
                🎖 Titles
              </div>
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: 9,
                  color: "oklch(0.38 0 0)",
                  marginTop: 2,
                  letterSpacing: "0.1em",
                }}
              >
                Select your active title
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-ocid="titles-panel.close_button"
              className="font-mono text-sm transition-colors hover:opacity-80"
              style={{
                color: "oklch(0.50 0 0)",
                border: "1px solid oklch(0.28 0 0 / 0.6)",
                borderRadius: 3,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
              }}
              aria-label="Close titles panel"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div style={{ overflow: "auto", flex: 1, padding: "8px 0 12px" }}>
            {isGuest ? (
              // Guest message
              <div
                className="flex flex-col items-center justify-center py-10 px-6 text-center"
                data-ocid="titles-panel.empty_state"
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>🔒</span>
                <p
                  className="font-mono uppercase tracking-widest text-sm"
                  style={{ color: "oklch(0.55 0 0)" }}
                >
                  Titles unavailable
                </p>
                <p
                  className="font-mono text-xs mt-2 tracking-wider"
                  style={{
                    color: "oklch(0.38 0 0)",
                    maxWidth: 280,
                    lineHeight: 1.6,
                  }}
                >
                  Titles are not available for guest accounts. Login with
                  Internet Identity to earn and equip titles.
                </p>
              </div>
            ) : (
              // Title list
              <div style={{ padding: "0 8px" }}>
                {TITLE_META.map((meta) => {
                  const earned = earnedTitles.includes(meta.id);
                  const isActive = activeTitleId === meta.id;
                  return (
                    <TitleRow
                      key={meta.id}
                      meta={meta}
                      earned={earned}
                      isActive={isActive}
                      onSelect={() => earned && onSelectTitle(meta.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {!isGuest && (
            <div
              style={{
                padding: "8px 16px 14px",
                borderTop: "1px solid oklch(0.18 0 0)",
                flexShrink: 0,
              }}
            >
              <p
                className="font-mono text-center"
                style={{
                  fontSize: 9,
                  color: "oklch(0.32 0 0)",
                  letterSpacing: "0.06em",
                }}
              >
                {earnedTitles.length}/{TITLE_META.length} titles earned · active
                title shown above your name in yellow
              </p>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

// ─── Title Row ────────────────────────────────────────────────────────────────

function TitleRow({
  meta,
  earned,
  isActive,
  onSelect,
}: {
  meta: TitleMeta;
  earned: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!earned}
      data-ocid={`titles-panel.title.${meta.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        minHeight: 52,
        padding: "8px 12px",
        marginBottom: 3,
        background: isActive
          ? "rgba(255,232,124,0.08)"
          : earned
            ? "rgba(255,255,255,0.03)"
            : "transparent",
        border: isActive
          ? "1px solid rgba(255,232,124,0.5)"
          : earned
            ? "1px solid oklch(0.28 0 0 / 0.5)"
            : "1px solid oklch(0.18 0 0 / 0.4)",
        borderRadius: 4,
        cursor: earned ? "pointer" : "default",
        opacity: earned ? 1 : 0.45,
        textAlign: "left",
        transition: "background 0.12s, border-color 0.12s",
      }}
      aria-pressed={isActive}
      aria-label={`${meta.label} title${!earned ? " — locked" : isActive ? " — active" : ""}`}
    >
      {/* Icon */}
      <span
        style={{
          fontSize: 20,
          width: 28,
          textAlign: "center",
          flexShrink: 0,
          filter: earned ? "none" : "grayscale(0.8) brightness(0.5)",
        }}
        aria-hidden="true"
      >
        {meta.icon}
      </span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="font-mono font-bold"
          style={{
            fontSize: 11,
            color: isActive
              ? "#FFE87C"
              : earned
                ? "oklch(0.86 0 0)"
                : "oklch(0.42 0 0)",
            letterSpacing: "0.04em",
            textShadow: isActive ? "0 0 8px rgba(255,232,124,0.4)" : "none",
          }}
        >
          [{TITLE_LABELS[meta.id]}]
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 9,
            color: earned ? "oklch(0.50 0 0)" : "oklch(0.32 0 0)",
            marginTop: 2,
            letterSpacing: "0.02em",
          }}
        >
          {meta.description}
        </div>
      </div>

      {/* Status indicator */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        {isActive ? (
          <span
            style={{
              fontSize: 9,
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              padding: "2px 7px",
              background: "rgba(255,232,124,0.18)",
              border: "1px solid rgba(255,232,124,0.5)",
              borderRadius: 2,
              color: "#FFE87C",
              fontWeight: 700,
            }}
          >
            ACTIVE
          </span>
        ) : earned ? (
          <span
            style={{
              fontSize: 9,
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              padding: "2px 7px",
              background: "oklch(0.15 0.04 145 / 0.5)",
              border: "1px solid oklch(0.30 0.1 145 / 0.4)",
              borderRadius: 2,
              color: "oklch(0.62 0.16 145)",
            }}
          >
            EQUIP
          </span>
        ) : (
          <span
            style={{
              fontSize: 12,
              color: "oklch(0.30 0 0)",
            }}
            aria-label="Locked"
          >
            🔒
          </span>
        )}
      </div>
    </button>
  );
}
