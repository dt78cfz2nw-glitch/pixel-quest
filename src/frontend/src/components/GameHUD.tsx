import { useCallback, useEffect, useRef, useState } from "react";
import {
  audioEngine,
  setMasterVolume,
  setMusicVolume,
  setSfxVolume,
  toggleMaster,
} from "../lib/audio";
import type { CraftingRecipe } from "../lib/crafting";
import type {
  CharacterClass,
  CustomizationState,
  EmoteType,
  EquippedGear,
  GameNotification,
  HairColor,
  InventoryItem,
  OutfitColor,
  OutfitStyle,
  TitleId,
  ZoneId,
} from "../types/game";
import { CHAT_MAX_LENGTH, EMOTE_ICONS } from "../types/game";
import { CraftingPanel } from "./CraftingPanel";
import { CustomizationPanel } from "./CustomizationPanel";
import { InventoryPanel } from "./InventoryPanel";
import { LeaderboardOverlay } from "./LeaderboardScreen";
import { TitlesPanel } from "./TitlesPanel";
import { WorldMapScreen } from "./WorldMapScreen";
import { ZoneDiscoveryPopup } from "./ZoneDiscoveryPopup";

// ─── Zone Name Labels ─────────────────────────────────────────────────────────

const ZONE_LABELS: Record<ZoneId, string> = {
  meadow_hub: "Meadow Hub",
  aurelion: "Aurelion",
  wilderness: "Wilderness",
  forest_depths: "Forest Depths",
  wolf_forest: "Wolf Forest",
  tiger_jungle: "Tiger Jungle",
  bear_forest: "Bear Forest",
  ancient_ruins: "Ancient Ruins",
  crystal_ruins: "Crystal Ruins",
  cyclops_lair: "Cyclops Lair",
  goblin_warrens: "Goblin Warrens",
  bat_cave: "Bat Cave",
  deep_cave: "Deep Cave",
  hub_basement: "Hub Basement",
  wilderness_dungeon: "Underground Cave",
  forest_dungeon: "Forest Dungeon",
  dark_forest: "Dark Forest",
  ancient_ruins_deep: "Ancient Ruins Deep",
  cave_interior: "Cave Interior",
  boss_chamber: "⚠ Boss Chamber",
  cursed_swamp: "⚠ Cursed Swamp",
  floating_ruins: "⚠ Floating Ruins",
  pirate_island: "⚠ Pirate Island",
  cursed_galleon: "⚠ The Cursed Galleon",
  thunder_isle: "⚡ Thunder Isle",
};

const ZONE_COLORS: Record<ZoneId, string> = {
  meadow_hub: "oklch(0.72 0.15 145)",
  aurelion: "oklch(0.60 0.18 275)",
  wilderness: "oklch(0.68 0.16 55)",
  forest_depths: "oklch(0.55 0.18 155)",
  wolf_forest: "oklch(0.50 0.14 145)",
  tiger_jungle: "oklch(0.58 0.18 90)",
  bear_forest: "oklch(0.52 0.14 130)",
  ancient_ruins: "oklch(0.60 0.14 70)",
  crystal_ruins: "oklch(0.55 0.18 280)",
  cyclops_lair: "oklch(0.50 0.18 20)",
  goblin_warrens: "oklch(0.48 0.12 100)",
  bat_cave: "oklch(0.38 0.06 280)",
  deep_cave: "oklch(0.35 0.05 260)",
  hub_basement: "oklch(0.48 0.08 258)",
  wilderness_dungeon: "oklch(0.45 0.07 258)",
  forest_dungeon: "oklch(0.44 0.09 258)",
  dark_forest: "oklch(0.32 0.10 145)",
  ancient_ruins_deep: "oklch(0.40 0.06 255)",
  cave_interior: "oklch(0.36 0.05 40)",
  boss_chamber: "oklch(0.50 0.20 25)",
  cursed_swamp: "oklch(0.42 0.14 155)",
  floating_ruins: "oklch(0.45 0.16 270)",
  pirate_island: "oklch(0.58 0.18 55)",
  cursed_galleon: "oklch(0.44 0.12 40)",
  thunder_isle: "oklch(0.48 0.16 270)",
};

// ─── Game HUD ─────────────────────────────────────────────────────────────────

interface GameHUDProps {
  username: string;
  selectedClass: CharacterClass;
  tileX: number;
  tileY: number;
  /** Current zone the player is in */
  currentZoneId?: ZoneId;
  /** RPG stats */
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  level: number;
  /**
   * Portrait mode: when true, the top stat bar (HP/MP/XP/minimap) is hidden
   * because it is rendered outside the canvas by PortraitTopBar.
   * Overlay panels (inventory, crafting, etc.) always render.
   */
  portraitMode?: boolean;
  /** Death state */
  isDead: boolean;
  respawnTimer: number;
  /** Customization */
  customization: CustomizationState;
  onCustomizationSave: (
    color: OutfitColor,
    style: OutfitStyle,
    hairColor: HairColor,
  ) => void;
  onLogout: () => void;
  onEmote: (emote: EmoteType) => void;
  emoteOpen?: boolean;
  onEmoteOpenChange?: (open: boolean) => void;
  onSendChat?: (text: string) => void;
  chatOpen?: boolean;
  onChatOpenChange?: (open: boolean) => void;
  /** Economy */
  coins?: number;
  inventory?: InventoryItem[];
  equippedGear?: EquippedGear;
  onEquipItem?: (item: InventoryItem) => void;
  /** Zone transition — disables interactive buttons during fade */
  isTransitioning?: boolean;
  /** Controlled inventory open state (lifted to App) */
  inventoryOpen?: boolean;
  onInventoryOpenChange?: (open: boolean) => void;
  /** Potion system */
  potionCount?: number;
  potionCooldownPct?: number;
  onUsePotion?: () => void;
  /** Mana potion */
  manaPotionCount?: number;
  manaPotionCooldownPct?: number;
  onUseManaPotion?: () => void;
  /** Leaderboard overlay */
  leaderboardOpen?: boolean;
  onLeaderboardOpenChange?: (open: boolean) => void;
  /** Titles panel */
  earnedTitles?: TitleId[];
  activeTitleId?: TitleId;
  isGuest?: boolean;
  onSelectTitle?: (titleId: TitleId) => void;
  titlesOpen?: boolean;
  onTitlesOpenChange?: (open: boolean) => void;
  /** Crafting panel */
  craftingOpen?: boolean;
  onCraftingOpenChange?: (open: boolean) => void;
  onCraft?: (
    recipe: CraftingRecipe,
    newInventory: InventoryItem[],
    newCoins: number,
  ) => void;
  /** World map */
  discoveredZones?: string[];
  pendingDiscovery?: string | null;
  onDiscoveryComplete?: () => void;
  /** Notification toasts */
  notifications?: GameNotification[];
  onDismissNotification?: (id: string) => void;
  /** Combat log entries (newest first) */
  combatLog?: string[];
}

