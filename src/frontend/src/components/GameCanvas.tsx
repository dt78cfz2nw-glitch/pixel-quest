import { useCallback, useEffect, useRef, useState } from "react";
import { blacklistedSessions } from "../App";
import { useBackendSync } from "../hooks/useBackendSync";
import { useGameLoop } from "../hooks/useGameLoop";
import { playThunder } from "../lib/audio";
import {
  QUEST_GIVERS,
  cloneQuest,
  isQuestAvailableForClass,
} from "../lib/quests";
import { NPC_SHOP_MAP } from "../lib/shop";
import {
  TILE_COLORS,
  WORLD_CONFIG,
  getPortalDestLabel,
  validateAllTransitions,
} from "../lib/world";
import {
  CHECKPOINT_STONE_POSITIONS,
  checkPlayerStuck,
  collectLootDrop,
  createGameState,
  setCheckpoint,
} from "../store/gameStore";
import type {
  BossEntity,
  CharacterClass,
  ChatMessage,
  EmoteType,
  FacingDirection,
  GameState,
  HairColor,
  InventoryItem,
  LootDrop,
  LootPopAnim,
  MonsterEntity,
  NpcDefinition,
  OtherPlayer,
  OutfitColor,
  OutfitStyle,
  PvpGoldDrop,
  Quest,
  ShopItem,
  TileTypeValue,
  ZoneId,
} from "../types/game";
import {
  ANIM_FRAME_COUNT,
  ATTACK_DURATION_MS,
  ATTACK_FLASH_DURATION_MS,
  CHAT_BUBBLE_DURATION_MS,
  CHAT_BUBBLE_FADE_MS,
  EMOTE_DURATION_MS,
  EMOTE_ICONS,
  IDLE_BOB_PERIOD,
  LOOT_POP_DURATION_MS,
  MAGE_PROJECTILE_TILES,
  MAGE_SPELL_VISUAL_DURATION_MS,
  PVP_ZONES,
  SAFE_ZONES,
  SCREEN_SHAKE_AMPLITUDE,
  SCREEN_SHAKE_DURATION_MS,
  SHADOW_LANCE_VISUAL_DURATION_MS,
  type SpellPhase,
  TILE_SIZE,
  TITLE_LABELS,
  TileType,
  VIEWPORT_COLS,
  VIEWPORT_ROWS,
  WARRIOR_RECOVERY_MS,
  WARRIOR_STRIKE_MS,
  WARRIOR_SWING_ANGLE,
  WARRIOR_WINDUP_MS,
} from "../types/game";
import { Minimap } from "./Minimap";

// ─── Canvas dimensions ────────────────────────────────────────────────────────

export const CANVAS_W = VIEWPORT_COLS * TILE_SIZE; // 672
export const CANVAS_H = VIEWPORT_ROWS * TILE_SIZE; // 480

const CAM_LERP = 0.18;

// ─── Spell particle pool ─────────────────────────────────────────────────────
// Hard limit: max 30 particles across all active spell effects combined.
// When limit is reached, oldest particles are removed first (FIFO).
// Particles support optional physics (vx/vy/gravity) for gravity-based effects.

const MAX_PARTICLES = 30;
interface SpellParticle {
  x: number;
  y: number;
  r: number;
  color: string;
  alpha: number;
  vx?: number;
  vy?: number;
  gravity?: number;
  /** Spell lifecycle phase — drives rendering layer */
  phase?: SpellPhase;
  /** Age of this particle in ms */
  age?: number;
  /** Maximum lifetime in ms before auto-removal */
  maxAge?: number;
}

// Ephemeral particles — flushed every frame (existing spell trail system)
const activeParticles: SpellParticle[] = [];

// Persistent physics particles — survive multiple frames, expire when alpha ≤ 0
interface PhysicsParticle {
  x: number;
  y: number;
  r: number;
  color: string;
  alpha: number;
  vx: number;
  vy: number;
  gravity: number;
}
const persistentParticles: PhysicsParticle[] = [];

function addParticle(p: SpellParticle): void {
  if (activeParticles.length >= MAX_PARTICLES) {
    activeParticles.shift(); // FIFO: remove oldest
  }
  activeParticles.push(p);
}

/** Add a physics particle that persists across frames (gravity + velocity). */
function addPhysicsParticle(p: PhysicsParticle): void {
  const total = activeParticles.length + persistentParticles.length;
  if (total >= MAX_PARTICLES) {
    if (persistentParticles.length > 0) persistentParticles.shift();
    else return;
  }
  persistentParticles.push({ ...p });
}

function flushParticles(ctx: CanvasRenderingContext2D): void {
  for (const p of activeParticles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  activeParticles.length = 0; // clear after drawing
}

/** Update + draw all persistent physics particles. Call once per frame. */
function updateAndDrawPhysicsParticles(
  ctx: CanvasRenderingContext2D,
  dt: number,
): void {
  if (persistentParticles.length === 0) return;
  const dtScale = dt / 16.67;
  ctx.save();
  for (let i = persistentParticles.length - 1; i >= 0; i--) {
    const p = persistentParticles[i]!;
    p.vy = Math.min(0.5, p.vy + p.gravity * dtScale);
    p.x += p.vx * dtScale;
    p.y += p.vy * dtScale;
    p.alpha -= 0.022 * dtScale;
    if (p.alpha <= 0) {
      persistentParticles.splice(i, 1);
      continue;
    }
    p.r = Math.max(0.5, p.r - 0.04 * dtScale);
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Spawn level-up golden sparkle burst (8 particles, arc outward with gravity). */
function spawnLevelUpParticles(screenX: number, screenY: number): void {
  const count = spellMax(8);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 1.8 + Math.random() * 1.2;
    addPhysicsParticle({
      x: screenX + 16,
      y: screenY + 16,
      r: 3 + Math.random() * 2,
      color: i % 3 === 0 ? "#FFD700" : i % 3 === 1 ? "#FFEC70" : "#FFA500",
      alpha: 1.0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      gravity: 0.06,
    });
  }
}

/** Spawn monster death fragment particles (4-6 colored shards). */
function spawnMonsterDeathParticles(
  screenX: number,
  screenY: number,
  monsterType: string,
): void {
  const FRAG: Record<string, string[]> = {
    slime: ["#44dd44", "#22aa22", "#88ff88"],
    skeleton: ["#cccccc", "#aaaaaa", "#eeeeee"],
    bat: ["#553322", "#442211", "#775544"],
    bear: ["#8B5E3C", "#5C3A1E", "#AA7850"],
    spider: ["#4A2E1A", "#3A2010", "#6A4030"],
    wolf: ["#666666", "#444444", "#888888"],
    tiger: ["#c47020", "#8a4e10", "#e09040"],
    cyclops: ["#4a6040", "#2e3c28", "#6a8060"],
    stone_golem: ["#888880", "#666658", "#aaaaa0"],
    crystal_golem: ["#a855f7", "#7c3aed", "#c084fc"],
    pirate_grunt: ["#8B6A1A", "#5a4010", "#bbaa44"],
    cursed_sailor: ["#336633", "#1a3a1a", "#55aa55"],
    skeleton_gunner: ["#bbbbbb", "#888888", "#dddddd"],
    default: ["#ff6644", "#cc4422", "#ff9966"],
  };
  const colors = FRAG[monsterType] ?? FRAG.default!;
  const count = spellMax(5);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2.0;
    addPhysicsParticle({
      x: screenX + 16 + (Math.random() - 0.5) * 8,
      y: screenY + 20 + (Math.random() - 0.5) * 8,
      r: 2 + Math.random() * 2,
      color: colors[i % colors.length]!,
      alpha: 0.9,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      gravity: 0.04,
    });
  }
}

// ─── Spell impact effects (persistent wall/floor marks) ─────────────────────
interface SpellImpact {
  type: "arcane_spark" | "frost_patch" | "shadow_slash" | "scorch_mark";
  x: number;
  y: number;
  startedAt: number;
  duration: number;
}
interface SpellEffectItem {
  type: "bolt" | "nova" | "lance" | "ring" | "shield";
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  startTime: number;
  duration: number;
  phase: number;
}
interface SpellDamageNumber {
  value: number;
  x: number;
  y: number;
  startY: number;
  color: string;
  scale: number;
  alpha: number;
  born: number;
  label: string;
}
interface MonsterHPBarData {
  monsterId: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  lastHit: number;
}

const _spellImpacts: SpellImpact[] = [];
function addSpellImpact(impact: SpellImpact): void {
  if (_spellImpacts.length >= 8) _spellImpacts.shift();
  _spellImpacts.push(impact);
}
function drawSpellImpacts(ctx: CanvasRenderingContext2D, now: number): void {
  for (let i = _spellImpacts.length - 1; i >= 0; i--) {
    const imp = _spellImpacts[i]!;
    const age = now - imp.startedAt;
    if (age >= imp.duration) {
      _spellImpacts.splice(i, 1);
      continue;
    }
    const t = age / imp.duration;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    if (imp.type === "arcane_spark") {
      for (let s = 0; s < 4; s++) {
        const sa = (s / 4) * Math.PI * 2;
        ctx.strokeStyle = "#88CCFF";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(imp.x + Math.cos(sa) * 2, imp.y + Math.sin(sa) * 2);
        ctx.lineTo(
          imp.x + Math.cos(sa) * (t * 10),
          imp.y + Math.sin(sa) * (t * 10),
        );
        ctx.stroke();
      }
    } else if (imp.type === "frost_patch") {
      ctx.fillStyle = "#AADDFF";
      ctx.beginPath();
      ctx.ellipse(imp.x, imp.y, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (imp.type === "shadow_slash") {
      ctx.strokeStyle = "#4B0082";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(imp.x - 8, imp.y - 4);
      ctx.lineTo(imp.x + 8, imp.y + 4);
      ctx.stroke();
    } else if (imp.type === "scorch_mark") {
      ctx.fillStyle = "#FF4400";
      ctx.beginPath();
      ctx.ellipse(imp.x, imp.y, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ─── Death animation system ───────────────────────────────────────────────────
interface DeathAnim {
  id: string;
  type: "shrink_spin" | "dissolve" | "crumble";
  x: number;
  y: number;
  progress: number;
  startedAt: number;
  monsterType: string;
  fragmentsSpawned: boolean;
}
const DEATH_ANIM_DURATION = 500;
const _deathAnims = new Map<string, DeathAnim>();
function getDeathAnimType(
  monsterType: string,
): "shrink_spin" | "dissolve" | "crumble" {
  if (["sprite_wisp", "ruin_specter", "shadow_wolf"].includes(monsterType))
    return "dissolve";
  if (
    [
      "stone_golem",
      "cyclops",
      "cave_troll",
      "ancient_guardian",
      "crystal_golem",
    ].includes(monsterType)
  )
    return "crumble";
  return "shrink_spin";
}
function drawDeathAnim(ctx: CanvasRenderingContext2D, anim: DeathAnim): void {
  try {
    const alpha = 1 - anim.progress;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const cx = anim.x + 16;
    const cy = anim.y + 16;
    if (anim.type === "shrink_spin") {
      ctx.translate(cx, cy);
      ctx.rotate(anim.progress * Math.PI * 6);
      ctx.scale(1 - anim.progress * 0.85, 1 - anim.progress * 0.85);
      ctx.fillStyle = "#888888";
      ctx.fillRect(-8, -8, 16, 16);
    } else if (anim.type === "dissolve") {
      for (let i = 0; i < 4; i++) {
        const da = (i / 4) * Math.PI * 2 + anim.progress * Math.PI;
        const dr = anim.progress * 14;
        ctx.fillStyle = i % 2 === 0 ? "#9955ff" : "#4422aa";
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(da) * dr,
          cy + Math.sin(da) * dr,
          Math.max(0.5, 4 * (1 - anim.progress)),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      ctx.translate(cx, cy + anim.progress * 12);
      ctx.rotate(anim.progress * 0.4);
      ctx.fillStyle = "#777766";
      ctx.fillRect(-10, -12, 20, 24);
    }
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

// ─── Damage direction indicators ─────────────────────────────────────────────
// When player takes damage, a red arrow at the screen edge briefly points
// toward the attacker. Stored as module-level array for zero-allocation per-frame.
interface DamageIndicator {
  angle: number; // radians, direction from player center toward attacker
  alpha: number; // 1 → 0 over lifetime
  expiry: number; // ms timestamp
}
const _damageIndicators: DamageIndicator[] = [];

/** Register a damage indicator. angle = Math.atan2(attackerY - playerY, attackerX - playerX) */
export function addDamageIndicator(angle: number): void {
  // Cap at 4 simultaneous indicators — oldest removed first
  if (_damageIndicators.length >= 4) _damageIndicators.shift();
  _damageIndicators.push({ angle, alpha: 1.0, expiry: Date.now() + 1500 });
}

/** Draw all active damage direction indicators. Call once per frame after ctx.save(). */
function drawDamageIndicators(
  ctx: CanvasRenderingContext2D,
  now: number,
): void {
  for (let i = _damageIndicators.length - 1; i >= 0; i--) {
    const ind = _damageIndicators[i]!;
    const remaining = ind.expiry - now;
    if (remaining <= 0) {
      _damageIndicators.splice(i, 1);
      continue;
    }
    ind.alpha = Math.min(1.0, remaining / 600); // fade over last 600ms
    try {
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;
      // Position the arrow at the screen edge in the attacker direction
      const MARGIN = 24;
      const dx = Math.cos(ind.angle);
      const dy = Math.sin(ind.angle);
      // Find edge intersection
      const scaleX =
        dx !== 0 ? (cx - MARGIN) / Math.abs(dx) : Number.POSITIVE_INFINITY;
      const scaleY =
        dy !== 0 ? (cy - MARGIN) / Math.abs(dy) : Number.POSITIVE_INFINITY;
      const scale = Math.min(scaleX, scaleY);
      const arrowX = cx + dx * scale;
      const arrowY = cy + dy * scale;

      ctx.save();
      ctx.globalAlpha = ind.alpha * 0.88;
      ctx.translate(arrowX, arrowY);
      ctx.rotate(ind.angle + Math.PI / 2); // rotate so tip points inward
      // Filled red triangle (tip pointing toward center of screen)
      ctx.fillStyle = "#ff2222";
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -20); // tip (pointing inward toward player)
      ctx.lineTo(-12, 10);
      ctx.lineTo(12, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } catch {
      /* non-fatal */
    }
  }
}

// ─── Healing potion state ─────────────────────────────────────────────────────
// Monster hit reactions (knockback offsets)
interface HitReaction {
  kbx: number;
  kby: number;
  timer: number;
  totalTimer: number;
}
const _hitReactions = new Map<string, HitReaction>();

export function addHitReaction(
  monsterId: string,
  dirX: number,
  dirY: number,
): void {
  _hitReactions.set(monsterId, {
    kbx: dirX * 8,
    kby: dirY * 8,
    timer: 150,
    totalTimer: 150,
  });
}

function getHitReactionOffset(monsterId: string): [number, number] {
  const hr = _hitReactions.get(monsterId);
  if (!hr || hr.timer <= 0) return [0, 0];
  const t = hr.timer / hr.totalTimer;
  return [hr.kbx * t, hr.kby * t];
}

function tickHitReactions(dt: number): void {
  for (const [id, hr] of _hitReactions) {
    hr.timer -= dt;
    if (hr.timer <= 0) _hitReactions.delete(id);
  }
}

// Player death animation state
interface PlayerDeathAnim {
  phase: "none" | "flash" | "spin" | "shrink" | "done";
  timer: number;
  rotation: number;
  scale: number;
}
const _playerDeathAnim: PlayerDeathAnim = {
  phase: "none",
  timer: 0,
  rotation: 0,
  scale: 1,
};

function resetPlayerDeathAnim(): void {
  _playerDeathAnim.phase = "none";
  _playerDeathAnim.timer = 0;
  _playerDeathAnim.rotation = 0;
  _playerDeathAnim.scale = 1;
}

function tickPlayerDeathAnim(dt: number): void {
  const a = _playerDeathAnim;
  if (a.phase === "none" || a.phase === "done") return;
  a.timer += dt;
  if (a.phase === "flash") {
    if (a.timer >= 480) {
      a.phase = "spin";
      a.timer = 0;
    }
  } else if (a.phase === "spin") {
    a.rotation = (a.timer / 400) * Math.PI * 2;
    if (a.timer >= 400) {
      a.phase = "shrink";
      a.timer = 0;
      a.rotation = Math.PI * 2;
    }
  } else if (a.phase === "shrink") {
    a.scale = Math.max(0, 1 - a.timer / 200);
    if (a.timer >= 200) {
      a.phase = "done";
      a.scale = 0;
    }
  }
}

function playerDeathFlashVisible(): boolean {
  const a = _playerDeathAnim;
  if (a.phase !== "flash") return false;
  return Math.floor(a.timer / 80) % 2 === 0;
}

// Ambient life system
interface AmbientButterfly {
  x: number;
  y: number;
  seedX: number;
  seedY: number;
  phase: number;
}
interface AmbientDog {
  x: number;
  dir: number;
  timer: number;
  pause: boolean;
}
interface AmbientBird {
  x: number;
  y: number;
  state: "sit" | "fly";
  flyTimer: number;
  pauseTimer: number;
}
interface AmbientFirefly {
  x: number;
  y: number;
  sx: number;
  sy: number;
  freq: number;
  phase: number;
}
interface AmbientLeaf {
  x: number;
  y: number;
  rot: number;
  active: boolean;
  spawnTimer: number;
}
interface AmbientDrip {
  y: number;
  active: boolean;
  splashTimer: number;
}
interface AmbientSpark {
  x: number;
  y: number;
  timer: number;
}

const _amb = {
  butterflies: [] as AmbientButterfly[],
  dog: null as AmbientDog | null,
  bird: null as AmbientBird | null,
  fireflies: [] as AmbientFirefly[],
  leaf: null as AmbientLeaf | null,
  drip: null as AmbientDrip | null,
  seagull: null as { angle: number } | null,
  sparks: [] as AmbientSpark[],
  sparkTimer: 0,
  cloudX: 30,
  initialized: "" as string,
};

function initAmbient(zoneId: string): void {
  if (_amb.initialized === zoneId) return;
  _amb.initialized = zoneId;
  _amb.butterflies = [];
  _amb.dog = null;
  _amb.bird = null;
  _amb.fireflies = [];
  _amb.leaf = null;
  _amb.drip = null;
  _amb.seagull = null;
  _amb.sparks = [];
  _amb.sparkTimer = 0;
  _amb.cloudX = 30;
  if (zoneId === "meadow_hub") {
    _amb.butterflies = [
      {
        x: CANVAS_W * 0.28,
        y: CANVAS_H * 0.4,
        seedX: 3.7,
        seedY: 5.1,
        phase: 0,
      },
      {
        x: CANVAS_W * 0.55,
        y: CANVAS_H * 0.35,
        seedX: 2.3,
        seedY: 6.8,
        phase: 1.5,
      },
    ];
    _amb.dog = { x: CANVAS_W * 0.2, dir: 1, timer: 4000, pause: false };
    _amb.bird = {
      x: CANVAS_W * 0.6,
      y: CANVAS_H * 0.12,
      state: "sit",
      flyTimer: 0,
      pauseTimer: (15 + Math.random() * 15) * 1000,
    };
  } else if (
    zoneId === "forest_depths" ||
    zoneId === "wolf_forest" ||
    zoneId === "bear_forest"
  ) {
    for (let i = 0; i < 6; i++) {
      _amb.fireflies.push({
        x: CANVAS_W * (0.1 + i * 0.15),
        y: CANVAS_H * 0.55 + (i % 3) * 30,
        sx: CANVAS_W * (0.1 + i * 0.15),
        sy: CANVAS_H * 0.55 + (i % 3) * 30,
        freq: 0.4 + i * 0.12,
        phase: i * 1.2,
      });
    }
    _amb.leaf = {
      x: Math.random() * CANVAS_W,
      y: -10,
      rot: 0,
      active: false,
      spawnTimer: (8 + Math.random() * 7) * 1000,
    };
  } else if (
    zoneId === "cave_interior" ||
    zoneId === "bat_cave" ||
    zoneId === "deep_cave"
  ) {
    _amb.drip = { y: CANVAS_H * 0.08, active: false, splashTimer: 0 };
  } else if (zoneId === "pirate_island") {
    _amb.seagull = { angle: 0 };
  }
}

function updateAndDrawAmbient(
  ctx: CanvasRenderingContext2D,
  zoneId: string,
  dt: number,
  timestamp: number,
): void {
  if (shouldSkipDecorativeParticles()) return;
  initAmbient(zoneId);
  ctx.save();
  try {
    // Butterflies (Meadow Hub)
    for (const b of _amb.butterflies) {
      b.phase += dt * 0.0008;
      b.x = b.seedX * 40 + Math.sin(b.phase * 0.8) * 40 + CANVAS_W * 0.1;
      b.y = b.seedY * 30 + Math.sin(b.phase * 1.2) * 20 + CANVAS_H * 0.15;
      const wingW = 5 + Math.abs(Math.sin(timestamp * 0.012)) * 2;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "#ffaacc";
      ctx.beginPath();
      ctx.ellipse(b.x - wingW, b.y - 1, wingW, 3, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(b.x + wingW, b.y - 1, wingW, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#553333";
      ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 4, 2, 8);
    }
    // Dog (Meadow Hub)
    if (_amb.dog) {
      const dog = _amb.dog;
      dog.timer -= dt;
      if (dog.timer <= 0) {
        if (dog.pause) {
          dog.pause = false;
          dog.dir = -dog.dir;
          dog.timer = 4000;
        } else {
          dog.pause = true;
          dog.timer = 2000;
        }
      }
      if (!dog.pause) dog.x += dog.dir * 0.02 * dt;
      dog.x = Math.max(CANVAS_W * 0.05, Math.min(CANVAS_W * 0.4, dog.x));
      const dogY = CANVAS_H * 0.72;
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#8b4513";
      ctx.fillRect(Math.round(dog.x) - 6, Math.round(dogY) - 4, 12, 8);
      ctx.beginPath();
      ctx.arc(
        Math.round(dog.x) + (dog.dir > 0 ? 7 : -7),
        Math.round(dogY) - 3,
        5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // Bird (Meadow Hub)
    if (_amb.bird) {
      const bird = _amb.bird;
      if (bird.state === "sit") {
        bird.pauseTimer -= dt;
        if (bird.pauseTimer <= 0) {
          bird.state = "fly";
          bird.flyTimer = 0;
        }
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#333344";
        ctx.beginPath();
        ctx.moveTo(bird.x, bird.y);
        ctx.lineTo(bird.x - 4, bird.y + 3);
        ctx.lineTo(bird.x + 4, bird.y + 3);
        ctx.closePath();
        ctx.fill();
      } else {
        bird.flyTimer += dt;
        bird.x += 1.2 * (dt / 16);
        bird.y -= 0.3 * (dt / 16);
        const fw = 6 + Math.abs(Math.sin(bird.flyTimer * 0.008)) * 5;
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = "#333344";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bird.x - fw * 0.5, bird.y, fw * 0.5, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bird.x + fw * 0.5, bird.y, fw * 0.5, Math.PI, 0);
        ctx.stroke();
        if (bird.flyTimer > 5000 || bird.x > CANVAS_W + 30) {
          bird.x = Math.random() * CANVAS_W * 0.5 + CANVAS_W * 0.1;
          bird.y = CANVAS_H * 0.08 + Math.random() * CANVAS_H * 0.06;
          bird.state = "sit";
          bird.pauseTimer = (15 + Math.random() * 15) * 1000;
        }
      }
    }
    // Fireflies (Forest)
    for (const f of _amb.fireflies) {
      f.phase += dt * 0.001;
      f.x = f.sx + Math.sin(f.phase * f.freq) * 30;
      f.y = f.sy + Math.sin(f.phase * f.freq * 0.7 + 1.0) * 15;
      const glow = 0.4 + 0.5 * Math.abs(Math.sin(timestamp * 0.002 + f.phase));
      ctx.globalAlpha = glow * 0.85;
      const fGrad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 6);
      fGrad.addColorStop(0, "#ffff88");
      fGrad.addColorStop(1, "rgba(255,255,68,0)");
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = glow;
      ctx.fillStyle = "#ffff44";
      ctx.beginPath();
      ctx.arc(f.x, f.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Falling Leaf (Forest)
    if (_amb.leaf !== null) {
      const leaf = _amb.leaf;
      if (!leaf.active) {
        leaf.spawnTimer -= dt;
        if (leaf.spawnTimer <= 0) {
          leaf.x = Math.random() * CANVAS_W;
          leaf.y = -10;
          leaf.rot = 0;
          leaf.active = true;
        }
      } else {
        leaf.y += 0.5 * (dt / 16);
        leaf.x += Math.sin(timestamp * 0.002) * 0.3;
        leaf.rot += 0.02 * (dt / 16);
        if (leaf.y > CANVAS_H + 20) {
          leaf.active = false;
          leaf.spawnTimer = (8 + Math.random() * 7) * 1000;
        }
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.rot);
        ctx.fillStyle = "#664422";
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(3, 0);
        ctx.lineTo(0, 4);
        ctx.lineTo(-3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Water Drip (Cave)
    if (_amb.drip !== null) {
      const drip = _amb.drip;
      const dripX = CANVAS_W * 0.38;
      const dripFloorY = CANVAS_H * 0.72;
      if (drip.splashTimer > 0) {
        drip.splashTimer -= dt;
        const splashT = 1 - drip.splashTimer / 300;
        ctx.globalAlpha = (1 - splashT) * 0.7;
        ctx.strokeStyle = "#4488ff";
        ctx.lineWidth = 1;
        for (let si = 0; si < 4; si++) {
          const sa = (si / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(dripX, dripFloorY);
          ctx.lineTo(
            dripX + Math.cos(sa) * splashT * 6,
            dripFloorY + Math.sin(sa) * splashT * 3,
          );
          ctx.stroke();
        }
      } else if (!drip.active) {
        drip.active = true;
        drip.y = CANVAS_H * 0.08;
      } else {
        drip.y += 0.8 * (dt / 16);
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = "#4488ff";
        ctx.beginPath();
        ctx.arc(dripX, drip.y, 2, 0, Math.PI);
        ctx.fill();
        ctx.fillRect(dripX - 1, drip.y, 2, 4);
        if (drip.y >= dripFloorY) {
          drip.active = false;
          drip.splashTimer = 300;
        }
      }
    }
    // Crystal glow (Cave)
    if (
      zoneId === "cave_interior" ||
      zoneId === "bat_cave" ||
      zoneId === "deep_cave"
    ) {
      const crystalPos: [number, number][] = [
        [CANVAS_W * 0.18, CANVAS_H * 0.32],
        [CANVAS_W * 0.72, CANVAS_H * 0.28],
        [CANVAS_W * 0.45, CANVAS_H * 0.68],
        [CANVAS_W * 0.82, CANVAS_H * 0.55],
      ];
      crystalPos.forEach(([cx, cy], ci) => {
        const pulse = Math.sin(timestamp * 0.0005 + ci * 1.4) * 0.3 + 0.7;
        const t = (Math.sin(timestamp * 0.0005 + ci * 1.4) + 1) / 2;
        const cr = Math.round(136 + t * (68 - 136));
        const cg = Math.round(255 + t * (136 - 255));
        const cb = Math.round(204 + t * (255 - 204));
        ctx.globalAlpha = pulse * 0.55;
        const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
        cGrad.addColorStop(0, `rgb(${cr},${cg},${cb})`);
        cGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = pulse * 0.8;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 5, cy);
        ctx.lineTo(cx, cy + 6);
        ctx.lineTo(cx - 5, cy);
        ctx.closePath();
        ctx.fill();
      });
    }
    // Seagull (Pirate Island)
    if (_amb.seagull) {
      _amb.seagull.angle += dt * 0.0002;
      const sgX = CANVAS_W / 2 + Math.cos(_amb.seagull.angle) * 60;
      const sgY = CANVAS_H * 0.18 + Math.sin(_amb.seagull.angle) * 20;
      const fw2 = 8 + Math.abs(Math.sin(timestamp * 0.003)) * 5;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = "#cccccc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sgX - fw2 * 0.5, sgY, fw2 * 0.5, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sgX + fw2 * 0.5, sgY, fw2 * 0.5, Math.PI, 0);
      ctx.stroke();
    }
    // Thunder Isle sparks + cloud shadow
    if (zoneId === "thunder_isle") {
      _amb.sparkTimer -= dt;
      if (_amb.sparkTimer <= 0 && _amb.sparks.length < 4) {
        _amb.sparkTimer = 3000 + Math.random() * 5000;
        _amb.sparks.push({
          x: 20 + Math.random() * (CANVAS_W - 40),
          y: 20 + Math.random() * (CANVAS_H * 0.6),
          timer: 300,
        });
      }
      for (let si = _amb.sparks.length - 1; si >= 0; si--) {
        const sp = _amb.sparks[si]!;
        sp.timer -= dt;
        if (sp.timer <= 0) {
          _amb.sparks.splice(si, 1);
          continue;
        }
        const sf = sp.timer / 300;
        ctx.globalAlpha = sf * 0.9;
        ctx.strokeStyle = "#aaaaff";
        ctx.lineWidth = 1;
        for (let sli = 0; sli < 6; sli++) {
          const sa2 = (sli / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(sp.x + Math.cos(sa2) * 6, sp.y + Math.sin(sa2) * 6);
          ctx.stroke();
        }
        ctx.globalAlpha = sf;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      _amb.cloudX += 0.06 * dt;
      if (_amb.cloudX > CANVAS_W + 80) _amb.cloudX = -80;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.ellipse(_amb.cloudX, CANVAS_H * 0.35, 60, 30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } catch {
    /* non-fatal */
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

let _lastPotionCount = -1;
let _healingOutlineTimer = 0;

// ─── Spell render throttle ───────────────────────────────────────────────────
// Cap spell animation rendering at 24fps to prevent main-loop freeze.
let lastSpellRenderTime = 0;
const SPELL_RENDER_INTERVAL = 1000 / 24; // ~41.67ms

// ─── Slow-device detection ───────────────────────────────────────────────────
// Tracks a rolling average of frame deltas.
// >22ms avg (< ~45fps) → slow mode: halve particle counts.
// >33ms avg (< ~30fps) → very slow mode: skip decorative zone particles
//                         and cap water animation to 4 frames.
let _frameDeltaSum = 0;
let _frameDeltaCount = 0;
let _slowDeviceMode = false;
let _verySlowDeviceMode = false;

function updateSlowDeviceMode(deltaMs: number): void {
  _frameDeltaSum += deltaMs;
  _frameDeltaCount++;
  if (_frameDeltaCount >= 60) {
    const avg = _frameDeltaSum / _frameDeltaCount;
    _slowDeviceMode = avg > 22; // <45fps → halve particles
    _verySlowDeviceMode = avg > 33; // <30fps → skip decorative particles + cap water frames
    _frameDeltaSum = 0;
    _frameDeltaCount = 0;
  }
}

/** Effective max particles per spell, halved on slow devices. */
function spellMax(base: number): number {
  return _slowDeviceMode ? Math.max(2, Math.floor(base / 2)) : base;
}

/** Returns true when decorative zone particle effects should be skipped. */
function shouldSkipDecorativeParticles(): boolean {
  return _verySlowDeviceMode;
}

// ─── Outfit color palettes ────────────────────────────────────────────────────

const OUTFIT_COLORS: Record<
  OutfitColor,
  { body: string; dark: string; highlight: string }
> = {
  default: {
    body: "oklch(0.58 0.22 25)",
    dark: "oklch(0.36 0.18 25)",
    highlight: "oklch(0.76 0.14 30)",
  },
  red: {
    body: "oklch(0.55 0.28 20)",
    dark: "oklch(0.32 0.22 20)",
    highlight: "oklch(0.72 0.20 25)",
  },
  blue: {
    body: "oklch(0.50 0.22 250)",
    dark: "oklch(0.30 0.18 255)",
    highlight: "oklch(0.68 0.18 240)",
  },
  green: {
    body: "oklch(0.52 0.20 145)",
    dark: "oklch(0.32 0.16 145)",
    highlight: "oklch(0.68 0.15 145)",
  },
  purple: {
    body: "oklch(0.50 0.22 300)",
    dark: "oklch(0.30 0.18 300)",
    highlight: "oklch(0.68 0.18 290)",
  },
};

const MAGE_OUTFIT_COLORS: Record<
  OutfitColor,
  { body: string; dark: string; highlight: string }
> = {
  default: {
    body: "oklch(0.50 0.22 260)",
    dark: "oklch(0.32 0.18 260)",
    highlight: "oklch(0.68 0.22 220)",
  },
  red: {
    body: "oklch(0.48 0.25 15)",
    dark: "oklch(0.28 0.20 15)",
    highlight: "oklch(0.66 0.20 20)",
  },
  blue: {
    body: "oklch(0.45 0.24 240)",
    dark: "oklch(0.27 0.19 245)",
    highlight: "oklch(0.62 0.22 230)",
  },
  green: {
    body: "oklch(0.47 0.20 160)",
    dark: "oklch(0.28 0.16 160)",
    highlight: "oklch(0.62 0.18 155)",
  },
  purple: {
    body: "oklch(0.48 0.24 295)",
    dark: "oklch(0.28 0.20 295)",
    highlight: "oklch(0.64 0.22 285)",
  },
};

const CLASS_COLORS: Record<
  CharacterClass,
  {
    body: string;
    dark: string;
    accent: string;
    skin: string;
    highlight: string;
    labelBorder: string;
  }
> = {
  warrior: {
    body: "oklch(0.58 0.22 25)",
    dark: "oklch(0.36 0.18 25)",
    accent: "oklch(0.72 0.12 50)",
    skin: "oklch(0.78 0.08 60)",
    highlight: "oklch(0.76 0.14 30)",
    labelBorder: "oklch(0.65 0.22 25)",
  },
  mage: {
    body: "oklch(0.50 0.22 260)",
    dark: "oklch(0.32 0.18 260)",
    accent: "oklch(0.70 0.16 200)",
    skin: "oklch(0.78 0.08 60)",
    highlight: "oklch(0.68 0.22 220)",
    labelBorder: "oklch(0.60 0.22 260)",
  },
};

// ─── Hair color palettes ──────────────────────────────────────────────────────

const HAIR_COLORS: Record<
  HairColor,
  { main: string; dark: string; hi: string }
> = {
  brown: { main: "#7B4B2A", dark: "#4A2A10", hi: "#A06838" },
  black: { main: "#1A1A1A", dark: "#0A0A0A", hi: "#383838" },
  blonde: { main: "#D4A830", dark: "#8A6A10", hi: "#F0CC60" },
  grey: { main: "#888888", dark: "#555555", hi: "#AAAAAA" },
  "red-hair": { main: "#C03010", dark: "#7A1808", hi: "#E05028" },
  white: { main: "#E8E4DC", dark: "#BBBAB4", hi: "#FFFFFF" },
};

// ─── Style-specific base palettes ─────────────────────────────────────────────

/** warrior_A: Heavy Plate — dark steel grey */
const WARRIOR_A_BASE = {
  body: "oklch(0.38 0.02 230)",
  dark: "oklch(0.22 0.02 230)",
  highlight: "oklch(0.55 0.04 220)",
  accent: "oklch(0.62 0.10 50)",
};
/** warrior_B: Chainmail — silver-grey */
const WARRIOR_B_BASE = {
  body: "oklch(0.62 0.02 220)",
  dark: "oklch(0.40 0.02 220)",
  highlight: "oklch(0.80 0.02 220)",
  accent: "oklch(0.70 0.10 50)",
};
/** warrior_C: Leather — warm brown/tan */
const WARRIOR_C_BASE = {
  body: "oklch(0.52 0.08 60)",
  dark: "oklch(0.34 0.07 55)",
  highlight: "oklch(0.68 0.08 65)",
  accent: "oklch(0.65 0.08 75)",
};
/** mage_A: Long Robe — deep blue/purple */
const MAGE_A_BASE = {
  body: "oklch(0.35 0.20 270)",
  dark: "oklch(0.22 0.16 275)",
  highlight: "oklch(0.52 0.22 265)",
  accent: "oklch(0.65 0.22 220)",
};
/** mage_B: Battle Mage — lighter blue */
const MAGE_B_BASE = {
  body: "oklch(0.52 0.18 240)",
  dark: "oklch(0.34 0.14 245)",
  highlight: "oklch(0.68 0.18 235)",
  accent: "oklch(0.70 0.18 200)",
};
/** mage_C: Dark Cloak — near-black / dark grey */
const MAGE_C_BASE = {
  body: "oklch(0.22 0.02 260)",
  dark: "oklch(0.12 0.02 260)",
  highlight: "oklch(0.35 0.04 255)",
  accent: "oklch(0.55 0.16 290)",
};

/** Normalize legacy OutfitStyle to canonical form */
function normalizeStyle(style: OutfitStyle, cls: CharacterClass): OutfitStyle {
  if (style === "default") return cls === "warrior" ? "warrior_A" : "mage_A";
  if (style === "heavy") return "warrior_B";
  if (style === "light") return "warrior_C";
  if (style === "mystic") return "mage_B";
  if (style === "scholar") return "mage_C";
  return style;
}

/** Get base palette colors per style, tinted by outfitColor */
function getWarriorStyleColors(
  style: OutfitStyle,
  outfitColor: OutfitColor,
): { body: string; dark: string; highlight: string; accent: string } {
  const base =
    style === "warrior_B"
      ? WARRIOR_B_BASE
      : style === "warrior_C"
        ? WARRIOR_C_BASE
        : WARRIOR_A_BASE;
  const tint = OUTFIT_COLORS[outfitColor];
  // Blend: if not default, tint the body/dark/highlight
  if (outfitColor === "default") return base;
  return {
    body: tint.body,
    dark: tint.dark,
    highlight: tint.highlight,
    accent: base.accent,
  };
}

function getMageStyleColors(
  style: OutfitStyle,
  outfitColor: OutfitColor,
): { body: string; dark: string; highlight: string; accent: string } {
  const base =
    style === "mage_B"
      ? MAGE_B_BASE
      : style === "mage_C"
        ? MAGE_C_BASE
        : MAGE_A_BASE;
  const tint = MAGE_OUTFIT_COLORS[outfitColor];
  if (outfitColor === "default") return base;
  return {
    body: tint.body,
    dark: tint.dark,
    highlight: tint.highlight,
    accent: base.accent,
  };
}

function tileHash(tx: number, ty: number): number {
  let h = ((tx * 2654435761) ^ (ty * 2246822519)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h;
}

// ─── Light source glow helper ─────────────────────────────────────────────────
// Draws a soft radial glow at world-tile position (tx, ty) using camX/camY.
// glowColor: 6-digit hex (#rrggbb). baseAlpha: 0–1.
// playerTileX/Y: boosts opacity when player is within 4 tiles.
function drawLightSourceGlow(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  camX: number,
  camY: number,
  glowColor: string,
  baseAlpha: number,
  playerTileX: number,
  playerTileY: number,
): void {
  try {
    const cx = Math.floor(tx * TILE_SIZE - camX) + TILE_SIZE / 2;
    const cy = Math.floor(ty * TILE_SIZE - camY) + TILE_SIZE / 2;
    const glowR = TILE_SIZE * 3.5;
    const dist = Math.sqrt((playerTileX - tx) ** 2 + (playerTileY - ty) ** 2);
    const alpha = dist < 4 ? baseAlpha * 1.4 : baseAlpha;
    ctx.save();
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glowGrad.addColorStop(
      0.0,
      appendAlpha(glowColor, Math.min(0.6, alpha * 1.8)),
    );
    glowGrad.addColorStop(0.4, appendAlpha(glowColor, alpha * 0.7));
    glowGrad.addColorStop(1.0, appendAlpha(glowColor, 0));
    ctx.fillStyle = glowGrad;
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
    ctx.restore();
  } catch {
    /* non-fatal decoration */
  }
}

/** Convert a 6-digit hex color + alpha to rgba() string */
function appendAlpha(hex: string, alpha: number): string {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }
  return `rgba(255,220,153,${alpha.toFixed(3)})`;
}

// ─── Additive lighting layer ──────────────────────────────────────────────────
// Draws a dark overlay then punches holes for each light source.
// Overlapping sources create brighter areas (additive holes).
// At night (nightFactor ≥ 0.5) overlay is darker (up to 0.60 alpha).
// At full day the overlay is very faint (0.08 alpha).

interface LightSource {
  sx: number;
  sy: number; // screen centre
  radius: number; // pixels
  r: number;
  g: number;
  b: number;
  intensity: number; // 0-1 max alpha at centre
}

function drawLightingLayer(
  ctx: CanvasRenderingContext2D,
  lightSources: LightSource[],
  nightFactor: number,
): void {
  try {
    const overlayAlpha = 0.08 + nightFactor * 0.52; // 0.08 day → 0.60 night
    if (overlayAlpha < 0.06) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = CANVAS_W;
    offscreen.height = CANVAS_H;
    const off = offscreen.getContext("2d");
    if (!off) return;

    off.fillStyle = `rgba(0,0,0,${overlayAlpha.toFixed(3)})`;
    off.fillRect(0, 0, CANVAS_W, CANVAS_H);
    off.globalCompositeOperation = "destination-out";

    for (const ls of lightSources) {
      const grad = off.createRadialGradient(
        ls.sx,
        ls.sy,
        0,
        ls.sx,
        ls.sy,
        ls.radius,
      );
      grad.addColorStop(
        0,
        `rgba(${ls.r},${ls.g},${ls.b},${ls.intensity.toFixed(3)})`,
      );
      grad.addColorStop(
        0.5,
        `rgba(${ls.r},${ls.g},${ls.b},${(ls.intensity * 0.5).toFixed(3)})`,
      );
      grad.addColorStop(1, `rgba(${ls.r},${ls.g},${ls.b},0)`);
      off.fillStyle = grad;
      off.beginPath();
      off.arc(ls.sx, ls.sy, ls.radius, 0, Math.PI * 2);
      off.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();
  } catch {
    /* non-fatal — graceful degradation */
  }
}

/** Build a LightSource for a tile-positioned source. */
function makeTileLight(
  tx: number,
  ty: number,
  camX: number,
  camY: number,
  radiusTiles: number,
  r: number,
  g: number,
  b: number,
  intensity: number,
): LightSource {
  return {
    sx: Math.floor(tx * TILE_SIZE - camX) + TILE_SIZE / 2,
    sy: Math.floor(ty * TILE_SIZE - camY) + TILE_SIZE / 2,
    radius: radiusTiles * TILE_SIZE,
    r,
    g,
    b,
    intensity,
  };
}

// ─── Tile renderers ───────────────────────────────────────────────────────────

function drawGrassTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 4;
  const pulse = Math.sin(time * 0.0008 + tx * 0.3 + ty * 0.7) * 0.01;
  const shadeIdx = ((tx * 31 + ty * 17) & 0xff) % 3;
  const baseLightnessArr = [0.34, 0.38, 0.3, 0.35];
  const baseLightness = baseLightnessArr[variant]!;
  const shadedL =
    shadeIdx === 1
      ? baseLightness + 0.1
      : shadeIdx === 2
        ? baseLightness - 0.08
        : baseLightness;
  const l = Math.max(0.2, Math.min(0.44, shadedL + pulse));
  const sat =
    shadeIdx === 2
      ? [0.086, 0.099, 0.086, 0.097][variant]!
      : [0.095, 0.099, 0.086, 0.097][variant]!;
  const hue =
    shadeIdx === 2
      ? [148, 151, 145, 149][variant]!
      : [143, 146, 140, 144][variant]!;
  ctx.fillStyle = `oklch(${l.toFixed(3)} ${sat} ${hue})`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  {
    const mid = px + TILE_SIZE / 2;
    const midy = py + TILE_SIZE / 2;
    if ((tx * 3 + ty * 5) % 7 === 0) {
      ctx.fillStyle = "rgba(0,30,0,0.18)";
      ctx.fillRect(px, py, 10, 10);
    }
    if ((tx * 13 + ty * 3) % 11 === 0) {
      ctx.fillStyle = "#2a6a2a";
      ctx.fillRect(px + 4, py + 7, 1, 4);
      ctx.fillRect(px + 14, py + 5, 1, 4);
    }
    const tileVig = ctx.createRadialGradient(
      mid,
      midy,
      2,
      mid,
      midy,
      TILE_SIZE * 0.72,
    );
    tileVig.addColorStop(0, "rgba(0,0,0,0)");
    tileVig.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = tileVig;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  ctx.fillStyle = "oklch(1 0 0 / 0.05)";
  ctx.fillRect(px, py, TILE_SIZE, 1);
  ctx.fillStyle = "oklch(0 0 0 / 0.08)";
  ctx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
  ctx.strokeStyle = `oklch(${(l - 0.06).toFixed(3)} 0.06 145)`;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  const noiseColor =
    variant === 2 ? "oklch(0.20 0.07 145)" : "oklch(0.23 0.06 145)";
  ctx.fillStyle = noiseColor;
  ctx.fillRect(
    px + (((hash >> 4) & 0x1f) % (TILE_SIZE - 2)) + 1,
    py + (((hash >> 9) & 0x1f) % (TILE_SIZE - 2)) + 1,
    1,
    1,
  );
  ctx.fillRect(
    px + (((hash >> 14) & 0x1f) % (TILE_SIZE - 2)) + 1,
    py + (((hash >> 19) & 0x1f) % (TILE_SIZE - 2)) + 1,
    1,
    1,
  );

  if ((hash & 0xff) < 25) {
    const pbx = (((hash >> 8) & 0x1f) % (TILE_SIZE - 6)) + 3;
    const pby = (((hash >> 13) & 0x1f) % (TILE_SIZE - 6)) + 3;
    const pbSize = (hash & 1) === 0 ? 2 : 3;
    ctx.fillStyle = `oklch(${(l - 0.05).toFixed(3)} 0.04 145)`;
    ctx.fillRect(px + pbx, py + pby, pbSize, pbSize);
    ctx.fillStyle = `oklch(${(l + 0.04).toFixed(3)} 0.03 145)`;
    ctx.fillRect(px + pbx, py + pby, 1, 1);
  }

  const detailColor =
    variant === 1 ? "oklch(0.46 0.13 145)" : "oklch(0.42 0.11 145)";
  ctx.fillStyle = detailColor;
  if (variant === 0) {
    ctx.fillRect(px + 8, py + 9, 2, 4);
    ctx.fillRect(px + 11, py + 7, 2, 6);
    ctx.fillRect(px + 20, py + 11, 2, 4);
    ctx.fillStyle = "oklch(0.50 0.13 145)";
    ctx.fillRect(px + 11, py + 7, 2, 2);
  } else if (variant === 1) {
    for (const [ox, oy] of [
      [6, 8],
      [10, 12],
      [18, 6],
      [22, 20],
      [14, 18],
    ] as [number, number][])
      ctx.fillRect(px + ox, py + oy, 2, 2);
  } else if (variant === 2) {
    ctx.fillRect(px + 7, py + 10, 5, 1);
    ctx.fillRect(px + 9, py + 8, 1, 5);
    ctx.fillRect(px + 19, py + 20, 5, 1);
    ctx.fillRect(px + 21, py + 18, 1, 5);
  } else {
    ctx.fillRect(px + 5, py + 14, 3, 1);
    ctx.fillRect(px + 6, py + 13, 1, 3);
    ctx.fillRect(px + 22, py + 8, 3, 1);
    ctx.fillRect(px + 23, py + 7, 1, 3);
    ctx.fillRect(px + 14, py + 22, 3, 1);
    ctx.fillRect(px + 15, py + 21, 1, 3);
  }

  // ── Micro-detail: tiny flower at fixed positions ──
  if ((tx * 7 + ty * 13) % 20 === 0) {
    const isPink = (hash & 0x4) === 0;
    const fx = px + (((hash >> 5) & 0xf) % (TILE_SIZE - 8)) + 4;
    const fy = py + (((hash >> 10) & 0xf) % (TILE_SIZE - 8)) + 4;
    ctx.fillStyle = isPink ? "#fffde0" : "#ffff88";
    ctx.fillRect(fx, fy, 2, 2);
    ctx.fillStyle = isPink ? "#f0c0c0" : "#c8c800";
    ctx.fillRect(fx - 1, fy, 1, 1);
    ctx.fillRect(fx + 2, fy, 1, 1);
    ctx.fillRect(fx, fy - 1, 1, 1);
    ctx.fillRect(fx, fy + 2, 1, 1);
  }

  // ── Micro-detail: tiny pebble at fixed positions ──
  if ((tx * 3 + ty * 11) % 15 === 0) {
    const gx = px + (((hash >> 7) & 0xf) % (TILE_SIZE - 6)) + 3;
    const gy = py + (((hash >> 12) & 0xf) % (TILE_SIZE - 6)) + 3;
    ctx.fillStyle = "rgba(120,115,110,0.75)";
    ctx.fillRect(gx, gy, 2, 2);
    ctx.fillStyle = "rgba(160,155,150,0.6)";
    ctx.fillRect(gx, gy, 1, 1);
  }
}

function drawStoneTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const colors = TILE_COLORS[TileType.STONE];
  const hash = tileHash(tx, ty);
  ctx.fillStyle = colors.base;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "oklch(1 0 0 / 0.07)";
  ctx.fillRect(px, py, TILE_SIZE, 2);
  ctx.fillRect(px, py, 2, TILE_SIZE);
  ctx.fillStyle = "oklch(0 0 0 / 0.15)";
  ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
  ctx.fillRect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);
  ctx.strokeStyle = "oklch(0.20 0.01 200)";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.45;
  ctx.strokeRect(px + 2.5, py + 2.5, TILE_SIZE - 5, TILE_SIZE - 5);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.detail;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  for (let i = 6; i < TILE_SIZE; i += 6) {
    ctx.moveTo(px + 1, py + i);
    ctx.lineTo(px + TILE_SIZE - 1, py + i);
  }
  const off = hash % 2 === 0 ? 0 : 3;
  for (let i = 5 + off; i < TILE_SIZE; i += 8) {
    ctx.moveTo(px + i, py + 1);
    ctx.lineTo(px + i, py + TILE_SIZE - 1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.detail;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 2, py + 10);
  ctx.lineTo(px + TILE_SIZE - 2, py + 10);
  ctx.moveTo(px + 2, py + 22);
  ctx.lineTo(px + TILE_SIZE - 2, py + 22);
  ctx.moveTo(px + 16, py + 2);
  ctx.lineTo(px + 16, py + 10);
  ctx.moveTo(px + 10, py + 10);
  ctx.lineTo(px + 10, py + 22);
  ctx.moveTo(px + 22, py + 10);
  ctx.lineTo(px + 22, py + 22);
  ctx.moveTo(px + 16, py + 22);
  ctx.lineTo(px + 16, py + TILE_SIZE - 2);
  ctx.stroke();
  ctx.strokeStyle = "oklch(0.16 0.01 200)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 0.75, py + 0.75, TILE_SIZE - 1.5, TILE_SIZE - 1.5);
  ctx.strokeStyle = "oklch(0.38 0.03 200)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(px + 14, py + 13);
  ctx.lineTo(px + 18, py + 19);
  ctx.stroke();
  // Subtle tile vignette — darker edges, lighter center for depth
  {
    const smid = px + TILE_SIZE / 2;
    const smidy = py + TILE_SIZE / 2;
    const stileVig = ctx.createRadialGradient(
      smid,
      smidy,
      1,
      smid,
      smidy,
      TILE_SIZE * 0.72,
    );
    stileVig.addColorStop(0, "rgba(255,255,255,0.03)");
    stileVig.addColorStop(0.5, "rgba(0,0,0,0)");
    stileVig.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = stileVig;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }
}

function drawWallTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  ty: number,
): void {
  const colors = TILE_COLORS[TileType.WALL];
  ctx.fillStyle = colors.base;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  const rowOffset = ty % 2 === 0 ? 0 : 16;
  for (let row = 0; row < 2; row++) {
    const by = py + row * 10 + (row === 0 ? 4 : 16);
    for (let col = -1; col <= 2; col++) {
      const bx = px + col * 16 + rowOffset;
      ctx.fillStyle = "oklch(0.20 0.01 240)";
      ctx.fillRect(bx + 1, by + 1, 14, 8);
      ctx.fillStyle = "oklch(0.30 0.015 240)";
      ctx.fillRect(bx + 1, by + 1, 14, 2);
      ctx.fillStyle = "oklch(0.26 0.012 240)";
      ctx.fillRect(bx + 1, by + 1, 2, 8);
      ctx.fillStyle = "oklch(0.06 0 0)";
      ctx.fillRect(bx + 1, by + 8, 14, 2);
      ctx.fillRect(bx + 14, by + 1, 2, 8);
    }
  }
  ctx.fillStyle = "oklch(0.28 0.012 240)";
  ctx.fillRect(px, py, TILE_SIZE, 3);
  ctx.fillStyle = "oklch(0.35 0.015 240)";
  ctx.fillRect(px, py, TILE_SIZE, 1);
  ctx.strokeStyle = "oklch(0.06 0 0)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);
  ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

// drawTownFloorTile, drawTownWallTile removed — buildings/interiors removed per refactor

function drawTownPathTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;
  const bl = [0.58, 0.62, 0.55][variant];
  ctx.fillStyle = `oklch(${bl} 0.03 65)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Recessed groove border
  ctx.strokeStyle = "oklch(0.45 0.025 62)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
  // Cobblestone pattern
  const cbX = ty % 2 === 0 ? 0 : 8;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = px + col * 12 + cbX - 2;
      const cy = py + row * 10 + 6;
      ctx.fillStyle = `oklch(${(bl - 0.03).toFixed(3)} 0.028 64)`;
      ctx.fillRect(cx + 1, cy + 1, 10, 8);
      ctx.fillStyle = `oklch(${(bl + 0.06).toFixed(3)} 0.035 68)`;
      ctx.fillRect(cx + 1, cy + 1, 10, 1);
      ctx.fillRect(cx + 1, cy + 1, 1, 8);
      ctx.fillStyle = `oklch(${(bl - 0.08).toFixed(3)} 0.02 60)`;
      ctx.fillRect(cx + 1, cy + 8, 10, 1);
      ctx.fillRect(cx + 10, cy + 1, 1, 8);
    }
  }
  // Wear marks
  if ((hash & 0x1f) < 6) {
    ctx.fillStyle = "oklch(0.50 0.02 62)";
    ctx.fillRect(
      px + (((hash >> 5) & 0x1f) % (TILE_SIZE - 6)) + 3,
      py + (((hash >> 10) & 0x1f) % (TILE_SIZE - 4)) + 2,
      3,
      1,
    );
  }
  ctx.strokeStyle = "oklch(0.48 0.025 62)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

// drawBuildingTile removed — buildings rendered as decorative objects, not wall-box tiles

/**
 * Draw the appropriate background for tiles outside map boundaries.
 * Floating Ruins → sky/clouds; Boss Chamber → dark stormy water;
 * Cursed Swamp → murky swamp water; underground → solid dark stone;
 * everything else → animated deep ocean water.
 */
function drawOutOfBoundsTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
  zoneId: ZoneId,
): void {
  if (zoneId === "floating_ruins") {
    drawVoidDropTile(ctx, px, py, tx, ty, time);
    return;
  }
  if (UNDERGROUND_ZONES.has(zoneId)) {
    // Underground zones — dark stone border
    const hash = tileHash(tx, ty);
    ctx.fillStyle =
      (hash & 1) === 0 ? "oklch(0.10 0.01 240)" : "oklch(0.08 0 0)";
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    return;
  }
  if (zoneId === "cursed_swamp") {
    drawSwampWaterTile(ctx, px, py, tx, ty, time);
    return;
  }
  drawDeepWaterTile(ctx, px, py, tx, ty, time, zoneId);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: TileTypeValue,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
  portalColor?: string,
  zoneId: ZoneId = "meadow_hub",
  tiles?: TileTypeValue[][],
): void {
  switch (tile) {
    case TileType.GRASS:
      drawGrassTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.STONE:
      drawStoneTile(ctx, px, py, tx, ty);
      // Subtle crack overlay in ruins zones for weathered look
      if (RUINS_ZONES.has(zoneId)) drawRuinCrackOverlay(ctx, px, py, tx, ty);
      break;
    case TileType.WALL:
      drawWallTile(ctx, px, py, ty);
      break;
    // TOWN_FLOOR, TOWN_WALL, BUILDING, DOOR, INTERIOR_FLOOR, INTERIOR_WALL
    // — rendered as grass/path fallback (no longer placed in open-world zones)
    case TileType.TOWN_FLOOR:
    case TileType.INTERIOR_FLOOR:
      drawGrassTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.TOWN_WALL:
    case TileType.INTERIOR_WALL:
    case TileType.BUILDING:
      drawWallTile(ctx, px, py, ty);
      break;
    case TileType.TOWN_PATH:
    case TileType.DOOR:
      drawTownPathTile(ctx, px, py, tx, ty);
      break;
    case TileType.WATER:
      drawWaterTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.FLOWER:
      drawFlowerTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.PATH:
      drawPathTile(ctx, px, py, tx, ty);
      break;
    case TileType.PORTAL:
      drawPortalTile(ctx, px, py, time, portalColor);
      break;
    case TileType.TREE:
      drawTreeTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.DEEP_FOREST:
      drawDeepForestTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.RIVER:
      drawEnhancedRiverTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.CRYSTAL:
      drawCrystalTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.STAIR:
      drawStairTile(ctx, px, py, time);
      break;
    case TileType.STAIR_UP:
      drawStairUpTile(ctx, px, py, time);
      break;
    case TileType.LANTERN:
      drawLanternTile(ctx, px, py, tx, time);
      break;
    case TileType.BENCH:
      drawBenchTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.POND:
      drawPondTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.FENCE:
      drawFenceTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.DUNGEON_FLOOR:
      drawDungeonFloorTile(ctx, px, py, tx, ty);
      break;
    case TileType.DUNGEON_WALL:
      drawDungeonWallTile(ctx, px, py, tx, ty);
      break;
    case TileType.CAVE_FLOOR:
      drawCaveFloorTile(ctx, px, py, tx, ty);
      break;
    case TileType.CAVE_WALL:
      drawCaveWallTile(ctx, px, py, tx, ty);
      break;
    case TileType.TRANSITION_MARKER: {
      // Zone border marker — draw as glowing amber-gold ground tile
      drawGrassTile(ctx, px, py, tx, ty, time);
      ctx.save();
      const tmPulse = Math.sin(time * 0.004 + tx * 0.5 + ty * 0.4) * 0.3 + 0.7;
      ctx.globalAlpha = 0.35 * tmPulse;
      ctx.fillStyle = "oklch(0.78 0.22 76)";
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.globalAlpha = 1;
      ctx.restore();
      break;
    }
    case TileType.BEACH:
      drawBeachTile(ctx, px, py, tx, ty, zoneId, tiles);
      break;
    case TileType.DEEP_WATER:
      drawDeepWaterTile(ctx, px, py, tx, ty, time, zoneId);
      break;
    case TileType.FOAM:
      drawFoamTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.SWAMP_WATER:
      drawSwampWaterTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.STONE_PLATFORM:
      drawStonePlatformTile(ctx, px, py, tx, ty);
      break;
    case TileType.RUNE_FLOOR:
      drawRuneFloorTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.VOID_DROP:
      drawVoidDropTile(ctx, px, py, tx, ty, time);
      break;
    // ── Pirate Island tiles ──
    case TileType.BRIDGE:
      drawBridgeTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.SAND:
      drawSandTile(ctx, px, py, tx, ty, time);
      break;
    case TileType.PALM_TREE:
      drawPalmTreeTile(ctx, px, py, tx, ty, time);
      break;
    // ── Cursed Galleon (ship) tiles ──
    case TileType.WOOD_PLANK:
      drawWoodPlankTile(ctx, px, py, tx, ty);
      break;
    case TileType.CAPTAIN_FLOOR:
      drawCaptainFloorTile(ctx, px, py, tx, ty);
      break;
    case TileType.SHIP_RAIL:
      drawShipRailTile(ctx, px, py, tx, ty);
      break;
    case TileType.SHIP_WATER:
      drawDeepWaterTile(ctx, px, py, tx, ty, time, "pirate_island");
      break;
    default:
      ctx.fillStyle = "oklch(0.08 0 0)";
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }
}

// ─── New tile renderers ───────────────────────────────────────────────────────

function drawWaterTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  const wave = Math.sin(time * 0.002 + tx * 0.4 + ty * 0.6) * 0.04;
  const base = 0.42 + wave;
  ctx.fillStyle = `oklch(${base.toFixed(3)} 0.12 210)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Shimmer streaks
  const shiftedTime = Math.floor(time / 400) % 2;
  ctx.fillStyle = "oklch(0.55 0.14 200 / 0.5)";
  const sx1 = (((hash >> 2) & 0x1f) % (TILE_SIZE - 6)) + px + 2;
  const sx2 = (((hash >> 7) & 0x1f) % (TILE_SIZE - 8)) + px + 3;
  ctx.fillRect(sx1 + shiftedTime * 2, py + 6, 6, 2);
  ctx.fillRect(sx2 - shiftedTime, py + 16, 8, 2);
  ctx.fillRect(sx1 + 2, py + 24, 5, 1);
  // Top highlight
  ctx.fillStyle = "oklch(1 0 0 / 0.12)";
  ctx.fillRect(px, py, TILE_SIZE, 2);
  ctx.strokeStyle = "oklch(0.35 0.10 220)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // ── Lily pad at seed positions (tx*17+ty*13) mod 30 === 0 ──
  if ((tx * 17 + ty * 13) % 30 === 0) {
    const lpx = px + (((hash >> 4) & 0xf) % (TILE_SIZE - 16)) + 8;
    const lpy = py + (((hash >> 8) & 0xf) % (TILE_SIZE - 12)) + 6;
    // Lily pad disc
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "#2a6e2a";
    ctx.beginPath();
    ctx.ellipse(lpx, lpy, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Notch cut-out
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = `oklch(${base.toFixed(3)} 0.12 210)`;
    ctx.beginPath();
    ctx.moveTo(lpx, lpy);
    ctx.arc(lpx, lpy, 6, -0.4, 0.4);
    ctx.closePath();
    ctx.fill();
    // Highlight on top
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#44aa44";
    ctx.beginPath();
    ctx.ellipse(lpx - 1, lpy - 1, 3, 2, -0.4, 0, Math.PI);
    ctx.fill();
    // Tiny flower on some lily pads
    if ((hash & 0x3) === 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#fff0a0";
      ctx.beginPath();
      ctx.arc(lpx, lpy - 1, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawFlowerTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  drawGrassTile(ctx, px, py, tx, ty, time);
  // Flower decoration
  const hash = tileHash(tx, ty);
  const isPink = (hash & 1) === 0;
  const flowerColor = isPink ? "oklch(0.72 0.18 10)" : "oklch(0.75 0.16 90)";
  const stemColor = "oklch(0.42 0.12 145)";
  const fx = (((hash >> 3) & 0x1f) % 18) + px + 7;
  const fy = (((hash >> 8) & 0x1f) % 14) + py + 9;
  ctx.fillStyle = stemColor;
  ctx.fillRect(fx + 1, fy + 4, 2, 5);
  ctx.fillStyle = flowerColor;
  ctx.fillRect(fx, fy, 2, 2);
  ctx.fillRect(fx + 2, fy, 2, 2);
  ctx.fillRect(fx + 1, fy - 1, 2, 2);
  ctx.fillRect(fx + 1, fy + 2, 2, 2);
  ctx.fillStyle = "oklch(1 0 0 / 0.8)";
  ctx.fillRect(fx + 1, fy + 1, 2, 1);
}

function drawPathTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;
  const bl = [0.58, 0.6, 0.56][variant];
  ctx.fillStyle = `oklch(${bl} 0.07 78)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // ── Lighter tan center strip ──
  ctx.fillStyle = "rgba(255,240,200,0.12)";
  ctx.fillRect(px + 4, py + TILE_SIZE / 2 - 1, TILE_SIZE - 8, 2);

  // ── 3px darker inside border ──
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(px, py, TILE_SIZE, 3);
  ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
  ctx.fillRect(px, py, 3, TILE_SIZE);
  ctx.fillRect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);

  // Top-lit edge highlight
  ctx.fillStyle = "oklch(1 0 0 / 0.10)";
  ctx.fillRect(px, py, TILE_SIZE, 2);
  ctx.fillRect(px, py, 2, TILE_SIZE);
  // Bottom shadow
  ctx.fillStyle = "oklch(0 0 0 / 0.15)";
  ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
  ctx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);
  // Path surface detail
  if ((hash & 0xf) < 5) {
    ctx.fillStyle = "oklch(0.52 0.05 78)";
    ctx.fillRect(
      px + (((hash >> 4) & 0x1f) % (TILE_SIZE - 6)) + 3,
      py + (((hash >> 9) & 0x1f) % (TILE_SIZE - 4)) + 2,
      3,
      1,
    );
  }
  // ── Pebble details at (tx*5+ty*9) mod 8 === 0 ──
  if ((tx * 5 + ty * 9) % 8 === 0) {
    ctx.fillStyle = "oklch(0.44 0.03 75)";
    ctx.fillRect(
      px + (((hash >> 6) & 0x1f) % (TILE_SIZE - 6)) + 3,
      py + (((hash >> 11) & 0x1f) % (TILE_SIZE - 6)) + 3,
      2,
      2,
    );
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(
      px + (((hash >> 6) & 0x1f) % (TILE_SIZE - 6)) + 3,
      py + (((hash >> 11) & 0x1f) % (TILE_SIZE - 6)) + 3,
      1,
      1,
    );
  }
  // ── Horizontal grain lines ──
  if ((hash & 0x7) < 3) {
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    const grainY = py + 4 + ((hash >> 3) & 0x7) * 3;
    if (grainY < py + TILE_SIZE - 4)
      ctx.fillRect(px + 2, grainY, TILE_SIZE - 4, 1);
  }
  // Occasional pebble detail (original)
  if ((hash & 0x1f) < 4) {
    ctx.fillStyle = "oklch(0.48 0.04 75)";
    ctx.fillRect(
      px + (((hash >> 12) & 0x1f) % (TILE_SIZE - 8)) + 4,
      py + (((hash >> 17) & 0x1f) % (TILE_SIZE - 6)) + 3,
      2,
      2,
    );
  }
}

function drawPortalTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  time: number,
  portalColor = "#aa44ff",
): void {
  ctx.save();
  const pulse = Math.sin(time * 0.004) * 0.5 + 0.5;
  const spin = (time * 0.0018) % (Math.PI * 2);
  // Base dark tile
  ctx.fillStyle = "oklch(0.08 0.04 270)";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const outerR = TILE_SIZE / 2 - 2 + pulse * 2;

  // Outer ambient glow (large, soft)
  ctx.globalAlpha = 0.16 + pulse * 0.12;
  const outerGrad = ctx.createRadialGradient(
    cx,
    cy,
    outerR * 0.3,
    cx,
    cy,
    outerR * 1.4,
  );
  outerGrad.addColorStop(0, portalColor);
  outerGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = outerGrad;
  ctx.fillRect(px - 4, py - 4, TILE_SIZE + 8, TILE_SIZE + 8);

  // Swirling outer glow
  ctx.globalAlpha = 0.22 + pulse * 0.18;
  ctx.fillStyle = portalColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy, outerR, outerR * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rotating arc segments (3 arcs evenly spaced)
  for (let i = 0; i < 3; i++) {
    const arcStart = spin + (i / 3) * Math.PI * 2;
    const arcEnd = arcStart + 1.0;
    ctx.globalAlpha = 0.55 + pulse * 0.3;
    ctx.strokeStyle = portalColor;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * 0.8, arcStart, arcEnd);
    ctx.stroke();
    // Outer thinner arc
    ctx.globalAlpha = 0.3 + pulse * 0.2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, arcStart + 0.4, arcEnd + 0.6);
    ctx.stroke();
  }

  // Inner fill
  ctx.globalAlpha = 0.45 + pulse * 0.25;
  ctx.fillStyle = portalColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy, outerR * 0.52, outerR * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bright center core
  ctx.globalAlpha = 0.75 + pulse * 0.2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx, cy, outerR * 0.22, outerR * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sparkle dots around perimeter (8 positions, some animated)
  ctx.globalAlpha = 1;
  const sparkleCount = 8;
  for (let i = 0; i < sparkleCount; i++) {
    const angle = spin * 0.7 + (i / sparkleCount) * Math.PI * 2;
    const sparkR = outerR + 2 + Math.sin(time * 0.003 + i) * 2;
    const sx = cx + Math.cos(angle) * sparkR;
    const sy = cy + Math.sin(angle) * sparkR * 0.6;
    const sparkAlpha = Math.sin(time * 0.004 + i * 0.8) * 0.4 + 0.6;
    ctx.globalAlpha = sparkAlpha;
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : portalColor;
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
  }
  // 4 bright star sparkles
  for (let i = 0; i < 4; i++) {
    const sAngle = spin * 1.3 + (i / 4) * Math.PI * 2;
    const sr = outerR * 0.95;
    const sx = cx + Math.cos(sAngle) * sr;
    const sy = cy + Math.sin(sAngle) * sr * 0.6;
    const sa = Math.sin(time * 0.006 + i * 1.5) * 0.5 + 0.5;
    ctx.globalAlpha = sa;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 2.5, sy);
    ctx.lineTo(sx + 2.5, sy);
    ctx.moveTo(sx, sy - 2.5);
    ctx.lineTo(sx, sy + 2.5);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  // Border
  ctx.strokeStyle = "oklch(0.35 0.12 265)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  ctx.restore();
}

// drawDoorTile removed — door tiles now render as path (transition handled by world.ts)

function drawTreeTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time = 0,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;

  // Ground base under tree
  ctx.fillStyle = "oklch(0.26 0.07 145)";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // ── Ground shadow ellipse below trunk ──
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  ctx.ellipse(px + TILE_SIZE / 2, py + TILE_SIZE - 5, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Trunk: tapered brown pillar
  ctx.fillStyle = "#5C3D1A";
  ctx.fillRect(px + 14, py + 19, 5, 13);
  ctx.fillStyle = "#7A5228";
  ctx.fillRect(px + 14, py + 19, 2, 13);
  // Roots hint
  ctx.fillStyle = "#4A2E10";
  ctx.fillRect(px + 12, py + 29, 3, 3);
  ctx.fillRect(px + 18, py + 29, 3, 3);

  // ── Slow canopy sway: 1px left/right, 3s cycle ──
  const sway = Math.round(Math.sin(time / 3000 + tx * 0.7 + ty * 0.5) * 1);

  // Canopy: 3-tone shading per spec
  const outerGreen = ["#1e5c1e", "#1a5418", "#225e22"][variant]!;
  const midGreen = ["#2d7a2d", "#267025", "#348034"][variant]!;
  const topGreen = ["#4a9a4a", "#408e40", "#52a252"][variant]!;
  const shimmer = [
    "rgba(90,160,70,0.5)",
    "rgba(70,140,55,0.45)",
    "rgba(95,165,75,0.5)",
  ][variant]!;

  const cx = px + TILE_SIZE / 2 + sway;
  const cy = py + 13;

  ctx.fillStyle = outerGreen;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = midGreen;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 11, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = topGreen;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 2, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top-lit sparkle highlight
  ctx.fillStyle = shimmer;
  ctx.beginPath();
  const hlx = cx - 3 + (hash & 3);
  ctx.ellipse(hlx, cy - 4, 4, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();

  void tx;
  void ty;
}

function drawDeepForestTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  const pulse = Math.sin(time * 0.001 + tx * 0.3 + ty * 0.4) * 0.015;
  const l = Math.max(0.14, Math.min(0.24, 0.2 + pulse));
  ctx.fillStyle = `oklch(${l.toFixed(3)} 0.07 145)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Dark undergrowth
  if ((hash & 0x3) < 2) {
    ctx.fillStyle = "oklch(0.18 0.06 142)";
    ctx.fillRect(
      px + (((hash >> 4) & 0x1f) % (TILE_SIZE - 6)) + 3,
      py + (((hash >> 9) & 0x1f) % (TILE_SIZE - 6)) + 3,
      6,
      5,
    );
  }
  ctx.strokeStyle = "oklch(0.16 0.05 145)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

// ─── Enhanced River / Water tile ─────────────────────────────────────────────

function drawEnhancedRiverTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  _ty: number,
  time: number,
): void {
  // Base water color
  const wave = Math.sin(time * 0.002 + tx * 0.5) * 0.03;
  const base = 0.4 + wave;
  ctx.fillStyle = `oklch(${base.toFixed(3)} 0.14 215)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Animated wave lines using sine
  const wavePhase = (time * 0.001) % (2 * Math.PI);
  ctx.save();
  ctx.strokeStyle = "#5599BB";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  // Wave 1
  ctx.beginPath();
  for (let x = 0; x <= TILE_SIZE; x++) {
    const wx = px + x;
    const wy =
      py +
      TILE_SIZE * 0.35 +
      Math.sin(wavePhase + (tx + x / TILE_SIZE) * 2.5) * 1.5;
    if (x === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();
  // Wave 2
  ctx.beginPath();
  for (let x = 0; x <= TILE_SIZE; x++) {
    const wx = px + x;
    const wy =
      py +
      TILE_SIZE * 0.65 +
      Math.sin(wavePhase + (tx + x / TILE_SIZE) * 2.5 + 1.2) * 1.5;
    if (x === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();
  ctx.restore();
  // Top shimmer
  ctx.fillStyle = "rgba(200,230,255,0.12)";
  ctx.fillRect(px, py, TILE_SIZE, 2);
  ctx.strokeStyle = "oklch(0.35 0.10 220)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

// ─── Underground atmosphere ───────────────────────────────────────────────────

const UNDERGROUND_ZONES = new Set<ZoneId>([
  "hub_basement",
  "wilderness_dungeon",
  "forest_dungeon",
  "bat_cave",
  "deep_cave",
  "cave_interior",
]);

const FOREST_ZONES = new Set<ZoneId>([
  "forest_depths",
  "wolf_forest",
  "bear_forest",
  "dark_forest",
  "tiger_jungle",
]);

const RUINS_ZONES = new Set<ZoneId>([
  "ancient_ruins",
  "ancient_ruins_deep",
  "crystal_ruins",
  "goblin_warrens",
  "cyclops_lair",
]);

/** Overlay subtle cracks on ruins/stone tiles for a weathered, ancient look (~10% opacity) */
function drawRuinCrackOverlay(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const hash = tileHash(tx, ty);
  if ((hash & 0x3) === 0) return; // ~25% of tiles get cracks — keep it sparse
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  // Primary crack
  const x0 = px + 3 + (hash & 0xf);
  const y0 = py + 2 + ((hash >> 4) & 0xf);
  const x1 = px + 12 + ((hash >> 8) & 0xf);
  const y1 = py + 18 + ((hash >> 12) & 0xb);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  // Branch crack
  if ((hash & 0x7) < 4) {
    const bx = (x0 + x1) / 2;
    const by = (y0 + y1) / 2;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + ((hash >> 6) & 0x7) - 3, by + ((hash >> 9) & 0x7) + 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Returns the CSS class for a DOM overlay layer above the canvas */
function getZoneAtmosphereClass(zoneId: ZoneId): string | null {
  if (UNDERGROUND_ZONES.has(zoneId)) return "zone-atmosphere-cave";
  if (FOREST_ZONES.has(zoneId)) return "zone-atmosphere-forest";
  if (RUINS_ZONES.has(zoneId)) return "zone-atmosphere-ruins";
  return null;
}

function drawUndergroundAtmosphere(
  ctx: CanvasRenderingContext2D,
  playerScreenX: number,
  playerScreenY: number,
): void {
  // Torch-light circle around player
  const torchX = playerScreenX + TILE_SIZE / 2;
  const torchY = playerScreenY + TILE_SIZE / 2;
  const torchGrad = ctx.createRadialGradient(
    torchX,
    torchY,
    0,
    torchX,
    torchY,
    140,
  );
  torchGrad.addColorStop(0, "rgba(0,0,0,0)");
  torchGrad.addColorStop(0.55, "rgba(0,0,0,0)");
  torchGrad.addColorStop(0.82, "rgba(0,0,0,0.25)");
  torchGrad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.save();
  ctx.fillStyle = torchGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
  // Full-canvas vignette (edges extremely dark)
  const vignGrad = ctx.createRadialGradient(
    CANVAS_W / 2,
    CANVAS_H / 2,
    Math.min(CANVAS_W, CANVAS_H) * 0.28,
    CANVAS_W / 2,
    CANVAS_H / 2,
    Math.max(CANVAS_W, CANVAS_H) * 0.72,
  );
  vignGrad.addColorStop(0, "rgba(0,0,5,0)");
  vignGrad.addColorStop(1, "rgba(0,0,5,0.55)");
  ctx.save();
  ctx.fillStyle = vignGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function drawSurfaceAtmosphere(
  ctx: CanvasRenderingContext2D,
  zoneId: ZoneId,
  timestamp: number,
): void {
  // ── Day/night cycle ──────────────────────────────────────────────────────────
  // Full cycle = 8 minutes. time 0.0–0.5 = day, 0.5–0.75 = dusk→night, 0.75–1.0 = night
  const CYCLE_MS = 8 * 60 * 1000;
  const t = (timestamp % CYCLE_MS) / CYCLE_MS; // 0..1
  // Night factor: 0 during day, ramps to 1 during night (0.75–1.0)
  const nightFactor =
    t < 0.5
      ? 0
      : t < 0.75
        ? (t - 0.5) / 0.25 // dusk: 0→1
        : 1; // full night
  // Sunset factor: peaks at t=0.8 (middle of dusk→night window)
  const sunsetFactor =
    t >= 0.6 && t <= 0.95 ? Math.sin(((t - 0.6) / 0.35) * Math.PI) : 0;

  // Light vignette for all surface zones
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const radius = Math.max(CANVAS_W, CANVAS_H) * 0.75;
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.65, "rgba(0,0,0,0.05)");
  grad.addColorStop(1, "rgba(0,0,0,0.15)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Meadow Hub: warm golden-amber tint, stronger at sunset ──
  if (zoneId === "meadow_hub") {
    const meadowAlpha = 0.06 + sunsetFactor * 0.06; // 0.06 base → 0.12 at sunset
    ctx.globalAlpha = meadowAlpha;
    ctx.fillStyle = `rgb(255,${Math.round(200 - sunsetFactor * 30)},80)`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Crystal ruins: subtle purple tint
  if (zoneId === "crystal_ruins") {
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "rgb(50,0,80)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Ancient ruins: warm sandy tint — rgba(20,10,0,0.18)
  if (zoneId === "ancient_ruins") {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgb(20,10,0)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Wolf forest / tiger jungle / forest depths: subtle green tint
  if (
    zoneId === "wolf_forest" ||
    zoneId === "tiger_jungle" ||
    zoneId === "forest_depths"
  ) {
    ctx.globalAlpha = 0.12; // Forest: rgba(0,20,0,0.12)
    ctx.fillStyle = "rgb(0,20,0)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Bear forest: stronger green tint
  if (zoneId === "bear_forest") {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "rgb(0,20,0)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Cyclops lair: red threatening tint — Boss Chamber rgba(30,0,0,0.30)
  if (zoneId === "cyclops_lair") {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "rgb(30,0,0)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Dark forest: heavy near-black green + subtle blue-grey fog — rgba(0,0,20,0.30)
  if (zoneId === "dark_forest") {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "rgb(0,0,20)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "rgb(20,30,60)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Ancient ruins deep: cold desaturated grey-blue
  if (zoneId === "ancient_ruins_deep") {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgb(10,10,20)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Cursed swamp: sickly yellow-green tint + fog
  if (zoneId === "cursed_swamp") {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "rgb(180, 200, 50)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Floating ruins: sky blue tint
  if (zoneId === "floating_ruins") {
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "rgb(135, 206, 235)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Cursed Galleon: dark ship-hold ambience — faint blue-grey sea haze
  if (zoneId === "cursed_galleon") {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "rgb(10, 14, 22)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Aurelion: magical purple-blue ambient — rgba(30,0,50,0.18)
  if (zoneId === "aurelion") {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgb(30,0,50)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Thunder Isle: dark stormy electric atmosphere
  if (zoneId === "thunder_isle") {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgb(8,8,22)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "rgb(40,20,80)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Pirate Island: warm tropical sunlight, slightly warm-yellow
  if (zoneId === "pirate_island") {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "rgb(255,180,50)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Cave zones: cool blue ambient — rgba(0,0,30,0.40)
  if (
    zoneId === "bat_cave" ||
    zoneId === "deep_cave" ||
    zoneId === "cave_interior" ||
    zoneId === "hub_basement"
  ) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "rgb(0,0,30)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // ── Night overlay — increases darkness to 0.45 during night, desaturated blue-black ──
  if (nightFactor > 0) {
    ctx.globalAlpha = nightFactor * 0.45;
    // Slightly desaturated dark blue — more dramatic than plain black
    ctx.fillStyle = "rgb(5,8,18)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  ctx.restore();
}

// ─── Zone particle effects ────────────────────────────────────────────────────

function drawSwampFog(ctx: CanvasRenderingContext2D, timestamp: number): void {
  // Skip on very slow devices — decorative only
  if (shouldSkipDecorativeParticles()) return;
  try {
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const seed = i * 1234;
      const speed = 0.018 + (seed % 4) * 0.003;
      const x = CANVAS_W - ((seed * 17 + timestamp * speed) % (CANVAS_W + 100));
      const y = 50 + (seed % (CANVAS_H - 100));
      const wobble = Math.sin(timestamp * 0.0004 + i * 0.8) * 15;
      const alpha = 0.08 + Math.sin(timestamp * 0.0006 + i) * 0.05;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = "rgba(150, 160, 100, 1)";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + wobble,
        42 + (seed % 14),
        18 + (seed % 10),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

function drawFloatingRuinsWind(
  ctx: CanvasRenderingContext2D,
  timestamp: number,
): void {
  // Skip on very slow devices — decorative only
  if (shouldSkipDecorativeParticles()) return;
  try {
    ctx.save();
    for (let i = 0; i < 25; i++) {
      const seed = i * 4567;
      const speed = 0.07 + (seed % 5) * 0.022;
      const x = CANVAS_W - ((seed * 13 + timestamp * speed) % (CANVAS_W + 50));
      const y = 20 + (seed % (CANVAS_H - 40));
      const len = 3 + (seed % 5);
      ctx.globalAlpha = 0.3 + Math.sin(timestamp * 0.003 + i) * 0.15;
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

// ─── Spider monster sprite ────────────────────────────────────────────────────

function drawSpider(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  const bodyColor = hitFlash ? "#c06050" : "#4A2E1A";
  const legColor = hitFlash ? "#d08070" : "#3A2010";
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2 + 2;
  const legsUp = animFrame % 2 === 0;
  // 8 legs at 45° intervals
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const legDroop = legsUp ? (i % 2 === 0 ? -2 : 2) : i % 2 === 0 ? 2 : -2;
    const ex = cx + Math.cos(angle) * 13;
    const ey = cy + Math.sin(angle) * 11 + legDroop;
    ctx.strokeStyle = legColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 5, cy + Math.sin(angle) * 4);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  // Body (dark brown circle)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Abdomen
  ctx.fillStyle = hitFlash ? "#c05040" : "#5A1A08";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes (tiny)
  if (!hitFlash) {
    ctx.fillStyle = "#FF3300";
    ctx.fillRect(Math.round(cx) - 3, Math.round(cy) - 2, 2, 2);
    ctx.fillRect(Math.round(cx) + 1, Math.round(cy) - 2, 2, 2);
  }
}

// ─── Bat monster sprite ───────────────────────────────────────────────────────

function drawBat(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  timestamp: number,
): void {
  ctx.save();
  const bob = Math.sin(timestamp * 0.005 + px * 0.1) * 3;
  const bodyColor = hitFlash ? "#C09080" : "#4A3A2A";
  const wingColor = hitFlash ? "#B07060" : "#2E2018";
  const wingTip = hitFlash ? "#A06050" : "#3A2A18";
  const bx = px + TILE_SIZE / 2;
  const by = py + TILE_SIZE / 2 - 2 + bob;

  // Wing spread: flapping based on animFrame
  const wingSpread = animFrame % 2 === 0 ? 1.0 : 0.5;

  // Left wing
  ctx.fillStyle = wingColor;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - 11 * wingSpread, by - 4 * wingSpread);
  ctx.lineTo(bx - 13 * wingSpread, by + 2);
  ctx.lineTo(bx - 8 * wingSpread, by + 5);
  ctx.lineTo(bx - 4, by + 3);
  ctx.closePath();
  ctx.fill();
  // Left wing tip membrane detail
  ctx.fillStyle = wingTip;
  ctx.beginPath();
  ctx.moveTo(bx - 11 * wingSpread, by - 4 * wingSpread);
  ctx.lineTo(bx - 13 * wingSpread, by + 2);
  ctx.lineTo(bx - 12 * wingSpread, by - 2 * wingSpread);
  ctx.closePath();
  ctx.fill();

  // Right wing
  ctx.fillStyle = wingColor;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + 11 * wingSpread, by - 4 * wingSpread);
  ctx.lineTo(bx + 13 * wingSpread, by + 2);
  ctx.lineTo(bx + 8 * wingSpread, by + 5);
  ctx.lineTo(bx + 4, by + 3);
  ctx.closePath();
  ctx.fill();
  // Right wing tip
  ctx.fillStyle = wingTip;
  ctx.beginPath();
  ctx.moveTo(bx + 11 * wingSpread, by - 4 * wingSpread);
  ctx.lineTo(bx + 13 * wingSpread, by + 2);
  ctx.lineTo(bx + 12 * wingSpread, by - 2 * wingSpread);
  ctx.closePath();
  ctx.fill();

  // Body (small dark oval)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(bx, by + 1, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head (slightly larger oval on top)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(bx, by - 3, 4, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears (two small triangles)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(Math.round(bx) - 5, Math.round(by) - 8, 2, 4);
  ctx.fillRect(Math.round(bx) + 3, Math.round(by) - 8, 2, 4);
  // Red eyes
  if (!hitFlash) {
    ctx.fillStyle = "#CC2200";
    ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 4, 2, 2);
    ctx.fillRect(Math.round(bx) + 1, Math.round(by) - 4, 2, 2);
    ctx.fillStyle = "#FF4422";
    ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 4, 1, 1);
    ctx.fillRect(Math.round(bx) + 1, Math.round(by) - 4, 1, 1);
  }
  ctx.restore();
}

// ─── Bear monster sprite ──────────────────────────────────────────────────────

function drawBear(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame === 1 ? 2 : -2;
  const bodyColor = hitFlash ? "#D0A888" : "#8B5E3C";
  const darkColor = hitFlash ? "#C09070" : "#5C3A1E";
  const lightColor = hitFlash ? "#E0C0A0" : "#AA7850";
  const snoutColor = hitFlash ? "#C09880" : "#5C3317";
  const flip = facing === "left";
  let dpx = px;

  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    dpx = 0;
  }

  // Legs (large, bear-proportioned)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 7, py + 22 + lb, 7, 10);
  ctx.fillRect(dpx + 18, py + 22 - lb, 7, 10);
  // Paws
  ctx.fillStyle = "#3A2010";
  ctx.fillRect(dpx + 6, py + 30 + lb, 9, 3);
  ctx.fillRect(dpx + 17, py + 30 - lb, 9, 3);

  // Body (large round torso)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 5, py + 10, 22, 15);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 6, py + 11, 20, 13);
  // Chest fur highlight
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 10, py + 14, 12, 7);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 11, py + 15, 10, 5);
  // Body shading
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 6, py + 22, 20, 2);

  // Front paws (visible at sides)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 2, py + 12 + lb, 6, 8);
  ctx.fillRect(dpx + 24, py + 12 - lb, 6, 8);
  ctx.fillStyle = "#3A2010";
  ctx.fillRect(dpx + 1, py + 18 + lb, 7, 3);
  ctx.fillRect(dpx + 24, py + 18 - lb, 7, 3);

  // Head (large round)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 7, py + 1, 18, 13);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 8, py + 2, 16, 11);
  // Round top of head
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 9, py + 0, 14, 4);
  ctx.fillRect(dpx + 11, py - 1, 10, 3);

  // Ears (two bumps)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 8, py - 2, 5, 4);
  ctx.fillRect(dpx + 19, py - 2, 5, 4);
  ctx.fillStyle = snoutColor;
  ctx.fillRect(dpx + 9, py - 1, 3, 2);
  ctx.fillRect(dpx + 20, py - 1, 3, 2);

  // Snout (dark muzzle area)
  ctx.fillStyle = snoutColor;
  ctx.fillRect(dpx + 11, py + 8, 10, 5);
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 12, py + 8, 8, 2);
  // Nose
  ctx.fillStyle = "#1A1008";
  ctx.fillRect(dpx + 14, py + 7, 4, 3);
  ctx.fillStyle = "#4A3028";
  ctx.fillRect(dpx + 14, py + 7, 4, 1);

  // Eyes (small dark)
  ctx.fillStyle = "#0A0806";
  ctx.fillRect(dpx + 10, py + 5, 3, 3);
  ctx.fillRect(dpx + 19, py + 5, 3, 3);
  ctx.fillStyle = "#3A2810";
  ctx.fillRect(dpx + 11, py + 5, 1, 1);
  ctx.fillRect(dpx + 19, py + 5, 1, 1);

  if (flip) ctx.restore();
  ctx.restore();
}

// ─── Crystal tile renderer ────────────────────────────────────────────────────

function drawCrystalTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  ctx.save();
  const hash = tileHash(tx, ty);
  // Base dark purple ground
  ctx.fillStyle = "#1a0a30";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Pulsing glow
  const pulse = Math.sin(time * 0.003 + tx * 0.5 + ty * 0.7) * 0.3 + 0.5;
  ctx.globalAlpha = 0.25 * pulse;
  const glow = ctx.createRadialGradient(
    px + TILE_SIZE / 2,
    py + TILE_SIZE / 2,
    2,
    px + TILE_SIZE / 2,
    py + TILE_SIZE / 2,
    TILE_SIZE,
  );
  glow.addColorStop(0, "#c084fc");
  glow.addColorStop(1, "rgba(120,40,240,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px - 4, py - 4, TILE_SIZE + 8, TILE_SIZE + 8);
  ctx.globalAlpha = 1;
  // Crystal gem shape — diamond/hexagonal facets
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const gemH = 14 + (hash & 3);
  const gemW = 8 + ((hash >> 2) & 3);
  // Shadow facet
  ctx.fillStyle = "#3b0764";
  ctx.beginPath();
  ctx.moveTo(cx, cy - gemH);
  ctx.lineTo(cx + gemW, cy);
  ctx.lineTo(cx, cy + gemH * 0.6);
  ctx.lineTo(cx - gemW, cy);
  ctx.closePath();
  ctx.fill();
  // Mid facet
  ctx.fillStyle = "#7c3aed";
  ctx.beginPath();
  ctx.moveTo(cx, cy - gemH);
  ctx.lineTo(cx + gemW, cy);
  ctx.lineTo(cx, cy + gemH * 0.5);
  ctx.closePath();
  ctx.fill();
  // Light facet
  ctx.fillStyle = "#a855f7";
  ctx.beginPath();
  ctx.moveTo(cx, cy - gemH);
  ctx.lineTo(cx - gemW + 2, cy - 2);
  ctx.lineTo(cx - gemW, cy);
  ctx.closePath();
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(220,180,255,0.75)";
  ctx.fillRect(cx - 2, cy - gemH + 2, 3, 5);
  // Teal accent crystal
  ctx.fillStyle = "rgba(52,211,153,0.5)";
  const ax = px + 4 + ((hash >> 6) & 0xf);
  const ay = py + 4 + ((hash >> 10) & 0xf);
  ctx.fillRect(ax, ay, 3, 6);
  ctx.fillRect(ax + 1, ay - 2, 1, 3);
  ctx.strokeStyle = "oklch(0.35 0.10 280)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  ctx.restore();
}

// ─── New tile renderers (STAIR, STAIR_UP, LANTERN, BENCH, POND, FENCE, DUNGEON) ──

function drawStairTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  time: number,
): void {
  ctx.save();
  // Stone base
  ctx.fillStyle = "#7A7268";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // 4 stone steps going down (top = lightest, bottom = darkest)
  const stepColors = ["#9A9488", "#888278", "#727068", "#5E5C56"];
  const stepShadows = ["#5E5C56", "#525050", "#464448", "#3A3838"];
  const stepW = TILE_SIZE - 6;
  const stepH = 6;
  for (let i = 0; i < 4; i++) {
    const sx = px + 3 + i * 0;
    const sy = py + 3 + i * 6;
    // Step face
    ctx.fillStyle = stepColors[i]!;
    ctx.fillRect(sx, sy, stepW - i * 2, stepH);
    // Step top-lit edge
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(sx, sy, stepW - i * 2, 1);
    // Step right shadow
    ctx.fillStyle = stepShadows[i]!;
    ctx.fillRect(sx + stepW - i * 2 - 2, sy, 2, stepH);
    // Step bottom shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(sx, sy + stepH - 1, stepW - i * 2, 1);
  }

  // Dark void below steps (depth effect)
  ctx.fillStyle = "#2A2822";
  ctx.fillRect(px + 3, py + 27, TILE_SIZE - 6, 5);
  ctx.fillStyle = "#1A1810";
  ctx.fillRect(px + 5, py + 29, TILE_SIZE - 10, 3);

  // Downward chevron arrow
  const arrowCX = Math.round(px + TILE_SIZE / 2);
  const arrowY = py + TILE_SIZE - 5;
  ctx.fillStyle = "rgba(220,200,140,0.90)";
  ctx.fillRect(arrowCX - 4, arrowY, 9, 1);
  ctx.fillRect(arrowCX - 3, arrowY + 1, 7, 1);
  ctx.fillRect(arrowCX - 2, arrowY + 2, 5, 1);
  ctx.fillRect(arrowCX - 1, arrowY + 3, 3, 1);
  ctx.fillRect(arrowCX, arrowY + 4, 1, 1);

  // Pulsing warm glow (torch-light effect)
  const pulse = Math.sin(time * 0.002) * 0.08 + 0.22;
  const glow = ctx.createRadialGradient(
    px + TILE_SIZE / 2,
    py + TILE_SIZE - 6,
    2,
    px + TILE_SIZE / 2,
    py + TILE_SIZE - 6,
    20,
  );
  glow.addColorStop(0, `rgba(200,160,60,${pulse})`);
  glow.addColorStop(1, "rgba(200,160,60,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Border
  ctx.strokeStyle = "#3A3830";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 0.75, py + 0.75, TILE_SIZE - 1.5, TILE_SIZE - 1.5);
  ctx.restore();
}

function drawStairUpTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  time: number,
): void {
  // Mossy green-gray base
  ctx.fillStyle = "#7B9A6A";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#556E48";
  ctx.fillRect(px, py, TILE_SIZE, 4);
  ctx.fillRect(px, py, 4, TILE_SIZE);
  ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
  ctx.fillRect(px + TILE_SIZE - 4, py, 4, TILE_SIZE);
  // Step lines
  ctx.fillStyle = "#3E5230";
  ctx.fillRect(px + 4, py + Math.round(TILE_SIZE * 0.3), TILE_SIZE - 8, 2);
  ctx.fillRect(px + 4, py + Math.round(TILE_SIZE * 0.55), TILE_SIZE - 8, 2);
  ctx.fillRect(px + 4, py + Math.round(TILE_SIZE * 0.8), TILE_SIZE - 8, 2);
  // Upward arrow (top center)
  const arrowCX = Math.round(px + TILE_SIZE / 2);
  const arrowY = py + 5;
  ctx.fillStyle = "#555";
  ctx.fillRect(arrowCX, arrowY, 1, 1);
  ctx.fillRect(arrowCX - 1, arrowY + 1, 3, 1);
  ctx.fillRect(arrowCX - 2, arrowY + 2, 5, 1);
  ctx.fillRect(arrowCX - 1, arrowY + 3, 3, 1);
  // Green pulsing glow
  const pulse = Math.sin(time * 0.002) * 0.075 + 0.225;
  ctx.save();
  const glow = ctx.createRadialGradient(
    px + TILE_SIZE / 2,
    py + TILE_SIZE / 2,
    2,
    px + TILE_SIZE / 2,
    py + TILE_SIZE / 2,
    18,
  );
  glow.addColorStop(0, `rgba(100,220,100,${pulse})`);
  glow.addColorStop(1, "rgba(100,220,100,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

function drawLanternTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  time: number,
): void {
  // Base cobblestone
  ctx.fillStyle = "#8B7355";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "#6B5840";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  // 2-frame flicker: alternate every ~200ms for torch effect
  const flickerFrame = Math.floor(time / 200) % 2;
  const flickerAlpha = flickerFrame === 0 ? 0.38 : 0.22;
  const flickerRadius = flickerFrame === 0 ? 22 : 17;
  ctx.save();
  const lightGrad = ctx.createRadialGradient(
    px + TILE_SIZE / 2,
    py + TILE_SIZE / 2,
    2,
    px + TILE_SIZE / 2,
    py + TILE_SIZE / 2,
    flickerRadius,
  );
  lightGrad.addColorStop(0, `rgba(255,215,0,${flickerAlpha + 0.1})`);
  lightGrad.addColorStop(0.5, `rgba(255,160,40,${flickerAlpha * 0.6})`);
  lightGrad.addColorStop(1, "rgba(255,120,0,0)");
  ctx.fillStyle = lightGrad;
  ctx.fillRect(px - 6, py - 6, TILE_SIZE + 12, TILE_SIZE + 12);
  ctx.restore();
  // Lantern post
  ctx.fillStyle = "#5A3E20";
  ctx.fillRect(px + 15, py + 14, 2, 18);
  // Lantern head (yellow rectangle with border)
  const headColor = flickerFrame === 0 ? "#FFD700" : "#E8A800";
  ctx.fillStyle = headColor;
  ctx.fillRect(px + 12, py + 8, 8, 7);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 12, py + 8, 8, 7);
  // Highlight
  ctx.fillStyle = `rgba(255,255,255,${flickerFrame === 0 ? 0.5 : 0.25})`;
  ctx.fillRect(px + 13, py + 9, 3, 2);
  void tx;
}

function drawBenchTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  // Draw ground under bench (grass or floor)
  drawGrassTile(ctx, px, py, tx, ty, time);
  // Bench back
  ctx.fillStyle = "#8B5E3C";
  ctx.fillRect(px + 4, py + Math.round(TILE_SIZE * 0.45) - 4, 24, 4);
  // Bench seat
  ctx.fillStyle = "#A0714F";
  ctx.fillRect(px + 4, py + Math.round(TILE_SIZE * 0.55), 24, 6);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(px + 4, py + Math.round(TILE_SIZE * 0.55), 24, 2);
  // Legs
  ctx.fillStyle = "#7A4A2A";
  ctx.fillRect(px + 6, py + Math.round(TILE_SIZE * 0.62), 3, 8);
  ctx.fillRect(px + 22, py + Math.round(TILE_SIZE * 0.62), 3, 8);
}

function drawPondTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  // Dark blue base
  ctx.fillStyle = "#2A5FA0";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Slightly lighter border
  ctx.strokeStyle = "#3A74BB";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  // Top shimmer
  ctx.fillStyle = "rgba(100,180,255,0.18)";
  ctx.fillRect(px, py, TILE_SIZE, 3);
  // Ripple circles
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const outerR = 11 + Math.sin(time * 0.001) * 1;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#4488CC";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Lily pad (small green circle off-center)
  const hash = tileHash(tx, ty);
  const lpx = px + 7 + (hash & 0x7);
  const lpy = py + 7 + ((hash >> 4) & 0x7);
  ctx.fillStyle = "#3A7A30";
  ctx.beginPath();
  ctx.arc(lpx, lpy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(80,160,60,0.5)";
  ctx.beginPath();
  ctx.arc(lpx - 1, lpy - 1, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawFenceTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  // Ground underneath
  drawGrassTile(ctx, px, py, tx, ty, time);
  // Horizontal rail
  ctx.fillStyle = "#9B7040";
  ctx.fillRect(px, py + Math.round(TILE_SIZE * 0.45), TILE_SIZE, 2);
  // Three vertical pickets
  const picketColor = "#B88050";
  const picketDark = "#7A5228";
  for (let i = 0; i < 3; i++) {
    const bx = px + 3 + i * 9;
    ctx.fillStyle = picketColor;
    ctx.fillRect(bx, py + Math.round(TILE_SIZE * 0.28), 3, 12);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx, py + Math.round(TILE_SIZE * 0.28), 1, 12);
    ctx.fillStyle = picketDark;
    ctx.fillRect(bx + 2, py + Math.round(TILE_SIZE * 0.28), 1, 12);
  }
}

function drawDungeonFloorTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  // Seeded lightness noise
  const noiseVal = (tx * 13 + ty * 7) % 20;
  const base = 0x25 + (noiseVal % 5) - 2;
  const hex = base.toString(16).padStart(2, "0");
  ctx.fillStyle = `#${hex}${hex}35`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Bottom thin highlight
  ctx.fillStyle = "#333346";
  ctx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
  // Subtle stone crack
  const hash = tileHash(tx, ty);
  if ((hash & 0x3) < 2) {
    const crackX1 = px + 6 + (hash & 0xf);
    const crackY1 = py + 6;
    const crackX2 = crackX1 + 8;
    const crackY2 = py + 24;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#888899";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crackX1, crackY1);
    ctx.quadraticCurveTo(crackX1 + 4, py + 15, crackX2, crackY2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDungeonWallTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  // Near-black base
  ctx.fillStyle = "#151520";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Dark border
  ctx.strokeStyle = "#0D0D18";
  ctx.lineWidth = 4;
  ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  // Stone block dividers
  ctx.strokeStyle = "#222230";
  ctx.lineWidth = 1;
  // Horizontal dividers
  ctx.beginPath();
  ctx.moveTo(px + 1, py + Math.round(TILE_SIZE * 0.35));
  ctx.lineTo(px + TILE_SIZE - 1, py + Math.round(TILE_SIZE * 0.35));
  ctx.moveTo(px + 1, py + Math.round(TILE_SIZE * 0.7));
  ctx.lineTo(px + TILE_SIZE - 1, py + Math.round(TILE_SIZE * 0.7));
  ctx.stroke();
  // Vertical divider (alternating per row for brick effect)
  const vOffset =
    ty % 2 === 0 ? Math.round(TILE_SIZE * 0.5) : Math.round(TILE_SIZE * 0.25);
  ctx.beginPath();
  ctx.moveTo(px + vOffset, py + 1);
  ctx.lineTo(px + vOffset, py + TILE_SIZE - 1);
  ctx.stroke();
  // Bottom shadow edge
  ctx.fillStyle = "#08080F";
  ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);

  void tx;
}

// ─── Cave tile renderers ──────────────────────────────────────────────────────

function drawCaveFloorTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  ctx.save();
  // Very dark reddish-brown base
  const noiseVal = (tx * 11 + ty * 13) % 12;
  const base = 0x3a + (noiseVal % 6) - 2;
  const hexB = base.toString(16).padStart(2, "0");
  const hexR = (base - 4).toString(16).padStart(2, "0");
  ctx.fillStyle = `#${hexR}${hexB}${(base - 8).toString(16).padStart(2, "0")}`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Rock texture: subtle pebble dots
  const hash = tileHash(tx, ty);
  if ((hash & 0x3) < 2) {
    ctx.fillStyle = "#2A2520";
    ctx.fillRect(
      px + (((hash >> 4) & 0x1f) % (TILE_SIZE - 4)) + 2,
      py + (((hash >> 9) & 0x1f) % (TILE_SIZE - 4)) + 2,
      3,
      2,
    );
  }
  if ((hash & 0xf) < 4) {
    ctx.fillStyle = "#4A4038";
    ctx.fillRect(
      px + (((hash >> 14) & 0x1f) % (TILE_SIZE - 4)) + 2,
      py + (((hash >> 19) & 0x1f) % (TILE_SIZE - 4)) + 2,
      2,
      2,
    );
  }
  // Subtle crack line
  if ((hash & 0x1f) < 5) {
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#1A1510";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 4, py + 8);
    ctx.lineTo(px + 10 + (hash & 0x7), py + 22);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Top edge highlight
  ctx.fillStyle = "rgba(80,60,50,0.3)";
  ctx.fillRect(px, py, TILE_SIZE, 1);
  ctx.strokeStyle = "#1E1A16";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  ctx.restore();
}

function drawCaveWallTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  ctx.save();
  // Very dark cave wall base
  ctx.fillStyle = "#1A1510";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Jagged rock texture using irregular rectangles
  const hash = tileHash(tx, ty);
  // Rock face blocks (slightly lighter than void)
  ctx.fillStyle = "#252018";
  ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  // Jagged rock edges top
  ctx.fillStyle = "#1A1510";
  const jagPattern = [
    (hash >> 0) & 0x3,
    (hash >> 2) & 0x3,
    (hash >> 4) & 0x3,
    (hash >> 6) & 0x3,
    (hash >> 8) & 0x3,
    (hash >> 10) & 0x3,
    (hash >> 12) & 0x3,
    (hash >> 14) & 0x3,
  ];
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(px + i * 4, py, 4, jagPattern[i]! + 1);
    ctx.fillRect(
      px + i * 4,
      py + TILE_SIZE - jagPattern[(i + 3) % 8]! - 1,
      4,
      jagPattern[(i + 3) % 8]! + 1,
    );
  }
  // Jagged edges left/right
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(px, py + i * 4, jagPattern[(i + 1) % 8]! + 1, 4);
    ctx.fillRect(
      px + TILE_SIZE - jagPattern[(i + 5) % 8]! - 1,
      py + i * 4,
      jagPattern[(i + 5) % 8]! + 1,
      4,
    );
  }

  // Rock highlights (tiny lighter spots for depth)
  ctx.fillStyle = "#3A3028";
  ctx.fillRect(px + 3 + ((hash & 0xf) % (TILE_SIZE - 8)), py + 4, 3, 2);
  ctx.fillRect(
    px + 8 + (((hash >> 5) & 0xf) % (TILE_SIZE - 10)),
    py + 16,
    4,
    2,
  );
  ctx.fillStyle = "#2E2820";
  ctx.fillRect(px + 5, py + 10, 5, 4);

  // Bottom shadow
  ctx.fillStyle = "#0A0806";
  ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
  ctx.fillRect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);
  ctx.strokeStyle = "#0E0C0A";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  void ty;
  ctx.restore();
}

// ─── Island / Water border tile renderers ────────────────────────────────────

// Deep ocean water — animated 4-frame wave cycle at ~8fps
let deepWaterFrame = 0;
let deepWaterFrameTime = 0;

function updateDeepWaterFrame(time: number): void {
  if (time - deepWaterFrameTime > 125) {
    deepWaterFrame = (deepWaterFrame + 1) % 6; // 6-frame cycle
    deepWaterFrameTime = time;
  }
}

/** Zone-specific water color palette for deep water tiles */
function getWaterColors(zoneId: ZoneId): {
  base: string;
  wave: string;
  shimmer: string;
  border: string;
} {
  switch (zoneId) {
    case "boss_chamber":
      // Dark stormy water — near-black with deep teal waves
      return {
        base: "#0d1a26",
        wave: "#1a3040",
        shimmer: "#3a6080",
        border: "#080e18",
      };
    case "cursed_swamp":
      // Murky brown-green
      return {
        base: "#1e2e12",
        wave: "#2d4a1e",
        shimmer: "#4a7a2d",
        border: "#101a08",
      };
    case "aurelion":
      // Clear ornate blue — lighter, more luminous
      return {
        base: "#1a3d6a",
        wave: "#2a5a90",
        shimmer: "#6aacdf",
        border: "#0e2644",
      };
    case "hub_basement":
    case "bat_cave":
    case "deep_cave":
    case "cave_interior":
    case "goblin_warrens":
    case "wilderness_dungeon":
    case "forest_dungeon":
      // Dark rocky cave water
      return {
        base: "#141822",
        wave: "#1e2a38",
        shimmer: "#2a3a4a",
        border: "#0a0e18",
      };
    case "ancient_ruins":
    case "ancient_ruins_deep":
    case "crystal_ruins":
    case "cyclops_lair":
      // Crumbled stone shore, grey water
      return {
        base: "#1a1e2a",
        wave: "#252a38",
        shimmer: "#4a5a6a",
        border: "#0e1018",
      };
    default:
      // Default deep ocean blue
      return {
        base: "#1a4f7a",
        wave: "#2d7fa3",
        shimmer: "#88CCFF",
        border: "#0e3a5c",
      };
  }
}

function drawDeepWaterTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
  zoneId: ZoneId = "meadow_hub",
): void {
  updateDeepWaterFrame(time);
  const hash = tileHash(tx, ty);
  const wc = getWaterColors(zoneId);

  // ── Base fill ──
  ctx.fillStyle = wc.base;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  ctx.save();

  // ── Wave crests — 6-frame horizontal ripples with varied heights ──
  // Frames 0-3: normal wave heights; frames 4-5: slightly taller crests
  const waveMod = deepWaterFrame >= 4 ? 1 : 0;
  const waveY1 = (deepWaterFrame * 4 + (hash & 0x7)) % TILE_SIZE;
  const waveY2 = (deepWaterFrame * 4 + 12 + (hash & 0x7)) % TILE_SIZE;
  const waveY3 = (deepWaterFrame * 2 + 22 + ((hash >> 4) & 0x7)) % TILE_SIZE;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = wc.wave;
  ctx.fillRect(px + 2, py + waveY1, TILE_SIZE - 4, 2 + waveMod);
  ctx.fillRect(px + 4, py + waveY2, TILE_SIZE - 8, 1 + waveMod);
  ctx.fillRect(px + 6, py + waveY3, TILE_SIZE - 12, 1); // third wave line

  // ── Shimmer highlights (3 random per tile per frame) ──
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = wc.shimmer;
  const sx1 = px + ((hash + deepWaterFrame * 5) % (TILE_SIZE - 4)) + 2;
  const sy1 = py + (((hash >> 5) + deepWaterFrame * 3) % (TILE_SIZE - 4)) + 2;
  const sx2 = px + (((hash >> 3) + deepWaterFrame * 7) % (TILE_SIZE - 4)) + 2;
  const sy2 = py + (((hash >> 8) + deepWaterFrame * 2) % (TILE_SIZE - 4)) + 2;
  ctx.fillRect(sx1, sy1, 2, 1);
  ctx.fillRect(sx2, sy2, 1, 2);

  // ── Simple reflection: ~8% of tiles get a lighter shimmer overlay ──
  // Hash based on position + slow time division for occasional flicker
  const reflHash = tileHash(tx * 3, ty * 5 + Math.floor(time / 3000));
  if ((reflHash & 0xff) < 20) {
    // ~8% chance
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, TILE_SIZE - 8);
  }

  ctx.restore();
  ctx.strokeStyle = wc.border;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

/** Get beach sand tone per zone */
function getBeachColors(zoneId: ZoneId): {
  base: [number, number, number];
  dot: string;
  border: string;
} {
  switch (zoneId) {
    case "boss_chamber":
      return { base: [0.28, 0.03, 200], dot: "#3a3838", border: "#2a2828" };
    case "cursed_swamp":
      return { base: [0.32, 0.06, 90], dot: "#4a3826", border: "#3a2a18" };
    case "aurelion":
      return { base: [0.82, 0.03, 200], dot: "#ccd8e8", border: "#9aaabb" };
    case "ancient_ruins":
    case "ancient_ruins_deep":
    case "crystal_ruins":
    case "cyclops_lair":
      return { base: [0.44, 0.02, 200], dot: "#5a5a5a", border: "#484848" };
    case "hub_basement":
    case "bat_cave":
    case "deep_cave":
    case "cave_interior":
      return { base: [0.3, 0.02, 200], dot: "#484848", border: "#363636" };
    default:
      // Warm sandy beach
      return { base: [0.76, 0.06, 82], dot: "#c4a470", border: "#a88850" };
  }
}

function drawBeachTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  zoneId: ZoneId = "meadow_hub",
  tiles?: TileTypeValue[][],
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;
  const bc = getBeachColors(zoneId);
  const [baseL, baseC, baseH] = bc.base;
  const bl = [baseL, baseL - 0.02, baseL + 0.02][variant]!;
  ctx.fillStyle = `oklch(${bl} ${baseC} ${baseH})`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Texture dots
  ctx.fillStyle = bc.dot;
  for (let i = 0; i < 3; i++) {
    const dx = px + (((hash >> (i * 5)) & 0x1f) % (TILE_SIZE - 4)) + 2;
    const dy = py + (((hash >> (i * 5 + 3)) & 0x1f) % (TILE_SIZE - 4)) + 2;
    ctx.fillRect(dx, dy, 2, 1);
  }
  ctx.strokeStyle = bc.border;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Water edge glow — draw a subtle bright line on the side(s) facing water
  if (tiles) {
    const isWaterTile = (t: TileTypeValue | undefined): boolean =>
      t === TileType.DEEP_WATER ||
      t === TileType.SWAMP_WATER ||
      t === TileType.FOAM;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle =
      zoneId === "cursed_swamp" ? "#88aa44" : "rgba(200,235,255,0.9)";
    ctx.lineWidth = 1.5;
    // Check each cardinal direction
    if (isWaterTile(tiles[ty - 1]?.[tx])) {
      ctx.beginPath();
      ctx.moveTo(px, py + 1);
      ctx.lineTo(px + TILE_SIZE, py + 1);
      ctx.stroke();
    }
    if (isWaterTile(tiles[ty + 1]?.[tx])) {
      ctx.beginPath();
      ctx.moveTo(px, py + TILE_SIZE - 1);
      ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE - 1);
      ctx.stroke();
    }
    if (isWaterTile(tiles[ty]?.[tx - 1])) {
      ctx.beginPath();
      ctx.moveTo(px + 1, py);
      ctx.lineTo(px + 1, py + TILE_SIZE);
      ctx.stroke();
    }
    if (isWaterTile(tiles[ty]?.[tx + 1])) {
      ctx.beginPath();
      ctx.moveTo(px + TILE_SIZE - 1, py);
      ctx.lineTo(px + TILE_SIZE - 1, py + TILE_SIZE);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFoamTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  // Blue-white foamy base
  ctx.fillStyle = "#aaddee";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Animated horizontal foam shift — slow sine wave left-right offset
  const foamPhase = (time * 0.0018 + (hash & 0xf) * 0.2) % 1;
  const sineShift = Math.round(
    Math.sin(time * 0.0006 + tx * 0.4 + ty * 0.3) * 3,
  );
  ctx.save();
  ctx.globalAlpha = 0.7 - foamPhase * 0.5;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    px + 2 + sineShift,
    py + 3 + Math.round(foamPhase * 4),
    TILE_SIZE - 4,
    3,
  );
  ctx.globalAlpha = 0.55 - foamPhase * 0.35;
  ctx.fillRect(
    px + 4 - sineShift,
    py + 14 + Math.round(foamPhase * 3),
    TILE_SIZE - 8,
    2,
  );
  ctx.restore();
  void tx;
  void ty;
}

function drawSwampWaterTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  // Murky green-brown base
  ctx.fillStyle = "#2d4a1e";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Slow bubble animation (6fps = update every 167ms)
  const bubbleFrame = Math.floor(time / 167) % 4;
  ctx.save();
  // 2-3 rising bubbles
  for (let b = 0; b < 2; b++) {
    const bx = px + (((hash >> (b * 4)) & 0x1f) % (TILE_SIZE - 6)) + 3;
    const progressY = ((bubbleFrame + (hash & 0x3) + b * 2) % 4) / 3;
    const by = py + TILE_SIZE - 4 - Math.round(progressY * (TILE_SIZE - 8));
    ctx.globalAlpha = 0.6 * (1 - progressY * 0.5);
    ctx.fillStyle = "#4a7a2d";
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Occasional algae patch
  if ((hash & 0x7) < 3) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#88aa44";
    ctx.fillRect(
      px + ((hash >> 6) & 0xf) + 2,
      py + ((hash >> 10) & 0xf) + 2,
      6,
      4,
    );
  }
  ctx.restore();
  ctx.strokeStyle = "#1e3212";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

function drawStonePlatformTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;
  const baseL = [0.44, 0.42, 0.46][variant]!;
  ctx.fillStyle = `oklch(${baseL} 0.01 220)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Lighter flecks
  ctx.fillStyle = `oklch(${(baseL + 0.08).toFixed(3)} 0.01 220)`;
  const fx = px + (((hash >> 2) & 0x1f) % (TILE_SIZE - 4)) + 2;
  const fy = py + (((hash >> 7) & 0x1f) % (TILE_SIZE - 4)) + 2;
  ctx.fillRect(fx, fy, 3, 2);
  // Platform edge — darker border
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
  ctx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);
  // Occasional crack
  if ((hash & 0x1f) < 5) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 8);
    ctx.lineTo(px + 9 + (hash & 0x5), py + 22);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "#4a4a4a";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

function drawRuneFloorTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  // Base: same as stone platform
  drawStonePlatformTile(ctx, px, py, tx, ty);
  // Pulsing rune glow overlay
  const pulse = Math.sin(time * 0.002 + tx * 0.7 + ty * 0.5) * 0.15 + 0.35;
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  ctx.save();
  // Rune symbol
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = "#9b59b6";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  const r = 6;
  // Draw '+' rune
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  // Outer rune circle
  ctx.globalAlpha = pulse * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();
  // Radial glow
  const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, r + 4);
  glow.addColorStop(0, `rgba(155, 89, 182, ${pulse * 0.6})`);
  glow.addColorStop(1, "rgba(155, 89, 182, 0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.fillRect(px - 2, py - 2, TILE_SIZE + 4, TILE_SIZE + 4);
  ctx.restore();
}

function drawVoidDropTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  // Sky blue gradient background
  const skyL = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
  skyL.addColorStop(0, "#87CEEB");
  skyL.addColorStop(1, "#5ba0c8");
  ctx.fillStyle = skyL;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Cloud wisps — horizontal ellipses
  ctx.save();
  ctx.globalAlpha = 0.7 + Math.sin(time * 0.0005 + tx * 0.2) * 0.15;
  ctx.fillStyle = "#ffffff";
  const cloudY1 = py + 6 + (hash & 0x7);
  const cloudX1 = px + ((hash >> 4) & 0xf) + 2;
  ctx.beginPath();
  ctx.ellipse(cloudX1, cloudY1, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if ((hash & 0x3) < 2) {
    ctx.globalAlpha = 0.5;
    const cloudX2 = px + ((hash >> 8) & 0xf) + 4;
    ctx.beginPath();
    ctx.ellipse(cloudX2, py + 20, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void time;
  void ty;
}

// ─── Pirate Island tile renderers ─────────────────────────────────────────────

function drawBridgeTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  // Wooden plank base — warm medium brown
  ctx.fillStyle = "oklch(0.46 0.08 58)";
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Plank boards running east-west (horizontal lines)
  const plankL = [0.5, 0.44, 0.52, 0.43][hash % 4]!;
  ctx.fillStyle = `oklch(${plankL} 0.09 60)`;
  for (let row = 0; row < 4; row++) {
    const by = py + row * 8 + 2;
    ctx.fillRect(px, by, TILE_SIZE, 6);
  }

  // Plank grain lines (darker horizontal streaks)
  ctx.fillStyle = "oklch(0.36 0.06 55)";
  for (let row = 0; row < 4; row++) {
    const by = py + row * 8 + 5;
    ctx.fillRect(px + 2, by, TILE_SIZE - 4, 1);
  }

  // Nail dots at plank ends
  ctx.fillStyle = "oklch(0.30 0.04 50)";
  for (let row = 0; row < 4; row++) {
    const ny = py + row * 8 + 3;
    ctx.fillRect(px + 3, ny, 2, 2);
    ctx.fillRect(px + TILE_SIZE - 5, ny, 2, 2);
  }

  // Slight top-edge highlight (wood sheen)
  ctx.fillStyle = "oklch(1 0 0 / 0.10)";
  ctx.fillRect(px, py, TILE_SIZE, 2);

  // Bridge-side rope/fence posts every 2 tiles (on north/south edge)
  if (ty % 2 === 0) {
    // Small brown post indicator on top of tile
    ctx.fillStyle = "oklch(0.32 0.07 55)";
    ctx.fillRect(px + 1, py, 3, 5);
    ctx.fillRect(px + TILE_SIZE - 4, py, 3, 5);
  }

  // Subtle wear overlay
  const wearAlpha = ((hash >> 5) & 0x1f) / 255;
  ctx.fillStyle = `oklch(0.25 0.05 55 / ${wearAlpha.toFixed(2)})`;
  ctx.fillRect(
    px + (((hash >> 3) & 0x1f) % (TILE_SIZE - 4)) + 2,
    py + (((hash >> 8) & 0x1f) % (TILE_SIZE - 4)) + 2,
    3,
    2,
  );

  void time;
}

function drawSandTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 4;
  // Warm sandy tones
  const lightness = [0.76, 0.78, 0.74, 0.77][variant]!;
  const chroma = [0.08, 0.09, 0.07, 0.085][variant]!;
  const hue = [80, 82, 78, 81][variant]!;
  const subtlePulse = Math.sin(time * 0.0004 + tx * 0.2 + ty * 0.3) * 0.006;
  ctx.fillStyle = `oklch(${(lightness + subtlePulse).toFixed(3)} ${chroma} ${hue})`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Subtle grain dots
  ctx.fillStyle = `oklch(${(lightness - 0.06).toFixed(3)} 0.06 78)`;
  for (let i = 0; i < 3; i++) {
    const gx = px + (((hash >> (i * 5)) & 0x1f) % (TILE_SIZE - 4)) + 2;
    const gy = py + (((hash >> (i * 5 + 3)) & 0x1f) % (TILE_SIZE - 4)) + 2;
    ctx.fillRect(gx, gy, 1, 1);
  }

  // Tiny pebble/shell decoration (rare)
  if ((hash & 0xff) < 18) {
    const px2 = px + (((hash >> 6) & 0x1f) % (TILE_SIZE - 6)) + 3;
    const py2 = py + (((hash >> 11) & 0x1f) % (TILE_SIZE - 6)) + 3;
    ctx.fillStyle = "oklch(0.88 0.04 75)";
    ctx.fillRect(px2, py2, 2, 2);
    ctx.fillStyle = "oklch(0.68 0.05 72)";
    ctx.fillRect(px2 + 1, py2 + 1, 1, 1);
  }

  // Top-lit edge
  ctx.fillStyle = "oklch(1 0 0 / 0.08)";
  ctx.fillRect(px, py, TILE_SIZE, 1);

  void time;
}

function drawPalmTreeTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  time: number,
): void {
  const hash = tileHash(tx, ty);

  // Sandy ground beneath
  drawSandTile(ctx, px, py, tx, ty, time);

  // Trunk — tapered brown
  ctx.fillStyle = "#7A5228";
  ctx.fillRect(px + 13, py + 18, 6, 14);
  // Trunk shading
  ctx.fillStyle = "#5C3D1A";
  ctx.fillRect(px + 16, py + 18, 3, 14);
  // Trunk texture rings
  ctx.fillStyle = "#8A6030";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(px + 13, py + 20 + i * 4, 6, 1);
  }

  // Sway angle based on time for gentle animation
  const sway = Math.sin(time * 0.0008 + (hash & 7) * 0.5) * 2;

  // Leaf fronds — 5 fronds radiating from top
  const leafColors = ["#2D6A1A", "#388A22", "#2A5A16", "#3A7820", "#256018"];
  const fronds = [
    { angle: -0.5, length: 16 },
    { angle: 0.4, length: 14 },
    { angle: -1.4, length: 13 },
    { angle: 1.3, length: 15 },
    { angle: Math.PI * 0.5, length: 12 },
  ];
  const cx = px + 16 + sway;
  const cy = py + 10;
  for (let i = 0; i < fronds.length; i++) {
    const f = fronds[i]!;
    const angle = f.angle + sway * 0.05;
    const ex = cx + Math.cos(angle) * f.length;
    const ey = cy + Math.sin(angle) * f.length;
    ctx.strokeStyle = leafColors[i % leafColors.length]!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Leaf tip highlight
    ctx.strokeStyle = "oklch(0.52 0.18 140)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(angle) * (f.length * 0.4),
      cy + Math.sin(angle) * (f.length * 0.4),
    );
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Coconuts cluster
  ctx.fillStyle = "#8B6914";
  ctx.beginPath();
  ctx.arc(cx - 2, cy + 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 3, cy + 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Cursed Galleon tile renderers ────────────────────────────────────────────

function drawWoodPlankTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;
  const baseL = [0.42, 0.44, 0.4][variant]!;
  // Warm brown wooden plank base
  ctx.fillStyle = `oklch(${baseL} 0.09 58)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Horizontal plank lines
  ctx.fillStyle = `oklch(${(baseL - 0.05).toFixed(3)} 0.07 55)`;
  ctx.fillRect(px, py + 7, TILE_SIZE, 2);
  ctx.fillRect(px, py + 15, TILE_SIZE, 2);
  ctx.fillRect(px, py + 23, TILE_SIZE, 2);
  // Grain streaks
  ctx.fillStyle = `oklch(${(baseL - 0.03).toFixed(3)} 0.06 56)`;
  const gx = (((hash >> 4) & 0x1f) % (TILE_SIZE - 4)) + 2;
  ctx.fillRect(px + gx, py + 1, 1, 6);
  ctx.fillRect(px + gx, py + 9, 1, 5);
  // Subtle nail at plank junction
  ctx.fillStyle = "oklch(0.28 0.04 50)";
  ctx.fillRect(px + 2, py + 6, 2, 3);
  ctx.fillRect(px + TILE_SIZE - 4, py + 14, 2, 3);
  // Top-lit edge
  ctx.fillStyle = "oklch(1 0 0 / 0.07)";
  ctx.fillRect(px, py, TILE_SIZE, 1);
  ctx.strokeStyle = `oklch(${(baseL - 0.08).toFixed(3)} 0.06 54)`;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  void ty;
}

function drawCaptainFloorTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  const hash = tileHash(tx, ty);
  const variant = hash % 3;
  // Warmer, richer wood for captain's quarters
  const baseL = [0.38, 0.4, 0.36][variant]!;
  ctx.fillStyle = `oklch(${baseL} 0.11 52)`;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Diagonal parquet-ish pattern
  ctx.fillStyle = `oklch(${(baseL - 0.04).toFixed(3)} 0.08 50)`;
  // Alternating plank lines
  const rowOff = ty % 2 === 0 ? 0 : 8;
  for (let r = 0; r < 4; r++) {
    ctx.fillRect(px + rowOff, py + r * 8, TILE_SIZE - rowOff, 1);
  }
  // Golden edge trim
  ctx.strokeStyle = "oklch(0.68 0.12 60)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  // Subtle highlight
  ctx.fillStyle = "oklch(1 0 0 / 0.06)";
  ctx.fillRect(px, py, TILE_SIZE, 2);
  void tx;
}

function drawShipRailTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
): void {
  // Ship rail: wooden deck base + raised rail post on edge
  drawWoodPlankTile(ctx, px, py, tx, ty);
  // Vertical post
  ctx.fillStyle = "oklch(0.32 0.07 52)";
  ctx.fillRect(px + 13, py, 6, TILE_SIZE);
  // Post highlight
  ctx.fillStyle = "oklch(0.44 0.07 56)";
  ctx.fillRect(px + 13, py, 2, TILE_SIZE);
  // Rope rail line
  ctx.strokeStyle = "oklch(0.62 0.08 65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py + 8);
  ctx.lineTo(px + TILE_SIZE, py + 8);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py + 16);
  ctx.lineTo(px + TILE_SIZE, py + 16);
  ctx.stroke();
}

function drawBarrel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
): void {
  ctx.fillStyle = "oklch(0.38 0.08 55)";
  ctx.fillRect(px + 4, py + 8, 12, 18);
  ctx.fillStyle = "oklch(0.55 0.05 45)";
  ctx.fillRect(px + 3, py + 10, 14, 2);
  ctx.fillRect(px + 3, py + 18, 14, 2);
  ctx.fillStyle = "oklch(0.42 0.07 58)";
  ctx.fillRect(px + 5, py + 7, 10, 4);
  ctx.fillStyle = "oklch(0.50 0.07 58)";
  ctx.fillRect(px + 6, py + 7, 8, 2);
  ctx.fillStyle = "oklch(1 0 0 / 0.12)";
  ctx.fillRect(px + 5, py + 8, 4, 8);
  ctx.fillStyle = "oklch(0 0 0 / 0.25)";
  ctx.fillRect(px + 13, py + 8, 3, 16);
}

function drawSign(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "oklch(0.35 0.06 55)";
  ctx.fillRect(px + 14, py + 14, 4, 20);
  ctx.fillStyle = "oklch(0.45 0.07 58)";
  ctx.fillRect(px + 14, py + 14, 2, 20);
  ctx.fillStyle = "oklch(0.42 0.07 58)";
  ctx.fillRect(px + 5, py + 6, 22, 12);
  ctx.fillStyle = "oklch(0.50 0.07 60)";
  ctx.fillRect(px + 6, py + 7, 20, 10);
  ctx.strokeStyle = "oklch(0.28 0.05 50)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 5.5, py + 6.5, 21, 11);
  ctx.fillStyle = "oklch(0.30 0.05 48)";
  ctx.fillRect(px + 8, py + 9, 6, 1);
  ctx.fillRect(px + 8, py + 12, 10, 1);
  ctx.fillRect(px + 20, py + 9, 4, 1);
  ctx.fillStyle = "oklch(1 0 0 / 0.10)";
  ctx.fillRect(px + 6, py + 7, 20, 2);
}

// ─── Meadow Hub Decorations ───────────────────────────────────────────────────

function drawMeadowFountain(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  timestamp: number,
): void {
  try {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2 + 4;
    // Basin
    ctx.fillStyle = "#8ab4d8";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#aaccee";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Rim highlight
    ctx.fillStyle = "rgba(180,220,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pillar
    ctx.fillStyle = "#c8b888";
    ctx.fillRect(cx - 2, cy - 8, 4, 12);
    ctx.fillStyle = "#e0d0a8";
    ctx.fillRect(cx - 1, cy - 8, 2, 12);
    // Water arc particles (2 streams)
    for (let stream = 0; stream < 2; stream++) {
      const angle = (stream / 2) * Math.PI * 2 + timestamp * 0.001;
      for (let p = 0; p < 3; p++) {
        const t = (timestamp * 0.0018 + stream * 0.5 + p * 0.33) % 1.0;
        const arcX = cx + Math.cos(angle) * t * 9;
        const arcY = cy - 8 + t * 12 - Math.sin(t * Math.PI) * 12;
        const alpha = Math.sin(t * Math.PI) * 0.7 + 0.15;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#88ccee";
        ctx.beginPath();
        ctx.arc(arcX, arcY, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } catch {
    /* decorative — never crash */
  }
}

function drawFlowerBed(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  seed: number,
): void {
  try {
    const colors = ["#e84040", "#e8c830", "#e060b0", "#48c850"];
    const stemColor = "#38a030";
    for (let i = 0; i < 5; i++) {
      const ox = ((seed * 7 + i * 13) % 18) - 4;
      const oy = ((seed * 3 + i * 9) % 14) - 2;
      const col = colors[(seed * 5 + i) % colors.length];
      ctx.fillStyle = stemColor;
      ctx.fillRect(px + ox + 6, py + oy + 16, 1, 5);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px + ox + 6, py + oy + 14, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffc0";
      ctx.beginPath();
      ctx.arc(px + ox + 6, py + oy + 14, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  } catch {
    /* decorative — never crash */
  }
}

function drawLampPost(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  timestamp: number,
): void {
  try {
    const cx = px + TILE_SIZE / 2;
    // Pole
    ctx.fillStyle = "#505060";
    ctx.fillRect(cx - 1, py + 6, 3, 24);
    ctx.fillStyle = "#686878";
    ctx.fillRect(cx - 1, py + 6, 1, 24);
    // Arm
    ctx.fillStyle = "#505060";
    ctx.fillRect(cx, py + 6, 5, 2);
    // Lantern body
    ctx.fillStyle = "#888870";
    ctx.fillRect(cx + 3, py + 2, 8, 7);
    // Warm glow — pulsing
    const glowPulse = 0.38 + Math.sin(timestamp * 0.0015) * 0.08;
    ctx.save();
    ctx.globalAlpha = glowPulse;
    const grd = ctx.createRadialGradient(cx + 7, py + 5, 1, cx + 7, py + 5, 12);
    grd.addColorStop(0, "#ffe88a");
    grd.addColorStop(0.5, "rgba(255,220,80,0.3)");
    grd.addColorStop(1, "rgba(255,180,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx + 7, py + 5, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Lantern glass
    ctx.fillStyle = `rgba(255,230,120,${0.55 + Math.sin(timestamp * 0.002) * 0.1})`;
    ctx.fillRect(cx + 4, py + 3, 6, 5);
    // Lantern top
    ctx.fillStyle = "#444450";
    ctx.fillRect(cx + 2, py + 1, 10, 2);
  } catch {
    /* decorative — never crash */
  }
}

function drawNoticeBoard(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
): void {
  try {
    const cx = px + TILE_SIZE / 2;
    // Posts
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(cx - 10, py + 10, 3, 20);
    ctx.fillRect(cx + 7, py + 10, 3, 20);
    // Board back
    ctx.fillStyle = "#7a5020";
    ctx.fillRect(cx - 12, py + 4, 24, 16);
    // Board face
    ctx.fillStyle = "#c89050";
    ctx.fillRect(cx - 11, py + 5, 22, 14);
    ctx.strokeStyle = "#5a3a1a";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 11.5, py + 4.5, 23, 15);
    // Notice papers
    ctx.fillStyle = "#f0e8d0";
    ctx.fillRect(cx - 9, py + 7, 8, 5);
    ctx.fillRect(cx + 1, py + 7, 7, 3);
    ctx.fillRect(cx - 5, py + 14, 11, 3);
    // Text lines on paper
    ctx.fillStyle = "#5a4020";
    ctx.fillRect(cx - 8, py + 8, 6, 1);
    ctx.fillRect(cx - 8, py + 10, 4, 1);
    ctx.fillRect(cx + 2, py + 8, 5, 1);
  } catch {
    /* decorative — never crash */
  }
}

function drawWelcomeArch(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
): void {
  try {
    // Two pillars
    ctx.fillStyle = "#c0b090";
    ctx.fillRect(px + 2, py + 2, 8, 28);
    ctx.fillRect(px + TILE_SIZE * 2 - 10, py + 2, 8, 28);
    // Pillar highlights
    ctx.fillStyle = "#e0d0b0";
    ctx.fillRect(px + 3, py + 2, 3, 28);
    ctx.fillRect(px + TILE_SIZE * 2 - 9, py + 2, 3, 28);
    // Arch beam
    ctx.fillStyle = "#b09878";
    ctx.fillRect(px + 2, py + 2, TILE_SIZE * 2 - 4, 8);
    ctx.fillStyle = "#d0b888";
    ctx.fillRect(px + 3, py + 3, TILE_SIZE * 2 - 6, 5);
    // Banner hanging from arch
    ctx.fillStyle = "#224488";
    ctx.fillRect(px + TILE_SIZE - 10, py + 6, 20, 14);
    ctx.fillStyle = "#ffe070";
    ctx.fillRect(px + TILE_SIZE - 5, py + 9, 10, 8);
    // Star emblem
    ctx.fillStyle = "#224488";
    ctx.font = "7px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", px + TILE_SIZE, py + 13);
  } catch {
    /* decorative — never crash */
  }
}

// ─── Aurelion Fountain ────────────────────────────────────────────────────────

function drawAurelionFountain(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  timestamp: number,
): void {
  try {
    ctx.save();
    const cx = px + TILE_SIZE;
    const cy = py + TILE_SIZE;

    // Basin (2 tiles wide)
    ctx.fillStyle = "#2a5fa0";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a74bb";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Basin rim highlight
    ctx.fillStyle = "rgba(100,180,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Central pillar
    ctx.fillStyle = "#c8b090";
    ctx.fillRect(cx - 3, cy - 10, 6, 16);
    ctx.fillStyle = "#e8d0b0";
    ctx.fillRect(cx - 2, cy - 10, 3, 16);

    // Ripple rings on basin
    const ripplePhase = (timestamp * 0.001) % (Math.PI * 2);
    for (let r = 0; r < 2; r++) {
      const rPhase = ripplePhase + r * Math.PI;
      const rippleR = 8 + Math.sin(rPhase) * 4;
      const rippleA = Math.max(0, Math.cos(rPhase) * 0.5);
      ctx.globalAlpha = rippleA;
      ctx.strokeStyle = "#5599cc";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 6, rippleR, rippleR * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Water arc particles (3-5 droplets per stream, 3 streams)
    for (let stream = 0; stream < 3; stream++) {
      const streamAngle = (stream / 3) * Math.PI * 2 + timestamp * 0.0008;
      const phaseOffset = stream * 0.7;
      for (let p = 0; p < 4; p++) {
        // Each particle progresses through arc over time
        const particlePhase =
          (timestamp * 0.002 + phaseOffset + p * 0.25) % 1.0;
        // Parabolic arc: t=0 at base, t=1 at landing
        const t = particlePhase;
        const arcX = cx + Math.cos(streamAngle) * (t * 12);
        // Parabolic height: rises then falls
        const arcY = cy - 10 + t * 14 - Math.sin(t * Math.PI) * 16;
        const alpha = Math.sin(t * Math.PI) * 0.8 + 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#88ccee";
        ctx.beginPath();
        ctx.arc(arcX, arcY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mist particles at base
    for (let m = 0; m < 4; m++) {
      const mistAngle = (m / 4) * Math.PI * 2 + timestamp * 0.0003;
      const mistR = 10 + Math.sin(timestamp * 0.001 + m) * 3;
      const mistX = cx + Math.cos(mistAngle) * mistR;
      const mistY = cy + 6 + Math.sin(mistAngle * 2) * 2;
      ctx.globalAlpha = 0.15 + Math.sin(timestamp * 0.002 + m) * 0.08;
      ctx.fillStyle = "#aaddee";
      ctx.beginPath();
      ctx.arc(mistX, mistY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

// ─── Zone decorations (zero-collision visual overlays) ───────────────────────
// Drawn after tiles, before entities. Pure canvas shapes — no walkability impact.
function drawZoneDecorations(
  ctx: CanvasRenderingContext2D,
  zoneId: ZoneId,
  camX: number,
  camY: number,
  ts: number,
): void {
  try {
    ctx.save();
    const T = TILE_SIZE;
    const sx = (tx: number) => Math.floor(tx * T - camX);
    const sy = (ty: number) => Math.floor(ty * T - camY);

    // ── MEADOW HUB ────────────────────────────────────────────────────────────
    if (zoneId === "meadow_hub") {
      // Stone well at tile 6,8
      try {
        const wx = sx(6) + T / 2;
        const wy = sy(8) + T / 2 + 4;
        ctx.fillStyle = "#5a5a5a";
        ctx.beginPath();
        ctx.ellipse(wx, wy + 4, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a6090";
        ctx.beginPath();
        ctx.ellipse(wx, wy + 4, 8, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7a7870";
        ctx.fillRect(wx - 10, wy - 6, 20, 11);
        ctx.fillStyle = "#9a9888";
        ctx.fillRect(wx - 9, wy - 5, 18, 9);
        ctx.fillStyle = "#666460";
        ctx.fillRect(wx - 10, wy + 4, 20, 2);
        ctx.fillStyle = "#5a4020";
        ctx.fillRect(wx - 10, wy - 10, 3, 6);
        ctx.fillRect(wx + 7, wy - 10, 3, 6);
        ctx.strokeStyle = "#8a6820";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wx - 8, wy - 9);
        ctx.lineTo(wx, wy - 6);
        ctx.lineTo(wx + 9, wy - 9);
        ctx.stroke();
      } catch {
        /* decorative */
      }

      // Wooden benches at (10,16), (22,16), (10,20)
      for (const [btx, bty] of [
        [10, 16],
        [22, 16],
        [10, 20],
      ] as [number, number][]) {
        try {
          const bx2 = sx(btx) + 2;
          const by2 = sy(bty) + T - 12;
          ctx.fillStyle = "#7a5020";
          ctx.fillRect(bx2, by2, 26, 5);
          ctx.fillStyle = "#9a6830";
          ctx.fillRect(bx2, by2, 26, 2);
          ctx.fillStyle = "#5a3a10";
          ctx.fillRect(bx2 + 2, by2 + 5, 3, 7);
          ctx.fillRect(bx2 + 21, by2 + 5, 3, 7);
        } catch {
          /* decorative */
        }
      }

      // Vegetable patches at (5,10) and (27,10)
      for (const [gtx, gty, gseed] of [
        [5, 10, 3],
        [27, 10, 7],
      ] as [number, number, number][]) {
        try {
          const gx2 = sx(gtx) + 2;
          const gy2 = sy(gty) + 4;
          ctx.fillStyle = "#5a3a18";
          ctx.fillRect(gx2, gy2, 26, 20);
          ctx.fillStyle = "#6a4a22";
          ctx.fillRect(gx2 + 1, gy2 + 1, 24, 18);
          const vegC = ["#2a9a20", "#40b830", "#e84020", "#e0c820"];
          for (let vi = 0; vi < 4; vi++) {
            ctx.fillStyle = vegC[(gseed + vi) % vegC.length]!;
            ctx.beginPath();
            ctx.arc(gx2 + 5 + vi * 6, gy2 + 10, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#1a7010";
            ctx.fillRect(gx2 + 4 + vi * 6, gy2 + 11, 2, 5);
          }
        } catch {
          /* decorative */
        }
      }

      // Hanging laundry between tiles (13,12) and (17,12)
      try {
        const lx1 = sx(13) + T / 2;
        const lx2 = sx(17) + T / 2;
        const lly = sy(12) + 8;
        ctx.strokeStyle = "#c8a870";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx1, lly);
        ctx.quadraticCurveTo((lx1 + lx2) / 2, lly + 4, lx2, lly);
        ctx.stroke();
        const clothC = ["#4488cc", "#e84444", "#44aa44", "#cccc44"];
        for (let ci = 0; ci < 4; ci++) {
          const cx2 = lx1 + ((lx2 - lx1) / 5) * (ci + 1);
          const clothY = lly + 2 + Math.sin((ci / 4) * Math.PI) * 2;
          ctx.fillStyle = clothC[ci]!;
          ctx.fillRect(cx2 - 4, clothY, 8, 10);
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.fillRect(cx2 + 2, clothY, 2, 10);
          ctx.fillStyle = "#8a5a20";
          ctx.fillRect(cx2 - 1, clothY - 3, 2, 4);
        }
      } catch {
        /* decorative */
      }

      // Stray cat — alternates (9,19)↔(11,19) every 2s
      try {
        const catPhase = Math.floor(ts / 2000) % 2;
        const catX = sx(catPhase === 0 ? 9 : 11) + T / 2;
        const catY = sy(19) + T - 10;
        const bob = Math.sin(ts * 0.004) * 1.5;
        const dir = catPhase === 0 ? 1 : -1;
        ctx.fillStyle = "#cc8844";
        ctx.fillRect(catX - 7, catY + bob, 14, 8);
        ctx.fillStyle = "#dd9955";
        ctx.beginPath();
        ctx.arc(catX + dir * 5, catY - 2 + bob, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#cc8844";
        ctx.fillRect(catX + dir * 3, catY - 7 + bob, 3, 4);
        ctx.fillRect(catX + dir * 7, catY - 7 + bob, 3, 4);
        ctx.strokeStyle = "#cc8844";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(catX - dir * 7, catY + 6 + bob);
        ctx.quadraticCurveTo(
          catX - dir * 12,
          catY + bob,
          catX - dir * 10,
          catY - 4 + bob,
        );
        ctx.stroke();
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(catX + dir * 3, catY - 3 + bob, 2, 2);
        ctx.fillRect(catX + dir * 7, catY - 3 + bob, 2, 2);
      } catch {
        /* decorative */
      }

      // Birds on rooftops — appear/disappear with sin wave
      for (const [birdTx, birdTy, bseed] of [
        [8, 8, 1],
        [24, 8, 5],
        [16, 6, 9],
      ] as [number, number, number][]) {
        try {
          if (Math.sin(ts * 0.0007 + bseed * 2.1) <= 0.2) continue;
          const bx2 = sx(birdTx) + T / 2;
          const by2 = sy(birdTy) + 6;
          ctx.fillStyle = "#222222";
          ctx.beginPath();
          ctx.arc(bx2, by2, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx2 + 3, by2, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#222222";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(bx2 + 1.5, by2, 2.5, Math.PI, 0);
          ctx.stroke();
        } catch {
          /* decorative */
        }
      }

      // Puddle reflections on stone path tiles
      for (const [ptx, pty] of [
        [15, 17],
        [16, 20],
        [14, 23],
      ] as [number, number][]) {
        try {
          ctx.globalAlpha = 0.25 + Math.sin(ts * 0.001 + ptx) * 0.05;
          ctx.fillStyle = "#8aabcc";
          ctx.beginPath();
          ctx.ellipse(
            sx(ptx) + T / 2,
            sy(pty) + T - 6,
            8,
            3,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.globalAlpha = 1;
        } catch {
          /* decorative */
        }
      }

      // Flower pots at building tiles (7,14), (11,14), (21,14), (25,14)
      for (const [fptx, fpty, fc] of [
        [7, 14, "#e84040"],
        [11, 14, "#e8c830"],
        [21, 14, "#e060b0"],
        [25, 14, "#6060e8"],
      ] as [number, number, string][]) {
        try {
          const fpx2 = sx(fptx) + T - 8;
          const fpy2 = sy(fpty) + T - 10;
          ctx.fillStyle = "#c06820";
          ctx.fillRect(fpx2, fpy2 + 4, 8, 7);
          ctx.fillStyle = "#a05010";
          ctx.fillRect(fpx2 - 1, fpy2 + 3, 10, 3);
          ctx.fillStyle = fc;
          ctx.beginPath();
          ctx.arc(fpx2 + 4, fpy2, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffe060";
          ctx.beginPath();
          ctx.arc(fpx2 + 4, fpy2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } catch {
          /* decorative */
        }
      }

      // Butterflies — 3 figure-8 flight paths near flower areas
      if (!shouldSkipDecorativeParticles()) {
        try {
          const bfData: Array<[number, number, number, string]> = [
            [9, 20, 0.0, "#f0c020"],
            [14, 22, 1.1, "#e07020"],
            [22, 18, 2.3, "#4080e0"],
          ];
          for (const [btx, bty, bphase, bcolor] of bfData) {
            const bfCx = sx(btx) + T / 2;
            const bfCy = sy(bty) + T / 2;
            const bfT = ts * 0.0018 + bphase;
            const bfx = bfCx + Math.sin(bfT * 2) * 14;
            const bfy = bfCy + Math.sin(bfT) * 9;
            const wingFlap = Math.abs(Math.sin(ts * 0.01 + bphase));
            const wingW = 4 + wingFlap * 2;
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = bcolor;
            ctx.beginPath();
            ctx.ellipse(bfx - wingW / 2, bfy, wingW, 3, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(bfx + wingW / 2, bfy, wingW, 3, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#1a1a1a";
            ctx.beginPath();
            ctx.ellipse(bfx, bfy, 1.5, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        } catch {
          /* decorative */
        }
      }

      // Children NPCs near fountain (tile ~15,15) — small looping walks
      try {
        const childData: Array<[number, number, number, string, string]> = [
          [15, 15, 0.0, "#e08040", "#ffcc88"],
          [17, 16, 1.6, "#4080c8", "#ffe8c8"],
        ];
        for (const [chtx, chty, chphase, chOutfit, chSkin] of childData) {
          const chCx = sx(chtx) + T / 2;
          const chCy = sy(chty) + T / 2;
          const chT = ts * 0.0008 + chphase;
          const chx = chCx + Math.cos(chT) * 12;
          const chy = chCy + Math.sin(chT) * 8;
          const chBob = Math.abs(Math.sin(chT * 4)) * 1.5;
          ctx.fillStyle = chSkin;
          ctx.beginPath();
          ctx.arc(chx, chy - 8 - chBob, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = chOutfit;
          ctx.fillRect(chx - 3, chy - 4 - chBob, 6, 7);
          ctx.fillStyle = chSkin;
          ctx.fillRect(chx - 3, chy + 3 - chBob, 2, 5);
          ctx.fillRect(chx + 1, chy + 3 - chBob, 2, 5);
        }
      } catch {
        /* decorative */
      }

      // Dog NPC wandering near spawn (tile ~5,6) — wagging tail
      try {
        const dogPhase = Math.floor(ts / 1800) % 4;
        const dogOffsets = [0, 8, 16, 8];
        const dogX = sx(5) + T / 2 + dogOffsets[dogPhase]!;
        const dogY = sy(6) + T - 8;
        const waggle = Math.sin(ts * 0.006) * 3;
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(dogX - 8, dogY - 4, 16, 8);
        ctx.fillStyle = "#a0692e";
        ctx.beginPath();
        ctx.ellipse(dogX + 8, dogY - 2, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7a4a1e";
        ctx.beginPath();
        ctx.ellipse(dogX + 7, dogY - 5, 2, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(dogX + 11, dogY - 5, 2, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7a4a1e";
        ctx.fillRect(dogX - 6, dogY + 4, 3, 5);
        ctx.fillRect(dogX, dogY + 4, 3, 5);
        ctx.strokeStyle = "#8b5a2b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dogX - 8, dogY);
        ctx.quadraticCurveTo(
          dogX - 14,
          dogY - 6 + waggle,
          dogX - 12,
          dogY - 10 + waggle,
        );
        ctx.stroke();
      } catch {
        /* decorative */
      }

      // Chimney smoke rising from building rooftops
      if (!shouldSkipDecorativeParticles()) {
        try {
          for (const [chix, chiy] of [
            [8, 7],
            [24, 7],
          ] as [number, number][]) {
            const cpx = sx(chix) + T - 4;
            const cpy = sy(chiy) + 2;
            for (let pi = 0; pi < 3; pi++) {
              const phasedT = (ts * 0.0004 + pi * 0.5) % 1.0;
              const smokeY = cpy - phasedT * 24;
              const smokeX = cpx + Math.sin(ts * 0.001 + pi * 1.2) * 3;
              ctx.globalAlpha = (1 - phasedT) * 0.35;
              ctx.fillStyle = "#c8c8c8";
              ctx.beginPath();
              ctx.arc(smokeX, smokeY, 3 + phasedT * 3, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
        } catch {
          /* decorative */
        }
      }

      // Merchant cart near market area (tile ~20,14) — top-down view
      try {
        const mcx = sx(20) + 2;
        const mcy = sy(14) + 4;
        ctx.fillStyle = "#8a5a20";
        ctx.fillRect(mcx, mcy + 8, 26, 14);
        ctx.fillStyle = "#a06a28";
        ctx.fillRect(mcx + 1, mcy + 9, 24, 12);
        ctx.strokeStyle = "#6a4010";
        ctx.lineWidth = 1;
        for (let pl = 0; pl < 4; pl++) {
          ctx.beginPath();
          ctx.moveTo(mcx + 3 + pl * 6, mcy + 8);
          ctx.lineTo(mcx + 3 + pl * 6, mcy + 22);
          ctx.stroke();
        }
        for (let cs = 0; cs < 4; cs++) {
          ctx.fillStyle = cs % 2 === 0 ? "#dd3322" : "#f0f0e8";
          ctx.fillRect(mcx + cs * 6, mcy, 6, 9);
        }
        ctx.fillStyle = "#aa2211";
        ctx.fillRect(mcx - 2, mcy + 8, 30, 2);
        ctx.strokeStyle = "#5a3010";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(mcx + 4, mcy + 16, 4, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(mcx + 22, mcy + 16, 4, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } catch {
        /* decorative */
      }
    }

    // ── AURELION ──────────────────────────────────────────────────────────────
    if (zoneId === "aurelion") {
      // Stars — always visible (magical city)
      try {
        const starData: Array<[number, number, number]> = [
          [3, 4, 0.7],
          [8, 2, 1.1],
          [14, 3, 0.9],
          [20, 2, 1.3],
          [26, 4, 0.8],
          [30, 3, 1.0],
          [5, 8, 0.6],
          [16, 6, 1.2],
          [23, 7, 0.75],
          [29, 9, 0.95],
          [11, 5, 1.15],
          [18, 4, 0.85],
          [25, 6, 1.05],
          [7, 3, 0.65],
          [33, 5, 0.9],
          [2, 6, 1.0],
          [12, 8, 0.8],
          [21, 5, 1.1],
          [28, 3, 0.7],
          [35, 7, 0.85],
        ];
        for (const [stx, sty, sparkle] of starData) {
          const ssx = sx(stx) + ((stx * 7) % 16);
          const ssy = sy(sty) + ((sty * 5) % 12);
          ctx.globalAlpha =
            0.5 + Math.sin(ts * 0.0008 * sparkle + stx * 0.4) * 0.4;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(ssx, ssy, 1, 1);
          if (sparkle > 1.0) {
            ctx.fillRect(ssx - 1, ssy, 3, 1);
            ctx.fillRect(ssx, ssy - 1, 1, 3);
          }
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Magical floating orbs near Mage Academy area (tiles ~8-13, y 5-9)
      try {
        const orbData: Array<[number, number, number, number, string]> = [
          [9, 6, 0.6, 0.8, "#6688ff"],
          [11, 5, 0.9, 1.1, "#aa66ff"],
          [10, 8, 1.3, 0.7, "#4499ff"],
          [12, 7, 0.4, 1.4, "#8855ff"],
          [8, 9, 1.8, 0.5, "#55aaff"],
          [13, 6, 2.2, 0.9, "#9966ff"],
        ];
        for (const [otx, oty, phX, phY, oc] of orbData) {
          const orbX = sx(otx) + T / 2 + Math.sin(ts * 0.0008 * phX + phX) * 10;
          const orbY = sy(oty) + T / 2 + Math.cos(ts * 0.0006 * phY + phY) * 8;
          const orbR = 3 + Math.sin(ts * 0.001 + phX);
          ctx.globalAlpha = 0.65 + Math.sin(ts * 0.0012 + phY) * 0.2;
          ctx.fillStyle = oc;
          ctx.beginPath();
          ctx.arc(orbX, orbY, orbR, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.arc(orbX, orbY, orbR + 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Sword display rack near Warriors Guild (~tile 25,8)
      try {
        const rdx = sx(25) + 4;
        const rdy = sy(8) + 6;
        ctx.fillStyle = "#8a5a20";
        ctx.fillRect(rdx, rdy, 24, 4);
        ctx.fillRect(rdx, rdy + 14, 24, 4);
        ctx.fillRect(rdx, rdy, 3, 18);
        ctx.fillRect(rdx + 21, rdy, 3, 18);
        for (let si = 0; si < 3; si++) {
          const swordX = rdx + 5 + si * 7;
          ctx.fillStyle = "#c0c8d0";
          ctx.fillRect(swordX, rdy - 8, 2, 22);
          ctx.fillStyle = "#a0a8b0";
          ctx.fillRect(swordX + 1, rdy - 8, 1, 22);
          ctx.fillStyle = "#8a7030";
          ctx.fillRect(swordX - 2, rdy + 6, 6, 3);
          ctx.fillStyle = "#c09040";
          ctx.beginPath();
          ctx.arc(swordX + 1, rdy + 13, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch {
        /* decorative */
      }

      // Market stall awnings (~tiles 18-24, y 12) — colorful stripes
      try {
        const awningC: Array<[string, string]> = [
          ["#e84040", "#f0c060"],
          ["#4488cc", "#f0f0f0"],
          ["#44aa44", "#ffee60"],
        ];
        for (let ai = 0; ai < 3; ai++) {
          const [c1, c2] = awningC[ai]!;
          const awx = sx(18 + ai * 2) + 1;
          const awy = sy(12) + 2;
          for (let stripe = 0; stripe < 4; stripe++) {
            ctx.fillStyle = stripe % 2 === 0 ? c1! : c2!;
            ctx.fillRect(awx + stripe * 8, awy, 8, 10);
          }
          for (let fi = 0; fi < 5; fi++) {
            ctx.fillStyle = c1!;
            ctx.fillRect(awx + fi * 8, awy + 10, 6, 4);
          }
          ctx.fillStyle = "#6a4a18";
          ctx.fillRect(awx + 2, awy + 10, 3, 16);
          ctx.fillRect(awx + T * 2 - 7, awy + 10, 3, 16);
        }
      } catch {
        /* decorative */
      }

      // Temple inscriptions glowing on wall tiles (~14-16, y 18-20)
      try {
        const glyphData: Array<[number, number, string]> = [
          [14, 18, "#cc88ff"],
          [15, 18, "#aa66ff"],
          [16, 18, "#cc88ff"],
          [14, 20, "#bb77ff"],
          [16, 20, "#bb77ff"],
        ];
        for (const [gtx, gty, gc] of glyphData) {
          ctx.globalAlpha =
            0.4 + Math.sin(ts * 0.001 + gtx * 0.5 + gty * 0.7) * 0.3;
          ctx.fillStyle = gc;
          const gx2 = sx(gtx) + 4;
          const gy2 = sy(gty) + 4;
          ctx.fillRect(gx2 + 4, gy2, 2, 20);
          ctx.fillRect(gx2, gy2 + 4, 10, 2);
          ctx.fillRect(gx2, gy2 + 12, 10, 2);
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Carpets leading into buildings at (16,14) and (26,14)
      for (const [crptx, crpty, cc] of [
        [16, 14, "#882222"],
        [26, 14, "#225588"],
      ] as [number, number, string][]) {
        try {
          const crpx = sx(crptx) + 4;
          const crpy = sy(crpty) + T - 6;
          ctx.fillStyle = cc;
          ctx.fillRect(crpx, crpy, T - 8, 7);
          ctx.fillStyle = "#f0d080";
          ctx.fillRect(crpx, crpy, T - 8, 2);
          ctx.fillRect(crpx, crpy + 5, T - 8, 2);
          ctx.fillRect(crpx + T / 2 - 6, crpy + 2, 4, 3);
          ctx.fillRect(crpx + T / 2 - 2, crpy + 1, 4, 5);
          ctx.fillRect(crpx + T / 2 + 2, crpy + 2, 4, 3);
        } catch {
          /* decorative */
        }
      }

      // Decorative urns along main avenue
      for (const [urtx, urty, uc] of [
        [14, 10, "#c07840"],
        [18, 10, "#8040c0"],
        [22, 10, "#c07840"],
        [14, 22, "#4080c0"],
        [22, 22, "#4080c0"],
      ] as [number, number, string][]) {
        try {
          const urx = sx(urtx) + T - 10;
          const ury = sy(urty) + T - 14;
          ctx.fillStyle = uc;
          ctx.beginPath();
          ctx.ellipse(urx + 4, ury + 8, 5, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(urx - 1, ury + 4, 10, 8);
          ctx.fillStyle = "#ffffd0";
          ctx.fillRect(urx - 2, ury + 2, 12, 3);
          ctx.fillStyle = uc;
          ctx.fillRect(urx - 1, ury + 12, 10, 3);
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(urx, ury + 4, 3, 8);
          ctx.globalAlpha = 1;
        } catch {
          /* decorative */
        }
      }

      // Shooting star — random streaks across upper sky during night-like timing
      try {
        // Use a slowly-cycling random-like trigger (~2% chance per second equivalent)
        const ssCycle = Math.floor(ts / 3000) % 50; // new check every 3s, 1-in-50 chance
        if (ssCycle === 7 || ssCycle === 23 || ssCycle === 41) {
          const ssProgress = (ts % 3000) / 3000;
          if (ssProgress < 0.4) {
            const ssStartX = 80 + ((ssCycle * 97) % (CANVAS_W - 160));
            const ssStartY = 20 + ((ssCycle * 53) % 60);
            const ssEndX = ssStartX + 180 * ssProgress;
            const ssEndY = ssStartY + 50 * ssProgress;
            const ssAlpha =
              ssProgress < 0.3 ? ssProgress / 0.3 : (0.4 - ssProgress) / 0.1;
            ctx.globalAlpha = Math.max(0, Math.min(1, ssAlpha)) * 0.9;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(
              ssStartX + 180 * ssProgress - 30,
              ssStartY + 50 * ssProgress - 8,
            );
            ctx.lineTo(ssEndX, ssEndY);
            ctx.stroke();
            ctx.globalAlpha = Math.max(0, Math.min(1, ssAlpha)) * 0.4;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(
              ssStartX + 180 * ssProgress - 20,
              ssStartY + 50 * ssProgress - 5,
            );
            ctx.lineTo(ssEndX, ssEndY);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      } catch {
        /* decorative */
      }

      // Arcane circle on plaza floor outside Mage Academy (~tile 10,12)
      try {
        const acx = sx(10) + T / 2;
        const acy = sy(12) + T / 2;
        const acRot = (ts * 0.0003) % (Math.PI * 2);
        ctx.save();
        ctx.translate(acx, acy);
        ctx.rotate(acRot);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = "#8844ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#aa66ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        // 6-pointed star
        for (let pt = 0; pt < 6; pt++) {
          const a1 = (pt / 6) * Math.PI * 2;
          const a2 = ((pt + 3) / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a1) * 20, Math.sin(a1) * 20);
          ctx.lineTo(Math.cos(a2) * 20, Math.sin(a2) * 20);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.2 + Math.sin(ts * 0.002) * 0.1;
        ctx.fillStyle = "#7733ee";
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      } catch {
        /* decorative */
      }

      // Training dummy outside Warriors Guild (~tile 27,10)
      try {
        const tdx = sx(27) + T / 2;
        const tdy = sy(10) + T - 4;
        // Wobble when player is nearby (simplified: always wobble gently)
        const tdWobble = Math.sin(ts * 0.003) * 2;
        ctx.fillStyle = "#8a5a20";
        ctx.fillRect(tdx - 2, tdy - 22, 4, 22); // pole
        ctx.fillRect(tdx - 10, tdy - 20, 20, 4); // crossbar
        ctx.fillStyle = "#c88a3a";
        ctx.beginPath();
        ctx.ellipse(
          tdx + tdWobble,
          tdy - 26,
          6,
          7,
          tdWobble * 0.05,
          0,
          Math.PI * 2,
        );
        ctx.fill(); // head/body
        ctx.strokeStyle = "#8a5a20";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tdx - 10, tdy - 18);
        ctx.lineTo(tdx + 10, tdy - 18);
        ctx.stroke(); // arm band
      } catch {
        /* decorative */
      }

      // Pigeons on plaza floor tiles
      try {
        const pigeonData: Array<[number, number, number]> = [
          [17, 12, 0.0],
          [18, 13, 0.7],
          [19, 12, 1.4],
          [17, 14, 2.1],
          [20, 13, 2.8],
        ];
        for (const [ptx, pty, pphase] of pigeonData) {
          const pT = ts * 0.0005 + pphase;
          const isPaused = Math.sin(pT * 0.5) > 0.6;
          const px2 = sx(ptx) + T / 2 + (isPaused ? 0 : Math.sin(pT * 2) * 6);
          const py2 = sy(pty) + T - 8 + (isPaused ? 0 : Math.cos(pT * 1.5) * 4);
          const headBob = isPaused ? 0 : Math.sin(pT * 4) * 1;
          ctx.fillStyle = "#909090";
          ctx.beginPath();
          ctx.ellipse(px2, py2, 5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#b0b0b8";
          ctx.beginPath();
          ctx.arc(px2 + 4, py2 - 3 + headBob, 3, 0, Math.PI * 2);
          ctx.fill();
          // Beak
          ctx.fillStyle = "#ffaa40";
          ctx.fillRect(px2 + 7, py2 - 3 + headBob, 3, 1);
        }
      } catch {
        /* decorative */
      }

      // Candle clusters near temple area (~tile 14-16, y 20-22)
      try {
        const candleData: Array<[number, number]> = [
          [14, 20],
          [15, 21],
          [16, 20],
          [14, 22],
          [16, 22],
        ];
        for (const [clx, cly] of candleData) {
          const cpx2 = sx(clx) + ((clx * 7 + 3) % (T - 6));
          const cpy2 = sy(cly) + T - 14;
          // Candle body
          ctx.fillStyle = "#f0ede0";
          ctx.fillRect(cpx2, cpy2 + 4, 4, 9);
          // Wick
          ctx.fillStyle = "#3a2a10";
          ctx.fillRect(cpx2 + 1, cpy2 + 2, 2, 3);
          // Flame — oscillate height
          const flameH = 5 + Math.sin(ts * 0.008 + clx * 0.7) * 1.5;
          ctx.fillStyle = "#ff8820";
          ctx.beginPath();
          ctx.moveTo(cpx2 + 2, cpy2 + 2);
          ctx.quadraticCurveTo(cpx2 + 4, cpy2, cpx2 + 2, cpy2 - flameH);
          ctx.quadraticCurveTo(cpx2, cpy2, cpx2 + 2, cpy2 + 2);
          ctx.fill();
          ctx.fillStyle = "#ffee60";
          ctx.beginPath();
          ctx.arc(cpx2 + 2, cpy2 - flameH * 0.4, 1.5, 0, Math.PI * 2);
          ctx.fill();
          // Soft glow
          ctx.globalAlpha = 0.15 + Math.sin(ts * 0.006 + cly) * 0.07;
          ctx.fillStyle = "#ff9940";
          ctx.beginPath();
          ctx.arc(cpx2 + 2, cpy2, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }
    }

    // ── FOREST + DARK FOREST ──────────────────────────────────────────────────
    const isForestZone =
      zoneId === "forest_depths" ||
      zoneId === "wolf_forest" ||
      zoneId === "bear_forest" ||
      zoneId === "tiger_jungle" ||
      zoneId === "dark_forest";
    if (isForestZone && !shouldSkipDecorativeParticles()) {
      // Fireflies — unique phase per index, denser in dark_forest
      try {
        const flyCount = zoneId === "dark_forest" ? 12 : 8;
        const flyPos: Array<[number, number, number]> = [
          [8, 10, 0.0],
          [12, 14, 0.3],
          [16, 8, 0.6],
          [20, 12, 0.9],
          [6, 18, 1.2],
          [14, 20, 1.5],
          [24, 16, 1.8],
          [10, 22, 2.1],
          [18, 6, 2.4],
          [22, 20, 2.7],
          [7, 14, 3.0],
          [25, 10, 3.3],
        ];
        for (let fi = 0; fi < flyCount; fi++) {
          const [ftx, fty, phase] = flyPos[fi]!;
          const ffx =
            sx(ftx) + T / 2 + Math.sin(ts * 0.0008 + phase + fi * 0.7) * 12;
          const ffy =
            sy(fty) + T / 2 + Math.cos(ts * 0.0006 + phase + fi * 0.5) * 10;
          const flyA = 0.5 + Math.sin(ts * 0.002 + phase) * 0.45;
          ctx.globalAlpha = Math.max(0, flyA);
          ctx.fillStyle = zoneId === "dark_forest" ? "#88ff44" : "#ccff60";
          ctx.beginPath();
          ctx.arc(ffx, ffy, 2, 0, Math.PI * 2);
          ctx.fill();
          if (zoneId === "dark_forest") {
            ctx.globalAlpha = flyA * 0.25;
            ctx.beginPath();
            ctx.arc(ffx, ffy, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Fallen logs
      try {
        for (const [ltx, lty] of [
          [5, 12],
          [20, 9],
          [10, 22],
          [26, 18],
        ] as [number, number][]) {
          const lx2 = sx(ltx) + 2;
          const ly2 = sy(lty) + T - 10;
          ctx.fillStyle = "#6a3a10";
          ctx.fillRect(lx2, ly2, 28, 9);
          ctx.fillStyle = "#8a5020";
          ctx.fillRect(lx2, ly2, 28, 3);
          ctx.fillStyle = "#4a2808";
          ctx.fillRect(lx2, ly2 + 8, 28, 2);
          ctx.fillStyle = "#5a3010";
          ctx.beginPath();
          ctx.ellipse(lx2 + 2, ly2 + 4, 2, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(lx2 + 28, ly2 + 4, 2, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch {
        /* decorative */
      }

      // Mushroom clusters (slight glow in dark_forest)
      try {
        const mushPos: Array<[number, number, string, string]> = [
          [9, 16, "#e84020", "#f07050"],
          [15, 11, "#e86020", "#f09050"],
          [21, 17, "#cc4020", "#e06040"],
          [27, 13, "#e84020", "#f07050"],
        ];
        for (const [mtx, mty, capC, hiC] of mushPos) {
          const mx2 = sx(mtx) + T / 2;
          const my2 = sy(mty) + T - 6;
          for (let mi = 0; mi < 3; mi++) {
            const mox = (mi - 1) * 9;
            const mh = 6 + mi;
            ctx.fillStyle = "#e8dcc8";
            ctx.fillRect(mx2 + mox - 2, my2 - mh, 5, mh);
            ctx.fillStyle = capC;
            ctx.beginPath();
            ctx.ellipse(mx2 + mox, my2 - mh, 6, 4, 0, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = hiC;
            ctx.beginPath();
            ctx.ellipse(mx2 + mox - 1, my2 - mh - 1, 3, 2, 0, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = "#fffcf0";
            ctx.beginPath();
            ctx.arc(mx2 + mox + 1, my2 - mh - 2, 1, 0, Math.PI * 2);
            ctx.fill();
            if (zoneId === "dark_forest") {
              ctx.globalAlpha = 0.15 + Math.sin(ts * 0.001 + mox) * 0.1;
              ctx.fillStyle = "#ff6020";
              ctx.beginPath();
              ctx.arc(mx2 + mox, my2 - mh, 8, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
        }
      } catch {
        /* decorative */
      }

      // Spider webs in dark_forest corners
      if (zoneId === "dark_forest") {
        try {
          for (const [wcx, wcy] of [
            [3, 3],
            [28, 3],
            [3, 28],
            [28, 28],
          ] as [number, number][]) {
            const centerX = sx(wcx) + (wcx < 10 ? T * 2 : -T);
            const centerY = sy(wcy) + (wcy < 10 ? T * 2 : -T);
            ctx.strokeStyle = "rgba(200,200,220,0.5)";
            ctx.lineWidth = 0.8;
            for (let ri = 0; ri < 5; ri++) {
              const angle =
                (ri / 5) * Math.PI * 0.5 +
                (wcx < 10 ? Math.PI : 0) +
                (wcy < 10 ? Math.PI * 0.5 : 0);
              ctx.beginPath();
              ctx.moveTo(centerX, centerY);
              ctx.lineTo(
                centerX + Math.cos(angle) * T * 2,
                centerY + Math.sin(angle) * T * 2,
              );
              ctx.stroke();
            }
            for (let ci2 = 1; ci2 <= 3; ci2++) {
              ctx.globalAlpha = 0.3;
              ctx.beginPath();
              ctx.arc(centerX, centerY, ci2 * T * 0.6, 0, Math.PI * 0.5);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        } catch {
          /* decorative */
        }
      }

      // Owl at a fixed tree tile — head rotates every 5-8 seconds
      try {
        const owlX = sx(23) + T / 2;
        const owlY = sy(5) + T / 2;
        // Head rotation: slow period, snaps to rotated position
        const owlCycle = (ts * 0.0002) % (Math.PI * 2);
        const owlHeadAngle =
          Math.sin(owlCycle * 0.7) > 0.85 ? Math.sin(owlCycle) * 0.6 : 0;
        ctx.fillStyle = "#6a4a22";
        ctx.beginPath();
        ctx.ellipse(owlX, owlY + 2, 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(owlX, owlY - 6);
        ctx.rotate(owlHeadAngle);
        ctx.fillStyle = "#8a6a32";
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        // Ear tufts
        ctx.fillStyle = "#6a4a22";
        ctx.beginPath();
        ctx.moveTo(-4, -4);
        ctx.lineTo(-6, -10);
        ctx.lineTo(-1, -6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(4, -4);
        ctx.lineTo(6, -10);
        ctx.lineTo(1, -6);
        ctx.closePath();
        ctx.fill();
        // Eyes
        ctx.fillStyle = "#ffcc00";
        ctx.beginPath();
        ctx.arc(-2.5, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2.5, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(-2.5, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2.5, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } catch {
        /* decorative */
      }

      // Falling leaves — gentle drift downward with sine sway
      try {
        const leafColors =
          zoneId === "dark_forest"
            ? ["#3a6020", "#2a5018", "#446828"]
            : ["#e09020", "#c07818", "#d8a028"];
        const leafData: Array<[number, number, number]> = [
          [8, 0.0, 0.3],
          [14, 0.4, 0.5],
          [20, 0.8, 0.4],
          [26, 1.3, 0.6],
        ];
        for (const [ltx, lphase, lspeed] of leafData) {
          const lT = (ts * lspeed * 0.0004 + lphase) % 1.0;
          const lx2 =
            sx(ltx) + T / 2 + Math.sin(lT * Math.PI * 4 + lphase) * 12;
          const ly2 = sy(2) + lT * (CANVAS_H - 40) * 0.6;
          const lAlpha = lT < 0.8 ? 0.7 : (1 - lT) * 3.5;
          ctx.globalAlpha = Math.max(0, lAlpha) * 0.8;
          ctx.fillStyle =
            leafColors[Math.floor(lphase * 3) % leafColors.length]!;
          ctx.save();
          ctx.translate(lx2, ly2);
          ctx.rotate(lT * Math.PI * 3 + lphase);
          ctx.beginPath();
          ctx.ellipse(0, 0, 4, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }
    }

    // ── CAVE ──────────────────────────────────────────────────────────────────
    const isCaveZone =
      zoneId === "cave_interior" ||
      zoneId === "bat_cave" ||
      zoneId === "deep_cave" ||
      zoneId === "hub_basement";
    if (isCaveZone) {
      // Stalactites hanging from y=2 tiles
      try {
        for (const [stx, sty, sh] of [
          [6, 2, 14],
          [10, 2, 10],
          [15, 2, 16],
          [20, 2, 12],
          [25, 2, 14],
          [30, 2, 10],
        ] as [number, number, number][]) {
          const spx = sx(stx) + T / 2;
          const spy = sy(sty) + 2;
          ctx.fillStyle = "#4a4848";
          ctx.beginPath();
          ctx.moveTo(spx - 5, spy);
          ctx.lineTo(spx + 5, spy);
          ctx.lineTo(spx, spy + sh);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#6a6666";
          ctx.beginPath();
          ctx.moveTo(spx - 2, spy);
          ctx.lineTo(spx + 1, spy);
          ctx.lineTo(spx - 1, spy + sh * 0.6);
          ctx.closePath();
          ctx.fill();
          const dripPhase = (ts * 0.0008 + stx * 0.4) % 1.0;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = "#5588aa";
          ctx.beginPath();
          ctx.arc(
            spx,
            spy + sh + dripPhase * 12,
            1.5 * (1 - dripPhase * 0.5),
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Glowing crystal formations on cave walls
      try {
        for (const [crx, cry2, cc] of [
          [4, 8, "#44bbcc"],
          [8, 5, "#22aacc"],
          [18, 9, "#44ccbb"],
          [24, 6, "#2288aa"],
          [29, 8, "#44bbcc"],
        ] as [number, number, string][]) {
          const cpx = sx(crx) + T / 2;
          const cpy = sy(cry2) + T - 8;
          const pulse = 0.4 + Math.sin(ts * 0.0015 + crx * 0.3) * 0.2;
          ctx.globalAlpha = pulse * 0.3;
          ctx.fillStyle = cc;
          ctx.beginPath();
          ctx.arc(cpx, cpy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          for (let ci3 = 0; ci3 < 3; ci3++) {
            const cxo = (ci3 - 1) * 7;
            const ch2 = 8 + ci3 * 2;
            ctx.fillStyle = cc;
            ctx.beginPath();
            ctx.moveTo(cpx + cxo, cpy - ch2);
            ctx.lineTo(cpx + cxo + 4, cpy);
            ctx.lineTo(cpx + cxo, cpy + 3);
            ctx.lineTo(cpx + cxo - 4, cpy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#99ddee";
            ctx.beginPath();
            ctx.moveTo(cpx + cxo, cpy - ch2);
            ctx.lineTo(cpx + cxo + 2, cpy - ch2 * 0.3);
            ctx.lineTo(cpx + cxo - 2, cpy);
            ctx.closePath();
            ctx.fill();
          }
        }
      } catch {
        /* decorative */
      }

      // Torch sprites on cave walls
      try {
        for (const [ttx, tty] of [
          [7, 10],
          [16, 7],
          [26, 12],
          [20, 20],
        ] as [number, number][]) {
          const tpx = sx(ttx) + T - 6;
          const tpy = sy(tty) + 6;
          ctx.fillStyle = "#8a5a20";
          ctx.fillRect(tpx, tpy + 6, 4, 14);
          const flicker = Math.sin(ts * 0.006 + ttx) * 2;
          ctx.fillStyle = "#ff8820";
          ctx.beginPath();
          ctx.moveTo(tpx + 2, tpy + 6);
          ctx.quadraticCurveTo(
            tpx + 2 + flicker,
            tpy,
            tpx + 2,
            tpy - 6 + flicker * 0.5,
          );
          ctx.quadraticCurveTo(tpx + 2 - flicker, tpy, tpx + 2, tpy + 6);
          ctx.fill();
          ctx.fillStyle = "#ffcc40";
          ctx.beginPath();
          ctx.moveTo(tpx + 2, tpy + 4);
          ctx.quadraticCurveTo(
            tpx + 2 + flicker * 0.5,
            tpy + 1,
            tpx + 2,
            tpy - 2,
          );
          ctx.quadraticCurveTo(
            tpx + 2 - flicker * 0.5,
            tpy + 1,
            tpx + 2,
            tpy + 4,
          );
          ctx.fill();
          ctx.globalAlpha = 0.25 + Math.sin(ts * 0.004 + ttx) * 0.1;
          ctx.fillStyle = "#ff8820";
          ctx.beginPath();
          ctx.arc(tpx + 2, tpy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Underground lake in back cave area — dark navy water with shimmer
      try {
        const lakeX = sx(12) + 4;
        const lakeY = sy(22) + 4;
        const lakeW = T * 6 - 8;
        const lakeH = T * 3 - 8;
        ctx.fillStyle = "#0a1830";
        ctx.fillRect(lakeX, lakeY, lakeW, lakeH);
        ctx.fillStyle = "#0d2040";
        ctx.fillRect(lakeX + 2, lakeY + 2, lakeW - 4, lakeH - 4);
        // Shimmer highlights
        const shimmerData: Array<[number, number, number]> = [
          [0.15, 0.3, 0.6],
          [0.55, 0.5, 1.1],
          [0.8, 0.2, 0.8],
        ];
        for (const [rx, ry, spd] of shimmerData) {
          const shimAlpha = 0.08 + Math.sin(ts * 0.0008 * spd + spd * 2) * 0.06;
          ctx.globalAlpha = shimAlpha;
          ctx.strokeStyle = "#3a88cc";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lakeX + lakeW * rx, lakeY + lakeH * ry);
          ctx.lineTo(lakeX + lakeW * rx + 14, lakeY + lakeH * ry + 1);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#1a3a5a";
        ctx.lineWidth = 2;
        ctx.strokeRect(lakeX, lakeY, lakeW, lakeH);
        ctx.globalAlpha = 1;
      } catch {
        /* decorative */
      }

      // Bat colony on ceiling — occasional one flies across screen
      try {
        // Stationary bats at ceiling
        const batData: Array<[number, number]> = [
          [6, 2],
          [10, 2],
          [14, 2],
          [19, 2],
          [24, 2],
          [28, 2],
        ];
        for (const [btx, bty] of batData) {
          const bx2 = sx(btx) + T / 2;
          const by2 = sy(bty) + 8;
          ctx.fillStyle = "#2a2030";
          ctx.beginPath();
          ctx.arc(bx2, by2 + 2, 3, 0, Math.PI * 2);
          ctx.fill();
          // Folded wings
          ctx.beginPath();
          ctx.moveTo(bx2 - 2, by2 + 2);
          ctx.quadraticCurveTo(bx2 - 8, by2 - 2, bx2 - 6, by2 + 4);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(bx2 + 2, by2 + 2);
          ctx.quadraticCurveTo(bx2 + 8, by2 - 2, bx2 + 6, by2 + 4);
          ctx.closePath();
          ctx.fill();
        }
        // Flying bat — triggered periodically (every ~10s, crosses in ~1.5s)
        const batFlyCycle = Math.floor(ts / 10000);
        const batFlyProgress = (ts % 10000) / 10000;
        if (batFlyProgress < 0.15) {
          const batFlyX = (batFlyProgress / 0.15) * (CANVAS_W + 60) - 30;
          const batFlyY = 30 + Math.sin(batFlyProgress * Math.PI * 8) * 10;
          const wFlap = Math.abs(Math.sin(ts * 0.015));
          const wSpread = 10 + wFlap * 6;
          ctx.fillStyle = "#2a2030";
          ctx.beginPath();
          ctx.arc(batFlyX, batFlyY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(batFlyX - 2, batFlyY);
          ctx.quadraticCurveTo(
            batFlyX - wSpread,
            batFlyY - wFlap * 8,
            batFlyX - wSpread + 4,
            batFlyY + 3,
          );
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(batFlyX + 2, batFlyY);
          ctx.quadraticCurveTo(
            batFlyX + wSpread,
            batFlyY - wFlap * 8,
            batFlyX + wSpread - 4,
            batFlyY + 3,
          );
          ctx.closePath();
          ctx.fill();
          // Return trip offset by batFlyCycle parity
          void batFlyCycle;
        }
      } catch {
        /* decorative */
      }
    }

    // ── RUINS + ANCIENT RUINS ─────────────────────────────────────────────────
    const isRuinsZone =
      zoneId === "ancient_ruins" ||
      zoneId === "crystal_ruins" ||
      zoneId === "ancient_ruins_deep";
    if (isRuinsZone) {
      // Broken statue fragments
      try {
        for (const [stx, sty] of [
          [6, 10],
          [20, 8],
          [28, 14],
          [10, 22],
        ] as [number, number][]) {
          const spx2 = sx(stx) + 4;
          const spy2 = sy(sty) + 6;
          ctx.fillStyle = "#8a8880";
          ctx.fillRect(spx2, spy2, 14, 10);
          ctx.fillRect(spx2 + 4, spy2 - 4, 8, 6);
          ctx.fillRect(spx2 + 16, spy2 + 4, 8, 6);
          ctx.fillRect(spx2 + 18, spy2 + 2, 4, 4);
          ctx.fillStyle = "#aaa898";
          ctx.fillRect(spx2, spy2, 14, 2);
          ctx.fillRect(spx2 + 4, spy2 - 4, 8, 2);
          ctx.strokeStyle = "#5a5850";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(spx2 + 8, spy2);
          ctx.lineTo(spx2 + 12, spy2 + 10);
          ctx.moveTo(spx2 + 2, spy2 + 5);
          ctx.lineTo(spx2 + 10, spy2 + 8);
          ctx.stroke();
        }
      } catch {
        /* decorative */
      }

      // Overgrown vines on walls
      try {
        for (const [vtx, vty, vseed] of [
          [8, 6, 0],
          [16, 4, 1],
          [24, 8, 2],
          [12, 18, 3],
        ] as [number, number, number][]) {
          const vx2 = sx(vtx) + 2;
          const vy2 = sy(vty) + 2;
          ctx.strokeStyle = "#2a7020";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(vx2 + vseed * 4, vy2);
          for (let vp = 0; vp < 6; vp++) {
            ctx.lineTo(
              vx2 + vseed * 4 + Math.sin(vp * 0.8 + vseed) * 10,
              vy2 + vp * 5,
            );
          }
          ctx.stroke();
          for (let vl = 0; vl < 4; vl++) {
            ctx.fillStyle = vl % 2 === 0 ? "#2a8020" : "#3a9830";
            ctx.beginPath();
            ctx.ellipse(
              vx2 + vseed * 4 + Math.sin(vl * 1.2) * 8,
              vy2 + vl * 7,
              4,
              3,
              Math.sin(vl * 0.8 + vseed) * 0.5,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
      } catch {
        /* decorative */
      }

      // Ancient coins scattered decoratively
      try {
        for (const [cotx, coty] of [
          [11, 12],
          [17, 9],
          [23, 15],
          [9, 20],
          [25, 22],
          [14, 16],
          [20, 18],
        ] as [number, number][]) {
          const cox = sx(cotx) + ((cotx * 7) % (T - 6)) + 3;
          const coy = sy(coty) + ((coty * 5) % (T - 6)) + 3;
          ctx.fillStyle = "#c8a820";
          ctx.beginPath();
          ctx.ellipse(cox, coy, 4, 3, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a08010";
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.fillStyle = "#ffe050";
          ctx.beginPath();
          ctx.arc(cox - 1, coy - 1, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch {
        /* decorative */
      }

      // Crumbling archway near entrance
      try {
        const archX = sx(15) + 2;
        const archY = sy(5) + 2;
        ctx.fillStyle = "#7a7870";
        ctx.fillRect(archX, archY, 8, T);
        ctx.fillRect(archX + T + 4, archY + 4, 8, T - 4);
        ctx.fillStyle = "#9a9888";
        ctx.fillRect(archX + 1, archY, 4, T);
        ctx.strokeStyle = "#7a7870";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(
          archX + T / 2 + 6,
          archY + T * 0.5,
          T / 2,
          Math.PI * 1.1,
          Math.PI * 1.9,
        );
        ctx.stroke();
        ctx.fillStyle = "#6a6860";
        ctx.fillRect(archX + T - 4, archY + 4, 6, 6);
        ctx.fillRect(archX + T, archY + 12, 4, 4);
      } catch {
        /* decorative */
      }
    }

    // ── PIRATE ISLAND ─────────────────────────────────────────────────────────
    if (zoneId === "pirate_island") {
      // Seagulls — elliptical flock paths, 3 birds at different phase offsets
      try {
        const gullData: Array<[number, number, number]> = [
          [6, 0.0, 1.0],
          [4, 0.7, 1.3], // different y height and phase
          [7, 1.5, 0.8],
        ];
        for (const [gty, phase, phaseMult] of gullData) {
          // Elliptical path: wide x, narrow y oscillation
          const ellX =
            CANVAS_W / 2 +
            Math.cos(ts * 0.0003 * phaseMult + phase) * (CANVAS_W * 0.42);
          const ellY =
            sy(gty) + T / 2 + Math.sin(ts * 0.0006 * phaseMult + phase) * 24;
          ctx.strokeStyle = "#eeeeee";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ellX - 5, ellY, 4, Math.PI, 0);
          ctx.arc(ellX + 5, ellY, 4, Math.PI, 0);
          ctx.stroke();
        }
      } catch {
        /* decorative */
      }

      // Shore waves crashing — animated foam line at beach edge tiles
      try {
        const wavePhase = (ts * 0.0008) % (Math.PI * 2);
        const waveFoamX = sx(2);
        const waveFoamW = CANVAS_W - sx(2) - 40;
        // Shore bottom
        const shoreYs = [sy(26), sy(27)];
        for (const shY of shoreYs) {
          const waveExpand = Math.sin(wavePhase) * 0.5 + 0.5; // 0..1
          ctx.globalAlpha = 0.4 + waveExpand * 0.35;
          ctx.fillStyle = "#e8f4ff";
          ctx.fillRect(waveFoamX, shY - 2, waveFoamW, 3 + waveExpand * 2);
          ctx.globalAlpha = 0.2 + waveExpand * 0.2;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(waveFoamX + 4, shY - 1, waveFoamW - 8, 1 + waveExpand);
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }

      // Rope coil and anchor near shore (tile 4,16)
      try {
        const rpx = sx(4) + 4;
        const rpy = sy(16) + 6;
        for (let rc = 0; rc < 3; rc++) {
          ctx.strokeStyle = "#c8a058";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(rpx + 6, rpy + 20, 6 - rc, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = "#666870";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(rpx + 20, rpy + 8, 8, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rpx + 20, rpy);
        ctx.lineTo(rpx + 20, rpy + 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rpx + 12, rpy + 8);
        ctx.lineTo(rpx + 28, rpy + 8);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rpx + 12, rpy + 20, 4, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rpx + 28, rpy + 20, 4, 0, Math.PI);
        ctx.stroke();
      } catch {
        /* decorative */
      }

      // Treasure map on post at tile 20,8
      try {
        const tmpx = sx(20) + T / 2;
        const tmpy = sy(8) + 4;
        ctx.fillStyle = "#7a5020";
        ctx.fillRect(tmpx - 1, tmpy + 10, 3, 20);
        ctx.fillStyle = "#e8c870";
        ctx.fillRect(tmpx - 8, tmpy, 18, 12);
        ctx.strokeStyle = "#8a6020";
        ctx.lineWidth = 1;
        ctx.strokeRect(tmpx - 8, tmpy, 18, 12);
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = "#884422";
        ctx.beginPath();
        ctx.moveTo(tmpx - 5, tmpy + 8);
        ctx.lineTo(tmpx, tmpy + 4);
        ctx.lineTo(tmpx + 6, tmpy + 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#cc2200";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tmpx + 4, tmpy + 4);
        ctx.lineTo(tmpx + 8, tmpy + 8);
        ctx.moveTo(tmpx + 8, tmpy + 4);
        ctx.lineTo(tmpx + 4, tmpy + 8);
        ctx.stroke();
      } catch {
        /* decorative */
      }

      // Animated campfire near pirate tents (tile 16,12)
      try {
        const cfx = sx(16) + T / 2;
        const cfy = sy(12) + T - 8;
        ctx.fillStyle = "#5a3010";
        ctx.fillRect(cfx - 8, cfy, 16, 4);
        ctx.fillRect(cfx - 6, cfy - 2, 12, 3);
        const cfF = Math.sin(ts * 0.006) * 3;
        ctx.fillStyle = "#ff4400";
        ctx.beginPath();
        ctx.moveTo(cfx - 7, cfy);
        ctx.quadraticCurveTo(cfx + cfF, cfy - 12, cfx, cfy - 16);
        ctx.quadraticCurveTo(cfx - cfF, cfy - 12, cfx + 7, cfy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ff8800";
        ctx.beginPath();
        ctx.moveTo(cfx - 4, cfy);
        ctx.quadraticCurveTo(cfx + cfF * 0.6, cfy - 8, cfx, cfy - 12);
        ctx.quadraticCurveTo(cfx - cfF * 0.6, cfy - 8, cfx + 4, cfy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffcc40";
        ctx.beginPath();
        ctx.moveTo(cfx - 2, cfy);
        ctx.quadraticCurveTo(cfx, cfy - 5, cfx, cfy - 7);
        ctx.quadraticCurveTo(cfx, cfy - 5, cfx + 2, cfy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.2 + Math.sin(ts * 0.005) * 0.1;
        ctx.fillStyle = "#ff8800";
        ctx.beginPath();
        ctx.arc(cfx, cfy - 6, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } catch {
        /* decorative */
      }

      // Rum barrels cluster at tile 12,14
      try {
        for (let bi = 0; bi < 4; bi++) {
          const bax = sx(12) + (bi % 2) * 16 + 2;
          const bay = sy(14) + Math.floor(bi / 2) * 16 + 2;
          ctx.fillStyle = "#7a4818";
          ctx.fillRect(bax, bay, 14, 16);
          ctx.fillStyle = "#8a5820";
          ctx.fillRect(bax + 1, bay, 12, 16);
          ctx.fillStyle = "#5a3010";
          ctx.fillRect(bax - 1, bay + 3, 16, 3);
          ctx.fillRect(bax - 1, bay + 10, 16, 3);
          ctx.fillStyle = "#6a3a10";
          ctx.beginPath();
          ctx.ellipse(bax + 7, bay, 7, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#e0a060";
          ctx.fillRect(bax + 2, bay + 1, 4, 14);
          ctx.globalAlpha = 1;
        }
      } catch {
        /* decorative */
      }
    }

    // ── CURSED GALLEON ────────────────────────────────────────────────────────
    if (zoneId === "cursed_galleon") {
      // Hanging lanterns with 2-frame sway animation at mast positions
      try {
        const lanternPositions: [number, number][] = [
          [8, 4],
          [22, 4],
          [16, 6],
          [8, 14],
          [22, 14],
        ];
        for (const [ltx, lty] of lanternPositions) {
          const lx2 = sx(ltx) + T / 2;
          const ly2 = sy(lty) + 8;
          const sway = Math.sin(ts * 0.0012 + ltx * 0.4) * 4;
          // Rope
          ctx.strokeStyle = "#a08050";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lx2, ly2 - 6);
          ctx.lineTo(lx2 + sway, ly2 + 4);
          ctx.stroke();
          // Lantern body
          ctx.fillStyle = "#8a7848";
          ctx.fillRect(lx2 + sway - 4, ly2 + 4, 8, 8);
          // Warm glow
          const gFlicker = Math.sin(ts * 0.005 + ltx) * 0.06;
          ctx.globalAlpha = 0.28 + gFlicker;
          ctx.fillStyle = "#ffd060";
          ctx.beginPath();
          ctx.arc(lx2 + sway, ly2 + 8, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          // Lantern glass
          ctx.fillStyle = `rgba(255,220,80,${0.55 + gFlicker})`;
          ctx.fillRect(lx2 + sway - 3, ly2 + 5, 6, 6);
        }
      } catch {
        /* decorative */
      }

      // Barrels and crates as decorations
      try {
        for (const [bx2, by2] of [
          [5, 8],
          [5, 10],
          [26, 8],
          [26, 10],
          [5, 18],
          [26, 18],
        ] as [number, number][]) {
          const bpx = sx(bx2) + 4;
          const bpy = sy(by2) + 6;
          ctx.fillStyle = "oklch(0.35 0.08 55)";
          ctx.fillRect(bpx, bpy, 12, 16);
          ctx.fillStyle = "oklch(0.48 0.07 58)";
          ctx.fillRect(bpx + 1, bpy, 10, 16);
          ctx.fillStyle = "oklch(0.28 0.05 50)";
          ctx.fillRect(bpx - 1, bpy + 3, 14, 2);
          ctx.fillRect(bpx - 1, bpy + 11, 14, 2);
          ctx.fillStyle = "oklch(0.42 0.06 58)";
          ctx.beginPath();
          ctx.ellipse(bpx + 6, bpy, 6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch {
        /* decorative */
      }

      // Torn sails on masts (tall decorative shapes)
      try {
        for (const [mx, my] of [
          [16, 3],
          [8, 3],
        ] as [number, number][]) {
          const mpx = sx(mx) + T / 2;
          const mpy = sy(my) + 2;
          // Mast pole
          ctx.fillStyle = "oklch(0.40 0.07 55)";
          ctx.fillRect(mpx - 2, mpy, 4, T * 2);
          ctx.fillStyle = "oklch(0.52 0.07 58)";
          ctx.fillRect(mpx - 1, mpy, 2, T * 2);
          // Torn sail cloth (grey-beige, tattered edge)
          const sailSway = Math.sin(ts * 0.0008 + mx * 0.3) * 3;
          ctx.fillStyle = "rgba(200,188,160,0.75)";
          ctx.beginPath();
          ctx.moveTo(mpx + 2, mpy + 4);
          ctx.lineTo(mpx + 18 + sailSway, mpy + 4);
          ctx.lineTo(mpx + 14 + sailSway, mpy + 22);
          ctx.lineTo(mpx + 2, mpy + 20);
          ctx.closePath();
          ctx.fill();
          // Tatter marks
          ctx.strokeStyle = "rgba(150,140,120,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mpx + 16 + sailSway, mpy + 10);
          ctx.lineTo(mpx + 22 + sailSway, mpy + 14);
          ctx.moveTo(mpx + 14 + sailSway, mpy + 18);
          ctx.lineTo(mpx + 20 + sailSway, mpy + 20);
          ctx.stroke();
        }
      } catch {
        /* decorative */
      }

      // Rope coils on deck
      try {
        for (const [rx, ry] of [
          [10, 10],
          [20, 10],
          [10, 20],
          [20, 20],
        ] as [number, number][]) {
          const rpx = sx(rx) + T / 2;
          const rpy = sy(ry) + T - 8;
          for (let ri = 0; ri < 3; ri++) {
            ctx.strokeStyle = "oklch(0.58 0.08 65)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(rpx, rpy, 7 - ri, 3.5 - ri, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } catch {
        /* decorative */
      }

      // Cannons along sides (decorative)
      try {
        for (const [cx2, cy2, angle] of [
          [3, 9, 0],
          [3, 13, 0],
          [3, 17, 0],
          [28, 9, Math.PI],
          [28, 13, Math.PI],
          [28, 17, Math.PI],
        ] as [number, number, number][]) {
          const cpx = sx(cx2) + T / 2;
          const cpy = sy(cy2) + T / 2;
          // Cannon body
          ctx.save();
          ctx.translate(cpx, cpy);
          ctx.rotate(angle);
          ctx.fillStyle = "oklch(0.28 0.02 210)";
          ctx.fillRect(-4, -5, 14, 10);
          ctx.fillStyle = "oklch(0.38 0.02 210)";
          ctx.fillRect(-3, -4, 12, 8);
          // Barrel opening
          ctx.fillStyle = "oklch(0.15 0.01 210)";
          ctx.beginPath();
          ctx.arc(10, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          // Wheel
          ctx.strokeStyle = "oklch(0.40 0.06 55)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cpx - (angle === 0 ? 2 : -2), cpy + 5, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } catch {
        /* decorative */
      }

      // Rope swing between masts — pendulum bezier curve
      try {
        const mast1X = sx(8) + T / 2;
        const mast2X = sx(16) + T / 2;
        const mastY = sy(3) + T;
        const swingAngle = Math.sin(ts * 0.0008) * 0.26; // pendulum period ~7.8s
        const midX = (mast1X + mast2X) / 2 + Math.sin(swingAngle) * 20;
        const midY = mastY + 30 + Math.cos(swingAngle) * 8;
        ctx.strokeStyle = "#c8a058";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mast1X, mastY);
        ctx.quadraticCurveTo(midX, midY, mast2X, mastY);
        ctx.stroke();
        // Seat plank at midpoint
        const seatX = midX;
        const seatY = midY;
        ctx.fillStyle = "#8a5a20";
        ctx.fillRect(seatX - 8, seatY, 16, 4);
        ctx.strokeStyle = "#a0782a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(seatX - 6, seatY);
        ctx.lineTo(midX - 8, mastY);
        ctx.moveTo(seatX + 6, seatY);
        ctx.lineTo(midX + 8, mastY);
        ctx.stroke();
      } catch {
        /* decorative */
      }

      // Rat sprite scurrying along ship floor — simple state machine
      try {
        const ratCycle = ts * 0.0006;
        const ratSegment = Math.floor(ratCycle) % 6; // 6 states
        const ratProgress = ratCycle % 1;
        // Fixed waypoints on ship floor
        const ratWaypoints = [
          [sx(7) + T / 2, sy(10) + T - 5],
          [sx(10) + T / 2, sy(10) + T - 5],
          [sx(13) + T / 2, sy(12) + T - 5],
          [sx(13) + T / 2, sy(14) + T - 5],
          [sx(10) + T / 2, sy(14) + T - 5],
          [sx(7) + T / 2, sy(12) + T - 5],
        ] as [number, number][];
        const isPaused = ratSegment % 3 === 2; // pause every 3rd segment
        let ratX: number;
        let ratY: number;
        if (isPaused) {
          [ratX, ratY] = ratWaypoints[ratSegment]!;
          // Twitch: small jitter when paused
          ratX += Math.sin(ts * 0.012) * 1;
        } else {
          const from = ratWaypoints[ratSegment]!;
          const to = ratWaypoints[(ratSegment + 1) % ratWaypoints.length]!;
          ratX = from[0] + (to[0] - from[0]) * ratProgress;
          ratY = from[1] + (to[1] - from[1]) * ratProgress;
        }
        const ratDir = ratSegment % 2 === 0 ? 1 : -1;
        ctx.fillStyle = "#2a2428";
        ctx.fillRect(ratX - 5, ratY - 4, 10, 8);
        ctx.beginPath();
        ctx.ellipse(ratX + 5 * ratDir, ratY - 2, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Ears
        ctx.fillStyle = "#3a2a30";
        ctx.beginPath();
        ctx.arc(ratX + 4 * ratDir, ratY - 5, 2, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.strokeStyle = "#3a2a30";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ratX - 5 * ratDir, ratY);
        ctx.quadraticCurveTo(
          ratX - 10 * ratDir,
          ratY - 4,
          ratX - 12 * ratDir,
          ratY + 2,
        );
        ctx.stroke();
      } catch {
        /* decorative */
      }
    }

    ctx.restore();
  } catch {
    /* decorations non-fatal — never crash the game */
  }
}

// ─── Respawn overlay effects ──────────────────────────────────────────────────

function drawRespawnEffects(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  fadeAlpha: number,
  shimmerProgress: number,
  textTimer: number,
  cityName: string,
): void {
  try {
    ctx.save();

    // Player fade-in: draw a white-ish overlay that fades from opaque to transparent
    if (fadeAlpha < 1.0) {
      const overlayAlpha = Math.max(0, 1.0 - fadeAlpha);
      ctx.globalAlpha = overlayAlpha * 0.85;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(screenX - 8, screenY - 8, TILE_SIZE + 16, TILE_SIZE + 16);
    }

    // Golden shimmer ring expanding outward
    if (shimmerProgress > 0 && shimmerProgress < 1) {
      const shimmerR = shimmerProgress * TILE_SIZE * 3;
      const shimmerAlpha = (1 - shimmerProgress) * 0.6;
      ctx.globalAlpha = shimmerAlpha;
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 3 * (1 - shimmerProgress);
      ctx.beginPath();
      ctx.arc(
        screenX + TILE_SIZE / 2,
        screenY + TILE_SIZE / 2,
        shimmerR,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      // Inner shimmer
      ctx.globalAlpha = shimmerAlpha * 0.5;
      ctx.strokeStyle = "#ffe44a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        screenX + TILE_SIZE / 2,
        screenY + TILE_SIZE / 2,
        shimmerR * 0.6,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    // "Respawned in [City]" text
    if (textTimer > 0) {
      const textProgress = textTimer / RESPAWN_TEXT_DURATION;
      // Fade in for first 15%, hold, fade out for last 25%
      const textAlpha =
        textProgress > 0.85
          ? ((1 - textProgress) / 0.15) * 1.0
          : textProgress < 0.15
            ? (textProgress / 0.15) * 1.0
            : 1.0;
      ctx.globalAlpha = Math.max(0, textAlpha);
      const text = `Respawned in ${cityName}`;
      ctx.font = "bold 16px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(text).width + 24;
      const th = 26;
      const tx = CANVAS_W / 2 - tw / 2;
      const ty = CANVAS_H * 0.35;
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx + 0.75, ty + 0.75, tw - 1.5, th - 1.5);
      ctx.fillStyle = "#ffe066";
      ctx.fillText(text, CANVAS_W / 2, ty + th / 2);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

function drawShadow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  alpha = 0.4,
  scaleX = 1.0, // sprite width scale (1.0 for normal, >1 for large)
  scaleY = 1.0, // sprite height scale
): void {
  // Day/night modulation: daytime shadows sharper, night softer
  const CYCLE_MS = 8 * 60 * 1000;
  const t = (performance.now() % CYCLE_MS) / CYCLE_MS;
  const nightFactor = t < 0.5 ? 0 : t < 0.75 ? (t - 0.5) / 0.25 : 1;
  // Daytime: 0.3 alpha, dusk/sunset: 0.2, night: 0.15
  const shadowAlpha =
    alpha * (nightFactor > 0.7 ? 0.15 : nightFactor > 0.3 ? 0.2 : 0.3);
  const sw = 15 * scaleX; // width of outer ellipse
  const sh = 6 * scaleY; // height of outer ellipse
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,1)";
  // Outer soft ellipse
  ctx.globalAlpha = shadowAlpha * 0.45;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 33, sw, sh, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mid ellipse
  ctx.globalAlpha = shadowAlpha * 0.7;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 33, sw * 0.73, sh * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  // Core dark ellipse
  ctx.globalAlpha = shadowAlpha;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 32, sw * 0.47, sh * 0.47, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Warrior sprite ───────────────────────────────────────────────────────────

function drawWarrior(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  _wc: number,
  bob: number,
  animBlend: number,
  attackProgress: number,
  outfitColor: OutfitColor = "default",
  outfitStyle: OutfitStyle = "warrior_A",
  hairColor: HairColor = "brown",
): void {
  const norm = normalizeStyle(outfitStyle, "warrior");
  const styleCol = getWarriorStyleColors(norm, outfitColor);
  const base = CLASS_COLORS.warrior;
  const col = {
    ...base,
    body: styleCol.body,
    dark: styleCol.dark,
    highlight: styleCol.highlight,
    accent: styleCol.accent,
  };
  const hair = HAIR_COLORS[hairColor];
  const by = py + bob;
  const legSwing = Math.sin(animBlend * Math.PI * 2) * 5;
  const leg1Y = Math.round(legSwing);
  const leg2Y = Math.round(-legSwing);
  const ft =
    attackProgress > 0.6
      ? Math.sin(((attackProgress - 0.6) / 0.4) * Math.PI) * 3
      : 0;
  const arm1Y = Math.round(
    Math.sin(animBlend * Math.PI * 2 + Math.PI) * 4 + ft,
  );
  const arm2Y = Math.round(Math.sin(animBlend * Math.PI * 2) * 4);

  // warrior_A: Heavy plate — broad shoulders, chest plate, closed visor helmet
  // warrior_B: Chainmail — lighter, grid texture, open-face helm ring visible
  // warrior_C: Leather — hood, slimmer silhouette, brown leather

  const isHeavy = norm === "warrior_A";
  const isChain = norm === "warrior_B";
  const isLeather = norm === "warrior_C";

  if (facing === "down") {
    // Legs
    ctx.fillStyle = col.dark;
    ctx.fillRect(
      px + (isLeather ? 9 : 8),
      by + 23 + leg1Y,
      isLeather ? 5 : 6,
      8,
    );
    ctx.fillRect(
      px + (isLeather ? 18 : 18),
      by + 23 + leg2Y,
      isLeather ? 5 : 6,
      8,
    );
    ctx.fillStyle = isLeather ? "oklch(0.20 0.05 55)" : "oklch(0.15 0.02 25)";
    ctx.fillRect(
      px + (isLeather ? 9 : 8),
      by + 29 + leg1Y,
      isLeather ? 5 : 6,
      2,
    );
    ctx.fillRect(
      px + (isLeather ? 18 : 18),
      by + 29 + leg2Y,
      isLeather ? 5 : 6,
      2,
    );

    // Body — chainmail gets grid lines
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + (isLeather ? 6 : 4), by + 12, isLeather ? 20 : 24, 13);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + (isLeather ? 7 : 6), by + 13, isLeather ? 18 : 20, 11);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + (isLeather ? 7 : 6), by + 13, isLeather ? 18 : 20, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + (isLeather ? 7 : 6), by + 22, isLeather ? 18 : 20, 2);

    // Chainmail grid pattern overlay
    if (isChain) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = col.dark;
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < 20; gx += 4) {
        ctx.beginPath();
        ctx.moveTo(px + 6 + gx, by + 13);
        ctx.lineTo(px + 6 + gx, by + 24);
        ctx.stroke();
      }
      for (let gy = 0; gy < 11; gy += 4) {
        ctx.beginPath();
        ctx.moveTo(px + 6, by + 13 + gy);
        ctx.lineTo(px + 26, by + 13 + gy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Chest detail
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 12, by + 14, 8, isHeavy ? 9 : 7);
    if (isHeavy) {
      ctx.fillStyle = "oklch(0.45 0.14 30)";
      ctx.fillRect(px + 13, by + 15, 6, 7);
    }

    // Shoulders — heavy has big pauldrons
    if (isHeavy) {
      ctx.fillStyle = col.accent;
      ctx.fillRect(px + 2, by + 11, 8, 8);
      ctx.fillRect(px + 22, by + 11, 8, 8);
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 2, by + 11, 8, 2);
      ctx.fillRect(px + 22, by + 11, 8, 2);
    } else {
      ctx.fillStyle = col.accent;
      ctx.fillRect(px + 4, by + 12, 6, 6);
      ctx.fillRect(px + 22, by + 12, 6, 6);
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 4, by + 12, 6, 2);
      ctx.fillRect(px + 22, by + 12, 6, 2);
    }

    // Arms
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 2, by + 13 + arm2Y, 5, 9);
    ctx.fillRect(px + 25, by + 13 + arm1Y, 5, 9);
    ctx.fillStyle = "oklch(0.35 0.12 25)";
    ctx.fillRect(px + 1, by + 14 + arm2Y, 7, 13);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 2, by + 15 + arm2Y, 5, 11);
    ctx.fillStyle = "oklch(0.82 0.09 55)";
    ctx.fillRect(px + 3, by + 19 + arm2Y, 3, 4);
    ctx.fillStyle = "oklch(0.75 0.04 200)";
    ctx.fillRect(px + 27, by + 14 + arm1Y, 3, 16);
    ctx.fillStyle = "oklch(0.85 0.03 200)";
    ctx.fillRect(px + 27, by + 14 + arm1Y, 3, 3);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 24, by + 14 + arm1Y, 9, 2);

    // Head / face skin
    ctx.fillStyle = base.skin;
    if (isHeavy) {
      // closed visor — no skin visible
      ctx.fillRect(px + 10, by + 4, 12, 8);
      ctx.fillStyle = "oklch(0.05 0 0)";
      ctx.fillRect(px + 10, by + 7, 12, 3); // visor slit
    } else {
      ctx.fillRect(px + 9, by + 4, 14, 12);
      ctx.fillStyle = "oklch(0.88 0.06 60)";
      ctx.fillRect(px + 10, by + 4, 12, 2);
      // Eyes
      ctx.fillStyle = "oklch(0.88 0.22 90)";
      ctx.fillRect(px + 13, by + 7, 2, 1);
      ctx.fillRect(px + 18, by + 7, 2, 1);
    }

    // Helmet
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 7, by + 1, 18, 7);
    ctx.fillRect(px + 8, by + 0, 16, 3);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 8, by + 1, 16, 2);

    // leather: hood covers back of head
    if (isLeather) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 6, by + 2, 20, 5);
      // visible hair strands at forehead
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 10, by + 4, 12, 2);
    }
    // chainmail: helm ring, hair visible
    if (isChain) {
      ctx.fillStyle = "oklch(0.06 0 0)";
      ctx.fillRect(px + 10, by + 7, 12, 2);
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 8, by + 5, 3, 7);
      ctx.fillRect(px + 21, by + 5, 3, 7);
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 11, by + 4, 10, 3);
    }
    // heavy: full visor bar
    if (isHeavy) {
      ctx.fillStyle = "oklch(0.06 0 0)";
      ctx.fillRect(px + 10, by + 7, 12, 2);
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 8, by + 5, 3, 7);
      ctx.fillRect(px + 21, by + 5, 3, 7);
    }
  } else if (facing === "up") {
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 23 + leg1Y, 6, 8);
    ctx.fillRect(px + 18, by + 23 + leg2Y, 6, 8);
    ctx.fillStyle = isLeather ? "oklch(0.20 0.05 55)" : "oklch(0.15 0.02 25)";
    ctx.fillRect(px + 8, by + 29 + leg1Y, 6, 2);
    ctx.fillRect(px + 18, by + 29 + leg2Y, 6, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 5, by + 12, 22, 12);
    ctx.fillStyle = "oklch(0.30 0.12 25)";
    ctx.fillRect(px + 7, by + 13, 18, 10);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 7, by + 13, 18, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 7, by + 21, 18, 2);
    ctx.fillRect(px + 15, by + 14, 2, 8);
    ctx.fillRect(px + 7, by + 19, 18, 2);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 4, by + 12, 5, 6);
    ctx.fillRect(px + 23, by + 12, 5, 6);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 4, by + 12, 5, 2);
    ctx.fillRect(px + 23, by + 12, 5, 2);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 1, by + 13 + arm2Y, 5, 9);
    ctx.fillRect(px + 26, by + 13 + arm1Y, 5, 9);
    ctx.fillStyle = "oklch(0.35 0.12 25)";
    ctx.fillRect(px + 0, by + 14 + arm2Y, 6, 12);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 1, by + 15 + arm2Y, 4, 10);
    ctx.fillStyle = "oklch(0.70 0.04 200)";
    ctx.fillRect(px + 28, by + 13 + arm1Y, 3, 14);
    ctx.fillStyle = "oklch(0.85 0.03 200)";
    ctx.fillRect(px + 28, by + 13 + arm1Y, 3, 2);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 25, by + 13 + arm1Y, 9, 2);
    ctx.fillStyle = base.skin;
    ctx.fillRect(px + 10, by + 4, 12, 11);
    ctx.fillStyle = "oklch(0.86 0.06 60)";
    ctx.fillRect(px + 10, by + 4, 12, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 7, by + 1, 18, 7);
    ctx.fillRect(px + 8, by + 0, 16, 3);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 8, by + 1, 16, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 5, 3, 7);
    ctx.fillRect(px + 21, by + 5, 3, 7);
    ctx.fillRect(px + 10, by + 7, 12, 3);
    // Back of head hair for chainmail/leather
    if (isChain || isLeather) {
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 9, by + 2, 14, 5);
      ctx.fillStyle = hair.dark;
      ctx.fillRect(px + 9, by + 6, 14, 2);
    }
  } else {
    // side view
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 11, by + 23 + leg1Y, 7, 8);
    ctx.fillRect(px + 17, by + 23 + leg2Y, 6, 8);
    ctx.fillStyle = isLeather ? "oklch(0.20 0.05 55)" : "oklch(0.15 0.02 25)";
    ctx.fillRect(px + 11, by + 29 + leg1Y, 7, 2);
    ctx.fillRect(px + 17, by + 29 + leg2Y, 6, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 7, by + 12, 18, 13);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 8, by + 13, 16, 11);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 8, by + 13, 16, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 22, 16, 2);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 22, by + 12, 5, 6);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 22, by + 12, 5, 2);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 3, by + 13 + arm2Y, 5, 9);
    ctx.fillStyle = "oklch(0.35 0.12 25)";
    ctx.fillRect(px + 2, by + 14 + arm2Y, 7, 12);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 3, by + 15 + arm2Y, 5, 10);
    ctx.fillStyle = "oklch(0.82 0.09 55)";
    ctx.fillRect(px + 4, by + 19 + arm2Y, 3, 3);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 24, by + 13 + arm1Y, 5, 9);
    ctx.fillStyle = "oklch(0.72 0.04 200)";
    ctx.fillRect(px + 26, by + 13 + arm1Y, 2, 18);
    ctx.fillStyle = "oklch(0.86 0.03 200)";
    ctx.fillRect(px + 26, by + 13 + arm1Y, 2, 3);
    ctx.fillStyle = col.accent;
    ctx.fillRect(px + 23, by + 14 + arm1Y, 7, 2);
    ctx.fillStyle = "oklch(0.50 0.08 55)";
    ctx.fillRect(px + 26, by + 16 + arm1Y, 2, 4);
    ctx.fillStyle = base.skin;
    ctx.fillRect(px + 10, by + 4, 14, 12);
    ctx.fillStyle = "oklch(0.86 0.06 60)";
    ctx.fillRect(px + 10, by + 4, 14, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 1, 16, 7);
    ctx.fillRect(px + 9, by + 0, 14, 3);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 9, by + 1, 14, 2);
    if (isHeavy) {
      ctx.fillStyle = "oklch(0.06 0 0)";
      ctx.fillRect(px + 17, by + 6, 7, 2);
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 8, by + 5, 3, 8);
    } else {
      ctx.fillStyle = "oklch(0.06 0 0)";
      ctx.fillRect(px + 17, by + 6, 7, 2);
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 8, by + 5, 3, 8);
      ctx.fillStyle = "oklch(0.88 0.22 90)";
      ctx.fillRect(px + 20, by + 6, 2, 1);
      // side-visible hair
      if (isChain || isLeather) {
        ctx.fillStyle = hair.main;
        ctx.fillRect(px + 9, by + 3, 4, 5);
        ctx.fillStyle = hair.dark;
        ctx.fillRect(px + 10, by + 7, 2, 2);
      }
    }
  }
}

// ─── Mage sprite ──────────────────────────────────────────────────────────────

function drawMage(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  _wc: number,
  bob: number,
  animBlend: number,
  attackProgress: number,
  outfitColor: OutfitColor = "default",
  outfitStyle: OutfitStyle = "mage_A",
  hairColor: HairColor = "brown",
): void {
  const norm = normalizeStyle(outfitStyle, "mage");
  const styleCol = getMageStyleColors(norm, outfitColor);
  const base = CLASS_COLORS.mage;
  const col = {
    ...base,
    body: styleCol.body,
    dark: styleCol.dark,
    highlight: styleCol.highlight,
    accent: styleCol.accent,
  };
  const hair = HAIR_COLORS[hairColor];
  const by = py + bob;
  const hemSwing = Math.sin(animBlend * Math.PI * 2) * 3.75;
  const hem1Y = Math.round(hemSwing);
  const hem2Y = Math.round(-hemSwing);
  const staffRecoil =
    attackProgress > 0.6
      ? Math.sin(((attackProgress - 0.6) / 0.4) * Math.PI) * -4
      : 0;
  const arm1Y = Math.round(
    Math.sin(animBlend * Math.PI * 2 + Math.PI) * 3.75 + staffRecoil,
  );
  const glowColor = styleCol.accent;
  const glowDim = col.dark;

  // mage_A: long robe to feet, tall pointed hat, staff
  // mage_B: shorter robe above knees, circlet headband, small staff
  // mage_C: dark cloak, hood slightly up, no hat, mysterious

  const isMageA = norm === "mage_A";
  const isMageB = norm === "mage_B";
  const isMageC = norm === "mage_C";

  // Robe hem length: A=full, B=shorter, C=cloakish
  const hemLen = isMageA ? 7 : isMageB ? 5 : 7;

  if (facing === "down") {
    // Robe body
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 13, 16, 17);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 9, by + 12, 14, 15);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 9, by + 12, 14, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 9, by + 25, 14, 3);
    // Robe center stripe / cloak detail
    ctx.fillStyle = glowDim;
    ctx.fillRect(px + 12, by + 13, 2, 14);
    ctx.fillRect(px + 18, by + 13, 2, 14);
    if (!isMageC) {
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 14, by + 13, 4, 15);
      ctx.fillStyle = "oklch(0.85 0.12 210)";
      ctx.fillRect(px + 15, by + 14, 2, 6);
    } else {
      // dark cloak: no bright center, just muted
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 14, by + 13, 4, 8);
    }
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 9, by + 21, 14, 2);
    // Hem flaps
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 6, by + 23 + hem1Y, 5, hemLen);
    ctx.fillRect(px + 21, by + 23 + hem2Y, 5, hemLen);
    // Arms
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 5, by + 12 + arm1Y, 5, 8);
    ctx.fillRect(px + 22, by + 12, 5, 8);
    // Staff (A/B has tall staff, B shorter, C a thin wand-like)
    const staffH = isMageA ? 38 : isMageB ? 28 : 32;
    ctx.fillStyle = "oklch(0.52 0.07 55)";
    ctx.fillRect(px + 26, by - 10, 3, staffH);
    // Staff crystal orb (A/B larger, C smaller/dark)
    if (!isMageC) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 22, by - 14, 11, 11);
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 23, by - 13, 9, 9);
      ctx.fillStyle = "oklch(0.88 0.18 200)";
      ctx.fillRect(px + 25, by - 12, 5, 5);
      ctx.fillStyle = "oklch(0.97 0.05 200)";
      ctx.fillRect(px + 26, by - 11, 2, 2);
    } else {
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 24, by - 12, 7, 7);
      ctx.fillStyle = "oklch(0.35 0.08 280)";
      ctx.fillRect(px + 25, by - 11, 5, 5);
    }
    // Face / head
    ctx.fillStyle = base.skin;
    ctx.fillRect(px + 10, by + 4, 12, 11);
    ctx.fillStyle = "oklch(0.88 0.06 60)";
    ctx.fillRect(px + 11, by + 4, 10, 2);
    // Eyes
    ctx.fillStyle = "oklch(0.08 0 0)";
    ctx.fillRect(px + 12, by + 7, 3, 3);
    ctx.fillRect(px + 17, by + 7, 3, 3);
    ctx.fillStyle = glowColor;
    ctx.fillRect(px + 13, by + 8, 1, 1);
    ctx.fillRect(px + 18, by + 8, 1, 1);
    // Hat (mage_A: tall pointed; mage_B: circlet; mage_C: hood)
    if (isMageA) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 7, by + 1, 18, 4);
      ctx.fillRect(px + 9, by - 3, 14, 5);
      ctx.fillRect(px + 11, by - 8, 10, 6);
      ctx.fillRect(px + 13, by - 12, 6, 5);
      ctx.fillRect(px + 14, by - 15, 4, 4);
      ctx.fillStyle = "oklch(0.28 0.01 260)";
      ctx.fillRect(px + 9, by - 3, 14, 2);
      ctx.fillRect(px + 11, by - 8, 10, 2);
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 8, by + 2, 16, 2);
      // star on hat
      ctx.fillStyle = "oklch(0.88 0.22 90)";
      ctx.fillRect(px + 15, by - 10, 2, 1);
      ctx.fillRect(px + 14, by - 9, 4, 1);
      ctx.fillRect(px + 15, by - 8, 2, 1);
    } else if (isMageB) {
      // circlet headband
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 7, by + 0, 18, 5);
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 8, by + 1, 16, 2);
      // gem in circlet
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 15, by + 0, 3, 2);
      // visible hair
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 9, by + 2, 14, 3);
      ctx.fillStyle = hair.dark;
      ctx.fillRect(px + 10, by + 4, 12, 1);
    } else {
      // dark hood — hood draped, hair partially visible
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 6, by - 2, 20, 7);
      ctx.fillRect(px + 8, by + 1, 16, 5);
      ctx.fillStyle = col.body;
      ctx.fillRect(px + 9, by + 0, 14, 4);
      // peek of hair at sides
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 9, by + 2, 3, 4);
      ctx.fillRect(px + 20, by + 2, 3, 4);
    }
  } else if (facing === "up") {
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 13, 16, 17);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 9, by + 12, 14, 15);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 9, by + 12, 14, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 9, by + 25, 14, 3);
    ctx.fillStyle = glowDim;
    ctx.fillRect(px + 12, by + 13, 2, 14);
    ctx.fillRect(px + 18, by + 13, 2, 14);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 9, by + 21, 14, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 6, by + 23 + hem1Y, 5, hemLen);
    ctx.fillRect(px + 21, by + 23 + hem2Y, 5, hemLen);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 5, by + 12 + arm1Y, 5, 8);
    ctx.fillRect(px + 22, by + 12, 5, 8);
    const staffH2 = isMageA ? 36 : isMageB ? 28 : 32;
    ctx.fillStyle = "oklch(0.52 0.07 55)";
    ctx.fillRect(px + 26, by - 10, 3, staffH2);
    if (!isMageC) {
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 23, by - 13, 9, 9);
      ctx.fillStyle = "oklch(0.88 0.18 200)";
      ctx.fillRect(px + 25, by - 12, 5, 5);
      ctx.fillStyle = "oklch(0.97 0.05 200)";
      ctx.fillRect(px + 26, by - 11, 2, 2);
    } else {
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 24, by - 12, 7, 7);
    }
    ctx.fillStyle = base.skin;
    ctx.fillRect(px + 10, by + 4, 12, 10);
    // back of head hair
    ctx.fillStyle = hair.main;
    ctx.fillRect(px + 9, by + 2, 14, 6);
    ctx.fillStyle = hair.dark;
    ctx.fillRect(px + 9, by + 7, 14, 2);
    if (isMageA) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 7, by + 1, 18, 4);
      ctx.fillRect(px + 9, by - 3, 14, 5);
      ctx.fillRect(px + 11, by - 8, 10, 6);
      ctx.fillRect(px + 13, by - 12, 6, 5);
      ctx.fillRect(px + 14, by - 15, 4, 4);
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 8, by + 2, 16, 2);
    } else {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 7, by + 0, 18, 5);
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 8, by + 1, 16, 2);
    }
  } else {
    // side view
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 8, by + 13, 15, 16);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 9, by + 12, 13, 14);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 9, by + 12, 13, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 9, by + 24, 13, 3);
    ctx.fillStyle = glowDim;
    ctx.fillRect(px + 14, by + 13, 2, 13);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 9, by + 21, 13, 2);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 20, by + 23 + hem1Y, 4, hemLen);
    ctx.fillRect(px + 7, by + 23 + hem2Y, 4, hemLen);
    ctx.fillStyle = col.body;
    ctx.fillRect(px + 5, by + 12 + arm1Y, 5, 8);
    ctx.fillRect(px + 21, by + 12, 4, 9);
    const staffH3 = isMageA ? 42 : isMageB ? 30 : 34;
    ctx.fillStyle = "oklch(0.52 0.07 55)";
    ctx.fillRect(px + 25, by - 12, 3, staffH3);
    if (!isMageC) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 21, by - 16, 11, 11);
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 22, by - 15, 9, 9);
      ctx.fillStyle = "oklch(0.88 0.18 200)";
      ctx.fillRect(px + 24, by - 14, 5, 5);
      ctx.fillStyle = "oklch(0.97 0.05 200)";
      ctx.fillRect(px + 25, by - 13, 2, 2);
    } else {
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 22, by - 14, 8, 8);
    }
    ctx.fillStyle = base.skin;
    ctx.fillRect(px + 10, by + 4, 12, 11);
    ctx.fillStyle = "oklch(0.88 0.06 60)";
    ctx.fillRect(px + 10, by + 4, 12, 2);
    // Side-visible eye
    ctx.fillStyle = "oklch(0.08 0 0)";
    ctx.fillRect(px + 17, by + 7, 3, 3);
    ctx.fillStyle = glowColor;
    ctx.fillRect(px + 18, by + 8, 1, 1);
    if (isMageA) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 8, by + 1, 16, 4);
      ctx.fillRect(px + 9, by - 3, 12, 5);
      ctx.fillRect(px + 11, by - 8, 9, 6);
      ctx.fillRect(px + 13, by - 12, 6, 5);
      ctx.fillRect(px + 14, by - 15, 4, 4);
      ctx.fillStyle = "oklch(0.28 0.01 260)";
      ctx.fillRect(px + 9, by - 3, 12, 2);
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 9, by + 2, 13, 2);
    } else if (isMageB) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 8, by + 0, 16, 5);
      ctx.fillStyle = col.highlight;
      ctx.fillRect(px + 9, by + 1, 14, 2);
      ctx.fillStyle = glowColor;
      ctx.fillRect(px + 15, by + 0, 3, 2);
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 9, by + 3, 4, 4);
    } else {
      ctx.fillStyle = col.dark;
      ctx.fillRect(px + 7, by - 2, 18, 7);
      ctx.fillStyle = col.body;
      ctx.fillRect(px + 8, by + 0, 14, 4);
      ctx.fillStyle = hair.main;
      ctx.fillRect(px + 9, by + 2, 3, 5);
    }
  }
}

// ─── Monster sprites ──────────────────────────────────────────────────────────

function drawSlime(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  const bob = animFrame === 1 ? -1 : 0;
  const sq = animFrame === 1 ? 1 : 0;
  const baseC = hitFlash ? "oklch(0.95 0.02 145)" : "oklch(0.52 0.20 145)";
  const midC = hitFlash ? "oklch(0.98 0.01 145)" : "oklch(0.60 0.22 145)";
  const darkC = hitFlash ? "oklch(0.90 0.03 145)" : "oklch(0.38 0.17 145)";

  ctx.fillStyle = darkC;
  ctx.fillRect(px + 5, py + 18 + sq, 22, 8 - sq);
  ctx.fillStyle = baseC;
  ctx.fillRect(px + 3, py + 12 + bob, 26, 14 - sq * 2);
  ctx.fillRect(px + 6, py + 9 + bob, 20, 4);
  ctx.fillRect(px + 8, py + 7 + bob, 16, 3);
  ctx.fillStyle = midC;
  ctx.fillRect(px + 8, py + 8 + bob, 10, 3);
  ctx.fillStyle = "oklch(0.80 0.15 145)";
  ctx.fillRect(px + 10, py + 8 + bob, 5, 2);
  ctx.fillStyle = hitFlash ? "oklch(0.95 0.02 0)" : "oklch(0.92 0 0)";
  ctx.fillRect(px + 8, py + 13 + bob, 5, 5);
  ctx.fillRect(px + 19, py + 13 + bob, 5, 5);
  ctx.fillStyle = "oklch(0.08 0 0)";
  ctx.fillRect(px + 9, py + 14 + bob, 3, 3);
  ctx.fillRect(px + 20, py + 14 + bob, 3, 3);
  ctx.fillStyle = "oklch(0.95 0 0)";
  ctx.fillRect(px + 9, py + 14 + bob, 1, 1);
  ctx.fillRect(px + 20, py + 14 + bob, 1, 1);
  ctx.fillStyle = darkC;
  ctx.fillRect(px + 5, py + 22 + sq, 22, 4);
}

function drawGoblin(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  const lb = animFrame === 1 ? 1 : -1;
  const ab = animFrame === 1 ? -1 : 1;
  const skinC = hitFlash ? "oklch(0.95 0.02 145)" : "oklch(0.50 0.16 135)";
  const darkC = hitFlash ? "oklch(0.90 0.03 135)" : "oklch(0.30 0.12 135)";
  const armorC = hitFlash ? "oklch(0.92 0.02 55)" : "oklch(0.42 0.10 55)";
  const eyeC = hitFlash ? "oklch(0.95 0.02 30)" : "oklch(0.65 0.22 30)";
  const flip = facing === "left";
  let dpx = px;

  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    dpx = 0;
  }

  ctx.fillStyle = darkC;
  ctx.fillRect(dpx + 10, py + 22 + lb, 5, 8);
  ctx.fillRect(dpx + 17, py + 22 - lb, 5, 8);
  ctx.fillStyle = "oklch(0.22 0.05 50)";
  ctx.fillRect(dpx + 9, py + 28 + lb, 7, 3);
  ctx.fillRect(dpx + 16, py + 28 - lb, 7, 3);
  ctx.fillStyle = armorC;
  ctx.fillRect(dpx + 8, py + 13, 16, 11);
  ctx.fillStyle = darkC;
  ctx.fillRect(dpx + 9, py + 14, 14, 9);
  ctx.fillStyle = armorC;
  ctx.fillRect(dpx + 10, py + 15, 12, 7);
  ctx.fillStyle = armorC;
  ctx.fillRect(dpx + 6, py + 13, 5, 5);
  ctx.fillRect(dpx + 21, py + 13, 5, 5);
  ctx.fillStyle = skinC;
  ctx.fillRect(dpx + 4, py + 14 + ab, 5, 8);
  ctx.fillRect(dpx + 23, py + 14 - ab, 5, 8);
  ctx.fillStyle = "oklch(0.28 0.05 55)";
  ctx.fillRect(dpx + 25, py + 12 - ab, 4, 14);
  ctx.fillStyle = "oklch(0.38 0.06 55)";
  ctx.fillRect(dpx + 24, py + 10 - ab, 6, 5);
  ctx.fillStyle = skinC;
  ctx.fillRect(dpx + 9, py + 5, 14, 10);
  ctx.fillStyle = skinC;
  ctx.fillRect(dpx + 6, py + 5, 4, 5);
  ctx.fillRect(dpx + 22, py + 5, 4, 5);
  ctx.fillStyle = darkC;
  ctx.fillRect(dpx + 6, py + 5, 2, 2);
  ctx.fillRect(dpx + 24, py + 5, 2, 2);
  ctx.fillStyle = eyeC;
  ctx.fillRect(dpx + 11, py + 8, 3, 3);
  ctx.fillRect(dpx + 18, py + 8, 3, 3);
  ctx.fillStyle = "oklch(0.08 0 0)";
  ctx.fillRect(dpx + 12, py + 9, 2, 2);
  ctx.fillRect(dpx + 19, py + 9, 2, 2);
  ctx.fillStyle = darkC;
  ctx.fillRect(dpx + 15, py + 10, 2, 2);
  ctx.fillStyle = armorC;
  ctx.fillRect(dpx + 8, py + 2, 16, 5);
  ctx.fillRect(dpx + 10, py + 0, 12, 3);
  ctx.fillStyle = "oklch(0.55 0.12 58)";
  ctx.fillRect(dpx + 10, py + 2, 12, 2);

  if (flip) ctx.restore();
}

// ─── Wolf monster sprite ──────────────────────────────────────────────────────

function drawWolf(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame % 2 === 0 ? 2 : -2;
  const bodyColor = hitFlash ? "#ccc0b8" : "#4a4540";
  const darkColor = hitFlash ? "#b8a8a0" : "#2e2a28";
  const lightColor = hitFlash ? "#e0d8d0" : "#7a7068";
  const flip = facing === "left";
  let dpx = px;
  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    dpx = 0;
  }
  // Hind legs
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 8, py + 22 + lb, 5, 9);
  ctx.fillRect(dpx + 19, py + 22 - lb, 5, 9);
  // Paws
  ctx.fillStyle = "#1a1816";
  ctx.fillRect(dpx + 7, py + 29 + lb, 7, 3);
  ctx.fillRect(dpx + 18, py + 29 - lb, 7, 3);
  // Body (lean, elongated)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 4, py + 11, 24, 14);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 5, py + 12, 22, 12);
  // Lighter belly
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 9, py + 15, 14, 7);
  // Front legs
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 3, py + 14 + lb, 5, 9);
  ctx.fillRect(dpx + 24, py + 14 - lb, 5, 9);
  ctx.fillStyle = "#1a1816";
  ctx.fillRect(dpx + 2, py + 21 + lb, 6, 3);
  ctx.fillRect(dpx + 24, py + 21 - lb, 6, 3);
  // Tail (upward curl)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 25, py + 8, 4, 8);
  ctx.fillRect(dpx + 27, py + 5, 3, 5);
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 28, py + 5, 2, 4);
  // Head (slightly larger than goblin)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 5, py + 2, 18, 13);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 6, py + 3, 16, 11);
  // Snout (elongated muzzle)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 9, py + 8, 12, 5);
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 10, py + 8, 9, 2);
  // Nose
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(dpx + 17, py + 7, 3, 3);
  ctx.fillStyle = "#2e2420";
  ctx.fillRect(dpx + 17, py + 7, 3, 1);
  // Ears (pointed)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 7, py - 1, 4, 5);
  ctx.fillRect(dpx + 17, py - 1, 4, 5);
  ctx.fillStyle = "#5a3030";
  ctx.fillRect(dpx + 8, py + 0, 2, 3);
  ctx.fillRect(dpx + 18, py + 0, 2, 3);
  // Eyes (amber)
  ctx.fillStyle = hitFlash ? "#cc8888" : "#cc8800";
  ctx.fillRect(dpx + 9, py + 5, 3, 3);
  ctx.fillRect(dpx + 16, py + 5, 3, 3);
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(dpx + 10, py + 6, 2, 2);
  ctx.fillRect(dpx + 17, py + 6, 2, 2);
  if (flip) ctx.restore();
  ctx.restore();
}

// ─── Tiger monster sprite ─────────────────────────────────────────────────────

function drawTiger(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame % 2 === 0 ? 2 : -2;
  const bodyColor = hitFlash ? "#e0c0a0" : "#d4701a";
  const stripeColor = hitFlash ? "#c8a888" : "#1a1208";
  const lightColor = hitFlash ? "#f0e0d0" : "#f0c070";
  const flip = facing === "left";
  let dpx = px;
  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    dpx = 0;
  }
  // Hind legs
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 8, py + 21 + lb, 6, 10);
  ctx.fillRect(dpx + 18, py + 21 - lb, 6, 10);
  ctx.fillStyle = "#1a0e06";
  ctx.fillRect(dpx + 7, py + 29 + lb, 8, 3);
  ctx.fillRect(dpx + 17, py + 29 - lb, 8, 3);
  // Body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 4, py + 10, 24, 14);
  // Stripe pattern on body
  ctx.fillStyle = stripeColor;
  ctx.fillRect(dpx + 8, py + 11, 3, 12);
  ctx.fillRect(dpx + 14, py + 11, 3, 12);
  ctx.fillRect(dpx + 20, py + 11, 3, 12);
  // Lighter belly
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 10, py + 16, 12, 6);
  // Front legs
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 3, py + 13 + lb, 5, 10);
  ctx.fillRect(dpx + 24, py + 13 - lb, 5, 10);
  ctx.fillStyle = "#1a0e06";
  ctx.fillRect(dpx + 2, py + 21 + lb, 7, 3);
  ctx.fillRect(dpx + 24, py + 21 - lb, 7, 3);
  // Tail
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 26, py + 9, 4, 10);
  ctx.fillStyle = stripeColor;
  ctx.fillRect(dpx + 26, py + 10, 4, 2);
  ctx.fillRect(dpx + 26, py + 15, 4, 2);
  // Head (wider, more imposing)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 4, py + 1, 20, 13);
  // Head stripes
  ctx.fillStyle = stripeColor;
  ctx.fillRect(dpx + 8, py + 2, 2, 10);
  ctx.fillRect(dpx + 18, py + 2, 2, 10);
  // Snout
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 9, py + 7, 10, 6);
  ctx.fillStyle = stripeColor;
  ctx.fillRect(dpx + 9, py + 9, 10, 1);
  // Nose
  ctx.fillStyle = "#1a0a0a";
  ctx.fillRect(dpx + 13, py + 6, 4, 3);
  ctx.fillStyle = "#8a2020";
  ctx.fillRect(dpx + 13, py + 6, 4, 1);
  // Ears
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 5, py - 2, 4, 5);
  ctx.fillRect(dpx + 19, py - 2, 4, 5);
  ctx.fillStyle = "#8a3028";
  ctx.fillRect(dpx + 6, py - 1, 2, 3);
  ctx.fillRect(dpx + 20, py - 1, 2, 3);
  // Eyes (bright green/yellow)
  ctx.fillStyle = hitFlash ? "#cccc88" : "#a8cc10";
  ctx.fillRect(dpx + 9, py + 4, 3, 3);
  ctx.fillRect(dpx + 16, py + 4, 3, 3);
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(dpx + 10, py + 5, 2, 2);
  ctx.fillRect(dpx + 17, py + 5, 2, 2);
  if (flip) ctx.restore();
  ctx.restore();
}

// ─── Skeleton monster sprite ──────────────────────────────────────────────────

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame % 2 === 0 ? 2 : -2;
  const boneColor = hitFlash ? "#ffffff" : "#d4c8a8";
  const darkColor = hitFlash ? "#f0e8d8" : "#8a8060";
  const flip = facing === "left";
  let dpx = px;
  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    dpx = 0;
  }
  ctx.globalAlpha = 0.9; // slight transparency for undead look
  // Leg bones
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 10, py + 21 + lb, 4, 10);
  ctx.fillRect(dpx + 18, py + 21 - lb, 4, 10);
  // Joint knobs
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 9, py + 20 + lb, 6, 3);
  ctx.fillRect(dpx + 17, py + 20 - lb, 6, 3);
  ctx.fillRect(dpx + 9, py + 29 + lb, 6, 3);
  ctx.fillRect(dpx + 17, py + 29 - lb, 6, 3);
  // Ribcage (spine + ribs)
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 14, py + 10, 4, 13); // spine
  // Ribs
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(dpx + 7, py + 12 + i * 3, 7, 2);
    ctx.fillRect(dpx + 18, py + 12 + i * 3, 7, 2);
  }
  // Pelvis
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 8, py + 21, 16, 3);
  // Shoulder bones
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 5, py + 9, 22, 4);
  // Arm bones
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 4, py + 12 + lb, 4, 10);
  ctx.fillRect(dpx + 24, py + 12 - lb, 4, 10);
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 3, py + 20 + lb, 6, 3);
  ctx.fillRect(dpx + 23, py + 20 - lb, 6, 3);
  // Hand claws
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 2, py + 22 + lb, 2, 4);
  ctx.fillRect(dpx + 5, py + 22 + lb, 2, 4);
  ctx.fillRect(dpx + 23, py + 22 - lb, 2, 4);
  ctx.fillRect(dpx + 26, py + 22 - lb, 2, 4);
  // Skull
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 8, py + 0, 16, 12);
  ctx.fillRect(dpx + 7, py + 2, 18, 9);
  // Jawbone
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 9, py + 8, 14, 5);
  ctx.fillStyle = boneColor;
  ctx.fillRect(dpx + 10, py + 9, 12, 3);
  // Teeth
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 11, py + 9, 2, 2);
  ctx.fillRect(dpx + 15, py + 9, 2, 2);
  ctx.fillRect(dpx + 19, py + 9, 2, 2);
  // Eye sockets (hollow)
  ctx.fillStyle = hitFlash ? "#ff4444" : "#2a1808";
  ctx.fillRect(dpx + 10, py + 3, 4, 4);
  ctx.fillRect(dpx + 18, py + 3, 4, 4);
  // Glowing eyes
  ctx.fillStyle = hitFlash ? "#ff8888" : "#ff4400";
  ctx.fillRect(dpx + 11, py + 4, 2, 2);
  ctx.fillRect(dpx + 19, py + 4, 2, 2);
  ctx.globalAlpha = 1;
  if (flip) ctx.restore();
  ctx.restore();
}

// ─── Cyclops monster sprite ───────────────────────────────────────────────────

function drawCyclops(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  // Cyclops is 1.5× normal sprite size — drawn large in center of tile
  const sq = animFrame % 2 === 0 ? 0 : 1;
  const bodyColor = hitFlash ? "#b8c8b0" : "#4a6040";
  const darkColor = hitFlash ? "#a0b098" : "#2e3c28";
  const lightColor = hitFlash ? "#d0dcc8" : "#6a8060";
  const skinColor = hitFlash ? "#c0c8b8" : "#5a7050";
  // Ground shadow (extra large)
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 31, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Legs (wide, powerful)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 5, py + 22 + sq, 9, 11 - sq);
  ctx.fillRect(px + 18, py + 22 + sq, 9, 11 - sq);
  // Feet
  ctx.fillStyle = "#1a1810";
  ctx.fillRect(px + 4, py + 31 + sq, 11, 3);
  ctx.fillRect(px + 17, py + 31 + sq, 11, 3);
  // Massive body
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 3, py + 6, 26, 18);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 4, py + 7, 24, 16);
  // Loincloth/hide wrap
  ctx.fillStyle = "#5c4030";
  ctx.fillRect(px + 6, py + 19, 20, 5);
  ctx.fillStyle = "#3e2a1e";
  ctx.fillRect(px + 8, py + 20, 16, 3);
  // Massive arms
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px - 1, py + 7 + sq, 6, 16);
  ctx.fillRect(px + 27, py + 7 - sq, 6, 16);
  ctx.fillStyle = darkColor;
  ctx.fillRect(px - 2, py + 21 + sq, 8, 4);
  ctx.fillRect(px + 26, py + 21 - sq, 8, 4);
  // Fists / knuckles
  ctx.fillStyle = "#1e1a14";
  for (let k = 0; k < 3; k++) {
    ctx.fillRect(px - 2 + k * 3, py + 23 + sq, 2, 3);
    ctx.fillRect(px + 26 + k * 3, py + 23 - sq, 2, 3);
  }
  // Large head
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 4, py - 2, 24, 12);
  ctx.fillStyle = skinColor;
  ctx.fillRect(px + 5, py - 1, 22, 10);
  // Brow ridge (prominent)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 4, py + 2, 24, 4);
  ctx.fillStyle = lightColor;
  ctx.fillRect(px + 5, py + 2, 22, 2);
  // Single large eye (cyclops)
  ctx.fillStyle = hitFlash ? "#ff8888" : "#1a1208";
  ctx.fillRect(px + 10, py + 3, 12, 8);
  ctx.fillStyle = hitFlash ? "#ff2222" : "#cc2200";
  ctx.fillRect(px + 12, py + 4, 8, 6);
  // Pupil (slit like)
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(px + 15, py + 5, 2, 4);
  // Highlight
  ctx.fillStyle = "rgba(255,200,180,0.5)";
  ctx.fillRect(px + 12, py + 4, 3, 2);
  // Nose (large, blunt)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 13, py + 7, 6, 4);
  ctx.fillStyle = "#1a0e08";
  ctx.fillRect(px + 14, py + 9, 2, 2);
  ctx.fillRect(px + 17, py + 9, 2, 2);
  // Tusks/teeth
  ctx.fillStyle = "#d4c090";
  ctx.fillRect(px + 10, py + 9, 3, 4);
  ctx.fillRect(px + 19, py + 9, 3, 4);
  ctx.restore();
}

// ─── Monster HP bar ───────────────────────────────────────────────────────────

function drawMonsterHpBar(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  hp: number,
  maxHp: number,
  lastDamageAge?: number,
): void {
  if (hp >= maxHp) return;
  // Hide bar if 3 seconds have passed since last damage
  if (lastDamageAge !== undefined && lastDamageAge > 3000) return;
  const barW = 28;
  const bx = px + 2;
  const by = py - 6;
  const ratio = Math.max(0, hp / maxHp);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(bx - 1, by - 1, barW + 2, 6);
  ctx.fillStyle = "oklch(0.22 0.05 20)";
  ctx.fillRect(bx, by, barW, 4);
  ctx.fillStyle = "oklch(0.62 0.25 25)";
  ctx.fillRect(bx, by, Math.round(barW * ratio), 4);
  ctx.fillStyle = "oklch(1 0 0 / 0.25)";
  ctx.fillRect(bx, by, Math.round(barW * ratio), 1);
}

// ─── Monster nameplate above HP bar ──────────────────────────────────────────
// Shows monster name with difficulty emoji when the monster has taken damage recently.
const MONSTER_DISPLAY_NAMES: Partial<Record<string, string>> = {
  slime: "Slime",
  sprite_wisp: "Sprite Wisp",
  goblin: "Goblin",
  forest_troll: "Forest Troll",
  spider: "Spider",
  bat: "Bat",
  wolf: "Wolf",
  bear: "Bear",
  tiger: "Tiger",
  stone_golem: "Stone Golem",
  shadow_wolf: "Shadow Wolf",
  skeleton: "Skeleton",
  crystal_golem: "Crystal Golem",
  cyclops: "Cyclops",
  cave_bat: "Cave Bat",
  cave_troll: "Cave Troll",
  bog_witch: "Bog Witch",
  swamp_lurker: "Swamp Lurker",
  mud_golem: "Mud Golem",
  ruin_specter: "Ruin Specter",
  ancient_guardian: "Ancient Guardian",
  sky_serpent: "Sky Serpent",
  pirate_grunt: "Pirate Grunt",
  pirate_gunner: "Pirate Gunner",
  pirate_captain: "Pirate Captain",
  pirate_cannon: "Pirate Cannon",
  cursed_sailor: "Cursed Sailor",
  skeleton_gunner: "Skeleton Gunner",
  cursed_navigator: "Cursed Navigator",
  ship_captain: "Ship Captain",
};

function drawMonsterNameplate(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  monsterType: string,
  playerLevel: number,
  lastDamageAge?: number,
): void {
  // Only show when monster has taken damage in the last 3 seconds
  if (lastDamageAge === undefined || lastDamageAge > 3000) return;

  const mLevel = MONSTER_LEVEL_MAP[monsterType] ?? 10;
  const diffEmoji =
    mLevel > playerLevel + 5 ? "🔴" : mLevel < playerLevel - 5 ? "🟢" : "🟡";
  const rawName =
    MONSTER_DISPLAY_NAMES[monsterType] ?? monsterType.replace(/_/g, " ");
  // Truncate at 14 chars
  const name = rawName.length > 14 ? `${rawName.slice(0, 12)}…` : rawName;
  const label = `${diffEmoji} ${name}`;

  // Fade out over last 600ms
  const fadeAlpha = lastDamageAge > 2400 ? 1 - (lastDamageAge - 2400) / 600 : 1;
  if (fadeAlpha <= 0) return;

  try {
    ctx.save();
    ctx.globalAlpha = Math.max(0, fadeAlpha);
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";

    const textWidth = ctx.measureText(label).width;
    const padX = 4;
    const padY = 2;
    const boxW = textWidth + padX * 2;
    const boxH = 11;
    const boxX = px + TILE_SIZE / 2 - boxW / 2;
    const boxY = py - 18;

    // Dark pill background
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(boxX, boxY, boxW, boxH, 3);
    } else {
      ctx.rect(boxX, boxY, boxW, boxH);
    }
    ctx.fill();

    // Text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, boxX + padX, boxY + boxH - padY);
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

// ─── Status effect icon renderer ──────────────────────────────────────────────
// Draws small 8×8px icons below the sprite with a depleting arc ring.
// Effects: poison (green droplet), shield (gold pentagon), respawn_immunity (silver star)

interface StatusEffect {
  type: "poison" | "shield" | "respawn_immunity";
  durationRatio: number; // 0–1: drives depleting ring arc
}

function drawStatusEffectIcons(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  effects: StatusEffect[],
): void {
  if (effects.length === 0) return;
  try {
    ctx.save();
    const iconSize = 8;
    const spacing = 10;
    const startX = px + 2;
    const iconY = py + 2;

    for (let i = 0; i < Math.min(effects.length, 4); i++) {
      const effect = effects[i]!;
      const ix = startX + i * spacing;
      const iy = iconY;

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.arc(
        ix + iconSize / 2,
        iy + iconSize / 2,
        iconSize / 2 + 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      if (effect.type === "poison") {
        ctx.fillStyle = "#44CC44";
        ctx.beginPath();
        ctx.arc(ix + 4, iy + 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ix + 4, iy + 1);
        ctx.lineTo(ix + 2, iy + 4);
        ctx.lineTo(ix + 6, iy + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(180,255,180,0.6)";
        ctx.fillRect(ix + 3, iy + 4, 1, 1);
      } else if (effect.type === "shield") {
        ctx.fillStyle = "#FFD700";
        ctx.beginPath();
        ctx.moveTo(ix + 4, iy + 1);
        ctx.lineTo(ix + 7, iy + 3);
        ctx.lineTo(ix + 7, iy + 5);
        ctx.lineTo(ix + 4, iy + 8);
        ctx.lineTo(ix + 1, iy + 5);
        ctx.lineTo(ix + 1, iy + 3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,200,0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ix + 4, iy + 2);
        ctx.lineTo(ix + 6, iy + 4);
        ctx.stroke();
      } else if (effect.type === "respawn_immunity") {
        ctx.fillStyle = "#CCCCCC";
        ctx.beginPath();
        const scx = ix + 4;
        const scy = iy + 4.5;
        for (let pt = 0; pt < 10; pt++) {
          const angle = (pt * Math.PI) / 5 - Math.PI / 2;
          const r = pt % 2 === 0 ? 3.5 : 1.5;
          const sx = scx + Math.cos(angle) * r;
          const sy = scy + Math.sin(angle) * r;
          if (pt === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Depleting arc ring — from top (−90°) clockwise to show remaining duration
      if (effect.durationRatio > 0) {
        const arcAngle = effect.durationRatio * Math.PI * 2;
        ctx.strokeStyle =
          effect.type === "poison"
            ? "#44CC44"
            : effect.type === "shield"
              ? "#FFD700"
              : "#CCCCCC";
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(
          ix + iconSize / 2,
          iy + iconSize / 2,
          iconSize / 2 + 2,
          -Math.PI / 2,
          -Math.PI / 2 + arcAngle,
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

// ─── Attack overlays ──────────────────────────────────────────────────────────

/**
 * 3-phase warrior attack animation:
 *   Phase 0 — Wind-up  (ap 0.00→0.33): charge glow builds behind warrior
 *   Phase 1 — Strike   (ap 0.33→0.67): fast sword arc sweeps through
 *   Phase 2 — Recovery (ap 0.67→1.00): arc fades out to neutral
 * Damage fires at attack trigger in useGameLoop (independent of visual phase).
 */
function drawWarriorAttack(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  progress: number, // 0→1 over full ATTACK_DURATION_MS
  weaponType: "sword" | "axe" = "sword",
): void {
  const cx = px + 16;
  const cy = py + 16;
  const radius = TILE_SIZE * 1.3;
  const baseAngle: Record<FacingDirection, number> = {
    right: 0,
    left: Math.PI,
    down: Math.PI / 2,
    up: -Math.PI / 2,
  };
  const base = baseAngle[facing];
  // Axe: wider 120° arc, sword: tighter 90° arc
  const halfSwing = weaponType === "axe" ? Math.PI / 3 : WARRIOR_SWING_ANGLE;
  const swingArc = halfSwing * 2;
  const TOTAL_MS = WARRIOR_WINDUP_MS + WARRIOR_STRIKE_MS + WARRIOR_RECOVERY_MS;
  const WINDUP_END = WARRIOR_WINDUP_MS / TOTAL_MS; // ~0.333
  const STRIKE_END = (WARRIOR_WINDUP_MS + WARRIOR_STRIKE_MS) / TOTAL_MS; // ~0.667

  ctx.save();

  if (progress < WINDUP_END) {
    // ── Wind-up: charge glow opposite facing direction ──
    const windT = progress / WINDUP_END;
    ctx.globalAlpha = windT * 0.5;
    const backAngle = base + Math.PI;
    const glowX = cx + Math.cos(backAngle) * 6;
    const glowY = cy + Math.sin(backAngle) * 6;
    // Axe wind-up: orange glow; sword: warm yellow-white
    ctx.fillStyle =
      weaponType === "axe" ? "oklch(0.72 0.28 40)" : "oklch(0.85 0.18 50)";
    ctx.beginPath();
    ctx.arc(glowX, glowY, 5 + windT * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = windT * 0.3;
    ctx.strokeStyle =
      weaponType === "axe" ? "oklch(0.80 0.22 38)" : "oklch(0.90 0.12 55)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, base + Math.PI - 0.5, base + Math.PI + 0.5);
    ctx.stroke();
  } else if (progress < STRIKE_END) {
    // ── Strike: fast arc sweep ──
    const strikeT = (progress - WINDUP_END) / (STRIKE_END - WINDUP_END);
    const startAngle = base - halfSwing + strikeT * swingArc;
    const endAngle = base + halfSwing;
    const alpha = 1.0 - strikeT * 0.3;
    ctx.globalAlpha = alpha;

    if (weaponType === "axe") {
      // ── Axe arc: orange 120° wide arc, heavier feel ──
      ctx.strokeStyle = "oklch(0.62 0.28 32)";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.strokeStyle = "oklch(0.75 0.24 38)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.strokeStyle = "oklch(0.88 0.15 50)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, startAngle, endAngle);
      ctx.stroke();
      // Tip ember spark
      const ex = cx + Math.cos(endAngle) * radius;
      const ey = cy + Math.sin(endAngle) * radius;
      ctx.fillStyle = "oklch(0.90 0.22 45)";
      ctx.fillRect(ex - 3, ey - 3, 6, 6);
    } else {
      // ── Sword arc: white-yellow 90° crisp sweep ──
      ctx.strokeStyle = "oklch(0.75 0.22 30)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.strokeStyle = "oklch(0.90 0.14 55)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
      // Bright white inner highlight
      ctx.strokeStyle = "rgba(255,255,230,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, startAngle, endAngle);
      ctx.stroke();
      // Tip flash
      const ex = cx + Math.cos(endAngle) * radius;
      const ey = cy + Math.sin(endAngle) * radius;
      ctx.fillStyle = "oklch(0.97 0.06 55)";
      ctx.fillRect(ex - 3, ey - 3, 6, 6);
      if (strikeT < 0.3) {
        ctx.globalAlpha = (0.3 - strikeT) / 0.3;
        const sx = cx + Math.cos(startAngle) * radius;
        const sy = cy + Math.sin(startAngle) * radius;
        ctx.fillStyle = "oklch(0.98 0.04 60)";
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      }
    }
  } else {
    // ── Recovery: arc fades out ──
    const recovT = (progress - STRIKE_END) / (1 - STRIKE_END);
    ctx.globalAlpha = Math.max(0, (1 - recovT) * 0.6);
    ctx.strokeStyle =
      weaponType === "axe" ? "oklch(0.68 0.22 36)" : "oklch(0.72 0.20 35)";
    ctx.lineWidth = weaponType === "axe" ? 7 : 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius,
      base - halfSwing + swingArc * 0.7,
      base + halfSwing,
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Mage spell animations — upgraded polished visuals ───────────────────────
// spellType: 'arcane' | 'frost' | 'shadow' | 'flame'
// progress: 0→1 over full spell duration
// Wind-up phase: first 20-30% (cast glow/effect at player position)
// Projectile/burst phase: remaining time (orb travels or ring expands)
// Impact phase: last 10% (sparks/shatter on collision)

function drawMageAttack(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  progress: number,
  spellType: "arcane" | "frost" | "shadow" | "flame" = "arcane",
): void {
  // ── 24fps throttle: skip if rendered too recently ──
  const nowMs = performance.now();
  if (nowMs - lastSpellRenderTime < SPELL_RENDER_INTERVAL) return;
  lastSpellRenderTime = nowMs;

  ctx.save();

  const dirOffset: Record<FacingDirection, [number, number]> = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
  };
  const [dx, dy] = dirOffset[facing];
  const maxDist = MAGE_PROJECTILE_TILES * TILE_SIZE;

  function getOrigin(): [number, number] {
    if (facing === "left") return [px + 4, py + 4];
    if (facing === "up") return [px + 16, py - 6];
    if (facing === "down") return [px + 16, py + 10];
    return [px + 28, py + 4];
  }

  const [startX, startY] = getOrigin();
  const pcx = px + TILE_SIZE / 2;
  const pcy = py + TILE_SIZE / 2;

  if (spellType === "arcane") {
    // ══ ARCANE BOLT — 8px white core + 16px blue halo, 6 trail particles, rotating energy ring ══
    const WINDUP = 0.2;
    if (progress < WINDUP) {
      const wt = progress / WINDUP;
      // Staff/wand glow at player center
      ctx.globalAlpha = wt * 0.7;
      ctx.fillStyle = "rgba(200,230,255,0.8)";
      ctx.beginPath();
      ctx.arc(startX, startY, 6 + wt * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = wt * 0.4;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(startX, startY, 3 + wt * 3, 0, Math.PI * 2);
      ctx.fill();
      // 4 energy coil particles orbiting player
      const coilMax = spellMax(4);
      for (let c = 0; c < coilMax; c++) {
        const coilA = (c / coilMax) * Math.PI * 2 + wt * Math.PI * 3;
        addParticle({
          x: pcx + Math.cos(coilA) * (8 + wt * 4),
          y: pcy + Math.sin(coilA) * (6 + wt * 3),
          r: 2 + wt * 1.5,
          color: c % 2 === 0 ? "#88CCFF" : "#CCDDFF",
          alpha: wt * 0.75,
        });
      }
      flushParticles(ctx);
      ctx.restore();
      return;
    }

    // Projectile phase
    const projT = (progress - WINDUP) / (1 - WINDUP);
    const dist = projT * maxDist;
    const ox = startX + dx * dist;
    const oy = startY + dy * dist;
    const alpha = Math.max(0, 1 - projT * 1.1);
    // Core size stays at 8px at start, tapers slightly
    const coreSize = Math.max(3, 8 * (1 - projT * 0.25));
    const ringAngle = projT * Math.PI * 6; // rotating ring phase

    // ── 6 fading trail particles (blue circles, staggered behind orb) ──
    const trailMax = spellMax(6);
    for (let i = 1; i <= trailMax; i++) {
      const tf = i / (trailMax + 1);
      const td = dist - tf * 22;
      if (td < 0) continue;
      addPhysicsParticle({
        x: startX + dx * td,
        y: startY + dy * td,
        r: Math.max(1, coreSize * (1 - tf * 0.65)),
        color: i % 3 === 0 ? "#44AAFF" : i % 3 === 1 ? "#88CCFF" : "#DDEEFF",
        alpha: (1 - tf) * 0.45 * alpha,
        vx: dx * 0.2,
        vy: 0.05,
        gravity: 0.015,
      });
    }

    // ── Soft radial blue halo (16px) ──
    const haloGrad = ctx.createRadialGradient(
      ox,
      oy,
      coreSize * 0.5,
      ox,
      oy,
      coreSize + 10,
    );
    haloGrad.addColorStop(0, "rgba(100,180,255,0.55)");
    haloGrad.addColorStop(0.5, "rgba(80,150,255,0.25)");
    haloGrad.addColorStop(1, "rgba(60,120,255,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(ox, oy, coreSize + 10, 0, Math.PI * 2);
    ctx.fill();

    // Mid-layer bright blue
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = "rgba(180,220,255,0.9)";
    ctx.beginPath();
    ctx.arc(ox, oy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // ── White inner core (8px) ──
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ox, oy, coreSize * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // ── Single thin rotating energy ring around orb ──
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = "rgba(150,210,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(ringAngle);
    ctx.beginPath();
    ctx.ellipse(0, 0, coreSize + 5, coreSize * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 3 orbiting ring dots
    const ringCount = spellMax(3);
    for (let r = 0; r < ringCount; r++) {
      const rAngle = ringAngle + (r / ringCount) * Math.PI * 2;
      const rDist = coreSize + 4;
      addParticle({
        x: ox + Math.cos(rAngle) * rDist,
        y: oy + Math.sin(rAngle) * rDist * 0.55,
        r: 1.5,
        color: "#B8DDFF",
        alpha: alpha * 0.85,
      });
    }
    flushParticles(ctx);

    // ── Impact phase: 8-ray starburst + 4-6 spark particles ──
    if (projT > 0.88) {
      const impT = (projT - 0.88) / 0.12;
      if (projT > 0.9 && projT < 0.96) {
        addSpellImpact({
          type: "arcane_spark",
          x: ox,
          y: oy,
          startedAt: performance.now(),
          duration: 350,
        });
      }
      // 8-ray starburst
      ctx.globalAlpha = (1 - impT) * 0.95;
      ctx.lineCap = "round";
      for (let s = 0; s < 8; s++) {
        const sa = (s / 8) * Math.PI * 2;
        const sparkDist = impT * 18;
        const isMajor = s % 2 === 0;
        ctx.strokeStyle = isMajor ? "#FFFFFF" : "#88CCFF";
        ctx.lineWidth = isMajor ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(ox + Math.cos(sa) * 2, oy + Math.sin(sa) * 2);
        ctx.lineTo(
          ox + Math.cos(sa) * sparkDist,
          oy + Math.sin(sa) * sparkDist,
        );
        ctx.stroke();
      }
      // 4-6 scatter spark particles on wall hit
      const sparkMax = spellMax(5);
      for (let s = 0; s < sparkMax; s++) {
        const sa = (s / sparkMax) * Math.PI * 2 + impT * 1.8;
        addPhysicsParticle({
          x: ox,
          y: oy,
          r: 2.5,
          color: s % 3 === 0 ? "#FFFFFF" : s % 3 === 1 ? "#88CCFF" : "#CCDDFF",
          alpha: (1 - impT) * 0.95,
          vx: Math.cos(sa) * 2.0,
          vy: Math.sin(sa) * 2.0,
          gravity: 0.035,
        });
      }
    }
  } else if (spellType === "frost") {
    // ══ FROST NOVA — ice-blue player flash, elongated crystal spikes, cracked ice floor ══
    const WINDUP = 0.2;
    if (progress < WINDUP) {
      // ── Flash player ice-blue for 0.2s before burst ──
      const wt = progress / WINDUP;
      // Full body ice-blue silhouette flash
      ctx.globalAlpha = wt * 0.65;
      ctx.fillStyle = "rgba(140,215,255,0.75)";
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, 10 + wt * 4, 15 + wt * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Bright blue ring outline
      ctx.globalAlpha = wt * 0.55;
      ctx.strokeStyle = "rgba(180,235,255,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pcx, pcy, 14 + wt * 4, 0, Math.PI * 2);
      ctx.stroke();
      // Small ice crystal particles forming around player
      const iceMax = spellMax(4);
      for (let ic = 0; ic < iceMax; ic++) {
        const icA = (ic / iceMax) * Math.PI * 2 + wt * Math.PI;
        addParticle({
          x: pcx + Math.cos(icA) * (10 + wt * 5),
          y: pcy + Math.sin(icA) * (8 + wt * 3),
          r: 2.5,
          color: ic % 2 === 0 ? "#AADDFF" : "#FFFFFF",
          alpha: wt * 0.8,
        });
      }
      flushParticles(ctx);
      ctx.restore();
      return;
    }

    const burstT = (progress - WINDUP) / (1 - WINDUP);
    const cx = pcx;
    const cy = pcy;
    const maxRadius = 2.5 * TILE_SIZE;
    const radius = burstT * maxRadius;
    const alpha = burstT < 0.75 ? 1.0 : Math.max(0, (1 - burstT) / 0.25);

    // Center flash at burst start
    if (burstT < 0.15) {
      const flashA = ((0.15 - burstT) / 0.15) * 0.8;
      ctx.globalAlpha = flashA;
      ctx.fillStyle = "#E8F6FF";
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 8 elongated crystal spike shapes (pointed diamond, white-blue gradient) ──
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const tipX = cx + Math.cos(angle) * radius;
      const tipY = cy + Math.sin(angle) * radius;
      // Elongated: base is closer, spike is longer (diamond ratio 5:1)
      const spikeLen = Math.min(radius * 0.75, maxRadius * 0.55);
      const spikeBaseX = cx + Math.cos(angle) * Math.max(0, radius - spikeLen);
      const spikeBaseY = cy + Math.sin(angle) * Math.max(0, radius - spikeLen);
      // Width of diamond: 4px at base, pointed at both ends
      const diamondW = 4 + (i % 2) * 1.5;
      const perpX = Math.cos(angle + Math.PI / 2) * diamondW;
      const perpY = Math.sin(angle + Math.PI / 2) * diamondW;
      // Rear point of diamond (behind base)
      const rearX = spikeBaseX - Math.cos(angle) * (spikeLen * 0.2);
      const rearY = spikeBaseY - Math.sin(angle) * (spikeLen * 0.2);

      // Outer icy-blue spike
      ctx.fillStyle =
        i % 3 === 0 ? "#88CCFF" : i % 3 === 1 ? "#AADDFF" : "#C8EEFF";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY); // front sharp tip
      ctx.lineTo(spikeBaseX + perpX, spikeBaseY + perpY); // mid-left shoulder
      ctx.lineTo(rearX, rearY); // rear blunt tip
      ctx.lineTo(spikeBaseX - perpX, spikeBaseY - perpY); // mid-right shoulder
      ctx.closePath();
      ctx.fill();

      // Inner white highlight (top third of diamond)
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const midX = (tipX + spikeBaseX) / 2;
      const midY = (tipY + spikeBaseY) / 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(midX + perpX * 0.5, midY + perpY * 0.5);
      ctx.lineTo(midX - perpX * 0.5, midY - perpY * 0.5);
      ctx.closePath();
      ctx.fill();
    }

    // ── Cracked ice fracture lines at center (semi-transparent white lines, fades 0.5s) ──
    if (burstT > 0.12 && burstT < 0.85) {
      const crackAge = (burstT - 0.12) / 0.73;
      const crackAlpha =
        crackAge < 0.6 ? crackAge / 0.6 : Math.max(0, (1 - crackAge) / 0.4);
      ctx.globalAlpha = crackAlpha * 0.6;
      ctx.strokeStyle = "rgba(200,235,255,0.8)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      // 6 jagged fracture lines radiating from center
      for (let f = 0; f < 6; f++) {
        const fBase = (f / 6) * Math.PI * 2;
        const fLen = 12 + (f % 3) * 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        // Jagged: 2-segment broken line
        const midFx = cx + Math.cos(fBase + 0.3) * fLen * 0.55;
        const midFy = cy + Math.sin(fBase + 0.3) * fLen * 0.55;
        const endFx = cx + Math.cos(fBase - 0.15) * fLen;
        const endFy = cy + Math.sin(fBase - 0.15) * fLen;
        ctx.lineTo(midFx, midFy);
        ctx.lineTo(endFx, endFy);
        ctx.stroke();
        // Short side crack off mid-point
        const sideFx = midFx + Math.cos(fBase + Math.PI / 2) * (fLen * 0.3);
        const sideFy = midFy + Math.sin(fBase + Math.PI / 2) * (fLen * 0.3);
        ctx.beginPath();
        ctx.moveTo(midFx, midFy);
        ctx.lineTo(sideFx, sideFy);
        ctx.stroke();
      }
    }

    // Ice patch floor effect — semi-transparent blue ellipse after burst
    if (burstT > 0.5) {
      const patchT = (burstT - 0.5) / 0.5;
      const patchAlpha = Math.max(0, (1 - patchT) * 0.5);
      ctx.globalAlpha = patchAlpha;
      ctx.fillStyle = "#BBDDFF";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#88BBFF";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shatter particles at full radius (last 25%)
    if (burstT > 0.75) {
      const shatterT = (burstT - 0.75) / 0.25;
      const fragMax = spellMax(10);
      for (let f = 0; f < fragMax; f++) {
        const fragAngle = (f / fragMax) * Math.PI * 2;
        const fragDist = radius + shatterT * 16;
        addParticle({
          x: cx + Math.cos(fragAngle) * fragDist,
          y: cy + Math.sin(fragAngle) * fragDist,
          r: 2.5,
          color: f % 3 === 0 ? "#CCEEFF" : f % 3 === 1 ? "#AADDFF" : "#FFFFFF",
          alpha: (1 - shatterT) * alpha * 0.9,
        });
      }
      flushParticles(ctx);
    }

    // Ring outline
    ctx.globalAlpha = alpha * 0.45;
    ctx.strokeStyle = "#AADDFF";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (spellType === "shadow") {
    // ══ SHADOW LANCE — elongated 52×10px rectangle, purple crackling edges, shadow wisp curls ══
    const WINDUP = 0.3;
    if (progress < WINDUP) {
      // Darkness gathering void at player feet
      const wt = progress / WINDUP;
      ctx.globalAlpha = wt * 0.7;
      ctx.fillStyle = "rgba(40,0,60,0.7)";
      ctx.beginPath();
      ctx.arc(startX, startY + 4, 8 + wt * 6, 0, Math.PI * 2);
      ctx.fill();
      // 4 darkness particles converging toward player
      const darkMax = spellMax(4);
      for (let d = 0; d < darkMax; d++) {
        const dAngle = (d / darkMax) * Math.PI * 2 + wt * Math.PI;
        const dDist = 16 * (1 - wt);
        addParticle({
          x: startX + Math.cos(dAngle) * dDist,
          y: startY + Math.sin(dAngle) * dDist,
          r: 2 + wt * 1.5,
          color: d % 2 === 0 ? "#440066" : "#220044",
          alpha: wt * 0.75,
        });
      }
      flushParticles(ctx);
      ctx.restore();
      return;
    }

    const projT = (progress - WINDUP) / (1 - WINDUP);
    const dist = projT * maxDist * 1.35;
    const ox = startX + dx * dist;
    const oy = startY + dy * dist;
    const alpha = Math.max(0, 1 - projT * 1.05);
    const angle2 = Math.atan2(dy, dx);

    // ── Shadow wisps curl sideways from trail (sinusoidal offset) ──
    const wispMax = spellMax(8);
    for (let i = 1; i <= wispMax; i++) {
      const tf = i / (wispMax + 1);
      const td = dist - tf * 28;
      if (td < 0) continue;
      // Sinusoidal offset for curl effect
      const sineOff = Math.sin(tf * Math.PI * 3 + projT * 5) * 4;
      const perpX = -dy * sineOff;
      const perpY = dx * sineOff;
      addParticle({
        x: startX + dx * td + perpX,
        y: startY + dy * td + perpY,
        r: Math.max(1, 3.5 * (1 - tf * 0.5)),
        color: i % 3 === 0 ? "#4B0082" : i % 3 === 1 ? "#220044" : "#6600AA",
        alpha: (1 - tf) * 0.6 * alpha,
      });
    }
    flushParticles(ctx);

    // ── Lance body: proper elongated 52×10px filled rectangle, rotated to aim direction ──
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(angle2);

    // Outer dark purple body (52px long x 10px wide)
    ctx.fillStyle = "rgba(80,0,120,0.92)";
    ctx.fillRect(-26, -5, 52, 10);

    // Mid-tone inner layer (narrower)
    ctx.fillStyle = "rgba(130,0,200,0.85)";
    ctx.fillRect(-24, -3, 48, 6);

    // Bright purple inner core
    ctx.fillStyle = "rgba(200,50,255,0.9)";
    ctx.fillRect(-20, -2, 40, 4);

    // ── Crackling energy edge lines (white-purple sparks along top/bottom edges) ──
    ctx.strokeStyle = "rgba(220,100,255,0.9)";
    ctx.lineWidth = 1.0;
    ctx.lineCap = "round";
    // Top edge sparks
    const crackCount = spellMax(4);
    for (let e = 0; e < crackCount; e++) {
      const ex = -20 + (e / crackCount) * 40;
      const ey = -5;
      const jitter = Math.sin(nowMs * 0.025 + e * 2.1) * 2;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + 6, ey + jitter - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, -ey);
      ctx.lineTo(ex + 6, -ey - jitter + 2);
      ctx.stroke();
    }

    // Pointed tip glow at leading edge
    ctx.fillStyle = "rgba(240,100,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(18, -4);
    ctx.lineTo(18, 4);
    ctx.closePath();
    ctx.fill();

    // Rear taper
    ctx.fillStyle = "rgba(100,0,160,0.7)";
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-20, -4);
    ctx.lineTo(-20, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Wall impact — dark purple burst
    if (projT > 0.85) {
      const hitT = (projT - 0.85) / 0.15;
      if (projT > 0.87 && projT < 0.92) {
        addSpellImpact({
          type: "shadow_slash",
          x: ox,
          y: oy,
          startedAt: performance.now(),
          duration: 500,
        });
      }
      // Dark purple elliptical burst
      ctx.globalAlpha = (1 - hitT) * 0.75;
      ctx.fillStyle = "rgba(80,0,130,0.8)";
      ctx.beginPath();
      ctx.ellipse(ox, oy, hitT * 16, hitT * 10, angle2, 0, Math.PI * 2);
      ctx.fill();
      // Enemy pierce: dark purple burst sparks
      const darkSparkMax = spellMax(4);
      for (let s = 0; s < darkSparkMax; s++) {
        const sa = angle2 + (s - 1.5) * 0.55;
        addPhysicsParticle({
          x: ox,
          y: oy,
          r: 2.5,
          color: s % 2 === 0 ? "#7700CC" : "#AA00FF",
          alpha: (1 - hitT) * 0.9,
          vx: Math.cos(sa) * 2.0,
          vy: Math.sin(sa) * 2.0,
          gravity: 0.025,
        });
      }
    }
  } else if (spellType === "flame") {
    // ══ FLAME RING — 12 individual flames, expands 0→2-tile radius over 0.4s, floor scorch ══
    const WINDUP = 0.2;
    if (progress < WINDUP) {
      // Player glows orange-red + heat shimmer particles
      const wt = progress / WINDUP;
      ctx.globalAlpha = wt * 0.55;
      ctx.fillStyle = "rgba(255,100,0,0.5)";
      ctx.beginPath();
      ctx.arc(pcx, pcy, 10 + wt * 8, 0, Math.PI * 2);
      ctx.fill();
      // 3 heat shimmer wobble particles
      const shimMax = spellMax(3);
      for (let s = 0; s < shimMax; s++) {
        const sAngle = (s / shimMax) * Math.PI * 2 + wt * Math.PI * 2;
        addParticle({
          x: pcx + Math.cos(sAngle) * (6 + wt * 4),
          y: pcy + Math.sin(sAngle) * (4 + wt * 3),
          r: 2 + wt * 2,
          color: s % 2 === 0 ? "#FF6600" : "#FF9900",
          alpha: wt * 0.6,
        });
      }
      flushParticles(ctx);
      ctx.restore();
      return;
    }

    const cx = pcx;
    const cy = pcy;
    const burstT = (progress - WINDUP) / (1 - WINDUP);
    const maxRadius = 2 * TILE_SIZE;
    // ── Ring expands from 0 → full radius over first 0.4s (40% of burst phase) ──
    const expandT = Math.min(1, burstT / 0.4);
    const lingerT = burstT > 0.4 ? (burstT - 0.4) / 0.6 : 0;
    const radius = expandT * maxRadius;
    const ringAlpha = lingerT > 0 ? Math.max(0, 1 - lingerT) : 1.0;

    // Center flash at burst
    if (expandT < 0.2) {
      const flashA = ((0.2 - expandT) / 0.2) * 0.8;
      ctx.globalAlpha = flashA;
      ctx.fillStyle = "#FF8800";
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 12 individual flame sprites flickering between 2 heights ──
    // Each flame flickers independently using per-index time offset
    const pillarsN = spellMax(12);
    ctx.globalAlpha = ringAlpha * 0.95;
    for (let i = 0; i < pillarsN; i++) {
      const baseAngle = (i / pillarsN) * Math.PI * 2;
      // 2-frame flicker: alternate between tall and short heights
      const flickerFrame = Math.floor(nowMs * 0.012 + i * 1.3) % 2;
      const flameH = flickerFrame === 0 ? 10 + (i % 3) * 3 : 7 + (i % 2) * 4;
      const flameW = 4 + (i % 2);
      const tipX = cx + Math.cos(baseAngle) * (radius + flameH);
      const tipY = cy + Math.sin(baseAngle) * (radius + flameH);
      const bx = cx + Math.cos(baseAngle) * Math.max(2, radius * 0.35);
      const by2 = cy + Math.sin(baseAngle) * Math.max(2, radius * 0.35);
      const perpX = Math.cos(baseAngle + Math.PI / 2) * flameW;
      const perpY = Math.sin(baseAngle + Math.PI / 2) * flameW;
      // Orange outer flame
      ctx.fillStyle =
        i % 3 === 0 ? "#FF5500" : i % 3 === 1 ? "#FF3300" : "#FF7700";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(bx + perpX, by2 + perpY);
      ctx.lineTo(bx - perpX, by2 - perpY);
      ctx.closePath();
      ctx.fill();
      // Yellow inner highlight (2-frame alternate color)
      ctx.fillStyle =
        flickerFrame === 0 ? "rgba(255,220,50,0.7)" : "rgba(255,180,20,0.5)";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo((tipX + bx) / 2 + perpX * 0.4, (tipY + by2) / 2 + perpY * 0.4);
      ctx.lineTo((tipX + bx) / 2 - perpX * 0.4, (tipY + by2) / 2 - perpY * 0.4);
      ctx.closePath();
      ctx.fill();
    }

    // Outer ring stroke
    ctx.globalAlpha = ringAlpha * 0.55;
    ctx.strokeStyle = "#FF5500";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // ── Floor scorch circle (dark semi-transparent, fades 0.5s) ──
    if (burstT > 0.25) {
      const scorchT = Math.min(1, (burstT - 0.25) / 0.35);
      const scorchFade = lingerT > 0 ? Math.max(0, 1 - lingerT * 1.2) : 1;
      // Dark scorch mark (semi-transparent circle)
      ctx.globalAlpha = scorchT * scorchFade * 0.5;
      ctx.fillStyle = "#330000";
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // Register scorch mark impact once
      if (burstT > 0.28 && burstT < 0.35) {
        addSpellImpact({
          type: "scorch_mark",
          x: cx,
          y: cy,
          startedAt: performance.now(),
          duration: 700,
        });
      }
    }

    // Linger: fire particles at max radius
    if (lingerT > 0) {
      const fireMax = spellMax(10);
      for (let p = 0; p < fireMax; p++) {
        const pAngle = (p / fireMax) * Math.PI * 2 + lingerT * 0.9;
        const pdist = maxRadius + lingerT * 10;
        addParticle({
          x: cx + Math.cos(pAngle) * pdist,
          y: cy + Math.sin(pAngle) * pdist,
          r: Math.max(1, 3.5 * (1 - lingerT * 0.7)),
          color: p % 3 === 0 ? "#FF6600" : p % 3 === 1 ? "#FF9900" : "#FFCC00",
          alpha: Math.max(0, 1 - lingerT) * 0.95,
        });
      }
      flushParticles(ctx);
    }
  }

  ctx.restore();
}

// ─── Character draw ───────────────────────────────────────────────────────────

// ─── Weapon / Gender overlay (drawn after sprite) ─────────────────────────────
// Canvas drawing additions for weapon type and gender visual cues.
// Axe: wider axe head shape. Long staff: tall line + crystal top. Short wand: compact glowing tip.
// Female long hair: flowing strands behind sprite. Female short hair: close-cropped.
// Male beard: simple chin-area beard shape.
function drawWeaponGenderOverlay(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  bob: number,
  cls: CharacterClass,
  facing: FacingDirection,
  weaponType: "sword" | "axe",
  staffType: "long_staff" | "short_wand",
  gender: "male" | "female",
  timestamp: number,
): void {
  try {
    ctx.save();
    const by = py + bob;
    const cx = px + TILE_SIZE / 2;

    // ── Warrior weapon overlay ──
    if (cls === "warrior" && weaponType === "axe") {
      // Axe head — wider, more prominent than default sword
      const axeX = facing === "left" ? px + 2 : px + TILE_SIZE - 8;
      const axeY = by + 14;
      ctx.globalAlpha = 0.9;
      // Axe handle
      ctx.fillStyle = "#5C3D1A";
      ctx.fillRect(axeX + 2, axeY, 3, 12);
      // Axe head — wider crescent shape
      ctx.fillStyle = "#AAAAAA";
      ctx.beginPath();
      ctx.ellipse(
        facing === "left" ? axeX : axeX + 4,
        axeY + 3,
        6,
        5,
        facing === "left" ? 0.4 : -0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#DDDDDD";
      ctx.beginPath();
      ctx.ellipse(
        facing === "left" ? axeX + 1 : axeX + 3,
        axeY + 2,
        4,
        3,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // ── Mage staff/wand overlay ──
    if (cls === "mage") {
      if (staffType === "long_staff") {
        // Tall staff line with ornate crystal top — drawn alongside mage sprite
        const staffX = facing === "left" ? px + 2 : px + TILE_SIZE - 5;
        // Staff pole (tall, goes above sprite)
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#7A5228";
        ctx.fillRect(staffX, by - 8, 3, TILE_SIZE + 4);
        // Crystal sphere at top — glowing
        const crystalPulse = 0.7 + Math.sin(timestamp * 0.003) * 0.3;
        ctx.globalAlpha = crystalPulse * 0.9;
        ctx.fillStyle = "#88AAFF";
        ctx.beginPath();
        ctx.arc(staffX + 1, by - 10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = crystalPulse * 0.6;
        ctx.fillStyle = "#AACCFF";
        ctx.beginPath();
        ctx.arc(staffX + 1, by - 10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = crystalPulse * 0.5;
        ctx.strokeStyle = "#CCDDFF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(staffX + 1, by - 10, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Short wand — compact, glowing tip
        const wandX = facing === "left" ? px + 3 : px + TILE_SIZE - 6;
        const wandY = by + 10;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(wandX, wandY, 3, 9);
        // Glowing tip — pulsing
        const tipPulse = 0.6 + Math.sin(timestamp * 0.005) * 0.4;
        ctx.globalAlpha = tipPulse * 0.9;
        ctx.fillStyle = "#FFCCFF";
        ctx.beginPath();
        ctx.arc(wandX + 1, wandY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = tipPulse * 0.5;
        ctx.strokeStyle = "#FF88FF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(wandX + 1, wandY, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── Gender hair overlay ──
    // Only applied on "down" and "right"/"left" facing (not up, where hair isn't visible)
    if (facing !== "up") {
      const headY = by - 4; // approximate head top position
      if (gender === "female") {
        // Long hair: flowing strands behind sprite
        ctx.globalAlpha = 0.8;
        // Use hair-adjacent dark strand color — behind body
        ctx.fillStyle = "#5C3010"; // default brown-ish; real color from hairColor would need passing, using neutral dark
        // Two flowing strands behind the body (at sides)
        const hairLength = 14;
        const hairWave = Math.sin(timestamp * 0.001) * 2;
        // Left strand
        ctx.fillRect(px + 4, headY + 2, 3, hairLength + hairWave);
        ctx.fillRect(px + 3, headY + 6, 2, hairLength - 2 + hairWave);
        // Right strand
        ctx.fillRect(px + TILE_SIZE - 7, headY + 2, 3, hairLength + hairWave);
        ctx.fillRect(
          px + TILE_SIZE - 5,
          headY + 6,
          2,
          hairLength - 2 + hairWave,
        );
        // Short hair: close-cropped — render a tighter cap shape;
        // Long hair is the default female visual, short would be a slightly different cap
      } else if (gender === "male") {
        // Beard on chin area (down facing only, where face is visible)
        if (facing === "down") {
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "#4A2A10"; // beard color (dark)
          // Simple chin beard — small rectangle below face
          ctx.fillRect(cx - 3, by + 6, 6, 3);
          ctx.fillRect(cx - 2, by + 8, 4, 2);
        }
      }
    }

    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  username: string,
  cls: CharacterClass,
  facing: FacingDirection,
  isMoving: boolean,
  animProgress: number,
  timestamp: number,
  isLocal: boolean,
  attackActive: boolean,
  attackTimer: number,
  attackFacing: FacingDirection,
  activeEmote?: EmoteType,
  emoteExpiry?: number,
  chatText?: string,
  chatAge?: number,
  outfitColor: OutfitColor = "default",
  outfitStyle: OutfitStyle = "warrior_A",
  hairColor: HairColor = "brown",
  level?: number,
  mageSpellType: "arcane" | "frost" | "shadow" | "flame" = "arcane",
  isGuestPlayer = false,
  isTargeted = false,
  _targetHp?: number,
  _targetMaxHp?: number,
  hasImmunity = false,
  shieldActive = false,
  shieldDurationRatio = 0,
  activeTitleLabel?: string,
  gender: "male" | "female" = "male",
  weaponType: "sword" | "axe" = "sword",
  staffType: "long_staff" | "short_wand" = "long_staff",
  guildName?: string,
): void {
  const idleBob = isMoving
    ? 0
    : Math.round(Math.sin((timestamp / IDLE_BOB_PERIOD) * Math.PI * 2) * 2.5);
  const moveBob = isMoving
    ? Math.round(Math.sin(animProgress * Math.PI) * 1.5)
    : 0;
  const bob = idleBob + moveBob;

  // ── PVP Immunity aura (golden pulsing glow around sprite) ──
  if (hasImmunity) {
    const auraAlpha = 0.35 + Math.sin(timestamp * 0.005) * 0.2;
    const auraRadius = 18 + Math.sin(timestamp * 0.004) * 3;
    ctx.save();
    ctx.globalAlpha = auraAlpha;
    const auraGrad = ctx.createRadialGradient(
      px + TILE_SIZE / 2,
      py + TILE_SIZE / 2 + bob,
      4,
      px + TILE_SIZE / 2,
      py + TILE_SIZE / 2 + bob,
      auraRadius,
    );
    auraGrad.addColorStop(0, "rgba(255,220,50,0.8)");
    auraGrad.addColorStop(0.6, "rgba(255,180,0,0.4)");
    auraGrad.addColorStop(1, "rgba(255,220,50,0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(
      px + TILE_SIZE / 2,
      py + TILE_SIZE / 2 + bob,
      auraRadius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  // ── Warrior Shield Orb (full glowing bubble, breathes, flickers when low duration) ──
  if (shieldActive && cls === "warrior") {
    const shieldTs = timestamp;
    // Remaining duration: flicker rapidly when below 15%
    const isLowDuration = shieldDurationRatio < 0.15;
    // Alpha scales with remaining duration
    const baseAlpha = Math.max(0.05, shieldDurationRatio * 0.28);
    // Breathing pulse: slow in/out every 1.5s; flicker when low
    const breathFreq = isLowDuration ? 0.012 : 0.0021;
    const breathAmp = isLowDuration ? 4 : 6;
    // Flicker: when low duration, alpha oscillates rapidly (fast sin)
    const flickerMod = isLowDuration
      ? 0.5 + Math.abs(Math.sin(shieldTs * 0.022)) * 0.5
      : 1.0;
    const pulse = Math.sin(shieldTs * breathFreq) * breathAmp;
    const cx2 = px + TILE_SIZE / 2;
    const cy2 = py + TILE_SIZE / 2 + bob;
    const outerR = 28 + pulse;
    const innerR = 21 + pulse * 0.7;
    const ringAngle1 = (shieldTs * 0.0015) % (Math.PI * 2);
    const ringAngle2 = -(shieldTs * 0.0022) % (Math.PI * 2);

    ctx.save();
    // Outer translucent gold-blue sphere fill
    ctx.globalAlpha = baseAlpha * 2.4 * flickerMod;
    ctx.fillStyle = "rgba(200,160,0,0.22)";
    ctx.beginPath();
    ctx.arc(cx2, cy2, outerR, 0, Math.PI * 2);
    ctx.fill();
    // Middle blue layer
    ctx.globalAlpha = baseAlpha * 2.2 * flickerMod;
    ctx.fillStyle = "rgba(80,130,255,0.18)";
    ctx.beginPath();
    ctx.arc(cx2, cy2, innerR, 0, Math.PI * 2);
    ctx.fill();
    // Gold outer ring border
    ctx.globalAlpha = Math.min(0.92, baseAlpha * 5.0 * flickerMod);
    ctx.strokeStyle = "rgba(255,215,0,0.9)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx2, cy2, outerR, 0, Math.PI * 2);
    ctx.stroke();
    // Blue inner ring
    ctx.globalAlpha = Math.min(0.72, baseAlpha * 4.0 * flickerMod);
    ctx.strokeStyle = "rgba(100,180,255,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx2, cy2, innerR, 0, Math.PI * 2);
    ctx.stroke();
    // Rotating inner energy ring 1 (gold, faster)
    ctx.globalAlpha = Math.min(0.68, baseAlpha * 3.2 * flickerMod);
    ctx.strokeStyle = "rgba(255,220,80,0.7)";
    ctx.lineWidth = 1.2;
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.rotate(ringAngle1);
    ctx.beginPath();
    ctx.ellipse(0, 0, innerR * 0.85, innerR * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Rotating inner energy ring 2 (blue, slower, opposite direction)
    ctx.globalAlpha = Math.min(0.52, baseAlpha * 2.6 * flickerMod);
    ctx.strokeStyle = "rgba(150,200,255,0.55)";
    ctx.lineWidth = 1.0;
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.rotate(ringAngle2);
    ctx.beginPath();
    ctx.ellipse(0, 0, innerR * 0.7, innerR * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // ── Shield duration bar (under the sprite) ──
    if (shieldDurationRatio > 0) {
      const barW = 32;
      const barH = 4;
      const barX = cx2 - barW / 2;
      const barY = py + TILE_SIZE + 3;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      barGrad.addColorStop(0, "rgba(100,180,255,0.9)");
      barGrad.addColorStop(
        1,
        isLowDuration ? "rgba(255,80,0,0.9)" : "rgba(255,215,0,0.9)",
      );
      ctx.fillStyle = barGrad;
      ctx.fillRect(barX, barY, barW * shieldDurationRatio, barH);
      ctx.restore();
    }
  }

  // ── Targeting circle (pulsing red/orange under targeted player) ──
  if (isTargeted) {
    const pulseRadius = 12 + Math.sin(timestamp * 0.004) * 4;
    const pulseAlpha = 0.55 + Math.sin(timestamp * 0.006) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    ctx.strokeStyle = "#ff4422";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#ff6600";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(
      px + TILE_SIZE / 2,
      py + TILE_SIZE - 4,
      pulseRadius,
      pulseRadius * 0.45,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  drawShadow(ctx, px, py, 0.4);

  // ── Visual character growth tiers (based on level) ──
  if (!isGuestPlayer && level !== undefined) {
    const cx2 = px + TILE_SIZE / 2;
    const cy2 = py + TILE_SIZE / 2 + bob;

    // Tier 1 (Level 10+): subtle golden halo ring under player
    if (level >= 10) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.ellipse(cx2, cy2 + 10, 14, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Tier 2 (Level 25+): weapon/staff glow + orbiting sparks
    if (level >= 25) {
      const orbitSpeed = timestamp * 0.0032;
      const orbitR = 10;
      for (let oi = 0; oi < 2; oi++) {
        const angle = orbitSpeed + oi * Math.PI;
        const ox = cx2 + Math.cos(angle) * orbitR;
        const oy = cy2 + Math.sin(angle) * orbitR * 0.5;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = cls === "warrior" ? "#FFAA22" : "#88CCFF";
        ctx.shadowColor = cls === "warrior" ? "#FF8800" : "#4499FF";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Tier 3 (Level 40+): golden foot aura (4 slowly orbiting dots)
    if (level >= 40) {
      const auraSpeed = timestamp * 0.0015;
      for (let ai = 0; ai < 4; ai++) {
        const angle = auraSpeed + (ai / 4) * Math.PI * 2;
        const ax = cx2 + Math.cos(angle) * 13;
        const ay = cy2 + 10 + Math.sin(angle) * 4;
        const aAlpha = 0.5 + Math.sin(timestamp * 0.004 + ai) * 0.2;
        ctx.save();
        ctx.globalAlpha = aAlpha;
        ctx.fillStyle = "#FFD700";
        ctx.shadowColor = "#FFB800";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(ax, ay, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  ctx.globalAlpha = isLocal ? 1.0 : 0.78;

  // ── Guest sprite: simple red humanoid, no class identity ──
  if (isGuestPlayer) {
    const cx2 = px + TILE_SIZE / 2;
    const cy2 = py + TILE_SIZE / 2 + bob;
    ctx.save();
    ctx.globalAlpha = isLocal ? 1.0 : 0.72;
    const legSwing = isMoving ? Math.sin(animProgress * Math.PI * 2) * 4 : 0;
    const armSwing = isMoving ? Math.sin(animProgress * Math.PI * 2) * 3 : 0;
    // Legs
    ctx.fillStyle = "#7a1500";
    ctx.fillRect(cx2 - 5, cy2 + 4 + legSwing, 4, 8);
    ctx.fillRect(cx2 + 1, cy2 + 4 - legSwing, 4, 8);
    // Body
    ctx.fillStyle = "#cc2200";
    ctx.fillRect(cx2 - 5, cy2 - 8, 10, 12);
    // Arms
    ctx.fillRect(cx2 - 9, cy2 - 7 + armSwing, 4, 9);
    ctx.fillRect(cx2 + 5, cy2 - 7 - armSwing, 4, 9);
    // Head
    ctx.fillStyle = "#e8c090";
    ctx.beginPath();
    ctx.arc(cx2, cy2 - 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a3010";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1.0;
    // Name tag (reuse existing inline logic below)
    const cxN = px + TILE_SIZE / 2;
    const labelN = username.toUpperCase();
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const twN = ctx.measureText(labelN).width + 14;
    const lhN = 16;
    const lxN = cxN - twN / 2;
    const lyN = py + bob - 30;
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(lxN - 1, lyN - 1, twN + 2, lhN + 2);
    ctx.strokeStyle = "#cc3300";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lxN + 0.5, lyN + 0.5, twN - 1, lhN - 1);
    ctx.fillStyle = isLocal ? "#ff6644" : "oklch(0.76 0 0)";
    ctx.fillText(labelN, cxN, lyN + lhN / 2);
    return;
  }

  const rawCycle = isMoving ? (animProgress * ANIM_FRAME_COUNT) % 1 : 0;
  const walkCycle = isMoving ? Math.sin(rawCycle * Math.PI * 2) : 0;
  const animBlend = isMoving ? animProgress : 0;
  // Per-spell duration so AoE spells (frost/flame) have 600ms, shadow 400ms, arcane 280ms
  const spellDuration =
    mageSpellType === "frost" || mageSpellType === "flame"
      ? MAGE_SPELL_VISUAL_DURATION_MS
      : mageSpellType === "shadow"
        ? SHADOW_LANCE_VISUAL_DURATION_MS
        : ATTACK_DURATION_MS;
  const attackProgress =
    attackActive && attackTimer > 0
      ? Math.max(0, Math.min(1, 1 - attackTimer / spellDuration))
      : 0;

  // Subtle dark outline for better player visibility against all backgrounds
  // When local player just used a healing potion: brief green glow outline
  if (isLocal && _healingOutlineTimer > 0) {
    ctx.shadowColor = "#4ade80";
    ctx.shadowBlur = 8;
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.80)";
    ctx.shadowBlur = 4;
  }
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  if (facing === "left") {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    if (cls === "mage")
      drawMage(
        ctx,
        0,
        py,
        "right",
        walkCycle,
        bob,
        animBlend,
        attackProgress,
        outfitColor,
        outfitStyle,
        hairColor,
      );
    else
      drawWarrior(
        ctx,
        0,
        py,
        "right",
        walkCycle,
        bob,
        animBlend,
        attackProgress,
        outfitColor,
        outfitStyle,
        hairColor,
      );
    ctx.restore();
    // Weapon/gender overlays for left-facing (drawn in mirrored pass via separate call)
    drawWeaponGenderOverlay(
      ctx,
      px,
      py,
      bob,
      cls,
      "left",
      weaponType,
      staffType,
      gender,
      timestamp,
    );
  } else {
    if (cls === "mage")
      drawMage(
        ctx,
        px,
        py,
        facing,
        walkCycle,
        bob,
        animBlend,
        attackProgress,
        outfitColor,
        outfitStyle,
        hairColor,
      );
    else
      drawWarrior(
        ctx,
        px,
        py,
        facing,
        walkCycle,
        bob,
        animBlend,
        attackProgress,
        outfitColor,
        outfitStyle,
        hairColor,
      );
    drawWeaponGenderOverlay(
      ctx,
      px,
      py,
      bob,
      cls,
      facing,
      weaponType,
      staffType,
      gender,
      timestamp,
    );
  }

  ctx.globalAlpha = 1.0;
  // Clear sprite outline shadow so it doesn't bleed into name labels or attacks
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (attackActive && attackTimer > 0) {
    const ap = 1 - attackTimer / ATTACK_DURATION_MS;
    if (cls === "warrior")
      drawWarriorAttack(ctx, px, py, attackFacing, ap, weaponType);
    else drawMageAttack(ctx, px, py, attackFacing, ap, mageSpellType);
  }

  // ── Nameplate — dark pill with class dot + name ──────────────────────────────────────────────
  const cx = px + TILE_SIZE / 2;
  const nameLabel = username.toUpperCase();
  const classDotColor = cls === "mage" ? "#4488ff" : "#ff4444";
  ctx.font = "bold 10px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameTextW = ctx.measureText(nameLabel).width;
  // Extra 22px for dot (6px) + dot gap (5px) + right padding
  const tw = nameTextW + 24;
  const lh = 16;
  const lx = cx - tw / 2;
  const labelTopOffset = cls === "mage" ? 37 : 31;
  const ly = py + bob - labelTopOffset;
  const pillR = lh / 2;

  // ── Active title badge (above name pill, gold) ──
  let titleBadgeHeight = 0;
  if (activeTitleLabel && !isGuestPlayer) {
    ctx.font = "bold 8px 'JetBrains Mono', monospace";
    const ttw = ctx.measureText(activeTitleLabel).width + 12;
    const tth = 12;
    const tlx = cx - ttw / 2;
    const tly = ly - tth - 3;
    const tpR = tth / 2;
    ctx.fillStyle = "rgba(6,5,0,0.92)";
    ctx.beginPath();
    ctx.roundRect(tlx, tly, ttw, tth, tpR);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,215,0,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tlx + 0.5, tly + 0.5, ttw - 1, tth - 1, tpR);
    ctx.stroke();
    ctx.fillStyle = "#ffd700";
    ctx.shadowColor = "rgba(255,215,0,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillText(activeTitleLabel, cx, tly + tth / 2);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    titleBadgeHeight = tth + 4;
  }
  void titleBadgeHeight;

  // Pill background
  const col = CLASS_COLORS[cls];
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.beginPath();
  ctx.roundRect(lx, ly, tw, lh, pillR);
  ctx.fill();
  // Pill border
  ctx.strokeStyle = isLocal ? col.labelBorder : "rgba(255,255,255,0.15)";
  ctx.lineWidth = isLocal ? 1.5 : 1;
  ctx.beginPath();
  ctx.roundRect(lx + 0.5, ly + 0.5, tw - 1, lh - 1, pillR - 0.5);
  ctx.stroke();
  // Class color dot (left side of pill)
  ctx.fillStyle = classDotColor;
  ctx.shadowColor = classDotColor;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(lx + 9, ly + lh / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  // Name text (offset right to accommodate dot)
  ctx.fillStyle = isLocal ? "#ffffff" : "rgba(215,215,215,0.9)";
  ctx.shadowColor = "rgba(0,0,0,1)";
  ctx.shadowBlur = 3;
  ctx.font = "bold 10px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(nameLabel, cx + 4, ly + lh / 2);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // ── Green online dot (other players only) ──
  if (!isLocal && !isGuestPlayer) {
    ctx.save();
    const dotX = lx + tw + 5;
    const dotY = ly + lh / 2;
    ctx.fillStyle = "#22dd44";
    ctx.shadowColor = "#22dd44";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Level badge — small pill below name
  if (level !== undefined && level > 0) {
    const badgeLabel = `Lv.${level}`;
    ctx.font = "bold 8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const bw = ctx.measureText(badgeLabel).width + 8;
    const bh = 10;
    const bx = cx - bw / 2;
    const by2 = ly + lh + 2;
    const bpR = bh / 2;
    ctx.fillStyle = isLocal ? "rgba(16,10,0,0.90)" : "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.roundRect(bx, by2, bw, bh, bpR);
    ctx.fill();
    const badgeCol = isLocal
      ? cls === "mage"
        ? "oklch(0.72 0.18 265)"
        : "oklch(0.78 0.15 55)"
      : "oklch(0.58 0 0)";
    ctx.strokeStyle = `${badgeCol}80`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx + 0.5, by2 + 0.5, bw - 1, bh - 1, bpR - 0.5);
    ctx.stroke();
    ctx.fillStyle = badgeCol;
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 2;
    ctx.fillText(badgeLabel, cx, by2 + bh / 2);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  // ── Guild tag — small pill below level badge, cyan ──
  if (guildName && !isGuestPlayer) {
    const guildLabel = `[${guildName}]`;
    ctx.font = "bold 8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const gw = ctx.measureText(guildLabel).width + 8;
    const gh = 10;
    const gx = cx - gw / 2;
    const levelBadgeBottom =
      level !== undefined && level > 0 ? ly + lh + 2 + 10 + 2 : ly + lh + 2;
    const gpR = gh / 2;
    ctx.fillStyle = "rgba(0,14,20,0.85)";
    ctx.beginPath();
    ctx.roundRect(gx, levelBadgeBottom, gw, gh, gpR);
    ctx.fill();
    ctx.strokeStyle = "rgba(103,232,249,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx + 0.5, levelBadgeBottom + 0.5, gw - 1, gh - 1, gpR - 0.5);
    ctx.stroke();
    ctx.fillStyle = "#67e8f9";
    ctx.shadowColor = "rgba(103,232,249,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(guildLabel, cx, levelBadgeBottom + gh / 2);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  // ── Targeted player HP bar (shown above name when this player is the PVP target) ──
  if (
    isTargeted &&
    _targetHp !== undefined &&
    _targetMaxHp !== undefined &&
    _targetMaxHp > 0
  ) {
    const hpRatio = Math.max(0, Math.min(1, _targetHp / _targetMaxHp));
    const barW = 48;
    const barH = 5;
    const barX = cx - barW / 2;
    const labelTopOffset2 = cls === "mage" ? 36 : 30;
    const barY = py + bob - labelTopOffset2 - barH - 6;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    const hpColor =
      hpRatio > 0.5 ? "#44dd44" : hpRatio > 0.25 ? "#ffcc00" : "#ee2222";
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
    ctx.strokeStyle = "rgba(255,80,50,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
    ctx.restore();
  }

  if (chatText && chatAge !== undefined) {
    const totalVisible = CHAT_BUBBLE_DURATION_MS + CHAT_BUBBLE_FADE_MS;
    if (chatAge < totalVisible) {
      const fadeStart = CHAT_BUBBLE_DURATION_MS;
      const chatAlpha =
        chatAge > fadeStart
          ? 1 - (chatAge - fadeStart) / CHAT_BUBBLE_FADE_MS
          : 1.0;
      ctx.save();
      ctx.globalAlpha = Math.max(0, chatAlpha);
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let displayMsg = chatText;
      while (ctx.measureText(displayMsg).width > 138 && displayMsg.length > 1)
        displayMsg = displayMsg.slice(0, -1);
      if (displayMsg !== chatText) displayMsg += "…";
      const ctw = Math.min(ctx.measureText(displayMsg).width + 12, 150);
      const cth = 15;
      const clx = cx - ctw / 2;
      const chatY = ly - cth - 6;
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(clx - 1, chatY - 1, ctw + 2, cth + 2);
      ctx.strokeStyle = col.labelBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(clx + 0.5, chatY + 0.5, ctw - 1, cth - 1);
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(cx - 2, chatY + cth, 4, 3);
      ctx.fillRect(cx - 1, chatY + cth + 3, 2, 2);
      ctx.fillStyle = "oklch(0.90 0 0)";
      ctx.fillText(displayMsg, cx, chatY + cth / 2);
      ctx.restore();
    }
  }

  // Emote bubble
  const emoteActive =
    activeEmote !== undefined &&
    emoteExpiry !== undefined &&
    emoteExpiry > Date.now();
  if (emoteActive && activeEmote) {
    const timeLeft = (emoteExpiry ?? 0) - Date.now();
    const fadeAlpha = timeLeft < 500 ? timeLeft / 500 : 1.0;
    ctx.globalAlpha = fadeAlpha;
    const emoteY = py + bob - labelTopOffset - 22;
    const icon = EMOTE_ICONS[activeEmote];
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.88)";
    ctx.fillRect(cx - 12, emoteY - 10, 24, 20);
    ctx.strokeStyle = col.labelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 12, emoteY - 10, 24, 20);
    ctx.fillText(icon, cx, emoteY);
    ctx.globalAlpha = 1.0;
  }
}

// ─── Floating damage numbers ──────────────────────────────────────────────────

export type SpellType =
  | "physical"
  | "arcane"
  | "frost"
  | "shadow"
  | "flame"
  | "heal";

interface DamageNumber {
  x: number;
  y: number;
  value: number;
  age: number;
  isPlayer: boolean;
  spellType?: SpellType;
  isCrit?: boolean;
  isHeal?: boolean;
  /** Special flag: first kill bonus — renders "First Kill! x2 XP!" text */
  isFirstKillBonus?: boolean;
  /** Special flag: auto-picked-up gold — renders "+N gold" in gold color */
  isGoldPickup?: boolean;
  /** Special flag: interact text — renders interaction result message */
  isInteractText?: boolean;
  interactMessage?: string;
}

function getDamageColor(
  spellType: SpellType | undefined,
  isPlayer: boolean,
): string {
  if (!spellType || spellType === "physical")
    return isPlayer ? "oklch(0.62 0.25 25)" : "#ffffff";
  switch (spellType) {
    case "arcane":
      return "#00ddff";
    case "frost":
      return "#99ccff";
    case "shadow":
      return "#cc66ff";
    case "flame":
      return "#ff8833";
    case "heal":
      return "#44ff44";
    default:
      return "#ffffff";
  }
}

// ─── Monster difficulty indicator ─────────────────────────────────────────────
const MONSTER_LEVEL_MAP: Partial<Record<string, number>> = {
  slime: 1,
  sprite_wisp: 2,
  goblin: 3,
  forest_troll: 5,
  spider: 4,
  bat: 3,
  wolf: 6,
  bear: 8,
  tiger: 10,
  stone_golem: 12,
  shadow_wolf: 14,
  skeleton: 12,
  crystal_golem: 15,
  cyclops: 18,
  cave_bat: 8,
  cave_troll: 14,
  bog_witch: 16,
  swamp_lurker: 14,
  mud_golem: 18,
  ruin_specter: 22,
  ancient_guardian: 25,
  sky_serpent: 27,
  pirate_grunt: 10,
  pirate_gunner: 12,
  pirate_captain: 17,
  pirate_cannon: 14,
  cursed_sailor: 21,
  skeleton_gunner: 23,
  cursed_navigator: 25,
  ship_captain: 30,
};

function getSkullColor(monsterType: string, playerLevel: number): string {
  const mLevel = MONSTER_LEVEL_MAP[monsterType] ?? 10;
  if (mLevel > playerLevel + 5) return "#ff4444";
  if (mLevel < playerLevel - 5) return "#44ff44";
  return "#ffdd00";
}

function drawDifficultySkull(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(cx - 2.5, cy - 1.2, 1.5, 1.5);
  ctx.fillRect(cx + 1, cy - 1.2, 1.5, 1.5);
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy + 1.5, 1.5, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

// ─── Rain system ─────────────────────────────────────────────────────────────
const MAX_RAIN_PARTICLES = 20;
interface RainParticle {
  x: number;
  y: number;
  speed: number;
  alpha: number;
  height: number;
}
let rainParticles: RainParticle[] = [];
let rainActive = false;
let rainTimer = 0;
let rainDuration = 0;
let rainFadeOut = 0;
let rainCheckTimer = 0;

const INTERIOR_ZONES = new Set([
  "hub_basement",
  "wilderness_dungeon",
  "forest_dungeon",
  "bat_cave",
  "deep_cave",
  "cave_interior",
  "boss_chamber",
  "cursed_galleon",
  "floating_ruins",
]);

// ─── Thunderstorm system ─────────────────────────────────────────────────────
const THUNDER_ZONES = new Set([
  "meadow_hub",
  "wilderness",
  "forest_depths",
  "wolf_forest",
  "bear_forest",
  "tiger_jungle",
  "pirate_island",
  "cursed_swamp",
  "dark_forest",
]);
void THUNDER_ZONES; // referenced in weather system — keep for zone-check expansion
let _thunderActive = false;
let _thunderTimer = 0; // remaining ms of current storm
let _thunderCheckTimer = 0; // ms until next random check (300000 = 5 min)
let _lightningFlashTimer = 0; // white overlay remaining ms
let _lightningNextTimer = 0; // ms until next lightning strike
let _thunderPendingSound = false; // true when thunder audio should play 1s after flash

// ─── Water quality decoratives ───────────────────────────────────────────────
interface WaterFish {
  x: number;
  y: number;
  dir: 1 | -1;
  timer: number;
  alpha: number;
}
interface WaterDriftwood {
  x: number;
  y: number;
  seed: number;
}
interface WaterBubble {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}
const _waterFish: WaterFish[] = [];
let _waterFishTimer = 0;
const _waterDriftwood: WaterDriftwood[] = [];
let _waterDriftwoodInit = false;
const _waterBubbles: WaterBubble[] = [];
let _waterBubbleTimer = 0;

// ─── Sky decoratives ─────────────────────────────────────────────────────────
interface MeteorStreak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  alpha: number;
}
const _meteors: MeteorStreak[] = [];
let _meteorTimer = 0; // ms until next shower check (1800000 = 30 min)
let _meteorActive = false;
let _meteorBatchTimer = 0; // timer for spawning each meteor in a shower batch
let _meteorBatchCount = 0; // remaining meteors in current shower

function initRainParticles(): void {
  rainParticles = [];
  for (let i = 0; i < MAX_RAIN_PARTICLES; i++) {
    rainParticles.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      speed: 200 + Math.random() * 80,
      alpha: 0.25 + Math.random() * 0.15,
      height: 8 + Math.random() * 4,
    });
  }
}

function updateRainSystem(dt: number, zoneId: string): void {
  const isInterior = INTERIOR_ZONES.has(zoneId);
  if (isInterior) {
    if (rainActive) {
      rainActive = false;
      rainFadeOut = 2000;
    }
    return;
  }
  if (rainFadeOut > 0) {
    rainFadeOut = Math.max(0, rainFadeOut - dt);
    if (rainFadeOut <= 0) rainParticles = [];
  }
  if (rainActive) {
    rainTimer += dt;
    for (const p of rainParticles) {
      p.y += (p.speed * dt) / 1000;
      if (p.y > CANVAS_H) {
        p.y = -p.height;
        p.x = Math.random() * CANVAS_W;
      }
    }
    if (rainTimer >= rainDuration) {
      rainActive = false;
      rainFadeOut = 2000;
    }
  } else {
    rainCheckTimer += dt;
    if (rainCheckTimer >= 150000) {
      rainCheckTimer = 0;
      if (Math.random() < 0.3) {
        rainActive = true;
        rainTimer = 0;
        rainDuration = 60000 + Math.random() * 30000;
        rainFadeOut = 0;
        if (rainParticles.length === 0) initRainParticles();
      }
    }
  }
}

function drawRain(ctx: CanvasRenderingContext2D): void {
  if (rainParticles.length === 0) return;
  const fadeAlpha = rainFadeOut > 0 ? rainFadeOut / 2000 : rainActive ? 1.0 : 0;
  if (fadeAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.08 * fadeAlpha;
  ctx.fillStyle = "rgba(0,0,40,1)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "rgba(150,180,220,1)";
  ctx.lineWidth = 1;
  for (const p of rainParticles) {
    ctx.globalAlpha = p.alpha * fadeAlpha;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + p.height);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Thunder / water / sky helpers ───────────────────────────────────────────

function updateThunderSystem(
  dt: number,
  zoneId: string,
  onThunderSound?: () => void,
): void {
  if (INTERIOR_ZONES.has(zoneId) || !THUNDER_ZONES.has(zoneId)) {
    _thunderActive = false;
    return;
  }
  if (_thunderPendingSound) {
    _thunderCheckTimer += dt;
    if (_thunderCheckTimer >= 1000) {
      _thunderCheckTimer = 0;
      _thunderPendingSound = false;
      onThunderSound?.();
    }
  }
  if (_lightningFlashTimer > 0)
    _lightningFlashTimer = Math.max(0, _lightningFlashTimer - dt);
  if (_thunderActive) {
    _thunderTimer = Math.max(0, _thunderTimer - dt);
    if (_thunderTimer <= 0) {
      _thunderActive = false;
      return;
    }
    _lightningNextTimer = Math.max(0, _lightningNextTimer - dt);
    if (_lightningNextTimer <= 0) {
      _lightningFlashTimer = 100;
      _lightningNextTimer = 20000 + Math.random() * 20000;
      if (!_thunderPendingSound) {
        _thunderCheckTimer = 0;
        _thunderPendingSound = true;
      }
    }
  } else {
    _thunderCheckTimer += dt;
    if (_thunderCheckTimer >= 300000) {
      _thunderCheckTimer = 0;
      if (Math.random() < 0.05) {
        _thunderActive = true;
        _thunderTimer = 120000;
        _lightningNextTimer = 5000 + Math.random() * 10000;
      }
    }
  }
}

function drawLightningFlash(ctx: CanvasRenderingContext2D): void {
  if (_lightningFlashTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = (_lightningFlashTimer / 100) * 0.8;
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function updateWaterDecorations(
  dt: number,
  zoneId: string,
  tiles: number[][],
  camX: number,
  camY: number,
): void {
  if (INTERIOR_ZONES.has(zoneId)) return;
  _waterFishTimer += dt;
  if (_waterFishTimer >= 30000 && _waterFish.length < 2) {
    _waterFishTimer = 0;
    const stx = Math.floor(camX / TILE_SIZE);
    const sty = Math.floor(camY / TILE_SIZE);
    for (let a = 0; a < 30; a++) {
      const tx = stx + Math.floor(Math.random() * VIEWPORT_COLS);
      const ty = sty + Math.floor(Math.random() * VIEWPORT_ROWS);
      const tl = tiles[ty]?.[tx];
      if (tl === 7 || tl === 30 || tl === 41) {
        _waterFish.push({
          x: tx + 0.3,
          y: ty + 0.5,
          dir: Math.random() < 0.5 ? 1 : -1,
          timer: 3000,
          alpha: 0.4,
        });
        break;
      }
    }
  }
  for (let fi = _waterFish.length - 1; fi >= 0; fi--) {
    const f = _waterFish[fi]!;
    f.x += f.dir * 0.04 * (dt / 16);
    f.timer -= dt;
    if (f.timer <= 500) f.alpha = (f.timer / 500) * 0.4;
    if (f.timer <= 0) _waterFish.splice(fi, 1);
  }
  if (!_waterDriftwoodInit) {
    _waterDriftwoodInit = true;
    const W2 = tiles[0]?.length ?? 32;
    const H2 = tiles.length;
    let found = 0;
    for (let a = 0; a < 200 && found < 2; a++) {
      const tx = 1 + Math.floor(Math.random() * (W2 - 2));
      const ty = 1 + Math.floor(Math.random() * (H2 - 2));
      const tl = tiles[ty]?.[tx];
      if (tl === 7 || tl === 30) {
        _waterDriftwood.push({ x: tx, y: ty, seed: Math.random() * 1000 });
        found++;
      }
    }
  }
  _waterBubbleTimer += dt;
  if (_waterBubbleTimer >= 3000 && _waterBubbles.length < 3) {
    _waterBubbleTimer = 0;
    const stx2 = Math.floor(camX / TILE_SIZE);
    const sty2 = Math.floor(camY / TILE_SIZE);
    for (let a = 0; a < 20; a++) {
      const tx = stx2 + Math.floor(Math.random() * VIEWPORT_COLS);
      const ty = sty2 + Math.floor(Math.random() * VIEWPORT_ROWS);
      const tl = tiles[ty]?.[tx];
      if (tl === 7 || tl === 30 || tl === 31) {
        _waterBubbles.push({
          x: tx * TILE_SIZE - camX + TILE_SIZE / 2 + (Math.random() - 0.5) * 20,
          y: ty * TILE_SIZE - camY + TILE_SIZE - 4,
          age: 0,
          maxAge: 600,
        });
        break;
      }
    }
  }
  for (let bi = _waterBubbles.length - 1; bi >= 0; bi--) {
    const b = _waterBubbles[bi]!;
    b.age += dt;
    b.y -= 0.008 * dt;
    if (b.age >= b.maxAge) _waterBubbles.splice(bi, 1);
  }
}

function drawWaterDecorations(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  ts: number,
): void {
  for (const dw of _waterDriftwood) {
    const sx = Math.floor(dw.x * TILE_SIZE - camX);
    const sy =
      Math.floor(dw.y * TILE_SIZE - camY) + Math.sin(ts * 0.0005 + dw.seed) * 1;
    if (sx < -30 || sx > CANVAS_W + 10 || sy < -10 || sy > CANVAS_H + 10)
      continue;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(100,60,20,0.7)";
    ctx.beginPath();
    ctx.ellipse(sx + 10, sy + TILE_SIZE * 0.6, 10, 3.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const f of _waterFish) {
    const sx = Math.floor(f.x * TILE_SIZE - camX);
    const sy = Math.floor(f.y * TILE_SIZE - camY);
    if (sx < -20 || sx > CANVAS_W + 20 || sy < -10 || sy > CANVAS_H + 10)
      continue;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.fillStyle = "rgba(0,0,80,0.5)";
    if (f.dir === -1) {
      ctx.translate(sx + 8, sy);
      ctx.scale(-1, 1);
      ctx.translate(-(sx + 8), -sy);
    }
    ctx.beginPath();
    ctx.ellipse(sx + 8, sy, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const b of _waterBubbles) {
    const t2 = b.age / b.maxAge;
    ctx.save();
    ctx.globalAlpha = (1 - t2) * 0.4;
    ctx.strokeStyle = "rgba(200,230,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawMoon(ctx: CanvasRenderingContext2D, nightFactor: number): void {
  if (nightFactor < 0.3) return;
  const alpha = Math.min(1.0, (nightFactor - 0.3) / 0.5);
  const phase = new Date().getDate() % 7;
  const mx = CANVAS_W - 52;
  const my = 32;
  const r = 12;
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "#E8E4D0";
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();
  if (phase > 0 && phase < 6) {
    const shadowX = phase < 3 ? r * (1 - phase / 3) : -r * ((phase - 3) / 3);
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.95)";
    ctx.beginPath();
    ctx.ellipse(
      mx + shadowX,
      my,
      Math.max(2, r - Math.abs(shadowX) * 0.2),
      r,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  } else if (phase === 6) {
    ctx.globalAlpha = alpha * 0.12;
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawConstellations(
  ctx: CanvasRenderingContext2D,
  nightFactor: number,
): void {
  if (nightFactor < 0.5) return;
  const alpha = Math.min(0.5, (nightFactor - 0.5) * 1.4);
  const CONSTS: number[][][] = [
    [
      [80, 18],
      [92, 12],
      [100, 22],
      [108, 14],
      [118, 20],
    ],
    [
      [200, 14],
      [212, 8],
      [220, 18],
      [228, 10],
    ],
    [
      [380, 22],
      [392, 14],
      [404, 18],
      [396, 26],
    ],
    [
      [520, 10],
      [530, 18],
      [540, 12],
      [552, 20],
      [544, 8],
    ],
  ];
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const cons of CONSTS) {
    ctx.strokeStyle = "rgba(200,220,255,0.4)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < cons.length; i++) {
      const pt = cons[i]!;
      if (i === 0) ctx.moveTo(pt[0]!, pt[1]!);
      else ctx.lineTo(pt[0]!, pt[1]!);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(230,240,255,0.85)";
    for (const pt of cons) {
      ctx.beginPath();
      ctx.arc(pt[0]!, pt[1]!, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function updateMeteors(dt: number): void {
  _meteorTimer += dt;
  if (_meteorTimer >= 1800000 && !_meteorActive) {
    _meteorTimer = 0;
    _meteorActive = true;
    _meteorBatchCount = 5 + Math.floor(Math.random() * 3);
    _meteorBatchTimer = 0;
  }
  if (_meteorActive) {
    _meteorBatchTimer += dt;
    if (_meteorBatchTimer >= 4000 && _meteorBatchCount > 0) {
      _meteorBatchTimer = 0;
      _meteorBatchCount--;
      _meteors.push({
        x: 50 + Math.random() * (CANVAS_W - 100),
        y: 10 + Math.random() * (CANVAS_H * 0.3),
        vx: 2 + Math.random() * 1.5,
        vy: 1.2 + Math.random() * 0.8,
        age: 0,
        maxAge: 500 + Math.random() * 200,
        alpha: 1.0,
      });
      if (_meteorBatchCount <= 0) _meteorActive = false;
    }
  }
  for (let mi = _meteors.length - 1; mi >= 0; mi--) {
    const m = _meteors[mi]!;
    m.age += dt;
    m.x += m.vx * (dt / 16);
    m.y += m.vy * (dt / 16);
    m.alpha = Math.max(0, 1 - m.age / m.maxAge);
    if (m.age >= m.maxAge) _meteors.splice(mi, 1);
  }
}

function drawMeteors(ctx: CanvasRenderingContext2D, nightFactor: number): void {
  if (nightFactor < 0.4 || _meteors.length === 0) return;
  ctx.save();
  for (const m of _meteors) {
    ctx.globalAlpha = m.alpha * nightFactor;
    const tailLen = 20 + (1 - m.age / m.maxAge) * 12;
    const grad = ctx.createLinearGradient(
      m.x - m.vx * tailLen * 0.5,
      m.y - m.vy * tailLen * 0.5,
      m.x,
      m.y,
    );
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(255,255,240,0.95)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(m.x - m.vx * tailLen * 0.5, m.y - m.vy * tailLen * 0.5);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDawnDuskOverlay(
  ctx: CanvasRenderingContext2D,
  cycleT: number,
): void {
  let a = 0;
  if (cycleT < 0.1) a = Math.sin((cycleT / 0.1) * Math.PI) * 0.2;
  else if (cycleT >= 0.6 && cycleT <= 0.8)
    a = Math.sin(((cycleT - 0.6) / 0.2) * Math.PI) * 0.22;
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = cycleT < 0.1 ? "rgba(255,140,60,1)" : "rgba(255,100,50,1)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function drawSnowOverlay(ctx: CanvasRenderingContext2D, ts: number): void {
  if (shouldSkipDecorativeParticles()) return;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "rgba(150,170,255,1)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const count = spellMax(12);
  for (let i = 0; i < count; i++) {
    const s1 = (ts * 0.0003 + i * 137.5) % 1;
    const s2 = (ts * 0.0002 + i * 97.3 + 50) % 1;
    const s3 = (ts * 0.00015 + i * 53.1) % 1;
    const spx = (s1 * CANVAS_W + ts * 0.015) % CANVAS_W;
    const spy = (s2 * CANVAS_H + ts * (0.04 + s3 * 0.03)) % CANVAS_H;
    ctx.globalAlpha = 0.5 + s3 * 0.3;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(spx, spy, 1.5 + s3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Overlay helpers ──────────────────────────────────────────────────────────

function drawAttackFlash(
  ctx: CanvasRenderingContext2D,
  flashTimer: number,
): void {
  if (flashTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = (flashTimer / ATTACK_FLASH_DURATION_MS) * 0.22;
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function drawDamageFlash(
  ctx: CanvasRenderingContext2D,
  timer: number,
  duration: number,
): void {
  if (timer <= 0) return;
  ctx.save();
  ctx.globalAlpha = (timer / duration) * 0.3;
  ctx.fillStyle = "rgba(220,30,30,1)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

// ─── NPC sprites ──────────────────────────────────────────────────────────────

const NPC_COLORS: Record<
  string,
  { body: string; dark: string; highlight: string; skin: string; hat: string }
> = {
  guide: {
    body: "oklch(0.42 0.18 145)",
    dark: "oklch(0.26 0.14 145)",
    highlight: "oklch(0.58 0.20 145)",
    skin: "oklch(0.78 0.08 60)",
    hat: "oklch(0.32 0.12 145)",
  },
  shopkeeper: {
    body: "oklch(0.62 0.22 85)",
    dark: "oklch(0.40 0.18 82)",
    highlight: "oklch(0.78 0.20 88)",
    skin: "oklch(0.78 0.08 60)",
    hat: "oklch(0.48 0.18 80)",
  },
  villager: {
    body: "oklch(0.50 0.18 240)",
    dark: "oklch(0.32 0.14 240)",
    highlight: "oklch(0.65 0.20 235)",
    skin: "oklch(0.78 0.08 60)",
    hat: "oklch(0.38 0.12 240)",
  },
  guard: {
    body: "#6b7280",
    dark: "#4b5563",
    highlight: "#9ca3af",
    skin: "oklch(0.78 0.08 60)",
    hat: "#d1d5db",
  },
};

function drawNpc(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  spriteType: NpcDefinition["spriteType"],
  bobOffset: number,
  isHighlighted: boolean,
  isDialogueOpen = false,
  hasAvailableQuest = false,
  timestamp = 0,
): void {
  const col = NPC_COLORS[spriteType] ?? NPC_COLORS.guide;
  const by = py + bobOffset;

  if (isHighlighted) {
    try {
      const now = Date.now();
      const ringAlpha = 0.45 + 0.45 * Math.sin(now / 400);
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + 16, by + 16, TILE_SIZE * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } catch {
      /* non-fatal */
    }
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = col.highlight;
    ctx.beginPath();
    ctx.ellipse(px + 16, by + 28, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Shadow
  drawShadow(ctx, px, py, 0.35);

  // Legs
  ctx.fillStyle = col.dark;
  ctx.fillRect(px + 10, by + 22, 5, 8);
  ctx.fillRect(px + 17, by + 22, 5, 8);
  ctx.fillStyle = "oklch(0.20 0.04 55)";
  ctx.fillRect(px + 10, by + 28, 5, 2);
  ctx.fillRect(px + 17, by + 28, 5, 2);

  // Body
  ctx.fillStyle = col.dark;
  ctx.fillRect(px + 7, by + 11, 18, 13);
  ctx.fillStyle = col.body;
  ctx.fillRect(px + 8, by + 12, 16, 11);
  ctx.fillStyle = col.highlight;
  ctx.fillRect(px + 8, by + 12, 16, 2);
  ctx.fillStyle = col.dark;
  ctx.fillRect(px + 8, by + 21, 16, 2);

  // Arms
  ctx.fillStyle = col.body;
  ctx.fillRect(px + 3, by + 12, 5, 9);
  ctx.fillRect(px + 24, by + 12, 5, 9);
  ctx.fillStyle = col.skin;
  ctx.fillRect(px + 4, by + 19, 4, 4);
  ctx.fillRect(px + 24, by + 19, 4, 4);

  // Shopkeeper: add an apron detail
  if (spriteType === "shopkeeper") {
    ctx.fillStyle = "oklch(0.88 0.06 55)";
    ctx.fillRect(px + 11, by + 14, 10, 8);
    ctx.fillStyle = col.dark;
    ctx.fillRect(px + 11, by + 14, 10, 1);
  }

  // Head
  ctx.fillStyle = col.skin;
  ctx.fillRect(px + 10, by + 3, 12, 11);
  ctx.fillStyle = "oklch(0.86 0.06 60)";
  ctx.fillRect(px + 11, by + 3, 10, 2);
  // Eyes
  ctx.fillStyle = "oklch(0.08 0 0)";
  ctx.fillRect(px + 12, by + 7, 2, 2);
  ctx.fillRect(px + 18, by + 7, 2, 2);
  ctx.fillStyle = "oklch(0.95 0 0)";
  ctx.fillRect(px + 12, by + 7, 1, 1);
  ctx.fillRect(px + 18, by + 7, 1, 1);

  // Hat / headgear
  ctx.fillStyle = col.hat;
  ctx.fillRect(px + 9, by + 0, 14, 5);
  ctx.fillRect(px + 8, by + 1, 16, 3);
  ctx.fillStyle = col.highlight;
  ctx.fillRect(px + 8, by + 1, 16, 1);

  // Guide has a staff
  if (spriteType === "guide") {
    ctx.fillStyle = "oklch(0.52 0.07 55)";
    ctx.fillRect(px + 26, by - 8, 3, 36);
    ctx.fillStyle = col.highlight;
    ctx.fillRect(px + 24, by - 10, 7, 5);
    ctx.fillStyle = "oklch(0.88 0.16 145)";
    ctx.fillRect(px + 25, by - 9, 5, 3);
  }

  // ── Bouncing gold quest indicator ──
  if (hasAvailableQuest && !isHighlighted && !isDialogueOpen) {
    // 2px amplitude, ~1.5s period bounce
    const bounce = Math.sin((timestamp / 750) * Math.PI * 2) * 2;
    const questY = by - 26 + bounce;
    ctx.save();
    // Shadow dot for depth
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.ellipse(px + 16, questY + 14, 4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Gold badge
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(40,30,0,0.90)";
    ctx.beginPath();
    ctx.roundRect(px + 11, questY, 10, 12, 3);
    ctx.fill();
    ctx.strokeStyle = "#ffdd00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px + 11.5, questY + 0.5, 9, 11, 2.5);
    ctx.stroke();
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffdd00";
    ctx.shadowColor = "#ffaa00";
    ctx.shadowBlur = 5;
    ctx.fillText("!", px + 16, questY + 6);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.restore();
  }

  // Persistent speech bubble — only when no quest available
  if (!isHighlighted && !isDialogueOpen && !hasAvailableQuest) {
    ctx.save();
    const bx = px + 16;
    const iconY = by - 18;
    ctx.globalAlpha = 0.85;
    const bw = 14;
    const bh = 10;
    const br = 3;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(bx - 7 + br, iconY - 7);
    ctx.lineTo(bx - 7 + bw - br, iconY - 7);
    ctx.arcTo(bx - 7 + bw, iconY - 7, bx - 7 + bw, iconY - 7 + br, br);
    ctx.lineTo(bx - 7 + bw, iconY - 7 + bh - br);
    ctx.arcTo(
      bx - 7 + bw,
      iconY - 7 + bh,
      bx - 7 + bw - br,
      iconY - 7 + bh,
      br,
    );
    ctx.lineTo(bx - 7 + br, iconY - 7 + bh);
    ctx.arcTo(bx - 7, iconY - 7 + bh, bx - 7, iconY - 7 + bh - br, br);
    ctx.lineTo(bx - 7, iconY - 7 + br);
    ctx.arcTo(bx - 7, iconY - 7, bx - 7 + br, iconY - 7, br);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(80,80,80,0.5)";
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(bx - 2, iconY + 3);
    ctx.lineTo(bx - 5, iconY + 7);
    ctx.lineTo(bx + 2, iconY + 3);
    ctx.fill();
    ctx.fillStyle = "rgba(60,60,60,0.9)";
    ctx.fillRect(bx - 4, iconY - 3, 2, 2);
    ctx.fillRect(bx - 1, iconY - 3, 2, 2);
    ctx.fillRect(bx + 2, iconY - 3, 2, 2);
    ctx.restore();
  }

  // Interaction indicator (floating ! when highlighted)
  if (isHighlighted) {
    ctx.save();
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(px + 10, by - 22, 12, 14);
    ctx.strokeStyle = col.highlight;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 10.5, by - 21.5, 11, 13);
    ctx.fillStyle = col.highlight;
    ctx.fillText("!", px + 16, by - 15);
    ctx.restore();
  }

  // Name label
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

// ─── New monster sprites ──────────────────────────────────────────────────────

function drawSpriteWisp(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  timestamp: number,
): void {
  const pulse = Math.sin(timestamp * 0.006 + px * 0.1) * 0.3 + 0.7;
  const bob = animFrame % 2 === 0 ? -2 : 0;
  const baseColor = hitFlash ? "oklch(0.98 0.02 200)" : "oklch(0.88 0.22 200)";
  const glowColor = hitFlash ? "oklch(1 0 0 / 0.9)" : "oklch(0.75 0.25 200)";
  ctx.save();
  // Outer glow halo
  ctx.globalAlpha = 0.25 * pulse;
  ctx.fillStyle = "oklch(0.70 0.20 210)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 16 + bob, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wispy trail
  ctx.globalAlpha = 0.5 * pulse;
  ctx.fillStyle = "oklch(0.60 0.18 215)";
  ctx.fillRect(px + 14, py + 22 + bob, 4, 6);
  ctx.fillRect(px + 13, py + 26 + bob, 2, 3);
  ctx.fillRect(px + 17, py + 25 + bob, 2, 4);
  // Core body (small bright circle)
  ctx.globalAlpha = 0.85 * pulse;
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 14 + bob, 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bright center
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 13 + bob, 4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye-like spots
  if (!hitFlash) {
    ctx.fillStyle = "oklch(0.08 0 0)";
    ctx.fillRect(px + 13, py + 12 + bob, 2, 2);
    ctx.fillRect(px + 17, py + 12 + bob, 2, 2);
  }
  ctx.restore();
}

function drawCrystalGolem(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  const sq = animFrame % 2 === 0 ? 0 : 1;
  const baseColor = hitFlash ? "oklch(0.80 0.04 260)" : "oklch(0.35 0.08 240)";
  const crystalColor = hitFlash
    ? "oklch(0.90 0.06 270)"
    : "oklch(0.55 0.20 265)";
  const darkColor = hitFlash ? "oklch(0.70 0.03 250)" : "oklch(0.22 0.06 240)";
  ctx.save();
  // Shadow
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 30, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Legs / base
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 8, py + 22 + sq, 7, 10 - sq);
  ctx.fillRect(px + 17, py + 22 + sq, 7, 10 - sq);
  // Body
  ctx.fillStyle = baseColor;
  ctx.fillRect(px + 6, py + 8, 20, 16);
  // Angular facets
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 6, py + 8, 5, 16);
  ctx.fillRect(px + 21, py + 8, 5, 16);
  ctx.fillRect(px + 6, py + 20, 20, 4);
  // Crystal protrusions
  ctx.fillStyle = crystalColor;
  ctx.fillRect(px + 10, py + 2, 5, 8);
  ctx.fillRect(px + 18, py + 0, 4, 10);
  ctx.fillRect(px + 5, py + 10, 3, 7);
  ctx.fillRect(px + 24, py + 12, 3, 6);
  // Crystal highlights
  ctx.fillStyle = "oklch(0.80 0.18 265)";
  ctx.fillRect(px + 10, py + 2, 2, 4);
  ctx.fillRect(px + 18, py + 0, 2, 5);
  // Eyes (glowing)
  ctx.fillStyle = crystalColor;
  ctx.fillRect(px + 10, py + 12, 4, 4);
  ctx.fillRect(px + 18, py + 12, 4, 4);
  ctx.fillStyle = "oklch(0.92 0.10 260)";
  ctx.fillRect(px + 11, py + 13, 2, 2);
  ctx.fillRect(px + 19, py + 13, 2, 2);
  ctx.restore();
}

// ─── Shadow Wolf monster sprite ───────────────────────────────────────────────

function drawShadowWolf(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame % 2 === 0 ? 2 : -2;
  const bodyColor = hitFlash ? "#888890" : "#1a1a22";
  const darkColor = hitFlash ? "#606068" : "#0a0a10";
  const lightColor = hitFlash ? "#aaaaaa" : "#2e2e40";
  const flip = facing === "left";
  let dpx = px;
  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
    dpx = 0;
  }
  // Hind legs
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 8, py + 22 + lb, 5, 9);
  ctx.fillRect(dpx + 19, py + 22 - lb, 5, 9);
  ctx.fillStyle = "#050508";
  ctx.fillRect(dpx + 7, py + 29 + lb, 7, 3);
  ctx.fillRect(dpx + 18, py + 29 - lb, 7, 3);
  // Body (lean, dark)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 4, py + 11, 24, 14);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 5, py + 12, 22, 12);
  // Underbelly slightly lighter
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 9, py + 15, 14, 7);
  // Shadow mist wisps floating off body
  if (!hitFlash) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#2a2a4a";
    ctx.fillRect(dpx + 3, py + 8, 4, 6);
    ctx.fillRect(dpx + 25, py + 9, 4, 5);
    ctx.fillRect(dpx + 15, py + 6, 3, 4);
    ctx.globalAlpha = 1;
  }
  // Front legs
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 3, py + 14 + lb, 5, 9);
  ctx.fillRect(dpx + 24, py + 14 - lb, 5, 9);
  ctx.fillStyle = "#050508";
  ctx.fillRect(dpx + 2, py + 21 + lb, 6, 3);
  ctx.fillRect(dpx + 24, py + 21 - lb, 6, 3);
  // Tail (upward curl, dark)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 25, py + 8, 4, 8);
  ctx.fillRect(dpx + 27, py + 5, 3, 5);
  // Head
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 5, py + 2, 18, 13);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(dpx + 6, py + 3, 16, 11);
  // Snout
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 9, py + 8, 12, 5);
  ctx.fillStyle = lightColor;
  ctx.fillRect(dpx + 10, py + 8, 9, 2);
  // Nose
  ctx.fillStyle = "#030306";
  ctx.fillRect(dpx + 17, py + 7, 3, 3);
  // Ears (pointed)
  ctx.fillStyle = darkColor;
  ctx.fillRect(dpx + 7, py - 1, 4, 5);
  ctx.fillRect(dpx + 17, py - 1, 4, 5);
  ctx.fillStyle = "#1a1a30";
  ctx.fillRect(dpx + 8, py + 0, 2, 3);
  ctx.fillRect(dpx + 18, py + 0, 2, 3);
  // Eyes: glowing red
  ctx.fillStyle = hitFlash ? "#ff9999" : "#cc0000";
  ctx.fillRect(dpx + 9, py + 5, 3, 3);
  ctx.fillRect(dpx + 16, py + 5, 3, 3);
  ctx.fillStyle = hitFlash ? "#ffbbbb" : "#ff2200";
  ctx.fillRect(dpx + 10, py + 6, 1, 1);
  ctx.fillRect(dpx + 17, py + 6, 1, 1);
  if (flip) ctx.restore();
  ctx.restore();
}

// ─── Stone Golem monster sprite ───────────────────────────────────────────────

function drawStoneGolem(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const sq = animFrame % 2 === 0 ? 0 : 1;
  const baseColor = hitFlash ? "#c8c0b8" : "#7a7068";
  const darkColor = hitFlash ? "#b0a8a0" : "#4a4438";
  const lightColor = hitFlash ? "#e0d8d0" : "#9a9088";
  const crackColor = hitFlash ? "#d0c8c0" : "#3a3428";
  // Shadow
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 31, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Legs (wide stone blocks)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 5, py + 22 + sq, 10, 11 - sq);
  ctx.fillRect(px + 17, py + 22 + sq, 10, 11 - sq);
  // Foot edges
  ctx.fillStyle = "#1a1810";
  ctx.fillRect(px + 4, py + 31 + sq, 12, 3);
  ctx.fillRect(px + 16, py + 31 + sq, 12, 3);
  // Massive body
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 2, py + 6, 28, 18);
  ctx.fillStyle = baseColor;
  ctx.fillRect(px + 3, py + 7, 26, 16);
  // Rock texture cracks on body
  ctx.fillStyle = crackColor;
  ctx.fillRect(px + 8, py + 10, 1, 8);
  ctx.fillRect(px + 14, py + 8, 1, 12);
  ctx.fillRect(px + 20, py + 11, 1, 6);
  ctx.fillRect(px + 5, py + 18, 8, 1);
  ctx.fillRect(px + 18, py + 14, 7, 1);
  // Stone highlight (top face)
  ctx.fillStyle = lightColor;
  ctx.fillRect(px + 4, py + 7, 24, 3);
  ctx.fillRect(px + 4, py + 7, 3, 14);
  // Arms (massive stone blocks)
  ctx.fillStyle = baseColor;
  ctx.fillRect(px - 2, py + 7 + sq, 7, 16);
  ctx.fillRect(px + 27, py + 7 - sq, 7, 16);
  ctx.fillStyle = darkColor;
  ctx.fillRect(px - 3, py + 21 + sq, 9, 4);
  ctx.fillRect(px + 26, py + 21 - sq, 9, 4);
  // Fist knuckles
  ctx.fillStyle = "#1a1810";
  for (let k = 0; k < 3; k++) {
    ctx.fillRect(px - 2 + k * 3, py + 23 + sq, 2, 3);
    ctx.fillRect(px + 27 + k * 3, py + 23 - sq, 2, 3);
  }
  // Large head (granite block)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 5, py - 3, 22, 12);
  ctx.fillStyle = baseColor;
  ctx.fillRect(px + 6, py - 2, 20, 10);
  // Face cracks
  ctx.fillStyle = crackColor;
  ctx.fillRect(px + 10, py + 0, 1, 6);
  ctx.fillRect(px + 20, py + 1, 1, 5);
  // Brow ridge
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 5, py + 1, 22, 3);
  ctx.fillStyle = lightColor;
  ctx.fillRect(px + 6, py + 1, 20, 1);
  // Deep-set eye sockets
  ctx.fillStyle = "#1a1808";
  ctx.fillRect(px + 9, py + 2, 5, 4);
  ctx.fillRect(px + 18, py + 2, 5, 4);
  // Glowing yellow eyes (ancient power)
  ctx.fillStyle = hitFlash ? "#ffee88" : "#e8a800";
  ctx.fillRect(px + 10, py + 3, 3, 2);
  ctx.fillRect(px + 19, py + 3, 3, 2);
  ctx.fillStyle = hitFlash ? "#ffffff" : "#ffcc00";
  ctx.fillRect(px + 11, py + 3, 1, 1);
  ctx.fillRect(px + 20, py + 3, 1, 1);
  ctx.restore();
}

// ─── Cave Bat monster sprite ──────────────────────────────────────────────────

function drawCaveBat(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  timestamp: number,
): void {
  ctx.save();
  const bob = Math.sin(timestamp * 0.007 + px * 0.1) * 2;
  // Smaller than regular bat, very dark
  const bodyColor = hitFlash ? "#886060" : "#1a1218";
  const wingColor = hitFlash ? "#704040" : "#0e0a0e";
  const wingTip = hitFlash ? "#603030" : "#160e14";
  const bx = px + TILE_SIZE / 2;
  const by = py + TILE_SIZE / 2 - 2 + bob;
  const wingSpread = animFrame % 2 === 0 ? 1.0 : 0.45;
  // Left wing
  ctx.fillStyle = wingColor;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - 9 * wingSpread, by - 3 * wingSpread);
  ctx.lineTo(bx - 11 * wingSpread, by + 2);
  ctx.lineTo(bx - 6 * wingSpread, by + 4);
  ctx.lineTo(bx - 3, by + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = wingTip;
  ctx.beginPath();
  ctx.moveTo(bx - 9 * wingSpread, by - 3 * wingSpread);
  ctx.lineTo(bx - 11 * wingSpread, by + 2);
  ctx.lineTo(bx - 10 * wingSpread, by - 1 * wingSpread);
  ctx.closePath();
  ctx.fill();
  // Right wing
  ctx.fillStyle = wingColor;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + 9 * wingSpread, by - 3 * wingSpread);
  ctx.lineTo(bx + 11 * wingSpread, by + 2);
  ctx.lineTo(bx + 6 * wingSpread, by + 4);
  ctx.lineTo(bx + 3, by + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = wingTip;
  ctx.beginPath();
  ctx.moveTo(bx + 9 * wingSpread, by - 3 * wingSpread);
  ctx.lineTo(bx + 11 * wingSpread, by + 2);
  ctx.lineTo(bx + 10 * wingSpread, by - 1 * wingSpread);
  ctx.closePath();
  ctx.fill();
  // Body (tiny dark oval)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(bx, by + 1, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(bx, by - 2, 3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tiny ears
  ctx.fillStyle = bodyColor;
  ctx.fillRect(Math.round(bx) - 4, Math.round(by) - 6, 2, 3);
  ctx.fillRect(Math.round(bx) + 2, Math.round(by) - 6, 2, 3);
  // Red dot eyes
  if (!hitFlash) {
    ctx.fillStyle = "#cc0000";
    ctx.fillRect(Math.round(bx) - 2, Math.round(by) - 3, 2, 2);
    ctx.fillRect(Math.round(bx) + 1, Math.round(by) - 3, 2, 2);
    ctx.fillStyle = "#ff2200";
    ctx.fillRect(Math.round(bx) - 2, Math.round(by) - 3, 1, 1);
    ctx.fillRect(Math.round(bx) + 1, Math.round(by) - 3, 1, 1);
  }
  ctx.restore();
}

// ─── Cave Troll monster sprite ────────────────────────────────────────────────

function drawCaveTroll(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const sq = animFrame % 2 === 0 ? 0 : 1;
  // Dark brown-green massive hulk
  const bodyColor = hitFlash ? "#a09880" : "#3a3020";
  const darkColor = hitFlash ? "#888070" : "#1e1a10";
  const lightColor = hitFlash ? "#c0b898" : "#5a4e30";
  const skinColor = hitFlash ? "#b0a888" : "#4a3e28";
  // Very large ground shadow
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 31, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Legs
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 5, py + 22 + sq, 9, 11 - sq);
  ctx.fillRect(px + 18, py + 22 + sq, 9, 11 - sq);
  ctx.fillStyle = "#100e08";
  ctx.fillRect(px + 4, py + 31 + sq, 11, 3);
  ctx.fillRect(px + 17, py + 31 + sq, 11, 3);
  // Massive body
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 3, py + 6, 26, 18);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 4, py + 7, 24, 16);
  // Loincloth / cave leather
  ctx.fillStyle = "#2a1e10";
  ctx.fillRect(px + 6, py + 19, 20, 5);
  ctx.fillStyle = "#1a1208";
  ctx.fillRect(px + 8, py + 20, 16, 3);
  // Mossy patches on body
  if (!hitFlash) {
    ctx.fillStyle = "#2a3a18";
    ctx.fillRect(px + 8, py + 9, 4, 3);
    ctx.fillRect(px + 19, py + 12, 3, 4);
    ctx.fillRect(px + 5, py + 15, 3, 3);
  }
  // Massive arms
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px - 1, py + 7 + sq, 6, 16);
  ctx.fillRect(px + 27, py + 7 - sq, 6, 16);
  ctx.fillStyle = darkColor;
  ctx.fillRect(px - 2, py + 21 + sq, 8, 4);
  ctx.fillRect(px + 26, py + 21 - sq, 8, 4);
  // Clawed fists
  ctx.fillStyle = "#100e08";
  for (let k = 0; k < 3; k++) {
    ctx.fillRect(px - 2 + k * 3, py + 23 + sq, 2, 4);
    ctx.fillRect(px + 26 + k * 3, py + 23 - sq, 2, 4);
  }
  // Large head (hulking)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 4, py - 2, 24, 12);
  ctx.fillStyle = skinColor;
  ctx.fillRect(px + 5, py - 1, 22, 10);
  // Brow ridge
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 4, py + 2, 24, 4);
  ctx.fillStyle = lightColor;
  ctx.fillRect(px + 5, py + 2, 22, 2);
  // Deep-set eyes (glowing yellow)
  ctx.fillStyle = hitFlash ? "#ff9900" : "#1a1000";
  ctx.fillRect(px + 9, py + 2, 5, 4);
  ctx.fillRect(px + 18, py + 2, 5, 4);
  ctx.fillStyle = hitFlash ? "#ffcc44" : "#ccaa00";
  ctx.fillRect(px + 10, py + 3, 3, 2);
  ctx.fillRect(px + 19, py + 3, 3, 2);
  ctx.fillStyle = hitFlash ? "#ffff88" : "#ffcc00";
  ctx.fillRect(px + 11, py + 3, 1, 1);
  ctx.fillRect(px + 20, py + 3, 1, 1);
  // Nose (large, brutish)
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 13, py + 6, 6, 4);
  ctx.fillStyle = "#100a04";
  ctx.fillRect(px + 14, py + 8, 2, 2);
  ctx.fillRect(px + 17, py + 8, 2, 2);
  // Tusks
  ctx.fillStyle = "#d4b860";
  ctx.fillRect(px + 10, py + 8, 3, 5);
  ctx.fillRect(px + 19, py + 8, 3, 5);
  ctx.restore();
}

// ─── Cursed Swamp monster sprites ────────────────────────────────────────────

function drawBogWitch(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const bob = animFrame % 2 === 0 ? 0 : -1;
  const bodyColor = hitFlash ? "#a0c090" : "#304a20";
  const robeColor = hitFlash ? "#b0a888" : "#283818";
  const glowColor = hitFlash ? "#ccffcc" : "#88dd44";
  ctx.fillStyle = robeColor;
  ctx.fillRect(px + 8, py + 14 + bob, 16, 18);
  ctx.fillStyle = "#1a1a10";
  ctx.fillRect(px + 6, py + 4 + bob, 20, 3);
  ctx.fillRect(px + 10, py + bob, 12, 5);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 11, py + 7 + bob, 10, 8);
  ctx.fillStyle = glowColor;
  ctx.fillRect(px + 13, py + 9 + bob, 2, 2);
  ctx.fillRect(px + 17, py + 9 + bob, 2, 2);
  ctx.globalAlpha = 0.22;
  const glowG = ctx.createRadialGradient(
    px + 16,
    py + 16,
    2,
    px + 16,
    py + 16,
    14,
  );
  glowG.addColorStop(0, "#88ff44");
  glowG.addColorStop(1, "rgba(80,200,40,0)");
  ctx.fillStyle = glowG;
  ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.restore();
}

function drawSwampLurker(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  hidden: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = hidden ? 0.25 : 1.0;
  const sq = animFrame % 2 === 0 ? 0 : 1;
  const bodyColor = hitFlash ? "#888070" : "#2a2010";
  const eyeColor = hitFlash ? "#ddbb88" : "#cc6600";
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 4, py + 20 + sq, 24, 10);
  ctx.fillRect(px + 8, py + 14 + sq, 16, 8);
  ctx.fillStyle = eyeColor;
  ctx.fillRect(px + 10, py + 15 + sq, 3, 3);
  ctx.fillRect(px + 19, py + 15 + sq, 3, 3);
  ctx.fillStyle = "#1a1008";
  ctx.fillRect(px + 2, py + 24 + sq, 4, 3);
  ctx.fillRect(px + 26, py + 24 + sq, 4, 3);
  ctx.restore();
}

function drawMudGolem(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const sq = animFrame % 2 === 0 ? 0 : 1;
  const bodyColor = hitFlash ? "#c0b0a0" : "#6b5a3e";
  const darkColor = hitFlash ? "#a09080" : "#3d2e1a";
  const mudColor = hitFlash ? "#b0a080" : "#8b7050";
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 2, py + 8, 28, 24);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 4, py + 10, 24, 20);
  ctx.fillStyle = mudColor;
  ctx.fillRect(px + 6, py + 12, 5, 4);
  ctx.fillRect(px + 18, py + 16, 6, 4);
  ctx.fillRect(px + 10, py + 22, 8, 3);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 0, py + 14 + sq, 7, 8);
  ctx.fillRect(px + 25, py + 14 - sq, 7, 8);
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 0, py + 20 + sq, 7, 2);
  ctx.fillRect(px + 25, py + 20 - sq, 7, 2);
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 6, py + 1, 20, 10);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 7, py + 2, 18, 8);
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(px + 10, py + 4, 4, 4);
  ctx.fillRect(px + 18, py + 4, 4, 4);
  ctx.restore();
}

// ─── Floating Ruins monster sprites ──────────────────────────────────────────

function drawRuinSpecter(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  timestamp: number,
): void {
  ctx.save();
  const bob = Math.sin(timestamp * 0.003 + px * 0.1) * 3;
  const phaseShift = animFrame % 4;
  const alpha = hitFlash ? 0.9 : 0.65 + Math.sin(timestamp * 0.004) * 0.15;
  ctx.globalAlpha = alpha;
  const bodyColor = hitFlash ? "#eeddff" : "#c8aaee";
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 10, py + 8 + bob, 12, 16);
  for (let i = 0; i < 4; i++) {
    const wOff = Math.sin(timestamp * 0.005 + i * 0.8 + phaseShift) * 2;
    ctx.fillRect(px + 8 + i * 4, py + 22 + bob + wOff, 4, 5);
  }
  ctx.fillRect(px + 9, py + 2 + bob, 14, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(px + 12, py + 4 + bob, 3, 3);
  ctx.fillRect(px + 17, py + 4 + bob, 3, 3);
  ctx.fillStyle = "#9b59b6";
  ctx.fillRect(px + 13, py + 5 + bob, 1, 1);
  ctx.fillRect(px + 18, py + 5 + bob, 1, 1);
  ctx.globalAlpha = 0.18;
  const glowR = ctx.createRadialGradient(
    px + 16,
    py + 14 + bob,
    2,
    px + 16,
    py + 14 + bob,
    16,
  );
  glowR.addColorStop(0, "#9b59b6");
  glowR.addColorStop(1, "rgba(155,89,182,0)");
  ctx.fillStyle = glowR;
  ctx.fillRect(px, py + bob, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

function drawAncientGuardian(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const sq = animFrame % 2 === 0 ? 0 : 1;
  const stoneColor = hitFlash ? "#d0d0c8" : "#8a8878";
  const darkStone = hitFlash ? "#b0b0a8" : "#565648";
  const crackColor = hitFlash ? "#a0a098" : "#4a4840";
  ctx.fillStyle = darkStone;
  ctx.fillRect(px + 7, py + 23 + sq, 7, 9);
  ctx.fillRect(px + 18, py + 23 - sq, 7, 9);
  ctx.fillStyle = "#3a3830";
  ctx.fillRect(px + 6, py + 30 + sq, 9, 3);
  ctx.fillRect(px + 17, py + 30 - sq, 9, 3);
  ctx.fillStyle = darkStone;
  ctx.fillRect(px + 4, py + 8, 24, 17);
  ctx.fillStyle = stoneColor;
  ctx.fillRect(px + 5, py + 9, 22, 15);
  ctx.fillStyle = crackColor;
  ctx.fillRect(px + 12, py + 11, 1, 6);
  ctx.fillRect(px + 14, py + 13, 5, 1);
  ctx.fillStyle = darkStone;
  ctx.fillRect(px + 1, py + 9, 6, 8);
  ctx.fillRect(px + 25, py + 9, 6, 8);
  ctx.fillStyle = stoneColor;
  ctx.fillRect(px + 0, py + 15 + sq, 5, 6);
  ctx.fillRect(px + 27, py + 15 - sq, 5, 6);
  ctx.fillStyle = darkStone;
  ctx.fillRect(px + 6, py + 0, 20, 10);
  ctx.fillStyle = stoneColor;
  ctx.fillRect(px + 7, py + 1, 18, 8);
  ctx.fillStyle = "#201e18";
  ctx.fillRect(px + 10, py + 3, 4, 4);
  ctx.fillRect(px + 18, py + 3, 4, 4);
  ctx.fillStyle = "#aa8822";
  ctx.fillRect(px + 11, py + 4, 2, 2);
  ctx.fillRect(px + 19, py + 4, 2, 2);
  ctx.restore();
}

function drawSkySerpent(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  timestamp: number,
): void {
  ctx.save();
  const waveY = Math.sin(timestamp * 0.003 + px * 0.05) * 4;
  const bodyColor = hitFlash ? "#d0e8ff" : "#88aad8";
  const scaleColor = hitFlash ? "#e8f4ff" : "#aaccee";
  const darkColor = hitFlash ? "#a8c8e8" : "#4466a0";
  ctx.fillStyle = darkColor;
  ctx.fillRect(px + 1, py + 10 + waveY, TILE_SIZE - 2, 14);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(px + 2, py + 11 + waveY, TILE_SIZE - 4, 12);
  ctx.fillStyle = scaleColor;
  for (let i = 0; i < 4; i++)
    ctx.fillRect(px + 4 + i * 7, py + 12 + waveY, 5, 5);
  if (animFrame % 4 < 2) {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(px + 0, py + 9 + waveY, 10, 16);
    ctx.fillStyle = darkColor;
    ctx.fillRect(px + 0, py + 9 + waveY, 10, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px + 2, py + 12 + waveY, 3, 3);
    ctx.fillStyle = "#cc0000";
    ctx.fillRect(px + 3, py + 13 + waveY, 1, 1);
    ctx.fillStyle = "#cc2244";
    ctx.fillRect(px - 2, py + 16 + waveY, 3, 1);
    ctx.fillRect(px - 4, py + 15 + waveY, 2, 1);
    ctx.fillRect(px - 4, py + 17 + waveY, 2, 1);
  }
  ctx.restore();
}

// ─── Cursed Galleon monster sprites ──────────────────────────────────────────

function drawCursedSailor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: FacingDirection,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame % 2 === 0 ? 2 : -2;
  // Zombie pirate — brownish rotting coat with green tint
  const coatC = hitFlash ? "#90c890" : "#4a5a38";
  const skinC = hitFlash ? "#a0b880" : "#5a7240"; // undead green skin
  const darkC = hitFlash ? "#708860" : "#2a3820";
  const flip = facing === "left";
  const dpx = flip ? 0 : px;
  if (flip) {
    ctx.save();
    ctx.translate(px + TILE_SIZE, 0);
    ctx.scale(-1, 1);
  }
  // Legs
  ctx.fillStyle = darkC;
  ctx.fillRect(dpx + 10, py + 22 + lb, 5, 10);
  ctx.fillRect(dpx + 17, py + 22 - lb, 5, 10);
  // Body
  ctx.fillStyle = coatC;
  ctx.fillRect(dpx + 7, py + 11, 18, 13);
  ctx.fillStyle = darkC;
  ctx.fillRect(dpx + 7, py + 22, 18, 2);
  ctx.fillStyle = "rgba(0,80,0,0.25)";
  ctx.fillRect(dpx + 9, py + 13, 14, 8);
  // Arms
  ctx.fillStyle = coatC;
  ctx.fillRect(dpx + 3, py + 12, 5, 8);
  ctx.fillRect(dpx + 24, py + 12, 5, 8);
  // Hands — brownish grey
  ctx.fillStyle = skinC;
  ctx.fillRect(dpx + 2, py + 18, 6, 4);
  ctx.fillRect(dpx + 24, py + 18, 6, 4);
  // Head
  ctx.fillStyle = skinC;
  ctx.fillRect(dpx + 10, py + 3, 12, 10);
  // Bandana
  ctx.fillStyle = "#883322";
  ctx.fillRect(dpx + 9, py + 3, 14, 4);
  // Glowing green eyes
  ctx.fillStyle = hitFlash ? "#ffffff" : "#00ff44";
  ctx.fillRect(dpx + 12, py + 6, 3, 3);
  ctx.fillRect(dpx + 17, py + 6, 3, 3);
  // Eye glow
  if (!hitFlash) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#00ff44";
    ctx.beginPath();
    ctx.arc(dpx + 13, py + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dpx + 18, py + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (flip) ctx.restore();
  ctx.restore();
}

function drawSkeletonGunner(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
): void {
  ctx.save();
  const lb = animFrame % 2 === 0 ? 1 : -1;
  const boneC = hitFlash ? "#f0f0e8" : "#d4cec0";
  const darkBone = hitFlash ? "#d8d8d0" : "#9a9488";
  const jointC = hitFlash ? "#c8c8c0" : "#8a8478";
  // Spindly skeleton legs
  ctx.strokeStyle = darkBone;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 14, py + 22);
  ctx.lineTo(px + 11, py + 32 + lb);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 18, py + 22);
  ctx.lineTo(px + 21, py + 32 - lb);
  ctx.stroke();
  // Rib cage body
  ctx.fillStyle = boneC;
  ctx.fillRect(px + 9, py + 10, 14, 14);
  ctx.fillStyle = darkBone;
  for (let r = 0; r < 3; r++) {
    ctx.fillRect(px + 9, py + 12 + r * 4, 14, 1);
  }
  ctx.fillRect(px + 16, py + 10, 1, 14); // spine
  // Arms holding pistol
  ctx.strokeStyle = boneC;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 9, py + 12);
  ctx.lineTo(px + 4, py + 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 23, py + 12);
  ctx.lineTo(px + 26, py + 14);
  ctx.stroke();
  // Pistol
  ctx.fillStyle = "#5a5050";
  ctx.fillRect(px + 24, py + 10, 8, 5);
  ctx.fillRect(px + 24, py + 14, 3, 5); // handle
  ctx.fillStyle = "#888";
  ctx.fillRect(px + 30, py + 11, 4, 2); // barrel
  // Skull head
  ctx.fillStyle = boneC;
  ctx.beginPath();
  ctx.arc(px + 16, py + 7, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(px + 11, py + 10, 10, 5);
  // Eye sockets (dark hollows)
  ctx.fillStyle = hitFlash ? "#666" : "#111";
  ctx.beginPath();
  ctx.arc(px + 13, py + 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + 19, py + 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Jaw/teeth
  ctx.fillStyle = jointC;
  ctx.fillRect(px + 13, py + 13, 6, 3);
  ctx.fillStyle = boneC;
  for (let t = 0; t < 3; t++) {
    ctx.fillRect(px + 13 + t * 2, py + 13, 1, 3);
  }
  // Old hat
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(px + 8, py + 0, 16, 3);
  ctx.restore();
}

function drawCursedNavigator(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  animFrame: number,
  hitFlash: boolean,
  timestamp: number,
): void {
  ctx.save();
  // Ghostly translucent figure — navigator ghost
  const phaseFactor = animFrame % 4;
  const baseAlpha = hitFlash
    ? 0.9
    : 0.65 + Math.sin(timestamp * 0.004 + phaseFactor) * 0.2;
  ctx.globalAlpha = baseAlpha;
  const ghostC = hitFlash ? "#ddeeff" : "#8aaabf";
  const glowC = hitFlash ? "#ffffff" : "#aaccff";

  // Body wisp — elongated, semi-translucent
  ctx.fillStyle = ghostC;
  ctx.fillRect(px + 9, py + 10, 14, 18);
  // Tattered robe bottom — wavy
  for (let i = 0; i < 4; i++) {
    const wO = Math.sin(timestamp * 0.006 + i * 0.8) * 2;
    ctx.fillRect(px + 9 + i * 4, py + 26 + wO, 3, 6);
  }
  // Coat detail
  ctx.fillStyle = hitFlash ? "#c0d8f0" : "#4a6a80";
  ctx.fillRect(px + 12, py + 11, 8, 14);
  // Navigator hat/tricorn
  ctx.fillStyle = hitFlash ? "#c8d8e8" : "#2a3a4a";
  ctx.fillRect(px + 7, py + 3, 18, 4);
  ctx.fillRect(px + 10, py + 0, 12, 4);
  // Face area
  ctx.fillStyle = ghostC;
  ctx.fillRect(px + 10, py + 5, 12, 9);
  // Glowing blue eyes
  ctx.globalAlpha = baseAlpha;
  ctx.fillStyle = hitFlash ? "#ffffff" : "#4499ff";
  ctx.beginPath();
  ctx.arc(px + 13, py + 8, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + 19, py + 8, 2, 0, Math.PI * 2);
  ctx.fill();
  // Blue glow aura
  if (!hitFlash) {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#4488ff";
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glowing chart/compass detail
  ctx.globalAlpha = baseAlpha * 0.7;
  ctx.fillStyle = glowC;
  ctx.fillRect(px + 20, py + 16, 6, 7);
  ctx.strokeStyle = "#4488ff";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 20, py + 16, 6, 7);
  ctx.restore();
}

function drawLootDrop(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  drop: LootDrop,
  timestamp: number,
  isNear: boolean,
): void {
  const isCoin = drop.item.itemType === "coin";
  const isTreasureChest = drop.id.startsWith("chest_");
  // Bob animation: ±3px vertical sine wave at ~1Hz
  const bob = Math.sin(timestamp * 0.0038 + drop.x * 0.7 + drop.y * 0.5) * 3;
  // Pulse brightness oscillation for attention-catching
  const pulse = Math.sin(timestamp * 0.005 + drop.x) * 0.4 + 0.6;

  // Fade-out in last 10 seconds of 60s lifetime
  const age = Date.now() - drop.spawnTime;
  const lifetimeAlpha =
    age > 50000 ? Math.max(0, 1 - (age - 50000) / 10000) : 1.0;

  ctx.save();

  // ── Treasure chest from world event: gold pulsing sprite ──
  if (isTreasureChest) {
    ctx.globalAlpha = lifetimeAlpha;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2 + bob;
    const chestPulse = (Math.sin(timestamp / 500) + 1) / 2; // 0..1
    const chestScale = 0.85 + chestPulse * 0.18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(chestScale, chestScale);
    ctx.translate(-cx, -cy);
    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
    glow.addColorStop(0, `rgba(255,215,0,${0.7 * chestPulse})`);
    glow.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    // Chest body (brown base)
    ctx.fillStyle = "#8B5C2A";
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    const bw = 20;
    const bh = 14;
    const bx2 = cx - bw / 2;
    const by2 = cy - bh / 2 + 3;
    ctx.fillRect(bx2, by2, bw, bh);
    ctx.strokeRect(bx2, by2, bw, bh);
    // Chest lid (slightly brighter brown)
    ctx.fillStyle = "#A0722A";
    ctx.fillRect(bx2, by2 - 6, bw, 7);
    ctx.strokeRect(bx2, by2 - 6, bw, 7);
    // Gold clasp
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(cx, by2 + 1, 3, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle stars
    for (let si = 0; si < 3; si++) {
      const sa = timestamp / 400 + (si * Math.PI * 2) / 3;
      const sr = 14 + chestPulse * 4;
      const sx = cx + Math.cos(sa) * sr;
      const sy = cy + Math.sin(sa) * sr;
      ctx.fillStyle = `rgba(255,255,180,${0.5 + chestPulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Label
    if (isNear) {
      ctx.save();
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFD700";
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 5;
      ctx.fillText("✨ CHEST", cx, py + 2);
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  ctx.globalAlpha = lifetimeAlpha;

  const cx = px + TILE_SIZE / 2;
  const cy = py + 20 + bob;

  // ── Pulsing interaction ring when player is within pickup range ──
  if (isNear) {
    const ringPulse = Math.sin(timestamp * 0.008) * 0.35 + 0.65;
    const ringR = 14 + Math.sin(timestamp * 0.006) * 2;
    ctx.globalAlpha = 0.55 * ringPulse;
    ctx.strokeStyle = isCoin ? "#FFD700" : "#88CCFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, py + 26, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Inner ring
    ctx.globalAlpha = 0.3 * ringPulse;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, py + 26, ringR - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (isCoin) {
    // ── Coin: golden glowing orb with sparkle details ──
    const orbR = 7;
    // Outer radial glow
    const glowR = orbR + 8;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, `rgba(255,215,0,${0.6 * pulse})`);
    glow.addColorStop(0.4, `rgba(255,180,0,${0.35 * pulse})`);
    glow.addColorStop(1, "rgba(255,160,0,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Shadow on ground
    ctx.globalAlpha = 0.35 + (3 - Math.abs(bob)) * 0.04;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.ellipse(cx, py + 28, orbR * 0.85, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gold orb body
    ctx.globalAlpha = 0.95;
    const coinGrad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, orbR);
    coinGrad.addColorStop(0, "#FFF0A0");
    coinGrad.addColorStop(0.35, "#FFD700");
    coinGrad.addColorStop(0.75, "#D4A017");
    coinGrad.addColorStop(1, "#9A7000");
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(255,255,200,0.80)";
    ctx.beginPath();
    ctx.ellipse(cx - 2.5, cy - 2.5, 3, 2, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle star details (4-point star)
    const sp = (Math.sin(timestamp * 0.006) * 0.4 + 0.6) * 0.9;
    ctx.globalAlpha = sp;
    ctx.strokeStyle = "#FFFAC0";
    ctx.lineWidth = 1;
    const starX = cx + 6;
    const starY = cy - 8;
    const sR = 2.5;
    ctx.beginPath();
    ctx.moveTo(starX, starY - sR);
    ctx.lineTo(starX, starY + sR);
    ctx.moveTo(starX - sR, starY);
    ctx.lineTo(starX + sR, starY);
    ctx.stroke();
    // Small dot sparkle
    ctx.globalAlpha = sp * 0.7;
    ctx.fillStyle = "#FFFAC0";
    ctx.fillRect(cx - 8, cy - 6, 2, 2);

    // Amount badge
    if (drop.item.amount > 1) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(cx + 3, cy - 12, 16, 10);
      ctx.font = "bold 7px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFD700";
      ctx.fillText(`x${drop.item.amount}`, cx + 11, cy - 7);
    }
  } else {
    // ── Equipment: gem diamond shape, color-coded by rarity ──
    // Rarity color mapping: common=grey, uncommon=green, rare=blue, epic=purple
    const RARITY_COLORS: Record<string, [string, string, string]> = {
      sword_basic: ["#90E0FF", "#3399CC", "#C0F0FF"], // uncommon blue
      staff_basic: ["#C080FF", "#7733BB", "#E0C0FF"], // rare purple
      leather_armor: ["#aaaaaa", "#666666", "#cccccc"], // common grey
      cloth_robe: ["#E080FF", "#9020BB", "#F8C0FF"], // rare purple
      iron_shield: ["#90E0FF", "#3399CC", "#C0F0FF"], // uncommon blue
      leather_scrap: ["#aaaaaa", "#666666", "#cccccc"], // common grey
      bear_pelt: ["#44aa44", "#226622", "#88dd88"], // uncommon green
      stone_fragment: ["#aaaaaa", "#666666", "#cccccc"], // common grey
      rare_gem: ["#aa44ff", "#6622aa", "#dd88ff"], // epic purple
      troll_hide: ["#44aa44", "#226622", "#88dd88"], // uncommon green
      rare_weapon: ["#aa44ff", "#6622aa", "#dd88ff"], // epic purple
      health_potion: ["#ff6666", "#aa2222", "#ffaaaa"], // heal red
      mana_potion: ["#6699ff", "#2244aa", "#aaccff"], // mana blue
      poison_vial: ["#44aa44", "#226622", "#88dd88"], // uncommon green
      ancient_rune_shard: ["#4488ff", "#2244aa", "#88bbff"], // rare blue
    };
    const [mid, dark, hi] = RARITY_COLORS[drop.item.itemType] ?? [
      "#aaaaaa",
      "#666666",
      "#cccccc",
    ];
    const gemSize = 6;
    const glowR = gemSize + 10;
    const alphaHex = Math.round(180 * pulse)
      .toString(16)
      .padStart(2, "0");

    // Outer glow (20% opacity at max)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, `${mid}${alphaHex}`);
    glow.addColorStop(1, `${mid}00`);
    ctx.globalAlpha = lifetimeAlpha;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Shadow
    ctx.globalAlpha = (0.3 + (3 - Math.abs(bob)) * 0.03) * lifetimeAlpha;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.ellipse(cx, py + 29, gemSize * 0.8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gem diamond shape (rotated 45° square)
    ctx.globalAlpha = 0.92 * lifetimeAlpha;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    const orbGrad = ctx.createLinearGradient(
      -gemSize,
      -gemSize,
      gemSize,
      gemSize,
    );
    orbGrad.addColorStop(0, hi);
    orbGrad.addColorStop(0.5, mid);
    orbGrad.addColorStop(1, dark);
    ctx.fillStyle = orbGrad;
    ctx.fillRect(-gemSize, -gemSize, gemSize * 2, gemSize * 2);
    // Facet highlight
    ctx.globalAlpha = 0.4 * lifetimeAlpha;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(-gemSize, -gemSize, gemSize, gemSize * 0.6);
    ctx.restore();
  }

  // ── Prominent pill "▲ PICK UP" button when in range ──
  if (isNear) {
    // Gentle up/down bob at ~1Hz for the label
    const promptBob = Math.sin(timestamp * 0.0063) * 2;
    const labelY = cy - 22 + promptBob;
    const labelText = "\u25b2 PICK UP";
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textW = ctx.measureText(labelText).width;
    const pillW = textW + 16;
    const pillH = 16;
    const pillX = cx - pillW / 2;
    const pillY = labelY - pillH / 2;
    const pillR = pillH / 2;

    // White shadow/glow behind pill for visibility
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    const pr = pillR + 2;
    ctx.moveTo(pillX - 2 + pr, pillY - 2);
    ctx.arcTo(
      pillX - 2 + pillW + 4,
      pillY - 2,
      pillX - 2 + pillW + 4,
      pillY - 2 + pillH + 4,
      pr,
    );
    ctx.arcTo(
      pillX - 2 + pillW + 4,
      pillY - 2 + pillH + 4,
      pillX - 2,
      pillY - 2 + pillH + 4,
      pr,
    );
    ctx.arcTo(pillX - 2, pillY - 2 + pillH + 4, pillX - 2, pillY - 2, pr);
    ctx.arcTo(pillX - 2, pillY - 2, pillX - 2 + pillW + 4, pillY - 2, pr);
    ctx.closePath();
    ctx.fill();

    // Pill background (bright gold/yellow)
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.moveTo(pillX + pillR, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, pillR);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, pillR);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, pillR);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, pillR);
    ctx.closePath();
    ctx.fill();

    // Pill top highlight
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    const hr = pillR - 2;
    const hx = pillX + 2;
    const hy = pillY + 2;
    const hw = pillW - 4;
    const hh = pillH / 2 - 2;
    ctx.moveTo(hx + hr, hy);
    ctx.arcTo(hx + hw, hy, hx + hw, hy + hh, hr);
    ctx.arcTo(hx + hw, hy + hh, hx, hy + hh, hr);
    ctx.arcTo(hx, hy + hh, hx, hy, hr);
    ctx.arcTo(hx, hy, hx + hw, hy, hr);
    ctx.closePath();
    ctx.fill();

    // Text (black on gold)
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(labelText, cx, labelY);
  }

  ctx.restore();
}

// ─── Zone fade color helper ───────────────────────────────────────────────────

function getZoneFadeColor(zoneId: ZoneId): string {
  switch (zoneId) {
    case "meadow_hub":
      return "#2a5a1e";
    case "wilderness":
      return "#336622";
    case "forest_depths":
      return "#1a3322";
    case "wolf_forest":
      return "#1c3a10";
    case "tiger_jungle":
      return "#2a5418";
    case "bear_forest":
      return "#1a3310";
    case "ancient_ruins":
      return "#6b5a32";
    case "crystal_ruins":
      return "#440066";
    case "cyclops_lair":
      return "#6b1a00";
    case "goblin_warrens":
      return "#2a3010";
    case "bat_cave":
      return "#1a0a00";
    case "deep_cave":
      return "#111114";
    case "hub_basement":
      return "#2a1800";
    case "wilderness_dungeon":
      return "#2a1800";
    case "forest_dungeon":
      return "#1a2a00";
    case "dark_forest":
      return "#020804";
    case "ancient_ruins_deep":
      return "#0e0c10";
    case "cave_interior":
      return "#080604";
    default:
      return "#000000";
  }
}

// ─── Transition overlay ───────────────────────────────────────────────────────

function drawTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  _toZone: ZoneId,
  fadeColor = "#000000",
  timestamp = 0,
): void {
  if (alpha <= 0) return;
  ctx.save();

  // During peak opacity (alpha ≥ 0.95): fill with zone color so black is never shown
  if (alpha >= 0.95) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = fadeColor;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Animated loading indicator (spinning square)
    const pulse = Math.sin(timestamp * 0.005) * 0.5 + 0.5;
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    const angle = (timestamp * 0.003) % (Math.PI * 2);
    const sz = 8;
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    ctx.restore();
    ctx.restore();
    return;
  }

  ctx.globalAlpha = alpha;
  ctx.fillStyle = fadeColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

// ─── Zone label ───────────────────────────────────────────────────────────────

function drawZoneLabel(
  ctx: CanvasRenderingContext2D,
  zoneName: string,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const fadeAlpha = alpha > 0.5 ? (alpha - 0.5) / 0.5 : 0;
  if (fadeAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.font = "bold 18px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(zoneName).width + 32;
  const th = 32;
  const lx = CANVAS_W / 2 - tw / 2;
  const ly = CANVAS_H / 2 - th / 2;
  ctx.fillStyle = "rgba(0,0,0,0.92)";
  ctx.fillRect(lx, ly, tw, th);
  ctx.strokeStyle = "oklch(0.55 0.20 292)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(lx + 0.75, ly + 0.75, tw - 1.5, th - 1.5);
  ctx.fillStyle = "oklch(0.88 0 0)";
  ctx.fillText(zoneName, CANVAS_W / 2, CANVAS_H / 2);
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GameCanvasProps {
  username: string;
  selectedClass: CharacterClass;
  otherPlayers: OtherPlayer[];
  gameStateRef: React.MutableRefObject<GameState | null>;
  onPositionUpdate: (x: number, y: number) => void;
  onOpenEmotePanel?: () => void;
  onOpenChat?: () => void;
  chatOpen?: boolean;
  chatMessages?: ChatMessage[];
  /** Called when player HP/MP changes */
  onHpChanged?: (hp: number, mp: number) => void;
  /** Called when player XP/level changes */
  onXpChanged?: (xp: number, level: number) => void;
  /** Called when a monster is killed */
  onMonsterKilled?: () => void;
  /** Called when player dies */
  onPlayerDied?: () => void;
  /** Called when player respawns */
  onPlayerRespawned?: () => void;
  /** Called when the player clicks/taps on a loot drop */
  onCollectLoot?: (lootId: string) => void;
  /** Auto-save callback */
  onAutoSave?: () => void;
  /** PVP zone warning callback */
  onPvpWarning?: (zoneId: string) => void;
  /** Achievement unlocked callback */
  onAchievementUnlocked?: (id: string, title: string) => void;
  /**
   * Active session ID — entities whose sessionId does not match this value
   * are stale (from a previous login) and must be discarded.
   * Empty string means no active session (logged out).
   */
  currentSessionId?: string;
  /** Called when the Crafting Table NPC is tapped */
  onOpenCrafting?: () => void;
  /** Called when the Guild Master NPC is tapped */
  onOpenGuild?: () => void;
  /** Whether the current player is a guest (used to block crafting) */
  isGuest?: boolean;
  /** Called to broadcast a world event announcement as a chat message */
  onEventAnnounce?: (text: string) => void;
  /** Local player's guild name — shown as cyan tag below level badge */
  playerGuildName?: string;
}

const PLAYER_DMG_FLASH_DURATION = 150;
const MONSTER_HIT_FLASH_DURATION = 100;
/** Duration of respawn fade-in in ms */
const RESPAWN_FADE_IN_DURATION = 1000;
/** Duration of respawn shimmer ring expansion in ms */
const RESPAWN_SHIMMER_DURATION = 800;
/** Duration of respawn text display in ms */
const RESPAWN_TEXT_DURATION = 2500;

const TOWN_DECORATIONS: Array<[number, number, "barrel" | "sign"]> = [
  [3, 22, "barrel"],
  [12, 29, "barrel"],
  [5, 25, "sign"],
  [11, 22, "sign"],
];

// Meadow hub decorative elements: [tileX, tileY, type, extra?]
// All zero-collision — canvas-only visual overlays
type MeadowDecoType =
  | "fountain"
  | "flowerbed"
  | "lamp"
  | "noticeboard"
  | "arch";
const MEADOW_HUB_DECOS: Array<[number, number, MeadowDecoType, number?]> = [
  // Fountain in center of hub
  [15, 15, "fountain"],
  // Flower beds along path edges
  [8, 18, "flowerbed", 1],
  [22, 18, "flowerbed", 2],
  [8, 22, "flowerbed", 3],
  [22, 22, "flowerbed", 4],
  [14, 28, "flowerbed", 5],
  [18, 28, "flowerbed", 6],
  // Lamp posts every ~4 tiles along main street
  [12, 14, "lamp"],
  [20, 14, "lamp"],
  [12, 22, "lamp"],
  [20, 22, "lamp"],
  [16, 10, "lamp"],
  // Notice board near spawn
  [17, 25, "noticeboard"],
  // Welcome arch near spawn area
  [14, 27, "arch"],
];

// ─── Interactable object rendering ───────────────────────────────────────────

// ─── Checkpoint Stone rendering ─────────────────────────────────────────────────────────

function drawCheckpointStone(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  activated: boolean,
  playerNear: boolean,
  timestamp: number,
): void {
  ctx.save();
  try {
    const baseY = sy + TILE_SIZE - 8;
    // Stone base
    ctx.fillStyle = "#555555";
    ctx.fillRect(sx + 10, baseY, 12, 8);
    ctx.fillStyle = "#444444";
    ctx.fillRect(sx + 11, baseY + 1, 10, 6);

    // Crystal on top
    const crystalColor = activated ? "#ffdd00" : "#aaaaff";
    const glowColor = activated
      ? "rgba(255,210,0,0.55)"
      : "rgba(140,140,255,0.45)";
    const pulse = 0.5 + 0.5 * Math.sin((timestamp / 1000) * Math.PI * 2 * 0.6);
    const cx = sx + 16;
    const cy = baseY - 4;

    // Glow halo
    const gRadius = activated ? 10 + pulse * 4 : 7 + pulse * 3;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, gRadius);
    grd.addColorStop(0, glowColor);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, gRadius, 0, Math.PI * 2);
    ctx.fill();

    // Diamond crystal shape
    ctx.fillStyle = crystalColor;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx - 4, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = activated ? "#fff8aa" : "#ccccff";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Interaction ring when player is nearby
    if (playerNear) {
      const ringPulse = 0.5 + 0.5 * Math.sin((timestamp / 700) * Math.PI * 2);
      ctx.strokeStyle = activated
        ? `rgba(255,200,0,${0.5 + ringPulse * 0.4})`
        : `rgba(180,180,255,${0.4 + ringPulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 14 + ringPulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

function drawInteractable(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  type: string,
  state: string,
  now: number,
): void {
  try {
    ctx.save();
    if (type === "barrel") {
      if (state === "smashed") {
        // Draw broken barrel pieces
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#8B5A2B";
        ctx.lineWidth = 1.5;
        // Two curved plank pieces
        ctx.beginPath();
        ctx.arc(sx + 10, sy + 18, 8, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx + 20, sy + 16, 6, Math.PI, 0);
        ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#6B3F1E";
        ctx.fillRect(sx + 8, sy + 22, 5, 3);
        ctx.fillRect(sx + 16, sy + 20, 4, 3);
      } else {
        // Intact barrel
        ctx.fillStyle = "#8B5A2B";
        ctx.fillRect(sx + 8, sy + 8, 16, 20);
        // Top/bottom ellipses
        ctx.fillStyle = "#A0682E";
        ctx.beginPath();
        ctx.ellipse(sx + 16, sy + 8, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + 16, sy + 28, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Barrel bands
        ctx.strokeStyle = "#5A3015";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + 8, sy + 14);
        ctx.lineTo(sx + 24, sy + 14);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + 8, sy + 22);
        ctx.lineTo(sx + 24, sy + 22);
        ctx.stroke();
        // Interaction hint pulse
        const pulse = 0.5 + 0.5 * Math.sin(now / 400);
        ctx.globalAlpha = pulse * 0.6;
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 6, sy + 6, 20, 24);
      }
    } else if (type === "mushroom") {
      if (state === "intact") {
        // Glowing mushroom
        const pulse = 0.7 + 0.3 * Math.sin(now / 600);
        // Glow effect
        ctx.globalAlpha = pulse * 0.3;
        ctx.fillStyle = "#22FF44";
        ctx.beginPath();
        ctx.arc(sx + 16, sy + 18, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Stem
        ctx.fillStyle = "#DDDDAA";
        ctx.fillRect(sx + 13, sy + 18, 6, 10);
        // Cap
        ctx.fillStyle = "#33CC55";
        ctx.beginPath();
        ctx.ellipse(sx + 16, sy + 17, 11, 7, 0, Math.PI, 0);
        ctx.fill();
        // Cap shine
        ctx.fillStyle = "#88FF99";
        ctx.beginPath();
        ctx.ellipse(sx + 13, sy + 14, 4, 2, -0.3, Math.PI, 0);
        ctx.fill();
        // Spots
        ctx.fillStyle = "#FFFFFF";
        ctx.globalAlpha = pulse * 0.8;
        ctx.beginPath();
        ctx.arc(sx + 14, sy + 15, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx + 19, sy + 16, 1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Collected (faint outline)
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = "#22AA33";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(sx + 16, sy + 17, 10, 6, 0, Math.PI, 0);
        ctx.stroke();
      }
    } else if (type === "urn") {
      if (state === "intact") {
        // Ancient urn
        ctx.fillStyle = "#8A7560";
        // Body
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy + 26);
        ctx.lineTo(sx + 8, sy + 18);
        ctx.quadraticCurveTo(sx + 8, sy + 10, sx + 16, sy + 9);
        ctx.quadraticCurveTo(sx + 24, sy + 10, sx + 24, sy + 18);
        ctx.lineTo(sx + 22, sy + 26);
        ctx.closePath();
        ctx.fill();
        // Top rim
        ctx.fillStyle = "#6B5A48";
        ctx.fillRect(sx + 9, sy + 7, 14, 4);
        // Opening
        ctx.fillStyle = "#3A2E26";
        ctx.beginPath();
        ctx.ellipse(sx + 16, sy + 7, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Decoration line
        ctx.strokeStyle = "#AA9070";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 9, sy + 18);
        ctx.lineTo(sx + 23, sy + 18);
        ctx.stroke();
        // Hint pulse
        const pulse2 = 0.5 + 0.5 * Math.sin(now / 500);
        ctx.globalAlpha = pulse2 * 0.5;
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(sx + 6, sy + 5, 20, 24);
      } else {
        // Examined
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#6B5A48";
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy + 26);
        ctx.lineTo(sx + 8, sy + 18);
        ctx.quadraticCurveTo(sx + 8, sy + 10, sx + 16, sy + 9);
        ctx.quadraticCurveTo(sx + 24, sy + 10, sx + 24, sy + 18);
        ctx.lineTo(sx + 22, sy + 26);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

// ─── Hazard rendering ─────────────────────────────────────────────────────────

function drawHazard(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  type: string,
  rockPhase: string | undefined,
  now: number,
  rockStartTime: number | undefined,
): void {
  try {
    ctx.save();
    if (type === "poison_pool") {
      const pulse = 0.5 + 0.5 * Math.sin(now / 400);
      // Green glowing pool tile
      ctx.globalAlpha = 0.45 + pulse * 0.2;
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      // Border glow
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = 8;
      ctx.strokeRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.shadowBlur = 0;
      // Bubbles
      const bubbleT = (now / 600) % 1;
      ctx.fillStyle = "#86efac";
      ctx.globalAlpha = 0.8 * (1 - bubbleT);
      ctx.beginPath();
      ctx.arc(sx + 10, sy + 20 - bubbleT * 12, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx + 22, sy + 24 - bubbleT * 10, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "falling_rock") {
      const elapsed = now - (rockStartTime ?? now);
      if (rockPhase === "shadow") {
        // Dark oval shadow
        const shadowPulse = Math.min(1, elapsed / 400);
        ctx.globalAlpha = shadowPulse * 0.6;
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.ellipse(sx + 16, sy + 24, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Warning ring
        ctx.globalAlpha = shadowPulse * 0.8;
        ctx.strokeStyle = "#FF4400";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx + 16, sy + 16, 12, 0, Math.PI * 2);
        ctx.stroke();
      } else if (rockPhase === "falling") {
        const fallT = Math.min(1, (elapsed - 500) / 300);
        const rockY = sy - 40 + fallT * 48;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#6B6B5A";
        ctx.beginPath();
        ctx.arc(sx + 16, rockY + 16, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a3a2a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Shadow below rock
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.ellipse(
          sx + 16,
          sy + 24,
          10 * (1 - fallT * 0.3),
          5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  } catch {
    /* non-fatal */
  }
}

export function GameCanvas({
  username,
  selectedClass,
  otherPlayers,
  gameStateRef,
  onPositionUpdate,
  onOpenEmotePanel,
  onOpenChat,
  chatOpen = false,
  chatMessages,
  onHpChanged,
  onXpChanged,
  onMonsterKilled,
  onPlayerDied,
  onPlayerRespawned,
  onAutoSave,
  onPvpWarning,
  onAchievementUnlocked,
  currentSessionId = "",
  onOpenCrafting,
  onOpenGuild,
  isGuest = false,
  onEventAnnounce,
  playerGuildName,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadPlayer, savePosition } = useBackendSync();
  const [loaded, setLoaded] = useState(false);
  const saveThrottleRef = useRef<number>(0);
  const loadedFromBackendRef = useRef(false);
  const cameraXRef = useRef<number>(-1);
  const cameraYRef = useRef<number>(-1);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const playerDmgFlashRef = useRef<number>(0);
  const monsterHitFlashRef = useRef<Map<string, number>>(new Map());
  const lastFrameTimeRef = useRef<number>(0);
  // Monster last-damage timestamps — for auto-hiding HP bars after 3s
  const monsterLastDamageRef = useRef<Map<string, number>>(new Map());
  // Track monsters that just died (for death particle spawn — one-shot per death)
  const monsterDeathParticleRef = useRef<Set<string>>(new Set());
  // Pending spell targeting state — set when mage taps a spell button
  // Cleared on canvas click (fires spell) or after 5 seconds
  const pendingSpellRef = useRef<{
    spellType: "arcane" | "frost" | "shadow" | "flame";
    timestamp: number;
  } | null>(null);
  // Spell targeting crosshair position on canvas
  const [spellTargetCursor, setSpellTargetCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Loot pop animations — played when a loot item is collected
  const lootPopAnimsRef = useRef<LootPopAnim[]>([]);
  // Respawn visual effects
  const respawnFadeRef = useRef<number>(0); // 0=invisible, 1=fully visible (counts up)
  const respawnShimmerRef = useRef<number>(0); // shimmer ring progress
  const respawnTextRef = useRef<number>(0); // respawn text display timer
  const respawnCityRef = useRef<string>("Meadow Hub"); // which city was respawned at
  // Hidden room flash (white flash when entering hidden room)
  const hiddenRoomFlashRef = useRef<number>(0); // countdown ms of white flash overlay
  // Track last mage spell type cast for distinct animation rendering
  const lastMageSpellRef = useRef<"arcane" | "frost" | "shadow" | "flame">(
    "arcane",
  );
  // Hit-stop visual: tracks remaining freeze ms for render-side smoothing
  const hitStopRenderRef = useRef<number>(0);
  // Danger vignette: accumulates pulse phase for heartbeat rhythm
  const dangerPulseRef = useRef<number>(0);
  const spellCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeEffectsRef = useRef<SpellEffectItem[]>([]);
  const spellDamageNumbersRef = useRef<SpellDamageNumber[]>([]);
  const visibleHPBarsRef = useRef<Map<string, MonsterHPBarData>>(new Map());
  const spellLastRenderRef = useRef<number>(0);

  // NPC dialogue state — driven from gameState.activeNpcDialogue
  const [npcDialogue, setNpcDialogue] = useState<{
    npc: NpcDefinition;
    lineIndex: number;
  } | null>(null);
  // NPC action choice (for merchants: Talk vs Shop)
  const [npcActionChoice, setNpcActionChoice] = useState<{
    npc: NpcDefinition;
    shopItems: ShopItem[];
  } | null>(null);
  // Shop state
  const [shopState, setShopState] = useState<{
    npcId: string;
    items: ShopItem[];
    tab: "buy" | "sell";
    selectedItem: ShopItem | null;
  } | null>(null);
  // Quest tracker collapsed state
  const [questTrackerCollapsed, setQuestTrackerCollapsed] = useState(false);
  // Quest complete popup driven from gameState
  const [questCompletePopup, setQuestCompletePopup] = useState<{
    title: string;
    reward: Quest["reward"];
  } | null>(null);
  // Boss HP bar state (polled from gameState)
  const [bossHpState, setBossHpState] = useState<{
    hp: number;
    maxHp: number;
    enraged: boolean;
    name: string;
  } | null>(null);
  // Active quest state (polled from gameState)
  const [activeQuestState, setActiveQuestState] = useState<Quest | null>(null);
  const bossHpPollRef = useRef<number>(0);
  // PVP kill notification (polled from gameState)
  const [pvpNotification, setPvpNotification] = useState<{
    text: string;
    isKiller: boolean;
  } | null>(null);
  const pvpNotifPollRef = useRef<number>(0);

  // ── Level-up stat preview popup ──────────────────────────────────────────────
  const [levelUpPopup, setLevelUpPopup] = useState<{
    oldHp: number;
    newHp: number;
    oldMp: number;
    newMp: number;
    oldAtk: number;
    newAtk: number;
    newLevel: number;
  } | null>(null);
  const levelUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Kill streak notification ──────────────────────────────────────────────────
  const [killStreakNotif, setKillStreakNotif] = useState<{
    text: string;
    color: string;
    key: number;
  } | null>(null);
  const killStreakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const killStreakKeyRef = useRef(0);

  // ── World event toast queue (max 2 visible, auto-dismiss 4s) ──────────────────
  const [worldEventToasts, setWorldEventToasts] = useState<
    { id: string; text: string; createdAt: number }[]
  >([]);
  const worldToastQueueRef = useRef<{ id: string; text: string }[]>([]);
  const worldToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNextWorldToast = useCallback(() => {
    const queue = worldToastQueueRef.current;
    if (queue.length === 0) return;
    const toastId = `wt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const { text } = queue.shift()!;
    setWorldEventToasts((prev) => {
      const visible = [
        ...prev.filter((t) => Date.now() - t.createdAt < 4000),
        { id: toastId, text, createdAt: Date.now() },
      ].slice(-2);
      return visible;
    });
    worldToastTimerRef.current = setTimeout(() => {
      setWorldEventToasts((prev) => prev.filter((t) => t.id !== toastId));
      if (worldToastQueueRef.current.length > 0) showNextWorldToast();
    }, 4200);
  }, []);

  // Minimap snapshot — updated every ~500ms to avoid per-frame React re-renders
  const [minimapSnap, setMinimapSnap] = useState<{
    tiles: TileTypeValue[][];
    playerX: number;
    playerY: number;
    zoneId: ZoneId;
    monsters: MonsterEntity[];
    timestamp: number;
  } | null>(null);
  const minimapThrottleRef = useRef<number>(0);
  // Track transition state for Minimap/HUD UI
  const [isTransitioningUI, setIsTransitioningUI] = useState(false);
  const prevTransitionRef = useRef(false);
  // Discovered zones set — tracks first visit for gold label + "Discovered!" text
  const discoveredZonesRef = useRef<Set<string>>(new Set());
  // Zone label state — show on zone transition (key forces CSS re-animation)
  const [zoneLabelAlpha, setZoneLabelAlpha] = useState(0);
  const [zoneLabelName, setZoneLabelName] = useState("");
  const [zoneLabelKey, setZoneLabelKey] = useState(0);
  const prevZoneIdRef = useRef<string>("");
  const zoneLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Canvas click → spell targeting / NPC interaction ───────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const state = gameStateRef.current;
      const canvas = canvasRef.current;
      if (!state || !canvas || state.isTransitioning) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // ── Spell targeting: if a mage spell is pending, fire toward tap point ──
      const pending = pendingSpellRef.current;
      if (
        pending &&
        selectedClass === "mage" &&
        !state.player.isGuest &&
        Date.now() - pending.timestamp < 5000
      ) {
        // Calculate facing direction from player center to tap point
        const playerScreenX =
          Math.floor(
            state.player.tileX * TILE_SIZE +
              (state.player.pixelOffsetX ?? 0) -
              cameraXRef.current,
          ) +
          TILE_SIZE / 2;
        const playerScreenY =
          Math.floor(
            state.player.tileY * TILE_SIZE +
              (state.player.pixelOffsetY ?? 0) -
              cameraYRef.current,
          ) +
          TILE_SIZE / 2;
        const dx = clickX - playerScreenX;
        const dy = clickY - playerScreenY;
        const angle = Math.atan2(dy, dx);
        // Convert angle to FacingDirection
        let facing: FacingDirection = "right";
        if (angle > -Math.PI / 4 && angle <= Math.PI / 4) facing = "right";
        else if (angle > Math.PI / 4 && angle <= (3 * Math.PI) / 4)
          facing = "down";
        else if (angle > (3 * Math.PI) / 4 || angle <= -(3 * Math.PI) / 4)
          facing = "left";
        else facing = "up";
        state.player.lastFacing = facing;
        // Trigger the appropriate spell via input flags
        if (pending.spellType === "arcane") state.input.attackPending = true;
        else if (pending.spellType === "frost")
          state.input.frostNovaPending = true;
        else if (pending.spellType === "shadow")
          state.input.shadowLancePending = true;
        else if (pending.spellType === "flame")
          state.input.flameRingPending = true;
        pendingSpellRef.current = null;
        setSpellTargetCursor(null);
        return;
      }

      const camX = cameraXRef.current;
      const camY = cameraYRef.current;

      // Convert click to world tile coords
      const worldX = (clickX + camX) / TILE_SIZE;
      const worldY = (clickY + camY) / TILE_SIZE;

      // Player position for proximity check
      const px = state.player.tileX;
      const py = state.player.tileY;

      // ── Check loot drops first (generous 1.5-tile tap radius) ──
      for (const drop of state.lootDrops) {
        if (drop.zone !== state.currentZoneId) continue;
        if (drop.collected) continue;
        const dx = worldX - (drop.x + 0.5);
        const dy = worldY - (drop.y + 0.5);
        if (Math.abs(dx) <= 1.5 && Math.abs(dy) <= 1.5) {
          const playerDist = Math.sqrt((px - drop.x) ** 2 + (py - drop.y) ** 2);
          if (playerDist <= 3.5) {
            // Spawn pop animation at drop world position (convert to screen)
            const lx = Math.floor(drop.x * TILE_SIZE - cameraXRef.current);
            const ly = Math.floor(drop.y * TILE_SIZE - cameraYRef.current);
            lootPopAnimsRef.current.push({
              id: drop.id,
              x: lx,
              y: ly,
              item: { ...drop.item },
              progress: 0,
            });
            // Let collectLootDrop handle the atomic removal + reward
            collectLootDrop(state, drop.id, px, py);
            return;
          }
        }
      }

      // ── Check for player targeting (PVP zones only) ──
      const isPvpZone = PVP_ZONES.has(state.currentZoneId);
      if (isPvpZone && !state.player.isGuest) {
        for (const other of state.otherPlayers) {
          const dx = worldX - (other.x + 0.5);
          const dy = worldY - (other.y + 0.5);
          if (Math.abs(dx) <= 0.8 && Math.abs(dy) <= 0.8) {
            // Toggle target: click same player again = deselect
            if (state.targetedPlayerUsername === other.username) {
              state.targetedPlayerUsername = null;
            } else {
              state.targetedPlayerUsername = other.username;
            }
            return;
          }
        }
      }
      // Clicked elsewhere in a safe zone or missed players — deselect
      if (SAFE_ZONES.has(state.currentZoneId)) {
        state.targetedPlayerUsername = null;
      }

      // Get NPCs for current zone
      const npcs = WORLD_CONFIG.npcsByZone[state.currentZoneId] ?? [];

      for (const npc of npcs) {
        const dx = worldX - (npc.tileX + 0.5);
        const dy = worldY - (npc.tileY + 0.5);
        // Check if click is within NPC tile
        if (Math.abs(dx) <= 0.8 && Math.abs(dy) <= 0.8) {
          // Check player proximity (within 1.5 tiles)
          const playerDist = Math.sqrt(
            (px - npc.tileX) ** 2 + (py - npc.tileY) ** 2,
          );
          if (playerDist <= 2.5) {
            // Close any existing dialogue first
            if (state.activeNpcDialogue?.npcId !== npc.id) {
              setNpcDialogue(null);
              setNpcActionChoice(null);
              setShopState(null);
            }

            // Check if this NPC is a merchant with a shop
            const shopItems = NPC_SHOP_MAP[npc.id];

            // Special case: Crafting Table NPC — open crafting panel
            if (npc.id === "crafting_table") {
              if (!isGuest && onOpenCrafting) {
                onOpenCrafting();
                return;
              }
              // Guest: fall through to normal dialogue (guest message)
            }

            if (shopItems && npc.spriteType === "shopkeeper") {
              // Show Talk/Shop choice
              setNpcActionChoice({ npc, shopItems });
              return;
            }

            // Check if NPC offers a quest
            const offeredQuestId = QUEST_GIVERS[npc.id];
            const alreadyAccepted = offeredQuestId
              ? state.activeQuest?.id === offeredQuestId
              : false;
            const alreadyCompleted = offeredQuestId
              ? state.completedQuestIds.includes(offeredQuestId)
              : false;
            const canOfferQuest =
              offeredQuestId &&
              !alreadyAccepted &&
              !alreadyCompleted &&
              isQuestAvailableForClass(offeredQuestId, selectedClass);

            // Check if this NPC is already active (advance dialogue)
            if (state.activeNpcDialogue?.npcId === npc.id) {
              const nextIdx = state.activeNpcDialogue.dialogueIndex + 1;
              if (nextIdx >= npc.dialogue.length) {
                state.activeNpcDialogue = null;
                setNpcDialogue(null);
                // If NPC has quest to offer, show after dialogue finishes
                if (canOfferQuest) {
                  setNpcActionChoice({ npc, shopItems: [] });
                }
              } else {
                state.activeNpcDialogue = {
                  npcId: npc.id,
                  dialogueIndex: nextIdx,
                };
                setNpcDialogue({ npc, lineIndex: nextIdx });
              }
            } else {
              state.activeNpcDialogue = { npcId: npc.id, dialogueIndex: 0 };
              setNpcDialogue({ npc, lineIndex: 0 });
            }
            return;
          }
        }
      }

      // Click away from any NPC — close dialogue
      if (state.activeNpcDialogue) {
        state.activeNpcDialogue = null;
        setNpcDialogue(null);
      }
      setNpcActionChoice(null);
    },
    [gameStateRef, isGuest, onOpenCrafting, selectedClass],
  );

  const handleDialogueAdvance = useCallback(() => {
    const state = gameStateRef.current;
    if (!state?.activeNpcDialogue) return;
    const npcs = WORLD_CONFIG.npcsByZone[state.currentZoneId] ?? [];
    const npc = npcs.find((n) => n.id === state.activeNpcDialogue?.npcId);
    if (!npc) return;
    const nextIdx = state.activeNpcDialogue.dialogueIndex + 1;
    if (nextIdx >= npc.dialogue.length) {
      state.activeNpcDialogue = null;
      setNpcDialogue(null);
      // Open guild panel when finishing guild_master dialogue (non-guest only)
      if (npc.id === "guild_master" && !isGuest && onOpenGuild) {
        onOpenGuild();
      }
      // Open crafting panel when finishing crafting_table dialogue (non-guest only)
      if (npc.id === "crafting_table" && !isGuest && onOpenCrafting) {
        onOpenCrafting();
      }
    } else {
      state.activeNpcDialogue = { npcId: npc.id, dialogueIndex: nextIdx };
      setNpcDialogue({ npc, lineIndex: nextIdx });
    }
  }, [gameStateRef, isGuest, onOpenGuild, onOpenCrafting]);

  const handleDialogueClose = useCallback(() => {
    const state = gameStateRef.current;
    if (state) state.activeNpcDialogue = null;
    setNpcDialogue(null);
  }, [gameStateRef]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let pos: Awaited<ReturnType<typeof loadPlayer>> = null;
        try {
          pos = await loadPlayer(username);
        } catch (err) {
          console.warn("[PixelQuest] loadPlayer failed — using defaults:", err);
        }
        if (cancelled) return;
        if (pos === null && loadedFromBackendRef.current) return;
        const sx = pos?.x ?? 5;
        const sy = pos?.y ?? 5;
        const cls = pos?.selectedClass ?? selectedClass;
        if (pos !== null) loadedFromBackendRef.current = true;
        const gs = createGameState(username, sx, sy, cls);
        if (pos !== null) {
          gs.player.outfitColor = pos.outfitColor;
          gs.player.outfitStyle = pos.outfitStyle;
          gs.player.hairColor = pos.hairColor;
        }
        gameStateRef.current = gs;
        try {
          validateAllTransitions();
        } catch (err) {
          console.warn(
            "[PixelQuest] validateAllTransitions failed (non-fatal):",
            err,
          );
        }
        onPositionUpdate(sx, sy);
        setLoaded(true);
        console.log("[PixelQuest] Game state initialized successfully");
      } catch (err) {
        console.error(
          "[PixelQuest] GameCanvas init failed — showing safe fallback:",
          err,
        );
        if (!cancelled) {
          // Create minimal fallback state so the canvas renders something
          try {
            const fallbackGs = createGameState(username, 5, 5, selectedClass);
            gameStateRef.current = fallbackGs;
            onPositionUpdate(5, 5);
          } catch {
            // If even fallback fails, gameStateRef stays null — canvas shows blank but doesn't crash
          }
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, loadPlayer, gameStateRef, onPositionUpdate, selectedClass]);

  const onTileLanded = useCallback(
    (x: number, y: number) => {
      onPositionUpdate(x, y);
      const now = Date.now();
      if (now - saveThrottleRef.current > 500) {
        saveThrottleRef.current = now;
        void savePosition(username, x, y);
      }
    },
    [username, savePosition, onPositionUpdate],
  );

  const onFrame = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const state = gameStateRef.current;
      if (!ctx || !state) return;

      // Disable interpolation — keep pixel art crisp at all zoom levels
      ctx.imageSmoothingEnabled = false;

      const dt =
        lastFrameTimeRef.current > 0
          ? timestamp - lastFrameTimeRef.current
          : 16;
      lastFrameTimeRef.current = timestamp;

      // Tick per-frame animation systems
      tickHitReactions(dt);
      tickPlayerDeathAnim(dt);

      // Update slow-device mode detection (every ~60 frames)
      updateSlowDeviceMode(dt);

      const { player, world } = state;

      // Update minimap snapshot ~every 500ms (skip during active transition)
      const now = Date.now();
      // Track transition state change for React UI
      if (state.isTransitioning !== prevTransitionRef.current) {
        prevTransitionRef.current = state.isTransitioning;
        setIsTransitioningUI(state.isTransitioning);
      }

      // Poll boss HP state every ~200ms
      if (now - bossHpPollRef.current > 200) {
        bossHpPollRef.current = now;
        if (state.currentZoneId === "boss_chamber" && state.boss) {
          setBossHpState({
            hp: state.boss.hp,
            maxHp: state.boss.maxHp,
            enraged: state.boss.enraged,
            name: "THE STONE WARDEN",
          });
        } else if (
          state.currentZoneId === "cursed_galleon" &&
          state.shipCaptainBoss &&
          state.shipCaptainBoss.phase !== "dead"
        ) {
          setBossHpState({
            hp: state.shipCaptainBoss.hp,
            maxHp: state.shipCaptainBoss.maxHp,
            enraged: state.shipCaptainBoss.enraged,
            name: "SHIP CAPTAIN",
          });
        } else {
          setBossHpState(null);
        }
        // Poll active quest
        setActiveQuestState(
          state.activeQuest ? { ...state.activeQuest } : null,
        );
        // Poll quest complete popup
        if (
          state.questCompletePopup &&
          state.questCompletePopup.expiresAt > now
        ) {
          setQuestCompletePopup({
            title: state.questCompletePopup.title,
            reward: state.questCompletePopup.reward,
          });
        } else if (
          state.questCompletePopup &&
          state.questCompletePopup.expiresAt <= now
        ) {
          state.questCompletePopup = null;
          setQuestCompletePopup(null);
        }
        // Poll PVP kill notification
        if (now - pvpNotifPollRef.current > 150) {
          pvpNotifPollRef.current = now;
          if (
            state.pvpKillNotification &&
            Date.now() < state.pvpKillNotification.expiresAt
          ) {
            setPvpNotification({
              text: state.pvpKillNotification.text,
              isKiller: state.pvpKillNotification.isKiller,
            });
          } else if (
            !state.pvpKillNotification ||
            Date.now() >= state.pvpKillNotification.expiresAt
          ) {
            setPvpNotification(null);
          }
        }
      }
      if (now - minimapThrottleRef.current > 500 && !state.isTransitioning) {
        minimapThrottleRef.current = now;
        setMinimapSnap({
          tiles: world.tiles,
          playerX: player.tileX,
          playerY: player.tileY,
          zoneId: state.currentZoneId,
          monsters: state.monsters,
          timestamp: now,
        });
      }

      // Process combat events
      for (const evt of state.recentCombatEvents) {
        const age = now - evt.timestamp;
        if (age > 600) continue;
        if (evt.type === "player-hit") {
          if (playerDmgFlashRef.current <= 0)
            playerDmgFlashRef.current = PLAYER_DMG_FLASH_DURATION;
          if (
            !damageNumbersRef.current.some(
              (d) => d.isPlayer && Math.abs(d.age) < 50,
            )
          ) {
            damageNumbersRef.current.push({
              x: CANVAS_W / 2 + (Math.random() - 0.5) * 20,
              y: CANVAS_H / 2 - 20,
              value: evt.damage,
              age: 0,
              isPlayer: true,
            });
          }
        } else if (evt.type === "monster-hit" && evt.monsterId) {
          if (!monsterHitFlashRef.current.has(evt.monsterId))
            monsterHitFlashRef.current.set(
              evt.monsterId,
              MONSTER_HIT_FLASH_DURATION,
            );
        }
      }

      if (playerDmgFlashRef.current > 0)
        playerDmgFlashRef.current = Math.max(0, playerDmgFlashRef.current - dt);
      for (const [id, t] of monsterHitFlashRef.current) {
        const newT = t - dt;
        if (newT <= 0) monsterHitFlashRef.current.delete(id);
        else monsterHitFlashRef.current.set(id, newT);
      }
      damageNumbersRef.current = damageNumbersRef.current
        .map((d) => ({ ...d, age: d.age + dt, y: d.y - dt * 0.035 }))
        .filter(
          (d) =>
            d.age <
            (d.isFirstKillBonus
              ? 1200
              : d.isGoldPickup
                ? 900
                : d.isInteractText
                  ? 1400
                  : 600),
        );

      // ── Sync hit-stop render ref from game state ──
      // This ensures render-side knows we're in hit-stop for any future visual needs
      hitStopRenderRef.current = state.hitStopTimer ?? 0;

      // Rain system update (only on non-interior outdoor maps)
      updateRainSystem(dt, state.currentZoneId);
      // Thunder system update
      updateThunderSystem(dt, state.currentZoneId, () => {
        try {
          playThunder();
        } catch {
          /* non-fatal */
        }
      });
      // Water decoratives update
      updateWaterDecorations(
        dt,
        state.currentZoneId,
        state.world.tiles as number[][],
        cameraXRef.current,
        cameraYRef.current,
      );
      // Sky: meteors
      updateMeteors(dt);

      // Camera
      const targetCamX =
        player.tileX * TILE_SIZE +
        player.pixelOffsetX -
        CANVAS_W / 2 +
        TILE_SIZE / 2;
      const targetCamY =
        player.tileY * TILE_SIZE +
        player.pixelOffsetY -
        CANVAS_H / 2 +
        TILE_SIZE / 2;
      if (cameraXRef.current === -1) {
        cameraXRef.current = targetCamX;
        cameraYRef.current = targetCamY;
      }
      cameraXRef.current += (targetCamX - cameraXRef.current) * CAM_LERP;
      cameraYRef.current += (targetCamY - cameraYRef.current) * CAM_LERP;

      let shakeX = 0;
      let shakeY = 0;
      if (state.screenShakeTimer > 0) {
        const d = state.screenShakeTimer / SCREEN_SHAKE_DURATION_MS;
        const p = 1 - d;
        shakeX = Math.sin(p * Math.PI * 8) * SCREEN_SHAKE_AMPLITUDE * d;
        shakeY = Math.cos(p * Math.PI * 6) * SCREEN_SHAKE_AMPLITUDE * d * 0.7;
      }

      const camX = cameraXRef.current;
      const camY = cameraYRef.current;
      ctx.save();
      ctx.translate(Math.round(shakeX), Math.round(shakeY));
      ctx.fillStyle = "oklch(0.10 0 0)";
      ctx.fillRect(-2, -2, CANVAS_W + 4, CANVAS_H + 4);

      const startX = Math.floor(camX / TILE_SIZE);
      const startY = Math.floor(camY / TILE_SIZE);

      // Build portal color lookup for this zone
      const zoneTransitions =
        WORLD_CONFIG.zones[state.currentZoneId]?.transitions ?? [];
      const portalColorMap = new Map<string, string>();
      for (const t of zoneTransitions) {
        const color = getPortalDestLabel(t.toZone).color;
        const tt = t.triggerTile;
        if ("x" in tt && "y" in tt) {
          portalColorMap.set(`${tt.x},${tt.y}`, color);
        }
      }

      // Tiles
      for (let ty = startY; ty <= startY + VIEWPORT_ROWS + 2; ty++) {
        for (let tx = startX; tx <= startX + VIEWPORT_COLS + 2; tx++) {
          const ppx = Math.floor(tx * TILE_SIZE - camX);
          const ppy = Math.floor(ty * TILE_SIZE - camY);
          const tile = world.tiles[ty]?.[tx];
          if (tile !== undefined) {
            const pc = portalColorMap.get(`${tx},${ty}`);
            drawTile(
              ctx,
              tile,
              ppx,
              ppy,
              tx,
              ty,
              timestamp,
              pc,
              state.currentZoneId,
              world.tiles,
            );
          } else {
            // Out-of-bounds: draw zone-appropriate water/sky instead of black void
            drawOutOfBoundsTile(
              ctx,
              ppx,
              ppy,
              tx,
              ty,
              timestamp,
              state.currentZoneId,
            );
          }
        }
      }

      // ── Light source glow pass — radial glow for lanterns, portals, campfires ──
      // Drawn after tiles, before entities. Uses blending to give warm/cool light halos.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      // Scan visible tiles for LANTERN tiles and draw glow beneath them
      for (let ty2 = startY; ty2 <= startY + VIEWPORT_ROWS + 2; ty2++) {
        for (let tx2 = startX; tx2 <= startX + VIEWPORT_COLS + 2; tx2++) {
          const t2 = world.tiles[ty2]?.[tx2];
          if (t2 === TileType.LANTERN) {
            drawLightSourceGlow(
              ctx,
              tx2,
              ty2,
              camX,
              camY,
              "#ffdd99",
              0.25,
              player.tileX,
              player.tileY,
            );
          } else if (t2 === TileType.PORTAL) {
            // Portal glow — blue for city portals, red-orange for EXP portals
            const pc2 = portalColorMap.get(`${tx2},${ty2}`);
            const pGlowColor = pc2 === "#ff4444" ? "#ff6633" : "#6699ff";
            drawLightSourceGlow(
              ctx,
              tx2,
              ty2,
              camX,
              camY,
              pGlowColor,
              0.18,
              player.tileX,
              player.tileY,
            );
          }
        }
      }
      // Campfire glow — Pirate Island tile 16,12
      if (state.currentZoneId === "pirate_island") {
        drawLightSourceGlow(
          ctx,
          16,
          12,
          camX,
          camY,
          "#ff8833",
          0.22,
          player.tileX,
          player.tileY,
        );
      }
      // Magical orb glows — Aurelion
      if (state.currentZoneId === "aurelion") {
        for (const [otx2, oty2, , , oc] of [
          [9, 6, 0.6, 0.8, "#6688ff"],
          [11, 5, 0.9, 1.1, "#aa66ff"],
          [10, 8, 1.3, 0.7, "#4499ff"],
          [12, 7, 0.4, 1.4, "#8855ff"],
        ] as [number, number, number, number, string][]) {
          drawLightSourceGlow(
            ctx,
            otx2,
            oty2,
            camX,
            camY,
            oc,
            0.14,
            player.tileX,
            player.tileY,
          );
        }
      }
      ctx.restore();

      // ── Portal proximity interaction rings — when player is within 1 tile of a portal ──
      try {
        const portalRingAlpha = 0.45 + 0.45 * Math.sin(timestamp / 300);
        for (const [tKey, _pColor] of portalColorMap) {
          const [pTxStr, pTyStr] = tKey.split(",");
          const pTx = Number(pTxStr);
          const pTy = Number(pTyStr);
          const distToPortal = Math.sqrt(
            (player.tileX - pTx) ** 2 + (player.tileY - pTy) ** 2,
          );
          if (distToPortal <= 1.5) {
            const prx = Math.floor(pTx * TILE_SIZE - camX) + TILE_SIZE / 2;
            const pry = Math.floor(pTy * TILE_SIZE - camY) + TILE_SIZE / 2;
            ctx.save();
            ctx.globalAlpha = portalRingAlpha;
            ctx.strokeStyle = "rgba(100,180,255,1)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(prx, pry, TILE_SIZE * 0.55, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      } catch {
        /* non-fatal */
      }

      // ── Additive lighting layer (dark overlay + light holes) ──
      // Only meaningful in night or partly-night zones. Skipped during full day.
      if (!UNDERGROUND_ZONES.has(state.currentZoneId)) {
        const CYCLE_MS2 = 8 * 60 * 1000;
        const t2 = (timestamp % CYCLE_MS2) / CYCLE_MS2;
        const nf = t2 < 0.5 ? 0 : t2 < 0.75 ? (t2 - 0.5) / 0.25 : 1;
        if (nf > 0.05) {
          // only draw when it adds visual value
          const lights: LightSource[] = [];
          // Player personal light — very faint, 2-tile radius
          lights.push(
            makeTileLight(
              player.tileX,
              player.tileY,
              camX,
              camY,
              2,
              255,
              220,
              180,
              0.15,
            ),
          );
          // Scan for LANTERN tiles
          for (let tly = startY; tly <= startY + VIEWPORT_ROWS + 2; tly++) {
            for (let tlx = startX; tlx <= startX + VIEWPORT_COLS + 2; tlx++) {
              const t3 = world.tiles[tly]?.[tlx];
              if (t3 === TileType.LANTERN)
                lights.push(
                  makeTileLight(tlx, tly, camX, camY, 1.5, 255, 200, 120, 0.4),
                );
              else if (t3 === TileType.PORTAL) {
                const pc3 = portalColorMap.get(`${tlx},${tly}`);
                const [pr, pg, pb] =
                  pc3 === "#ff4444" ? [255, 100, 50] : [100, 150, 255];
                lights.push(
                  makeTileLight(tlx, tly, camX, camY, 2, pr, pg, pb, 0.3),
                );
              } else if (t3 === TileType.CRYSTAL)
                lights.push(
                  makeTileLight(tlx, tly, camX, camY, 1.5, 180, 80, 255, 0.3),
                );
            }
          }
          // Zone-specific static lights
          if (state.currentZoneId === "pirate_island")
            lights.push(
              makeTileLight(16, 12, camX, camY, 1, 255, 140, 60, 0.4),
            );
          if (state.currentZoneId === "aurelion") {
            for (const [alx, aly] of [
              [9, 6],
              [11, 5],
              [10, 8],
              [12, 7],
            ] as [number, number][])
              lights.push(
                makeTileLight(alx, aly, camX, camY, 1.5, 120, 80, 255, 0.3),
              );
          }
          drawLightingLayer(ctx, lights, nf);
        }
      }

      // Floating labels for portals and doors near the player
      ctx.save();
      for (const t of zoneTransitions) {
        const tt = t.triggerTile;
        // Only handle point triggers for label rendering (edge-exits handled separately)
        if (!("x" in tt && "y" in tt)) continue;
        const ttx = tt.x;
        const tty = tt.y;
        const tile = world.tiles[tty]?.[ttx];
        if (tile === undefined) continue;
        const ppx = Math.floor(ttx * TILE_SIZE - camX);
        const ppy = Math.floor(tty * TILE_SIZE - camY);
        // Only draw labels when on screen
        if (ppx < -TILE_SIZE * 2 || ppx > CANVAS_W + TILE_SIZE * 2) continue;
        if (ppy < -TILE_SIZE * 2 || ppy > CANVAS_H + TILE_SIZE * 2) continue;

        const playerDist = Math.sqrt(
          (player.tileX - ttx) ** 2 + (player.tileY - tty) ** 2,
        );

        if (tile === TileType.PORTAL) {
          const info = getPortalDestLabel(t.toZone);
          // Always draw a pulsing animated ring around portals
          const ringPulse = Math.sin(timestamp * 0.006) * 0.3 + 0.7;
          const ringR = TILE_SIZE * 0.6 + Math.sin(timestamp * 0.004) * 3;
          ctx.globalAlpha = 0.5 * ringPulse;
          ctx.strokeStyle = info.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(
            ppx + TILE_SIZE / 2,
            ppy + TILE_SIZE / 2,
            ringR,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          ctx.globalAlpha = 0.25 * ringPulse;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(
            ppx + TILE_SIZE / 2,
            ppy + TILE_SIZE / 2,
            ringR + 4,
            0,
            Math.PI * 2,
          );
          ctx.stroke();

          // ── Portal upward wisp particles (max 5 per portal, within 30 cap) ──
          if (!shouldSkipDecorativeParticles()) {
            const portalCx = ppx + TILE_SIZE / 2;
            const portalCy = ppy + TILE_SIZE / 2;
            const wispSeed =
              (ttx * 137 + tty * 251 + Math.floor(timestamp / 120)) % 5;
            if (wispSeed === 0) {
              // Spawn ~1 wisp per ~600ms per portal
              const wispX = portalCx + (Math.random() - 0.5) * 14;
              addParticle({
                x: wispX,
                y: portalCy + 4,
                r: 2 + Math.random() * 2,
                color: info.color,
                alpha: 0.7 + Math.random() * 0.3,
                vy: -(0.6 + Math.random() * 0.8),
                vx: (Math.random() - 0.5) * 0.4,
                gravity: -0.005,
                maxAge: 600,
                age: 0,
              });
            }
          }

          if (playerDist <= 3) {
            // Portal floating label — pill style with zone name, PVP, level range
            ctx.save();
            const text = `\u2192 ${info.name}`;
            const subtext = info.pvp
              ? `\u2694 PVP \u00b7 Lv ${info.levelRange}`
              : `Safe \u00b7 Lv ${info.levelRange}`;
            ctx.font = "bold 11px monospace";
            const w1 = ctx.measureText(text).width;
            ctx.font = "9px monospace";
            const w2 = ctx.measureText(subtext).width;
            const pillW = Math.max(w1, w2) + 16;
            const pillH = 34;
            const cx2 = ppx + TILE_SIZE / 2;
            const pillX = cx2 - pillW / 2;
            const pillY = ppy - pillH - 10;
            ctx.globalAlpha = 1;
            ctx.textBaseline = "alphabetic";
            // Dark pill background
            ctx.fillStyle = "rgba(0,0,0,0.82)";
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(pillX, pillY, pillW, pillH, 6);
            } else {
              ctx.rect(pillX, pillY, pillW, pillH);
            }
            ctx.fill();
            // Colored left border
            ctx.fillStyle = info.color || "#aaaaff";
            ctx.fillRect(pillX, pillY, 3, pillH);
            // Zone name line
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px monospace";
            ctx.textAlign = "center";
            ctx.fillText(text, cx2, pillY + 13);
            // Sub-info line
            ctx.fillStyle = info.pvp ? "#ff6644" : "#88cc88";
            ctx.font = "9px monospace";
            ctx.fillText(subtext, cx2, pillY + 26);
            ctx.textAlign = "left";
            ctx.restore();
          }
        } else if (tile === TileType.DOOR && playerDist <= 2) {
          // Door "ENTER ▼" pulsing label
          const enterPulse = Math.sin(timestamp * 0.005) * 0.3 + 0.7;
          const labelText = "ENTER \u25bc";
          const labelY = ppy - 8 + Math.sin(timestamp * 0.003) * 1.5;
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const lw = ctx.measureText(labelText).width + 14;
          const cx2 = ppx + TILE_SIZE / 2;
          ctx.globalAlpha = 0.88 * enterPulse + 0.12;
          // White glow
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(cx2 - lw / 2 - 2, labelY - 9, lw + 4, 16);
          ctx.fillStyle = "rgba(0,0,0,0.92)";
          ctx.fillRect(cx2 - lw / 2, labelY - 7, lw, 13);
          ctx.strokeStyle = "#FFD080";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx2 - lw / 2 + 0.5, labelY - 6.5, lw - 1, 12);
          ctx.fillStyle = "#FFE090";
          ctx.fillText(labelText, cx2, labelY);
        } else if (
          (tile === TileType.STAIR || tile === TileType.STAIR_UP) &&
          playerDist <= 1.8
        ) {
          // Stair glow — yellow per spec, always visible
          const stairGlowPulse = Math.sin(timestamp / 750) * 0.4 + 0.6;
          ctx.save();
          ctx.globalAlpha = 0.38 * stairGlowPulse;
          ctx.strokeStyle = "#FFCC00";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#FFCC00";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(
            ppx + TILE_SIZE / 2,
            ppy + TILE_SIZE / 2,
            TILE_SIZE * 0.52,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          ctx.restore();
          // Stair label with destination zone name
          const labelY = ppy - 8 + Math.sin(timestamp * 0.003) * 1.5;
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          // Temporary measure — placeholder width using generic stair text
          const stairPlaceholder =
            tile === TileType.STAIR ? "DESCEND" : "ASCEND";
          const lw = ctx.measureText(stairPlaceholder).width + 40;
          const cx2 = ppx + TILE_SIZE / 2;
          ctx.globalAlpha = 0.96;
          ctx.fillStyle = "rgba(0,0,0,0.92)";
          ctx.fillRect(cx2 - lw / 2, labelY - 7, lw, 13);
          ctx.strokeStyle = tile === TileType.STAIR ? "#FFB830" : "#88FF88";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx2 - lw / 2 + 0.5, labelY - 6.5, lw - 1, 12);
          ctx.fillStyle = tile === TileType.STAIR ? "#FFCC50" : "#AAFFAA";
          const stairInfo = getPortalDestLabel(t.toZone);
          const stairWithDest = `${tile === TileType.STAIR ? "\u2193" : "\u2191"} ${stairInfo.name}`;
          ctx.fillText(stairWithDest, cx2, labelY);
        } else if (tile === TileType.PATH && playerDist <= 3) {
          // Edge-exit path transition — show directional arrow + zone name
          const info = getPortalDestLabel(t.toZone);
          // Determine edge direction from tile position relative to map center
          const mapCX = world.width / 2;
          const mapCY = world.height / 2;
          const edgeDX = ttx < mapCX ? -1 : ttx > mapCX ? 1 : 0;
          const edgeDY = tty < mapCY ? -1 : tty > mapCY ? 1 : 0;
          const arrowChar =
            edgeDX < 0
              ? "\u2190"
              : edgeDX > 0
                ? "\u2192"
                : edgeDY < 0
                  ? "\u2191"
                  : "\u2193";
          const edgePulse = Math.sin(timestamp * 0.005) * 0.3 + 0.7;
          const edgeLabelText = `${arrowChar} ${info.name}`;
          const edgeLabelY = ppy - 10 + Math.sin(timestamp * 0.003) * 2;
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const elw = ctx.measureText(edgeLabelText).width + 14;
          const ecx = ppx + TILE_SIZE / 2;
          ctx.globalAlpha = 0.9 * edgePulse;
          ctx.fillStyle = "rgba(0,0,0,0.88)";
          ctx.fillRect(ecx - elw / 2, edgeLabelY - 7, elw, 13);
          ctx.strokeStyle = info.color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(ecx - elw / 2 + 0.5, edgeLabelY - 6.5, elw - 1, 12);
          ctx.fillStyle = info.color;
          ctx.fillText(edgeLabelText, ecx, edgeLabelY);
          // Draw a small arrow indicator on the map edge direction
          ctx.globalAlpha = 0.65 * edgePulse;
          ctx.fillStyle = info.color;
          const arrowSx = ppx + TILE_SIZE / 2 + edgeDX * (TILE_SIZE * 0.4);
          const arrowSy = ppy + TILE_SIZE / 2 + edgeDY * (TILE_SIZE * 0.4);
          ctx.beginPath();
          if (edgeDX === 1) {
            ctx.moveTo(arrowSx + 6, arrowSy);
            ctx.lineTo(arrowSx - 2, arrowSy - 5);
            ctx.lineTo(arrowSx - 2, arrowSy + 5);
          } else if (edgeDX === -1) {
            ctx.moveTo(arrowSx - 6, arrowSy);
            ctx.lineTo(arrowSx + 2, arrowSy - 5);
            ctx.lineTo(arrowSx + 2, arrowSy + 5);
          } else if (edgeDY === 1) {
            ctx.moveTo(arrowSx, arrowSy + 6);
            ctx.lineTo(arrowSx - 5, arrowSy - 2);
            ctx.lineTo(arrowSx + 5, arrowSy - 2);
          } else {
            ctx.moveTo(arrowSx, arrowSy - 6);
            ctx.lineTo(arrowSx - 5, arrowSy + 2);
            ctx.lineTo(arrowSx + 5, arrowSy + 2);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      // Bridge entrance glow — yellow pulsing glow on bridge-edge transition tiles
      ctx.save();
      for (const t of zoneTransitions) {
        if (t.toZone !== "pirate_island" && t.fromZone !== "pirate_island")
          continue;
        const tt = t.triggerTile;
        // Handle edge triggers (yRange or xRange) for bridge glows
        if ("x" in tt && "yRange" in tt) {
          const [y0, y1] = tt.yRange;
          for (let bty = y0; bty <= y1; bty++) {
            const bpx = Math.floor(tt.x * TILE_SIZE - camX);
            const bpy = Math.floor(bty * TILE_SIZE - camY);
            if (bpx < -TILE_SIZE || bpx > CANVAS_W + TILE_SIZE) continue;
            if (bpy < -TILE_SIZE || bpy > CANVAS_H + TILE_SIZE) continue;
            const gp = Math.sin(timestamp * 0.004) * 0.3 + 0.7;
            ctx.globalAlpha = 0.35 * gp;
            const grd = ctx.createRadialGradient(
              bpx + TILE_SIZE / 2,
              bpy + TILE_SIZE / 2,
              0,
              bpx + TILE_SIZE / 2,
              bpy + TILE_SIZE / 2,
              TILE_SIZE,
            );
            grd.addColorStop(0, "#FFE020");
            grd.addColorStop(1, "rgba(255,200,0,0)");
            ctx.fillStyle = grd;
            ctx.fillRect(
              bpx - TILE_SIZE / 2,
              bpy - TILE_SIZE / 2,
              TILE_SIZE * 2,
              TILE_SIZE * 2,
            );
          }
        } else if ("xRange" in tt && "y" in tt) {
          const [x0, x1] = tt.xRange;
          for (let btx = x0; btx <= x1; btx++) {
            const bpx = Math.floor(btx * TILE_SIZE - camX);
            const bpy = Math.floor(tt.y * TILE_SIZE - camY);
            if (bpx < -TILE_SIZE || bpx > CANVAS_W + TILE_SIZE) continue;
            if (bpy < -TILE_SIZE || bpy > CANVAS_H + TILE_SIZE) continue;
            const gp = Math.sin(timestamp * 0.004) * 0.3 + 0.7;
            ctx.globalAlpha = 0.35 * gp;
            const grd = ctx.createRadialGradient(
              bpx + TILE_SIZE / 2,
              bpy + TILE_SIZE / 2,
              0,
              bpx + TILE_SIZE / 2,
              bpy + TILE_SIZE / 2,
              TILE_SIZE,
            );
            grd.addColorStop(0, "#FFE020");
            grd.addColorStop(1, "rgba(255,200,0,0)");
            ctx.fillStyle = grd;
            ctx.fillRect(
              bpx - TILE_SIZE / 2,
              bpy - TILE_SIZE / 2,
              TILE_SIZE * 2,
              TILE_SIZE * 2,
            );
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      for (const [dtx, dty, dType] of state.currentZoneId === "meadow_hub"
        ? TOWN_DECORATIONS
        : []) {
        const dpx = Math.floor(dtx * TILE_SIZE - camX);
        const dpy = Math.floor(dty * TILE_SIZE - camY);
        if (
          dpx > -TILE_SIZE * 2 &&
          dpx < CANVAS_W + TILE_SIZE &&
          dpy > -TILE_SIZE * 2 &&
          dpy < CANVAS_H + TILE_SIZE
        ) {
          if (dType === "barrel") drawBarrel(ctx, dpx, dpy);
          else drawSign(ctx, dpx, dpy);
        }
      }

      // Meadow Hub enhanced decorations — all zero-collision visual overlays
      if (state.currentZoneId === "meadow_hub") {
        for (const [dtx, dty, dType, seed] of MEADOW_HUB_DECOS) {
          const dpx = Math.floor(dtx * TILE_SIZE - camX);
          const dpy = Math.floor(dty * TILE_SIZE - camY);
          if (
            dpx > -TILE_SIZE * 3 &&
            dpx < CANVAS_W + TILE_SIZE * 2 &&
            dpy > -TILE_SIZE * 3 &&
            dpy < CANVAS_H + TILE_SIZE * 2
          ) {
            if (dType === "fountain")
              drawMeadowFountain(ctx, dpx, dpy, timestamp);
            else if (dType === "flowerbed")
              drawFlowerBed(ctx, dpx, dpy, seed ?? 1);
            else if (dType === "lamp") drawLampPost(ctx, dpx, dpy, timestamp);
            else if (dType === "noticeboard") drawNoticeBoard(ctx, dpx, dpy);
            else if (dType === "arch") drawWelcomeArch(ctx, dpx, dpy);
          }
        }
      }

      // Aurelion animated fountain (center plaza, 2 tiles wide)
      if (state.currentZoneId === "aurelion") {
        const fountainTileX = Math.floor(world.width / 2) - 1;
        const fountainTileY = Math.floor(world.height / 2) - 1;
        const fpx = Math.floor(fountainTileX * TILE_SIZE - camX);
        const fpy = Math.floor(fountainTileY * TILE_SIZE - camY);
        if (
          fpx > -TILE_SIZE * 4 &&
          fpx < CANVAS_W + TILE_SIZE * 4 &&
          fpy > -TILE_SIZE * 4 &&
          fpy < CANVAS_H + TILE_SIZE * 4
        ) {
          drawAurelionFountain(ctx, fpx, fpy, timestamp);
        }
      }

      // Zone decorations — zero-collision visual overlays for all zones
      drawZoneDecorations(ctx, state.currentZoneId, camX, camY, timestamp);

      // Chat map
      const chatMap = new Map<string, { text: string; age: number }>();
      if (chatMessages) {
        for (const msg of chatMessages)
          chatMap.set(msg.username, {
            text: msg.text,
            age: now - msg.timestamp,
          });
      }

      // Y-sorted entity queue
      interface RenderEntity {
        sortY: number;
        draw: () => void;
      }
      const renderQueue: RenderEntity[] = [];

      // Other players
      for (const other of state.otherPlayers) {
        const sx = Math.floor(other.x * TILE_SIZE - camX);
        const sy = Math.floor(other.y * TILE_SIZE - camY);
        if (
          sx > -TILE_SIZE * 3 &&
          sx < CANVAS_W + TILE_SIZE * 3 &&
          sy > -TILE_SIZE * 3 &&
          sy < CANVAS_H + TILE_SIZE * 3
        ) {
          const otherFacing: FacingDirection = other.lastFacing ?? "down";
          const otherEmoteExpiry =
            other.emoteTimestamp !== undefined
              ? other.emoteTimestamp + EMOTE_DURATION_MS
              : undefined;
          const otherChat = chatMap.get(other.username);
          renderQueue.push({
            sortY: sy,
            draw: () => {
              drawCharacter(
                ctx,
                sx,
                sy,
                other.username,
                other.selectedClass,
                otherFacing,
                false,
                0,
                timestamp,
                false,
                false,
                0,
                "down",
                other.currentEmote,
                otherEmoteExpiry,
                otherChat?.text,
                otherChat?.age,
                other.outfitColor ?? "default",
                other.outfitStyle ??
                  (other.selectedClass === "mage" ? "mage_A" : "warrior_A"),
                other.hairColor ?? "brown",
                undefined, // level not synced for other players
                "arcane",
                false, // not a guest
                false, // not targeted by self
                undefined,
                undefined,
                false, // immunity not tracked for other players
                other.shieldActive === true, // shield aura
                0, // duration ratio not synced (remote players)
                undefined, // title not synced for other players
                "male", // gender defaults to male for other players (not synced yet)
                "sword", // weapon defaults (not synced for other players)
                "long_staff", // staff defaults (not synced for other players)
              );
            },
          });
        }
      }

      // Local player
      const screenX = Math.floor(
        player.tileX * TILE_SIZE + player.pixelOffsetX - camX,
      );
      const screenY = Math.floor(
        player.tileY * TILE_SIZE + player.pixelOffsetY - camY,
      );
      const localChat = chatMap.get(username);

      // Player death animation: trigger on hp=0, reset on respawn
      if (
        player.hp <= 0 &&
        !state.isDead &&
        _playerDeathAnim.phase === "none"
      ) {
        _playerDeathAnim.phase = "flash";
        _playerDeathAnim.timer = 0;
        _playerDeathAnim.rotation = 0;
        _playerDeathAnim.scale = 1;
      } else if (player.hp > 0 && _playerDeathAnim.phase === "done") {
        resetPlayerDeathAnim();
      }

      // Use activeSpellType set at cast time
      if (player.selectedClass === "mage" && player.attackActive) {
        lastMageSpellRef.current = player.activeSpellType ?? "arcane";
      }
      renderQueue.push({
        sortY: screenY,
        draw: () => {
          // Death animation: apply transform or flash
          const dPhase = _playerDeathAnim.phase;
          let _deathCtxSaved = false;
          if (dPhase === "done") return;
          if (dPhase === "flash" && playerDeathFlashVisible()) {
            ctx.save();
            _deathCtxSaved = true;
            ctx.filter =
              "sepia(1) saturate(20) hue-rotate(-20deg) brightness(0.7)";
          } else if (dPhase === "spin" || dPhase === "shrink") {
            const dcx = screenX + TILE_SIZE / 2;
            const dcy = screenY + TILE_SIZE / 2;
            ctx.save();
            _deathCtxSaved = true;
            ctx.translate(dcx, dcy);
            ctx.rotate(_playerDeathAnim.rotation);
            const dsc = _playerDeathAnim.scale;
            ctx.scale(dsc, dsc);
            ctx.translate(-dcx, -dcy);
          }
          drawCharacter(
            ctx,
            screenX,
            screenY,
            username,
            player.selectedClass,
            player.lastFacing,
            player.isMoving,
            player.animProgress,
            timestamp,
            true,
            player.attackActive,
            player.attackTimer,
            player.attackFacing,
            player.activeEmote,
            player.emoteExpiry,
            localChat?.text ?? player.chatMessage,
            localChat?.age ??
              (player.chatExpiry
                ? now - (player.chatExpiry - 11000)
                : undefined),
            player.outfitColor ?? "default",
            player.outfitStyle ??
              (player.selectedClass === "mage" ? "mage_A" : "warrior_A"),
            player.hairColor ?? "brown",
            player.level,
            lastMageSpellRef.current,
            player.isGuest === true, // guest: draw red humanoid sprite
            false, // local player is never "targeted" by self
            undefined,
            undefined,
            state.pvpImmunityTimer > 0 || state.respawnImmunityTimer > 0, // golden aura when immune
            (player as unknown as { shieldActive?: boolean }).shieldActive ===
              true,
            (() => {
              const ps = player as unknown as {
                shieldActive?: boolean;
                shieldDuration?: number;
              };
              return ps.shieldActive && ps.shieldDuration
                ? ps.shieldDuration / 60000
                : 0;
            })(),
            // Active title label — shown in soft yellow above name
            !player.isGuest && state.activeTitleId
              ? `[${TITLE_LABELS[state.activeTitleId]}]`
              : undefined,
            // Gender/weapon/staff — from player state (optional fields, defaults for backward compat)
            player.gender ?? "male",
            player.weaponType ?? "sword",
            player.staffType ?? "long_staff",
            playerGuildName,
          );
          // ── Warrior combo counter ──
          if (
            player.selectedClass === "warrior" &&
            player.comboCount >= 2 &&
            player.comboTimer > 0 &&
            Date.now() - player.comboTimer < 2200
          ) {
            const comboText = `x${player.comboCount} COMBO`;
            const isBonusReady = player.comboBonusActive;
            const cx = screenX + TILE_SIZE / 2;
            // Float upward slightly with time
            const floatY =
              screenY - 38 - Math.sin((timestamp / 400) % Math.PI) * 3;
            ctx.save();
            ctx.font = `bold ${isBonusReady ? 14 : 11}px 'JetBrains Mono', monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = isBonusReady ? "#FFD700" : "#FF8C00";
            ctx.shadowColor = isBonusReady ? "#FFD700" : "#FF6000";
            ctx.shadowBlur = isBonusReady ? 10 : 5;
            ctx.fillText(comboText, cx, floatY);
            if (isBonusReady) {
              ctx.font = "bold 9px 'JetBrains Mono', monospace";
              ctx.fillStyle = "#FFFFA0";
              ctx.fillText("+25% BONUS!", cx, floatY + 14);
            }
            ctx.restore();
          }
          // Restore death animation context transform if active
          if (_deathCtxSaved) ctx.restore();
          // ── Player status effect icons: shield (warrior) + respawn immunity ──
          {
            const playerStatusEffects: StatusEffect[] = [];
            const ps = player as unknown as {
              shieldActive?: boolean;
              shieldDuration?: number;
            };
            if (ps.shieldActive && player.selectedClass === "warrior") {
              playerStatusEffects.push({
                type: "shield",
                durationRatio: ps.shieldDuration
                  ? Math.min(1, ps.shieldDuration / 60000)
                  : 0.5,
              });
            }
            if (state.pvpImmunityTimer > 0 || state.respawnImmunityTimer > 0) {
              playerStatusEffects.push({
                type: "respawn_immunity",
                durationRatio: Math.min(
                  1,
                  Math.max(state.pvpImmunityTimer, state.respawnImmunityTimer) /
                    10000,
                ),
              });
            }
            if (playerStatusEffects.length > 0) {
              drawStatusEffectIcons(ctx, screenX, screenY, playerStatusEffects);
            }
          }
        },
      });

      // NPCs in current zone
      const zoneNpcs = WORLD_CONFIG.npcsByZone[state.currentZoneId] ?? [];
      for (const npc of zoneNpcs) {
        const nx = Math.floor(npc.tileX * TILE_SIZE - camX);
        const ny = Math.floor(npc.tileY * TILE_SIZE - camY);
        if (
          nx > -TILE_SIZE * 3 &&
          nx < CANVAS_W + TILE_SIZE * 3 &&
          ny > -TILE_SIZE * 3 &&
          ny < CANVAS_H + TILE_SIZE * 3
        ) {
          const npcBob = Math.round(
            Math.sin((timestamp / 2800) * Math.PI * 2 + npc.tileX * 0.5) * 2,
          );
          const playerDist = Math.sqrt(
            (player.tileX - npc.tileX) ** 2 + (player.tileY - npc.tileY) ** 2,
          );
          const isHighlighted = playerDist <= 2.5;
          const isDialogueOpen = state.activeNpcDialogue?.npcId === npc.id;
          const npcCopy = npc;
          // Compute quest availability for bouncing "!" indicator
          const npcQuestId = QUEST_GIVERS[npc.id];
          const npcHasQuest = !!(
            npcQuestId &&
            state.activeQuest?.id !== npcQuestId &&
            !state.completedQuestIds.includes(npcQuestId) &&
            isQuestAvailableForClass(npcQuestId, selectedClass)
          );
          const npcTs = timestamp;
          renderQueue.push({
            sortY: ny,
            draw: () =>
              drawNpc(
                ctx,
                nx,
                ny,
                npcCopy.spriteType,
                npcBob,
                isHighlighted,
                isDialogueOpen,
                npcHasQuest,
                npcTs,
              ),
          });
        }
      }

      // Checkpoint stone for this zone (if any)
      {
        const stonePos = CHECKPOINT_STONE_POSITIONS[state.currentZoneId];
        if (stonePos) {
          const snx = Math.floor(stonePos.x * TILE_SIZE - camX);
          const sny = Math.floor(stonePos.y * TILE_SIZE - camY);
          if (
            snx > -TILE_SIZE * 2 &&
            snx < CANVAS_W + TILE_SIZE * 2 &&
            sny > -TILE_SIZE * 2 &&
            sny < CANVAS_H + TILE_SIZE * 2
          ) {
            const isActivated =
              state.checkpointActive &&
              state.checkpoint?.zoneId === state.currentZoneId &&
              state.checkpoint?.x === stonePos.x &&
              state.checkpoint?.y === stonePos.y;
            const playerDist = Math.sqrt(
              (player.tileX - stonePos.x) ** 2 +
                (player.tileY - stonePos.y) ** 2,
            );
            const playerNear = playerDist <= 1.8;
            const stoneTs = timestamp;
            const stoneSnx = snx;
            const stoneSny = sny;
            renderQueue.push({
              sortY: sny,
              draw: () =>
                drawCheckpointStone(
                  ctx,
                  stoneSnx,
                  stoneSny,
                  isActivated,
                  playerNear,
                  stoneTs,
                ),
            });
            // Checkpoint interaction: if player near and not yet activated,
            // trigger on tap via the "canvas_tap_interact" event
            if (playerNear && !isActivated && !state.player.isGuest) {
              // Show floating hint
              ctx.save();
              ctx.font = "10px 'JetBrains Mono', monospace";
              ctx.fillStyle = "rgba(200,200,255,0.85)";
              ctx.textAlign = "center";
              ctx.fillText(
                "Tap to set checkpoint",
                stoneSnx + TILE_SIZE / 2,
                sny - 4,
              );
              ctx.restore();
            }
          }
        }
      }

      // Monsters
      for (const monster of state.monsters) {
        if (monster.state === "dead") {
          // Spawn death fragment particles once per monster death
          if (!monsterDeathParticleRef.current.has(monster.id)) {
            monsterDeathParticleRef.current.add(monster.id);
            const dmx = Math.floor(monster.x * TILE_SIZE - camX);
            const dmy = Math.floor(monster.y * TILE_SIZE - camY);
            if (
              dmx > -TILE_SIZE &&
              dmx < CANVAS_W + TILE_SIZE &&
              dmy > -TILE_SIZE &&
              dmy < CANVAS_H + TILE_SIZE
            ) {
              spawnMonsterDeathParticles(dmx, dmy, monster.type);
            }
            // Clean up the tracking Set so it doesn't grow unboundedly
            if (monsterDeathParticleRef.current.size > 50)
              monsterDeathParticleRef.current.clear();
          }
          // Clean up tracking when monster dies
          monsterLastDamageRef.current.delete(monster.id);
          continue;
        }
        // Monster came back alive — remove from death-particle set
        monsterDeathParticleRef.current.delete(monster.id);
        // Track HP decreases to drive HP bar visibility
        const prevHp = monsterLastDamageRef.current.get(`hp_${monster.id}`);
        if (prevHp !== undefined && monster.hp < prevHp) {
          monsterLastDamageRef.current.set(monster.id, now);
        }
        // Always store current HP for next frame comparison
        monsterLastDamageRef.current.set(`hp_${monster.id}`, monster.hp);

        const mx = Math.floor(
          (monster.x + (monster.knockbackOffsetX ?? 0)) * TILE_SIZE - camX,
        );
        const my = Math.floor(
          (monster.y + (monster.knockbackOffsetY ?? 0)) * TILE_SIZE - camY,
        );
        // ── Idle bob — slow vertical sine wave (2px, ~1s cycle). Bosses excluded. ──
        const BOSS_TYPES_SET = new Set([
          "stone_warden",
          "ship_captain",
          "ancient_guardian",
        ]);
        const isBossType = BOSS_TYPES_SET.has(monster.type);
        const monsterBobY = isBossType
          ? 0
          : Math.round(Math.sin(timestamp / 500 + monster.x * 0.7) * 2);
        // ── Low HP flicker: toggle visibility every ~100ms below 20% HP ──
        const monsterLowHp =
          monster.maxHp > 0 && monster.hp / monster.maxHp < 0.2;
        const flickerHide =
          monsterLowHp && Math.floor(timestamp / 100) % 2 === 0;
        if (
          mx > -TILE_SIZE * 3 &&
          mx < CANVAS_W + TILE_SIZE * 3 &&
          my > -TILE_SIZE * 3 &&
          my < CANVAS_H + TILE_SIZE * 3
        ) {
          const mFlash = (monsterHitFlashRef.current.get(monster.id) ?? 0) > 0;
          const mCopy: MonsterEntity = monster;
          const mLastDmgTime = monsterLastDamageRef.current.get(monster.id);
          const mLastDmgAge =
            mLastDmgTime !== undefined ? now - mLastDmgTime : undefined;
          const mBobY = monsterBobY; // used inside closure via monsterBobY
          const mFlicker = flickerHide;
          renderQueue.push({
            sortY: my,
            draw: () => {
              // Low-HP flicker: skip draw entirely on odd frames
              if (mFlicker) return;
              // Hit reaction visual knockback offset (non-boss only)
              const [hrOffX, hrOffY] = isBossType
                ? [0, 0]
                : getHitReactionOffset(mCopy.id);
              const myB = my + mBobY + hrOffY;
              const mxB = mx + hrOffX;
              // ── Rare variant: apply golden tint via ctx.filter ──
              if (mCopy.isRare) {
                ctx.save();
                ctx.filter = "sepia(1) saturate(4) hue-rotate(30deg)";
              }
              // ── Elite monster: scale up 3x around sprite center ──
              if (mCopy.isElite) {
                const scale = mCopy.eliteScale ?? 3;
                const centerX = mxB + TILE_SIZE / 2;
                const centerY = myB + TILE_SIZE / 2;
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.scale(scale, scale);
                ctx.translate(-centerX, -centerY);
              }
              drawShadow(ctx, mxB, myB, 0.3);
              // ── Invasion monster: red glow overlay ──
              if (mCopy.isInvasionMonster) {
                ctx.shadowColor = "#FF4400";
                ctx.shadowBlur = 12;
              } else {
                ctx.shadowColor = "rgba(0,0,0,0.80)";
                ctx.shadowBlur = 3;
              }
              ctx.shadowOffsetY = 1;
              if (mCopy.type === "slime")
                drawSlime(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "sprite_wisp")
                drawSpriteWisp(
                  ctx,
                  mxB,
                  myB,
                  mCopy.animFrame,
                  mFlash,
                  timestamp,
                );
              else if (mCopy.type === "crystal_golem")
                drawCrystalGolem(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "spider")
                drawSpider(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "bat")
                drawBat(ctx, mxB, myB, mCopy.animFrame, mFlash, timestamp);
              else if (mCopy.type === "bear")
                drawBear(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else if (mCopy.type === "wolf")
                drawWolf(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else if (mCopy.type === "tiger")
                drawTiger(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else if (mCopy.type === "skeleton")
                drawSkeleton(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else if (mCopy.type === "cyclops")
                drawCyclops(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "shadow_wolf")
                drawShadowWolf(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else if (mCopy.type === "stone_golem")
                drawStoneGolem(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "cave_bat")
                drawCaveBat(ctx, mxB, myB, mCopy.animFrame, mFlash, timestamp);
              else if (mCopy.type === "cave_troll")
                drawCaveTroll(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "bog_witch")
                drawBogWitch(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "swamp_lurker")
                drawSwampLurker(ctx, mxB, myB, mCopy.animFrame, mFlash, false);
              else if (mCopy.type === "mud_golem")
                drawMudGolem(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "ruin_specter")
                drawRuinSpecter(
                  ctx,
                  mxB,
                  myB,
                  mCopy.animFrame,
                  mFlash,
                  timestamp,
                );
              else if (mCopy.type === "ancient_guardian")
                drawAncientGuardian(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "sky_serpent")
                drawSkySerpent(
                  ctx,
                  mxB,
                  myB,
                  mCopy.animFrame,
                  mFlash,
                  timestamp,
                );
              else if (mCopy.type === "cursed_sailor")
                drawCursedSailor(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else if (mCopy.type === "skeleton_gunner")
                drawSkeletonGunner(ctx, mxB, myB, mCopy.animFrame, mFlash);
              else if (mCopy.type === "cursed_navigator")
                drawCursedNavigator(
                  ctx,
                  mxB,
                  myB,
                  mCopy.animFrame,
                  mFlash,
                  timestamp,
                );
              else if (mCopy.type === "ship_captain")
                drawCursedSailor(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              else
                drawGoblin(
                  ctx,
                  mxB,
                  myB,
                  mCopy.facingDirection,
                  mCopy.animFrame,
                  mFlash,
                );
              // ── Aggro state: brief red tint overlay on sprite ──
              if (
                mCopy.state === "chasing" ||
                mCopy.state === "attacking" ||
                mCopy.isInvasionMonster
              ) {
                ctx.save();
                ctx.globalCompositeOperation = "source-atop";
                ctx.globalAlpha = 0.18 + Math.sin(timestamp * 0.006) * 0.06;
                ctx.fillStyle = "#ff2200";
                ctx.fillRect(mxB - 2, myB - 2, TILE_SIZE + 4, TILE_SIZE + 4);
                ctx.restore();
              }
              // Clear sprite outline shadow
              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              ctx.shadowOffsetY = 0;
              // ── Elite: restore scale transform ──
              if (mCopy.isElite) {
                ctx.restore();
              }
              drawMonsterHpBar(
                ctx,
                mxB,
                myB,
                mCopy.hp,
                mCopy.maxHp,
                mLastDmgAge,
              );
              drawMonsterNameplate(
                ctx,
                mxB,
                myB,
                mCopy.type,
                player.level,
                mLastDmgAge,
              );
              {
                const statusEffects: StatusEffect[] = [];
                if ((mCopy.poisonTicksRemaining ?? 0) > 0) {
                  statusEffects.push({
                    type: "poison",
                    durationRatio: Math.min(
                      1,
                      (mCopy.poisonTicksRemaining ?? 0) / 4,
                    ),
                  });
                }
                drawStatusEffectIcons(ctx, mxB, myB, statusEffects);
              }
              {
                const skullColor = getSkullColor(mCopy.type, player.level);
                drawDifficultySkull(ctx, mxB + 2, myB - 12, skullColor);
              }
              if ((mCopy.aggroIndicatorTimer ?? 0) > 0) {
                ctx.save();
                ctx.font = "bold 15px 'JetBrains Mono', monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                ctx.fillStyle = "#ff2222";
                ctx.shadowColor = "#ff0000";
                ctx.shadowBlur = 4;
                ctx.fillText("!", mxB + TILE_SIZE / 2, myB - 20);
                ctx.shadowBlur = 0;
                ctx.restore();
              }
              // ── Elite: draw gold crown above name ──
              if (mCopy.isElite) {
                ctx.save();
                ctx.font = "bold 10px 'JetBrains Mono', monospace";
                ctx.textAlign = "center";
                ctx.fillStyle = "#FFD700";
                ctx.shadowColor = "#FFD700";
                ctx.shadowBlur = 8;
                ctx.fillText("👑 ELITE", mxB + TILE_SIZE / 2, myB - 30);
                ctx.shadowBlur = 0;
                ctx.restore();
              }
              // ── Rare: restore filter and draw crown above HP bar ──
              if (mCopy.isRare) {
                ctx.restore(); // remove golden filter
                // Crown nameplate
                ctx.save();
                ctx.font = "bold 9px 'JetBrains Mono', monospace";
                ctx.textAlign = "center";
                ctx.fillStyle = "#FFD700";
                ctx.shadowColor = "#FFD700";
                ctx.shadowBlur = 6;
                ctx.fillText("\u{1F451} RARE", mxB + TILE_SIZE / 2, myB - 22);
                ctx.restore();
              }
            },
          });
        }
      }

      // ── Boss rendering (Stone Warden — 2x2 tiles) ──
      if (state.boss && state.currentZoneId === "boss_chamber") {
        const boss: BossEntity = state.boss;
        const bx = Math.floor(boss.x * TILE_SIZE - camX);
        const by = Math.floor(boss.y * TILE_SIZE - camY);
        if (
          bx > -TILE_SIZE * 4 &&
          bx < CANVAS_W + TILE_SIZE * 4 &&
          by > -TILE_SIZE * 4 &&
          by < CANVAS_H + TILE_SIZE * 4
        ) {
          const bossCopy = boss;
          renderQueue.push({
            sortY: by + TILE_SIZE,
            draw: () => {
              if (bossCopy.phase === "dead") return;
              const bossW = TILE_SIZE * 2;
              const bossH = TILE_SIZE * 2;
              const pulse = Math.sin(timestamp * 0.003) * 0.05 + 0.95;
              ctx.save();
              ctx.globalAlpha = bossCopy.phase === "idle" ? 0.85 * pulse : 1.0;

              // Shadow
              ctx.globalAlpha = 0.35;
              ctx.fillStyle = "rgba(0,0,0,1)";
              ctx.beginPath();
              ctx.ellipse(
                bx + bossW / 2,
                by + bossH + 4,
                bossW / 2,
                8,
                0,
                0,
                Math.PI * 2,
              );
              ctx.fill();
              ctx.globalAlpha = bossCopy.phase === "idle" ? 0.85 * pulse : 1.0;

              // Body (dark stone grey)
              const bodyColor = bossCopy.enraged ? "#8a2a1e" : "#5a5a6a";
              const darkColor = bossCopy.enraged ? "#5a1a10" : "#3a3a4a";
              const highlightColor = bossCopy.enraged ? "#cc5540" : "#7a7a8a";

              // Stone body
              ctx.fillStyle = bodyColor;
              ctx.fillRect(bx + 2, by + 4, bossW - 4, bossH - 4);
              // Darker border
              ctx.strokeStyle = darkColor;
              ctx.lineWidth = 3;
              ctx.strokeRect(bx + 2, by + 4, bossW - 4, bossH - 4);
              // Stone texture (cracks)
              ctx.strokeStyle = darkColor;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(bx + 16, by + 8);
              ctx.lineTo(bx + 24, by + 20);
              ctx.moveTo(bx + 34, by + 12);
              ctx.lineTo(bx + 42, by + 22);
              ctx.moveTo(bx + 10, by + 32);
              ctx.lineTo(bx + 20, by + 44);
              ctx.stroke();

              // Highlights on top
              ctx.fillStyle = highlightColor;
              ctx.fillRect(bx + 4, by + 6, bossW - 8, 4);

              // Eyes (glowing)
              ctx.fillStyle = bossCopy.enraged ? "#ff4400" : "#ff8800";
              ctx.beginPath();
              ctx.arc(bx + 18, by + 18, 5, 0, Math.PI * 2);
              ctx.arc(bx + 45, by + 18, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "#ffdd00";
              ctx.beginPath();
              ctx.arc(bx + 18, by + 18, 2, 0, Math.PI * 2);
              ctx.arc(bx + 45, by + 18, 2, 0, Math.PI * 2);
              ctx.fill();

              ctx.restore();

              // ── Boss enrage visual: pulsing red aura + rotating speed lines ──
              if (bossCopy.enraged) {
                ctx.save();
                const bcxE = bx + bossW / 2;
                const bcyE = by + bossH / 2;
                const enragePulse =
                  0.25 + Math.abs(Math.sin(timestamp * 0.005)) * 0.2;
                ctx.globalAlpha = enragePulse;
                ctx.strokeStyle = "#cc1100";
                ctx.lineWidth = 6;
                ctx.shadowColor = "#ff2200";
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.ellipse(
                  bcxE,
                  bcyE,
                  bossW / 2 + 6,
                  bossH / 2 + 6,
                  0,
                  0,
                  Math.PI * 2,
                );
                ctx.stroke();
                ctx.shadowBlur = 0;
                // Speed lines
                ctx.globalAlpha = 0.5 + Math.sin(timestamp * 0.008) * 0.2;
                ctx.strokeStyle = "#ff4422";
                ctx.lineWidth = 2;
                ctx.lineCap = "round";
                const lineRot = (timestamp * 0.0008) % (Math.PI * 2);
                for (let si = 0; si < 7; si++) {
                  const ang = (si / 7) * Math.PI * 2 + lineRot;
                  const ir = bossW / 2 + 8;
                  const or =
                    ir + 12 + Math.sin(ang * 2 + timestamp * 0.004) * 4;
                  ctx.beginPath();
                  ctx.moveTo(
                    bcxE + Math.cos(ang) * ir,
                    bcyE + Math.sin(ang) * ir,
                  );
                  ctx.lineTo(
                    bcxE + Math.cos(ang) * or,
                    bcyE + Math.sin(ang) * or,
                  );
                  ctx.stroke();
                }
                ctx.restore();
              }

              // HP bar (large, centered under name)
              drawMonsterHpBar(ctx, bx, by, bossCopy.hp, bossCopy.maxHp);

              // Boss name tag
              ctx.save();
              ctx.font = "bold 9px 'JetBrains Mono', monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const bossLabel = bossCopy.enraged
                ? "⚠ THE STONE WARDEN ⚠"
                : "THE STONE WARDEN";
              const blw = ctx.measureText(bossLabel).width + 12;
              const bcx = bx + bossW / 2;
              const bly = by - 12;
              ctx.fillStyle = "rgba(0,0,0,0.88)";
              ctx.fillRect(bcx - blw / 2, bly - 8, blw, 14);
              ctx.fillStyle = bossCopy.enraged ? "#ff6644" : "#e8c870";
              ctx.fillText(bossLabel, bcx, bly - 1);
              ctx.restore();

              // Shockwave animation
              if (bossCopy.shockwaveStartTime > 0) {
                const swAge = timestamp - bossCopy.shockwaveStartTime;
                if (swAge < 600) {
                  const swProgress = swAge / 600;
                  const swRadius = 10 + swProgress * TILE_SIZE * 3;
                  const swAlpha = (1 - swProgress) * 0.7;
                  ctx.save();
                  ctx.globalAlpha = swAlpha;
                  ctx.strokeStyle = "#ffcc44";
                  ctx.lineWidth = 3 * (1 - swProgress);
                  ctx.beginPath();
                  ctx.arc(
                    bx + bossW / 2,
                    by + bossH / 2,
                    swRadius,
                    0,
                    Math.PI * 2,
                  );
                  ctx.stroke();
                  ctx.restore();
                }
              }

              // Boulder projectiles
              for (const proj of bossCopy.projectiles) {
                const px2 = Math.floor(proj.x * TILE_SIZE - camX);
                const py2 = Math.floor(proj.y * TILE_SIZE - camY);
                ctx.save();
                ctx.fillStyle = "#6a4020";
                ctx.strokeStyle = "#3a2010";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(px2 + 8, py2 + 8, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
              }
            },
          });
        }
      }

      // ── Ship Captain boss rendering (cursed_galleon) ──
      if (state.shipCaptainBoss && state.currentZoneId === "cursed_galleon") {
        const captain = state.shipCaptainBoss;
        const cbx = Math.floor(captain.x * TILE_SIZE - camX);
        const cby = Math.floor(captain.y * TILE_SIZE - camY);
        if (
          cbx > -TILE_SIZE * 4 &&
          cbx < CANVAS_W + TILE_SIZE * 4 &&
          cby > -TILE_SIZE * 4 &&
          cby < CANVAS_H + TILE_SIZE * 4
        ) {
          const captainCopy = captain;
          renderQueue.push({
            sortY: cby + TILE_SIZE,
            draw: () => {
              if (captainCopy.phase === "dead") return;
              try {
                ctx.save();
                const pulse = Math.sin(timestamp * 0.003) * 0.05 + 0.95;
                ctx.globalAlpha =
                  captainCopy.phase === "idle" ? 0.8 * pulse : 1.0;

                // Shadow
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = "rgba(0,0,0,1)";
                ctx.beginPath();
                ctx.ellipse(
                  cbx + TILE_SIZE,
                  cby + TILE_SIZE * 1.5 + 6,
                  TILE_SIZE * 0.7,
                  8,
                  0,
                  0,
                  Math.PI * 2,
                );
                ctx.fill();
                ctx.globalAlpha =
                  captainCopy.phase === "idle" ? 0.8 * pulse : 1.0;

                // Phase 2 / enraged: red glow aura
                if (captainCopy.enraged) {
                  ctx.globalAlpha = 0.25 + Math.sin(timestamp * 0.006) * 0.1;
                  ctx.fillStyle = "#cc2200";
                  ctx.beginPath();
                  ctx.ellipse(
                    cbx + TILE_SIZE,
                    cby + TILE_SIZE,
                    TILE_SIZE * 0.9,
                    TILE_SIZE * 0.8,
                    0,
                    0,
                    Math.PI * 2,
                  );
                  ctx.fill();
                  ctx.globalAlpha = 1;
                }

                // Captain body — tall figure in dark coat
                const bodyC = captainCopy.enraged ? "#5a1010" : "#2a2a3a";
                const coatC = captainCopy.enraged ? "#7a1818" : "#3a1a1a";
                const hatC = captainCopy.enraged ? "#4a0808" : "#1a1a1a";

                // Coat body
                ctx.fillStyle = bodyC;
                ctx.fillRect(cbx + 8, cby + 12, 18, 26);
                ctx.fillStyle = coatC;
                ctx.fillRect(cbx + 9, cby + 13, 16, 24);
                // Coat lapels
                ctx.fillStyle = "#c8a850";
                ctx.fillRect(cbx + 9, cby + 14, 4, 12);
                ctx.fillRect(cbx + 21, cby + 14, 4, 12);
                // Buttons
                ctx.fillStyle = "#ffe080";
                for (let bi = 0; bi < 4; bi++) {
                  ctx.fillRect(cbx + 16, cby + 16 + bi * 5, 2, 2);
                }

                // Legs with boots
                ctx.fillStyle = "#1a1a2a";
                ctx.fillRect(cbx + 10, cby + 36, 7, 10);
                ctx.fillRect(cbx + 18, cby + 36, 7, 10);
                ctx.fillStyle = "#0a0a14";
                ctx.fillRect(cbx + 9, cby + 44, 9, 4);
                ctx.fillRect(cbx + 17, cby + 44, 9, 4);

                // Sword arm extended
                ctx.fillStyle = coatC;
                ctx.fillRect(cbx + 2, cby + 16, 8, 6);
                ctx.fillStyle = "#c8c0b0";
                ctx.fillRect(cbx - 2, cby + 14, 3, 18);
                ctx.fillStyle = "#e0d8c8";
                ctx.fillRect(cbx - 2, cby + 14, 3, 4);
                // Cutlass guard
                ctx.fillStyle = "#a08830";
                ctx.fillRect(cbx - 4, cby + 22, 7, 3);

                // Head
                ctx.fillStyle = "oklch(0.72 0.06 50)";
                ctx.fillRect(cbx + 10, cby + 4, 14, 12);
                // Face detail
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                ctx.fillRect(cbx + 12, cby + 8, 3, 3);
                ctx.fillRect(cbx + 18, cby + 8, 3, 3);
                ctx.fillRect(cbx + 12, cby + 12, 10, 2);

                // Tricorn hat
                ctx.fillStyle = hatC;
                ctx.fillRect(cbx + 7, cby + 1, 20, 5);
                ctx.fillRect(cbx + 10, cby - 2, 14, 4);
                ctx.fillStyle = "#c8a030";
                ctx.fillRect(cbx + 8, cby + 1, 18, 2);

                // Enraged glow eyes
                if (captainCopy.enraged) {
                  ctx.fillStyle = "#ff4400";
                  ctx.beginPath();
                  ctx.arc(cbx + 13, cby + 10, 2, 0, Math.PI * 2);
                  ctx.arc(cbx + 20, cby + 10, 2, 0, Math.PI * 2);
                  ctx.fill();
                }

                // Arc attack shockwave visual
                if (captainCopy.shockwaveStartTime > 0) {
                  const swAge = timestamp - captainCopy.shockwaveStartTime;
                  if (swAge < 400) {
                    const swP = swAge / 400;
                    const swR = 8 + swP * TILE_SIZE * 2.5;
                    ctx.globalAlpha = (1 - swP) * 0.8;
                    ctx.strokeStyle = "#ffd040";
                    ctx.lineWidth = 4 * (1 - swP);
                    // Wide arc: draw 180-degree semicircle toward player
                    ctx.beginPath();
                    ctx.arc(
                      cbx + TILE_SIZE,
                      cby + TILE_SIZE,
                      swR,
                      -Math.PI * 0.75,
                      Math.PI * 0.75,
                    );
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                  }
                }

                ctx.restore();

                // HP bar and name
                drawMonsterHpBar(
                  ctx,
                  cbx,
                  cby,
                  captainCopy.hp,
                  captainCopy.maxHp,
                );
                ctx.save();
                ctx.font = "bold 9px 'JetBrains Mono', monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const captainLabel = captainCopy.enraged
                  ? "⚠ SHIP CAPTAIN ⚠"
                  : "SHIP CAPTAIN";
                const clw = ctx.measureText(captainLabel).width + 12;
                const clx2 = cbx + TILE_SIZE;
                const cly2 = cby - 12;
                ctx.fillStyle = "rgba(0,0,0,0.88)";
                ctx.fillRect(clx2 - clw / 2, cly2 - 8, clw, 14);
                ctx.fillStyle = captainCopy.enraged ? "#ff6644" : "#e8c870";
                ctx.fillText(captainLabel, clx2, cly2 - 1);
                ctx.restore();
              } catch {
                /* non-fatal */
              }
            },
          });
        }
      }

      for (const drop of state.lootDrops) {
        if (drop.zone !== state.currentZoneId) continue;
        if (drop.collected) continue;
        const lx = Math.floor(drop.x * TILE_SIZE - camX);
        const ly = Math.floor(drop.y * TILE_SIZE - camY);

        // ── Sparkle animation for chest-type drops ──
        const isChestDrop =
          drop.id.startsWith("chest_") || drop.id.startsWith("hidden_chest_");
        if (isChestDrop && Math.random() < 0.15) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.3 + Math.random() * 0.5;
          addPhysicsParticle({
            x: lx + 16 + (Math.random() - 0.5) * 8,
            y: ly + 8,
            r: 1.5 + Math.random(),
            color: Math.random() < 0.5 ? "#FFD700" : "#FFEC70",
            alpha: 0.9,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.0,
            gravity: 0.02,
          });
        }

        const playerDistLoot = Math.sqrt(
          (player.tileX - drop.x) ** 2 + (player.tileY - drop.y) ** 2,
        );

        // Auto-collect when player walks onto or very near the drop (1.2 tiles)
        if (playerDistLoot <= 1.2 && !drop.collected) {
          lootPopAnimsRef.current.push({
            id: drop.id,
            x: lx,
            y: ly,
            item: { ...drop.item },
            progress: 0,
          });
          // Let collectLootDrop handle atomic removal + reward (no pre-set)
          collectLootDrop(state, drop.id, player.tileX, player.tileY);
          continue;
        }

        if (
          lx > -TILE_SIZE * 2 &&
          lx < CANVAS_W + TILE_SIZE &&
          ly > -TILE_SIZE * 2 &&
          ly < CANVAS_H + TILE_SIZE
        ) {
          const dropCopy: LootDrop = drop;
          const isNear = playerDistLoot <= 3.0;
          renderQueue.push({
            sortY: ly + TILE_SIZE,
            draw: () => drawLootDrop(ctx, lx, ly, dropCopy, timestamp, isNear),
          });
        }
      }

      // ── Render interactable objects (below player layer) ──
      if (state.interactableObjects && state.interactableObjects.length > 0) {
        for (const obj of state.interactableObjects) {
          const ix = Math.floor(obj.x * TILE_SIZE - camX);
          const iy = Math.floor(obj.y * TILE_SIZE - camY);
          if (
            ix > -TILE_SIZE &&
            ix < CANVAS_W + TILE_SIZE &&
            iy > -TILE_SIZE &&
            iy < CANVAS_H + TILE_SIZE
          ) {
            drawInteractable(ctx, ix, iy, obj.type, obj.state, now);
          }
        }
      }

      // ── Render environmental hazards ──
      if (state.hazards && state.hazards.length > 0) {
        for (const hz of state.hazards) {
          if (!hz.active && hz.rockPhase !== "falling") continue;
          const hx = Math.floor(hz.x * TILE_SIZE - camX);
          const hy = Math.floor(hz.y * TILE_SIZE - camY);
          if (
            hx > -TILE_SIZE * 2 &&
            hx < CANVAS_W + TILE_SIZE &&
            hy > -TILE_SIZE * 2 &&
            hy < CANVAS_H + TILE_SIZE
          ) {
            drawHazard(
              ctx,
              hx,
              hy,
              hz.type,
              hz.rockPhase,
              now,
              hz.rockStartTime,
            );
          }
        }
      }

      // ── Interaction highlight rings (NPCs, portals, loot) ──
      (function renderInteractionHighlights() {
        const px = player.tileX;
        const py = player.tileY;

        function drawInteractionRing(ix: number, iy: number, hexColor: string) {
          const pulse = 0.5 + Math.sin(Date.now() / 500) * 0.5;
          const radius = 18 + pulse * 4;
          const alpha = 0.4 + pulse * 0.4;
          // Convert #rrggbb or #rgb to rgba; fall back gracefully
          let r = 170;
          let g = 170;
          let b = 255;
          if (hexColor?.startsWith("#")) {
            const h = hexColor.slice(1);
            if (h.length === 6) {
              r = Number.parseInt(h.slice(0, 2), 16);
              g = Number.parseInt(h.slice(2, 4), 16);
              b = Number.parseInt(h.slice(4, 6), 16);
            } else if (h.length === 3) {
              r = Number.parseInt(h[0] + h[0], 16);
              g = Number.parseInt(h[1] + h[1], 16);
              b = Number.parseInt(h[2] + h[2], 16);
            }
          }
          if (!ctx) return;
          ctx.save();
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ix, iy, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // NPCs
        const npcs = WORLD_CONFIG.npcsByZone[state.currentZoneId] ?? [];
        for (const npc of npcs) {
          const dist = Math.sqrt((px - npc.tileX) ** 2 + (py - npc.tileY) ** 2);
          if (dist <= 1.5) {
            const sx = npc.tileX * TILE_SIZE - camX + TILE_SIZE / 2;
            const sy = npc.tileY * TILE_SIZE - camY + TILE_SIZE / 2;
            drawInteractionRing(sx, sy, "#ffffff");
          }
        }

        // Portals (use zoneTransitions point triggers + portalColorMap)
        for (const zt of zoneTransitions) {
          const tt = zt.triggerTile;
          if (!("x" in tt && "y" in tt)) continue;
          const tile = world.tiles[tt.y]?.[tt.x];
          if (tile !== TileType.PORTAL) continue;
          const dist = Math.sqrt((px - tt.x) ** 2 + (py - tt.y) ** 2);
          if (dist <= 1.5) {
            const color =
              portalColorMap.get(`${tt.x},${tt.y}`) ??
              getPortalDestLabel(zt.toZone).color ??
              "#aaaaff";
            const sx = tt.x * TILE_SIZE - camX + TILE_SIZE / 2;
            const sy = tt.y * TILE_SIZE - camY + TILE_SIZE / 2;
            drawInteractionRing(sx, sy, color);
          }
        }

        // Ground loot drops
        for (const drop of state.lootDrops) {
          if (drop.zone !== state.currentZoneId) continue;
          if (drop.collected) continue;
          const dist = Math.sqrt((px - drop.x) ** 2 + (py - drop.y) ** 2);
          if (dist <= 1) {
            const sx = drop.x * TILE_SIZE - camX + TILE_SIZE / 2;
            const sy = drop.y * TILE_SIZE - camY + TILE_SIZE / 2;
            drawInteractionRing(sx, sy, "#ffdd44");
          }
        }
      })();

      // Y-sort and draw
      renderQueue.sort((a, b) => a.sortY - b.sortY);
      for (const entity of renderQueue) entity.draw();

      // ── Death animations ──
      for (const [id, anim] of _deathAnims) {
        anim.progress = Math.min(
          1,
          (now - anim.startedAt) / DEATH_ANIM_DURATION,
        );
        if (!anim.fragmentsSpawned && anim.progress >= 0.1) {
          anim.fragmentsSpawned = true;
          spawnMonsterDeathParticles(anim.x, anim.y, anim.monsterType);
        }
        if (anim.progress < 1) drawDeathAnim(ctx, anim);
        else _deathAnims.delete(id);
      }
      for (const monster of state.monsters) {
        if (monster.state === "dead" && !_deathAnims.has(monster.id)) {
          _deathAnims.set(monster.id, {
            id: monster.id,
            type: getDeathAnimType(monster.type),
            x: Math.floor(monster.x * TILE_SIZE - camX),
            y: Math.floor(monster.y * TILE_SIZE - camY),
            progress: 0,
            startedAt: now,
            monsterType: monster.type,
            fragmentsSpawned: false,
          });
        }
      }
      // ── Physics particles ──
      updateAndDrawPhysicsParticles(ctx, dt);
      // ── Spell impacts ──
      drawSpellImpacts(ctx, now);
      // ── Healing potion detection ──
      {
        const pc = state.potionCount;
        if (_lastPotionCount >= 0 && pc < _lastPotionCount) {
          const hx =
            Math.floor(player.tileX * TILE_SIZE + player.pixelOffsetX - camX) +
            TILE_SIZE / 2;
          const hy =
            Math.floor(player.tileY * TILE_SIZE + player.pixelOffsetY - camY) +
            TILE_SIZE / 2;
          for (let hi = 0; hi < spellMax(6); hi++) {
            const ha = (hi / 6) * Math.PI * 2;
            addPhysicsParticle({
              x: hx + Math.cos(ha) * 6,
              y: hy + Math.sin(ha) * 6,
              r: 3 + Math.random() * 2,
              color: hi % 2 === 0 ? "#44ee88" : "#88ffaa",
              alpha: 1.0,
              vx: Math.cos(ha) * 0.8,
              vy: -1.5 - Math.random(),
              gravity: 0.03,
            });
          }
          _healingOutlineTimer = 300;
        }
        _lastPotionCount = pc;
        if (_healingOutlineTimer > 0)
          _healingOutlineTimer = Math.max(0, _healingOutlineTimer - dt);
      }
      // ── Boss warning circle ──
      {
        const wBoss =
          state.currentZoneId === "boss_chamber" ? state.boss : null;
        if (wBoss && wBoss.boulderWarningStartTime > 0) {
          const wProg = Math.min(
            1,
            (now - wBoss.boulderWarningStartTime) / 500,
          );
          const wCx =
            Math.floor(wBoss.boulderWarningTargetX * TILE_SIZE - camX) +
            TILE_SIZE / 2;
          const wCy =
            Math.floor(wBoss.boulderWarningTargetY * TILE_SIZE - camY) +
            TILE_SIZE / 2;
          const wR = Math.max(2, wProg * 22);
          const wPulse = 0.5 + Math.sin(now * 0.02) * 0.25;
          ctx.save();
          ctx.globalAlpha = wPulse * (1 - wProg * 0.3);
          ctx.strokeStyle = "#FF2200";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(wCx, wCy, wR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = wPulse * 0.15;
          ctx.fillStyle = "#FF2200";
          ctx.beginPath();
          ctx.arc(wCx, wCy, wR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // ── PVP gold drops — rendered above sorted entities ──
      if (state.pvpGoldDrops.length > 0) {
        const toRemovePvp: string[] = [];
        for (const pgd of state.pvpGoldDrops) {
          const pgAge = now - pgd.spawnTime;
          // Auto-collect when player walks near (within 1.2 tiles)
          const pgDist = Math.sqrt(
            (player.tileX - pgd.x) ** 2 + (player.tileY - pgd.y) ** 2,
          );
          if (pgDist <= 1.2) {
            state.player.coins += pgd.amount;
            toRemovePvp.push(pgd.id);
            // Spawn coin pop animation
            const pgSx = Math.floor(pgd.x * TILE_SIZE - camX);
            const pgSy = Math.floor(pgd.y * TILE_SIZE - camY);
            lootPopAnimsRef.current.push({
              id: pgd.id,
              x: pgSx,
              y: pgSy,
              item: { id: pgd.id, itemType: "coin", amount: pgd.amount },
              progress: 0,
            });
            continue;
          }
          // Despawn after 60s
          if (pgAge > 60000) {
            toRemovePvp.push(pgd.id);
            continue;
          }
          // Fade out during last 10s
          const fadeAlpha =
            pgAge > 50000 ? Math.max(0, 1 - (pgAge - 50000) / 10000) : 1;
          const pgSx = Math.floor(pgd.x * TILE_SIZE - camX);
          const pgSy = Math.floor(pgd.y * TILE_SIZE - camY);
          if (
            pgSx > -TILE_SIZE &&
            pgSx < CANVAS_W + TILE_SIZE &&
            pgSy > -TILE_SIZE &&
            pgSy < CANVAS_H + TILE_SIZE
          ) {
            ctx.save();
            ctx.globalAlpha = fadeAlpha;
            const bounce = Math.sin(timestamp * 0.005 + pgd.x) * 2;
            // Gold coin sprite
            ctx.fillStyle = "#FFD700";
            ctx.shadowColor = "#FFD700";
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(
              pgSx + TILE_SIZE / 2,
              pgSy + TILE_SIZE / 2 + bounce,
              6,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            ctx.strokeStyle = "#CC9900";
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 0;
            ctx.stroke();
            // Gold coin inner circle
            ctx.fillStyle = "#FFE855";
            ctx.beginPath();
            ctx.arc(
              pgSx + TILE_SIZE / 2,
              pgSy + TILE_SIZE / 2 + bounce,
              3,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            // Amount label
            ctx.font = "bold 8px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#FFD700";
            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 3;
            ctx.fillText(
              `${pgd.amount}g`,
              pgSx + TILE_SIZE / 2,
              pgSy + TILE_SIZE / 2 + bounce - 12,
            );
            ctx.restore();
          }
        }
        if (toRemovePvp.length > 0) {
          state.pvpGoldDrops = state.pvpGoldDrops.filter(
            (d) => !toRemovePvp.includes(d.id),
          );
        }
      }

      // ── Expire PVP kill notification ──
      if (
        state.pvpKillNotification &&
        Date.now() > state.pvpKillNotification.expiresAt
      ) {
        state.pvpKillNotification = null;
      }

      // ── Auto-deselect target if they left the player list ──
      if (state.targetedPlayerUsername) {
        const stillOnline = state.otherPlayers.some(
          (p) => p.username === state.targetedPlayerUsername,
        );
        if (!stillOnline) state.targetedPlayerUsername = null;
      }

      // ── Loot pop animations (drawn above sorted entities) ──
      lootPopAnimsRef.current = lootPopAnimsRef.current.filter(
        (anim) => anim.progress < 1,
      );
      for (const anim of lootPopAnimsRef.current) {
        // Expanding ring + fading orb — anim.x/y are screen-space pixels
        const isCoinPop = anim.item.itemType === "coin";
        const midColor = isCoinPop ? "#FFD700" : "#90E0FF";
        const hiColor = isCoinPop ? "#FFF0A0" : "#C0F0FF";
        const pcx = anim.x + TILE_SIZE / 2;
        const pcy = anim.y + 20;
        const scale = 1.0 + anim.progress * 0.55;
        const opacity = Math.max(0, 1 - anim.progress * 1.15);
        const radius = Math.round(8 * scale);
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = midColor;
        ctx.lineWidth = 2.5 * (1 - anim.progress * 0.7);
        ctx.beginPath();
        ctx.arc(pcx, pcy, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        const popGrad = ctx.createRadialGradient(
          pcx - 2,
          pcy - 2,
          1,
          pcx,
          pcy,
          radius,
        );
        popGrad.addColorStop(0, hiColor);
        popGrad.addColorStop(0.6, midColor);
        popGrad.addColorStop(1, "rgba(0,0,0,0.1)");
        ctx.fillStyle = popGrad;
        ctx.beginPath();
        ctx.arc(pcx, pcy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Floating "+coins" / "+item" text rising above the orb
        const textRise = anim.progress * 22;
        const textOpacity = Math.max(0, 1 - anim.progress * 1.4);
        ctx.globalAlpha = textOpacity;
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const popLabel = isCoinPop
          ? `+${anim.item.amount} coins`
          : `+${anim.item.itemType.replace(/_/g, " ")}`;
        // Shadow stroke
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.lineWidth = 3;
        ctx.strokeText(popLabel, pcx, pcy - 14 - textRise);
        ctx.fillStyle = isCoinPop ? "#FFD700" : "#88CCFF";
        ctx.fillText(popLabel, pcx, pcy - 14 - textRise);

        ctx.restore();
        anim.progress = Math.min(1, anim.progress + dt / LOOT_POP_DURATION_MS);
      }

      // Floating damage numbers
      ctx.save();
      for (const dmg of damageNumbersRef.current) {
        const maxAge = dmg.isFirstKillBonus
          ? 1200
          : dmg.isGoldPickup
            ? 900
            : dmg.isInteractText
              ? 1400
              : 600;
        const t = dmg.age / maxAge;
        ctx.globalAlpha = t < 0.6 ? 1.0 : 1.0 - (t - 0.6) / 0.4;
        const isCrit = dmg.isCrit === true;
        const isHeal = dmg.isHeal === true;

        if (dmg.isInteractText && dmg.interactMessage) {
          // Interact result text: white on dark
          ctx.font = "bold 11px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.strokeStyle = "rgba(0,0,0,0.95)";
          ctx.lineWidth = 3;
          ctx.fillStyle = "#FFEEAA";
          ctx.shadowColor = "#AA8833";
          ctx.shadowBlur = 6;
          ctx.strokeText(dmg.interactMessage, dmg.x, dmg.y - t * 20);
          ctx.fillText(dmg.interactMessage, dmg.x, dmg.y - t * 20);
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
        } else if (dmg.isFirstKillBonus) {
          // Special first kill bonus render: two-line text
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "bold 14px 'JetBrains Mono', monospace";
          ctx.shadowColor = "#FFD700";
          ctx.shadowBlur = 10;
          ctx.strokeStyle = "rgba(0,0,0,0.9)";
          ctx.lineWidth = 4;
          ctx.fillStyle = "#44ee66";
          const line1 = `+${dmg.value} XP`;
          const line2 = "First Kill! x2 XP!";
          ctx.strokeText(line1, dmg.x, dmg.y - 8);
          ctx.fillText(line1, dmg.x, dmg.y - 8);
          ctx.font = "bold 11px 'JetBrains Mono', monospace";
          ctx.fillStyle = "#FFD700";
          ctx.strokeText(line2, dmg.x, dmg.y + 10);
          ctx.fillText(line2, dmg.x, dmg.y + 10);
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
        } else if (dmg.isGoldPickup) {
          // Gold pickup: "+N gold" in gold color
          ctx.font = "bold 12px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.strokeStyle = "rgba(0,0,0,0.9)";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#FFD700";
          ctx.shadowBlur = 6;
          ctx.fillStyle = "#FFD700";
          ctx.strokeText(`+${dmg.value} gold`, dmg.x, dmg.y);
          ctx.fillText(`+${dmg.value} gold`, dmg.x, dmg.y);
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
        } else {
          const fontSize = isCrit ? 18 : 12;
          ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.strokeStyle = "rgba(0,0,0,0.9)";
          ctx.lineWidth = isCrit ? 4 : 3;
          const prefix = isHeal ? "+" : "-";
          const suffix = isCrit ? "!" : "";
          const dmgText = `${prefix}${dmg.value}${suffix}`;
          const color = isHeal
            ? "#44ff44"
            : getDamageColor(dmg.spellType, dmg.isPlayer);
          if (isCrit) {
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 8;
          }
          ctx.fillStyle = color;
          ctx.strokeText(dmgText, dmg.x, dmg.y);
          ctx.fillText(dmgText, dmg.x, dmg.y);
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
        }
      }
      ctx.restore();

      // ── Zone atmosphere (underground vs surface) ──
      if (UNDERGROUND_ZONES.has(state.currentZoneId)) {
        drawUndergroundAtmosphere(ctx, screenX, screenY);
      } else {
        drawSurfaceAtmosphere(ctx, state.currentZoneId, timestamp);
        // Zone-specific particle effects
        // Ambient life details (butterflies, dog, bird, fireflies, leaf, drip, seagull, sparks)
        updateAndDrawAmbient(ctx, state.currentZoneId, dt, timestamp);
        if (state.currentZoneId === "cursed_swamp")
          drawSwampFog(ctx, timestamp);
        if (state.currentZoneId === "floating_ruins")
          drawFloatingRuinsWind(ctx, timestamp);
      }

      // ── Physics particles (level-up, death fragments) ──
      updateAndDrawPhysicsParticles(ctx, dt);

      // ── Rain overlay (outdoor non-interior zones only) ──
      drawRain(ctx);

      // ── Lightning flash (thunderstorm) ──
      drawLightningFlash(ctx);

      // ── Water decoratives (fish, driftwood, bubbles) ──
      if (!INTERIOR_ZONES.has(state.currentZoneId)) {
        drawWaterDecorations(
          ctx,
          cameraXRef.current,
          cameraYRef.current,
          timestamp,
        );
      }

      // ── Snow overlay (Floating Ruins) ──
      if (state.currentZoneId === "floating_ruins")
        drawSnowOverlay(ctx, timestamp);

      // ── Sky effects (outdoor only): moon, constellations, meteors, dawn/dusk ──
      if (
        !INTERIOR_ZONES.has(state.currentZoneId) &&
        !UNDERGROUND_ZONES.has(state.currentZoneId)
      ) {
        const CYCLE_MS2 = 8 * 60 * 1000;
        const cycleT2 = (timestamp % CYCLE_MS2) / CYCLE_MS2;
        const nightFactor2 =
          cycleT2 < 0.5 ? 0 : cycleT2 < 0.75 ? (cycleT2 - 0.5) / 0.25 : 1;
        drawMoon(ctx, nightFactor2);
        drawConstellations(ctx, nightFactor2);
        drawMeteors(ctx, nightFactor2);
        drawDawnDuskOverlay(ctx, cycleT2);
      }

      // ── Global vignette — subtle corner darkening for depth ──
      {
        const W = CANVAS_W;
        const H = CANVAS_H;
        const vignette = ctx.createRadialGradient(
          W / 2,
          H / 2,
          H * 0.3,
          W / 2,
          H / 2,
          H * 0.85,
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.save();
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // ── Screen edge danger indicator (HP < 30%) — heartbeat pulse ──
      {
        const hpRatio = player.hp / player.maxHp;
        if (hpRatio < 0.3 && !state.isDead) {
          // Advance pulse timer: 1 beat per second (2π per 1000ms)
          dangerPulseRef.current =
            (dangerPulseRef.current + dt * 0.00628) % (Math.PI * 2);
          // Heartbeat: ease-in-out alpha 0→0.35→0 per cycle
          const pulseT =
            (Math.sin(dangerPulseRef.current - Math.PI / 2) + 1) / 2;
          const alpha = pulseT * 0.35;
          const W2 = CANVAS_W;
          const H2 = CANVAS_H;
          const edgeR = Math.min(W2, H2) * 0.72;
          const vigRed = ctx.createRadialGradient(
            W2 / 2,
            H2 / 2,
            edgeR * 0.45,
            W2 / 2,
            H2 / 2,
            edgeR,
          );
          vigRed.addColorStop(0, "rgba(180,0,0,0)");
          vigRed.addColorStop(1, `rgba(180,0,0,${alpha.toFixed(3)})`);
          ctx.save();
          ctx.fillStyle = vigRed;
          ctx.fillRect(0, 0, W2, H2);
          ctx.restore();
        } else {
          dangerPulseRef.current = 0;
        }
      }

      ctx.restore(); // end screen shake

      drawAttackFlash(ctx, state.attackFlashTimer);
      drawDamageFlash(
        ctx,
        playerDmgFlashRef.current,
        PLAYER_DMG_FLASH_DURATION,
      );
      // Player hurt red flash driven by state
      if (state.playerHurt && state.playerHurtTimer > 0) {
        drawDamageFlash(ctx, state.playerHurtTimer, 300);
      }

      // ── Damage direction indicators (red edge arrows pointing to attacker) ──
      if (_damageIndicators.length > 0) {
        drawDamageIndicators(ctx, timestamp);
      }

      // ── Respawn effects ──
      if (
        respawnFadeRef.current < 1.0 ||
        respawnShimmerRef.current > 0 ||
        respawnTextRef.current > 0
      ) {
        drawRespawnEffects(
          ctx,
          screenX,
          screenY,
          respawnFadeRef.current,
          respawnShimmerRef.current,
          respawnTextRef.current,
          respawnCityRef.current,
        );
        // Advance respawn timers
        if (respawnFadeRef.current < 1.0) {
          respawnFadeRef.current = Math.min(
            1.0,
            respawnFadeRef.current + dt / RESPAWN_FADE_IN_DURATION,
          );
        }
        if (respawnShimmerRef.current > 0) {
          respawnShimmerRef.current = Math.min(
            1.0,
            respawnShimmerRef.current + dt / RESPAWN_SHIMMER_DURATION,
          );
        }
        if (respawnTextRef.current > 0) {
          respawnTextRef.current = Math.max(0, respawnTextRef.current - dt);
        }
      }

      // ── Hidden room flash overlay ──
      if (hiddenRoomFlashRef.current > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, hiddenRoomFlashRef.current / 300);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
        hiddenRoomFlashRef.current = Math.max(
          0,
          hiddenRoomFlashRef.current - dt,
        );
      }

      // ── Lore popup (from urn examine) ──
      if (state.lorePopup) {
        const remaining = state.lorePopup.expiresAt - now;
        const fadeAlpha = Math.min(1, remaining / 600);
        if (fadeAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = fadeAlpha;
          const popText = state.lorePopup.text;
          ctx.font = "13px serif";
          const maxW = Math.min(280, CANVAS_W - 40);
          // Word wrap
          const words = popText.split(" ");
          const lines: string[] = [];
          let line = "";
          for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > maxW && line) {
              lines.push(line);
              line = word;
            } else line = test;
          }
          if (line) lines.push(line);
          const lineH = 18;
          const boxH = lines.length * lineH + 20;
          const boxY = CANVAS_H / 2 - boxH - 20;
          const boxX = CANVAS_W / 2 - maxW / 2 - 10;
          ctx.fillStyle = "rgba(30,20,10,0.88)";
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, maxW + 20, boxH, 8);
          ctx.fill();
          ctx.strokeStyle = "#AA8833";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "#EECC88";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          lines.forEach((ln, i) => {
            ctx.fillText(ln, CANVAS_W / 2, boxY + 10 + i * lineH);
          });
          ctx.restore();
        }
      }

      // ── Zone transition overlay (drawn last, on top of everything) ──
      if (state.isTransitioning || state.transitionAlpha > 0) {
        const toZone = state.currentZoneId;
        const fadeColor = state.transitionFadeColor ?? getZoneFadeColor(toZone);
        drawTransitionOverlay(
          ctx,
          state.transitionAlpha,
          toZone,
          fadeColor,
          timestamp,
        );
        // Show zone label when fading out (transitioning in to new zone)
        if (state.transitionAlpha < 1 && state.transitionAlpha > 0) {
          const zone = WORLD_CONFIG.zones[state.currentZoneId];
          if (zone) drawZoneLabel(ctx, zone.name, 1 - state.transitionAlpha);
        }
      }

      // Detect zone change and show zone label (CSS animation via key bump)
      if (
        state.currentZoneId !== prevZoneIdRef.current &&
        prevZoneIdRef.current !== ""
      ) {
        const zone = WORLD_CONFIG.zones[state.currentZoneId];
        if (zone) {
          const isFirstVisit = !discoveredZonesRef.current.has(
            state.currentZoneId,
          );
          if (isFirstVisit) discoveredZonesRef.current.add(state.currentZoneId);
          setZoneLabelName(
            isFirstVisit ? `${zone.name} \u2728 Discovered!` : zone.name,
          );
          setZoneLabelKey((k) => k + 1);
          setZoneLabelAlpha(1);
          if (zoneLabelTimerRef.current)
            clearTimeout(zoneLabelTimerRef.current);
          zoneLabelTimerRef.current = setTimeout(
            () => setZoneLabelAlpha(0),
            2800,
          );
        }
      }
      renderSpellEffects(now, cameraXRef.current, cameraYRef.current);
      prevZoneIdRef.current = state.currentZoneId;
    },
    [username, gameStateRef, chatMessages, playerGuildName, selectedClass],
  );

  useGameLoop({
    gameStateRef,
    onTileLanded,
    onFrame,
    openEmotePanel: onOpenEmotePanel,
    openChat: onOpenChat,
    chatOpen,
    onHpChanged,
    onXpChanged,
    onMonsterKilled,
    onPlayerDied,
    onPlayerRespawned: () => {
      // Trigger respawn visual effects
      respawnFadeRef.current = 0;
      respawnShimmerRef.current = 0.01;
      respawnTextRef.current = RESPAWN_TEXT_DURATION;
      // Use the current zone name (player just respawned there)
      const state = gameStateRef.current;
      if (state) {
        const zone = WORLD_CONFIG.zones[state.currentZoneId];
        respawnCityRef.current = zone?.name ?? "Meadow Hub";
      }
      onPlayerRespawned?.();
    },
    onAutoSave,
    onPvpWarning,
    onAchievementUnlocked,
    onKillStreak: (count: number) => {
      if (killStreakTimerRef.current) clearTimeout(killStreakTimerRef.current);
      killStreakKeyRef.current += 1;
      const isRampage = count >= 5;
      setKillStreakNotif({
        text: isRampage ? `Rampage! x${count}!` : `Kill Streak x${count}!`,
        color: isRampage ? "#ff3333" : "#ff8833",
        key: killStreakKeyRef.current,
      });
      killStreakTimerRef.current = setTimeout(
        () => setKillStreakNotif(null),
        1500,
      );
    },
    onLevelUp: (
      oldStats: { hp: number; mp: number; atk: number },
      newStats: { hp: number; mp: number; atk: number },
      newLevel: number,
    ) => {
      if (levelUpTimerRef.current) clearTimeout(levelUpTimerRef.current);
      // Spawn golden sparkle burst at player screen position
      const state = gameStateRef.current;
      if (state) {
        const cx2 = Math.floor(
          state.player.tileX * TILE_SIZE +
            state.player.pixelOffsetX -
            cameraXRef.current,
        );
        const cy2 = Math.floor(
          state.player.tileY * TILE_SIZE +
            state.player.pixelOffsetY -
            cameraYRef.current,
        );
        spawnLevelUpParticles(cx2, cy2);
      }
      setLevelUpPopup({
        oldHp: oldStats.hp,
        newHp: newStats.hp,
        oldMp: oldStats.mp,
        newMp: newStats.mp,
        oldAtk: oldStats.atk,
        newAtk: newStats.atk,
        newLevel,
      });
      levelUpTimerRef.current = setTimeout(() => setLevelUpPopup(null), 3000);
    },
    onEventAnnounce,
    onDamageDealt: (
      tileX: number,
      tileY: number,
      damage: number,
      isCrit: boolean,
      spellType: string,
    ) => {
      window.dispatchEvent(
        new CustomEvent("combat_damage_number", {
          detail: {
            damage,
            isCrit,
            spellType,
            tileX,
            tileY,
            cameraX: cameraXRef.current,
            cameraY: cameraYRef.current,
          },
        }),
      );
    },
    onPlayerDamageReceived: (tileX: number, tileY: number, damage: number) => {
      window.dispatchEvent(
        new CustomEvent("combat_damage_number", {
          detail: {
            damage,
            isCrit: false,
            spellType: "player_hit",
            tileX,
            tileY,
            cameraX: cameraXRef.current,
            cameraY: cameraYRef.current,
          },
        }),
      );
    },
  });

  useEffect(() => {
    if (!gameStateRef.current) return;
    // Session isolation: filter out any entity that was tagged with a different
    // session ID OR whose session has been explicitly blacklisted.
    // This prevents stale guest/player entities from following a new login
    // even if a polling response arrives late.
    const filteredPlayers = currentSessionId
      ? otherPlayers.filter(
          (p) =>
            (!p.sessionId || p.sessionId === currentSessionId) &&
            (!p.sessionId || !blacklistedSessions.has(p.sessionId)),
        )
      : otherPlayers.filter(
          (p) => !p.sessionId || !blacklistedSessions.has(p.sessionId),
        );
    gameStateRef.current.otherPlayers = filteredPlayers;
  }, [otherPlayers, gameStateRef, currentSessionId]);

  // ── Session event listeners ──────────────────────────────────────────────
  // 'player_force_disconnect': immediately remove a specific session's entity
  //   from the render list. This is the primary guard against dual-control.
  // 'guest_cleanup': alias fired when a guest logs out.
  useEffect(() => {
    const handleForceDisconnect = (e: Event) => {
      const { sessionId: staleId } = (e as CustomEvent<{ sessionId: string }>)
        .detail;
      if (!staleId || !gameStateRef.current) return;
      gameStateRef.current.otherPlayers =
        gameStateRef.current.otherPlayers.filter(
          (p) => p.sessionId !== staleId,
        );
    };
    window.addEventListener("player_force_disconnect", handleForceDisconnect);
    window.addEventListener("guest_cleanup", handleForceDisconnect);
    return () => {
      window.removeEventListener(
        "player_force_disconnect",
        handleForceDisconnect,
      );
      window.removeEventListener("guest_cleanup", handleForceDisconnect);
    };
  }, [gameStateRef]);

  // ── Damage direction indicator event listener ────────────────────────────
  // Fires from useGameLoop when player takes damage — records attacker angle.
  useEffect(() => {
    const handleDamageDir = (e: Event) => {
      const { angle } = (e as CustomEvent<{ angle: number }>).detail;
      addDamageIndicator(angle);
    };
    window.addEventListener("player_hurt_direction", handleDamageDir);
    return () =>
      window.removeEventListener("player_hurt_direction", handleDamageDir);
  }, []);

  // ── Hidden room flash event listener ─────────────────────────────────────
  useEffect(() => {
    const handleHiddenFlash = () => {
      hiddenRoomFlashRef.current = 300; // 300ms white flash
    };
    window.addEventListener("hidden_room_flash", handleHiddenFlash);
    return () =>
      window.removeEventListener("hidden_room_flash", handleHiddenFlash);
  }, []);

  // ── Floating text event listeners ────────────────────────────────────────
  // 'firstkill_bonus_text': show "First Kill! x2 XP!" floating text
  // 'auto_gold_pickup':     show "+N gold" floating text for auto-collected coins
  useEffect(() => {
    const handleFirstKill = (e: Event) => {
      const { x, y, xp } = (
        e as CustomEvent<{ x: number; y: number; xp: number }>
      ).detail;
      const camX = cameraXRef.current;
      const camY = cameraYRef.current;
      const screenX = x * TILE_SIZE - camX + TILE_SIZE / 2;
      const screenY = y * TILE_SIZE - camY - 8;
      damageNumbersRef.current.push({
        x: screenX,
        y: screenY,
        value: xp,
        age: 0,
        isPlayer: false,
        isFirstKillBonus: true,
      });
    };
    const handleAutoGold = (e: Event) => {
      const { x, y, amount } = (
        e as CustomEvent<{ x: number; y: number; amount: number }>
      ).detail;
      const camX = cameraXRef.current;
      const camY = cameraYRef.current;
      const screenX = x * TILE_SIZE - camX + TILE_SIZE / 2;
      const screenY = y * TILE_SIZE - camY - 12;
      damageNumbersRef.current.push({
        x: screenX,
        y: screenY,
        value: amount,
        age: 0,
        isPlayer: false,
        isGoldPickup: true,
      });
    };
    window.addEventListener("firstkill_bonus_text", handleFirstKill);
    window.addEventListener("auto_gold_pickup", handleAutoGold);
    return () => {
      window.removeEventListener("firstkill_bonus_text", handleFirstKill);
      window.removeEventListener("auto_gold_pickup", handleAutoGold);
    };
  }, []);

  // ── Interact result floating text ─────────────────────────────────────────
  useEffect(() => {
    const handleInteract = (e: Event) => {
      const { message } = (e as CustomEvent<{ message: string }>).detail;
      const state = gameStateRef.current;
      if (!state) return;
      const camX = cameraXRef.current;
      const camY = cameraYRef.current;
      const screenX = state.player.tileX * TILE_SIZE - camX + 16;
      const screenY = state.player.tileY * TILE_SIZE - camY - 20;
      damageNumbersRef.current.push({
        x: screenX,
        y: screenY,
        value: 0,
        age: 0,
        isPlayer: false,
        isInteractText: true,
        interactMessage: message,
      });
    };
    window.addEventListener("interact_result", handleInteract);
    return () => window.removeEventListener("interact_result", handleInteract);
  }, [gameStateRef]);

  // ── World event toast listener ─────────────────────────────────────────────
  useEffect(() => {
    const handleWorldToast = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      worldToastQueueRef.current.push({ id: `q_${Date.now()}`, text });
      // If no active timer: show immediately
      if (!worldToastTimerRef.current) {
        showNextWorldToast();
      }
    };
    window.addEventListener("world_event_toast", handleWorldToast);
    return () =>
      window.removeEventListener("world_event_toast", handleWorldToast);
  }, [showNextWorldToast]);

  // Safety: periodic stuck-detection — if player cannot move, teleport to town
  useEffect(() => {
    const id = setInterval(() => {
      if (gameStateRef.current) {
        checkPlayerStuck(gameStateRef.current);
      }
    }, 500);
    return () => clearInterval(id);
  }, [gameStateRef]);

  // biome-ignore lint/correctness/noUnusedVariables: internal spell API
  function castSpellFx(
    type: SpellEffectItem["type"],
    wx: number,
    wy: number,
    twx?: number,
    twy?: number,
  ) {
    const dur: Record<string, number> = {
      bolt: 600,
      nova: 500,
      lance: 700,
      ring: 800,
      shield: 2000,
    };
    activeEffectsRef.current.push({
      type,
      x: wx,
      y: wy,
      targetX: twx,
      targetY: twy,
      startTime: performance.now(),
      duration: dur[type] || 600,
      phase: 0,
    });
  }
  function drawBoltFx(
    ctx: CanvasRenderingContext2D,
    fx: SpellEffectItem,
    sx: number,
    sy: number,
    camXp: number,
    camYp: number,
  ) {
    const tx = (fx.targetX ?? fx.x) - camXp;
    const ty = (fx.targetY ?? fx.y) - camYp;
    const p = fx.phase;
    const bx = sx + (tx - sx) * p;
    const by = sy + (ty - sy) * p;
    for (let i = 0; i < 5; i++) {
      const tp = Math.max(0, p - i * 0.06);
      const tx2 = sx + (tx - sx) * tp;
      const ty2 = sy + (ty - sy) * tp;
      const a = (1 - i * 0.2) * (1 - p);
      ctx.fillStyle = `rgba(68,170,255,${a})`;
      const sz = (5 - i) * 0.8;
      ctx.fillRect(tx2 - sz / 2, ty2 - sz / 2, sz, sz);
    }
    const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 10);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.4, "rgba(100,180,255,0.8)");
    grd.addColorStop(1, "rgba(0,80,255,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
    if (p > 0.85) {
      const ia = (1 - p) / 0.15;
      ctx.strokeStyle = `rgba(255,255,255,${ia})`;
      ctx.lineWidth = 2;
      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2;
        const l = 14 * ia;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(ang) * l, ty + Math.sin(ang) * l);
        ctx.stroke();
      }
    }
  }
  function drawNovaFx(
    ctx: CanvasRenderingContext2D,
    fx: SpellEffectItem,
    sx: number,
    sy: number,
  ) {
    const maxR = 64;
    const ep = Math.min(1, fx.phase / 0.7);
    const fa = fx.phase > 0.7 ? 1 - (fx.phase - 0.7) / 0.3 : 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = maxR * ep;
      const ntx = sx + Math.cos(a) * l;
      const nty = sy + Math.sin(a) * l;
      const pa = a + Math.PI / 2;
      const bw = 5 * (1 - ep * 0.5);
      const b1x = sx + Math.cos(pa) * bw;
      const b1y = sy + Math.sin(pa) * bw;
      const b2x = sx - Math.cos(pa) * bw;
      const b2y = sy - Math.sin(pa) * bw;
      ctx.beginPath();
      ctx.moveTo(ntx, nty);
      ctx.lineTo(b1x, b1y);
      ctx.lineTo(b2x, b2y);
      ctx.closePath();
      const g = ctx.createLinearGradient(sx, sy, ntx, nty);
      g.addColorStop(0, `rgba(200,230,255,${fa * 0.9})`);
      g.addColorStop(1, `rgba(100,180,255,${fa * 0.3})`);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  function drawLanceFx(
    ctx: CanvasRenderingContext2D,
    fx: SpellEffectItem,
    sx: number,
    sy: number,
    camXp: number,
    camYp: number,
  ) {
    const ltx = (fx.targetX ?? fx.x) - camXp;
    const lty = (fx.targetY ?? fx.y) - camYp;
    const p = fx.phase;
    const lcx = sx + (ltx - sx) * p;
    const lcy = sy + (lty - sy) * p;
    const ang = Math.atan2(lty - sy, ltx - sx);
    ctx.save();
    ctx.translate(lcx, lcy);
    ctx.rotate(ang);
    ctx.fillStyle = "#440066";
    ctx.fillRect(-28, -5, 56, 10);
    ctx.fillStyle = "#aa22ff";
    ctx.fillRect(-28, -5, 56, 2);
    ctx.fillRect(-28, 3, 56, 2);
    ctx.fillStyle = "#000000";
    ctx.fillRect(-24, -1, 48, 2);
    for (let i = 0; i < 5; i++) {
      if (Math.random() > 0.5) {
        ctx.fillStyle = "#ff88ff";
        ctx.fillRect(-20 + Math.random() * 40, -6 + Math.random() * 12, 2, 2);
      }
    }
    ctx.restore();
    for (let i = 1; i <= 3; i++) {
      const tp = Math.max(0, p - i * 0.08);
      const tx2 = sx + (ltx - sx) * tp;
      const ty2 = sy + (lty - sy) * tp;
      const aa = 0.4 - i * 0.1;
      ctx.fillStyle = `rgba(80,0,120,${aa})`;
      ctx.fillRect(tx2 - 4, ty2 - 4, 8, 8);
    }
  }
  function drawRingFx(
    ctx: CanvasRenderingContext2D,
    fx: SpellEffectItem,
    sx: number,
    sy: number,
  ) {
    const maxR = 64;
    const ep = Math.min(1, fx.phase / 0.6);
    const fa = fx.phase > 0.6 ? 1 - (fx.phase - 0.6) / 0.4 : 1;
    const cr = maxR * ep;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const flx = sx + Math.cos(a) * cr;
      const fly = sy + Math.sin(a) * cr;
      ctx.save();
      ctx.translate(flx, fly);
      ctx.rotate(a + Math.PI / 2);
      const fh = Math.sin(Date.now() / 80 + i) > 0 ? 18 : 14;
      const g = ctx.createLinearGradient(0, 0, 0, -fh);
      g.addColorStop(0, `rgba(255,102,0,${fa})`);
      g.addColorStop(0.5, `rgba(255,180,0,${fa})`);
      g.addColorStop(1, "rgba(255,255,200,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.quadraticCurveTo(-2, -fh / 2, 0, -fh);
      ctx.quadraticCurveTo(2, -fh / 2, 4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  function drawShieldFx(
    ctx: CanvasRenderingContext2D,
    fx: SpellEffectItem,
    sx: number,
    sy: number,
  ) {
    if (fx.phase === 0) return;
    const b = 1 + Math.sin(Date.now() / 500) * 0.05;
    const r = 22 * b;
    const grd = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r);
    grd.addColorStop(0, "rgba(100,150,255,0.15)");
    grd.addColorStop(0.7, "rgba(100,150,255,0.25)");
    grd.addColorStop(1, "rgba(200,180,50,0.4)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Date.now() / 1000);
    ctx.strokeStyle = "rgba(255,220,50,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-Date.now() / 800);
    ctx.strokeStyle = "rgba(100,150,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.3, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  function renderSpellDmgNums(ctx: CanvasRenderingContext2D, now: number) {
    const nums = spellDamageNumbersRef.current;
    for (let i = nums.length - 1; i >= 0; i--) {
      const dn = nums[i];
      const p = (now - dn.born) / 800;
      if (p >= 1) {
        nums.splice(i, 1);
        continue;
      }
      dn.y = dn.startY - 32 * p;
      dn.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      ctx.save();
      ctx.globalAlpha = dn.alpha;
      ctx.font = `bold ${Math.floor(14 * dn.scale)}px monospace`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 3;
      ctx.strokeText(`${dn.value}${dn.label}`, dn.x, dn.y);
      ctx.fillStyle = dn.color;
      ctx.fillText(`${dn.value}${dn.label}`, dn.x, dn.y);
      ctx.restore();
    }
  }
  // biome-ignore lint/correctness/noUnusedVariables: internal spell API
  function showSpellDmgNum(
    wx: number,
    wy: number,
    amount: number,
    type: string,
    camXp: number,
    camYp: number,
  ) {
    const c: Record<string, string> = {
      normal: "#ffffff",
      crit: "#ffdd00",
      bolt: "#44ffff",
      nova: "#aaddff",
      lance: "#cc44ff",
      ring: "#ff8800",
      playerHit: "#ff4444",
      heal: "#44ff44",
    };
    const sx = wx * TILE_SIZE - camXp + TILE_SIZE / 2;
    const sy = wy * TILE_SIZE - camYp;
    spellDamageNumbersRef.current.push({
      value: amount,
      x: sx + (Math.random() * 16 - 8),
      y: sy,
      startY: sy,
      color: c[type] || "#ffffff",
      scale: type === "crit" ? 1.5 : 1,
      alpha: 1,
      born: performance.now(),
      label: type === "crit" ? " CRIT!" : "",
    });
  }
  // biome-ignore lint/correctness/noUnusedVariables: internal spell API
  function showMonsterHpBar(
    mid: string,
    mx: number,
    my: number,
    hp: number,
    maxHp: number,
    camXp: number,
    camYp: number,
  ) {
    visibleHPBarsRef.current.set(mid, {
      monsterId: mid,
      hp,
      maxHp,
      x: mx * TILE_SIZE - camXp,
      y: my * TILE_SIZE - camYp - 8,
      lastHit: performance.now(),
    });
  }
  function renderMonsterHpBars(ctx: CanvasRenderingContext2D, now: number) {
    for (const [id, bar] of visibleHPBarsRef.current) {
      const age = now - bar.lastHit;
      if (age > 3000) {
        visibleHPBarsRef.current.delete(id);
        continue;
      }
      const alpha = age > 2500 ? 1 - (age - 2500) / 500 : 1;
      const pct = bar.hp / bar.maxHp;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#330000";
      ctx.fillRect(bar.x, bar.y, 32, 4);
      ctx.fillStyle =
        pct > 0.5 ? "#44cc22" : pct > 0.25 ? "#ffaa00" : "#cc2222";
      ctx.fillRect(bar.x, bar.y, Math.floor(32 * pct), 4);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bar.x, bar.y, 32, 4);
      ctx.restore();
    }
  }
  function renderSpellEffects(now: number, camXp: number, camYp: number) {
    const FPS = 24;
    if (now - spellLastRenderRef.current < 1000 / FPS) return;
    spellLastRenderRef.current = now;
    const sc = spellCanvasRef.current;
    if (!sc) return;
    const ctx = sc.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, sc.width, sc.height);
    const fxArr = activeEffectsRef.current;
    for (let i = fxArr.length - 1; i >= 0; i--) {
      const f = fxArr[i];
      f.phase = (now - f.startTime) / f.duration;
      if (f.phase >= 1) {
        fxArr.splice(i, 1);
        continue;
      }
      const sx = f.x - camXp;
      const sy = f.y - camYp;
      switch (f.type) {
        case "bolt":
          drawBoltFx(ctx, f, sx, sy, camXp, camYp);
          break;
        case "nova":
          drawNovaFx(ctx, f, sx, sy);
          break;
        case "lance":
          drawLanceFx(ctx, f, sx, sy, camXp, camYp);
          break;
        case "ring":
          drawRingFx(ctx, f, sx, sy);
          break;
        case "shield":
          drawShieldFx(ctx, f, sx, sy);
          break;
      }
    }
    renderSpellDmgNums(ctx, now);
    renderMonsterHpBars(ctx, now);
  }
  return (
    <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background"
          style={{ zIndex: 10 }}
        >
          <span className="font-mono text-primary text-sm tracking-widest animate-pulse">
            LOADING WORLD...
          </span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        data-ocid="game-canvas"
        style={{
          display: "block",
          imageRendering: "pixelated",
          cursor: spellTargetCursor ? "crosshair" : "default",
        }}
        onClick={handleCanvasClick}
        onMouseMove={(e) => {
          if (pendingSpellRef.current) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              setSpellTargetCursor({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }
          }
        }}
        onKeyDown={undefined}
        tabIndex={0}
      />

      <canvas
        ref={spellCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          width: "100%",
          height: "100%",
        }}
      />

      {/* Spell targeting crosshair overlay (mage directional spell) */}
      {spellTargetCursor && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: spellTargetCursor.x - 10,
            top: spellTargetCursor.y - 10,
            width: 20,
            height: 20,
            zIndex: 40,
          }}
        >
          <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="rgba(100,200,255,0.85)"
              strokeWidth="1.5"
            />
            <line
              x1="10"
              y1="1"
              x2="10"
              y2="6"
              stroke="rgba(100,200,255,0.85)"
              strokeWidth="1.5"
            />
            <line
              x1="10"
              y1="14"
              x2="10"
              y2="19"
              stroke="rgba(100,200,255,0.85)"
              strokeWidth="1.5"
            />
            <line
              x1="1"
              y1="10"
              x2="6"
              y2="10"
              stroke="rgba(100,200,255,0.85)"
              strokeWidth="1.5"
            />
            <line
              x1="14"
              y1="10"
              x2="19"
              y2="10"
              stroke="rgba(100,200,255,0.85)"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      )}

      {/* Zone atmospheric CSS overlay — above canvas, below HUD controls */}
      {minimapSnap &&
        !isTransitioningUI &&
        (() => {
          const cls = getZoneAtmosphereClass(minimapSnap.zoneId);
          return cls ? (
            <div
              className={cls}
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 12,
                pointerEvents: "none",
              }}
            />
          ) : null;
        })()}

      {/* Zone label (CSS animated banner on zone transition) */}
      {zoneLabelAlpha > 0 && zoneLabelName && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: "38%",
            left: "50%",
            zIndex: 25,
          }}
          data-ocid="zone-label"
          aria-live="polite"
        >
          <div
            key={zoneLabelKey}
            className="zone-banner-animate font-mono font-bold tracking-widest uppercase px-6 py-3 text-center"
            style={{
              fontSize: 22,
              background: zoneLabelName.includes("Discovered")
                ? "oklch(0.06 0.04 78 / 0.96)"
                : "oklch(0.07 0 0 / 0.94)",
              border: "1.5px solid oklch(0.55 0.20 292 / 0.85)",
              color: zoneLabelName.includes("Discovered")
                ? "oklch(0.92 0.18 78)"
                : "oklch(0.92 0 0)",
              letterSpacing: "0.16em",
              whiteSpace: "nowrap",
              textShadow: "0 0 14px oklch(0.55 0.20 292 / 0.6)",
              boxShadow: "0 4px 24px oklch(0 0 0 / 0.55)",
            }}
          >
            {zoneLabelName.split(" \u2728 Discovered!")[0]}
            {zoneLabelName.includes("Discovered") && (
              <div
                style={{
                  fontSize: 11,
                  color: "oklch(0.82 0.18 78)",
                  letterSpacing: "0.12em",
                  marginTop: 4,
                }}
              >
                \u2728 DISCOVERED!
              </div>
            )}
          </div>
        </div>
      )}

      {/* NPC Dialogue Box */}
      {npcDialogue &&
        (() => {
          const dialogueNpc = npcDialogue.npc;
          const dialogueLine = npcDialogue.lineIndex;
          const dialogueText = dialogueNpc.dialogue[dialogueLine] ?? "";
          const dialogueIsLast =
            dialogueLine >= dialogueNpc.dialogue.length - 1;
          const npcTotalLines = dialogueNpc.dialogue.length;
          const maxDots = Math.min(npcTotalLines, 7);
          const dotOffset = Math.max(0, dialogueLine - (maxDots - 2));
          const npcAccentColor = (
            NPC_COLORS[dialogueNpc.spriteType] ?? NPC_COLORS.guide
          ).highlight;

          return (
            <div
              className="absolute inset-x-0 pointer-events-auto"
              style={{ bottom: "28%", zIndex: 45, padding: "0 10px" }}
              data-ocid="npc-dialogue-box"
            >
              <div
                style={{
                  maxWidth: 360,
                  margin: "0 auto",
                  background: "rgba(240, 236, 225, 0.97)",
                  border: "2px solid rgba(0,0,0,0.18)",
                  borderRadius: 6,
                  boxShadow:
                    "0 4px 24px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.6) inset",
                  overflow: "hidden",
                }}
              >
                {/* NPC name header bar */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.10)",
                    padding: "7px 14px 6px",
                    borderBottom: "1px solid rgba(0,0,0,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase" as const,
                      color: npcAccentColor,
                    }}
                  >
                    {dialogueNpc.name}
                  </span>
                  {/* Dot progress indicator */}
                  <div
                    style={{ display: "flex", gap: 4, alignItems: "center" }}
                  >
                    {Array.from({ length: maxDots }, (_, i) => {
                      const realIdx = i + dotOffset;
                      const filled = realIdx <= dialogueLine;
                      const isCurrent = realIdx === dialogueLine;
                      return (
                        <span
                          key={realIdx}
                          aria-hidden="true"
                          style={{
                            width: isCurrent ? 8 : 6,
                            height: isCurrent ? 8 : 6,
                            borderRadius: "50%",
                            background: filled
                              ? npcAccentColor
                              : "rgba(0,0,0,0.18)",
                            display: "inline-block",
                            boxShadow: isCurrent
                              ? `0 0 4px ${npcAccentColor}`
                              : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Dialogue text */}
                <div style={{ padding: "12px 14px 10px" }}>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "sans-serif",
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: "#1a1a2e",
                      wordBreak: "break-word",
                      minHeight: "2.8em",
                    }}
                    data-ocid="npc-dialogue-text"
                  >
                    {dialogueText}
                  </p>

                  {/* Controls row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      marginTop: 10,
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleDialogueClose}
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase" as const,
                        padding: "4px 10px",
                        background: "rgba(0,0,0,0.06)",
                        border: "1px solid rgba(0,0,0,0.18)",
                        borderRadius: 4,
                        color: "#666",
                        cursor: "pointer",
                      }}
                      data-ocid="npc-dialogue-close"
                    >
                      CLOSE
                    </button>
                    <button
                      type="button"
                      onClick={handleDialogueAdvance}
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase" as const,
                        padding: "5px 14px",
                        background: dialogueIsLast
                          ? "rgba(0,0,0,0.08)"
                          : npcAccentColor,
                        border: `1.5px solid ${dialogueIsLast ? "rgba(0,0,0,0.18)" : npcAccentColor}`,
                        borderRadius: 4,
                        color: dialogueIsLast ? "#555" : "#fff",
                        cursor: "pointer",
                        minWidth: 80,
                      }}
                      data-ocid={
                        dialogueIsLast
                          ? "npc-dialogue-finish"
                          : "npc-dialogue-next"
                      }
                    >
                      {dialogueIsLast ? "GOODBYE ✕" : "NEXT ▶"}
                    </button>
                  </div>
                </div>
              </div>
              {/* Speech tail */}
              <div
                aria-hidden="true"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: "8px solid rgba(240,236,225,0.97)",
                  margin: "0 auto",
                  display: "block",
                }}
              />
            </div>
          );
        })()}

      {/* Minimap relocated to controls panel — no longer rendered in canvas overlay */}

      {/* ── PVP Kill Notification Banner (top-center, 4s) ── */}
      {pvpNotification && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 65,
          }}
          data-ocid="pvp-kill-notification"
        >
          <div
            style={{
              background: pvpNotification.isKiller
                ? "rgba(20,10,0,0.92)"
                : "rgba(0,0,0,0.88)",
              border: `1.5px solid ${pvpNotification.isKiller ? "#ff6600" : "#cc2222"}`,
              borderRadius: 6,
              padding: "6px 16px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              color: pvpNotification.isKiller ? "#FFD700" : "#ff6666",
              textAlign: "center",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              boxShadow: `0 2px 16px ${pvpNotification.isKiller ? "rgba(255,120,0,0.5)" : "rgba(180,0,0,0.4)"}`,
            }}
          >
            {pvpNotification.isKiller ? "⚔ " : "💀 "}
            {pvpNotification.text}
          </div>
        </div>
      )}

      {/* ── Kill Streak Notification (top-center, 1.5s) ── */}
      {killStreakNotif && (
        <div
          key={killStreakNotif.key}
          className="absolute pointer-events-none"
          style={{
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 66,
            animation: "fadeInOut 1.5s ease-out forwards",
          }}
          data-ocid="kill-streak-notification"
        >
          <div
            style={{
              background: "rgba(0,0,0,0.88)",
              border: `2px solid ${killStreakNotif.color}`,
              borderRadius: 6,
              padding: "6px 18px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              fontWeight: 900,
              color: killStreakNotif.color,
              textAlign: "center",
              letterSpacing: "0.10em",
              whiteSpace: "nowrap",
              textShadow: `0 0 10px ${killStreakNotif.color}`,
              boxShadow: `0 2px 18px ${killStreakNotif.color}44`,
            }}
          >
            {killStreakNotif.text}
          </div>
        </div>
      )}

      {/* ── World Event Toast Notifications (slide in from top, max 2 visible) ── */}
      {worldEventToasts.length > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 67,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
          }}
          data-ocid="world-event-toasts"
        >
          {worldEventToasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                background: "rgba(10,8,2,0.93)",
                border: "1.5px solid #ffd700",
                borderRadius: 8,
                padding: "6px 18px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                fontWeight: 700,
                color: "#ffd700",
                textAlign: "center",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 16px rgba(255,200,0,0.35)",
                textShadow: "0 0 8px rgba(255,215,0,0.5)",
                animation: "fadeInSlideDown 0.3s ease-out forwards",
              }}
            >
              {toast.text}
            </div>
          ))}
        </div>
      )}

      {/* ── Level-Up Stat Preview Popup (centered, 3s auto-dismiss) ── */}
      {levelUpPopup && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-auto"
          style={{ zIndex: 70 }}
          data-ocid="level-up-popup"
          onClick={() => setLevelUpPopup(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Escape")
              setLevelUpPopup(null);
          }}
        >
          <div
            style={{
              background: "rgba(10,10,20,0.96)",
              border: "2px solid #FFD700",
              borderRadius: 12,
              padding: "20px 32px",
              textAlign: "center",
              boxShadow: "0 4px 32px rgba(255,215,0,0.3)",
              minWidth: 240,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>✨</div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 16,
                fontWeight: 900,
                color: "#FFD700",
                letterSpacing: "0.14em",
                marginBottom: 12,
                textShadow: "0 0 12px #FFD70088",
              }}
            >
              LEVEL UP! → {levelUpPopup.newLevel}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "#aaeebb",
                lineHeight: 1.9,
                letterSpacing: "0.04em",
              }}
            >
              <div>
                ❤ HP: {levelUpPopup.oldHp} →{" "}
                <span style={{ color: "#66ff88" }}>{levelUpPopup.newHp}</span>
              </div>
              <div>
                ✦ MP: {levelUpPopup.oldMp} →{" "}
                <span style={{ color: "#66aaff" }}>{levelUpPopup.newMp}</span>
              </div>
              <div>
                ⚔ ATK: {levelUpPopup.oldAtk} →{" "}
                <span style={{ color: "#ffaa44" }}>{levelUpPopup.newAtk}</span>
              </div>
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: "#555",
                marginTop: 12,
              }}
            >
              Tap to dismiss
            </div>
          </div>
        </div>
      )}

      {/* ── Boss HP Bar (top-center, boss_chamber only) — Redesigned ── */}
      {bossHpState && bossHpState.hp > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            width: 320,
          }}
          data-ocid="boss-hp-bar"
        >
          <div
            style={{
              background: "rgba(0,0,0,0.92)",
              border: "2px solid #c8a825",
              borderRadius: 8,
              padding: "7px 12px 8px",
              boxShadow: bossHpState.enraged
                ? "0 0 18px rgba(220,30,0,0.7), 0 2px 14px rgba(0,0,0,0.7)"
                : "0 2px 14px rgba(0,0,0,0.7)",
            }}
          >
            {/* Boss name — BOLD, above bar */}
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 800,
                color: bossHpState.enraged ? "#ff4422" : "#e8c870",
                textAlign: "center",
                letterSpacing: "0.16em",
                marginBottom: 6,
                textShadow: bossHpState.enraged
                  ? "0 0 8px #ff2200"
                  : "0 1px 3px rgba(0,0,0,0.8)",
              }}
            >
              {bossHpState.enraged
                ? `⚠ ${bossHpState.name} ⚠`
                : bossHpState.name}
            </div>
            {/* Bar track */}
            <div
              style={{
                background: "rgba(30,0,0,0.8)",
                border: "1px solid #7a4a00",
                borderRadius: 4,
                height: 18,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* Bar fill — dark crimson */}
              <div
                style={{
                  height: "100%",
                  width: `${(bossHpState.hp / bossHpState.maxHp) * 100}%`,
                  background:
                    "linear-gradient(to bottom, #8a1a10 0%, #5a0a08 60%, #3a0806 100%)",
                  borderRadius: 3,
                  transition: "width 0.25s ease-out",
                  boxShadow: "inset 0 1px 0 rgba(255,80,60,0.35)",
                }}
              />
              {/* Enrage pulsing overlay */}
              {bossHpState.enraged && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(220,30,0,0.12)",
                    animation:
                      "bossEnragePulse 0.8s ease-in-out infinite alternate",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
            {/* HP counter */}
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 8,
                color: "#888",
                textAlign: "right",
                marginTop: 3,
              }}
            >
              {bossHpState.hp}/{bossHpState.maxHp} HP
            </div>
          </div>
        </div>
      )}

      {/* ── Quest Tracker (top-right) ── */}
      {activeQuestState && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: 8, right: 8, zIndex: 48, width: 160 }}
          data-ocid="quest-tracker"
        >
          <div
            style={{
              background: "rgba(0,0,0,0.82)",
              border: "1.5px solid rgba(200,160,60,0.7)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "5px 8px",
                background: "rgba(200,160,60,0.15)",
                cursor: "pointer",
                border: "none",
              }}
              onClick={() => setQuestTrackerCollapsed((c) => !c)}
              data-ocid="quest-tracker-toggle"
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "#e8c870",
                }}
              >
                📜 QUEST
              </span>
              <span style={{ color: "#e8c870", fontSize: 10 }}>
                {questTrackerCollapsed ? "▲" : "▼"}
              </span>
            </button>
            {!questTrackerCollapsed && (
              <div style={{ padding: "6px 8px 8px" }}>
                <div
                  style={{
                    fontFamily: "sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#ffe88a",
                    marginBottom: 2,
                  }}
                >
                  {activeQuestState.title}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 8,
                    color: "#88ccff",
                  }}
                  data-ocid="quest-progress"
                >
                  {activeQuestState.objectiveType === "kill_monsters"
                    ? `${activeQuestState.currentCount}/${activeQuestState.objectiveCount} kills`
                    : `Visit: ${activeQuestState.objectiveTarget.replace(/_/g, " ")}`}
                </div>
                <div
                  style={{
                    fontFamily: "sans-serif",
                    fontSize: 8,
                    color: "#88aa44",
                    marginTop: 3,
                  }}
                >
                  +{activeQuestState.reward.gold}g +{activeQuestState.reward.xp}
                  xp
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quest Complete Popup ── */}
      {questCompletePopup && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 55 }}
          data-ocid="quest-complete-popup"
        >
          <div
            style={{
              background: "rgba(10,10,20,0.95)",
              border: "2px solid oklch(0.72 0.20 78)",
              borderRadius: 10,
              padding: "18px 28px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: "#FFD700",
                letterSpacing: "0.12em",
                marginBottom: 4,
              }}
            >
              QUEST COMPLETE!
            </div>
            <div
              style={{
                fontFamily: "sans-serif",
                fontSize: 14,
                color: "#eee",
                marginBottom: 8,
              }}
            >
              {questCompletePopup.title}
            </div>
            <div
              style={{
                fontFamily: "sans-serif",
                fontSize: 12,
                color: "#88ee66",
              }}
            >
              +{questCompletePopup.reward.gold}g · +
              {questCompletePopup.reward.xp} XP
              {questCompletePopup.reward.potions > 0
                ? ` · +${questCompletePopup.reward.potions} Potion`
                : ""}
            </div>
          </div>
        </div>
      )}

      {/* ── NPC Action Choice (Talk / Shop / Quest) ── */}
      {npcActionChoice && (
        <div
          className="absolute inset-0 flex items-end justify-center pointer-events-auto"
          style={{ zIndex: 50, paddingBottom: "32%" }}
          data-ocid="npc-action-choice"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNpcActionChoice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && e.target === e.currentTarget)
              setNpcActionChoice(null);
          }}
        >
          <div
            style={{
              background: "rgba(240,236,225,0.97)",
              border: "2px solid rgba(0,0,0,0.18)",
              borderRadius: 8,
              boxShadow: "0 4px 24px rgba(0,0,0,0.55)",
              padding: "10px 14px",
              minWidth: 220,
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                color: "#4a3010",
                marginBottom: 8,
              }}
            >
              {npcActionChoice.npc.name}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                data-ocid="npc-choice-talk"
                onClick={() => {
                  const s = gameStateRef.current;
                  if (!s) return;
                  s.activeNpcDialogue = {
                    npcId: npcActionChoice.npc.id,
                    dialogueIndex: 0,
                  };
                  setNpcDialogue({ npc: npcActionChoice.npc, lineIndex: 0 });
                  setNpcActionChoice(null);
                }}
                style={{
                  flex: 1,
                  minWidth: 80,
                  minHeight: 48,
                  padding: "8px 12px",
                  background: "rgba(60,40,10,0.12)",
                  border: "1.5px solid rgba(0,0,0,0.25)",
                  borderRadius: 6,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#2a1a08",
                }}
              >
                💬 Talk
              </button>
              {npcActionChoice.shopItems.length > 0 && (
                <button
                  type="button"
                  data-ocid="npc-choice-shop"
                  onClick={() => {
                    setShopState({
                      npcId: npcActionChoice.npc.id,
                      items: npcActionChoice.shopItems,
                      tab: "buy",
                      selectedItem: null,
                    });
                    setNpcActionChoice(null);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 80,
                    minHeight: 48,
                    padding: "8px 12px",
                    background: "oklch(0.55 0.20 80 / 0.15)",
                    border: "1.5px solid oklch(0.55 0.20 80 / 0.6)",
                    borderRadius: 6,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#4a3308",
                  }}
                >
                  🛒 Shop
                </button>
              )}
              {(() => {
                const s = gameStateRef.current;
                if (!s) return null;
                const qId = QUEST_GIVERS[npcActionChoice.npc.id];
                if (
                  !qId ||
                  s.completedQuestIds.includes(qId) ||
                  s.activeQuest?.id === qId ||
                  !isQuestAvailableForClass(qId, selectedClass)
                )
                  return null;
                const q = cloneQuest(qId);
                if (!q) return null;
                return (
                  <button
                    type="button"
                    data-ocid="npc-accept-quest"
                    onClick={() => {
                      const gs = gameStateRef.current;
                      if (!gs) return;
                      gs.activeQuest = { ...q };
                      setActiveQuestState({ ...q });
                      setNpcActionChoice(null);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 80,
                      minHeight: 48,
                      padding: "8px 12px",
                      background: "oklch(0.55 0.22 145 / 0.15)",
                      border: "1.5px solid oklch(0.55 0.22 145 / 0.6)",
                      borderRadius: 6,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      color: "#1a3a10",
                    }}
                  >
                    📜 Quest
                  </button>
                );
              })()}
              <button
                type="button"
                data-ocid="npc-choice-close"
                onClick={() => setNpcActionChoice(null)}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  padding: "8px",
                  background: "rgba(0,0,0,0.06)",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "#666",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shop Panel Overlay ── */}
      {shopState && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-auto"
          style={{ background: "rgba(0,0,0,0.72)", zIndex: 60 }}
          data-ocid="shop-panel"
        >
          <div
            style={{
              background: "rgba(18,14,10,0.97)",
              border: "2px solid oklch(0.60 0.16 62)",
              borderRadius: 10,
              width: 340,
              maxHeight: "82%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(180,130,50,0.18)",
                borderBottom: "1px solid rgba(180,130,50,0.3)",
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#e8c870",
                }}
              >
                🛒 MERCHANT
              </span>
              <button
                type="button"
                data-ocid="shop-close"
                onClick={() => setShopState(null)}
                style={{
                  width: 28,
                  height: 28,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 4,
                  color: "#aaa",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: "6px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "sans-serif",
                fontSize: 11,
                color: "#FFD700",
              }}
            >
              💰 {gameStateRef.current?.player.coins ?? 0}g
            </div>
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {(["buy", "sell"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  data-ocid={`shop-tab-${tab}`}
                  onClick={() =>
                    setShopState((ss) =>
                      ss ? { ...ss, tab, selectedItem: null } : ss,
                    )
                  }
                  style={{
                    flex: 1,
                    padding: "8px",
                    background:
                      shopState.tab === tab
                        ? "rgba(180,130,50,0.25)"
                        : "transparent",
                    border: "none",
                    color: shopState.tab === tab ? "#e8c870" : "#888",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 40,
                  }}
                >
                  {tab === "buy" ? "📦 BUY" : "💱 SELL"}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
              {shopState.tab === "buy" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                  }}
                >
                  {shopState.items.map((item) => {
                    const s = gameStateRef.current;
                    const canAfford = (s?.player.coins ?? 0) >= item.price;
                    const classOk =
                      !item.classRestriction ||
                      item.classRestriction === s?.player.selectedClass;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-ocid={`shop-item-${item.id}`}
                        onClick={() =>
                          setShopState((ss) =>
                            ss
                              ? {
                                  ...ss,
                                  selectedItem:
                                    ss.selectedItem?.id === item.id
                                      ? null
                                      : item,
                                }
                              : ss,
                          )
                        }
                        style={{
                          background:
                            shopState.selectedItem?.id === item.id
                              ? "rgba(180,130,50,0.25)"
                              : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${shopState.selectedItem?.id === item.id ? "oklch(0.60 0.16 62)" : "rgba(255,255,255,0.10)"}`,
                          borderRadius: 6,
                          padding: "8px",
                          cursor: "pointer",
                          opacity: !canAfford || !classOk ? 0.5 : 1,
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>
                          {item.icon}
                        </div>
                        <div
                          style={{
                            fontFamily: "sans-serif",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#ddd",
                            marginBottom: 2,
                          }}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9,
                            color: canAfford ? "#FFD700" : "#cc4444",
                          }}
                        >
                          {item.price}g
                        </div>
                        {item.classRestriction && (
                          <div style={{ fontSize: 8, color: "#888" }}>
                            {item.classRestriction}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {shopState.tab === "sell" &&
                (() => {
                  const s = gameStateRef.current;
                  if (!s || s.player.inventory.length === 0)
                    return (
                      <div
                        style={{
                          color: "#666",
                          fontSize: 11,
                          textAlign: "center",
                          padding: "16px 0",
                        }}
                      >
                        No items to sell
                      </div>
                    );
                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {s.player.inventory.map((inv, idx) => {
                        const sp = Math.max(1, Math.floor(inv.amount * 8));
                        return (
                          <div
                            key={inv.id}
                            data-ocid={`shop-sell-item.${idx + 1}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 6,
                              padding: "6px 10px",
                            }}
                          >
                            <span style={{ fontSize: 11, color: "#ccc" }}>
                              {inv.itemType.replace(/_/g, " ")} ×{inv.amount}
                            </span>
                            <button
                              type="button"
                              data-ocid="shop-sell-button"
                              onClick={() => {
                                const gs = gameStateRef.current;
                                if (!gs) return;
                                gs.player.coins += sp;
                                gs.player.inventory =
                                  gs.player.inventory.filter(
                                    (i) => i.id !== inv.id,
                                  );
                              }}
                              style={{
                                minWidth: 60,
                                minHeight: 36,
                                padding: "4px 8px",
                                background: "rgba(60,120,40,0.25)",
                                border: "1px solid rgba(60,180,40,0.4)",
                                borderRadius: 4,
                                color: "#88ee66",
                                fontSize: 9,
                                cursor: "pointer",
                              }}
                            >
                              +{sp}g
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
            {shopState.tab === "buy" &&
              shopState.selectedItem &&
              (() => {
                const s = gameStateRef.current;
                const item = shopState.selectedItem;
                const canAfford = (s?.player.coins ?? 0) >= item.price;
                return (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.4)",
                    }}
                  >
                    <div
                      style={{ fontSize: 11, color: "#ccc", marginBottom: 6 }}
                    >
                      {item.description}
                      {Object.keys(item.statBonus).length > 0 && (
                        <span style={{ color: "#88ee66" }}>
                          {" "}
                          (
                          {Object.entries(item.statBonus)
                            .map(([k, v]) => `+${v} ${k}`)
                            .join(", ")}
                          )
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      data-ocid="shop-buy-confirm"
                      onClick={() => {
                        const gs = gameStateRef.current;
                        if (!gs || gs.player.coins < item.price) return;
                        if (
                          item.classRestriction &&
                          item.classRestriction !== gs.player.selectedClass
                        )
                          return;
                        gs.player.coins -= item.price;
                        if (item.itemType === "potion") {
                          gs.potionCount = Math.min(5, gs.potionCount + 1);
                        } else {
                          const typeMap: Record<
                            string,
                            import("../types/game").ItemType
                          > = {
                            basic_sword: "sword_basic",
                            iron_sword: "sword_basic",
                            basic_staff: "staff_basic",
                            enchanted_staff: "staff_basic",
                            leather_armor_shop: "leather_armor",
                            chainmail_armor: "leather_armor",
                            mage_robe: "cloth_robe",
                            rare_gem_shop: "rare_gem",
                          };
                          gs.player.inventory.push({
                            id: `shop_${Date.now()}`,
                            itemType: typeMap[item.id] ?? "rare_gem",
                            amount: 1,
                          });
                        }
                        setShopState((ss) =>
                          ss ? { ...ss, selectedItem: null } : ss,
                        );
                      }}
                      style={{
                        width: "100%",
                        minHeight: 44,
                        padding: "8px",
                        background: canAfford
                          ? "oklch(0.45 0.16 62)"
                          : "rgba(80,20,20,0.5)",
                        border: "1.5px solid oklch(0.60 0.16 62)",
                        borderRadius: 6,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        fontWeight: 700,
                        color: canAfford ? "#ffe090" : "#cc4444",
                        cursor: "pointer",
                      }}
                    >
                      {canAfford ? `Buy for ${item.price}g` : "Not enough gold"}
                    </button>
                  </div>
                );
              })()}
          </div>
        </div>
      )}
    </div>
  );
}
