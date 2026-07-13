/**
 * Outfit Style Encoding / Decoding
 *
 * The `outfitStyle` field (a Text field in the canister) is used to encode
 * gender, weapon/staff type, beard, and female hair — all without modifying
 * the backend data structure.
 *
 * ENCODING EXAMPLES:
 *   "warrior_A"                        → male warrior, outfit A, sword, no beard
 *   "warrior_A_axe_beard"              → male warrior, outfit A, axe, beard
 *   "warrior_female_B_axe"             → female warrior, outfit B, axe
 *   "mage_A"                           → male mage, outfit A, long staff
 *   "mage_A_wand"                      → male mage, outfit A, short wand
 *   "mage_female_C_wand_shorthair"     → female mage, outfit C, wand, short hair
 */

export type ParsedOutfitStyle = {
  /** "warrior" | "mage" */
  baseClass: "warrior" | "mage";
  /** "A" | "B" | "C" */
  outfitVariant: "A" | "B" | "C";
  /** "male" | "female" */
  gender: "male" | "female";
  /** warrior weapon — "sword" | "axe" */
  weaponType: "sword" | "axe";
  /** mage staff — "long_staff" | "short_wand" */
  staffType: "long_staff" | "short_wand";
  /** male warrior beard option */
  beard: boolean;
  /** female hair length — "long" | "short" */
  femaleHair: "long" | "short";
};

export function parseOutfitStyle(style: string): ParsedOutfitStyle {
  const s = style || "";

  // ── Base class ───────────────────────────────────────────────────────────────
  const baseClass: "warrior" | "mage" = s.startsWith("mage")
    ? "mage"
    : "warrior";

  // ── Gender ───────────────────────────────────────────────────────────────────
  const gender: "male" | "female" =
    s.includes("_female_") || s.includes("female_") ? "female" : "male";

  // ── Outfit variant ───────────────────────────────────────────────────────────
  const variantMatch = s.match(/_([ABC])(?:_|$)/);
  const outfitVariant: "A" | "B" | "C" =
    (variantMatch?.[1] as "A" | "B" | "C") ?? "A";

  // ── Weapon type (warrior) ────────────────────────────────────────────────────
  const weaponType: "sword" | "axe" = s.includes("_axe") ? "axe" : "sword";

  // ── Staff type (mage) ────────────────────────────────────────────────────────
  const staffType: "long_staff" | "short_wand" = s.includes("_wand")
    ? "short_wand"
    : "long_staff";

  // ── Beard (male warrior) ─────────────────────────────────────────────────────
  const beard = s.includes("_beard");

  // ── Female hair ──────────────────────────────────────────────────────────────
  const femaleHair: "long" | "short" = s.includes("_shorthair")
    ? "short"
    : "long";

  return {
    baseClass,
    outfitVariant,
    gender,
    weaponType,
    staffType,
    beard,
    femaleHair,
  };
}

export interface EncodeOptions {
  baseClass: "warrior" | "mage";
  outfitVariant: "A" | "B" | "C";
  gender: "male" | "female";
  weaponType?: "sword" | "axe";
  staffType?: "long_staff" | "short_wand";
  beard?: boolean;
  femaleHair?: "long" | "short";
}

export function encodeOutfitStyle(opts: EncodeOptions): string {
  const {
    baseClass,
    outfitVariant,
    gender,
    weaponType = "sword",
    staffType = "long_staff",
    beard = false,
    femaleHair = "long",
  } = opts;

  const parts: string[] = [baseClass];
  if (gender === "female") parts.push("female");
  parts.push(outfitVariant);

  if (baseClass === "warrior") {
    if (weaponType === "axe") parts.push("axe");
    if (beard) parts.push("beard");
  } else {
    if (staffType === "short_wand") parts.push("wand");
    if (gender === "female" && femaleHair === "short") parts.push("shorthair");
  }

  return parts.join("_");
}

/**
 * Resolve the canonical OutfitStyle token needed by the existing sprite
 * renderer (warrior_A / warrior_B / warrior_C / mage_A / mage_B / mage_C).
 */
export function resolveBaseStyle(
  encoded: string,
): "warrior_A" | "warrior_B" | "warrior_C" | "mage_A" | "mage_B" | "mage_C" {
  const { baseClass, outfitVariant } = parseOutfitStyle(encoded);
  return `${baseClass}_${outfitVariant}` as
    | "warrior_A"
    | "warrior_B"
    | "warrior_C"
    | "mage_A"
    | "mage_B"
    | "mage_C";
}
