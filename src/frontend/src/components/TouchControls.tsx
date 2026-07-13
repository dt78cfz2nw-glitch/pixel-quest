import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CharacterClass,
  Direction,
  EmoteType,
  FacingDirection,
  MonsterEntity,
  QuickSlots,
  TileTypeValue,
  ZoneId,
} from "../types/game";
import { PORTRAIT_BOTTOM_BAR_HEIGHT } from "../types/game";
import EmotePanel from "./EmotePanel";
import { Minimap } from "./Minimap";

// ─── Touch Controls ───────────────────────────────────────────────────────────

interface TouchControlsProps {
  onDirection: (dir: Direction) => void;
  onDpadPress?: (dir: Direction) => void;
  onDpadRelease?: (dir: Direction) => void;
  onRotate?: () => void;
  visible: boolean;
  onEmote?: (emote: EmoteType) => void;
  onAttack?: () => void;
  onFrostNova?: () => void;
  onShadowLance?: () => void;
  onFlameRing?: () => void;
  onShield?: () => void;
  characterClass?: CharacterClass;
  onOpenChat?: () => void;
  onInventoryToggle?: () => void;
  audioEnabled?: boolean;
  onAudioToggle?: () => void;
  isTransitioning?: boolean;
  inventoryItemCount?: number;
  frostNovaCooldownPct?: number;
  shadowLanceCooldownPct?: number;
  flameRingCooldownPct?: number;
  frostNovaCooldownMs?: number;
  shadowLanceCooldownMs?: number;
  currentMp?: number;
  maxMp?: number;
  noManaShakeSpell?: string | null;
  mpBarPulse?: boolean;
  onNoManaFeedback?: (spellId: string) => void;
  isGuest?: boolean;
  potionCount?: number;
  potionCooldownPct?: number;
  onUsePotion?: () => void;
  manaPotionCount?: number;
  manaPotionCooldownPct?: number;
  onUseManaPotion?: () => void;
  shieldCooldownMs?: number;
  shieldActive?: boolean;
  portraitBottomBar?: boolean;
  /** Callback for map button */
  onOpenMap?: () => void;
  /** Whether the world map is currently open (for active state styling) */
  isMapOpen?: boolean;
  /** Quick slots (4 items above action buttons) */
  quickSlots?: QuickSlots;
  /** Called when a quick slot is used (tap) */
  onUseQuickSlot?: (slotIndex: number) => void;
  /** Per-slot item count (from inventory) */
  quickSlotCounts?: [number, number, number, number];
  /** Dodge cooldown remaining (0-4000ms) */
  dodgeCooldownMs?: number;
  /** Whether player is currently dodging (invincible) */
  isDodging?: boolean;
  /** Whether player is stunned */
  isStunned?: boolean;
  // ── Minimap props (panel mode in controls) ──
  minimapTiles?: TileTypeValue[][];
  minimapPlayerX?: number;
  minimapPlayerY?: number;
  minimapZoneId?: ZoneId;
  minimapFacing?: FacingDirection;
  minimapMonsters?: MonsterEntity[];
  minimapTimestamp?: number;
  onMinimapTap?: () => void;
}

// ─── Class Identity Constants ─────────────────────────────────────────────────
export const WARRIOR_OUTFITS = [
  "plate_heavy",
  "plate_feminine",
  "chainmail_open",
  "chainmail_vest",
  "leather_hood",
  "leather_outfit",
] as const;

export const MAGE_OUTFITS = [
  "robe_long",
  "robe_elegant",
  "robe_short",
  "robe_short_feminine",
  "cloak_dark",
  "cloak_hood",
] as const;

export const VALID_CLASS_OUTFITS: Record<string, readonly string[]> = {
  warrior: WARRIOR_OUTFITS,
  mage: MAGE_OUTFITS,
};

// ─── D-pad config ─────────────────────────────────────────────────────────────
type DPadKind = "cardinal" | "diagonal" | "rotate";

interface DPadEntry {
  kind: DPadKind;
  dir?: Direction;
  label?: string;
  ariaLabel?: string;
  row: number;
  col: number;
  arrowAngle?: number;
}

const DPAD_ENTRIES: DPadEntry[] = [
  {
    kind: "cardinal",
    dir: "up",
    ariaLabel: "Move up",
    row: 0,
    col: 1,
    arrowAngle: 0,
  },
  {
    kind: "cardinal",
    dir: "left",
    ariaLabel: "Move left",
    row: 1,
    col: 0,
    arrowAngle: 270,
  },
  {
    kind: "cardinal",
    dir: "right",
    ariaLabel: "Move right",
    row: 1,
    col: 2,
    arrowAngle: 90,
  },
  {
    kind: "cardinal",
    dir: "down",
    ariaLabel: "Move down",
    row: 2,
    col: 1,
    arrowAngle: 180,
  },
  {
    kind: "diagonal",
    dir: "up-left",
    ariaLabel: "Move up-left",
    row: 0,
    col: 0,
    arrowAngle: 315,
  },
  {
    kind: "diagonal",
    dir: "up-right",
    ariaLabel: "Move up-right",
    row: 0,
    col: 2,
    arrowAngle: 45,
  },
  {
    kind: "diagonal",
    dir: "down-left",
    ariaLabel: "Move down-left",
    row: 2,
    col: 0,
    arrowAngle: 225,
  },
  {
    kind: "diagonal",
    dir: "down-right",
    ariaLabel: "Move down-right",
    row: 2,
    col: 2,
    arrowAngle: 135,
  },
  { kind: "rotate", row: 1, col: 1 },
];

const CARDINAL_SIZE = 46;
const DIAGONAL_SIZE = 33;
const ROTATE_SIZE = 30;
const CELL = 50;
const GRID_GAP = 3;
const GRID_SIZE = CELL * 3 + GRID_GAP * 2;
const UTILITY_SIZE = 40;

// ─── Triangle Arrow SVG ───────────────────────────────────────────────────────
function TriangleArrow({
  size,
  angle,
  color = "white",
  opacity = 0.9,
}: {
  size: number;
  angle: number;
  color?: string;
  opacity?: number;
}) {
  const half = size / 2;
  const pts = [half, ",4 ", size - 4, ",", size - 4, " 4,", size - 4].join("");
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        display: "block",
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))",
      }}
    >
      <polygon
        points={pts}
        fill={color}
        opacity={opacity}
        transform={`rotate(${angle}, ${half}, ${half})`}
      />
    </svg>
  );
}

