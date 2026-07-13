import type { EmoteType } from "../types/game";
import { EMOTE_ICONS } from "../types/game";

// ─── Emote Panel ──────────────────────────────────────────────────────────────

interface EmotePanelProps {
  isOpen: boolean;
  onEmoteSelect: (emote: EmoteType) => void;
  onClose: () => void;
}

const EMOTE_LIST: { type: EmoteType; label: string }[] = [
  { type: "wave", label: "Wave" },
  { type: "thumbsUp", label: "Nice" },
  { type: "heart", label: "Love" },
  { type: "confused", label: "Huh?" },
];

export default function EmotePanel({
  isOpen,
  onEmoteSelect,
  onClose,
}: EmotePanelProps) {
  if (!isOpen) return null;

  const handleSelect = (emote: EmoteType) => {
    onEmoteSelect(emote);
    onClose();
  };

  return (
    <>
      {/* Transparent backdrop to close panel when tapping outside */}
      <div
        className="fixed inset-0 z-40"
        role="button"
        tabIndex={-1}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        aria-label="Close emote picker"
        data-ocid="emote-panel-backdrop"
      />

      {/* Emote panel */}
      <dialog
        open
        className="emote-panel pointer-events-auto"
        aria-label="Emote picker"
        data-ocid="emote-panel"
      >
        <div className="emote-panel-label">Emote</div>
        <div className="emote-panel-grid">
          {EMOTE_LIST.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              aria-label={label}
              data-ocid={`emote-btn-${type}`}
              className="emote-panel-btn"
              onClick={() => handleSelect(type)}
              onTouchStart={(e) => {
                e.preventDefault();
                handleSelect(type);
              }}
            >
              <span className="emote-panel-icon" aria-hidden="true">
                {EMOTE_ICONS[type]}
              </span>
              <span className="emote-panel-btn-label">{label}</span>
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
