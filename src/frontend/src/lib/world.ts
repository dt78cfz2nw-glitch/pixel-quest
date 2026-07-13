import {
  type NpcDefinition,
  TileType,
  type TileTypeValue,
  type WorldConfig,
  type WorldMap,
  type ZoneConfig,
  type ZoneId,
  type ZoneTransition,
} from "../types/game";

// ─── Char → TileType mapping ──────────────────────────────────────────────────
// 'g' → GRASS        'G' → DEEP_FOREST  'T' → TREE         'r' → STONE (rock)
// 'p' → PATH         'P' → PORTAL       'S' → STAIR        'U' → STAIR_UP
// 'w' → WALL         'W' → WATER        'R' → TOWN_WALL (ruin wall)
// '.' → DUNGEON_FLOOR '#' → DUNGEON_WALL 'f' → FLOWER
// 'v' → CAVE_FLOOR (lava/volcanic)       'c' → CRYSTAL      'l' → LANTERN
// 'M' → TRANSITION_MARKER (glowing zone-border tile — walkable)
// ── Island / water border chars ──
// '~' → DEEP_WATER (animated ocean water — NOT walkable)
// ',' → BEACH       (sandy shoreline — walkable)
// '@' → FOAM        (white foam edge — NOT walkable)
// 'Q' → SWAMP_WATER (murky green water — NOT walkable)
// 'K' → STONE_PLATFORM (floating stone platform — walkable)
// 'X' → RUNE_FLOOR  (ancient glowing rune tile — walkable)
// 'V' → VOID_DROP   (sky void / platform edge — NOT walkable)
// ── Pirate Island chars ──
// 'B' → BRIDGE      (wooden plank bridge — walkable)
// 'A' → SAND        (sandy island terrain — walkable)
// 'L' → PALM_TREE   (tropical palm — NOT walkable)
// ── Cursed Galleon chars ──
// 'D' → WOOD_PLANK  (ship floor — walkable)
// 'H' → SHIP_RAIL   (ship edge railing — NOT walkable, visual only)
// 'O' → SHIP_WATER  (animated ocean around ship — NOT walkable)
// 'C' → CAPTAIN_FLOOR (captain's quarters floor — walkable)

function charToTile(c: string): TileTypeValue {
  switch (c) {
    case "g":
      return TileType.GRASS;
    case "G":
      return TileType.DEEP_FOREST;
    case "T":
      return TileType.TREE;
    case "r":
      return TileType.STONE;
    case "p":
      return TileType.PATH;
    case "P":
      return TileType.PORTAL;
    case "S":
      return TileType.STAIR;
    case "U":
      return TileType.STAIR_UP;
    case "w":
      return TileType.WALL;
    case "W":
      return TileType.WATER;
    case "R":
      return TileType.TOWN_WALL;
    case ".":
      return TileType.DUNGEON_FLOOR;
    case "#":
      return TileType.DUNGEON_WALL;
    case "f":
      return TileType.FLOWER;
    case "v":
      return TileType.CAVE_FLOOR;
    case "c":
      return TileType.CRYSTAL;
    case "l":
      return TileType.LANTERN;
    case "M":
      return TileType.TRANSITION_MARKER;
    // ── Island / water border tiles ──
    case "~":
      return TileType.DEEP_WATER;
    case ",":
      return TileType.BEACH;
    case "@":
      return TileType.FOAM;
    case "Q":
      return TileType.SWAMP_WATER;
    case "K":
      return TileType.STONE_PLATFORM;
    case "X":
      return TileType.RUNE_FLOOR;
    case "V":
      return TileType.VOID_DROP;
    // ── Pirate Island tiles ──
    case "B":
      return TileType.BRIDGE;
    case "A":
      return TileType.SAND;
    case "L":
      return TileType.PALM_TREE;
    // ── Cursed Galleon tiles ──
    case "D":
      return TileType.WOOD_PLANK;
    case "H":
      return TileType.SHIP_RAIL;
    case "O":
      return TileType.SHIP_WATER;
    case "C":
      return TileType.CAPTAIN_FLOOR;
    default:
      return TileType.GRASS;
  }
}

export function parseMapW(
  rows: string[],
  width: number,
  _height?: number,
): TileTypeValue[][] {
  return rows.map((line) =>
    Array.from({ length: width }, (_, x) => charToTile(line[x] ?? "g")),
  );
}

// ─── MEADOW HUB — 40×34 ───────────────────────────────────────────────────────
// Safe starting zone. Open lush green fields.
// Spawn {x:20, y:17}
// S-edge exit y=33 x:20 → wilderness
// E-edge exit x=39 y:15 → wolf_forest
// W-edge exit x=0 y:15 → ancient_ruins
// Portal at {x:20, y:5} → crystal_ruins
// Stairs at {x:10, y:10} → hub_basement
// Stairs at {x:30, y:10} → goblin_warrens
// cols: 0         1         2         3
//       0123456789012345678901234567890123456789
const RAW_MEADOW_HUB: string[] = [
  /* r0 */ "gggggggggggggggggggggggggggggggggggggggg",
  /* r1 */ "gTTggggggggggggggggggggggggggggggggTTggg",
  /* r2 */ "gTTggggggfggggggggggggggggggggfgggTTgggg",
  /* r3 */ "ggggggggggggggggggggggggggggggggggggggggg",
  /* r4 */ "ggggggggfgggggggggggggggggggggfggggggggg",
  /* r5 */ "gggggggggggggggggggPgggggggggggggggggggg",
  /* r6 */ "gggggggggfgggggggpgggggfggggggggggggggg",
  /* r7 */ "gggggggggggggggpppggggggggggggggggggggg",
  /* r8 */ "ggggggggggggggpggggggggggggggggggggggg",
  /* r9 */ "ggggfggggggggpgggggggggggggggfgggggggg",
  /* r10*/ "gggggggggSggppggggggggggggggSggggggggg",
  /* r11*/ "gggggggggggpggggggggggggggggggggggggg",
  /* r12*/ "gggTTgggggpgggggggggggggggggggTTggggg",
  /* r13*/ "gggTTgggggpgggggggggggggggggggTTggggg",
  /* r14*/ "gggggggggpggggggggggggggggggggggggggg",
  /* r15*/ "pppppppppppppppppppppppppppppppppppppppg",
  /* r16*/ "ggggggggggpggggggggggggggggggggggggpggg",
  /* r17*/ "ggggfgggggpppppppppgggggggggggfgggpgggg",
  /* r18*/ "gggggggggggggggggpgggggggggggggggpggggg",
  /* r19*/ "ggggggggfgggggggpgggggggfgggggggpgggggg",
  /* r20*/ "gggggMgggggggggpgggggggggggggggpggggggg",
  /* r21*/ "gggTTggggggggggpgggggggggggggggpgTTggggg",
  /* r22*/ "gggTTggggggggggpggggggggggggggggTTgggggg",
  /* r23*/ "ggggggfggggggggpgggggggggfggggggggggggg",
  /* r24*/ "ggggggggggggggpggggggggggggggggggggggg",
  /* r25*/ "gggggggggggggpgggggggggggggggggggggggg",
  /* r26*/ "gggggfgggggggpgggggggggggggfggggggggggg",
  /* r27*/ "gggggggggggpggggggggggggggggggggggggggg",
  /* r28*/ "gggggggggggpggggggggggggggggggggggggggg",
  /* r29*/ "gggggggggggppppppppppppppppppgggggggggg",
  /* r30*/ "ggggggfggggggpgggggggfgggggpggggfggggg",
  /* r31*/ "ggggggggggggggpgggggggggggpgggggggggggg",
  /* r32*/ "ggggggggggggggggpppppppppgggggggggggggg",
  /* r33*/ "ggggggggggggggggpppppppppgggggggggggggg",
];

// ─── WILDERNESS — 38×32 ───────────────────────────────────────────────────────
// Beginner combat zone. Spawn {x:19, y:16}
// N-edge y=0 x:19 → meadow_hub
// E-edge x=37 y:16 → bear_forest
// S-edge y=31 x:19 → wolf_forest
// Portal at {x:10, y:10} → forest_depths
// Stairs at {x:28, y:25} → wilderness_dungeon
// cols: 0         1         2         3
//       01234567890123456789012345678901234567
const RAW_WILDERNESS: string[] = [
  /* r0 */ "ggggggggggggggggggpggggggggggggggggggg",
  /* r1 */ "gggggTTgggggggggggggggggggggggTTgggggg",
  /* r2 */ "gggggTTggggggggggggggggggggggTTggggggg",
  /* r3 */ "ggggggggggfgggggggggggggfggggggggggggg",
  /* r4 */ "ggggggggggggggggggggggggggggggggggggggg",
  /* r5 */ "ggfgggggggggggggggggggggggggggggggfgggg",
  /* r6 */ "ggggggggggTTggggggggggggTTggggggggggggg",
  /* r7 */ "ggggggggggTTggggggggggggTTggggggggggggg",
  /* r8 */ "ggggggggggggggggggggggggggggggggggggggg",
  /* r9 */ "gggggfgggggggggggggggggggggggggfggggggg",
  /* r10*/ "gggggggggPggggggggggggggggggggggggggpgg",
  /* r11*/ "ggggggggggggggggggggggggggggggggggggpgg",
  /* r12*/ "gggggTTgggggggggggfgggggggggggTTggggggg",
  /* r13*/ "gggggTTggggggggggggggggggggggTTgggggggg",
  /* r14*/ "ggggggggggggggggggggggggggggggggggggpgg",
  /* r15*/ "gggggggggggggggfgggggggfgggggggggggggpg",
  /* r16*/ "ggggggggggggggggggggggggggggggggggggpgg",
  /* r17*/ "gggggfgggggggggggggggggggggggggfggggpgg",
  /* r18*/ "ggggggggggggggggggggggggggggggggggggpgg",
  /* r19*/ "ggggggggTTgggggggggggggggggTTgggggggpgg",
  /* r20*/ "ggggggggTTgggggggggggggggggTTgggggggpgg",
  /* r21*/ "ggggggggggggggggggggggggggggggggggggpgg",
  /* r22*/ "ggggggfgggggggggggggggggggggggfgggggggg",
  /* r23*/ "ggggggggggggggggggggggggggggggggggggggg",
  /* r24*/ "gggggggggggggggggggggggggggggggggggggggg",
  /* r25*/ "gggggggggggggggggggggggggggSggggggggggg",
  /* r26*/ "gggggfgggggggggfggggggggggggggggfgggggg",
  /* r27*/ "ggggggggggTTggggggggggggggTTggggggggggg",
  /* r28*/ "ggggggggggTTggggggggggggggTTggggggggggg",
  /* r29*/ "gggggggggggggggggggggggggggggggggggggggg",
  /* r30*/ "gggggggggggggfgggggggfgggggggggggggggggg",
  /* r31*/ "ggggggggggggggggggpggggggggggggggggggggg",
];

// ─── WOLF FOREST — 36×30 ─────────────────────────────────────────────────────
// Dense forest, wolves/bears/tigers. Spawn {x:18, y:15}
// N-edge y=0 x:18 → wilderness
// E-edge x=35 y:15 → tiger_jungle
// Portal at {x:18, y:5} → bear_forest
// Stairs at {x:9, y:25} → forest_dungeon
// cols: 0         1         2         3
//       012345678901234567890123456789012345
const RAW_WOLF_FOREST: string[] = [
  /* r0 */ "ggggggggggggggggggggggggggggggggggggg",
  /* r1 */ "gGGGGGGggggggggggggggggggggGGGGGGggg",
  /* r2 */ "gGTTGGGgggggggggggggggggggGGGTTGggg",
  /* r3 */ "gGTTGGgggggfgggggggggfgggGGTTGgggg",
  /* r4 */ "gGGGGgggggggggggggggggggggGGGGggggg",
  /* r5 */ "gGGGGgggggggggPgggggggggggGGGGgggggg",
  /* r6 */ "ggGGGGgggggggpggggggggggGGGGggggggg",
  /* r7 */ "gggGGGgfgggggggggggfggGGGgggggggggg",
  /* r8 */ "ggggGGGGGGGGGgggGGGGGGGGGGggggggggg",
  /* r9 */ "gggggGGGGGGGGGGGGGGGGGGGGGggggggggg",
  /* r10*/ "gggggggGGGGGGGGGGGGGGGGGGggggggggggg",
  /* r11*/ "gggggfgggGGGGGgggggGGGGgggfgggggggg",
  /* r12*/ "gggggggggggGGGGgGGGGggggggggggggggg",
  /* r13*/ "gggggggggggggGGGGGGgggggggggggggggg",
  /* r14*/ "gggggggggggggggGGGgggggggggggggggpg",
  /* r15*/ "gggggggfgggggggggggggggggggfgggggpg",
  /* r16*/ "ggggggggggggggGGGggggggggggggggggg",
  /* r17*/ "gggggggggggGGGGGGGGggggggggggggggg",
  /* r18*/ "ggggggggGGGGGGGGGGGGGGGGggggggggg",
  /* r19*/ "gggggGGGGGGGGGGGGGGGGGGGGGGGGgggg",
  /* r20*/ "ggggGGGGGGGGGGGgggGGGGGGGGGGGGggg",
  /* r21*/ "gggGGGGGgfgggggggggggfgGGGGGGGggg",
  /* r22*/ "ggggGGGGGGGGgggggggggGGGGGGGgggg",
  /* r23*/ "gggggGGGGGGGGGGGGGGGGGGGGGGggggg",
  /* r24*/ "gggggggGGGGGGGGGGGGGGGGGGggggggg",
  /* r25*/ "ggggggggGGGGgSgggggGGGGggggggggg",
  /* r26*/ "ggggggggggGGGGGGGGGGGGGgggfggggg",
  /* r27*/ "gggggfggggggGGGGGGGGGGggggggggg",
  /* r28*/ "ggggggggggggggGGGGGGgggggggggggg",
  /* r29*/ "ggggggggggggggggggggggggggggggggg",
];

