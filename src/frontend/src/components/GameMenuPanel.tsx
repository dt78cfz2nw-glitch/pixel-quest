import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterClass, InventoryItem, TitleId } from "../types/game";
import { ITEM_LABELS, TITLE_LABELS } from "../types/game";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubPanel =
  | null
  | "backpack"
  | "outfit"
  | "world_map"
  | "skills"
  | "quests"
  | "titles"
  | "friends"
  | "stats"
  | "settings";

export interface GameMenuPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClass: CharacterClass;
  isGuest: boolean;
  // Player data
  username: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  coins: number;
  inventory: InventoryItem[];
  earnedTitles: TitleId[];
  activeTitleId: TitleId;
  kills?: number;
  deaths?: number;
  onSelectTitle?: (id: TitleId) => void;
  onLogout?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "pq_settings_v1";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function saveSettings(s: Record<string, unknown>) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// ─── Skill point data ─────────────────────────────────────────────────────────

const WARRIOR_SKILLS = [
  { id: "iron_skin", icon: "🛡", label: "Iron Skin", desc: "HP +10 per point" },
  {
    id: "blade_master",
    icon: "⚔",
    label: "Blade Master",
    desc: "ATK +5 per point",
  },
  {
    id: "shield_expert",
    icon: "🔰",
    label: "Shield Expert",
    desc: "Shield cost -5 per point",
  },
  {
    id: "endurance",
    icon: "💪",
    label: "Endurance",
    desc: "HP regen +1/s per point",
  },
] as const;

const MAGE_SKILLS = [
  {
    id: "arcane_mind",
    icon: "🔮",
    label: "Arcane Mind",
    desc: "Spell damage +10% per point",
  },
  {
    id: "spell_power",
    icon: "✨",
    label: "Spell Power",
    desc: "All spell damage +8% per point",
  },
  {
    id: "mana_flow",
    icon: "💧",
    label: "Mana Flow",
    desc: "MP regen +1/s per point",
  },
  {
    id: "frost_mastery",
    icon: "❄",
    label: "Frost Mastery",
    desc: "Frost Nova slow +0.5s per point",
  },
] as const;

const SKILLS_KEY = "pq_skills_v1";

