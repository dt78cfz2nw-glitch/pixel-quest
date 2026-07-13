import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "./backend";
import { CharacterCreationScreen } from "./components/CharacterCreationScreen";
import type { CharacterSave } from "./components/CharacterSelectScreen";
import { CharacterSelectScreen } from "./components/CharacterSelectScreen";
import { ChatStrip } from "./components/ChatStrip";
import { CombatOverlay } from "./components/CombatOverlay";
import { CANVAS_H, CANVAS_W, GameCanvas } from "./components/GameCanvas";
import { GameHUD } from "./components/GameHUD";
import { GameMenuPanel } from "./components/GameMenuPanel";
import { GuildPanel } from "./components/GuildPanel";
import { LeaderboardScreen } from "./components/LeaderboardScreen";
import type { IILoginError, IILoginState } from "./components/LoginScreen";
import { LoginScreen } from "./components/LoginScreen";
import { PortraitTopBar } from "./components/PortraitTopBar";
import { SettingsScreen } from "./components/SettingsScreen";
import TouchControls from "./components/TouchControls";
import { WorldLoadingScreen } from "./components/WorldLoadingScreen";
import { WorldMapScreen } from "./components/WorldMapScreen";
import { useBackendSync } from "./hooks/useBackendSync";
import {
  audioEngine,
  initAudio,
  playLevelUp,
  playZoneMusic,
} from "./lib/audio";
import type { CraftingRecipe } from "./lib/crafting";
import {
  blockInputForTransition,
  enqueueDirection,
  handleDpadPress as libHandleDpadPress,
  handleDpadRelease as libHandleDpadRelease,
  triggerAttack,
  triggerFlameRing,
  triggerFrostNova,
  triggerRotate,
  triggerShadowLance,
  triggerShield,
  unblockInputAfterTransition,
} from "./lib/input";
import {
  addCombatLogEntry,
  applyManaPotion,
  applyPotion,
  collectLootDrop,
  dismissNotification,
  respawnAtCheckpoint,
  setActiveTitleId,
  setRespawnLocationChoice,
} from "./store/gameStore";
import type {
  CharacterClass,
  ChatMessage,
  CustomizationState,
  Direction,
  EmoteType,
  EquippedGear,
  GameNotification,
  GameState,
  HairColor,
  InventoryItem,
  OtherPlayer,
  OutfitColor,
  OutfitStyle,
  QuickSlots,
  TitleId,
  ZoneId,
} from "./types/game";
import {
  ARCANE_BOLT_COOLDOWN_MS,
  FLAME_RING_COOLDOWN_MS,
  FROST_NOVA_COOLDOWN_MS,
  RESPAWN_DELAY_MS,
  SHADOW_LANCE_COOLDOWN_MS,
  WARRIOR_SHIELD_ACTIVATE_MANA,
} from "./types/game";

// ─── Device Fingerprint + Session Blacklist ───────────────────────────────────
// These are module-level singletons — they survive React re-renders but are
// wiped when the page is refreshed. Their purpose is to enforce single-active-
// session at the client level, which is the definitive fix for the dual-control
// (ghost-player) bug.

/**
 * A stable identifier for this browser tab, generated once per page load from
 * navigator.userAgent + screen dimensions + timezone.  Used to detect when a
 * new login should invalidate a previous session from the "same device".
 * Stored in sessionStorage so it is consistent across component re-mounts in
 * the same tab, but NOT shared with other tabs.
 */
function getDeviceFingerprint(): string {
  const SS_KEY = "pq_device_fp";
  const stored = sessionStorage.getItem(SS_KEY);
  if (stored) return stored;
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
  // Cheap hash — good enough for session tracking in a single tab
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const fp = `fp_${hash.toString(36)}`;
  try {
    sessionStorage.setItem(SS_KEY, fp);
  } catch {
    // sessionStorage might not be available in some contexts
  }
  return fp;
}

export const deviceFingerprint = getDeviceFingerprint();

/**
 * Set of session IDs that have been explicitly invalidated.
 * Any multiplayer entity whose sessionId appears in this set must be
 * discarded immediately — it is a ghost from a previous session.
 *
 * Exported so GameCanvas can filter incoming entities.
 */
export const blacklistedSessions = new Set<string>();

/** Timeout handle for clearing blacklist entries after 30 seconds */
const _blacklistClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Invalidate an old session:
 *  1. Adds the ID to the blacklist (GameCanvas will discard any entity with it)
 *  2. Fires 'player_force_disconnect' so GameCanvas removes it from the render list
 *  3. Auto-clears the blacklist entry after 30 seconds
 */
export function forceCleanupSession(oldSessionId: string): void {
  if (!oldSessionId) return;
  blacklistedSessions.add(oldSessionId);
  // Notify GameCanvas to immediately remove the entity
  window.dispatchEvent(
    new CustomEvent("player_force_disconnect", {
      detail: { sessionId: oldSessionId },
    }),
  );
  // Auto-remove from blacklist after 30 seconds (prevents memory leak)
  const existing = _blacklistClearTimers.get(oldSessionId);
  if (existing) clearTimeout(existing);
  _blacklistClearTimers.set(
    oldSessionId,
    setTimeout(() => {
      blacklistedSessions.delete(oldSessionId);
      _blacklistClearTimers.delete(oldSessionId);
    }, 30_000),
  );
}

// ─── Orientation layout hook ──────────────────────────────────────────────────

