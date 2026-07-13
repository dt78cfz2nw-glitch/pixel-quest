import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface PartyInvite {
    toPrincipal: Principal;
    fromPrincipal: string;
    timestamp: Timestamp;
    fromUsername: string;
    partyId: string;
}
export interface TradeOffer {
    principal: Principal;
    goldAmount: bigint;
    accepted: boolean;
    itemIds: Array<string>;
}
export type Timestamp = bigint;
export interface PartyData {
    members: Array<PartyMember>;
    leaderId: Principal;
    createdAt: Timestamp;
    partyId: string;
}
export interface LeaderboardEntry {
    activityScore: bigint;
    characterClass: string;
    username: Username;
    pvpKills: bigint;
    level: bigint;
    monsterKills: bigint;
    lastActive: Timestamp;
}
export interface GuildLeaderboardEntry {
    guildId: string;
    name: string;
    memberCount: bigint;
    totalMemberLevels: bigint;
    totalKills: bigint;
}
export interface PlayerProfile {
    username: Username;
    class: string;
    coins: bigint;
    equippedItems: Array<string>;
    deaths: bigint;
    activeTitle: string;
    pvpKills: bigint;
    level: bigint;
    totalPlaytime: bigint;
    monsterKills: bigint;
    lastZone: string;
}
export interface GuildData {
    members: Array<[Principal, string]>;
    leaderId: Principal;
    guildId: string;
    chatMessages: Array<GuildChatMessage>;
    name: string;
    createdAt: Timestamp;
    maxMembers: bigint;
}
export interface PlayerMessages {
    principal: Principal;
    username: Username;
    messages: Array<ChatMessage>;
}
export interface WhisperMessage {
    to: string;
    from: string;
    text: string;
    timestamp: Timestamp;
}
export interface TradeSession {
    completedAt?: Timestamp;
    createdAt: Timestamp;
    offerA: TradeOffer;
    offerB: TradeOffer;
    tradeId: string;
}
export interface PartyMember {
    principal: Principal;
    username: string;
}
export interface TradeLogEntry {
    offeredItemIds: Array<string>;
    goldChange: bigint;
    tradeId: string;
    timestamp: Timestamp;
    receivedItemIds: Array<string>;
    counterpartyUsername: string;
}
export interface PlayerState {
    x: bigint;
    y: bigint;
    hp: bigint;
    mp: bigint;
    xp: bigint;
    maxHp: bigint;
    maxMp: bigint;
    questProgress?: bigint;
    guildRank?: string;
    isWanted?: boolean;
    activityScore: bigint;
    playerTitles?: Array<string>;
    username: Username;
    lastDailyBonus?: Timestamp;
    bountyAmount?: bigint;
    inventoryItems: Array<string>;
    equippedOffhand?: string;
    selectedClass: CharacterClass;
    guildId?: string;
    chatMessages: Array<ChatMessage>;
    coins: bigint;
    activeQuestId?: string;
    skillTree?: string;
    friendsList?: Array<string>;
    craftedItems?: Array<string>;
    deaths?: bigint;
    activeTitle?: string;
    pvpKills: bigint;
    outfitColor: string;
    level: bigint;
    discoveredZones?: Array<string>;
    achievements: Array<string>;
    totalPlaytime?: bigint;
    emoteTimestamp: Timestamp;
    monsterKills: bigint;
    skillPoints?: bigint;
    completedQuestIds: Array<string>;
    outfitStyle: string;
    potionCount?: bigint;
    currentEmote?: EmoteType;
    equippedArmor?: string;
    pvpKillsSession?: bigint;
    characterId: bigint;
    hairColor: string;
    lastActive: Timestamp;
    kills: bigint;
    respawnCity?: string;
    lastZone?: string;
    equippedWeapon?: string;
    partyId?: string;
}
export interface FriendRecord {
    status: FriendStatus;
    username: string;
    principalId: string;
}
export interface ChatMessage {
    text: string;
    timestamp: Timestamp;
}
export type Username = string;
export interface PlayerSettings {
    weatherEffects: boolean;
    dayNightCycle: boolean;
    masterVolume: number;
    killStreaks: boolean;
    sfxVolume: number;
    musicVolume: number;
    particleQuality: string;
    chatNotifications: boolean;
    damageNumbers: boolean;
    ambientSound: boolean;
    autoPickupGold: boolean;
    respawnCity: string;
    smoothCamera: boolean;
}
export type CharacterClass = string;
export interface GuildChatMessage {
    text: string;
    senderUsername: string;
    senderPrincipal: string;
    timestamp: Timestamp;
}
export enum EmoteType {
    heart = "heart",
    confused = "confused",
    wave = "wave",
    thumbsUp = "thumbsUp"
}
export enum FriendStatus {
    pending = "pending",
    accepted = "accepted"
}
export interface backendInterface {
    acceptPartyInvite(acceptingUsername: string): Promise<{
        __kind__: "ok";
        ok: PartyData;
    } | {
        __kind__: "err";
        err: string;
    }>;
    acceptTrade(tradeId: string): Promise<{
        __kind__: "ok";
        ok: boolean;
    } | {
        __kind__: "err";
        err: string;
    }>;
    /**
     * / Parties: partyId → PartyData
     */
    applyPvpDamage(victimPrincipal: Principal, damage: bigint, attackerPrincipal: Principal): Promise<{
        died: boolean;
        goldDropped: bigint;
        newHp: bigint;
        xpLost: bigint;
    }>;
    cancelTrade(tradeId: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    checkNicknameAvailable(name: string): Promise<boolean>;
    claimDailyBonus(): Promise<{
        __kind__: "ok";
        ok: bigint;
    } | {
        __kind__: "err";
        err: string;
    }>;
    collectBounty(wantedPrincipalText: string): Promise<{
        __kind__: "ok";
        ok: bigint;
    } | {
        __kind__: "err";
        err: string;
    }>;
    collectDroppedGold(amount: bigint): Promise<boolean>;
    completeQuest(questId: string): Promise<void>;
    createGuild(name: string): Promise<{
        __kind__: "ok";
        ok: GuildData;
    } | {
        __kind__: "err";
        err: string;
    }>;
    getAllCharacters(): Promise<Array<PlayerProfile>>;
    getAllPlayers(): Promise<Array<[Principal, PlayerState]>>;
    getCharacterCount(): Promise<bigint>;
    getDiscoveredZones(): Promise<Array<string>>;
    getFriendsList(): Promise<Array<FriendRecord>>;
    /**
     * / Social: whisper inbox keyed by Principal → [WhisperMessage]
     */
    getGuild(guildId: string): Promise<GuildData | null>;
    /**
     * / Guild names index: lowercase name → guildId for uniqueness
     */
    getGuildByName(name: string): Promise<GuildData | null>;
    getGuildLeaderboard(): Promise<Array<GuildLeaderboardEntry>>;
    getGuildMessages(guildId: string): Promise<{
        __kind__: "ok";
        ok: Array<GuildChatMessage>;
    } | {
        __kind__: "err";
        err: string;
    }>;
    getLeaderboard(): Promise<Array<LeaderboardEntry>>;
    /**
     * / Lowercased nickname -> owner Principal for global uniqueness enforcement
     */
    getLeaderboardByLevelKills(): Promise<Array<LeaderboardEntry>>;
    getMyParty(): Promise<PartyData | null>;
    getOnlinePlayerCount(): Promise<bigint>;
    getPendingPartyInvite(): Promise<PartyInvite | null>;
    getPlayerAchievements(): Promise<Array<string>>;
    getPlayerSettings(): Promise<PlayerSettings | null>;
    getRecentMessages(): Promise<Array<PlayerMessages>>;
    getSkillTree(): Promise<string | null>;
    getTradeLog(): Promise<Array<TradeLogEntry>>;
    /**
     * / Zone discoveries: Principal → [ZoneId]
     */
    getWhispers(): Promise<Array<WhisperMessage>>;
    grantAchievement(achievementId: string): Promise<void>;
    grantTitle(titleId: string): Promise<void>;
    initiateTrade(counterpartyPrincipalText: string): Promise<{
        __kind__: "ok";
        ok: TradeSession;
    } | {
        __kind__: "err";
        err: string;
    }>;
    inviteToParty(targetPrincipalText: string, callerUsername: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    leaveParty(): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    loadPlayer(username: Username, selectedClass: CharacterClass): Promise<PlayerState>;
    recordAttack(): Promise<void>;
    recordCraftedItem(itemId: string): Promise<void>;
    recordMonsterKill(): Promise<void>;
    recordPlayerDeath(): Promise<void>;
    recordPvpKill(): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "addedBounty";
        addedBounty: bigint;
    } | {
        __kind__: "becameWanted";
        becameWanted: bigint;
    }>;
    registerNickname(name: string): Promise<boolean>;
    removeGuild(guildId: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    resetBountyOnSafeZone(): Promise<void>;
    saveActiveTitle(title: string | null): Promise<void>;
    saveDiscoveredZones(zones: Array<string>): Promise<void>;
    saveEmote(emote: EmoteType): Promise<void>;
    saveFriendsList(list: Array<FriendRecord>): Promise<void>;
    saveGuildMembership(guildId: string | null, guildRank: string | null): Promise<void>;
    savePlayerAchievements(achievements: Array<string>): Promise<void>;
    savePlayerClass(selectedClass: CharacterClass): Promise<void>;
    savePlayerCoins(coins: bigint): Promise<void>;
    savePlayerEquipment(weapon: string | null, armor: string | null, offhand: string | null): Promise<void>;
    savePlayerHP(hp: bigint, mp: bigint): Promise<void>;
    savePlayerInventory(items: Array<string>): Promise<void>;
    savePlayerOutfit(color: string, style: string, hairColor: string | null): Promise<void>;
    savePlayerPosition(x: bigint, y: bigint): Promise<void>;
    savePlayerSettings(s: PlayerSettings): Promise<void>;
    savePlayerTitles(titles: Array<string>, activeTitle: string | null): Promise<void>;
    savePlayerXP(xp: bigint, level: bigint): Promise<void>;
    savePotionCount(count: bigint): Promise<void>;
    saveQuestProgress(questId: string, progress: bigint): Promise<void>;
    saveRespawnCity(cityId: string): Promise<void>;
    saveSkillTree(json: string): Promise<void>;
    saveZoneAndPlaytime(zone: string, additionalSeconds: bigint): Promise<void>;
    sendChatMessage(text: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    sendGuildChat(guildId: string, senderUsername: string, text: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    sendWhisper(recipientPrincipalText: string, recipientUsername: string, senderUsername: string, text: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    unlockAchievement(achievementId: string): Promise<boolean>;
    /**
     * / Zone discoveries: Principal → [ZoneId]
     */
    updateGuildMembers(guildId: string, members: Array<[Principal, string]>): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    updateTradeOffer(tradeId: string, itemIds: Array<string>, goldAmount: bigint): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
}
