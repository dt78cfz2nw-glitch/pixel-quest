// ─── Tile Types ───────────────────────────────────────────────────────────────

export const TileType = {
  GRASS: 0,
  STONE: 1,
  WALL: 2,
  TOWN_FLOOR: 3,
  TOWN_WALL: 4,
  TOWN_PATH: 5,
  BUILDING: 6,
  WATER: 7,
  TREE: 8,
  FLOWER: 9,
  DEEP_FOREST: 10,
  PATH: 11,
  PORTAL: 12,
  DOOR: 13,
  RIVER: 14,
  INTERIOR_FLOOR: 15,
  INTERIOR_WALL: 16,
  CRYSTAL: 17,
  // ── New tile types ──
  STAIR: 18, // underground entrance (going down)
  STAIR_UP: 19, // underground exit (going up to surface)
  LANTERN: 20, // decorative light — walkable (player steps past it)
  BENCH: 21, // decorative seating — walkable (player steps past it)
  POND: 22, // small water area, non-walkable
  FENCE: 23, // low fence — walkable (player steps over/past it)
  DUNGEON_FLOOR: 24, // dark stone underground floor
  DUNGEON_WALL: 25, // dark stone wall for underground areas
  CAVE_FLOOR: 26, // bat cave floor — dark reddish-brown
  CAVE_WALL: 27, // bat cave wall — jagged rock
  // ── Zone border/transition marker ──
  TRANSITION_MARKER: 28, // glowing ground tile at zone borders — walkable
  // ── Island / Water border tiles ──
  BEACH: 29, // sandy/rocky shoreline between land and water — walkable
  DEEP_WATER: 30, // animated ocean water — NOT walkable
  FOAM: 31, // white foam edge where land meets water — NOT walkable
  SWAMP_WATER: 32, // murky green-brown animated water (Cursed Swamp) — NOT walkable
  // ── Floating Ruins tiles ──
  STONE_PLATFORM: 33, // floating platform stone tile
  RUNE_FLOOR: 34, // ancient glowing rune tile
  VOID_DROP: 35, // dramatic drop edge at platform sides — NOT walkable
  // ── Pirate Island / Bridge ──
  BRIDGE: 36, // wooden plank bridge tile — walkable
  SAND: 37, // sandy ground (tropical island interior) — walkable
  PALM_TREE: 38, // palm tree decoration — NOT walkable
  // ── Cursed Galleon (ship interior) ──
  WOOD_PLANK: 39, // ship floor — walkable (brown planks with grain lines)
  SHIP_RAIL: 40, // ship edge railing — NOT walkable (visual only)
  SHIP_WATER: 41, // animated ocean water around ship — NOT walkable
  CAPTAIN_FLOOR: 42, // captain's quarters floor — walkable (warm wood tone)
} as const;

export type TileTypeValue = (typeof TileType)[keyof typeof TileType];

// ─── Zone System ──────────────────────────────────────────────────────────────

export type ZoneId =
  // ── Safe / Hub ──
  | "meadow_hub"
  | "aurelion"
  // ── Surface Exploration ──
  | "wilderness"
  | "forest_depths"
  | "wolf_forest"
  | "tiger_jungle"
  | "bear_forest"
  | "ancient_ruins"
  | "crystal_ruins"
  // ── Dangerous Surface ──
  | "cyclops_lair"
  | "goblin_warrens"
  // ── Underground / Caves ──
  | "bat_cave"
  | "deep_cave"
  | "hub_basement"
  | "wilderness_dungeon"
  | "forest_dungeon"
  // ── New zones ──
  | "dark_forest"
  | "ancient_ruins_deep"
  | "cave_interior"
  | "boss_chamber"
  // ── New EXP zones ──
  | "cursed_swamp"
  | "floating_ruins"
  // ── Pirate Island ──
  | "pirate_island"
  // ── Cursed Galleon (ship EXP map) ──
  | "cursed_galleon"
  // ── Thunder Isle (high-level electric storm zone) ──
  | "thunder_isle";

export type ZoneTransitionType =
  | "portal"
  | "stair_down"
  | "stair_up"
  | "edge_exit";

export interface ZoneTransition {
  fromZone: ZoneId;
  toZone: ZoneId;
  /**
   * Tile in fromZone that triggers the transition.
   * - Point trigger: { x, y } — for portals and stairs
   * - Left/right edge: { x, yRange: [y0, y1] }
   * - Top/bottom edge: { xRange: [x0, x1], y }
   */
  triggerTile:
    | { x: number; y: number }
    | { x: number; yRange: [number, number] }
    | { xRange: [number, number]; y: number };
  /** Tile in toZone where the player spawns */
  spawnTile: { x: number; y: number };
  label: string;
  transitionType: ZoneTransitionType;
}

// ─── Zone Fade Colors ─────────────────────────────────────────────────────────

/** Zone-specific overlay color for transitions. */
export const ZONE_FADE_COLORS: Record<ZoneId, string> = {
  // ── Safe / Hub ──
  meadow_hub: "#3a6e2a",
  aurelion: "#1a1a4e",
  // ── Surface Exploration ──
  wilderness: "#336622",
  forest_depths: "#1a3322",
  wolf_forest: "#1c3a10",
  tiger_jungle: "#2a5418",
  bear_forest: "#1a3310",
  ancient_ruins: "#6b5a32",
  crystal_ruins: "#440066",
  // ── Dangerous Surface ──
  cyclops_lair: "#6b1a00",
  goblin_warrens: "#2a3010",
  // ── Underground / Caves ──
  bat_cave: "#1a0a00",
  deep_cave: "#111114",
  hub_basement: "#2a1800",
  wilderness_dungeon: "#2a1800",
  forest_dungeon: "#2a1800",
  // ── New zones ──
  dark_forest: "#070e04",
  ancient_ruins_deep: "#0e0e12",
  cave_interior: "#0a0806",
  boss_chamber: "#1a0000",
  // ── New EXP zones ──
  cursed_swamp: "#0a1205",
  floating_ruins: "#0d0d2a",
  // ── Pirate Island ──
  pirate_island: "#1a3318",
  // ── Cursed Galleon ──
  cursed_galleon: "#1a0e06",
  // ── Thunder Isle ──
  thunder_isle: "#080818",
};

export interface ZoneConfig {
  id: ZoneId;
  name: string;
  tiles: TileTypeValue[][];
  width: number;
  height: number;
  transitions: ZoneTransition[];
  spawnPoint: { x: number; y: number };
  isSafeZone: boolean;
  creatureDensity: "none" | "low" | "medium" | "high";
}

// ─── NPC ──────────────────────────────────────────────────────────────────────

export interface NpcDefinition {
  id: string;
  name: string;
  tileX: number;
  tileY: number;
  dialogue: string[];
  spriteType: "guide" | "shopkeeper" | "villager" | "guard";
}

export interface NpcDialogue {
  npcId: string;
  lines: string[];
  currentLine: number;
}

