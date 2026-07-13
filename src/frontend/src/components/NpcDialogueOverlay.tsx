import { useRef } from "react";
import type { NpcDefinition } from "../types/game";

// ─── NPC name accent colors ───────────────────────────────────────────────────

const NPC_NAME_COLORS: Record<NpcDefinition["spriteType"], string> = {
  guide: "oklch(0.72 0.16 145)",
  shopkeeper: "oklch(0.72 0.18 85)",
  villager: "oklch(0.65 0.18 240)",
  guard: "oklch(0.60 0.15 30)",
};

const NPC_BAR_COLORS: Record<NpcDefinition["spriteType"], string> = {
  guide: "oklch(0.42 0.16 145 / 0.6)",
  shopkeeper: "oklch(0.42 0.18 85 / 0.6)",
  villager: "oklch(0.40 0.18 240 / 0.6)",
  guard: "oklch(0.38 0.15 30 / 0.6)",
};

// ─── NpcDialogueOverlay ────────────────────────────────────────────────────────

interface NpcDialogueOverlayProps {
  npc: NpcDefinition | null;
  lineIndex: number;
  onDismiss: () => void;
  onNextLine: () => void;
  /** Called when the crafting_table NPC is interacted with (non-guest only) */
  onOpenCrafting?: () => void;
  /** Called when the guild_master NPC is interacted with (non-guest only) */
  onOpenGuild?: () => void;
  isGuest?: boolean;
}

export function NpcDialogueOverlay({
  npc,
  lineIndex,
  onDismiss,
  onNextLine,
  onOpenCrafting,
  onOpenGuild,
  isGuest = false,
}: NpcDialogueOverlayProps) {
  // Debounce ref — prevents rapid tapping through all lines
  const lastAdvanceRef = useRef<number>(0);

  if (!npc) return null;

  const isCraftingNpc = npc.id === "crafting_table";
  const isGuildMasterNpc = npc.id === "guild_master";
  const line = npc.dialogue[lineIndex] ?? "";
  const isLast = lineIndex >= npc.dialogue.length - 1;
  const totalLines = npc.dialogue.length;
  const nameColor = NPC_NAME_COLORS[npc.spriteType];
  const barColor = NPC_BAR_COLORS[npc.spriteType];

  function handleAdvance() {
    const now = Date.now();
    if (now - lastAdvanceRef.current < 300) return; // 300ms debounce
    lastAdvanceRef.current = now;
    if (isLast) {
      // For crafting NPC (non-guest), open crafting panel on finish
      if (isCraftingNpc && !isGuest && onOpenCrafting) {
        onDismiss();
        onOpenCrafting();
      } else if (isGuildMasterNpc && !isGuest && onOpenGuild) {
        onDismiss();
        onOpenGuild();
      } else {
        onDismiss();
      }
    } else {
      onNextLine();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleAdvance();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  }

  // Dot progress indicator (filled = visited, empty = upcoming)
  const maxDots = Math.min(totalLines, 7);
  const dotsToShow =
    totalLines <= maxDots
      ? totalLines
      : lineIndex < maxDots - 1
        ? maxDots
        : maxDots;
  const dotOffset = Math.max(0, lineIndex - (maxDots - 2));

  return (
    <div
      className="absolute inset-x-0 pointer-events-auto"
      style={{
        bottom: "28%",
        zIndex: 45,
        padding: "0 10px",
      }}
      data-ocid="npc-dialogue-overlay"
    >
      <div
        style={{
          maxWidth: 360,
          margin: "0 auto",
          background: "rgba(240, 236, 225, 0.97)",
          border: "2px solid rgba(0,0,0,0.18)",
          borderRadius: 6,
          boxShadow:
            "0 4px 24px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.6) inset",
          overflow: "hidden",
        }}
      >
        {/* NPC name header bar */}
        <div
          style={{
            background: barColor,
            padding: "7px 14px 6px",
            borderBottom: "1px solid rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: nameColor,
            }}
            data-ocid="npc-dialogue-name"
          >
            {npc.name}
          </span>
          {/* Dot progress indicator */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {Array.from({ length: dotsToShow }, (_, i) => {
              const realIdx = i + dotOffset;
              const filled = realIdx <= lineIndex;
              const isCurrent = realIdx === lineIndex;
              return (
                <span
                  key={realIdx}
                  aria-hidden="true"
                  style={{
                    width: isCurrent ? 8 : 6,
                    height: isCurrent ? 8 : 6,
                    borderRadius: "50%",
                    background: filled ? nameColor : "rgba(0,0,0,0.18)",
                    display: "inline-block",
                    transition: "all 0.15s",
                    boxShadow: isCurrent ? `0 0 4px ${nameColor}` : "none",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Dialogue text */}
        <div style={{ padding: "12px 14px 10px" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "sans-serif",
              fontSize: 15,
              lineHeight: 1.55,
              color: "#1a1a2e",
              wordBreak: "break-word",
              minHeight: "2.8em",
            }}
            data-ocid="npc-dialogue-text"
          >
            {line}
          </p>

          {/* Controls row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              marginTop: 10,
              gap: 8,
            }}
          >
            {/* Close/dismiss button always visible */}
            <button
              type="button"
              aria-label="Close dialogue"
              onClick={onDismiss}
              onKeyDown={handleKeyDown}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "4px 10px",
                background: "rgba(0,0,0,0.06)",
                border: "1px solid rgba(0,0,0,0.18)",
                borderRadius: 4,
                color: "#666",
                cursor: "pointer",
              }}
              data-ocid="npc-dialogue-close"
            >
              CLOSE
            </button>

            {/* Advance / last-line button */}
            <button
              type="button"
              onClick={handleAdvance}
              onKeyDown={handleKeyDown}
              aria-label={
                isLast
                  ? isCraftingNpc && !isGuest
                    ? "Open crafting panel"
                    : isGuildMasterNpc && !isGuest
                      ? "Open guild hall"
                      : "Close NPC dialogue"
                  : "Next dialogue line"
              }
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "5px 14px",
                background:
                  isLast && (isCraftingNpc || isGuildMasterNpc) && !isGuest
                    ? nameColor
                    : isLast
                      ? "rgba(0,0,0,0.08)"
                      : nameColor,
                border: `1.5px solid ${isLast && !((isCraftingNpc || isGuildMasterNpc) && !isGuest) ? "rgba(0,0,0,0.18)" : nameColor}`,
                borderRadius: 4,
                color:
                  isLast && !((isCraftingNpc || isGuildMasterNpc) && !isGuest)
                    ? "#555"
                    : "#fff",
                cursor: "pointer",
                minWidth: 80,
              }}
              data-ocid={isLast ? "npc-dialogue-finish" : "npc-dialogue-next"}
            >
              {isLast
                ? isCraftingNpc && !isGuest
                  ? "CRAFT ⚒"
                  : isGuildMasterNpc && !isGuest
                    ? "GUILD HALL ⚔"
                    : "GOODBYE ✕"
                : "NEXT ▶"}
            </button>
          </div>
        </div>
      </div>

      {/* Speech tail decoration */}
      <div
        aria-hidden="true"
        style={{
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: "8px solid rgba(240,236,225,0.97)",
          margin: "0 auto",
          display: "block",
        }}
      />
    </div>
  );
}