function loadSkillPoints(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveSkillPoints(p: Record<string, number>) {
  try {
    localStorage.setItem(SKILLS_KEY, JSON.stringify(p));
  } catch {}
}

// ─── Theme colors per grid button ────────────────────────────────────────────

const PANEL_THEME: Record<string, string> = {
  backpack: "#a0522d", // brown
  outfit: "#9b59b6", // purple
  world_map: "#16a085", // teal
  skills: "#e74c3c", // red
  quests: "#f39c12", // yellow
  titles: "#ffd700", // gold
  friends: "#2ecc71", // green
  stats: "#3498db", // blue
  settings: "#7f8c8d", // grey
};

// ─── Rarity border colors ─────────────────────────────────────────────────────

function rarityBorder(type: string): string {
  if (["rare_weapon", "iron_legion_chestplate", "scholars_robe"].includes(type))
    return "#2196f3"; // blue — rare
  if (
    ["rare_gem", "mana_crystal", "warrior_emblem", "mage_focus"].includes(type)
  )
    return "#9c27b0"; // purple — epic
  if (["ancient_rune_shard"].includes(type)) return "#ffd700"; // gold — legendary
  if (
    [
      "iron_legion_helmet",
      "iron_legion_gauntlets",
      "scholars_hat",
      "scholars_focus",
      "leather_armor",
      "cloth_robe",
    ].includes(type)
  )
    return "#4caf50"; // green — uncommon
  return "rgba(255,255,255,0.25)"; // white — common
}

function rarityLabel(type: string): string {
  if (["ancient_rune_shard"].includes(type)) return "Legendary";
  if (
    ["rare_gem", "mana_crystal", "warrior_emblem", "mage_focus"].includes(type)
  )
    return "Epic";
  if (["rare_weapon", "iron_legion_chestplate", "scholars_robe"].includes(type))
    return "Rare";
  if (
    [
      "iron_legion_helmet",
      "iron_legion_gauntlets",
      "scholars_hat",
      "scholars_focus",
      "leather_armor",
      "cloth_robe",
    ].includes(type)
  )
    return "Uncommon";
  return "Common";
}

// ─── Sub-panel: Backpack ──────────────────────────────────────────────────────

function BackpackPanel({
  inventory,
  coins,
}: {
  inventory: InventoryItem[];
  coins: number;
}) {
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  // Track equipped items by type (first instance of each gear slot)
  const equippedTypes = new Set(
    inventory
      .filter((it) =>
        [
          "iron_legion_helmet",
          "iron_legion_chestplate",
          "scholars_hat",
          "scholars_robe",
          "rare_weapon",
        ].includes(it.itemType),
      )
      .map((it) => it.itemType),
  );

  const slots = Array.from({ length: 16 });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          flex: 1,
        }}
      >
        {slots.map((_, i) => {
          const item = inventory[i];
          const slotKey = `slot-${i}`;
          const isEquipped = item ? equippedTypes.has(item.itemType) : false;
          return (
            <button
              key={slotKey}
              type="button"
              data-ocid={`backpack.item.${i + 1}`}
              onClick={() => setSelected(item ?? null)}
              style={{
                aspectRatio: "1",
                borderRadius: 6,
                background: isEquipped
                  ? "rgba(255,215,0,0.08)"
                  : "rgba(255,255,255,0.04)",
                border: item
                  ? `2px solid ${rarityBorder(item.itemType)}`
                  : "1px solid rgba(255,255,255,0.10)",
                boxShadow: isEquipped
                  ? "0 0 6px rgba(255,215,0,0.35), inset 0 0 8px rgba(255,215,0,0.08)"
                  : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: item ? "pointer" : "default",
                position: "relative",
                padding: 2,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {item && (
                <>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>
                    {itemIcon(item.itemType)}
                  </span>
                  {item.amount > 1 && (
                    <span
                      style={{
                        fontSize: 8,
                        color: "rgba(255,215,0,0.9)",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        position: "absolute",
                        bottom: 2,
                        right: 3,
                      }}
                    >
                      x{item.amount}
                    </span>
                  )}
                  {isEquipped && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: 3,
                        fontSize: 7,
                        fontFamily: "monospace",
                        color: "rgba(255,215,0,0.80)",
                        letterSpacing: "0.03em",
                      }}
                    >
                      EQ
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Item detail popup */}
      {selected && (
        <div
          style={{
            background: "rgba(10,12,30,0.98)",
            border: `1.5px solid ${rarityBorder(selected.itemType)}`,
            borderRadius: 8,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>{itemIcon(selected.itemType)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: rarityBorder(selected.itemType),
                  fontFamily: "monospace",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {ITEM_LABELS[selected.itemType]}
              </div>
              {selected.amount > 1 && (
                <div
                  style={{
                    color: "rgba(255,255,255,0.45)",
                    fontFamily: "monospace",
                    fontSize: 10,
                  }}
                >
                  Qty: {selected.amount}
                </div>
              )}
              <div
                style={{
                  color: "rgba(255,255,255,0.30)",
                  fontFamily: "monospace",
                  fontSize: 9,
                  marginTop: 2,
                }}
              >
                {rarityLabel(selected.itemType)} item
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.45)",
                fontSize: 16,
                cursor: "pointer",
                padding: 2,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <SmallMenuBtn label="Equip" />
            <SmallMenuBtn label="Use" />
            <SmallMenuBtn label="Drop" danger />
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>🪙</span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 14,
            fontWeight: 700,
            color: "oklch(0.72 0.16 80)",
          }}
        >
          {coins}
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
          }}
        >
          gold
        </span>
      </div>
    </div>
  );
}

// ─── Sub-panel: Outfit ────────────────────────────────────────────────────────

const OUTFIT_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#9b59b6",
  "#f39c12",
  "#1abc9c",
  "#e67e22",
  "#ecf0f1",
];

function OutfitPanel({
  selectedClass,
  isGuest,
}: {
  selectedClass: CharacterClass;
  isGuest: boolean;
}) {
  const [outfitColor, setOutfitColor] = useState(OUTFIT_COLORS[0]);
  const [hairColor, setHairColor] = useState(OUTFIT_COLORS[7]);
  const [weapon, setWeapon] = useState<
    "sword" | "axe" | "long_staff" | "short_wand"
  >(selectedClass === "warrior" ? "sword" : "long_staff");
  const [gender, setGender] = useState<"male" | "female">("male");

  const classAccent =
    selectedClass === "warrior" ? "rgba(231,76,60,0.6)" : "rgba(88,86,214,0.6)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {isGuest && (
        <div
          style={{
            background: "rgba(255,193,7,0.10)",
            border: "1px solid rgba(255,193,7,0.35)",
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,193,7,0.85)",
            textAlign: "center",
          }}
        >
          🔒 Sign in to save appearance changes
        </div>
      )}

      {/* Character silhouette with equipment slots */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 96,
          position: "relative",
        }}
      >
        {/* Left slots */}
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <EquipSlot label="HEAD" icon="⛑" />
          <EquipSlot label="CHEST" icon="🛡" />
        </div>

        {/* Sprite */}
        <div
          style={{
            border: `1.5px solid ${classAccent}`,
            borderRadius: 8,
            padding: 4,
            background: "rgba(0,0,0,0.25)",
            boxShadow: `0 0 12px ${classAccent}`,
          }}
        >
          <svg width="48" height="72" viewBox="0 0 48 72" aria-hidden="true">
            {/* Head */}
            <circle cx="24" cy="10" r="8" fill={hairColor} opacity={0.9} />
            {/* Hair band */}
            <ellipse
              cx="24"
              cy="17"
              rx="8"
              ry="2"
              fill={hairColor}
              opacity={0.6}
            />
            {/* Body */}
            <rect
              x="14"
              y="20"
              width="20"
              height="22"
              rx="4"
              fill={outfitColor}
              opacity={0.85}
            />
            {/* Belt */}
            <rect
              x="14"
              y="38"
              width="20"
              height="3"
              rx="1"
              fill={hairColor}
              opacity={0.5}
            />
            {/* Legs */}
            <rect
              x="14"
              y="44"
              width="8"
              height="20"
              rx="3"
              fill={outfitColor}
              opacity={0.7}
            />
            <rect
              x="26"
              y="44"
              width="8"
              height="20"
              rx="3"
              fill={outfitColor}
              opacity={0.7}
            />
            {/* Arms */}
            <rect
              x="4"
              y="22"
              width="8"
              height="16"
              rx="3"
              fill={outfitColor}
              opacity={0.75}
            />
            <rect
              x="36"
              y="22"
              width="8"
              height="16"
              rx="3"
              fill={outfitColor}
              opacity={0.75}
            />
            {/* Class icon */}
            <text
              x="24"
              y="33"
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255,255,255,0.85)"
            >
              {selectedClass === "mage" ? "🪄" : "⚔"}
            </text>
            {/* Weapon hand indicator */}
            {weapon === "sword" && (
              <text x="3" y="33" textAnchor="middle" fontSize="9">
                🗡
              </text>
            )}
            {weapon === "axe" && (
              <text x="3" y="33" textAnchor="middle" fontSize="9">
                🪓
              </text>
            )}
            {weapon === "long_staff" && (
              <text x="3" y="30" textAnchor="middle" fontSize="9">
                🪄
              </text>
            )}
            {weapon === "short_wand" && (
              <text x="3" y="33" textAnchor="middle" fontSize="9">
                ✨
              </text>
            )}
          </svg>
        </div>

        {/* Right slots */}
        <div
          style={{
            position: "absolute",
            right: 8,
            top: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <EquipSlot label="WEAP" icon="⚔" />
          <EquipSlot label="ACC" icon="💍" />
        </div>
      </div>

      {/* Gender */}
      <RowLabel label="Gender">
        <RadioGroup
          options={
            [
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ] as const
          }
          value={gender}
          onChange={(v) => setGender(v as "male" | "female")}
          disabled={isGuest}
        />
      </RowLabel>

      {/* Weapon */}
      <RowLabel label="Weapon">
        {selectedClass === "warrior" ? (
          <RadioGroup
            options={
              [
                { value: "sword", label: "Sword" },
                { value: "axe", label: "Axe" },
              ] as const
            }
            value={weapon}
            onChange={(v) =>
              setWeapon(v as "sword" | "axe" | "long_staff" | "short_wand")
            }
            disabled={isGuest}
          />
        ) : (
          <RadioGroup
            options={
              [
                { value: "long_staff", label: "Staff" },
                { value: "short_wand", label: "Wand" },
              ] as const
            }
            value={weapon}
            onChange={(v) =>
              setWeapon(v as "sword" | "axe" | "long_staff" | "short_wand")
            }
            disabled={isGuest}
          />
        )}
      </RowLabel>

      {/* Outfit Color */}
      <RowLabel label="Outfit">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {OUTFIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => !isGuest && setOutfitColor(c)}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: c,
                border:
                  outfitColor === c
                    ? "2.5px solid rgba(255,215,0,0.9)"
                    : "2px solid rgba(0,0,0,0.5)",
                boxShadow: outfitColor === c ? `0 0 6px ${c}` : "none",
                cursor: isGuest ? "default" : "pointer",
                flexShrink: 0,
                transition: "box-shadow 0.12s",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-label={`Outfit color ${c}`}
            />
          ))}
        </div>
      </RowLabel>

      {/* Hair Color */}
      <RowLabel label="Hair">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {OUTFIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => !isGuest && setHairColor(c)}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: c,
                border:
                  hairColor === c
                    ? "2.5px solid rgba(255,215,0,0.9)"
                    : "2px solid rgba(0,0,0,0.5)",
                boxShadow: hairColor === c ? `0 0 6px ${c}` : "none",
                cursor: isGuest ? "default" : "pointer",
                flexShrink: 0,
                transition: "box-shadow 0.12s",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-label={`Hair color ${c}`}
            />
          ))}
        </div>
      </RowLabel>

      {!isGuest && (
        <button
          type="button"
          data-ocid="outfit.save_button"
          style={{
            height: 38,
            borderRadius: 6,
            background: "rgba(255,215,0,0.15)",
            border: "1px solid rgba(255,215,0,0.40)",
            color: "rgba(255,215,0,0.9)",
            fontFamily: "monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          SAVE APPEARANCE
        </button>
      )}
    </div>
  );
}

