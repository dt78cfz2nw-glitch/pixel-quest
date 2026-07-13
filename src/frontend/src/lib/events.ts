/**
 * World Events library — deterministic, client-side only.
 *
 * All clients on the same map derive identical events from the shared seed:
 *   seed = hash(windowIndex + zoneId)
 *
 * No server round-trip needed — the RNG is fully reproducible.
 * Events degrade gracefully: any failure returns undefined / false.
 */

import type { WorldEvent, WorldEventType, ZoneId } from "../types/game";

// ─── Timing Constants ─────────────────────────────────────────────────────────

/** How often a new event window opens (15 minutes) */
export const EVENT_INTERVAL_MS = 15 * 60 * 1000;

/** Monster Invasion lasts 3 minutes */
export const MONSTER_INVASION_DURATION_MS = 3 * 60 * 1000;

/** Treasure Spawn chests remain for 2 minutes */
export const TREASURE_CHEST_DURATION_MS = 2 * 60 * 1000;

/** Bounty Target stays active until killed, or 5 minutes max */
export const BOUNTY_TARGET_DURATION_MS = 5 * 60 * 1000;

/** XP multiplier during a Monster Invasion */
export const INVASION_XP_MULTIPLIER = 2;

/** Number of treasure chests spawned per Treasure Spawn event */
export const TREASURE_CHEST_COUNT = 5;

// ─── Thunder Isle Storm Event ──────────────────────────────────────────────

/** Duration of a Thunder Isle storm event in ms (30 seconds) */
export const STORM_EVENT_DURATION_MS = 30_000;

/** Interval between storm events in ms (2 minutes) */
export const STORM_EVENT_INTERVAL_MS = 120_000;

/** Warning lead time before storm starts in ms (10 seconds) */
export const STORM_WARNING_MS = 10_000;

/** Monster speed multiplier during storm (+15%) */
export const STORM_SPEED_MULTIPLIER = 1.15;

/**
 * Returns true if a thunder_isle storm is currently active based on a simple
 * deterministic cycle derived from real-time (not a server round-trip).
 * All clients compute the same result for the same moment.
 */
export function isThunderIsleStormActive(): boolean {
  const cyclePos = Date.now() % STORM_EVENT_INTERVAL_MS;
  return cyclePos < STORM_EVENT_DURATION_MS;
}

/**
 * Returns true if the storm warning period is active (10s before storm starts).
 * Used to display "\u26a1 Storm approaching Thunder Isle!" notification.
 */
export function isThunderIsleStormWarning(): boolean {
  const cyclePos = Date.now() % STORM_EVENT_INTERVAL_MS;
  const timeUntilNextStorm =
    cyclePos < STORM_EVENT_DURATION_MS ? 0 : STORM_EVENT_INTERVAL_MS - cyclePos;
  return timeUntilNextStorm > 0 && timeUntilNextStorm <= STORM_WARNING_MS;
}

/**
 * Returns the effective speed multiplier for a thunder_isle monster.
 * Applies STORM_SPEED_MULTIPLIER during an active storm.
 */
export function getThunderIsleSpeedMultiplier(): number {
  return isThunderIsleStormActive() ? STORM_SPEED_MULTIPLIER : 1.0;
}

// ─── EXP Zone Registry ────────────────────────────────────────────────────────

/**
 * All non-safe zones where world events can trigger.
 * Mirrors the dangerous/EXP areas defined in ZoneId.
 */
export const EXP_ZONE_IDS: ZoneId[] = [
  "wilderness",
  "forest_depths",
  "wolf_forest",
  "tiger_jungle",
  "bear_forest",
  "ancient_ruins",
  "crystal_ruins",
  "cyclops_lair",
  "goblin_warrens",
  "bat_cave",
  "deep_cave",
  "dark_forest",
  "ancient_ruins_deep",
  "cave_interior",
  "boss_chamber",
  "cursed_swamp",
  "floating_ruins",
  "pirate_island",
  "cursed_galleon",
  "thunder_isle",
];