// ─── CooldownArc SVG ──────────────────────────────────────────────────────────
function CooldownArc({ pct, size }: { pct: number; size: number }) {
  if (pct <= 0) return null;
  const r = size / 2 - 3;
  const cx = size / 2;
  const cy = size / 2;
  const angle = pct * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const largeArc = angle > Math.PI ? 1 : 0;
  const d = `M ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} L ${cx} ${cy} Z`;
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
      width={size}
      height={size}
    >
      <path d={d} fill="oklch(0 0 0 / 0.65)" />
    </svg>
  );
}

// ─── Quick slot icon map ───────────────────────────────────────────────────────
const QUICK_SLOT_ICONS: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  health_potion: { icon: "❤️", label: "HP", color: "oklch(0.60 0.22 25)" },
  mana_potion: { icon: "💧", label: "MP", color: "oklch(0.55 0.22 265)" },
  large_health_potion: {
    icon: "❤️‍🔥",
    label: "LHP",
    color: "oklch(0.55 0.22 25)",
  },
  mana_crystal: { icon: "💎", label: "MC", color: "oklch(0.60 0.20 200)" },
  poison_vial: { icon: "🧪", label: "POI", color: "oklch(0.55 0.20 140)" },
  warrior_emblem: { icon: "🔱", label: "WE", color: "oklch(0.65 0.22 30)" },
  mage_focus: { icon: "✦", label: "MF", color: "oklch(0.60 0.22 265)" },
};

