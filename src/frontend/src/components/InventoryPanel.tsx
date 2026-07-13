import { useEffect, useRef, useState } from "react";
import type {
  CharacterClass,
  EquippedGear,
  Gender,
  InventoryItem,
  ItemType,
} from "../types/game";

// ─── Item Catalog ─────────────────────────────────────────────────────────────

type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
type EquipSlotKey = "head" | "chest" | "weapon" | "accessory1" | "accessory2";

interface ItemCatalogEntry {
  icon: string;
  label: string;
  type: "Weapon" | "Armor" | "Accessory" | "Consumable" | "Material";
  rarity: ItemRarity;
  stats: Partial<Record<string, number>>;
  secondaryStat?: string;
  secondaryLabel?: string;
  flavorText: string;
  equipSlot: EquipSlotKey | null;
}

const ITEM_CATALOG: Partial<Record<ItemType, ItemCatalogEntry>> = {
  sword_basic: {
    icon: "⚔",
    label: "Iron Sword",
    type: "Weapon",
    rarity: "common",
    stats: { ATK: 12 },
    secondaryStat: "crit",
    secondaryLabel: "+4% Crit Chance",
    flavorText: "A reliable blade forged in the Meadow smithy.",
    equipSlot: "weapon",
  },
  staff_basic: {
    icon: "✦",
    label: "Wooden Staff",
    type: "Weapon",
    rarity: "common",
    stats: { ATK: 8, MP: 10 },
    secondaryStat: "spell_range",
    secondaryLabel: "+1 Spell Range",
    flavorText: "Carved from a fallen branch of the Aurelion tree.",
    equipSlot: "weapon",
  },
  leather_armor: {
    icon: "🛡",
    label: "Leather Armor",
    type: "Armor",
    rarity: "common",
    stats: { DEF: 8, HP: 15 },
    flavorText: "Sturdy tanned hide sewn by a forest trapper.",
    equipSlot: "chest",
  },
  cloth_robe: {
    icon: "🌀",
    label: "Cloth Robe",
    type: "Armor",
    rarity: "common",
    stats: { DEF: 4, HP: 5, MP: 20 },
    flavorText: "Woven with minor enchantments for mana flow.",
    equipSlot: "chest",
  },
  iron_shield: {
    icon: "🔰",
    label: "Iron Shield",
    type: "Armor",
    rarity: "uncommon",
    stats: { DEF: 14 },
    flavorText: "Dented but dependable. A warrior's best friend.",
    equipSlot: "chest",
  },
  rare_weapon: {
    icon: "🗡",
    label: "Ancient Blade",
    type: "Weapon",
    rarity: "rare",
    stats: { ATK: 22, HP: 10 },
    secondaryStat: "crit",
    secondaryLabel: "+8% Crit Chance",
    flavorText: "A blade older than Aurelion itself. Still sharp.",
    equipSlot: "weapon",
  },
  mana_crystal: {
    icon: "💠",
    label: "Mana Crystal",
    type: "Accessory",
    rarity: "epic",
    stats: { MP: 25 },
    flavorText: "Pulsates with condensed arcane energy.",
    equipSlot: "accessory1",
  },
  warrior_emblem: {
    icon: "🛡",
    label: "Warrior Emblem",
    type: "Accessory",
    rarity: "rare",
    stats: { ATK: 10, DEF: 5 },
    flavorText: "Worn by veterans of a hundred battles.",
    equipSlot: "accessory1",
  },
  mage_focus: {
    icon: "🔱",
    label: "Mage Focus",
    type: "Accessory",
    rarity: "epic",
    stats: { ATK: 8, MP: 15 },
    secondaryStat: "spell_dmg",
    secondaryLabel: "+10% Spell Damage",
    flavorText: "Amplifies the arcane will of its wielder.",
    equipSlot: "accessory1",
  },
  // ── Iron Legion Set (Warrior) ──
  iron_legion_helmet: {
    icon: "🪖",
    label: "Iron Legion Helmet",
    type: "Armor",
    rarity: "rare",
    stats: { HP: 15, DEF: 3 },
    secondaryStat: "set",
    secondaryLabel: "Iron Legion Set (1/3)",
    flavorText:
      "Forged in the fires of the Iron Legion forge. Gleams with resolve.",
    equipSlot: "head",
  },
  iron_legion_chestplate: {
    icon: "🛡",
    label: "Iron Legion Chestplate",
    type: "Armor",
    rarity: "epic",
    stats: { HP: 25, DEF: 5 },
    secondaryStat: "set",
    secondaryLabel: "Iron Legion Set (2/3)",
    flavorText:
      "A legendary breastplate said to have turned a thousand blades.",
    equipSlot: "chest",
  },
  iron_legion_gauntlets: {
    icon: "🥊",
    label: "Iron Legion Gauntlets",
    type: "Accessory",
    rarity: "epic",
    stats: { HP: 10 },
    secondaryStat: "crit",
    secondaryLabel: "+2% Crit Chance | Iron Legion Set (3/3)",
    flavorText: "Iron fists of the most feared warriors in the realm.",
    equipSlot: "accessory1",
  },
  // ── Arcane Scholar Set (Mage) ──
  scholars_hat: {
    icon: "🎓",
    label: "Scholar's Hat",
    type: "Armor",
    rarity: "rare",
    stats: { MP: 10 },
    secondaryStat: "spell_dmg",
    secondaryLabel: "+2 Spell Power | Arcane Scholar Set (1/3)",
    flavorText: "Worn by those who spent decades studying the arcane arts.",
    equipSlot: "head",
  },
  scholars_robe: {
    icon: "🌀",
    label: "Scholar's Robe",
    type: "Armor",
    rarity: "epic",
    stats: { MP: 15 },
    secondaryStat: "spell_dmg",
    secondaryLabel: "+4 Spell Power | Arcane Scholar Set (2/3)",
    flavorText: "Woven with ancient glyphs that channel mana with precision.",
    equipSlot: "chest",
  },
  scholars_focus: {
    icon: "🔮",
    label: "Scholar's Focus",
    type: "Accessory",
    rarity: "epic",
    stats: { MP: 5 },
    secondaryStat: "spell_cost",
    secondaryLabel: "-1 MP Spell Cost | Arcane Scholar Set (3/3)",
    flavorText:
      "A crystalline orb tuned to reduce the cost of every incantation.",
    equipSlot: "accessory1",
  },
  health_potion: {
    icon: "🧴",
    label: "Health Potion",
    type: "Consumable",
    rarity: "common",
    stats: {},
    flavorText: "Restores 40% HP when used.",
    equipSlot: null,
  },
  large_health_potion: {
    icon: "🧴",
    label: "Large Health Potion",
    type: "Consumable",
    rarity: "uncommon",
    stats: {},
    flavorText: "A concentrated brew. Restores 80% HP.",
    equipSlot: null,
  },
  mana_potion: {
    icon: "💧",
    label: "Mana Potion",
    type: "Consumable",
    rarity: "common",
    stats: {},
    flavorText: "Replenishes 40% MP when used.",
    equipSlot: null,
  },
  leather_scrap: {
    icon: "🪶",
    label: "Leather Scrap",
    type: "Material",
    rarity: "common",
    stats: {},
    flavorText: "A rough strip of hide. Used in crafting.",
    equipSlot: null,
  },
  bear_pelt: {
    icon: "🐾",
    label: "Bear Pelt",
    type: "Material",
    rarity: "uncommon",
    stats: {},
    flavorText: "Thick fur from the bear forest. Warm and durable.",
    equipSlot: null,
  },
  stone_fragment: {
    icon: "🪨",
    label: "Stone Fragment",
    type: "Material",
    rarity: "common",
    stats: {},
    flavorText: "Chipped from a ruin wall. Might be useful.",
    equipSlot: null,
  },
  rare_gem: {
    icon: "💎",
    label: "Rare Gem",
    type: "Material",
    rarity: "rare",
    stats: {},
    flavorText: "Shimmers with inner light. Highly valuable.",
    equipSlot: null,
  },
  troll_hide: {
    icon: "🦴",
    label: "Troll Hide",
    type: "Material",
    rarity: "uncommon",
    stats: {},
    flavorText: "Rough and tough. Smells faintly of forest.",
    equipSlot: null,
  },
  poison_vial: {
    icon: "🧪",
    label: "Poison Vial",
    type: "Consumable",
    rarity: "uncommon",
    stats: {},
    flavorText: "Swamp witch brew. Poisons next attack.",
    equipSlot: null,
  },
  ancient_rune_shard: {
    icon: "🔮",
    label: "Ancient Rune Shard",
    type: "Material",
    rarity: "rare",
    stats: {},
    flavorText: "Fragment of a forgotten language. Hums softly.",
    equipSlot: null,
  },
  coin: {
    icon: "🪙",
    label: "Gold Coin",
    type: "Material",
    rarity: "common",
    stats: {},
    flavorText: "Spends well anywhere in the realm.",
    equipSlot: null,
  },
};

