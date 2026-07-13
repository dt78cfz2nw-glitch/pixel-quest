import { useCallback, useEffect, useRef } from "react";
import {
  initAudio,
  playAttack,
  playCriticalHit,
  playDodge,
  playFootstep,
  playLevelUp,
  playMonsterDeath,
  playUIClick,
  playZoneMusic,
} from "../lib/audio";
import {
  createBoss,
  createShipCaptainBoss,
  damageBoss,
  damageShipCaptainBoss,
  tickBoss,
  tickShipCaptainBoss,
} from "../lib/boss";
import {
  EXP_ZONE_IDS,
  INVASION_XP_MULTIPLIER,
  TREASURE_CHEST_COUNT,
  getCurrentWindowIndex,
  getOrCreateWorldEvent,
  isEventActive,
  shouldTriggerEvent,
} from "../lib/events";
import { handleKeyDown, handleKeyUp, isTransitionBlocked } from "../lib/input";
import {
  damageMonster,
  generateLootDrop,
  getMonsterXp,
  tickMonsters,
} from "../lib/monsters";
import { QUEST_GIVERS, cloneQuest } from "../lib/quests";
import { isWalkable } from "../lib/world";
import {
  CHECKPOINT_STONE_POSITIONS,
  addCombatLogEntry,
  addNotification,
  checkHiddenRoomEntry,
  checkZoneTransition,
  enterHiddenRoom,
  exitHiddenRoom,
  setCheckpoint,
  tickGameState,
  triggerPlayerHurt,
  tryInteractNearby,
  unlockAchievement,
} from "../store/gameStore";
import type { GameState, ZoneId } from "../types/game";
import {
  ARCANE_BOLT_MANA_COST,
  CRITICAL_HIT_CHANCE_BASE,
  CRITICAL_HIT_MULTIPLIER,
  DODGE_COOLDOWN_MS,
  DODGE_DISTANCE_TILES,
  DODGE_INVULNERABILITY_MS,
  DODGE_MP_COST,
  FLAME_RING_COOLDOWN_MS,
  FLAME_RING_DAMAGE,
  FLAME_RING_MANA_COST,
  FLAME_RING_RADIUS,
  FROST_NOVA_COOLDOWN_MS,
  FROST_NOVA_MANA_COST,
  FROST_NOVA_RADIUS,
  GHOST_TRAIL_INTERVAL_MS,
  HIT_STOP_DURATION_MS,
  KNOCKBACK_RETURN_MS,
  KNOCKBACK_TILES,
  MAGE_ARCANE_CRIT_BONUS,
  MAGE_MANA_REGEN_MS,
  PVP_ZONES,
  SHADOW_LANCE_COOLDOWN_MS,
  SHADOW_LANCE_MANA_COST,
  SPRINT_HOLD_THRESHOLD_MS,
  SPRINT_MANA_COST_PER_SEC,
  TileType,
  WARRIOR_ATTACK_MP,
  WARRIOR_MANA_REGEN_MS,
  WARRIOR_SHIELD_DMG_REDUCTION,
  WARRIOR_SWORD_CRIT_BONUS,
} from "../types/game";

// ─── Game Loop Hook ───────────────────────────────────────────────────────────

interface UseGameLoopOptions {
  gameStateRef: React.MutableRefObject<GameState | null>;
  onTileLanded: (x: number, y: number) => void;
  onFrame: (timestamp: number) => void;
  openEmotePanel?: () => void;
  openChat?: () => void;
  chatOpen?: boolean;
  onAttackTriggered?: () => void;
  onHpChanged?: (hp: number, mp: number) => void;
  onXpChanged?: (xp: number, level: number) => void;
  onMonsterKilled?: () => void;
  onPlayerDied?: () => void;
  onPlayerRespawned?: () => void;
  onAutoSave?: () => void;
  onPvpWarning?: (zoneId: string) => void;
  onAchievementUnlocked?: (id: string, title: string) => void;
  /** Called when a kill streak threshold is crossed (3 or 5) */
  onKillStreak?: (count: number) => void;
  /** Called on level up with old and new stat values */
  onLevelUp?: (
    oldStats: { hp: number; mp: number; atk: number },
    newStats: { hp: number; mp: number; atk: number },
    newLevel: number,
  ) => void;
  /** Called to broadcast a world event announcement as a chat message */
  onEventAnnounce?: (text: string) => void;
  /**
   * Called when player deals damage to a monster (tile coords).
   * GameCanvas uses its own camera ref to convert to screen coords
   * and dispatches combat_damage_number for the CombatOverlay.
   */
  onDamageDealt?: (
    tileX: number,
    tileY: number,
    damage: number,
    isCrit: boolean,
    spellType: string,
  ) => void;
  /**
   * Called when player takes damage.
   * GameCanvas dispatches combat_damage_number for the CombatOverlay.
   */
  onPlayerDamageReceived?: (
    tileX: number,
    tileY: number,
    damage: number,
  ) => void;
}

// HP/MP regen: every 5 seconds
const REGEN_INTERVAL_MS = 5000;
const REGEN_HP = 5;
// MP regen is class-specific — computed dynamically per level now

// Warrior: 2-tile melee, 20 dmg. Mage: 5-tile ranged, 15 dmg.
const WARRIOR_RANGE = 2;
const MAGE_RANGE = 5;
const WARRIOR_DAMAGE = 20;
const MAGE_DAMAGE = 15;
// MP costs per action — imported from types/game.ts constants
// WARRIOR_ATTACK_MP = 0 (warrior attacks are FREE per rebalance spec)
// ARCANE_BOLT_MANA_COST = 4 (mage primary attack)

// ─── Critical hit helper ──────────────────────────────────────────────────────

/**
 * Calculate damage with potential critical hit.
 * Returns { damage, isCrit }.
 */
function calcDamageWithCrit(
  baseDamage: number,
  extraCritChance: number,
): { damage: number; isCrit: boolean } {
  const critChance = CRITICAL_HIT_CHANCE_BASE + extraCritChance;
  const isCrit = Math.random() < critChance;
  const damage = isCrit
    ? Math.floor(baseDamage * CRITICAL_HIT_MULTIPLIER)
    : baseDamage;
  return { damage, isCrit };
}

// ─── Dodge direction → tile offset ───────────────────────────────────────────

function dodgeDirToOffset(dir: string): { dx: number; dy: number } {
  switch (dir) {
    case "up":
      return { dx: 0, dy: -1 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
    case "right":
      return { dx: 1, dy: 0 };
    case "up-left":
      return { dx: -1, dy: -1 };
    case "up-right":
      return { dx: 1, dy: -1 };
    case "down-left":
      return { dx: -1, dy: 1 };
    case "down-right":
      return { dx: 1, dy: 1 };
    default:
      return { dx: 0, dy: 0 };
  }
}

// Mage: +1 mana per 1s; Warrior: +1 mana per 5s
const MAGE_MP_REGEN_INTERVAL = MAGE_MANA_REGEN_MS;
const WARRIOR_MP_REGEN_INTERVAL = WARRIOR_MANA_REGEN_MS;
const REGEN_PAUSE_AFTER_CAST = 1000;

// ─── Milestone Reward Handler ─────────────────────────────────────────────────

function checkMilestoneRewards(
  state: import("../types/game").GameState,
  newLevel: number,
  cls: import("../types/game").CharacterClass,
): void {
  if (state.player.isGuest) return;
  if (!state.milestoneRewards) state.milestoneRewards = new Set<number>();
  const rewards = state.milestoneRewards;

  if (newLevel >= 5 && !rewards.has(5)) {
    rewards.add(5);
    (
      state.player as unknown as { accessorySlot2Unlocked: boolean }
    ).accessorySlot2Unlocked = true;
    addNotification(
      state,
      "achievement",
      "Milestone unlocked: Second accessory slot!",
    );
  }
  if (newLevel >= 10 && !rewards.has(10)) {
    rewards.add(10);
    (state.player as unknown as { sprintUnlocked: boolean }).sprintUnlocked =
      true;
    addNotification(
      state,
      "achievement",
      "Milestone unlocked: Sprint ability!",
    );
  }
  if (newLevel >= 15 && !rewards.has(15)) {
    rewards.add(15);
    if (cls === "warrior") {
      state.berserkerUnlocked = true;
      addNotification(
        state,
        "achievement",
        "Passive unlocked: Berserker (+20% ATK speed when low HP)!",
      );
    } else {
      state.manaShieldUnlocked = true;
      addNotification(
        state,
        "achievement",
        "Passive unlocked: Mana Shield (10% damage as MP cost)!",
      );
    }
  }
  if (newLevel >= 20 && !rewards.has(20)) {
    rewards.add(20);
    addNotification(
      state,
      "achievement",
      "Level 20 reached: Third character slot unlocked!",
    );
  }
  if (newLevel >= 30 && !rewards.has(30)) {
    rewards.add(30);
    if (!state.earnedTitles.includes("veteran")) {
      state.earnedTitles = [...state.earnedTitles, "veteran"];
    }
    if (state.activeTitleId === "novice") {
      state.activeTitleId = "veteran";
      state.player.activeTitleId = "veteran";
    }
    addNotification(state, "achievement", "Title unlocked: Veteran!");
  }
}

// Spell visual animation durations
const MAGE_SPELL_VISUAL_DURATION_MS = 500; // arcane bolt / frost / flame ring animations
const SHADOW_LANCE_VISUAL_DURATION_MS = 700; // shadow lance takes slightly longer

// XP formula matching monsters.ts config
const XP_BASE = 100;
const XP_SCALE = 1.25;

function xpForLevel(level: number): number {
  return Math.floor(XP_BASE * XP_SCALE ** (level - 1));
}

function levelFromXp(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < 60) {
    const needed = xpForLevel(level);
    if (total + needed > xp) break;
    total += needed;
    level++;
  }
  return level;
}

// Auto-save every 30 seconds
const AUTO_SAVE_INTERVAL_MS = 30000;

