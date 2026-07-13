import { useCallback, useEffect, useRef, useState } from "react";
import { parseOutfitStyle } from "../lib/outfitEncoding";
import type {
  CharacterClass,
  HairColor,
  OutfitColor,
  OutfitStyle,
} from "../types/game";

// ─── Public CharacterSave type ────────────────────────────────────────────────

export interface CharacterSave {
  characterId: number;
  username: string;
  characterClass: CharacterClass;
  level: number;
  coins: number;
  /** Optional extended fields from canister */
  lastZone?: string;
  totalPlaytime?: number; // minutes
  lastLogin?: number; // unix timestamp ms
  deaths?: number;
  kills?: number;
  activeTitle?: string;
  equippedItems?: string[];
  outfitColor?: OutfitColor;
  outfitStyle?: OutfitStyle;
  hairColor?: HairColor;
  attack?: number;
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SLOTS = 3;

const CLASS_ICON: Record<CharacterClass, string> = {
  warrior: "⚔",
  mage: "✦",
};

const CLASS_LABEL: Record<CharacterClass, string> = {
  warrior: "Warrior",
  mage: "Mage",
};

const ZONE_LABELS: Record<string, string> = {
  meadow_hub: "Meadow Hub",
  aurelion: "Aurelion",
  wilderness: "Wilderness",
  forest_depths: "Forest Depths",
  wolf_forest: "Wolf Forest",
  dark_forest: "Dark Forest",
  ancient_ruins: "Ancient Ruins",
  ancient_ruins_deep: "Ancient Ruins",
  cave_interior: "Cave Interior",
  boss_chamber: "Boss Chamber",
  cursed_swamp: "Cursed Swamp",
  floating_ruins: "Floating Ruins",
  pirate_island: "Pirate Island",
  cursed_galleon: "Cursed Galleon",
};

function zoneLabel(zone?: string): string {
  if (!zone) return "Meadow Hub";
  return ZONE_LABELS[zone] ?? zone;
}

function formatLastLogin(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatPlaytime(minutes?: number): string {
  if (!minutes || minutes <= 0) return "0h";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function computeStats(char: CharacterSave) {
  const level = char.level ?? 1;
  const isWarrior = char.characterClass === "warrior";
  const baseHp = isWarrior ? 120 : 80;
  const baseMp = isWarrior ? 40 : 100;
  const baseAtk = isWarrior ? 18 : 14;
  const baseDef = isWarrior ? 12 : 6;
  const baseSpd = isWarrior ? 4 : 7;
  return {
    hp: char.hp ?? Math.round(baseHp * (1 + (level - 1) * 0.1)),
    mp:
      char.mp ??
      Math.round(baseMp * (1 + (level - 1) * (isWarrior ? 0.02 : 0.1))),
    attack: char.attack ?? Math.round(baseAtk * (1 + (level - 1) * 0.05)),
    def: Math.round(baseDef * (1 + (level - 1) * 0.04)),
    spd: baseSpd,
  };
}

// ─── Keyframe injection ─────────────────────────────────────────────────────────

const _injectStyles = (() => {
  let injected = false;
  return () => {
    if (injected || typeof document === "undefined") return;
    injected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pq-shimmer {
        0% { transform: translateX(-100%) skewX(-15deg); }
        100% { transform: translateX(300%) skewX(-15deg); }
      }
      @keyframes pq-class-pulse {
        0%, 100% { opacity: 0.55; box-shadow: 0 0 6px var(--pq-accent-color, #FF8832); }
        50% { opacity: 1; box-shadow: 0 0 18px var(--pq-accent-color, #FF8832), 0 0 32px var(--pq-accent-color, #FF8832); }
      }
      @keyframes pq-enter-world-pulse {
        0%, 100% { box-shadow: 0 0 12px rgba(255,215,0,0.15), 0 0 24px rgba(80,200,80,0.1), inset 0 1px 0 rgba(255,255,255,0.1); }
        50% { box-shadow: 0 0 28px rgba(255,215,0,0.45), 0 0 50px rgba(80,200,80,0.25), inset 0 1px 0 rgba(255,255,255,0.15); }
      }
      @keyframes pq-plus-pulse {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(1.25); }
      }
      @keyframes pq-dash-march {
        to { stroke-dashoffset: -20; }
      }
      @keyframes pq-slot-glow {
        0%, 100% { border-color: rgba(255,255,255,0.12); box-shadow: none; }
        50% { border-color: rgba(255,215,0,0.35); box-shadow: 0 0 12px rgba(255,215,0,0.12); }
      }
      @keyframes pq-badge-shimmer {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.3); }
      }
    `;
    document.head.appendChild(style);
  };
})();

// ─── Sprite renderer (ported from CustomizationPanel) ─────────────────────────

const SPRITE_SIZE = 80;

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

function drawCharSprite(
  ctx: CanvasRenderingContext2D,
  cls: CharacterClass,
  style: OutfitStyle,
  outfit: OutfitColor,
  hair: HairColor,
): void {
  const s = SPRITE_SIZE / 56;
  const W = SPRITE_SIZE;
  const H = SPRITE_SIZE;
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
    // Mage
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
      Math.round(16 * s),
      Math.round(22 * s),
      Math.round(32 * s),
    );
    ctx.fillStyle = `${hi}22`;
    ctx.fillRect(
      Math.round(10 * s),
      Math.round(17 * s),
      Math.round(20 * s),
      Math.round(4 * s),
    );
    ctx.fillStyle = skin;
    ctx.fillRect(
      Math.round(14 * s),
      Math.round(8 * s),
      Math.round(12 * s),
      Math.round(9 * s),
    );
    ctx.fillStyle = dark;
    ctx.fillRect(
      Math.round(16 * s),
      Math.round(12 * s),
      Math.round(3 * s),
      Math.round(2 * s),
    );
    ctx.fillRect(
      Math.round(21 * s),
      Math.round(12 * s),
      Math.round(3 * s),
      Math.round(2 * s),
    );
    if (style === "mage_A") {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(
        Math.round(10 * s),
        Math.round(1 * s),
        Math.round(20 * s),
        Math.round(10 * s),
      );
      ctx.fillRect(
        Math.round(17 * s),
        Math.round(-1 * s),
        Math.round(6 * s),
        Math.round(4 * s),
      );
    } else if (style === "mage_B") {
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(
        Math.round(12 * s),
        Math.round(7 * s),
        Math.round(16 * s),
        Math.round(3 * s),
      );
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(11 * s),
        Math.round(5 * s),
        Math.round(18 * s),
        Math.round(4 * s),
      );
    } else {
      ctx.fillStyle = dark;
      ctx.fillRect(
        Math.round(10 * s),
        Math.round(1 * s),
        Math.round(20 * s),
        Math.round(10 * s),
      );
      ctx.fillStyle = hairFill.main;
      ctx.fillRect(
        Math.round(13 * s),
        Math.round(7 * s),
        Math.round(14 * s),
        Math.round(3 * s),
      );
    }
    // Staff
    ctx.fillStyle = "#886633";
    ctx.fillRect(
      Math.round(34 * s),
      Math.round(4 * s),
      Math.round(2 * s),
      Math.round(38 * s),
    );
    ctx.fillStyle = "#00CCFF";
    ctx.fillRect(
      Math.round(32 * s),
      Math.round(2 * s),
      Math.round(6 * s),
      Math.round(6 * s),
    );
  }

  // Shadow under feet
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(
    Math.round(20 * s),
    Math.round(51 * s),
    Math.round(12 * s),
    Math.round(3 * s),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

// ─── Parallax background canvas (warrior/mage themed) ─────────────────────────

function ClassBackgroundCanvas({ cls }: { cls: CharacterClass }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 320;
    canvas.height = 380;

    function draw() {
      if (!ctx) return;
      timeRef.current += 0.016;
      const t = timeRef.current;
      ctx.clearRect(0, 0, 320, 380);

      if (cls === "warrior") {
        // Stone hall bg — warm orange/brown tones
        const bg = ctx.createLinearGradient(0, 0, 0, 380);
        bg.addColorStop(0, "#1A0F07");
        bg.addColorStop(1, "#2C1810");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 320, 380);

        // Stone wall blocks
        ctx.fillStyle = "#2A1E14";
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 5; col++) {
            const offset = row % 2 === 0 ? 0 : 30;
            ctx.fillRect(col * 60 + offset - 30, row * 62, 56, 58);
          }
        }
        // Stone mortar lines
        ctx.strokeStyle = "#1A1208";
        ctx.lineWidth = 2;
        for (let row = 0; row < 7; row++) {
          ctx.beginPath();
          ctx.moveTo(0, row * 62);
          ctx.lineTo(320, row * 62);
          ctx.stroke();
        }

        // Torch lights — 2 torches
        const torches = [
          { x: 40, y: 120 },
          { x: 280, y: 120 },
        ];
        for (const torch of torches) {
          // torch body
          ctx.fillStyle = "#886633";
          ctx.fillRect(torch.x - 3, torch.y, 6, 20);
          ctx.fillStyle = "#CC4400";
          ctx.fillRect(torch.x - 4, torch.y - 6, 8, 8);

          // flame flicker
          const flicker = Math.sin(t * 4 + torch.x) * 0.15 + 0.85;
          const grd = ctx.createRadialGradient(
            torch.x,
            torch.y - 2,
            1,
            torch.x,
            torch.y + 8,
            70,
          );
          grd.addColorStop(0, `rgba(255,180,60,${0.55 * flicker})`);
          grd.addColorStop(0.3, `rgba(255,120,20,${0.25 * flicker})`);
          grd.addColorStop(1, "rgba(255,80,0,0)");
          ctx.fillStyle = grd;
          ctx.fillRect(torch.x - 70, torch.y - 70, 140, 140);
        }

        // Floor
        const floorGrd = ctx.createLinearGradient(0, 300, 0, 380);
        floorGrd.addColorStop(0, "#3C2818");
        floorGrd.addColorStop(1, "#4A3020");
        ctx.fillStyle = floorGrd;
        ctx.fillRect(0, 300, 320, 80);

        // Floor tiles
        ctx.strokeStyle = "#2A1E10";
        ctx.lineWidth = 1;
        for (let col = 0; col < 7; col++) {
          ctx.beginPath();
          ctx.moveTo(col * 48, 300);
          ctx.lineTo(col * 48, 380);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, 340);
        ctx.lineTo(320, 340);
        ctx.stroke();

        // Ambient warm fog at floor
        const fogGrd = ctx.createLinearGradient(0, 280, 0, 380);
        fogGrd.addColorStop(0, "rgba(80,40,10,0)");
        fogGrd.addColorStop(1, "rgba(80,40,10,0.3)");
        ctx.fillStyle = fogGrd;
        ctx.fillRect(0, 280, 320, 100);
      } else {
        // Arcane library — purple/blue magical
        const bg = ctx.createLinearGradient(0, 0, 0, 380);
        bg.addColorStop(0, "#070A1A");
        bg.addColorStop(1, "#0D0820");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 320, 380);

        // Bookshelf silhouettes
        ctx.fillStyle = "#14103A";
        ctx.fillRect(0, 40, 55, 260);
        ctx.fillRect(265, 40, 55, 260);

        // Book spines
        const bookColors = [
          "#3A1A7A",
          "#1A3A7A",
          "#7A1A3A",
          "#1A7A3A",
          "#5A3A1A",
        ];
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 4; col++) {
            ctx.fillStyle = bookColors[(row * 4 + col) % bookColors.length]!;
            ctx.fillRect(col * 13 + 2, row * 28 + 50, 11, 24);
            ctx.fillRect(col * 13 + 267, row * 28 + 50, 11, 24);
          }
        }

        // Floating magical orbs
        const orbs = [
          { x: 80, y: 80, phase: 0 },
          { x: 240, y: 120, phase: 1.5 },
          { x: 160, y: 60, phase: 0.8 },
          { x: 60, y: 200, phase: 2.1 },
          { x: 260, y: 180, phase: 1.2 },
        ];
        for (const orb of orbs) {
          const orbY = orb.y + Math.sin(t * 1.5 + orb.phase) * 8;
          const alpha = 0.4 + Math.sin(t * 2 + orb.phase) * 0.2;
          const grd = ctx.createRadialGradient(orb.x, orbY, 2, orb.x, orbY, 20);
          grd.addColorStop(0, `rgba(160,120,255,${alpha + 0.3})`);
          grd.addColorStop(0.4, `rgba(80,40,200,${alpha})`);
          grd.addColorStop(1, "rgba(40,20,120,0)");
          ctx.fillStyle = grd;
          ctx.fillRect(orb.x - 20, orbY - 20, 40, 40);
          ctx.beginPath();
          ctx.arc(orb.x, orbY, 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(220,180,255,${alpha + 0.4})`;
          ctx.fill();
        }

        // Arcane circle on floor
        const cx = 160;
        const cy = 330;
        ctx.strokeStyle = `rgba(120,80,220,${0.3 + Math.sin(t * 1.2) * 0.1})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI * 2);
        ctx.stroke();
        // Rune marks
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + t * 0.3;
          const rx = cx + Math.cos(angle) * 60;
          const ry = cy + Math.sin(angle) * 60;
          ctx.fillStyle = `rgba(160,120,255,${0.5 + Math.sin(t + i) * 0.2})`;
          ctx.fillRect(rx - 2, ry - 2, 4, 4);
        }

        // Floating particles
        const pCount = 20;
        for (let i = 0; i < pCount; i++) {
          const px = (i * 137.5 + t * 15) % 320;
          const py = (i * 83.3 - t * 8 + 400) % 400;
          const a = 0.15 + Math.sin(t + i) * 0.1;
          ctx.fillStyle = `rgba(180,140,255,${a})`;
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }

        // Ambient purple glow from bookshelves
        const leftGrd = ctx.createRadialGradient(20, 200, 5, 20, 200, 80);
        leftGrd.addColorStop(0, "rgba(100,60,200,0.2)");
        leftGrd.addColorStop(1, "rgba(100,60,200,0)");
        ctx.fillStyle = leftGrd;
        ctx.fillRect(0, 100, 100, 200);
        const rightGrd = ctx.createRadialGradient(300, 200, 5, 300, 200, 80);
        rightGrd.addColorStop(0, "rgba(100,60,200,0.2)");
        rightGrd.addColorStop(1, "rgba(100,60,200,0)");
        ctx.fillStyle = rightGrd;
        ctx.fillRect(220, 100, 100, 200);

        // Floor
        const floorGrd = ctx.createLinearGradient(0, 300, 0, 380);
        floorGrd.addColorStop(0, "#160C30");
        floorGrd.addColorStop(1, "#0F0820");
        ctx.fillStyle = floorGrd;
        ctx.fillRect(0, 300, 320, 80);
      }

      // Bottom fade for blending with UI
      const fadeGrd = ctx.createLinearGradient(0, 280, 0, 380);
      fadeGrd.addColorStop(0, "rgba(0,0,0,0)");
      fadeGrd.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = fadeGrd;
      ctx.fillRect(0, 280, 320, 100);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cls]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Character background artwork"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }}
    />
  );
}

// ─── Sprite preview canvas with idle breathing ────────────────────────────────

function SpritePreviewCanvas({ char }: { char: CharacterSave }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  const cls = char.characterClass;
  const style: OutfitStyle =
    char.outfitStyle ?? (cls === "warrior" ? "warrior_A" : "mage_A");
  const outfit: OutfitColor = char.outfitColor ?? "default";
  const hair: HairColor = char.hairColor ?? "brown";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;

    function animate() {
      if (!ctx) return;
      timeRef.current += 0.02;
      const breathe = Math.sin(timeRef.current * 1.5) * 1.5;

      ctx.save();
      ctx.translate(0, breathe);
      drawCharSprite(ctx, cls, style, outfit, hair);
      ctx.restore();

      // Class glow aura
      const glowColor =
        cls === "warrior" ? "rgba(255,120,40," : "rgba(120,80,220,";
      const grd = ctx.createRadialGradient(
        SPRITE_SIZE / 2,
        SPRITE_SIZE * 0.7,
        2,
        SPRITE_SIZE / 2,
        SPRITE_SIZE * 0.7,
        SPRITE_SIZE * 0.55,
      );
      grd.addColorStop(0, `${glowColor}0.15)`);
      grd.addColorStop(1, `${glowColor}0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cls, style, outfit, hair]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Character sprite preview"
      style={{
        width: SPRITE_SIZE * 2.5,
        height: SPRITE_SIZE * 2.5,
        imageRendering: "pixelated",
        filter: `drop-shadow(0 0 12px ${cls === "warrior" ? "rgba(255,150,50,0.7)" : "rgba(140,100,255,0.7)"})`,
      }}
    />
  );
}

// ─── StatRow ──────────────────────────────────────────────────────────────────

function StatBar({
  value,
  max,
  color,
}: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      style={{
        flex: 1,
        height: 5,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 3,
        overflow: "hidden",
        maxWidth: 56,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  color,
  barColor,
  barMax,
}: {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
  barColor?: string;
  barMax?: number;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}
    >
      <span style={{ fontSize: 16, minWidth: 22, textAlign: "center" }}>
        {icon}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "oklch(0.55 0 0)",
          flex: 1,
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      {barColor && barMax !== undefined && typeof value === "number" && (
        <StatBar value={value} max={barMax} color={barColor} />
      )}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 700,
          color: color ?? "oklch(0.85 0 0)",
          letterSpacing: "0.02em",
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── EquippedItemBadge ────────────────────────────────────────────────────────

const ITEM_ICONS: Record<string, string> = {
  sword_basic: "⚔",
  staff_basic: "✦",
  leather_armor: "🛡",
  cloth_robe: "👘",
  iron_shield: "🔰",
  large_health_potion: "🍶",
  mana_crystal: "💎",
  warrior_emblem: "🏅",
  mage_focus: "🔮",
};

function EquippedItemBadge({ item }: { item: string }) {
  const icon = ITEM_ICONS[item] ?? "📦";
  return (
    <div
      title={item.replace(/_/g, " ")}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,215,0,0.08)",
        border: "1px solid rgba(255,215,0,0.25)",
        borderRadius: 4,
        fontSize: 16,
        cursor: "default",
      }}
    >
      {icon}
    </div>
  );
}

// ─── Particle overlay canvas (behind sprite) ────────────────────────────────

function ParticleCanvas({ cls }: { cls: CharacterClass }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);
  const particlesRef = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      alpha: number;
      size: number;
      hue: number;
    }>
  >([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = SPRITE_SIZE * 2.5;
    const H = SPRITE_SIZE * 2.5;
    canvas.width = W;
    canvas.height = H;

    const MAX_P = 6;
    particlesRef.current = [];

    function spawnParticle() {
      if (particlesRef.current.length >= MAX_P) return;
      if (cls === "mage") {
        particlesRef.current.push({
          x: W * 0.2 + Math.random() * W * 0.6,
          y: H * 0.8 + Math.random() * H * 0.15,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -(0.5 + Math.random() * 0.7),
          alpha: 0.7 + Math.random() * 0.3,
          size: 2 + Math.random() * 3,
          hue: 260 + Math.random() * 60, // purple-blue range
        });
      } else {
        particlesRef.current.push({
          x: W * 0.25 + Math.random() * W * 0.5,
          y: H * 0.75 + Math.random() * H * 0.15,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(0.3 + Math.random() * 0.5),
          alpha: 0.8 + Math.random() * 0.2,
          size: 1.5 + Math.random() * 2.5,
          hue: 20 + Math.random() * 30, // orange-ember range
        });
      }
    }

    let frameCount = 0;
    function draw() {
      if (!ctx) return;
      timeRef.current += 0.016;
      frameCount++;

      // Spawn occasionally (every ~30 frames)
      if (frameCount % 30 === 0) spawnParticle();

      ctx.clearRect(0, 0, W, H);

      const alive: typeof particlesRef.current = [];
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= cls === "mage" ? 0.006 : 0.01;
        if (p.alpha <= 0) continue;
        alive.push(p);

        if (cls === "mage") {
          // sparkle star shape
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = `hsl(${p.hue}, 80%, 75%)`;
          ctx.shadowColor = `hsl(${p.hue}, 90%, 70%)`;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // cross sparkle
          ctx.fillRect(p.x - 0.5, p.y - p.size * 1.8, 1, p.size * 3.6);
          ctx.fillRect(p.x - p.size * 1.8, p.y - 0.5, p.size * 3.6, 1);
          ctx.restore();
        } else {
          // ember flicker
          ctx.save();
          ctx.globalAlpha = p.alpha;
          const grad = ctx.createRadialGradient(
            p.x,
            p.y,
            0,
            p.x,
            p.y,
            p.size * 1.5,
          );
          grad.addColorStop(0, `hsl(${p.hue + 20}, 100%, 90%)`);
          grad.addColorStop(0.5, `hsl(${p.hue}, 90%, 60%)`);
          grad.addColorStop(1, `hsla(${p.hue - 10}, 80%, 40%, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      particlesRef.current = alive;

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cls]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: SPRITE_SIZE * 2.5,
        height: SPRITE_SIZE * 2.5,
        pointerEvents: "none",
        imageRendering: "pixelated",
      }}
    />
  );
}

// ─── CharacterSlotCard ────────────────────────────────────────────────────────

function CharacterSlotCard({
  char,
  isSelected,
  onSelect,
  index,
}: {
  char: CharacterSave;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  _injectStyles();
  const isWarrior = char.characterClass === "warrior";
  const accentRgb = isWarrior ? "255,120,50" : "130,80,255";
  const gradientBadge = isWarrior
    ? "linear-gradient(135deg, #cc2200, #ff6622)"
    : "linear-gradient(135deg, #6622aa, #2244ff)";
  // Decode gender from outfitStyle — defaults to male for backward compat
  const parsedGender = char.outfitStyle
    ? parseOutfitStyle(char.outfitStyle).gender
    : "male";
  const genderIcon = parsedGender === "female" ? "♀" : "♂";
  const lastLoginStr = formatLastLogin(char.lastLogin);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-ocid={`char-slot.item.${index + 1}`}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        background: isSelected
          ? `rgba(${accentRgb},0.07)`
          : "rgba(20,15,10,0.6)",
        border: isSelected
          ? `2px solid rgba(${accentRgb},0.8)`
          : "2px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: isSelected
          ? `0 0 18px rgba(${accentRgb},0.22), inset 0 0 10px rgba(${accentRgb},0.04)`
          : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated shimmer sweep on selected border */}
      {isSelected && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            borderRadius: 6,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "-20%",
              width: "40%",
              height: "100%",
              background: `linear-gradient(90deg, transparent, rgba(${accentRgb},0.25), rgba(255,255,255,0.18), rgba(${accentRgb},0.25), transparent)`,
              animation: "pq-shimmer 2.4s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* Selected accent bar */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(180deg, rgba(${accentRgb},0.9), rgba(${accentRgb},0.3))`,
            borderRadius: "8px 0 0 8px",
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Class badge */}
        <div
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: gradientBadge,
            border: `1.5px solid rgba(${accentRgb},0.4)`,
            borderRadius: 6,
            fontSize: 20,
            boxShadow: `0 2px 8px rgba(${accentRgb},0.3)`,
          }}
        >
          {CLASS_ICON[char.characterClass]}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + level */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
            }}
          >
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                color: isSelected ? `rgb(${accentRgb})` : "oklch(0.90 0 0)",
                letterSpacing: "0.01em",
                overflow: "hidden",
                textOverflow: "clip",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {char.username}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                color: isSelected ? `rgb(${accentRgb})` : "oklch(0.60 0.18 55)",
                background: `rgba(${accentRgb},0.1)`,
                border: `1px solid rgba(${accentRgb},0.2)`,
                borderRadius: 3,
                padding: "1px 5px",
                flexShrink: 0,
              }}
            >
              Lv.{char.level}
            </span>
          </div>

          {/* Class badge label + gender */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <span
              style={{
                fontSize: 11,
                padding: "1px 7px",
                borderRadius: 20,
                background: gradientBadge,
                color: "#fff",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.08em",
                fontWeight: 700,
                boxShadow: `0 1px 6px rgba(${accentRgb},0.4)`,
              }}
            >
              {CLASS_LABEL[char.characterClass].toUpperCase()}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "oklch(0.55 0 0)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
              title={parsedGender === "female" ? "Female" : "Male"}
            >
              {genderIcon}
            </span>
          </div>

          {/* Last login — prominent */}
          {lastLoginStr && (
            <div
              style={{
                marginTop: 3,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: `rgba(${accentRgb},0.75)`,
                letterSpacing: "0.05em",
              }}
            >
              🕐 {lastLoginStr}
            </div>
          )}

          {/* Zone + playtime */}
          <div
            style={{ display: "flex", gap: 8, marginTop: lastLoginStr ? 2 : 4 }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "oklch(0.45 0 0)",
              }}
            >
              📍 {zoneLabel(char.lastZone)}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "oklch(0.45 0 0)",
              }}
            >
              ⏱ {formatPlaytime(char.totalPlaytime)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── EmptySlotCard ────────────────────────────────────────────────────────────

function EmptySlotCard({
  onSelect,
  disabled,
  index,
}: { onSelect: () => void; disabled: boolean; index: number }) {
  _injectStyles();
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      data-ocid={`char-slot-empty.item.${index + 1}`}
      style={{
        width: "100%",
        padding: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "rgba(255,255,255,0.02)",
        border: "1.5px dashed rgba(255,215,0,0.18)",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "all 0.25s ease",
        color: "oklch(0.50 0 0)",
        animation: disabled ? "none" : "pq-slot-glow 2.8s ease-in-out infinite",
      }}
    >
      <span
        style={{
          fontSize: 20,
          display: "inline-block",
          animation: disabled
            ? "none"
            : "pq-plus-pulse 2s ease-in-out infinite",
        }}
      >
        ＋
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          letterSpacing: "0.08em",
        }}
      >
        Create New Character
      </span>
    </button>
  );
}