const CLASS_ICON: Record<CharacterClass, string> = {
  warrior: "⚔",
  mage: "✦",
};

const EMOTE_LIST: EmoteType[] = ["wave", "thumbsUp", "heart", "confused"];

export function GameHUD({
  username,
  selectedClass,
  tileX,
  tileY,
  currentZoneId,
  hp,
  maxHp,
  mp,
  maxMp,
  xp,
  level,
  isDead,
  respawnTimer,
  customization,
  onCustomizationSave,
  onLogout,
  onEmote,
  emoteOpen = false,
  onEmoteOpenChange,
  onSendChat,
  chatOpen = false,
  onChatOpenChange,
  coins = 0,
  inventory = [],
  equippedGear = { weapon: null, armor: null, offhand: null },
  onEquipItem,
  isTransitioning = false,
  inventoryOpen: inventoryOpenProp,
  onInventoryOpenChange,
  potionCount = 5,
  potionCooldownPct = 0,
  onUsePotion,
  manaPotionCount = 0,
  manaPotionCooldownPct = 0,
  onUseManaPotion,
  leaderboardOpen: leaderboardOpenProp,
  onLeaderboardOpenChange,
  earnedTitles = [],
  activeTitleId = "novice",
  isGuest = false,
  onSelectTitle,
  titlesOpen: titlesOpenProp,
  onTitlesOpenChange,
  craftingOpen: craftingOpenProp,
  onCraftingOpenChange,
  onCraft,
  portraitMode = false,
  discoveredZones = [],
  pendingDiscovery = null,
  onDiscoveryComplete,
  notifications = [],
  onDismissNotification,
  combatLog = [],
}: GameHUDProps) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [chatPressed, setChatPressed] = useState(false);
  const [chatText, setChatText] = useState("");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  // Leaderboard overlay
  const [leaderboardOpenInternal, setLeaderboardOpenInternal] = useState(false);
  const leaderboardOpen =
    leaderboardOpenProp !== undefined
      ? leaderboardOpenProp
      : leaderboardOpenInternal;
  const setLeaderboardOpen = useCallback(
    (val: boolean) => {
      setLeaderboardOpenInternal(val);
      onLeaderboardOpenChange?.(val);
    },
    [onLeaderboardOpenChange],
  );
  // Titles panel
  const [titlesOpenInternal, setTitlesOpenInternal] = useState(false);
  const titlesOpen =
    titlesOpenProp !== undefined ? titlesOpenProp : titlesOpenInternal;
  const setTitlesOpen = useCallback(
    (val: boolean) => {
      setTitlesOpenInternal(val);
      onTitlesOpenChange?.(val);
    },
    [onTitlesOpenChange],
  );
  // Crafting panel (controlled or internal)
  const [craftingOpenInternal, setCraftingOpenInternal] = useState(false);
  const craftingOpen =
    craftingOpenProp !== undefined ? craftingOpenProp : craftingOpenInternal;
  const setCraftingOpen = useCallback(
    (val: boolean) => {
      setCraftingOpenInternal(val);
      onCraftingOpenChange?.(val);
    },
    [onCraftingOpenChange],
  );
  // Audio volume state (mirrors audioEngine, for slider reactivity)
  const [masterVol, setMasterVolState] = useState(audioEngine.masterVolume);
  const [musicVol, setMusicVolState] = useState(audioEngine.musicVolume);
  const [sfxVol, setSfxVolState] = useState(audioEngine.sfxVolume);
  const [audioEnabled, setAudioEnabled] = useState(audioEngine.isEnabled);
  // Use controlled state if provided, otherwise internal
  const [inventoryOpenInternal, setInventoryOpenInternal] = useState(false);
  const inventoryOpen =
    inventoryOpenProp !== undefined ? inventoryOpenProp : inventoryOpenInternal;
  const setInventoryOpen = useCallback(
    (val: boolean) => {
      setInventoryOpenInternal(val);
      onInventoryOpenChange?.(val);
    },
    [onInventoryOpenChange],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape closes audio panel
  useEffect(() => {
    if (!audioOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAudioOpen(false);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [audioOpen]);

  const hpPct = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0));
  const mpPct = Math.max(0, Math.min(1, maxMp > 0 ? mp / maxMp : 0));

  // ── Animated XP bar ──────────────────────────────────────────────────────────
  // XP formula: xpForLevel(n) = floor(100 * 1.25^(n-1))
  // Compute cumulative XP at start of current level and next level
  function xpForLevel(n: number) {
    return Math.floor(100 * 1.25 ** (n - 1));
  }
  function cumulativeXpAtLevel(n: number): number {
    let total = 0;
    for (let i = 1; i < n; i++) total += xpForLevel(i);
    return total;
  }
  const xpThisLevel = cumulativeXpAtLevel(level);
  const xpNextLevel = xpThisLevel + xpForLevel(level);
  const xpInLevel = Math.max(0, xp - xpThisLevel);
  const xpNeededInLevel = xpForLevel(level);

  // animatedXp: displayed xp value (may lag behind real xp for animation)
  const animatedXpRef = useRef<number>(xp);
  const [animatedXp, setAnimatedXp] = useState<number>(xp);
  const [xpBarFlashGold, setXpBarFlashGold] = useState(false);
  const xpAnimFrameRef = useRef<number>(0);
  const prevLevelRef = useRef<number>(level);

  useEffect(() => {
    const target = xp;
    const current = animatedXpRef.current;
    if (current === target) return;

    // If level changed externally (e.g. reset), snap immediately
    if (level !== prevLevelRef.current) {
      animatedXpRef.current = target;
      setAnimatedXp(target);
      prevLevelRef.current = level;
      return;
    }

    if (xpAnimFrameRef.current) cancelAnimationFrame(xpAnimFrameRef.current);
    let lastT = 0;

    const tick = (t: number) => {
      if (!lastT) lastT = t;
      const dt = t - lastT;
      lastT = t;

      const speed = Math.max((target - animatedXpRef.current) / 0.3, 200);
      const step = (speed * dt) / 1000;
      const prev = animatedXpRef.current;
      let next = Math.min(target, prev + step);

      // Check if we're crossing a level boundary mid-animation
      const levelAtPrev = computeLevelFromXp(prev);
      const levelAtNext = computeLevelFromXp(next);
      if (levelAtNext > levelAtPrev) {
        // Hit 100% — flash gold, then continue from 0 of next level
        setXpBarFlashGold(true);
        setTimeout(() => setXpBarFlashGold(false), 150);
      }

      animatedXpRef.current = next;
      setAnimatedXp(next);

      if (next < target) {
        xpAnimFrameRef.current = requestAnimationFrame(tick);
      }
    };

    xpAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (xpAnimFrameRef.current) cancelAnimationFrame(xpAnimFrameRef.current);
    };
  }, [xp, level]);

  function computeLevelFromXp(totalXp: number): number {
    let lv = 1;
    let acc = 0;
    while (lv < 60) {
      const needed = xpForLevel(lv);
      if (acc + needed > totalXp) break;
      acc += needed;
      lv++;
    }
    return lv;
  }

  // For bar display: use animatedXp relative to its own level boundaries
  const animLevel = computeLevelFromXp(animatedXp);
  const animXpThisLevel = cumulativeXpAtLevel(animLevel);
  const animXpInLevel = Math.max(0, animatedXp - animXpThisLevel);
  const animXpNeededInLevel = xpForLevel(animLevel);
  const xpPct = Math.max(
    0,
    Math.min(
      1,
      animXpNeededInLevel > 0 ? animXpInLevel / animXpNeededInLevel : 0,
    ),
  );
  void xpInLevel;
  void xpNextLevel;
  void xpNeededInLevel;
  void xpThisLevel; // suppress lint

  function handleEmote(emote: EmoteType) {
    onEmote(emote);
    onEmoteOpenChange?.(false);
  }

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen) {
      setChatText("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [chatOpen]);

  // Keyboard shortcuts: I or B toggles inventory
  const inventoryOpenRef = useRef(inventoryOpen);
  inventoryOpenRef.current = inventoryOpen;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (e.key === "i" || e.key === "I" || e.key === "b" || e.key === "B") {
        e.preventDefault();
        setInventoryOpen(!inventoryOpenRef.current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setInventoryOpen]);

  // Escape closes chat
  useEffect(() => {
    if (!chatOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onChatOpenChange?.(false);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [chatOpen, onChatOpenChange]);

  function handleChatSubmit() {
    const trimmed = chatText.trim();
    if (!trimmed) return;
    onSendChat?.(trimmed);
    setChatText("");
    onChatOpenChange?.(false);
    // Auto-close keyboard on mobile after sending
    inputRef.current?.blur();
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleChatSubmit();
    }
  }

  const remaining = CHAT_MAX_LENGTH - chatText.length;

  // isDead and respawnTimer are passed in; death overlay is rendered by App.tsx
  void isDead;
  void respawnTimer;

  return (
    <>
      {/* ─── Top HUD Bar — hidden in portrait mode (rendered by PortraitTopBar) ── */}
      {!portraitMode && (
        <div
          className="hud-bar absolute inset-x-0 top-0 flex flex-col"
          style={{ zIndex: 20, backdropFilter: "blur(2px)" }}
          data-ocid="game-hud"
        >
          {/* Row 1: name/class · coords · action buttons */}
          <div className="flex items-stretch justify-between">
            {/* Left — Player info */}
            <div className="hud-section gap-2">
              <span
                className={`inline-block w-2 h-2 shrink-0 rounded-none ${selectedClass === "mage" ? "bg-mage" : "bg-warrior"}`}
                aria-hidden="true"
              />
              <span
                className="text-foreground font-mono text-xs font-bold tracking-widest uppercase truncate max-w-[90px]"
                data-ocid="hud-username"
              >
                {username}
              </span>
              <span
                className="font-mono text-xs font-bold"
                style={{ color: "oklch(0.78 0.15 55)" }}
                data-ocid="hud-level"
              >
                Lv.{level}
              </span>
              <span
                className={`class-badge ${selectedClass === "warrior" ? "class-badge-warrior" : "class-badge-mage"}`}
                data-ocid="hud-class-badge"
              >
                {CLASS_ICON[selectedClass]} {selectedClass.toUpperCase()}
              </span>
            </div>

            {/* Center — Zone name + Coordinates */}
            <div
              className="hud-section border-x border-muted gap-2"
              data-ocid="hud-coords"
            >
              {currentZoneId && (
                <span
                  className="font-mono text-xs font-bold tracking-wider shrink-0"
                  style={{
                    color: ZONE_COLORS[currentZoneId],
                    textShadow: `0 0 6px ${ZONE_COLORS[currentZoneId]}66`,
                  }}
                  data-ocid="hud-zone-name"
                >
                  {ZONE_LABELS[currentZoneId]}
                </span>
              )}
              {currentZoneId && (
                <span
                  className="text-muted-foreground shrink-0"
                  style={{ fontSize: 9 }}
                  aria-hidden="true"
                >
                  ·
                </span>
              )}
              <span className="text-muted-foreground">X</span>
              <span className="text-foreground ml-1">
                {String(tileX).padStart(3, "0")}
              </span>
              <span className="text-muted-foreground ml-2">Y</span>
              <span className="text-foreground ml-1">
                {String(tileY).padStart(3, "0")}
              </span>
            </div>

            {/* Right — action buttons */}
            <div
              className="hud-section gap-1 relative"
              style={
                isTransitioning
                  ? { pointerEvents: "none", opacity: 0.5 }
                  : undefined
              }
            >
              {/* Coin display */}
              <span
                className="font-mono text-xs font-bold"
                style={{ color: "oklch(0.65 0.14 90)" }}
                data-ocid="hud-coins"
                title={`${coins} coins`}
              >
                🪙{coins}
              </span>

              {/* Potion button */}
              <button
                type="button"
                onClick={onUsePotion}
                data-ocid="potion-btn"
                className="font-mono text-xs border border-transparent hover:border-red-500/50 hover:text-red-400 px-1 py-1 text-muted-foreground hud-action-btn relative"
                aria-label={`Use health potion (${potionCount} remaining)`}
                title={`Health Potion x${potionCount} [P]`}
                disabled={potionCount <= 0 || potionCooldownPct > 0}
                style={{
                  opacity: potionCount <= 0 || potionCooldownPct > 0 ? 0.4 : 1,
                  cursor:
                    potionCount <= 0 || potionCooldownPct > 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                🧪
                <span
                  style={{
                    fontSize: 7,
                    fontFamily: "monospace",
                    verticalAlign: "top",
                  }}
                >
                  x{potionCount}
                </span>
                {potionCooldownPct > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${potionCooldownPct * 100}%`,
                      background: "oklch(0 0 0 / 0.6)",
                      pointerEvents: "none",
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>

              {/* Mana Potion button */}
              <button
                type="button"
                onClick={onUseManaPotion}
                data-ocid="mana-potion-btn"
                className="font-mono text-xs border border-transparent hover:border-blue-500/50 hover:text-blue-400 px-1 py-1 text-muted-foreground hud-action-btn relative"
                aria-label={`Use mana potion (${manaPotionCount} remaining)`}
                title={`Mana Potion x${manaPotionCount}`}
                disabled={manaPotionCount <= 0 || manaPotionCooldownPct > 0}
                style={{
                  opacity:
                    manaPotionCount <= 0 || manaPotionCooldownPct > 0 ? 0.4 : 1,
                  cursor:
                    manaPotionCount <= 0 || manaPotionCooldownPct > 0
                      ? "not-allowed"
                      : "pointer",
                  filter: manaPotionCount <= 0 ? "grayscale(0.8)" : undefined,
                }}
              >
                💙
                <span
                  style={{
                    fontSize: 7,
                    fontFamily: "monospace",
                    verticalAlign: "top",
                  }}
                >
                  x{manaPotionCount}
                </span>
                {manaPotionCooldownPct > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${manaPotionCooldownPct * 100}%`,
                      background: "oklch(0 0 0 / 0.6)",
                      pointerEvents: "none",
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>

              {/* Inventory button */}
              <button
                type="button"
                onClick={() => setInventoryOpen(!inventoryOpen)}
                data-ocid="inventory-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Open inventory"
                title="Inventory [I]"
                style={
                  inventoryOpen
                    ? {
                        color: "oklch(var(--primary))",
                        borderColor: "oklch(var(--primary) / 0.5)",
                      }
                    : undefined
                }
              >
                🎒
              </button>

              {/* Customize button */}
              <button
                type="button"
                onClick={() => setCustomizeOpen(true)}
                data-ocid="customize-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Customize appearance"
                title="Customize [C]"
              >
                👕
              </button>

              {/* Titles button */}
              <button
                type="button"
                onClick={() => setTitlesOpen(!titlesOpen)}
                data-ocid="titles-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Open titles"
                title="Titles"
                style={
                  titlesOpen
                    ? {
                        color: "#FFE87C",
                        borderColor: "rgba(255,232,124,0.5)",
                      }
                    : undefined
                }
              >
                🎖
              </button>

              {/* Leaderboard button */}
              <button
                type="button"
                onClick={() => setLeaderboardOpen(!leaderboardOpen)}
                data-ocid="leaderboard-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Open leaderboard"
                title="Leaderboard"
                style={
                  leaderboardOpen
                    ? {
                        color: "oklch(0.82 0.16 85)",
                        borderColor: "oklch(0.82 0.16 85 / 0.5)",
                      }
                    : undefined
                }
              >
                🏆
              </button>

              {/* World Map button */}
              <button
                type="button"
                onClick={() => setWorldMapOpen(true)}
                data-ocid="world-map-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Open world map"
                title="World Map [M]"
                style={
                  worldMapOpen
                    ? {
                        color: "oklch(0.72 0.18 200)",
                        borderColor: "oklch(0.72 0.18 200 / 0.5)",
                      }
                    : undefined
                }
              >
                🗺
              </button>

              {/* Audio settings button */}
              <button
                type="button"
                onClick={() => setAudioOpen((v) => !v)}
                data-ocid="audio-settings-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Audio settings"
                title="Audio Settings"
                style={
                  audioOpen
                    ? {
                        color: "oklch(var(--primary))",
                        borderColor: "oklch(var(--primary) / 0.5)",
                      }
                    : undefined
                }
              >
                ⚙
              </button>

              {/* Chat button */}
              <button
                type="button"
                onClick={() => onChatOpenChange?.(!chatOpen)}
                onPointerDown={() => setChatPressed(true)}
                onPointerUp={() => setChatPressed(false)}
                onPointerLeave={() => setChatPressed(false)}
                data-ocid="chat-btn"
                className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Open chat (T)"
                title="Chat [T]"
                style={{
                  transform: chatPressed ? "scale(0.9)" : undefined,
                  color: chatOpen ? "oklch(var(--primary))" : undefined,
                  borderColor: chatOpen
                    ? "oklch(var(--primary) / 0.5)"
                    : undefined,
                }}
              >
                💬
              </button>

              {/* Emote picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => onEmoteOpenChange?.(!emoteOpen)}
                  data-ocid="emote-btn"
                  className="font-mono text-xs border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                  aria-label="Send emote"
                  aria-expanded={emoteOpen}
                >
                  ✦
                </button>
                {emoteOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 flex gap-1 p-1 bg-card border border-border shadow-lg"
                    style={{ zIndex: 100 }}
                    data-ocid="emote-picker"
                  >
                    {EMOTE_LIST.map((emote) => (
                      <button
                        key={emote}
                        type="button"
                        onClick={() => handleEmote(emote)}
                        data-ocid={`emote-${emote}`}
                        className="w-8 h-8 flex items-center justify-center text-base hover:bg-primary/20 transition-colors"
                        aria-label={emote}
                        title={emote}
                      >
                        {EMOTE_ICONS[emote]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="hidden sm:inline text-muted-foreground tracking-wider font-mono text-xs">
                [WASD]
              </span>
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                data-ocid="logout-btn"
                className="font-mono text-xs uppercase tracking-widest border border-transparent hover:border-primary/50 hover:text-primary px-2 py-1 text-muted-foreground hud-action-btn"
                aria-label="Logout and return to menu"
              >
                LOGOUT
              </button>
            </div>
          </div>

          {/* Row 2: HP / MP / XP bars */}
          <div
            className="flex items-center gap-2 px-2"
            style={{
              paddingBottom: 4,
              paddingTop: 2,
              borderTop: "1px solid oklch(0.22 0 0 / 0.5)",
            }}
          >
            {/* HP bar */}
            <GradientStatBar
              label="HP"
              current={hp}
              max={maxHp}
              pct={hpPct}
              fillClass="hud-stats-fill-hp"
              dataOcid="hp-bar"
            />
            {/* MP bar */}
            <GradientStatBar
              label="MP"
              current={mp}
              max={maxMp}
              pct={mpPct}
              fillClass="hud-stats-fill-mp"
              dataOcid="mp-bar"
              lowManaWarning={selectedClass === "mage" && mpPct < 0.2}
            />
            {/* XP bar with XP numbers */}
            <div
              className="flex items-center gap-1 shrink-0"
              data-ocid="xp-bar"
            >
              <span
                className="font-mono shrink-0"
                style={{
                  fontSize: 8,
                  color: "oklch(0.78 0.15 55)",
                  letterSpacing: "0.05em",
                }}
              >
                XP
              </span>
              <div
                className="relative overflow-hidden"
                style={{
                  width: 52,
                  height: 7,
                  background: "oklch(0.10 0 0 / 0.85)",
                  borderRadius: 999,
                  border: xpBarFlashGold
                    ? "1px solid #FFD700"
                    : "1px solid oklch(0.30 0 0 / 0.6)",
                  transition: "border-color 0.1s",
                }}
              >
                <div
                  className={
                    xpPct >= 0.8
                      ? "hud-stats-fill-xp full bar-fill-smooth"
                      : "hud-stats-fill-xp bar-fill-smooth"
                  }
                  style={{
                    width: `${Math.max(2, xpPct * 100)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: xpBarFlashGold ? "#FFD700" : undefined,
                    transition: "width 0.05s linear, background 0.1s",
                  }}
                />
              </div>
              <span
                className="font-mono shrink-0"
                style={{
                  fontSize: 7,
                  color: "oklch(0.45 0 0)",
                  letterSpacing: "0.02em",
                }}
              >
                {Math.max(0, Math.round(animXpInLevel))}/{animXpNeededInLevel}
              </span>
            </div>
          </div>
        </div>
      )}{" "}
      {/* end !portraitMode top bar */}
      {/* ─── Chat Input Modal ──────────────────────────────────────────────── */}
      {chatOpen && (
        <div
          className="absolute inset-x-0 flex justify-center"
          style={{ bottom: 80, zIndex: 40 }}
          data-ocid="chat-modal"
        >
          <div
            className="flex flex-col gap-2 p-3"
            style={{
              background: "oklch(0.08 0 0 / 0.88)",
              border: "1px solid oklch(0.30 0 0 / 0.7)",
              backdropFilter: "blur(4px)",
              borderRadius: 4,
              width: "min(340px, 92vw)",
              boxShadow: "0 4px 24px oklch(0 0 0 / 0.5)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: "oklch(0.65 0.15 145)" }}
              >
                Chat
              </span>
              <span
                className="font-mono text-xs"
                style={{
                  color:
                    remaining <= 10 ? "oklch(0.70 0.18 25)" : "oklch(0.45 0 0)",
                }}
                aria-live="polite"
              >
                {remaining}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={chatText}
                onChange={(e) =>
                  setChatText(e.target.value.slice(0, CHAT_MAX_LENGTH))
                }
                onKeyDown={handleChatKeyDown}
                placeholder="Say something..."
                maxLength={CHAT_MAX_LENGTH}
                data-ocid="chat-input"
                className="flex-1 font-mono text-xs outline-none"
                style={{
                  background: "oklch(0.14 0 0 / 0.8)",
                  border: "1px solid oklch(0.28 0 0 / 0.6)",
                  borderRadius: 2,
                  padding: "6px 8px",
                  color: "oklch(0.92 0 0)",
                  caretColor: "oklch(0.75 0.15 145)",
                }}
                aria-label="Chat message"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleChatSubmit}
                disabled={!chatText.trim()}
                data-ocid="chat-send-btn"
                className="font-mono text-xs uppercase tracking-widest px-3 py-1 transition-smooth"
                style={{
                  background: chatText.trim()
                    ? "oklch(0.55 0.18 145 / 0.8)"
                    : "oklch(0.18 0 0 / 0.6)",
                  border: chatText.trim()
                    ? "1px solid oklch(0.65 0.18 145 / 0.7)"
                    : "1px solid oklch(0.28 0 0 / 0.4)",
                  borderRadius: 2,
                  color: chatText.trim()
                    ? "oklch(0.96 0.05 145)"
                    : "oklch(0.40 0 0)",
                  cursor: chatText.trim() ? "pointer" : "not-allowed",
                }}
              >
                SEND
              </button>
              <button
                type="button"
                onClick={() => onChatOpenChange?.(false)}
                data-ocid="chat-cancel-btn"
                className="font-mono text-xs uppercase tracking-widest px-2 py-1 transition-smooth"
                style={{
                  background: "oklch(0.14 0 0 / 0.5)",
                  border: "1px solid oklch(0.28 0 0 / 0.4)",
                  borderRadius: 2,
                  color: "oklch(0.50 0 0)",
                }}
                aria-label="Cancel chat"
              >
                ✕
              </button>
            </div>
            <p
              className="font-mono"
              style={{ fontSize: 9, color: "oklch(0.38 0 0)", lineHeight: 1.4 }}
            >
              Enter to send · Esc to close · visible to nearby players
            </p>
          </div>
        </div>
      )}
      {/* ─── Logout Confirmation Modal ─────────────────────────────────────── */}
      {logoutConfirmOpen && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 80, background: "oklch(0 0 0 / 0.65)" }}
          data-ocid="logout-confirm.dialog"
          role="alertdialog"
          aria-label="Logout confirmation"
        >
          <div
            className="flex flex-col gap-4 p-5"
            style={{
              background: "oklch(0.09 0 0 / 0.97)",
              border: "1px solid oklch(0.35 0 0 / 0.8)",
              borderRadius: 6,
              minWidth: 260,
              maxWidth: "90vw",
              boxShadow: "0 8px 32px oklch(0 0 0 / 0.7)",
            }}
          >
            <span
              className="font-mono text-sm font-bold tracking-widest uppercase"
              style={{ color: "oklch(0.78 0.18 25)" }}
            >
              Logout?
            </span>
            <p
              className="font-mono text-xs"
              style={{ color: "oklch(0.65 0 0)", lineHeight: 1.6 }}
            >
              Your progress is saved.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setLogoutConfirmOpen(false);
                  onLogout();
                }}
                data-ocid="logout-confirm.confirm_button"
                className="flex-1 font-mono text-xs uppercase tracking-widest px-3 py-2 transition-smooth"
                style={{
                  background: "oklch(0.45 0.18 25 / 0.8)",
                  border: "1px solid oklch(0.60 0.18 25 / 0.7)",
                  borderRadius: 3,
                  color: "oklch(0.96 0.05 25)",
                  cursor: "pointer",
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                data-ocid="logout-confirm.cancel_button"
                className="flex-1 font-mono text-xs uppercase tracking-widest px-3 py-2 transition-smooth"
                style={{
                  background: "oklch(0.14 0 0 / 0.5)",
                  border: "1px solid oklch(0.28 0 0 / 0.5)",
                  borderRadius: 3,
                  color: "oklch(0.55 0 0)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Customization Panel ──────────────────────────────────────────── */}
      {customizeOpen && (
        <CustomizationPanel
          selectedClass={selectedClass}
          currentColor={customization.outfitColor}
          currentStyle={customization.outfitStyle}
          currentHairColor={customization.hairColor}
          onSave={(color, style, hairColor) => {
            onCustomizationSave(color, style, hairColor);
            setCustomizeOpen(false);
          }}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
      {/* ─── Inventory Panel ──────────────────────────────────────────────── */}
      {inventoryOpen && (
        <InventoryPanel
          inventory={inventory}
          equippedGear={equippedGear}
          coins={coins}
          isOpen={inventoryOpen}
          onEquip={(item) => {
            onEquipItem?.(item);
          }}
          onClose={() => setInventoryOpen(false)}
        />
      )}
      {/* ─── Audio Settings Panel ─────────────────────────────────────────── */}
      {audioOpen && (
        <AudioSettingsPanel
          masterVol={masterVol}
          musicVol={musicVol}
          sfxVol={sfxVol}
          audioEnabled={audioEnabled}
          onMasterChange={(v) => {
            setMasterVolState(v);
            setMasterVolume(v);
          }}
          onMusicChange={(v) => {
            setMusicVolState(v);
            setMusicVolume(v);
          }}
          onSfxChange={(v) => {
            setSfxVolState(v);
            setSfxVolume(v);
          }}
          onToggleEnabled={() => {
            const next = toggleMaster();
            setAudioEnabled(next);
          }}
          onClose={() => setAudioOpen(false)}
        />
      )}
      {/* ─── Leaderboard Overlay ──────────────────────────────────────────── */}
      <LeaderboardOverlay
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        currentUsername={username}
      />
      {/* ─── Titles Panel ─────────────────────────────────────────────────── */}
      <TitlesPanel
        isOpen={titlesOpen}
        onClose={() => setTitlesOpen(false)}
        earnedTitles={earnedTitles}
        activeTitleId={activeTitleId}
        isGuest={isGuest}
        onSelectTitle={(id) => {
          onSelectTitle?.(id);
          setTitlesOpen(false);
        }}
      />
      {/* ─── Crafting Panel ───────────────────────────────────────────────── */}
      <CraftingPanel
        isOpen={craftingOpen}
        onClose={() => setCraftingOpen(false)}
        playerInventory={inventory}
        playerCoins={coins}
        playerClass={selectedClass}
        isGuest={isGuest}
        onCraft={(recipe, newInv, newCoins) => {
          onCraft?.(recipe, newInv, newCoins);
        }}
      />
      {/* ─── World Map Screen ──────────────────────────────────────────────── */}
      {worldMapOpen && currentZoneId && (
        <WorldMapScreen
          currentZoneId={currentZoneId}
          discoveredZones={discoveredZones}
          onClose={() => setWorldMapOpen(false)}
        />
      )}
      {/* ─── Zone Discovery Popup ─────────────────────────────────────────── */}
      {pendingDiscovery && (
        <ZoneDiscoveryPopup
          zoneName={pendingDiscovery}
          onComplete={() => onDiscoveryComplete?.()}
        />
      )}
      {/* ─── Notification Toasts ──────────────────────────────────────────── */}
      <NotificationToasts
        notifications={notifications}
        onDismiss={onDismissNotification}
      />
      {/* ─── Combat Log ───────────────────────────────────────────────────── */}
      <CombatLog entries={combatLog} />
    </>
  );
}

// ─── Gradient Stat Bar ────────────────────────────────────────────────────────

function GradientStatBar({
  label,
  current,
  max,
  pct,
  fillClass,
  dataOcid,
  lowManaWarning = false,
}: {
  label: string;
  current: number;
  max: number;
  pct: number;
  fillClass: string;
  dataOcid: string;
  lowManaWarning?: boolean;
}) {
  const isFull = pct >= 0.95;
  return (
    <div className="flex items-center gap-1" data-ocid={dataOcid}>
      <span
        className="font-mono shrink-0"
        style={{
          fontSize: 10,
          color: lowManaWarning ? "oklch(0.65 0.20 250)" : "oklch(0.60 0 0)",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <div
        className={`relative overflow-hidden${lowManaWarning ? " mana-warning-pulse" : ""}`}
        style={{
          width: 60,
          height: 8,
          background: "oklch(0.10 0 0 / 0.85)",
          borderRadius: 999,
          border: lowManaWarning
            ? "1px solid oklch(0.55 0.20 250 / 0.8)"
            : "1px solid oklch(0.28 0 0 / 0.6)",
        }}
      >
        <div
          className={`${fillClass} bar-fill-smooth${isFull ? " full" : ""}`}
          style={{
            width: `${Math.max(2, pct * 100)}%`,
            height: "100%",
            borderRadius: 999,
            transition: "width 0.2s ease-out",
          }}
        />
      </div>
      <span
        className="font-mono shrink-0"
        style={{
          fontSize: 7,
          color: "oklch(0.48 0 0)",
          letterSpacing: "0.02em",
        }}
      >
        {current}/{max}
      </span>
    </div>
  );
}

// ─── Audio Settings Panel ──────────────────────────────────────────────────────

interface AudioSettingsPanelProps {
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  audioEnabled: boolean;
  onMasterChange: (v: number) => void;
  onMusicChange: (v: number) => void;
  onSfxChange: (v: number) => void;
  onToggleEnabled: () => void;
  onClose: () => void;
}

function AudioSettingsPanel({
  masterVol,
  musicVol,
  sfxVol,
  audioEnabled,
  onMasterChange,
  onMusicChange,
  onSfxChange,
  onToggleEnabled,
  onClose,
}: AudioSettingsPanelProps) {
  return (
    <div
      className="absolute"
      style={{
        top: 44,
        right: 8,
        zIndex: 60,
        width: 220,
        background: "oklch(0.09 0 0 / 0.95)",
        border: "1px solid oklch(0.30 0 0 / 0.7)",
        borderRadius: 4,
        backdropFilter: "blur(6px)",
        boxShadow: "0 8px 32px oklch(0 0 0 / 0.6)",
        padding: "12px 14px",
      }}
      data-ocid="audio-settings.dialog"
      aria-label="Audio settings"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: "oklch(0.70 0.14 270)" }}
        >
          ⚙ Audio
        </span>
        <div className="flex items-center gap-2">
          {/* Mute toggle */}
          <button
            type="button"
            onClick={onToggleEnabled}
            data-ocid="audio-settings.toggle"
            className="font-mono text-xs px-2 py-0.5 transition-colors"
            style={{
              background: audioEnabled
                ? "oklch(0.45 0.18 145 / 0.3)"
                : "oklch(0.18 0 0 / 0.5)",
              border: `1px solid ${audioEnabled ? "oklch(0.55 0.18 145 / 0.5)" : "oklch(0.28 0 0 / 0.4)"}`,
              borderRadius: 2,
              color: audioEnabled ? "oklch(0.80 0.18 145)" : "oklch(0.45 0 0)",
            }}
            aria-label={audioEnabled ? "Mute all audio" : "Unmute audio"}
          >
            {audioEnabled ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={onClose}
            data-ocid="audio-settings.close_button"
            className="font-mono text-xs px-2 py-0.5 transition-colors"
            style={{
              color: "oklch(0.45 0 0)",
              border: "1px solid oklch(0.25 0 0 / 0.4)",
              borderRadius: 2,
            }}
            aria-label="Close audio settings"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-3">
        <VolumeSlider
          label="Master"
          value={masterVol}
          onChange={onMasterChange}
          disabled={!audioEnabled}
          dataOcid="audio-settings.master_volume"
          accentColor="oklch(0.65 0.14 270)"
        />
        <VolumeSlider
          label="Music"
          value={musicVol}
          onChange={onMusicChange}
          disabled={!audioEnabled}
          dataOcid="audio-settings.music_volume"
          accentColor="oklch(0.65 0.18 145)"
        />
        <VolumeSlider
          label="SFX"
          value={sfxVol}
          onChange={onSfxChange}
          disabled={!audioEnabled}
          dataOcid="audio-settings.sfx_volume"
          accentColor="oklch(0.65 0.18 55)"
        />
      </div>

      <p
        className="font-mono mt-3"
        style={{ fontSize: 9, color: "oklch(0.30 0 0)", lineHeight: 1.4 }}
      >
        Esc to close · Settings auto-saved
      </p>
    </div>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
  disabled,
  dataOcid,
  accentColor,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  dataOcid: string;
  accentColor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="font-mono shrink-0"
        style={{
          fontSize: 9,
          letterSpacing: "0.06em",
          width: 42,
          color: disabled ? "oklch(0.32 0 0)" : accentColor,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        data-ocid={dataOcid}
        className="flex-1"
        style={{
          accentColor,
          opacity: disabled ? 0.35 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          height: 4,
        }}
        aria-label={`${label} volume`}
      />
      <span
        className="font-mono shrink-0"
        style={{
          fontSize: 9,
          width: 26,
          textAlign: "right",
          color: disabled ? "oklch(0.30 0 0)" : "oklch(0.55 0 0)",
        }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─── Notification Toasts ──────────────────────────────────────────────────────

const NOTIFICATION_ICONS: Record<string, string> = {
  friend_online: "🟢",
  guild_message: "🛡",
  world_event: "⭐",
  achievement: "🏆",
};

const NOTIFICATION_COLORS: Record<string, string> = {
  friend_online: "oklch(0.55 0.22 145)",
  guild_message: "oklch(0.55 0.18 200)",
  world_event: "oklch(0.65 0.22 55)",
  achievement: "oklch(0.65 0.18 80)",
};

/** Max 2 toasts visible at once; each slides in from top and auto-dismisses after 3s */
function NotificationToasts({
  notifications,
  onDismiss,
}: {
  notifications: GameNotification[];
  onDismiss?: (id: string) => void;
}) {
  // Track which notifications are currently "visible" (max 2 at once)
  const [visible, setVisible] = useState<GameNotification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    if (!latest) return;
    // Check if already showing
    const alreadyVisible = visible.some((n) => n.id === latest.id);
    if (alreadyVisible) return;

    setVisible((prev) => {
      const next = [latest, ...prev].slice(0, 2);
      return next;
    });

    // Auto-dismiss after 3s
    const timer = setTimeout(() => {
      setVisible((prev) => prev.filter((n) => n.id !== latest.id));
      onDismiss?.(latest.id);
      timersRef.current.delete(latest.id);
    }, 3000);
    timersRef.current.set(latest.id, timer);
  }, [notifications, onDismiss, visible]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) {
        clearTimeout(t);
      }
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: "absolute",
        top: 88,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        zIndex: 55,
        pointerEvents: "none",
        width: "min(280px, 90vw)",
      }}
      data-ocid="notification-toasts"
    >
      {visible.map((notif) => {
        const icon = NOTIFICATION_ICONS[notif.type] ?? "📢";
        const color = NOTIFICATION_COLORS[notif.type] ?? "oklch(0.60 0 0)";
        return (
          <button
            key={notif.id}
            type="button"
            aria-label={`Notification: ${notif.message}`}
            data-ocid="notification.toast"
            onClick={() => {
              setVisible((prev) => prev.filter((n) => n.id !== notif.id));
              const t = timersRef.current.get(notif.id);
              if (t) clearTimeout(t);
              timersRef.current.delete(notif.id);
              onDismiss?.(notif.id);
            }}
            className="pointer-events-auto"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              background: "oklch(0.08 0 0 / 0.92)",
              border: `1px solid ${color}55`,
              borderRadius: 24,
              backdropFilter: "blur(6px)",
              boxShadow: `0 4px 20px oklch(0 0 0 / 0.5), 0 0 10px ${color}22`,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              animation: "toast-slide-in 0.3s ease-out",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span
              style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}
              aria-hidden="true"
            >
              {icon}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 11,
                fontWeight: 600,
                color: "oklch(0.90 0 0)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {notif.message}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "oklch(0.42 0 0)",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              ✕
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Combat Log ───────────────────────────────────────────────────────────────

function CombatLog({ entries }: { entries: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayEntries = entries.slice(0, 5);

  // Auto-scroll on new entries
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 192,
        left: 8,
        zIndex: 25,
        pointerEvents: "auto",
      }}
      data-ocid="combat-log"
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Collapse combat log" : "Expand combat log"}
        aria-expanded={isOpen}
        data-ocid="combat-log.toggle"
        style={{
          width: 30,
          height: 22,
          background: "oklch(0.10 0 0 / 0.80)",
          border: "1px solid oklch(0.28 0 0 / 0.6)",
          borderRadius: isOpen ? "0 0 0 4px" : 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 10,
          color: "oklch(0.55 0 0)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {isOpen ? "▼" : "💬"}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          ref={scrollRef}
          style={{
            width: 240,
            maxHeight: 120,
            overflowY: "auto",
            background: "rgba(0,0,0,0.70)",
            border: "1px solid oklch(0.28 0 0 / 0.6)",
            borderTop: "none",
            borderRadius: "0 4px 4px 4px",
            padding: "4px 6px",
          }}
          data-ocid="combat-log.panel"
        >
          {displayEntries.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 9,
                color: "oklch(0.35 0 0)",
                margin: 0,
                padding: "2px 0",
              }}
            >
              No recent combat
            </p>
          ) : (
            displayEntries.map((entry, i) => (
              <p
                key={`log-${i}-${entry.slice(0, 8)}`}
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 9,
                  color:
                    i === 0
                      ? "oklch(0.78 0 0)"
                      : `oklch(${0.78 - i * 0.08} 0 0 / 0.75)`,
                  margin: 0,
                  padding: "2px 0",
                  borderBottom:
                    i < displayEntries.length - 1
                      ? "1px solid oklch(0.20 0 0 / 0.4)"
                      : "none",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}
