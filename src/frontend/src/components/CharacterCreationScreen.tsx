import { useCallback, useEffect, useRef, useState } from "react";
import { encodeOutfitStyle, parseOutfitStyle } from "../lib/outfitEncoding";
import type {
  CharacterClass,
  HairColor,
  OutfitColor,
  OutfitStyle,
} from "../types/game";

// ─── Sprite primitives ────────────────────────────────────────────────────────

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
  style: OutfitStyle,
  outfit: OutfitColor,
): string {
  if (outfit !== "default") return OUTFIT_FILLS[outfit];
  if (cls === "warrior") {
    if (style === "warrior_B") return "#9E9EA0";
    if (style === "warrior_C") return "#8A6030";
    return "#555860";
  }
  if (style === "mage_B") return "#4488CC";
  if (style === "mage_C") return "#282830";
  return "#4422AA";
}

function drawPreviewSprite(
  ctx: CanvasRenderingContext2D,
  cls: CharacterClass,
  style: OutfitStyle,
  outfit: OutfitColor,
  hair: HairColor,
  scale = 1.0,
): void {
  const s = scale;
  const W = Math.round(SPRITE_SIZE * s);
  const H = Math.round(SPRITE_SIZE * s);
  ctx.clearRect(0, 0, W, H);

  const bodyColor = getBodyColor(cls, style, outfit);
  const hairFill = HAIR_FILLS[hair];
  const dark = "#1A1A1A";
  const skin = "#D4A878";
  const hi = "#FFFFFF";

  if (cls === "warrior") {
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
    ctx.fillStyle = bodyColor;
    ctx.fillRect(
      Math.round(8 * s),
      Math.round(20 * s),
      Math.round(24 * s),
      Math.round(18 * s),
    );
    ctx.fillStyle = `${hi}33`;
    ctx.fillRect(
      Math.round(9 * s),
      Math.round(21 * s),
      Math.round(22 * s),
      Math.round(3 * s),
    );
    if (style === "warrior_A") {
      ctx.fillStyle = "#888898";
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
    ctx.fillStyle = skin;
    ctx.fillRect(
      Math.round(14 * s),
      Math.round(8 * s),
      Math.round(16 * s),
      Math.round(13 * s),
    );
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
    if (style === "warrior_A") {
      ctx.fillStyle = "#555860";
      ctx.fillRect(
        Math.round(11 * s),
        Math.round(2 * s),
        Math.round(22 * s),
        Math.round(10 * s),
      );
      ctx.fillStyle = dark;
      ctx.fillRect(
        Math.round(12 * s),
        Math.round(9 * s),
        Math.round(20 * s),
        Math.round(3 * s),
      );
    } else if (style === "warrior_B") {
      ctx.fillStyle = "#888898";
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
    } else {
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
    }
  } else {
    const robeH = style === "mage_B" ? 22 : 28;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(
      Math.round(6 * s),
      Math.round((20 + (28 - robeH)) * s),
      Math.round(8 * s),
      Math.round(robeH * s),
    );
    ctx.fillRect(
      Math.round(26 * s),
      Math.round((20 + (28 - robeH)) * s),
      Math.round(8 * s),
      Math.round(robeH * s),
    );
    ctx.fillStyle = bodyColor;
    ctx.fillRect(
      Math.round(9 * s),
      Math.round(20 * s),
      Math.round(22 * s),
      Math.round(22 * s),
    );
    ctx.fillStyle = `${hi}22`;
    ctx.fillRect(
      Math.round(10 * s),
      Math.round(21 * s),
      Math.round(20 * s),
      Math.round(3 * s),
    );
    ctx.fillStyle = "#886633";
    ctx.fillRect(
      Math.round(36 * s),
      Math.round(4 * s),
      Math.round(3 * s),
      Math.round(44 * s),
    );
    if (style !== "mage_C") {
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
    ctx.fillStyle = skin;
    ctx.fillRect(
      Math.round(14 * s),
      Math.round(8 * s),
      Math.round(16 * s),
      Math.round(13 * s),
    );
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
    if (style === "mage_A") {
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
    } else if (style === "mage_B") {
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
    } else {
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

// ─── SpriteCanvas ─────────────────────────────────────────────────────────────

interface SpriteCanvasProps {
  cls: CharacterClass;
  style: OutfitStyle;
  outfit: OutfitColor;
  hair: HairColor;
  size: number;
  animate?: boolean;
}

function SpriteCanvas({
  cls,
  style,
  outfit,
  hair,
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
    if (!animate) {
      drawPreviewSprite(ctx, cls, style, outfit, hair, size / SPRITE_SIZE);
      return;
    }
    let running = true;
    const tick = (t: number) => {
      if (!running) return;
      const bob = Math.round(Math.sin(t * 0.002) * 1.5);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(0, bob);
      drawPreviewSprite(ctx, cls, style, outfit, hair, size / SPRITE_SIZE);
      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [cls, style, outfit, hair, size, animate]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

// ─── Animated preview background canvas ───────────────────────────────────────

function PreviewBgCanvas({
  cls,
  width,
  height,
}: { cls: CharacterClass; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (cls === "mage") {
      // Mage: floating purple-blue sparkles
      type Sparkle = {
        x: number;
        y: number;
        alpha: number;
        speed: number;
        size: number;
        hue: number;
      };
      const sparkles: Sparkle[] = Array.from({ length: 20 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        alpha: Math.random() * 0.7 + 0.1,
        speed: Math.random() * 0.4 + 0.15,
        size: Math.random() * 2.5 + 1,
        hue: Math.random() * 60 + 240, // blue-purple
      }));

      let running = true;
      const tick = () => {
        if (!running) return;
        ctx.clearRect(0, 0, width, height);
        // deep purple-blue gradient bg
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, "rgba(15,8,40,1)");
        grad.addColorStop(1, "rgba(8,4,28,1)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        // sparkles drift up
        for (const sp of sparkles) {
          sp.y -= sp.speed;
          sp.alpha += Math.sin(Date.now() * 0.003 + sp.x) * 0.01;
          sp.alpha = Math.max(0.05, Math.min(0.9, sp.alpha));
          if (sp.y < -4) {
            sp.y = height + 4;
            sp.x = Math.random() * width;
          }
          ctx.save();
          ctx.globalAlpha = sp.alpha;
          ctx.fillStyle = `hsl(${sp.hue}, 80%, 75%)`;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        running = false;
        cancelAnimationFrame(rafRef.current);
      };
    }
    // Warrior: stone hall with warm torch glow
    let t = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      t += 0.02;
      ctx.clearRect(0, 0, width, height);
      // dark stone bg
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "rgba(12,10,8,1)");
      grad.addColorStop(1, "rgba(8,6,4,1)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      // torch glow corners
      const flickerL =
        0.55 + Math.sin(t * 2.1) * 0.08 + Math.sin(t * 3.7) * 0.04;
      const flickerR =
        0.55 + Math.sin(t * 1.9 + 1) * 0.08 + Math.sin(t * 4.1 + 0.5) * 0.04;
      const radL = ctx.createRadialGradient(
        0,
        height * 0.3,
        0,
        0,
        height * 0.3,
        width * 0.7,
      );
      radL.addColorStop(0, `rgba(220,140,20,${(flickerL * 0.35).toFixed(3)})`);
      radL.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = radL;
      ctx.fillRect(0, 0, width, height);
      const radR = ctx.createRadialGradient(
        width,
        height * 0.3,
        0,
        width,
        height * 0.3,
        width * 0.7,
      );
      radR.addColorStop(0, `rgba(220,140,20,${(flickerR * 0.35).toFixed(3)})`);
      radR.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = radR;
      ctx.fillRect(0, 0, width, height);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [cls, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}

// ─── Color pickers ────────────────────────────────────────────────────────────

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

// ─── Appearance configs per class + gender ────────────────────────────────────

const WARRIOR_MALE_STYLES: {
  value: OutfitStyle;
  label: string;
  desc: string;
}[] = [
  { value: "warrior_A", label: "Full Plate", desc: "Heavy armor, closed helm" },
  { value: "warrior_B", label: "Chainmail", desc: "Open-faced helmet" },
  { value: "warrior_C", label: "Leather", desc: "Hood, agile leathers" },
];

const WARRIOR_FEMALE_STYLES: {
  value: OutfitStyle;
  label: string;
  desc: string;
}[] = [
  { value: "warrior_A", label: "Full Plate", desc: "Feminine plate armor" },
  { value: "warrior_B", label: "Chainmail Vest", desc: "Open helmet, mail" },
  { value: "warrior_C", label: "Leather Outfit", desc: "Hair visible, agile" },
];

const MAGE_MALE_STYLES: { value: OutfitStyle; label: string; desc: string }[] =
  [
    { value: "mage_A", label: "Long Robe", desc: "Flowing robe, pointed hat" },
    { value: "mage_B", label: "Short Robe", desc: "Circlet, shorter robe" },
    { value: "mage_C", label: "Dark Cloak", desc: "Hood, mysterious look" },
  ];

const MAGE_FEMALE_STYLES: {
  value: OutfitStyle;
  label: string;
  desc: string;
}[] = [
  { value: "mage_A", label: "Elegant Robe", desc: "Long robe, pointed hat" },
  { value: "mage_B", label: "Short Robe", desc: "Decorative circlet" },
  { value: "mage_C", label: "Dark Cloak", desc: "Hood down, cloak" },
];

function getStyleOpts(cls: CharacterClass, gender: "male" | "female") {
  if (cls === "warrior")
    return gender === "female" ? WARRIOR_FEMALE_STYLES : WARRIOR_MALE_STYLES;
  return gender === "female" ? MAGE_FEMALE_STYLES : MAGE_MALE_STYLES;
}

// ─── Color contrast warning helper ───────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function colorDistance(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2);
}

function isColorsTooSimilar(outfit: OutfitColor, hair: HairColor): boolean {
  const outfitHex = OUTFIT_FILLS[outfit];
  const hairHex = HAIR_OPTIONS.find((h) => h.value === hair)?.fill ?? "#000000";
  return colorDistance(outfitHex, hairHex) < 80;
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

const GOLD = "oklch(0.85 0.18 85)";
const GOLD_DIM = "oklch(0.72 0.14 85)";
const WARRIOR_COLOR = "oklch(0.68 0.22 30)";
const MAGE_COLOR = "oklch(0.65 0.18 270)";

const BACK_BTN_STYLE: React.CSSProperties = {
  padding: "10px 24px",
  background: "oklch(0.14 0 0)",
  border: "1px solid oklch(0.28 0 0)",
  color: "oklch(0.5 0 0)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderRadius: 4,
  cursor: "pointer",
  minHeight: 48,
};

// ─── Progress indicator ───────────────────────────────────────────────────────

function StepProgress({ total, current }: { total: number; current: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((dotNum) => (
        <div
          key={`step-dot-${dotNum}`}
          style={{
            width: dotNum === current ? 24 : 8,
            height: 8,
            borderRadius: 999,
            background:
              dotNum === current
                ? GOLD
                : dotNum < current
                  ? "oklch(0.55 0.12 85)"
                  : "oklch(0.28 0 0)",
            boxShadow: dotNum === current ? `0 0 8px ${GOLD}88` : "none",
            transition: "all 0.3s ease",
            animation:
              dotNum === current
                ? "pq-pulse-gold 2s ease-in-out infinite"
                : "none",
          }}
        />
      ))}
    </div>
  );
}

// ─── Stat bar ─────────────────────────────────────────────────────────────────

function StatBar({
  label,
  value,
  max,
  color,
}: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: "var(--font-mono), monospace",
          fontSize: 10,
          color: "oklch(0.55 0 0)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div
        style={{
          height: 8,
          background: "oklch(0.18 0 0)",
          borderRadius: 999,
          overflow: "hidden",
          border: "1px solid oklch(0.22 0 0)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(value / max) * 100}%`,
            background: color,
            borderRadius: 999,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: max }, (_, idx) => {
          const segKey = `${label}-seg-${String(idx)}`;
          return (
            <div
              key={segKey}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 1,
                background: idx < value ? color : "oklch(0.18 0 0)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Gold action button ───────────────────────────────────────────────────────

function GoldButton({
  onClick,
  disabled,
  children,
  large,
  "data-ocid": ocid,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  large?: boolean;
  "data-ocid"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-ocid={ocid}
      style={{
        padding: large ? "14px 32px" : "10px 20px",
        background: disabled ? "oklch(0.22 0 0)" : "oklch(0.85 0.18 85 / 0.12)",
        border: `2px solid ${disabled ? "oklch(0.28 0 0)" : GOLD}`,
        color: disabled ? "oklch(0.4 0 0)" : GOLD,
        fontFamily: "var(--font-mono), monospace",
        fontWeight: 700,
        fontSize: large ? 14 : 12,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        boxShadow: disabled ? "none" : "0 0 12px oklch(0.85 0.18 85 / 0.2)",
        minHeight: 48,
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "oklch(0.85 0.18 85 / 0.22)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 0 24px oklch(0.85 0.18 85 / 0.4)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "oklch(0.85 0.18 85 / 0.12)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 0 12px oklch(0.85 0.18 85 / 0.2)";
        }
      }}
    >
      {children}
    </button>
  );
}

// ─── Toggle button ────────────────────────────────────────────────────────────

function ToggleButton({
  value,
  onChange,
  optA,
  optB,
  ocidA,
  ocidB,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  optA: string;
  optB: string;
  ocidA: string;
  ocidB: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[
        { label: optA, sel: !value, pick: false, ocid: ocidA },
        { label: optB, sel: value, pick: true, ocid: ocidB },
      ].map(({ label, sel, pick, ocid }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(pick)}
          data-ocid={ocid}
          aria-pressed={sel}
          style={{
            flex: 1,
            padding: "8px 0",
            background: sel ? "oklch(0.85 0.18 85 / 0.12)" : "oklch(0.14 0 0)",
            border: `2px solid ${sel ? GOLD : "oklch(0.25 0 0)"}`,
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "var(--font-mono), monospace",
            fontSize: 11,
            fontWeight: sel ? 700 : 400,
            color: sel ? GOLD : "oklch(0.5 0 0)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            transition: "all 0.15s ease",
            minHeight: 44,
            boxShadow: sel ? `0 0 10px ${GOLD}33` : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CharacterCreationScreenProps {
  onComplete: (
    name: string,
    cls: CharacterClass,
    style: OutfitStyle,
    outfit: OutfitColor,
    hair: HairColor,
  ) => void;
  onCancel: () => void;
  checkNicknameAvailable: (name: string) => Promise<boolean>;
}

// Steps: 0=Gender, 1=Class, 2=Appearance, 3=Weapon, 4=Name, 5=Confirm
const TOTAL_STEPS = 6;

export function CharacterCreationScreen({
  onComplete,
  onCancel,
  checkNicknameAvailable,
}: CharacterCreationScreenProps) {
  const [step, setStep] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  // Step state
  const [selectedGender, setSelectedGender] = useState<"male" | "female">(
    "male",
  );
  const [selectedClass, setSelectedClass] = useState<CharacterClass>("warrior");
  const [selectedStyle, setSelectedStyle] = useState<OutfitStyle>("warrior_A");
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitColor>("default");
  const [selectedHair, setSelectedHair] = useState<HairColor>("brown");
  const [hasBearrd, setHasBeard] = useState(false);
  const [femaleHairShort, setFemaleHairShort] = useState(false);
  const [warriorWeapon, setWarriorWeapon] = useState<"sword" | "axe">("sword");
  const [mageStaff, setMageStaff] = useState<"long_staff" | "short_wand">(
    "long_staff",
  );
  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preview container measurement
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ w: 200, h: 180 });

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const update = () => {
      setPreviewSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goToStep = useCallback((next: number) => {
    setFadeIn(false);
    setTimeout(() => {
      setStep(next);
      setFadeIn(true);
    }, 150);
  }, []);

  const handleSelectClass = useCallback((cls: CharacterClass) => {
    setSelectedClass(cls);
    setSelectedStyle(cls === "warrior" ? "warrior_A" : "mage_A");
  }, []);

  const handleGenderChange = useCallback((gender: "male" | "female") => {
    setSelectedGender(gender);
    setHasBeard(false);
    setFemaleHairShort(false);
  }, []);

  const handleNameChange = useCallback(
    (val: string) => {
      setName(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = val.trim();
      if (!trimmed) {
        setNameStatus("idle");
        return;
      }
      if (trimmed.toLowerCase().startsWith("guest")) {
        setNameStatus("invalid");
        return;
      }
      if (!/^[a-zA-Z0-9]{3,16}$/.test(trimmed)) {
        setNameStatus("invalid");
        return;
      }
      setNameStatus("checking");
      debounceRef.current = setTimeout(async () => {
        try {
          const available = await checkNicknameAvailable(trimmed);
          setNameStatus(available ? "available" : "taken");
        } catch {
          setNameStatus("available");
        }
      }, 500);
    },
    [checkNicknameAvailable],
  );

  const canAdvanceName = nameStatus === "available" && name.trim().length >= 3;

  const handleConfirm = useCallback(() => {
    const { outfitVariant } = parseOutfitStyle(selectedStyle);
    const encoded = encodeOutfitStyle({
      baseClass: selectedClass,
      outfitVariant,
      gender: selectedGender,
      weaponType: warriorWeapon,
      staffType: mageStaff,
      beard: hasBearrd,
      femaleHair: femaleHairShort ? "short" : "long",
    }) as OutfitStyle;
    onComplete(
      name.trim(),
      selectedClass,
      encoded,
      selectedOutfit,
      selectedHair,
    );
  }, [
    name,
    selectedClass,
    selectedStyle,
    selectedOutfit,
    selectedHair,
    selectedGender,
    warriorWeapon,
    mageStaff,
    hasBearrd,
    femaleHairShort,
    onComplete,
  ]);

  const styleOpts = getStyleOpts(selectedClass, selectedGender);
  const progressStep = step + 1;
  const classColor = selectedClass === "warrior" ? WARRIOR_COLOR : MAGE_COLOR;
  const spriteSize = Math.min(previewSize.w * 0.55, previewSize.h * 0.72, 160);
  const colorWarning =
    step >= 2 && isColorsTooSimilar(selectedOutfit, selectedHair);

  return (
    <div
      data-ocid="char-creation.page"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "oklch(0.07 0.01 260)",
      }}
    >
      {/* ── TOP 45%: live preview ── */}
      <div
        ref={previewContainerRef}
        style={{
          height: "45%",
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* animated class background */}
        <PreviewBgCanvas
          cls={selectedClass}
          width={previewSize.w}
          height={previewSize.h}
        />

        {/* animated border */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `2px solid ${classColor}`,
            opacity: 0.5,
            pointerEvents: "none",
            zIndex: 2,
            boxShadow: `inset 0 0 30px ${classColor}22, 0 0 20px ${classColor}22`,
            animation: "pq-border-glow 2.5s ease-in-out infinite",
          }}
        />

        {/* corner accents */}
        {(
          [
            ["top", "left"],
            ["top", "right"],
            ["bottom", "left"],
            ["bottom", "right"],
          ] as const
        ).map(([v, h]) => (
          <div
            key={`corner-${v}-${h}`}
            style={{
              position: "absolute",
              [v]: 8,
              [h]: 8,
              width: 16,
              height: 16,
              borderTop: v === "top" ? `2px solid ${classColor}` : "none",
              borderBottom: v === "bottom" ? `2px solid ${classColor}` : "none",
              borderLeft: h === "left" ? `2px solid ${classColor}` : "none",
              borderRight: h === "right" ? `2px solid ${classColor}` : "none",
              opacity: 0.9,
              zIndex: 3,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* sprite + info */}
        <div
          style={{
            position: "relative",
            zIndex: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* large animated sprite */}
          <div
            style={{
              padding: Math.round(spriteSize * 0.12),
              background: `${classColor}18`,
              border: `2px solid ${classColor}55`,
              borderRadius: 10,
              boxShadow: `0 0 24px ${classColor}44, 0 0 8px ${classColor}22`,
              transition: "border-color 0.3s, box-shadow 0.3s",
            }}
          >
            <SpriteCanvas
              cls={selectedClass}
              style={selectedStyle}
              outfit={selectedOutfit}
              hair={selectedHair}
              size={Math.round(spriteSize)}
              animate
            />
          </div>

          {/* class + gender badge */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 11,
                fontWeight: 700,
                color: classColor,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                textShadow: `0 0 10px ${classColor}88`,
              }}
            >
              {selectedGender === "female" ? "♀ " : "♂ "}
              {selectedClass === "warrior" ? "⚔ Warrior" : "🔮 Mage"}
            </span>
            {colorWarning && (
              <span
                title="Outfit and hair colors are very similar"
                style={{ fontSize: 14, cursor: "help" }}
              >
                ⚠️
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM 55%: form steps ── */}
      <div
        style={{
          height: "55%",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "oklch(0.08 0.008 260)",
          borderTop: `1px solid ${classColor}33`,
          overflow: "hidden",
        }}
      >
        {/* progress + step label */}
        <div
          style={{
            padding: "10px 16px 8px",
            flexShrink: 0,
            borderBottom: "1px solid oklch(0.15 0 0)",
            background: "oklch(0.10 0.008 260)",
          }}
        >
          <StepProgress total={TOTAL_STEPS} current={progressStep} />
          <p
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9,
              color: "oklch(0.40 0 0)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              textAlign: "center",
              marginTop: 5,
            }}
          >
            Step {progressStep} of {TOTAL_STEPS}
          </p>
        </div>

        {/* scrollable step content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling:
              "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            padding: "12px 16px 16px",
            opacity: fadeIn ? 1 : 0,
            transform: fadeIn ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
          }}
        >
          {step === 0 && (
            <Step0ChooseGender
              selectedGender={selectedGender}
              onSelectGender={handleGenderChange}
              onNext={() => goToStep(1)}
              onCancel={onCancel}
            />
          )}
          {step === 1 && (
            <Step1ChooseClass
              selectedClass={selectedClass}
              onSelectClass={handleSelectClass}
              onNext={() => goToStep(2)}
              onBack={() => goToStep(0)}
            />
          )}
          {step === 2 && (
            <Step2Appearance
              selectedClass={selectedClass}
              selectedGender={selectedGender}
              styleOpts={styleOpts}
              selectedStyle={selectedStyle}
              selectedOutfit={selectedOutfit}
              selectedHair={selectedHair}
              hasBearrd={hasBearrd}
              femaleHairShort={femaleHairShort}
              onSelectStyle={setSelectedStyle}
              onSelectOutfit={setSelectedOutfit}
              onSelectHair={setSelectedHair}
              onSetBeard={setHasBeard}
              onSetFemaleHairShort={setFemaleHairShort}
              onNext={() => goToStep(3)}
              onBack={() => goToStep(1)}
            />
          )}
          {step === 3 && (
            <Step3Weapon
              selectedClass={selectedClass}
              warriorWeapon={warriorWeapon}
              mageStaff={mageStaff}
              onSetWarriorWeapon={setWarriorWeapon}
              onSetMageStaff={setMageStaff}
              onNext={() => goToStep(4)}
              onBack={() => goToStep(2)}
            />
          )}
          {step === 4 && (
            <Step4ChooseName
              name={name}
              nameStatus={nameStatus}
              onChange={handleNameChange}
              onNext={() => goToStep(5)}
              onBack={() => goToStep(3)}
              canAdvance={canAdvanceName}
            />
          )}
          {step === 5 && (
            <Step5Confirm
              selectedClass={selectedClass}
              selectedGender={selectedGender}
              selectedStyle={selectedStyle}
              selectedOutfit={selectedOutfit}
              selectedHair={selectedHair}
              warriorWeapon={warriorWeapon}
              mageStaff={mageStaff}
              hasBearrd={hasBearrd}
              femaleHairShort={femaleHairShort}
              name={name}
              onConfirm={handleConfirm}
              onBack={() => goToStep(4)}
              onCancel={onCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 0: Choose Gender ────────────────────────────────────────────────────

function Step0ChooseGender({
  selectedGender,
  onSelectGender,
  onNext,
  onCancel,
}: {
  selectedGender: "male" | "female";
  onSelectGender: (g: "male" | "female") => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const genders: {
    value: "male" | "female";
    label: string;
    icon: string;
    desc: string;
  }[] = [
    {
      value: "male",
      label: "Male",
      icon: "♂",
      desc: "Beard options, male outfit styles",
    },
    {
      value: "female",
      label: "Female",
      icon: "♀",
      desc: "Hair length options, feminine styles",
    },
  ];

  return (
    <div data-ocid="char-creation.step0">
      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontWeight: 900,
          fontSize: "clamp(1rem, 3.5vw, 1.4rem)",
          textAlign: "center",
          color: "oklch(0.9 0 0)",
          letterSpacing: "0.05em",
          marginBottom: 12,
        }}
      >
        Choose Your Gender
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {genders.map((g) => {
          const isSel = selectedGender === g.value;
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => onSelectGender(g.value)}
              aria-pressed={isSel}
              data-ocid={`char-creation.gender-${g.value}`}
              style={{
                background: isSel
                  ? "oklch(0.14 0.02 85 / 0.8)"
                  : "oklch(0.13 0 0 / 0.95)",
                border: `2px solid ${isSel ? GOLD : "oklch(0.25 0 0)"}`,
                borderRadius: 10,
                padding: "16px 10px",
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                boxShadow: isSel ? `0 0 20px ${GOLD}44` : "none",
                transition: "all 0.25s ease",
                WebkitTapHighlightColor: "transparent",
                minHeight: 100,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isSel ? `${GOLD}18` : "oklch(0.16 0 0)",
                  border: `2px solid ${isSel ? GOLD : "oklch(0.22 0 0)"}`,
                  fontSize: 28,
                  color: isSel ? GOLD : "oklch(0.5 0 0)",
                  boxShadow: isSel ? `0 0 12px ${GOLD}44` : "none",
                  transition: "all 0.25s ease",
                }}
              >
                {g.icon}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display), sans-serif",
                  fontWeight: 800,
                  fontSize: 16,
                  color: isSel ? GOLD : "oklch(0.85 0 0)",
                  letterSpacing: "0.05em",
                }}
              >
                {g.label}
              </div>
              <p
                style={{
                  fontFamily: "var(--font-body), sans-serif",
                  fontSize: 10,
                  color: "oklch(0.55 0 0)",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {g.desc}
              </p>
              {isSel && (
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono), monospace",
                    color: GOLD_DIM,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  ✓ Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          data-ocid="char-creation.cancel-button"
          style={BACK_BTN_STYLE}
        >
          ← Back
        </button>
        <GoldButton onClick={onNext} data-ocid="char-creation.step0-next">
          Next: Class →
        </GoldButton>
      </div>
    </div>
  );
}

// ─── Step 1: Choose Class ─────────────────────────────────────────────────────

function Step1ChooseClass({
  selectedClass,
  onSelectClass,
  onNext,
  onBack,
}: {
  selectedClass: CharacterClass;
  onSelectClass: (c: CharacterClass) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div data-ocid="char-creation.step1">
      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontWeight: 900,
          fontSize: "clamp(1rem, 3.5vw, 1.4rem)",
          textAlign: "center",
          color: "oklch(0.9 0 0)",
          letterSpacing: "0.05em",
          marginBottom: 12,
        }}
      >
        Choose Your Class
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <ClassCard
          cls="warrior"
          selected={selectedClass === "warrior"}
          onSelect={() => onSelectClass("warrior")}
          icon="⚔"
          name="Warrior"
          description="High HP and defense. Shield skills protect you in battle."
          hpValue={8}
          hpMax={8}
          manaValue={2}
          manaMax={8}
          accentColor={WARRIOR_COLOR}
          ocid="char-creation.warrior-card"
        />
        <ClassCard
          cls="mage"
          selected={selectedClass === "mage"}
          onSelect={() => onSelectClass("mage")}
          icon="🔮"
          name="Mage"
          description="Powerful area spells. Low HP but devastating magical offense."
          hpValue={2}
          hpMax={8}
          manaValue={8}
          manaMax={8}
          accentColor={MAGE_COLOR}
          ocid="char-creation.mage-card"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          data-ocid="char-creation.step1-back"
          style={BACK_BTN_STYLE}
        >
          ← Back
        </button>
        <GoldButton onClick={onNext} data-ocid="char-creation.step1-next">
          Next: Appearance →
        </GoldButton>
      </div>
    </div>
  );
}

// ─── Class card ───────────────────────────────────────────────────────────────

function ClassCard({
  cls,
  selected,
  onSelect,
  icon,
  name,
  description,
  hpValue,
  hpMax,
  manaValue,
  manaMax,
  accentColor,
  ocid,
}: {
  cls: CharacterClass;
  selected: boolean;
  onSelect: () => void;
  icon: string;
  name: string;
  description: string;
  hpValue: number;
  hpMax: number;
  manaValue: number;
  manaMax: number;
  accentColor: string;
  ocid: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-ocid={ocid}
      style={{
        background: selected
          ? `oklch(0.14 0.02 ${cls === "warrior" ? "30" : "270"} / 0.9)`
          : "oklch(0.13 0 0 / 0.95)",
        border: `2px solid ${selected ? GOLD : "oklch(0.25 0 0)"}`,
        borderRadius: 10,
        padding: "12px 10px",
        cursor: "pointer",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: selected
          ? `0 0 20px ${GOLD}44, 0 0 6px ${accentColor}44`
          : "none",
        transition: "all 0.25s ease",
        WebkitTapHighlightColor: "transparent",
        minHeight: 180,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            padding: 6,
            background: selected ? `${accentColor}22` : "oklch(0.18 0 0)",
            borderRadius: 8,
            border: `1px solid ${selected ? `${accentColor}55` : "oklch(0.22 0 0)"}`,
          }}
        >
          <SpriteCanvas
            cls={cls}
            style={cls === "warrior" ? "warrior_A" : "mage_A"}
            outfit="default"
            hair="brown"
            size={60}
            animate={selected}
          />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 3 }}>
          {icon}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display), sans-serif",
            fontWeight: 800,
            fontSize: 15,
            color: selected ? GOLD : "oklch(0.85 0 0)",
            letterSpacing: "0.05em",
          }}
        >
          {name}
        </div>
      </div>
      <p
        style={{
          fontFamily: "var(--font-body), sans-serif",
          fontSize: 10,
          color: "oklch(0.6 0 0)",
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {description}
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          textAlign: "left",
        }}
      >
        <StatBar
          label="HP"
          value={hpValue}
          max={hpMax}
          color="oklch(0.55 0.22 25)"
        />
        <StatBar
          label="MP"
          value={manaValue}
          max={manaMax}
          color="oklch(0.55 0.18 260)"
        />
      </div>
      {selected && (
        <div
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono), monospace",
            color: GOLD_DIM,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          ✓ Selected
        </div>
      )}
    </button>
  );
}

// ─── Step 2: Appearance ───────────────────────────────────────────────────────

function Step2Appearance({
  selectedClass,
  selectedGender,
  styleOpts,
  selectedStyle,
  selectedOutfit,
  selectedHair,
  hasBearrd,
  femaleHairShort,
  onSelectStyle,
  onSelectOutfit,
  onSelectHair,
  onSetBeard,
  onSetFemaleHairShort,
  onNext,
  onBack,
}: {
  selectedClass: CharacterClass;
  selectedGender: "male" | "female";
  styleOpts: { value: OutfitStyle; label: string; desc: string }[];
  selectedStyle: OutfitStyle;
  selectedOutfit: OutfitColor;
  selectedHair: HairColor;
  hasBearrd: boolean;
  femaleHairShort: boolean;
  onSelectStyle: (s: OutfitStyle) => void;
  onSelectOutfit: (c: OutfitColor) => void;
  onSelectHair: (h: HairColor) => void;
  onSetBeard: (v: boolean) => void;
  onSetFemaleHairShort: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace",
    fontSize: 9,
    color: "oklch(0.45 0 0)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 5,
  };

  return (
    <div data-ocid="char-creation.step2">
      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontWeight: 900,
          fontSize: "clamp(1rem, 3.5vw, 1.4rem)",
          textAlign: "center",
          color: "oklch(0.9 0 0)",
          letterSpacing: "0.05em",
          marginBottom: 10,
        }}
      >
        Choose Your Appearance
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 12,
        }}
      >
        {/* Style thumbnails */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={labelStyle}>Style</legend>
          <div style={{ display: "flex", gap: 6 }}>
            {styleOpts.map((opt, idx) => {
              const isSel = selectedStyle === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSelectStyle(opt.value)}
                  data-ocid={`char-creation.style-${idx + 1}`}
                  aria-pressed={isSel}
                  title={opt.label}
                  style={{
                    padding: 5,
                    background: isSel
                      ? "oklch(0.18 0.03 85 / 0.8)"
                      : "oklch(0.14 0 0 / 0.7)",
                    border: `2px solid ${isSel ? GOLD : "oklch(0.22 0 0)"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    transition: "border-color 0.15s, background 0.15s",
                    WebkitTapHighlightColor: "transparent",
                    boxShadow: isSel ? `0 0 8px ${GOLD}44` : "none",
                    flex: "1 1 0",
                    minWidth: 50,
                  }}
                >
                  <SpriteCanvas
                    cls={selectedClass}
                    style={opt.value}
                    outfit={selectedOutfit}
                    hair={selectedHair}
                    size={44}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: 8,
                      color: isSel ? GOLD_DIM : "oklch(0.45 0 0)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Toggles */}
        {selectedClass === "warrior" && selectedGender === "male" && (
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Beard</legend>
            <ToggleButton
              value={hasBearrd}
              onChange={onSetBeard}
              optA="No Beard"
              optB="With Beard"
              ocidA="char-creation.beard-no"
              ocidB="char-creation.beard-yes"
            />
          </fieldset>
        )}
        {selectedGender === "female" && (
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Hair Length</legend>
            <ToggleButton
              value={femaleHairShort}
              onChange={onSetFemaleHairShort}
              optA="Long Hair"
              optB="Short Hair"
              ocidA="char-creation.hair-long"
              ocidB="char-creation.hair-short"
            />
          </fieldset>
        )}

        {/* Color pickers — side by side */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Outfit Color</legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLOR_OPTIONS.map((opt) => {
                const isSel = selectedOutfit === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSelectOutfit(opt.value)}
                    data-ocid={`char-creation.outfit-${opt.value}`}
                    aria-label={`Outfit: ${opt.label}`}
                    aria-pressed={isSel}
                    title={opt.label}
                    style={{
                      width: 28,
                      height: 28,
                      background: opt.fill,
                      border: isSel
                        ? "2px solid oklch(0.9 0 0)"
                        : "2px solid oklch(0.18 0 0)",
                      borderRadius: 4,
                      cursor: "pointer",
                      outline: isSel ? `2px solid ${opt.fill}` : "none",
                      outlineOffset: 2,
                      transform: isSel ? "scale(1.2)" : "scale(1)",
                      transition: "transform 0.1s ease, border-color 0.1s",
                      WebkitTapHighlightColor: "transparent",
                      flexShrink: 0,
                    }}
                  />
                );
              })}
            </div>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Hair Color</legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {HAIR_OPTIONS.map((opt) => {
                const isSel = selectedHair === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSelectHair(opt.value)}
                    data-ocid={`char-creation.hair-${opt.value}`}
                    aria-label={`Hair: ${opt.label}`}
                    aria-pressed={isSel}
                    title={opt.label}
                    style={{
                      width: 28,
                      height: 28,
                      background: opt.fill,
                      border: isSel
                        ? "2px solid oklch(0.9 0 0)"
                        : "2px solid oklch(0.18 0 0)",
                      borderRadius: 4,
                      cursor: "pointer",
                      outline: isSel ? `2px solid ${opt.fill}` : "none",
                      outlineOffset: 2,
                      transform: isSel ? "scale(1.2)" : "scale(1)",
                      transition: "transform 0.1s ease, border-color 0.1s",
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

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          data-ocid="char-creation.step2-back"
          style={BACK_BTN_STYLE}
        >
          ← Back
        </button>
        <GoldButton onClick={onNext} data-ocid="char-creation.step2-next">
          Next: Weapon →
        </GoldButton>
      </div>
    </div>
  );
}

// ─── Step 3: Weapon Selection ─────────────────────────────────────────────────

function Step3Weapon({
  selectedClass,
  warriorWeapon,
  mageStaff,
  onSetWarriorWeapon,
  onSetMageStaff,
  onNext,
  onBack,
}: {
  selectedClass: CharacterClass;
  warriorWeapon: "sword" | "axe";
  mageStaff: "long_staff" | "short_wand";
  onSetWarriorWeapon: (w: "sword" | "axe") => void;
  onSetMageStaff: (s: "long_staff" | "short_wand") => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const isWarrior = selectedClass === "warrior";

  const weaponOpts: {
    value: "sword" | "axe";
    label: string;
    desc: string;
    icon: string;
  }[] = [
    {
      value: "sword",
      label: "Sword",
      desc: "One-handed blade, shield on back",
      icon: "⚔",
    },
    {
      value: "axe",
      label: "Axe",
      desc: "Heavy axe, different swing arc",
      icon: "🪓",
    },
  ];

  const staffOpts: {
    value: "long_staff" | "short_wand";
    label: string;
    desc: string;
    icon: string;
  }[] = [
    {
      value: "long_staff",
      label: "Long Staff",
      desc: "Tall staff with crystal top",
      icon: "🔱",
    },
    {
      value: "short_wand",
      label: "Short Wand",
      desc: "Compact wand, quick flick cast",
      icon: "✦",
    },
  ];

  const opts = isWarrior
    ? weaponOpts.map((o) => ({
        ...o,
        selected: warriorWeapon === o.value,
        onPick: () => onSetWarriorWeapon(o.value),
      }))
    : staffOpts.map((o) => ({
        ...o,
        selected: mageStaff === o.value,
        onPick: () => onSetMageStaff(o.value),
      }));

  const accentColor = isWarrior ? WARRIOR_COLOR : MAGE_COLOR;

  return (
    <div data-ocid="char-creation.step3">
      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontWeight: 900,
          fontSize: "clamp(1rem, 3.5vw, 1.4rem)",
          textAlign: "center",
          color: "oklch(0.9 0 0)",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        Choose Your Weapon
      </h2>
      <p
        style={{
          fontFamily: "var(--font-body), sans-serif",
          fontSize: 12,
          color: "oklch(0.5 0 0)",
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        {isWarrior
          ? "Select your warrior's primary weapon type."
          : "Select your mage's casting implement."}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {opts.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={opt.onPick}
            aria-pressed={opt.selected}
            data-ocid={`char-creation.weapon-${opt.value}`}
            style={{
              background: opt.selected
                ? `oklch(0.14 0.02 ${isWarrior ? "30" : "270"} / 0.9)`
                : "oklch(0.13 0 0 / 0.95)",
              border: `2px solid ${opt.selected ? GOLD : "oklch(0.25 0 0)"}`,
              borderRadius: 10,
              padding: "18px 14px",
              cursor: "pointer",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              boxShadow: opt.selected
                ? `0 0 20px ${GOLD}44, 0 0 6px ${accentColor}44`
                : "none",
              transition: "all 0.25s ease",
              WebkitTapHighlightColor: "transparent",
              minHeight: 140,
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: opt.selected
                  ? `${accentColor}22`
                  : "oklch(0.16 0 0)",
                border: `2px solid ${opt.selected ? `${accentColor}55` : "oklch(0.22 0 0)"}`,
                fontSize: 28,
                transition: "all 0.25s ease",
              }}
            >
              {opt.icon}
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display), sans-serif",
                  fontWeight: 800,
                  fontSize: 15,
                  color: opt.selected ? GOLD : "oklch(0.85 0 0)",
                  letterSpacing: "0.05em",
                  marginBottom: 3,
                }}
              >
                {opt.label}
              </div>
              <p
                style={{
                  fontFamily: "var(--font-body), sans-serif",
                  fontSize: 11,
                  color: "oklch(0.55 0 0)",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {opt.desc}
              </p>
            </div>
            {opt.selected && (
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "var(--font-mono), monospace",
                  color: GOLD_DIM,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                ✓ Selected
              </div>
            )}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          data-ocid="char-creation.step3-back"
          style={BACK_BTN_STYLE}
        >
          ← Back
        </button>
        <GoldButton onClick={onNext} data-ocid="char-creation.step3-next">
          Next: Name →
        </GoldButton>
      </div>
    </div>
  );
}

// ─── Step 4: Name ─────────────────────────────────────────────────────────────

function Step4ChooseName({
  name,
  nameStatus,
  onChange,
  onNext,
  onBack,
  canAdvance,
}: {
  name: string;
  nameStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const statusColor = {
    idle: "transparent",
    checking: "oklch(0.6 0.1 260)",
    available: "oklch(0.65 0.18 145)",
    taken: "oklch(0.6 0.22 25)",
    invalid: "oklch(0.6 0.18 45)",
  }[nameStatus];

  const statusText = {
    idle: "",
    checking: "⟳ Checking...",
    available: "✓ Name available!",
    taken: "✗ Name already taken",
    invalid: "✗ 3-16 characters, letters and numbers only (no 'Guest' prefix)",
  }[nameStatus];

  return (
    <div
      data-ocid="char-creation.step4"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontWeight: 900,
          fontSize: "clamp(1rem, 3.5vw, 1.4rem)",
          textAlign: "center",
          color: "oklch(0.9 0 0)",
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        Choose Your Name
      </h2>
      <p
        style={{
          fontFamily: "var(--font-body), sans-serif",
          fontSize: 12,
          color: "oklch(0.5 0 0)",
          textAlign: "center",
          margin: 0,
        }}
      >
        Your name will be visible to all players in the world.
      </p>

      <div
        style={{
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter character name..."
            maxLength={16}
            data-ocid="char-creation.name-input"
            autoComplete="off"
            style={{
              width: "100%",
              padding: "12px 48px 12px 16px",
              background: "oklch(0.14 0 0)",
              border: `2px solid ${
                nameStatus === "available"
                  ? "oklch(0.65 0.18 145)"
                  : nameStatus === "taken" || nameStatus === "invalid"
                    ? "oklch(0.6 0.22 25)"
                    : `${GOLD}88`
              }`,
              borderRadius: 6,
              color: "oklch(0.9 0 0)",
              fontFamily: "var(--font-display), sans-serif",
              fontSize: 17,
              fontWeight: 700,
              textAlign: "center",
              letterSpacing: "0.05em",
              outline: "none",
              transition: "border-color 0.2s ease",
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAdvance) onNext();
            }}
          />
          {/* character count */}
          <span
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9,
              color: "oklch(0.4 0 0)",
            }}
          >
            {name.length}/16
          </span>
        </div>
        <div
          style={{
            minHeight: 18,
            fontFamily: "var(--font-mono), monospace",
            fontSize: 10,
            color: statusColor,
            textAlign: "center",
            transition: "color 0.2s ease",
            letterSpacing: "0.06em",
          }}
        >
          {statusText}
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: 9,
            color: "oklch(0.38 0 0)",
            textAlign: "center",
            margin: 0,
            letterSpacing: "0.05em",
          }}
        >
          3–16 characters · letters and numbers only · no "Guest" prefix
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          data-ocid="char-creation.step4-back"
          style={BACK_BTN_STYLE}
        >
          ← Back
        </button>
        <GoldButton
          onClick={onNext}
          disabled={!canAdvance}
          data-ocid="char-creation.step4-next"
        >
          Next: Confirm →
        </GoldButton>
      </div>
    </div>
  );
}

// ─── Step 5: Confirm ──────────────────────────────────────────────────────────

function Step5Confirm({
  selectedClass,
  selectedGender,
  selectedStyle,
  selectedOutfit: _selectedOutfit,
  selectedHair: _selectedHair,
  warriorWeapon,
  mageStaff,
  hasBearrd,
  femaleHairShort,
  name,
  onConfirm,
  onBack,
  onCancel,
}: {
  selectedClass: CharacterClass;
  selectedGender: "male" | "female";
  selectedStyle: OutfitStyle;
  selectedOutfit: OutfitColor;
  selectedHair: HairColor;
  warriorWeapon: "sword" | "axe";
  mageStaff: "long_staff" | "short_wand";
  hasBearrd: boolean;
  femaleHairShort: boolean;
  name: string;
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const classIcon = selectedClass === "warrior" ? "⚔" : "🔮";
  const classLabel = selectedClass === "warrior" ? "Warrior" : "Mage";
  const classColor = selectedClass === "warrior" ? WARRIOR_COLOR : MAGE_COLOR;

  const allStyles = [
    ...WARRIOR_MALE_STYLES,
    ...WARRIOR_FEMALE_STYLES,
    ...MAGE_MALE_STYLES,
    ...MAGE_FEMALE_STYLES,
  ];
  const styleLabel =
    allStyles.find((s) => s.value === selectedStyle)?.label ?? selectedStyle;

  const weaponLabel =
    selectedClass === "warrior"
      ? warriorWeapon === "axe"
        ? "⚔ Axe"
        : "⚔ Sword"
      : mageStaff === "short_wand"
        ? "✦ Short Wand"
        : "🔱 Long Staff";

  const extraLabel =
    selectedGender === "male" && selectedClass === "warrior" && hasBearrd
      ? "With Beard"
      : selectedGender === "female" && femaleHairShort
        ? "Short Hair"
        : selectedGender === "female"
          ? "Long Hair"
          : "No Beard";

  return (
    <div
      data-ocid="char-creation.step5"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontWeight: 900,
          fontSize: "clamp(1rem, 3.5vw, 1.4rem)",
          textAlign: "center",
          color: "oklch(0.9 0 0)",
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        Ready to Begin?
      </h2>

      {/* Compact summary */}
      <div
        style={{
          background: "oklch(0.14 0.02 85 / 0.5)",
          border: `2px solid ${GOLD}66`,
          borderRadius: 10,
          padding: "14px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          boxShadow: `0 0 24px ${GOLD}22`,
          width: "100%",
          maxWidth: 300,
        }}
      >
        {/* Name */}
        <div
          style={{
            fontFamily: "var(--font-display), sans-serif",
            fontWeight: 900,
            fontSize: 20,
            color: GOLD,
            letterSpacing: "0.05em",
            textShadow: `0 0 12px ${GOLD}66`,
            textAlign: "center",
          }}
        >
          {name}
        </div>

        {/* Summary rows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            width: "100%",
          }}
        >
          {[
            {
              label: "Gender",
              value: `${selectedGender === "female" ? "♀" : "♂"} ${selectedGender === "male" ? "Male" : "Female"}`,
              color: "oklch(0.7 0 0)",
            },
            {
              label: "Class",
              value: `${classIcon} ${classLabel}`,
              color: classColor,
            },
            { label: "Style", value: styleLabel, color: "oklch(0.7 0 0)" },
            {
              label: "Weapon",
              value: weaponLabel,
              color: "oklch(0.75 0.12 55)",
            },
            { label: "Hair", value: extraLabel, color: "oklch(0.65 0 0)" },
            {
              label: "Spawn",
              value: "🌿 Meadow Hub",
              color: "oklch(0.65 0.12 145)",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 9,
                  color: "oklch(0.45 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 11,
                  color,
                  fontWeight: 700,
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p
        style={{
          fontFamily: "var(--font-body), sans-serif",
          fontSize: 11,
          color: "oklch(0.45 0 0)",
          textAlign: "center",
          margin: 0,
          maxWidth: 280,
        }}
      >
        Spawns at Meadow Hub. Customize appearance anytime from the in-game
        menu.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
          width: "100%",
          maxWidth: 300,
        }}
      >
        <GoldButton
          onClick={onConfirm}
          large
          data-ocid="char-creation.confirm-button"
        >
          ✦ Create Character
        </GoldButton>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onBack}
            data-ocid="char-creation.step5-back"
            style={{ ...BACK_BTN_STYLE, padding: "10px 18px" }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onCancel}
            data-ocid="char-creation.cancel-button-final"
            style={{
              padding: "10px 18px",
              background: "oklch(0.14 0 0)",
              border: "1px solid oklch(0.35 0.12 25 / 0.6)",
              color: "oklch(0.55 0.12 25)",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              borderRadius: 4,
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
