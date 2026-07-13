import type { Direction, InputState } from "../types/game";
import { DODGE_DOUBLE_TAP_MS } from "../types/game";

// ─── Key → Cardinal Direction mappings ────────────────────────────────────────

const KEY_TO_CARDINAL: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

/** Keys that trigger an attack action */
const ATTACK_KEYS = new Set(["Space", "KeyJ", "KeyZ"]);

/**
 * How long (ms) a key/button must be held before it switches from tap → hold mode.
 * Below this threshold: a press+release is treated as a single-tile tap.
 * At or above this threshold: it is a hold (continuous movement while pressed).
 */
const TAP_THRESHOLD_MS = 200;

// ─── Transition block flag ────────────────────────────────────────────────────

let _transitionBlocked = false;
// ─── Chat input focus flag ───────────────────────────────────────────────────
// When true, all keyboard movement + attack input is blocked (chat is focused).
let _chatInputFocused = false;

export function isChatInputFocused(): boolean {
  return _chatInputFocused;
}

export function setChatInputFocused(focused: boolean): void {
  _chatInputFocused = focused;
}

export function isTransitionBlocked(): boolean {
  return _transitionBlocked;
}

/** Call when a transition begins to block all input. */
export function blockInputForTransition(_state?: InputState): void {
  _transitionBlocked = true;
}

/** Call when the zone swap is done and fade-out starts to re-enable input. */
export function unblockInputAfterTransition(_state?: InputState): void {
  _transitionBlocked = false;
}

// ─── Diagonal resolution ──────────────────────────────────────────────────────

type Cardinal = "up" | "down" | "left" | "right";

function resolveDiagonal(dirs: Cardinal[]): Direction {
  const hasUp = dirs.includes("up");
  const hasDown = dirs.includes("down");
  const hasLeft = dirs.includes("left");
  const hasRight = dirs.includes("right");

  if (hasUp && hasRight) return "up-right";
  if (hasUp && hasLeft) return "up-left";
  if (hasDown && hasRight) return "down-right";
  if (hasDown && hasLeft) return "down-left";
  if (hasUp) return "up";
  if (hasDown) return "down";
  if (hasLeft) return "left";
  return "right";
}

