import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useRef } from "react";
import { createActor } from "../backend";
import type {
  CharacterClass,
  ChatMessage,
  EmoteType,
  EquippedGear,
  HairColor,
  InventoryItem,
  OtherPlayer,
  OutfitColor,
  OutfitStyle,
} from "../types/game";
import { EMOTE_DURATION_MS } from "../types/game";

// ─── Backend Sync Hook ────────────────────────────────────────────────────────

const USERNAME_KEY = "pixelquest_username";
const CLASS_KEY = "pixelquest_class";

/** 10 second timeout for all canister calls */
function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Canister call timed out")), ms),
    ),
  ]);
}

interface LoadedPlayer {
  x: number;
  y: number;
  selectedClass: CharacterClass;
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
  coins: number;
  inventory: InventoryItem[];
  equippedGear: EquippedGear;
}

interface SavedIdentity {
  username: string;
  characterClass: CharacterClass;
}

interface BackendSyncResult {
  loadPlayer: (username: string) => Promise<LoadedPlayer | null>;
  savePosition: (username: string, x: number, y: number) => Promise<void>;
  savePlayerClass: (username: string, cls: CharacterClass) => Promise<void>;
  saveEmote: (emote: EmoteType) => Promise<void>;
  fetchAllPlayers: (currentUsername: string) => Promise<OtherPlayer[]>;
  sendChatMessage: (text: string) => Promise<boolean>;
  recordAttack: () => void;
  savePlayerHP: (hp: number, mp: number) => Promise<void>;
  savePlayerXP: (xp: number, level: number) => Promise<void>;
  savePlayerOutfit: (
    color: OutfitColor,
    style: OutfitStyle,
    hairColor?: HairColor,
  ) => Promise<void>;
  recordMonsterKill: () => void;
  savePlayerCoins: (coins: number) => Promise<void>;
  savePlayerInventory: (items: InventoryItem[]) => Promise<void>;
  savePlayerEquipment: (gear: EquippedGear) => Promise<void>;
  loadSavedIdentity: () => SavedIdentity | null;
  chatMessagesRef: React.MutableRefObject<ChatMessage[]>;
  saveQuestProgress: (questId: string, count: number) => Promise<void>;
  completeQuest: (questId: string) => Promise<void>;
  /** Set to true to block all canister writes (guest mode) */
  setIsGuest: (guest: boolean) => void;
  /**
   * Check if a nickname is already taken (case-insensitive).
   * Returns true if available, false if taken or if the check fails
   * (fail-open so a network error doesn't block new players).
   */
  checkNicknameAvailable: (name: string) => Promise<boolean>;
  /**
   * Save earned titles and active title to canister via unlockAchievement.
   * Each earnedTitle is stored with a 'title_' prefix in the achievements array.
   * No-op for guest accounts.
   */
  savePlayerTitles: (
    earnedTitles: string[],
    activeTitleId: string,
  ) => Promise<void>;
  /** Save list of discovered zone IDs to canister. No-op for guests. */
  saveDiscoveredZones: (zones: string[]) => Promise<void>;
  /** Load discovered zone IDs from canister. Returns [] on failure. */
  getDiscoveredZones: () => Promise<string[]>;
}

function parseEmoteType(raw: string | undefined): EmoteType | undefined {
  if (
    raw === "wave" ||
    raw === "thumbsUp" ||
    raw === "heart" ||
    raw === "confused"
  ) {
    return raw;
  }
  return undefined;
}

function parseOutfitColor(raw: string): OutfitColor {
  if (raw === "red" || raw === "blue" || raw === "green" || raw === "purple")
    return raw;
  return "default";
}

function parseOutfitStyle(raw: string): OutfitStyle {
  if (
    raw === "warrior_A" ||
    raw === "warrior_B" ||
    raw === "warrior_C" ||
    raw === "mage_A" ||
    raw === "mage_B" ||
    raw === "mage_C"
  )
    return raw;
  // legacy normalization
  if (raw === "heavy") return "warrior_B";
  if (raw === "light") return "warrior_C";
  if (raw === "mystic") return "mage_B";
  if (raw === "scholar") return "mage_C";
  return "default";
}

function parseHairColor(raw: string | undefined): HairColor {
  if (
    raw === "brown" ||
    raw === "black" ||
    raw === "blonde" ||
    raw === "grey" ||
    raw === "red-hair" ||
    raw === "white"
  )
    return raw;
  return "brown";
}