// ─── Sub-panel: Skills ────────────────────────────────────────────────────────

function SkillsPanel({
  selectedClass,
  isGuest,
}: {
  selectedClass: CharacterClass;
  isGuest: boolean;
}) {
  const skills = selectedClass === "warrior" ? WARRIOR_SKILLS : MAGE_SKILLS;
  const classColor =
    selectedClass === "warrior"
      ? "oklch(0.60 0.22 25)"
      : "oklch(0.55 0.18 260)";
  const classColorRaw = selectedClass === "warrior" ? "#e74c3c" : "#5856d6";

  const [points, setPoints] = useState<Record<string, number>>(() =>
    loadSkillPoints(),
  );
  const totalSpent = Object.values(points).reduce((a, b) => a + b, 0);
  const availablePoints = isGuest ? 0 : Math.max(0, 5 - totalSpent);

  const spendPoint = (id: string) => {
    if (isGuest || availablePoints <= 0) return;
    const current = points[id] ?? 0;
    if (current >= 5) return;
    const updated = { ...points, [id]: current + 1 };
    setPoints(updated);
    saveSkillPoints(updated);
  };

  const resetSkills = () => {
    if (isGuest) return;
    setPoints({});
    saveSkillPoints({});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {isGuest && (
        <div
          style={{
            background: "rgba(255,193,7,0.10)",
            border: "1px solid rgba(255,193,7,0.35)",
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,193,7,0.85)",
            textAlign: "center",
          }}
        >
          🔒 Sign in to save skill changes
        </div>
      )}

      {/* Available points badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Skill points:
          </span>
          <span
            style={{
              background:
                availablePoints > 0
                  ? "rgba(255,215,0,0.18)"
                  : "rgba(255,255,255,0.06)",
              border: `1px solid ${
                availablePoints > 0
                  ? "rgba(255,215,0,0.5)"
                  : "rgba(255,255,255,0.15)"
              }`,
              borderRadius: 99,
              padding: "2px 10px",
              fontFamily: "monospace",
              fontSize: 12,
              fontWeight: 700,
              color: availablePoints > 0 ? "#ffd700" : "rgba(255,255,255,0.35)",
            }}
          >
            {availablePoints}
          </span>
        </div>
        {!isGuest && totalSpent > 0 && (
          <button
            type="button"
            data-ocid="skills.reset_button"
            onClick={resetSkills}
            style={{
              height: 26,
              padding: "0 10px",
              borderRadius: 5,
              background: "rgba(220,38,38,0.12)",
              border: "1px solid rgba(220,38,38,0.35)",
              color: "rgba(255,80,80,0.80)",
              fontFamily: "monospace",
              fontSize: 9,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            Reset — 200 gold
          </button>
        )}
      </div>

      {/* Skill tree: nodes connected by vertical lines */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {skills.map((skill, index) => {
          const lvl = points[skill.id] ?? 0;
          const maxed = lvl >= 5;
          const hasPoints = !isGuest && availablePoints > 0 && !maxed;
          return (
            <div key={skill.id} style={{ position: "relative" }}>
              {/* Connecting line from previous node */}
              {index > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 26,
                    top: 0,
                    width: 2,
                    height: 10,
                    background:
                      (points[skills[index - 1].id] ?? 0) > 0
                        ? `${classColorRaw}99`
                        : "rgba(255,255,255,0.10)",
                  }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: index > 0 ? 10 : 0,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: maxed
                    ? "rgba(255,215,0,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: maxed
                    ? "1px solid rgba(255,215,0,0.30)"
                    : `1px solid ${classColor}44`,
                }}
              >
                {/* Icon circle */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: maxed
                      ? "rgba(255,215,0,0.15)"
                      : lvl > 0
                        ? `${classColorRaw}22`
                        : "rgba(255,255,255,0.06)",
                    border: maxed
                      ? "2px solid #ffd700"
                      : lvl > 0
                        ? `2px solid ${classColorRaw}88`
                        : `2px solid ${classColor}44`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    boxShadow: maxed
                      ? "0 0 10px rgba(255,215,0,0.4)"
                      : lvl > 0
                        ? `0 0 6px ${classColorRaw}55`
                        : "none",
                    flexShrink: 0,
                  }}
                >
                  {skill.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      color: maxed
                        ? "#ffd700"
                        : lvl > 0
                          ? "rgba(255,255,255,0.92)"
                          : "rgba(255,255,255,0.75)",
                    }}
                  >
                    {skill.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 9,
                      color: "rgba(255,255,255,0.38)",
                      marginTop: 1,
                    }}
                  >
                    {skill.desc}
                  </div>
                  {/* Pip row */}
                  <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
                    {[1, 2, 3, 4, 5].map((dotLevel) => (
                      <span
                        key={`${skill.id}-d${dotLevel}`}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            dotLevel <= lvl
                              ? maxed
                                ? "#ffd700"
                                : classColorRaw
                              : "rgba(255,255,255,0.12)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          display: "inline-block",
                          boxShadow:
                            dotLevel <= lvl && !maxed
                              ? `0 0 4px ${classColorRaw}99`
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  data-ocid={`skills.spend_button.${index + 1}`}
                  onClick={() => spendPoint(skill.id)}
                  disabled={!hasPoints}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: hasPoints
                      ? `${classColorRaw}22`
                      : "rgba(255,255,255,0.04)",
                    border: hasPoints
                      ? `1.5px solid ${classColorRaw}77`
                      : "1px solid rgba(255,255,255,0.10)",
                    color: hasPoints ? classColorRaw : "rgba(255,255,255,0.18)",
                    fontSize: 20,
                    fontWeight: 700,
                    cursor: hasPoints ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    WebkitTapHighlightColor: "transparent",
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-panel: Stats ─────────────────────────────────────────────────────────

function StatsPanel({
  username,
  selectedClass,
  level,
  hp,
  maxHp,
  mp,
  maxMp,
  kills,
  deaths,
  activeTitleId,
}: {
  username: string;
  selectedClass: CharacterClass;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  kills?: number;
  deaths?: number;
  activeTitleId: TitleId;
}) {
  const classColor =
    selectedClass === "warrior"
      ? "oklch(0.60 0.22 25)"
      : "oklch(0.55 0.18 260)";
  const classColorRaw = selectedClass === "warrior" ? "#e74c3c" : "#5856d6";

  const atk = selectedClass === "warrior" ? 18 : 12;
  const def = selectedClass === "warrior" ? 10 : 5;
  const speed = selectedClass === "warrior" ? 6 : 8;
  const pvpKills = 0;
  const zonesDiscovered = 1;
  const playTime = "0:04";

  const statBars: Array<{
    label: string;
    value: number;
    max: number;
    color: string;
  }> = [
    { label: "HP", value: hp, max: maxHp, color: "#e74c3c" },
    { label: "MP", value: mp, max: maxMp, color: "#3498db" },
    { label: "ATK", value: atk, max: 100, color: "#f39c12" },
    { label: "DEF", value: def, max: 100, color: "#2ecc71" },
    { label: "SPD", value: speed, max: 20, color: "#9b59b6" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Character header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 8,
          background: `${classColorRaw}12`,
          border: `1px solid ${classColorRaw}44`,
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 22 }}>
          {selectedClass === "warrior" ? "⚔" : "🪄"}
        </span>
        <div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 14,
              fontWeight: 700,
              color: "rgba(255,255,255,0.90)",
            }}
          >
            {username}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <span
              style={{
                background: `${classColorRaw}33`,
                border: `1px solid ${classColorRaw}66`,
                borderRadius: 4,
                padding: "1px 6px",
                fontFamily: "monospace",
                fontSize: 9,
                fontWeight: 700,
                color: classColor,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {selectedClass}
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: "rgba(255,255,255,0.40)",
                alignSelf: "center",
              }}
            >
              Lv.{level}
            </span>
          </div>
        </div>
        {TITLE_LABELS[activeTitleId] && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "monospace",
              fontSize: 10,
              color: "#ffd700",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            [{TITLE_LABELS[activeTitleId]}]
          </span>
        )}
      </div>

      {/* Stat bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {statBars.map(({ label, value, max, color }) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                width: 30,
                flexShrink: 0,
              }}
            >
              {label}
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(Math.min(100, (value / max) * 100))}%`,
                  background: `linear-gradient(90deg, ${color}aa, ${color})`,
                  borderRadius: 3,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.70)",
                fontWeight: 700,
                width: 52,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {label === "HP" || label === "MP" ? `${value}/${max}` : value}
            </span>
          </div>
        ))}
      </div>

      {/* Combat / misc stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 5,
          marginTop: 4,
        }}
      >
        {(
          [
            ["Kills", kills ?? 0],
            ["PVP Kills", pvpKills],
            ["Deaths", deaths ?? 0],
            ["Zones", zonesDiscovered],
            ["Playtime", playTime],
          ] as [string, string | number][]
        ).map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "5px 8px",
              borderRadius: 5,
              background: "rgba(255,255,255,0.03)",
              borderLeft: `2px solid ${classColorRaw}55`,
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.38)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {label}
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,0.80)",
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-panel: Titles ────────────────────────────────────────────────────────

function TitlesPanel({
  earnedTitles,
  activeTitleId,
  onSelectTitle,
  isGuest,
}: {
  earnedTitles: TitleId[];
  activeTitleId: TitleId;
  onSelectTitle?: (id: TitleId) => void;
  isGuest: boolean;
}) {
  const allTitleIds = Object.keys(TITLE_LABELS) as TitleId[];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {allTitleIds.map((tid) => {
        const earned = earnedTitles.includes(tid);
        const active = activeTitleId === tid;
        return (
          <button
            key={tid}
            type="button"
            data-ocid={`titles.title.${tid}`}
            onClick={() => !isGuest && earned && onSelectTitle?.(tid)}
            disabled={!earned || isGuest}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 6,
              background: active
                ? "rgba(255,215,0,0.12)"
                : earned
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.02)",
              border: active
                ? "1.5px solid rgba(255,215,0,0.50)"
                : earned
                  ? "1px solid rgba(255,255,255,0.18)"
                  : "1px solid rgba(255,255,255,0.06)",
              cursor: earned && !isGuest ? "pointer" : "default",
              textAlign: "left",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{ fontSize: 16 }}>
              {active ? "🏅" : earned ? "✅" : "🔒"}
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                fontWeight: active ? 700 : 400,
                color: active
                  ? "#ffd700"
                  : earned
                    ? "rgba(255,255,255,0.80)"
                    : "rgba(255,255,255,0.25)",
              }}
            >
              [{TITLE_LABELS[tid]}]
            </span>
            {active && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "#ffd700",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                ACTIVE
              </span>
            )}
          </button>
        );
      })}
      {isGuest && (
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.30)",
            textAlign: "center",
            marginTop: 4,
          }}
        >
          Guests cannot earn or equip titles.
        </p>
      )}
    </div>
  );
}

// ─── Sub-panel: Settings ──────────────────────────────────────────────────────

function SettingsSubPanel({
  onLogout,
  isGuest,
}: {
  onLogout?: () => void;
  isGuest?: boolean;
}) {
  const [settings, setSettings] = useState(() => ({
    masterVol: 80,
    musicVol: 70,
    sfxVol: 80,
    particles: "high" as "high" | "medium" | "low" | "off",
    autoPickup: true,
    showDmg: true,
    respawnCity: "meadow_hub" as "meadow_hub" | "aurelion",
    ...loadSettings(),
  }));

  const update = useCallback(
    (k: string, v: unknown) => {
      const updated = { ...settings, [k]: v };
      setSettings(updated);
      saveSettings(updated as Record<string, unknown>);
    },
    [settings],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {isGuest && (
        <div
          style={{
            background: "rgba(255,193,7,0.10)",
            border: "1px solid rgba(255,193,7,0.35)",
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,193,7,0.85)",
            textAlign: "center",
          }}
        >
          🔒 Sign in to save settings
        </div>
      )}

      <SliderRow
        label="Master Volume"
        value={settings.masterVol}
        onChange={(v) => update("masterVol", v)}
      />
      <SliderRow
        label="Music Volume"
        value={settings.musicVol}
        onChange={(v) => update("musicVol", v)}
      />
      <SliderRow
        label="SFX Volume"
        value={settings.sfxVol}
        onChange={(v) => update("sfxVol", v)}
      />

      <RowLabel label="Particles">
        <SegmentedButtons
          options={["High", "Med", "Low", "Off"]}
          values={["high", "medium", "low", "off"]}
          active={settings.particles}
          onChange={(v) => update("particles", v)}
        />
      </RowLabel>

      <RowLabel label="Auto-pickup Gold">
        <Toggle
          value={settings.autoPickup}
          onChange={(v) => update("autoPickup", v)}
        />
      </RowLabel>

      <RowLabel label="Damage Numbers">
        <Toggle
          value={settings.showDmg}
          onChange={(v) => update("showDmg", v)}
        />
      </RowLabel>

      <RowLabel label="Home Respawn">
        <RadioGroup
          options={
            [
              { value: "meadow_hub", label: "Meadow Hub" },
              { value: "aurelion", label: "Aurelion" },
            ] as const
          }
          value={settings.respawnCity}
          onChange={(v) => update("respawnCity", v)}
        />
      </RowLabel>

      {/* Logout */}
      <button
        type="button"
        data-ocid="settings.logout_button"
        onClick={onLogout}
        style={{
          marginTop: 8,
          height: 44,
          borderRadius: 8,
          background: "rgba(220,38,38,0.18)",
          border: "1.5px solid rgba(220,38,38,0.50)",
          color: "rgba(255,80,80,0.9)",
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        LOGOUT
      </button>
    </div>
  );
}

// ─── Sub-panel: Friends (stub) ────────────────────────────────────────────────

function FriendsPanel({ isGuest }: { isGuest: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingTop: 20,
      }}
    >
      <span style={{ fontSize: 32 }}>👥</span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          color: "rgba(255,255,255,0.40)",
          textAlign: "center",
        }}
      >
        {isGuest
          ? "Guests cannot add friends."
          : "Your friends list is empty. Ask players in-game to add you!"}
      </span>
    </div>
  );
}