function getHeldDirection(state: InputState): Direction | null {
  if (state.heldDirections.size === 0) return null;

  const all = [...state.heldDirections];

  const cardinals = all.filter(
    (d): d is Cardinal =>
      d === "up" || d === "down" || d === "left" || d === "right",
  );

  if (cardinals.length === 0) {
    // Diagonal direction stored directly (from dpad diagonal button)
    return all[all.length - 1] as Direction;
  }
  if (cardinals.length === 1) return cardinals[0];
  // Two or more cardinals → resolve to diagonal
  return resolveDiagonal(cardinals);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInputState(): InputState {
  return {
    // Tap/hold system
    heldDirections: new Set<Direction>(),
    pendingTap: null,
    tapProcessed: false,
    tapStartTimes: new Map<string, number>(),
    tapMoveTarget: null,
    rotationPending: false,
    isBlocked: false,
    lastMoveTime: 0,
    // Combat
    attackPending: false,
    frostNovaPending: false,
    shadowLancePending: false,
    flameRingPending: false,
    shieldPending: false,
    // Dodge
    dodgePending: null,
    lastDirectionTapTime: new Map<Direction, number>(),
    // Legacy compat
    queue: [],
    heldKeys: new Set<string>(),
  };
}

// ─── Tap consumed ─────────────────────────────────────────────────────────────

/**
 * Call after the game loop moves exactly 1 tile from a pending tap.
 * Clears pendingTap so the game loop stops after 1 tile.
 */
export function markTapProcessed(state: InputState): void {
  state.pendingTap = null;
  state.tapProcessed = true;
  state.lastMoveTime = Date.now();
}

// ─── Movement query ───────────────────────────────────────────────────────────

/**
 * Called each game tick.  Returns the movement command or null (stop).
 *
 * Priority:
 *  1. Pending tap  → move exactly 1 tile, then call markTapProcessed()
 *  2. Held direction → move continuously while held
 *  3. null → stop
 *
 * Tap-to-move pathfinding (tapMoveTarget) is NOT returned here; callers
 * use consumeTapMoveStep() directly for that code path.
 */
export function getMovementCommand(
  state: InputState,
): { type: "tap" | "hold" | "path"; direction: Direction } | null {
  if (_transitionBlocked || state.isBlocked) return null;

  // Pending single-tile tap
  if (state.pendingTap !== null) {
    return { type: "tap", direction: state.pendingTap };
  }

  // Continuously held direction
  const heldDir = getHeldDirection(state);
  if (heldDir !== null) {
    return { type: "hold", direction: heldDir };
  }

  return null;
}

// ─── Tap-to-move (map click pathfinding) ─────────────────────────────────────

export function setTapMoveTarget(
  state: InputState,
  x: number,
  y: number,
): void {
  state.tapMoveTarget = { x, y };
  // Cancel pending dpad tap when map-tap navigation starts
  state.pendingTap = null;
  state.tapProcessed = false;
}

export function consumeTapMoveStep(
  state: InputState,
): { x: number; y: number } | null {
  if (!state.tapMoveTarget) return null;
  return { ...state.tapMoveTarget };
}

export function clearTapMoveTarget(state: InputState): void {
  state.tapMoveTarget = null;
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

export function triggerRotate(state: InputState): void {
  if (!_transitionBlocked && !state.isBlocked) {
    state.rotationPending = true;
  }
}

export function consumeRotate(state: InputState): boolean {
  if (state.rotationPending) {
    state.rotationPending = false;
    return true;
  }
  return false;
}

// ─── Keyboard handlers ────────────────────────────────────────────────────────

export function handleKeyDown(
  state: InputState,
  event: KeyboardEvent,
  chatOpen = false,
): void {
  if (chatOpen || _chatInputFocused) return;

  const code = event.code || event.key;

  // Attack
  if (ATTACK_KEYS.has(code)) {
    if (!state.heldKeys.has(code)) {
      state.heldKeys.add(code);
      if (!_transitionBlocked && !state.isBlocked) state.attackPending = true;
    }
    event.preventDefault();
    return;
  }

  const dir = KEY_TO_CARDINAL[code] as Cardinal | undefined;
  if (!dir) return;

  if (event.code?.startsWith("Arrow")) event.preventDefault();

  // Ignore auto-repeat (keydown fires repeatedly while held)
  if (state.heldKeys.has(code)) return;

  state.heldKeys.add(code);
  state.heldDirections.add(dir);
  state.tapStartTimes.set(code, Date.now());

  // Cancel any pending tap in the same axis so hold takes over smoothly
  if (state.pendingTap === dir) {
    state.pendingTap = null;
  }

  // Cancel map-tap pathfinding when manual direction pressed
  if (state.tapMoveTarget !== null) {
    state.tapMoveTarget = null;
  }
}

export function handleKeyUp(state: InputState, event: KeyboardEvent): void {
  const code = event.code || event.key;
  const dir = KEY_TO_CARDINAL[code] as Cardinal | undefined;

  state.heldKeys.delete(code);

  if (!dir) return;

  // Block movement key-up effects when chat is focused
  if (_chatInputFocused) return;

  const pressTime = state.tapStartTimes.get(code) ?? 0;
  const heldMs = Date.now() - pressTime;
  state.tapStartTimes.delete(code);
  state.heldDirections.delete(dir);

  if (_transitionBlocked || state.isBlocked) return;

  // Quick release within threshold → single-tile tap + double-tap dodge check
  if (heldMs < TAP_THRESHOLD_MS) {
    const now = Date.now();
    const lastTap = state.lastDirectionTapTime.get(dir) ?? 0;
    if (now - lastTap <= DODGE_DOUBLE_TAP_MS && lastTap > 0) {
      // Double-tap → dodge
      state.dodgePending = dir;
      state.lastDirectionTapTime.delete(dir);
    } else {
      state.lastDirectionTapTime.set(dir, now);
      // If another cardinal is still held, create a diagonal tap
      const stillHeld = [...state.heldDirections].filter(
        (d): d is Cardinal =>
          d === "up" || d === "down" || d === "left" || d === "right",
      );
      const tapDir =
        stillHeld.length > 0 ? resolveDiagonal([dir, ...stillHeld]) : dir;

      state.pendingTap = tapDir;
      state.tapProcessed = false;
    }
  }
  // Long release → was a hold; removing from heldDirections above stops movement
}

// ─── D-Pad touch handlers ─────────────────────────────────────────────────────

/**
 * Call from TouchControls on touchstart / pointerdown for a d-pad button.
 * direction: any of the 8 directions (cardinal or diagonal).
 */
export function handleDpadPress(state: InputState, direction: Direction): void {
  if (_transitionBlocked || state.isBlocked) return;

  const key = `dpad_${direction}`;
  state.heldDirections.add(direction);
  state.tapStartTimes.set(key, Date.now());

  // Cancel map-tap pathfinding on manual press
  if (state.tapMoveTarget !== null) {
    state.tapMoveTarget = null;
  }
}

/**
 * Call from TouchControls on touchend / pointerup for a d-pad button.
 * Stops movement immediately. If tap threshold not exceeded → single-tile tap.
 */
export function handleDpadRelease(
  state: InputState,
  direction: Direction,
): void {
  const key = `dpad_${direction}`;
  const pressTime = state.tapStartTimes.get(key) ?? 0;
  const heldMs = Date.now() - pressTime;
  state.tapStartTimes.delete(key);

  // Remove direction — movement stops immediately on release
  state.heldDirections.delete(direction);

  if (_transitionBlocked || state.isBlocked) return;

  // Quick tap → single tile + check double-tap for dodge
  if (heldMs < TAP_THRESHOLD_MS) {
    const now = Date.now();
    const lastTap = state.lastDirectionTapTime.get(direction) ?? 0;
    if (now - lastTap <= DODGE_DOUBLE_TAP_MS && lastTap > 0) {
      // Double-tap detected → trigger dodge
      state.dodgePending = direction;
      state.lastDirectionTapTime.delete(direction);
    } else {
      state.lastDirectionTapTime.set(direction, now);
      state.pendingTap = direction;
      state.tapProcessed = false;
    }
  }
}

// ─── Combat triggers ──────────────────────────────────────────────────────────

export function triggerAttack(state: InputState): void {
  if (!_transitionBlocked && !state.isBlocked) state.attackPending = true;
}

export function consumeAttack(state: InputState): boolean {
  if (state.attackPending) {
    state.attackPending = false;
    return true;
  }
  return false;
}

export function triggerSpell(
  state: InputState,
  spell: "frostNova" | "shadowLance" | "flameRing",
): void {
  if (_transitionBlocked || state.isBlocked) return;
  if (spell === "frostNova") state.frostNovaPending = true;
  else if (spell === "shadowLance") state.shadowLancePending = true;
  else if (spell === "flameRing") state.flameRingPending = true;
}

export function consumeSpell(
  state: InputState,
  spell: "frostNova" | "shadowLance" | "flameRing",
): boolean {
  if (spell === "frostNova" && state.frostNovaPending) {
    state.frostNovaPending = false;
    return true;
  }
  if (spell === "shadowLance" && state.shadowLancePending) {
    state.shadowLancePending = false;
    return true;
  }
  if (spell === "flameRing" && state.flameRingPending) {
    state.flameRingPending = false;
    return true;
  }
  return false;
}

export function triggerShield(state: InputState): void {
  if (!_transitionBlocked && !state.isBlocked) state.shieldPending = true;
}

export function consumeShield(state: InputState): boolean {
  if (state.shieldPending) {
    state.shieldPending = false;
    return true;
  }
  return false;
}

// ─── Legacy spell triggers (kept for backward compat) ─────────────────────────

export function triggerFrostNova(state: InputState): void {
  triggerSpell(state, "frostNova");
}

export function triggerShadowLance(state: InputState): void {
  triggerSpell(state, "shadowLance");
}

export function triggerFlameRing(state: InputState): void {
  triggerSpell(state, "flameRing");
}

// ─── Legacy queue API (kept so callers do not break) ─────────────────────────

/**
 * @deprecated Use handleDpadPress/handleDpadRelease for precise tap/hold.
 * Routes to handleDpadPress + immediate release → single-tile tap.
 */
export function enqueueDirection(state: InputState, dir: Direction): void {
  if (_transitionBlocked || state.isBlocked) return;
  // Immediately emit a tap without recording press time
  state.pendingTap = dir;
  state.tapProcessed = false;
  state.tapMoveTarget = null;
}

/** @deprecated queue is no longer used for movement. */
export function dequeueDirection(state: InputState): Direction | null {
  return state.queue.shift() ?? null;
}

/** @deprecated Use createInputState for a fresh state. */
export function clearInputQueue(state: InputState): void {
  state.queue.length = 0;
  state.pendingTap = null;
  state.heldDirections.clear();
  state.tapStartTimes.clear();
  state.attackPending = false;
  state.frostNovaPending = false;
  state.shadowLancePending = false;
  state.flameRingPending = false;
  state.shieldPending = false;
  state.dodgePending = null;
}

/** @deprecated Use createInputState for a fresh state after transition. */
export function resetInputState(state: InputState): void {
  clearInputQueue(state);
  state.heldKeys.clear();
  state.tapMoveTarget = null;
  state.rotationPending = false;
  state.tapProcessed = false;
}

// ─── Direction → tile offset ──────────────────────────────────────────────────

export function directionToOffset(dir: Direction): { dx: number; dy: number } {
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
  }
}
