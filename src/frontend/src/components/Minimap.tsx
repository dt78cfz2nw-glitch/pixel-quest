import { useEffect, useRef } from "react";
import { ZONE_TRANSITIONS } from "../lib/world";
import type {
  FacingDirection,
  MonsterEntity,
  TileTypeValue,
  ZoneId,
} from "../types/game";
import { TileType } from "../types/game";

// ─── Minimap palette ──────────────────────────────────────────────────────────

const MINIMAP_COLORS: Record<TileTypeValue, string> = {
  [TileType.GRASS]: "#5a9450",
  [TileType.FLOWER]: "#6aaa5a",
  [TileType.PATH]: "#c8a870",
  [TileType.TOWN_PATH]: "#d4b888",
  [TileType.TOWN_FLOOR]: "#c0a070",
  [TileType.INTERIOR_FLOOR]: "#c4a878",
  [TileType.STONE]: "#7a7a7a",
  [TileType.DUNGEON_FLOOR]: "#454560",
  [TileType.WALL]: "#1a1a2a",
  [TileType.TOWN_WALL]: "#3a3048",
  [TileType.BUILDING]: "#4a3040",
  [TileType.TREE]: "#1a3a18",
  [TileType.DEEP_FOREST]: "#0e2010",
  [TileType.WATER]: "#2266cc",
  [TileType.RIVER]: "#2277dd",
  [TileType.POND]: "#1a55bb",
  [TileType.CRYSTAL]: "#5522aa",
  [TileType.INTERIOR_WALL]: "#4a3328",
  [TileType.DUNGEON_WALL]: "#101020",
  [TileType.LANTERN]: "#ffcc44",
  [TileType.BENCH]: "#8b6914",
  [TileType.FENCE]: "#8b6914",
  // Zone transition tiles — overridden below with type-aware colors
  [TileType.PORTAL]: "#ff44ff",
  [TileType.DOOR]: "#ff8833",
  [TileType.STAIR]: "#ffaa22",
  [TileType.STAIR_UP]: "#44dd88",
  [TileType.CAVE_FLOOR]: "#4a2e1a",
  [TileType.CAVE_WALL]: "#2a1808",
  [TileType.TRANSITION_MARKER]: "#aa66ff",
  [TileType.BEACH]: "#d4c070",
  [TileType.DEEP_WATER]: "#1144aa",
  [TileType.FOAM]: "#aaccff",
  [TileType.SWAMP_WATER]: "#2a4a1a",
  [TileType.STONE_PLATFORM]: "#8888aa",
  [TileType.RUNE_FLOOR]: "#6644cc",
  [TileType.VOID_DROP]: "#08080e",
  // ── Pirate Island / Bridge ──
  [TileType.BRIDGE]: "#c8a040",
  [TileType.SAND]: "#d4b060",
  [TileType.PALM_TREE]: "#1a4a10",
  // ── Cursed Galleon ──
  [TileType.WOOD_PLANK]: "#7b5e3a",
  [TileType.SHIP_RAIL]: "#3a2410",
  [TileType.SHIP_WATER]: "#1144aa",
  [TileType.CAPTAIN_FLOOR]: "#8b6845",
};

// ─── Zone name labels ─────────────────────────────────────────────────────────

const ZONE_LABELS: Record<ZoneId, string> = {
  meadow_hub: "MEADOW HUB",
  aurelion: "AURELION",
  wilderness: "WILDS",
  forest_depths: "FOREST",
  wolf_forest: "WOLF FOREST",
  tiger_jungle: "JUNGLE",
  bear_forest: "BEAR FOREST",
  ancient_ruins: "RUINS",
  crystal_ruins: "CRYSTAL",
  cyclops_lair: "CYCLOPS LAIR",
  goblin_warrens: "WARRENS",
  bat_cave: "BAT CAVE",
  deep_cave: "DEEP CAVE",
  hub_basement: "BASEMENT",
  wilderness_dungeon: "DUNGEON",
  forest_dungeon: "DUNGEON",
  dark_forest: "DARK FOREST",
  ancient_ruins_deep: "DEEP RUINS",
  cave_interior: "CAVE",
  boss_chamber: "BOSS CHAMBER",
  cursed_swamp: "CURSED SWAMP",
  floating_ruins: "FLOATING RUINS",
  pirate_island: "PIRATE ISLAND",
  cursed_galleon: "CURSED GALLEON",
  thunder_isle: "THUNDER ISLE",
};

// ─── Portal type → minimap dot color ─────────────────────────────────────────

const SAFE_CITY_ZONES = new Set<ZoneId>(["meadow_hub", "aurelion"]);
const BOSS_SPECIAL_ZONES = new Set<ZoneId>([
  "boss_chamber",
  "floating_ruins",
  "cursed_swamp",
]);