// ─── TIGER JUNGLE — 34×28 ────────────────────────────────────────────────────
// Tropical zone, tigers/sprite_wisps. Spawn {x:17, y:14}
// W-edge x=0 y:14 → wolf_forest
// N-edge y=0 x:16 → bear_forest
// Stairs at {x:17, y:24} → deep_cave
// Portal at {x:28, y:14} → crystal_ruins
// cols: 0         1         2         3
//       0123456789012345678901234567890123
const RAW_TIGER_JUNGLE: string[] = [
  /* r0 */ "gggggggggggggggggggggggggggggggggg",
  /* r1 */ "pgGGGGGGggggggggggggggggGGGGGGggg",
  /* r2 */ "pGGTTGGGggggggggggggggGGGTTGGggg",
  /* r3 */ "pGGTTGGGgfgggggggggfgGGGTTGGgggg",
  /* r4 */ "pGGGGGGgggggggggggggggGGGGGGggggg",
  /* r5 */ "pgGGGGGGgggfgggggggfggGGGGGGggggg",
  /* r6 */ "pgggGGGGGGGGGGGGGGGGGGGGGGggggggg",
  /* r7 */ "pggggGGGGGGGGGGGGGGGGGGGGgggggggg",
  /* r8 */ "pgggggGGGGGGGGGGGGGGGGGGgggggggggg",
  /* r9 */ "pggggggGGGGGgggGGGGGGGggggggggggg",
  /* r10*/ "pgggggfgGGGGGGGGGGGGGGggfggggggggg",
  /* r11*/ "pggggggggGGGGGGGGGGGGGggggggggggg",
  /* r12*/ "pgggggggggggGGGGGGGGggggggggggggg",
  /* r13*/ "pggggggggggggggGGGgggggggggggggggg",
  /* r14*/ "pgggggggggggggggggggggggggggggggPg",
  /* r15*/ "pgggggggggggggGGGggggggggggggggggg",
  /* r16*/ "pgggggggggggGGGGGGggggggggggggggg",
  /* r17*/ "pgggggggggGGGGGGGGGGggggggggggggg",
  /* r18*/ "pggggfgGGGGGGGGGGGGGGGGgfggggggg",
  /* r19*/ "gggggGGGGGGGGGGGGGGGGGGGGGggggggg",
  /* r20*/ "ggggGGGGGGGGGGgggGGGGGGGGGGggggg",
  /* r21*/ "gggGGGGGGGgfgggggggfgGGGGGGGgggg",
  /* r22*/ "ggggGGGGGGGGGGgggGGGGGGGGGGggggg",
  /* r23*/ "gggggGGGGGGGGGGGGGGGGGGGGggggggg",
  /* r24*/ "gggggggGGGGGgSgggGGGGGGggggggggg",
  /* r25*/ "ggggggggGGGGGGGGGGGGGGGGggggggggg",
  /* r26*/ "gggggfggggGGGGGGGGGGGGgggfggggggg",
  /* r27*/ "gggggggggggggggggggggggggggggggggg",
];

// ─── BEAR FOREST — 36×30 ─────────────────────────────────────────────────────
// Mixed forest, bears/trolls. Spawn {x:18, y:15}
// W-edge x=0 y:15 → wilderness
// E-edge x=35 y:15 → forest_depths
// S-edge y=29 x:18 → tiger_jungle
// Stairs at {x:18, y:25} → bat_cave
// cols: 0         1         2         3
//       012345678901234567890123456789012345
const RAW_BEAR_FOREST: string[] = [
  /* r0 */ "gggggggggggggggggggggggggggggggggggg",
  /* r1 */ "gggggTTgggggggggggggggggggggTTgggggg",
  /* r2 */ "gggggTTgggggggggggggggggggggTTgggggg",
  /* r3 */ "gggggggggfgggggggggggggggfggggggggggg",
  /* r4 */ "gggggggggggggggggggggggggggggggggggg",
  /* r5 */ "gggggggggggTTggggggggggTTggggggggggg",
  /* r6 */ "gggggggggggTTggggggggggTTggggggggggg",
  /* r7 */ "ggggfgggggggggggggggggggggggggfggggg",
  /* r8 */ "gggggggggggggggggggggggggggggggggggg",
  /* r9 */ "gggggggggggggggggfggggggggggggggggggg",
  /* r10*/ "pggggggggggggggggggggggggggggggggggpg",
  /* r11*/ "pgggggTTgggggggggggggggggggTTgggggpg",
  /* r12*/ "pgggggTTggggggggggggggggggTTggggggpg",
  /* r13*/ "pggggggggfggggggggggggggfgggggggggpg",
  /* r14*/ "pggggggggggggggggggggggggggggggggggpg",
  /* r15*/ "pggggggggggggggggggggggggggggggggggpg",
  /* r16*/ "pggggggggggggggggggggggggggggggggggpg",
  /* r17*/ "pggggggggfggggggggggggggfggggggggggg",
  /* r18*/ "pgggggggggggggggggggggggggggggggggggg",
  /* r19*/ "pgggggTTggggggggggggggggTTggggggggggg",
  /* r20*/ "pgggggTTggggggggggggggggTTggggggggggg",
  /* r21*/ "pgggggggfggggggggggggggfggggggggggggg",
  /* r22*/ "pgggggggggggggggggggggggggggggggggggg",
  /* r23*/ "pggggggggggggggggggggggggggggggggggggg",
  /* r24*/ "ggggggggggggggggggggggggggggggggggggg",
  /* r25*/ "ggggggggggggggggggSggggggggggggggggggg",
  /* r26*/ "gggggggggfggggggggggggggfggggggggggggg",
  /* r27*/ "gggggggggggggggggggggggggggggggggggggg",
  /* r28*/ "gggggggggggggggggggggggggggggggggggggg",
  /* r29*/ "ggggggggggggggggggpggggggggggggggggggg",
];

// ─── ANCIENT RUINS — 36×30 ───────────────────────────────────────────────────
// Stone ruins, trolls/skeletons. Spawn {x:18, y:15}
// E-edge x=35 y:15 → meadow_hub
// N-edge y=0 x:18 → crystal_ruins
// Portal at {x:18, y:25} → cyclops_lair
// Stairs at {x:28, y:10} → deep_cave
// cols: 0         1         2         3
//       012345678901234567890123456789012345
const RAW_ANCIENT_RUINS: string[] = [
  /* r0 */ "ggggggggggggggggggggggggggggggggggggg",
  /* r1 */ "gggggggggggggggggggggggggggggggggggg",
  /* r2 */ "ggRggggggggggggggggggggggggggRggggg",
  /* r3 */ "gRRRgggggfgggggggggggfgggggRRRgggg",
  /* r4 */ "ggRgggggggggggggggggggggggggRggggg",
  /* r5 */ "ggggggggggggggggggggggggggggggggggg",
  /* r6 */ "ggggggRgggggggggggggggggRgggggggggg",
  /* r7 */ "gggggRRRRRgggggfggggfgggRRRRRgggggg",
  /* r8 */ "gggggggRggggggggggggggggRggggggggggg",
  /* r9 */ "ggggggggggggggggggggggggggggggggggg",
  /* r10*/ "gggggggggggggggggggggggggggggSgggpg",
  /* r11*/ "gggggggggggggggggggggggggggggggggpg",
  /* r12*/ "ggRggggggggggggggggggggggggggRggpg",
  /* r13*/ "gRRRgggggfggggggggggfgggggRRRggpg",
  /* r14*/ "ggRgggggggggggggggggggggggggRggpg",
  /* r15*/ "gggggggggggggggggggggggggggggggpg",
  /* r16*/ "gggggggggggggggggggggggggggggggpg",
  /* r17*/ "gggggggRRRRgggggggggggRRRRggggggpg",
  /* r18*/ "ggggggggggggfgggggfggggggggggggpg",
  /* r19*/ "gggggggRRRRgggggggggggRRRRgggggpg",
  /* r20*/ "gggggggggggggggggggggggggggggggpg",
  /* r21*/ "ggggggggggggggggggggggggggggggggg",
  /* r22*/ "gggggfgggggggggggggggggggggfggggg",
  /* r23*/ "ggggggggggRRRRRRRRRRRRRRRggggggg",
  /* r24*/ "ggggggggggRggggggggggggRgggggggg",
  /* r25*/ "ggggggggggRggggggPgggggRgggggggg",
  /* r26*/ "ggggggggggRggggggpgggggRgggggggg",
  /* r27*/ "ggggggggggRRRRRRRRRRRRRRggggggg",
  /* r28*/ "gggggfggggggggggggggggggggfggggg",
  /* r29*/ "ggggggggggggggggggggggggggggggggg",
];

// ─── CRYSTAL RUINS — 30×24 ───────────────────────────────────────────────────
// Crystal formations, crystal_golem/sprite_wisp. Spawn {x:15, y:12}
// S-edge y=23 x:15 → ancient_ruins
// W-edge x=0 y:12 → forest_depths
// Portal at {x:15, y:5} → tiger_jungle
// cols: 0         1         2
//       012345678901234567890123456789
const RAW_CRYSTAL_RUINS: string[] = [
  /* r0 */ "ggggggggggggggggggggggggggggggg",
  /* r1 */ "gcccgggggggggggggggggggcccgggg",
  /* r2 */ "gcccgggggcgggggggggcgggcccgggg",
  /* r3 */ "ggcgggggggcggggggggcgggggcgggg",
  /* r4 */ "ggggggggggggggggggggggggggggggg",
  /* r5 */ "ggggggggggggggPgggggggggggggggg",
  /* r6 */ "ggggfgggggggggpgggggggfgggggggg",
  /* r7 */ "ggggggggggggggggggggggggggggggg",
  /* r8 */ "pggggggcggggggggggggcgggggggggg",
  /* r9 */ "pggggggcggfggggggfggcggggggggg",
  /* r10*/ "pgggggggcgggggggggcggggggggggg",
  /* r11*/ "pgggggggggcgggggcgggggggggggggg",
  /* r12*/ "pgggggggggggggggggggggggggggggg",
  /* r13*/ "pggggggggggfgggfggggggggggggggg",
  /* r14*/ "pggggggggggggggggggggggggggggggg",
  /* r15*/ "pgggggcggggggggggggcggggggggggg",
  /* r16*/ "pggggggcgggggggggggcgggggggggggg",
  /* r17*/ "ggggggggcgggfggfggcggggggggggg",
  /* r18*/ "gggggggggcgggggggcgggggggggggg",
  /* r19*/ "ggggggggggcgggggcggggggggggggg",
  /* r20*/ "ggggggggggggcccggggggggggggggg",
  /* r21*/ "gggggfgggggggggggggggggfgggggg",
  /* r22*/ "ggggggggggggggggggggggggggggg",
  /* r23*/ "gggggggggggggggpggggggggggggg",
];

// ─── FOREST DEPTHS — 34×28 ───────────────────────────────────────────────────
// Goblin/troll/wisp zone. Spawn {x:17, y:14}
// W-edge x=0 y:14 → bear_forest
// E-edge x=33 y:14 → crystal_ruins
// S-edge y=27 x:16 → wilderness
// Stairs at {x:17, y:24} → forest_dungeon
// Portal at {x:28, y:7} → wolf_forest
// cols: 0         1         2         3
//       0123456789012345678901234567890123
const RAW_FOREST_DEPTHS: string[] = [
  /* r0 */ "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  /* r1 */ "GgggggggggggggggggggggggggggggggGG",
  /* r2 */ "GggggggTTggggggggggggggTTgggggGGG",
  /* r3 */ "GggggggTTgggggfggfggggTTgggggGGG",
  /* r4 */ "GggggggggggggggggggggggggggggGGGG",
  /* r5 */ "GgggfgggggggggggggggggggggfggGGGG",
  /* r6 */ "GggggggggggggggggggggggggggggGGGG",
  /* r7 */ "GggggggggggggggggggggggggggPgGGGG",
  /* r8 */ "GggggggTTTgggggggggggTTTgggggGGGG",
  /* r9 */ "GggggggTTTgggggggggggTTTgggggGGGG",
  /* r10*/ "pgggggggggggggggggggggggggggggggpG",
  /* r11*/ "pgggggggggfgggggfgggggggggggggggpG",
  /* r12*/ "pgggggTTgggggggggggggTTggggggggpG",
  /* r13*/ "pgggggTTgggggggggggggTTgggggggpGG",
  /* r14*/ "pggggggggggggggggggggggggggggggpGG",
  /* r15*/ "pggggggggggggggggggggggggggggggpG",
  /* r16*/ "pggggggggfgggggggfgggggggggggggpG",
  /* r17*/ "pgggggTTgggggggggggggTTgggggggpGG",
  /* r18*/ "pggggggggggggggggggggggggggggggpG",
  /* r19*/ "GggggggggggggggggggggggggggggGGGG",
  /* r20*/ "GggggggTTgggggggggggTTgggggggGGGG",
  /* r21*/ "GggggggTTgggggfggfggTTgggggggGGGG",
  /* r22*/ "GggggggggggggggggggggggggggggGGGG",
  /* r23*/ "GgggfgggggggggggggggggggggfggGGGG",
  /* r24*/ "GggggggggggggggSggggggggggggGGGGG",
  /* r25*/ "GgggggggggggggggggggggggggggGGGGG",
  /* r26*/ "GgggggggggggggggggggggggggggGGGGG",
  /* r27*/ "GGGGGGGGGGGGGGGpGGGGGGGGGGGGGGGGG",
];