// ─── TouchControls ────────────────────────────────────────────────────────────
export default function TouchControls({
  onDirection,
  onDpadPress,
  onDpadRelease,
  onRotate,
  visible,
  onEmote,
  onAttack,
  onFrostNova,
  onShadowLance,
  onFlameRing,
  onShield,
  characterClass = "warrior",
  onOpenChat,
  onInventoryToggle,
  audioEnabled = true,
  onAudioToggle,
  isTransitioning = false,
  inventoryItemCount = 0,
  frostNovaCooldownPct = 0,
  shadowLanceCooldownPct = 0,
  flameRingCooldownPct = 0,
  frostNovaCooldownMs = 0,
  shadowLanceCooldownMs = 0,
  currentMp = 50,
  maxMp = 100,
  noManaShakeSpell = null,
  mpBarPulse = false,
  onNoManaFeedback,
  isGuest = false,
  potionCount = 0,
  potionCooldownPct = 0,
  onUsePotion,
  manaPotionCount = 0,
  manaPotionCooldownPct = 0,
  onUseManaPotion,
  shieldCooldownMs = 0,
  shieldActive = false,
  portraitBottomBar = false,
  onOpenMap: _onOpenMap,
  isMapOpen: _isMapOpen = false,
  quickSlots = [null, null, null, null],
  onUseQuickSlot,
  quickSlotCounts = [0, 0, 0, 0],
  dodgeCooldownMs = 0,
  isDodging = false,
  isStunned = false,
  minimapTiles,
  minimapPlayerX = 0,
  minimapPlayerY = 0,
  minimapZoneId,
  minimapFacing = "down",
  minimapMonsters = [],
  minimapTimestamp = 0,
  onMinimapTap,
}: TouchControlsProps) {
  const [activeDirs, setActiveDirs] = useState<Set<Direction>>(new Set());
  const [rotateActive, setRotateActive] = useState(false);
  const [attackActive, setAttackActive] = useState(false);
  const [frostActive, setFrostActive] = useState(false);
  const [lanceActive, setLanceActive] = useState(false);
  const [flameActive, setFlameActive] = useState(false);
  const [shieldPressed, setShieldPressed] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [flashDir, setFlashDir] = useState<Direction | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [spellShake, setSpellShake] = useState(false);
  const prevLowManaRef = useRef(false);
  const mpRatio = maxMp > 0 ? currentMp / maxMp : 1;
  const isLowMana = mpRatio < 0.2;

  useEffect(() => {
    if (characterClass !== "mage") return;
    if (isLowMana && !prevLowManaRef.current) {
      setSpellShake(true);
      const t = setTimeout(() => setSpellShake(false), 450);
      return () => clearTimeout(t);
    }
    prevLowManaRef.current = isLowMana;
  }, [isLowMana, characterClass]);

  const shakeArcane =
    noManaShakeSpell === "arcane" || noManaShakeSpell === "attack";
  const shakeFrost = noManaShakeSpell === "frost";
  const shakeShadow = noManaShakeSpell === "shadow";
  const shakeFlame = noManaShakeSpell === "flame";
  const shakeShield = noManaShakeSpell === "shield";

  const handleDirPress = useCallback(
    (dir: Direction) => (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveDirs((prev) => {
        const n = new Set(prev);
        n.add(dir);
        return n;
      });
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setFlashDir(dir);
      flashTimerRef.current = setTimeout(() => setFlashDir(null), 100);
      if (onDpadPress) onDpadPress(dir);
      else onDirection(dir);
    },
    [onDpadPress, onDirection],
  );

  const handleDirRelease = useCallback(
    (dir: Direction) => (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      setActiveDirs((prev) => {
        const n = new Set(prev);
        n.delete(dir);
        return n;
      });
      onDpadRelease?.(dir);
    },
    [onDpadRelease],
  );

  const handleRotatePress = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setRotateActive(true);
      onRotate?.();
    },
    [onRotate],
  );
  const handleRotateEnd = useCallback(() => setRotateActive(false), []);

  const handleAttackStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAttackActive(true);
      const mpCost = characterClass === "warrior" ? 0 : 4;
      if (mpCost > 0 && currentMp < mpCost) {
        onNoManaFeedback?.(characterClass === "warrior" ? "attack" : "arcane");
        return;
      }
      onAttack?.();
    },
    [onAttack, characterClass, currentMp, onNoManaFeedback],
  );
  const handleAttackEnd = useCallback(() => setAttackActive(false), []);

  const handleFrostNovaStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFrostActive(true);
      if (currentMp < 10) {
        onNoManaFeedback?.("frost");
        return;
      }
      onFrostNova?.();
    },
    [onFrostNova, currentMp, onNoManaFeedback],
  );
  const handleFrostNovaEnd = useCallback(() => setFrostActive(false), []);

  const handleShadowLanceStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLanceActive(true);
      if (currentMp < 15) {
        onNoManaFeedback?.("shadow");
        return;
      }
      onShadowLance?.();
    },
    [onShadowLance, currentMp, onNoManaFeedback],
  );
  const handleShadowLanceEnd = useCallback(() => setLanceActive(false), []);

  const handleFlameRingStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFlameActive(true);
      if (currentMp < 12) {
        onNoManaFeedback?.("flame");
        return;
      }
      onFlameRing?.();
    },
    [onFlameRing, currentMp, onNoManaFeedback],
  );
  const handleFlameRingEnd = useCallback(() => setFlameActive(false), []);

  const handleShieldStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShieldPressed(true);
      if (currentMp < 40) {
        onNoManaFeedback?.("shield");
        return;
      }
      onShield?.();
    },
    [onShield, currentMp, onNoManaFeedback],
  );
  const handleShieldEnd = useCallback(() => setShieldPressed(false), []);

  const handleEmoteSelect = useCallback(
    (emote: EmoteType) => {
      onEmote?.(emote);
      setEmoteOpen(false);
    },
    [onEmote],
  );

  if (!visible) return null;

  const isWarrior = characterClass === "warrior";
  const attackMpCost = isWarrior ? 0 : 4;
  const notEnoughAttackMp = attackMpCost > 0 && currentMp < attackMpCost;

  const dpadAccent = isWarrior
    ? "oklch(0.65 0.22 30 / 0.4)"
    : "oklch(0.60 0.22 265 / 0.4)";
  const dpadAccentBright = isWarrior
    ? "oklch(0.70 0.22 30 / 0.7)"
    : "oklch(0.65 0.22 265 / 0.7)";

  // Grid columns: warrior MAP-ON: 45% 1fr 120px; warrior MAP-OFF: 50% 50%
  //               mage MAP-ON: 42% 1fr 120px;    mage MAP-OFF: 50% 50%
  const gridCols = mapVisible
    ? isWarrior
      ? "45% 1fr 120px"
      : "42% 1fr 120px"
    : "50% 50%";

  return (
    <div
      data-ocid="touch-controls"
      className="pointer-events-none"
      style={{
        ...(portraitBottomBar
          ? { position: "absolute", inset: 0, zIndex: 1 }
          : {
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 30,
              height: PORTRAIT_BOTTOM_BAR_HEIGHT,
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              background:
                "linear-gradient(to bottom, rgba(0,0,15,0.70) 0%, rgba(0,0,0,0.95) 100%)",
              borderTop: "none",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }),
        ...(isTransitioning ? { opacity: 0.35, pointerEvents: "none" } : {}),
      }}
    >
      {/* Separator line */}
      {!portraitBottomBar && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(to right, transparent 0%, rgba(212,175,55,0.6) 30%, rgba(59,130,246,0.4) 70%, transparent 100%)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      )}

      {/* Audio toggle */}
      <button
        type="button"
        aria-label={audioEnabled ? "Mute audio" : "Unmute audio"}
        data-ocid="audio-toggle-btn"
        onClick={onAudioToggle}
        className="pointer-events-auto absolute"
        style={{
          top: -48,
          right: 12,
          width: 36,
          height: 36,
          background: "oklch(0.10 0 0 / 0.65)",
          border: "1px solid oklch(0.28 0 0 / 0.55)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          cursor: "pointer",
          opacity: 0.7,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {audioEnabled ? "🔊" : "🔇"}
      </button>

      {/* Inventory button */}
      {!isGuest && (
        <button
          type="button"
          aria-label={`Open inventory${inventoryItemCount > 0 ? ` (${inventoryItemCount})` : ""}`}
          data-ocid="touch-inv-btn"
          onTouchStart={(e) => {
            e.preventDefault();
            onInventoryToggle?.();
          }}
          onMouseDown={onInventoryToggle}
          className="pointer-events-auto relative absolute"
          style={{
            top: -48,
            right: 56,
            width: 36,
            height: 36,
            background: "oklch(0.12 0.03 145 / 0.72)",
            border: "1.5px solid oklch(0.35 0.08 145 / 0.55)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span aria-hidden="true">🎒</span>
          {inventoryItemCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                background: "oklch(0.65 0.22 25)",
                border: "1.5px solid oklch(0.10 0 0)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "monospace",
                fontSize: 8,
                fontWeight: 700,
                color: "oklch(0.96 0.04 25)",
                padding: "0 2px",
              }}
            >
              {inventoryItemCount > 99 ? "99+" : inventoryItemCount}
            </span>
          )}
        </button>
      )}

      {/* ── MAIN PANEL: flex column — utility row on top, grid below ── */}
      <div
        className="pointer-events-none w-full h-full"
        style={{ display: "flex", flexDirection: "column", padding: "2px 0 0" }}
      >
        {/* ── UTILITY ROW: full-width row above controls grid ── */}
        {!isGuest && (
          <div
            className="pointer-events-none flex flex-row items-center"
            style={{
              height: 44,
              flexShrink: 0,
              justifyContent: "space-around",
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            {/* HP Potion */}
            <button
              type="button"
              aria-label={`Use health potion (${potionCount} remaining)`}
              data-ocid="touch-potion-btn"
              onTouchStart={(e) => {
                e.preventDefault();
                if (potionCount > 0 && potionCooldownPct <= 0) onUsePotion?.();
              }}
              onMouseDown={() => {
                if (potionCount > 0 && potionCooldownPct <= 0) onUsePotion?.();
              }}
              disabled={potionCount <= 0 || potionCooldownPct > 0}
              className="pointer-events-auto relative select-none touch-none"
              style={{
                width: UTILITY_SIZE,
                height: UTILITY_SIZE,
                borderRadius: "50%",
                background:
                  potionCount <= 0 || potionCooldownPct > 0
                    ? "oklch(0.10 0 0 / 0.60)"
                    : "radial-gradient(circle at 38% 32%, oklch(0.55 0.22 25), oklch(0.30 0.18 22))",
                border:
                  potionCount <= 0 || potionCooldownPct > 0
                    ? "1.5px solid oklch(0.22 0 0 / 0.45)"
                    : "2px solid oklch(0.68 0.22 25 / 0.80)",
                boxShadow:
                  potionCount > 0 && potionCooldownPct <= 0
                    ? "0 0 8px oklch(0.60 0.22 25 / 0.50)"
                    : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                opacity: potionCount <= 0 ? 0.38 : 1,
                overflow: "hidden",
                cursor:
                  potionCount <= 0 || potionCooldownPct > 0
                    ? "not-allowed"
                    : "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <CooldownArc pct={potionCooldownPct} size={UTILITY_SIZE} />
              <span
                aria-hidden="true"
                style={{
                  fontSize: 16,
                  lineHeight: 1,
                  position: "relative",
                  zIndex: 3,
                }}
              >
                ❤️
              </span>
              <span
                style={{
                  fontSize: 8,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  lineHeight: 1,
                  color:
                    potionCount <= 0
                      ? "oklch(0.38 0 0)"
                      : "oklch(0.92 0.12 25)",
                  position: "relative",
                  zIndex: 3,
                }}
              >
                ×{potionCount}
              </span>
            </button>

            {/* MP Potion */}
            <button
              type="button"
              aria-label={`Use mana potion (${manaPotionCount} remaining)`}
              data-ocid="touch-mana-potion-btn"
              onTouchStart={(e) => {
                e.preventDefault();
                if (manaPotionCount > 0 && manaPotionCooldownPct <= 0)
                  onUseManaPotion?.();
              }}
              onMouseDown={() => {
                if (manaPotionCount > 0 && manaPotionCooldownPct <= 0)
                  onUseManaPotion?.();
              }}
              disabled={manaPotionCount <= 0 || manaPotionCooldownPct > 0}
              className="pointer-events-auto relative select-none touch-none"
              style={{
                width: UTILITY_SIZE,
                height: UTILITY_SIZE,
                borderRadius: "50%",
                background:
                  manaPotionCount <= 0 || manaPotionCooldownPct > 0
                    ? "oklch(0.10 0 0 / 0.60)"
                    : "radial-gradient(circle at 38% 32%, oklch(0.48 0.22 265), oklch(0.28 0.16 265))",
                border:
                  manaPotionCount <= 0 || manaPotionCooldownPct > 0
                    ? "1.5px solid oklch(0.22 0 0 / 0.45)"
                    : "2px solid oklch(0.62 0.22 265 / 0.80)",
                boxShadow:
                  manaPotionCount > 0 && manaPotionCooldownPct <= 0
                    ? "0 0 8px oklch(0.55 0.22 265 / 0.50)"
                    : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                opacity: manaPotionCount <= 0 ? 0.38 : 1,
                overflow: "hidden",
                cursor:
                  manaPotionCount <= 0 || manaPotionCooldownPct > 0
                    ? "not-allowed"
                    : "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <CooldownArc pct={manaPotionCooldownPct} size={UTILITY_SIZE} />
              <span
                aria-hidden="true"
                style={{
                  fontSize: 16,
                  lineHeight: 1,
                  position: "relative",
                  zIndex: 3,
                }}
              >
                💧
              </span>
              <span
                style={{
                  fontSize: 8,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  lineHeight: 1,
                  color:
                    manaPotionCount <= 0
                      ? "oklch(0.38 0 0)"
                      : "oklch(0.85 0.18 265)",
                  position: "relative",
                  zIndex: 3,
                }}
              >
                ×{manaPotionCount}
              </span>
            </button>

            {/* Chat */}
            <div className="pointer-events-auto relative">
              <EmotePanel
                isOpen={emoteOpen}
                onEmoteSelect={handleEmoteSelect}
                onClose={() => setEmoteOpen(false)}
              />
              <button
                type="button"
                aria-label="Open chat"
                data-ocid="touch-chat-btn"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onOpenChat?.();
                }}
                onMouseDown={onOpenChat}
                className="pointer-events-auto select-none touch-none focus:outline-none"
                style={{
                  width: UTILITY_SIZE,
                  height: UTILITY_SIZE,
                  borderRadius: "50%",
                  background: "oklch(0.14 0.06 220 / 0.70)",
                  border: "1.5px solid oklch(0.38 0.10 220 / 0.60)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: 17, lineHeight: 1 }}
                >
                  💬
                </span>
                <span
                  style={{
                    fontSize: 7,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: "oklch(0.60 0.10 220)",
                    textTransform: "uppercase",
                  }}
                >
                  Chat
                </span>
              </button>
            </div>

            {/* Map toggle */}
            <button
              type="button"
              aria-label={mapVisible ? "Hide minimap" : "Show minimap"}
              aria-pressed={mapVisible}
              data-ocid="touch-map-btn"
              onTouchStart={(e) => {
                e.preventDefault();
                setMapVisible((v) => !v);
              }}
              onMouseDown={() => setMapVisible((v) => !v)}
              className="pointer-events-auto select-none touch-none focus:outline-none"
              style={{
                width: UTILITY_SIZE,
                height: UTILITY_SIZE,
                borderRadius: "50%",
                background: mapVisible
                  ? "oklch(0.30 0.12 145 / 0.90)"
                  : "oklch(0.14 0.04 145 / 0.70)",
                border: mapVisible
                  ? "2px solid oklch(0.65 0.18 145 / 0.90)"
                  : "1.5px solid oklch(0.38 0.10 145 / 0.60)",
                boxShadow: mapVisible
                  ? "0 0 10px oklch(0.60 0.18 145 / 0.55)"
                  : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                transform: mapVisible ? "scale(0.92)" : "scale(1)",
                transition: "all 0.1s ease",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>
                🗺
              </span>
              <span
                style={{
                  fontSize: 7,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: mapVisible
                    ? "oklch(0.80 0.18 145)"
                    : "oklch(0.60 0.10 145)",
                  textTransform: "uppercase",
                }}
              >
                {mapVisible ? "MAP·ON" : "MAP·OFF"}
              </span>
            </button>
          </div>
        )}

        {/* ── CONTROLS GRID: dpad col | [spacer col] | [minimap col] ── */}
        <div
          className="pointer-events-none"
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: gridCols,
            gridTemplateRows: "1fr",
            transition: "grid-template-columns 0.2s ease",
            padding: "0 4px 4px",
            alignItems: "stretch",
          }}
        >
          {/* ── LEFT COLUMN: D-pad ── */}
          <div
            className="pointer-events-none flex flex-col items-start justify-center"
            style={{ gap: 4, paddingLeft: 4 }}
          >
            {/* ── 8-Direction D-pad ── */}
            <div
              className="pointer-events-none relative"
              style={{ width: GRID_SIZE, height: GRID_SIZE }}
            >
              {/* Base plate */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 50% 40%, oklch(0.14 0 0 / 0.75), oklch(0.06 0 0 / 0.90))",
                  border: `2px solid ${dpadAccent}`,
                  boxShadow: `0 0 12px ${dpadAccentBright}, 0 0 24px ${dpadAccent}, inset 0 1px 0 oklch(1 0 0 / 0.04)`,
                  zIndex: 0,
                }}
              />
              {/* 3×3 Grid */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  gridTemplateColumns: `repeat(3, ${CELL}px)`,
                  gridTemplateRows: `repeat(3, ${CELL}px)`,
                  gap: GRID_GAP,
                  zIndex: 1,
                }}
              >
                {DPAD_ENTRIES.map((entry) => {
                  if (entry.kind === "rotate") {
                    return (
                      <button
                        key="rotate"
                        type="button"
                        aria-label="Rotate character 90° clockwise"
                        data-ocid="dpad-rotate"
                        onTouchStart={handleRotatePress}
                        onTouchEnd={handleRotateEnd}
                        onTouchCancel={handleRotateEnd}
                        onMouseDown={handleRotatePress}
                        onMouseUp={handleRotateEnd}
                        onMouseLeave={handleRotateEnd}
                        className="pointer-events-auto select-none touch-none focus:outline-none"
                        style={{
                          gridRow: entry.row + 1,
                          gridColumn: entry.col + 1,
                          width: ROTATE_SIZE,
                          height: ROTATE_SIZE,
                          justifySelf: "center",
                          alignSelf: "center",
                          background: rotateActive
                            ? "linear-gradient(135deg, #00a896, #00bcd4)"
                            : "linear-gradient(135deg, #00897b, #00bcd4)",
                          border: rotateActive
                            ? "1.5px solid rgba(0,220,210,0.90)"
                            : "1.5px solid rgba(0,188,212,0.55)",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          color: "rgba(255,255,255,0.92)",
                          transform: rotateActive
                            ? "scale(0.88) rotate(90deg)"
                            : "scale(1)",
                          transition: "all 0.08s ease",
                          WebkitTapHighlightColor: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        ↺
                      </button>
                    );
                  }
                  const dir = entry.dir as Direction;
                  const isCardinal = entry.kind === "cardinal";
                  const isActive = activeDirs.has(dir);
                  const isFlashing = flashDir === dir;
                  const btnSize = isCardinal ? CARDINAL_SIZE : DIAGONAL_SIZE;
                  const arrowSize = isCardinal ? 18 : 11;
                  const angle = entry.arrowAngle ?? 0;
                  return (
                    <button
                      key={dir}
                      type="button"
                      aria-label={entry.ariaLabel}
                      data-ocid={`dpad-${dir}`}
                      onTouchStart={handleDirPress(dir)}
                      onTouchEnd={handleDirRelease(dir)}
                      onTouchCancel={handleDirRelease(dir)}
                      onMouseDown={handleDirPress(dir)}
                      onMouseUp={handleDirRelease(dir)}
                      onMouseLeave={handleDirRelease(dir)}
                      className="pointer-events-auto select-none touch-none focus:outline-none"
                      style={{
                        gridRow: entry.row + 1,
                        gridColumn: entry.col + 1,
                        width: btnSize,
                        height: btnSize,
                        justifySelf: "center",
                        alignSelf: "center",
                        borderRadius: isCardinal ? 10 : 7,
                        background: isFlashing
                          ? "oklch(1 0 0 / 0.35)"
                          : isActive
                            ? "oklch(0.65 0.18 145 / 0.30)"
                            : "oklch(0.12 0 0 / 0.45)",
                        border: isActive
                          ? `${isCardinal ? 2 : 1.5}px solid oklch(0.72 0.18 145 / 0.85)`
                          : `${isCardinal ? 1.5 : 1}px solid oklch(0.28 0 0 / ${isCardinal ? "0.55" : "0.38"})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isFlashing
                          ? 1
                          : isActive
                            ? 1
                            : isCardinal
                              ? 0.72
                              : 0.5,
                        transform: isActive ? "scale(0.90)" : "scale(1)",
                        transition: "all 0.06s ease",
                        boxShadow: isActive
                          ? "0 0 10px oklch(0.72 0.18 145 / 0.40)"
                          : "none",
                        WebkitTapHighlightColor: "transparent",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <TriangleArrow
                        size={arrowSize}
                        angle={angle}
                        color={isActive ? "oklch(0.92 0.12 145)" : "white"}
                        opacity={isActive ? 0.95 : isCardinal ? 0.8 : 0.55}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dodge indicator */}
            {!isGuest && (
              <div
                data-ocid="dodge-indicator"
                className="pointer-events-none flex items-center justify-center"
                style={{ gap: 4, paddingLeft: 4 }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: isDodging
                      ? "oklch(0.60 0.22 200 / 0.9)"
                      : dodgeCooldownMs > 0
                        ? "oklch(0.10 0 0 / 0.55)"
                        : "oklch(0.20 0.08 200 / 0.70)",
                    border: `1.5px solid ${isDodging ? "oklch(0.80 0.22 200)" : dodgeCooldownMs > 0 ? "oklch(0.25 0 0 / 0.45)" : "oklch(0.55 0.16 200 / 0.70)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    opacity: dodgeCooldownMs > 0 && !isDodging ? 0.55 : 1,
                  }}
                >
                  <CooldownArc
                    pct={dodgeCooldownMs > 0 ? dodgeCooldownMs / 4000 : 0}
                    size={28}
                  />
                  <span
                    aria-hidden="true"
                    style={{ position: "relative", zIndex: 3, lineHeight: 1 }}
                  >
                    💨
                  </span>
                </div>
                {dodgeCooldownMs > 0 && !isDodging && (
                  <span
                    style={{
                      fontSize: 8,
                      fontFamily: "monospace",
                      color: "oklch(0.50 0.05 200)",
                      fontWeight: 700,
                    }}
                  >
                    {Math.ceil(dodgeCooldownMs / 1000)}s
                  </span>
                )}
                {isStunned && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      color: "oklch(0.70 0.15 60)",
                      fontWeight: 700,
                    }}
                  >
                    STUN
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── CENTER/ACTION COLUMN: quick slots + action buttons ── */}
          {!isGuest && (
            <div
              className="pointer-events-none flex flex-col items-center justify-center"
              style={{
                gridColumn: 2,
                gap: 6,
                paddingBottom: 4,
                paddingRight: mapVisible ? 0 : 8,
                filter: mpBarPulse
                  ? "drop-shadow(0 0 6px oklch(0.30 0.20 265 / 0.7))"
                  : undefined,
                overflow: "hidden",
              }}
            >
              {/* Quick slots row */}
              <div
                className="pointer-events-none flex flex-row items-center"
                style={{ gap: 5 }}
                data-ocid="quick-slot-bar"
              >
                {([0, 1, 2, 3] as const).map((slotIdx) => {
                  const itemType = quickSlots[slotIdx];
                  const count = quickSlotCounts[slotIdx] ?? 0;
                  const slotInfo = itemType ? QUICK_SLOT_ICONS[itemType] : null;
                  const isEmpty = !itemType || count === 0;
                  return (
                    <button
                      key={slotIdx}
                      type="button"
                      aria-label={
                        slotInfo
                          ? `Quick slot ${slotIdx + 1}: ${slotInfo.label} (${count})`
                          : `Quick slot ${slotIdx + 1}: empty`
                      }
                      data-ocid={`quick-slot.item.${slotIdx + 1}`}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        if (!isEmpty) onUseQuickSlot?.(slotIdx);
                      }}
                      onMouseDown={() => {
                        if (!isEmpty) onUseQuickSlot?.(slotIdx);
                      }}
                      disabled={isEmpty}
                      className="pointer-events-auto relative select-none touch-none focus:outline-none"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        background: isEmpty
                          ? "oklch(0.08 0 0 / 0.55)"
                          : `radial-gradient(circle at 38% 32%, ${slotInfo?.color ?? "oklch(0.35 0.10 145)"}cc, oklch(0.08 0 0 / 0.88))`,
                        border: isEmpty
                          ? "1.5px dashed oklch(0.28 0 0 / 0.45)"
                          : `1.5px solid ${slotInfo?.color ?? "oklch(0.50 0.12 145)"}99`,
                        boxShadow: !isEmpty
                          ? `0 0 6px ${slotInfo?.color ?? "oklch(0.45 0.12 145)"}44`
                          : "none",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1,
                        opacity: isEmpty ? 0.38 : 1,
                        cursor: isEmpty ? "default" : "pointer",
                        WebkitTapHighlightColor: "transparent",
                        overflow: "hidden",
                      }}
                    >
                      {slotInfo ? (
                        <>
                          <span
                            aria-hidden="true"
                            style={{
                              fontSize: 16,
                              lineHeight: 1,
                              position: "relative",
                              zIndex: 1,
                            }}
                          >
                            {slotInfo.icon}
                          </span>
                          <span
                            style={{
                              position: "absolute",
                              bottom: 2,
                              right: 3,
                              fontFamily: "monospace",
                              fontSize: 8,
                              fontWeight: 700,
                              lineHeight: 1,
                              color:
                                count <= 0
                                  ? "oklch(0.38 0 0)"
                                  : "oklch(0.95 0 0)",
                              zIndex: 2,
                            }}
                          >
                            ×{count}
                          </span>
                          <span
                            style={{
                              position: "absolute",
                              top: 2,
                              left: 3,
                              fontFamily: "monospace",
                              fontSize: 7,
                              fontWeight: 700,
                              color: "oklch(0.55 0 0)",
                              lineHeight: 1,
                              zIndex: 2,
                            }}
                          >
                            {slotIdx + 1}
                          </span>
                        </>
                      ) : (
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 8,
                            color: "oklch(0.30 0 0)",
                            lineHeight: 1,
                          }}
                          aria-hidden="true"
                        >
                          {slotIdx + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── WARRIOR: large ATTACK + SHIELD rect buttons ── */}
              {isWarrior && (
                <div
                  className="pointer-events-none flex flex-col items-center"
                  style={{
                    gap: 10,
                    width: "100%",
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}
                >
                  {/* ATTACK */}
                  <button
                    type="button"
                    aria-label="Attack"
                    data-ocid="attack-btn"
                    onTouchStart={handleAttackStart}
                    onTouchEnd={handleAttackEnd}
                    onTouchCancel={handleAttackEnd}
                    onMouseDown={handleAttackStart}
                    onMouseUp={handleAttackEnd}
                    onMouseLeave={handleAttackEnd}
                    className={`pointer-events-auto select-none touch-none focus:outline-none${shakeArcane ? " spell-btn-shake" : ""}`}
                    style={{
                      width: "90%",
                      height: 56,
                      borderRadius: 12,
                      background: attackActive
                        ? "linear-gradient(135deg, #ff6600, #ffaa00)"
                        : "linear-gradient(135deg, #ff4400, #ff8800)",
                      border: attackActive
                        ? "2px solid #ffcc00"
                        : "1.5px solid rgba(255,120,0,0.7)",
                      boxShadow: attackActive
                        ? "0 0 18px rgba(255,100,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15)"
                        : "0 0 8px rgba(255,80,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      cursor: "pointer",
                      transform: attackActive
                        ? "scale(0.95) brightness(1.3)"
                        : "scale(1)",
                      transition: "all 0.1s ease",
                      WebkitTapHighlightColor: "transparent",
                      userSelect: "none",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ fontSize: 20, lineHeight: 1 }}
                    >
                      ⚔️
                    </span>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#fff",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                      }}
                    >
                      ATTACK
                    </span>
                  </button>

                  {/* SHIELD */}
                  {(() => {
                    const shieldOnCooldown = shieldCooldownMs > 0;
                    const notEnoughMpShield = currentMp < 40;
                    const shieldBlocked =
                      shieldOnCooldown || notEnoughMpShield || shieldActive;
                    const shieldCountdown =
                      shieldCooldownMs > 0
                        ? Math.ceil(shieldCooldownMs / 1000)
                        : 0;
                    return (
                      <div style={{ width: "90%", position: "relative" }}>
                        <button
                          type="button"
                          aria-label="Warrior Shield (60s defend, 40 MP)"
                          data-ocid="warrior-shield-btn"
                          onTouchStart={handleShieldStart}
                          onTouchEnd={handleShieldEnd}
                          onTouchCancel={handleShieldEnd}
                          onMouseDown={handleShieldStart}
                          onMouseUp={handleShieldEnd}
                          onMouseLeave={handleShieldEnd}
                          disabled={shieldBlocked && !shieldActive}
                          className={`pointer-events-auto select-none touch-none focus:outline-none${shakeShield ? " spell-btn-shake" : ""}`}
                          style={{
                            width: "100%",
                            height: 48,
                            borderRadius: 12,
                            background: shieldActive
                              ? "linear-gradient(135deg, #0077ee, #ffcc00)"
                              : shieldBlocked
                                ? "oklch(0.10 0 0 / 0.55)"
                                : "linear-gradient(135deg, #1155cc, #ccaa00)",
                            border: shieldActive
                              ? "2px solid #ffe066"
                              : shieldBlocked
                                ? "1.5px solid oklch(0.22 0 0 / 0.40)"
                                : "1.5px solid rgba(100,150,255,0.7)",
                            boxShadow: shieldActive
                              ? "0 0 16px rgba(80,160,255,0.7), inset 0 1px 0 rgba(255,255,255,0.15)"
                              : shieldBlocked
                                ? "none"
                                : "0 0 6px rgba(80,120,255,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                            cursor:
                              shieldBlocked && !shieldActive
                                ? "not-allowed"
                                : "pointer",
                            opacity: shieldBlocked && !shieldActive ? 0.45 : 1,
                            transform:
                              shieldPressed || shieldActive
                                ? "scale(0.95) brightness(1.3)"
                                : "scale(1)",
                            transition: "all 0.1s ease",
                            WebkitTapHighlightColor: "transparent",
                            userSelect: "none",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <CooldownArc
                            pct={
                              shieldCooldownMs > 0
                                ? shieldCooldownMs / 60000
                                : 0
                            }
                            size={48}
                          />
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 5,
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{ fontSize: 18, lineHeight: 1 }}
                            >
                              🛡
                            </span>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 700,
                                fontSize: 14,
                                color: "#fff",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                              }}
                            >
                              SHIELD
                            </span>
                          </div>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 10,
                              color: "rgba(255,255,255,0.65)",
                              lineHeight: 1,
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            {shieldCountdown > 0
                              ? `${shieldCountdown}s cooldown`
                              : shieldActive
                                ? "ACTIVE"
                                : "40 MP"}
                          </span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Emote */}
                  <button
                    type="button"
                    aria-label="Open emote picker"
                    aria-expanded={emoteOpen}
                    data-ocid="emote-trigger"
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setEmoteOpen((o) => !o);
                    }}
                    onClick={() => setEmoteOpen((o) => !o)}
                    className="emote-trigger-btn pointer-events-auto"
                    style={{
                      position: "static",
                      width: 44,
                      height: 28,
                      bottom: "auto",
                      right: "auto",
                      zIndex: "auto",
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: 14 }}>
                      😊
                    </span>
                    <span
                      className="emote-trigger-label"
                      style={{ fontSize: 7 }}
                    >
                      Emote
                    </span>
                    <EmotePanel
                      isOpen={emoteOpen}
                      onEmoteSelect={handleEmoteSelect}
                      onClose={() => setEmoteOpen(false)}
                    />
                  </button>
                </div>
              )}

              {/* ── MAGE: 2×2 spell grid ── */}
              {!isWarrior && (
                <div
                  className="pointer-events-none flex flex-col items-center"
                  style={{
                    gap: 6,
                    width: "100%",
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}
                >
                  {/* Row 1: BOLT + NOVA */}
                  <div
                    className="pointer-events-none flex flex-row"
                    style={{ gap: 6, width: "100%" }}
                  >
                    {/* BOLT */}
                    <button
                      type="button"
                      aria-label="Arcane Bolt (4 MP)"
                      data-ocid="attack-btn"
                      onTouchStart={handleAttackStart}
                      onTouchEnd={handleAttackEnd}
                      onTouchCancel={handleAttackEnd}
                      onMouseDown={handleAttackStart}
                      onMouseUp={handleAttackEnd}
                      onMouseLeave={handleAttackEnd}
                      disabled={notEnoughAttackMp}
                      className={`pointer-events-auto relative select-none touch-none focus:outline-none${shakeArcane || (spellShake && isLowMana) ? " spell-btn-shake" : ""}`}
                      style={{
                        flex: 1,
                        height: 52,
                        borderRadius: 10,
                        overflow: "hidden",
                        background: attackActive
                          ? "linear-gradient(135deg, #2288ff, #44bbff)"
                          : "linear-gradient(135deg, #0066ff, #0099ff)",
                        border: attackActive
                          ? "2px solid #66ccff"
                          : "1.5px solid rgba(50,150,255,0.65)",
                        boxShadow: attackActive
                          ? "0 0 14px rgba(50,150,255,0.75)"
                          : "0 0 5px rgba(50,130,255,0.35)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                        opacity: notEnoughAttackMp ? 0.45 : 1,
                        transform: attackActive
                          ? "scale(0.94) brightness(1.3)"
                          : "scale(1)",
                        transition: "all 0.1s ease",
                        cursor: notEnoughAttackMp ? "not-allowed" : "pointer",
                        WebkitTapHighlightColor: "transparent",
                        userSelect: "none",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ fontSize: 16, lineHeight: 1 }}
                      >
                        ✦
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 11,
                          color: "#fff",
                        }}
                      >
                        BOLT
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 9,
                          color: "rgba(255,255,255,0.65)",
                        }}
                      >
                        4 MP
                      </span>
                    </button>

                    {/* NOVA */}
                    {(() => {
                      const frostBlocked =
                        frostNovaCooldownPct > 0 || currentMp < 10;
                      const frostCountdown =
                        frostNovaCooldownMs > 0
                          ? Math.ceil(frostNovaCooldownMs / 1000)
                          : 0;
                      return (
                        <button
                          type="button"
                          aria-label="Frost Nova (10 MP)"
                          data-ocid="spell-frost-nova-btn"
                          onTouchStart={handleFrostNovaStart}
                          onTouchEnd={handleFrostNovaEnd}
                          onTouchCancel={handleFrostNovaEnd}
                          onMouseDown={handleFrostNovaStart}
                          onMouseUp={handleFrostNovaEnd}
                          onMouseLeave={handleFrostNovaEnd}
                          disabled={frostBlocked}
                          className={`pointer-events-auto relative select-none touch-none focus:outline-none${shakeFrost || (spellShake && isLowMana) ? " spell-btn-shake" : ""}`}
                          style={{
                            flex: 1,
                            height: 52,
                            borderRadius: 10,
                            overflow: "hidden",
                            background: frostActive
                              ? "linear-gradient(135deg, #aaddff, #eef8ff)"
                              : "linear-gradient(135deg, #88ccff, #cceeff)",
                            border: frostActive
                              ? "2px solid #ddeeff"
                              : "1.5px solid rgba(160,210,255,0.65)",
                            boxShadow: frostActive
                              ? "0 0 14px rgba(150,210,255,0.75)"
                              : "0 0 5px rgba(130,190,255,0.35)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                            opacity: frostBlocked ? 0.45 : 1,
                            transform: frostActive
                              ? "scale(0.94) brightness(1.3)"
                              : "scale(1)",
                            transition: "all 0.1s ease",
                            cursor: frostBlocked ? "not-allowed" : "pointer",
                            WebkitTapHighlightColor: "transparent",
                            userSelect: "none",
                          }}
                        >
                          <CooldownArc pct={frostNovaCooldownPct} size={52} />
                          <span
                            aria-hidden="true"
                            style={{
                              fontSize: 16,
                              lineHeight: 1,
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            ❄
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              fontSize: 11,
                              color: "#1a3a55",
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            {frostCountdown > 0 ? `${frostCountdown}s` : "NOVA"}
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 9,
                              color: "rgba(20,60,100,0.75)",
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            10 MP
                          </span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Row 2: LANCE + RING */}
                  <div
                    className="pointer-events-none flex flex-row"
                    style={{ gap: 6, width: "100%" }}
                  >
                    {/* LANCE */}
                    {(() => {
                      const lanceBlocked =
                        shadowLanceCooldownPct > 0 || currentMp < 15;
                      const lanceCountdown =
                        shadowLanceCooldownMs > 0
                          ? Math.ceil(shadowLanceCooldownMs / 1000)
                          : 0;
                      return (
                        <button
                          type="button"
                          aria-label="Shadow Lance (15 MP)"
                          data-ocid="spell-shadow-lance-btn"
                          onTouchStart={handleShadowLanceStart}
                          onTouchEnd={handleShadowLanceEnd}
                          onTouchCancel={handleShadowLanceEnd}
                          onMouseDown={handleShadowLanceStart}
                          onMouseUp={handleShadowLanceEnd}
                          onMouseLeave={handleShadowLanceEnd}
                          disabled={lanceBlocked}
                          className={`pointer-events-auto relative select-none touch-none focus:outline-none${shakeShadow ? " spell-btn-shake" : ""}`}
                          style={{
                            flex: 1,
                            height: 52,
                            borderRadius: 10,
                            overflow: "hidden",
                            background: lanceActive
                              ? "linear-gradient(135deg, #9944ff, #cc66ff)"
                              : "linear-gradient(135deg, #6600cc, #9933ff)",
                            border: lanceActive
                              ? "2px solid #cc88ff"
                              : "1.5px solid rgba(150,50,230,0.65)",
                            boxShadow: lanceActive
                              ? "0 0 14px rgba(150,50,255,0.75)"
                              : "0 0 5px rgba(130,30,220,0.35)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                            opacity: lanceBlocked ? 0.45 : 1,
                            transform: lanceActive
                              ? "scale(0.94) brightness(1.3)"
                              : "scale(1)",
                            transition: "all 0.1s ease",
                            cursor: lanceBlocked ? "not-allowed" : "pointer",
                            WebkitTapHighlightColor: "transparent",
                            userSelect: "none",
                          }}
                        >
                          <CooldownArc pct={shadowLanceCooldownPct} size={52} />
                          <span
                            aria-hidden="true"
                            style={{
                              fontSize: 16,
                              lineHeight: 1,
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            🌑
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              fontSize: 11,
                              color: "#fff",
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            {lanceCountdown > 0
                              ? `${lanceCountdown}s`
                              : "LANCE"}
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 9,
                              color: "rgba(255,255,255,0.65)",
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            15 MP
                          </span>
                        </button>
                      );
                    })()}

                    {/* RING */}
                    {(() => {
                      const flameBlocked =
                        flameRingCooldownPct > 0 || currentMp < 12;
                      const flameCountdown =
                        flameRingCooldownPct > 0
                          ? Math.ceil((flameRingCooldownPct * 6000) / 1000)
                          : 0;
                      return (
                        <button
                          type="button"
                          aria-label="Flame Ring (12 MP)"
                          data-ocid="spell-flame-ring-btn"
                          onTouchStart={handleFlameRingStart}
                          onTouchEnd={handleFlameRingEnd}
                          onTouchCancel={handleFlameRingEnd}
                          onMouseDown={handleFlameRingStart}
                          onMouseUp={handleFlameRingEnd}
                          onMouseLeave={handleFlameRingEnd}
                          disabled={flameBlocked}
                          className={`pointer-events-auto relative select-none touch-none focus:outline-none${shakeFlame || (spellShake && isLowMana) ? " spell-btn-shake" : ""}`}
                          style={{
                            flex: 1,
                            height: 52,
                            borderRadius: 10,
                            overflow: "hidden",
                            background: flameActive
                              ? "linear-gradient(135deg, #ff7722, #ffaa44)"
                              : "linear-gradient(135deg, #cc4400, #ff6600)",
                            border: flameActive
                              ? "2px solid #ffcc66"
                              : "1.5px solid rgba(220,100,0,0.65)",
                            boxShadow: flameActive
                              ? "0 0 14px rgba(255,120,0,0.75)"
                              : "0 0 5px rgba(200,80,0,0.35)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                            opacity: flameBlocked ? 0.45 : 1,
                            transform: flameActive
                              ? "scale(0.94) brightness(1.3)"
                              : "scale(1)",
                            transition: "all 0.1s ease",
                            cursor: flameBlocked ? "not-allowed" : "pointer",
                            WebkitTapHighlightColor: "transparent",
                            userSelect: "none",
                          }}
                        >
                          <CooldownArc pct={flameRingCooldownPct} size={52} />
                          <span
                            aria-hidden="true"
                            style={{
                              fontSize: 16,
                              lineHeight: 1,
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            🔥
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              fontSize: 11,
                              color: "#fff",
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            {flameCountdown > 0 ? `${flameCountdown}s` : "RING"}
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 9,
                              color: "rgba(255,255,255,0.65)",
                              position: "relative",
                              zIndex: 3,
                            }}
                          >
                            12 MP
                          </span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Emote */}
                  <button
                    type="button"
                    aria-label="Open emote picker"
                    aria-expanded={emoteOpen}
                    data-ocid="emote-trigger"
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setEmoteOpen((o) => !o);
                    }}
                    onClick={() => setEmoteOpen((o) => !o)}
                    className="emote-trigger-btn pointer-events-auto"
                    style={{
                      position: "static",
                      width: 44,
                      height: 28,
                      bottom: "auto",
                      right: "auto",
                      zIndex: "auto",
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: 14 }}>
                      😊
                    </span>
                    <span
                      className="emote-trigger-label"
                      style={{ fontSize: 7 }}
                    >
                      Emote
                    </span>
                    <EmotePanel
                      isOpen={emoteOpen}
                      onEmoteSelect={handleEmoteSelect}
                      onClose={() => setEmoteOpen(false)}
                    />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── MINIMAP COLUMN (col 3, only when mapVisible) ── */}
          {mapVisible && !isGuest && minimapTiles && minimapZoneId && (
            <div
              className="pointer-events-none"
              style={{
                gridColumn: 3,
                alignSelf: "start",
                padding: "8px 8px 0 0",
              }}
            >
              <button
                type="button"
                aria-label="Minimap — tap to expand"
                data-ocid="controls-minimap"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onMinimapTap?.();
                }}
                onMouseDown={onMinimapTap}
                className="pointer-events-auto focus:outline-none"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  display: "block",
                }}
              >
                <Minimap
                  tiles={minimapTiles}
                  playerX={minimapPlayerX}
                  playerY={minimapPlayerY}
                  zoneId={minimapZoneId}
                  facing={minimapFacing}
                  isTransitioning={isTransitioning}
                  monsters={minimapMonsters}
                  timestamp={minimapTimestamp}
                  renderMode="panel"
                  panelWidth={112}
                  panelHeight={112}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
