import type {
  BossEntity,
  BossProjectile,
  CombatEvent,
  MonsterType,
} from "../types/game";

// ─── Stone Warden Configuration ───────────────────────────────────────────────

export const BOSS_BASE_HP = 500;
export const BOSS_SPAWN_X = 16;
export const BOSS_SPAWN_Y = 3;
export const BOSS_AGGRO_RANGE = 6; // tiles
const BOSS_SLAM_RANGE = 2.5; // tiles
const BOSS_BOULDER_MIN = 3; // min range for boulder
const BOSS_BOULDER_MAX = 8; // max range for boulder
const BOSS_SLAM_COOLDOWN = 3000; // ms
const BOSS_BOULDER_COOLDOWN = 4000; // ms
const BOSS_SLAM_DAMAGE = 30;
const BOSS_BOULDER_DAMAGE = 20;
const BOSS_BOULDER_SPEED = 0.5; // tiles per tick (at 16ms)
const BOSS_ENRAGE_THRESHOLD = 0.5; // 50% HP
export const BOSS_RESPAWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── Ship Captain Configuration ──────────────────────────────────────────────

export const SHIP_CAPTAIN_HP = 400;
export const SHIP_CAPTAIN_SPAWN_X = 26;
export const SHIP_CAPTAIN_SPAWN_Y = 7;
export const SHIP_CAPTAIN_AGGRO_RANGE = 8;
const SHIP_CAPTAIN_ARC_RANGE = 2; // tiles — wide arc sword attack
const SHIP_CAPTAIN_ARC_COOLDOWN = 2000; // ms
const SHIP_CAPTAIN_ARC_DAMAGE = 35;
const SHIP_CAPTAIN_PHASE2_HP = 200; // 50% of 400
export const SHIP_CAPTAIN_RESPAWN_MS = 10 * 60 * 1000; // 10 minutes
export const SHIP_CAPTAIN_SUMMON_COUNT = 2;

let _boulderIdCounter = 1;

// ─── Create Stone Warden boss ─────────────────────────────────────────────────

export function createBoss(avgPlayerLevel: number): BossEntity {
  const scaledHp = Math.min(
    2000,
    Math.max(BOSS_BASE_HP, BOSS_BASE_HP + avgPlayerLevel * 20),
  );
  return {
    id: "stone_warden",
    zoneId: "boss_chamber",
    x: BOSS_SPAWN_X,
    y: BOSS_SPAWN_Y,
    hp: scaledHp,
    maxHp: scaledHp,
    phase: "idle",
    lastSlamTime: 0,
    lastBoulderTime: 0,
    enraged: false,
    respawnAt: null,
    shockwaveStartTime: -1,
    projectiles: [],
    boulderWarningStartTime: -1,
    boulderWarningTargetX: 0,
    boulderWarningTargetY: 0,
  };
}

// ─── Create Ship Captain boss ──────────────────────────────────────────────────

export function createShipCaptainBoss(): BossEntity {
  return {
    id: "ship_captain",
    zoneId: "cursed_galleon",
    x: SHIP_CAPTAIN_SPAWN_X,
    y: SHIP_CAPTAIN_SPAWN_Y,
    hp: SHIP_CAPTAIN_HP,
    maxHp: SHIP_CAPTAIN_HP,
    phase: "idle",
    lastSlamTime: 0,
    lastBoulderTime: 0,
    enraged: false,
    respawnAt: null,
    shockwaveStartTime: -1,
    projectiles: [],
    boulderWarningStartTime: -1,
    boulderWarningTargetX: 0,
    boulderWarningTargetY: 0,
  };
}

// ─── Shared tick result ───────────────────────────────────────────────────────