// ─── World Config ─────────────────────────────────────────────────────────────

export interface WorldConfig {
  zones: Record<ZoneId, ZoneConfig>;
  npcsByZone: Record<ZoneId, NpcDefinition[]>;
}

// ─── World ────────────────────────────────────────────────────────────────────

export interface WorldMap {
  width: number;
  height: number;
  tiles: TileTypeValue[][];
  zoneId: ZoneId;
}

// ─── Character Class ──────────────────────────────────────────────────────────

export type CharacterClass = "warrior" | "mage";

// ─── Gender ───────────────────────────────────────────────────────────────────

export type Gender = "male" | "female";

// ─── Weapon Types ─────────────────────────────────────────────────────────────

/** Warrior weapon choice — affects sprite and attack animation */
export type WeaponType = "sword" | "axe";

/** Mage staff choice — affects cast animation */
export type StaffType = "long_staff" | "short_wand";

// ─── Direction / Facing ───────────────────────────────────────────────────────

export type Direction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";
export type FacingDirection = "left" | "right" | "up" | "down";

// ─── Emote ────────────────────────────────────────────────────────────────────

export type EmoteType =
  | "wave"
  | "thumbsUp"
  | "heart"
  | "confused"
  | "laugh"
  | "cheer"
  | "no"
  | "yes";

export const EMOTE_ICONS: Record<EmoteType, string> = {
  wave: "👋",
  thumbsUp: "👍",
  heart: "❤️",
  confused: "❓",
  laugh: "😂",
  cheer: "🎉",
  no: "❌",
  yes: "✅",
};

/** How long (ms) an emote stays visible above the character */
export const EMOTE_DURATION_MS = 4000;

// ─── Attack ───────────────────────────────────────────────────────────────────

/** Duration of the attack animation in ms */
export const ATTACK_DURATION_MS = 280;

/** Duration of mage AoE spell visuals (frost nova, flame ring) in ms */
export const MAGE_SPELL_VISUAL_DURATION_MS = 600;

/** Duration of shadow lance visual in ms (slightly longer than arcane) */
export const SHADOW_LANCE_VISUAL_DURATION_MS = 400;

/** Warrior sword-swing arc half-angle in radians (~40°) */
export const WARRIOR_SWING_ANGLE = (40 * Math.PI) / 180;

/** How many tiles the mage projectile travels */
export const MAGE_PROJECTILE_TILES = 3.5;

// ─── Chat ─────────────────────────────────────────────────────────────────────

/** Max chars per chat message (backend enforces 50, UI cap at 50) */
export const CHAT_MAX_LENGTH = 50;

/** How long a chat bubble stays fully visible (ms) */
export const CHAT_BUBBLE_DURATION_MS = 8000;

/** How long the fade-out takes after CHAT_BUBBLE_DURATION_MS (ms) */
export const CHAT_BUBBLE_FADE_MS = 3000;

/**
 * A single chat message fetched from the backend for a player.
 * Used by GameCanvas to render floating chat bubbles.
 */
export interface ChatMessage {
  /** The player's username (matches OtherPlayer.username or local player) */
  username: string;
  text: string;
  /** Unix timestamp in milliseconds when the message was sent */
  timestamp: number;
}

// ─── Customization ────────────────────────────────────────────────────────────

export type OutfitColor = "default" | "red" | "blue" | "green" | "purple";

/**
 * Canonical style values: warrior_A/B/C, mage_A/B/C.
 * Legacy values kept for backward compat (normalized to *_A on load).
 */
export type OutfitStyle =
  | "warrior_A"
  | "warrior_B"
  | "warrior_C"
  | "mage_A"
  | "mage_B"
  | "mage_C"
  // legacy
  | "default"
  | "heavy"
  | "light"
  | "mystic"
  | "scholar";

export type HairColor =
  | "brown"
  | "black"
  | "blonde"
  | "grey"
  | "red-hair"
  | "white";