// ─── CYCLOPS LAIR — 32×26 ────────────────────────────────────────────────────
// Volcanic rocky zone, cyclops. Spawn {x:16, y:13}
// N-edge y=0 x:16 → ancient_ruins
// Stairs at {x:16, y:22} → deep_cave
// Portal at {x:28, y:13} → wilderness
// cols: 0         1         2         3
//       01234567890123456789012345678901
const RAW_CYCLOPS_LAIR: string[] = [
  /* r0 */ "gggggggggggggggggggggggggggggggg",
  /* r1 */ "grrrrggggggggggggggggggrrrrgggg",
  /* r2 */ "grrrrggggggvvvvgggggggrrrrgggg",
  /* r3 */ "gggggggggggvvvvgggggggggggggggg",
  /* r4 */ "ggggggggggggggggggggggggggggggg",
  /* r5 */ "gggggggggggggggggggggggggggggggg",
  /* r6 */ "ggggrrrgggggggggggggggggrrrggggg",
  /* r7 */ "ggggrrrrgggggggvvgggggggrrrrggg",
  /* r8 */ "gggggggggggggggggggggggggggggggg",
  /* r9 */ "ggggggggggggggvvgggggggggggggggg",
  /* r10*/ "gggggrrrgggggggggggggggrrrggggg",
  /* r11*/ "gggggrrrrgggggggggggggrrrrgggggg",
  /* r12*/ "gggggggggggggggggggggggggggggggg",
  /* r13*/ "ggggggggggggggggggggggggggggggPg",
  /* r14*/ "gggggggggggggggggggggggggggggggg",
  /* r15*/ "gggggggggggvvvggggggggggggggggg",
  /* r16*/ "gggggrrrgggvvvgggggggrrrggggggg",
  /* r17*/ "gggggrrrrggggggggggrrrrgggggggg",
  /* r18*/ "gggggggggggggggggggggggggggggggg",
  /* r19*/ "ggggggggggggggggggggggggggggggg",
  /* r20*/ "gggggggggggvvgggggggggggggggggg",
  /* r21*/ "gggggrrrgggggggggggggrrrggggggg",
  /* r22*/ "ggggggggggggggSgggggggggggggggg",
  /* r23*/ "gggggggggggggggggggggggggggggggg",
  /* r24*/ "ggggggggggggggggggggggggggggggg",
  /* r25*/ "ggggggggggggggggggggggggggggggg",
];

// ─── HUB BASEMENT — 22×18 ────────────────────────────────────────────────────
// Dark underground, spiders. Spawn {x:11, y:4}
// Stair-up at {x:11, y:16} → meadow_hub
// Portal at {x:18, y:9} → bat_cave
// cols: 0         1         2
//       0123456789012345678901
const RAW_HUB_BASEMENT: string[] = [
  /* r0 */ "######################",
  /* r1 */ "#....................#",
  /* r2 */ "#..##....####....##..#",
  /* r3 */ "#....................#",
  /* r4 */ "#....................#",
  /* r5 */ "#....##..........##..#",
  /* r6 */ "#....................#",
  /* r7 */ "#....................#",
  /* r8 */ "#....##...........##.#",
  /* r9 */ "#................P...#",
  /* r10*/ "#....................#",
  /* r11*/ "#....##...........##.#",
  /* r12*/ "#....................#",
  /* r13*/ "#....................#",
  /* r14*/ "#....##..........##..#",
  /* r15*/ "#....................#",
  /* r16*/ "#..........U.........#",
  /* r17*/ "######################",
];

// ─── GOBLIN WARRENS — 22×18 ──────────────────────────────────────────────────
// Dark goblin tunnels, goblins. Spawn {x:11, y:4}
// Stair-up at {x:11, y:16} → meadow_hub
// Portal at {x:18, y:9} → wilderness_dungeon
// cols: 0         1         2
//       0123456789012345678901
const RAW_GOBLIN_WARRENS: string[] = [
  /* r0 */ "######################",
  /* r1 */ "#....................#",
  /* r2 */ "#..##....####....##..#",
  /* r3 */ "#....................#",
  /* r4 */ "#....................#",
  /* r5 */ "#....##..........##..#",
  /* r6 */ "#....................#",
  /* r7 */ "#.....##...........##",
  /* r8 */ "#....................#",
  /* r9 */ "#................P...#",
  /* r10*/ "#....................#",
  /* r11*/ "#....##...........##.#",
  /* r12*/ "#....................#",
  /* r13*/ "#.....##...........##",
  /* r14*/ "#....................#",
  /* r15*/ "#....................#",
  /* r16*/ "#..........U.........#",
  /* r17*/ "######################",
];

// ─── BAT CAVE — 22×18 ────────────────────────────────────────────────────────
// Dark bat cave, bats/spiders. Spawn {x:11, y:4}
// Stair-up at {x:11, y:16} → bear_forest
// Portal at {x:4, y:9} → hub_basement
// cols: 0         1         2
//       0123456789012345678901
const RAW_BAT_CAVE: string[] = [
  /* r0 */ "######################",
  /* r1 */ "#....................#",
  /* r2 */ "#....####....####....#",
  /* r3 */ "#....................#",
  /* r4 */ "#....................#",
  /* r5 */ "#...##...........##..#",
  /* r6 */ "#....................#",
  /* r7 */ "#....................#",
  /* r8 */ "#...##..........###..#",
  /* r9 */ "#P...................#",
  /* r10*/ "#....................#",
  /* r11*/ "#....###..........##.#",
  /* r12*/ "#....................#",
  /* r13*/ "#....................#",
  /* r14*/ "#....##..........##..#",
  /* r15*/ "#....................#",
  /* r16*/ "#..........U.........#",
  /* r17*/ "######################",
];

// ─── WILDERNESS DUNGEON — 22×18 ──────────────────────────────────────────────
// Underground cave, spiders/goblins. Spawn {x:11, y:4}
// Stair-up at {x:11, y:16} → wilderness
// Portal at {x:18, y:9} → goblin_warrens
// cols: 0         1         2
//       0123456789012345678901
const RAW_WILDERNESS_DUNGEON: string[] = [
  /* r0 */ "######################",
  /* r1 */ "#....................#",
  /* r2 */ "#....####....####....#",
  /* r3 */ "#....................#",
  /* r4 */ "#....................#",
  /* r5 */ "#....##..........##..#",
  /* r6 */ "#....................#",
  /* r7 */ "#....................#",
  /* r8 */ "#....##...........##.#",
  /* r9 */ "#................P...#",
  /* r10*/ "#....................#",
  /* r11*/ "#....##..........##..#",
  /* r12*/ "#....................#",
  /* r13*/ "#....................#",
  /* r14*/ "#....##..........##..#",
  /* r15*/ "#....................#",
  /* r16*/ "#..........U.........#",
  /* r17*/ "######################",
];

// ─── FOREST DUNGEON — 22×18 ──────────────────────────────────────────────────
// Underground, spiders/trolls. Spawn {x:11, y:4}
// Stair-up at {x:11, y:16} → wolf_forest
// Portal at {x:18, y:9} → deep_cave
// cols: 0         1         2
//       0123456789012345678901
const RAW_FOREST_DUNGEON: string[] = [
  /* r0 */ "######################",
  /* r1 */ "#....................#",
  /* r2 */ "#....####....####....#",
  /* r3 */ "#....................#",
  /* r4 */ "#....................#",
  /* r5 */ "#....##..........##..#",
  /* r6 */ "#....................#",
  /* r7 */ "#....................#",
  /* r8 */ "#....##...........##.#",
  /* r9 */ "#................P...#",
  /* r10*/ "#....................#",
  /* r11*/ "#....##...........##.#",
  /* r12*/ "#....................#",
  /* r13*/ "#....................#",
  /* r14*/ "#....##..........##..#",
  /* r15*/ "#....................#",
  /* r16*/ "#..........U.........#",
  /* r17*/ "######################",
];

// ─── DEEP CAVE — 22×18 ───────────────────────────────────────────────────────
// Deepest cave, spiders/bats/skeletons. Spawn {x:11, y:4}
// Stair-up at {x:11, y:16} → cyclops_lair
// Portal at {x:4, y:9} → forest_dungeon
// cols: 0         1         2
//       0123456789012345678901
const RAW_DEEP_CAVE: string[] = [
  /* r0 */ "######################",
  /* r1 */ "#....................#",
  /* r2 */ "#....####....####....#",
  /* r3 */ "#....................#",
  /* r4 */ "#....................#",
  /* r5 */ "#....###..........##.#",
  /* r6 */ "#....................#",
  /* r7 */ "#....................#",
  /* r8 */ "#....###..........###",
  /* r9 */ "#P...................#",
  /* r10*/ "#....................#",
  /* r11*/ "#....###..........###",
  /* r12*/ "#....................#",
  /* r13*/ "#....................#",
  /* r14*/ "#....##..........##..#",
  /* r15*/ "#....................#",
  /* r16*/ "#..........U.........#",
  /* r17*/ "######################",
];

// ─── DARK FOREST — 36×30 ─────────────────────────────────────────────────────
// Very dense dark forest. shadow_wolf/wolf/bear. Spawn {x:18, y:15}
// N-edge y=0 → forest_depths   S-edge y=29 → forest_depths (bidirectional)
// Portal at {x:16, y:25} → ancient_ruins_deep
// Portal at {x:35, y:15} → thunder_isle (far east, purple lightning portal)
const RAW_DARK_FOREST: string[] = [
  /* r0 */ "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  /* r1 */ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r2 */ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r3 */ "GGGGgGGGGGGGGGGGGggGGGGGGGGGGGGgGGG",
  /* r4 */ "GGGGggGGGGGGGGGGGggGGGGGGGGGGGGggGG",
  /* r5 */ "GGGGgGGGGGGGGGGGGggGGGGGGGGGGGGgGGG",
  /* r6 */ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r7 */ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r8 */ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r9 */ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r10*/ "GGGGGGGGggggggggggppGGGGGGGGGGGGGGGG",
  /* r11*/ "GGGGGGGGggggggggggppGGGGGGGGGGGGGGGG",
  /* r12*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r13*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r14*/ "GGGGgGGGGGGGGGGGGggGGGGGGGGGGGGgGGG",
  /* r15*/ "GGGGggGGGGGGGGGGGggGGGGGGGGGGGGggGP",
  /* r16*/ "GGGGgGGGGGGGGGGGGggGGGGGGGGGGGGgGGG",
  /* r17*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r18*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r19*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r20*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r21*/ "GGGGGGGGggggggggggppGGGGGGGGGGGGGGGG",
  /* r22*/ "GGGGGGGGggggggggggppGGGGGGGGGGGGGGGG",
  /* r23*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r24*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r25*/ "GGGGGGGGGGGGGGGPGggGGGGGGGGGGGGGGGG",
  /* r26*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r27*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r28*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
  /* r29*/ "GGGGGGGGGGGGGGGGGggGGGGGGGGGGGGGGGG",
];

// ─── ANCIENT RUINS DEEP — 36×30 ──────────────────────────────────────────────
// Moss-covered ruins. stone_golem/skeleton/forest_troll. Spawn {x:18, y:15}
// Portal at {x:18, y:27} → back to ancient_ruins (bidirectional)
const RAW_ANCIENT_RUINS_DEEP: string[] = [
  /* r0 */ "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  /* r1 */ "R..................................R",
  /* r2 */ "R..RRR....................RRR......R",
  /* r3 */ "R..RRR....................RRR......R",
  /* r4 */ "R..................................R",
  /* r5 */ "R..................................R",
  /* r6 */ "R....RRR...................RRR.....R",
  /* r7 */ "R....RRRRR.................RRRRR...R",
  /* r8 */ "R.....RRR.....................RRR..R",
  /* r9 */ "R..................................R",
  /* r10*/ "R..................................R",
  /* r11*/ "R.....RRR.....................RRR..R",
  /* r12*/ "R.....RRRRR.................RRRRR..R",
  /* r13*/ "R..................................R",
  /* r14*/ "R..................................R",
  /* r15*/ "ppppppppppppppppppppppppppppppppppppp",
  /* r16*/ "R..................................R",
  /* r17*/ "R..................................R",
  /* r18*/ "R.....RRR.....................RRR..R",
  /* r19*/ "R.....RRRRR.................RRRRR..R",
  /* r20*/ "R..................................R",
  /* r21*/ "R..................................R",
  /* r22*/ "R....RRR...................RRR.....R",
  /* r23*/ "R....RRRRR.................RRRRR...R",
  /* r24*/ "R..................................R",
  /* r25*/ "R..................................R",
  /* r26*/ "R..RRR....................RRR......R",
  /* r27*/ "R.........P........................R",
  /* r28*/ "R..................................R",
  /* r29*/ "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
];

// ─── CAVE INTERIOR — 36×28 ───────────────────────────────────────────────────
// Dark cave tunnels. cave_bat/cave_troll. Spawn {x:18, y:4}
// Stair-up at {x:18, y:26} → meadow_hub (bidirectional)
const RAW_CAVE_INTERIOR: string[] = [
  /* r0 */ "####################################",
  /* r1 */ "#..................................#",
  /* r2 */ "#..####......................####..#",
  /* r3 */ "#..####......................####..#",
  /* r4 */ "#..................................#",
  /* r5 */ "#..................................#",
  /* r6 */ "#.....##.....................##....#",
  /* r7 */ "#.....##.....................##....#",
  /* r8 */ "#..................................#",
  /* r9 */ "#..................................#",
  /* r10*/ "####.............................###",
  /* r11*/ "####.............................###",
  /* r12*/ "#..................................#",
  /* r13*/ "#..................................#",
  /* r14*/ "#....##......................##....#",
  /* r15*/ "#....##......................##....#",
  /* r16*/ "#..................................#",
  /* r17*/ "#..................................#",
  /* r18*/ "####.............................###",
  /* r19*/ "####.............................###",
  /* r20*/ "#..................................#",
  /* r21*/ "#..................................#",
  /* r22*/ "#..####......................####..#",
  /* r23*/ "#..####......................####..#",
  /* r24*/ "#..................................#",
  /* r25*/ "#..................................#",
  /* r26*/ "#.................U................#",
  /* r27*/ "####################################",
];
//   portal     - glowing portal tile ('P')
//   stair_down - stairs going underground ('S')
//   stair_up   - stairs returning to surface ('U')
//   edge_exit  - walking to a map edge

// ─── AURELION — 32×24 ─────────────────────────────────────────────────────────
// Elegant ancient city. Permanent safe zone. Spawn {x:16, y:19}
// Portal at {x:15, y:22} → meadow_hub (return)
// cols: 0         1         2         3
//       01234567890123456789012345678901
const RAW_AURELION: string[] = [
  /* r0 */ "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  /* r1 */ "RppppppppppppppppppppppppppppppR",
  /* r2 */ "RplllpppppppppppppppppppplllpppR",
  /* r3 */ "RppppppRRRpppppppppppRRRppppppR",
  /* r4 */ "RppppppRppRppppPpppppRppRpppppR",
  /* r5 */ "RppppppRppRpppppppppRppRpppppppR",
  /* r6 */ "RppppppRRRppppppppppRRRppppppppR",
  /* r7 */ "RppppppppppppppppppppppppppppppR",
  /* r8 */ "RpplppppppppppppppppppppplppppR",
  /* r9 */ "RppppppppppppppppppppppppppppppR",
  /* r10*/ "RppRRppppppppppppppppppppRRpppR",
  /* r11*/ "RppRRpppppfpppppppfppppppRRpppR",
  /* r12*/ "RppppppppppppppppppppppppppppppR",
  /* r13*/ "RpppppplppppppppppplpppppppppppR",
  /* r14*/ "RppppppppppppppppppppppppppppppR",
  /* r15*/ "RppppppppppppppppppppppppppppppR",
  /* r16*/ "RppppppppppppppppppppppppppppppR",
  /* r17*/ "RppppppppppRRpppRRpppppppppppppR",
  /* r18*/ "RppfpppppppRRpppRRpppppfpppppppR",
  /* r19*/ "RppppppppppppppppppppppppppppppR",
  /* r20*/ "RppppppppppppppppppppppppppppppR",
  /* r21*/ "RppppppppppppppppppppppppppppppR",
  /* r22*/ "RpppppppppppppPppppppppppppppppR",
  /* r23*/ "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
];

