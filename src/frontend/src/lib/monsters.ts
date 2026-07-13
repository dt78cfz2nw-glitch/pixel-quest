import {
  getThunderIsleSpeedMultiplier,
  isThunderIsleStormActive,
} from "../lib/events";
import type {
  CombatEvent,
  FacingDirection,
  ItemType,
  LootDrop,
  MonsterAIState,
  MonsterEntity,
  MonsterType,
  TileTypeValue,
  WorldMap,
  ZoneConfig,
  ZoneId,
} from "../types/game";
import { TileType } from "../types/game";

// ─── Monster Configuration ────────────────────────────────────────────────────

const MONSTER_CONFIG: Record<
  MonsterType,
  {
    maxHp: number;
    damage: number;
    speed: number; // tiles per second
    aggroRange: number; // tile radius to start chasing
    attackRange: number; // tile radius to attack
    attackCooldown: number; // ms between attacks
    xp: number;
    respawnTimer: number; // ms until monster respawns after death
  }
> = {
  slime: {
    maxHp: 30,
    damage: 5,
    speed: 1.5,
    aggroRange: 3,
    attackRange: 1.5,
    attackCooldown: 1500,
    xp: 8,
    respawnTimer: 25000,
  },
  goblin: {
    maxHp: 50,
    damage: 10,
    speed: 2.5,
    aggroRange: 4,
    attackRange: 1.5,
    attackCooldown: 1200,
    xp: 12,
    respawnTimer: 25000,
  },
  forest_troll: {
    maxHp: 80,
    damage: 15,
    speed: 2.0,
    aggroRange: 4,
    attackRange: 1.8,
    attackCooldown: 2000,
    xp: 30,
    respawnTimer: 45000,
  },
  sprite_wisp: {
    maxHp: 20,
    damage: 8,
    speed: 3.0,
    aggroRange: 7,
    attackRange: 1.2,
    attackCooldown: 1000,
    xp: 10,
    respawnTimer: 25000,
  },
  crystal_golem: {
    maxHp: 120,
    damage: 20,
    speed: 1.0,
    aggroRange: 3,
    attackRange: 2.0,
    attackCooldown: 2500,
    xp: 35,
    respawnTimer: 45000,
  },
  spider: {
    maxHp: 30,
    damage: 8,
    speed: 1.3,
    aggroRange: 3.5,
    attackRange: 1.0,
    attackCooldown: 1100,
    xp: 15,
    respawnTimer: 25000,
  },
  bat: {
    maxHp: 18,
    damage: 5,
    speed: 2.2,
    aggroRange: 4,
    attackRange: 1.2,
    attackCooldown: 900,
    xp: 10,
    respawnTimer: 25000,
  },
  bear: {
    maxHp: 80,
    damage: 18,
    speed: 1.4,
    aggroRange: 5,
    attackRange: 2.0,
    attackCooldown: 2200,
    xp: 35,
    respawnTimer: 45000,
  },
  wolf: {
    maxHp: 55,
    damage: 12,
    speed: 3.5,
    aggroRange: 5,
    attackRange: 1.3,
    attackCooldown: 900,
    xp: 20,
    respawnTimer: 45000,
  },
  tiger: {
    maxHp: 70,
    damage: 18,
    speed: 3.0,
    aggroRange: 7,
    attackRange: 1.5,
    attackCooldown: 1100,
    xp: 22,
    respawnTimer: 45000,
  },
  skeleton: {
    maxHp: 45,
    damage: 14,
    speed: 1.8,
    aggroRange: 6,
    attackRange: 1.8,
    attackCooldown: 1400,
    xp: 25,
    respawnTimer: 45000,
  },
  cyclops: {
    maxHp: 180,
    damage: 28,
    speed: 1.2,
    aggroRange: 5,
    attackRange: 2.5,
    attackCooldown: 3000,
    xp: 60,
    respawnTimer: 45000,
  },
  shadow_wolf: {
    maxHp: 80,
    damage: 16,
    speed: 3.8,
    aggroRange: 6,
    attackRange: 1,
    attackCooldown: 1200,
    xp: 25,
    respawnTimer: 90000,
  },
  stone_golem: {
    maxHp: 200,
    damage: 25,
    speed: 0.8,
    aggroRange: 4,
    attackRange: 1,
    attackCooldown: 3000,
    xp: 60,
    respawnTimer: 45000,
  },
  cave_bat: {
    maxHp: 22,
    damage: 6,
    speed: 3.2,
    aggroRange: 8,
    attackRange: 1,
    attackCooldown: 800,
    xp: 12,
    respawnTimer: 25000,
  },
  cave_troll: {
    maxHp: 320,
    damage: 35,
    speed: 1.0,
    aggroRange: 5,
    attackRange: 1,
    attackCooldown: 2500,
    xp: 120,
    respawnTimer: 45000,
  },
  stone_warden: {
    maxHp: 500,
    damage: 40,
    speed: 1.2,
    aggroRange: 6,
    attackRange: 2.5,
    attackCooldown: 2000,
    xp: 500,
    respawnTimer: 300000,
  },
  // ── Cursed Swamp ──
  bog_witch: {
    maxHp: 120,
    damage: 18,
    speed: 1.6,
    aggroRange: 5,
    attackRange: 3,
    attackCooldown: 2000,
    xp: 85,
    respawnTimer: 45000,
  },
  swamp_lurker: {
    maxHp: 80,
    damage: 14,
    speed: 3.0,
    aggroRange: 1,
    attackRange: 1.2,
    attackCooldown: 900,
    xp: 60,
    respawnTimer: 45000,
  },
  mud_golem: {
    maxHp: 200,
    damage: 22,
    speed: 0.9,
    aggroRange: 4,
    attackRange: 2,
    attackCooldown: 2800,
    xp: 120,
    respawnTimer: 45000,
  },
  // ── Floating Ruins ──
  ruin_specter: {
    maxHp: 150,
    damage: 20,
    speed: 2.2,
    aggroRange: 6,
    attackRange: 3.5,
    attackCooldown: 1800,
    xp: 140,
    respawnTimer: 45000,
  },
  ancient_guardian: {
    maxHp: 280,
    damage: 30,
    speed: 1.0,
    aggroRange: 4,
    attackRange: 1.5,
    attackCooldown: 2200,
    xp: 180,
    respawnTimer: 45000,
  },
  sky_serpent: {
    maxHp: 350,
    damage: 25,
    speed: 2.8,
    aggroRange: 8,
    attackRange: 1.5,
    attackCooldown: 1400,
    xp: 250,
    respawnTimer: 90000,
  },
  // ── Pirate Island ──
  pirate_grunt: {
    maxHp: 90,
    damage: 16,
    speed: 2.8,
    aggroRange: 5,
    attackRange: 1.5,
    attackCooldown: 1200,
    xp: 55,
    respawnTimer: 25000,
  },
  pirate_gunner: {
    maxHp: 70,
    damage: 20,
    speed: 1.8,
    aggroRange: 6,
    attackRange: 4.0,
    attackCooldown: 1800,
    xp: 65,
    respawnTimer: 25000,
  },
  pirate_captain: {
    maxHp: 220,
    damage: 30,
    speed: 2.0,
    aggroRange: 5,
    attackRange: 2.0,
    attackCooldown: 1600,
    xp: 160,
    respawnTimer: 90000,
  },
  pirate_cannon: {
    maxHp: 150,
    damage: 45,
    speed: 0,
    aggroRange: 8,
    attackRange: 7.0,
    attackCooldown: 4000,
    xp: 80,
    respawnTimer: 45000,
  },
  // ── Cursed Galleon ──
  cursed_sailor: {
    maxHp: 140,
    damage: 18,
    speed: 1.8,
    aggroRange: 4,
    attackRange: 1,
    attackCooldown: 1200,
    xp: 100,
    respawnTimer: 45000,
  },
  skeleton_gunner: {
    maxHp: 110,
    damage: 22,
    speed: 1.5,
    aggroRange: 5,
    attackRange: 4,
    attackCooldown: 1800,
    xp: 115,
    respawnTimer: 45000,
  },
  cursed_navigator: {
    maxHp: 160,
    damage: 24,
    speed: 0,
    aggroRange: 6,
    attackRange: 1,
    attackCooldown: 1000,
    xp: 130,
    respawnTimer: 45000,
  },
  ship_captain: {
    maxHp: 400,
    damage: 35,
    speed: 1.8,
    aggroRange: 8,
    attackRange: 2,
    attackCooldown: 2000,
    xp: 350,
    respawnTimer: 90000,
  },
  // ── Thunder Isle ──
  storm_sprite: {
    maxHp: 130,
    damage: 23,
    speed: 2.5,
    aggroRange: 5,
    attackRange: 3,
    attackCooldown: 1200,
    xp: 110,
    respawnTimer: 25000,
  },
  thunder_golem: {
    maxHp: 280,
    damage: 40,
    speed: 0.8,
    aggroRange: 4,
    attackRange: 1.5,
    attackCooldown: 2000,
    xp: 170,
    respawnTimer: 45000,
  },
  lightning_drake: {
    maxHp: 400,
    damage: 55,
    speed: 3.5,
    aggroRange: 7,
    attackRange: 4,
    attackCooldown: 2500,
    xp: 250,
    respawnTimer: 90000,
  },
  forest_spirit: {
    maxHp: 65,
    damage: 8,
    speed: 1.5,
    aggroRange: 4,
    attackRange: 1.2,
    attackCooldown: 1800,
    xp: 45,
    respawnTimer: 30000,
  },
  dark_wisp: {
    maxHp: 55,
    damage: 10,
    speed: 2.5,
    aggroRange: 5,
    attackRange: 2.5,
    attackCooldown: 1500,
    xp: 50,
    respawnTimer: 30000,
  },
  ruins_archer: {
    maxHp: 100,
    damage: 14,
    speed: 1.8,
    aggroRange: 5,
    attackRange: 4,
    attackCooldown: 2000,
    xp: 90,
    respawnTimer: 35000,
  },
  kraken_tentacle: {
    maxHp: 220,
    damage: 22,
    speed: 0,
    aggroRange: 3,
    attackRange: 2,
    attackCooldown: 2500,
    xp: 140,
    respawnTimer: 60000,
  },
};

