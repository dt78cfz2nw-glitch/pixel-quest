import type { InventoryItem, ItemType } from "../types/game";

// ─── Crafting Recipe Interface ────────────────────────────────────────────────

export interface CraftingRecipe {
  id: string;
  name: string;
  ingredients: { type: ItemType; amount: number }[];
  goldCost: number;
  output: { type: ItemType; amount: number };
  /** If set, only players of this class can craft the recipe */
  classRestriction?: "warrior" | "mage";
  description: string;
}

// ─── Crafting Recipes ─────────────────────────────────────────────────────────

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "large_health_potion",
    name: "Large Health Potion",
    ingredients: [{ type: "health_potion", amount: 3 }],
    goldCost: 10,
    output: { type: "large_health_potion", amount: 1 },
    description: "Restores 80% HP instead of 40%",
  },
  {
    id: "mana_crystal",
    name: "Mana Crystal",
    ingredients: [{ type: "ancient_rune_shard", amount: 5 }],
    goldCost: 20,
    output: { type: "mana_crystal", amount: 1 },
    description: "Equippable: passively increases max mana by 15%",
  },
  {
    id: "warrior_emblem",
    name: "Warrior Emblem",
    ingredients: [
      { type: "sword_basic", amount: 1 },
      { type: "leather_armor", amount: 1 },
    ],
    goldCost: 30,
    output: { type: "warrior_emblem", amount: 1 },
    classRestriction: "warrior",
    description: "Equippable accessory: +10% attack for Warrior only",
  },
  {
    id: "mage_focus",
    name: "Mage Focus",
    ingredients: [
      { type: "staff_basic", amount: 1 },
      { type: "ancient_rune_shard", amount: 5 },
    ],
    goldCost: 30,
    output: { type: "mage_focus", amount: 1 },
    classRestriction: "mage",
    description: "Equippable accessory: +10% spell damage for Mage only",
  },
  {
    id: "antidote",
    name: "Antidote",
    ingredients: [{ type: "desert_bloom", amount: 2 }],
    goldCost: 5,
    output: { type: "antidote", amount: 1 },
    description: "Cures poison instantly and grants 5s poison immunity",
  },
  {
    id: "poison_blade",
    name: "Poison Blade",
    ingredients: [
      { type: "scorpion_sting_dagger", amount: 1 },
      { type: "iron_ore", amount: 1 },
    ],
    goldCost: 40,
    output: { type: "poison_blade", amount: 1 },
    description: "Weapon: ATK +12, 20% chance to poison on hit",
  },
  {
    id: "storm_gauntlets",
    name: "Storm Gauntlets",
    ingredients: [
      { type: "iron_ore", amount: 2 },
      { type: "thunder_shard", amount: 1 },
    ],
    goldCost: 50,
    output: { type: "storm_gauntlets", amount: 1 },
    classRestriction: "warrior",
    description: "Warrior only: ATK +15, lightning damage on hit",
  },
  {
    id: "arcane_tome",
    name: "Arcane Tome",
    ingredients: [
      { type: "magic_crystal", amount: 2 },
      { type: "spirit_leaf", amount: 1 },
    ],
    goldCost: 45,
    output: { type: "arcane_tome", amount: 1 },
    classRestriction: "mage",
    description: "Mage only: MP regen +0.5/s, spell range +1",
  },
];

// ─── Pure Crafting Functions ──────────────────────────────────────────────────

/**
 * Returns true if the player has all required ingredients, enough gold,
 * and meets any class restriction for the recipe.
 */
export function canCraftRecipe(
  recipe: CraftingRecipe,
  inventory: InventoryItem[],
  coins: number,
  playerClass?: string,
): boolean {
  // Check class restriction
  if (recipe.classRestriction && recipe.classRestriction !== playerClass) {
    return false;
  }
  // Check gold
  if (coins < recipe.goldCost) return false;
  // Check each ingredient
  for (const ingredient of recipe.ingredients) {
    const owned = inventory
      .filter((i) => i.itemType === ingredient.type)
      .reduce((sum, i) => sum + i.amount, 0);
    if (owned < ingredient.amount) return false;
  }
  return true;
}

/**
 * Removes ingredients and gold, adds the output item. Pure — returns new state.
 */
export function applyRecipeCraft(
  recipe: CraftingRecipe,
  inventory: InventoryItem[],
  coins: number,
): { inventory: InventoryItem[]; coins: number } {
  let newInventory = inventory.map((i) => ({ ...i }));

  // Deduct ingredients
  for (const ingredient of recipe.ingredients) {
    let remaining = ingredient.amount;
    newInventory = newInventory.map((item) => {
      if (item.itemType !== ingredient.type || remaining <= 0) return item;
      const deduct = Math.min(item.amount, remaining);
      remaining -= deduct;
      return { ...item, amount: item.amount - deduct };
    });
  }

  // Remove zero-amount items
  newInventory = newInventory.filter((i) => i.amount > 0);

  // Add output item — merge with existing stack if present
  const existingIdx = newInventory.findIndex(
    (i) => i.itemType === recipe.output.type,
  );
  if (existingIdx >= 0) {
    newInventory[existingIdx] = {
      ...newInventory[existingIdx],
      amount: newInventory[existingIdx].amount + recipe.output.amount,
    };
  } else {
    newInventory.push({
      id: `crafted_${recipe.id}_${Date.now()}`,
      itemType: recipe.output.type,
      amount: recipe.output.amount,
    });
  }

  const newCoins = coins - recipe.goldCost;
  return { inventory: newInventory, coins: newCoins };
}
