import { useEffect, useRef, useState } from "react";
import type {
  CharacterClass,
  Gender,
  HairColor,
  OutfitColor,
  OutfitStyle,
  StaffType,
  WeaponType,
} from "../types/game";

// ─── Outfit Style Encoding ─────────────────────────────────────────────────────
// Encodes all customization dimensions into a single OutfitStyle string.
//
// Format: {class}_{gender?}{variant}_{weapon?}_{modifiers...}
//
// Examples:
//   warrior_A              → male warrior, outfit A, sword
//   warrior_female_B       → female warrior, outfit B, sword
//   warrior_A_axe          → male warrior, outfit A, axe
//   warrior_A_beard        → male warrior, outfit A, sword, with beard
//   warrior_female_A_axe_longhair → female warrior, outfit A, axe, long hair
//   mage_B_wand            → male mage, outfit B, wand
//   mage_female_C_longhair → female mage, outfit C, long staff, long hair

export interface ParsedOutfitStyle {
  baseClass: CharacterClass;
  outfitVariant: "A" | "B" | "C";
  gender: Gender;
  weaponType: WeaponType;
  staffType: StaffType;
  beard: boolean;
  femaleHair: "long" | "short";
}

export function parseOutfitStyle(style: OutfitStyle): ParsedOutfitStyle {
  const s = style as string;

  // Determine base class
  const baseClass: CharacterClass = s.startsWith("mage") ? "mage" : "warrior";

  // Determine gender
  const gender: Gender =
    s.includes("_female_") || s.includes("female_") ? "female" : "male";

  // Determine outfit variant
  let outfitVariant: "A" | "B" | "C" = "A";
  if (s.includes("_B") || s.endsWith("B")) outfitVariant = "B";
  else if (s.includes("_C") || s.endsWith("C")) outfitVariant = "C";

  // Weapon / staff
  const weaponType: WeaponType = s.includes("_axe") ? "axe" : "sword";
  const staffType: StaffType = s.includes("_wand")
    ? "short_wand"
    : "long_staff";

  // Modifiers
  const beard = s.includes("_beard");
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

interface EncodeOptions {
  baseClass: CharacterClass;
  outfitVariant: "A" | "B" | "C";
  gender: Gender;
  weaponType: WeaponType;
  staffType: StaffType;
  beard: boolean;
  femaleHair: "long" | "short";
}

export function encodeOutfitStyle(opts: EncodeOptions): OutfitStyle {
  const {
    baseClass,
    outfitVariant,
    gender,
    weaponType,
    staffType,
    beard,
    femaleHair,
  } = opts;
  const parts: string[] = [];

  if (baseClass === "warrior") {
    parts.push("warrior");
    if (gender === "female") parts.push("female");
    parts.push(outfitVariant);
    if (weaponType === "axe") parts.push("axe");
    if (gender === "male" && beard) parts.push("beard");
    if (gender === "female") {
      if (femaleHair === "short") parts.push("shorthair");
      else parts.push("longhair");
    }
  } else {
    parts.push("mage");
    if (gender === "female") parts.push("female");
    parts.push(outfitVariant);
    if (staffType === "short_wand") parts.push("wand");
    if (gender === "male" && beard) parts.push("beard");
    if (gender === "female") {
      if (femaleHair === "short") parts.push("shorthair");
      else parts.push("longhair");
    }
  }

  return parts.join("_") as OutfitStyle;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_OPTIONS: { value: OutfitColor; label: string; fill: string }[] = [
  { value: "default", label: "Default", fill: "#C87C35" },
  { value: "red", label: "Red", fill: "#CC2020" },
  { value: "blue", label: "Blue", fill: "#2255CC" },
  { value: "green", label: "Green", fill: "#22882A" },
  { value: "purple", label: "Purple", fill: "#7722CC" },
];

const HAIR_OPTIONS: { value: HairColor; label: string; fill: string }[] = [
  { value: "brown", label: "Brown", fill: "#7B4B2A" },
  { value: "black", label: "Black", fill: "#1A1A1A" },
  { value: "blonde", label: "Blonde", fill: "#D4A830" },
  { value: "grey", label: "Grey", fill: "#888888" },
  { value: "red-hair", label: "Auburn", fill: "#C03010" },
  { value: "white", label: "White", fill: "#E8E4DC" },
];

interface OutfitEntry {
  variant: "A" | "B" | "C";
  label: string;
  desc: string;
}

const WARRIOR_MALE_OUTFITS: OutfitEntry[] = [
  { variant: "A", label: "Full Plate", desc: "Heavy armor, closed visor" },
  { variant: "B", label: "Chainmail", desc: "Open helm, link mail" },
  { variant: "C", label: "Leather Hood", desc: "Hood, agile leathers" },
];

const WARRIOR_FEMALE_OUTFITS: OutfitEntry[] = [
  { variant: "A", label: "Full Plate (F)", desc: "Plate with feminine fit" },
  { variant: "B", label: "Chainmail Vest", desc: "Vest, open helmet" },
  { variant: "C", label: "Leather", desc: "Leather outfit, hair visible" },
];

const MAGE_MALE_OUTFITS: OutfitEntry[] = [
  { variant: "A", label: "Long Robe", desc: "Flowing robe & pointed hat" },
  { variant: "B", label: "Short Robe", desc: "Circlet, shorter robe" },
  { variant: "C", label: "Dark Cloak", desc: "Hood, mysterious cloak" },
];

const MAGE_FEMALE_OUTFITS: OutfitEntry[] = [
  { variant: "A", label: "Elegant Robe", desc: "Long elegant robe & hat" },
  { variant: "B", label: "Short Robe", desc: "Decorative circlet" },
  { variant: "C", label: "Dark Cloak", desc: "Hood down, cloak" },
];

// ─── Sprite Preview Renderer ───────────────────────────────────────────────────

const SPRITE_SIZE = 56;

const HAIR_FILLS: Record<HairColor, { main: string; dark: string }> = {
  brown: { main: "#7B4B2A", dark: "#4A2A10" },
  black: { main: "#1A1A1A", dark: "#0A0A0A" },
  blonde: { main: "#D4A830", dark: "#8A6A10" },
  grey: { main: "#888888", dark: "#555555" },
  "red-hair": { main: "#C03010", dark: "#7A1808" },
  white: { main: "#E8E4DC", dark: "#BBBAB4" },
};

const OUTFIT_FILLS: Record<OutfitColor, string> = {
  default: "#C87C35",
  red: "#CC2020",
  blue: "#2255CC",
  green: "#22882A",
  purple: "#7722CC",
};

function getBodyColor(
  cls: CharacterClass,
  variant: "A" | "B" | "C",
  outfit: OutfitColor,
): string {
  if (outfit !== "default") return OUTFIT_FILLS[outfit];
  if (cls === "warrior") {
    if (variant === "B") return "#9E9EA0";
    if (variant === "C") return "#8A6030";
    return "#555860";
  }
  if (variant === "B") return "#4488CC";
  if (variant === "C") return "#282830";
  return "#4422AA";
}

function drawPreviewSprite(
  ctx: CanvasRenderingContext2D,
  cls: CharacterClass,
  variant: "A" | "B" | "C",
  outfit: OutfitColor,
  hair: HairColor,
  gender: Gender,
  weaponType: WeaponType,
  staffType: StaffType,
  beard: boolean,
  femaleHair: "long" | "short",
  scale = 1.0,
): void {
  const s = scale;
  const W = Math.round(SPRITE_SIZE * s);
  const H = Math.round(SPRITE_SIZE * s);
  ctx.clearRect(0, 0, W, H);

  const bodyColor = getBodyColor(cls, variant, outfit);
  const hairFill = HAIR_FILLS[hair];
  const dark = "#1A1A1A";
  const skin = gender === "female" ? "#DDB090" : "#D4A878";
  const hi = "#FFFFFF";

  if (cls === "warrior") {
    // Legs
    ctx.fillStyle = bodyColor;
    ctx.fillRect(
      Math.round(10 * s),
      Math.round(36 * s),
      Math.round(8 * s),
      Math.round(12 * s),
    );
    ctx.fillRect(
      Math.round(22 * s),
      Math.round(36 * s),
      Math.round(8 * s),
      Math.round(12 * s),
    );
    // Boots
    ctx.fillStyle = dark;
    ctx.fillRect(
      Math.round(9 * s),
      Math.round(44 * s),
      Math.round(10 * s),
      Math.round(4 * s),
    );
    ctx.fillRect(
      Math.round(21 * s),
      Math.round(44 * s),
      Math.round(10 * s),
      Math.round(4 * s),
    );
    // Body
    ctx.fillStyle = bodyColor;
    const bodyW = gender === "female" ? 22 : 24;
    const bodyX = gender === "female" ? 9 : 8;
    ctx.fillRect(
      Math.round(bodyX * s),
      Math.round(20 * s),
      Math.round(bodyW * s),
      Math.round(18 * s),
    );
    // Chest highlight
    ctx.fillStyle = `${hi}33`;
    ctx.fillRect(
      Math.round(9 * s),
      Math.round(21 * s),
      Math.round(22 * s),
      Math.round(3 * s),
    );
    // Female silhouette accent
    if (gender === "female") {
      ctx.fillStyle = `${hi}15`;
      ctx.fillRect(
        Math.round(9 * s),
        Math.round(28 * s),
        Math.round(5 * s),
        Math.round(8 * s),
      );
    }
    // Shoulders (variant A)
    if (variant === "A") {
      ctx.fillStyle = gender === "female" ? "#998aaa" : "#888898";
      ctx.fillRect(
        Math.round(4 * s),
        Math.round(19 * s),
        Math.round(7 * s),
        Math.round(7 * s),
      );
      ctx.fillRect(
        Math.round(29 * s),
        Math.round(19 * s),
        Math.round(7 * s),
        Math.round(7 * s),
      );
    }
    // Weapon
    if (weaponType === "axe") {
      // Axe handle
      ctx.fillStyle = "#886633";
      ctx.fillRect(
        Math.round(34 * s),
        Math.round(14 * s),
        Math.round(3 * s),
        Math.round(22 * s),
      );
      // Axe blade
      ctx.fillStyle = "#A0B0C0";
      ctx.fillRect(
        Math.round(30 * s),
        Math.round(10 * s),
        Math.round(8 * s),
        Math.round(10 * s),
      );
      ctx.fillStyle = "#C8D8E8";
      ctx.fillRect(
        Math.round(31 * s),
        Math.round(11 * s),
        Math.round(4 * s),
        Math.round(4 * s),
      );
    } else {
      // Sword
      ctx.fillStyle = "#A0B0C0";
      ctx.fillRect(
        Math.round(34 * s),
        Math.round(12 * s),
        Math.round(3 * s),
        Math.round(22 * s),
      );
      ctx.fillStyle = "#886633";
      ctx.fillRect(
        Math.round(33 * s),
        Math.round(21 * s),
        Math.round(5 * s),
        Math.round(3 * s),
      );
    }
    // Skin / face
    ctx.fillStyle = skin;
    ctx.fillRect(
      Math.round(14 * s),
      Math.round(8 * s),
      Math.round(16 * s),
      Math.round(13 * s),
    );
    // Eyes
    ctx.fillStyle = dark;
    ctx.fillRect(
      Math.round(17 * s),
      Math.round(12 * s),
      Math.round(3 * s),
      Math.round(3 * s),
    );
    ctx.fillRect(
      Math.round(24 * s),
      Math.round(12 * s),
      Math.round(3 * s),
      Math.round(3 * s),
    );
    // Beard (male only)
    if (gender === "male" && beard) {
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(15 * s),
        Math.round(17 * s),
        Math.round(14 * s),
        Math.round(4 * s),
      );
    }
    // Helmet / head
    if (variant === "A") {
      ctx.fillStyle = gender === "female" ? "#7a6888" : "#555860";
      ctx.fillRect(
        Math.round(11 * s),
        Math.round(2 * s),
        Math.round(22 * s),
        Math.round(10 * s),
      );
      // Visor
      ctx.fillStyle = dark;
      ctx.fillRect(
        Math.round(12 * s),
        Math.round(9 * s),
        Math.round(20 * s),
        Math.round(3 * s),
      );
    } else if (variant === "B") {
      ctx.fillStyle = gender === "female" ? "#B8A8C8" : "#888898";
      ctx.fillRect(
        Math.round(11 * s),
        Math.round(2 * s),
        Math.round(22 * s),
        Math.round(8 * s),
      );
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(13 * s),
        Math.round(7 * s),
        Math.round(18 * s),
        Math.round(4 * s),
      );
      // Female: extra hair strands visible
      if (gender === "female" && femaleHair === "long") {
        ctx.fillStyle = hairFill.dark;
        ctx.fillRect(
          Math.round(9 * s),
          Math.round(10 * s),
          Math.round(5 * s),
          Math.round(12 * s),
        );
        ctx.fillRect(
          Math.round(30 * s),
          Math.round(10 * s),
          Math.round(5 * s),
          Math.round(12 * s),
        );
      }
    } else {
      // Leather hood
      ctx.fillStyle = bodyColor;
      ctx.fillRect(
        Math.round(10 * s),
        Math.round(1 * s),
        Math.round(24 * s),
        Math.round(9 * s),
      );
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(13 * s),
        Math.round(6 * s),
        Math.round(18 * s),
        Math.round(4 * s),
      );
      if (gender === "female" && femaleHair === "long") {
        ctx.fillStyle = hairFill.dark;
        ctx.fillRect(
          Math.round(8 * s),
          Math.round(10 * s),
          Math.round(4 * s),
          Math.round(14 * s),
        );
        ctx.fillRect(
          Math.round(32 * s),
          Math.round(10 * s),
          Math.round(4 * s),
          Math.round(14 * s),
        );
      }
    }
  } else {
    // Mage
    const robeH = variant === "B" ? 22 : 28;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(
      Math.round(6 * s),
      Math.round(20 + (28 - robeH)) * s,
      Math.round(8 * s),
      Math.round(robeH * s),
    );
    ctx.fillRect(
      Math.round(26 * s),
      Math.round(20 + (28 - robeH)) * s,
      Math.round(8 * s),
      Math.round(robeH * s),
    );
    ctx.fillRect(
      Math.round(9 * s),
      Math.round(20 * s),
      Math.round(22 * s),
      Math.round(22 * s),
    );
    // Feminine accent
    if (gender === "female") {
      ctx.fillStyle = `${hi}18`;
      ctx.fillRect(
        Math.round(9 * s),
        Math.round(20 * s),
        Math.round(22 * s),
        Math.round(4 * s),
      );
    }
    ctx.fillStyle = `${hi}22`;
    ctx.fillRect(
      Math.round(10 * s),
      Math.round(21 * s),
      Math.round(20 * s),
      Math.round(3 * s),
    );
    // Staff or wand
    if (staffType === "short_wand") {
      // Short wand — compact, glowing tip
      ctx.fillStyle = "#886633";
      ctx.fillRect(
        Math.round(36 * s),
        Math.round(18 * s),
        Math.round(3 * s),
        Math.round(20 * s),
      );
      ctx.fillStyle = "#FFEE44";
      ctx.fillRect(
        Math.round(34 * s),
        Math.round(14 * s),
        Math.round(7 * s),
        Math.round(6 * s),
      );
      ctx.fillStyle = "#FFF8AA";
      ctx.fillRect(
        Math.round(36 * s),
        Math.round(15 * s),
        Math.round(3 * s),
        Math.round(3 * s),
      );
    } else {
      // Long staff
      ctx.fillStyle = "#886633";
      ctx.fillRect(
        Math.round(36 * s),
        Math.round(4 * s),
        Math.round(3 * s),
        Math.round(44 * s),
      );
      if (variant !== "C") {
        ctx.fillStyle = "#8844EE";
        ctx.fillRect(
          Math.round(33 * s),
          Math.round(2 * s),
          Math.round(9 * s),
          Math.round(9 * s),
        );
        ctx.fillStyle = "#CCAAFF";
        ctx.fillRect(
          Math.round(34 * s),
          Math.round(3 * s),
          Math.round(5 * s),
          Math.round(5 * s),
        );
      } else {
        ctx.fillStyle = "#332244";
        ctx.fillRect(
          Math.round(33 * s),
          Math.round(2 * s),
          Math.round(9 * s),
          Math.round(9 * s),
        );
      }
    }
    // Skin
    ctx.fillStyle = skin;
    ctx.fillRect(
      Math.round(14 * s),
      Math.round(8 * s),
      Math.round(16 * s),
      Math.round(13 * s),
    );
    // Eyes with glow
    ctx.fillStyle = dark;
    ctx.fillRect(
      Math.round(17 * s),
      Math.round(12 * s),
      Math.round(3 * s),
      Math.round(3 * s),
    );
    ctx.fillRect(
      Math.round(24 * s),
      Math.round(12 * s),
      Math.round(3 * s),
      Math.round(3 * s),
    );
    // Beard (male only, shorter)
    if (gender === "male" && beard) {
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(15 * s),
        Math.round(17 * s),
        Math.round(14 * s),
        Math.round(3 * s),
      );
    }
    // Hat / headgear
    if (variant === "A") {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(
        Math.round(10 * s),
        Math.round(1 * s),
        Math.round(24 * s),
        Math.round(8 * s),
      );
      ctx.fillRect(
        Math.round(14 * s),
        Math.round(-3 * s),
        Math.round(16 * s),
        Math.round(6 * s),
      );
      ctx.fillRect(
        Math.round(17 * s),
        Math.round(-8 * s),
        Math.round(10 * s),
        Math.round(7 * s),
      );
      ctx.fillRect(
        Math.round(19 * s),
        Math.round(-12 * s),
        Math.round(6 * s),
        Math.round(5 * s),
      );
      ctx.fillStyle = "#FFEE44";
      ctx.fillRect(
        Math.round(21 * s),
        Math.round(-4 * s),
        Math.round(3 * s),
        Math.round(2 * s),
      );
      // Female: hair visible at hat edge
      if (gender === "female" && femaleHair === "long") {
        ctx.fillStyle = hairFill.dark;
        ctx.fillRect(
          Math.round(8 * s),
          Math.round(8 * s),
          Math.round(4 * s),
          Math.round(16 * s),
        );
        ctx.fillRect(
          Math.round(32 * s),
          Math.round(8 * s),
          Math.round(4 * s),
          Math.round(16 * s),
        );
      }
    } else if (variant === "B") {
      ctx.fillStyle = "#886633";
      ctx.fillRect(
        Math.round(10 * s),
        Math.round(5 * s),
        Math.round(24 * s),
        Math.round(4 * s),
      );
      ctx.fillStyle = "#DDBB66";
      ctx.fillRect(
        Math.round(20 * s),
        Math.round(4 * s),
        Math.round(4 * s),
        Math.round(3 * s),
      );
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(11 * s),
        Math.round(6 * s),
        Math.round(22 * s),
        Math.round(4 * s),
      );
      if (gender === "female" && femaleHair === "long") {
        ctx.fillStyle = hairFill.dark;
        ctx.fillRect(
          Math.round(9 * s),
          Math.round(9 * s),
          Math.round(4 * s),
          Math.round(18 * s),
        );
        ctx.fillRect(
          Math.round(31 * s),
          Math.round(9 * s),
          Math.round(4 * s),
          Math.round(18 * s),
        );
      }
    } else {
      // dark cloak hood
      ctx.fillStyle = bodyColor;
      ctx.fillRect(
        Math.round(9 * s),
        Math.round(0 * s),
        Math.round(26 * s),
        Math.round(10 * s),
      );
      ctx.fillStyle = `${hi}18`;
      ctx.fillRect(
        Math.round(10 * s),
        Math.round(1 * s),
        Math.round(24 * s),
        Math.round(2 * s),
      );
      if (gender === "female" && femaleHair === "long") {
        ctx.fillStyle = hairFill.main;
        ctx.fillRect(
          Math.round(8 * s),
          Math.round(7 * s),
          Math.round(5 * s),
          Math.round(20 * s),
        );
        ctx.fillRect(
          Math.round(31 * s),
          Math.round(7 * s),
          Math.round(5 * s),
          Math.round(20 * s),
        );
      } else {
        ctx.fillStyle = hairFill.main;
        ctx.fillRect(
          Math.round(11 * s),
          Math.round(6 * s),
          Math.round(5 * s),
          Math.round(5 * s),
        );
        ctx.fillRect(
          Math.round(28 * s),
          Math.round(6 * s),
          Math.round(5 * s),
          Math.round(5 * s),
        );
      }
    }
  }
}