// ─── Zone behavior classification ─────────────────────────────────────────────

/** Meadow monsters wander passively, aggro at 2 tiles, chase up to 6 */
const PASSIVE_ZONES = new Set<ZoneId>(["meadow_hub", "wilderness"]);

/** Forest monsters patrol and have group aggro */
const AGGRESSIVE_ZONES = new Set<ZoneId>([
  "forest_depths",
  "wolf_forest",
  "bear_forest",
  "tiger_jungle",
  "dark_forest",
  "goblin_warrens",
  "pirate_island",
  "cursed_galleon",
  "thunder_isle",
]);

/** Cave/ruins monsters are like aggressive but slower with shorter aggro */
const CAVE_RUINS_ZONES = new Set<ZoneId>([
  "cave_interior",
  "ancient_ruins",
  "ancient_ruins_deep",
  "hub_basement",
  "wilderness_dungeon",
  "forest_dungeon",
  "bat_cave",
  "deep_cave",
  "cyclops_lair",
  "crystal_ruins",
  "boss_chamber",
  "cursed_swamp",
  "floating_ruins",
]);

// ─── Respawn timers per zone type ─────────────────────────────────────────────

export function getRespawnTimer(zoneId: ZoneId): number {
  if (PASSIVE_ZONES.has(zoneId)) return 30000; // 30 seconds
  if (AGGRESSIVE_ZONES.has(zoneId)) return 45000; // 45 seconds
  if (CAVE_RUINS_ZONES.has(zoneId)) return 60000; // 60 seconds
  return 45000;
}

// ─── Aggro configuration per zone tier ────────────────────────────────────────

interface TierConfig {
  aggroRange: number;
  chaseRange: number; // max distance from spawn to chase
  wanderRadius: number; // wander within this radius of spawn
  groupAggroRadius: number; // nearby same-type monsters aggro together
  canPatrol: boolean;
}

function getTierConfig(zoneId: ZoneId): TierConfig {
  if (PASSIVE_ZONES.has(zoneId)) {
    return {
      aggroRange: 2,
      chaseRange: 6,
      wanderRadius: 3,
      groupAggroRadius: 0,
      canPatrol: false,
    };
  }
  if (CAVE_RUINS_ZONES.has(zoneId)) {
    return {
      aggroRange: 3,
      chaseRange: 8,
      wanderRadius: 2,
      groupAggroRadius: 3,
      canPatrol: false,
    };
  }
  // aggressive forest zones
  return {
    aggroRange: 4,
    chaseRange: 10,
    wanderRadius: 4,
    groupAggroRadius: 3,
    canPatrol: true,
  };
}

/** ms between wander direction changes */
const WANDER_INTERVAL_MS = 2000;
/** ms of idle pause before wandering again */
const IDLE_PAUSE_MS = 1500;
/** Animation frames per second */
const ANIM_FPS = 8;
/** Tiles of clearance from walls required for valid spawn */
const SPAWN_CLEARANCE = 3;
/** Max attempts to find a valid spawn point before giving up */
const MAX_SPAWN_ATTEMPTS = 80;
/** Minimum connected walkable tiles required to accept a monster spawn */
const MIN_SPAWN_CONNECTED = 8;

// ─── Non-walkable tile set (for monster AI) ───────────────────────────────────

const NON_WALKABLE = new Set<TileTypeValue>([
  TileType.WALL,
  TileType.TOWN_WALL,
  TileType.BUILDING,
  TileType.WATER,
  TileType.TREE,
  TileType.DEEP_FOREST,
  TileType.PORTAL,
  TileType.DOOR,
  TileType.LANTERN,
  TileType.BENCH,
  TileType.POND,
  TileType.FENCE,
  TileType.DUNGEON_WALL,
  TileType.STAIR,
  TileType.STAIR_UP,
  TileType.STONE,
  TileType.CRYSTAL,
  TileType.INTERIOR_WALL,
  TileType.CAVE_WALL,
  TileType.DEEP_WATER,
  TileType.FOAM,
  TileType.SWAMP_WATER,
  TileType.VOID_DROP,
  TileType.PALM_TREE,
]);

// ─── Spawn helpers ────────────────────────────────────────────────────────────

/**
 * BFS flood-fill from (startX, startY) within the tile grid.
 * Returns the number of reachable non-blocked tiles, capped at maxTiles.
 */
function spawnFloodFill(
  tiles: TileTypeValue[][],
  startX: number,
  startY: number,
  maxTiles: number,
): number {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  const isOpen = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const t = tiles[y]?.[x];
    return t !== undefined && !NON_WALKABLE.has(t);
  };
  if (!isOpen(startX, startY)) return 0;
  const visited = new Set<number>();
  const queue: [number, number][] = [[startX, startY]];
  const key = (x: number, y: number) => y * width + x;
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
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (!visited.has(k) && isOpen(nx, ny)) {
        visited.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return count;
}

/**
 * Returns true if the tile at (x, y) is walkable, has at least
 * SPAWN_CLEARANCE tiles of walkable space around it, AND is connected
 * to at least MIN_SPAWN_CONNECTED open tiles (not an isolated pocket).
 */
export function validateSpawnPoint(
  x: number,
  y: number,
  tiles: TileTypeValue[][],
): boolean {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;

  for (let dy = -SPAWN_CLEARANCE; dy <= SPAWN_CLEARANCE; dy++) {
    for (let dx = -SPAWN_CLEARANCE; dx <= SPAWN_CLEARANCE; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
      const tile = tiles[ny]?.[nx];
      if (tile === undefined || NON_WALKABLE.has(tile)) return false;
    }
  }
  // Connectivity check — reject isolated pockets
  const area = spawnFloodFill(tiles, x, y, MIN_SPAWN_CONNECTED + 1);
  return area >= MIN_SPAWN_CONNECTED;
}

/**
 * Pick a random walkable tile within a rectangular region.
 * Returns null if no valid position is found within MAX_SPAWN_ATTEMPTS.
 */
function randomSpawnIn(
  tiles: TileTypeValue[][],
  colMin: number,
  colMax: number,
  rowMin: number,
  rowMax: number,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
    const x = colMin + Math.floor(Math.random() * (colMax - colMin + 1));
    const y = rowMin + Math.floor(Math.random() * (rowMax - rowMin + 1));
    if (validateSpawnPoint(x, y, tiles)) return { x, y };
  }
  return null;
}

// ─── Density → count range ────────────────────────────────────────────────────

function densityCount(density: ZoneConfig["creatureDensity"]): number {
  switch (density) {
    case "none":
      return 0;
    case "low":
      return 3 + Math.floor(Math.random() * 3); // 3-5
    case "medium":
      return 5 + Math.floor(Math.random() * 4); // 5-8
    case "high":
      return 8 + Math.floor(Math.random() * 6); // 8-13
  }
}

// ─── Extended MonsterEntity with AI metadata ──────────────────────────────────

/** Per-monster AI data stored outside the MonsterEntity (keyed by id) */
interface MonsterAiData {
  spawnX: number;
  spawnY: number;
  patrolPointB?: { x: number; y: number }; // patrol end-point (aggressive only)
  patrolGoingToB: boolean; // patrol direction
  wanderTimer: number;
  idleTimer: number;
  groupAggroTriggered: boolean;
  /** Teleport timer for cursed_navigator (ms until next teleport) */
  teleportTimer?: number;
  /** Retreat timer for skeleton_gunner (ms until next retreat step) */
  retreatTimer?: number;
}

const _aiData = new Map<string, MonsterAiData>();

// ─── Factory ─────────────────────────────────────────────────────────────────

let _nextId = 1;

/** Get initial ability timer delay (stagger so not all activate at once) */
function _getInitialAbilityTimer(type: MonsterType): number {
  switch (type) {
    case "bog_witch":
      return 8000 + Math.random() * 4000; // 8-12s
    case "cave_troll":
      return 15000 + Math.random() * 5000; // 15-20s
    case "pirate_captain":
      return 4000 + Math.random() * 4000; // 4-8s
    case "stone_warden":
      return 10000 + Math.random() * 10000; // 10-20s
    default:
      return 0;
  }
}

function createMonster(
  type: MonsterType,
  x: number,
  y: number,
  canPatrol: boolean,
  wanderRadius: number,
): MonsterEntity {
  const cfg = MONSTER_CONFIG[type];
  const id = `m${_nextId++}`;
  // Create a patrol point B offset from spawn by 3-4 tiles in a random direction
  let patrolPointB: { x: number; y: number } | undefined;
  if (canPatrol) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random();
    patrolPointB = {
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
    };
  }
  _aiData.set(id, {
    spawnX: x,
    spawnY: y,
    patrolPointB,
    patrolGoingToB: true,
    wanderTimer: 0,
    idleTimer: 0,
    groupAggroTriggered: false,
  });
  void wanderRadius; // used by wander logic in tick
  return {
    id,
    x,
    y,
    hp: cfg.maxHp,
    maxHp: cfg.maxHp,
    state: "idle",
    facingDirection: "down",
    animFrame: 0,
    animTimer: 0,
    lastAttackTime: 0,
    type,
    isRare: false,
    rareTint: false,
    ambushHidden: false,
    poisonTicksRemaining: 0,
    poisonDamagePerTick: 0,
    aggroIndicatorTimer: 0,
    // Knockback state — starts at zero, applied on hit
    knockbackOffsetX: 0,
    knockbackOffsetY: 0,
    knockbackVelX: 0,
    knockbackVelY: 0,
    knockbackTimer: 0,
    // Special ability state
    abilityTimer: _getInitialAbilityTimer(type),
    abilityState: "ready",
    parryActive: false,
    stunDurationMs: 0,
  };
}

// ─── Zone-aware spawning ──────────────────────────────────────────────────────

/**
 * Spawn monsters for the given zone using its creatureDensity and zoneId.
 */