// ─── BOSS CHAMBER — 32×22 ─────────────────────────────────────────────────────
// Large open arena for Stone Warden boss fight. Spawn {x:16, y:18}
// Portal at {x:13..18, y:20} → ancient_ruins_deep (exit)
// Boss spawn center {x:16, y:3}
// cols: 0         1         2         3
//       01234567890123456789012345678901
const RAW_BOSS_CHAMBER: string[] = [
  /* r0 */ "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
  /* r1 */ "r..............................r",
  /* r2 */ "r..............................r",
  /* r3 */ "r..r........................r..r",
  /* r4 */ "r..............................r",
  /* r5 */ "r..............................r",
  /* r6 */ "r..............................r",
  /* r7 */ "r..............................r",
  /* r8 */ "r..r........................r..r",
  /* r9 */ "r..............................r",
  /* r10*/ "r..............................r",
  /* r11*/ "r..............................r",
  /* r12*/ "r..............................r",
  /* r13*/ "r..r........................r..r",
  /* r14*/ "r..............................r",
  /* r15*/ "r..............................r",
  /* r16*/ "r..............................r",
  /* r17*/ "r..............................r",
  /* r18*/ "r..............................r",
  /* r19*/ "r..............................r",
  /* r20*/ "rrrrrrrrrrrrrPPPPPrrrrrrrrrrrrrr",
  /* r21*/ "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
];

// ─── CURSED SWAMP — 40×30 ─────────────────────────────────────────────────────
// Murky swamp zone. Bog Witch / Swamp Lurker / Mud Golem. Spawn {x:20, y:26}
// Portal at {x:20, y:27} ← dark_forest (entry south)
// Portal at {x:20, y:27} → dark_forest (return)
// cols: 0         1         2         3
//       0123456789012345678901234567890123456789
const RAW_CURSED_SWAMP: string[] = [
  /* r0 */ "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  /* r1 */ "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  /* r2 */ "QQQQQgggggQQQQQQQQgggggggQQQQgggggQQQQQ",
  /* r3 */ "QQQQQgTgggQQQQQQQQgggTgggQQQQgggTgQQQQQ",
  /* r4 */ "QQQQQgggggQQQQQQQQggggggQQQQQgggggQQQQQ",
  /* r5 */ "QQQQQgggggQQQQpppppQQQQQQQQQpppQgggggQQ",
  /* r6 */ "QQQQpppppppQQQpQQQpQQQQQQQQQpQQQpppppQQ",
  /* r7 */ "QQQQpQQQQQpQQQpQQQpQQQQQQQQQpQQQQQQpQQQ",
  /* r8 */ "QQQQpQQQQQpppppQQQpppppppppppQQQQQQpQQQ",
  /* r9 */ "QQQQpQQQQQQQQQQQQQQQQQQQQQQQQQQQQQpQQQ",
  /* r10*/ "QQQQgggggggQQQQQQQgggggggggQQQQQQQpQQQQ",
  /* r11*/ "QQQQgTgTgggQQQQQQQgggTgggggQQQQQQQpQQQQ",
  /* r12*/ "QQQQgggggggQQQQQQQgggggggggQQQQQQQpQQQQ",
  /* r13*/ "QQQQgggggggQQQQQQQgggggggggQQQQQgggggQQ",
  /* r14*/ "QQQppppppppppppppppppppppppppppppgTgggQQ",
  /* r15*/ "QQQpQQQQQQQQQQQQQQQQQQQQQQQQQQppgggggQQ",
  /* r16*/ "QQQpQQQQQQQQQQQQQQQQQQQQQQQQQQpQQQQQQQQ",
  /* r17*/ "QQQpQQQggggggQQQQgggggQQQQQQQQpQQQQQQQQ",
  /* r18*/ "QQQpQQQgTgTggQQQQggTggQQQQQQQQpQQQQQQQQ",
  /* r19*/ "QQQpQQQgggggpppppppgggQQQQQQQQpQQQQQQQQ",
  /* r20*/ "QQQpQQQgggggpQQQQQpgggQQQQQQQQpQQQQQQQQ",
  /* r21*/ "QQQppppgggggpQQQQQpgggpppppppppQQQQQQQQ",
  /* r22*/ "QQQQQQQQQQQQpQQQQQpQQQQQQQQQQQQQQQQQQQQ",
  /* r23*/ "QQQQQQggggggpQQQQQpggggggQQQQQQQQQQQQQQ",
  /* r24*/ "QQQQQQgTgTggpQQQQQpggTgggQQQQQQQQQQQQQQ",
  /* r25*/ "QQQQQQgggggppppppppgggggpppppppQQQQQQQQ",
  /* r26*/ "QQQQQQgggggQQQQQQQgggggQQQQQQpQQQQQQQQQ",
  /* r27*/ "QQQQQQQQQQQQQQQQQQQQPQQQQQQQpQQQQQQQQQQ",
  /* r28*/ "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  /* r29*/ "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
];

// ─── FLOATING RUINS — 40×30 ───────────────────────────────────────────────────
// Sky platforms with ancient ruins. Ruin Specter / Ancient Guardian / Sky Serpent.
// Spawn {x:20, y:25}
// Portal at {x:20, y:26} ← ancient_ruins (entry south)
// Portal at {x:20, y:26} → ancient_ruins (return)
// cols: 0         1         2         3
//       0123456789012345678901234567890123456789
const RAW_FLOATING_RUINS: string[] = [
  /* r0 */ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  /* r1 */ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  /* r2 */ "VVVVKKKKKKKKKVVVVVVKKKKKKKKKKVVVVVVVVVVV",
  /* r3 */ "VVVVKXXXXXXXKVVVVVVKXXXXXXXXXKVVVVVVVVVV",
  /* r4 */ "VVVVKXXXXXXXKVVVVVVKXXXXXXXXXKVVVVVVVVVV",
  /* r5 */ "VVVVKKKKKKKKKVVVVVVKKKKKKKKKKKVVVVVVVVVV",
  /* r6 */ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVv",
  /* r7 */ "VVVVVVVKKKKKKKKKKKKKKKKKKKKVVVVVVVVVVVVVV",
  /* r8 */ "VVVVVVVKXXXXXXXXXXXXXXXXXXXKVVVVVVVVVVVVV",
  /* r9 */ "VVVVVVVKXXXXXXXXXXXXXXXXXXXKVVVVKKKKKVVVV",
  /* r10*/ "VVVVVVVKXXXXXXXXXXXXXXXXXXXKVVVVKXXXKVVVV",
  /* r11*/ "VVVVVVVKKKKKKKKKKKKKKKKKKKKKVVVVKXXXKVVVV",
  /* r12*/ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVKKKKKVVVV",
  /* r13*/ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVv",
  /* r14*/ "VVVVKKKKKKKKKKKKVVVVVVVVVVVVVVVVVVVVVVVVV",
  /* r15*/ "VVVVKXXXXXXXXXXKVVVVVVKKKKKKKKKKKKKVVVVVV",
  /* r16*/ "VVVVKXXXXXXXXXXKVVVVVVKXXXXXXXXXXXKVVVVVV",
  /* r17*/ "VVVVKXXXXXXXXXXKKKKKKKKXXXXXXXXXXXKVVVVVV",
  /* r18*/ "VVVVKXXXXXXXXXXXXXXXXXXXXXXXXXXXXXKVVVVVV",
  /* r19*/ "VVVVKXXXXXXXXXXXXXXXXXXXXXXXXXXXXXKVVVVVV",
  /* r20*/ "VVVVKKKKKKKKKKKKVVVVVVKKKKKKKKKKKKKVVVVVV",
  /* r21*/ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVv",
  /* r22*/ "VVVVVVVVVVVVKKKKKKKKKKKKKKKKKVVVVVVVVVVVV",
  /* r23*/ "VVVVVVVVVVVVKXXXXXXXXXXXXXXXKVVVVVVVVVVVV",
  /* r24*/ "VVVVVVVVVVVVKXXXXXXXXXXXXXXXKVVVVVVVVVVVV",
  /* r25*/ "VVVVVVVVVVVVKXXXXXXXXXXXXXXXKVVVVVVVVVVVV",
  /* r26*/ "VVVVVVVVVVVVKXXXXXXXXPXXXXXXKVVVVVVVVVVVV",
  /* r27*/ "VVVVVVVVVVVVKKKKKKKKKKKKKKKKKVVVVVVVVVVVV",
  /* r28*/ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  /* r29*/ "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
];

// ─── PIRATE ISLAND — 32×24 ───────────────────────────────────────────────────
// PVP zone. Connected to Meadow Hub by bridge (west edge rows 10-12).
// Sandy tropical island with pirate camp in center.
// Spawn {x:4, y:12} — bridge arrival from west
// W-edge x=0 y:10-12 → bridge back to meadow_hub
// cols: 0         1         2         3
//       01234567890123456789012345678901
const RAW_PIRATE_ISLAND: string[] = [
  /* r0 */ "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  /* r1 */ "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~@@",
  /* r2 */ "~~~~~~~~~~~~~,,,,,,,,,,,,,,,,~@@",
  /* r3 */ "~~~~~~~~~~~~,AAAALAAAAAALAAA,,~~",
  /* r4 */ "~~~~~~~~~~~,AAAAAAAAAAAAAAAA,A,~",
  /* r5 */ "~~~~~~~~~~,AAAALAAAAAAAAAAAAAA,~",
  /* r6 */ "~~~~~~~~~,AAAAAAAAAAAAAAAAAAA,,~",
  /* r7 */ "~~~~~~~~~,AAAAAAAALAAAAAAAAAA,,~",
  /* r8 */ "~~~~~~~~~,AAAAAAAAAAAAAAAAAAA,,~",
  /* r9 */ "~~~~~@@@~,AAAAAAAAAAAAAAAAAAA,,~",
  /* r10*/ "BBBBBBBBA,AAAAAAAAAAAAAAAAAAA,,~",
  /* r11*/ "BBBBBBBBA,AAAAAAAAAAAAAAAAAAA,,~",
  /* r12*/ "BBBBBBBBA,AAAAAAAAAAAAAAAAAAA,,~",
  /* r13*/ "~~~~~@@@~,AAAAAAAAAAAAAAAAAAA,,~",
  /* r14*/ "~~~~~~~~~~,AAAAAAAAAAAAAAAAAAA,,",
  /* r15*/ "~~~~~~~~~~,AAALAAAAAAAAALAAAA,,~",
  /* r16*/ "~~~~~~~~~~~,AAAAAAAAAAAAAAAA,,~~",
  /* r17*/ "~~~~~~~~~~~,AAAAAAAAPAAAAAAA,,~~",
  /* r18*/ "~~~~~~~~~~~,AAALAAAAAAAAALA,,~~~",
  /* r19*/ "~~~~~~~~~~~~,AAAAAAAAAAAAA,,~~~~",
  /* r20*/ "~~~~~~~~~~~~~,AAAAAAAAAAAA,,~~~~",
  /* r21*/ "~~~~~~~~~~~~~,,AAAAAAAAAA,,,~~~~",
  /* r22*/ "~~~~~~~~~~~~~~,,,,,,,,,,,,~~~~~~",
  /* r23*/ "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
];

// ─── CURSED GALLEON — 32×28 ──────────────────────────────────────────────────
// Haunted ship interior. PVP zone, high-level EXP map.
// Access: portal from pirate_island
// Sections: Open Deck (rows 1-17), Below Deck (rows 18-22), Captain's Quarters (rows 4-10, cols 22-30)
// Spawn {x:8, y:14} — open deck mid-ship
// Return portal {x:4, y:14} — stern of ship
// cols: 0         1         2         3
//       01234567890123456789012345678901
// O = ship_water (NOT walkable — ocean around ship)
// H = ship_rail  (NOT walkable — railing/edge)
// D = wood_plank (walkable — main deck floor)
// C = captain_floor (walkable — captain's quarters)
// S = stair_down (below deck entrance)
// U = stair_up   (below deck exit)
// P = portal     (return to pirate_island)
// r = stone wall (room divider — NOT walkable)
const RAW_CURSED_GALLEON: string[] = [
  /* r0  */ "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO",
  /* r1  */ "OOHHHHHHHHHHHHHHHHHHHHHHHHHHHHOO",
  /* r2  */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r3  */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r4  */ "OOHDDDDDDDDDDDDDDDDRRRCCCCCCCCHO",
  /* r5  */ "OOHDDDDDDDDDDDDDDDDRCCCCCCCCCCHO",
  /* r6  */ "OOHDDDDDDDDDDDDDDDDRCCCCCCCCCCHO",
  /* r7  */ "OOHDDDDDDDDDDDDDDDDRCCCCCCCCCCHO",
  /* r8  */ "OOHDDDDDDDDDDDDDDDDRCCCCCCCCCCHO",
  /* r9  */ "OOHDDDDDDDDDDDDDDDDRCCCCCCCCCCHO",
  /* r10 */ "OOHDDDDDDDDDDDDDDDDRRRCCCCCCCCHO",
  /* r11 */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r12 */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r13 */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r14 */ "OOHPDDDDDDDDDDDDDDDDDDDDDDDDDHOO",
  /* r15 */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r16 */ "OOHDDDDDDDDDDDDDDDDDDDDDDDDDDHO",
  /* r17 */ "OOHDDDDDDDSSSSSSSSSSSSSSSSSSHooO",
  /* r18 */ "OOHDDDDDDDUUUUUUUUUUUUUUUUUHooO",
  /* r19 */ "OOrDDDDDDDDDDDDDDDDDDDDDDDDDrOO",
  /* r20 */ "OOrDDDDDDDDDDDDDDDDDDDDDDDDDrOO",
  /* r21 */ "OOrDDDDDDDDDDDDDDDDDDDDDDDDDrOO",
  /* r22 */ "OOrDDDDDDDDDDDDDDDDDDDDDDDDDrOO",
  /* r23 */ "OOHrrrrrrrrrrrrrrrrrrrrrrrrrrHOO",
  /* r24 */ "OOHHHHHHHHHHHHHHHHHHHHHHHHHHHHOO",
  /* r25 */ "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO",
  /* r26 */ "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO",
  /* r27 */ "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO",
];