// ─── Item Set Definitions ─────────────────────────────────────────────────────

const IRON_LEGION_SET: ItemType[] = [
  "iron_legion_helmet",
  "iron_legion_chestplate",
  "iron_legion_gauntlets",
];
const ARCANE_SCHOLAR_SET: ItemType[] = [
  "scholars_hat",
  "scholars_robe",
  "scholars_focus",
];

interface SetBonusInfo {
  name: string;
  pieces: ItemType[];
  bonuses: Array<{ pieces: number; description: string }>;
  color: string;
}

const SET_DEFINITIONS: SetBonusInfo[] = [
  {
    name: "Iron Legion",
    pieces: IRON_LEGION_SET,
    bonuses: [
      { pieces: 2, description: "+10% Max HP" },
      { pieces: 3, description: "Shield Skill Cooldown -20%" },
    ],
    color: "oklch(0.72 0.14 55)",
  },
  {
    name: "Arcane Scholar",
    pieces: ARCANE_SCHOLAR_SET,
    bonuses: [
      { pieces: 2, description: "+10% Max MP" },
      { pieces: 3, description: "All Spell MP Costs -15%" },
    ],
    color: "oklch(0.72 0.20 260)",
  },
];

function getActiveSetBonuses(
  equippedItems: (ItemType | null)[],
): Array<{ set: SetBonusInfo; count: number }> {
  return SET_DEFINITIONS.map((set) => ({
    set,
    count: set.pieces.filter((p) => equippedItems.includes(p)).length,
  })).filter((s) => s.count >= 2);
}

