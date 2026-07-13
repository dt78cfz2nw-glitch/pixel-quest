import {
  playCollectLoot,
  playZoneMusic,
  playZoneTransition,
} from "../lib/audio";
import {
  blockInputForTransition,
  clearInputQueue,
  consumeRotate,
  createInputState,
  directionToOffset,
  getMovementCommand,
  markTapProcessed,
  resetInputState,
  unblockInputAfterTransition,
} from "../lib/input";
import { spawnMonsters } from "../lib/monsters";
import {
  WORLD_CONFIG,
  ZONE_TRANSITIONS,
  buildWorldMap,
  isWalkable,
  validatePlayerSpawn,
  validateZoneLoad,
} from "../lib/world";
import type {
  CharacterClass,
  Direction,
  EmoteType,
  FacingDirection,
  GameNotification,
  GameState,
  HazardEntity,
  HiddenRoom,
  InteractableObject,
  NotificationType,
  PlayerState,
  QuickSlots,
  TitleId,
  ZoneConfig,
  ZoneId,
  ZoneTransition,
} from "../types/game";
import {
  ATTACK_DURATION_MS,
  ATTACK_FLASH_DURATION_MS,
  EMOTE_DURATION_MS,
  MOVE_DURATION_MS,
  PLAYER_HURT_FLASH_MS,
  POTION_MAX,
  PVP_ZONES,
  RESPAWN_DELAY_MS,
  RESPAWN_ZONE_ID,
  SAFE_ZONES,
  SCREEN_SHAKE_DURATION_MS,
  SPRINT_DURATION_MS,
  TOWN_SPAWN,
  WARRIOR_SHIELD_ACTIVATE_MANA,
  WARRIOR_SHIELD_DMG_REDUCTION,
  WARRIOR_SHIELD_DURATION_MS,
  ZONE_FADE_COLORS,
} from "../types/game";

// ─── Respawn location choice ──────────────────────────────────────────────────

/** Module-level pending respawn zone. Set by UI before countdown expires. */
let _pendingRespawnZone: "meadow_hub" | "aurelion" = "meadow_hub";
export const AURELION_SPAWN = { x: 16, y: 21 } as const;

export function setRespawnLocationChoice(
  zone: "meadow_hub" | "aurelion",
): void {
  _pendingRespawnZone = zone;
}

// ─── Hidden Room Definitions ──────────────────────────────────────────────────
// Per zone: which wall tile is the hidden entry, and where the player spawns inside.

export const HIDDEN_ROOM_ENTRIES: Partial<
  Record<
    ZoneId,
    { entryX: number; entryY: number; roomSpawnX: number; roomSpawnY: number }
  >
> = {
  meadow_hub: { entryX: 38, entryY: 2, roomSpawnX: 2, roomSpawnY: 2 },
  forest_depths: { entryX: 0, entryY: 5, roomSpawnX: 2, roomSpawnY: 2 },
  dark_forest: { entryX: 35, entryY: 3, roomSpawnX: 2, roomSpawnY: 2 },
  cave_interior: { entryX: 35, entryY: 5, roomSpawnX: 2, roomSpawnY: 2 },
  ancient_ruins: { entryX: 35, entryY: 5, roomSpawnX: 2, roomSpawnY: 2 },
  cursed_swamp: { entryX: 39, entryY: 10, roomSpawnX: 2, roomSpawnY: 2 },
  pirate_island: { entryX: 31, entryY: 5, roomSpawnX: 2, roomSpawnY: 2 },
};

// ─── Interactable spawning ────────────────────────────────────────────────────

function spawnInteractables(
  zoneId: ZoneId,
  world: ReturnType<typeof buildWorldMap>,
): InteractableObject[] {
  const objects: InteractableObject[] = [];
  const now = Date.now();

  // Helper: find walkable tiles at least 2 away from edges
  const candidates: { x: number; y: number }[] = [];
  for (let y = 2; y < world.height - 2; y++) {
    for (let x = 2; x < world.width - 2; x++) {
      if (isWalkable(world, x, y)) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return objects;

  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  };

  const pick = (count: number) => shuffle([...candidates]).slice(0, count);

  // Barrels: Meadow, Forest, Pirate Island, Cave
  const barrelZones: ZoneId[] = [
    "meadow_hub",
    "forest_depths",
    "wolf_forest",
    "bear_forest",
    "pirate_island",
    "cave_interior",
    "bat_cave",
  ];
  if (barrelZones.includes(zoneId)) {
    const spots = pick(4);
    for (const s of spots) {
      objects.push({
        id: `barrel_${zoneId}_${s.x}_${s.y}_${now}`,
        x: s.x,
        y: s.y,
        type: "barrel",
        state: "intact",
      });
    }
  }

  // Mushrooms: Dark Forest only
  if (zoneId === "dark_forest") {
    const spots = pick(5);
    for (const s of spots) {
      objects.push({
        id: `mushroom_${s.x}_${s.y}_${now}`,
        x: s.x,
        y: s.y,
        type: "mushroom",
        state: "intact",
      });
    }
  }

  // Urns: Ruins zones
  const urnZones: ZoneId[] = [
    "ancient_ruins",
    "ancient_ruins_deep",
    "crystal_ruins",
    "floating_ruins",
  ];
  if (urnZones.includes(zoneId)) {
    const spots = pick(4);
    for (const s of spots) {
      objects.push({
        id: `urn_${zoneId}_${s.x}_${s.y}_${now}`,
        x: s.x,
        y: s.y,
        type: "urn",
        state: "intact",
      });
    }
  }

  return objects;
}

// ─── Hazard spawning ──────────────────────────────────────────────────────────

function spawnHazards(
  zoneId: ZoneId,
  world: ReturnType<typeof buildWorldMap>,
): HazardEntity[] {
  const hazards: HazardEntity[] = [];
  const now = Date.now();

  if (zoneId === "cursed_swamp") {
    // 3-5 static poison pools on walkable tiles
    const count = 3 + Math.floor(Math.random() * 3);
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = 2 + Math.floor(Math.random() * (world.width - 4));
        const y = 2 + Math.floor(Math.random() * (world.height - 4));
        const key = `${x},${y}`;
        if (isWalkable(world, x, y) && !used.has(key)) {
          used.add(key);
          hazards.push({
            id: `pool_${i}_${now}`,
            x,
            y,
            type: "poison_pool",
            radius: 0.5,
            active: true,
            spawnTime: now,
          });
          break;
        }
      }
    }
  }
  // Cave: falling rocks are spawned dynamically during gameplay, not at zone load

  return hazards;
}

// ─── Transition constants ─────────────────────────────────────────────────────

/** ms to fade from transparent → opaque */
const FADE_IN_MS = 300;
/** ms to fade from opaque → transparent */
const FADE_OUT_MS = 300;

/** Cooldown between transitions (ms) — prevents immediate re-trigger */
const TRANSITION_COOLDOWN_MS = 800;

// Phase tracker for the 3-phase transition: fade-in → swap → fade-out
type TransitionPhase = "fade-in" | "swap" | "fade-out" | "none";
const _transitionPhase = new WeakMap<GameState, TransitionPhase>();
const _transitionAccum = new WeakMap<GameState, number>();
const _pendingZone = new WeakMap<
  GameState,
  { zoneId: ZoneId; spawnX: number; spawnY: number }
>();

/** Per-state last transition tracking — {time, fromZone} for cooldown logic */
const _lastTransitionTime = new WeakMap<GameState, number>();
const _lastTransitionFromZone = new WeakMap<GameState, ZoneId>();

// ─── Initial State ────────────────────────────────────────────────────────────

