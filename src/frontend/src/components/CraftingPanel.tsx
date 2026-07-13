import { useState } from "react";
import {
  CRAFTING_RECIPES,
  type CraftingRecipe,
  applyRecipeCraft,
  canCraftRecipe,
} from "../lib/crafting";
import type { InventoryItem, ItemType } from "../types/game";

// ─── Item icon/label lookup (crafting panel subset) ──────────────────────────

const ITEM_ICONS: Partial<Record<ItemType, string>> = {
  health_potion: "🧴",
  large_health_potion: "🧴",
  ancient_rune_shard: "🔮",
  mana_crystal: "💠",
  sword_basic: "⚔",
  leather_armor: "🛡",
  staff_basic: "✦",
  warrior_emblem: "🛡",
  mage_focus: "🔱",
  mana_potion: "💧",
  coin: "🪙",
  cloth_robe: "🌀",
  iron_shield: "🔰",
  leather_scrap: "🪶",
  bear_pelt: "🐾",
  stone_fragment: "🪨",
  rare_gem: "💎",
  troll_hide: "🦴",
  rare_weapon: "🗡",
  poison_vial: "🧪",
};

const ITEM_LABELS: Partial<Record<ItemType, string>> = {
  health_potion: "Health Potion",
  large_health_potion: "Large Health Potion",
  ancient_rune_shard: "Ancient Rune Shard",
  mana_crystal: "Mana Crystal",
  sword_basic: "Iron Sword",
  leather_armor: "Leather Armor",
  staff_basic: "Wooden Staff",
  warrior_emblem: "Warrior Emblem",
  mage_focus: "Mage Focus",
};

function getItemAmount(inventory: InventoryItem[], type: ItemType): number {
  return inventory
    .filter((i) => i.itemType === type)
    .reduce((sum, i) => sum + i.amount, 0);
}

// ─── CraftingPanel ────────────────────────────────────────────────────────────

interface CraftingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  playerInventory: InventoryItem[];
  playerCoins: number;
  playerClass?: string;
  isGuest: boolean;
  onCraft: (
    recipe: CraftingRecipe,
    newInventory: InventoryItem[],
    newCoins: number,
  ) => void;
}