function isSetItem(itemType: ItemType): boolean {
  return [...IRON_LEGION_SET, ...ARCANE_SCHOLAR_SET].includes(itemType);
}

// ─── Rarity helpers ───────────────────────────────────────────────────────────

const RARITY_BORDER: Record<ItemRarity, string> = {
  common: "2px solid oklch(0.78 0 0 / 0.7)",
  uncommon: "2px solid oklch(0.72 0.18 145 / 0.85)",
  rare: "2px solid oklch(0.62 0.22 240 / 0.90)",
  epic: "2px solid oklch(0.58 0.22 290 / 0.90)",
  legendary: "2px solid oklch(0.75 0.20 85 / 0.95)",
};

const RARITY_COLOR: Record<ItemRarity, string> = {
  common: "oklch(0.85 0 0)",
  uncommon: "oklch(0.72 0.18 145)",
  rare: "oklch(0.68 0.22 240)",
  epic: "oklch(0.72 0.22 290)",
  legendary: "oklch(0.80 0.20 85)",
};

const RARITY_GLOW: Record<ItemRarity, string> = {
  common: "none",
  uncommon: "0 0 8px oklch(0.60 0.18 145 / 0.35)",
  rare: "0 0 10px oklch(0.55 0.22 240 / 0.40)",
  epic: "0 0 12px oklch(0.55 0.22 290 / 0.50)",
  legendary: "0 0 16px oklch(0.70 0.22 85 / 0.60)",
};

function getRarity(itemType: ItemType): ItemRarity {
  return ITEM_CATALOG[itemType]?.rarity ?? "common";
}

// ─── Slot definitions ─────────────────────────────────────────────────────────

interface EquipSlotDef {
  key: EquipSlotKey;
  label: string;
  icon: string;
  /** CSS position relative to the silhouette container (100%×240px) */
  style: React.CSSProperties;
}

const EQUIP_SLOT_DEFS: EquipSlotDef[] = [
  {
    key: "head",
    label: "Head",
    icon: "⛑",
    style: { top: 2, left: "50%", transform: "translateX(-50%)" },
  },
  {
    key: "chest",
    label: "Chest",
    icon: "🛡",
    style: { top: 72, left: 12 },
  },
  {
    key: "weapon",
    label: "Weapon",
    icon: "⚔",
    style: { top: 72, right: 12 },
  },
  {
    key: "accessory1",
    label: "Acc 1",
    icon: "💍",
    style: { bottom: 8, left: 12 },
  },
  {
    key: "accessory2",
    label: "Acc 2",
    icon: "💠",
    style: { bottom: 8, right: 12 },
  },
];

// ─── Character Silhouette ─────────────────────────────────────────────────────