export function createInitialPlayer(
  username: string,
  tileX = 5,
  tileY = 5,
  selectedClass: CharacterClass = "warrior",
  isGuest = false,
): PlayerState {
  return {
    username,
    selectedClass,
    tileX,
    tileY,
    targetTileX: tileX,
    targetTileY: tileY,
    pixelOffsetX: 0,
    pixelOffsetY: 0,
    animProgress: 1,
    isMoving: false,
    lastFacing: "down",
    attackActive: false,
    attackTimer: 0,
    attackFacing: "down",
    activeSpellType: "arcane",
    // RPG stats
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    xp: 0,
    level: 1,
    kills: 0,
    outfitColor: "default",
    outfitStyle: "default",
    hairColor: "brown",
    // Economy / Inventory
    coins: 0,
    inventory: [],
    equippedGear: { weapon: null, armor: null, offhand: null },
    // Mana timing — 0 means no cast yet, regen always allowed initially
    lastCastTime: 0,
    // Combo (Warrior)
    comboCount: 0,
    comboTarget: null,
    comboTimer: 0,
    comboBonusActive: false,
    // Death / Zone tracking
    deathRecap: null,
    zoneEnterTime: Date.now(),
    sessionDamageTaken: 0,
    // Shadow
    playerShadow: true,
    // Guest mode
    isGuest: isGuest || undefined,
    // Warrior Shield
    shieldActive: false,
    shieldDuration: 0,
    shieldCooldown: 0,
    // Stun / Invincibility
    stunTimer: 0,
    isInvincible: false,
    // Dodge
    dodgeInvincibilityTimer: 0,
    dodgeCooldownTimer: 0,
    dodgeGhosts: [],
    // Titles System
    titleTracking: {
      totalMonstersKilled: 0,
      treasureChestsCollected: 0,
      pvpKillsWithoutDeath: 0,
      piratesKilled: 0,
    },
    activeTitleId: "novice" as TitleId,
    earnedTitles: ["novice" as TitleId],
    consecutivePvpKillsWithoutDeath: 0,
    // Tap-to-move
    tapMoveTarget: null,
    tapMovePath: null,
  };
}

export function createGameState(
  username: string,
  startX = 5,
  startY = 5,
  selectedClass: CharacterClass = "warrior",
  isGuest = false,
): GameState {
  try {
    return _buildGameState(username, startX, startY, selectedClass, isGuest);
  } catch (err) {
    console.error(
      "[PixelQuest] createGameState failed — loading safe fallback state:",
      err,
    );
    return _buildSafeFallbackState(username, selectedClass, isGuest);
  }
}

function _buildGameState(
  username: string,
  startX: number,
  startY: number,
  selectedClass: CharacterClass,
  isGuest = false,
): GameState {
  let world: ReturnType<typeof buildWorldMap>;
  let hubZoneConfig: ZoneConfig;

  try {
    world = buildWorldMap(RESPAWN_ZONE_ID);
    hubZoneConfig = WORLD_CONFIG.zones[RESPAWN_ZONE_ID];
  } catch (err) {
    console.error(
      "[PixelQuest] buildWorldMap failed — using open meadow fallback:",
      err,
    );
    world = _buildFallbackWorldMap();
    hubZoneConfig = _buildFallbackZoneConfig();
  }

  let monsters: ReturnType<typeof spawnMonsters> = [];
  try {
    monsters = spawnMonsters(world, hubZoneConfig);
  } catch (err) {
    console.warn("[PixelQuest] spawnMonsters failed — no monsters:", err);
  }

  const state: GameState = {
    player: createInitialPlayer(
      username,
      startX,
      startY,
      selectedClass,
      isGuest,
    ),
    world,
    input: createInputState(),
    lastSavedTile: { x: startX, y: startY },
    otherPlayers: [],
    screenShakeTimer: 0,
    hitStopTimer: 0,
    attackFlashTimer: 0,
    monsters,
    recentCombatEvents: [],
    isDead: false,
    respawnTimer: 0,
    customization: {
      outfitColor: "default",
      outfitStyle: "default",
      hairColor: "brown",
    },
    currentZoneId: RESPAWN_ZONE_ID,
    isTransitioning: false,
    transitionAlpha: 0,
    transitionFadeColor: "#000000",
    activeNpcDialogue: null,
    lootDrops: [],
    playerHurt: false,
    playerHurtTimer: 0,
    inventoryOpen: false,
    potionCount: POTION_MAX,
    potionCooldownTimer: 0,
    manaPotionCount: 3,
    manaPotionCooldownTimer: 0,
    achievements: new Set<string>(),
    achievementPopup: null,
    pvpWarningShownZones: new Set(),
    pvpImmunityTimer: 0,
    dayNightTime: 0,
    frostNovaCooldown: 0,
    shadowLanceCooldown: 0,
    flameRingCooldown: 0,
    activeQuest: null,
    completedQuestIds: [],
    questCompletePopup: null,
    boss: null,
    shipCaptainBoss: null,
    shopOpen: false,
    shopNpcId: null,
    noManaShakeSpell: null,
    noManaNotifyExpiry: 0,
    mpBarPulse: false,
    targetedPlayerUsername: null,
    targetedMonsterId: null,
    pvpKillNotification: null,
    pvpGoldDrops: [],
    sprintActive: false,
    sprintHoldTimer: 0,
    // World Events
    activeWorldEvent: undefined,
    // Titles System
    titleTracking: {
      totalMonstersKilled: 0,
      treasureChestsCollected: 0,
      pvpKillsWithoutDeath: 0,
      piratesKilled: 0,
    },
    activeTitleId: "novice" as TitleId,
    earnedTitles: ["novice" as TitleId],
    pvpZoneSurvivalStartTime: undefined,
    consecutivePvpKillsWithoutDeath: 0,
    tapMoveIndicator: null,
    poisonClouds: [],
    interactableObjects: spawnInteractables(RESPAWN_ZONE_ID, world),
    hazards: spawnHazards(RESPAWN_ZONE_ID, world),
    hiddenRooms: {},
    inHiddenRoom: false,
    currentHiddenRoomKey: null,
    lorePopup: null,
    combatLog: [],
    rampageText: null,
    rampageTextExpiry: 0,
    quickSlots: ["health_potion", "mana_potion", null, null] as QuickSlots,
    notifications: [],
    milestoneRewards: new Set<number>(),
    berserkerUnlocked: false,
    manaShieldUnlocked: false,
    thunderstormActive: false,
    thunderstormTimer: 0,
    thunderstormCheckTimer: 0,
    lastLightningTime: 0,
    lightningNextTimer: 0,
    // Checkpoint system
    checkpoint: null,
    checkpointActive: false,
    respawnImmunityTimer: 0,
    respawnImmunityActive: false,
  };
  // Runtime-only ghost trail array (not in GameState type, not persisted)
  (state as unknown as { ghostTrails: unknown[] }).ghostTrails = [];
  _transitionPhase.set(state, "none");
  _transitionAccum.set(state, 0);
  _lastTransitionTime.set(state, 0);
  _lastTransitionFromZone.set(state, RESPAWN_ZONE_ID);
  return state;
}

/** Minimal open 20×20 meadow state — used when world generation crashes. */
function _buildFallbackWorldMap(): ReturnType<typeof buildWorldMap> {
  const GRASS = 0;
  const W = 20;
  const H = 20;
  const tiles: number[][] = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return 1;
      return GRASS;
    }),
  );
  return {
    tiles,
    width: W,
    height: H,
    npcs: [],
  } as unknown as ReturnType<typeof buildWorldMap>;
}

function _buildFallbackZoneConfig(): ZoneConfig {
  return {
    id: RESPAWN_ZONE_ID,
    name: "Meadow Hub",
    monsterTypes: [],
    monsterCount: 0,
    minLevel: 1,
    maxLevel: 1,
    pvpEnabled: false,
    ambientColor: null,
    musicTrack: "meadow",
  } as unknown as ZoneConfig;
}