export function spawnMonsters(
  world: WorldMap,
  zoneConfig: ZoneConfig,
): MonsterEntity[] {
  _nextId = 1;
  _aiData.clear();
  const { creatureDensity, id: zoneId } = zoneConfig;

  if (creatureDensity === "none") return [];

  const { tiles, width, height } = world;
  const monsters: MonsterEntity[] = [];
  const total = densityCount(creatureDensity);
  const tierCfg = getTierConfig(zoneId as ZoneId);

  // sky_serpent uses its own 5%-per-spawn-event rate rather than 1% rare chance
  const RARE_EXEMPT = new Set<MonsterType>([
    "sky_serpent",
    "stone_warden",
    "ship_captain",
    "lightning_drake",
  ]);

  /** Helper: spawn `count` of `type` anywhere in the map, applying 1% rare variant */
  const spawnN = (type: MonsterType, count: number) => {
    for (let i = 0; i < count; i++) {
      const pos = randomSpawnIn(tiles, 1, width - 2, 1, height - 2);
      if (!pos) continue;
      const base = createMonster(
        type,
        pos.x,
        pos.y,
        tierCfg.canPatrol,
        tierCfg.wanderRadius,
      );
      // 1% rare variant for eligible monster types
      if (!RARE_EXEMPT.has(type) && Math.random() < 0.01) {
        base.isRare = true;
        base.rareTint = true;
        base.hp = base.maxHp * 3;
        base.maxHp = base.maxHp * 3;
      }
      monsters.push(base);
    }
  };

  /** Helper: distribute counts from a weighted list */
  const distribute = (
    entries: Array<{ type: MonsterType; weight: number }>,
    totalCount: number,
  ) => {
    const sumW = entries.reduce((s, e) => s + e.weight, 0);
    let remaining = totalCount;
    entries.forEach((e, i) => {
      const count =
        i === entries.length - 1
          ? remaining
          : Math.round((e.weight / sumW) * totalCount);
      spawnN(e.type, count);
      remaining -= count;
    });
  };

  switch (zoneId) {
    // ── Safe zone — no monsters ──────────────────────────────────────────────
    case "meadow_hub":
      return [];

    // ── Beginner surface ─────────────────────────────────────────────────────
    case "wilderness": {
      const slimeCount = Math.ceil(total * 0.5);
      const goblinCount = total - slimeCount;
      for (let i = 0; i < slimeCount; i++) {
        const pos = randomSpawnIn(
          tiles,
          1,
          width - 2,
          15,
          Math.min(27, height - 2),
        );
        if (pos)
          monsters.push(
            createMonster(
              "slime",
              pos.x,
              pos.y,
              tierCfg.canPatrol,
              tierCfg.wanderRadius,
            ),
          );
      }
      for (let i = 0; i < goblinCount; i++) {
        const pos = randomSpawnIn(tiles, 1, width - 2, 2, 10);
        if (pos)
          monsters.push(
            createMonster(
              "goblin",
              pos.x,
              pos.y,
              tierCfg.canPatrol,
              tierCfg.wanderRadius,
            ),
          );
      }
      return monsters;
    }

    // ── Forest zones ─────────────────────────────────────────────────────────
    case "wolf_forest":
      distribute(
        [
          { type: "wolf", weight: 45 },
          { type: "bear", weight: 28 },
          { type: "tiger", weight: 18 },
          { type: "forest_spirit", weight: 9 },
        ],
        total,
      );
      return monsters;

    case "bear_forest":
      distribute(
        [
          { type: "bear", weight: 60 },
          { type: "forest_troll", weight: 40 },
        ],
        total,
      );
      return monsters;

    case "tiger_jungle":
      distribute(
        [
          { type: "tiger", weight: 60 },
          { type: "sprite_wisp", weight: 40 },
        ],
        total,
      );
      return monsters;

    case "forest_depths":
      distribute(
        [
          { type: "goblin", weight: 40 },
          { type: "forest_troll", weight: 40 },
          { type: "sprite_wisp", weight: 20 },
        ],
        total,
      );
      return monsters;

    // ── Ruins zones ──────────────────────────────────────────────────────────
    case "ancient_ruins":
      distribute(
        [
          { type: "skeleton", weight: 48 },
          { type: "forest_troll", weight: 38 },
          { type: "ruins_archer", weight: 14 },
        ],
        total,
      );
      return monsters;

    case "crystal_ruins":
      distribute(
        [
          { type: "crystal_golem", weight: 55 },
          { type: "sprite_wisp", weight: 45 },
        ],
        total,
      );
      return monsters;

    // ── Boss / special zones ─────────────────────────────────────────────────
    case "cyclops_lair":
      distribute(
        [
          { type: "cyclops", weight: 70 },
          { type: "skeleton", weight: 30 },
        ],
        total,
      );
      return monsters;

    // ── Dungeon / underground zones ──────────────────────────────────────────
    case "hub_basement":
      distribute(
        [
          { type: "spider", weight: 70 },
          { type: "bat", weight: 30 },
        ],
        total,
      );
      return monsters;

    case "goblin_warrens":
      distribute(
        [
          { type: "goblin", weight: 80 },
          { type: "slime", weight: 20 },
        ],
        total,
      );
      return monsters;

    case "bat_cave":
      distribute(
        [
          { type: "bat", weight: 75 },
          { type: "spider", weight: 25 },
        ],
        total,
      );
      return monsters;

    case "wilderness_dungeon":
      distribute(
        [
          { type: "spider", weight: 60 },
          { type: "goblin", weight: 40 },
        ],
        total,
      );
      return monsters;

    case "forest_dungeon":
      distribute(
        [
          { type: "spider", weight: 55 },
          { type: "forest_troll", weight: 45 },
        ],
        total,
      );
      return monsters;

    case "deep_cave":
      distribute(
        [
          { type: "spider", weight: 40 },
          { type: "bat", weight: 35 },
          { type: "skeleton", weight: 25 },
        ],
        total,
      );
      return monsters;

    case "dark_forest":
      distribute(
        [
          { type: "shadow_wolf", weight: 45 },
          { type: "wolf", weight: 27 },
          { type: "bear", weight: 18 },
          { type: "dark_wisp", weight: 10 },
        ],
        total,
      );
      return monsters;

    case "ancient_ruins_deep":
      distribute(
        [
          { type: "stone_golem", weight: 50 },
          { type: "skeleton", weight: 30 },
          { type: "forest_troll", weight: 20 },
        ],
        total,
      );
      return monsters;

    case "cave_interior": {
      // cave_bat spawns in groups of 3, cave_troll rare (1-2 max)
      const trollCount = Math.random() < 0.4 ? 1 : Math.random() < 0.15 ? 2 : 0;
      const batCount = total - trollCount;
      for (let i = 0; i < batCount; i++) {
        const pos = randomSpawnIn(tiles, 1, width - 2, 1, height - 2);
        if (pos)
          monsters.push(createMonster("cave_bat", pos.x, pos.y, false, 2));
      }
      for (let i = 0; i < trollCount; i++) {
        const pos = randomSpawnIn(tiles, 3, width - 4, 8, height - 8);
        if (pos)
          monsters.push(createMonster("cave_troll", pos.x, pos.y, false, 2));
      }
      return monsters;
    }

    case "boss_chamber": {
      // Single Stone Warden boss positioned in center-far end
      const pos = randomSpawnIn(
        tiles,
        Math.floor(width / 4),
        Math.floor((width * 3) / 4),
        3,
        8,
      );
      if (pos)
        monsters.push(createMonster("stone_warden", pos.x, pos.y, false, 0));
      return monsters;
    }

    case "cursed_swamp":
      distribute(
        [
          { type: "bog_witch", weight: 35 },
          { type: "swamp_lurker", weight: 40 },
          { type: "mud_golem", weight: 25 },
        ],
        total,
      );
      return monsters;

    case "floating_ruins": {
      // Sky Serpent is a rare spawn (1 max)
      const hasSerpent = Math.random() < 0.3;
      const serpentCount = hasSerpent ? 1 : 0;
      const remainingTotal = total - serpentCount;
      distribute(
        [
          { type: "ruin_specter", weight: 50 },
          { type: "ancient_guardian", weight: 50 },
        ],
        remainingTotal,
      );
      if (serpentCount > 0) {
        const pos = randomSpawnIn(tiles, 2, width - 3, 2, height - 3);
        if (pos)
          monsters.push(createMonster("sky_serpent", pos.x, pos.y, false, 4));
      }
      return monsters;
    }

    case "pirate_island": {
      // 2-3 fixed cannons near shore positions (south shore area)
      const cannonPositions = [
        { x: 6, y: 20 },
        { x: 24, y: 21 },
        { x: 14, y: 22 },
      ];
      for (const cp of cannonPositions) {
        const fixedPos = randomSpawnIn(
          tiles,
          cp.x - 2,
          cp.x + 2,
          cp.y - 2,
          cp.y + 2,
        );
        if (fixedPos)
          monsters.push(
            createMonster("pirate_cannon", fixedPos.x, fixedPos.y, false, 0),
          );
      }
      // Rare captain (5% per spawn event, max 1)
      if (Math.random() < 0.5) {
        const pos = randomSpawnIn(tiles, 8, width - 8, 6, height - 8);
        if (pos) {
          const captain = createMonster(
            "pirate_captain",
            pos.x,
            pos.y,
            true,
            3,
          );
          monsters.push(captain);
        }
      }
      // Fill remaining with grunts (50%) and gunners (30%)
      const remainingCount = Math.max(0, total - monsters.length);
      distribute(
        [
          { type: "pirate_grunt", weight: 55 },
          { type: "pirate_gunner", weight: 35 },
          { type: "kraken_tentacle", weight: 10 },
        ],
        remainingCount,
      );
      return monsters;
    }

    // ── Cursed Galleon ──────────────────────────────────────────────────────
    case "cursed_galleon": {
      // Spawn pool: cursed_sailor x4, skeleton_gunner x3, cursed_navigator x2
      // The ship_captain boss is handled separately in boss.ts / useGameLoop
      distribute(
        [
          { type: "cursed_sailor", weight: 44 },
          { type: "skeleton_gunner", weight: 33 },
          { type: "cursed_navigator", weight: 23 },
        ],
        Math.min(total, 9),
      );
      return monsters;
    }

    // ── Thunder Isle ──
    case "thunder_isle": {
      // storm_sprite: 4-6 | thunder_golem: 2-3 | lightning_drake: 0-1 (rare)
      const hasDrake = Math.random() < 0.3;
      const golemCount = 2 + Math.floor(Math.random() * 2);
      const spriteCount = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < spriteCount; i++) {
        const pos = randomSpawnIn(tiles, 2, width - 3, 2, height - 3);
        if (pos)
          monsters.push(
            createMonster(
              "storm_sprite",
              pos.x,
              pos.y,
              true,
              tierCfg.wanderRadius,
            ),
          );
      }
      for (let i = 0; i < golemCount; i++) {
        const pos = randomSpawnIn(tiles, 3, width - 4, 3, height - 4);
        if (pos)
          monsters.push(createMonster("thunder_golem", pos.x, pos.y, false, 2));
      }
      if (hasDrake) {
        const pos = randomSpawnIn(tiles, 4, width - 5, 4, height - 5);
        if (pos)
          monsters.push(
            createMonster("lightning_drake", pos.x, pos.y, true, 5),
          );
      }
      return monsters;
    }

    // ── Unknown zone fallback: slimes + goblins ──────────────────────────────
    default: {
      distribute(
        [
          { type: "slime", weight: 50 },
          { type: "goblin", weight: 50 },
        ],
        total,
      );
      return monsters;
    }
  }
}