// ─── Delete Character Modal ───────────────────────────────────────────────────

function DeleteModal({
  charName,
  onConfirm,
  onCancel,
}: {
  charName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed === charName;

  return (
    <dialog
      open
      data-ocid="delete-char-dialog"
      aria-label="Delete character"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        border: "none",
        maxWidth: "100vw",
        maxHeight: "100vh",
        width: "100%",
        height: "100%",
        margin: 0,
      }}
    >
      <div
        style={{
          background: "#0E0A18",
          border: "2px solid rgba(220,40,40,0.5)",
          borderRadius: 10,
          padding: 24,
          maxWidth: 340,
          width: "100%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
        }}
      >
        <h2
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            color: "#FF4444",
            marginBottom: 8,
            letterSpacing: "0.04em",
          }}
        >
          Delete Character
        </h2>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: "oklch(0.60 0 0)",
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          This action is <strong style={{ color: "#FF6666" }}>permanent</strong>{" "}
          and cannot be undone. Type{" "}
          <strong style={{ color: "oklch(0.85 0 0)" }}>{charName}</strong> to
          confirm.
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type character name..."
          data-ocid="delete-char-input"
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "rgba(255,255,255,0.04)",
            border: `1.5px solid ${confirmed ? "rgba(220,40,40,0.6)" : "rgba(255,255,255,0.12)"}`,
            borderRadius: 6,
            color: "oklch(0.90 0 0)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            outline: "none",
            transition: "border-color 0.2s",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            data-ocid="delete-char-dialog.cancel_button"
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 6,
              background: "rgba(255,255,255,0.05)",
              border: "1.5px solid rgba(255,255,255,0.12)",
              color: "oklch(0.70 0 0)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.06em",
              transition: "all 0.15s ease",
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={confirmed ? onConfirm : undefined}
            disabled={!confirmed}
            data-ocid="delete-char-dialog.confirm_button"
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 6,
              background: confirmed
                ? "rgba(200,30,30,0.7)"
                : "rgba(80,20,20,0.3)",
              border: `1.5px solid ${confirmed ? "rgba(220,50,50,0.7)" : "rgba(100,30,30,0.3)"}`,
              color: confirmed ? "#FFB0B0" : "oklch(0.40 0 0)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 700,
              cursor: confirmed ? "pointer" : "not-allowed",
              letterSpacing: "0.06em",
              transition: "all 0.15s ease",
            }}
          >
            DELETE
          </button>
        </div>
      </div>
    </dialog>
  );
}