function _buildSafeFallbackState(
  username: string,
  selectedClass: CharacterClass,
  isGuest = false,
): GameState {
  const world = _buildFallbackWorldMap();
  const state: GameState = {
    player: createInitialPlayer(username, 10, 10, selectedClass, isGuest),
    world,
    input: createInputState(),
    lastSavedTile: { x: 10, y: 10 },
    otherPlayers: [],
    screenShakeTimer: 0,
    hitStopTimer: 0,
    attackFlashTimer: 0,
    monsters: [],
    recentCombatEvents: [],
    isDead: false,
    respawnTimer: 0,
    customization: {
      outfitColor: "default",
      outfitStyle: "default",
      hairColor: "brown",
    },
    currentZoneId: RESPAWN_ZONE_ID,
    isTransitioning: false,
    transitionAlpha: 0,
    transitionFadeColor: "#000000",
    activeNpcDialogue: null,
    lootDrops: [],
    playerHurt: false,
    playerHurtTimer: 0,
    inventoryOpen: false,
    potionCount: POTION_MAX,
    potionCooldownTimer: 0,
    manaPotionCount: 3,
    manaPotionCooldownTimer: 0,
    achievements: new Set<string>(),
    achievementPopup: null,
    pvpWarningShownZones: new Set(),
    pvpImmunityTimer: 0,
    dayNightTime: 0,
    frostNovaCooldown: 0,
    shadowLanceCooldown: 0,
    flameRingCooldown: 0,
    activeQuest: null,
    completedQuestIds: [],
    questCompletePopup: null,
    boss: null,
    shipCaptainBoss: null,
    shopOpen: false,
    shopNpcId: null,
    noManaShakeSpell: null,
    noManaNotifyExpiry: 0,
    mpBarPulse: false,
    targetedPlayerUsername: null,
    targetedMonsterId: null,
    pvpKillNotification: null,
    pvpGoldDrops: [],
    sprintActive: false,
    sprintHoldTimer: 0,
    // World Events
    activeWorldEvent: undefined,
    // Titles System
    titleTracking: {
      totalMonstersKilled: 0,
      treasureChestsCollected: 0,
      pvpKillsWithoutDeath: 0,
      piratesKilled: 0,
    },
    activeTitleId: "novice" as TitleId,
    earnedTitles: ["novice" as TitleId],
    pvpZoneSurvivalStartTime: undefined,
    consecutivePvpKillsWithoutDeath: 0,
    tapMoveIndicator: null,
    poisonClouds: [],
    interactableObjects: [],
    hazards: [],
    hiddenRooms: {},
    inHiddenRoom: false,
    currentHiddenRoomKey: null,
    lorePopup: null,
    combatLog: [],
    rampageText: null,
    rampageTextExpiry: 0,
    quickSlots: ["health_potion", "mana_potion", null, null] as QuickSlots,
    notifications: [],
    milestoneRewards: new Set<number>(),
    berserkerUnlocked: false,
    manaShieldUnlocked: false,
    thunderstormActive: false,
    thunderstormTimer: 0,
    thunderstormCheckTimer: 0,
    lastLightningTime: 0,
    lightningNextTimer: 0,
    // Checkpoint system
    checkpoint: null,
    checkpointActive: false,
    respawnImmunityTimer: 0,
    respawnImmunityActive: false,
  };
  // Runtime-only ghost trail array
  (state as unknown as { ghostTrails: unknown[] }).ghostTrails = [];
  _transitionPhase.set(state, "none");
  _transitionAccum.set(state, 0);
  _lastTransitionTime.set(state, 0);
  _lastTransitionFromZone.set(state, RESPAWN_ZONE_ID);
  return state;
}

// ─── Zone transition helper ───────────────────────────────────────────────────

export function beginZoneTransition(
  state: GameState,
  toZone: ZoneId,
  spawnX: number,
  spawnY: number,
): void {
  if (state.isTransitioning) return;

  blockInputForTransition();
  clearInputQueue(state.input);

  state.isTransitioning = true;
  state.transitionAlpha = 0;
  state.transitionFadeColor = ZONE_FADE_COLORS[toZone] ?? "#000000";
  _transitionPhase.set(state, "fade-in");
  _transitionAccum.set(state, 0);
  _pendingZone.set(state, { zoneId: toZone, spawnX, spawnY });

  _lastTransitionTime.set(state, Date.now());
  _lastTransitionFromZone.set(state, state.currentZoneId);

  state.player.tileX = state.player.targetTileX;
  state.player.tileY = state.player.targetTileY;
  state.player.pixelOffsetX = 0;
  state.player.pixelOffsetY = 0;
  state.player.isMoving = false;
  state.player.animProgress = 1;
  // Clear any tap-to-move path on zone transition
  state.player.tapMovePath = null;
  state.player.tapMoveTarget = null;
  state.tapMoveIndicator = null;
}

/** Perform the actual zone swap (called mid-transition when alpha=1). */
function executeZoneSwap(
  state: GameState,
  toZone: ZoneId,
  spawnX: number,
  spawnY: number,
): void {
  try {
    _doZoneSwap(state, toZone, spawnX, spawnY);
  } catch (err) {
    console.error(
      `[PixelQuest] executeZoneSwap to "${toZone}" crashed — falling back to ${RESPAWN_ZONE_ID}:`,
      err,
    );
    try {
      _doZoneSwap(state, RESPAWN_ZONE_ID, TOWN_SPAWN.x, TOWN_SPAWN.y);
    } catch (err2) {
      console.error("[PixelQuest] Fallback zone swap also failed:", err2);
      state.isTransitioning = false;
      state.transitionAlpha = 0;
    }
  }
}

function _doZoneSwap(
  state: GameState,
  toZone: ZoneId,
  spawnX: number,
  spawnY: number,
): void {
  let destZone = toZone;
  let destX = spawnX;
  let destY = spawnY;

  if (!validateZoneLoad(destZone)) {
    console.warn(
      `[Zone] validateZoneLoad failed for "${destZone}", falling back to ${RESPAWN_ZONE_ID}`,
    );
    destZone = RESPAWN_ZONE_ID;
    destX = TOWN_SPAWN.x;
    destY = TOWN_SPAWN.y;
  }

  const newWorld = buildWorldMap(destZone);
  const zoneConfig = WORLD_CONFIG.zones[destZone];

  const safeSpawn = validatePlayerSpawn(destX, destY, newWorld);
  destX = safeSpawn.x;
  destY = safeSpawn.y;

  state.world = newWorld;
  state.currentZoneId = destZone;
  state.monsters = spawnMonsters(newWorld, zoneConfig);
  state.recentCombatEvents = [];
  state.lootDrops = [];
  state.interactableObjects = spawnInteractables(destZone, newWorld);
  state.hazards = spawnHazards(destZone, newWorld);
  state.inHiddenRoom = false;
  state.currentHiddenRoomKey = null;

  state.player.tileX = destX;
  state.player.tileY = destY;
  state.player.targetTileX = destX;
  state.player.targetTileY = destY;
  state.player.pixelOffsetX = 0;
  state.player.pixelOffsetY = 0;
  state.player.isMoving = false;
  state.player.animProgress = 1;
  state.player.tapMovePath = null;
  state.player.tapMoveTarget = null;
  state.tapMoveIndicator = null;

  state.activeNpcDialogue = null;

  state.player.zoneEnterTime = Date.now();
  state.player.sessionDamageTaken = 0;

  try {
    playZoneMusic(toZone);
  } catch (err) {
    console.warn("[PixelQuest] playZoneMusic failed (non-fatal):", err);
  }
}

// ─── Emote helpers ────────────────────────────────────────────────────────────

export function triggerEmote(player: PlayerState, emote: EmoteType): void {
  player.activeEmote = emote;
  player.emoteExpiry = Date.now() + EMOTE_DURATION_MS;
}

function dirToFacing(dir: Direction): FacingDirection {
  switch (dir) {
    case "up":
    case "up-left":
    case "up-right":
      return "up";
    case "down":
    case "down-left":
    case "down-right":
      return "down";
    case "left":
      return "left";
    case "right":
      return "right";
  }
}

// ─── BFS Pathfinding (tap-to-move) ────────────────────────────────────────────

/**
 * Simple BFS from (startX, startY) to (goalX, goalY), max 20 steps.
 * Returns an array of tiles to walk through (not including start), or null if unreachable.
 */