function serializeInventory(items: InventoryItem[]): string[] {
  return items.map((i) => `${i.id}:${i.itemType}:${i.amount}`);
}

export function useBackendSync(): BackendSyncResult {
  const { actor, isFetching } = useActor(createActor);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  // Guest flag — when true, ALL canister writes are silently skipped
  const isGuestRef = useRef(false);

  const setIsGuest = useCallback((guest: boolean) => {
    isGuestRef.current = guest;
  }, []);

  const loadSavedIdentity = useCallback((): SavedIdentity | null => {
    try {
      const username = localStorage.getItem(USERNAME_KEY);
      const cls = localStorage.getItem(CLASS_KEY);
      if (!username) return null;
      return {
        username,
        characterClass: cls === "mage" ? "mage" : "warrior",
      };
    } catch {
      return null;
    }
  }, []);

  const loadPlayer = useCallback(
    async (username: string): Promise<LoadedPlayer | null> => {
      if (!actor || isFetching) return null;
      try {
        const result = await withTimeout(actor.loadPlayer(username, "warrior"));
        if (!result) return null;

        const toNum = (v: bigint | number | undefined, def: number) =>
          typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : def;

        const x = toNum(result.x, 15);
        const y = toNum(result.y, 15);
        const cls: CharacterClass =
          result.selectedClass === "mage" ? "mage" : "warrior";
        const hp = Math.max(1, toNum(result.hp, 100));
        const maxHp = Math.max(1, toNum(result.maxHp, 100));
        const mp = Math.max(0, toNum(result.mp, 50));
        const maxMp = Math.max(1, toNum(result.maxMp, 50));
        const xp = Math.max(0, toNum(result.xp, 0));
        const level = Math.max(1, toNum(result.level, 1));
        const kills = Math.max(0, toNum(result.kills, 0));

        // Persist identity for auto-login
        try {
          localStorage.setItem(USERNAME_KEY, username);
          localStorage.setItem(CLASS_KEY, cls);
        } catch {
          // Silently fail
        }

        return {
          x,
          y,
          selectedClass: cls,
          hp,
          maxHp,
          mp,
          maxMp,
          xp,
          level,
          kills,
          outfitColor: parseOutfitColor(result.outfitColor ?? ""),
          outfitStyle: parseOutfitStyle(result.outfitStyle ?? ""),
          hairColor: parseHairColor(
            (result as unknown as { hairColor?: string }).hairColor ?? "",
          ),
          // coins/inventory not yet in backend schema — start fresh
          coins: 0,
          inventory: [],
          equippedGear: { weapon: null, armor: null, offhand: null },
        };
      } catch {
        return null;
      }
    },
    [actor, isFetching],
  );

  const savePosition = useCallback(
    async (_username: string, x: number, y: number): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        await withTimeout(actor.savePlayerPosition(BigInt(x), BigInt(y)));
      } catch {
        // Silently fail
      }
    },
    [actor, isFetching],
  );

  const savePlayerClass = useCallback(
    async (_username: string, cls: CharacterClass): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        await withTimeout(actor.savePlayerClass(cls));
        try {
          localStorage.setItem(CLASS_KEY, cls);
        } catch {
          // Silently fail
        }
      } catch {
        // Silently fail
      }
    },
    [actor, isFetching],
  );

  const saveEmote = useCallback(
    async (emote: EmoteType): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        await withTimeout(
          actor.saveEmote(emote as import("../backend.d.ts").EmoteType),
        );
      } catch {
        // Silently fail
      }
    },
    [actor, isFetching],
  );

  const fetchAllPlayers = useCallback(
    async (currentUsername: string): Promise<OtherPlayer[]> => {
      if (!actor || isFetching) return [];
      try {
        const all = await withTimeout(actor.getAllPlayers());
        const now = Date.now();

        // Fetch chat messages
        try {
          const rawMessages = await withTimeout(actor.getRecentMessages());
          const messages: ChatMessage[] = [];
          for (const entry of rawMessages) {
            for (const msg of entry.messages) {
              const tsMs =
                typeof msg.timestamp === "bigint"
                  ? Number(msg.timestamp) / 1_000_000
                  : Number(msg.timestamp);
              messages.push({
                username: entry.username,
                text: msg.text,
                timestamp: tsMs,
              });
            }
          }
          messages.sort((a, b) => b.timestamp - a.timestamp);
          chatMessagesRef.current = messages;
        } catch {
          // Non-critical
        }

        return all
          .filter(([, p]) => p.username !== currentUsername)
          .map(([principal, p]) => {
            const currentEmoteStr =
              typeof p.currentEmote === "string" ? p.currentEmote : undefined;
            const emoteTimestampRaw = p.emoteTimestamp;
            const emoteTimestampMs =
              typeof emoteTimestampRaw === "bigint"
                ? Number(emoteTimestampRaw) / 1_000_000
                : typeof emoteTimestampRaw === "number"
                  ? emoteTimestampRaw
                  : undefined;
            const currentEmote = parseEmoteType(currentEmoteStr);
            const isEmoteActive =
              currentEmote !== undefined &&
              emoteTimestampMs !== undefined &&
              now - emoteTimestampMs < EMOTE_DURATION_MS;

            const latestChat = chatMessagesRef.current.find(
              (m) => m.username === p.username,
            );

            const toNum = (v: bigint | number | undefined, def: number) =>
              typeof v === "bigint"
                ? Number(v)
                : typeof v === "number"
                  ? v
                  : def;

            return {
              username: p.username,
              x: typeof p.x === "bigint" ? Number(p.x) : Number(p.x ?? 0),
              y: typeof p.y === "bigint" ? Number(p.y) : Number(p.y ?? 0),
              selectedClass:
                p.selectedClass === "mage"
                  ? ("mage" as CharacterClass)
                  : ("warrior" as CharacterClass),
              currentEmote: isEmoteActive ? currentEmote : undefined,
              emoteTimestamp: emoteTimestampMs,
              chatMessage: latestChat?.text,
              chatTimestamp: latestChat?.timestamp,
              outfitColor: parseOutfitColor(p.outfitColor ?? ""),
              outfitStyle: parseOutfitStyle(p.outfitStyle ?? ""),
              hairColor: parseHairColor(
                (p as unknown as { hairColor?: string }).hairColor ?? "",
              ),
              level: toNum(p.level, 1),
              hp: toNum(p.hp, 100),
              maxHp: toNum(p.maxHp, 100),
              principalId: principal?.toText?.() ?? String(principal),
            };
          });
      } catch {
        return [];
      }
    },
    [actor, isFetching],
  );

  const sendChatMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (isGuestRef.current) return false; // guests never write to canister
      if (!actor || isFetching) return false;
      try {
        const result = await withTimeout(actor.sendChatMessage(text));
        if (result && "err" in result) return false;
        return true;
      } catch {
        return false;
      }
    },
    [actor, isFetching],
  );

  const recordAttack = useCallback((): void => {
    if (isGuestRef.current) return; // guests never write to canister
    if (!actor || isFetching) return;
    void withTimeout(actor.recordAttack()).catch(() => undefined);
  }, [actor, isFetching]);

  const savePlayerHP = useCallback(
    async (hp: number, mp: number): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        await withTimeout(
          actor.savePlayerHP(
            BigInt(Math.max(0, Math.round(hp))),
            BigInt(Math.max(0, Math.round(mp))),
          ),
        );
      } catch {
        // Silently fail
      }
    },
    [actor, isFetching],
  );

  const savePlayerXP = useCallback(
    async (xp: number, level: number): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        await withTimeout(
          actor.savePlayerXP(
            BigInt(Math.max(0, Math.round(xp))),
            BigInt(Math.max(1, Math.round(level))),
          ),
        );
      } catch {
        // Silently fail
      }
    },
    [actor, isFetching],
  );

  const savePlayerOutfit = useCallback(
    async (
      color: OutfitColor,
      style: OutfitStyle,
      hairColor?: HairColor,
    ): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        const actorAny = actor as unknown as {
          savePlayerOutfit(c: string, s: string, h?: string[]): Promise<void>;
        };
        if (hairColor) {
          await withTimeout(
            actorAny.savePlayerOutfit(color, style, [hairColor]),
          );
        } else {
          await withTimeout(actor.savePlayerOutfit(color, style, null));
        }
      } catch {
        // Silently fail
      }
    },
    [actor, isFetching],
  );

  const recordMonsterKill = useCallback((): void => {
    if (isGuestRef.current) return; // guests never write to canister
    if (!actor || isFetching) return;
    void withTimeout(actor.recordMonsterKill()).catch(() => undefined);
  }, [actor, isFetching]);

  // ─── New economy/inventory methods ──────────────────────────────────────────
  // NOTE: savePlayerCoins, savePlayerInventory, savePlayerEquipment are not yet
  // in the backend schema. They are no-ops for now but ready to wire up.

  const savePlayerCoins = useCallback(async (_coins: number): Promise<void> => {
    // Backend method not yet available — store locally only
    // Future: await actor.savePlayerCoins(BigInt(coins))
  }, []);

  const savePlayerInventory = useCallback(
    async (items: InventoryItem[]): Promise<void> => {
      // Backend method not yet available — no-op for now
      // Future: await actor.savePlayerInventory(serializeInventory(items))
      void serializeInventory(items); // prevent lint unused warning
    },
    [],
  );

  const savePlayerEquipment = useCallback(
    async (_gear: EquippedGear): Promise<void> => {
      // Backend method not yet available — no-op for now
    },
    [],
  );

  // ── Quest persistence (graceful no-ops until backend schema is updated) ──
  const saveQuestProgress = useCallback(
    async (_questId: string, _count: number): Promise<void> => {
      // Future: await actor.saveQuestProgress(questId, BigInt(count))
    },
    [],
  );

  const completeQuest = useCallback(async (_questId: string): Promise<void> => {
    // Future: await actor.completeQuest(questId)
  }, []);

  /**
   * Save player titles to canister via unlockAchievement.
   * Each earned title is stored as 'title_<id>' in the achievements array.
   * The active title is stored as 'active_title_<id>'.
   * Guest accounts are blocked from writing.
   */
  const savePlayerTitles = useCallback(
    async (earnedTitles: string[], activeTitleId: string): Promise<void> => {
      if (isGuestRef.current) return; // guests never write to canister
      if (!actor || isFetching) return;
      try {
        // Unlock each earned title as an achievement (idempotent on backend)
        for (const titleId of earnedTitles) {
          await withTimeout(
            actor.unlockAchievement(`title_${titleId}`),
            5000,
          ).catch(() => undefined); // silently skip individual failures
        }
        // Store active title selection as a special achievement marker
        await withTimeout(
          actor.unlockAchievement(`active_title_${activeTitleId}`),
          5000,
        ).catch(() => undefined);
      } catch {
        // Silently fail — titles are non-critical
      }
    },
    [actor, isFetching],
  );

  /**
   * Check if a nickname is already taken against the full player list.
   * Uses getAllCharacters() which returns all registered profiles.
   * Case-insensitive comparison — "Damian" = "damian".
   * Returns true = available, false = taken (or error → fail-open = true).
   */
  const checkNicknameAvailable = useCallback(
    async (name: string): Promise<boolean> => {
      if (!actor || isFetching) return true; // offline → fail-open
      try {
        const profiles = await withTimeout(actor.getAllCharacters(), 8000);
        const lower = name.toLowerCase();
        return !profiles.some((p) => p.username.toLowerCase() === lower);
      } catch {
        return true; // fail-open so network errors don't block new players
      }
    },
    [actor, isFetching],
  );

  /** Save discovered zones to canister. No-op for guests. */
  const saveDiscoveredZones = useCallback(
    async (zones: string[]): Promise<void> => {
      if (isGuestRef.current) return;
      if (!actor || isFetching) return;
      try {
        const actorAny = actor as unknown as {
          saveDiscoveredZones(z: string[]): Promise<undefined>;
        };
        await withTimeout(actorAny.saveDiscoveredZones(zones), 8000);
      } catch {
        // Silently fail — non-critical
      }
    },
    [actor, isFetching],
  );

  /** Load discovered zones from canister. Returns [] on failure. */
  const getDiscoveredZones = useCallback(async (): Promise<string[]> => {
    if (!actor || isFetching) return [];
    try {
      const actorAny = actor as unknown as {
        getDiscoveredZones(): Promise<string[]>;
      };
      return await withTimeout(actorAny.getDiscoveredZones(), 8000);
    } catch {
      return [];
    }
  }, [actor, isFetching]);

  return {
    loadPlayer,
    savePosition,
    savePlayerClass,
    saveEmote,
    fetchAllPlayers,
    sendChatMessage,
    recordAttack,
    savePlayerHP,
    savePlayerXP,
    savePlayerOutfit,
    recordMonsterKill,
    savePlayerCoins,
    savePlayerInventory,
    savePlayerEquipment,
    loadSavedIdentity,
    chatMessagesRef,
    saveQuestProgress,
    completeQuest,
    setIsGuest,
    checkNicknameAvailable,
    savePlayerTitles,
    saveDiscoveredZones,
    getDiscoveredZones,
  };
}