export interface CustomizationState {
  outfitColor: OutfitColor;
  outfitStyle: OutfitStyle;
  hairColor: HairColor;
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export type CombatEventType =
  | "player-hit"
  | "monster-hit"
  | "monster-died"
  | "player-died";

export interface CombatEvent {
  type: CombatEventType;
  monsterId?: string;
  damage: number;
  timestamp: number;
  /** True when this hit was a critical hit */
  isCrit?: boolean;
  /** "CRIT!" label text shown below damage number */
  critText?: string;
}

// ─── Monster ──────────────────────────────────────────────────────────────────

export type MonsterType =
  | "slime"
  | "goblin"
  | "forest_troll"
  | "sprite_wisp"
  | "crystal_golem"
  | "spider"
  | "bat"
  | "bear"
  | "wolf"
  | "tiger"
  | "skeleton"
  | "cyclops"
  | "shadow_wolf"
  | "stone_golem"
  | "cave_bat"
  | "cave_troll"
  | "stone_warden"
  // ── Cursed Swamp monsters ──
  | "bog_witch"
  | "swamp_lurker"
  | "mud_golem"
  // ── Floating Ruins monsters ──
  | "ruin_specter"
  | "ancient_guardian"
  | "sky_serpent"
  // ── Pirate Island monsters ──
  | "pirate_grunt"
  | "pirate_gunner"
  | "pirate_captain"
  | "pirate_cannon"
  // ── Cursed Galleon monsters ──
  | "cursed_sailor"
  | "skeleton_gunner"
  | "cursed_navigator"
  | "ship_captain"
  // ── Thunder Isle monsters ──
  | "storm_sprite"
  | "thunder_golem"
  | "lightning_drake"
  // ── New monsters ──
  | "forest_spirit" // Forest: invisible when still, surprise attack
  | "dark_wisp" // Dark Forest: teleports, fires dark pulse
  | "ruins_archer" // Ancient Ruins: kiting skeletal archer, poison arrows
  | "kraken_tentacle"; // Ocean areas: stationary, grabs and slams

export type MonsterAIState =
  | "idle"
  | "wandering"
  | "patrolling"
  | "returning"
  | "chasing"
  | "attacking"
  | "dead";

export interface MonsterEntity {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: MonsterAIState;
  facingDirection: FacingDirection;
  animFrame: number;
  animTimer: number;
  lastAttackTime: number;
  type: MonsterType;
  // ── Rare variant ──
  isRare: boolean; // 1% chance golden variant
  rareTint: boolean; // golden color override active
  // ── Swamp Lurker ──
  ambushHidden: boolean; // stays invisible until player within 1 tile
  // ── Poison (Bog Witch effect) ──
  poisonTicksRemaining: number;
  poisonDamagePerTick: number;
  // ── Aggro indicator ──
  aggroIndicatorTimer: number; // ms remaining to show "!" above monster (500ms)
  // ── Knockback (applied on hit, spring-returns over 200ms) ──
  knockbackOffsetX: number; // current pixel offset in tile-space X
  knockbackOffsetY: number; // current pixel offset in tile-space Y
  knockbackVelX: number; // velocity tiles/ms
  knockbackVelY: number; // velocity tiles/ms
  knockbackTimer: number; // ms remaining in knockback return
  // ── World Events ──
  isInvasionMonster?: boolean; // tagged during Monster Invasion (shows red glow)
  isElite?: boolean; // Bounty Target: 3x size, 5x HP, gold crown
  eliteScale?: number; // draw scale override (default 3 for elite)
  // ── Special Ability State ──
  /** General timer tracking when the next special ability triggers (ms remaining) */
  abilityTimer: number;
  /** Current state of the special ability */
  abilityState: "ready" | "active" | "cooldown";
  /** Parry: true when Pirate Captain is in parry block window */
  parryActive?: boolean;
  /** Stun applied: track remaining stun ms to apply to player via combat event */
  stunDurationMs?: number;
  /** Timestamp (Date.now()) when this monster died — used for respawn timer */
  deathTime?: number;
}

// ─── Item / Inventory ─────────────────────────────────────────────────────────

export type ItemType =
  | "coin"
  | "storm_crystal"
  | "thunder_shard"
  | "sword_basic"
  | "staff_basic"
  | "leather_armor"
  | "cloth_robe"
  | "iron_shield"
  | "leather_scrap"
  | "bear_pelt"
  | "stone_fragment"
  | "rare_gem"
  | "troll_hide"
  | "rare_weapon"
  // ── Potions ──
  | "health_potion" // auto-equips to potion slot on pickup
  | "mana_potion" // auto-equips to mana potion slot on pickup
  // ── New map drops ──
  | "poison_vial" // Cursed Swamp: poisons next attack
  | "ancient_rune_shard" // Floating Ruins: collectible (future crafting)
  // ── Interactable drops ──
  | "glowing_mushroom" // Dark Forest mushroom — crafting material (uncommon)
  // ── Crafted items ──
  | "large_health_potion" // crafted: 3x health_potion + 10g → restores 80% HP
  | "mana_crystal" // crafted: 5x ancient_rune_shard + 20g → +15% max mana (equippable)
  | "warrior_emblem" // crafted: iron_sword + chainmail + 30g → +10% ATK (warrior only)
  | "mage_focus" // crafted: enchanted_staff + 5x ancient_rune_shard + 30g → +10% spell dmg (mage only)
  // ── Iron Legion Set (Warrior) ──
  | "iron_legion_helmet" // head slot: +15 HP, +3 DEF
  | "iron_legion_chestplate" // chest slot: +25 HP, +5 DEF
  | "iron_legion_gauntlets" // accessory: +10 HP, +2% crit
  // ── Arcane Scholar Set (Mage) ──
  | "scholars_hat" // head slot: +10 MP, +2 spell power
  | "scholars_robe" // chest slot: +15 MP, +4 spell power
  | "scholars_focus" // accessory: +5 MP, -1 MP spell cost
  // ── Thunder Isle drops ──
  | "storm_crystal" // rare crafting material — blue glowing gem
  | "thunder_shard" // equippable accessory: +8% attack speed
  // ── New zone drops ──
  | "worn_sword" // Meadow Hub common drop: ATK +3
  | "rough_shield_fragment" // Meadow Hub common drop: DEF +2
  | "forest_herb" // Meadow Hub common ingredient
  | "wolf_claw_necklace" // Forest uncommon: ATK +6, CRIT +3%
  | "druids_bracelet" // Forest uncommon: MP regen +0.3/s
  | "spirit_leaf" // Forest crafting material
  | "pirates_cutlass" // Pirate Island rare: ATK +14, lifesteal 2HP
  | "navigators_compass" // Pirate Island rare: XP gain +10%
  | "captains_hat" // Pirate Island epic: All stats +8%
  | "crystal_shard_staff" // Cave rare: Magic ATK +12
  | "echo_stone" // Cave rare: spell range +1 tile
  | "troll_bone_club" // Cave epic warrior-only: ATK +18
  | "scorpion_sting_dagger" // Egypt rare: poison on hit 25%
  | "pharaohs_signet_ring" // Egypt epic: ATK +15, HP +20
  | "golden_scarab" // Egypt legendary boss drop: ATK +20, spell -20% MP
  | "iron_ore" // Ruins/Cave resource node material
  | "magic_crystal" // Cave resource node material
  | "desert_bloom" // Egypt oasis resource (Desert Flower)
  | "antidote" // Crafted: cures poison + 5s immunity
  | "chainmail_shard" // crafting ingredient for Warrior Emblem
  | "poison_blade" // Crafted: ATK +12, 20% poison chance
  | "storm_gauntlets" // Crafted (Warrior): ATK +15, lightning damage
  | "arcane_tome"; // Crafted (Mage): MP regen +0.5/s, spell range +1

export const ITEM_LABELS: Record<ItemType, string> = {
  coin: "Gold Coin",
  sword_basic: "Iron Sword",
  staff_basic: "Wooden Staff",
  leather_armor: "Leather Armor",
  cloth_robe: "Cloth Robe",
  iron_shield: "Iron Shield",
  leather_scrap: "Leather Scrap",
  bear_pelt: "Bear Pelt",
  stone_fragment: "Stone Fragment",
  rare_gem: "Rare Gem",
  troll_hide: "Troll Hide",
  rare_weapon: "Ancient Blade",
  health_potion: "+1 Potion",
  mana_potion: "+1 Mana Potion",
  poison_vial: "Poison Vial",
  ancient_rune_shard: "Ancient Rune Shard",
  glowing_mushroom: "Glowing Mushroom",
  large_health_potion: "Large Health Potion",
  mana_crystal: "Mana Crystal",
  warrior_emblem: "Warrior Emblem",
  mage_focus: "Mage Focus",
  iron_legion_helmet: "Iron Legion Helmet",
  iron_legion_chestplate: "Iron Legion Chestplate",
  iron_legion_gauntlets: "Iron Legion Gauntlets",
  scholars_hat: "Scholar's Hat",
  scholars_robe: "Scholar's Robe",
  scholars_focus: "Scholar's Focus",
  storm_crystal: "Storm Crystal",
  thunder_shard: "Thunder Shard",
  worn_sword: "Worn Sword",
  rough_shield_fragment: "Rough Shield Fragment",
  forest_herb: "Forest Herb",
  wolf_claw_necklace: "Wolf Claw Necklace",
  druids_bracelet: "Druid's Bracelet",
  spirit_leaf: "Spirit Leaf",
  pirates_cutlass: "Pirate's Cutlass",
  navigators_compass: "Navigator's Compass",
  captains_hat: "Captain's Hat",
  crystal_shard_staff: "Crystal Shard Staff",
  echo_stone: "Echo Stone",
  troll_bone_club: "Troll Bone Club",
  scorpion_sting_dagger: "Scorpion Sting Dagger",
  pharaohs_signet_ring: "Pharaoh's Signet Ring",
  golden_scarab: "Golden Scarab",
  iron_ore: "Iron Ore",
  magic_crystal: "Magic Crystal",
  desert_bloom: "Desert Bloom",
  antidote: "Antidote",
  chainmail_shard: "Chainmail Shard",
  poison_blade: "Poison Blade",
  storm_gauntlets: "Storm Gauntlets",
  arcane_tome: "Arcane Tome",
};

export interface InventoryItem {
  id: string;
  itemType: ItemType;
  amount: number;
}

export interface LootDrop {
  id: string;
  x: number;
  y: number;
  zone: string;
  item: InventoryItem;
  spawnTime: number;
  /** Set to true immediately when collected to prevent double-pickup */
  collected?: boolean;
}

/** A loot pop animation in progress (scale up → fade out over ~320ms) */
export interface LootPopAnim {
  id: string;
  x: number;
  y: number;
  item: InventoryItem;
  /** Progress 0→1 over LOOT_POP_DURATION_MS */
  progress: number;
}

/** Duration of loot pop animation in ms */
export const LOOT_POP_DURATION_MS = 320;

export interface EquippedGear {
  weapon: ItemType | null;
  armor: ItemType | null;
  offhand: ItemType | null;
}

// ─── Character Save ───────────────────────────────────────────────────────────

export interface CharacterSave {
  characterId: number;
  username: string;
  characterClass: CharacterClass;
  level: number;
  coins: number;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

export interface AudioSettings {
  masterEnabled: boolean;
}

/** Ambient sound configuration per zone (background layer under music) */
export interface AmbientSoundConfig {
  zoneId: ZoneId;
  tracks: string[];
  volume: number;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface PlayerState {
  username: string;
  selectedClass: CharacterClass;
  /** Grid position (tile coordinates) */
  tileX: number;
  tileY: number;
  /** Pixel offset for smooth animation (0..TILE_SIZE) */
  pixelOffsetX: number;
  pixelOffsetY: number;
  /** Animation progress 0–1 */
  animProgress: number;
  /** Currently animating toward this tile */
  targetTileX: number;
  targetTileY: number;
  isMoving: boolean;
  /** Last confirmed movement direction (used for sprite orientation) */
  lastFacing: FacingDirection;
  /** Active emote being displayed */
  activeEmote?: EmoteType;
  /** Timestamp when the active emote should expire */
  emoteExpiry?: number;
  /** Whether an attack animation is currently playing */
  attackActive: boolean;
  /** Remaining attack animation time in ms, counts down from spell duration */
  attackTimer: number;
  /** Facing direction captured at attack trigger time */
  attackFacing: FacingDirection;
  /** Which mage spell visual is currently active (drives drawMageAttack) */
  activeSpellType: "arcane" | "frost" | "shadow" | "flame";
  /** Current chat message */
  chatMessage?: string;
  /** When the chat bubble expires */
  chatExpiry?: number;
  // ── RPG Stats ──
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  level: number;
  kills: number;
  outfitColor: OutfitColor;
  outfitStyle: OutfitStyle;
  hairColor: HairColor;
  // ── Gender & Weapon (optional for backward compat) ──
  /** Gender selection — defaults to 'male' if absent (backward compat) */
  gender?: Gender;
  /** Warrior weapon choice — defaults to 'sword' if absent */
  weaponType?: WeaponType;
  /** Mage staff choice — defaults to 'long_staff' if absent */
  staffType?: StaffType;
  // ── Economy / Inventory ──
  coins: number;
  inventory: InventoryItem[];
  equippedGear: EquippedGear;
  // ── Mana timing ──
  lastCastTime: number; // timestamp of last spell cast, for 1s regen pause
  // ── Combo (Warrior) ──
  comboCount: number; // consecutive hits on same enemy
  comboTarget: string | null; // id of monster being comboed
  comboTimer: number; // ms since last combo hit
  comboBonusActive: boolean; // x5 combo = +25% next hit
  // ── Death / Zone tracking ──
  deathRecap: {
    killerName: string;
    damageTaken: number;
    timeInZone: number;
  } | null;
  zoneEnterTime: number; // timestamp when player entered current zone
  sessionDamageTaken: number; // cumulative damage taken since entering current zone
  // ── Shadow ──
  playerShadow: boolean; // always true — shadow ellipse under sprite
  // ── Guest mode ──
  isGuest?: boolean; // true for unauthenticated guest players (no save, no combat)
  // ── Warrior Shield Skill ──
  shieldActive: boolean; // true while defend stance is active (3s)
  shieldDuration: number; // remaining ms of current defend stance
  shieldCooldown: number; // remaining ms of cooldown after defend
  // ── Player Stun ──
  /** When >0 the player is stunned and cannot move/attack */
  stunTimer: number;
  // ── Player Invincibility (dodge) ──
  /** When >0 the player is invincible (no damage) — set by dodge */
  isInvincible: boolean;
  // ── Titles System ──
  titleTracking: TitleTracking;
  activeTitleId: TitleId;
  earnedTitles: TitleId[];
  /** Consecutive PVP kills without dying this session */
  consecutivePvpKillsWithoutDeath: number;
  // ── Tap-to-Move ──
  /** Target tile for tap-to-move pathfinding (null when not active) */
  tapMoveTarget?: { x: number; y: number } | null;
  /** Computed path for tap-to-move (array of tiles to walk through) */
  tapMovePath?: { x: number; y: number }[] | null;
  // ── Dodge ──
  /** Remaining ms of dodge invincibility (0 = not dodging) */
  dodgeInvincibilityTimer: number;
  /** Remaining ms of dodge cooldown */
  dodgeCooldownTimer: number;
  /** Afterimage ghost positions for dodge trail rendering */
  dodgeGhosts?: Array<{ x: number; y: number; alpha: number }>;
  // ── New warrior/mage skill state ──
  /** True while Battle Cry active skill is boosting ATK (warrior) */
  battleCryActive?: boolean;
  /** Remaining cooldown ms for Battle Cry (0 = ready) */
  battleCryCooldown?: number;
  /** True after Second Wind passive has triggered this life */
  secondWindUsed?: boolean;
  /** True while Mana Shield passive is absorbing damage as MP (mage) */
  manaShieldActive?: boolean;
}

// ─── Achievement System ──────────────────────────────────────────────────────

export type AchievementId =
  // Exploration
  | "firstSteps"
  | "wanderer"
  | "spelunker"
  | "desertWalker"
  | "hiddenSeeker"
  // Combat
  | "firstBlood"
  | "monsterHunter"
  | "eliteSlayer"
  | "bossKiller"
  | "pharaohsDoom"
  // PVP
  | "survivor"
  | "predator"
  | "ghost"
  // Crafting
  | "craftsman"
  | "masterSmith"
  | "alchemist"
  // Social
  | "friendly"
  | "conversationalist"
  | "questGiversFavorite"
  // Misc
  | "wealthy"
  | "loreScholar"
  | "lucky"
  | "speedRunner";

export const ACHIEVEMENT_LABELS: Record<AchievementId, string> = {
  firstSteps: "First Steps",
  wanderer: "Wanderer",
  spelunker: "Spelunker",
  desertWalker: "Desert Walker",
  hiddenSeeker: "Hidden Seeker",
  firstBlood: "First Blood",
  monsterHunter: "Monster Hunter",
  eliteSlayer: "Elite Slayer",
  bossKiller: "Boss Killer",
  pharaohsDoom: "Pharaoh's Doom",
  survivor: "Survivor",
  predator: "Predator",
  ghost: "Ghost",
  craftsman: "Craftsman",
  masterSmith: "Master Smith",
  alchemist: "Alchemist",
  friendly: "Friendly",
  conversationalist: "Conversationalist",
  questGiversFavorite: "Quest Giver's Favorite",
  wealthy: "Wealthy",
  loreScholar: "Lore Scholar",
  lucky: "Lucky",
  speedRunner: "Speed Runner",
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  username: string;
  level: number;
  activityScore: number;
  lastActive: bigint;
}

// ─── Multiplayer ──────────────────────────────────────────────────────────────

export interface OtherPlayer {
  username: string;
  x: number;
  y: number;
  selectedClass: CharacterClass;
  currentEmote?: EmoteType;
  emoteTimestamp?: number;
  lastFacing?: FacingDirection;
  chatMessage?: string;
  chatTimestamp?: number;
  outfitColor?: OutfitColor;
  outfitStyle?: OutfitStyle;
  hairColor?: HairColor;
  /** Level synced from backend — used for PVP level gap check */
  level?: number;
  /** Current HP synced from backend — shown on targeted player */
  hp?: number;
  /** Max HP synced from backend */
  maxHp?: number;
  /** Canonical principal ID string — used for PVP damage routing */
  principalId?: string;
  /** True if this player is a guest */
  isGuest?: boolean;
  /** True when warrior defend skill is active — rendered as shield aura */
  shieldActive?: boolean;
  /**
   * Session ID of the login that created this entity.
   * Any entity whose sessionId does not match the current active session
   * is considered stale and must be discarded immediately — this is the
   * primary guard against the guest-following-player bug.
   */
  sessionId?: string;
  // ── Dead reckoning fields (runtime-only, not persisted) ──────────────────
  /** Last authoritative x from server (tile units) */
  serverX?: number;
  /** Last authoritative y from server (tile units) */
  serverY?: number;
  /** Estimated velocity x in tiles/ms from last two server updates */
  velX?: number;
  /** Estimated velocity y in tiles/ms from last two server updates */
  velY?: number;
  /** Timestamp (ms) of last server position update */
  lastServerUpdateTime?: number;
}

// ─── World Events ─────────────────────────────────────────────────────────────

export type WorldEventType =
  | "monster_invasion"
  | "treasure_spawn"
  | "bounty_target";

export interface WorldEvent {
  id: string;
  type: WorldEventType;
  zoneId: ZoneId;
  startedAt: number;
  durationMs: number;
  /** monster_invasion: XP multiplier (2x during invasion) */
  invasionXpMultiplier?: number;
  /** monster_invasion: IDs of monsters flagged as elite/invasion */
  eliteMonsterIds?: string[];
  /** treasure_spawn: IDs of active treasure chest loot drops */
  treasureChestIds?: string[];
}

// ─── Titles System ────────────────────────────────────────────────────────────

export type TitleId =
  | "novice"
  | "monster_hunter"
  | "treasure_seeker"
  | "survivor"
  | "veteran"
  | "champion"
  | "pirate_slayer"
  | "ghost"
  | "serpentSlayer"
  | "stormChaser"
  | "theUntouchable"
  | "treasurer"
  | "ancientScholar";

export const TITLE_LABELS: Record<TitleId, string> = {
  novice: "Novice",
  monster_hunter: "Monster Hunter",
  treasure_seeker: "Treasure Seeker",
  survivor: "Survivor",
  veteran: "Veteran",
  champion: "Champion",
  pirate_slayer: "Pirate Slayer",
  ghost: "Ghost",
  serpentSlayer: "Serpent Slayer",
  stormChaser: "Storm Chaser",
  theUntouchable: "The Untouchable",
  treasurer: "Treasurer",
  ancientScholar: "Ancient Scholar",
};

/** Persistent tracking counters used to determine title unlock eligibility. */
export interface TitleTracking {
  totalMonstersKilled: number;
  treasureChestsCollected: number;
  /** Consecutive PVP kills without dying — resets on death */
  pvpKillsWithoutDeath: number;
  piratesKilled: number;
}

// ─── PVP Gold Drop ────────────────────────────────────────────────────────────

export interface PvpGoldDrop {
  id: string;
  x: number;
  y: number;
  amount: number;
  spawnTime: number;
  /** 0–1 fade progress (filled from spawnTime → despawn) */
  fadeProgress: number;
}

// ─── Boss Entity ──────────────────────────────────────────────────────────────

export type BossPhase = "idle" | "active" | "dead";

export interface BossProjectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  spawnTime: number;
}

export interface BossEntity {
  id: string;
  zoneId: ZoneId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  phase: BossPhase;
  lastSlamTime: number;
  lastBoulderTime: number;
  enraged: boolean;
  respawnAt: number | null;
  /** Shockwave animation: set to timestamp when slam fires, -1 otherwise */
  shockwaveStartTime: number;
  /** Active boulder projectiles */
  projectiles: BossProjectile[];
  /** Warning circle: ms timestamp when warning started (-1 = none), target position */
  boulderWarningStartTime: number;
  boulderWarningTargetX: number;
  boulderWarningTargetY: number;
}

// ─── Quest System ─────────────────────────────────────────────────────────────

export type QuestObjectiveType = "kill_monsters" | "reach_level" | "visit_zone";

export interface QuestReward {
  gold: number;
  xp: number;
  potions: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  objectiveType: QuestObjectiveType;
  /** Zone ID for visit_zone, or monster count / level number */
  objectiveTarget: string;
  objectiveCount: number;
  currentCount: number;
  reward: QuestReward;
  giverNpcId: string;
  completed: boolean;
}

// ─── Shop System ──────────────────────────────────────────────────────────────

export type ShopItemType = "potion" | "weapon" | "armor" | "misc";

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  statBonus: { atk?: number; maxHp?: number; maxMp?: number };
  itemType: ShopItemType;
  classRestriction: "warrior" | "mage" | null;
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface InputState {
  // ── Tap / Hold movement system ──────────────────────────────────────────────
  /** Directions currently physically held (keys/dpad buttons pressed down) */
  heldDirections: Set<Direction>;
  /** A direction from a quick tap (press+release < 200ms); consumed after 1-tile move */
  pendingTap: Direction | null;
  /** True after the game loop moved 1 tile from pendingTap */
  tapProcessed: boolean;
  /** Press timestamps keyed by code ("ArrowUp", "dpad_up", etc.) for tap detection */
  tapStartTimes: Map<string, number>;
  /** Target tile set by a map tap; pathfinding moves toward this */
  tapMoveTarget: { x: number; y: number } | null;
  /** Pending 90° clockwise rotation command */
  rotationPending: boolean;
  /** True while input is blocked (zone transitions, loading) */
  isBlocked: boolean;
  /** Timestamp of the last movement step (ms) */
  lastMoveTime: number;

  // ── Combat ──────────────────────────────────────────────────────────────────
  /** Set to true when an attack is requested; consumed each tick */
  attackPending: boolean;
  /** Set to true when Frost Nova is requested */
  frostNovaPending: boolean;
  /** Set to true when Shadow Lance is requested */
  shadowLancePending: boolean;
  /** Set to true when Flame Ring is requested */
  flameRingPending: boolean;
  /** Set to true when Warrior Shield skill is requested */
  shieldPending: boolean;

  // ── Legacy compat (kept so older call-sites don't crash) ────────────────────
  /** @deprecated Use heldDirections + pendingTap instead */
  queue: Direction[];
  /** @deprecated Tracked internally; kept for backward compat */
  heldKeys: Set<string>;
  // ── Dodge ──
  /** Set when a dodge is triggered (direction to dodge in) */
  dodgePending: Direction | null;
  /** Last tap timestamps per direction for double-tap detection */
  lastDirectionTapTime: Map<Direction, number>;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  player: PlayerState;
  world: WorldMap;
  input: InputState;
  lastSavedTile: { x: number; y: number };
  otherPlayers: OtherPlayer[];
  /** Remaining screen shake time in ms */
  screenShakeTimer: number;
  /** Hit-stop freeze: when > 0, skip entity position updates for impactful feel */
  hitStopTimer: number;
  /** Canvas flash overlay remaining time in ms */
  attackFlashTimer: number;
  /** Active monsters in the world */
  monsters: MonsterEntity[];
  /** Recent combat events for visual feedback */
  recentCombatEvents: CombatEvent[];
  /** Whether the local player is currently dead */
  isDead: boolean;
  /** Countdown timer before respawn (ms) */
  respawnTimer: number;
  /** Character customization state */
  customization: CustomizationState;
  // ── Zone System ──
  /** Current zone the player is in */
  currentZoneId: ZoneId;
  /** True while a zone transition fade is in progress */
  isTransitioning: boolean;
  /** Fade alpha 0 (transparent) → 1 (black) for transition overlay */
  transitionAlpha: number;
  /** Zone-specific color for transition overlay (e.g. dark sepia for dungeons) */
  transitionFadeColor: string;
  /** NPC dialogue currently open, or null */
  activeNpcDialogue: { npcId: string; dialogueIndex: number } | null;
  // ── Loot ──
  /** Active loot drops on the ground */
  lootDrops: LootDrop[];
  /** Whether the player was hurt this frame (for red flash) */
  playerHurt: boolean;
  /** Timer for the hurt flash (ms) */
  playerHurtTimer: number;
  // ── UI ──
  inventoryOpen: boolean;
  // ── Potions ──
  potionCount: number;
  potionCooldownTimer: number;
  manaPotionCount: number;
  manaPotionCooldownTimer: number;
  // ── Achievements ──
  achievements: Set<string>;
  achievementPopup: { id: string; title: string; expiresAt: number } | null;
  // ── PVP ──
  pvpWarningShownZones: Set<ZoneId>;
  pvpImmunityTimer: number;
  // ── Day/Night Cycle ──
  dayNightTime: number; // ms 0..1200000 (20 min cycle)
  // ── Mage Spells ──
  frostNovaCooldown: number;
  shadowLanceCooldown: number;
  flameRingCooldown: number;
  // ── Quest System ──
  activeQuest: Quest | null;
  completedQuestIds: string[];
  questCompletePopup: {
    questId: string;
    title: string;
    reward: QuestReward;
    expiresAt: number;
  } | null;
  // ── Boss ──
  boss: BossEntity | null;
  /** Ship Captain boss entity (cursed_galleon zone) */
  shipCaptainBoss: BossEntity | null;
  // ── Shop ──
  shopOpen: boolean;
  shopNpcId: string | null;
  // ── No-Mana UI Feedback ──
  /** Which spell button should shake ('arcane'|'frost'|'shadow'|'attack'), null when idle */
  noManaShakeSpell: string | null;
  /** Timestamp when the no-mana shake expires (0 = not active) */
  noManaNotifyExpiry: number;
  /** True when mp === 0 — drives MP bar pulse animation */
  mpBarPulse: boolean;
  // ── PVP Targeting ──
  /** Username of the currently targeted other player (null = no target) */
  targetedPlayerUsername: string | null;
  /** Currently targeted monster ID for targeting circle (null = none) */
  targetedMonsterId: string | null;
  /** Kill notifications to show at top of screen */
  pvpKillNotification: {
    text: string;
    isKiller: boolean;
    expiresAt: number;
  } | null;
  /** Gold coins dropped on PVP death — any player can walk over to collect */
  pvpGoldDrops: PvpGoldDrop[];
  // ── Sprint System ──
  /** True when the player is actively sprinting (held movement ≥1s, mana > 0) */
  sprintActive: boolean;
  /** How long the player has been holding a movement key continuously (ms) */
  sprintHoldTimer: number;
  // ── World Events ──
  /** The currently active world event on the player's zone, or undefined */
  activeWorldEvent?: WorldEvent;
  // ── Titles System ──
  titleTracking: TitleTracking;
  activeTitleId: TitleId;
  earnedTitles: TitleId[];
  /** Timestamp when the player entered the current PVP zone (for Survivor title) */
  pvpZoneSurvivalStartTime?: number;
  /** Consecutive PVP kills without dying this session */
  consecutivePvpKillsWithoutDeath: number;
  // ── Tap-to-Move (GameState level) ──
  /** Visual target indicator position for tap-to-move (null when not active) */
  tapMoveIndicator?: { x: number; y: number; opacity: number } | null;
  // ── Poison Clouds (Bog Witch ability) ──
  poisonClouds: PoisonCloud[];
  // ── Interactable Objects ──
  interactableObjects: InteractableObject[];
  // ── Environmental Hazards ──
  hazards: HazardEntity[];
  // ── Hidden Rooms ──
  hiddenRooms: Record<string, HiddenRoom>;
  /** True when player is inside a hidden room (rendering uses overlay tiles) */
  inHiddenRoom: boolean;
  /** Current hidden room key (zone_x_y) or null */
  currentHiddenRoomKey: string | null;
  // ── Lore popup (from urns) ──
  lorePopup: { text: string; expiresAt: number } | null;
  // ── Combat log ──
  combatLog: string[];
  // ── Rampage notification ──
  rampageText: string | null;
  rampageTextExpiry: number;
  // ── Quick Slots ──
  quickSlots: QuickSlots;
  // ── Notifications ──
  notifications: GameNotification[];
  // ── Milestone Rewards ──
  /** Set of milestone levels that have already fired (prevents re-trigger) */
  milestoneRewards: Set<number>;
  // ── Passive Abilities (runtime flags, not persisted) ──
  /** Warrior Berserker passive: +20% attack speed when HP < 30% (unlocked at L15) */
  berserkerUnlocked: boolean;
  /** Mage Mana Shield passive: 10% of damage taken as MP cost instead (unlocked at L15) */
  manaShieldUnlocked: boolean;
  // ── Checkpoint system ──
  /** Active respawn checkpoint set by player (null = no checkpoint) */
  checkpoint: { zoneId: ZoneId; x: number; y: number } | null;
  /** True when a checkpoint is active */
  checkpointActive: boolean;
  /** Remaining ms of post-respawn immunity (0 = no immunity) */
  respawnImmunityTimer: number;
  /** True when post-respawn immunity is active */
  respawnImmunityActive: boolean;
  // ── Thunderstorm state ──
  /** True when a thunderstorm is active (outdoor zones) */
  thunderstormActive: boolean;
  /** Remaining ms of current thunderstorm */
  thunderstormTimer: number;
  /** Timer to next thunderstorm check (ms) */
  thunderstormCheckTimer: number;
  /** Time of last lightning flash (ms, for thunder delay) */
  lastLightningTime: number;
  /** Timer until next lightning strike during storm (ms) */
  lightningNextTimer: number;
}

// ─── Interactable Objects ─────────────────────────────────────────────────────

export type InteractableType = "barrel" | "mushroom" | "urn";
export type InteractableState = "intact" | "smashed" | "collected" | "examined";

export interface InteractableObject {
  id: string;
  x: number;
  y: number;
  type: InteractableType;
  state: InteractableState;
  /** Timestamp when this object should respawn (barrels/mushrooms only) */
  respawnTimer?: number;
}

// ─── Environmental Hazards ────────────────────────────────────────────────────

export type HazardType = "poison_pool" | "falling_rock";

export interface HazardEntity {
  id: string;
  x: number;
  y: number;
  type: HazardType;
  radius: number;
  active: boolean;
  spawnTime: number;
  duration?: number;
  /** For falling_rock: "shadow" | "falling" | "done" */
  rockPhase?: "shadow" | "falling" | "done";
  /** Timestamp when this rock started its shadow phase */
  rockStartTime?: number;
}

// ─── Hidden Room System ───────────────────────────────────────────────────────

export interface HiddenRoom {
  /** The "hidden wall" tile the player walks into */
  entryX: number;
  entryY: number;
  /** Where the player spawns inside the hidden room (stored in overlayTiles) */
  roomSpawnX: number;
  roomSpawnY: number;
  /** Whether the chest in this room has been collected this session */
  chestCollected: boolean;
}

// ─── Poison Cloud (Bog Witch ability) ─────────────────────────────────────────

export interface PoisonCloud {
  id: string;
  x: number;
  y: number;
  /** How long the cloud lasts (ms) */
  durationMs: number;
  /** Elapsed time (ms) */
  elapsed: number;
  /** HP damage per second to player standing in cloud */
  damagePerSec: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TILE_SIZE = 32;
export const MOVE_DURATION_MS = 200;
/** Sprint movement duration — 40% faster than walk (120ms per tile) */
export const SPRINT_DURATION_MS = 120;
/** Hold movement for this long before sprint activates (ms) */
export const SPRINT_HOLD_THRESHOLD_MS = 1000;
/** Sprint costs 1 mana per second — deducted in game loop */
export const SPRINT_MANA_COST_PER_SEC = 1;
/** Ghost trail: spawn every 80ms during sprint */
export const GHOST_TRAIL_INTERVAL_MS = 80;
/** Ghost trail: max 4 entries (FIFO) */
export const GHOST_TRAIL_MAX = 4;
export const WORLD_WIDTH = 32;
export const WORLD_HEIGHT = 32;
export const VIEWPORT_COLS = 21;
export const VIEWPORT_ROWS = 15;
/** 6-frame walk cycle for smoother motion */
export const ANIM_FRAME_COUNT = 6;
/** Slow idle bob period — ~2.5s breathing cycle */
export const IDLE_BOB_PERIOD = 2500;
/** Screen shake duration after attack (ms) */
export const SCREEN_SHAKE_DURATION_MS = 200;
/** Screen shake amplitude in pixels */
export const SCREEN_SHAKE_AMPLITUDE = 2;
/** Attack flash overlay duration (ms) */
export const ATTACK_FLASH_DURATION_MS = 80;
/** Respawn delay after death (ms) */
export const RESPAWN_DELAY_MS = 3000;
/** Meadow hub spawn tile position */
export const TOWN_SPAWN = { x: 15, y: 12 } as const;
/** Zone ID to respawn in after death */
export const RESPAWN_ZONE_ID: ZoneId = "meadow_hub";
/** Loot drop despawn time in ms */
export const LOOT_DESPAWN_MS = 30000;
/** Player hurt flash duration in ms */
export const PLAYER_HURT_FLASH_MS = 300;
/** Potion restore: 40% of max HP */
export const POTION_HEAL_PERCENT = 0.4;
/** Potion cooldown in ms */
export const POTION_COOLDOWN_MS = 10000;
/** Max potions carried */
export const POTION_MAX = 5;
/** Day/night full cycle duration in ms (20 minutes) */
export const DAY_NIGHT_CYCLE_MS = 1_200_000;
/** PVP respawn immunity duration in ms */
export const PVP_IMMUNITY_MS = 10000;
/** Frost Nova AoE radius in tiles */
export const FROST_NOVA_RADIUS = 2;
/** Arcane Bolt cooldown in ms — fast, aggressive 0.5s */
export const ARCANE_BOLT_COOLDOWN_MS = 500;
/** Arcane Bolt mana cost — cheap for frequent casting (was 5/8, now 4) */
export const ARCANE_BOLT_MANA_COST = 4;
/** Frost Nova mana cost (was 20→10 per rebalance spec) */
export const FROST_NOVA_MANA_COST = 10;
/** Frost Nova cooldown in ms — reduced for faster mage */
export const FROST_NOVA_COOLDOWN_MS = 4000;
/** Shadow Lance cooldown in ms — reduced for faster mage */
export const SHADOW_LANCE_COOLDOWN_MS = 7000;
/** Shadow Lance mana cost (was 30→15 per rebalance spec) */
export const SHADOW_LANCE_MANA_COST = 15;
/** Flame Ring AoE radius in tiles */
export const FLAME_RING_RADIUS = 2;
/** Flame Ring cooldown in ms — reduced for faster mage */
export const FLAME_RING_COOLDOWN_MS = 6000;
/** Flame Ring mana cost (was 25→12 per rebalance spec) */
export const FLAME_RING_MANA_COST = 12;
/** Flame Ring base damage (medium-high AoE) */
export const FLAME_RING_DAMAGE = 35;
/** Warrior shield skill duration in ms — full 60 seconds */
export const WARRIOR_SHIELD_DURATION_MS = 60000;
/** No fixed cooldown — mana IS the cooldown; warrior can reactivate once they have WARRIOR_SHIELD_ACTIVATE_MANA */
export const WARRIOR_SHIELD_COOLDOWN_MS = 0;
/** Mana cost to activate the shield (replaces old WARRIOR_SHIELD_MANA_COST) */
export const WARRIOR_SHIELD_MANA_COST = 40;
/** Alias used in new shield logic */
export const WARRIOR_SHIELD_ACTIVATE_MANA = 40;
/** Shield drains 0 mana per second — it simply lasts 60s OR until mana hits 0 */
export const SHIELD_MANA_DRAIN_PER_SEC = 0;
/** Shield breaks immediately when mana reaches 0 */
export const SHIELD_BREAKS_AT_ZERO_MANA = true;
/** No fixed cooldown timer; warrior can reactivate once mana ≥ WARRIOR_SHIELD_ACTIVATE_MANA */
export const SHIELD_NO_COOLDOWN = true;
/** Warrior shield damage reduction multiplier (0.5 = 50% reduction) */
export const WARRIOR_SHIELD_DMG_REDUCTION = 0.5;
/** Mage mana regeneration interval in ms (1.5 mana/sec → fires every 667ms) */
export const MAGE_MANA_REGEN_MS = 667;
/** Warrior mana regeneration interval in ms (0.5 mana/sec → fires every 2000ms) */
export const WARRIOR_MANA_REGEN_MS = 2000;
/** PVP enabled zone IDs */
export const PVP_ZONES = new Set<ZoneId>([
  "dark_forest",
  "ancient_ruins_deep",
  "cave_interior",
  "boss_chamber",
  "cursed_swamp",
  "floating_ruins",
  "pirate_island",
  "cursed_galleon",
  "thunder_isle",
]);
/** Safe zones (no PVP) */
export const SAFE_ZONES = new Set<ZoneId>(["meadow_hub", "aurelion"]);

// ─── Hit-stop and knockback constants ─────────────────────────────────────────

/** Duration of hit-stop freeze (ms) — 3 frames at 60fps */
export const HIT_STOP_DURATION_MS = 50;
/** Knockback distance in tiles when a non-boss monster takes damage */
export const KNOCKBACK_TILES = 0.3;
/** Knockback return duration in ms */
export const KNOCKBACK_RETURN_MS = 200;

// ─── Warrior attack phase constants ───────────────────────────────────────────

/** Warrior wind-up phase duration (ms) — tilt backward */
export const WARRIOR_WINDUP_MS = 100;
/** Warrior strike phase duration (ms) — fast forward + arc */
export const WARRIOR_STRIKE_MS = 100;
/** Warrior recovery phase duration (ms) — return to neutral */
export const WARRIOR_RECOVERY_MS = 100;

// ─── Warrior MP costs ─────────────────────────────────────────────────────────

/** Warrior normal attack MP cost — FREE (0 MP) per rebalance spec */
export const WARRIOR_ATTACK_MP = 0;

// ─── Spell Visual Constants ───────────────────────────────────────────────────

/** Wind-up duration (ms) per spell before projectile/burst fires */
export const SPELL_WIND_UP_MS = {
  arcane: 200,
  frost: 200,
  shadow: 300,
  flame: 200,
  shield: 300,
} as const;

/** Spell lifecycle phase — used to drive rendering and hit detection */
export type SpellPhase = "wind_up" | "projectile" | "impact" | "active";

// ─── Portrait Mode Layout Constants ──────────────────────────────────────────

/** Height in px of the top status bar (HP/MP/XP bars, minimap) */
export const PORTRAIT_TOP_BAR_HEIGHT = 80;

/** Height in px of the bottom control bar (D-pad + action buttons) */
export const PORTRAIT_BOTTOM_BAR_HEIGHT = 180;

// ─── Critical Hit Constants ───────────────────────────────────────────────────

/** Base critical hit chance (0.10 = 10%) */
export const CRITICAL_HIT_CHANCE_BASE = 0.1;
/** Critical hit damage multiplier (1.75 = 175%) */
export const CRITICAL_HIT_MULTIPLIER = 1.75;
/** Warrior sword extra crit chance (+5%) */
export const WARRIOR_SWORD_CRIT_BONUS = 0.05;
/** Mage arcane bolt extra crit chance (+8%) */
export const MAGE_ARCANE_CRIT_BONUS = 0.08;

// ─── Dodge Constants ─────────────────────────────────────────────────────────

/** Dodge cooldown in ms */
export const DODGE_COOLDOWN_MS = 4000;
/** MP cost per dodge */
export const DODGE_MP_COST = 8;
/** Invincibility frames during dodge (ms) */
export const DODGE_INVULNERABILITY_MS = 300;
/** Tiles dashed per dodge */
export const DODGE_DISTANCE_TILES = 2;
/** Double-tap detection window (ms) */
export const DODGE_DOUBLE_TAP_MS = 300;

// ─── Quick Slot Bar ───────────────────────────────────────────────────────────

/** A single quick slot entry (null = empty) */
export type QuickSlotItem = ItemType | null;

/** 4 quick slots displayed above action buttons */
export type QuickSlots = [
  QuickSlotItem,
  QuickSlotItem,
  QuickSlotItem,
  QuickSlotItem,
];

// ─── Zone Difficulty ──────────────────────────────────────────────────────────

export type ZoneDifficulty = "beginner" | "intermediate" | "advanced" | "boss";

export const ZONE_DIFFICULTY: Record<ZoneId, ZoneDifficulty> = {
  meadow_hub: "beginner",
  aurelion: "beginner",
  wilderness: "beginner",
  forest_depths: "beginner",
  wolf_forest: "intermediate",
  tiger_jungle: "intermediate",
  bear_forest: "intermediate",
  ancient_ruins: "intermediate",
  crystal_ruins: "intermediate",
  cyclops_lair: "advanced",
  goblin_warrens: "intermediate",
  bat_cave: "intermediate",
  deep_cave: "advanced",
  hub_basement: "intermediate",
  wilderness_dungeon: "intermediate",
  forest_dungeon: "intermediate",
  dark_forest: "advanced",
  ancient_ruins_deep: "advanced",
  cave_interior: "advanced",
  boss_chamber: "boss",
  cursed_swamp: "advanced",
  floating_ruins: "advanced",
  pirate_island: "advanced",
  cursed_galleon: "boss",
  // ── Thunder Isle ──
  thunder_isle: "advanced",
};

// ─── Notification System ──────────────────────────────────────────────────────

export type NotificationType =
  | "friend_online"
  | "guild_message"
  | "world_event"
  | "achievement"
  | "system";

export interface GameNotification {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: number;
}