function bfsPath(
  world: GameState["world"],
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): { x: number; y: number }[] | null {
  if (startX === goalX && startY === goalY) return [];
  if (!isWalkable(world, goalX, goalY)) return null;

  const MAX_STEPS = 20;
  const visited = new Set<string>();
  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] =
    [];

  visited.add(`${startX},${startY}`);
  queue.push({ x: startX, y: startY, path: [] });

  // 8-directional movement offsets
  const offsets = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length >= MAX_STEPS) continue;

    for (const { dx, dy } of offsets) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!isWalkable(world, nx, ny)) continue;

      // For diagonal movement, also check that both cardinal neighbors are walkable
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(world, current.x + dx, current.y)) continue;
        if (!isWalkable(world, current.x, current.y + dy)) continue;
      }

      visited.add(key);
      const newPath = [...current.path, { x: nx, y: ny }];

      if (nx === goalX && ny === goalY) return newPath;
      queue.push({ x: nx, y: ny, path: newPath });
    }
  }
  return null;
}

// ─── Facing rotation helper ───────────────────────────────────────────────────

const FACING_ROTATION: FacingDirection[] = ["up", "right", "down", "left"];

function rotateFacingCW(facing: FacingDirection): FacingDirection {
  const idx = FACING_ROTATION.indexOf(facing);
  return FACING_ROTATION[(idx + 1) % 4];
}

// ─── State Update ─────────────────────────────────────────────────────────────

/**
 * Advance the game state by `deltaMs` milliseconds.
 * Returns true if the player just landed on a new tile (triggers save).
 */