function useOrientationLayout() {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return { scale: 1, isLandscape: false };
    const isLandscape = window.innerWidth > window.innerHeight;
    const scale = isLandscape
      ? Math.min(1, window.innerHeight / CANVAS_H)
      : Math.min(1, window.innerWidth / CANVAS_W);
    return { scale, isLandscape };
  });

  useEffect(() => {
    const update = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const scale = isLandscape
        ? Math.min(1, window.innerHeight / CANVAS_H)
        : Math.min(1, window.innerWidth / CANVAS_W);
      setState({ scale, isLandscape });
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}

// ─── Local storage keys ───────────────────────────────────────────────────────

const CLASS_KEY = "rpg_class";
const USERNAME_KEY = "rpg_username";
const LAST_LOGIN_KEY = "rpg_last_login";

function getStoredClass(): CharacterClass {
  const stored = localStorage.getItem(CLASS_KEY);
  return stored === "mage" ? "mage" : "warrior";
}

function getStoredUsername(): string {
  return localStorage.getItem(USERNAME_KEY) ?? "";
}

function recordLoginTimestamp(): void {
  try {
    localStorage.setItem(LAST_LOGIN_KEY, String(Date.now()));
  } catch {
    // Non-fatal
  }
}

function getLastLoginTimestamp(): number {
  try {
    const raw = localStorage.getItem(LAST_LOGIN_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function formatOfflineDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (hours >= 1) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

// ─── Character slot persistence ───────────────────────────────────────────────

const CHAR_SLOTS_KEY = "rpg_char_slots";

function getStoredCharacters(): CharacterSave[] {
  try {
    const raw = localStorage.getItem(CHAR_SLOTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CharacterSave[];
  } catch {
    return [];
  }
}

function saveCharacters(chars: CharacterSave[]): void {
  localStorage.setItem(CHAR_SLOTS_KEY, JSON.stringify(chars));
}

// ─── Guest slot system (client-side only, never touches canister) ─────────────

/** Set of currently occupied guest slot numbers */
const _usedGuestSlots = new Set<number>();

/** Allocate the lowest unused guest slot number and return it (1-indexed). */
function allocateGuestSlot(): number {
  let n = 1;
  while (_usedGuestSlots.has(n)) n++;
  _usedGuestSlots.add(n);
  return n;
}

/** Free a guest slot so it can be reused by the next guest. */
function freeGuestSlot(n: number): void {
  _usedGuestSlots.delete(n);
}

/** Format a guest slot number as a zero-padded username. */
function guestUsername(n: number): string {
  return `Guest${String(n).padStart(2, "0")}`;
}

// ─── Session ID ───────────────────────────────────────────────────────────────
// A fresh random ID is generated on every login. Any entity referencing an old
// sessionId is considered stale and discarded immediately — fixes the ghost/
// guest-following-player bug.

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Inactivity timeouts ──────────────────────────────────────────────────────

const INACTIVITY_WARNING_MS = 90_000; // 90s: show warning overlay
const INACTIVITY_LOGOUT_MS = 120_000; // 120s: actually log out

// ─── Connection status ────────────────────────────────────────────────────────

type ConnectionStatus = "connecting" | "connected" | "offline";

// ─── Loading stage ────────────────────────────────────────────────────────────

type LoadingStage = "boot" | "assets" | "identity" | "ready";

type Screen =
  | "loading"
  | "login"
  | "character_select"
  | "character_creation"
  | "world_loading"
  | "game"
  | "leaderboard";

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Wrap II hook — if II never loaded, identity=undefined and isInitializing stays true
  // We use safeII to always get a valid destructured result
  const iiResult = useSafeInternetIdentity();
  const { identity, login, clear } = iiResult;
  const isAuthenticated = !!identity;
  // Ref so async polling can always read the latest identity without stale closure
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const { scale: portraitScale, isLandscape } = useOrientationLayout();

  // ── Loading state machine ──
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("boot");
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [fadeKey, setFadeKey] = useState(0);
  const [username, setUsername] = useState<string>(getStoredUsername);
  const [selectedClass, setSelectedClass] =
    useState<CharacterClass>(getStoredClass);
  const [characters, setCharacters] =
    useState<CharacterSave[]>(getStoredCharacters);
  const [hudPos, setHudPos] = useState({ x: 5, y: 5 });
  const [otherPlayers, setOtherPlayers] = useState<OtherPlayer[]>([]);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Tracks whether the chat text input is currently focused.
  // While true, ALL keyboard input (WASD/arrows) is blocked from reaching the game.
  const [chatInputFocused, setChatInputFocused] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // ── Guest mode ──
  const [isGuest, setIsGuestState] = useState(false);
  const guestSlotRef = useRef<number | null>(null);

  // ── Session ID — fresh on every login ──
  const sessionIdRef = useRef<string>("");

  // ── Sync cancellation — cleared on every logout to stop stale callbacks ──
  // This ref holds a "generation counter" that increments on each logout.
  // Any async callback that closed over an older generation simply exits.
  const syncGenRef = useRef<number>(0);

  // ── Session transition overlay — shown briefly between logout and new login ──
  // Guarantees canvas is fully cleared and React state is reset before the
  // next session begins. This is the last line of defence against ghost entities.
  const [showSessionTransition, setShowSessionTransition] = useState(false);

  // ── World loading screen — shown when "Enter World" is pressed ──
  const [worldLoadingChar, setWorldLoadingChar] =
    useState<CharacterSave | null>(null);

  // ── Inactivity tracking ──
  const lastActivityRef = useRef<number>(Date.now());
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [showIdleVignette, setShowIdleVignette] = useState(false);
  const inactivityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // ── XP gain popup events (CSS overlay, not canvas) ──
  const [xpGainEvents, setXpGainEvents] = useState<
    Array<{ id: string; amount: number; timestamp: number }>
  >([]);
  const xpGainEventIdRef = useRef(0);

  // ── Gold counter flash state ──
  const [goldFlash, setGoldFlash] = useState(false);
  const goldFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Offline progress note ──
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const offlineNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ── RPG stats ──
  const [playerHp, setPlayerHp] = useState(100);
  const [playerMaxHp] = useState(100);
  const [playerMp, setPlayerMp] = useState(50);
  const [playerMaxMp] = useState(50);
  const [playerXp, setPlayerXp] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const [currentZoneId, setCurrentZoneId] = useState<ZoneId>("meadow_hub");
  const [isGameTransitioning, setIsGameTransitioning] = useState(false);
  const [customization, setCustomization] = useState<CustomizationState>({
    outfitColor: "default",
    outfitStyle: "default",
    hairColor: "brown",
  });

  // ── Economy ──
  const [playerCoins, setPlayerCoins] = useState(0);
  const [playerInventory, setPlayerInventory] = useState<InventoryItem[]>([]);
  const [playerGear, setPlayerGear] = useState<EquippedGear>({
    weapon: null,
    armor: null,
    offhand: null,
  });
  const [audioEnabled, setAudioEnabled] = useState(() => audioEngine.isEnabled);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  // ── Crafting panel ──
  const [craftingOpen, setCraftingOpen] = useState(false);
  // ── Guild panel ──
  const [guildOpen, setGuildOpen] = useState(false);
  const [playerGuildId, setPlayerGuildId] = useState<string | null>(null);
  const [playerGuildRank, setPlayerGuildRank] = useState<string | null>(null);
  const [playerGuildName, setPlayerGuildName] = useState<string | null>(null);
  // ── World map overlay toggle ──
  const [isMapOpen, setIsMapOpen] = useState(false);
  // ── Game menu panel ──
  const [gameMenuOpen, setGameMenuOpen] = useState(false);

  // ── Combat log + notifications (synced from gameStateRef every 200ms) ──
  const [quickSlots, setQuickSlots] = useState<QuickSlots>([
    "health_potion",
    "mana_potion",
    null,
    null,
  ]);
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [dodgeCooldownMs, setDodgeCooldownMs] = useState(0);
  const [isDodging, setIsDodging] = useState(false);
  const [isStunned, setIsStunned] = useState(false);
  const [pingMs, setPingMs] = useState<number | undefined>(undefined);

  // ── Discovered zones ──
  const [discoveredZones, setDiscoveredZones] = useState<string[]>([]);
  const [pendingDiscovery, setPendingDiscovery] = useState<string | null>(null);
  // Ref so the polling loop can read without closure staleness
  const discoveredZonesRef = useRef<string[]>([]);

  // ── Settings overlay ──
  const [showSettings, setShowSettings] = useState(false);
  const [settingsContext, setSettingsContext] = useState<
    "character_select" | "in_game"
  >("character_select");

  // ── Titles ──
  const [earnedTitles, setEarnedTitles] = useState<TitleId[]>(["novice"]);
  const [activeTitleId, setActiveTitleIdState] = useState<TitleId>("novice");

  // ── II login state machine (non-blocking feedback) ──
  // Controls what the LoginScreen shows during the II auth flow.
  // idle → opening-popup → verifying → loading-characters → entering-world → character_select/character_creation
  //                     → timeout / failed / cancelled (error paths)
  const [iiLoginState, setIILoginState] = useState<IILoginState>("idle");
  const [iiLoginError, setIILoginError] = useState<IILoginError | undefined>(
    undefined,
  );
  const iiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iiAbsoluteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Cancellation flag — incremented when user presses Cancel so in-flight async
  // callbacks know to bail out without updating state
  const iiCancelGenRef = useRef<number>(0);

  /** Clear all II-related timers — called on success, cancel, or failure */
  const clearIITimers = useCallback(() => {
    if (iiTimeoutRef.current) {
      clearTimeout(iiTimeoutRef.current);
      iiTimeoutRef.current = null;
    }
    if (iiAbsoluteTimeoutRef.current) {
      clearTimeout(iiAbsoluteTimeoutRef.current);
      iiAbsoluteTimeoutRef.current = null;
    }
  }, []);

  const gameStateRef = useRef<GameState | null>(null);
  const {
    fetchAllPlayers,
    savePlayerClass,
    saveEmote,
    sendChatMessage,
    recordAttack,
    savePlayerHP,
    savePlayerXP,
    savePlayerOutfit,
    recordMonsterKill,
    chatMessagesRef,
    setIsGuest: setSyncIsGuest,
    checkNicknameAvailable,
    savePosition,
    savePlayerTitles,
    savePlayerInventory,
    savePlayerCoins,
    saveDiscoveredZones,
    getDiscoveredZones,
  } = useBackendSync();

  // ── Backend actor for guild calls + character loading ──
  const { actor: backendActor } = useActor(createActor);
  // Ref so async II flow can read latest actor without stale closure
  const backendActorRef = useRef(backendActor);
  backendActorRef.current = backendActor;

  // Keep a ref so effects can read current screen without stale closure issues
  const screenRef = useRef<Screen>("loading");
  screenRef.current = screen;

  // Keep username in a ref for use in event listeners
  const usernameRef = useRef(username);
  usernameRef.current = username;
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  // ─── CLEAR SESSION STATE ──────────────────────────────────────────────────
  // Called on every logout path. Destroys ALL client-side session data so
  // no ghost/stale entity can follow a new login.

  const clearSessionState = useCallback(() => {
    // 1. Block ALL input immediately — nothing can reach the old entity
    blockInputForTransition();

    // 2. Invalidate and blacklist the current session ID.
    //    forceCleanupSession fires 'player_force_disconnect' so GameCanvas
    //    removes the old entity from its render list right now.
    const oldSessionId = sessionIdRef.current;
    if (oldSessionId) {
      forceCleanupSession(oldSessionId);
    }
    // 3. Clear the session ID ref so no stale callback can re-use it
    sessionIdRef.current = "";

    // 4. Increment sync generation — any in-flight polling callback from the
    //    old session will see a mismatched generation and silently exit without
    //    writing stale entities back into state (fixes ghost/guest-following bug)
    syncGenRef.current += 1;

    // 5. Wipe multiplayer state completely — no stale entity can survive this
    setOtherPlayers([]);
    if (gameStateRef.current) {
      gameStateRef.current.otherPlayers = [];
    }
    // 6. Destroy the game state completely — GameCanvas recreates it fresh on next login
    gameStateRef.current = null;

    // 7. Reset combat/UI state
    setIsDead(false);
    setRespawnTimer(0);
    setChatOpen(false);
    setChatMessages([]);
    setEmoteOpen(false);
    setInventoryOpen(false);
    setShowInactivityWarning(false);
    // Stop inactivity timer
    if (inactivityIntervalRef.current !== null) {
      clearInterval(inactivityIntervalRef.current);
      inactivityIntervalRef.current = null;
    }
  }, []);

  // ─── ACTIVITY TRACKING ───────────────────────────────────────────────────
  // Any user input resets the inactivity timer.

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showInactivityWarning) setShowInactivityWarning(false);
    if (showIdleVignette) setShowIdleVignette(false);
  }, [showInactivityWarning, showIdleVignette]);

  // ─── STAGED LOADING SEQUENCE ───────────────────────────────────────────────
  const loadingDoneRef = useRef(false);

  useEffect(() => {
    if (loadingDoneRef.current) return;
    loadingDoneRef.current = true;

    async function runLoadingSequence() {
      console.log("[PixelQuest] Stage 1: Showing loading screen");
      await tick(50);

      console.log("[PixelQuest] Stage 2: Loading assets…");
      setLoadingStage("assets");
      try {
        await Promise.race([
          import("./lib/world"),
          timeout(8000, "World module load timeout"),
        ]);
        console.log("[PixelQuest] Stage 2: Assets loaded");
      } catch (err) {
        console.warn("[PixelQuest] Stage 2 warning (non-fatal):", err);
      }

      console.log("[PixelQuest] Stage 3: Internet Identity initializing…");
      setLoadingStage("identity");
      try {
        await Promise.race([
          waitForIIReady(),
          timeout(4000, "II init timeout — continuing as guest"),
        ]);
        console.log("[PixelQuest] Stage 3: Identity ready");
      } catch (err) {
        console.warn(
          "[PixelQuest] Stage 3: II not ready — guest mode active:",
          err,
        );
      }

      console.log("[PixelQuest] Stage 4: Connecting to canister…");
      setConnectionStatus("connecting");
      probeCanister()
        .then((ok) => {
          setConnectionStatus(ok ? "connected" : "offline");
          console.log(
            ok
              ? "[PixelQuest] Stage 4: Canister connected"
              : "[PixelQuest] Stage 4: Canister offline — save unavailable",
          );
        })
        .catch(() => {
          setConnectionStatus("offline");
          console.warn(
            "[PixelQuest] Stage 4: Canister probe failed — offline mode",
          );
        });

      console.log("[PixelQuest] Stage 4 complete: Showing login");
      setLoadingStage("ready");
      await tick(400);
      setScreen("login");
    }

    runLoadingSequence().catch((err) => {
      console.error("[PixelQuest] FATAL loading error:", err);
      setLoadingError(
        err instanceof Error ? err.message : "Unknown loading error",
      );
      setScreen("login");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const transitionTo = useCallback((next: Screen) => {
    setFadeKey((k) => k + 1);
    setScreen(next);
  }, []);

  // Auto-advance once II confirms auth and we have a stored username.
  // NOTE: This effect only handles the case where the user was ALREADY authenticated
  // when the app loaded (e.g., returning to the tab). The normal interactive II flow
  // is handled by the async handleLoginWithII function below which polls identity.
  const iiAuthHandledRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    // Only act if NOT currently in the middle of handleLoginWithII
    // (which sets its own states) AND we haven't already handled this
    if (
      iiLoginState !== "idle" &&
      iiLoginState !== "success" &&
      iiLoginState !== "failed" &&
      iiLoginState !== "cancelled"
    )
      return;
    if (iiAuthHandledRef.current) return;
    const storedName = getStoredUsername();
    if (
      storedName &&
      (screenRef.current === "login" || screenRef.current === "loading")
    ) {
      iiAuthHandledRef.current = true;
      clearIITimers();
      setIILoginState("success");
      setUsername(storedName);
      setSelectedClass(getStoredClass());
      const chars = getStoredCharacters();
      setCharacters(chars);
      transitionTo("character_select");
    }
  }, [isAuthenticated, iiLoginState, clearIITimers, transitionTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLeaderboard = useCallback(() => {
    transitionTo("leaderboard");
  }, [transitionTo]);

  const handleBackToMenu = useCallback(() => {
    transitionTo("login");
  }, [transitionTo]);

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  // Saves data, clears ALL state, generates a fresh sessionId on next login.

  const handleLogout = useCallback(() => {
    // Save position before leaving (non-blocking, fire-and-forget)
    const state = gameStateRef.current;
    if (state && !isGuestRef.current) {
      const { tileX: x, tileY: y } = state.player;
      void savePosition(usernameRef.current, x, y).catch(() => {});
    }

    // Clear II session
    try {
      clear();
    } catch {
      // II crash is a no-op
    }

    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(CLASS_KEY);
    setUsername("");

    // Free guest slot if applicable
    if (guestSlotRef.current !== null) {
      freeGuestSlot(guestSlotRef.current);
      guestSlotRef.current = null;
    }

    setIsGuestState(false);
    setSyncIsGuest(false);

    // !! Critical — destroy all session state.
    // clearSessionState: blocks input, blacklists old sessionId,
    // fires player_force_disconnect, increments syncGenRef, wipes otherPlayers[],
    // nullifies gameStateRef — prevents ALL ghost entities from surviving.
    clearSessionState();

    // Clear checkpoint (non-blocking, best-effort)
    const stateToClean = gameStateRef.current;
    if (stateToClean) {
      stateToClean.checkpoint = null;
      stateToClean.checkpointActive = false;
    }

    // Show a brief transition overlay — this ensures the canvas unmounts,
    // React state drains, and no stale sprite reference survives into the
    // next session. The menu is shown after a short delay.
    setShowSessionTransition(true);
    setTimeout(() => {
      setShowSessionTransition(false);
      unblockInputAfterTransition(); // re-enable input for the menu/login screens
      transitionTo("login");
    }, 600);
  }, [clear, transitionTo, setSyncIsGuest, clearSessionState, savePosition]);

  // ─── AUTO-LOGOUT: INACTIVITY SYSTEM ──────────────────────────────────────

  useEffect(() => {
    if (screen !== "game") {
      // Clean up timer when not in game
      if (inactivityIntervalRef.current !== null) {
        clearInterval(inactivityIntervalRef.current);
        inactivityIntervalRef.current = null;
      }
      setShowInactivityWarning(false);
      return;
    }

    // Reset activity on entering game
    lastActivityRef.current = Date.now();

    // Check every 5 seconds
    inactivityIntervalRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= INACTIVITY_LOGOUT_MS) {
        console.log("[PixelQuest] Auto-logout: inactivity timeout");
        handleLogout();
      } else if (idle >= INACTIVITY_WARNING_MS) {
        setShowInactivityWarning(true);
        setShowIdleVignette(true);
      } else if (idle >= 60_000) {
        // 60s: show subtle vignette without full warning dialog
        setShowIdleVignette(true);
        setShowInactivityWarning(false);
      } else {
        setShowInactivityWarning(false);
        setShowIdleVignette(false);
      }
    }, 5000);

    return () => {
      if (inactivityIntervalRef.current !== null) {
        clearInterval(inactivityIntervalRef.current);
        inactivityIntervalRef.current = null;
      }
    };
  }, [screen, handleLogout]);

  // ─── BROWSER CLOSE / VISIBILITY CHANGE ────────────────────────────────────

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save position synchronously if possible
      const state = gameStateRef.current;
      if (state && !isGuestRef.current && usernameRef.current) {
        const { tileX: x, tileY: y } = state.player;
        // Fire-and-forget — synchronous XHR would block but canister calls are async
        void savePosition(usernameRef.current, x, y).catch(() => {});
      }
      // Free guest slot
      if (guestSlotRef.current !== null) {
        freeGuestSlot(guestSlotRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const state = gameStateRef.current;
        if (state && !isGuestRef.current && usernameRef.current) {
          const { tileX: x, tileY: y } = state.player;
          void savePosition(usernameRef.current, x, y).catch(() => {});
        }
        // Free guest slot on tab hide
        if (guestSlotRef.current !== null) {
          freeGuestSlot(guestSlotRef.current);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [savePosition]);

  // ─── PLAY: guest mode ──────────────────────────────────────────────────────

  const handlePlayAsGuest = useCallback(() => {
    // 1. Destroy ALL previous session state first.
    //    clearSessionState blocks input, blacklists old session, fires
    //    player_force_disconnect event, wipes otherPlayers, nulls gameStateRef.
    clearSessionState();
    gameStateRef.current = null;

    // 2. Generate a FRESH session ID AFTER clearSessionState (not before —
    //    clearSessionState would blacklist it if done in the wrong order)
    sessionIdRef.current = generateSessionId();

    // 3. Allocate guest slot (free old one if re-entering guest mode)
    const slot = allocateGuestSlot();
    if (guestSlotRef.current !== null) {
      freeGuestSlot(guestSlotRef.current);
    }
    guestSlotRef.current = slot;
    const gName = guestUsername(slot);

    setUsername(gName);
    setSelectedClass("warrior");
    setIsGuestState(true);
    setSyncIsGuest(true);
    setPlayerHp(100);
    setPlayerMp(50);
    setPlayerXp(0);
    setPlayerLevel(1);
    setPlayerCoins(0);
    setPlayerInventory([]);

    // 4. Brief delay to guarantee cleanup propagates before canvas mounts
    setTimeout(() => {
      unblockInputAfterTransition();
      transitionTo("game");
    }, 200);
  }, [transitionTo, setSyncIsGuest, clearSessionState]);

  const _handlePlay = useCallback(() => {
    if (isAuthenticated) {
      const storedName = getStoredUsername();
      if (storedName) {
        setUsername(storedName);
        setSelectedClass(getStoredClass());
        const chars = getStoredCharacters();
        setCharacters(chars);
        transitionTo("character_select");
        return;
      }
    }
    transitionTo("login");
  }, [isAuthenticated, transitionTo]);

  /**
   * Handle the full II auth flow as a proper async state machine.
   * Each step updates visible UI immediately — never freezes.
   *
   * Flow:
   *   opening-popup → (user auths in II popup) → verifying → loading-characters
   *   → entering-world → navigate to character_select or character_creation
   *
   * Error paths all show actionable UI with retry/guest buttons.
   */
  const handleLoginWithII = useCallback(async () => {
    // Guard: don't re-trigger if already running
    const activeStates: IILoginState[] = [
      "opening-popup",
      "verifying",
      "loading-characters",
      "entering-world",
      "authenticating",
    ];
    if (activeStates.includes(iiLoginState)) return;

    // Increment cancel generation — any previous in-flight run will bail
    const cancelGen = ++iiCancelGenRef.current;
    const isCancelled = () => iiCancelGenRef.current !== cancelGen;

    setIILoginError(undefined);
    setIILoginState("opening-popup");
    iiAuthHandledRef.current = false; // reset so the effect doesn't double-handle

    try {
      // ── Step 1: Open II popup ────────────────────────────────────────────────
      // login() is fire-and-forget (opens a popup). We then poll for identity.
      try {
        login();
      } catch (popupErr) {
        // Popup was blocked
        if (isCancelled()) return;
        const msg = String(popupErr).toLowerCase();
        if (msg.includes("popup") || msg.includes("blocked")) {
          setIILoginError({
            message: "Please allow popups for this site and try again",
            code: "POPUP_BLOCKED",
          });
        } else {
          setIILoginError({
            message: "Could not open Internet Identity",
            code: "OPEN_FAILED",
          });
        }
        setIILoginState("failed");
        return;
      }

      // ── Step 2: Wait for identity (poll up to 30 seconds) ───────────────────
      // II sets identity asynchronously after popup auth completes.
      // We show "Opening Internet Identity..." while polling.
      const identityResult = await Promise.race([
        pollForIdentity(identityRef, isCancelled),
        iiTimeoutPromise(15_000),
      ]);

      if (isCancelled()) return;

      if (identityResult === "timeout") {
        setIILoginState("timeout");
        // Keep showing timeout UI — user can retry
        return;
      }
      if (identityResult === "cancelled") return;

      // ── Step 3: Identity confirmed — verifying ───────────────────────────────
      setIILoginState("verifying");
      await tick(200); // brief pause so "Verifying identity..." is visible
      if (isCancelled()) return;

      // ── Step 4: Load characters from canister ────────────────────────────────
      setIILoginState("loading-characters");
      let characters: CharacterSave[] = [];

      // Try canister first, fall back to localStorage
      try {
        const actor = backendActorRef.current;
        if (actor) {
          const profiles = await withTimeout(actor.getAllCharacters(), 12_000);
          if (!isCancelled()) {
            characters = profiles.map((p) => ({
              characterId: Number(Date.now()) + Math.random(),
              username: p.username,
              characterClass:
                p.class === "mage" ? "mage" : ("warrior" as CharacterClass),
              level: Number(p.level),
              coins: Number(p.coins),
              lastZone: p.lastZone || undefined,
              totalPlaytime: Number(p.totalPlaytime) || undefined,
              deaths: Number(p.deaths) || undefined,
              kills: Number(p.monsterKills) || undefined,
              activeTitle: p.activeTitle || undefined,
              equippedItems:
                p.equippedItems.length > 0 ? p.equippedItems : undefined,
            }));
          }
        }
      } catch (err) {
        if (isCancelled()) return;
        console.warn(
          "[PixelQuest] Canister character load failed, falling back to localStorage:",
          err,
        );
        // Non-fatal: fall back to localStorage
      }

      if (isCancelled()) return;

      // Merge with localStorage (local takes precedence for appearance data)
      const stored = getStoredCharacters();
      if (characters.length === 0 && stored.length > 0) {
        characters = stored;
      } else if (characters.length > 0) {
        // Enrich canister characters with local appearance data
        characters = characters.map((c) => {
          const local = stored.find((s) => s.username === c.username);
          return local ? { ...c, ...local, level: c.level } : c;
        });
        saveCharacters(characters);
      }

      // ── Step 5: Navigate ─────────────────────────────────────────────────────
      setIILoginState("entering-world");
      await tick(300); // "Entering world..." visible briefly
      if (isCancelled()) return;

      clearIITimers();
      setIILoginState("success");
      iiAuthHandledRef.current = true; // prevent the effect from double-firing

      if (characters.length === 0) {
        // New player — go directly to character creation
        setCharacters([]);
        transitionTo("character_creation");
      } else {
        // Returning player — go to character selection
        setCharacters(characters);
        const mostRecent = characters[0];
        if (mostRecent) {
          setUsername(mostRecent.username);
          setSelectedClass(mostRecent.characterClass);
          localStorage.setItem(USERNAME_KEY, mostRecent.username);
          localStorage.setItem(CLASS_KEY, mostRecent.characterClass);
        }
        transitionTo("character_select");
      }
    } catch (err) {
      if (isCancelled()) return;
      console.warn("[PixelQuest] II auth error:", err);
      clearIITimers();
      const errMsg =
        err instanceof Error ? err.message : "An unexpected error occurred";
      const errCode =
        err instanceof Error && "code" in err
          ? String((err as { code?: unknown }).code)
          : undefined;
      setIILoginError({ message: errMsg, code: errCode });
      setIILoginState("failed");
    }
  }, [login, iiLoginState, clearIITimers, transitionTo]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Cancel the in-progress II auth — user pressed Cancel */
  const handleCancelIILogin = useCallback(() => {
    // Increment cancel gen — async handler will see the mismatch and bail
    iiCancelGenRef.current++;
    clearIITimers();
    setIILoginState("cancelled");
    // Reset to idle after a short display so user sees the feedback
    setTimeout(() => setIILoginState("idle"), 1800);
  }, [clearIITimers]);

  // First-time login (no stored user) — works for both II auth and guest
  const handleLogin = useCallback(
    (name: string, cls: CharacterClass) => {
      // Generate a fresh session ID — invalidates any stale ghost entities
      sessionIdRef.current = generateSessionId();

      localStorage.setItem(USERNAME_KEY, name);
      localStorage.setItem(CLASS_KEY, cls);
      setUsername(name);
      setSelectedClass(cls);
      const newChar: CharacterSave = {
        characterId: Date.now(),
        username: name,
        characterClass: cls,
        level: 1,
        coins: 0,
      };
      const updated = [newChar];
      setCharacters(updated);
      saveCharacters(updated);
      void savePlayerClass(name, cls).catch(() => {});
      transitionTo("character_select");
    },
    [savePlayerClass, transitionTo],
  );

  const handleCharacterSelect = useCallback(
    (char: CharacterSave) => {
      // 1. Destroy previous session (blocks input, fires player_force_disconnect,
      //    blacklists old sessionId) — this is the definitive ghost-entity fix.
      clearSessionState();
      gameStateRef.current = null;

      // 2. Dispatch guest cleanup event if previous session was a guest
      if (isGuestRef.current) {
        const oldSession = sessionIdRef.current;
        if (oldSession) {
          window.dispatchEvent(
            new CustomEvent("guest_cleanup", {
              detail: { sessionId: oldSession },
            }),
          );
        }
        if (guestSlotRef.current !== null) {
          freeGuestSlot(guestSlotRef.current);
          guestSlotRef.current = null;
        }
        setIsGuestState(false);
        setSyncIsGuest(false);
      }

      // 3. Store the selected character and show the world loading screen
      setWorldLoadingChar(char);
      transitionTo("world_loading");
    },
    [transitionTo, clearSessionState, setSyncIsGuest],
  );

  // ── Called by WorldLoadingScreen after min display time ──
  const handleWorldLoadComplete = useCallback(() => {
    const char = worldLoadingChar;
    if (!char) {
      transitionTo("game");
      return;
    }

    // Brief pause to let cleanup propagate before assigning new session
    setTimeout(() => {
      sessionIdRef.current = generateSessionId();
      setUsername(char.username);
      setSelectedClass(char.characterClass);
      localStorage.setItem(USERNAME_KEY, char.username);
      localStorage.setItem(CLASS_KEY, char.characterClass);

      // ── Offline progress note ────────────────────────────────────────────
      // Show a welcome-back message if the player was offline > 30 minutes.
      // Only for non-guest Internet Identity players.
      if (!isGuestRef.current) {
        const lastLogin = getLastLoginTimestamp();
        const offlineMs = lastLogin > 0 ? Date.now() - lastLogin : 0;
        const MIN_OFFLINE_MS = 30 * 60 * 1000; // 30 minutes
        if (offlineMs >= MIN_OFFLINE_MS) {
          const displayName = char.username;
          const duration = formatOfflineDuration(offlineMs);
          setOfflineNote(
            `Welcome back ${displayName}! You were gone ${duration}.`,
          );
          if (offlineNoteTimerRef.current)
            clearTimeout(offlineNoteTimerRef.current);
          offlineNoteTimerRef.current = setTimeout(() => {
            setOfflineNote(null);
          }, 4000);
        }
        // Record this login timestamp
        recordLoginTimestamp();

        // ── Load discovered zones from canister ─────────────────────────────
        // Non-guest only. Fire-and-forget — failures silently fall back to empty.
        getDiscoveredZones()
          .then((zones) => {
            if (zones.length > 0) {
              discoveredZonesRef.current = zones;
              setDiscoveredZones(zones);
            }
          })
          .catch(() => {});

        // ── Load guild membership from canister ─────────────────────────────
        if (backendActor) {
          void backendActor
            .loadPlayer(char.username, char.characterClass)
            .then((ps) => {
              const rawGs = ps as unknown as {
                guildId?: string;
                guildRank?: string;
              };
              const gId = rawGs.guildId ?? null;
              const gRank = rawGs.guildRank ?? null;
              if (gId) {
                setPlayerGuildId(gId);
                setPlayerGuildRank(gRank);
                void backendActor
                  .getGuild(gId)
                  .then((g) => {
                    if (g) setPlayerGuildName(g.name);
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      }

      unblockInputAfterTransition();
      transitionTo("game");
    }, 50);
  }, [worldLoadingChar, transitionTo, getDiscoveredZones, backendActor]);

  const handleCreateNewCharacter = useCallback(() => {
    transitionTo("character_creation");
  }, [transitionTo]);

  const onPositionUpdate = useCallback((x: number, y: number) => {
    setHudPos({ x, y });
  }, []);

  const handleTouchDirection = useCallback((dir: Direction) => {
    if (gameStateRef.current) {
      enqueueDirection(gameStateRef.current.input, dir);
    }
  }, []);

  // ── D-pad press: adds to heldDirections for continuous movement ──
  const handleDpadPressCallback = useCallback(
    (dir: Direction) => {
      resetActivity();
      if (gameStateRef.current) {
        libHandleDpadPress(gameStateRef.current.input, dir);
      }
    },
    [resetActivity],
  );

  // ── D-pad release: removes from heldDirections, sets tap if quick press ──
  const handleDpadReleaseCallback = useCallback((dir: Direction) => {
    if (gameStateRef.current) {
      libHandleDpadRelease(gameStateRef.current.input, dir);
    }
  }, []);

  // ── Rotation: rotate character 90° clockwise without moving ──
  const handleRotation = useCallback(() => {
    resetActivity();
    if (gameStateRef.current) {
      triggerRotate(gameStateRef.current.input);
    }
  }, [resetActivity]);

  // Wrap activity-tracked input handlers
  const handleAttack = useCallback(() => {
    resetActivity();
    if (gameStateRef.current) {
      triggerAttack(gameStateRef.current.input);
    }
    try {
      recordAttack();
    } catch {
      // Non-fatal
    }
  }, [recordAttack, resetActivity]);

  const handleFrostNova = useCallback(() => {
    resetActivity();
    if (gameStateRef.current) {
      triggerFrostNova(gameStateRef.current.input);
    }
  }, [resetActivity]);

  const handleShadowLance = useCallback(() => {
    resetActivity();
    if (gameStateRef.current) {
      triggerShadowLance(gameStateRef.current.input);
    }
  }, [resetActivity]);

  const handleFlameRing = useCallback(() => {
    resetActivity();
    if (gameStateRef.current) {
      triggerFlameRing(gameStateRef.current.input);
    }
  }, [resetActivity]);

  const handleShield = useCallback(() => {
    resetActivity();
    if (gameStateRef.current) {
      triggerShield(gameStateRef.current.input);
    }
  }, [resetActivity]);

  const handleNoManaFeedback = useCallback((spellId: string) => {
    const state = gameStateRef.current;
    if (!state) return;
    state.noManaShakeSpell = spellId;
    state.noManaNotifyExpiry = Date.now() + 1500;
  }, []);

  const handleUsePotion = useCallback(() => {
    resetActivity();
    const state = gameStateRef.current;
    if (!state) return;
    if (applyPotion(state)) {
      setPlayerHp(state.player.hp);
    }
  }, [resetActivity]);

  const handleUseManaPotion = useCallback(() => {
    resetActivity();
    const state = gameStateRef.current;
    if (!state) return;
    if (applyManaPotion(state)) {
      setPlayerHp(state.player.hp);
    }
  }, [resetActivity]);

  // ── Quick slot use ──
  const handleUseQuickSlot = useCallback(
    (slotIndex: number) => {
      resetActivity();
      const state = gameStateRef.current;
      if (!state || isGuest) return;
      const item = state.quickSlots[slotIndex];
      if (!item) return;
      if (item === "health_potion") {
        if (applyPotion(state)) {
          setPlayerHp(state.player.hp);
          setPlayerMp(state.player.mp);
          addCombatLogEntry(state, "You used a Health Potion.");
        }
      } else if (item === "mana_potion") {
        if (applyManaPotion(state)) {
          setPlayerHp(state.player.hp);
          setPlayerMp(state.player.mp);
          addCombatLogEntry(state, "You used a Mana Potion.");
        }
      }
    },
    [isGuest, resetActivity],
  );

  // ── Dismiss notification ──
  const handleDismissNotification = useCallback((id: string) => {
    const state = gameStateRef.current;
    if (!state) return;
    dismissNotification(state, id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleEmote = useCallback(
    (emote: EmoteType) => {
      resetActivity();
      if (gameStateRef.current) {
        gameStateRef.current.player.activeEmote = emote;
        gameStateRef.current.player.emoteExpiry = Date.now() + 4000;
      }
      void saveEmote(emote).catch(() => {});
    },
    [saveEmote, resetActivity],
  );

  const handleSendChat = useCallback(
    (text: string) => {
      resetActivity();
      if (gameStateRef.current) {
        gameStateRef.current.player.chatMessage = text;
        gameStateRef.current.player.chatExpiry = Date.now() + 11000;
      }
      const msg: ChatMessage = {
        username,
        text,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [msg, ...prev.slice(0, 19)]);
      void sendChatMessage(text).catch(() => {});
    },
    [sendChatMessage, username, resetActivity],
  );

  const handleCustomizationSave = useCallback(
    (color: OutfitColor, style: OutfitStyle, hairColor: HairColor) => {
      setCustomization({ outfitColor: color, outfitStyle: style, hairColor });
      if (gameStateRef.current) {
        gameStateRef.current.player.outfitColor = color;
        gameStateRef.current.player.outfitStyle = style;
        gameStateRef.current.player.hairColor = hairColor;
        gameStateRef.current.customization = {
          outfitColor: color,
          outfitStyle: style,
          hairColor,
        };
      }
      void savePlayerOutfit(color, style, hairColor).catch(() => {});
    },
    [savePlayerOutfit],
  );

  // Start zone music when game becomes active or zone changes.
  useEffect(() => {
    if (screen !== "game") return;
    initAudio()
      .then(() => {
        playZoneMusic(currentZoneId);
      })
      .catch((err) => {
        console.warn("[PixelQuest] Audio init failed — running silently:", err);
      });
  }, [screen, currentZoneId]);

  // ── Combat callbacks ──

  const handleHpChanged = useCallback(
    (hp: number, mp: number) => {
      setPlayerHp(hp);
      setPlayerMp(mp);
      void savePlayerHP(hp, mp).catch(() => {});
    },
    [savePlayerHP],
  );

  const handleXpChanged = useCallback(
    (xp: number, level: number) => {
      setPlayerXp((prev) => {
        const gain = xp - prev;
        if (gain > 0) {
          // Spawn XP popup event
          const id = `xp_${++xpGainEventIdRef.current}`;
          setXpGainEvents((evts) => [
            ...evts,
            { id, amount: gain, timestamp: Date.now() },
          ]);
          // Auto-remove after 1.4s
          setTimeout(() => {
            setXpGainEvents((evts) => evts.filter((e) => e.id !== id));
          }, 1400);
        }
        return xp;
      });
      setPlayerLevel((prevLevel) => {
        if (level > prevLevel) {
          // Level up! Calculate approximate stat gains (HP+12%, MP+1 flat, ATK+1 flat)
          const newHp = Math.floor(playerMaxHp * (1 + 0.12 * (level - 1)));
          const newMp = playerMaxMp + (level - prevLevel);
          const baseAtk = 14 + (level - 1);
          window.dispatchEvent(
            new CustomEvent("player_level_up", {
              detail: {
                newLevel: level,
                statGains: {
                  hpGain: Math.floor(playerMaxHp * 0.12),
                  mpGain: level - prevLevel,
                  atkGain: level - prevLevel,
                  newHp,
                  newMp,
                  newAtk: baseAtk,
                },
              },
            }),
          );
          // Trigger level-up SFX
          try {
            playLevelUp();
          } catch {
            /* non-fatal */
          }
        }
        return level;
      });
      void savePlayerXP(xp, level).catch(() => {});
      setCharacters((prev) => {
        const updated = prev.map((c) =>
          c.username === username ? { ...c, level } : c,
        );
        saveCharacters(updated);
        return updated;
      });
    },
    [savePlayerXP, username, playerMaxHp, playerMaxMp],
  );

  const handleMonsterKilled = useCallback(() => {
    try {
      recordMonsterKill();
    } catch {
      // Offline mode
    }
  }, [recordMonsterKill]);

  const handlePlayerDied = useCallback(() => {
    setIsDead(true);
    setRespawnTimer(RESPAWN_DELAY_MS);
  }, []);

  const handlePlayerRespawned = useCallback(() => {
    setIsDead(false);
    setRespawnTimer(0);
    if (gameStateRef.current) {
      const { hp, mp } = gameStateRef.current.player;
      setPlayerHp(hp);
      setPlayerMp(mp);
    }
  }, []);

  const handleCollectLoot = useCallback(
    (lootId: string) => {
      const state = gameStateRef.current;
      if (!state) return;
      const prevCoins = state.player.coins;
      collectLootDrop(state, lootId);
      const newCoins = state.player.coins;
      setPlayerCoins(newCoins);
      // Flash gold counter if coins increased
      if (newCoins > prevCoins) {
        if (goldFlashTimerRef.current) clearTimeout(goldFlashTimerRef.current);
        setGoldFlash(true);
        goldFlashTimerRef.current = setTimeout(() => setGoldFlash(false), 350);
      }
      setPlayerInventory([...state.player.inventory]);
      setPlayerGear({ ...state.player.equippedGear });
      setCharacters((prev) => {
        const updated = prev.map((c) =>
          c.username === username ? { ...c, coins: state.player.coins } : c,
        );
        saveCharacters(updated);
        return updated;
      });
    },
    [username],
  );

  const handleEquipItem = useCallback((item: InventoryItem) => {
    const state = gameStateRef.current;
    if (!state) return;
    const SLOT_MAP: Record<string, keyof EquippedGear> = {
      sword_basic: "weapon",
      staff_basic: "weapon",
      leather_armor: "armor",
      cloth_robe: "armor",
      iron_shield: "offhand",
    };
    const slot = SLOT_MAP[item.itemType];
    if (slot) {
      state.player.equippedGear[slot] = item.itemType;
      setPlayerGear({ ...state.player.equippedGear });
    }
  }, []);

  // ── Titles: select active title ──────────────────────────────────────────────
  const handleSelectTitle = useCallback(
    (titleId: TitleId) => {
      if (isGuest) return;
      const state = gameStateRef.current;
      if (!state) return;
      setActiveTitleId(state, titleId);
      setActiveTitleIdState(titleId);
      // Sync earned titles and active title to canister
      const earned = state.earnedTitles ?? ["novice"];
      void savePlayerTitles(earned as string[], titleId);
    },
    [isGuest, savePlayerTitles],
  );

  // ── Crafting: apply recipe result ───────────────────────────────────────────
  const handleCraft = useCallback(
    (
      _recipe: CraftingRecipe,
      newInventory: InventoryItem[],
      newCoins: number,
    ) => {
      if (isGuest) return;
      // Update React state
      setPlayerInventory(newInventory);
      setPlayerCoins(newCoins);
      // Sync to backend
      void savePlayerInventory(newInventory);
      void savePlayerCoins(newCoins);
      // Also update gameState ref so the game loop sees fresh values
      const state = gameStateRef.current;
      if (state) {
        state.player.inventory = newInventory;
        state.player.coins = newCoins;
      }
    },
    [isGuest, savePlayerInventory, savePlayerCoins],
  );

  // ── Keep React titles state in sync with game state ──────────────────────────
  useEffect(() => {
    if (screen !== "game") return;
    const id = setInterval(() => {
      const state = gameStateRef.current;
      if (!state) return;
      // Sync earned titles from game state (title unlocks happen in tickGameState)
      const gs = state.earnedTitles as TitleId[];
      if (
        gs.length !== earnedTitles.length ||
        !gs.every((t) => earnedTitles.includes(t))
      ) {
        setEarnedTitles([...gs]);
        // If a new title was unlocked, save to canister
        void savePlayerTitles(gs as string[], state.activeTitleId);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [screen, earnedTitles, savePlayerTitles]);

  // Countdown respawn timer display
  useEffect(() => {
    if (!isDead) return;
    const id = setInterval(() => {
      setRespawnTimer((t) => Math.max(0, t - 100));
    }, 100);
    return () => clearInterval(id);
  }, [isDead]);

  // ── 200ms sync: read combat / dodge / quick-slot state from gameStateRef ──
  // These values are written by the game loop (60fps) but only need to reach
  // React at 5fps — sufficient for visual feedback.
  useEffect(() => {
    if (screen !== "game") return;
    const id = setInterval(() => {
      const state = gameStateRef.current;
      if (!state) return;
      setQuickSlots([...state.quickSlots] as QuickSlots);
      setNotifications([...state.notifications]);
      setCombatLog([...state.combatLog]);
      setDodgeCooldownMs(state.player.dodgeCooldownTimer);
      setIsDodging(state.player.dodgeInvincibilityTimer > 0);
      setIsStunned(state.player.stunTimer > 0);
    }, 200);
    return () => clearInterval(id);
  }, [screen]);

  // Poll for other players every 2000ms
  useEffect(() => {
    if (screen !== "game" || !username || isGuest) return;
    // Capture BOTH session ID and sync generation at effect start.
    // If either changes (logout / new login), this polling loop exits silently.
    const capturedSession = sessionIdRef.current;
    const capturedGen = syncGenRef.current;

    const isStale = () =>
      sessionIdRef.current !== capturedSession ||
      syncGenRef.current !== capturedGen;

    const poll = async () => {
      // Bail immediately if session was invalidated before we even start
      if (isStale()) return;
      try {
        const pingStart = Date.now();
        const players = await withTimeout(fetchAllPlayers(username), 10000);
        const measuredPing = Date.now() - pingStart;
        // Double-check after the async call — session may have changed mid-flight
        if (isStale()) return;
        setPingMs(measuredPing);

        // ── Dead reckoning: carry over runtime interpolation state ──────────
        // When a new server update arrives, preserve the previous x/y and compute
        // a velocity estimate. Between updates, tickGameState will lerp toward
        // serverX/serverY while applying a reduced velocity prediction.
        const now = Date.now();
        const existingMap = new Map(
          (gameStateRef.current?.otherPlayers ?? []).map((p) => [
            p.username,
            p,
          ]),
        );

        const taggedPlayers = players.map((p) => {
          const prev = existingMap.get(p.username);
          const newServerX = p.x;
          const newServerY = p.y;
          let velX = 0;
          let velY = 0;
          if (
            prev?.serverX !== undefined &&
            prev?.serverY !== undefined &&
            prev?.lastServerUpdateTime !== undefined
          ) {
            const dt = now - prev.lastServerUpdateTime;
            if (dt > 0 && dt < 5000) {
              velX = (newServerX - prev.serverX) / dt;
              velY = (newServerY - prev.serverY) / dt;
              // Clamp velocity to max reasonable player speed (0.1 tiles/ms = 100 tiles/sec → capped to 0.01)
              const maxVel = 0.01;
              velX = Math.max(-maxVel, Math.min(maxVel, velX));
              velY = Math.max(-maxVel, Math.min(maxVel, velY));
            }
          }
          return {
            ...p,
            sessionId: capturedSession,
            // Keep current visual x/y (don't snap — let tickGameState lerp)
            x: prev?.x ?? p.x,
            y: prev?.y ?? p.y,
            serverX: newServerX,
            serverY: newServerY,
            velX,
            velY,
            lastServerUpdateTime: now,
          };
        });

        setOtherPlayers(taggedPlayers);
        if (gameStateRef.current) {
          gameStateRef.current.otherPlayers = taggedPlayers;
        }
        setConnectionStatus("connected");
      } catch {
        if (!isStale()) setConnectionStatus("offline");
      }
      if (isStale()) return;
      if (chatMessagesRef.current.length > 0) {
        setChatMessages((prev) => {
          const localMsgs = prev.filter((m) => m.username === username);
          const backendOthers = chatMessagesRef.current.filter(
            (m) => m.username !== username,
          );
          return [...localMsgs, ...backendOthers]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 40);
        });
      }
      if (gameStateRef.current && !isStale()) {
        const newZoneId = gameStateRef.current.currentZoneId;
        setCurrentZoneId(newZoneId);
        setIsGameTransitioning(gameStateRef.current.isTransitioning);
        setPlayerCoins(gameStateRef.current.player.coins);
        setPlayerInventory([...gameStateRef.current.player.inventory]);

        // ── Zone discovery check ──
        // Guests are excluded from zone discoveries
        if (!isGuestRef.current && newZoneId) {
          const zoneStr = String(newZoneId);
          if (!discoveredZonesRef.current.includes(zoneStr)) {
            const updated = [...discoveredZonesRef.current, zoneStr];
            discoveredZonesRef.current = updated;
            setDiscoveredZones(updated);
            // Show discovery popup with the zone display name
            // Import zone display name from worldMap layout
            import("./lib/worldMap")
              .then(({ getZoneLayout }) => {
                const layout = getZoneLayout(newZoneId);
                const displayName = layout?.displayName ?? zoneStr;
                setPendingDiscovery(displayName);
              })
              .catch(() => {
                setPendingDiscovery(zoneStr);
              });
            // Save to backend (fire-and-forget)
            void saveDiscoveredZones(updated).catch(() => {});
          }
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [
    screen,
    username,
    isGuest,
    fetchAllPlayers,
    chatMessagesRef,
    saveDiscoveredZones,
  ]);

  // Global pointer/key activity tracking for inactivity system
  useEffect(() => {
    if (screen !== "game") return;
    const handler = () => resetActivity();
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [screen, resetActivity]);

  // ESC key: open settings overlay while in-game (ESC is not consumed by SettingsScreen itself here)
  useEffect(() => {
    if (screen !== "game") return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showSettings) {
        setSettingsContext("in_game");
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [screen, showSettings]);

  return (
    <ScreenFade fadeKey={fadeKey}>
      {/* Session transition overlay — shown briefly on logout to guarantee
          the canvas is fully unmounted and state is clean before the next
          session starts. Prevents ghost entities from following new logins. */}
      {showSessionTransition && <SessionTransitionOverlay />}

      {/* Loading screen — shows before anything else */}
      {screen === "loading" && (
        <LoadingScreen stage={loadingStage} error={loadingError} />
      )}

      {screen === "leaderboard" && (
        <LeaderboardScreen onBack={handleBackToMenu} />
      )}

      {screen === "login" && (
        <LoginScreen
          onLogin={handleLogin}
          isAuthenticated={isAuthenticated}
          onRequestLogin={handleLoginWithII}
          onPlayAsGuest={handlePlayAsGuest}
          onCheckNickname={checkNicknameAvailable}
          iiLoginState={iiLoginState}
          iiLoginError={iiLoginError}
          onCancelLogin={handleCancelIILogin}
          onLeaderboard={handleLeaderboard}
        />
      )}

      {screen === "character_select" && (
        <CharacterSelectScreen
          characters={characters}
          onSelect={handleCharacterSelect}
          onCreateNew={handleCreateNewCharacter}
          username={username}
          onLogout={handleLogout}
          onSettings={() => {
            setSettingsContext("character_select");
            setShowSettings(true);
          }}
        />
      )}

      {screen === "character_creation" && (
        <CharacterCreationScreen
          onComplete={(name, cls, style, outfit, hair) => {
            handleLogin(name, cls);
            // Persist appearance choices
            localStorage.setItem(CLASS_KEY, cls);
            localStorage.setItem(USERNAME_KEY, name);
            setCustomization({
              outfitColor: outfit,
              outfitStyle: style,
              hairColor: hair,
            });
          }}
          onCancel={() => {
            // Return to character_select if characters exist, else login
            if (characters.length > 0) {
              transitionTo("character_select");
            } else {
              transitionTo("login");
            }
          }}
          checkNicknameAvailable={checkNicknameAvailable}
        />
      )}

      {screen === "world_loading" && worldLoadingChar && (
        <WorldLoadingScreen
          characterName={worldLoadingChar.username}
          destinationZone={currentZoneId}
          onLoadComplete={handleWorldLoadComplete}
        />
      )}

      {screen === "game" && (
        <div
          className="bg-background overflow-hidden"
          data-ocid="game-root"
          style={{
            width: "100vw",
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* CRT scanline overlay */}
          <div
            className="pointer-events-none fixed inset-0"
            aria-hidden="true"
            style={{
              background:
                "repeating-linear-gradient(0deg, oklch(0 0 0 / 0.05) 0px, oklch(0 0 0 / 0.05) 1px, transparent 1px, transparent 3px)",
              zIndex: 50,
            }}
          />

          {/* Connection status dot */}
          <ConnectionDot status={connectionStatus} />

          {/* ── Portrait mode layout ── */}
          {!isLandscape ? (
            <>
              {/* TOP BAR (80px) — outside the canvas */}
              <PortraitTopBar
                username={username}
                selectedClass={selectedClass}
                level={playerLevel}
                hp={playerHp}
                maxHp={playerMaxHp}
                mp={playerMp}
                maxMp={playerMaxMp}
                xp={playerXp}
                currentZoneId={currentZoneId}
                tileX={hudPos.x}
                tileY={hudPos.y}
                coins={playerCoins}
                pingMs={pingMs}
                isGuest={isGuest}
                onSettingsOpen={() => {
                  setSettingsContext("in_game");
                  setShowSettings(true);
                }}
                onMenuOpen={() => setGameMenuOpen(true)}
                onLogout={handleLogout}
              />

              {/* CANVAS AREA — fills remaining space between top and bottom bars */}
              <div
                style={{
                  flex: "1 1 0%",
                  minHeight: 0,
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  background: "#0a1628",
                }}
                data-ocid="game-canvas-area"
              >
                {/* Scaled canvas frame — fills full width, height auto via scale */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${portraitScale})`,
                      transformOrigin: "top center",
                      width: CANVAS_W,
                      position: "absolute",
                      left: "50%",
                      top: 0,
                      marginLeft: -(CANVAS_W / 2),
                    }}
                  >
                    <div
                      className="relative"
                      style={{
                        border: "1px solid oklch(0.25 0 0)",
                        outline: "2px solid oklch(0.13 0 0)",
                        width: CANVAS_W,
                      }}
                      data-ocid="game-viewport"
                    >
                      {/* GameHUD: portrait mode — only overlays/panels, no top bar */}
                      <GameHUD
                        username={username}
                        selectedClass={selectedClass}
                        tileX={hudPos.x}
                        tileY={hudPos.y}
                        currentZoneId={currentZoneId}
                        hp={playerHp}
                        maxHp={playerMaxHp}
                        mp={playerMp}
                        maxMp={playerMaxMp}
                        xp={playerXp}
                        level={playerLevel}
                        isDead={isDead}
                        respawnTimer={respawnTimer}
                        customization={customization}
                        onCustomizationSave={handleCustomizationSave}
                        onLogout={handleLogout}
                        onEmote={handleEmote}
                        emoteOpen={emoteOpen}
                        onEmoteOpenChange={setEmoteOpen}
                        onSendChat={handleSendChat}
                        chatOpen={chatOpen}
                        onChatOpenChange={setChatOpen}
                        coins={playerCoins}
                        inventory={playerInventory}
                        equippedGear={playerGear}
                        onEquipItem={handleEquipItem}
                        isTransitioning={isGameTransitioning}
                        inventoryOpen={inventoryOpen}
                        onInventoryOpenChange={setInventoryOpen}
                        onUsePotion={handleUsePotion}
                        potionCount={gameStateRef.current?.potionCount ?? 5}
                        potionCooldownPct={
                          gameStateRef.current &&
                          gameStateRef.current.potionCooldownTimer > 0
                            ? gameStateRef.current.potionCooldownTimer / 10000
                            : 0
                        }
                        onUseManaPotion={handleUseManaPotion}
                        manaPotionCount={
                          gameStateRef.current?.manaPotionCount ?? 0
                        }
                        manaPotionCooldownPct={
                          gameStateRef.current &&
                          gameStateRef.current.manaPotionCooldownTimer > 0
                            ? gameStateRef.current.manaPotionCooldownTimer /
                              10000
                            : 0
                        }
                        earnedTitles={earnedTitles}
                        activeTitleId={activeTitleId}
                        isGuest={isGuest}
                        onSelectTitle={handleSelectTitle}
                        craftingOpen={craftingOpen}
                        onCraftingOpenChange={setCraftingOpen}
                        onCraft={handleCraft}
                        portraitMode
                        discoveredZones={discoveredZones}
                        pendingDiscovery={pendingDiscovery}
                        onDiscoveryComplete={() => setPendingDiscovery(null)}
                        notifications={notifications}
                        onDismissNotification={handleDismissNotification}
                        combatLog={combatLog}
                      />
                      <div style={{ height: CANVAS_H, position: "relative" }}>
                        <GameCanvas
                          username={username}
                          selectedClass={selectedClass}
                          otherPlayers={otherPlayers}
                          gameStateRef={gameStateRef}
                          onPositionUpdate={onPositionUpdate}
                          onOpenEmotePanel={() => setEmoteOpen((o) => !o)}
                          onOpenChat={() => setChatOpen((o) => !o)}
                          chatOpen={chatInputFocused}
                          chatMessages={chatMessages}
                          onHpChanged={handleHpChanged}
                          onXpChanged={handleXpChanged}
                          onMonsterKilled={handleMonsterKilled}
                          onPlayerDied={handlePlayerDied}
                          onPlayerRespawned={handlePlayerRespawned}
                          onCollectLoot={handleCollectLoot}
                          currentSessionId={sessionIdRef.current}
                          onOpenCrafting={() => setCraftingOpen(true)}
                          onOpenGuild={() => setGuildOpen(true)}
                          isGuest={isGuest}
                          onEventAnnounce={(text) => {
                            void sendChatMessage(text).catch(() => {});
                          }}
                          playerGuildName={playerGuildName ?? undefined}
                        />
                        {/* Combat visual overlay — floating damage numbers, combo counter */}
                        <CombatOverlay
                          scale={1}
                          canvasW={CANVAS_W}
                          canvasH={CANVAS_H}
                          selectedClass={selectedClass}
                        />
                        {/* Low-HP screen edge danger vignette */}
                        {!isDead &&
                          playerMaxHp > 0 &&
                          playerHp / playerMaxHp < 0.3 && (
                            <div
                              className="danger-vignette"
                              aria-hidden="true"
                            />
                          )}
                      </div>

                      {/* Death overlay */}
                      {isDead && (
                        <DeathOverlay
                          respawnTimer={respawnTimer}
                          deathRecap={
                            gameStateRef.current?.player.deathRecap ?? null
                          }
                          checkpointActive={
                            gameStateRef.current?.checkpointActive ?? false
                          }
                          onRespawnAtCheckpoint={() => {
                            const state = gameStateRef.current;
                            if (!state) return;
                            respawnAtCheckpoint(state);
                            setIsDead(false);
                            setRespawnTimer(0);
                            if (state) {
                              setPlayerHp(state.player.hp);
                              setPlayerMp(state.player.mp);
                            }
                          }}
                        />
                      )}

                      {/* Guild Panel overlay */}
                      {guildOpen && (
                        <GuildPanel
                          playerCoins={playerCoins}
                          username={username}
                          guildId={playerGuildId}
                          guildRank={playerGuildRank}
                          actor={backendActor}
                          onClose={() => setGuildOpen(false)}
                          onLeaveGuild={(newCoins) => {
                            setPlayerGuildId(null);
                            setPlayerGuildRank(null);
                            setPlayerGuildName(null);
                            setPlayerCoins(newCoins);
                          }}
                          onDisband={() => {
                            setPlayerGuildId(null);
                            setPlayerGuildRank(null);
                            setPlayerGuildName(null);
                          }}
                          isGuest={isGuest}
                          onGuildChanged={(newId, newRank) => {
                            setPlayerGuildId(newId);
                            setPlayerGuildRank(newRank);
                            // Fetch guild name if we joined one
                            if (newId && backendActor) {
                              void backendActor
                                .getGuild(newId)
                                .then((g) => {
                                  if (g) setPlayerGuildName(g.name);
                                })
                                .catch(() => {});
                            } else {
                              setPlayerGuildName(null);
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* GAME MENU PANEL — overlays controls+chat area, does NOT cover canvas */}
              <GameMenuPanel
                isOpen={gameMenuOpen}
                onClose={() => setGameMenuOpen(false)}
                selectedClass={selectedClass}
                isGuest={isGuest}
                username={username}
                level={playerLevel}
                hp={playerHp}
                maxHp={playerMaxHp}
                mp={playerMp}
                maxMp={playerMaxMp}
                coins={playerCoins}
                inventory={playerInventory}
                earnedTitles={earnedTitles}
                activeTitleId={activeTitleId}
                onSelectTitle={handleSelectTitle}
                onLogout={handleLogout}
              />

              {/* CHAT STRIP — dedicated zone below canvas, above controls */}
              <ChatStrip
                messages={chatMessages}
                currentUsername={username}
                selectedClass={selectedClass}
                isGuest={isGuest}
                onSendMessage={handleSendChat}
                onChatFocus={() => setChatInputFocused(true)}
                onChatBlur={() => setChatInputFocused(false)}
              />

              {/* BOTTOM BAR — TouchControls, flush at bottom, no gap */}
              <div
                style={{
                  flexShrink: 0,
                  height: "calc(260px + env(safe-area-inset-bottom, 0px))",
                  background: "rgba(5,5,20,0.95)",
                  borderTop: "1px solid rgba(212,175,55,0.25)",
                  position: "relative",
                  zIndex: 30,
                  boxSizing: "border-box",
                  paddingBottom: "env(safe-area-inset-bottom, 0px)",
                }}
                data-ocid="portrait-bottom-bar"
              >
                <TouchControls
                  onDirection={handleTouchDirection}
                  onDpadPress={handleDpadPressCallback}
                  onDpadRelease={handleDpadReleaseCallback}
                  onRotate={handleRotation}
                  onEmote={handleEmote}
                  onAttack={handleAttack}
                  onFrostNova={handleFrostNova}
                  onShadowLance={handleShadowLance}
                  onFlameRing={handleFlameRing}
                  onShield={handleShield}
                  characterClass={selectedClass}
                  onOpenChat={() => setChatOpen(true)}
                  onInventoryToggle={() => setInventoryOpen((o) => !o)}
                  audioEnabled={audioEnabled}
                  onAudioToggle={() => {
                    initAudio()
                      .then(() => {
                        const enabled = audioEngine.toggleMaster();
                        setAudioEnabled(enabled);
                      })
                      .catch(() => {});
                  }}
                  isTransitioning={isGameTransitioning}
                  inventoryItemCount={
                    playerInventory.filter((i) => i.itemType !== "coin").length
                  }
                  currentMp={playerMp}
                  maxMp={playerMaxMp}
                  frostNovaCooldownPct={
                    gameStateRef.current
                      ? gameStateRef.current.frostNovaCooldown > 0
                        ? gameStateRef.current.frostNovaCooldown /
                          FROST_NOVA_COOLDOWN_MS
                        : 0
                      : 0
                  }
                  frostNovaCooldownMs={
                    gameStateRef.current?.frostNovaCooldown ?? 0
                  }
                  shadowLanceCooldownPct={
                    gameStateRef.current
                      ? gameStateRef.current.shadowLanceCooldown > 0
                        ? gameStateRef.current.shadowLanceCooldown /
                          SHADOW_LANCE_COOLDOWN_MS
                        : 0
                      : 0
                  }
                  shadowLanceCooldownMs={
                    gameStateRef.current?.shadowLanceCooldown ?? 0
                  }
                  flameRingCooldownPct={
                    gameStateRef.current
                      ? gameStateRef.current.flameRingCooldown > 0
                        ? gameStateRef.current.flameRingCooldown /
                          FLAME_RING_COOLDOWN_MS
                        : 0
                      : 0
                  }
                  noManaShakeSpell={
                    gameStateRef.current?.noManaShakeSpell ?? null
                  }
                  mpBarPulse={gameStateRef.current?.mpBarPulse ?? false}
                  onNoManaFeedback={handleNoManaFeedback}
                  shieldCooldownMs={
                    gameStateRef.current?.player.shieldCooldown ?? 0
                  }
                  shieldActive={
                    gameStateRef.current?.player.shieldActive ?? false
                  }
                  isGuest={isGuest}
                  potionCount={gameStateRef.current?.potionCount ?? 0}
                  potionCooldownPct={
                    gameStateRef.current &&
                    gameStateRef.current.potionCooldownTimer > 0
                      ? gameStateRef.current.potionCooldownTimer / 10000
                      : 0
                  }
                  onUsePotion={handleUsePotion}
                  manaPotionCount={gameStateRef.current?.manaPotionCount ?? 0}
                  manaPotionCooldownPct={
                    gameStateRef.current &&
                    gameStateRef.current.manaPotionCooldownTimer > 0
                      ? gameStateRef.current.manaPotionCooldownTimer / 10000
                      : 0
                  }
                  onUseManaPotion={handleUseManaPotion}
                  quickSlots={quickSlots}
                  onUseQuickSlot={handleUseQuickSlot}
                  dodgeCooldownMs={dodgeCooldownMs}
                  isDodging={isDodging}
                  isStunned={isStunned}
                  onOpenMap={() => setIsMapOpen((o) => !o)}
                  isMapOpen={isMapOpen}
                  minimapTiles={gameStateRef.current?.world?.tiles ?? undefined}
                  minimapPlayerX={hudPos.x}
                  minimapPlayerY={hudPos.y}
                  minimapZoneId={currentZoneId}
                  minimapFacing={
                    gameStateRef.current?.player.lastFacing ?? "down"
                  }
                  minimapMonsters={gameStateRef.current?.monsters ?? []}
                  minimapTimestamp={Date.now()}
                  onMinimapTap={() => setIsMapOpen((o) => !o)}
                  visible
                  portraitBottomBar
                />
              </div>
            </>
          ) : (
            /* ── Landscape mode: original scaled-viewport layout ── */
            <div
              className="flex items-center justify-center"
              style={{ flex: 1, position: "relative" }}
            >
              <div
                style={{
                  transform: `scale(${portraitScale})`,
                  transformOrigin: "center center",
                  width: CANVAS_W,
                }}
              >
                <div
                  className="relative flex flex-col"
                  style={{
                    border: "1px solid oklch(0.25 0 0)",
                    outline: "2px solid oklch(0.13 0 0)",
                    width: CANVAS_W,
                  }}
                  data-ocid="game-viewport"
                >
                  <GameHUD
                    username={username}
                    selectedClass={selectedClass}
                    tileX={hudPos.x}
                    tileY={hudPos.y}
                    currentZoneId={currentZoneId}
                    hp={playerHp}
                    maxHp={playerMaxHp}
                    mp={playerMp}
                    maxMp={playerMaxMp}
                    xp={playerXp}
                    level={playerLevel}
                    isDead={isDead}
                    respawnTimer={respawnTimer}
                    customization={customization}
                    onCustomizationSave={handleCustomizationSave}
                    onLogout={handleLogout}
                    onEmote={handleEmote}
                    emoteOpen={emoteOpen}
                    onEmoteOpenChange={setEmoteOpen}
                    onSendChat={handleSendChat}
                    chatOpen={chatOpen}
                    onChatOpenChange={setChatOpen}
                    coins={playerCoins}
                    inventory={playerInventory}
                    equippedGear={playerGear}
                    onEquipItem={handleEquipItem}
                    isTransitioning={isGameTransitioning}
                    inventoryOpen={inventoryOpen}
                    onInventoryOpenChange={setInventoryOpen}
                    onUsePotion={handleUsePotion}
                    potionCount={gameStateRef.current?.potionCount ?? 5}
                    potionCooldownPct={
                      gameStateRef.current &&
                      gameStateRef.current.potionCooldownTimer > 0
                        ? gameStateRef.current.potionCooldownTimer / 10000
                        : 0
                    }
                    onUseManaPotion={handleUseManaPotion}
                    manaPotionCount={gameStateRef.current?.manaPotionCount ?? 0}
                    manaPotionCooldownPct={
                      gameStateRef.current &&
                      gameStateRef.current.manaPotionCooldownTimer > 0
                        ? gameStateRef.current.manaPotionCooldownTimer / 10000
                        : 0
                    }
                    earnedTitles={earnedTitles}
                    activeTitleId={activeTitleId}
                    isGuest={isGuest}
                    onSelectTitle={handleSelectTitle}
                    craftingOpen={craftingOpen}
                    onCraftingOpenChange={setCraftingOpen}
                    onCraft={handleCraft}
                    discoveredZones={discoveredZones}
                    pendingDiscovery={pendingDiscovery}
                    onDiscoveryComplete={() => setPendingDiscovery(null)}
                    notifications={notifications}
                    onDismissNotification={handleDismissNotification}
                    combatLog={combatLog}
                  />
                  <div style={{ height: CANVAS_H, position: "relative" }}>
                    <GameCanvas
                      username={username}
                      selectedClass={selectedClass}
                      otherPlayers={otherPlayers}
                      gameStateRef={gameStateRef}
                      onPositionUpdate={onPositionUpdate}
                      onOpenEmotePanel={() => setEmoteOpen((o) => !o)}
                      onOpenChat={() => setChatOpen((o) => !o)}
                      chatOpen={chatInputFocused}
                      chatMessages={chatMessages}
                      onHpChanged={handleHpChanged}
                      onXpChanged={handleXpChanged}
                      onMonsterKilled={handleMonsterKilled}
                      onPlayerDied={handlePlayerDied}
                      onPlayerRespawned={handlePlayerRespawned}
                      onCollectLoot={handleCollectLoot}
                      currentSessionId={sessionIdRef.current}
                      onOpenCrafting={() => setCraftingOpen(true)}
                      onOpenGuild={() => setGuildOpen(true)}
                      isGuest={isGuest}
                      onEventAnnounce={(text) => {
                        void sendChatMessage(text).catch(() => {});
                      }}
                      playerGuildName={playerGuildName ?? undefined}
                    />
                    {/* Low-HP screen edge danger vignette */}
                    {!isDead &&
                      playerMaxHp > 0 &&
                      playerHp / playerMaxHp < 0.3 && (
                        <div className="danger-vignette" aria-hidden="true" />
                      )}
                  </div>

                  {/* Death overlay */}
                  {isDead && (
                    <DeathOverlay
                      respawnTimer={respawnTimer}
                      deathRecap={
                        gameStateRef.current?.player.deathRecap ?? null
                      }
                      checkpointActive={
                        gameStateRef.current?.checkpointActive ?? false
                      }
                      onRespawnAtCheckpoint={() => {
                        const state = gameStateRef.current;
                        if (!state) return;
                        respawnAtCheckpoint(state);
                        setIsDead(false);
                        setRespawnTimer(0);
                        setPlayerHp(state.player.hp);
                        setPlayerMp(state.player.mp);
                      }}
                    />
                  )}

                  {/* Guild Panel overlay (landscape) */}
                  {guildOpen && (
                    <GuildPanel
                      playerCoins={playerCoins}
                      username={username}
                      guildId={playerGuildId}
                      guildRank={playerGuildRank}
                      actor={backendActor}
                      onClose={() => setGuildOpen(false)}
                      onLeaveGuild={(newCoins) => {
                        setPlayerGuildId(null);
                        setPlayerGuildRank(null);
                        setPlayerGuildName(null);
                        setPlayerCoins(newCoins);
                      }}
                      onDisband={() => {
                        setPlayerGuildId(null);
                        setPlayerGuildRank(null);
                        setPlayerGuildName(null);
                      }}
                      isGuest={isGuest}
                      onGuildChanged={(newId, newRank) => {
                        setPlayerGuildId(newId);
                        setPlayerGuildRank(newRank);
                        if (newId && backendActor) {
                          void backendActor
                            .getGuild(newId)
                            .then((g) => {
                              if (g) setPlayerGuildName(g.name);
                            })
                            .catch(() => {});
                        } else {
                          setPlayerGuildName(null);
                        }
                      }}
                    />
                  )}

                  <TouchControls
                    onDirection={handleTouchDirection}
                    onDpadPress={handleDpadPressCallback}
                    onDpadRelease={handleDpadReleaseCallback}
                    onRotate={handleRotation}
                    onEmote={handleEmote}
                    onAttack={handleAttack}
                    onFrostNova={handleFrostNova}
                    onShadowLance={handleShadowLance}
                    onFlameRing={handleFlameRing}
                    onShield={handleShield}
                    characterClass={selectedClass}
                    onOpenChat={() => setChatOpen(true)}
                    onInventoryToggle={() => setInventoryOpen((o) => !o)}
                    audioEnabled={audioEnabled}
                    onAudioToggle={() => {
                      initAudio()
                        .then(() => {
                          const enabled = audioEngine.toggleMaster();
                          setAudioEnabled(enabled);
                        })
                        .catch(() => {});
                    }}
                    isTransitioning={isGameTransitioning}
                    inventoryItemCount={
                      playerInventory.filter((i) => i.itemType !== "coin")
                        .length
                    }
                    currentMp={playerMp}
                    maxMp={playerMaxMp}
                    frostNovaCooldownPct={
                      gameStateRef.current
                        ? gameStateRef.current.frostNovaCooldown > 0
                          ? gameStateRef.current.frostNovaCooldown /
                            FROST_NOVA_COOLDOWN_MS
                          : 0
                        : 0
                    }
                    frostNovaCooldownMs={
                      gameStateRef.current?.frostNovaCooldown ?? 0
                    }
                    shadowLanceCooldownPct={
                      gameStateRef.current
                        ? gameStateRef.current.shadowLanceCooldown > 0
                          ? gameStateRef.current.shadowLanceCooldown /
                            SHADOW_LANCE_COOLDOWN_MS
                          : 0
                        : 0
                    }
                    shadowLanceCooldownMs={
                      gameStateRef.current?.shadowLanceCooldown ?? 0
                    }
                    flameRingCooldownPct={
                      gameStateRef.current
                        ? gameStateRef.current.flameRingCooldown > 0
                          ? gameStateRef.current.flameRingCooldown /
                            FLAME_RING_COOLDOWN_MS
                          : 0
                        : 0
                    }
                    noManaShakeSpell={
                      gameStateRef.current?.noManaShakeSpell ?? null
                    }
                    mpBarPulse={gameStateRef.current?.mpBarPulse ?? false}
                    onNoManaFeedback={handleNoManaFeedback}
                    shieldCooldownMs={
                      gameStateRef.current?.player.shieldCooldown ?? 0
                    }
                    shieldActive={
                      gameStateRef.current?.player.shieldActive ?? false
                    }
                    isGuest={isGuest}
                    potionCount={gameStateRef.current?.potionCount ?? 0}
                    potionCooldownPct={
                      gameStateRef.current &&
                      gameStateRef.current.potionCooldownTimer > 0
                        ? gameStateRef.current.potionCooldownTimer / 10000
                        : 0
                    }
                    onUsePotion={handleUsePotion}
                    manaPotionCount={gameStateRef.current?.manaPotionCount ?? 0}
                    manaPotionCooldownPct={
                      gameStateRef.current &&
                      gameStateRef.current.manaPotionCooldownTimer > 0
                        ? gameStateRef.current.manaPotionCooldownTimer / 10000
                        : 0
                    }
                    onUseManaPotion={handleUseManaPotion}
                    quickSlots={quickSlots}
                    onUseQuickSlot={handleUseQuickSlot}
                    dodgeCooldownMs={dodgeCooldownMs}
                    isDodging={isDodging}
                    isStunned={isStunned}
                    onOpenMap={() => setIsMapOpen((o) => !o)}
                    isMapOpen={isMapOpen}
                    visible
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── World Map Overlay — toggle via MAP button ── */}
          {isMapOpen && (
            <MapOverlay
              onClose={() => setIsMapOpen(false)}
              discoveredZones={discoveredZones}
              currentZoneId={currentZoneId}
            />
          )}

          {/* ── Inactivity Warning Overlay ── */}
          {showInactivityWarning && (
            <InactivityWarning onStay={resetActivity} onLogout={handleLogout} />
          )}

          {/* ── Subtle idle vignette (60-90s idle, before full warning) ── */}
          {showIdleVignette && !showInactivityWarning && (
            <div
              className="pointer-events-none fixed inset-0"
              aria-hidden="true"
              style={{
                zIndex: 150,
                background:
                  "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.42) 100%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: 220,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                Still there?
              </div>
            </div>
          )}

          {/* ── XP gain popup events (near XP bar, top-right) ── */}
          {xpGainEvents.map((evt) => (
            <div
              key={evt.id}
              aria-hidden="true"
              style={{
                position: "fixed",
                top: 64,
                right: 14,
                pointerEvents: "none",
                zIndex: 160,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 800,
                color: "#4ade80",
                textShadow: "0 0 8px rgba(74,222,128,0.7)",
                letterSpacing: "0.06em",
                animation: "xpGainSlide 1.2s ease-out forwards",
              }}
            >
              +{evt.amount} XP
            </div>
          ))}

          {/* Gold counter flash overlay */}
          {goldFlash && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed"
              style={{
                top: 6,
                right: 100,
                width: 52,
                height: 20,
                borderRadius: 4,
                background: "rgba(212,175,55,0.25)",
                border: "1px solid rgba(212,175,55,0.7)",
                zIndex: 155,
                animation: "goldFlashAnim 0.35s ease-out forwards",
              }}
            />
          )}

          {/* ── Offline Progress Note ── */}
          {offlineNote && <OfflineProgressNote message={offlineNote} />}
        </div>
      )}

      {/* ── Settings Overlay — available from character select and in-game ── */}
      {showSettings && (
        <SettingsScreen
          context={settingsContext}
          onBack={() => setShowSettings(false)}
          onLogout={settingsContext === "in_game" ? handleLogout : undefined}
          currentPrincipal={(() => {
            try {
              const id = identity as unknown as
                | { getPrincipal?: () => { toText?: () => string } }
                | undefined;
              return id?.getPrincipal?.()?.toText?.() ?? undefined;
            } catch {
              return undefined;
            }
          })()}
          earnedTitles={earnedTitles}
          activeTitleId={activeTitleId}
          isGuest={isGuest}
        />
      )}
    </ScreenFade>
  );
}

// ─── Offline Progress Note ────────────────────────────────────────────────────
// Shown for 4 seconds when a returning Internet Identity player logs back in
// after being offline for more than 30 minutes. Non-blocking, top-center.

function OfflineProgressNote({ message }: { message: string }) {
  return (
    <div
      className="fixed pointer-events-none"
      style={{
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 300,
        animation:
          "fadeInSlideDown 0.35s ease-out, fadeOut 0.4s ease-in 3.6s forwards",
      }}
      data-ocid="offline-progress-note"
      aria-live="polite"
    >
      <div
        style={{
          background: "oklch(0.10 0.02 260 / 0.95)",
          border: "1.5px solid oklch(0.50 0.18 260 / 0.7)",
          borderRadius: 8,
          padding: "10px 20px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 600,
          color: "oklch(0.88 0.10 260)",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 20px oklch(0 0 0 / 0.5)",
          letterSpacing: "0.04em",
        }}
      >
        👋 {message}
      </div>
    </div>
  );
}

// ─── Inactivity Warning ───────────────────────────────────────────────────────

function InactivityWarning({
  onStay,
  onLogout,
}: {
  onStay: () => void;
  onLogout: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 200, background: "oklch(0 0 0 / 0.55)" }}
      onPointerDown={onStay}
      role="alertdialog"
      aria-label="Inactivity warning"
      data-ocid="inactivity-warning"
    >
      <div
        className="flex flex-col items-center gap-4 p-6"
        style={{
          background: "oklch(0.09 0 0 / 0.97)",
          border: "1px solid oklch(0.45 0.18 55 / 0.8)",
          borderRadius: 4,
          minWidth: 280,
          maxWidth: 340,
          boxShadow: "0 8px 32px oklch(0 0 0 / 0.7)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className="font-mono text-sm font-bold tracking-widest uppercase"
          style={{ color: "oklch(0.78 0.18 55)" }}
        >
          ⚠ Inactivity Warning
        </span>
        <p
          className="font-mono text-xs text-center leading-relaxed"
          style={{ color: "oklch(0.70 0 0)" }}
        >
          Logging out in{" "}
          <span className="font-bold" style={{ color: "oklch(0.85 0.18 25)" }}>
            {secondsLeft}s
          </span>{" "}
          due to inactivity…
        </p>
        <button
          type="button"
          onClick={onStay}
          data-ocid="inactivity-stay-btn"
          className="font-mono text-xs uppercase tracking-widest px-6 py-2 hover:brightness-110 active:scale-95 transition-smooth"
          style={{
            background: "oklch(0.45 0.18 145 / 0.8)",
            border: "1px solid oklch(0.60 0.18 145 / 0.7)",
            borderRadius: 2,
            color: "oklch(0.95 0.05 145)",
          }}
        >
          Touch anywhere to stay
        </button>
        <button
          type="button"
          onClick={onLogout}
          data-ocid="inactivity-logout-btn"
          className="font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Logout now
        </button>
      </div>
    </div>
  );
}

// ─── Safe II hook ─────────────────────────────────────────────────────────────

function useSafeInternetIdentity() {
  const result = useInternetIdentity();
  return {
    identity: result.identity ?? undefined,
    login:
      result.login ??
      (() => {
        console.warn("[PixelQuest] II login unavailable — guest mode active");
      }),
    clear: result.clear ?? (() => {}),
    isInitializing: result.isInitializing ?? false,
    loginStatus: result.loginStatus ?? "anonymous",
  };
}

// ─── Loading Screen ────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<LoadingStage, string> = {
  boot: "Starting…",
  assets: "Loading assets…",
  identity: "Connecting…",
  ready: "Ready!",
};

function LoadingScreen({
  stage,
  error,
}: {
  stage: LoadingStage;
  error: string | null;
}) {
  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center"
      style={{ fontFamily: "monospace" }}
      data-ocid="loading-screen"
      aria-live="polite"
      aria-label="Game loading"
    >
      {/* Scanline */}
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden="true"
        style={{
          background:
            "repeating-linear-gradient(0deg, oklch(0 0 0 / 0.05) 0px, oklch(0 0 0 / 0.05) 1px, transparent 1px, transparent 3px)",
          zIndex: 1,
        }}
      />

      <div
        className="flex flex-col items-center gap-6"
        style={{ zIndex: 2, position: "relative" }}
      >
        {/* Title */}
        <h1
          className="font-mono font-bold tracking-[0.3em] uppercase text-foreground"
          style={{
            fontSize: "clamp(1.8rem, 7vw, 3rem)",
            letterSpacing: "0.3em",
            color: "oklch(0.75 0.2 145)",
          }}
        >
          PIXEL QUEST
        </h1>

        {/* Animated progress dots */}
        {!error && (
          <div
            className="flex gap-2"
            aria-hidden="true"
            data-ocid="loading-dots"
          >
            <PulseDot delay={0} />
            <PulseDot delay={200} />
            <PulseDot delay={400} />
          </div>
        )}

        {/* Stage label */}
        {error ? (
          <div className="flex flex-col items-center gap-3">
            <p
              className="font-mono text-sm tracking-widest"
              style={{ color: "oklch(0.65 0.22 25)" }}
              data-ocid="loading-error"
            >
              ⚠ {error}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "oklch(0.2 0.05 145)",
                border: "1px solid oklch(0.4 0.1 145)",
                color: "oklch(0.85 0.15 145)",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                letterSpacing: "0.15em",
                padding: "0.5rem 1.5rem",
                cursor: "pointer",
              }}
            >
              ↺ RETRY
            </button>
          </div>
        ) : (
          <p
            className="font-mono text-xs tracking-widest uppercase"
            style={{ color: "oklch(0.50 0 0)", letterSpacing: "0.2em" }}
            data-ocid="loading-stage-text"
            aria-label={`Loading: ${STAGE_LABELS[stage]}`}
          >
            {STAGE_LABELS[stage]}
          </p>
        )}

        {/* Progress bar */}
        {!error && (
          <div
            style={{
              width: "160px",
              height: "2px",
              background: "oklch(0.2 0 0)",
              borderRadius: "1px",
              overflow: "hidden",
            }}
            aria-hidden="true"
          >
            <div
              style={{
                height: "100%",
                background: "oklch(0.72 0.2 145)",
                borderRadius: "1px",
                width:
                  stage === "boot"
                    ? "15%"
                    : stage === "assets"
                      ? "45%"
                      : stage === "identity"
                        ? "75%"
                        : "100%",
                transition: "width 0.5s ease",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PulseDot({ delay }: { delay: number }) {
  return (
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "oklch(0.72 0.2 145)",
        animation: "pq-pulse 1.2s ease-in-out infinite",
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// ─── Connection Status Dot ────────────────────────────────────────────────────

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: "oklch(0.72 0.2 145)",
    connecting: "oklch(0.78 0.18 85)",
    offline: "oklch(0.65 0.22 25)",
  };
  const labels: Record<ConnectionStatus, string> = {
    connected: "Connected",
    connecting: "Connecting…",
    offline: "Saving unavailable",
  };
  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 8px)",
        right: 12,
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 5,
        zIndex: 60,
        pointerEvents: "none",
      }}
      aria-label={labels[status]}
      title={labels[status]}
      data-ocid="connection-status"
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: colors[status],
          boxShadow: `0 0 5px ${colors[status]}`,
        }}
      />
      {status === "offline" && (
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.05em",
            color: "oklch(0.65 0.22 25)",
          }}
        >
          OFFLINE
        </span>
      )}
    </div>
  );
}

// ─── Death Overlay ────────────────────────────────────────────────────────────

function DeathOverlay({
  respawnTimer,
  deathRecap,
  checkpointActive = false,
  onRespawnAtCheckpoint,
}: {
  respawnTimer: number;
  deathRecap: {
    killerName: string;
    damageTaken: number;
    timeInZone: number;
  } | null;
  checkpointActive?: boolean;
  onRespawnAtCheckpoint?: () => void;
}) {
  const seconds = Math.ceil(respawnTimer / 1000);
  const [chosen, setChosen] = useState<
    "meadow_hub" | "aurelion" | "checkpoint"
  >("meadow_hub");
  // Track if this is first render (for one-shot vignette animation)
  const [showVignette, setShowVignette] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowVignette(false), 900);
    return () => clearTimeout(t);
  }, []);

  // SVG circular countdown ring
  const TOTAL_SECS = 8; // respawn duration
  const pct = Math.max(0, Math.min(1, respawnTimer / (TOTAL_SECS * 1000)));
  const RING_R = 28;
  const RING_CIRC = 2 * Math.PI * RING_R;
  const dashOffset = RING_CIRC * (1 - pct);

  const handleChoose = (zone: "meadow_hub" | "aurelion" | "checkpoint") => {
    setChosen(zone);
    if (zone !== "checkpoint") {
      setRespawnLocationChoice(zone);
    }
  };

  const respawnLabel =
    chosen === "checkpoint"
      ? "Checkpoint"
      : chosen === "aurelion"
        ? "Aurelion"
        : "Meadow Hub";

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      style={{
        zIndex: 45,
        background: "rgba(0,0,0,0.72)",
      }}
      data-ocid="death-overlay"
      aria-live="assertive"
      role="alert"
    >
      {/* Sepia colour tint overlay */}
      <div className="death-sepia-overlay" aria-hidden="true" />
      {/* Red vignette single pulse on death */}
      {showVignette && (
        <div className="death-red-vignette" aria-hidden="true" />
      )}

      <div
        className="flex flex-col items-center gap-3 pointer-events-auto"
        style={{
          position: "relative",
          zIndex: 46,
          padding: "28px 40px",
          textAlign: "center",
        }}
      >
        {/* YOU DIED */}
        <span
          className="you-died-text"
          style={{
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: "0.18em",
            color: "#cc2200",
            textShadow: "0 0 20px rgba(200,0,0,0.6), 0 2px 0 rgba(0,0,0,0.8)",
          }}
        >
          YOU DIED
        </span>

        {/* Circular countdown ring */}
        <div className="respawn-ring-container" style={{ marginTop: 4 }}>
          <svg
            className="respawn-ring-svg"
            width={72}
            height={72}
            viewBox="0 0 72 72"
            aria-hidden="true"
          >
            <circle className="respawn-ring-track" cx={36} cy={36} r={RING_R} />
            <circle
              className="respawn-ring-fill"
              cx={36}
              cy={36}
              r={RING_R}
              strokeDasharray={RING_CIRC}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span className="respawn-ring-label">{seconds}</span>
        </div>

        <span
          className="font-mono"
          style={{ fontSize: 13, color: "#888888", marginTop: 2 }}
        >
          Respawning in {respawnLabel}
        </span>

        {/* Respawn location choice */}
        <div
          className="flex gap-2 mt-2 flex-wrap justify-center"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
          }}
        >
          <button
            type="button"
            data-ocid="respawn-choice-meadow"
            onClick={() => handleChoose("meadow_hub")}
            style={{
              minWidth: 100,
              minHeight: 48,
              padding: "8px 12px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              cursor: "pointer",
              background:
                chosen === "meadow_hub"
                  ? "rgba(60,140,60,0.55)"
                  : "rgba(30,30,30,0.6)",
              border: `1.5px solid ${
                chosen === "meadow_hub" ? "#55cc55" : "rgba(100,100,100,0.5)"
              }`,
              color: chosen === "meadow_hub" ? "#aaffaa" : "#888",
              transition: "all 0.15s ease",
            }}
          >
            🌿 Meadow Hub
          </button>
          <button
            type="button"
            data-ocid="respawn-choice-aurelion"
            onClick={() => handleChoose("aurelion")}
            style={{
              minWidth: 100,
              minHeight: 48,
              padding: "8px 12px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              cursor: "pointer",
              background:
                chosen === "aurelion"
                  ? "rgba(60,60,140,0.55)"
                  : "rgba(30,30,30,0.6)",
              border: `1.5px solid ${
                chosen === "aurelion" ? "#8888ff" : "rgba(100,100,100,0.5)"
              }`,
              color: chosen === "aurelion" ? "#aaaaff" : "#888",
              transition: "all 0.15s ease",
            }}
          >
            ✨ Aurelion
          </button>
          {checkpointActive && (
            <button
              type="button"
              data-ocid="respawn-choice-checkpoint"
              onClick={() => {
                handleChoose("checkpoint");
                onRespawnAtCheckpoint?.();
              }}
              style={{
                minWidth: 100,
                minHeight: 48,
                padding: "8px 12px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                cursor: "pointer",
                background:
                  chosen === "checkpoint"
                    ? "rgba(140,80,0,0.6)"
                    : "rgba(30,30,30,0.6)",
                border: `1.5px solid ${
                  chosen === "checkpoint" ? "#ffaa33" : "rgba(100,100,100,0.5)"
                }`,
                color: chosen === "checkpoint" ? "#ffcc77" : "#888",
                transition: "all 0.15s ease",
              }}
            >
              ⚡ Checkpoint
            </button>
          )}
        </div>

        {deathRecap && (
          <div
            className="flex flex-col gap-1 text-center"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <span
              className="font-mono text-xs"
              style={{ color: "oklch(0.60 0 0)" }}
            >
              Defeated by:{" "}
              <span style={{ color: "oklch(0.75 0.10 25)" }}>
                {deathRecap.killerName}
              </span>
            </span>
            <span
              className="font-mono text-xs"
              style={{ color: "oklch(0.55 0 0)" }}
            >
              Damage taken:{" "}
              <span style={{ color: "oklch(0.65 0.12 25)" }}>
                {deathRecap.damageTaken}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session Transition Overlay ───────────────────────────────────────────────
// Shown for ~600ms between logout and the next screen. Guarantees the canvas
// is fully unmounted and React state is drained — no stale ghost entity or
// sprite reference from the previous session can survive into the new one.

function SessionTransitionOverlay() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 9999,
        background: "oklch(0.04 0 0)",
      }}
      aria-hidden="true"
      data-ocid="session-transition-overlay"
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "oklch(0.72 0.2 145)",
          animation: "pq-pulse 0.8s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// ─── Fade wrapper ─────────────────────────────────────────────────────────────

function ScreenFade({
  children,
  fadeKey,
}: {
  children: React.ReactNode;
  fadeKey: number;
}) {
  const [opacity, setOpacity] = useState(1);
  const prevKey = useRef(fadeKey);

  useEffect(() => {
    if (fadeKey !== prevKey.current) {
      setOpacity(0);
      const t = setTimeout(() => {
        prevKey.current = fadeKey;
        setOpacity(1);
      }, 60);
      return () => clearTimeout(t);
    }
  }, [fadeKey]);

  return (
    <div
      style={{
        opacity,
        transition: opacity === 0 ? "opacity 0.15s ease" : "opacity 0.3s ease",
      }}
    >
      {children}
    </div>
  );
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeout(ms: number, message = "Timeout"): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, timeout(ms, "Request timed out")]);
}

/** Poll until II isInitializing is false or gives up. */
function waitForIIReady(): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const id = setInterval(() => {
      count++;
      if (count >= 10) {
        clearInterval(id);
        resolve();
      }
    }, 200);
  });
}

async function probeCanister(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(window.location.origin, {
      method: "HEAD",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok || res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}

// ─── II auth polling helper ────────────────────────────────────────────────────
// Polls the identity ref every 250ms until identity appears or cancelled.
// Returns the identity once set, or "cancelled" if the cancel gen changed.
function pollForIdentity(
  identityRef: React.RefObject<unknown>,
  isCancelled: () => boolean,
): Promise<unknown | "cancelled"> {
  return new Promise((resolve) => {
    const poll = () => {
      if (isCancelled()) {
        resolve("cancelled");
        return;
      }
      if (identityRef.current) {
        resolve(identityRef.current);
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

// Returns a sentinel "timeout" value after ms milliseconds
function iiTimeoutPromise(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
}

// ─── Map Overlay ──────────────────────────────────────────────────────────────

function MapOverlay({
  onClose,
  discoveredZones,
  currentZoneId,
}: {
  onClose: () => void;
  discoveredZones: string[];
  currentZoneId: ZoneId;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: fixed backdrop overlay requires div
    <div
      role="dialog"
      aria-label="World Map"
      aria-modal="true"
      data-ocid="world-map-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: inner content handles keyboard */}
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(90vw, 540px)",
          maxHeight: "80vh",
          background: "oklch(0.06 0.01 260 / 0.97)",
          border: "2px solid oklch(0.35 0.10 145 / 0.70)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 0 40px oklch(0 0 0 / 0.8)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px 8px",
            borderBottom: "1px solid oklch(0.22 0 0 / 0.7)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "oklch(0.72 0.15 145)",
            }}
          >
            🗺 World Map
          </span>
          <button
            type="button"
            aria-label="Close world map"
            data-ocid="world-map-close-button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              background: "oklch(0.14 0 0 / 0.70)",
              border: "1px solid oklch(0.30 0 0 / 0.55)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "oklch(0.55 0 0)",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <WorldMapScreen
            currentZoneId={currentZoneId}
            discoveredZones={discoveredZones}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