// ─── Sub-panel: Quests (stub) ─────────────────────────────────────────────────

function QuestsPanel({ isGuest }: { isGuest: boolean }) {
  const quests = [
    {
      id: "first_steps",
      icon: "⚔",
      title: "First Steps",
      desc: "Kill 5 monsters in Forest",
      progress: "0/5",
    },
    {
      id: "ancient_city",
      icon: "🏛",
      title: "Ancient City",
      desc: "Find and enter Aurelion",
      progress: "0/1",
    },
    {
      id: "warrior_trial",
      icon: "🛡",
      title: "Warrior Trial",
      desc: "Kill 10 enemies using Shield",
      progress: "0/10",
    },
    {
      id: "arcane_study",
      icon: "🔮",
      title: "Arcane Study",
      desc: "Cast all 4 spells in combat",
      progress: "0/4",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {quests.map((q) => (
        <div
          key={q.id}
          data-ocid={`quests.quest.${q.id}`}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 20, marginTop: 1 }}>{q.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {q.title}
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.40)",
                marginTop: 2,
              }}
            >
              {q.desc}
            </div>
          </div>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "rgba(255,215,0,0.75)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {isGuest ? "—" : q.progress}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Sub-panel: World Map (stub) ──────────────────────────────────────────────

function WorldMapPanel() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        paddingTop: 16,
      }}
    >
      <span style={{ fontSize: 32 }}>🗺</span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          color: "rgba(255,255,255,0.40)",
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        Explore zones to reveal the world map.
        <br />
        Discovered zones appear here.
      </span>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function SmallMenuBtn({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 30,
        borderRadius: 5,
        background: danger ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${
          danger ? "rgba(220,38,38,0.40)" : "rgba(255,255,255,0.14)"
        }`,
        color: danger ? "rgba(255,80,80,0.85)" : "rgba(255,255,255,0.70)",
        fontFamily: "monospace",
        fontSize: 10,
        fontWeight: 700,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </button>
  );
}

function EquipSlot({ label, icon }: { label: string; icon?: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 36,
        borderRadius: 6,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.18)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        transition: "border-color 0.12s",
      }}
    >
      {icon && <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>}
      <span
        style={{
          fontSize: 7,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.30)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function RowLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.40)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          width: 72,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => !disabled && onChange(opt.value)}
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 5,
            background:
              value === opt.value
                ? "rgba(255,215,0,0.15)"
                : "rgba(255,255,255,0.05)",
            border:
              value === opt.value
                ? "1.5px solid rgba(255,215,0,0.50)"
                : "1px solid rgba(255,255,255,0.12)",
            color:
              value === opt.value
                ? "rgba(255,215,0,0.9)"
                : "rgba(255,255,255,0.50)",
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: value === opt.value ? 700 : 400,
            cursor: disabled ? "default" : "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SegmentedButtons({
  options,
  values,
  active,
  onChange,
}: {
  options: string[];
  values: string[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((opt, i) => (
        <button
          key={values[i]}
          type="button"
          onClick={() => onChange(values[i])}
          style={{
            flex: 1,
            height: 28,
            borderRadius: 5,
            background:
              active === values[i]
                ? "rgba(68,170,255,0.20)"
                : "rgba(255,255,255,0.05)",
            border:
              active === values[i]
                ? "1.5px solid rgba(68,170,255,0.55)"
                : "1px solid rgba(255,255,255,0.12)",
            color:
              active === values[i]
                ? "rgba(68,170,255,0.9)"
                : "rgba(255,255,255,0.40)",
            fontFamily: "monospace",
            fontSize: 9,
            fontWeight: active === values[i] ? 700 : 400,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#44aaff", height: 20 }}
        aria-label={label}
      />
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? "rgba(68,170,255,0.35)" : "rgba(255,255,255,0.08)",
        border: value
          ? "1.5px solid rgba(68,170,255,0.60)"
          : "1px solid rgba(255,255,255,0.15)",
        position: "relative",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? "calc(100% - 20px)" : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: value ? "#44aaff" : "rgba(255,255,255,0.35)",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

function itemIcon(type: string): string {
  const MAP: Record<string, string> = {
    coin: "🪙",
    sword_basic: "⚔",
    staff_basic: "🪄",
    leather_armor: "🛡",
    cloth_robe: "👘",
    iron_shield: "🔰",
    leather_scrap: "🪡",
    bear_pelt: "🐻",
    stone_fragment: "🪨",
    rare_gem: "💎",
    troll_hide: "🧌",
    rare_weapon: "⚡",
    health_potion: "❤",
    mana_potion: "💧",
    poison_vial: "☠",
    ancient_rune_shard: "✨",
    glowing_mushroom: "🍄",
    large_health_potion: "💊",
    mana_crystal: "🔮",
    warrior_emblem: "🦁",
    mage_focus: "🌟",
    iron_legion_helmet: "⛑",
    iron_legion_chestplate: "🛡",
    iron_legion_gauntlets: "🥊",
    scholars_hat: "🎓",
    scholars_robe: "👔",
    scholars_focus: "🌙",
  };
  return MAP[type] ?? "📦";
}

// ─── Main grid button ─────────────────────────────────────────────────────────

interface GridButtonProps {
  icon: string;
  label: string;
  panelId: SubPanel;
  active: boolean;
  onClick: (id: SubPanel) => void;
}

function GridButton({
  icon,
  label,
  panelId,
  active,
  onClick,
}: GridButtonProps) {
  const [pressed, setPressed] = useState(false);
  const themeColor = panelId ? (PANEL_THEME[panelId] ?? "#888") : "#888";

  return (
    <button
      type="button"
      data-ocid={`game-menu.${label.toLowerCase().replace(/\s+/g, "_")}_button`}
      onClick={() => onClick(panelId)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        minWidth: 80,
        minHeight: 70,
        borderRadius: 10,
        background: active
          ? `${themeColor}22`
          : pressed
            ? `${themeColor}18`
            : "rgba(255,255,255,0.04)",
        border: active
          ? `1.5px solid ${themeColor}77`
          : `1px solid ${themeColor}40`,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        transition: "background 0.12s, border-color 0.12s",
        transform: pressed ? "scale(0.94)" : "scale(1)",
        padding: 4,
        boxShadow: active ? `0 0 8px ${themeColor}33` : "none",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
        {icon}
      </span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          fontWeight: 700,
          color: active ? themeColor : "rgba(255,255,255,0.60)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function GameMenuPanel({
  isOpen,
  onClose,
  selectedClass,
  isGuest,
  username,
  level,
  hp,
  maxHp,
  mp,
  maxMp,
  coins,
  inventory,
  earnedTitles,
  activeTitleId,
  kills,
  deaths,
  onSelectTitle,
  onLogout,
}: GameMenuPanelProps) {
  const [activePanel, setActivePanel] = useState<SubPanel>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on backdrop tap
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Reset sub-panel on close
  useEffect(() => {
    if (!isOpen) setActivePanel(null);
  }, [isOpen]);

  // ESC closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePanel) setActivePanel(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, activePanel, onClose]);

  const GRID_ITEMS: Array<{
    icon: string;
    label: string;
    panelId: SubPanel;
  }> = [
    { icon: "🎒", label: "Backpack", panelId: "backpack" },
    { icon: "👕", label: "Outfit", panelId: "outfit" },
    { icon: "🗺", label: "World Map", panelId: "world_map" },
    { icon: "⚔", label: "Skills", panelId: "skills" },
    { icon: "🏆", label: "Quests", panelId: "quests" },
    { icon: "🏅", label: "Titles", panelId: "titles" },
    { icon: "👥", label: "Friends", panelId: "friends" },
    { icon: "📊", label: "Stats", panelId: "stats" },
    { icon: "⚙", label: "Settings", panelId: "settings" },
  ];

  // Panel height = chat strip (55px) + controls bar (260px) + safe-area
  const PANEL_HEIGHT = 315;

  const subPanelLabel = activePanel
    ? (GRID_ITEMS.find((g) => g.panelId === activePanel)?.label ?? "")
    : "";

  if (!isOpen) return null;

  return (
    // Backdrop — tap outside to close
    <dialog
      data-ocid="game-menu.dialog"
      open
      aria-modal="true"
      aria-label="Game menu"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (activePanel) setActivePanel(null);
          else onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        width: "100vw",
        height: "100dvh",
        maxWidth: "unset",
        maxHeight: "unset",
        pointerEvents: "auto",
      }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          width: "100%",
          height: PANEL_HEIGHT,
          background: "rgba(5,8,20,0.97)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderTop: "1.5px solid rgba(255,215,0,0.18)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          // Slide-in animation
          animation: "menuSlideUp 0.22s ease both",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          {/* Back or title */}
          {activePanel ? (
            <button
              type="button"
              data-ocid="game-menu.back_button"
              onClick={() => setActivePanel(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.55)",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 4px",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-label="Back to menu"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 2L4 7L9 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                }}
              >
                BACK
              </span>
            </button>
          ) : (
            <div style={{ width: 48 }} />
          )}

          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(255,215,0,0.90)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            {activePanel ? subPanelLabel : "MENU"}
          </span>

          <button
            type="button"
            data-ocid="game-menu.close_button"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 30,
              height: 30,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.55)",
              fontSize: 16,
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Content ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 12px",
            minHeight: 0,
          }}
        >
          {/* Main grid */}
          {!activePanel && (
            <div
              data-ocid="game-menu.main_grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {GRID_ITEMS.map((item) => (
                <GridButton
                  key={item.panelId}
                  icon={item.icon}
                  label={item.label}
                  panelId={item.panelId}
                  active={activePanel === item.panelId}
                  onClick={(id) => setActivePanel(id)}
                />
              ))}
            </div>
          )}

          {/* Sub-panels */}
          {activePanel === "backpack" && (
            <BackpackPanel inventory={inventory} coins={coins} />
          )}
          {activePanel === "outfit" && (
            <OutfitPanel selectedClass={selectedClass} isGuest={isGuest} />
          )}
          {activePanel === "world_map" && <WorldMapPanel />}
          {activePanel === "skills" && (
            <SkillsPanel selectedClass={selectedClass} isGuest={isGuest} />
          )}
          {activePanel === "quests" && <QuestsPanel isGuest={isGuest} />}
          {activePanel === "titles" && (
            <TitlesPanel
              earnedTitles={earnedTitles}
              activeTitleId={activeTitleId}
              onSelectTitle={onSelectTitle}
              isGuest={isGuest}
            />
          )}
          {activePanel === "friends" && <FriendsPanel isGuest={isGuest} />}
          {activePanel === "stats" && (
            <StatsPanel
              username={username}
              selectedClass={selectedClass}
              level={level}
              hp={hp}
              maxHp={maxHp}
              mp={mp}
              maxMp={maxMp}
              kills={kills}
              deaths={deaths}
              activeTitleId={activeTitleId}
            />
          )}
          {activePanel === "settings" && (
            <SettingsSubPanel onLogout={onLogout} isGuest={isGuest} />
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes menuSlideUp {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .menu-grid-btn:active {
          transform: scale(0.94) !important;
        }
      `}</style>
    </dialog>
  );
}