export function tickGameState(state: GameState, deltaMs: number): boolean {
  const { player, world, input } = state;
  let justLanded = false;

  // ── Dead reckoning: interpolate other players toward server positions ──
  if (state.otherPlayers.length > 0) {
    const DR_LERP = 1 - 0.003 ** (deltaMs / 1000);
    for (const op of state.otherPlayers) {
      if (op.serverX === undefined || op.serverY === undefined) continue;
      const vel_weight = 0.4;
      const predX = op.serverX + (op.velX ?? 0) * vel_weight * deltaMs;
      const predY = op.serverY + (op.velY ?? 0) * vel_weight * deltaMs;
      op.x = op.x + (predX - op.x) * DR_LERP;
      op.y = op.y + (predY - op.y) * DR_LERP;
      if (Math.abs(op.x - predX) < 0.05) op.x = predX;
      if (Math.abs(op.y - predY) < 0.05) op.y = predY;
    }
  }

  // ── Handle zone transition animation ──
  const phase = _transitionPhase.get(state) ?? "none";
  if (phase !== "none") {
    const accum = (_transitionAccum.get(state) ?? 0) + deltaMs;
    _transitionAccum.set(state, accum);

    if (phase === "fade-in") {
      state.transitionAlpha = Math.min(1, accum / FADE_IN_MS);
      if (accum >= FADE_IN_MS) {
        const pending = _pendingZone.get(state);
        if (pending) {
          executeZoneSwap(
            state,
            pending.zoneId,
            pending.spawnX,
            pending.spawnY,
          );
          _pendingZone.delete(state);
        }
        _transitionPhase.set(state, "fade-out");
        _transitionAccum.set(state, 0);
        unblockInputAfterTransition();
        resetInputState(state.input);
      }
    } else if (phase === "fade-out") {
      state.transitionAlpha = Math.max(0, 1 - accum / FADE_OUT_MS);
      if (accum >= FADE_OUT_MS) {
        state.transitionAlpha = 0;
        state.isTransitioning = false;
        _transitionPhase.set(state, "none");
        _transitionAccum.set(state, 0);
      }
    }
    return false;
  }

  // ── Handle respawn countdown ──
  if (state.isDead) {
    state.respawnTimer = Math.max(0, state.respawnTimer - deltaMs);
    if (state.respawnTimer <= 0) {
      state.isDead = false;
      player.hp = player.maxHp;
      player.mp = player.maxMp;

      // ── Grant post-respawn immunity (10 seconds) ──
      state.respawnImmunityActive = true;
      state.respawnImmunityTimer = 10000;

      const chosenZone = _pendingRespawnZone;
      const chosenSpawn =
        chosenZone === "aurelion" ? AURELION_SPAWN : TOWN_SPAWN;
      _pendingRespawnZone = "meadow_hub";

      // ── EXP zone respawn costs 25 gold; city respawn is always free ──
      const isExpZoneRespawn =
        !SAFE_ZONES.has(state.currentZoneId) && !player.isGuest;
      if (isExpZoneRespawn) {
        if (player.coins >= 25) {
          player.coins = Math.max(0, player.coins - 25);
        }
        // If < 25 gold, respawn is free (shown via dispatch event for UI feedback)
        window.dispatchEvent(
          new CustomEvent("respawn_cost", {
            detail: {
              cost: player.coins >= 25 ? 25 : 0,
              wasFree: player.coins < 25,
            },
          }),
        );
      }

      if (state.currentZoneId !== chosenZone) {
        beginZoneTransition(state, chosenZone, chosenSpawn.x, chosenSpawn.y);
      } else {
        player.tileX = chosenSpawn.x;
        player.tileY = chosenSpawn.y;
        player.targetTileX = chosenSpawn.x;
        player.targetTileY = chosenSpawn.y;
        player.pixelOffsetX = 0;
        player.pixelOffsetY = 0;
        player.isMoving = false;
        player.animProgress = 1;
      }
    }
    return false;
  }

  // ── Expire emotes ──
  if (
    player.activeEmote &&
    player.emoteExpiry &&
    Date.now() > player.emoteExpiry
  ) {
    player.activeEmote = undefined;
    player.emoteExpiry = undefined;
  }

  // ── Expire chat bubbles ──
  if (
    player.chatMessage &&
    player.chatExpiry &&
    Date.now() > player.chatExpiry
  ) {
    player.chatMessage = undefined;
    player.chatExpiry = undefined;
  }

  // ── Consume attack pending flag ──
  if (input.attackPending) {
    input.attackPending = false;
    if (!player.attackActive) {
      player.attackActive = true;
      player.attackTimer = ATTACK_DURATION_MS;
      player.attackFacing = player.lastFacing;
      player.activeSpellType = "arcane";
      state.screenShakeTimer = SCREEN_SHAKE_DURATION_MS;
      state.attackFlashTimer = ATTACK_FLASH_DURATION_MS;
    }
  }

  // ── Consume shield pending flag (Warrior only) ──
  if (input.shieldPending) {
    input.shieldPending = false;
    if (
      player.selectedClass === "warrior" &&
      !player.shieldActive &&
      player.mp >= WARRIOR_SHIELD_ACTIVATE_MANA &&
      !player.isGuest
    ) {
      player.mp = Math.max(0, player.mp - WARRIOR_SHIELD_ACTIVATE_MANA);
      player.shieldActive = true;
      player.shieldDuration = WARRIOR_SHIELD_DURATION_MS;
      player.shieldCooldown = 0;
      player.lastCastTime = Date.now();
    } else if (
      player.selectedClass === "warrior" &&
      player.mp < WARRIOR_SHIELD_ACTIVATE_MANA
    ) {
      state.noManaShakeSpell = "shield";
      state.noManaNotifyExpiry = Date.now() + 1500;
    }
  }

  // ── Consume rotation command ──
  if (!state.isTransitioning && !state.isDead && consumeRotate(input)) {
    player.lastFacing = rotateFacingCW(player.lastFacing);
  }

  // ── Tick attack animation down ──
  if (player.attackActive) {
    player.attackTimer = Math.max(0, player.attackTimer - deltaMs);
    if (player.attackTimer <= 0) {
      player.attackActive = false;
    }
  }

  // ── Tick screen shake ──
  if (state.screenShakeTimer > 0) {
    state.screenShakeTimer = Math.max(0, state.screenShakeTimer - deltaMs);
  }

  // ── Tick hit-stop ──
  if (state.hitStopTimer > 0) {
    state.hitStopTimer = Math.max(0, state.hitStopTimer - deltaMs);
  }

  // ── Tick attack flash ──
  if (state.attackFlashTimer > 0) {
    state.attackFlashTimer = Math.max(0, state.attackFlashTimer - deltaMs);
  }

  // ── Tick player hurt flash ──
  if (state.playerHurtTimer > 0) {
    state.playerHurtTimer = Math.max(0, state.playerHurtTimer - deltaMs);
    state.playerHurt = state.playerHurtTimer > 0;
  } else {
    state.playerHurt = false;
  }

  // ── Tick potion cooldown ──
  if (state.potionCooldownTimer > 0) {
    state.potionCooldownTimer = Math.max(
      0,
      state.potionCooldownTimer - deltaMs,
    );
  }

  // ── Tick mana potion cooldown ──
  if (state.manaPotionCooldownTimer > 0) {
    state.manaPotionCooldownTimer = Math.max(
      0,
      state.manaPotionCooldownTimer - deltaMs,
    );
  }

  // ── Tick PVP immunity ──
  if (state.pvpImmunityTimer > 0) {
    state.pvpImmunityTimer = Math.max(0, state.pvpImmunityTimer - deltaMs);
  }

  // ── Tick respawn immunity ──
  if (state.respawnImmunityTimer > 0) {
    state.respawnImmunityTimer = Math.max(
      0,
      state.respawnImmunityTimer - deltaMs,
    );
    if (state.respawnImmunityTimer <= 0) {
      state.respawnImmunityActive = false;
    }
  }

  // ── Tick mage spell cooldowns ──
  if (state.frostNovaCooldown > 0) {
    state.frostNovaCooldown = Math.max(0, state.frostNovaCooldown - deltaMs);
  }
  if (state.shadowLanceCooldown > 0) {
    state.shadowLanceCooldown = Math.max(
      0,
      state.shadowLanceCooldown - deltaMs,
    );
  }
  if (state.flameRingCooldown > 0) {
    state.flameRingCooldown = Math.max(0, state.flameRingCooldown - deltaMs);
  }

  // ── Tick warrior shield ──
  if (player.shieldActive) {
    player.shieldDuration = Math.max(0, player.shieldDuration - deltaMs);
    const shieldBreakByMana = player.mp === 0;
    if (player.shieldDuration <= 0 || shieldBreakByMana) {
      player.shieldActive = false;
      player.shieldCooldown = 0;
      if (shieldBreakByMana) {
        window.dispatchEvent(
          new CustomEvent("shield_break", {
            detail: { username: player.username },
          }),
        );
      }
    }
  }

  // ── Expire no-mana shake notification ──
  if (state.noManaNotifyExpiry > 0 && Date.now() > state.noManaNotifyExpiry) {
    state.noManaShakeSpell = null;
    state.noManaNotifyExpiry = 0;
  }

  // ── MP bar pulse: true when mp is 0 ──
  state.mpBarPulse = state.player.mp === 0;

  // ── Tick day/night cycle ──
  state.dayNightTime = (state.dayNightTime + deltaMs) % 1_200_000;

  // ── Expire achievement popup ──
  if (state.achievementPopup && Date.now() > state.achievementPopup.expiresAt) {
    state.achievementPopup = null;
  }

  // ── Expire lore popup ──
  if (state.lorePopup && Date.now() > state.lorePopup.expiresAt) {
    state.lorePopup = null;
  }

  // ── Expire old combat events ──
  const now = Date.now();
  state.recentCombatEvents = state.recentCombatEvents.filter(
    (e) => now - e.timestamp < 600,
  );

  // ── Despawn expired loot drops (60s lifetime with fade-out at 50s) ──
  if (state.lootDrops.length > 0) {
    state.lootDrops = state.lootDrops.filter(
      (ld) => now - ld.spawnTime < 60000,
    );
  }

  // ── Tick interactable respawns ──
  if (state.interactableObjects.length > 0) {
    for (const obj of state.interactableObjects) {
      if (obj.respawnTimer !== undefined && obj.respawnTimer <= now) {
        if (obj.type === "barrel") {
          obj.state = "intact";
          obj.respawnTimer = undefined;
        } else if (obj.type === "mushroom") {
          obj.state = "intact";
          obj.respawnTimer = undefined;
        }
      }
    }
  }

  // ── Tick tap-to-move indicator fade ──
  if (state.tapMoveIndicator) {
    state.tapMoveIndicator.opacity = Math.max(
      0,
      state.tapMoveIndicator.opacity - deltaMs / 1000,
    );
    if (state.tapMoveIndicator.opacity <= 0) {
      state.tapMoveIndicator = null;
    }
  }

  // ── Movement animation ──
  if (player.isMoving) {
    const moveDuration = state.sprintActive
      ? SPRINT_DURATION_MS
      : MOVE_DURATION_MS;
    const raw = Math.min(1, player.animProgress + deltaMs / moveDuration);
    player.animProgress = raw;

    player.pixelOffsetX =
      (player.targetTileX - player.tileX) * 32 * player.animProgress;
    player.pixelOffsetY =
      (player.targetTileY - player.tileY) * 32 * player.animProgress;

    if (player.animProgress >= 1) {
      player.tileX = player.targetTileX;
      player.tileY = player.targetTileY;
      player.pixelOffsetX = 0;
      player.pixelOffsetY = 0;
      player.isMoving = false;
      justLanded = true;
    }
  }

  // ── Start next move if idle ──
  if (!player.isMoving && !state.isTransitioning) {
    // ── Tap-to-move pathfinding: handle a pending map-tap target ──
    const tapTarget = input.tapMoveTarget;
    if (tapTarget !== null && tapTarget !== undefined) {
      // Compute or consume the pre-computed path
      if (!player.tapMovePath || player.tapMovePath.length === 0) {
        // Need to compute path
        const path = bfsPath(
          world,
          player.tileX,
          player.tileY,
          tapTarget.x,
          tapTarget.y,
        );
        if (path && path.length > 0) {
          player.tapMovePath = path;
        } else {
          // Target unreachable — clear
          input.tapMoveTarget = null;
          player.tapMovePath = null;
          state.tapMoveIndicator = null;
        }
      }

      // Walk one step along path
      if (player.tapMovePath && player.tapMovePath.length > 0) {
        const nextStep = player.tapMovePath[0];
        if (isWalkable(world, nextStep.x, nextStep.y)) {
          player.tapMovePath = player.tapMovePath.slice(1);
          const dx = nextStep.x - player.tileX;
          const dy = nextStep.y - player.tileY;
          player.targetTileX = nextStep.x;
          player.targetTileY = nextStep.y;
          player.animProgress = 0;
          player.pixelOffsetX = 0;
          player.pixelOffsetY = 0;
          player.isMoving = true;
          // Face the direction of movement
          const absDir =
            dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
          player.lastFacing = absDir;
          // If path exhausted, clear target
          if (player.tapMovePath.length === 0) {
            input.tapMoveTarget = null;
            state.tapMoveIndicator = null;
          }
        } else {
          // Path became blocked — abort
          player.tapMovePath = null;
          input.tapMoveTarget = null;
          state.tapMoveIndicator = null;
        }
      }
    } else {
      // ── D-Pad / keyboard movement ──
      const cmd = getMovementCommand(input);
      if (cmd !== null) {
        const { type, direction } = cmd;
        const { dx, dy } = directionToOffset(direction);
        const nx = player.tileX + dx;
        const ny = player.tileY + dy;
        if (isWalkable(world, nx, ny)) {
          player.targetTileX = nx;
          player.targetTileY = ny;
          player.animProgress = 0;
          player.pixelOffsetX = 0;
          player.pixelOffsetY = 0;
          player.isMoving = true;
          // Diagonal movement: face nearest cardinal direction
          if (dx !== 0 && dy !== 0) {
            // Face horizontally by default for diagonals
            player.lastFacing = dx > 0 ? "right" : "left";
          } else {
            player.lastFacing = dirToFacing(direction);
          }
          // If it was a tap, mark it processed after 1 tile
          if (type === "tap") {
            markTapProcessed(input);
          }
        } else if (type === "tap") {
          // Tap on wall — try sliding along one axis
          const slideX = isWalkable(world, nx, player.tileY);
          const slideY = isWalkable(world, player.tileX, ny);
          if (slideX) {
            player.targetTileX = nx;
            player.targetTileY = player.tileY;
            player.animProgress = 0;
            player.pixelOffsetX = 0;
            player.pixelOffsetY = 0;
            player.isMoving = true;
            player.lastFacing = dx > 0 ? "right" : "left";
          } else if (slideY) {
            player.targetTileX = player.tileX;
            player.targetTileY = ny;
            player.animProgress = 0;
            player.pixelOffsetX = 0;
            player.pixelOffsetY = 0;
            player.isMoving = true;
            player.lastFacing = dy > 0 ? "down" : "up";
          }
          markTapProcessed(input);
        } else if (type === "hold" && dx !== 0 && dy !== 0) {
          // Diagonal hold blocked — try each axis individually
          if (isWalkable(world, nx, player.tileY)) {
            player.targetTileX = nx;
            player.targetTileY = player.tileY;
            player.animProgress = 0;
            player.pixelOffsetX = 0;
            player.pixelOffsetY = 0;
            player.isMoving = true;
            player.lastFacing = dx > 0 ? "right" : "left";
          } else if (isWalkable(world, player.tileX, ny)) {
            player.targetTileX = player.tileX;
            player.targetTileY = ny;
            player.animProgress = 0;
            player.pixelOffsetX = 0;
            player.pixelOffsetY = 0;
            player.isMoving = true;
            player.lastFacing = dy > 0 ? "down" : "up";
          }
        }
      }
    }
  }

  // ── Check for player death ──
  if (player.hp <= 0 && !state.isDead) {
    state.isDead = true;
    state.respawnTimer = RESPAWN_DELAY_MS;
    player.deathRecap = {
      killerName: "a Monster",
      damageTaken: player.sessionDamageTaken,
      timeInZone: now - player.zoneEnterTime,
    };
    state.recentCombatEvents.push({
      type: "player-died",
      damage: 0,
      timestamp: now,
    });
    state.pvpZoneSurvivalStartTime = undefined;
    state.consecutivePvpKillsWithoutDeath = 0;
    player.consecutivePvpKillsWithoutDeath = 0;
    // Clear tap-to-move on death
    player.tapMovePath = null;
    player.tapMoveTarget = null;
    input.tapMoveTarget = null;
    state.tapMoveIndicator = null;

    // ── XP penalty on death ──
    if (!player.isGuest) {
      const isPvpZone = PVP_ZONES.has(state.currentZoneId);
      const penaltyRate = isPvpZone ? 0.25 : 0.1;
      const xpPenalty = Math.floor(player.xp * penaltyRate);
      player.xp = Math.max(0, player.xp - xpPenalty);
    }

    // ── Item durability loss on death (1% per death, min 0) ──
    if (!player.isGuest) {
      for (const item of player.inventory) {
        const itemWithDur = item as unknown as { durability?: number };
        if (itemWithDur.durability !== undefined) {
          itemWithDur.durability = Math.max(0, itemWithDur.durability - 1);
        } else {
          // Initialize durability for items that lack it (backward compat)
          itemWithDur.durability = 99; // was 100, just lost 1
        }
      }
    }
  }

  // ── PVP zone survival tracking ──
  const inPvpZone = PVP_ZONES.has(state.currentZoneId);
  if (
    inPvpZone &&
    state.pvpZoneSurvivalStartTime === undefined &&
    !state.isDead
  ) {
    state.pvpZoneSurvivalStartTime = Date.now();
  } else if (!inPvpZone && state.pvpZoneSurvivalStartTime !== undefined) {
    state.pvpZoneSurvivalStartTime = undefined;
  }

  // ── Check title unlocks every tick ──
  checkTitleUnlocks(state);

  // ── Auto-pickup gold ──
  if (!state.isDead && !state.isTransitioning && state.lootDrops.length > 0) {
    const px = player.tileX + player.pixelOffsetX / 32;
    const py = player.tileY + player.pixelOffsetY / 32;
    for (const drop of state.lootDrops) {
      if (drop.collected) continue;
      if (drop.item.itemType !== "coin") continue;
      const dist = Math.sqrt((px - drop.x) ** 2 + (py - drop.y) ** 2);
      if (dist < 1.5) {
        const amount = drop.item.amount;
        drop.collected = true;
        state.player.coins += amount;
        const coinEntry = state.player.inventory.find(
          (i) => i.itemType === "coin",
        );
        if (coinEntry) {
          coinEntry.amount += amount;
        } else {
          state.player.inventory.push({
            id: "coins",
            itemType: "coin",
            amount,
          });
        }
        try {
          playCollectLoot();
        } catch {
          /* non-fatal */
        }
        window.dispatchEvent(
          new CustomEvent("auto_gold_pickup", {
            detail: { x: drop.x, y: drop.y, amount },
          }),
        );
      }
    }
    if (state.lootDrops.some((ld) => ld.collected)) {
      state.lootDrops = state.lootDrops.filter((ld) => !ld.collected);
    }
  }

  return justLanded;
}