interface BossTickResult {
  boss: BossEntity;
  combatEvents: CombatEvent[];
  xpReward: number;
  goldDrop: number;
  spawnMonsters?: Array<{ type: MonsterType; x: number; y: number }>;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// ─── Stone Warden AI tick ─────────────────────────────────────────────────────

export function tickBoss(
  bossIn: BossEntity,
  playerX: number,
  playerY: number,
  deltaMs: number,
): BossTickResult {
  const combatEvents: CombatEvent[] = [];
  void deltaMs;

  if (bossIn.phase === "dead") {
    if (bossIn.respawnAt !== null && Date.now() >= bossIn.respawnAt) {
      const newBoss = createBoss(1);
      return { boss: newBoss, combatEvents, xpReward: 0, goldDrop: 0 };
    }
    return { boss: bossIn, combatEvents, xpReward: 0, goldDrop: 0 };
  }

  const d = dist(bossIn.x, bossIn.y, playerX, playerY);
  const now = Date.now();

  const enraged =
    bossIn.enraged || bossIn.hp / bossIn.maxHp <= BOSS_ENRAGE_THRESHOLD;
  const enrageMult = enraged ? 0.5 : 1.0;
  const dmgMult = enraged ? 1.5 : 1.0;

  const phase =
    bossIn.phase === "idle" && d <= BOSS_AGGRO_RANGE ? "active" : bossIn.phase;

  if (phase !== "active") {
    return {
      boss: { ...bossIn, enraged, phase },
      combatEvents,
      xpReward: 0,
      goldDrop: 0,
    };
  }

  // ── Advance projectiles ──
  const updatedProjectiles: BossProjectile[] = [];
  for (const proj of bossIn.projectiles) {
    const dx = proj.targetX - proj.x;
    const dy = proj.targetY - proj.y;
    const d2 = Math.sqrt(dx * dx + dy * dy);
    if (d2 < 0.3) {
      const hitDist = dist(proj.targetX, proj.targetY, playerX, playerY);
      if (hitDist <= 1.2) {
        combatEvents.push({
          type: "player-hit",
          damage: Math.round(BOSS_BOULDER_DAMAGE * dmgMult),
          timestamp: now,
        });
      }
      continue;
    }
    const step = (BOSS_BOULDER_SPEED * 16) / 16;
    const angle = Math.atan2(dy, dx);
    updatedProjectiles.push({
      ...proj,
      x: proj.x + Math.cos(angle) * step,
      y: proj.y + Math.sin(angle) * step,
    });
  }

  // ── Melee slam ──
  let lastSlamTime = bossIn.lastSlamTime;
  let shockwaveStartTime = bossIn.shockwaveStartTime;
  if (
    d <= BOSS_SLAM_RANGE &&
    now - lastSlamTime >= BOSS_SLAM_COOLDOWN * enrageMult
  ) {
    combatEvents.push({
      type: "player-hit",
      damage: Math.round(BOSS_SLAM_DAMAGE * dmgMult),
      timestamp: now,
    });
    lastSlamTime = now;
    shockwaveStartTime = now;
  }

  // ── Ranged boulder (with 500ms pre-attack warning circle) ──
  let lastBoulderTime = bossIn.lastBoulderTime;
  let boulderWarningStartTime = bossIn.boulderWarningStartTime;
  let boulderWarningTargetX = bossIn.boulderWarningTargetX;
  let boulderWarningTargetY = bossIn.boulderWarningTargetY;
  const BOULDER_WARNING_MS = 500;

  // Check if warning is active and it's time to fire
  if (
    boulderWarningStartTime > 0 &&
    now - boulderWarningStartTime >= BOULDER_WARNING_MS
  ) {
    // Fire the projectile now
    const newProjectile: BossProjectile = {
      id: `bp_${_boulderIdCounter++}`,
      x: bossIn.x + 1,
      y: bossIn.y + 1,
      targetX: boulderWarningTargetX,
      targetY: boulderWarningTargetY,
      spawnTime: now,
    };
    updatedProjectiles.push(newProjectile);
    boulderWarningStartTime = -1; // clear warning
  } else if (
    boulderWarningStartTime <= 0 &&
    d >= BOSS_BOULDER_MIN &&
    d <= BOSS_BOULDER_MAX &&
    now - lastBoulderTime >= BOSS_BOULDER_COOLDOWN * enrageMult
  ) {
    // Start warning phase — record target at this moment
    boulderWarningStartTime = now;
    boulderWarningTargetX = playerX;
    boulderWarningTargetY = playerY;
    lastBoulderTime = now; // prevent re-triggering cooldown
  }

  const updatedBoss: BossEntity = {
    ...bossIn,
    enraged,
    phase,
    lastSlamTime,
    lastBoulderTime,
    shockwaveStartTime,
    projectiles: updatedProjectiles,
    boulderWarningStartTime,
    boulderWarningTargetX,
    boulderWarningTargetY,
  };

  return { boss: updatedBoss, combatEvents, xpReward: 0, goldDrop: 0 };
}

// ─── Ship Captain AI tick ──────────────────────────────────────────────────────

/** Tracks whether phase2 sailors have been summoned for each captain instance */
const _captainPhase2Summoned = new Set<string>();

export function tickShipCaptainBoss(
  bossIn: BossEntity,
  playerX: number,
  playerY: number,
  _deltaMs: number,
): BossTickResult {
  const combatEvents: CombatEvent[] = [];
  const spawnMonsters: Array<{ type: MonsterType; x: number; y: number }> = [];

  if (bossIn.phase === "dead") {
    if (bossIn.respawnAt !== null && Date.now() >= bossIn.respawnAt) {
      _captainPhase2Summoned.delete(bossIn.id);
      return {
        boss: createShipCaptainBoss(),
        combatEvents,
        xpReward: 0,
        goldDrop: 0,
      };
    }
    return { boss: bossIn, combatEvents, xpReward: 0, goldDrop: 0 };
  }

  const d = dist(bossIn.x, bossIn.y, playerX, playerY);
  const now = Date.now();

  // Phase transitions
  let phase = bossIn.phase;
  if (phase === "idle" && d <= SHIP_CAPTAIN_AGGRO_RANGE) {
    phase = "active";
  }

  if (phase !== "active") {
    return {
      boss: { ...bossIn, phase },
      combatEvents,
      xpReward: 0,
      goldDrop: 0,
    };
  }

  // Phase 2: summon 2 cursed_sailors when below 50% HP — once only
  const enraged = bossIn.hp <= SHIP_CAPTAIN_PHASE2_HP;
  if (enraged && !bossIn.enraged && !_captainPhase2Summoned.has(bossIn.id)) {
    _captainPhase2Summoned.add(bossIn.id);
    for (let i = 0; i < SHIP_CAPTAIN_SUMMON_COUNT; i++) {
      const angle = (i / SHIP_CAPTAIN_SUMMON_COUNT) * Math.PI * 2;
      spawnMonsters.push({
        type: "cursed_sailor",
        x: Math.round(bossIn.x + Math.cos(angle) * 2),
        y: Math.round(bossIn.y + Math.sin(angle) * 2),
      });
    }
  }

  // ── Wide arc sword attack ──
  let lastSlamTime = bossIn.lastSlamTime;
  let shockwaveStartTime = bossIn.shockwaveStartTime;
  const arcCooldown = enraged
    ? SHIP_CAPTAIN_ARC_COOLDOWN * 0.6
    : SHIP_CAPTAIN_ARC_COOLDOWN;

  if (d <= SHIP_CAPTAIN_ARC_RANGE && now - lastSlamTime >= arcCooldown) {
    combatEvents.push({
      type: "player-hit",
      damage: Math.round(SHIP_CAPTAIN_ARC_DAMAGE * (enraged ? 1.4 : 1.0)),
      timestamp: now,
    });
    lastSlamTime = now;
    shockwaveStartTime = now; // reuse shockwave timing for arc visual
  }

  const updatedBoss: BossEntity = {
    ...bossIn,
    enraged,
    phase,
    lastSlamTime,
    shockwaveStartTime,
    projectiles: [],
    boulderWarningStartTime: -1,
    boulderWarningTargetX: 0,
    boulderWarningTargetY: 0,
  };

  return {
    boss: updatedBoss,
    combatEvents,
    xpReward: 0,
    goldDrop: 0,
    spawnMonsters,
  };
}

// ─── Damage boss ──────────────────────────────────────────────────────────────

export interface BossDamageResult {
  boss: BossEntity;
  event: CombatEvent | null;
  died: boolean;
  xpReward: number;
  goldDrop: number;
}

export function damageBoss(
  bossIn: BossEntity,
  damage: number,
): BossDamageResult {
  if (bossIn.phase === "dead") {
    return { boss: bossIn, event: null, died: false, xpReward: 0, goldDrop: 0 };
  }
  const now = Date.now();
  const newHp = Math.max(0, bossIn.hp - damage);
  const died = newHp <= 0;
  const event: CombatEvent = {
    type: died ? "monster-died" : "monster-hit",
    damage,
    timestamp: now,
  };

  const isShipCaptain = bossIn.id === "ship_captain";
  const respawnMs = isShipCaptain ? SHIP_CAPTAIN_RESPAWN_MS : BOSS_RESPAWN_MS;

  const newBoss: BossEntity = died
    ? {
        ...bossIn,
        hp: 0,
        phase: "dead",
        respawnAt: Date.now() + respawnMs,
        projectiles: [],
      }
    : { ...bossIn, hp: newHp };

  const xpReward = died ? (isShipCaptain ? 350 : 500) : 0;
  const goldDrop = died
    ? isShipCaptain
      ? 60 + Math.floor(Math.random() * 41) // 60-100
      : 50 + Math.floor(Math.random() * 51) // 50-100
    : 0;

  return { boss: newBoss, event, died, xpReward, goldDrop };
}

/** Convenience alias for damaging the ship captain */
export function damageShipCaptainBoss(
  bossIn: BossEntity,
  damage: number,
): BossDamageResult {
  return damageBoss(bossIn, damage);
}