// ─── THUNDER ISLE — 22×18 ─────────────────────────────────────────────────────
// Stormy high-level EXP island. Storm Sprite / Thunder Golem / Lightning Drake.
// Spawn {x:11, y:9} — central rocky plateau. Portal at {x:2,y:9} → dark_forest.
// cols: 0         1         2
//       0123456789012345678901
const RAW_THUNDER_ISLE: string[] = [
  /* r0 */ "~~~~~~~~~~~~~~~~~~~~~~",
  /* r1 */ "~~~~~~~~~~~~~~~~~~~~~~",
  /* r2 */ "~~~~,,,,,,,,,,,,,,~~~~",
  /* r3 */ "~~~,rrrrrrrrrrrrrr,~~~",
  /* r4 */ "~~~,rr..........rr,~~~",
  /* r5 */ "~~~,r............r,~~~",
  /* r6 */ "~~~,r............r,~~~",
  /* r7 */ "~~~,r............r,~~~",
  /* r8 */ "~~~,r............r,~~~",
  /* r9 */ "~~~,Pr...........r,~~~",
  /* r10*/ "~~~,r............r,~~~",
  /* r11*/ "~~~,r............r,~~~",
  /* r12*/ "~~~,r............r,~~~",
  /* r13*/ "~~~,r............r,~~~",
  /* r14*/ "~~~,rr..........rr,~~~",
  /* r15*/ "~~~~,,,,,,,,,,,,,,~~~~",
  /* r16*/ "~~~~~~~~~~~~~~~~~~~~~~",
  /* r17*/ "~~~~~~~~~~~~~~~~~~~~~~",
];

