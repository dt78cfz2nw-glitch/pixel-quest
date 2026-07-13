import type { Principal } from "@icp-sdk/core/principal";
import type {
  backendInterface,
  EmoteType,
  LeaderboardEntry,
  PlayerMessages,
  PlayerSettings,
  PlayerState,
} from "../backend";

const makePrincipal = (s: string): Principal => s as unknown as Principal;

const mockPlayerState = (
  username: string,
  x: bigint,
  y: bigint,
  cls: string,
  overrides: Partial<PlayerState> = {},
): PlayerState => ({
  x,
  y,
  username,
  selectedClass: cls,
  activityScore: BigInt(420),
  chatMessages: [{ text: "Hello adventurers!", timestamp: BigInt(Date.now() * 1_000_000) }],
  level: BigInt(4),
  emoteTimestamp: BigInt(0),
  currentEmote: undefined,
  lastActive: BigInt(Date.now() * 1_000_000),
  hp: BigInt(75),
  maxHp: BigInt(100),
  mp: BigInt(40),
  maxMp: BigInt(60),
  xp: BigInt(350),
  kills: BigInt(8),
  monsterKills: BigInt(0),
  pvpKills: BigInt(0),
  outfitColor: "#4488ff",
  outfitStyle: "default",
  hairColor: "#8B4513",
  coins: BigInt(42),
  inventoryItems: ["sword_iron", "armor_leather", "potion_health"],
  equippedWeapon: "sword_iron",
  equippedArmor: "armor_leather",
  equippedOffhand: undefined,
  characterId: BigInt(1),
  achievements: [],
  completedQuestIds: [],
  ...overrides,
});

const mockLeaderboard: LeaderboardEntry[] = [
  {
    username: "Hero",
    level: BigInt(3),
    activityScore: BigInt(420),
    lastActive: BigInt(Date.now() * 1_000_000),
    characterClass: "warrior",
    monsterKills: BigInt(10),
    pvpKills: BigInt(2),
  },
  {
    username: "Wizard",
    level: BigInt(2),
    activityScore: BigInt(210),
    lastActive: BigInt((Date.now() - 120_000) * 1_000_000),
    characterClass: "mage",
    monsterKills: BigInt(5),
    pvpKills: BigInt(0),
  },
];

