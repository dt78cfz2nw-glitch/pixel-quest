import type { ZoneId } from "../types/game";
import { ZONE_TRANSITIONS } from "./world";

// ─── World Map Zone Layout ────────────────────────────────────────────────────
// Portrait-optimized 2D grid positions (0-10 columns, 0-14 rows approx)
// Positions are in abstract grid units rendered as proportional CSS

export interface WorldMapZone {
  zoneId: ZoneId;
  displayName: string;
  /** Grid position — fractional 0..1 relative to map canvas */
  x: number;
  y: number;
  /** Tile width in grid units */
  w: number;
  /** Tile height in grid units */
  h: number;
  /** Base color for the zone tile (when discovered) */
  color: string;
  /** Text color on the tile */
  textColor: string;
  recommendedLevel: number;
  monsterTypes: string[];
}

// Grid is 10 columns × 14 rows (portrait)
// x and y are 0..1 fractions of the map canvas width/height
// w and h are also fractions

export const ZONE_MAP_LAYOUT: WorldMapZone[] = [
  {
    zoneId: "meadow_hub",
    displayName: "Meadow Hub",
    x: 0.38,
    y: 0.0,
    w: 0.24,
    h: 0.1,
    color: "#3a7a2a",
    textColor: "#c8f0a0",
    recommendedLevel: 1,
    monsterTypes: ["None (Safe Zone)"],
  },
  {
    zoneId: "aurelion",
    displayName: "Aurelion",
    x: 0.38,
    y: 0.12,
    w: 0.24,
    h: 0.1,
    color: "#3a2472",
    textColor: "#c0a8ff",
    recommendedLevel: 1,
    monsterTypes: ["None (Safe Zone)"],
  },
  {
    zoneId: "wilderness",
    displayName: "Wilderness",
    x: 0.38,
    y: 0.24,
    w: 0.24,
    h: 0.1,
    color: "#5a7a1a",
    textColor: "#e0f0a0",
    recommendedLevel: 2,
    monsterTypes: ["Wolf", "Goblin", "Troll"],
  },
  {
    zoneId: "wolf_forest",
    displayName: "Wolf Forest",
    x: 0.38,
    y: 0.36,
    w: 0.24,
    h: 0.1,
    color: "#2a5a18",
    textColor: "#a8d880",
    recommendedLevel: 5,
    monsterTypes: ["Wolf", "Shadow Wolf", "Forest Troll"],
  },
  {
    zoneId: "forest_depths",
    displayName: "Forest Depths",
    x: 0.1,
    y: 0.3,
    w: 0.24,
    h: 0.1,
    color: "#1a4a18",
    textColor: "#80c870",
    recommendedLevel: 8,
    monsterTypes: ["Goblin", "Forest Troll", "Wisp"],
  },
  {
    zoneId: "dark_forest",
    displayName: "Dark Forest",
    x: 0.1,
    y: 0.42,
    w: 0.24,
    h: 0.1,
    color: "#0e2e0e",
    textColor: "#60a040",
    recommendedLevel: 12,
    monsterTypes: ["Shadow Wolf", "Dark Wraith", "Shadow Bear"],
  },
  {
    zoneId: "bear_forest",
    displayName: "Bear Forest",
    x: 0.1,
    y: 0.18,
    w: 0.24,
    h: 0.1,
    color: "#2e5218",
    textColor: "#90c870",
    recommendedLevel: 6,
    monsterTypes: ["Bear", "Troll", "Wolf"],
  },
  {
    zoneId: "tiger_jungle",
    displayName: "Tiger Jungle",
    x: 0.1,
    y: 0.06,
    w: 0.24,
    h: 0.1,
    color: "#4a6a10",
    textColor: "#c8e060",
    recommendedLevel: 7,
    monsterTypes: ["Tiger", "Wisp", "Vine Beast"],
  },
  {
    zoneId: "ancient_ruins",
    displayName: "Ancient Ruins",
    x: 0.66,
    y: 0.24,
    w: 0.24,
    h: 0.1,
    color: "#6a5820",
    textColor: "#f0d880",
    recommendedLevel: 4,
    monsterTypes: ["Troll", "Skeleton", "Stone Golem"],
  },
  {
    zoneId: "crystal_ruins",
    displayName: "Crystal Ruins",
    x: 0.66,
    y: 0.12,
    w: 0.24,
    h: 0.1,
    color: "#3a2880",
    textColor: "#b0a8ff",
    recommendedLevel: 6,
    monsterTypes: ["Crystal Golem", "Wisp", "Ruin Phantom"],
  },
  {
    zoneId: "ancient_ruins_deep",
    displayName: "Ancient Ruins Deep",
    x: 0.66,
    y: 0.36,
    w: 0.24,
    h: 0.1,
    color: "#584818",
    textColor: "#e0c870",
    recommendedLevel: 10,
    monsterTypes: ["Stone Golem", "Skeleton", "Forest Troll"],
  },
  {
    zoneId: "cave_interior",
    displayName: "Cave Interior",
    x: 0.38,
    y: 0.55,
    w: 0.24,
    h: 0.1,
    color: "#1a2a4a",
    textColor: "#8090d8",
    recommendedLevel: 8,
    monsterTypes: ["Cave Bat", "Cave Troll", "Giant Spider"],
  },
  {
    zoneId: "boss_chamber",
    displayName: "Boss Chamber",
    x: 0.38,
    y: 0.67,
    w: 0.24,
    h: 0.1,
    color: "#5a1010",
    textColor: "#ff9070",
    recommendedLevel: 20,
    monsterTypes: ["Stone Warden (Boss)"],
  },
  {
    zoneId: "cursed_swamp",
    displayName: "Cursed Swamp",
    x: 0.04,
    y: 0.54,
    w: 0.24,
    h: 0.1,
    color: "#2a4010",
    textColor: "#90c860",
    recommendedLevel: 14,
    monsterTypes: ["Bog Witch", "Swamp Lurker", "Mud Golem"],
  },
  {
    zoneId: "floating_ruins",
    displayName: "Floating Ruins",
    x: 0.72,
    y: 0.0,
    w: 0.24,
    h: 0.1,
    color: "#2a4070",
    textColor: "#90c0f0",
    recommendedLevel: 16,
    monsterTypes: ["Ruin Specter", "Ancient Guardian", "Sky Serpent"],
  },
  {
    zoneId: "pirate_island",
    displayName: "Pirate Island",
    x: 0.66,
    y: 0.55,
    w: 0.3,
    h: 0.1,
    color: "#3a6060",
    textColor: "#80e0e0",
    recommendedLevel: 18,
    monsterTypes: ["Pirate", "Corsair", "Powder Monkey"],
  },
  {
    zoneId: "cursed_galleon",
    displayName: "Cursed Galleon",
    x: 0.66,
    y: 0.67,
    w: 0.3,
    h: 0.1,
    color: "#5a1a0a",
    textColor: "#e09070",
    recommendedLevel: 22,
    monsterTypes: ["Cursed Sailor", "Skeleton Gunner", "Cursed Navigator"],
  },
  {
    zoneId: "thunder_isle",
    displayName: "Thunder Isle",
    x: 0.04,
    y: 0.66,
    w: 0.26,
    h: 0.1,
    color: "#2a1a4a",
    textColor: "#88aaff",
    recommendedLevel: 18,
    monsterTypes: ["Storm Sprite", "Thunder Golem", "Lightning Drake"],
  },
];