// ─── Sprite Canvas ─────────────────────────────────────────────────────────────

interface SpriteCanvasProps {
  cls: CharacterClass;
  variant: "A" | "B" | "C";
  outfit: OutfitColor;
  hair: HairColor;
  gender: Gender;
  weaponType: WeaponType;
  staffType: StaffType;
  beard: boolean;
  femaleHair: "long" | "short";
  size: number;
  animate?: boolean;
}

function SpriteCanvas({
  cls,
  variant,
  outfit,
  hair,
  gender,
  weaponType,
  staffType,
  beard,
  femaleHair,
  size,
  animate = false,
}: SpriteCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sc = size / SPRITE_SIZE;

    if (!animate) {
      drawPreviewSprite(
        ctx,
        cls,
        variant,
        outfit,
        hair,
        gender,
        weaponType,
        staffType,
        beard,
        femaleHair,
        sc,
      );
      return;
    }

    let running = true;
    const tick = (t: number) => {
      if (!running) return;
      const bob = Math.round(Math.sin(t * 0.002) * 1.5);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(0, bob);
      drawPreviewSprite(
        ctx,
        cls,
        variant,
        outfit,
        hair,
        gender,
        weaponType,
        staffType,
        beard,
        femaleHair,
        sc,
      );
      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    cls,
    variant,
    outfit,
    hair,
    gender,
    weaponType,
    staffType,
    beard,
    femaleHair,
    size,
    animate,
  ]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

// ─── Section Label style ───────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 8,
  color: "oklch(0.55 0 0)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 5,
};