const TRANSITIONS: Record<ZoneId, ZoneTransition[]> = {
  meadow_hub: [
    {
      fromZone: "meadow_hub",
      toZone: "wilderness",
      triggerTile: { xRange: [16, 24], y: 33 },
      spawnTile: { x: 19, y: 1 },
      label: "→ Wilderness",
      transitionType: "edge_exit",
    },
    {
      fromZone: "meadow_hub",
      toZone: "wolf_forest",
      triggerTile: { x: 39, yRange: [10, 20] },
      spawnTile: { x: 34, y: 15 },
      label: "→ Wolf Forest",
      transitionType: "edge_exit",
    },
    {
      fromZone: "meadow_hub",
      toZone: "ancient_ruins",
      triggerTile: { x: 0, yRange: [10, 20] },
      spawnTile: { x: 34, y: 15 },
      label: "→ Ancient Ruins",
      transitionType: "edge_exit",
    },
    {
      fromZone: "meadow_hub",
      toZone: "crystal_ruins",
      triggerTile: { x: 20, y: 5 },
      spawnTile: { x: 15, y: 12 },
      label: "→ Crystal Ruins",
      transitionType: "portal",
    },
    {
      fromZone: "meadow_hub",
      toZone: "hub_basement",
      triggerTile: { x: 10, y: 10 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Hub Basement",
      transitionType: "stair_down",
    },
    {
      fromZone: "meadow_hub",
      toZone: "goblin_warrens",
      triggerTile: { x: 30, y: 10 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Goblin Warrens",
      transitionType: "stair_down",
    },
    {
      fromZone: "meadow_hub",
      toZone: "cave_interior",
      triggerTile: { x: 5, y: 20 },
      spawnTile: { x: 18, y: 4 },
      label: "↓ Cave Interior",
      transitionType: "stair_down",
    },
    {
      fromZone: "meadow_hub",
      toZone: "aurelion",
      triggerTile: { x: 35, y: 5 },
      spawnTile: { x: 16, y: 21 },
      label: "→ Aurelion",
      transitionType: "portal",
    },
    {
      fromZone: "meadow_hub",
      toZone: "pirate_island",
      triggerTile: { x: 39, yRange: [15, 20] },
      spawnTile: { x: 4, y: 12 },
      label: "→ Pirate Island",
      transitionType: "edge_exit",
    },
  ],

  wilderness: [
    {
      fromZone: "wilderness",
      toZone: "meadow_hub",
      triggerTile: { xRange: [15, 23], y: 0 },
      spawnTile: { x: 20, y: 32 },
      label: "→ Meadow Hub",
      transitionType: "edge_exit",
    },
    {
      fromZone: "wilderness",
      toZone: "bear_forest",
      triggerTile: { x: 37, yRange: [10, 22] },
      spawnTile: { x: 1, y: 15 },
      label: "→ Bear Forest",
      transitionType: "edge_exit",
    },
    {
      fromZone: "wilderness",
      toZone: "forest_depths",
      triggerTile: { x: 10, y: 10 },
      spawnTile: { x: 16, y: 26 },
      label: "→ Forest Depths",
      transitionType: "portal",
    },
    {
      fromZone: "wilderness",
      toZone: "wilderness_dungeon",
      triggerTile: { x: 28, y: 25 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Wilderness Dungeon",
      transitionType: "stair_down",
    },
    {
      fromZone: "wilderness",
      toZone: "wolf_forest",
      triggerTile: { xRange: [15, 23], y: 31 },
      spawnTile: { x: 18, y: 1 },
      label: "→ Wolf Forest",
      transitionType: "edge_exit",
    },
  ],

  wolf_forest: [
    {
      fromZone: "wolf_forest",
      toZone: "wilderness",
      triggerTile: { xRange: [14, 22], y: 0 },
      spawnTile: { x: 19, y: 30 },
      label: "→ Wilderness",
      transitionType: "edge_exit",
    },
    {
      fromZone: "wolf_forest",
      toZone: "tiger_jungle",
      triggerTile: { x: 35, yRange: [10, 20] },
      spawnTile: { x: 1, y: 14 },
      label: "→ Tiger Jungle",
      transitionType: "edge_exit",
    },
    {
      fromZone: "wolf_forest",
      toZone: "bear_forest",
      triggerTile: { x: 18, y: 5 },
      spawnTile: { x: 18, y: 15 },
      label: "→ Bear Forest",
      transitionType: "portal",
    },
    {
      fromZone: "wolf_forest",
      toZone: "forest_dungeon",
      triggerTile: { x: 9, y: 25 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Forest Dungeon",
      transitionType: "stair_down",
    },
  ],

  tiger_jungle: [
    {
      fromZone: "tiger_jungle",
      toZone: "wolf_forest",
      triggerTile: { x: 0, yRange: [10, 18] },
      spawnTile: { x: 34, y: 15 },
      label: "→ Wolf Forest",
      transitionType: "edge_exit",
    },
    {
      fromZone: "tiger_jungle",
      toZone: "bear_forest",
      triggerTile: { xRange: [12, 20], y: 0 },
      spawnTile: { x: 18, y: 28 },
      label: "→ Bear Forest",
      transitionType: "edge_exit",
    },
    {
      fromZone: "tiger_jungle",
      toZone: "deep_cave",
      triggerTile: { x: 17, y: 24 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Deep Cave",
      transitionType: "stair_down",
    },
    {
      fromZone: "tiger_jungle",
      toZone: "crystal_ruins",
      triggerTile: { x: 28, y: 14 },
      spawnTile: { x: 15, y: 12 },
      label: "→ Crystal Ruins",
      transitionType: "portal",
    },
  ],

  bear_forest: [
    {
      fromZone: "bear_forest",
      toZone: "wilderness",
      triggerTile: { x: 0, yRange: [10, 20] },
      spawnTile: { x: 36, y: 16 },
      label: "→ Wilderness",
      transitionType: "edge_exit",
    },
    {
      fromZone: "bear_forest",
      toZone: "forest_depths",
      triggerTile: { x: 35, yRange: [10, 20] },
      spawnTile: { x: 1, y: 14 },
      label: "→ Forest Depths",
      transitionType: "edge_exit",
    },
    {
      fromZone: "bear_forest",
      toZone: "tiger_jungle",
      triggerTile: { xRange: [14, 22], y: 29 },
      spawnTile: { x: 16, y: 1 },
      label: "→ Tiger Jungle",
      transitionType: "edge_exit",
    },
    {
      fromZone: "bear_forest",
      toZone: "bat_cave",
      triggerTile: { x: 18, y: 25 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Bat Cave",
      transitionType: "stair_down",
    },
  ],

  ancient_ruins: [
    {
      fromZone: "ancient_ruins",
      toZone: "meadow_hub",
      triggerTile: { x: 35, yRange: [10, 20] },
      spawnTile: { x: 1, y: 15 },
      label: "→ Meadow Hub",
      transitionType: "edge_exit",
    },
    {
      fromZone: "ancient_ruins",
      toZone: "crystal_ruins",
      triggerTile: { xRange: [14, 22], y: 0 },
      spawnTile: { x: 15, y: 22 },
      label: "→ Crystal Ruins",
      transitionType: "edge_exit",
    },
    {
      fromZone: "ancient_ruins",
      toZone: "ancient_ruins_deep",
      triggerTile: { x: 18, y: 25 },
      spawnTile: { x: 18, y: 15 },
      label: "→ Ancient Ruins Deep",
      transitionType: "portal",
    },
    {
      fromZone: "ancient_ruins",
      toZone: "deep_cave",
      triggerTile: { x: 28, y: 10 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Deep Cave",
      transitionType: "stair_down",
    },
    {
      fromZone: "ancient_ruins",
      toZone: "floating_ruins",
      triggerTile: { x: 8, y: 13 },
      spawnTile: { x: 20, y: 25 },
      label: "→ Floating Ruins",
      transitionType: "portal",
    },
  ],

  crystal_ruins: [
    {
      fromZone: "crystal_ruins",
      toZone: "ancient_ruins",
      triggerTile: { xRange: [11, 19], y: 23 },
      spawnTile: { x: 18, y: 1 },
      label: "→ Ancient Ruins",
      transitionType: "edge_exit",
    },
    {
      fromZone: "crystal_ruins",
      toZone: "forest_depths",
      triggerTile: { x: 0, yRange: [8, 16] },
      spawnTile: { x: 32, y: 14 },
      label: "→ Forest Depths",
      transitionType: "edge_exit",
    },
    {
      fromZone: "crystal_ruins",
      toZone: "tiger_jungle",
      triggerTile: { x: 15, y: 5 },
      spawnTile: { x: 17, y: 14 },
      label: "→ Tiger Jungle",
      transitionType: "portal",
    },
  ],

  forest_depths: [
    {
      fromZone: "forest_depths",
      toZone: "bear_forest",
      triggerTile: { x: 0, yRange: [10, 18] },
      spawnTile: { x: 34, y: 15 },
      label: "→ Bear Forest",
      transitionType: "edge_exit",
    },
    {
      fromZone: "forest_depths",
      toZone: "crystal_ruins",
      triggerTile: { x: 33, yRange: [10, 18] },
      spawnTile: { x: 1, y: 12 },
      label: "→ Crystal Ruins",
      transitionType: "edge_exit",
    },
    {
      fromZone: "forest_depths",
      toZone: "dark_forest",
      triggerTile: { xRange: [12, 20], y: 27 },
      spawnTile: { x: 18, y: 1 },
      label: "→ Dark Forest",
      transitionType: "edge_exit",
    },
    {
      fromZone: "forest_depths",
      toZone: "forest_dungeon",
      triggerTile: { x: 17, y: 24 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Forest Dungeon",
      transitionType: "stair_down",
    },
    {
      fromZone: "forest_depths",
      toZone: "wolf_forest",
      triggerTile: { x: 28, y: 7 },
      spawnTile: { x: 18, y: 15 },
      label: "→ Wolf Forest",
      transitionType: "portal",
    },
  ],

  cyclops_lair: [
    {
      fromZone: "cyclops_lair",
      toZone: "ancient_ruins",
      triggerTile: { xRange: [12, 20], y: 0 },
      spawnTile: { x: 18, y: 26 },
      label: "→ Ancient Ruins",
      transitionType: "edge_exit",
    },
    {
      fromZone: "cyclops_lair",
      toZone: "deep_cave",
      triggerTile: { x: 16, y: 22 },
      spawnTile: { x: 11, y: 4 },
      label: "↓ Deep Cave",
      transitionType: "stair_down",
    },
    {
      fromZone: "cyclops_lair",
      toZone: "wilderness",
      triggerTile: { x: 28, y: 13 },
      spawnTile: { x: 19, y: 16 },
      label: "→ Wilderness",
      transitionType: "portal",
    },
  ],

  hub_basement: [
    {
      fromZone: "hub_basement",
      toZone: "meadow_hub",
      triggerTile: { x: 11, y: 16 },
      spawnTile: { x: 10, y: 11 },
      label: "↑ Meadow Hub",
      transitionType: "stair_up",
    },
    {
      fromZone: "hub_basement",
      toZone: "bat_cave",
      triggerTile: { x: 18, y: 9 },
      spawnTile: { x: 11, y: 4 },
      label: "→ Bat Cave",
      transitionType: "portal",
    },
  ],

  goblin_warrens: [
    {
      fromZone: "goblin_warrens",
      toZone: "meadow_hub",
      triggerTile: { x: 11, y: 16 },
      spawnTile: { x: 30, y: 11 },
      label: "↑ Meadow Hub",
      transitionType: "stair_up",
    },
    {
      fromZone: "goblin_warrens",
      toZone: "wilderness_dungeon",
      triggerTile: { x: 18, y: 9 },
      spawnTile: { x: 11, y: 4 },
      label: "→ Wilderness Dungeon",
      transitionType: "portal",
    },
  ],

  bat_cave: [
    {
      fromZone: "bat_cave",
      toZone: "bear_forest",
      triggerTile: { x: 11, y: 16 },
      spawnTile: { x: 18, y: 24 },
      label: "↑ Bear Forest",
      transitionType: "stair_up",
    },
    {
      fromZone: "bat_cave",
      toZone: "hub_basement",
      triggerTile: { x: 4, y: 9 },
      spawnTile: { x: 11, y: 4 },
      label: "→ Hub Basement",
      transitionType: "portal",
    },
  ],

  wilderness_dungeon: [
    {
      fromZone: "wilderness_dungeon",
      toZone: "wilderness",
      triggerTile: { x: 11, y: 16 },
      spawnTile: { x: 28, y: 24 },
      label: "↑ Wilderness",
      transitionType: "stair_up",
    },
    {
      fromZone: "wilderness_dungeon",
      toZone: "goblin_warrens",
      triggerTile: { x: 18, y: 9 },
      spawnTile: { x: 11, y: 4 },
      label: "→ Goblin Warrens",
      transitionType: "portal",
    },
  ],

  forest_dungeon: [
    {
      fromZone: "forest_dungeon",
      toZone: "wolf_forest",
      triggerTile: { x: 11, y: 16 },
      spawnTile: { x: 9, y: 24 },
      label: "↑ Wolf Forest",
      transitionType: "stair_up",
    },
    {
      fromZone: "forest_dungeon",
      toZone: "deep_cave",
      triggerTile: { x: 18, y: 9 },
      spawnTile: { x: 11, y: 4 },
      label: "→ Deep Cave",
      transitionType: "portal",
    },
  ],

  deep_cave: [
    {
      fromZone: "deep_cave",
      toZone: "cyclops_lair",
      triggerTile: { x: 11, y: 16 },
      spawnTile: { x: 16, y: 21 },
      label: "↑ Cyclops Lair",
      transitionType: "stair_up",
    },
    {
      fromZone: "deep_cave",
      toZone: "forest_dungeon",
      triggerTile: { x: 4, y: 9 },
      spawnTile: { x: 11, y: 4 },
      label: "→ Forest Dungeon",
      transitionType: "portal",
    },
  ],

  dark_forest: [
    {
      fromZone: "dark_forest",
      toZone: "forest_depths",
      triggerTile: { xRange: [14, 22], y: 0 },
      spawnTile: { x: 17, y: 26 },
      label: "→ Forest Depths",
      transitionType: "edge_exit",
    },
    {
      fromZone: "dark_forest",
      toZone: "forest_depths",
      triggerTile: { xRange: [14, 22], y: 29 },
      spawnTile: { x: 17, y: 26 },
      label: "→ Forest Depths",
      transitionType: "edge_exit",
    },
    {
      fromZone: "dark_forest",
      toZone: "ancient_ruins_deep",
      triggerTile: { x: 16, y: 25 },
      spawnTile: { x: 18, y: 15 },
      label: "→ Ancient Ruins Deep",
      transitionType: "portal",
    },
    {
      fromZone: "dark_forest",
      toZone: "cursed_swamp",
      triggerTile: { x: 30, y: 15 },
      spawnTile: { x: 20, y: 26 },
      label: "→ Cursed Swamp",
      transitionType: "portal",
    },
    {
      fromZone: "dark_forest",
      toZone: "thunder_isle",
      triggerTile: { x: 35, y: 15 },
      spawnTile: { x: 11, y: 9 },
      label: "→ Thunder Isle (Lv 18-32) ⚡",
      transitionType: "portal",
    },
  ],

  ancient_ruins_deep: [
    {
      fromZone: "ancient_ruins_deep",
      toZone: "ancient_ruins",
      triggerTile: { x: 18, y: 27 },
      spawnTile: { x: 18, y: 15 },
      label: "→ Ancient Ruins",
      transitionType: "portal",
    },
    {
      fromZone: "ancient_ruins_deep",
      toZone: "boss_chamber",
      triggerTile: { x: 18, y: 5 },
      spawnTile: { x: 16, y: 18 },
      label: "→ Boss Chamber",
      transitionType: "portal",
    },
  ],

  cave_interior: [
    {
      fromZone: "cave_interior",
      toZone: "meadow_hub",
      triggerTile: { x: 18, y: 26 },
      spawnTile: { x: 20, y: 17 },
      label: "↑ Meadow Hub",
      transitionType: "stair_up",
    },
  ],

  aurelion: [
    {
      fromZone: "aurelion",
      toZone: "meadow_hub",
      triggerTile: { xRange: [14, 20], y: 23 },
      spawnTile: { x: 20, y: 17 },
      label: "→ Meadow Hub",
      transitionType: "portal",
    },
  ],

  boss_chamber: [
    {
      fromZone: "boss_chamber",
      toZone: "ancient_ruins_deep",
      triggerTile: { xRange: [13, 19], y: 20 },
      spawnTile: { x: 18, y: 15 },
      label: "← Ancient Ruins",
      transitionType: "portal",
    },
  ],

  // ── New EXP zones ──
  cursed_swamp: [
    {
      fromZone: "cursed_swamp",
      toZone: "dark_forest",
      triggerTile: { x: 20, y: 27 },
      spawnTile: { x: 16, y: 24 },
      label: "→ Dark Forest",
      transitionType: "portal",
    },
  ],
  floating_ruins: [
    {
      fromZone: "floating_ruins",
      toZone: "ancient_ruins",
      triggerTile: { x: 20, y: 26 },
      spawnTile: { x: 18, y: 24 },
      label: "→ Ancient Ruins",
      transitionType: "portal",
    },
  ],
  // ── Pirate Island ──
  pirate_island: [
    {
      fromZone: "pirate_island",
      toZone: "meadow_hub",
      triggerTile: { x: 0, yRange: [10, 12] },
      spawnTile: { x: 38, y: 17 },
      label: "→ Meadow Hub",
      transitionType: "edge_exit",
    },
    {
      fromZone: "pirate_island",
      toZone: "meadow_hub",
      triggerTile: { x: 17, y: 17 },
      spawnTile: { x: 20, y: 17 },
      label: "→ Meadow Hub (Portal)",
      transitionType: "portal",
    },
    {
      fromZone: "pirate_island",
      toZone: "cursed_galleon",
      triggerTile: { x: 28, y: 12 },
      spawnTile: { x: 8, y: 14 },
      label: "→ The Cursed Galleon",
      transitionType: "portal",
    },
  ],
  // ── Cursed Galleon ──
  cursed_galleon: [
    {
      fromZone: "cursed_galleon",
      toZone: "pirate_island",
      triggerTile: { x: 4, y: 14 },
      spawnTile: { x: 28, y: 12 },
      label: "← Pirate Island",
      transitionType: "portal",
    },
  ],
  // ── Thunder Isle ──
  thunder_isle: [
    {
      fromZone: "thunder_isle",
      toZone: "dark_forest",
      triggerTile: { x: 2, y: 9 },
      spawnTile: { x: 34, y: 15 },
      label: "← Dark Forest",
      transitionType: "portal",
    },
  ],
};

// ─── Flat ZONE_TRANSITIONS array ──────────────────────────────────────────────
// Exported as a flat list for efficient runtime lookup.
export const ZONE_TRANSITIONS: ZoneTransition[] =
  Object.values(TRANSITIONS).flat();

// ─── NPC Definitions ──────────────────────────────────────────────────────────

const NPCS_BY_ZONE: Record<ZoneId, NpcDefinition[]> = {
  meadow_hub: [
    {
      id: "meadow_guard",
      name: "Guard Aldric",
      tileX: 18,
      tileY: 14,
      dialogue: [
        "Welcome, adventurer. The forest east holds danger but also great rewards.",
        "Prove your worth — slay 5 monsters in any EXP zone.",
        "Quest: First Steps \u2014 return when you've made your first five kills.",
      ],
      spriteType: "guard",
    },
    {
      id: "elder_mira",
      name: "Elder Mira",
      tileX: 20,
      tileY: 17,
      dialogue: [
        "Welcome to the Meadow Hub, traveler!",
        "Head south through the paths to reach the Wilderness.",
        "A glowing portal to the Crystal Ruins is to the north!",
        "Stairs to the east and west lead underground.",
        "Follow the paths — they always lead somewhere safe.",
      ],
      spriteType: "guide",
    },
    {
      id: "scout_renalt",
      name: "Scout Renalt",
      tileX: 25,
      tileY: 20,
      dialogue: [
        "Wolf Forest is through the east edge.",
        "Ancient Ruins lie to the west — trolls and skeletons lurk there.",
        "Bears prowl the forests beyond the Wilderness.",
        "Quest: Into the Dark — venture into the Forest to the south.",
      ],
      spriteType: "guard",
    },
    {
      id: "old_villager",
      name: "Old Villager",
      tileX: 12,
      tileY: 22,
      dialogue: [
        "I've heard tales of a great city to the north... Aurelion.",
        "They say magic flows through its very streets.",
        "The portal to the north should still work.",
        "Quest: The Ancient City — find and enter Aurelion.",
      ],
      spriteType: "villager",
    },
    {
      id: "meadow_merchant",
      name: "Merchant",
      tileX: 28,
      tileY: 14,
      dialogue: [
        "Finest potions and gear in the land!",
        "Don't let the prices fool you — quality comes at a fair cost.",
        "Gold talks.",
      ],
      spriteType: "shopkeeper",
    },
  ],
  wilderness: [],
  wolf_forest: [
    {
      id: "forest_hermit",
      name: "Forest Hermit",
      tileX: 18,
      tileY: 15,
      dialogue: [
        "These woods are thick with wolves...",
        "The Tiger Jungle lies east if you dare.",
        "A portal leads to the Bear Forest to the north.",
      ],
      spriteType: "guide",
    },
  ],
  tiger_jungle: [],
  bear_forest: [
    {
      id: "bear_hunter",
      name: "Bjorn the Hunter",
      tileX: 18,
      tileY: 15,
      dialogue: [
        "The bears here are enormous!",
        "Forest Depths lie to the east — goblins and trolls everywhere.",
        "A cave entrance leads down to the Bat Cave.",
      ],
      spriteType: "guard",
    },
  ],
  ancient_ruins: [
    {
      id: "ruin_scholar",
      name: "Scholar Yvette",
      tileX: 18,
      tileY: 15,
      dialogue: [
        "These ruins are ancient beyond memory.",
        "Skeletons and trolls now call this place home.",
        "Deep inside lies a portal to the Cyclops Lair.",
      ],
      spriteType: "guide",
    },
  ],
  crystal_ruins: [
    {
      id: "stone_sentinel",
      name: "Stone Sentinel",
      tileX: 15,
      tileY: 12,
      dialogue: [
        "These crystal formations pulse with strange energy.",
        "Crystal Golems are drawn here from the deep.",
        "A portal to the Tiger Jungle shines to the north.",
      ],
      spriteType: "guard",
    },
  ],
  forest_depths: [],
  cyclops_lair: [],
  hub_basement: [],
  goblin_warrens: [],
  bat_cave: [],
  wilderness_dungeon: [],
  forest_dungeon: [],
  deep_cave: [],
  dark_forest: [
    {
      id: "shadow_ranger",
      name: "Shadow Ranger",
      tileX: 18,
      tileY: 15,
      dialogue: [
        "The Dark Forest swallows light itself.",
        "Shadow Wolves lurk in every shadow here.",
        "Ancient Ruins Deep lie through the portal — only the strongest survive.",
      ],
      spriteType: "guard",
    },
  ],
  ancient_ruins_deep: [
    {
      id: "ruin_guardian",
      name: "Ruin Guardian",
      tileX: 18,
      tileY: 10,
      dialogue: [
        "These ancient depths have slept for centuries.",
        "Stone Golems guard the innermost chambers.",
        "The portal leads back to the surface ruins.",
      ],
      spriteType: "guide",
    },
  ],
  cave_interior: [
    {
      id: "cave_hermit",
      name: "Cave Hermit",
      tileX: 10,
      tileY: 10,
      dialogue: [
        "These caves stretch deep into the earth.",
        "Cave Bats swarm in groups — watch your flanks!",
        "A Cave Troll is rumored to dwell in the deepest chamber.",
        "The stairs will take you back to the Meadow.",
      ],
      spriteType: "guide",
    },
  ],
  aurelion: [
    {
      id: "aurelion_guard",
      name: "City Guard",
      tileX: 16,
      tileY: 20,
      dialogue: [
        "You've found Aurelion. Few make the journey.",
        "This city has stood for a thousand years and will stand a thousand more.",
        "The blue portal near the gate leads back to Meadow Hub.",
      ],
      spriteType: "guard",
    },
    {
      id: "mage_trainer",
      name: "Mage Trainer",
      tileX: 8,
      tileY: 6,
      dialogue: [
        "Magic is not merely power — it is art. Each spell a brushstroke.",
        "Master all four elements and you will be unstoppable.",
        "Quest: Arcane Study — cast all 4 spells in combat at least once.",
      ],
      spriteType: "guide",
    },
    {
      id: "warrior_trainer",
      name: "Warrior Trainer",
      tileX: 24,
      tileY: 6,
      dialogue: [
        "Steel yourself, warrior. True strength is tested not in training but in battle.",
        "Show me what you are made of.",
        "Quest: Warrior Trial — kill 10 enemies using Shield skill.",
      ],
      spriteType: "guard",
    },
    {
      id: "aurelion_merchant",
      name: "Merchant",
      tileX: 16,
      tileY: 8,
      dialogue: [
        "Aurelion's finest goods, traveler.",
        "Rare items found nowhere else in the world.",
        "You've earned the right to browse.",
      ],
      spriteType: "shopkeeper",
    },
    {
      id: "oracle",
      name: "Oracle",
      tileX: 16,
      tileY: 4,
      dialogue: [
        "I have seen visions... a great stone guardian sleeping in the deep chamber.",
        "Pirates overrun the southern shores. The world waits for a hero.",
        "Quest: Pirate Slayer — kill 20 pirates on Pirate Island.",
        "Quest: Face the Warden — enter the Boss Chamber.",
      ],
      spriteType: "guide",
    },
    {
      id: "innkeeper",
      name: "Innkeeper",
      tileX: 10,
      tileY: 12,
      dialogue: [
        "Weary traveler, you are welcome here.",
        "Aurelion opens its doors to all who seek greatness.",
        "Rest, and continue your journey stronger.",
      ],
      spriteType: "villager",
    },
    {
      id: "crafting_table",
      name: "Crafting Table",
      tileX: 22,
      tileY: 12,
      dialogue: [
        "I can craft powerful items for you!",
        "Bring me the right materials and I'll forge you something worthy of a true hero.",
      ],
      spriteType: "shopkeeper",
    },
    {
      id: "guild_master",
      name: "Guild Master",
      tileX: 26,
      tileY: 12,
      dialogue: [
        "Welcome, adventurer. Guilds are the backbone of Aurelion.",
        "Form a band of heroes, share your strength.",
        "Creating a guild costs 500 gold — a small price for unity.",
        "Open the Guild Hall to manage your guild or create one.",
      ],
      spriteType: "guard",
    },
  ],
  boss_chamber: [],
  cursed_swamp: [
    {
      id: "swamp_wanderer",
      name: "Swamp Wanderer",
      tileX: 20,
      tileY: 25,
      dialogue: [
        "You've entered the Cursed Swamp. Few leave unchanged.",
        "The Bog Witches poison everything they touch.",
        "Watch your step — Swamp Lurkers hide beneath the mire.",
        "The Mud Golems are slow, but their slams crack stone.",
        "Return through the portal when you've had enough.",
      ],
      spriteType: "guide",
    },
  ],
  floating_ruins: [
    {
      id: "ancient_specter",
      name: "Ancient Specter",
      tileX: 20,
      tileY: 24,
      dialogue: [
        "These platforms float above the world itself...",
        "The Ancient Guardians have stood here longer than memory.",
        "Mage spells pierce their stone armor — warriors struggle here.",
        "A Sky Serpent circles the highest platforms. Rare, but deadly.",
        "The portal will return you to the Ancient Ruins below.",
      ],
      spriteType: "guide",
    },
  ],
  pirate_island: [
    {
      id: "pirate_captive",
      name: "Stranded Sailor",
      tileX: 16,
      tileY: 13,
      dialogue: [
        "You found me! I've been stranded here for weeks.",
        "Pirate Grunts patrol the whole island — watch out!",
        "The Gunners hang back and shoot from a distance.",
        "The Captain is rare but terrifying — spinning sword technique.",
        "Those cannons near the wrecked ship fire at anything that moves.",
        "Take the portal south or walk back across the bridge to safety.",
        "There's a red portal to the east — The Cursed Galleon awaits!",
        "The Galleon is haunted — Cursed Sailors, Skeleton Gunners, and worse...",
      ],
      spriteType: "guide",
    },
  ],
  thunder_isle: [
    {
      id: "storm_watcher",
      name: "Storm Watcher",
      tileX: 15,
      tileY: 8,
      dialogue: [
        "You've reached Thunder Isle. The storms here never stop.",
        "Storm Sprites are fast and erratic — don't let them surround you.",
        "Thunder Golems are slow but their shockwave hits hard — keep moving.",
        "The Lightning Drake is rare. If you see it, you'll know.",
        "The return portal near the west wall takes you back to the Dark Forest.",
      ],
      spriteType: "guide",
    },
  ],
  cursed_galleon: [
    {
      id: "galleon_ghost",
      name: "Spectral Crew Member",
      tileX: 14,
      tileY: 10,
      dialogue: [
        "You dare board The Cursed Galleon?",
        "Every soul here is cursed to serve the Captain forever.",
        "Cursed Sailors roam the open deck. Don't let them surround you.",
        "Skeleton Gunners keep their distance — close in fast.",
        "The Cursed Navigator teleports. Pin it against the railing.",
        "The Ship Captain rests in the quarters at the stern.",
        "At half health, the Captain summons two Cursed Sailors. Be ready.",
        "The return portal is near the entrance — run if you must.",
      ],
      spriteType: "guide",
    },
  ],
};

// ─── Build Zone Config ────────────────────────────────────────────────────────

function buildZone(
  id: ZoneId,
  name: string,
  raw: string[],
  width: number,
  height: number,
  spawnPoint: { x: number; y: number },
  isSafeZone: boolean,
  creatureDensity: ZoneConfig["creatureDensity"],
): ZoneConfig {
  const tiles = parseMapW(raw, width);
  return {
    id,
    name,
    tiles,
    width,
    height,
    transitions: TRANSITIONS[id],
    spawnPoint,
    isSafeZone,
    creatureDensity,
  };
}

// ─── WORLD_CONFIG ─────────────────────────────────────────────────────────────

export const WORLD_CONFIG: WorldConfig = {
  zones: {
    meadow_hub: buildZone(
      "meadow_hub",
      "Meadow Hub",
      RAW_MEADOW_HUB,
      40,
      34,
      { x: 20, y: 17 },
      true,
      "none",
    ),
    wilderness: buildZone(
      "wilderness",
      "Wilderness",
      RAW_WILDERNESS,
      38,
      32,
      { x: 19, y: 16 },
      false,
      "low",
    ),
    wolf_forest: buildZone(
      "wolf_forest",
      "Wolf Forest",
      RAW_WOLF_FOREST,
      36,
      30,
      { x: 18, y: 15 },
      false,
      "medium",
    ),
    tiger_jungle: buildZone(
      "tiger_jungle",
      "Tiger Jungle",
      RAW_TIGER_JUNGLE,
      34,
      28,
      { x: 17, y: 14 },
      false,
      "medium",
    ),
    bear_forest: buildZone(
      "bear_forest",
      "Bear Forest",
      RAW_BEAR_FOREST,
      36,
      30,
      { x: 18, y: 15 },
      false,
      "medium",
    ),
    ancient_ruins: buildZone(
      "ancient_ruins",
      "Ancient Ruins",
      RAW_ANCIENT_RUINS,
      36,
      30,
      { x: 18, y: 15 },
      false,
      "medium",
    ),
    crystal_ruins: buildZone(
      "crystal_ruins",
      "Crystal Ruins",
      RAW_CRYSTAL_RUINS,
      30,
      24,
      { x: 15, y: 12 },
      false,
      "high",
    ),
    forest_depths: buildZone(
      "forest_depths",
      "Forest Depths",
      RAW_FOREST_DEPTHS,
      34,
      28,
      { x: 17, y: 14 },
      false,
      "high",
    ),
    cyclops_lair: buildZone(
      "cyclops_lair",
      "Cyclops Lair",
      RAW_CYCLOPS_LAIR,
      32,
      26,
      { x: 16, y: 13 },
      false,
      "high",
    ),
    hub_basement: buildZone(
      "hub_basement",
      "Hub Basement",
      RAW_HUB_BASEMENT,
      22,
      18,
      { x: 11, y: 4 },
      false,
      "medium",
    ),
    goblin_warrens: buildZone(
      "goblin_warrens",
      "Goblin Warrens",
      RAW_GOBLIN_WARRENS,
      22,
      18,
      { x: 11, y: 4 },
      false,
      "medium",
    ),
    bat_cave: buildZone(
      "bat_cave",
      "Bat Cave",
      RAW_BAT_CAVE,
      22,
      18,
      { x: 11, y: 4 },
      false,
      "high",
    ),
    wilderness_dungeon: buildZone(
      "wilderness_dungeon",
      "Wilderness Dungeon",
      RAW_WILDERNESS_DUNGEON,
      22,
      18,
      { x: 11, y: 4 },
      false,
      "medium",
    ),
    forest_dungeon: buildZone(
      "forest_dungeon",
      "Forest Dungeon",
      RAW_FOREST_DUNGEON,
      22,
      18,
      { x: 11, y: 4 },
      false,
      "high",
    ),
    deep_cave: buildZone(
      "deep_cave",
      "Deep Cave",
      RAW_DEEP_CAVE,
      22,
      18,
      { x: 11, y: 4 },
      false,
      "high",
    ),
    dark_forest: buildZone(
      "dark_forest",
      "Dark Forest",
      RAW_DARK_FOREST,
      36,
      30,
      { x: 18, y: 15 },
      false,
      "high",
    ),
    ancient_ruins_deep: buildZone(
      "ancient_ruins_deep",
      "Ancient Ruins Deep",
      RAW_ANCIENT_RUINS_DEEP,
      36,
      30,
      { x: 18, y: 15 },
      false,
      "high",
    ),
    cave_interior: buildZone(
      "cave_interior",
      "Cave Interior",
      RAW_CAVE_INTERIOR,
      36,
      28,
      { x: 18, y: 4 },
      false,
      "high",
    ),
    aurelion: buildZone(
      "aurelion",
      "Aurelion",
      RAW_AURELION,
      32,
      24,
      { x: 16, y: 19 },
      true,
      "none",
    ),
    boss_chamber: buildZone(
      "boss_chamber",
      "Boss Chamber",
      RAW_BOSS_CHAMBER,
      32,
      22,
      { x: 16, y: 18 },
      false,
      "low",
    ),
    cursed_swamp: buildZone(
      "cursed_swamp",
      "Cursed Swamp",
      RAW_CURSED_SWAMP,
      40,
      30,
      { x: 20, y: 26 },
      false,
      "high",
    ),
    floating_ruins: buildZone(
      "floating_ruins",
      "Floating Ruins",
      RAW_FLOATING_RUINS,
      40,
      30,
      { x: 20, y: 25 },
      false,
      "high",
    ),
    pirate_island: buildZone(
      "pirate_island",
      "Pirate Island",
      RAW_PIRATE_ISLAND,
      32,
      24,
      { x: 14, y: 12 },
      false,
      "high",
    ),
    cursed_galleon: buildZone(
      "cursed_galleon",
      "The Cursed Galleon",
      RAW_CURSED_GALLEON,
      32,
      28,
      { x: 8, y: 14 },
      false,
      "high",
    ),
    thunder_isle: buildZone(
      "thunder_isle",
      "Thunder Isle",
      RAW_THUNDER_ISLE,
      22,
      18,
      { x: 11, y: 9 },
      false,
      "high",
    ),
  },
  npcsByZone: NPCS_BY_ZONE,
};

// ─── buildWorldMap ────────────────────────────────────────────────────────────

export function buildWorldMap(zoneId: ZoneId = "meadow_hub"): WorldMap {
  const zone = WORLD_CONFIG.zones[zoneId];
  return { width: zone.width, height: zone.height, tiles: zone.tiles, zoneId };
}

// ─── isWalkable ───────────────────────────────────────────────────────────────
// Only visually solid obstacles block movement.
// LANTERN, BENCH, FENCE, FLOWER, PATH, STAIR*, PORTAL are all walkable.

const NON_WALKABLE = new Set<TileTypeValue>([
  TileType.WALL,
  TileType.TOWN_WALL, // 'R' ruin_wall decoration
  TileType.BUILDING,
  TileType.WATER,
  TileType.RIVER,
  TileType.TREE,
  TileType.DEEP_FOREST, // 'G' dense forest canopy — non-walkable
  TileType.INTERIOR_WALL,
  TileType.CRYSTAL, // 'c' crystal formations
  TileType.POND,
  TileType.DUNGEON_WALL, // '#' cave walls
  TileType.CAVE_FLOOR, // 'v' lava/volcanic — non-walkable decoration
  TileType.STONE, // 'r' rocks
  // ── Island / water border tiles ──
  TileType.DEEP_WATER, // '~' ocean water — invisible wall at water edge
  TileType.FOAM, // '@' white foam edge — not walkable
  TileType.SWAMP_WATER, // 'Q' murky swamp water — not walkable
  TileType.VOID_DROP, // 'V' sky void / platform edge — not walkable
  TileType.PALM_TREE, // 'L' tropical palm — not walkable
  // ── Cursed Galleon tiles ──
  TileType.SHIP_RAIL, // 'H' ship railing — visual only, not walkable
  TileType.SHIP_WATER, // 'O' animated ocean around ship — not walkable
  // WOOD_PLANK ('D' = TileType.WOOD_PLANK) is walkable
  // CAPTAIN_FLOOR ('C' = TileType.CAPTAIN_FLOOR) is walkable
  // BEACH (',' = TileType.BEACH) is walkable — intentionally omitted
  // STONE_PLATFORM ('K' = TileType.STONE_PLATFORM) is walkable
  // RUNE_FLOOR ('X' = TileType.RUNE_FLOOR) is walkable
  // BRIDGE ('B' = TileType.BRIDGE) is walkable
  // SAND ('A' = TileType.SAND) is walkable
]);

export function isWalkable(world: WorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  const tile = world.tiles[y]?.[x];
  if (tile === undefined) return false;
  return !NON_WALKABLE.has(tile);
}

// ─── Flood-fill connectivity check ───────────────────────────────────────────

function floodFillCount(
  world: WorldMap,
  startX: number,
  startY: number,
  maxTiles: number,
): number {
  if (!isWalkable(world, startX, startY)) return 0;
  const visited = new Set<number>();
  const queue: [number, number][] = [[startX, startY]];
  const key = (x: number, y: number) => y * world.width + x;
  visited.add(key(startX, startY));
  let count = 0;
  while (queue.length > 0 && count < maxTiles) {
    const item = queue.shift();
    if (!item) break;
    const [cx, cy] = item;
    count++;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as [number, number][]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (!visited.has(k) && isWalkable(world, nx, ny)) {
        visited.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return count;
}

// ─── validateZoneLoad ─────────────────────────────────────────────────────────

export function validateZoneLoad(zoneId: ZoneId): boolean {
  const zone = WORLD_CONFIG.zones[zoneId];
  if (!zone) return false;
  if (!zone.tiles || zone.tiles.length === 0) return false;
  const world = buildWorldMap(zoneId);
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      if (isWalkable(world, x, y)) return true;
    }
  }
  return false;
}

// ─── validatePlayerSpawn ──────────────────────────────────────────────────────

const SAFE_FALLBACK = { x: 20, y: 17, zoneId: "meadow_hub" as ZoneId };
const MIN_CONNECTED_AREA = 8;

export function validatePlayerSpawn(
  x: number,
  y: number,
  world: WorldMap,
  minConnected = MIN_CONNECTED_AREA,
): { x: number; y: number } {
  const isGoodSpawn = (cx: number, cy: number): boolean => {
    if (!isWalkable(world, cx, cy)) return false;
    return floodFillCount(world, cx, cy, minConnected + 1) >= minConnected;
  };

  if (isGoodSpawn(x, y)) return { x, y };

  // Spiral search outward from desired position
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (isGoodSpawn(nx, ny)) return { x: nx, y: ny };
      }
    }
  }

  // Fall back to zone's declared spawn point
  const zone = WORLD_CONFIG.zones[world.zoneId];
  const sp = zone?.spawnPoint;
  if (sp && isGoodSpawn(sp.x, sp.y)) return { x: sp.x, y: sp.y };

  // Last resort: scan entire map
  for (let sy = 1; sy < world.height - 1; sy++) {
    for (let sx = 1; sx < world.width - 1; sx++) {
      if (isGoodSpawn(sx, sy)) return { x: sx, y: sy };
    }
  }

  return { x: SAFE_FALLBACK.x, y: SAFE_FALLBACK.y };
}

// ─── validateAllTransitions ───────────────────────────────────────────────────

export function validateAllTransitions(): void {
  for (const [zoneId, zone] of Object.entries(WORLD_CONFIG.zones)) {
    for (const t of zone.transitions) {
      const destZone = WORLD_CONFIG.zones[t.toZone];
      if (!destZone) {
        console.warn(
          `[Transition] Zone "${zoneId}" -> "${t.toZone}" does not exist`,
        );
        continue;
      }
      const destWorld = buildWorldMap(t.toZone);
      const fixed = validatePlayerSpawn(
        t.spawnTile.x,
        t.spawnTile.y,
        destWorld,
        MIN_CONNECTED_AREA,
      );
      if (fixed.x !== t.spawnTile.x || fixed.y !== t.spawnTile.y) {
        console.warn(
          `[Transition] "${zoneId}" -> "${t.toZone}" spawn ` +
            `(${t.spawnTile.x},${t.spawnTile.y}) was blocked. ` +
            `Fixed to (${fixed.x},${fixed.y})`,
        );
        t.spawnTile = fixed;
      }
    }
  }
}

// ─── Tile color palette ───────────────────────────────────────────────────────

export const TILE_COLORS: Record<
  TileTypeValue,
  { base: string; border: string; detail: string }
> = {
  [TileType.GRASS]: {
    base: "oklch(0.38 0.12 142)",
    border: "oklch(0.26 0.08 142)",
    detail: "oklch(0.46 0.14 138)",
  },
  [TileType.STONE]: {
    base: "oklch(0.44 0.03 58)",
    border: "oklch(0.30 0.02 58)",
    detail: "oklch(0.54 0.04 56)",
  },
  [TileType.WALL]: {
    base: "oklch(0.18 0.01 240)",
    border: "oklch(0.10 0.01 240)",
    detail: "oklch(0.26 0.02 238)",
  },
  [TileType.TOWN_FLOOR]: {
    base: "oklch(0.54 0.05 68)",
    border: "oklch(0.44 0.04 68)",
    detail: "oklch(0.62 0.07 65)",
  },
  [TileType.TOWN_WALL]: {
    base: "oklch(0.46 0.04 62)",
    border: "oklch(0.32 0.03 62)",
    detail: "oklch(0.58 0.05 60)",
  },
  [TileType.TOWN_PATH]: {
    base: "oklch(0.64 0.03 64)",
    border: "oklch(0.52 0.02 64)",
    detail: "oklch(0.70 0.04 62)",
  },
  [TileType.BUILDING]: {
    base: "oklch(0.52 0.07 42)",
    border: "oklch(0.34 0.05 42)",
    detail: "oklch(0.65 0.09 40)",
  },
  [TileType.WATER]: {
    base: "oklch(0.44 0.15 238)",
    border: "oklch(0.32 0.12 238)",
    detail: "oklch(0.58 0.18 232)",
  },
  [TileType.RIVER]: {
    base: "oklch(0.46 0.17 238)",
    border: "oklch(0.34 0.13 238)",
    detail: "oklch(0.62 0.20 230)",
  },
  [TileType.TREE]: {
    base: "oklch(0.22 0.10 140)",
    border: "oklch(0.13 0.07 140)",
    detail: "oklch(0.32 0.13 135)",
  },
  [TileType.FLOWER]: {
    base: "oklch(0.40 0.14 143)",
    border: "oklch(0.28 0.09 143)",
    detail: "oklch(0.76 0.22 28)",
  },
  [TileType.DEEP_FOREST]: {
    base: "oklch(0.16 0.08 148)",
    border: "oklch(0.09 0.05 148)",
    detail: "oklch(0.24 0.11 143)",
  },
  [TileType.PATH]: {
    base: "oklch(0.62 0.06 74)",
    border: "oklch(0.50 0.04 74)",
    detail: "oklch(0.70 0.08 72)",
  },
  [TileType.PORTAL]: {
    base: "oklch(0.42 0.24 292)",
    border: "oklch(0.28 0.18 292)",
    detail: "oklch(0.68 0.28 288)",
  },
  [TileType.DOOR]: {
    base: "oklch(0.56 0.09 54)",
    border: "oklch(0.42 0.07 54)",
    detail: "oklch(0.70 0.11 50)",
  },
  [TileType.INTERIOR_FLOOR]: {
    base: "oklch(0.52 0.06 68)",
    border: "oklch(0.42 0.04 68)",
    detail: "oklch(0.60 0.08 66)",
  },
  [TileType.INTERIOR_WALL]: {
    base: "oklch(0.32 0.06 50)",
    border: "oklch(0.20 0.04 50)",
    detail: "oklch(0.42 0.08 48)",
  },
  [TileType.CRYSTAL]: {
    base: "oklch(0.40 0.20 282)",
    border: "oklch(0.26 0.15 282)",
    detail: "oklch(0.64 0.26 278)",
  },
  [TileType.STAIR]: {
    base: "oklch(0.46 0.06 64)",
    border: "oklch(0.30 0.04 64)",
    detail: "oklch(0.56 0.08 60)",
  },
  [TileType.STAIR_UP]: {
    base: "oklch(0.44 0.08 128)",
    border: "oklch(0.30 0.06 128)",
    detail: "oklch(0.56 0.10 125)",
  },
  [TileType.LANTERN]: {
    base: "oklch(0.84 0.18 78)",
    border: "oklch(0.56 0.12 75)",
    detail: "oklch(0.97 0.10 90)",
  },
  [TileType.BENCH]: {
    base: "oklch(0.48 0.08 58)",
    border: "oklch(0.32 0.06 58)",
    detail: "oklch(0.58 0.10 56)",
  },
  [TileType.POND]: {
    base: "oklch(0.42 0.16 230)",
    border: "oklch(0.28 0.12 230)",
    detail: "oklch(0.60 0.20 228)",
  },
  [TileType.FENCE]: {
    base: "oklch(0.50 0.08 60)",
    border: "oklch(0.34 0.06 60)",
    detail: "oklch(0.60 0.10 58)",
  },
  [TileType.DUNGEON_FLOOR]: {
    base: "oklch(0.24 0.02 258)",
    border: "oklch(0.14 0.01 258)",
    detail: "oklch(0.30 0.03 255)",
  },
  [TileType.DUNGEON_WALL]: {
    base: "oklch(0.14 0.02 258)",
    border: "oklch(0.08 0.01 258)",
    detail: "oklch(0.20 0.03 255)",
  },
  [TileType.CAVE_FLOOR]: {
    base: "oklch(0.36 0.12 32)",
    border: "oklch(0.22 0.08 32)",
    detail: "oklch(0.48 0.18 28)",
  },
  [TileType.CAVE_WALL]: {
    base: "oklch(0.16 0.04 28)",
    border: "oklch(0.09 0.02 28)",
    detail: "oklch(0.22 0.06 26)",
  },
  [TileType.TRANSITION_MARKER]: {
    base: "oklch(0.72 0.18 76)",
    border: "oklch(0.54 0.14 76)",
    detail: "oklch(0.90 0.22 80)",
  },
  // ── Island / water border tile colors ──
  [TileType.BEACH]: {
    base: "oklch(0.78 0.08 82)",
    border: "oklch(0.62 0.06 82)",
    detail: "oklch(0.88 0.06 78)",
  },
  [TileType.DEEP_WATER]: {
    base: "oklch(0.30 0.18 238)",
    border: "oklch(0.18 0.14 240)",
    detail: "oklch(0.46 0.22 232)",
  },
  [TileType.FOAM]: {
    base: "oklch(0.88 0.06 220)",
    border: "oklch(0.70 0.08 220)",
    detail: "oklch(0.96 0.02 210)",
  },
  [TileType.SWAMP_WATER]: {
    base: "oklch(0.28 0.10 148)",
    border: "oklch(0.18 0.07 150)",
    detail: "oklch(0.38 0.14 145)",
  },
  [TileType.STONE_PLATFORM]: {
    base: "oklch(0.46 0.03 55)",
    border: "oklch(0.30 0.02 55)",
    detail: "oklch(0.58 0.04 52)",
  },
  [TileType.RUNE_FLOOR]: {
    base: "oklch(0.36 0.16 290)",
    border: "oklch(0.22 0.12 290)",
    detail: "oklch(0.58 0.24 285)",
  },
  [TileType.VOID_DROP]: {
    base: "oklch(0.08 0.04 260)",
    border: "oklch(0.04 0.02 260)",
    detail: "oklch(0.14 0.06 258)",
  },
  // ── Pirate Island tile colors ──
  [TileType.BRIDGE]: {
    base: "oklch(0.48 0.08 58)",
    border: "oklch(0.32 0.05 55)",
    detail: "oklch(0.60 0.10 62)",
  },
  [TileType.SAND]: {
    base: "oklch(0.80 0.08 82)",
    border: "oklch(0.65 0.06 82)",
    detail: "oklch(0.88 0.07 78)",
  },
  [TileType.PALM_TREE]: {
    base: "oklch(0.30 0.14 140)",
    border: "oklch(0.20 0.10 140)",
    detail: "oklch(0.44 0.18 135)",
  },
  // ── Cursed Galleon tile colors ──
  [TileType.WOOD_PLANK]: {
    // brown wooden planks with horizontal grain detail
    base: "oklch(0.42 0.10 52)",
    border: "oklch(0.28 0.07 52)",
    detail: "oklch(0.54 0.12 50)",
  },
  [TileType.SHIP_RAIL]: {
    // dark brown vertical posts with rope detail — purely cosmetic
    base: "oklch(0.26 0.07 46)",
    border: "oklch(0.16 0.05 46)",
    detail: "oklch(0.36 0.09 48)",
  },
  [TileType.SHIP_WATER]: {
    // animated ocean water around ship — same deep blue as DEEP_WATER
    base: "oklch(0.30 0.18 238)",
    border: "oklch(0.18 0.14 240)",
    detail: "oklch(0.46 0.22 232)",
  },
  [TileType.CAPTAIN_FLOOR]: {
    // warmer wood tone for captain's quarters
    base: "oklch(0.48 0.12 50)",
    border: "oklch(0.32 0.08 50)",
    detail: "oklch(0.60 0.14 48)",
  },
};

// ─── getPortalDestLabel ───────────────────────────────────────────────────────

export function getPortalDestLabel(toZone: ZoneId): {
  name: string;
  color: string;
  levelRange?: string;
  pvp?: boolean;
} {
  switch (toZone) {
    case "meadow_hub":
      return { name: "Meadow Hub", color: "#66cc44" };
    case "wilderness":
      return { name: "Wilderness", color: "#88cc44", levelRange: "1-5" };
    case "wolf_forest":
      return { name: "Wolf Forest", color: "#2a8a44", levelRange: "4-8" };
    case "tiger_jungle":
      return { name: "Tiger Jungle", color: "#44bb66", levelRange: "6-10" };
    case "bear_forest":
      return { name: "Bear Forest", color: "#5a9a22", levelRange: "5-9" };
    case "ancient_ruins":
      return { name: "Ancient Ruins", color: "#aa8833", levelRange: "7-12" };
    case "crystal_ruins":
      return { name: "Crystal Ruins", color: "#aa44ff", levelRange: "10-15" };
    case "forest_depths":
      return { name: "Forest Depths", color: "#1a8844", levelRange: "3-7" };
    case "cyclops_lair":
      return { name: "Cyclops Lair", color: "#cc4422", levelRange: "12-18" };
    case "hub_basement":
      return { name: "Hub Basement", color: "#884422", levelRange: "2-6" };
    case "goblin_warrens":
      return { name: "Goblin Warrens", color: "#556622", levelRange: "4-9" };
    case "bat_cave":
      return { name: "Bat Cave", color: "#662288", levelRange: "5-10" };
    case "wilderness_dungeon":
      return {
        name: "Wilderness Dungeon",
        color: "#aa5522",
        levelRange: "3-8",
      };
    case "forest_dungeon":
      return { name: "Forest Dungeon", color: "#556644", levelRange: "6-11" };
    case "deep_cave":
      return { name: "Deep Cave", color: "#334455", levelRange: "10-16" };
    case "dark_forest":
      return {
        name: "Dark Forest",
        color: "#4477aa",
        levelRange: "6-12",
        pvp: true,
      };
    case "ancient_ruins_deep":
      return {
        name: "Ancient Ruins Deep",
        color: "#cc8833",
        levelRange: "12-18",
        pvp: true,
      };
    case "cave_interior":
      return {
        name: "Cave Interior",
        color: "#8855aa",
        levelRange: "8-14",
        pvp: true,
      };
    case "aurelion":
      return { name: "Aurelion", color: "#8888ff" };
    case "boss_chamber":
      return {
        name: "Boss Chamber",
        color: "#cc2222",
        levelRange: "15+",
        pvp: true,
      };
    case "cursed_swamp":
      return {
        name: "Cursed Swamp",
        color: "#3a7a1a",
        levelRange: "14-20",
        pvp: true,
      };
    case "floating_ruins":
      return {
        name: "Floating Ruins",
        color: "#7744cc",
        levelRange: "16-22",
        pvp: true,
      };
    case "pirate_island":
      return {
        name: "Pirate Island",
        color: "#d4aa44",
        levelRange: "10-18",
        pvp: true,
      };
    case "cursed_galleon":
      return {
        name: "The Cursed Galleon",
        color: "#cc4422",
        levelRange: "18-25",
        pvp: true,
      };
    case "thunder_isle":
      return {
        name: "Thunder Isle",
        color: "#8844ff",
        levelRange: "18-32",
        pvp: true,
      };
    default:
      return { name: toZone, color: "#ffffff" };
  }
}