function CharacterSilhouette({
  characterClass,
  gender,
  outfitColor,
}: {
  characterClass: CharacterClass;
  gender: Gender;
  outfitColor?: string;
}) {
  const isWarrior = characterClass === "warrior";
  const isFemale = gender === "female";
  const bodyColor = outfitColor ?? (isWarrior ? "#8b6a3a" : "#4a3b8c");
  const skinColor = "#e8c89a";
  const hairColor = isFemale ? "#8b4513" : "#4a3220";

  return (
    <svg
      width="80"
      height="160"
      viewBox="0 0 80 160"
      aria-labelledby="char-silhouette-title"
      style={{ filter: "drop-shadow(0 4px 12px oklch(0 0 0 / 0.5))" }}
    >
      <title id="char-silhouette-title">Character silhouette</title>
      {/* Shadow */}
      <ellipse cx="40" cy="156" rx="22" ry="5" fill="oklch(0 0 0 / 0.35)" />

      {/* Body */}
      {isWarrior ? (
        <>
          {/* Armor torso */}
          <rect
            x="22"
            y="60"
            width="36"
            height="44"
            rx="4"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.4)"
            strokeWidth="1.5"
          />
          {/* Armor chest detail */}
          <rect
            x="27"
            y="66"
            width="26"
            height="20"
            rx="2"
            fill="oklch(0 0 0 / 0.2)"
          />
          {/* Legs */}
          <rect
            x="22"
            y="102"
            width="16"
            height="40"
            rx="3"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.3)"
            strokeWidth="1"
          />
          <rect
            x="42"
            y="102"
            width="16"
            height="40"
            rx="3"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.3)"
            strokeWidth="1"
          />
          {/* Boots */}
          <rect x="20" y="136" width="19" height="12" rx="2" fill="#3a2a1a" />
          <rect x="41" y="136" width="19" height="12" rx="2" fill="#3a2a1a" />
          {/* Shoulders */}
          <rect x="12" y="58" width="14" height="14" rx="7" fill={bodyColor} />
          <rect x="54" y="58" width="14" height="14" rx="7" fill={bodyColor} />
          {/* Arms */}
          <rect
            x="10"
            y="68"
            width="12"
            height="36"
            rx="6"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.3)"
            strokeWidth="1"
          />
          <rect
            x="58"
            y="68"
            width="12"
            height="36"
            rx="6"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.3)"
            strokeWidth="1"
          />
          {/* Gauntlets */}
          <rect x="9" y="100" width="14" height="10" rx="3" fill="#5a4a2a" />
          <rect x="57" y="100" width="14" height="10" rx="3" fill="#5a4a2a" />
        </>
      ) : (
        <>
          {/* Robe torso */}
          <path
            d={`M22,60 L58,60 L${isFemale ? "62" : "60"},104 L${isFemale ? "18" : "20"},104 Z`}
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.3)"
            strokeWidth="1.5"
          />
          {/* Robe skirt */}
          <path
            d={`M${isFemale ? "18" : "20"},104 L${isFemale ? "62" : "60"},104 L64,148 L16,148 Z`}
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.3)"
            strokeWidth="1"
          />
          {/* Robe detail */}
          <path
            d="M36,62 L44,62 L46,108 L34,108 Z"
            fill="oklch(1 0 0 / 0.12)"
          />
          {/* Arms */}
          <rect
            x="10"
            y="62"
            width="12"
            height="38"
            rx="6"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.2)"
            strokeWidth="1"
          />
          <rect
            x="58"
            y="62"
            width="12"
            height="38"
            rx="6"
            fill={bodyColor}
            stroke="oklch(0 0 0 / 0.2)"
            strokeWidth="1"
          />
          {/* Sleeves */}
          <rect x="8" y="96" width="16" height="10" rx="4" fill={bodyColor} />
          <rect x="56" y="96" width="16" height="10" rx="4" fill={bodyColor} />
        </>
      )}

      {/* Neck */}
      <rect x="34" y="44" width="12" height="18" rx="4" fill={skinColor} />

      {/* Head */}
      <ellipse cx="40" cy="36" rx="18" ry="20" fill={skinColor} />

      {/* Hair */}
      {isFemale ? (
        <>
          <path
            d="M22,22 Q14,36 18,52"
            stroke={hairColor}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M58,22 Q66,36 62,52"
            stroke={hairColor}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            cx="40"
            cy="18"
            rx="18"
            ry="9"
            fill={hairColor}
            opacity="0.9"
          />
        </>
      ) : (
        <ellipse
          cx="40"
          cy="16"
          rx="18"
          ry="8"
          fill={hairColor}
          opacity="0.85"
        />
      )}

      {/* Eyes */}
      <ellipse cx="33" cy="34" rx="3" ry="3.5" fill="#2a1a0a" />
      <ellipse cx="47" cy="34" rx="3" ry="3.5" fill="#2a1a0a" />
      <ellipse cx="33" cy="33" rx="1.2" ry="1.5" fill="oklch(0.85 0 0 / 0.6)" />
      <ellipse cx="47" cy="33" rx="1.2" ry="1.5" fill="oklch(0.85 0 0 / 0.6)" />

      {/* Warrior helmet or Mage hat */}
      {isWarrior ? (
        <path
          d="M22,26 Q22,10 40,10 Q58,10 58,26 L56,30 L24,30 Z"
          fill={bodyColor}
          stroke="oklch(0 0 0 / 0.4)"
          strokeWidth="1.5"
        />
      ) : (
        <>
          <path
            d="M18,26 Q18,8 40,4 Q62,8 62,26 L58,28 L22,28 Z"
            fill={bodyColor}
            opacity="0.9"
          />
          <ellipse cx="40" cy="28" rx="24" ry="5" fill={bodyColor} />
          {/* Hat band */}
          <ellipse cx="40" cy="28" rx="22" ry="4" fill="oklch(0 0 0 / 0.25)" />
        </>
      )}
    </svg>
  );
}

// ─── Equipment Slot ───────────────────────────────────────────────────────────

function EquipSlot({
  slotDef,
  equippedItemType,
  selected,
  onTap,
}: {
  slotDef: EquipSlotDef;
  equippedItemType: ItemType | null;
  selected: boolean;
  onTap: () => void;
}) {
  const entry = equippedItemType ? ITEM_CATALOG[equippedItemType] : null;
  const rarity = equippedItemType ? getRarity(equippedItemType) : "common";
  const isLegendary = rarity === "legendary";
  const isSet = equippedItemType ? isSetItem(equippedItemType) : false;
  const animationName = isLegendary
    ? "legendaryPulse 2s ease-in-out infinite"
    : isSet
      ? "setItemPulse 2.5s ease-in-out infinite"
      : "none";

  return (
    <button
      type="button"
      onClick={onTap}
      data-ocid={`inventory.equip_slot.${slotDef.key}`}
      aria-label={`${slotDef.label}: ${entry?.label ?? "empty"}`}
      style={{
        position: "absolute",
        width: 48,
        height: 48,
        background: entry
          ? "oklch(0.15 0.04 260 / 0.85)"
          : "oklch(0.10 0 0 / 0.75)",
        border: entry
          ? RARITY_BORDER[rarity]
          : "1.5px solid oklch(0.25 0 0 / 0.5)",
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        cursor: "pointer",
        boxShadow: entry ? RARITY_GLOW[rarity] : "none",
        outline: selected ? "2px solid oklch(0.75 0.18 85 / 0.9)" : "none",
        outlineOffset: 2,
        animation: animationName,
        transition: "box-shadow 0.15s",
        ...slotDef.style,
      }}
    >
      <span
        style={{
          fontSize: entry ? 20 : 16,
          lineHeight: 1,
          opacity: entry ? 1 : 0.3,
        }}
      >
        {entry ? entry.icon : slotDef.icon}
      </span>
      <span
        style={{
          fontSize: 7,
          fontFamily: "monospace",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: entry ? RARITY_COLOR[rarity] : "oklch(0.35 0 0)",
          lineHeight: 1,
        }}
      >
        {slotDef.label}
      </span>
    </button>
  );
}