// ─── AI Tick ─────────────────────────────────────────────────────────────────

interface TickResult {
  updatedMonsters: MonsterEntity[];
  combatEvents: CombatEvent[];
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function dirToward(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): FacingDirection {
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "down" : "up";
}

/** Wander state timers (per-monster, keyed by id) — kept for backward compat */
const _wanderTimers = new Map<string, number>();
const _wanderDirs = new Map<string, { dx: number; dy: number }>();

const DIRS: { dx: number; dy: number }[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function randomDir(): { dx: number; dy: number } {
  return DIRS[Math.floor(Math.random() * DIRS.length)]!;
}

/**
 * Returns true if the tile at integer (x, y) is restricted for monster movement.
 */
function isBlockedForMonster(x: number, y: number, world: WorldMap): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true;
  const tile = world.tiles[y]?.[x];
  if (tile === undefined) return true;
  return (
    NON_WALKABLE.has(tile) || tile === TileType.PORTAL || tile === TileType.DOOR
  );
}

/**
 * Move monster toward (tx, ty) at given speed. Returns new position.
 * Falls back to staying in place if movement would be blocked.
 */
function moveToward(
  mx: number,
  my: number,
  tx: number,
  ty: number,
  speed: number,
  deltaMs: number,
  world: WorldMap,
): { x: number; y: number } {
  const d = dist(mx, my, tx, ty);
  if (d < 0.1) return { x: mx, y: my };
  const step = (speed * deltaMs) / 1000;
  const angle = Math.atan2(ty - my, tx - mx);
  const nx = mx + Math.cos(angle) * step;
  const ny = my + Math.sin(angle) * step;
  const tileX = Math.round(nx);
  const tileY = Math.round(ny);
  if (!isBlockedForMonster(tileX, tileY, world)) {
    return { x: nx, y: ny };
  }
  // Try axis-aligned movement as fallback
  const nxOnly = mx + Math.cos(angle) * step;
  if (!isBlockedForMonster(Math.round(nxOnly), Math.round(my), world)) {
    return { x: nxOnly, y: my };
  }
  const nyOnly = my + Math.sin(angle) * step;
  if (!isBlockedForMonster(Math.round(mx), Math.round(nyOnly), world)) {
    return { x: mx, y: nyOnly };
  }
  return { x: mx, y: my };
}

/**
 * Advance all monsters by deltaMs.
 * Player position is in tile coordinates.
 * zoneId is used to enforce zone-boundary rules (monster never follows player out).
 */
export function tickMonsters(
  monsters: MonsterEntity[],
  playerX: number,
  playerY: number,
  world: WorldMap,
  deltaMs: number,
  playerZoneId?: ZoneId,
  monsterZoneId?: ZoneId,
  zoneBounds?: { minX: number; minY: number; maxX: number; maxY: number },
): TickResult {
  const combatEvents: CombatEvent[] = [];
  const now = Date.now();

  const bounds = zoneBounds ?? {
    minX: 0,
    minY: 0,
    maxX: world.width - 1,
    maxY: world.height - 1,
  };

  // Zone mismatch check — if player is in a different zone, disable chasing
  const playerInSameZone =
    !playerZoneId || !monsterZoneId || playerZoneId === monsterZoneId;

  // Get tier config for the zone
  const tierCfg = monsterZoneId
    ? getTierConfig(monsterZoneId)
    : {
        aggroRange: 4,
        chaseRange: 10,
        wanderRadius: 4,
        groupAggroRadius: 3,
        canPatrol: true,
      };

  // Build group-aggro lookup: find monsters that aggroed this tick
  const newlyAggroed = new Set<string>();

  // ── Respawn tick: revive dead monsters whose timer has elapsed ──
  const nowRespawn = Date.now();
  // For lightning_drake: only one active at a time in the zone
  const activeDrakeCount = monsters.filter(
    (m) => m.type === "lightning_drake" && m.state !== "dead",
  ).length;

  const monstersAfterRespawn = monsters.map((m): MonsterEntity => {
    if (m.state !== "dead") return m;
    const cfg = MONSTER_CONFIG[m.type];
    const deathTime = m.deathTime ?? nowRespawn;
    if (nowRespawn - deathTime < cfg.respawnTimer) return m;
    // lightning_drake: only respawn if no other drake is alive
    if (m.type === "lightning_drake" && activeDrakeCount > 0) return m;
    const ai = _aiData.get(m.id);
    const spawnX = ai?.spawnX ?? m.x;
    const spawnY = ai?.spawnY ?? m.y;
    return {
      ...m,
      hp: cfg.maxHp,
      state: "idle",
      x: spawnX,
      y: spawnY,
      deathTime: undefined,
      aggroIndicatorTimer: 0,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      knockbackVelX: 0,
      knockbackVelY: 0,
      knockbackTimer: 0,
      lastAttackTime: 0,
      abilityTimer: _getInitialAbilityTimer(m.type),
      abilityState: "ready",
      parryActive: false,
    };
  });

  // ── Thunder Isle storm speed multiplier ──
  const isThunderZone = monsterZoneId === "thunder_isle";
  const stormSpeedMult =
    isThunderZone && isThunderIsleStormActive()
      ? getThunderIsleSpeedMultiplier()
      : 1.0;

  const updatedMonsters = monstersAfterRespawn.map((m): MonsterEntity => {
    if (m.state === "dead") return m;

    try {
      const cfg = MONSTER_CONFIG[m.type];
      const ai = _aiData.get(m.id);

      // Create AI data lazily if missing (backward compat)
      if (!ai) {
        _aiData.set(m.id, {
          spawnX: m.x,
          spawnY: m.y,
          patrolPointB: tierCfg.canPatrol ? { x: m.x + 3, y: m.y } : undefined,
          patrolGoingToB: true,
          wanderTimer: 0,
          idleTimer: 0,
          groupAggroTriggered: false,
        });
        return m;
      }

      // ── Animation tick ──
      const newAnimTimer = m.animTimer + deltaMs;
      const didAnimTick = newAnimTimer >= 1000 / ANIM_FPS;
      const animTimer = didAnimTick ? 0 : newAnimTimer;
      const animFrame = didAnimTick ? (m.animFrame + 1) % 4 : m.animFrame;

      // Player distance
      const d = playerInSameZone
        ? dist(m.x, m.y, playerX, playerY)
        : Number.POSITIVE_INFINITY;

      // Distance from spawn
      const dSpawn = dist(m.x, m.y, ai.spawnX, ai.spawnY);

      // ── Effective aggro range from tier config (overrides per-monster config) ──
      const effectiveAggroRange = Math.min(cfg.aggroRange, tierCfg.aggroRange);

      // ── State machine ──
      let newState = m.state;

      if (m.state !== "chasing" && m.state !== "attacking") {
        // Aggro check: player within effective range AND same zone
        if (d <= effectiveAggroRange && playerInSameZone) {
          newState = "chasing";
          _wanderTimers.delete(m.id);
          newlyAggroed.add(m.id);
        }
      } else if (m.state === "chasing" || m.state === "attacking") {
        // Player left zone or escaped chase range → return to spawn
        if (!playerInSameZone || d > tierCfg.chaseRange) {
          newState = "returning";
        }
      }

      // ── SPECIAL: cursed_navigator — teleport every 3000ms ──
      if (m.type === "cursed_navigator") {
        const navAi = ai;
        const teleportCd = (navAi.teleportTimer ?? 3000) - deltaMs;
        if (teleportCd <= 0) {
          // Teleport to random walkable tile within 3-tile radius
          let bestX = m.x;
          let bestY = m.y;
          for (let attempt = 0; attempt < 8; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist2 = 1 + Math.random() * 2;
            const tx2 = Math.round(m.x + Math.cos(angle) * dist2);
            const ty2 = Math.round(m.y + Math.sin(angle) * dist2);
            if (
              tx2 >= bounds.minX &&
              ty2 >= bounds.minY &&
              tx2 <= bounds.maxX &&
              ty2 <= bounds.maxY &&
              !isBlockedForMonster(tx2, ty2, world)
            ) {
              bestX = tx2;
              bestY = ty2;
              break;
            }
          }
          _aiData.set(m.id, { ...navAi, teleportTimer: 3000 });
          if (d <= effectiveAggroRange) newlyAggroed.add(m.id);
          return {
            ...m,
            x: bestX,
            y: bestY,
            state:
              d <= cfg.attackRange
                ? "attacking"
                : d <= effectiveAggroRange
                  ? "chasing"
                  : newState,
            animTimer,
            animFrame,
          };
        }
        _aiData.set(m.id, { ...navAi, teleportTimer: teleportCd });
      }

      // ── SPECIAL: storm_sprite — zigzag movement while chasing ──
      if (
        m.type === "storm_sprite" &&
        (newState === "chasing" || newState === "attacking")
      ) {
        const spriteAi = ai;
        const zigzagTimer = (spriteAi.wanderTimer ?? 0) + deltaMs;
        const ZIGZAG_MS = 800;
        if (zigzagTimer >= ZIGZAG_MS) {
          _aiData.set(m.id, { ...spriteAi, wanderTimer: 0 });
        } else {
          _aiData.set(m.id, { ...spriteAi, wanderTimer: zigzagTimer });
        }
        const chaseAngle = Math.atan2(playerY - m.y, playerX - m.x);
        const perpOffset =
          Math.sin((zigzagTimer / ZIGZAG_MS) * Math.PI * 2) * 0.6;
        const moveAngle = chaseAngle + perpOffset;
        const step = (cfg.speed * deltaMs) / 1000;
        const nx = m.x + Math.cos(moveAngle) * step;
        const ny = m.y + Math.sin(moveAngle) * step;
        const szTx = Math.round(nx);
        const szTy = Math.round(ny);
        if (
          szTx >= bounds.minX &&
          szTy >= bounds.minY &&
          szTx <= bounds.maxX &&
          szTy <= bounds.maxY &&
          !isBlockedForMonster(szTx, szTy, world)
        ) {
          return {
            ...m,
            x: nx,
            y: ny,
            state: d <= cfg.attackRange ? "attacking" : "chasing",
            facingDirection: dirToward(m.x, m.y, playerX, playerY),
            animTimer,
            animFrame,
          };
        }
      }

      // ── SPECIAL: thunder_golem — electric shockwave every 8s ──
      if (
        m.type === "thunder_golem" &&
        (newState === "chasing" || newState === "attacking") &&
        playerInSameZone
      ) {
        const golemAi = ai;
        const shockwaveCd = (golemAi.teleportTimer ?? 8000) - deltaMs;
        if (shockwaveCd <= 0 && d <= 3) {
          combatEvents.push({
            type: "player-hit",
            monsterId: m.id,
            damage: 40,
            timestamp: now,
          } as CombatEvent & { isSpecial?: string });
          const shockEvt = combatEvents[
            combatEvents.length - 1
          ] as CombatEvent & { isSpecial?: string };
          shockEvt.isSpecial = "thunder_shockwave";
          _aiData.set(m.id, { ...golemAi, teleportTimer: 8000 });
        } else {
          _aiData.set(m.id, {
            ...golemAi,
            teleportTimer: Math.max(0, shockwaveCd),
          });
        }
      }

      // ── SPECIAL: lightning_drake — diagonal sweep pattern ──
      if (
        m.type === "lightning_drake" &&
        (newState === "chasing" || newState === "patrolling")
      ) {
        const drakeAi = ai;
        const diagonalTimer = (drakeAi.wanderTimer ?? 0) + deltaMs;
        const SWEEP_MS = 1200;
        if (diagonalTimer >= SWEEP_MS) {
          _aiData.set(m.id, { ...drakeAi, wanderTimer: 0 });
        } else {
          _aiData.set(m.id, { ...drakeAi, wanderTimer: diagonalTimer });
        }
        const diagPhase = Math.floor((diagonalTimer / SWEEP_MS) * 4) % 4;
        const diagOffsets = [
          { dx: 1, dy: -1 },
          { dx: 1, dy: 1 },
          { dx: -1, dy: 1 },
          { dx: -1, dy: -1 },
        ];
        const diag = diagOffsets[diagPhase]!;
        const dToP = Math.max(dist(m.x, m.y, playerX, playerY), 0.01);
        const ldStep = (cfg.speed * deltaMs) / 1000;
        const ldNx =
          m.x +
          diag.dx * ldStep * 0.5 +
          ((playerX - m.x) / dToP) * ldStep * 0.8;
        const ldNy =
          m.y +
          diag.dy * ldStep * 0.5 +
          ((playerY - m.y) / dToP) * ldStep * 0.8;
        const ldTx = Math.round(ldNx);
        const ldTy = Math.round(ldNy);
        if (
          ldTx >= bounds.minX &&
          ldTy >= bounds.minY &&
          ldTx <= bounds.maxX &&
          ldTy <= bounds.maxY &&
          !isBlockedForMonster(ldTx, ldTy, world)
        ) {
          return {
            ...m,
            x: ldNx,
            y: ldNy,
            state: d <= cfg.attackRange ? "attacking" : newState,
            facingDirection: dirToward(m.x, m.y, playerX, playerY),
            animTimer,
            animFrame,
          };
        }
      }

      // ── SPECIAL: skeleton_gunner — backs away when player too close ──
      if (
        m.type === "skeleton_gunner" &&
        (newState === "chasing" || newState === "attacking")
      ) {
        if (d < 2.0 && d > 0.1 && playerInSameZone) {
          const retreatAngle = Math.atan2(m.y - playerY, m.x - playerX);
          const step = (cfg.speed * 0.8 * deltaMs) / 1000;
          const rx = m.x + Math.cos(retreatAngle) * step;
          const ry = m.y + Math.sin(retreatAngle) * step;
          if (!isBlockedForMonster(Math.round(rx), Math.round(ry), world)) {
            if (
              now - m.lastAttackTime >= cfg.attackCooldown &&
              d <= cfg.attackRange
            ) {
              combatEvents.push({
                type: "player-hit",
                monsterId: m.id,
                damage: cfg.damage,
                timestamp: now,
              });
              return {
                ...m,
                x: rx,
                y: ry,
                state: "attacking" as const,
                lastAttackTime: now,
                facingDirection: dirToward(m.x, m.y, playerX, playerY),
                animTimer,
                animFrame,
              };
            }
            return {
              ...m,
              x: rx,
              y: ry,
              state: "chasing" as const,
              facingDirection: dirToward(m.x, m.y, playerX, playerY),
              animTimer,
              animFrame,
            };
          }
        }
      }

      // ── SPECIAL: dark_wisp — teleport every 5000ms ──
      if (
        m.type === "dark_wisp" &&
        (newState === "chasing" || newState === "attacking") &&
        playerInSameZone
      ) {
        const wispAi = ai;
        const wispTeleportCd = (wispAi.teleportTimer ?? 5000) - deltaMs;
        if (wispTeleportCd <= 0) {
          let bx = m.x;
          let by = m.y;
          for (let attempt = 0; attempt < 8; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 1.5 + Math.random() * 0.5;
            const tx2 = Math.round(m.x + Math.cos(angle) * r);
            const ty2 = Math.round(m.y + Math.sin(angle) * r);
            if (
              tx2 >= bounds.minX &&
              ty2 >= bounds.minY &&
              tx2 <= bounds.maxX &&
              ty2 <= bounds.maxY &&
              !isBlockedForMonster(tx2, ty2, world)
            ) {
              bx = tx2;
              by = ty2;
              break;
            }
          }
          _aiData.set(m.id, { ...wispAi, teleportTimer: 5000 });
          return {
            ...m,
            x: bx,
            y: by,
            state:
              dist(bx, by, playerX, playerY) <= cfg.attackRange
                ? "attacking"
                : "chasing",
            animTimer,
            animFrame,
          };
        }
        _aiData.set(m.id, { ...wispAi, teleportTimer: wispTeleportCd });
      }

      // ── SPECIAL: ruins_archer — backs away when player < 2.5 tiles ──
      if (
        m.type === "ruins_archer" &&
        (newState === "chasing" || newState === "attacking") &&
        playerInSameZone
      ) {
        if (d < 2.5 && d > 0.1) {
          const retreatAngle = Math.atan2(m.y - playerY, m.x - playerX);
          const step = (cfg.speed * 0.9 * deltaMs) / 1000;
          const rx = m.x + Math.cos(retreatAngle) * step;
          const ry = m.y + Math.sin(retreatAngle) * step;
          if (!isBlockedForMonster(Math.round(rx), Math.round(ry), world)) {
            if (
              now - m.lastAttackTime >= cfg.attackCooldown &&
              d <= cfg.attackRange
            ) {
              combatEvents.push({
                type: "player-hit",
                monsterId: m.id,
                damage: cfg.damage,
                timestamp: now,
              });
              return {
                ...m,
                x: rx,
                y: ry,
                state: "attacking" as const,
                lastAttackTime: now,
                facingDirection: dirToward(m.x, m.y, playerX, playerY),
                animTimer,
                animFrame,
              };
            }
            return {
              ...m,
              x: rx,
              y: ry,
              state: "chasing" as const,
              facingDirection: dirToward(m.x, m.y, playerX, playerY),
              animTimer,
              animFrame,
            };
          }
        }
      }

      // ── SPECIAL: kraken_tentacle — stationary, attack only when in range ──
      if (m.type === "kraken_tentacle") {
        if (playerInSameZone && d <= cfg.attackRange) {
          if (now - m.lastAttackTime >= cfg.attackCooldown) {
            combatEvents.push({
              type: "player-hit",
              monsterId: m.id,
              damage: cfg.damage,
              timestamp: now,
            });
            return {
              ...m,
              state: "attacking" as const,
              lastAttackTime: now,
              facingDirection: dirToward(m.x, m.y, playerX, playerY),
              animTimer,
              animFrame,
            };
          }
          return { ...m, state: "attacking" as const, animTimer, animFrame };
        }
        // Not in range: stay idle at spawn
        return { ...m, state: "idle" as const, animTimer, animFrame };
      }

      // Group aggro: if nearby same-type monster just aggroed, we aggro too
      if (
        (newState === "idle" ||
          newState === "wandering" ||
          newState === "patrolling") &&
        tierCfg.groupAggroRadius > 0 &&
        playerInSameZone
      ) {
        for (const other of monsters) {
          if (other.id === m.id || other.type !== m.type) continue;
          if (newlyAggroed.has(other.id)) {
            const dOther = dist(m.x, m.y, other.x, other.y);
            if (dOther <= tierCfg.groupAggroRadius) {
              newState = "chasing";
              newlyAggroed.add(m.id);
              break;
            }
          }
        }
      }

      // ── Idle / wander state transitions ──
      if (newState === "idle") {
        const newIdleTimer = ai.idleTimer + deltaMs;
        if (newIdleTimer >= IDLE_PAUSE_MS) {
          _aiData.set(m.id, { ...ai, idleTimer: 0 });
          newState = tierCfg.canPatrol ? "patrolling" : "wandering";
          if (!tierCfg.canPatrol) _wanderDirs.set(m.id, randomDir());
        } else {
          _aiData.set(m.id, { ...ai, idleTimer: newIdleTimer });
        }
      }

      // ── Returning to spawn ──
      if (newState === "returning") {
        if (dSpawn <= 0.5) {
          // Arrived at spawn
          newState = "idle";
          _aiData.set(m.id, { ...ai, idleTimer: 0 });
          return {
            ...m,
            x: ai.spawnX,
            y: ai.spawnY,
            state: newState,
            animTimer,
            animFrame,
          };
        }
        // Walk toward spawn
        const retSpeed = cfg.speed * 0.7;
        const newPos = moveToward(
          m.x,
          m.y,
          ai.spawnX,
          ai.spawnY,
          retSpeed,
          deltaMs,
          world,
        );
        return {
          ...m,
          ...newPos,
          state: newState,
          facingDirection: dirToward(m.x, m.y, ai.spawnX, ai.spawnY),
          animTimer,
          animFrame,
        };
      }

      // ── Wander movement ──
      if (newState === "wandering") {
        const newWanderTimer = (_wanderTimers.get(m.id) ?? 0) + deltaMs;
        if (newWanderTimer >= WANDER_INTERVAL_MS) {
          _wanderTimers.set(m.id, 0);
          _wanderDirs.delete(m.id);
          _aiData.set(m.id, { ...ai, idleTimer: 0 });
          return { ...m, state: "idle", animTimer, animFrame };
        }
        _wanderTimers.set(m.id, newWanderTimer);
        const dir = _wanderDirs.get(m.id) ?? randomDir();
        const step = (cfg.speed * deltaMs) / 1000;
        const nx = m.x + dir.dx * step;
        const ny = m.y + dir.dy * step;
        const tx2 = Math.round(nx);
        const ty2 = Math.round(ny);
        const wanderDist = dist(nx, ny, ai.spawnX, ai.spawnY);
        const inBounds =
          tx2 >= bounds.minX &&
          ty2 >= bounds.minY &&
          tx2 <= bounds.maxX &&
          ty2 <= bounds.maxY;
        const walkable =
          inBounds &&
          !isBlockedForMonster(tx2, ty2, world) &&
          wanderDist <= tierCfg.wanderRadius;
        if (walkable) {
          return {
            ...m,
            x: nx,
            y: ny,
            state: newState,
            facingDirection:
              dir.dx !== 0
                ? dir.dx > 0
                  ? "right"
                  : "left"
                : dir.dy > 0
                  ? "down"
                  : "up",
            animTimer,
            animFrame,
          };
        }
        _wanderDirs.set(m.id, randomDir());
        return { ...m, state: newState, animTimer, animFrame };
      }

      // ── Patrol movement (aggressive zones) ──
      if (newState === "patrolling") {
        const targetPt = ai.patrolGoingToB
          ? (ai.patrolPointB ?? { x: ai.spawnX, y: ai.spawnY })
          : { x: ai.spawnX, y: ai.spawnY };
        const dTarget = dist(m.x, m.y, targetPt.x, targetPt.y);

        if (dTarget <= 0.5) {
          // Arrived at patrol point, reverse direction
          _aiData.set(m.id, { ...ai, patrolGoingToB: !ai.patrolGoingToB });
        }

        const patrolSpeed = cfg.speed * 0.6;
        const newPos = moveToward(
          m.x,
          m.y,
          targetPt.x,
          targetPt.y,
          patrolSpeed,
          deltaMs,
          world,
        );
        return {
          ...m,
          ...newPos,
          state: newState,
          facingDirection: dirToward(m.x, m.y, targetPt.x, targetPt.y),
          animTimer,
          animFrame,
        };
      }

      // ── Chase movement ──
      if (newState === "chasing") {
        if (d <= cfg.attackRange) {
          return { ...m, state: "attacking", animTimer, animFrame };
        }
        const chaseSpeed = cfg.speed * stormSpeedMult;
        const newPos = moveToward(
          m.x,
          m.y,
          playerX,
          playerY,
          chaseSpeed,
          deltaMs,
          world,
        );
        return {
          ...m,
          ...newPos,
          state: newState,
          facingDirection: dirToward(m.x, m.y, playerX, playerY),
          animTimer,
          animFrame,
        };
      }

      // ── Special abilities (for special monster types) ──
      let mWithAbility = { ...m, animTimer, animFrame };
      const currentState = newState as MonsterAIState;
      if (
        (m.type === "bog_witch" ||
          m.type === "cave_troll" ||
          m.type === "pirate_captain" ||
          m.type === "stone_warden") &&
        (currentState === "chasing" || currentState === "attacking") &&
        playerInSameZone
      ) {
        const newAbilityTimer = Math.max(0, (m.abilityTimer ?? 0) - deltaMs);
        mWithAbility = { ...mWithAbility, abilityTimer: newAbilityTimer };
        if (newAbilityTimer <= 0) {
          if (m.type === "bog_witch") {
            // Poison cloud at player position — push special event
            combatEvents.push({
              type: "player-hit",
              monsterId: m.id,
              damage: 0, // 0 = signal to spawn cloud, actual damage handled in game loop
              timestamp: now,
            } as CombatEvent & { isSpecial?: string });
            // Tag as poison cloud via a custom field
            const cloudEvent = combatEvents[
              combatEvents.length - 1
            ] as CombatEvent & { isSpecial?: string; spawnCloud?: boolean };
            cloudEvent.isSpecial = "poison_cloud";
            cloudEvent.spawnCloud = true;
            mWithAbility = {
              ...mWithAbility,
              abilityTimer: 8000 + Math.random() * 4000,
            };
          } else if (m.type === "cave_troll") {
            // Ground slam — stun player
            combatEvents.push({
              type: "player-hit",
              monsterId: m.id,
              damage: 0,
              timestamp: now,
            } as CombatEvent & { isSpecial?: string; stunMs?: number });
            const slamEvent = combatEvents[
              combatEvents.length - 1
            ] as CombatEvent & { isSpecial?: string; stunMs?: number };
            slamEvent.isSpecial = "ground_slam";
            slamEvent.stunMs = 1000;
            mWithAbility = {
              ...mWithAbility,
              abilityTimer: 15000,
              stunDurationMs: 1000,
            };
          } else if (m.type === "pirate_captain") {
            // Parry — block next attack
            mWithAbility = {
              ...mWithAbility,
              parryActive: true,
              abilityTimer: 8000,
              abilityState: "active" as const,
            };
          } else if (m.type === "stone_warden") {
            // Roar — push all players back (handled in game loop via event)
            combatEvents.push({
              type: "player-hit",
              monsterId: m.id,
              damage: 0,
              timestamp: now,
            } as CombatEvent & { isSpecial?: string });
            const roarEvent = combatEvents[
              combatEvents.length - 1
            ] as CombatEvent & { isSpecial?: string };
            roarEvent.isSpecial = "roar_push";
            mWithAbility = { ...mWithAbility, abilityTimer: 20000 };
          }
        }
      }

      // ── Attack player ──
      if (newState === "attacking") {
        if (d > cfg.attackRange * 1.2) {
          return { ...mWithAbility, state: "chasing" };
        }
        if (now - m.lastAttackTime >= cfg.attackCooldown) {
          combatEvents.push({
            type: "player-hit",
            monsterId: m.id,
            damage: cfg.damage,
            timestamp: now,
          });
          return {
            ...mWithAbility,
            state: newState,
            lastAttackTime: now,
          };
        }
        return { ...mWithAbility, state: newState };
      }

      return { ...mWithAbility, state: newState };
    } catch (_err) {
      return m;
    }
  });

  // Post-process: set aggroIndicatorTimer for newly aggroed monsters
  // and decrement it for all monsters
  const finalMonsters = updatedMonsters.map((m) => {
    if (m.state === "dead") return m;
    const wasNewlyAggroed = newlyAggroed.has(m.id);
    const newAggroTimer = wasNewlyAggroed
      ? 500
      : Math.max(0, (m.aggroIndicatorTimer ?? 0) - deltaMs);
    if (newAggroTimer === (m.aggroIndicatorTimer ?? 0) && !wasNewlyAggroed)
      return m;
    return { ...m, aggroIndicatorTimer: newAggroTimer };
  });

  return { updatedMonsters: finalMonsters, combatEvents };
}

// ─── Loot tables ──────────────────────────────────────────────────────────────

// ─── Zone loot tier ────────────────────────────────────────────────────────────
type LootTier = 1 | 2 | 3 | 4;
const ZONE_LOOT_TIER: Partial<Record<ZoneId, LootTier>> = {
  meadow_hub: 1,
  wilderness: 1,
  wolf_forest: 1,
  bear_forest: 1,
  tiger_jungle: 1,
  forest_depths: 1,
  ancient_ruins: 1,
  dark_forest: 2,
  ancient_ruins_deep: 2,
  cave_interior: 2,
  crystal_ruins: 2,
  cyclops_lair: 2,
  goblin_warrens: 2,
  bat_cave: 2,
  deep_cave: 2,
  hub_basement: 2,
  wilderness_dungeon: 2,
  forest_dungeon: 2,
  boss_chamber: 3,
  cursed_swamp: 3,
  floating_ruins: 3,
  pirate_island: 4,
  cursed_galleon: 4,
  thunder_isle: 4,
};
type RarityBand = "common" | "uncommon" | "rare" | "epic";
function rollRarityBand(tier: LootTier): RarityBand {
  const r = Math.random();
  switch (tier) {
    case 1:
      return r < 0.65
        ? "common"
        : r < 0.9
          ? "uncommon"
          : r < 0.99
            ? "rare"
            : "epic";
    case 2:
      return r < 0.55
        ? "common"
        : r < 0.83
          ? "uncommon"
          : r < 0.97
            ? "rare"
            : "epic";
    case 3:
      return r < 0.4
        ? "common"
        : r < 0.7
          ? "uncommon"
          : r < 0.92
            ? "rare"
            : "epic";
    case 4:
      return r < 0.3
        ? "common"
        : r < 0.6
          ? "uncommon"
          : r < 0.88
            ? "rare"
            : "epic";
  }
}
const RARITY_ITEM_POOLS: Record<
  RarityBand,
  Array<{ itemType: ItemType; amount: [number, number] }>
> = {
  common: [
    { itemType: "coin", amount: [3, 12] },
    { itemType: "leather_scrap", amount: [1, 2] },
    { itemType: "health_potion", amount: [1, 1] },
  ],
  uncommon: [
    { itemType: "coin", amount: [10, 30] },
    { itemType: "leather_armor", amount: [1, 1] },
    { itemType: "sword_basic", amount: [1, 1] },
    { itemType: "bear_pelt", amount: [1, 1] },
    { itemType: "mana_potion", amount: [1, 1] },
  ],
  rare: [
    { itemType: "coin", amount: [20, 50] },
    { itemType: "rare_gem", amount: [1, 1] },
    { itemType: "ancient_rune_shard", amount: [1, 2] },
    { itemType: "mana_crystal", amount: [1, 1] },
  ],
  epic: [
    { itemType: "coin", amount: [40, 80] },
    { itemType: "rare_weapon", amount: [1, 1] },
    { itemType: "mage_focus", amount: [1, 1] },
    { itemType: "warrior_emblem", amount: [1, 1] },
    { itemType: "iron_legion_gauntlets", amount: [1, 1] },
    { itemType: "scholars_focus", amount: [1, 1] },
  ],
};
function pickFromPool(
  pool: Array<{ itemType: ItemType; amount: [number, number] }>,
): { itemType: ItemType; amount: number } {
  const entry = pool[Math.floor(Math.random() * pool.length)]!;
  return {
    itemType: entry.itemType,
    amount:
      entry.amount[0] +
      Math.floor(Math.random() * (entry.amount[1] - entry.amount[0] + 1)),
  };
}

const LOOT_TABLE: Record<
  MonsterType,
  Array<{ itemType: ItemType; weight: number; amount: [number, number] }>
> = {
  slime: [
    { itemType: "coin", weight: 80, amount: [1, 5] },
    { itemType: "leather_armor", weight: 5, amount: [1, 1] },
  ],
  goblin: [
    { itemType: "coin", weight: 70, amount: [3, 10] },
    { itemType: "sword_basic", weight: 10, amount: [1, 1] },
    { itemType: "leather_armor", weight: 8, amount: [1, 1] },
    { itemType: "iron_shield", weight: 5, amount: [1, 1] },
  ],
  forest_troll: [
    { itemType: "coin", weight: 60, amount: [5, 20] },
    { itemType: "sword_basic", weight: 15, amount: [1, 1] },
    { itemType: "leather_armor", weight: 12, amount: [1, 1] },
    { itemType: "iron_shield", weight: 8, amount: [1, 1] },
  ],
  sprite_wisp: [
    { itemType: "coin", weight: 65, amount: [2, 8] },
    { itemType: "staff_basic", weight: 12, amount: [1, 1] },
    { itemType: "cloth_robe", weight: 8, amount: [1, 1] },
  ],
  crystal_golem: [
    { itemType: "coin", weight: 50, amount: [10, 30] },
    { itemType: "sword_basic", weight: 20, amount: [1, 1] },
    { itemType: "staff_basic", weight: 15, amount: [1, 1] },
    { itemType: "iron_shield", weight: 15, amount: [1, 1] },
  ],
  spider: [
    { itemType: "coin", weight: 70, amount: [1, 6] },
    { itemType: "leather_armor", weight: 15, amount: [1, 1] },
    { itemType: "cloth_robe", weight: 10, amount: [1, 1] },
  ],
  bat: [
    { itemType: "coin", weight: 70, amount: [1, 4] },
    { itemType: "leather_scrap", weight: 30, amount: [1, 1] },
  ],
  bear: [
    { itemType: "coin", weight: 50, amount: [5, 15] },
    { itemType: "bear_pelt", weight: 50, amount: [1, 1] },
  ],
  wolf: [
    { itemType: "coin", weight: 65, amount: [3, 10] },
    { itemType: "leather_armor", weight: 20, amount: [1, 1] },
    { itemType: "leather_scrap", weight: 15, amount: [1, 1] },
  ],
  tiger: [
    { itemType: "coin", weight: 55, amount: [5, 15] },
    { itemType: "leather_armor", weight: 25, amount: [1, 1] },
    { itemType: "leather_scrap", weight: 20, amount: [1, 1] },
  ],
  skeleton: [
    { itemType: "coin", weight: 60, amount: [3, 12] },
    { itemType: "leather_armor", weight: 15, amount: [1, 1] },
    { itemType: "sword_basic", weight: 15, amount: [1, 1] },
    { itemType: "coin", weight: 10, amount: [5, 20] },
  ],
  cyclops: [
    { itemType: "coin", weight: 40, amount: [15, 40] },
    { itemType: "sword_basic", weight: 25, amount: [1, 1] },
    { itemType: "leather_armor", weight: 20, amount: [1, 1] },
    { itemType: "coin", weight: 15, amount: [30, 60] },
  ],
  shadow_wolf: [
    { itemType: "coin", weight: 55, amount: [3, 10] },
    { itemType: "leather_scrap", weight: 35, amount: [1, 1] },
    { itemType: "leather_armor", weight: 10, amount: [1, 1] },
  ],
  stone_golem: [
    { itemType: "coin", weight: 35, amount: [8, 20] },
    { itemType: "stone_fragment", weight: 35, amount: [1, 3] },
    { itemType: "rare_gem", weight: 20, amount: [1, 1] },
    { itemType: "iron_shield", weight: 10, amount: [1, 1] },
  ],
  cave_bat: [
    { itemType: "coin", weight: 80, amount: [1, 3] },
    { itemType: "leather_scrap", weight: 20, amount: [1, 1] },
  ],
  cave_troll: [
    { itemType: "coin", weight: 35, amount: [15, 40] },
    { itemType: "troll_hide", weight: 25, amount: [1, 1] },
    { itemType: "rare_weapon", weight: 20, amount: [1, 1] },
    { itemType: "iron_legion_helmet", weight: 15, amount: [1, 1] },
    { itemType: "coin", weight: 5, amount: [30, 60] },
  ],
  stone_warden: [
    { itemType: "coin", weight: 25, amount: [50, 100] },
    { itemType: "rare_gem", weight: 30, amount: [1, 2] },
    { itemType: "rare_weapon", weight: 20, amount: [1, 1] },
    { itemType: "iron_legion_chestplate", weight: 25, amount: [1, 1] },
  ],
  // ── Cursed Swamp ──
  bog_witch: [
    { itemType: "coin", weight: 45, amount: [8, 15] },
    { itemType: "poison_vial", weight: 25, amount: [1, 1] },
    { itemType: "staff_basic", weight: 15, amount: [1, 1] },
    { itemType: "scholars_hat", weight: 15, amount: [1, 1] },
  ],
  swamp_lurker: [
    { itemType: "coin", weight: 65, amount: [5, 10] },
    { itemType: "leather_scrap", weight: 25, amount: [1, 1] },
    { itemType: "poison_vial", weight: 10, amount: [1, 1] },
  ],
  mud_golem: [
    { itemType: "coin", weight: 45, amount: [12, 20] },
    { itemType: "stone_fragment", weight: 35, amount: [1, 2] },
    { itemType: "iron_shield", weight: 20, amount: [1, 1] },
  ],
  // ── Floating Ruins ──
  ruin_specter: [
    { itemType: "coin", weight: 45, amount: [15, 25] },
    { itemType: "ancient_rune_shard", weight: 35, amount: [1, 1] },
    { itemType: "staff_basic", weight: 20, amount: [1, 1] },
  ],
  ancient_guardian: [
    { itemType: "coin", weight: 35, amount: [20, 35] },
    { itemType: "ancient_rune_shard", weight: 25, amount: [1, 2] },
    { itemType: "iron_shield", weight: 25, amount: [1, 1] },
    { itemType: "scholars_robe", weight: 15, amount: [1, 1] },
  ],
  sky_serpent: [
    { itemType: "coin", weight: 35, amount: [30, 50] },
    { itemType: "ancient_rune_shard", weight: 40, amount: [1, 3] },
    { itemType: "rare_gem", weight: 25, amount: [1, 1] },
  ],
  // ── Pirate Island ──
  pirate_grunt: [
    { itemType: "coin", weight: 65, amount: [6, 12] },
    { itemType: "leather_scrap", weight: 25, amount: [1, 1] },
    { itemType: "leather_armor", weight: 10, amount: [1, 1] },
  ],
  pirate_gunner: [
    { itemType: "coin", weight: 60, amount: [8, 15] },
    { itemType: "leather_armor", weight: 25, amount: [1, 1] },
    { itemType: "iron_shield", weight: 15, amount: [1, 1] },
  ],
  pirate_captain: [
    { itemType: "coin", weight: 45, amount: [25, 45] },
    { itemType: "sword_basic", weight: 25, amount: [1, 1] },
    { itemType: "rare_gem", weight: 20, amount: [1, 1] },
    { itemType: "leather_armor", weight: 10, amount: [1, 1] },
  ],
  pirate_cannon: [
    { itemType: "coin", weight: 60, amount: [10, 20] },
    { itemType: "stone_fragment", weight: 40, amount: [1, 2] },
  ],
  // ── Cursed Galleon ──
  cursed_sailor: [
    { itemType: "coin", weight: 55, amount: [10, 18] },
    { itemType: "leather_armor", weight: 25, amount: [1, 1] },
    { itemType: "sword_basic", weight: 20, amount: [1, 1] },
  ],
  skeleton_gunner: [
    { itemType: "coin", weight: 50, amount: [12, 22] },
    { itemType: "leather_scrap", weight: 30, amount: [1, 2] },
    { itemType: "iron_shield", weight: 20, amount: [1, 1] },
  ],
  cursed_navigator: [
    { itemType: "coin", weight: 45, amount: [15, 25] },
    { itemType: "staff_basic", weight: 30, amount: [1, 1] },
    { itemType: "rare_gem", weight: 25, amount: [1, 1] },
  ],
  ship_captain: [
    { itemType: "coin", weight: 35, amount: [60, 100] },
    { itemType: "rare_weapon", weight: 30, amount: [1, 1] },
    { itemType: "rare_gem", weight: 20, amount: [1, 2] },
    { itemType: "scholars_focus", weight: 15, amount: [1, 1] },
  ],
  // ── Thunder Isle ──
  storm_sprite: [
    { itemType: "coin", weight: 65, amount: [14, 22] },
    { itemType: "storm_crystal", weight: 8, amount: [1, 1] },
    { itemType: "leather_scrap", weight: 27, amount: [1, 1] },
  ],
  thunder_golem: [
    { itemType: "coin", weight: 55, amount: [25, 40] },
    { itemType: "thunder_shard", weight: 12, amount: [1, 1] },
    { itemType: "storm_crystal", weight: 4, amount: [1, 1] },
    { itemType: "stone_fragment", weight: 29, amount: [1, 2] },
  ],
  lightning_drake: [
    { itemType: "coin", weight: 40, amount: [40, 65] },
    { itemType: "storm_crystal", weight: 25, amount: [1, 2] },
    { itemType: "thunder_shard", weight: 30, amount: [1, 1] },
    { itemType: "rare_gem", weight: 5, amount: [1, 1] },
  ],
  forest_spirit: [
    { itemType: "coin", weight: 50, amount: [8, 14] },
    { itemType: "spirit_leaf", weight: 35, amount: [1, 2] },
    { itemType: "health_potion", weight: 15, amount: [1, 1] },
  ],
  dark_wisp: [
    { itemType: "coin", weight: 55, amount: [10, 16] },
    { itemType: "poison_vial", weight: 30, amount: [1, 1] },
    { itemType: "mana_potion", weight: 15, amount: [1, 1] },
  ],
  ruins_archer: [
    { itemType: "coin", weight: 50, amount: [18, 28] },
    { itemType: "ancient_rune_shard", weight: 30, amount: [3, 6] },
    { itemType: "health_potion", weight: 15, amount: [1, 1] },
    { itemType: "rare_gem", weight: 5, amount: [1, 1] },
  ],
  kraken_tentacle: [
    { itemType: "coin", weight: 45, amount: [30, 45] },
    { itemType: "leather_scrap", weight: 35, amount: [1, 2] },
    { itemType: "rare_gem", weight: 15, amount: [1, 1] },
    { itemType: "rare_weapon", weight: 5, amount: [1, 1] },
  ],
};

let _lootDropId = 1;

export function generateLootDrop(
  monster: MonsterEntity,
  zoneId: string,
): LootDrop[] {
  const tier: LootTier = ZONE_LOOT_TIER[zoneId as ZoneId] ?? 1;
  const isBoss =
    monster.type === "stone_warden" || monster.type === "ship_captain";
  const isElite = monster.isElite === true;

  const now = Date.now();
  const drops: LootDrop[] = [];

  // ─── Guaranteed gold coin drop ────────────────────────────────────────
  // Pick gold range from the monster's own loot table
  const table = LOOT_TABLE[monster.type];
  const coinEntries = table.filter((e) => e.itemType === "coin");
  let goldAmount: number;
  if (coinEntries.length > 0) {
    // Use the first coin entry range (most representative)
    const ce = coinEntries[0]!;
    goldAmount =
      ce.amount[0] +
      Math.floor(Math.random() * (ce.amount[1] - ce.amount[0] + 1));
  } else {
    // Fallback: tier-based minimum gold
    goldAmount = tier * 2 + Math.floor(Math.random() * tier * 3);
  }
  if (monster.isRare) goldAmount = Math.floor(goldAmount * 3);

  const coinId = `loot_${_lootDropId++}`;
  drops.push({
    id: coinId,
    x: monster.x,
    y: monster.y,
    zone: zoneId,
    item: { id: `item_${_lootDropId}`, itemType: "coin", amount: goldAmount },
    spawnTime: now,
  });

  // ─── Optional item drop ───────────────────────────────────────────────
  // Boss: guaranteed Epic item. Elite: guaranteed Rare+ item.
  // Normal monsters: zone-tiered rarity, ~60% chance for an item drop.
  let forcedRarity: RarityBand | null = null;
  if (isBoss) {
    forcedRarity = "epic";
  } else if (isElite) {
    let band = rollRarityBand(tier);
    while (band === "common" || band === "uncommon")
      band = rollRarityBand(tier);
    forcedRarity = band;
  }

  if (forcedRarity) {
    const picked = pickFromPool(RARITY_ITEM_POOLS[forcedRarity]);
    if (picked.itemType !== "coin") {
      // Only add a separate item drop if it's not a coin (coins already handled above)
      const itemId = `loot_${_lootDropId++}`;
      drops.push({
        id: itemId,
        x: monster.x + (Math.random() < 0.5 ? 1 : -1),
        y: monster.y,
        zone: zoneId,
        item: {
          id: `item_${_lootDropId}`,
          itemType: picked.itemType,
          amount: picked.amount,
        },
        spawnTime: now,
      });
    } else {
      // It rolled coin from the rarity pool — add the extra coins to the coin drop already pushed
      const extraAmount = monster.isRare ? picked.amount * 3 : picked.amount;
      drops[0]!.item.amount += extraAmount;
    }
    return drops;
  }

  // Standard item table roll — ~60% chance an item drops in addition to the coin
  const itemDropChance = 0.6;
  if (Math.random() > itemDropChance) return drops; // coin only, no item

  const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  let pickedEntry = table[0]!;
  for (const entry of table) {
    cumulative += entry.weight;
    if (roll <= cumulative) {
      pickedEntry = entry;
      break;
    }
  }

  // If the picked entry is a coin, skip adding a separate coin item drop
  if (pickedEntry.itemType === "coin") return drops;

  // Zone-tier rarity upgrade check
  const zoneBand = rollRarityBand(tier);
  const ITEM_RARITY_RANK: Partial<Record<ItemType, number>> = {
    coin: 0,
    leather_scrap: 0,
    stone_fragment: 0,
    health_potion: 0,
    leather_armor: 1,
    sword_basic: 1,
    staff_basic: 1,
    cloth_robe: 1,
    bear_pelt: 1,
    troll_hide: 1,
    mana_potion: 1,
    rare_gem: 2,
    ancient_rune_shard: 2,
    mana_crystal: 2,
    poison_vial: 2,
    storm_crystal: 2,
    thunder_shard: 3,
    iron_shield: 2,
    rare_weapon: 3,
    mage_focus: 3,
    warrior_emblem: 3,
    iron_legion_helmet: 3,
    iron_legion_chestplate: 3,
    iron_legion_gauntlets: 3,
    scholars_hat: 3,
    scholars_robe: 3,
    scholars_focus: 3,
  };
  const BAND_RANK: Record<RarityBand, number> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
  };
  const itemRank = ITEM_RARITY_RANK[pickedEntry.itemType] ?? 0;
  const bandRank = BAND_RANK[zoneBand];

