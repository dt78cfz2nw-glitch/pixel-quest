import { useEffect, useRef } from "react";
import type { OtherPlayer } from "../types/game";

// ─── Title labels ─────────────────────────────────────────────────────────────

const TITLE_LABELS: Record<string, string> = {
  novice: "Novice",
  monster_hunter: "Monster Hunter",
  treasure_seeker: "Treasure Seeker",
  survivor: "Survivor",
  veteran: "Veteran",
  champion: "Champion",
  pirate_slayer: "Pirate Slayer",
  ghost: "Ghost",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlayerInspectPopupProps {
  player: OtherPlayer & {
    activeTitle?: string;
    guildName?: string;
  };
  /** Pixel position relative to viewport where the tap occurred */
  tapX: number;
  tapY: number;
  currentPlayerPrincipal: string;
  onAddFriend: (username: string) => void;
  onWhisper: (username: string) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlayerInspectPopup({
  player,
  tapX,
  tapY,
  onAddFriend,
  onWhisper,
  onClose,
}: PlayerInspectPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const POPUP_W = 240;
  const POPUP_H = 200;

  // ── Reposition popup to stay within viewport bounds ────────────────────────

  const clampedX = Math.min(tapX, window.innerWidth - POPUP_W - 12);
  const clampedY =
    tapY + POPUP_H > window.innerHeight - 60 ? tapY - POPUP_H - 8 : tapY + 8;

  // ── Dismiss on Escape key ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const classIcon = player.selectedClass === "mage" ? "🔮" : "⚔";
  const titleText = player.activeTitle
    ? (TITLE_LABELS[player.activeTitle] ?? player.activeTitle)
    : null;
  const guildText = player.guildName ?? null;

  // ── Cannot inspect guests ──────────────────────────────────────────────────

  if (player.isGuest) {
    return (
      <>
        <div
          data-ocid="player_inspect.dialog"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: "oklch(0 0 0 / 0.4)",
          }}
          onPointerDown={onClose}
        />
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            left: Math.max(8, clampedX),
            top: Math.max(8, clampedY),
            width: POPUP_W,
            background: "oklch(0.18 0.04 265)",
            border: "1.5px solid oklch(0.32 0.07 265)",
            borderRadius: 12,
            padding: 16,
            zIndex: 301,
            boxShadow: "0 8px 28px oklch(0 0 0 / 0.6)",
            animation: "popupSlideUp 0.18s ease-out",
          }}
        >
          <p
            style={{
              color: "oklch(0.6 0.05 265)",
              fontSize: 13,
              margin: 0,
              textAlign: "center",
            }}
          >
            Cannot inspect guest players
          </p>
        </div>
        <style>
          {
            "@keyframes popupSlideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }"
          }
        </style>
      </>
    );
  }

  return (
    <>
      {/* Background overlay */}
      <div
        data-ocid="player_inspect.dialog"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 300,
          background: "oklch(0 0 0 / 0.4)",
        }}
        onPointerDown={onClose}
      />

      {/* Popup card */}
      <div
        ref={popupRef}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: Math.max(8, clampedX),
          top: Math.max(8, clampedY),
          width: POPUP_W,
          background: "oklch(0.18 0.04 265)",
          border: "1.5px solid oklch(0.38 0.09 265)",
          borderRadius: 12,
          padding: "14px 16px",
          zIndex: 301,
          boxShadow: "0 8px 28px oklch(0 0 0 / 0.6)",
          animation: "popupSlideUp 0.18s ease-out",
        }}
      >
        {/* Close button */}
        <button
          type="button"
          data-ocid="player_inspect.close_button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            color: "oklch(0.5 0.05 265)",
            fontSize: 16,
            cursor: "pointer",
            minHeight: 32,
            minWidth: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>

        {/* Character name */}
        <div style={{ marginBottom: 2, paddingRight: 24 }}>
          <span
            style={{
              color: "oklch(0.90 0.08 265)",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {player.username}
          </span>
        </div>

        {/* Title */}
        {titleText && (
          <div
            style={{
              color: "oklch(0.80 0.18 80)",
              fontSize: 12,
              fontStyle: "italic",
              marginBottom: 6,
            }}
          >
            [{titleText}]
          </div>
        )}

        {/* Class + Level */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>{classIcon}</span>
          <span
            style={{
              color: "oklch(0.75 0.07 265)",
              fontSize: 13,
              textTransform: "capitalize",
            }}
          >
            {player.selectedClass}
          </span>
          <span
            style={{
              background: "oklch(0.28 0.06 265)",
              color: "oklch(0.75 0.08 265)",
              borderRadius: 5,
              padding: "1px 7px",
              fontSize: 11,
              fontWeight: 700,
              marginLeft: "auto",
            }}
          >
            Lv {player.level ?? 1}
          </span>
        </div>

        {/* Guild */}
        <div
          style={{
            color: "oklch(0.55 0.05 265)",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {guildText ? (
            <span style={{ color: "oklch(0.70 0.14 195)" }}>
              🏰 {guildText}
            </span>
          ) : (
            <span>No guild</span>
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "oklch(0.28 0.06 265)",
            marginBottom: 10,
          }}
        />

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            data-ocid="player_inspect.add_friend_button"
            onClick={() => {
              onAddFriend(player.username);
              onClose();
            }}
            style={{
              flex: 1,
              background: "oklch(0.42 0.14 265)",
              border: "1px solid oklch(0.50 0.16 265)",
              borderRadius: 8,
              color: "oklch(0.92 0.06 265)",
              fontSize: 12,
              padding: "8px 4px",
              cursor: "pointer",
              minHeight: 44,
              fontWeight: 600,
            }}
          >
            👤 Add Friend
          </button>
          <button
            type="button"
            data-ocid="player_inspect.whisper_button"
            onClick={() => {
              onWhisper(player.username);
              onClose();
            }}
            style={{
              flex: 1,
              background: "oklch(0.38 0.14 290)",
              border: "1px solid oklch(0.48 0.18 290)",
              borderRadius: 8,
              color: "oklch(0.92 0.06 265)",
              fontSize: 12,
              padding: "8px 4px",
              cursor: "pointer",
              minHeight: 44,
              fontWeight: 600,
            }}
          >
            💬 Whisper
          </button>
        </div>
      </div>

      <style>{`
        @keyframes popupSlideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