// ─── Inventory Grid Item ──────────────────────────────────────────────────────

function InventoryGridItem({
  item,
  selected,
  onTap,
  index,
}: {
  item: InventoryItem;
  selected: boolean;
  onTap: () => void;
  index: number;
}) {
  const entry = ITEM_CATALOG[item.itemType];
  const rarity = getRarity(item.itemType);
  const isLegendary = rarity === "legendary";
  const isSet = isSetItem(item.itemType);
  const gridAnimation = isLegendary
    ? "legendaryPulse 2s ease-in-out infinite"
    : isSet
      ? "setItemPulse 2.5s ease-in-out infinite"
      : "none";
  const icon = entry?.icon ?? "📦";

  return (
    <button
      type="button"
      onClick={onTap}
      data-ocid={`inventory.item.${index}`}
      aria-label={`${entry?.label ?? item.itemType}${item.amount > 1 ? ` x${item.amount}` : ""}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1",
        minHeight: 56,
        background: selected
          ? "oklch(0.20 0.06 260 / 0.90)"
          : "oklch(0.12 0.02 260 / 0.80)",
        border: selected
          ? "2px solid oklch(0.75 0.18 85 / 0.9)"
          : RARITY_BORDER[rarity],
        borderRadius: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: RARITY_GLOW[rarity],
        animation: gridAnimation,
        transition: "background 0.12s, border-color 0.12s",
        padding: 2,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      {item.amount > 1 && (
        <span
          style={{
            position: "absolute",
            bottom: 3,
            right: 4,
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "oklch(0.90 0 0)",
            textShadow: "0 1px 3px oklch(0 0 0 / 0.9)",
          }}
        >
          {item.amount}
        </span>
      )}
    </button>
  );
}

// ─── Item Tooltip Card ────────────────────────────────────────────────────────

function ItemTooltipCard({
  item,
  equippedGear,
  mode,
  slotKey,
  onEquip,
  onUnequip,
  onDrop,
  onClose,
}: {
  item: InventoryItem;
  equippedGear: ExtendedEquippedGear;
  mode: "inventory" | "equipped";
  slotKey?: EquipSlotKey;
  onEquip: (item: InventoryItem) => void;
  onUnequip: (slot: string) => void;
  onDrop: (itemId: string) => void;
  onClose: () => void;
}) {
  const entry = ITEM_CATALOG[item.itemType];
  if (!entry) return null;

  const rarity = getRarity(item.itemType);
  const nameColor = RARITY_COLOR[rarity];

  // Comparison: find what's in the target equip slot
  const targetSlot = entry.equipSlot;
  let equippedForComparison: ItemType | null = null;
  if (targetSlot && mode === "inventory") {
    if (targetSlot === "weapon") equippedForComparison = equippedGear.weapon;
    else if (targetSlot === "chest") equippedForComparison = equippedGear.armor;
    else if (targetSlot === "accessory1")
      equippedForComparison = equippedGear.offhand;
  }

  const equippedEntry = equippedForComparison
    ? ITEM_CATALOG[equippedForComparison]
    : null;

  // Compute stat comparison
  const newStats = entry.stats;
  const oldStats = equippedEntry?.stats ?? {};
  const allStatKeys = Array.from(
    new Set([...Object.keys(newStats), ...Object.keys(oldStats)]),
  );

  const overallDiff = allStatKeys.reduce((sum, k) => {
    return sum + ((newStats[k] ?? 0) - (oldStats[k] ?? 0));
  }, 0);

  const showComparison =
    mode === "inventory" &&
    equippedForComparison != null &&
    allStatKeys.length > 0;
  const isBetter = overallDiff > 0;

  return (
    <div
      data-ocid="inventory.tooltip"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(320px, 90vw)",
        background: "oklch(0.08 0.02 260 / 0.98)",
        border: `1.5px solid ${nameColor}44`,
        borderRadius: 8,
        padding: "12px 14px",
        zIndex: 100,
        boxShadow:
          "0 8px 32px oklch(0 0 0 / 0.7), 0 0 0 1px oklch(0.18 0 0 / 0.4)",
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              color: nameColor,
              letterSpacing: "0.03em",
            }}
          >
            {entry.icon} {entry.label}
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              color: "oklch(0.50 0 0)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginTop: 2,
            }}
          >
            {entry.type}
            {" · "}
            <span style={{ color: nameColor, opacity: 0.8 }}>{rarity}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-ocid="inventory.tooltip.close_button"
          aria-label="Close tooltip"
          style={{
            background: "none",
            border: "none",
            color: "oklch(0.40 0 0)",
            cursor: "pointer",
            fontSize: 14,
            padding: 2,
            lineHeight: 1,
            minWidth: 24,
            minHeight: 24,
          }}
        >
          ✕
        </button>
      </div>

      {/* Stats */}
      {allStatKeys.length > 0 && (
        <div
          style={{
            marginBottom: 8,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {allStatKeys.map((stat) => {
            const nv = newStats[stat] ?? 0;
            const ov = oldStats[stat] ?? 0;
            const diff = nv - ov;
            return (
              <div
                key={stat}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                <span style={{ color: "oklch(0.55 0 0)" }}>{stat}</span>
                <span style={{ color: "oklch(0.85 0 0)" }}>
                  +{nv}
                  {showComparison && diff !== 0 && (
                    <span
                      style={{
                        marginLeft: 6,
                        color: diff > 0 ? "#4ade80" : "#f87171",
                        fontSize: 10,
                      }}
                    >
                      {diff > 0 ? `↑ +${diff}` : `↓ ${diff}`}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Secondary stat */}
      {entry.secondaryLabel && (
        <div
          style={{
            marginBottom: 8,
            padding: "4px 8px",
            background: "oklch(0.15 0.04 85 / 0.4)",
            border: "1px solid oklch(0.35 0.10 85 / 0.35)",
            borderRadius: 4,
            fontFamily: "monospace",
            fontSize: 10,
            color: "oklch(0.72 0.14 85)",
          }}
        >
          ✦ {entry.secondaryLabel}
        </div>
      )}

      {/* Comparison arrow summary */}
      {showComparison && (
        <div
          style={{
            marginBottom: 8,
            fontFamily: "monospace",
            fontSize: 10,
            color: isBetter ? "#4ade80" : "#f87171",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 14 }}>{isBetter ? "↑" : "↓"}</span>
          {isBetter ? "Better than equipped" : "Worse than equipped"}
        </div>
      )}

      {/* Durability indicator (for equippable items with durability field) */}
      {entry.equipSlot &&
        (() => {
          const durability = (item as { durability?: number }).durability;
          if (durability === undefined) return null;
          const pct = Math.max(0, Math.min(100, durability));
          const durabColor =
            pct >= 50
              ? "oklch(0.65 0.18 145)"
              : pct >= 20
                ? "oklch(0.72 0.16 85)"
                : "oklch(0.65 0.20 25)";
          return (
            <div
              style={{ marginBottom: 8 }}
              data-ocid="inventory.tooltip.durability"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "monospace",
                  fontSize: 9,
                  color: "oklch(0.50 0 0)",
                  marginBottom: 3,
                }}
              >
                <span>Durability</span>
                <span style={{ color: durabColor }}>{pct}%</span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: "oklch(0.20 0 0 / 0.5)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: durabColor,
                    borderRadius: 2,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              {pct < 20 && (
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: "monospace",
                    fontSize: 8,
                    color: "oklch(0.65 0.20 25)",
                  }}
                >
                  ⚠ Low durability — visit merchant to repair
                </div>
              )}
            </div>
          );
        })()}

      {/* Flavor text */}
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 9,
          color: "oklch(0.42 0 0)",
          fontStyle: "italic",
          lineHeight: 1.5,
          marginBottom: 10,
          borderTop: "1px solid oklch(0.20 0 0 / 0.5)",
          paddingTop: 6,
        }}
      >
        {entry.flavorText}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        {mode === "inventory" && entry.equipSlot && (
          <button
            type="button"
            onClick={() => {
              onEquip(item);
              onClose();
            }}
            data-ocid="inventory.tooltip.equip_button"
            style={{
              flex: 1,
              minHeight: 40,
              background: "oklch(0.38 0.18 145 / 0.85)",
              border: "1.5px solid oklch(0.55 0.18 145 / 0.7)",
              borderRadius: 5,
              color: "oklch(0.90 0.10 145)",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Equip
          </button>
        )}
        {mode === "equipped" && slotKey && (
          <button
            type="button"
            onClick={() => {
              onUnequip(slotKey);
              onClose();
            }}
            data-ocid="inventory.tooltip.unequip_button"
            style={{
              flex: 1,
              minHeight: 40,
              background: "oklch(0.36 0.16 55 / 0.85)",
              border: "1.5px solid oklch(0.55 0.16 55 / 0.7)",
              borderRadius: 5,
              color: "oklch(0.88 0.10 55)",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Unequip
          </button>
        )}
        {mode === "inventory" && (
          <button
            type="button"
            onClick={() => {
              onDrop(item.id);
              onClose();
            }}
            data-ocid="inventory.tooltip.drop_button"
            style={{
              minWidth: 60,
              minHeight: 40,
              background: "oklch(0.22 0.10 25 / 0.85)",
              border: "1.5px solid oklch(0.40 0.14 25 / 0.6)",
              borderRadius: 5,
              color: "oklch(0.70 0.14 25)",
              fontFamily: "monospace",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Drop
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Extended EquippedGear with 5 slots ───────────────────────────────────────

interface ExtendedEquippedGear {
  weapon: ItemType | null;
  armor: ItemType | null;
  offhand: ItemType | null;
  head?: ItemType | null;
  accessory2?: ItemType | null;
}

function equippedForSlot(
  gear: ExtendedEquippedGear,
  slot: EquipSlotKey,
): ItemType | null {
  switch (slot) {
    case "head":
      return gear.head ?? null;
    case "chest":
      return gear.armor ?? null;
    case "weapon":
      return gear.weapon ?? null;
    case "accessory1":
      return gear.offhand ?? null;
    case "accessory2":
      return gear.accessory2 ?? null;
  }
}

// ─── InventoryPanel ────────────────────────────────────────────────────────────

interface InventoryPanelProps {
  inventory: InventoryItem[];
  equippedGear: EquippedGear;
  coins: number;
  onEquip: (item: InventoryItem) => void;
  onClose: () => void;
  isOpen?: boolean;
  // Extended callbacks for new redesign
  onUnequipItem?: (slot: string) => void;
  onDropItem?: (itemId: string) => void;
  // Character info for silhouette
  playerClass?: CharacterClass;
  gender?: Gender;
  outfitColor?: string;
}

type TooltipTarget =
  | { mode: "inventory"; item: InventoryItem }
  | { mode: "equipped"; item: InventoryItem; slotKey: EquipSlotKey };

export function InventoryPanel({
  inventory,
  equippedGear,
  coins,
  onEquip,
  onClose,
  isOpen = true,
  onUnequipItem,
  onDropItem,
  playerClass = "warrior",
  gender = "male",
  outfitColor,
}: InventoryPanelProps) {
  const [visible, setVisible] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipTarget | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      setTooltip(null);
      closeTimerRef.current = setTimeout(() => {}, 300);
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen]);

  // Filter coins out of the inventory display
  const displayItems = inventory.filter((i) => i.itemType !== "coin");

  // Pad to multiple of 4
  const padded: (InventoryItem | null)[] = [...displayItems];
  while (padded.length % 4 !== 0) padded.push(null);

  const extendedGear: ExtendedEquippedGear = { ...equippedGear };

  function handleEquipSlotTap(slotDef: EquipSlotDef) {
    const itemType = equippedForSlot(extendedGear, slotDef.key);
    if (!itemType) return;
    // Build a synthetic InventoryItem for display
    const synth: InventoryItem = {
      id: `equipped_${slotDef.key}`,
      itemType,
      amount: 1,
    };
    setTooltip((prev) =>
      prev?.mode === "equipped" && prev.slotKey === slotDef.key
        ? null
        : { mode: "equipped", item: synth, slotKey: slotDef.key },
    );
  }

  function handleInventoryItemTap(item: InventoryItem) {
    setTooltip((prev) =>
      prev?.mode === "inventory" && prev.item.id === item.id
        ? null
        : { mode: "inventory", item },
    );
  }

  return (
    <>
      {/* Keyframe for legendary pulse and set item glow */}
      <style>{`
        @keyframes legendaryPulse {
          0%, 100% { box-shadow: 0 0 10px oklch(0.70 0.22 85 / 0.5); border-color: oklch(0.75 0.20 85 / 0.9); }
          50% { box-shadow: 0 0 22px oklch(0.80 0.24 85 / 0.75); border-color: oklch(0.90 0.22 85 / 1); }
        }
        @keyframes setItemPulse {
          0%, 100% { box-shadow: 0 0 8px oklch(0.72 0.18 55 / 0.45); border-color: oklch(0.75 0.18 55 / 0.85); }
          50% { box-shadow: 0 0 18px oklch(0.80 0.20 55 / 0.70); border-color: oklch(0.88 0.20 55 / 1); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0"
        data-ocid="inventory.backdrop"
        style={{
          zIndex: 48,
          background: "oklch(0 0 0 / 0.60)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: visible ? "auto" : "none",
        }}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />

      {/* Full-screen panel */}
      <dialog
        open
        aria-label="Inventory"
        data-ocid="inventory.panel"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          background: "oklch(0.07 0.02 260 / 0.97)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          pointerEvents: visible ? "auto" : "none",
          overflow: "hidden",
          margin: 0,
          maxWidth: "100%",
          maxHeight: "100%",
          width: "100%",
          height: "100%",
          padding: 0,
          border: "none",
        }}
      >
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            background: "oklch(0.10 0.03 260 / 0.95)",
            borderBottom: "1px solid oklch(0.22 0.05 260 / 0.6)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "oklch(0.78 0.14 85)",
            }}
          >
            🎒 Inventory
          </span>
          <button
            type="button"
            onClick={onClose}
            data-ocid="inventory.close_button"
            aria-label="Close inventory"
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "oklch(0.14 0 0 / 0.7)",
              border: "1px solid oklch(0.28 0 0 / 0.5)",
              borderRadius: 6,
              color: "oklch(0.60 0 0)",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* ─── Character silhouette + equip slots ─────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 12,
            paddingBottom: 8,
            borderBottom: "1px solid oklch(0.18 0.02 260 / 0.5)",
            background: "oklch(0.09 0.02 260 / 0.8)",
          }}
        >
          {/* Silhouette + slots container */}
          <div style={{ position: "relative", width: 240, height: 210 }}>
            {/* Character silhouette centered */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 24,
                transform: "translateX(-50%)",
                opacity: 0.85,
              }}
              aria-hidden="true"
            >
              <CharacterSilhouette
                characterClass={playerClass}
                gender={gender}
                outfitColor={outfitColor}
              />
            </div>

            {/* Equip slots */}
            {EQUIP_SLOT_DEFS.map((slotDef) => {
              const itemType = equippedForSlot(extendedGear, slotDef.key);
              const isSelected =
                tooltip?.mode === "equipped" && tooltip.slotKey === slotDef.key;
              return (
                <EquipSlot
                  key={slotDef.key}
                  slotDef={slotDef}
                  equippedItemType={itemType}
                  selected={isSelected}
                  onTap={() => handleEquipSlotTap(slotDef)}
                />
              );
            })}

            {/* Equipped slot tooltip */}
            {tooltip?.mode === "equipped" && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "100%",
                  zIndex: 60,
                }}
              >
                <ItemTooltipCard
                  item={tooltip.item}
                  equippedGear={extendedGear}
                  mode="equipped"
                  slotKey={tooltip.slotKey}
                  onEquip={onEquip}
                  onUnequip={(slot) => onUnequipItem?.(slot)}
                  onDrop={(id) => onDropItem?.(id)}
                  onClose={() => setTooltip(null)}
                />
              </div>
            )}
          </div>
        </div>

        {/* ─── Inventory grid (scrollable) ────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 14px 6px",
            position: "relative",
          }}
          data-ocid="inventory.grid"
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "oklch(0.40 0 0)",
              marginBottom: 8,
            }}
          >
            Items · {displayItems.length} carried
          </div>

          {displayItems.length === 0 ? (
            <div
              data-ocid="inventory.empty_state"
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "oklch(0.38 0 0)",
                fontFamily: "monospace",
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>
                🎒
              </div>
              No items yet.
              <br />
              Defeat monsters to earn loot!
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
              }}
            >
              {padded.map((item, i) => {
                if (!item) {
                  return (
                    <div
                      key={`empty_slot_${displayItems.length}_${i}`}
                      style={{
                        aspectRatio: "1",
                        minHeight: 56,
                        background: "oklch(0.10 0 0 / 0.40)",
                        border: "1.5px solid oklch(0.18 0 0 / 0.35)",
                        borderRadius: 5,
                      }}
                    />
                  );
                }
                const isSelected =
                  tooltip?.mode === "inventory" && tooltip.item.id === item.id;
                return (
                  <div key={item.id} style={{ position: "relative" }}>
                    <InventoryGridItem
                      item={item}
                      selected={isSelected}
                      onTap={() => handleInventoryItemTap(item)}
                      index={displayItems.indexOf(item) + 1}
                    />
                    {/* Tooltip anchored to this cell */}
                    {isSelected && (
                      <ItemTooltipCard
                        item={item}
                        equippedGear={extendedGear}
                        mode="inventory"
                        onEquip={onEquip}
                        onUnequip={(slot) => onUnequipItem?.(slot)}
                        onDrop={(id) => {
                          onDropItem?.(id);
                          setTooltip(null);
                        }}
                        onClose={() => setTooltip(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Set Bonuses Panel ──────────────────────────────────────── */}
        {(() => {
          const allEquipped = [
            extendedGear.weapon,
            extendedGear.armor,
            extendedGear.offhand,
            extendedGear.head ?? null,
            extendedGear.accessory2 ?? null,
          ];
          const activeSets = getActiveSetBonuses(allEquipped);
          if (activeSets.length === 0) return null;
          return (
            <div
              data-ocid="inventory.set_bonuses"
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                background: "oklch(0.09 0.04 55 / 0.6)",
                borderTop: "1px solid oklch(0.28 0.12 55 / 0.35)",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "oklch(0.72 0.14 55)",
                  marginBottom: 6,
                }}
              >
                ✦ Set Bonuses Active
              </div>
              {activeSets.map(({ set, count }) => (
                <div
                  key={set.name}
                  style={{
                    marginBottom: 4,
                    padding: "5px 8px",
                    background: "oklch(0.12 0.04 55 / 0.5)",
                    border: `1px solid ${set.color}44`,
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 10,
                      fontWeight: 700,
                      color: set.color,
                      marginBottom: 3,
                    }}
                  >
                    {set.name}{" "}
                    <span style={{ color: "oklch(0.55 0 0)", fontWeight: 400 }}>
                      ({count}/{set.pieces.length})
                    </span>
                  </div>
                  {set.bonuses
                    .filter((b) => count >= b.pieces)
                    .map((b) => (
                      <div
                        key={b.pieces}
                        style={{
                          fontFamily: "monospace",
                          fontSize: 9,
                          color: "oklch(0.78 0.12 145)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span style={{ color: "oklch(0.65 0.15 145)" }}>✓</span>
                        {b.description}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          );
        })()}

        {/* ─── Gold bar ────────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 16px",
            background: "oklch(0.09 0.03 85 / 0.6)",
            borderTop: "1px solid oklch(0.25 0.08 85 / 0.40)",
          }}
          data-ocid="inventory.gold_display"
        >
          <span style={{ fontSize: 18 }}>🪙</span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 14,
              fontWeight: 700,
              color: "oklch(0.80 0.18 85)",
              letterSpacing: "0.04em",
            }}
          >
            {coins.toLocaleString()} gold
          </span>
        </div>
      </dialog>
    </>
  );
}