export function CraftingPanel({
  isOpen,
  onClose,
  playerInventory,
  playerCoins,
  playerClass,
  isGuest,
  onCraft,
}: CraftingPanelProps) {
  const [craftToast, setCraftToast] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleCraft(recipe: CraftingRecipe) {
    const { inventory: newInv, coins: newCoins } = applyRecipeCraft(
      recipe,
      playerInventory,
      playerCoins,
    );
    onCraft(recipe, newInv, newCoins);
    setCraftToast(`Crafted: ${recipe.name}!`);
    setTimeout(() => setCraftToast(null), 2500);
  }

  return (
    <dialog
      className="absolute inset-0 flex items-center justify-center"
      style={{
        zIndex: 55,
        background: "oklch(0 0 0 / 0.60)",
        border: "none",
        padding: 0,
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
      }}
      open
      data-ocid="crafting.dialog"
      aria-label="Crafting Table"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        style={{
          width: "min(380px, 96vw)",
          maxHeight: "85vh",
          background: "oklch(0.09 0 0 / 0.97)",
          border: "1px solid oklch(0.40 0.12 85 / 0.6)",
          borderRadius: 6,
          boxShadow:
            "0 8px 40px oklch(0 0 0 / 0.7), 0 0 0 1px oklch(0.30 0 0 / 0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid oklch(0.22 0 0 / 0.7)",
            background: "oklch(0.12 0.04 85 / 0.8)",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "oklch(0.75 0.15 85)",
            }}
            data-ocid="crafting.panel"
          >
            ⚒ Crafting Table
          </span>
          <button
            type="button"
            onClick={onClose}
            data-ocid="crafting.close_button"
            aria-label="Close crafting panel"
            style={{
              background: "oklch(0.16 0 0 / 0.7)",
              border: "1px solid oklch(0.28 0 0 / 0.5)",
              borderRadius: 3,
              color: "oklch(0.55 0 0)",
              fontFamily: "monospace",
              fontSize: 13,
              width: 28,
              height: 28,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Coins display */}
        {!isGuest && (
          <div
            style={{
              padding: "6px 14px",
              borderBottom: "1px solid oklch(0.18 0 0 / 0.6)",
              fontFamily: "monospace",
              fontSize: 11,
              color: "oklch(0.65 0.14 90)",
            }}
          >
            🪙 {playerCoins} gold available
          </div>
        )}

        {/* Content */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}
          data-ocid="crafting.list"
        >
          {isGuest ? (
            /* Guest message */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "32px 16px",
                textAlign: "center",
              }}
              data-ocid="crafting.empty_state"
            >
              <span style={{ fontSize: 32 }}>🔒</span>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  color: "oklch(0.55 0 0)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Crafting is not available for guest accounts.
              </p>
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "oklch(0.38 0 0)",
                  margin: 0,
                }}
              >
                Log in with Internet Identity to craft items.
              </p>
              <button
                type="button"
                onClick={onClose}
                data-ocid="crafting.cancel_button"
                style={{
                  marginTop: 4,
                  padding: "8px 20px",
                  background: "oklch(0.18 0 0 / 0.8)",
                  border: "1px solid oklch(0.28 0 0 / 0.5)",
                  borderRadius: 4,
                  color: "oklch(0.55 0 0)",
                  fontFamily: "monospace",
                  fontSize: 11,
                  cursor: "pointer",
                  minWidth: 80,
                  minHeight: 48,
                }}
              >
                CLOSE
              </button>
            </div>
          ) : (
            /* Recipe list */
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CRAFTING_RECIPES.map((recipe, idx) => {
                const craftable = canCraftRecipe(
                  recipe,
                  playerInventory,
                  playerCoins,
                  playerClass,
                );
                const isRestricted =
                  !!recipe.classRestriction &&
                  recipe.classRestriction !== playerClass;

                return (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    craftable={craftable}
                    isRestricted={isRestricted}
                    playerInventory={playerInventory}
                    playerCoins={playerCoins}
                    onCraft={handleCraft}
                    index={idx + 1}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Toast confirmation */}
        {craftToast && (
          <div
            style={{
              padding: "8px 14px",
              background: "oklch(0.22 0.12 145 / 0.9)",
              borderTop: "1px solid oklch(0.38 0.16 145 / 0.6)",
              fontFamily: "monospace",
              fontSize: 11,
              color: "oklch(0.82 0.16 145)",
              textAlign: "center",
              letterSpacing: "0.04em",
            }}
            data-ocid="crafting.success_state"
          >
            <output
              aria-live="polite"
              style={{
                fontFamily: "inherit",
                fontSize: "inherit",
                color: "inherit",
              }}
            >
              ✓ {craftToast}
            </output>
          </div>
        )}
      </div>
    </dialog>
  );
}

// ─── RecipeCard ───────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  craftable,
  isRestricted,
  playerInventory,
  playerCoins,
  onCraft,
  index,
}: {
  recipe: CraftingRecipe;
  craftable: boolean;
  isRestricted: boolean;
  playerInventory: InventoryItem[];
  playerCoins: number;
  onCraft: (recipe: CraftingRecipe) => void;
  index: number;
}) {
  const outputIcon = ITEM_ICONS[recipe.output.type] ?? "📦";
  const borderColor = craftable
    ? "oklch(0.50 0.16 145 / 0.5)"
    : "oklch(0.24 0 0 / 0.6)";

  return (
    <div
      style={{
        background: craftable
          ? "oklch(0.12 0.04 145 / 0.5)"
          : "oklch(0.10 0 0 / 0.5)",
        border: `1px solid ${borderColor}`,
        borderRadius: 5,
        padding: "10px 12px",
        minHeight: 60,
        opacity: isRestricted ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      data-ocid={`crafting.item.${index}`}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{outputIcon}</span>
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                color: craftable ? "oklch(0.85 0.08 85)" : "oklch(0.55 0 0)",
                letterSpacing: "0.04em",
              }}
            >
              {recipe.name}
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: "oklch(0.45 0 0)",
                marginTop: 1,
              }}
            >
              {recipe.description}
              {recipe.classRestriction && (
                <span
                  style={{
                    marginLeft: 4,
                    color: isRestricted
                      ? "oklch(0.50 0.14 25)"
                      : "oklch(0.58 0.14 55)",
                  }}
                >
                  [{recipe.classRestriction.toUpperCase()} ONLY]
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Craft button */}
        <button
          type="button"
          onClick={() => onCraft(recipe)}
          disabled={!craftable}
          data-ocid={`crafting.craft_button.${index}`}
          aria-label={`Craft ${recipe.name}`}
          style={{
            minWidth: 60,
            minHeight: 48,
            padding: "6px 12px",
            background: craftable
              ? "oklch(0.42 0.18 145 / 0.85)"
              : "oklch(0.16 0 0 / 0.7)",
            border: craftable
              ? "1px solid oklch(0.55 0.18 145 / 0.7)"
              : "1px solid oklch(0.24 0 0 / 0.5)",
            borderRadius: 4,
            color: craftable ? "oklch(0.92 0.08 145)" : "oklch(0.32 0 0)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: craftable ? "pointer" : "not-allowed",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          CRAFT
        </button>
      </div>

      {/* Ingredients */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}
        data-ocid={`crafting.ingredients.${index}`}
      >
        {recipe.ingredients.map((ing) => {
          const have = getItemAmount(playerInventory, ing.type);
          const enough = have >= ing.amount;
          const icon = ITEM_ICONS[ing.type] ?? "📦";
          const label = ITEM_LABELS[ing.type] ?? ing.type;
          return (
            <div
              key={ing.type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                minHeight: 32,
                padding: "2px 7px",
                background: enough
                  ? "oklch(0.15 0.06 145 / 0.5)"
                  : "oklch(0.14 0.04 25 / 0.4)",
                border: `1px solid ${enough ? "oklch(0.35 0.10 145 / 0.5)" : "oklch(0.30 0.08 25 / 0.4)"}`,
                borderRadius: 3,
              }}
            >
              <span style={{ fontSize: 11 }}>{icon}</span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  color: enough
                    ? "oklch(0.72 0.12 145)"
                    : "oklch(0.55 0.10 25)",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  color: enough
                    ? "oklch(0.65 0.10 145)"
                    : "oklch(0.50 0.12 25)",
                  marginLeft: 1,
                }}
              >
                {have}/{ing.amount}
              </span>
            </div>
          );
        })}

        {/* Gold cost */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            minHeight: 32,
            padding: "2px 7px",
            background:
              playerCoins >= recipe.goldCost
                ? "oklch(0.15 0.06 85 / 0.5)"
                : "oklch(0.14 0.04 25 / 0.4)",
            border: `1px solid ${
              playerCoins >= recipe.goldCost
                ? "oklch(0.38 0.10 85 / 0.5)"
                : "oklch(0.30 0.08 25 / 0.4)"
            }`,
            borderRadius: 3,
          }}
        >
          <span style={{ fontSize: 11 }}>🪙</span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              color:
                playerCoins >= recipe.goldCost
                  ? "oklch(0.72 0.12 85)"
                  : "oklch(0.50 0.12 25)",
            }}
          >
            {recipe.goldCost} gold
          </span>
        </div>
      </div>
    </div>
  );
}