// ─── Edge-exit trigger matching ───────────────────────────────────────────────

function matchesTrigger(t: ZoneTransition, px: number, py: number): boolean {
  const trigger = t.triggerTile;
  if ("x" in trigger && "y" in trigger) {
    return trigger.x === px && trigger.y === py;
  }
  if ("x" in trigger && "yRange" in trigger) {
    const { x, yRange } = trigger as { x: number; yRange: [number, number] };
    return px === x && py >= yRange[0] && py <= yRange[1];
  }
  if ("xRange" in trigger && "y" in trigger) {
    const { xRange, y } = trigger as { xRange: [number, number]; y: number };
    return py === y && px >= xRange[0] && px <= xRange[1];
  }
  return false;
}

// ─── Zone transition check ────────────────────────────────────────────────────

export function checkZoneTransition(state: GameState): boolean {
  if (state.isTransitioning) return false;

  const { player, currentZoneId } = state;
  const px = player.tileX;
  const py = player.tileY;

  const now = Date.now();
  const lastTime = _lastTransitionTime.get(state) ?? 0;
  const lastFromZone = _lastTransitionFromZone.get(state);
  const withinCooldown = now - lastTime < TRANSITION_COOLDOWN_MS;

  const zoneTransitions = ZONE_TRANSITIONS.filter(
    (t) => t.fromZone === currentZoneId,
  );

  for (const transition of zoneTransitions) {
    if (!matchesTrigger(transition, px, py)) continue;

    const isBounceBack = withinCooldown && lastFromZone === transition.toZone;
    if (isBounceBack) continue;

    if (transition.transitionType !== "edge_exit") {
      playZoneTransition();
    }

    beginZoneTransition(
      state,
      transition.toZone,
      transition.spawnTile.x,
      transition.spawnTile.y,
    );

    return true;
  }

  return false;
}

// ─── Loot collection ──────────────────────────────────────────────────────────

export function collectLootDrop(
  state: GameState,
  lootId: string,
  playerX?: number,
  playerY?: number,
): void {
  const idx = state.lootDrops.findIndex((ld) => ld.id === lootId);
  if (idx === -1) return;

  const drop = state.lootDrops[idx];
  if (drop.collected) return;

  if (playerX !== undefined && playerY !== undefined) {
    const dist = Math.sqrt((playerX - drop.x) ** 2 + (playerY - drop.y) ** 2);
    if (dist > 4) return;
  }

  drop.collected = true;
  state.lootDrops.splice(idx, 1);

  playCollectLoot();

  const { item } = drop;
  if (item.itemType === "coin") {
    state.player.coins += item.amount;
    const coinEntry = state.player.inventory.find((i) => i.itemType === "coin");
    if (coinEntry) {
      coinEntry.amount += item.amount;
    } else {
      state.player.inventory.push({
        id: "coins",
        itemType: "coin",
        amount: item.amount,
      });
    }
  } else if (item.itemType === "health_potion") {
    state.potionCount = Math.min(POTION_MAX, state.potionCount + item.amount);
  } else if (item.itemType === "mana_potion") {
    state.manaPotionCount = Math.min(5, state.manaPotionCount + item.amount);
  } else {
    const existing = state.player.inventory.find(
      (i) => i.itemType === item.itemType,
    );
    if (existing) {
      existing.amount += item.amount;
    } else {
      state.player.inventory.push({
        id: item.id,
        itemType: item.itemType,
        amount: item.amount,
      });
    }
  }
}