function getPortalDotColor(transitionType: string, toZone: ZoneId): string {
  if (transitionType === "stair_down" || transitionType === "stair_up")
    return "#FFCC00";
  if (SAFE_CITY_ZONES.has(toZone)) return "#4488FF";
  if (BOSS_SPECIAL_ZONES.has(toZone)) return "#8844FF";
  return "#FF4422";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAP_W = 120;
const MAP_H = 100;

const TRANSITION_TILES = new Set<TileTypeValue>([
  TileType.PORTAL,
  TileType.DOOR,
  TileType.STAIR,
  TileType.STAIR_UP,
]);

interface MinimapProps {
  tiles: TileTypeValue[][];
  playerX: number;
  playerY: number;
  zoneId: ZoneId;
  facing?: FacingDirection;
  isTransitioning?: boolean;
  /** Monsters in the current zone — used to draw red triangles within 20-tile radius */
  monsters?: MonsterEntity[];
  /** Current timestamp for blink animations */
  timestamp?: number;
  /**
   * Render mode:
   * - "overlay" (default): absolute positioned top-right overlay on the canvas
   * - "panel": inline block, no absolute positioning — for embedding in controls panel
   */
  renderMode?: "overlay" | "panel";
  /** Canvas width in px when renderMode="panel" (default 80) */
  panelWidth?: number;
  /** Canvas height in px when renderMode="panel" (default 80) */
  panelHeight?: number;
}

export function Minimap({
  tiles,
  playerX,
  playerY,
  zoneId,
  facing = "down",
  isTransitioning = false,
  monsters = [],
  timestamp = 0,
  renderMode = "overlay",
  panelWidth = 120,
  panelHeight = 120,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use full map dimensions for the overlay mode, smaller for panel mode
  const canvasW = renderMode === "panel" ? panelWidth : MAP_W;
  const canvasH = renderMode === "panel" ? panelHeight : MAP_H;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rows = tiles.length;
    const cols = rows > 0 ? tiles[0].length : 0;
    if (rows === 0 || cols === 0) return;

    const tileW = canvasW / cols;
    const tileH = canvasH / rows;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Build type-aware portal color lookup for this zone
    const zoneTransitions = ZONE_TRANSITIONS.filter(
      (t) => t.fromZone === zoneId,
    );
    const transitionDotMap = new Map<string, string>();
    for (const t of zoneTransitions) {
      const color = getPortalDotColor(t.transitionType, t.toZone);
      const tt = t.triggerTile;
      if ("x" in tt && "y" in tt) {
        transitionDotMap.set(`${tt.x},${tt.y}`, color);
      }
    }

    // Portal blink: 0.5s on / 0.5s off using timestamp
    const blinkOn = Math.floor(timestamp / 500) % 2 === 0;

    // Draw tiles
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const tile = tiles[ty][tx];
        const rx = Math.floor(tx * tileW);
        const ry = Math.floor(ty * tileH);
        const rw = Math.max(1, Math.ceil(tileW));
        const rh = Math.max(1, Math.ceil(tileH));

        // Use type-aware color for known transition positions
        const typeColor = transitionDotMap.get(`${tx},${ty}`);
        if (typeColor && TRANSITION_TILES.has(tile)) {
          // Blink portal/transition dots: alternate between color and dimmed
          const dotAlpha = blinkOn ? 1.0 : 0.4;
          ctx.globalAlpha = dotAlpha;
          ctx.fillStyle = typeColor;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = dotAlpha * 0.6;
          ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
          ctx.globalAlpha = 1;
        } else {
          const color = MINIMAP_COLORS[tile] ?? "#222222";
          ctx.fillStyle = color;
          ctx.fillRect(rx, ry, rw, rh);
          if (TRANSITION_TILES.has(tile) && rw >= 2 && rh >= 2) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = 0.5;
            ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // ── Monster red triangles — within 20-tile radius of player ──
    for (const monster of monsters) {
      if (monster.state === "dead") continue;
      const distX = monster.x - playerX;
      const distY = monster.y - playerY;
      const dist = Math.sqrt(distX * distX + distY * distY);
      if (dist > 20) continue;
      const mx = Math.floor(monster.x * tileW + tileW / 2);
      const my = Math.floor(monster.y * tileH + tileH / 2);
      const ts = 2;
      ctx.fillStyle = "#EE2222";
      ctx.beginPath();
      ctx.moveTo(mx, my - ts);
      ctx.lineTo(mx - ts, my + ts);
      ctx.lineTo(mx + ts, my + ts);
      ctx.closePath();
      ctx.fill();
    }

    // Player marker — white 4px dot with slow pulse glow, orange outline
    const dotW = 4;
    const dotH = 4;
    const dotX = Math.floor(playerX * tileW + tileW / 2 - dotW / 2);
    const dotY = Math.floor(playerY * tileH + tileH / 2 - dotH / 2);
    // Pulse: oscillate glow intensity based on timestamp
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(timestamp / 600));
    ctx.globalAlpha = pulse * 0.5;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(dotX - 4, dotY - 4, dotW + 8, dotH + 8);
    ctx.globalAlpha = pulse * 0.75;
    ctx.fillRect(dotX - 2, dotY - 2, dotW + 4, dotH + 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff6600";
    ctx.fillRect(dotX - 1, dotY - 1, dotW + 2, dotH + 2);
    ctx.fillStyle = "#FFFFFF"; // bright white player dot
    ctx.fillRect(dotX, dotY, dotW, dotH);

    const DIRS: Record<FacingDirection, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const [fdx, fdy] = DIRS[facing];
    const triSize = 3;
    const triCx = dotX + dotW / 2 + fdx * (dotW / 2 + triSize + 1);
    const triCy = dotY + dotH / 2 + fdy * (dotH / 2 + triSize + 1);
    ctx.fillStyle = "#ffdd00";
    ctx.beginPath();
    if (facing === "up") {
      ctx.moveTo(triCx, triCy - triSize);
      ctx.lineTo(triCx - triSize, triCy + triSize);
      ctx.lineTo(triCx + triSize, triCy + triSize);
    } else if (facing === "down") {
      ctx.moveTo(triCx, triCy + triSize);
      ctx.lineTo(triCx - triSize, triCy - triSize);
      ctx.lineTo(triCx + triSize, triCy - triSize);
    } else if (facing === "left") {
      ctx.moveTo(triCx - triSize, triCy);
      ctx.lineTo(triCx + triSize, triCy - triSize);
      ctx.lineTo(triCx + triSize, triCy + triSize);
    } else {
      ctx.moveTo(triCx + triSize, triCy);
      ctx.lineTo(triCx - triSize, triCy - triSize);
      ctx.lineTo(triCx - triSize, triCy + triSize);
    }
    ctx.closePath();
    ctx.fill();

    // ── Cardinal direction labels: N / S / E / W at minimap edges ──
    ctx.font = "bold 7px monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    // N — top center
    ctx.fillText("N", canvasW / 2, 5);
    // S — bottom center
    ctx.fillText("S", canvasW / 2, canvasH - 5);
    // W — left center
    ctx.fillText("W", 5, canvasH / 2);
    // E — right center
    ctx.fillText("E", canvasW - 5, canvasH / 2);

    if (isTransitioning) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Loading...", canvasW / 2, canvasH / 2);
    }
  }, [
    tiles,
    playerX,
    playerY,
    facing,
    isTransitioning,
    zoneId,
    monsters,
    timestamp,
    canvasW,
    canvasH,
  ]);

  const zoneName = ZONE_LABELS[zoneId] ?? zoneId.toUpperCase();

  // ── Panel mode: 120×120px minimap in top-right of controls panel ──
  if (renderMode === "panel") {
    return (
      <div
        data-ocid="minimap-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pointerEvents: "auto",
          width: canvasW,
        }}
      >
        {/* Zone name above minimap */}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: "bold",
            color: isTransitioning
              ? "rgba(255,255,255,0.35)"
              : "rgba(255,255,255,0.85)",
            letterSpacing: "0.06em",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
            userSelect: "none",
            textTransform: "uppercase",
            maxWidth: canvasW,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {zoneName}
        </span>
        {/* Minimap canvas */}
        <div
          style={{
            background: "rgba(0,0,0,0.6)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            overflow: "hidden",
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.8), 0 0 6px rgba(255,255,255,0.08)",
            opacity: isTransitioning ? 0.6 : 1,
            transition: "opacity 0.3s ease",
            cursor: "pointer",
            width: canvasW,
            height: canvasH,
            flexShrink: 0,
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            style={{ display: "block", imageRendering: "pixelated" }}
          />
        </div>
      </div>
    );
  }

  // ── Overlay mode: absolute positioned top-right on the game canvas ──
  return (
    <div
      data-ocid="minimap-overlay"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 3,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.70)",
          border: "1px solid rgba(255,255,255,0.35)",
          borderRadius: 4,
          padding: "1px 6px",
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            fontWeight: "bold",
            color: isTransitioning
              ? "rgba(255,255,255,0.4)"
              : "rgba(255,255,255,0.90)",
            letterSpacing: "0.08em",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
            userSelect: "none",
          }}
        >
          {zoneName}
        </span>
      </div>

      <div
        style={{
          background: "rgba(0,0,0,0.68)",
          border: "1px solid rgba(255,255,255,0.45)",
          borderRadius: 5,
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(0,0,0,0.8)",
          opacity: isTransitioning ? 0.6 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          style={{ display: "block", imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}