// ─── Zone connection graph (derived from ZONE_TRANSITIONS) ───────────────────

/** Returns a set of [zoneId, zoneId] pairs for rendering dotted connection lines */
export function getZoneConnections(): Array<[ZoneId, ZoneId]> {
  const seen = new Set<string>();
  const connections: Array<[ZoneId, ZoneId]> = [];

  for (const t of ZONE_TRANSITIONS) {
    // Skip dungeon sub-zones — they clutter the high-level map
    const SKIP: ZoneId[] = [
      "hub_basement",
      "goblin_warrens",
      "bat_cave",
      "deep_cave",
      "wilderness_dungeon",
      "forest_dungeon",
      "cyclops_lair",
    ];
    if (SKIP.includes(t.fromZone) || SKIP.includes(t.toZone)) continue;

    const key =
      t.fromZone < t.toZone
        ? `${t.fromZone}|${t.toZone}`
        : `${t.toZone}|${t.fromZone}`;
    if (!seen.has(key)) {
      seen.add(key);
      connections.push([t.fromZone, t.toZone]);
    }
  }

  return connections;
}

/** Lookup a zone layout entry by id */
export function getZoneLayout(zoneId: ZoneId): WorldMapZone | undefined {
  return ZONE_MAP_LAYOUT.find((z) => z.zoneId === zoneId);
}