// ─── Deterministic RNG ────────────────────────────────────────────────────────

/**
 * Fast deterministic hash of a string → unsigned 32-bit integer.
 * Uses the djb2 algorithm — identical output on all clients.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // h = h * 33 ^ charCode
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep as unsigned 32-bit
  }
  return h;
}

/**
 * Returns a deterministic seed for a given event window + zone combination.
 * All clients on the same map will compute the identical seed.
 *
 * @param windowIndex - Integer index from getCurrentWindowIndex()
 * @param zoneId      - The zone being seeded
 */
export function getEventWindowSeed(
  windowIndex: number,
  zoneId: ZoneId,
): number {
  return hashString(`${windowIndex}:${zoneId}`);
}

// ─── Event Selection ──────────────────────────────────────────────────────────

/** The three possible event types, used for modular index selection. */
const EVENT_TYPES: WorldEventType[] = [
  "monster_invasion",
  "treasure_spawn",
  "bounty_target",
];

/**
 * Deterministically selects a WorldEventType from the given seed.
 * Uses seed % 3 with equal probability.
 */
export function pickRandomEvent(seed: number): WorldEventType {
  return EVENT_TYPES[seed % EVENT_TYPES.length];
}

/**
 * Deterministically selects a ZoneId from EXP_ZONE_IDS using the seed.
 */
export function pickRandomZone(seed: number): ZoneId {
  return EXP_ZONE_IDS[seed % EXP_ZONE_IDS.length];
}

// ─── Window Helpers ───────────────────────────────────────────────────────────

/**
 * Returns the current 15-minute window index.
 * Increases by 1 every EVENT_INTERVAL_MS ms — shared by all clients.
 */
export function getCurrentWindowIndex(): number {
  return Math.floor(Date.now() / EVENT_INTERVAL_MS);
}

/**
 * Returns true if the player's current zone is the one selected for this
 * event window. All clients on the same zone will return the same value.
 *
 * @param windowIndex  - From getCurrentWindowIndex()
 * @param currentZone  - The zone the local player is currently in
 */
export function shouldTriggerEvent(
  windowIndex: number,
  currentZone: ZoneId,
): boolean {
  // The zone for this window is derived from the window-level seed
  const windowSeed = hashString(`window:${windowIndex}`);
  const targetZone = pickRandomZone(windowSeed);
  return currentZone === targetZone;
}

// ─── Event Lifecycle ──────────────────────────────────────────────────────────

/**
 * Constructs (or reconstructs) a WorldEvent deterministically from the window
 * index and zone. Calling this twice with the same arguments always returns an
 * event with the same id, type, startedAt, and durationMs.
 *
 * startedAt is pinned to the start of the window so all clients agree.
 */
export function getOrCreateWorldEvent(
  windowIndex: number,
  zoneId: ZoneId,
): WorldEvent {
  const seed = getEventWindowSeed(windowIndex, zoneId);
  const type = pickRandomEvent(seed);

  const startedAt = windowIndex * EVENT_INTERVAL_MS;

  let durationMs: number;
  switch (type) {
    case "monster_invasion":
      durationMs = MONSTER_INVASION_DURATION_MS;
      break;
    case "treasure_spawn":
      durationMs = TREASURE_CHEST_DURATION_MS;
      break;
    case "bounty_target":
      durationMs = BOUNTY_TARGET_DURATION_MS;
      break;
  }

  const event: WorldEvent = {
    id: `event_${windowIndex}_${zoneId}`,
    type,
    zoneId,
    startedAt,
    durationMs,
  };

  if (type === "monster_invasion") {
    event.invasionXpMultiplier = INVASION_XP_MULTIPLIER;
    event.eliteMonsterIds = [];
  }

  if (type === "treasure_spawn") {
    event.treasureChestIds = [];
  }

  return event;
}

/**
 * Returns true if a WorldEvent is still within its active time window.
 * Uses Date.now() — no server clock required.
 */
export function isEventActive(event: WorldEvent): boolean {
  return Date.now() < event.startedAt + event.durationMs;
}
