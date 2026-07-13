import type { ShopItem } from "../types/game";
/** Sell price ratio — items sell for 40% of their buy price */
export const SELL_PRICE_RATIO = 0.4;

// ─── Shop Inventories ─────────────────────────────────────────────────────────

export const MEADOW_SHOP: ShopItem[] = [
  {
    id: "health_potion",
    name: "Health Potion",
    description: "Restores 40% of your maximum HP instantly.",
    price: 25,
    icon: "🧪",
    statBonus: {},
    itemType: "potion",
    classRestriction: null,
  },
  {
    id: "mana_potion",
    name: "Mana Potion",
    description: "Restores 40% of your maximum MP instantly.",
    price: 25,
    icon: "💧",
    statBonus: {},
    itemType: "potion",
    classRestriction: null,
  },
  {
    id: "basic_sword",
    name: "Basic Sword",
    description: "A sturdy iron sword. Grants +5 ATK.",
    price: 80,
    icon: "⚔️",
    statBonus: { atk: 5 },
    itemType: "weapon",
    classRestriction: "warrior",
  },
  {
    id: "basic_staff",
    name: "Basic Staff",
    description: "A carved wooden staff. Grants +5 Magic ATK.",
    price: 80,
    icon: "🪄",
    statBonus: { atk: 5 },
    itemType: "weapon",
    classRestriction: "mage",
  },
  {
    id: "leather_armor_shop",
    name: "Leather Armor",
    description: "Light but durable. Grants +10 Max HP.",
    price: 60,
    icon: "🛡️",
    statBonus: { maxHp: 10 },
    itemType: "armor",
    classRestriction: null,
  },
];

export const AURELION_SHOP: ShopItem[] = [
  {
    id: "health_potion",
    name: "Health Potion",
    description: "Restores 40% of your maximum HP instantly.",
    price: 25,
    icon: "🧪",
    statBonus: {},
    itemType: "potion",
    classRestriction: null,
  },
  {
    id: "mana_potion",
    name: "Mana Potion",
    description: "Restores 40% of your maximum MP instantly.",
    price: 25,
    icon: "💧",
    statBonus: {},
    itemType: "potion",
    classRestriction: null,
  },
  {
    id: "iron_sword",
    name: "Iron Sword",
    description: "Finely forged steel. Grants +15 ATK.",
    price: 200,
    icon: "🗡️",
    statBonus: { atk: 15 },
    itemType: "weapon",
    classRestriction: "warrior",
  },
  {
    id: "enchanted_staff",
    name: "Enchanted Staff",
    description: "Pulses with arcane energy. Grants +15 Magic ATK.",
    price: 200,
    icon: "✨",
    statBonus: { atk: 15 },
    itemType: "weapon",
    classRestriction: "mage",
  },
  {
    id: "chainmail_armor",
    name: "Chainmail Armor",
    description: "Heavy interlocked rings. Grants +30 Max HP.",
    price: 180,
    icon: "🔗",
    statBonus: { maxHp: 30 },
    itemType: "armor",
    classRestriction: null,
  },
  {
    id: "mage_robe",
    name: "Mage Robe",
    description: "Woven with mana threads. Grants +20 Max MP.",
    price: 180,
    icon: "👘",
    statBonus: { maxMp: 20 },
    itemType: "armor",
    classRestriction: "mage",
  },
  {
    id: "rare_gem_shop",
    name: "Rare Gem",
    description: "A dazzling gem. Collectors pay well for these.",
    price: 500,
    icon: "💎",
    statBonus: {},
    itemType: "misc",
    classRestriction: null,
  },
];

/** Which shop does an NPC sell? */
export const NPC_SHOP_MAP: Record<string, ShopItem[]> = {
  meadow_merchant: MEADOW_SHOP,
  aurelion_merchant: AURELION_SHOP,
};