const GOLD = "oklch(0.72 0.18 55)";
const GOLD_BG = "oklch(0.18 0.03 55 / 0.7)";
const GOLD_BORDER = "oklch(0.72 0.18 55 / 0.7)";
const DIM_BG = "oklch(0.14 0 0 / 0.5)";
const DIM_BORDER = "oklch(0.22 0 0 / 0.5)";

// ─── CustomizationPanel ────────────────────────────────────────────────────────

interface CustomizationPanelProps {
  selectedClass: CharacterClass;
  currentColor: OutfitColor;
  currentStyle: OutfitStyle;
  currentHairColor?: HairColor;
  onSave: (
    color: OutfitColor,
    style: OutfitStyle,
    hairColor: HairColor,
  ) => void;
  onClose: () => void;
}

export function CustomizationPanel({
  selectedClass,
  currentColor,
  currentStyle,
  currentHairColor = "brown",
  onSave,
  onClose,
}: CustomizationPanelProps) {
  // Parse incoming outfitStyle to seed UI state
  const parsed = parseOutfitStyle(currentStyle);

  const [gender, setGender] = useState<Gender>(
    parsed.baseClass === selectedClass ? parsed.gender : "male",
  );
  const [outfitVariant, setOutfitVariant] = useState<"A" | "B" | "C">(
    parsed.baseClass === selectedClass ? parsed.outfitVariant : "A",
  );
  const [weaponType, setWeaponType] = useState<WeaponType>(parsed.weaponType);
  const [staffType, setStaffType] = useState<StaffType>(parsed.staffType);
  const [beard, setBeard] = useState<boolean>(parsed.beard);
  const [femaleHair, setFemaleHair] = useState<"long" | "short">(
    parsed.femaleHair,
  );
  const [pickedColor, setPickedColor] = useState<OutfitColor>(currentColor);
  const [pickedHair, setPickedHair] = useState<HairColor>(currentHairColor);

  // Per-variant color memory
  const colorMemory = useRef<
    Record<"A" | "B" | "C", { outfit: OutfitColor; hair: HairColor }>
  >({
    A: { outfit: currentColor, hair: currentHairColor },
    B: { outfit: currentColor, hair: currentHairColor },
    C: { outfit: currentColor, hair: currentHairColor },
  });

  function selectVariant(v: "A" | "B" | "C") {
    colorMemory.current[outfitVariant] = {
      outfit: pickedColor,
      hair: pickedHair,
    };
    const mem = colorMemory.current[v];
    setPickedColor(mem.outfit);
    setPickedHair(mem.hair);
    setOutfitVariant(v);
  }

  // When gender changes, keep variant if valid
  function switchGender(g: Gender) {
    setGender(g);
    if (g === "male" && beard === false) setBeard(false);
  }

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose]);

  function handleSave() {
    const encoded = encodeOutfitStyle({
      baseClass: selectedClass,
      outfitVariant,
      gender,
      weaponType,
      staffType,
      beard,
      femaleHair,
    });
    onSave(pickedColor, encoded, pickedHair);
  }

  const outfitOptions =
    selectedClass === "warrior"
      ? gender === "female"
        ? WARRIOR_FEMALE_OUTFITS
        : WARRIOR_MALE_OUTFITS
      : gender === "female"
        ? MAGE_FEMALE_OUTFITS
        : MAGE_MALE_OUTFITS;

  return (
    <dialog
      ref={dialogRef}
      className="absolute inset-0 flex items-center justify-center pointer-events-auto m-0 p-0 max-w-none max-h-none w-full h-full"
      style={{
        zIndex: 55,
        background: "oklch(0 0 0 / 0.72)",
        backdropFilter: "blur(2px)",
        border: "none",
      }}
      data-ocid="customize-overlay"
      aria-label="Customize appearance"
    >
      <div
        className="relative flex flex-col gap-3"
        style={{
          background: "oklch(0.10 0 0 / 0.97)",
          border: "1px solid oklch(0.28 0 0 / 0.8)",
          borderRadius: 4,
          padding: "12px 14px",
          width: "min(350px, 96vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px oklch(0 0 0 / 0.7)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span
            className="font-mono text-xs uppercase tracking-widest font-bold"
            style={{ color: GOLD }}
          >
            👕 Appearance
          </span>
          <button
            type="button"
            onClick={onClose}
            data-ocid="customize-close"
            className="font-mono text-xs px-2 py-0.5 transition-colors"
            style={{ color: "oklch(0.40 0 0)" }}
            aria-label="Close customization panel"
          >
            ✕
          </button>
        </div>

        {/* Preview + right column */}
        <div className="flex gap-3" style={{ alignItems: "flex-start" }}>
          {/* Live Preview */}
          <div
            className="flex-shrink-0 flex flex-col items-center gap-1"
            style={{
              padding: "8px 10px",
              background: "oklch(0.16 0 0 / 0.6)",
              border: "1px solid oklch(0.25 0 0 / 0.5)",
              borderRadius: 3,
            }}
          >
            <span style={{ ...sectionLabel, textAlign: "center" }}>
              Preview
            </span>
            <div
              style={{
                background: "oklch(0.22 0.06 145 / 0.3)",
                border: "1px solid oklch(0.32 0.06 145 / 0.4)",
                borderRadius: 2,
                padding: 4,
              }}
            >
              <SpriteCanvas
                cls={selectedClass}
                variant={outfitVariant}
                outfit={pickedColor}
                hair={pickedHair}
                gender={gender}
                weaponType={weaponType}
                staffType={staffType}
                beard={beard}
                femaleHair={femaleHair}
                size={72}
                animate
              />
            </div>
            <span
              className="font-mono text-center"
              style={{ fontSize: 7, color: "oklch(0.40 0 0)", marginTop: 2 }}
            >
              {selectedClass === "warrior" ? "⚔ WARRIOR" : "✦ MAGE"}
            </span>
          </div>

          {/* Right side controls */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Gender Toggle */}
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={sectionLabel}>Gender</legend>
              <div className="flex gap-1.5">
                {(["male", "female"] as Gender[]).map((g) => {
                  const sel = gender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => switchGender(g)}
                      data-ocid={`gender-${g}`}
                      aria-pressed={sel}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        borderRadius: 3,
                        background: sel ? GOLD_BG : DIM_BG,
                        border: `1px solid ${sel ? GOLD_BORDER : DIM_BORDER}`,
                        color: sel ? "oklch(0.88 0.10 55)" : "oklch(0.55 0 0)",
                        transition: "background 0.15s, border-color 0.15s",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {g === "male" ? "♂ Male" : "♀ Female"}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Outfit Color */}
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={sectionLabel}>Outfit Color</legend>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_OPTIONS.map((opt) => {
                  const isSelected = pickedColor === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPickedColor(opt.value)}
                      data-ocid={`color-swatch-${opt.value}`}
                      aria-label={`Outfit: ${opt.label}`}
                      aria-pressed={isSelected}
                      title={opt.label}
                      style={{
                        width: 24,
                        height: 24,
                        background: opt.fill,
                        border: isSelected
                          ? "2px solid oklch(0.92 0 0)"
                          : "2px solid oklch(0.22 0 0 / 0.6)",
                        borderRadius: 2,
                        cursor: "pointer",
                        outline: isSelected ? `2px solid ${opt.fill}` : "none",
                        outlineOffset: 1,
                        transform: isSelected ? "scale(1.15)" : "scale(1)",
                        transition: "transform 0.1s ease, border-color 0.15s",
                        WebkitTapHighlightColor: "transparent",
                        flexShrink: 0,
                      }}
                    />
                  );
                })}
              </div>
            </fieldset>

            {/* Hair Color */}
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={sectionLabel}>Hair Color</legend>
              <div className="flex gap-1.5 flex-wrap">
                {HAIR_OPTIONS.map((opt) => {
                  const isSelected = pickedHair === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPickedHair(opt.value)}
                      data-ocid={`hair-swatch-${opt.value}`}
                      aria-label={`Hair: ${opt.label}`}
                      aria-pressed={isSelected}
                      title={opt.label}
                      style={{
                        width: 24,
                        height: 24,
                        background: opt.fill,
                        border: isSelected
                          ? "2px solid oklch(0.92 0 0)"
                          : "2px solid oklch(0.22 0 0 / 0.6)",
                        borderRadius: 2,
                        cursor: "pointer",
                        outline: isSelected ? `2px solid ${opt.fill}` : "none",
                        outlineOffset: 1,
                        transform: isSelected ? "scale(1.15)" : "scale(1)",
                        transition: "transform 0.1s ease, border-color 0.15s",
                        WebkitTapHighlightColor: "transparent",
                        flexShrink: 0,
                      }}
                    />
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Outfit Style */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={sectionLabel}>Appearance Style</legend>
          <div className="flex gap-2">
            {outfitOptions.map((opt) => {
              const isSel = outfitVariant === opt.variant;
              return (
                <button
                  key={opt.variant}
                  type="button"
                  onClick={() => selectVariant(opt.variant)}
                  data-ocid={`style-opt-${opt.variant}`}
                  aria-pressed={isSel}
                  className="flex flex-col items-center gap-1 flex-1"
                  style={{
                    padding: "6px 4px",
                    borderRadius: 3,
                    background: isSel ? GOLD_BG : DIM_BG,
                    border: `1px solid ${isSel ? GOLD_BORDER : DIM_BORDER}`,
                    cursor: "pointer",
                    minHeight: 80,
                    WebkitTapHighlightColor: "transparent",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                >
                  <div
                    style={{
                      borderRadius: 2,
                      overflow: "hidden",
                      background: "oklch(0.22 0.06 145 / 0.2)",
                      border: "1px solid oklch(0.28 0 0 / 0.4)",
                    }}
                  >
                    <SpriteCanvas
                      cls={selectedClass}
                      variant={opt.variant}
                      outfit={pickedColor}
                      hair={pickedHair}
                      gender={gender}
                      weaponType={weaponType}
                      staffType={staffType}
                      beard={beard}
                      femaleHair={femaleHair}
                      size={36}
                    />
                  </div>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: isSel ? "oklch(0.88 0.10 55)" : "oklch(0.60 0 0)",
                      textAlign: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    {opt.label}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 7,
                      color: "oklch(0.40 0 0)",
                      textAlign: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Weapon / Staff */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={sectionLabel}>
            {selectedClass === "warrior" ? "Weapon" : "Staff"}
          </legend>
          <div className="flex gap-2">
            {selectedClass === "warrior" ? (
              <>
                {(["sword", "axe"] as WeaponType[]).map((w) => {
                  const sel = weaponType === w;
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWeaponType(w)}
                      data-ocid={`weapon-${w}`}
                      aria-pressed={sel}
                      className="flex flex-col items-center justify-center gap-1 flex-1"
                      style={{
                        minHeight: 60,
                        padding: "6px 8px",
                        borderRadius: 3,
                        background: sel ? GOLD_BG : DIM_BG,
                        border: `1px solid ${sel ? GOLD_BORDER : DIM_BORDER}`,
                        cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 20 }}>
                        {w === "sword" ? "🗡️" : "🪓"}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: sel
                            ? "oklch(0.88 0.10 55)"
                            : "oklch(0.55 0 0)",
                        }}
                      >
                        {w === "sword" ? "Sword" : "Axe"}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {(["long_staff", "short_wand"] as StaffType[]).map((st) => {
                  const sel = staffType === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStaffType(st)}
                      data-ocid={`staff-${st}`}
                      aria-pressed={sel}
                      className="flex flex-col items-center justify-center gap-1 flex-1"
                      style={{
                        minHeight: 60,
                        padding: "6px 8px",
                        borderRadius: 3,
                        background: sel ? GOLD_BG : DIM_BG,
                        border: `1px solid ${sel ? GOLD_BORDER : DIM_BORDER}`,
                        cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 20 }}>
                        {st === "long_staff" ? "🪄" : "✨"}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: sel
                            ? "oklch(0.88 0.10 55)"
                            : "oklch(0.55 0 0)",
                        }}
                      >
                        {st === "long_staff" ? "Long Staff" : "Short Wand"}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </fieldset>

        {/* Hair Style / Beard */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={sectionLabel}>
            {gender === "male" ? "Beard" : "Hair Style"}
          </legend>
          {gender === "male" ? (
            <div className="flex gap-2">
              {[false, true].map((hasBeard) => {
                const sel = beard === hasBeard;
                return (
                  <button
                    key={String(hasBeard)}
                    type="button"
                    onClick={() => setBeard(hasBeard)}
                    data-ocid={`beard-${hasBeard ? "yes" : "no"}`}
                    aria-pressed={sel}
                    className="flex items-center justify-center gap-1.5 flex-1"
                    style={{
                      minHeight: 48,
                      padding: "6px 8px",
                      borderRadius: 3,
                      background: sel ? GOLD_BG : DIM_BG,
                      border: `1px solid ${sel ? GOLD_BORDER : DIM_BORDER}`,
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>
                      {hasBeard ? "🧔" : "😐"}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: sel ? "oklch(0.88 0.10 55)" : "oklch(0.55 0 0)",
                      }}
                    >
                      {hasBeard ? "With Beard" : "Clean Shave"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {(["long", "short"] as const).map((hs) => {
                const sel = femaleHair === hs;
                return (
                  <button
                    key={hs}
                    type="button"
                    onClick={() => setFemaleHair(hs)}
                    data-ocid={`hair-style-${hs}`}
                    aria-pressed={sel}
                    className="flex items-center justify-center gap-1.5 flex-1"
                    style={{
                      minHeight: 48,
                      padding: "6px 8px",
                      borderRadius: 3,
                      background: sel ? GOLD_BG : DIM_BG,
                      border: `1px solid ${sel ? GOLD_BORDER : DIM_BORDER}`,
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>
                      {hs === "long" ? "👩" : "👱‍♀️"}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: sel ? "oklch(0.88 0.10 55)" : "oklch(0.55 0 0)",
                      }}
                    >
                      {hs === "long" ? "Long Hair" : "Short Hair"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        {/* Save / Cancel */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            data-ocid="customize-save"
            className="flex-1 font-mono text-xs uppercase tracking-widest py-2"
            style={{
              background: "oklch(0.55 0.18 145 / 0.8)",
              border: "1px solid oklch(0.65 0.18 145 / 0.7)",
              borderRadius: 2,
              color: "oklch(0.96 0.05 145)",
              cursor: "pointer",
              minHeight: 48,
              transition: "background 0.15s",
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onClose}
            data-ocid="customize-cancel"
            className="font-mono text-xs uppercase tracking-widest px-4 py-2"
            style={{
              background: DIM_BG,
              border: `1px solid ${DIM_BORDER}`,
              borderRadius: 2,
              color: "oklch(0.50 0 0)",
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