export function useGameLoop({
  gameStateRef,
  onTileLanded,
  onFrame,
  openEmotePanel,
  openChat,
  chatOpen = false,
  onAttackTriggered,
  onHpChanged,
  onXpChanged,
  onMonsterKilled,
  onPlayerDied,
  onPlayerRespawned,
  onAutoSave,
  onPvpWarning,
  onAchievementUnlocked,
  onKillStreak,
  onLevelUp,
  onEventAnnounce,
  onDamageDealt,
  onPlayerDamageReceived,
}: UseGameLoopOptions): void {
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const prevAttackPendingRef = useRef(false);
  const regenAccRef = useRef<number>(0);
  const mpRegenAccRef = useRef<number>(0);
  const autoSaveAccRef = useRef<number>(0);
  const wasDeadRef = useRef(false);
  const lastTileXRef = useRef<number>(-1);
  const lastTileYRef = useRef<number>(-1);
  // Spell collision check throttle: run at most once per 100ms
  const lastSpellHitCheckRef = useRef<number>(0);
  // Sprint: accumulate how long movement has been held continuously
  const sprintManaAccRef = useRef<number>(0);
  const ghostTrailAccRef = useRef<number>(0);
  // First kill bonus: true on session start, false after first kill
  const hasFirstKillBonusRef = useRef(true);
  // Kill streak: timestamps of recent kills within 5s window
  const recentKillTimestampsRef = useRef<number[]>([]);
  // World events: check every 1 second (not every frame)
  const worldEventCheckAccRef = useRef<number>(0);
  // Track which window index we last processed to avoid re-triggering
  const lastWorldEventWindowRef = useRef<number>(-1);
  // Milestone init: backfill milestones for existing high-level players (once)
  const milestoneInitRef = useRef(false);

  const loop = useCallback(
    (timestamp: number) => {
      const state = gameStateRef.current;
      if (!state) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const delta =
        lastTimeRef.current === 0 ? 16 : timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Clamp delta to avoid spiral of death on tab-switch
      const clampedDelta = Math.min(delta, 100);

      // ── Milestone backfill for existing high-level players (once per session) ──
      if (!milestoneInitRef.current && !state.player.isGuest) {
        milestoneInitRef.current = true;
        const lv = state.player.level;
        if (lv >= 5)
          checkMilestoneRewards(state, lv, state.player.selectedClass);
      }

      // ── Block combat/AI during zone transitions ──
      const isTransitioning = state.isTransitioning;

      // ── PVP zone warning ──
      if (!isTransitioning && !state.isDead) {
        const zoneId = state.currentZoneId;
        if (PVP_ZONES.has(zoneId) && !state.pvpWarningShownZones.has(zoneId)) {
          state.pvpWarningShownZones.add(zoneId);
          onPvpWarning?.(zoneId);
        }
      }

      // ── World Events tick (checked every 1 second, not every frame) ──
      if (!isTransitioning && !state.isDead) {
        worldEventCheckAccRef.current += clampedDelta;
        if (worldEventCheckAccRef.current >= 1000) {
          worldEventCheckAccRef.current = 0;
          try {
            const currentZone = state.currentZoneId;
            const isExpZone = (EXP_ZONE_IDS as ZoneId[]).includes(currentZone);

            if (isExpZone) {
              const windowIndex = getCurrentWindowIndex();

              // ── Check if active event has expired ──
              if (
                state.activeWorldEvent &&
                !isEventActive(state.activeWorldEvent)
              ) {
                const expiredType = state.activeWorldEvent.type;
                // Send expiry announcement
                if (expiredType === "monster_invasion") {
                  onEventAnnounce?.("The invasion has been repelled!");
                  // Un-tag invasion monsters
                  for (const m of state.monsters) {
                    m.isInvasionMonster = false;
                  }
                } else if (expiredType === "bounty_target") {
                  // Clear elite flags on any surviving elite monsters
                  for (const m of state.monsters) {
                    m.isElite = false;
                    m.eliteScale = undefined;
                  }
                }
                state.activeWorldEvent = undefined;
              }

              // ── Check if a new event should start ──
              if (
                !state.activeWorldEvent &&
                shouldTriggerEvent(windowIndex, currentZone) &&
                windowIndex !== lastWorldEventWindowRef.current
              ) {
                lastWorldEventWindowRef.current = windowIndex;
                const worldEvent = getOrCreateWorldEvent(
                  windowIndex,
                  currentZone,
                );
                state.activeWorldEvent = worldEvent;

                const zoneName = currentZone
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());

                // Send announcement
                const eventLabel =
                  worldEvent.type === "monster_invasion"
                    ? "Monster Invasion"
                    : worldEvent.type === "treasure_spawn"
                      ? "Treasure Spawn"
                      : "Bounty Target";
                onEventAnnounce?.(`⚠ ${eventLabel} has begun on ${zoneName}!`);
                // Dispatch world event toast for CombatOverlay
                window.dispatchEvent(
                  new CustomEvent("world_event_toast", {
                    detail: {
                      text:
                        worldEvent.type === "monster_invasion"
                          ? `⚡ Monster Invasion in ${zoneName}!`
                          : worldEvent.type === "treasure_spawn"
                            ? `💰 Treasure Spawn in ${zoneName}!`
                            : `🎯 Bounty Target in ${zoneName}!`,
                    },
                  }),
                );

                // ── Handle event start effects ──
                if (worldEvent.type === "monster_invasion") {
                  // Spawn extra invasion monsters (3x normal = add 2x more)
                  const baseCount = state.monsters.length;
                  const extraCount = Math.max(4, Math.floor(baseCount * 2));
                  const tiles = state.world.tiles;
                  const worldWidth = state.world.width;
                  const worldHeight = state.world.height;
                  const NON_WALK = new Set([
                    2, 4, 6, 7, 8, 10, 12, 13, 20, 21, 22, 23, 25, 18, 19, 27,
                    30, 31, 32, 35, 38,
                  ]);
                  const invasionIds: string[] = [];
                  // Pick a type based on existing monster types in zone
                  const existingTypes = state.monsters
                    .filter((m) => m.state !== "dead")
                    .map((m) => m.type);
                  const pickType =
                    existingTypes.length > 0
                      ? existingTypes[
                          Math.floor(Math.random() * existingTypes.length)
                        ]
                      : "goblin";

                  for (let i = 0; i < extraCount; i++) {
                    // Find a random walkable tile
                    let spawnX = -1;
                    let spawnY = -1;
                    for (let attempt = 0; attempt < 40; attempt++) {
                      const tx =
                        1 + Math.floor(Math.random() * (worldWidth - 2));
                      const ty =
                        1 + Math.floor(Math.random() * (worldHeight - 2));
                      const tile = tiles[ty]?.[tx];
                      if (tile !== undefined && !NON_WALK.has(tile)) {
                        spawnX = tx;
                        spawnY = ty;
                        break;
                      }
                    }
                    if (spawnX < 0) continue;
                    const invId = `invasion_${worldEvent.id}_${i}`;
                    invasionIds.push(invId);
                    state.monsters.push({
                      id: invId,
                      x: spawnX,
                      y: spawnY,
                      hp: state.monsters[0]?.maxHp ?? 80,
                      maxHp: state.monsters[0]?.maxHp ?? 80,
                      state: "idle",
                      facingDirection: "down",
                      animFrame: 0,
                      animTimer: 0,
                      lastAttackTime: 0,
                      type: pickType,
                      isRare: false,
                      rareTint: false,
                      ambushHidden: false,
                      poisonTicksRemaining: 0,
                      poisonDamagePerTick: 0,
                      aggroIndicatorTimer: 0,
                      knockbackOffsetX: 0,
                      knockbackOffsetY: 0,
                      knockbackVelX: 0,
                      knockbackVelY: 0,
                      knockbackTimer: 0,
                      isInvasionMonster: true,
                      abilityTimer: 0,
                      abilityState: "ready" as const,
                    });
                  }
                  if (worldEvent.eliteMonsterIds) {
                    worldEvent.eliteMonsterIds.push(...invasionIds);
                  }
                } else if (worldEvent.type === "treasure_spawn") {
                  // Spawn TREASURE_CHEST_COUNT loot drops on walkable tiles
                  const tiles = state.world.tiles;
                  const worldWidth = state.world.width;
                  const worldHeight = state.world.height;
                  const NON_WALK = new Set([
                    2, 4, 6, 7, 8, 10, 12, 13, 20, 21, 22, 23, 25, 18, 19, 27,
                    30, 31, 32, 35, 38,
                  ]);
                  const chestIds: string[] = [];
                  for (let ci = 0; ci < TREASURE_CHEST_COUNT; ci++) {
                    let cx = -1;
                    let cy = -1;
                    for (let attempt = 0; attempt < 50; attempt++) {
                      const tx =
                        2 + Math.floor(Math.random() * (worldWidth - 4));
                      const ty =
                        2 + Math.floor(Math.random() * (worldHeight - 4));
                      const tile = tiles[ty]?.[tx];
                      if (tile !== undefined && !NON_WALK.has(tile)) {
                        cx = tx;
                        cy = ty;
                        break;
                      }
                    }
                    if (cx < 0) continue;
                    const chestId = `chest_${worldEvent.id}_${ci}`;
                    chestIds.push(chestId);
                    const itemTypes = [
                      "health_potion",
                      "mana_potion",
                      "ancient_rune_shard",
                      "rare_gem",
                    ] as const;
                    const itemType =
                      itemTypes[Math.floor(Math.random() * itemTypes.length)];
                    state.lootDrops.push({
                      id: chestId,
                      x: cx,
                      y: cy,
                      zone: currentZone,
                      item: { id: chestId, itemType, amount: 1 },
                      spawnTime: Date.now(),
                    });
                  }
                  if (worldEvent.treasureChestIds) {
                    worldEvent.treasureChestIds.push(...chestIds);
                  }
                } else if (worldEvent.type === "bounty_target") {
                  // Pick a random living monster and make it elite
                  const living = state.monsters.filter(
                    (m) => m.state !== "dead",
                  );
                  if (living.length > 0) {
                    const target =
                      living[Math.floor(Math.random() * living.length)];
                    target.isElite = true;
                    target.eliteScale = 3;
                    target.maxHp = target.maxHp * 5;
                    target.hp = target.maxHp;
                    const monsterName = target.type
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    onEventAnnounce?.(`Elite ${monsterName} has appeared!`);
                    if (worldEvent.eliteMonsterIds) {
                      worldEvent.eliteMonsterIds.push(target.id);
                    }
                  }
                }
              }
            } else {
              // Left the EXP zone — clear any active event
              if (state.activeWorldEvent) {
                state.activeWorldEvent = undefined;
              }
            }
          } catch (err) {
            console.warn(
              "[PixelQuest] World event tick error (non-fatal):",
              err,
            );
          }
        }
      }

      // ── Monster AI tick (only when not transitioning and not dead) ──
      if (!state.isDead && !isTransitioning && state.monsters.length > 0) {
        const playerX = state.player.tileX + state.player.pixelOffsetX / 32;
        const playerY = state.player.tileY + state.player.pixelOffsetY / 32;

        // ── Tick monster knockback return (independent of hit-stop) ──
        for (const m of state.monsters) {
          if ((m.knockbackTimer ?? 0) > 0) {
            const kDt = Math.min(clampedDelta, m.knockbackTimer);
            const t = 1 - m.knockbackTimer / KNOCKBACK_RETURN_MS;
            // Ease-out spring: offset decreases toward 0
            const ease = 1 - t;
            m.knockbackOffsetX =
              (m.knockbackVelX * ease * KNOCKBACK_RETURN_MS) / 1000;
            m.knockbackOffsetY =
              (m.knockbackVelY * ease * KNOCKBACK_RETURN_MS) / 1000;
            m.knockbackTimer = Math.max(0, m.knockbackTimer - kDt);
            if (m.knockbackTimer <= 0) {
              m.knockbackOffsetX = 0;
              m.knockbackOffsetY = 0;
            }
          }
        }

        // ── Skip monster AI movement during hit-stop ──
        if (state.hitStopTimer > 0) {
          // Only skip tickMonsters — don't skip combat events processing above
        } else {
          try {
            const { updatedMonsters, combatEvents } = tickMonsters(
              state.monsters,
              playerX,
              playerY,
              state.world,
              clampedDelta,
              state.currentZoneId,
              state.world.zoneId,
            );

            state.monsters = updatedMonsters;

            if (combatEvents.length > 0) {
              for (const evt of combatEvents) {
                if (evt.type === "player-hit") {
                  // Check for special ability events (tagged by monsters.ts)
                  const specialEvt = evt as typeof evt & {
                    isSpecial?: string;
                    spawnCloud?: boolean;
                    stunMs?: number;
                  };
                  if (
                    specialEvt.isSpecial === "poison_cloud" &&
                    specialEvt.spawnCloud
                  ) {
                    // Spawn a poison cloud at player position
                    const cloudId = `cloud_${Date.now()}_${Math.random()}`;
                    state.poisonClouds = state.poisonClouds ?? [];
                    state.poisonClouds.push({
                      id: cloudId,
                      x: Math.round(state.player.tileX),
                      y: Math.round(state.player.tileY),
                      durationMs: 3000,
                      elapsed: 0,
                      damagePerSec: 2,
                    });
                    window.dispatchEvent(
                      new CustomEvent("poison_cloud_spawned", {
                        detail: {
                          x: Math.round(state.player.tileX),
                          y: Math.round(state.player.tileY),
                        },
                      }),
                    );
                    continue;
                  }
                  if (specialEvt.isSpecial === "ground_slam") {
                    // Stun player for 1 second
                    if (
                      state.pvpImmunityTimer <= 0 &&
                      !state.player.isInvincible
                    ) {
                      state.player.stunTimer = specialEvt.stunMs ?? 1000;
                      window.dispatchEvent(
                        new CustomEvent("player_stunned", {
                          detail: { duration: state.player.stunTimer },
                        }),
                      );
                      state.screenShakeTimer = Math.max(
                        state.screenShakeTimer,
                        200,
                      );
                    }
                    continue;
                  }
                  if (specialEvt.isSpecial === "roar_push") {
                    // Push player 2 tiles away from warden
                    if (evt.monsterId) {
                      const warden = state.monsters.find(
                        (m) => m.id === evt.monsterId,
                      );
                      if (warden) {
                        const pdx = state.player.tileX - warden.x;
                        const pdy = state.player.tileY - warden.y;
                        const pDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
                        const pushNx = pdx / pDist;
                        const pushNy = pdy / pDist;
                        let bestX = state.player.tileX;
                        let bestY = state.player.tileY;
                        for (let step = 1; step <= 2; step++) {
                          const nx = Math.round(
                            state.player.tileX + pushNx * step,
                          );
                          const ny = Math.round(
                            state.player.tileY + pushNy * step,
                          );
                          if (isWalkable(state.world, nx, ny)) {
                            bestX = nx;
                            bestY = ny;
                          } else break;
                        }
                        state.player.tileX = bestX;
                        state.player.tileY = bestY;
                        state.player.targetTileX = bestX;
                        state.player.targetTileY = bestY;
                        state.player.isMoving = false;
                        state.screenShakeTimer = Math.max(
                          state.screenShakeTimer,
                          300,
                        );
                      }
                    }
                    continue;
                  }
                  // Skip damage if invincible (dodge), PVP immune, or stunned
                  if (state.player.isInvincible) continue;
                  if (state.pvpImmunityTimer > 0) continue;
                  // Apply shield damage reduction if warrior is defending
                  const dmg = state.player.shieldActive
                    ? Math.max(
                        1,
                        Math.floor(evt.damage * WARRIOR_SHIELD_DMG_REDUCTION),
                      )
                    : evt.damage;
                  if (dmg <= 0) continue;
                  // ── Mana Shield passive (Mage L15): 10% of damage as MP cost ──
                  let finalDmg = dmg;
                  if (
                    state.manaShieldUnlocked &&
                    state.player.selectedClass === "mage" &&
                    state.player.mp > 0
                  ) {
                    const mpCost = Math.ceil(dmg * 0.1);
                    const absorbed = Math.min(mpCost, state.player.mp);
                    state.player.mp = Math.max(0, state.player.mp - absorbed);
                    finalDmg = Math.max(1, dmg - absorbed);
                  }
                  const newHp = Math.max(0, state.player.hp - finalDmg);
                  state.player.hp = newHp;
                  state.recentCombatEvents.push({ ...evt, damage: finalDmg });
                  // Track killer for death recap
                  if (evt.monsterId && state.player.hp <= 0) {
                    const killer = state.monsters.find(
                      (m) => m.id === evt.monsterId,
                    );
                    if (killer) {
                      const name = killer.type
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                      state.player.deathRecap = {
                        killerName: (killer.isRare ? "👑 Rare " : "") + name,
                        damageTaken: state.player.sessionDamageTaken + finalDmg,
                        timeInZone: Date.now() - state.player.zoneEnterTime,
                      };
                    }
                  }
                  triggerPlayerHurt(state, finalDmg);
                  // Floating damage number on player
                  onPlayerDamageReceived?.(
                    state.player.tileX,
                    state.player.tileY,
                    finalDmg,
                  );
                  // Dispatch damage direction indicator event
                  if (evt.monsterId) {
                    const hitter = state.monsters.find(
                      (m) => m.id === evt.monsterId,
                    );
                    if (hitter) {
                      const px2 =
                        state.player.tileX + state.player.pixelOffsetX / 32;
                      const py2 =
                        state.player.tileY + state.player.pixelOffsetY / 32;
                      const angle = Math.atan2(hitter.y - py2, hitter.x - px2);
                      window.dispatchEvent(
                        new CustomEvent("player_hurt_direction", {
                          detail: { angle },
                        }),
                      );
                    }
                  }
                  // ── Combat log: player hurt ──
                  if (evt.monsterId) {
                    const hitterM = state.monsters.find(
                      (m) => m.id === evt.monsterId,
                    );
                    const monName = hitterM
                      ? hitterM.type
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())
                      : "Monster";
                    addCombatLogEntry(
                      state,
                      `${monName} hit you for ${finalDmg} damage`,
                    );
                  }
                  onHpChanged?.(state.player.hp, state.player.mp);
                } else {
                  state.recentCombatEvents.push(evt);
                }
              }
            }
          } catch (err) {
            console.warn(
              "[PixelQuest] Monster AI tick error (non-fatal):",
              err,
            );
          }
        }
      }

      // ── Boss AI tick (boss_chamber only) ──
      if (
        !state.isDead &&
        !isTransitioning &&
        state.currentZoneId === "boss_chamber"
      ) {
        // Spawn boss if not present
        if (!state.boss) {
          state.boss = createBoss(state.player.level);
        }
        if (state.boss && state.boss.phase !== "dead") {
          const pxB = state.player.tileX + state.player.pixelOffsetX / 32;
          const pyB = state.player.tileY + state.player.pixelOffsetY / 32;
          try {
            const { boss: updatedBoss, combatEvents: bossEvents } = tickBoss(
              state.boss,
              pxB,
              pyB,
              clampedDelta,
            );
            state.boss = updatedBoss;
            for (const evt of bossEvents) {
              if (evt.type === "player-hit" && state.pvpImmunityTimer <= 0) {
                const dmg = state.player.shieldActive
                  ? Math.max(
                      1,
                      Math.floor(evt.damage * WARRIOR_SHIELD_DMG_REDUCTION),
                    )
                  : evt.damage;
                state.player.hp = Math.max(0, state.player.hp - dmg);
                state.recentCombatEvents.push({ ...evt, damage: dmg });
                if (state.player.hp <= 0) {
                  state.player.deathRecap = {
                    killerName: "The Stone Warden",
                    damageTaken: state.player.sessionDamageTaken + dmg,
                    timeInZone: Date.now() - state.player.zoneEnterTime,
                  };
                }
                triggerPlayerHurt(state, dmg);
                // Damage direction indicator from boss position
                if (state.boss) {
                  const px3 =
                    state.player.tileX + state.player.pixelOffsetX / 32;
                  const py3 =
                    state.player.tileY + state.player.pixelOffsetY / 32;
                  const angle3 = Math.atan2(
                    state.boss.y - py3,
                    state.boss.x - px3,
                  );
                  window.dispatchEvent(
                    new CustomEvent("player_hurt_direction", {
                      detail: { angle: angle3 },
                    }),
                  );
                }
                onHpChanged?.(state.player.hp, state.player.mp);
              }
            }
          } catch (err) {
            console.warn("[PixelQuest] Boss tick error (non-fatal):", err);
          }
        }
      }

      // ── Ship Captain boss tick (cursed_galleon only) ──
      if (
        !state.isDead &&
        !isTransitioning &&
        state.currentZoneId === "cursed_galleon"
      ) {
        if (!state.shipCaptainBoss) {
          state.shipCaptainBoss = createShipCaptainBoss();
        }
        if (state.shipCaptainBoss && state.shipCaptainBoss.phase !== "dead") {
          const pxC = state.player.tileX + state.player.pixelOffsetX / 32;
          const pyC = state.player.tileY + state.player.pixelOffsetY / 32;
          try {
            const {
              boss: updatedCaptain,
              combatEvents: captainEvents,
              spawnMonsters: summoned,
            } = tickShipCaptainBoss(
              state.shipCaptainBoss,
              pxC,
              pyC,
              clampedDelta,
            );
            state.shipCaptainBoss = updatedCaptain;
            // Handle summoned sailors (phase 2)
            if (summoned && summoned.length > 0) {
              for (const sm of summoned) {
                const newSailor = {
                  id: `summoned_${Date.now()}_${Math.random()}`,
                  x: sm.x,
                  y: sm.y,
                  hp: 140,
                  maxHp: 140,
                  state: "chasing" as const,
                  facingDirection: "down" as const,
                  animFrame: 0,
                  animTimer: 0,
                  lastAttackTime: 0,
                  type: sm.type,
                  isRare: false,
                  rareTint: false,
                  ambushHidden: false,
                  poisonTicksRemaining: 0,
                  poisonDamagePerTick: 0,
                  aggroIndicatorTimer: 500,
                  knockbackOffsetX: 0,
                  knockbackOffsetY: 0,
                  knockbackVelX: 0,
                  knockbackVelY: 0,
                  knockbackTimer: 0,
                  abilityTimer: 0,
                  abilityState: "ready" as const,
                };
                state.monsters = [...state.monsters, newSailor];
              }
            }
            for (const evt of captainEvents) {
              if (evt.type === "player-hit" && state.pvpImmunityTimer <= 0) {
                const dmg = state.player.shieldActive
                  ? Math.max(
                      1,
                      Math.floor(evt.damage * WARRIOR_SHIELD_DMG_REDUCTION),
                    )
                  : evt.damage;
                state.player.hp = Math.max(0, state.player.hp - dmg);
                state.recentCombatEvents.push({ ...evt, damage: dmg });
                if (state.player.hp <= 0) {
                  state.player.deathRecap = {
                    killerName: "The Ship Captain",
                    damageTaken: state.player.sessionDamageTaken + dmg,
                    timeInZone: Date.now() - state.player.zoneEnterTime,
                  };
                }
                triggerPlayerHurt(state, dmg);
                onHpChanged?.(state.player.hp, state.player.mp);
              }
            }
          } catch (err) {
            console.warn(
              "[PixelQuest] Ship Captain tick error (non-fatal):",
              err,
            );
          }
        }
      } else if (state.currentZoneId !== "cursed_galleon") {
        // Clear ship captain when not in galleon zone
        state.shipCaptainBoss = null;
      }

      // Detect attack trigger rising edge before tick consumes it
      const attackWasPending = state.input.attackPending;

      // ── Handle attack hit (block during transitions and for guests) ──
      if (
        attackWasPending &&
        !prevAttackPendingRef.current &&
        !state.isDead &&
        !isTransitioning &&
        !state.player.isGuest // guests cannot attack
      ) {
        const playerX = state.player.tileX;
        const playerY = state.player.tileY;
        const cls = state.player.selectedClass;

        const range = cls === "warrior" ? WARRIOR_RANGE : MAGE_RANGE;
        const mpRequired =
          cls === "warrior" ? WARRIOR_ATTACK_MP : ARCANE_BOLT_MANA_COST;
        const canAttack = state.player.mp >= mpRequired;

        if (!canAttack) {
          // Trigger no-mana feedback shake
          state.noManaShakeSpell = cls === "warrior" ? "attack" : "arcane";
          state.noManaNotifyExpiry = Date.now() + 1500;
        } else {
          // Deduct mana and record cast time
          state.player.mp = Math.max(0, state.player.mp - mpRequired);
          state.player.lastCastTime = Date.now();
          onHpChanged?.(state.player.hp, state.player.mp);

          try {
            playAttack(cls);
          } catch {
            /* audio non-fatal */
          }

          // ── PVP attack: targeted player in PVP zone ──
          let pvpHandled = false;
          const pvpTarget = state.targetedPlayerUsername;
          if (pvpTarget && PVP_ZONES.has(state.currentZoneId)) {
            const targetPlayer = state.otherPlayers.find(
              (p) => p.username === pvpTarget,
            );
            if (targetPlayer) {
              const targetLevel = targetPlayer.level ?? 1;
              const myLevel = state.player.level;
              if (myLevel - targetLevel > 10) {
                // Level gap protection
                state.pvpKillNotification = {
                  text: "Target is too low level",
                  isKiller: false,
                  expiresAt: Date.now() + 2500,
                };
              } else {
                const pvpDamage =
                  cls === "warrior" ? WARRIOR_DAMAGE : MAGE_DAMAGE;
                const targetHp = targetPlayer.hp ?? 100;
                const newHp = Math.max(0, targetHp - pvpDamage);
                const targetIdx = state.otherPlayers.findIndex(
                  (p) => p.username === pvpTarget,
                );
                if (targetIdx >= 0) {
                  state.otherPlayers = state.otherPlayers.map((p, i) =>
                    i === targetIdx ? { ...p, hp: newHp } : p,
                  );
                }
                // Floating damage number via combat events
                state.recentCombatEvents.push({
                  type: "monster-hit",
                  damage: pvpDamage,
                  timestamp: Date.now(),
                });
                if (newHp <= 0) {
                  const xpLost = Math.floor(xpForLevel(targetLevel) * 0.25);
                  const goldDropped = Math.max(
                    5,
                    Math.floor(5 + Math.random() * 20 + targetLevel * 2),
                  );
                  state.pvpGoldDrops.push({
                    id: `pvp_gold_${Date.now()}`,
                    x: Math.round(targetPlayer.x),
                    y: Math.round(targetPlayer.y),
                    amount: goldDropped,
                    spawnTime: Date.now(),
                    fadeProgress: 0,
                  });
                  state.pvpKillNotification = {
                    text: `You defeated ${targetPlayer.username}! +${xpLost} XP`,
                    isKiller: true,
                    expiresAt: Date.now() + 4000,
                  };
                  state.player.xp += xpLost;
                  const newLevel = levelFromXp(state.player.xp);
                  if (newLevel > state.player.level) {
                    state.player.level = newLevel;
                    try {
                      playLevelUp();
                    } catch {
                      /* non-fatal */
                    }
                  }
                  onXpChanged?.(state.player.xp, state.player.level);
                  state.targetedPlayerUsername = null;
                }
              }
              pvpHandled = true;
              onAttackTriggered?.();
            }
          }

          if (!pvpHandled) {
            let nearestId: string | null = null;
            let nearestDist = Number.POSITIVE_INFINITY;

            for (const m of state.monsters) {
              if (m.state === "dead") continue;
              const dx = m.x - playerX;
              const dy = m.y - playerY;
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d <= range && d < nearestDist) {
                nearestDist = d;
                nearestId = m.id;
              }
            }

            // ── Check boss as attack target (Stone Warden) ──
            let hitBoss = false;
            if (
              state.boss &&
              state.boss.phase === "active" &&
              state.currentZoneId === "boss_chamber"
            ) {
              const bx = state.boss.x;
              const by = state.boss.y;
              const bdx = bx - playerX;
              const bdy = by - playerY;
              const bDist = Math.sqrt(bdx * bdx + bdy * bdy);
              if (
                bDist <= range + 1 &&
                (nearestId === null || bDist < nearestDist)
              ) {
                const damage = cls === "warrior" ? WARRIOR_DAMAGE : MAGE_DAMAGE;
                const {
                  boss: updatedBoss,
                  event: bossEvent,
                  died,
                  xpReward,
                  goldDrop,
                } = damageBoss(state.boss, damage);
                state.boss = updatedBoss;
                hitBoss = true;
                if (bossEvent) {
                  state.recentCombatEvents.push(bossEvent);
                }
                if (died) {
                  state.player.xp += xpReward;
                  state.player.coins += goldDrop;
                  state.lootDrops.push({
                    id: `loot_boss_${Date.now()}`,
                    x: state.boss.x,
                    y: state.boss.y + 1,
                    zone: "boss_chamber",
                    item: {
                      id: `item_boss_${Date.now()}`,
                      itemType: "rare_weapon",
                      amount: 1,
                    },
                    spawnTime: Date.now(),
                  });
                  const newLevel = levelFromXp(state.player.xp);
                  if (newLevel > state.player.level) {
                    state.player.level = newLevel;
                    try {
                      playLevelUp();
                    } catch {
                      /* audio non-fatal */
                    }
                  }
                  onXpChanged?.(state.player.xp, state.player.level);
                  try {
                    playMonsterDeath();
                  } catch {
                    /* audio non-fatal */
                  }
                }
              }
            }

            // ── Check Ship Captain as attack target ──
            if (
              !hitBoss &&
              state.shipCaptainBoss &&
              state.shipCaptainBoss.phase === "active" &&
              state.currentZoneId === "cursed_galleon"
            ) {
              const cx = state.shipCaptainBoss.x;
              const cy = state.shipCaptainBoss.y;
              const cdx = cx - playerX;
              const cdy = cy - playerY;
              const cDist = Math.sqrt(cdx * cdx + cdy * cdy);
              if (cDist <= range + 1) {
                const damage = cls === "warrior" ? WARRIOR_DAMAGE : MAGE_DAMAGE;
                const {
                  boss: updatedCaptain,
                  event: captainEvent,
                  died: captainDied,
                  xpReward: captainXp,
                  goldDrop: captainGold,
                } = damageShipCaptainBoss(state.shipCaptainBoss, damage);
                state.shipCaptainBoss = updatedCaptain;
                hitBoss = true;
                if (captainEvent) {
                  state.recentCombatEvents.push(captainEvent);
                }
                if (captainDied) {
                  state.player.xp += captainXp;
                  state.player.coins += captainGold;
                  // Guaranteed rare item drop
                  state.lootDrops.push({
                    id: `loot_captain_${Date.now()}`,
                    x: state.shipCaptainBoss.x,
                    y: state.shipCaptainBoss.y + 1,
                    zone: "cursed_galleon",
                    item: {
                      id: `item_captain_${Date.now()}`,
                      itemType: "rare_weapon",
                      amount: 1,
                    },
                    spawnTime: Date.now(),
                  });
                  const newLevel = levelFromXp(state.player.xp);
                  if (newLevel > state.player.level) {
                    state.player.level = newLevel;
                    try {
                      playLevelUp();
                    } catch {
                      /* audio non-fatal */
                    }
                  }
                  onXpChanged?.(state.player.xp, state.player.level);
                  try {
                    playMonsterDeath();
                  } catch {
                    /* audio non-fatal */
                  }
                }
              }
            }

            if (!hitBoss && nearestId !== null) {
              // Track targeted monster for targeting circle rendering
              state.targetedMonsterId = nearestId;
              const now2 = Date.now();
              let damage = cls === "warrior" ? WARRIOR_DAMAGE : MAGE_DAMAGE;

              // ── Berserker passive: +20% damage when HP < 30% (Warrior L15) ──
              if (cls === "warrior" && state.berserkerUnlocked) {
                const hpRatio = state.player.hp / state.player.maxHp;
                if (hpRatio < 0.3) {
                  damage = Math.floor(damage * 1.2);
                }
              }

              // ── Warrior combo counter ──
              if (cls === "warrior") {
                const timeSinceLastHit = now2 - state.player.comboTimer;
                if (
                  state.player.comboTarget === nearestId &&
                  timeSinceLastHit < 2500
                ) {
                  state.player.comboCount += 1;
                } else {
                  state.player.comboCount = 1;
                  state.player.comboTarget = nearestId;
                }
                state.player.comboTimer = now2;

                // Dispatch combo display event
                if (state.player.comboCount >= 2) {
                  window.dispatchEvent(
                    new CustomEvent("warrior_combo", {
                      detail: {
                        count: state.player.comboCount,
                        x: state.player.tileX,
                        y: state.player.tileY,
                      },
                    }),
                  );
                }

                // Combo damage bonuses
                if (state.player.comboCount >= 7) {
                  damage = Math.floor(damage * 1.5);
                  state.screenShakeTimer = Math.max(
                    state.screenShakeTimer,
                    200,
                  );
                  state.rampageText = "RAMPAGE!";
                  state.rampageTextExpiry = now2 + 2000;
                } else if (state.player.comboCount >= 5) {
                  damage = Math.floor(damage * 1.3);
                  state.player.comboBonusActive = true;
                } else if (state.player.comboCount >= 3) {
                  damage = Math.floor(damage * 1.15);
                }

                // Legacy x5 bonus flag
                if (
                  state.player.comboBonusActive &&
                  state.player.comboCount < 5
                ) {
                  state.player.comboBonusActive = false;
                }
              }

              // ── Critical hit ──
              const weaponType = state.player.weaponType ?? "sword";
              const extraCrit =
                cls === "warrior" && weaponType === "sword"
                  ? WARRIOR_SWORD_CRIT_BONUS
                  : cls === "mage"
                    ? MAGE_ARCANE_CRIT_BONUS
                    : 0;
              const { damage: critDamage, isCrit } = calcDamageWithCrit(
                damage,
                extraCrit,
              );
              damage = critDamage;
              if (isCrit) {
                try {
                  playCriticalHit();
                } catch {
                  /* non-fatal */
                }
                window.dispatchEvent(
                  new CustomEvent("critical_hit", {
                    detail: {
                      damage,
                      x: state.player.tileX,
                      y: state.player.tileY,
                      monsterId: nearestId,
                    },
                  }),
                );
              }

              const {
                monsters: updatedMonsters,
                event,
                parried,
              } = damageMonster(state.monsters, nearestId, damage);
              state.monsters = updatedMonsters;

              // If parried, show feedback
              if (parried) {
                window.dispatchEvent(
                  new CustomEvent("attack_parried", {
                    detail: { monsterId: nearestId },
                  }),
                );
              }

              if (event) {
                // ── Hit stop + knockback on successful monster hit ──
                if (
                  event.type === "monster-hit" ||
                  event.type === "monster-died"
                ) {
                  state.hitStopTimer = Math.max(
                    state.hitStopTimer,
                    HIT_STOP_DURATION_MS,
                  );
                  // Knockback: push non-boss monsters back in hit direction
                  const hitM = state.monsters.find((m) => m.id === nearestId);
                  const isBossMonster =
                    hitM?.type === "stone_warden" ||
                    hitM?.type === "ship_captain";
                  if (hitM && !isBossMonster) {
                    const dx2 = hitM.x - playerX;
                    const dy2 = hitM.y - playerY;
                    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
                    const knx = dx2 / dist2;
                    const kny = dy2 / dist2;
                    hitM.knockbackOffsetX = knx * KNOCKBACK_TILES;
                    hitM.knockbackOffsetY = kny * KNOCKBACK_TILES;
                    hitM.knockbackVelX = knx * KNOCKBACK_TILES;
                    hitM.knockbackVelY = kny * KNOCKBACK_TILES;
                    hitM.knockbackTimer = KNOCKBACK_RETURN_MS;
                  }
                  // ── Combat log: hit ──
                  const hitTarget = state.monsters.find(
                    (m) => m.id === nearestId,
                  );
                  const targetName = hitTarget
                    ? hitTarget.type
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())
                    : "Enemy";
                  if (isCrit) {
                    addCombatLogEntry(
                      state,
                      `Critical hit! You hit ${targetName} for ${damage} damage`,
                    );
                  } else {
                    addCombatLogEntry(
                      state,
                      `You hit ${targetName} for ${damage} damage`,
                    );
                  }
                  // ── Floating damage number ──
                  const hitM2 = state.monsters.find((m) => m.id === nearestId);
                  if (hitM2) {
                    onDamageDealt?.(
                      hitM2.x,
                      hitM2.y,
                      damage,
                      isCrit,
                      cls === "warrior" ? "physical" : "arcane",
                    );
                  }
                }

                state.recentCombatEvents.push(event);

                if (event.type === "monster-died") {
                  const deadMonster = updatedMonsters.find(
                    (m) => m.id === nearestId,
                  );
                  const baseXpGain = deadMonster
                    ? getMonsterXp(deadMonster.type, deadMonster.isRare)
                    : 25;

                  // ── Invasion XP multiplier (2x during Monster Invasion) ──
                  const isInvasionBonus = !!(
                    deadMonster?.isInvasionMonster &&
                    state.activeWorldEvent?.type === "monster_invasion"
                  );
                  const invasionMult = isInvasionBonus
                    ? INVASION_XP_MULTIPLIER
                    : 1;

                  // ── Bounty Target reward: elite monster death grants all-player bonus ──
                  if (deadMonster?.isElite) {
                    state.player.xp += 200;
                    state.player.coins += 50;
                    onEventAnnounce?.(
                      "Elite defeated! Rewards granted to all!",
                    );
                    // Clear event
                    if (state.activeWorldEvent?.type === "bounty_target") {
                      state.activeWorldEvent = undefined;
                    }
                  }

                  // ── First kill bonus: x2 XP on session's first kill ──
                  const isFirstKill = hasFirstKillBonusRef.current;
                  const xpGain = Math.floor(
                    (isFirstKill ? baseXpGain * 2 : baseXpGain) * invasionMult,
                  );
                  if (isFirstKill) {
                    hasFirstKillBonusRef.current = false;
                    window.dispatchEvent(
                      new CustomEvent("firstkill_bonus_text", {
                        detail: {
                          x: deadMonster?.x ?? state.player.tileX,
                          y: deadMonster?.y ?? state.player.tileY,
                          xp: xpGain,
                        },
                      }),
                    );
                  }

                  state.player.xp += xpGain;
                  state.player.kills += 1;
                  // ── Combat log: XP gain ──
                  addCombatLogEntry(state, `You gained ${xpGain} XP`);

                  // ── Floating XP number dispatch ──
                  if (deadMonster) {
                    window.dispatchEvent(
                      new CustomEvent("combat_damage_number", {
                        detail: {
                          damage: xpGain,
                          isCrit: false,
                          spellType: "heal", // green color in CombatOverlay
                          tileX: deadMonster.x,
                          tileY: deadMonster.y - 0.5,
                          cameraX: 0, // GameCanvas will use its own camera
                          cameraY: 0,
                          isXp: true,
                          text: `+${xpGain} XP`,
                        },
                      }),
                    );
                  }

                  // ── Kill streak tracking ──
                  const killNow = Date.now();
                  recentKillTimestampsRef.current.push(killNow);
                  recentKillTimestampsRef.current =
                    recentKillTimestampsRef.current.filter(
                      (t) => killNow - t <= 5000,
                    );
                  const streakCount = recentKillTimestampsRef.current.length;
                  if (streakCount === 3 || streakCount === 5) {
                    onKillStreak?.(streakCount);
                  }

                  // ── Level up with stat preview callback ──
                  const oldLevel = state.player.level;
                  const newLevel = levelFromXp(state.player.xp);
                  if (newLevel > oldLevel) {
                    const oldHp = state.player.maxHp;
                    const oldMp = state.player.maxMp;
                    const baseAtk =
                      cls === "warrior" ? WARRIOR_DAMAGE : MAGE_DAMAGE;
                    const oldAtk = Math.ceil(baseAtk * 1.05 ** (oldLevel - 1));
                    let newMaxHp = oldHp;
                    let newMaxMp = oldMp;
                    for (let lv = oldLevel + 1; lv <= newLevel; lv++) {
                      if (cls === "warrior") {
                        newMaxHp = Math.ceil(newMaxHp * 1.1);
                        newMaxMp = Math.ceil(newMaxMp * 1.02);
                      } else {
                        newMaxHp = Math.ceil(newMaxHp * 1.02);
                        newMaxMp = Math.ceil(newMaxMp * 1.1);
                      }
                    }
                    const newAtk = Math.ceil(baseAtk * 1.05 ** (newLevel - 1));
                    state.player.level = newLevel;
                    state.player.maxHp = newMaxHp;
                    state.player.hp = Math.min(state.player.hp, newMaxHp);
                    state.player.maxMp = newMaxMp;
                    state.player.mp = Math.min(state.player.mp, newMaxMp);
                    onLevelUp?.(
                      { hp: oldHp, mp: oldMp, atk: oldAtk },
                      { hp: newMaxHp, mp: newMaxMp, atk: newAtk },
                      newLevel,
                    );
                    // Dispatch level-up banner event for CombatOverlay
                    window.dispatchEvent(new CustomEvent("player_level_up"));
                    try {
                      playLevelUp();
                    } catch {
                      /* audio non-fatal */
                    }
                    // ── Milestone rewards ──
                    checkMilestoneRewards(state, newLevel, cls);
                  }

                  try {
                    playMonsterDeath();
                  } catch {
                    /* audio non-fatal */
                  }

                  if (deadMonster) {
                    const drops = generateLootDrop(
                      deadMonster,
                      state.currentZoneId,
                    );
                    if (drops.length > 0) state.lootDrops.push(...drops);
                  }

                  onXpChanged?.(state.player.xp, state.player.level);
                  onMonsterKilled?.();

                  // ── Quest progress: kill_monsters ──
                  if (
                    state.activeQuest &&
                    !state.activeQuest.completed &&
                    state.activeQuest.objectiveType === "kill_monsters"
                  ) {
                    state.activeQuest.currentCount += 1;
                    if (
                      state.activeQuest.currentCount >=
                      state.activeQuest.objectiveCount
                    ) {
                      // Complete quest
                      const q = state.activeQuest;
                      state.player.coins += q.reward.gold;
                      state.player.xp += q.reward.xp;
                      if (q.reward.potions > 0) {
                        state.potionCount = Math.min(
                          5,
                          state.potionCount + q.reward.potions,
                        );
                      }
                      state.completedQuestIds.push(q.id);
                      state.questCompletePopup = {
                        questId: q.id,
                        title: q.title,
                        reward: q.reward,
                        expiresAt: Date.now() + 3000,
                      };
                      state.activeQuest = null;
                      onXpChanged?.(state.player.xp, state.player.level);
                    }
                  }

                  // First kill achievement
                  if (state.player.kills === 1) {
                    unlockAchievement(state, "first_blood");
                    if (state.achievementPopup) {
                      onAchievementUnlocked?.(
                        state.achievementPopup.id,
                        state.achievementPopup.title,
                      );
                    }
                  }
                  // 100 kills achievement
                  if (state.player.kills === 100) {
                    unlockAchievement(state, "monster_hunter_ach");
                    if (state.achievementPopup) {
                      onAchievementUnlocked?.(
                        state.achievementPopup.id,
                        state.achievementPopup.title,
                      );
                    }
                  }
                }
              }
            }
          } // end if (!pvpHandled) — monster/boss attack block

          // ── Trigger arcane bolt visual animation (mage primary) ──
          if (cls === "mage") {
            state.player.attackActive = true;
            state.player.attackTimer = MAGE_SPELL_VISUAL_DURATION_MS;
            state.player.attackFacing = state.player.lastFacing;
            state.player.activeSpellType = "arcane";
            // Subtle spell cast camera shake (100ms, shorter than hurt shake)
            state.screenShakeTimer = Math.max(state.screenShakeTimer, 100);
          }

          onAttackTriggered?.();
        }
      }
      prevAttackPendingRef.current = attackWasPending;

      // ── Handle Frost Nova (mage AoE, 20 MP, 6s CD) ──
      if (
        state.input.frostNovaPending &&
        !state.isDead &&
        !isTransitioning &&
        !state.player.isGuest
      ) {
        state.input.frostNovaPending = false;
        if (
          state.player.mp < FROST_NOVA_MANA_COST ||
          state.frostNovaCooldown > 0
        ) {
          if (state.player.mp < FROST_NOVA_MANA_COST) {
            state.noManaShakeSpell = "frost";
            state.noManaNotifyExpiry = Date.now() + 1500;
          }
        } else {
          state.player.mp = Math.max(0, state.player.mp - FROST_NOVA_MANA_COST);
          state.player.lastCastTime = Date.now();
          state.frostNovaCooldown = FROST_NOVA_COOLDOWN_MS;
          onHpChanged?.(state.player.hp, state.player.mp);
          const px = state.player.tileX;
          const py = state.player.tileY;
          let { monsters } = state;
          let frostHitCount = 0;
          // Collision check throttle: skip if checked < 100ms ago
          const nowHit = Date.now();
          if (nowHit - lastSpellHitCheckRef.current >= 100) {
            lastSpellHitCheckRef.current = nowHit;
            // Spatial filter: only check monsters within 5 tile radius
            for (const m of [...monsters]) {
              if (m.state === "dead") continue;
              const dx = m.x - px;
              const dy = m.y - py;
              const d2 = Math.sqrt(dx * dx + dy * dy);
              if (d2 > 5) continue; // skip outside 5-tile radius
              if (d2 <= FROST_NOVA_RADIUS) {
                frostHitCount++;
                const { monsters: updated, event } = damageMonster(
                  monsters,
                  m.id,
                  25,
                );
                monsters = updated;
                if (event) {
                  state.recentCombatEvents.push(event);
                  if (event.type === "monster-died") {
                    const dead = updated.find((mo) => mo.id === m.id);
                    state.player.xp += dead ? getMonsterXp(dead.type) : 20;
                    state.player.kills += 1;
                    const lvl = levelFromXp(state.player.xp);
                    if (lvl > state.player.level) {
                      state.player.level = lvl;
                      try {
                        playLevelUp();
                      } catch {
                        /* non-fatal */
                      }
                    }
                    if (dead) {
                      const drops = generateLootDrop(dead, state.currentZoneId);
                      if (drops.length > 0) state.lootDrops.push(...drops);
                    }
                    onXpChanged?.(state.player.xp, state.player.level);
                    onMonsterKilled?.();
                  } else {
                    // hit but not dead — show damage number
                    onDamageDealt?.(m.x, m.y, 25, false, "frost");
                  }
                }
              }
            }
          }
          state.monsters = monsters;
          // ── Combat log: Frost Nova ──
          if (frostHitCount > 0) {
            addCombatLogEntry(
              state,
              `Frost Nova hit ${frostHitCount} enem${frostHitCount === 1 ? "y" : "ies"}`,
            );
          }
          // ── Trigger frost nova visual animation ──
          state.player.attackActive = true;
          state.player.attackTimer = MAGE_SPELL_VISUAL_DURATION_MS;
          state.player.attackFacing = state.player.lastFacing;
          state.player.activeSpellType = "frost";
          state.screenShakeTimer = Math.max(state.screenShakeTimer, 100);
          try {
            playAttack("mage");
          } catch {
            /* non-fatal */
          }
          onAttackTriggered?.();
        }
      }

      // ── Handle Shadow Lance (mage pierce, 30 MP, 10s CD) ──
      if (
        state.input.shadowLancePending &&
        !state.isDead &&
        !isTransitioning &&
        !state.player.isGuest
      ) {
        state.input.shadowLancePending = false;
        if (
          state.player.mp < SHADOW_LANCE_MANA_COST ||
          state.shadowLanceCooldown > 0
        ) {
          if (state.player.mp < SHADOW_LANCE_MANA_COST) {
            state.noManaShakeSpell = "shadow";
            state.noManaNotifyExpiry = Date.now() + 1500;
          }
        } else {
          state.player.mp = Math.max(
            0,
            state.player.mp - SHADOW_LANCE_MANA_COST,
          );
          state.player.lastCastTime = Date.now();
          state.shadowLanceCooldown = SHADOW_LANCE_COOLDOWN_MS;
          onHpChanged?.(state.player.hp, state.player.mp);
          const px = state.player.tileX;
          const py = state.player.tileY;
          const facing = state.player.lastFacing;
          const dfx = facing === "right" ? 1 : facing === "left" ? -1 : 0;
          const dfy = facing === "down" ? 1 : facing === "up" ? -1 : 0;
          let { monsters } = state;
          let pierced = 0;
          // Spatial filter: only consider monsters within 5 tile radius in lance direction
          const inLine = monsters
            .filter((m) => {
              if (m.state === "dead") return false;
              const mdx = m.x - px;
              const mdy = m.y - py;
              const dot = mdx * dfx + mdy * dfy;
              const perp = Math.abs(mdx * dfy - mdy * dfx);
              // dot <= 5 for spatial 5-tile cutoff (was 6)
              return dot > 0 && dot <= 5 && perp < 1.2;
            })
            .sort((a, b) => {
              const da = (a.x - px) * dfx + (a.y - py) * dfy;
              const db = (b.x - px) * dfx + (b.y - py) * dfy;
              return da - db;
            });
          for (const m of inLine) {
            if (pierced >= 3) break;
            const { monsters: updated, event } = damageMonster(
              monsters,
              m.id,
              40,
            );
            monsters = updated;
            pierced++;
            if (event) {
              state.recentCombatEvents.push(event);
              if (event.type === "monster-died") {
                const dead = updated.find((mo) => mo.id === m.id);
                state.player.xp += dead ? getMonsterXp(dead.type) : 30;
                state.player.kills += 1;
                const lvl = levelFromXp(state.player.xp);
                if (lvl > state.player.level) {
                  state.player.level = lvl;
                  try {
                    playLevelUp();
                  } catch {
                    /* non-fatal */
                  }
                }
                if (dead) {
                  const drops = generateLootDrop(dead, state.currentZoneId);
                  if (drops.length > 0) state.lootDrops.push(...drops);
                }
                onXpChanged?.(state.player.xp, state.player.level);
                onMonsterKilled?.();
              } else {
                onDamageDealt?.(m.x, m.y, 40, false, "shadow");
              }
            }
          }
          state.monsters = monsters;
          // ── Combat log: Shadow Lance ──
          if (pierced > 0) {
            addCombatLogEntry(
              state,
              `Shadow Lance pierced ${pierced} enem${pierced === 1 ? "y" : "ies"}`,
            );
          }
          // ── Trigger shadow lance visual animation ──
          state.player.attackActive = true;
          state.player.attackTimer = SHADOW_LANCE_VISUAL_DURATION_MS;
          state.player.attackFacing = state.player.lastFacing;
          state.player.activeSpellType = "shadow";
          state.screenShakeTimer = Math.max(state.screenShakeTimer, 100);
          try {
            playAttack("mage");
          } catch {
            /* non-fatal */
          }
          onAttackTriggered?.();
        }
      }

      // ── Handle Flame Ring (mage AoE ring, 25 MP, 8s CD) ──
      if (
        state.input.flameRingPending &&
        !state.isDead &&
        !isTransitioning &&
        !state.player.isGuest
      ) {
        state.input.flameRingPending = false;
        if (
          state.player.mp < FLAME_RING_MANA_COST ||
          state.flameRingCooldown > 0
        ) {
          if (state.player.mp < FLAME_RING_MANA_COST) {
            state.noManaShakeSpell = "flame";
            state.noManaNotifyExpiry = Date.now() + 1500;
          }
        } else {
          state.player.mp = Math.max(0, state.player.mp - FLAME_RING_MANA_COST);
          state.player.lastCastTime = Date.now();
          state.flameRingCooldown = FLAME_RING_COOLDOWN_MS;
          onHpChanged?.(state.player.hp, state.player.mp);
          const px = state.player.tileX;
          const py = state.player.tileY;
          let { monsters } = state;
          let flameHitCount = 0;
          // Collision check throttle + spatial filter (5-tile radius)
          const nowFlame = Date.now();
          if (nowFlame - lastSpellHitCheckRef.current >= 100) {
            lastSpellHitCheckRef.current = nowFlame;
            for (const m of [...monsters]) {
              if (m.state === "dead") continue;
              const dx = m.x - px;
              const dy = m.y - py;
              const d2 = Math.sqrt(dx * dx + dy * dy);
              if (d2 > 5) continue; // spatial cutoff: 5 tiles
              if (d2 <= FLAME_RING_RADIUS) {
                flameHitCount++;
                const { monsters: updated, event } = damageMonster(
                  monsters,
                  m.id,
                  FLAME_RING_DAMAGE,
                );
                monsters = updated;
                if (event) {
                  state.recentCombatEvents.push(event);
                  if (event.type === "monster-died") {
                    const dead = updated.find((mo) => mo.id === m.id);
                    state.player.xp += dead ? getMonsterXp(dead.type) : 25;
                    state.player.kills += 1;
                    const lvl = levelFromXp(state.player.xp);
                    if (lvl > state.player.level) {
                      state.player.level = lvl;
                      try {
                        playLevelUp();
                      } catch {
                        /* non-fatal */
                      }
                    }
                    if (dead) {
                      const drops = generateLootDrop(dead, state.currentZoneId);
                      if (drops.length > 0) state.lootDrops.push(...drops);
                    }
                    onXpChanged?.(state.player.xp, state.player.level);
                    onMonsterKilled?.();
                  } else {
                    onDamageDealt?.(
                      m.x,
                      m.y,
                      FLAME_RING_DAMAGE,
                      false,
                      "flame",
                    );
                  }
                }
              }
            }
          }
          state.monsters = monsters;
          // ── Combat log: Flame Ring ──
          if (flameHitCount > 0) {
            addCombatLogEntry(
              state,
              `Flame Ring hit ${flameHitCount} enem${flameHitCount === 1 ? "y" : "ies"}`,
            );
          }
          // ── Trigger flame ring visual animation ──
          state.player.attackActive = true;
          state.player.attackTimer = MAGE_SPELL_VISUAL_DURATION_MS;
          state.player.attackFacing = state.player.lastFacing;
          state.player.activeSpellType = "flame";
          state.screenShakeTimer = Math.max(state.screenShakeTimer, 100);
          try {
            playAttack("mage");
          } catch {
            /* non-fatal */
          }
          onAttackTriggered?.();
        }
      }

      if (
        state.player.selectedClass === "warrior" &&
        state.player.comboCount > 0 &&
        state.player.comboTimer > 0 &&
        Date.now() - state.player.comboTimer >= 2500
      ) {
        state.player.comboCount = 0;
        state.player.comboTarget = null;
        state.player.comboBonusActive = false;
      }

      // ── Tick dodge cooldown + invincibility ──
      if (state.player.dodgeCooldownTimer > 0) {
        state.player.dodgeCooldownTimer = Math.max(
          0,
          state.player.dodgeCooldownTimer - clampedDelta,
        );
      }
      if (state.player.dodgeInvincibilityTimer > 0) {
        state.player.dodgeInvincibilityTimer = Math.max(
          0,
          state.player.dodgeInvincibilityTimer - clampedDelta,
        );
        state.player.isInvincible = state.player.dodgeInvincibilityTimer > 0;
      } else {
        state.player.isInvincible = false;
      }

      // ── Tick player stun ──
      if (state.player.stunTimer > 0) {
        state.player.stunTimer = Math.max(
          0,
          state.player.stunTimer - clampedDelta,
        );
      }

      // ── Process dodge (double-tap) ──
      if (
        state.input.dodgePending !== null &&
        !state.isDead &&
        !isTransitioning &&
        !state.player.isGuest &&
        state.player.dodgeCooldownTimer <= 0 &&
        state.player.mp >= DODGE_MP_COST &&
        state.player.stunTimer <= 0
      ) {
        const dodgeDir = state.input.dodgePending;
        state.input.dodgePending = null;
        const { dx, dy } = dodgeDirToOffset(dodgeDir);
        // Find farthest valid tile (up to DODGE_DISTANCE_TILES)
        let destX = state.player.tileX;
        let destY = state.player.tileY;
        for (let step = 1; step <= DODGE_DISTANCE_TILES; step++) {
          const nx = state.player.tileX + dx * step;
          const ny = state.player.tileY + dy * step;
          if (isWalkable(state.world, nx, ny)) {
            destX = nx;
            destY = ny;
          } else {
            break; // stop at wall
          }
        }
        // Consume MP and set dodge state
        state.player.mp = Math.max(0, state.player.mp - DODGE_MP_COST);
        state.player.dodgeCooldownTimer = DODGE_COOLDOWN_MS;
        state.player.dodgeInvincibilityTimer = DODGE_INVULNERABILITY_MS;
        state.player.isInvincible = true;
        // Store afterimage ghost positions
        state.player.dodgeGhosts = [
          {
            x: state.player.tileX + state.player.pixelOffsetX / 32,
            y: state.player.tileY + state.player.pixelOffsetY / 32,
            alpha: 0.5,
          },
          { x: state.player.tileX, y: state.player.tileY, alpha: 0.25 },
        ];
        // Teleport to destination
        state.player.tileX = destX;
        state.player.tileY = destY;
        state.player.targetTileX = destX;
        state.player.targetTileY = destY;
        state.player.pixelOffsetX = 0;
        state.player.pixelOffsetY = 0;
        state.player.isMoving = false;
        state.player.animProgress = 1;
        // Clear tap-to-move
        state.input.tapMoveTarget = null;
        state.player.tapMovePath = null;
        onHpChanged?.(state.player.hp, state.player.mp);
        try {
          playDodge();
        } catch {
          /* non-fatal */
        }
      } else if (state.input.dodgePending !== null) {
        // Can't dodge — consume anyway to avoid stale pending
        state.input.dodgePending = null;
      }

      // ── Fade dodge ghosts ──
      if (state.player.dodgeGhosts && state.player.dodgeGhosts.length > 0) {
        for (const g of state.player.dodgeGhosts) {
          g.alpha = Math.max(0, g.alpha - clampedDelta / 300);
        }
        state.player.dodgeGhosts = state.player.dodgeGhosts.filter(
          (g) => g.alpha > 0,
        );
      }

      // ── Process monster special ability events ──
      // These were already pushed to combatEvents; handle them here from recentCombatEvents
      // Actually they are handled during the monster AI tick above. We handle the side-effects here.
      // Check poison clouds for player overlap and deal damage
      if (
        state.poisonClouds &&
        state.poisonClouds.length > 0 &&
        !state.isDead
      ) {
        const px = state.player.tileX + state.player.pixelOffsetX / 32;
        const py = state.player.tileY + state.player.pixelOffsetY / 32;
        for (const cloud of state.poisonClouds) {
          cloud.elapsed += clampedDelta;
          // Check if player is inside the 2x2 cloud area
          const inCloud =
            px >= cloud.x - 0.5 &&
            px <= cloud.x + 1.5 &&
            py >= cloud.y - 0.5 &&
            py <= cloud.y + 1.5;
          if (
            inCloud &&
            !state.player.isInvincible &&
            state.pvpImmunityTimer <= 0
          ) {
            const poisonDmg = cloud.damagePerSec * (clampedDelta / 1000);
            const dmgInt = Math.floor(poisonDmg);
            if (dmgInt > 0 || Math.random() < poisonDmg) {
              const actualDmg = Math.max(1, dmgInt);
              state.player.hp = Math.max(0, state.player.hp - actualDmg);
              triggerPlayerHurt(state, actualDmg);
              onHpChanged?.(state.player.hp, state.player.mp);
            }
          }
        }
        // Remove expired clouds
        state.poisonClouds = state.poisonClouds.filter(
          (c) => c.elapsed < c.durationMs,
        );
      }

      // ── Tick environmental hazard: poison pools (Cursed Swamp) ──
      if (
        state.currentZoneId === "cursed_swamp" &&
        state.hazards.length > 0 &&
        !state.isDead
      ) {
        const px = state.player.tileX + state.player.pixelOffsetX / 32;
        const py = state.player.tileY + state.player.pixelOffsetY / 32;
        for (const hz of state.hazards) {
          if (hz.type !== "poison_pool" || !hz.active) continue;
          const dist = Math.sqrt((px - hz.x) ** 2 + (py - hz.y) ** 2);
          if (
            dist <= hz.radius + 0.5 &&
            !state.player.isInvincible &&
            state.pvpImmunityTimer <= 0
          ) {
            const dmgPerSec = 2;
            const dmgFloat = dmgPerSec * (clampedDelta / 1000);
            const actualDmg =
              Math.floor(dmgFloat) + (Math.random() < dmgFloat % 1 ? 1 : 0);
            if (actualDmg > 0) {
              state.player.hp = Math.max(0, state.player.hp - actualDmg);
              triggerPlayerHurt(state, actualDmg);
              onHpChanged?.(state.player.hp, state.player.mp);
            }
          }
        }
      }

      // ── Tick environmental hazard: falling rocks (Cave Interior) ──
      if (state.currentZoneId === "cave_interior" && !state.isDead) {
        // Accumulate rock spawn timer using module-level refs
        const stateExt = state as unknown as {
          rockSpawnAcc?: number;
          rockNextTrigger?: number;
        };
        stateExt.rockSpawnAcc = (stateExt.rockSpawnAcc ?? 0) + clampedDelta;
        const ROCK_INTERVAL_MIN = 10000;
        const ROCK_INTERVAL_MAX = 20000;
        if (!stateExt.rockNextTrigger) {
          stateExt.rockNextTrigger =
            ROCK_INTERVAL_MIN +
            Math.random() * (ROCK_INTERVAL_MAX - ROCK_INTERVAL_MIN);
        }
        if (
          (stateExt.rockSpawnAcc ?? 0) >=
          (stateExt.rockNextTrigger ?? ROCK_INTERVAL_MAX)
        ) {
          stateExt.rockSpawnAcc = 0;
          stateExt.rockNextTrigger =
            ROCK_INTERVAL_MIN +
            Math.random() * (ROCK_INTERVAL_MAX - ROCK_INTERVAL_MIN);
          // Pick a random walkable tile within 6 tiles of player, NOT the player's current tile
          const px2 = state.player.tileX;
          const py2 = state.player.tileY;
          let rockX = -1;
          let rockY = -1;
          for (let attempt = 0; attempt < 30; attempt++) {
            const dx2 = Math.floor((Math.random() - 0.5) * 12);
            const dy2 = Math.floor((Math.random() - 0.5) * 12);
            const nx = px2 + dx2;
            const ny = py2 + dy2;
            if (isWalkable(state.world, nx, ny) && (dx2 !== 0 || dy2 !== 0)) {
              rockX = nx;
              rockY = ny;
              break;
            }
          }
          if (rockX >= 0) {
            state.hazards.push({
              id: `rock_${Date.now()}_${Math.random()}`,
              x: rockX,
              y: rockY,
              type: "falling_rock",
              radius: 0.4,
              active: true,
              spawnTime: Date.now(),
              rockPhase: "shadow",
              rockStartTime: Date.now(),
            });
          }
        }
        // Tick existing falling rocks
        const nowRock = Date.now();
        for (const hz of state.hazards) {
          if (hz.type !== "falling_rock" || hz.rockPhase === "done") continue;
          const elapsed = nowRock - (hz.rockStartTime ?? nowRock);
          if (hz.rockPhase === "shadow" && elapsed >= 500) {
            hz.rockPhase = "falling";
            // Damage player if on this tile
            const px3 = state.player.tileX;
            const py3 = state.player.tileY;
            const dist3 = Math.sqrt((px3 - hz.x) ** 2 + (py3 - hz.y) ** 2);
            if (
              dist3 <= 0.6 &&
              !state.player.isInvincible &&
              state.pvpImmunityTimer <= 0
            ) {
              state.player.hp = Math.max(0, state.player.hp - 15);
              triggerPlayerHurt(state, 15);
              onHpChanged?.(state.player.hp, state.player.mp);
              window.dispatchEvent(
                new CustomEvent("player_hurt_direction", {
                  detail: { angle: Math.PI / 2 },
                }),
              );
            }
          } else if (hz.rockPhase === "falling" && elapsed >= 800) {
            hz.rockPhase = "done";
            hz.active = false;
          }
        }
        // Clean up done rocks
        state.hazards = state.hazards.filter(
          (hz) => hz.type !== "falling_rock" || hz.rockPhase !== "done",
        );
      }

      // ── Interact with objects when interact button pressed (dispatched as custom event) ──
      // (handled via window event listener below)

      // ── Check hidden room entry when landing on a new tile ──
      if (!state.isTransitioning && !state.isDead && !state.inHiddenRoom) {
        const hiddenKey = checkHiddenRoomEntry(state);
        if (hiddenKey) {
          window.dispatchEvent(new CustomEvent("hidden_room_flash"));
          enterHiddenRoom(state, hiddenKey);
        }
      }
      // ── Check hidden room exit ──
      if (!state.isTransitioning && !state.isDead && state.inHiddenRoom) {
        // Exit tile is at roomSpawnX+2, roomSpawnY (very edge of 4x4 room)
        const roomKey = state.currentHiddenRoomKey;
        if (roomKey) {
          const room = state.hiddenRooms[roomKey];
          if (room && state.player.tileX >= 4) {
            exitHiddenRoom(state);
          }
        }
      }

      // ── Expire rampage text ──
      if (state.rampageText && Date.now() > state.rampageTextExpiry) {
        state.rampageText = null;
      }

      // Track death/respawn transitions
      const wasDead = wasDeadRef.current;

      const justLanded = tickGameState(state, clampedDelta);

      // Detect death
      if (!wasDead && state.isDead) {
        onPlayerDied?.();
        onHpChanged?.(0, state.player.mp);
      }

      // Detect respawn (was dead, now alive) — grant PVP immunity
      if (wasDead && !state.isDead) {
        state.pvpImmunityTimer = 10000;
        onPlayerRespawned?.();
        onHpChanged?.(state.player.hp, state.player.mp);
      }

      wasDeadRef.current = state.isDead;

      // ── Sprint system ──
      // Track how long movement has been held; activate sprint after threshold.
      const isMovingNow =
        state.player.isMoving ||
        state.input.heldDirections.size > 0 ||
        (state.input.tapMoveTarget !== null &&
          state.input.tapMoveTarget !== undefined);
      if (isMovingNow && !state.isDead && !state.isTransitioning) {
        state.sprintHoldTimer += clampedDelta;
        const shouldSprint =
          state.sprintHoldTimer >= SPRINT_HOLD_THRESHOLD_MS &&
          state.player.mp > 0 &&
          !state.player.isGuest;
        if (shouldSprint && !state.sprintActive) {
          state.sprintActive = true;
        }
      } else {
        // Released movement — stop sprint, reset hold timer
        state.sprintHoldTimer = 0;
        state.sprintActive = false;
      }
      // Drain 1 mana/sec while sprinting
      if (state.sprintActive) {
        sprintManaAccRef.current += clampedDelta;
        if (sprintManaAccRef.current >= 100) {
          const drain =
            SPRINT_MANA_COST_PER_SEC * (sprintManaAccRef.current / 1000);
          state.player.mp = Math.max(0, state.player.mp - drain);
          sprintManaAccRef.current = 0;
          if (state.player.mp === 0) {
            state.sprintActive = false;
            state.sprintHoldTimer = 0;
          }
          onHpChanged?.(state.player.hp, state.player.mp);
        }
      } else {
        sprintManaAccRef.current = 0;
      }
      // Ghost trail accumulator: emit a ghost every GHOST_TRAIL_INTERVAL_MS
      if (state.sprintActive && state.player.isMoving) {
        ghostTrailAccRef.current += clampedDelta;
        if (ghostTrailAccRef.current >= GHOST_TRAIL_INTERVAL_MS) {
          ghostTrailAccRef.current = 0;
          // Store ghost position for rendering — GameCanvas reads state.ghostTrails
          const trails = (
            state as unknown as {
              ghostTrails?: Array<{
                x: number;
                y: number;
                px: number;
                py: number;
                alpha: number;
                age: number;
              }>;
            }
          ).ghostTrails;
          if (trails) {
            trails.push({
              x: state.player.tileX,
              y: state.player.tileY,
              px: state.player.pixelOffsetX,
              py: state.player.pixelOffsetY,
              alpha: 0.15,
              age: 0,
            });
            // Keep max 4 (FIFO)
            while (trails.length > 4) trails.shift();
          }
        }
      } else {
        ghostTrailAccRef.current = 0;
      }
      // Tick ghost trail alpha (fade out over 200ms)
      {
        const trails = (
          state as unknown as {
            ghostTrails?: Array<{
              x: number;
              y: number;
              px: number;
              py: number;
              alpha: number;
              age: number;
            }>;
          }
        ).ghostTrails;
        if (trails) {
          for (const t of trails) {
            t.age += clampedDelta;
            t.alpha = Math.max(0, 0.15 * (1 - t.age / 200));
          }
          // Remove fully faded trails
          const keep = trails.filter((t) => t.alpha > 0);
          trails.length = 0;
          trails.push(...keep);
        }
      }

      if (justLanded) {
        onTileLanded(state.player.tileX, state.player.tileY);
        // Surface-based footstep sound — read actual tile at landing position
        try {
          const tx = state.player.tileX;
          const ty = state.player.tileY;
          const tile = state.world.tiles[ty]?.[tx];
          let surface: "grass" | "stone" | "wood" | "sand" | "default" =
            "default";
          if (
            tile === TileType.WOOD_PLANK ||
            tile === TileType.CAPTAIN_FLOOR ||
            tile === TileType.BRIDGE
          ) {
            surface = "wood";
          } else if (tile === TileType.SAND || tile === TileType.BEACH) {
            surface = "sand";
          } else if (
            tile === TileType.STONE ||
            tile === TileType.STONE_PLATFORM ||
            tile === TileType.RUNE_FLOOR ||
            tile === TileType.DUNGEON_FLOOR ||
            tile === TileType.CAVE_FLOOR ||
            tile === TileType.INTERIOR_FLOOR ||
            tile === TileType.TOWN_FLOOR ||
            tile === TileType.TOWN_PATH ||
            tile === TileType.PATH
          ) {
            surface = "stone";
          } else if (
            tile === TileType.GRASS ||
            tile === TileType.FLOWER ||
            tile === TileType.TRANSITION_MARKER
          ) {
            surface = "grass";
          } else {
            // Zone-based fallback for tiles not explicitly mapped
            const zoneId = state.currentZoneId ?? "";
            if (
              zoneId.includes("ruins") ||
              zoneId.includes("dungeon") ||
              zoneId.includes("cave") ||
              zoneId.includes("basement") ||
              zoneId.includes("lair") ||
              zoneId === "boss_chamber"
            ) {
              surface = "stone";
            } else if (zoneId === "cursed_galleon") {
              surface = "wood";
            } else if (zoneId === "pirate_island") {
              surface = "sand";
            } else if (
              zoneId.includes("wilderness") ||
              zoneId.includes("forest") ||
              zoneId.includes("jungle")
            ) {
              surface = "default"; // dirt
            } else {
              surface = "grass";
            }
          }
          playFootstep(surface);
        } catch {
          /* audio non-fatal */
        }
      }

      // ── Zone transition check ──
      if (!state.isTransitioning && !state.isDead && !isTransitionBlocked()) {
        const px = state.player.tileX;
        const py = state.player.tileY;
        const onNewTile =
          px !== lastTileXRef.current || py !== lastTileYRef.current;
        if (onNewTile || justLanded) {
          lastTileXRef.current = px;
          lastTileYRef.current = py;
          try {
            const prevZone = state.currentZoneId;
            checkZoneTransition(state);
            // If zone changed, check visit_zone quest
            if (state.currentZoneId !== prevZone) {
              const enteredZone = state.currentZoneId;
              // Quest: visit_zone
              if (
                state.activeQuest &&
                !state.activeQuest.completed &&
                state.activeQuest.objectiveType === "visit_zone" &&
                state.activeQuest.objectiveTarget === enteredZone
              ) {
                const q = state.activeQuest;
                state.player.coins += q.reward.gold;
                state.player.xp += q.reward.xp;
                if (q.reward.potions > 0) {
                  state.potionCount = Math.min(
                    5,
                    state.potionCount + q.reward.potions,
                  );
                }
                state.completedQuestIds.push(q.id);
                state.questCompletePopup = {
                  questId: q.id,
                  title: q.title,
                  reward: q.reward,
                  expiresAt: Date.now() + 3000,
                };
                state.activeQuest = null;
                onXpChanged?.(state.player.xp, state.player.level);
              }
              // Achievements for zone visits
              if (enteredZone === "aurelion") {
                unlockAchievement(state, "pilgrim");
              }
              if (enteredZone === "cave_interior") {
                unlockAchievement(state, "spelunker");
              }
              if (enteredZone === "boss_chamber") {
                unlockAchievement(state, "boss_seeker");
              }
            }
          } catch (err) {
            console.warn(
              "[PixelQuest] Zone transition check error (non-fatal):",
              err,
            );
          }
        }
      }

      // ── HP Regeneration (every 5s) ──
      if (!state.isDead && !isTransitioning) {
        regenAccRef.current += clampedDelta;
        if (regenAccRef.current >= REGEN_INTERVAL_MS) {
          regenAccRef.current = 0;
          let changed = false;
          if (state.player.hp < state.player.maxHp) {
            state.player.hp = Math.min(
              state.player.maxHp,
              state.player.hp + REGEN_HP,
            );
            changed = true;
          }
          if (changed) {
            onHpChanged?.(state.player.hp, state.player.mp);
          }
        }

        // ── MP Regeneration (class-based rate, paused 1s after cast) ──
        const timeSinceCast = Date.now() - state.player.lastCastTime;
        if (timeSinceCast > REGEN_PAUSE_AFTER_CAST) {
          mpRegenAccRef.current += clampedDelta;
        } else {
          // Within regen pause — reset accumulator to prevent catching up
          mpRegenAccRef.current = 0;
        }
        // Mana regen scales with level: base * (1.02 ^ (level-1))
        // Mage base: 1.5 mp/s, Warrior base: 0.5 mp/s
        const isMageRegen = state.player.selectedClass === "mage";
        const baseManaPerSec = isMageRegen ? 1.5 : 0.5;
        const playerLevel = Math.max(1, state.player.level ?? 1);
        const levelMult = 1.02 ** (playerLevel - 1);
        const mpRegenInterval = isMageRegen
          ? MAGE_MP_REGEN_INTERVAL
          : WARRIOR_MP_REGEN_INTERVAL;
        if (mpRegenAccRef.current >= mpRegenInterval) {
          mpRegenAccRef.current = 0;
          const scaledRegen =
            Math.round(
              baseManaPerSec * levelMult * (mpRegenInterval / 1000) * 10,
            ) / 10;
          if (state.player.mp < state.player.maxMp) {
            state.player.mp = Math.min(
              state.player.maxMp,
              Math.round((state.player.mp + scaledRegen) * 10) / 10,
            );
            onHpChanged?.(state.player.hp, state.player.mp);
          }
        }
      } else {
        regenAccRef.current = 0;
      }

      // ── Auto-save (every 30s) ──
      autoSaveAccRef.current += clampedDelta;
      if (autoSaveAccRef.current >= AUTO_SAVE_INTERVAL_MS) {
        autoSaveAccRef.current = 0;
        console.log("[PixelQuest] Auto-save triggered");
        onAutoSave?.();
      }

      onFrame(timestamp);
      rafRef.current = requestAnimationFrame(loop);
    },
    [
      gameStateRef,
      onTileLanded,
      onFrame,
      onAttackTriggered,
      onHpChanged,
      onXpChanged,
      onMonsterKilled,
      onPlayerDied,
      onPlayerRespawned,
      onAutoSave,
      onPvpWarning,
      onAchievementUnlocked,
      onKillStreak,
      onLevelUp,
      onEventAnnounce,
      onDamageDealt,
      onPlayerDamageReceived,
    ],
  );

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [loop]);

  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  // Initialize audio once on first user interaction (and on each re-mount).
  // Uses async init so AudioContext is fully resumed before starting music.
  const audioInitRef = useRef(false);
  useEffect(() => {
    const onFirstInteraction = () => {
      void (async () => {
        // Init (or re-resume) the audio engine — safe to call every time
        await initAudio();
        audioInitRef.current = true;
        // Start zone music for whichever zone we're in
        const state = gameStateRef.current;
        playZoneMusic(state?.currentZoneId ?? "meadow_hub");
      })();
    };

    // Fire once on pointer or key — removes itself after first call
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });

    // Also attempt non-interaction init in case AudioContext was already unlocked
    // (e.g. user interacted on the menu screen before entering the game)
    void initAudio().then(() => {
      const state = gameStateRef.current;
      playZoneMusic(state?.currentZoneId ?? "meadow_hub");
    });

    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, [gameStateRef]);

  // Keyboard listeners
  useEffect(() => {
    const state = gameStateRef;

    const onKeyDown = (e: KeyboardEvent) => {
      const isChatOpen = chatOpenRef.current;
      // Secondary WASD guard: if ANY text input or textarea has focus,
      // block all game movement regardless of chatOpenRef state.
      // Catches GuildPanel chat, settings fields, and any other inputs.
      const activeEl = document.activeElement;
      const isTypingInField =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement;
      if (isTypingInField && e.key !== "Escape") return;

      if ((e.key === "t" || e.key === "T") && !isChatOpen && !isTypingInField) {
        e.preventDefault();
        openChat?.();
        return;
      }

      if (isChatOpen) return;

      // Block all game input during zone transitions
      if (state.current?.isTransitioning || isTransitionBlocked()) return;

      if (state.current) handleKeyDown(state.current.input, e, false);

      if ((e.key === "e" || e.key === "E") && openEmotePanel) {
        openEmotePanel();
      }
      if (e.key === "f" || e.key === "F") {
        // Trigger interact with nearby objects
        window.dispatchEvent(new CustomEvent("player_interact"));
      }
      if (e.code === "Space") {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const activeEl2 = document.activeElement;
      const isTypingInField2 =
        activeEl2 instanceof HTMLInputElement ||
        activeEl2 instanceof HTMLTextAreaElement;
      if (!chatOpenRef.current && !isTypingInField2 && state.current) {
        handleKeyUp(state.current.input, e);
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gameStateRef, openEmotePanel, openChat]);

  // Interact listener (fired from GameCanvas or UI interact button)
  useEffect(() => {
    const onInteract = () => {
      const state = gameStateRef.current;
      if (!state) return;

      // ── Checkpoint stone interaction ──
      const stonePos = CHECKPOINT_STONE_POSITIONS[state.currentZoneId];
      if (stonePos && !state.player.isGuest) {
        const playerDist = Math.sqrt(
          (state.player.tileX - stonePos.x) ** 2 +
            (state.player.tileY - stonePos.y) ** 2,
        );
        if (playerDist <= 1.8) {
          const alreadyActive =
            state.checkpointActive &&
            state.checkpoint?.zoneId === state.currentZoneId &&
            state.checkpoint?.x === stonePos.x &&
            state.checkpoint?.y === stonePos.y;
          if (!alreadyActive) {
            setCheckpoint(state, state.currentZoneId, stonePos.x, stonePos.y);
            return; // Consumed by checkpoint
          }
        }
      }

      const msg = tryInteractNearby(state);
      if (msg) {
        window.dispatchEvent(
          new CustomEvent("interact_result", { detail: { message: msg } }),
        );
      }
    };
    window.addEventListener("player_interact", onInteract);
    return () => window.removeEventListener("player_interact", onInteract);
  }, [gameStateRef]);
}