function CharacterPreviewPanel({
  char,
  onEnterWorld,
  onDeleteRequest,
}: {
  char: CharacterSave | null;
  onEnterWorld: () => void;
  onDeleteRequest: () => void;
}) {
  const stats = char ? computeStats(char) : null;
  const isWarrior = char?.characterClass === "warrior";
  const accentColor = isWarrior ? "#FF8832" : "#9060FF";
  const glowRgba = isWarrior
    ? "rgba(255,136,50,0.35)"
    : "rgba(144,96,255,0.35)";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "rgba(8,5,20,0.85)",
        borderLeft: `2px solid ${char ? `${accentColor}88` : "rgba(255,215,0,0.10)"}`,
        animation: char ? "pq-class-pulse 2.5s ease-in-out infinite" : "none",
        ["--pq-accent-color" as string]: accentColor,
        boxShadow: char
          ? `inset -2px 0 20px rgba(0,0,0,0.4), -2px 0 16px ${glowRgba}`
          : "none",
        position: "relative",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* Class-specific background art */}
      {char && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <ClassBackgroundCanvas cls={char.characterClass} />
        </div>
      )}

      {/* Empty state */}
      {!char && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
            color: "oklch(0.35 0 0)",
            gap: 12,
          }}
          data-ocid="char-preview.empty_state"
        >
          <span style={{ fontSize: 48 }}>⚔</span>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.1em",
            }}
          >
            SELECT A CHARACTER
          </p>
        </div>
      )}

      {/* Character content */}
      {char && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "16px 16px 12px",
          }}
        >
          {/* Sprite area */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            {/* Active title */}
            {char.activeTitle && (
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#FFD700",
                  background: "rgba(255,215,0,0.08)",
                  border: "1px solid rgba(255,215,0,0.25)",
                  borderRadius: 3,
                  padding: "2px 8px",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                  textTransform: "capitalize",
                }}
                data-ocid="char-preview.active-title"
              >
                [{char.activeTitle.replace(/_/g, " ")}]
              </div>
            )}

            {/* Character sprite with particle canvas overlay */}
            <div
              style={{
                position: "relative",
                filter: `drop-shadow(0 4px 24px ${glowRgba})`,
              }}
            >
              <ParticleCanvas cls={char.characterClass} />
              <SpritePreviewCanvas char={char} />
            </div>

            {/* Character name */}
            <div style={{ marginTop: 8, textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#FFFFFF",
                  letterSpacing: "0.04em",
                  textShadow: `0 0 20px ${glowRgba}`,
                }}
              >
                {char.username}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 3,
                }}
              >
                <span style={{ fontSize: 14, color: accentColor }}>
                  {CLASS_ICON[char.characterClass]}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: accentColor,
                    letterSpacing: "0.08em",
                  }}
                >
                  Level {char.level} {CLASS_LABEL[char.characterClass]}
                </span>
              </div>
            </div>
          </div>

          {/* Stats section */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "10px 12px",
              marginTop: 8,
            }}
            data-ocid="char-preview.stats-panel"
          >
            <StatRow
              icon="⚔"
              label="Attack"
              value={stats!.attack}
              color="#FFD080"
              barColor="linear-gradient(90deg, #cc6600, #ffcc00)"
              barMax={Math.max(50, stats!.attack * 3)}
            />
            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.04)",
                margin: "4px 0",
              }}
            />
            <StatRow
              icon="❤"
              label="HP"
              value={stats!.hp}
              color="#FF8080"
              barColor="linear-gradient(90deg, #cc2222, #ff6666)"
              barMax={Math.max(150, stats!.hp * 1.5)}
            />
            <StatRow
              icon="💧"
              label="MP"
              value={stats!.mp}
              color="#80AAFF"
              barColor="linear-gradient(90deg, #2244cc, #66aaff)"
              barMax={Math.max(120, stats!.mp * 1.5)}
            />
            <StatRow
              icon="🛡"
              label="DEF"
              value={stats!.def}
              color="#88CCFF"
              barColor="linear-gradient(90deg, #2266aa, #55aadd)"
              barMax={Math.max(30, stats!.def * 3)}
            />
            <StatRow
              icon="💨"
              label="Speed"
              value={stats!.spd}
              color="#AAFFCC"
              barColor="linear-gradient(90deg, #228855, #44ffaa)"
              barMax={10}
            />
            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.04)",
                margin: "4px 0",
              }}
            />
            <StatRow
              icon="🏆"
              label="Kills"
              value={char.kills ?? 0}
              color="#FFD700"
            />
            <StatRow
              icon="💀"
              label="Deaths"
              value={char.deaths ?? 0}
              color="oklch(0.55 0 0)"
            />
            <StatRow
              icon="⏱"
              label="Playtime"
              value={formatPlaytime(char.totalPlaytime)}
              color="oklch(0.65 0 0)"
            />

            {/* Equipped items */}
            {char.equippedItems && char.equippedItems.length > 0 && (
              <>
                <div
                  style={{
                    height: 1,
                    background: "rgba(255,255,255,0.04)",
                    margin: "6px 0 8px",
                  }}
                />
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: "oklch(0.45 0 0)",
                    letterSpacing: "0.1em",
                    marginBottom: 6,
                    textTransform: "uppercase",
                  }}
                >
                  Equipped
                </div>
                <div
                  style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                  data-ocid="char-preview.equipped-items"
                >
                  {char.equippedItems.map((item) => (
                    <EquippedItemBadge key={item} item={item} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bottom buttons */}
          <div
            style={{
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onEnterWorld}
              data-ocid="char-preview.enter-world-btn"
              style={{
                width: "100%",
                padding: "14px",
                background:
                  "linear-gradient(135deg, rgba(40,160,60,0.75), rgba(20,120,40,0.75))",
                border: "2px solid rgba(255,215,0,0.6)",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 16,
                fontWeight: 800,
                color: "#FFE880",
                letterSpacing: "0.06em",
                textShadow: "0 0 12px rgba(255,215,0,0.5)",
                animation: "pq-enter-world-pulse 2s ease-in-out infinite",
                transition: "transform 0.15s ease",
                textTransform: "uppercase",
              }}
            >
              ⚡ Enter World
            </button>

            <button
              type="button"
              onClick={onDeleteRequest}
              data-ocid="char-preview.delete-char-btn"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "rgba(200,60,60,0.6)",
                letterSpacing: "0.06em",
                transition: "color 0.15s ease",
                textAlign: "center",
                width: "100%",
              }}
            >
              Delete Character
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CharacterSelectScreen (main export) ──────────────────────────────────────

export interface CharacterSelectScreenProps {
  characters: CharacterSave[];
  onSelect: (char: CharacterSave) => void;
  onCreateNew: () => void;
  onLogout: () => void;
  onSettings: () => void;
  username: string;
  isLoading?: boolean;
  onDeleteCharacter?: (characterId: number) => void;
}

export function CharacterSelectScreen({
  characters,
  onSelect,
  onCreateNew,
  onLogout,
  onSettings,
  username,
  isLoading = false,
  onDeleteCharacter,
}: CharacterSelectScreenProps) {
  const maxReached = characters.length >= MAX_SLOTS;
  const [selectedId, setSelectedId] = useState<number | null>(
    characters.length > 0 ? characters[0]!.characterId : null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CharacterSave | null>(null);
  const [fadeIn, setFadeIn] = useState(false);

  // Update selectedId when characters change (e.g. after loading)
  useEffect(() => {
    if (characters.length > 0 && selectedId === null) {
      setSelectedId(characters[0]!.characterId);
    }
  }, [characters, selectedId]);

  // Fade-in animation on mount
  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 30);
    return () => clearTimeout(t);
  }, []);

  const selectedChar =
    characters.find((c) => c.characterId === selectedId) ?? null;

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    if (onDeleteCharacter) {
      onDeleteCharacter(deleteTarget.characterId);
    }
    if (selectedId === deleteTarget.characterId) {
      const remaining = characters.filter(
        (c) => c.characterId !== deleteTarget.characterId,
      );
      setSelectedId(remaining.length > 0 ? remaining[0]!.characterId : null);
    }
    setDeleteTarget(null);
  }, [deleteTarget, onDeleteCharacter, characters, selectedId]);

  const handleEnterWorld = useCallback(() => {
    if (selectedChar) {
      onSelect(selectedChar);
    }
  }, [selectedChar, onSelect]);

  return (
    <div
      data-ocid="character-select-screen"
      style={{
        position: "fixed",
        inset: 0,
        background: "#070410",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: fadeIn ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
    >
      {/* Background gradient */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(80,40,160,0.18) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 10px",
          borderBottom: "1px solid rgba(255,215,0,0.12)",
          background: "rgba(10,6,25,0.9)",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 18,
              filter: "drop-shadow(0 0 6px rgba(255,215,0,0.7))",
            }}
          >
            ⚔
          </span>
          <div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 15,
                fontWeight: 800,
                color: "#FFD700",
                letterSpacing: "0.12em",
                textShadow: "0 0 14px rgba(255,215,0,0.4)",
              }}
            >
              PIXEL QUEST
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: "oklch(0.45 0 0)",
                letterSpacing: "0.15em",
              }}
            >
              SELECT CHARACTER
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onSettings}
            data-ocid="char-select.settings-btn"
            aria-label="Settings"
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.05)",
              border: "1.5px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 18,
              color: "oklch(0.65 0 0)",
              transition: "all 0.15s ease",
            }}
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={onLogout}
            data-ocid="char-select.logout-btn"
            style={{
              height: 40,
              padding: "0 14px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(200,40,40,0.12)",
              border: "1.5px solid rgba(200,40,40,0.30)",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(230,100,100,0.9)",
              letterSpacing: "0.06em",
              transition: "all 0.15s ease",
            }}
          >
            <span>⏻</span> Logout
          </button>
        </div>
      </div>

      {/* Welcome bar */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "8px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(255,215,0,0.04)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "oklch(0.55 0 0)",
            letterSpacing: "0.08em",
          }}
        >
          Welcome back,{" "}
          <span style={{ color: "#FFD700", fontWeight: 700 }}>{username}</span>{" "}
          — {characters.length}/{MAX_SLOTS} character
          {characters.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Main layout: left panel + right panel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* LEFT PANEL — character list */}
        <div
          data-ocid="char-slot-list"
          style={{
            width: "min(300px, 45%)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: "rgba(8,5,18,0.92)",
            borderRight: "1px solid rgba(255,215,0,0.10)",
            overflowY: "auto",
            padding: "12px 10px",
            gap: 8,
          }}
        >
          {/* Loading state */}
          {isLoading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                gap: 8,
              }}
              data-ocid="char-list.loading_state"
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: "oklch(0.45 0 0)",
                  letterSpacing: "0.1em",
                  animation: "pq-pulse 1.2s ease-in-out infinite",
                }}
              >
                Loading characters…
              </span>
            </div>
          )}

          {/* Character slots */}
          {!isLoading &&
            characters.map((char, i) => (
              <CharacterSlotCard
                key={char.characterId}
                char={char}
                isSelected={char.characterId === selectedId}
                onSelect={() => setSelectedId(char.characterId)}
                index={i}
              />
            ))}

          {/* Empty slots */}
          {!isLoading &&
            Array.from(
              { length: Math.max(0, MAX_SLOTS - characters.length) },
              (_, i) => characters.length + i,
            ).map((slotIdx) => (
              <EmptySlotCard
                key={`empty-${slotIdx}`}
                onSelect={onCreateNew}
                disabled={maxReached}
                index={slotIdx}
              />
            ))}

          {/* Bottom spacer */}
          <div style={{ flex: 1 }} />

          {/* Section label */}
          <div
            style={{
              paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: "oklch(0.32 0 0)",
                letterSpacing: "0.12em",
                textAlign: "center",
                textTransform: "uppercase",
              }}
            >
              Tap a character to preview
            </p>
          </div>
        </div>

        {/* RIGHT PANEL — preview */}
        <CharacterPreviewPanel
          char={selectedChar}
          onEnterWorld={handleEnterWorld}
          onDeleteRequest={() => selectedChar && setDeleteTarget(selectedChar)}
        />
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          charName={deleteTarget.username}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