// ─── Trigger player hurt ──────────────────────────────────────────────────────

export function triggerPlayerHurt(state: GameState, damage = 0): void {
  state.playerHurt = true;
  state.playerHurtTimer = PLAYER_HURT_FLASH_MS;
  if (damage > 0) {
    state.player.sessionDamageTaken += damage;
  }
}

// ─── Apply potion ─────────────────────────────────────────────────────────────

export function applyPotion(state: GameState): boolean {
  if (state.potionCount <= 0 || state.potionCooldownTimer > 0 || state.isDead)
    return false;
  const heal = Math.floor(state.player.maxHp * 0.4);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
  state.potionCount -= 1;
  state.potionCooldownTimer = 10000;
  return true;
}

// ─── Apply mana potion ────────────────────────────────────────────────────────

export function applyManaPotion(state: GameState): boolean {
  if (
    state.manaPotionCount <= 0 ||
    state.manaPotionCooldownTimer > 0 ||
    state.isDead
  )
    return false;
  const restore = Math.floor(state.player.maxMp * 0.4);
  state.player.mp = Math.min(state.player.maxMp, state.player.mp + restore);
  state.manaPotionCount -= 1;
  state.manaPotionCooldownTimer = 10000;
  return true;
}

const ACHIEVEMENT_TITLES: Record<string, string> = {
  first_blood: "First Blood",
  rising_hero: "Rising Hero",
  champion: "Champion",
  pilgrim: "Pilgrim",
  monster_hunter: "Monster Hunter",
  spelunker: "Spelunker",
  survivor: "Survivor",
};

export function unlockAchievement(state: GameState, id: string): void {
  if (state.achievements.has(id)) return;
  state.achievements.add(id);
  const title = ACHIEVEMENT_TITLES[id] ?? id;
  state.achievementPopup = {
    id,
    title,
    expiresAt: Date.now() + 3000,
  };
}

// ─── Titles System ────────────────────────────────────────────────────────────

const SURVIVOR_DURATION_MS = 10 * 60 * 1000;

export function checkTitleUnlocks(state: GameState): void {
  const { player } = state;
  if (player.isGuest) return;

  const { titleTracking } = state;
  const earned = new Set(state.earnedTitles);

  function maybeUnlock(id: TitleId, displayLabel: string) {
    if (earned.has(id)) return;
    state.earnedTitles = [...state.earnedTitles, id];
    earned.add(id);
    state.achievementPopup = {
      id: `title_${id}`,
      title: `Title Unlocked: ${displayLabel}`,
      expiresAt: Date.now() + 4000,
    };
  }

  if (titleTracking.totalMonstersKilled >= 100)
    maybeUnlock("monster_hunter", "Monster Hunter");

  if (titleTracking.treasureChestsCollected >= 10)
    maybeUnlock("treasure_seeker", "Treasure Seeker");

  if (player.level >= 20) maybeUnlock("veteran", "Veteran");
  if (player.level >= 40) maybeUnlock("champion", "Champion");

  if (titleTracking.piratesKilled >= 50)
    maybeUnlock("pirate_slayer", "Pirate Slayer");

  if (state.consecutivePvpKillsWithoutDeath >= 3) maybeUnlock("ghost", "Ghost");

  if (
    state.pvpZoneSurvivalStartTime !== undefined &&
    Date.now() - state.pvpZoneSurvivalStartTime >= SURVIVOR_DURATION_MS
  ) {
    maybeUnlock("survivor", "Survivor");
  }
}

export function setActiveTitleId(
  state: GameState,
  titleId: TitleId,
): GameState {
  if (state.player.isGuest) return state;
  if (!state.earnedTitles.includes(titleId)) return state;
  state.activeTitleId = titleId;
  state.player.activeTitleId = titleId;
  return state;
}

export function onEnterPvpZone(state: GameState): void {
  if (state.pvpZoneSurvivalStartTime === undefined) {
    state.pvpZoneSurvivalStartTime = Date.now();
  }
}

export function onLeavePvpZone(state: GameState): void {
  state.pvpZoneSurvivalStartTime = undefined;
}

// ─── Safety: detect and recover stuck player ─────────────────────────────────

export function checkPlayerStuck(state: GameState): void {
  if (state.isTransitioning || state.isDead) return;
  const { player, world } = state;
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];
  const walkableNeighbours = dirs.filter((d) =>
    isWalkable(world, player.tileX + d.dx, player.tileY + d.dy),
  ).length;
  const onWalkable = isWalkable(world, player.tileX, player.tileY);
  if (!onWalkable || walkableNeighbours === 0) {
    console.warn(
      `[Safety] Player stuck at (${player.tileX},${player.tileY}) in zone "${state.currentZoneId}". Teleporting to ${RESPAWN_ZONE_ID}.`,
    );
    beginZoneTransition(state, RESPAWN_ZONE_ID, TOWN_SPAWN.x, TOWN_SPAWN.y);
  }
}

// ─── Tap-to-Move: set target from canvas tap ─────────────────────────────────

/**
 * Called when the player taps a tile on the map canvas.
 * Sets up the pathfinding target. Clear previous path immediately.
 */
export function setTapToMoveTarget(
  state: GameState,
  tileX: number,
  tileY: number,
): void {
  if (state.isDead || state.isTransitioning) return;
  // Cancel any existing path
  state.player.tapMovePath = null;
  state.player.tapMoveTarget = { x: tileX, y: tileY };
  state.input.tapMoveTarget = { x: tileX, y: tileY };
  // Show visual indicator
  state.tapMoveIndicator = { x: tileX, y: tileY, opacity: 1.5 };
}

// ─── Notification helpers ─────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 10;

/**
 * Add a toast notification to the state queue.
 * Guest accounts only receive world_event notifications.
 */
export function addNotification(
  state: GameState,
  type: NotificationType,
  message: string,
): void {
  if (state.player.isGuest && type !== "world_event") return;
  const notification: GameNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    message,
    createdAt: Date.now(),
  };
  state.notifications = [notification, ...state.notifications].slice(
    0,
    MAX_NOTIFICATIONS,
  );
}

/** Dismiss a notification by id */
export function dismissNotification(state: GameState, id: string): void {
  state.notifications = state.notifications.filter((n) => n.id !== id);
}

// ─── Combat log helpers ───────────────────────────────────────────────────────

const MAX_COMBAT_LOG = 20;

/** Append a combat log entry. FIFO — oldest entries are dropped. */
export function addCombatLogEntry(state: GameState, entry: string): void {
  state.combatLog = [entry, ...state.combatLog].slice(0, MAX_COMBAT_LOG);
}

// ─── Quick slot helpers ───────────────────────────────────────────────────────

/** Assign an item type to a quick slot (0-3) */
export function setQuickSlot(
  state: GameState,
  slotIndex: number,
  item: QuickSlots[number],
): void {
  if (slotIndex < 0 || slotIndex > 3) return;
  const slots = [...state.quickSlots] as QuickSlots;
  slots[slotIndex] = item;
  state.quickSlots = slots;
}

// ─── Interactable interaction ─────────────────────────────────────────────────

const URN_LORE_TEXTS = [
  "An ancient inscription reads: The fallen warriors rest here.",
  "You find remnants of a forgotten spell.",
  "The urn crumbles to dust.",
  "A cold wind passes through you.",
];

/**
 * Try to interact with an interactable object adjacent to the player.
 * Returns a message string if something happened, null otherwise.
 */