  let itemToDrop: { itemType: ItemType; amount: number };
  if (bandRank > itemRank) {
    const upgraded = pickFromPool(RARITY_ITEM_POOLS[zoneBand]);
    if (upgraded.itemType === "coin") return drops;
    itemToDrop = upgraded;
  } else {
    const amount =
      pickedEntry.amount[0] +
      Math.floor(
        Math.random() * (pickedEntry.amount[1] - pickedEntry.amount[0] + 1),
      );
    itemToDrop = { itemType: pickedEntry.itemType, amount };
  }

  const itemDropId = `loot_${_lootDropId++}`;
  drops.push({
    id: itemDropId,
    x: monster.x + (Math.random() < 0.5 ? 1 : -1),
    y: monster.y,
    zone: zoneId,
    item: {
      id: `item_${_lootDropId}`,
      itemType: itemToDrop.itemType,
      amount: itemToDrop.amount,
    },
    spawnTime: now,
  });

  return drops;
}

export function damageMonster(
  monsters: MonsterEntity[],
  monsterId: string,
  damage: number,
): { monsters: MonsterEntity[]; event: CombatEvent | null; parried?: boolean } {
  let event: CombatEvent | null = null;
  let parried = false;
  const now = Date.now();

  const updated = monsters.map((m) => {
    if (m.id !== monsterId || m.state === "dead") return m;
    // Pirate Captain parry: block one attack while parryActive
    if (m.parryActive && m.type === "pirate_captain") {
      parried = true;
      // Parry used — reset it and set cooldown
      return {
        ...m,
        parryActive: false,
        abilityTimer: 8000,
        abilityState: "cooldown" as const,
      };
    }
    const newHp = Math.max(0, m.hp - damage);
    const died = newHp <= 0;
    event = {
      type: died ? "monster-died" : "monster-hit",
      monsterId,
      damage,
      timestamp: now,
    };
    return {
      ...m,
      hp: newHp,
      state: died ? ("dead" as const) : m.state,
      // Record death timestamp so respawn timer can start
      deathTime: died ? (m.deathTime ?? Date.now()) : m.deathTime,
    };
  });

  return { monsters: updated, event, parried };
}

/** Returns XP granted for killing a monster (3× for rare variants) */
export function getMonsterXp(type: MonsterType, isRare?: boolean): number {
  const base = MONSTER_CONFIG[type].xp;
  return isRare ? base * 3 : base;
}