export const mockBackend: backendInterface = {
  loadPlayer: async (username: string, selectedClass: string) =>
    mockPlayerState(username, BigInt(5), BigInt(5), selectedClass),

  savePlayerPosition: async (_x: bigint, _y: bigint) => undefined,

  savePlayerClass: async (_selectedClass: string) => undefined,

  saveEmote: async (_emote: EmoteType) => undefined,

  recordAttack: async () => undefined,

  recordMonsterKill: async () => undefined,

  savePlayerHP: async (_hp: bigint, _mp: bigint) => undefined,

  savePlayerXP: async (_xp: bigint, _level: bigint) => undefined,

  savePlayerOutfit: async (_color: string, _style: string, _hairColor: string | null) => undefined,

  sendChatMessage: async (_text: string) => ({ __kind__: "ok" as const, ok: null }),

  getRecentMessages: async (): Promise<PlayerMessages[]> => [],

  getLeaderboard: async (): Promise<LeaderboardEntry[]> => mockLeaderboard,

  getLeaderboardByLevelKills: async (): Promise<LeaderboardEntry[]> => mockLeaderboard,

  getAllCharacters: async () => [
    { username: "Hero", class: "warrior", coins: BigInt(42), level: BigInt(5), equippedItems: [], deaths: BigInt(0), activeTitle: "novice", pvpKills: BigInt(0), totalPlaytime: BigInt(0), monsterKills: BigInt(0), lastZone: "meadow_hub" },
    { username: "Wizard", class: "mage", coins: BigInt(18), level: BigInt(3), equippedItems: [], deaths: BigInt(0), activeTitle: "novice", pvpKills: BigInt(0), totalPlaytime: BigInt(0), monsterKills: BigInt(0), lastZone: "meadow_hub" },
    { username: "Rogue", class: "warrior", coins: BigInt(7), level: BigInt(1), equippedItems: [], deaths: BigInt(0), activeTitle: "novice", pvpKills: BigInt(0), totalPlaytime: BigInt(0), monsterKills: BigInt(0), lastZone: "meadow_hub" },
  ],

  savePlayerCoins: async (_coins: bigint) => undefined,

  savePlayerInventory: async (_items: Array<string>) => undefined,

  savePlayerEquipment: async (_weapon: string | null, _armor: string | null, _offhand: string | null) => undefined,

  savePotionCount: async (_count: bigint) => undefined,

  saveQuestProgress: async (_questId: string, _progress: bigint) => undefined,

  saveRespawnCity: async (_cityId: string) => undefined,

  completeQuest: async (_questId: string) => undefined,

  unlockAchievement: async (_achievementId: string) => false,

  getCharacterCount: async (): Promise<bigint> => BigInt(3),

  getOnlinePlayerCount: async (): Promise<bigint> => BigInt(42),

  getPlayerSettings: async () => null,

  recordPlayerDeath: async () => undefined,

  saveActiveTitle: async (_title: string | null) => undefined,

  savePlayerSettings: async (_s: Parameters<backendInterface["savePlayerSettings"]>[0]) => undefined,

  savePlayerTitles: async (_titles: Array<string>, _activeTitle: string | null) => undefined,

  saveZoneAndPlaytime: async (_zone: string, _additionalSeconds: bigint) => undefined,

  applyPvpDamage: async (_victimPrincipal: Principal, _damage: bigint, _attackerPrincipal: Principal) => ({
    died: false,
    goldDropped: BigInt(0),
    newHp: BigInt(50),
    xpLost: BigInt(0),
  }),

  checkNicknameAvailable: async (_name: string) => true,

  collectDroppedGold: async (_amount: bigint) => true,

  registerNickname: async (_name: string) => true,

  getPlayerAchievements: async (): Promise<string[]> => [],

  savePlayerAchievements: async (_achievements: Array<string>): Promise<void> => undefined,

  getAllPlayers: async (): Promise<Array<[Principal, PlayerState]>> => [
    [
      makePrincipal("principal-hero"),
      mockPlayerState("Hero", BigInt(5), BigInt(5), "warrior", {
        activityScore: BigInt(1200),
        level: BigInt(5),
        hp: BigInt(80),
        maxHp: BigInt(100),
        mp: BigInt(45),
        maxMp: BigInt(60),
        xp: BigInt(450),
        kills: BigInt(12),
        outfitColor: "#4488ff",
      }),
    ],
    [
      makePrincipal("principal-wizard"),
      mockPlayerState("Wizard", BigInt(8), BigInt(7), "mage", {
        activityScore: BigInt(870),
        level: BigInt(3),
        hp: BigInt(55),
        maxHp: BigInt(80),
        mp: BigInt(90),
        maxMp: BigInt(120),
        xp: BigInt(280),
        kills: BigInt(7),
        outfitColor: "#aa44ff",
      }),
    ],
  ],

  // ── Guild methods ──────────────────────────────────────────────────────────
  createGuild: async (_name: string) => ({ __kind__: "ok" as const, ok: { guildId: "mock-guild-1", name: _name, leaderId: makePrincipal("self"), members: [], chatMessages: [], createdAt: BigInt(Date.now() * 1_000_000), maxMembers: BigInt(20) } }),
  getGuild: async (_guildId: string) => null,
  getGuildByName: async (_name: string) => null,
  updateGuildMembers: async (_guildId: string, _members: Array<[Principal, string]>) => ({ __kind__: "ok" as const, ok: null }),
  removeGuild: async (_guildId: string) => ({ __kind__: "ok" as const, ok: null }),
  sendGuildChat: async (_guildId: string, _senderUsername: string, _text: string) => ({ __kind__: "ok" as const, ok: null }),
  getGuildMessages: async (_guildId: string) => ({ __kind__: "ok" as const, ok: [] as import("../backend.d.ts").GuildChatMessage[] }),
  saveGuildMembership: async (_guildId: string | null, _guildRank: string | null) => undefined,

  // ── Social methods ─────────────────────────────────────────────────────────
  getFriendsList: async () => [],
  saveFriendsList: async (_list: Array<import("../backend.d.ts").FriendRecord>) => undefined,
  getWhispers: async () => [],
  sendWhisper: async (_recipient: string, _recipientUsername: string, _senderUsername: string, _text: string) => ({ __kind__: "ok" as const, ok: null }),

  // ── Progression methods ────────────────────────────────────────────────────
  getDiscoveredZones: async () => [],
  saveDiscoveredZones: async (_zones: Array<string>) => undefined,
  getSkillTree: async () => null,
  saveSkillTree: async (_json: string) => undefined,

  // ── Party methods ──────────────────────────────────────────────────────────
  acceptPartyInvite: async (_acceptingUsername: string) => ({ __kind__: "ok" as const, ok: { partyId: "mock-party", leaderId: makePrincipal("self"), members: [], createdAt: BigInt(Date.now() * 1_000_000), status: "active" as const } }),
  getMyParty: async () => null,
  getPendingPartyInvite: async () => null,
  inviteToParty: async (_targetPrincipalText: string, _callerUsername: string) => ({ __kind__: "ok" as const, ok: null }),
  leaveParty: async () => ({ __kind__: "ok" as const, ok: null }),

  // ── Trade methods ──────────────────────────────────────────────────────────
  acceptTrade: async (_tradeId: string) => ({ __kind__: "ok" as const, ok: true }),
  cancelTrade: async (_tradeId: string) => ({ __kind__: "ok" as const, ok: null }),
  initiateTrade: async (_counterpartyPrincipalText: string) => ({ __kind__: "ok" as const, ok: { tradeId: "mock-trade", offerA: { principal: makePrincipal("self"), goldAmount: BigInt(0), accepted: false, itemIds: [] }, offerB: { principal: makePrincipal(_counterpartyPrincipalText), goldAmount: BigInt(0), accepted: false, itemIds: [] }, createdAt: BigInt(Date.now() * 1_000_000) } }),
  updateTradeOffer: async (_tradeId: string, _itemIds: Array<string>, _goldAmount: bigint) => ({ __kind__: "ok" as const, ok: null }),
  getTradeLog: async () => [],

  // ── Daily bonus / bounty / misc ────────────────────────────────────────────
  claimDailyBonus: async () => ({ __kind__: "ok" as const, ok: BigInt(25) }),
  collectBounty: async (_wantedPrincipalText: string) => ({ __kind__: "ok" as const, ok: BigInt(0) }),
  resetBountyOnSafeZone: async () => undefined,
  recordPvpKill: async () => ({ __kind__: "ok" as const, ok: null }),
  getGuildLeaderboard: async () => [],
  grantAchievement: async (_achievementId: string) => undefined,
  grantTitle: async (_titleId: string) => undefined,
  recordCraftedItem: async (_itemId: string) => undefined,
};