export function tryInteractNearby(state: GameState): string | null {
  if (state.isDead || state.isTransitioning || state.player.isGuest)
    return null;
  const px = state.player.tileX;
  const py = state.player.tileY;

  for (const obj of state.interactableObjects) {
    if (obj.state !== "intact") continue;
    const dist = Math.abs(obj.x - px) + Math.abs(obj.y - py);
    if (dist > 1.5) continue;

    if (obj.type === "barrel") {
      obj.state = "smashed";
      obj.respawnTimer = Date.now() + 60000;
      const drops = Math.random() < 0.1;
      if (drops) {
        const goldOrPotion = Math.random() < 0.7;
        if (goldOrPotion) {
          const amount = 1 + Math.floor(Math.random() * 5);
          state.player.coins += amount;
          return `+${amount} gold!`;
        }
        state.potionCount = Math.min(POTION_MAX, state.potionCount + 1);
        return "Found a Health Potion!";
      }
      return "The barrel splinters!";
    }

    if (obj.type === "mushroom") {
      obj.state = "collected";
      obj.respawnTimer = Date.now() + 120000;
      const existing = state.player.inventory.find(
        (i) => i.itemType === "glowing_mushroom",
      );
      if (existing) {
        existing.amount += 1;
      } else {
        state.player.inventory.push({
          id: `mushroom_${Date.now()}`,
          itemType: "glowing_mushroom",
          amount: 1,
        });
      }
      return "Collected Glowing Mushroom!";
    }

    if (obj.type === "urn") {
      obj.state = "examined";
      const roll = Math.random();
      if (roll < 0.3) {
        const gold = 1 + Math.floor(Math.random() * 10);
        state.player.coins += gold;
        return `Found ${gold} gold coins!`;
      }
      if (roll < 0.6) {
        const lore =
          URN_LORE_TEXTS[Math.floor(Math.random() * URN_LORE_TEXTS.length)]!;
        state.lorePopup = { text: lore, expiresAt: Date.now() + 4000 };
        return lore;
      }
      return "The urn is empty.";
    }
  }
  return null;
}

// ─── Hidden room entry/exit ───────────────────────────────────────────────────

/**
 * Check if the player has just stepped on a hidden room entry tile.
 * Returns the room key if triggered, null otherwise.
 */
export function checkHiddenRoomEntry(state: GameState): string | null {
  if (state.isDead || state.isTransitioning || state.inHiddenRoom) return null;
  const entry = HIDDEN_ROOM_ENTRIES[state.currentZoneId];
  if (!entry) return null;
  const px = state.player.tileX;
  const py = state.player.tileY;
  if (px === entry.entryX && py === entry.entryY) {
    const key = `${state.currentZoneId}_${entry.entryX}_${entry.entryY}`;
    // Initialize room state if first time
    if (!state.hiddenRooms[key]) {
      state.hiddenRooms[key] = {
        entryX: entry.entryX,
        entryY: entry.entryY,
        roomSpawnX: entry.roomSpawnX,
        roomSpawnY: entry.roomSpawnY,
        chestCollected: false,
      };
    }
    return key;
  }
  return null;
}

/**
 * Enter a hidden room: teleport player to room spawn, spawn loot if first time.
 */
export function enterHiddenRoom(state: GameState, roomKey: string): void {
  const room = state.hiddenRooms[roomKey];
  if (!room) return;
  state.inHiddenRoom = true;
  state.currentHiddenRoomKey = roomKey;
  // Teleport player to room spawn (uses offset coordinates within hidden 4x4 overlay)
  state.player.tileX = room.roomSpawnX;
  state.player.tileY = room.roomSpawnY;
  state.player.targetTileX = room.roomSpawnX;
  state.player.targetTileY = room.roomSpawnY;
  state.player.pixelOffsetX = 0;
  state.player.pixelOffsetY = 0;
  state.player.isMoving = false;
  state.player.animProgress = 1;
  // Spawn uncommon chest and gold if not already collected
  if (!room.chestCollected) {
    const goldAmount = 10 + Math.floor(Math.random() * 21);
    state.player.coins += goldAmount;
    state.lootDrops.push({
      id: `hidden_chest_${roomKey}_${Date.now()}`,
      x: room.roomSpawnX + 1,
      y: room.roomSpawnY,
      zone: state.currentZoneId,
      item: {
        id: `hidden_item_${Date.now()}`,
        itemType: "ancient_rune_shard",
        amount: 1,
      },
      spawnTime: Date.now(),
    });
  }
}

/**
 * Exit hidden room: teleport player back to entry point.
 */
export function exitHiddenRoom(state: GameState): void {
  const roomKey = state.currentHiddenRoomKey;
  if (!roomKey) return;
  const room = state.hiddenRooms[roomKey];
  if (!room) return;
  // Mark chest collected
  room.chestCollected = true;
  state.inHiddenRoom = false;
  state.currentHiddenRoomKey = null;
  state.player.tileX = room.entryX + 1; // spawn 1 tile right of hidden wall
  state.player.tileY = room.entryY;
  state.player.targetTileX = room.entryX + 1;
  state.player.targetTileY = room.entryY;
  state.player.pixelOffsetX = 0;
  state.player.pixelOffsetY = 0;
  state.player.isMoving = false;
  state.player.animProgress = 1;
}

// ─── Checkpoint system ───────────────────────────────────────────────────────────

/** Checkpoint stone positions per EXP zone (tile coordinates). */
export const CHECKPOINT_STONE_POSITIONS: Partial<
  Record<ZoneId, { x: number; y: number }>
> = {
  forest_depths: { x: 16, y: 8 },
  wolf_forest: { x: 12, y: 10 },
  tiger_jungle: { x: 14, y: 9 },
  bear_forest: { x: 11, y: 12 },
  ancient_ruins: { x: 15, y: 10 },
  crystal_ruins: { x: 13, y: 8 },
  dark_forest: { x: 16, y: 12 },
  cursed_swamp: { x: 14, y: 10 },
  floating_ruins: { x: 12, y: 7 },
  pirate_island: { x: 16, y: 14 },
  cursed_galleon: { x: 10, y: 8 },
  thunder_isle: { x: 15, y: 12 },
  bat_cave: { x: 12, y: 9 },
  cave_interior: { x: 14, y: 10 },
  boss_chamber: { x: 16, y: 14 },
};

/**
 * Set the checkpoint at the given zone and position.
 * Adds a "Checkpoint set!" notification.
 */
export function setCheckpoint(
  state: GameState,
  zoneId: ZoneId,
  x: number,
  y: number,
): void {
  if (state.player.isGuest) return;
  state.checkpoint = { zoneId, x, y };
  state.checkpointActive = true;
  addNotification(state, "system", "⚡ Checkpoint set!");
  // Dispatch event for canvas to render confirmation float
  window.dispatchEvent(
    new CustomEvent("checkpoint_set", {
      detail: { x: state.player.tileX, y: state.player.tileY },
    }),
  );
}

/**
 * Clear the checkpoint (call on logout).
 */
export function clearCheckpoint(state: GameState): void {
  state.checkpoint = null;
  state.checkpointActive = false;
}

/**
 * Respawn at the checkpoint if one is set.
 * Sets 10s respawn immunity.
 */
export function respawnAtCheckpoint(state: GameState): void {
  if (!state.checkpointActive || !state.checkpoint) return;
  const { zoneId, x, y } = state.checkpoint;
  state.isDead = false;
  state.respawnTimer = 0;
  state.player.hp = state.player.maxHp;
  state.player.mp = state.player.maxMp;
  state.respawnImmunityActive = true;
  state.respawnImmunityTimer = 10000;

  if (state.currentZoneId !== zoneId) {
    beginZoneTransition(state, zoneId, x, y);
  } else {
    state.player.tileX = x;
    state.player.tileY = y;
    state.player.targetTileX = x;
    state.player.targetTileY = y;
    state.player.pixelOffsetX = 0;
    state.player.pixelOffsetY = 0;
    state.player.isMoving = false;
    state.player.animProgress = 1;
  }
}
