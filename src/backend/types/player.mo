import Common "common";

module {
  public type Username = Common.Username;
  public type Timestamp = Common.Timestamp;

  /// Character class selection — stored on-chain
  public type CharacterClass = Text; // "warrior" | "mage"

  /// Emote type — lightweight ephemeral expression
  public type EmoteType = { #wave; #thumbsUp; #heart; #confused };

  /// A single chat message stored per player — max 50 chars enforced
  public type ChatMessage = {
    text : Text;
    timestamp : Timestamp;
  };

  /// Immutable player state — shared across the API boundary
  public type PlayerState = {
    username : Username;
    x : Nat;
    y : Nat;
    selectedClass : CharacterClass;
    currentEmote : ?EmoteType;
    emoteTimestamp : Timestamp;
    level : Nat;
    activityScore : Nat;
    lastActive : Timestamp;
    chatMessages : [ChatMessage];
    /// Combat stats
    hp : Nat;
    maxHp : Nat;
    mp : Nat;
    maxMp : Nat;
    /// Progression
    xp : Nat;
    kills : Nat;
    /// Total monsters killed — used for leaderboard ranking
    monsterKills : Nat;
    /// Total PVP kills — used for leaderboard tie-breaking
    pvpKills : Nat;
    /// Outfit customization — color: hex or named color e.g. "#ff0000"|"default"
    outfitColor : Text;
    /// Outfit style — warrior: "warrior_A"|"warrior_B"|"warrior_C"; mage: "mage_A"|"mage_B"|"mage_C"
    /// Legacy values "default"|"heavy"|"light"|"mystic"|"scholar" are mapped on load
    outfitStyle : Text;
    /// Hair color — hex or named color e.g. "#8B4513"|"brown"
    hairColor : Text;
    /// Coin currency balance
    coins : Nat;
    /// Serialized item IDs in backpack (max 20) e.g. "sword_basic", "coin_x5"
    inventoryItems : [Text];
    /// Equipped gear slot item IDs (null = empty slot)
    equippedWeapon : ?Text;
    equippedArmor : ?Text;
    equippedOffhand : ?Text;
    /// Character slot index (0 or 1) for multi-character support
    characterId : Nat;
    /// Quest system — all optional for backward compatibility with existing player data
    /// Active quest ID (null if no active quest)
    activeQuestId : ?Text;
    /// Current objective progress count for the active quest
    questProgress : ?Nat;
    /// List of completed quest IDs
    completedQuestIds : [Text];
    /// List of unlocked achievement IDs
    achievements : [Text];
    /// Chosen respawn city ID (null defaults to meadow_hub)
    respawnCity : ?Text;
    /// Health potion count (0–5)
    potionCount : ?Nat;
    /// Player titles system — list of earned title IDs
    playerTitles : ?[Text];
    /// Currently active/displayed title ID (null = none)
    activeTitle : ?Text;
    /// Total playtime in seconds (incremented periodically)
    totalPlaytime : ?Nat;
    /// Last zone/map identifier (e.g. "meadow_hub", "aurelion")
    lastZone : ?Text;
    /// Deaths counter
    deaths : ?Nat;
    /// Friends list — optional for backward compat; null for existing players / guests
    friendsList : ?[Text]; // serialized as JSON array of FriendRecord on frontend
    /// Guild ID the player belongs to (null = no guild)
    guildId : ?Text;
    /// Guild rank: "leader" | "officer" | "member" (null = no guild)
    guildRank : ?Text;
    /// Unspent skill points (1 per level-up)
    skillPoints : ?Nat;
    /// JSON-encoded skill allocations per class (null = no allocations yet)
    skillTree : ?Text;
    /// Zone IDs this player has discovered (null = none yet)
    discoveredZones : ?[Text];
    /// Crafted item history IDs for achievement tracking (null = none yet)
    craftedItems : ?[Text];
    /// PVP kill count for the current session (for bounty tracking)
    pvpKillsSession : ?Nat;
    /// Whether the player currently has a WANTED bounty on them
    isWanted : ?Bool;
    /// Current bounty amount in gold (50g per kill above 2)
    bountyAmount : ?Nat;
    /// Party ID the player currently belongs to (null = no party)
    partyId : ?Text;
    /// Timestamp of last daily login bonus (null = never claimed)
    lastDailyBonus : ?Timestamp;
  };

  /// Monster type definitions for zone configuration — referenced by frontend zone configs
  /// These are pure type labels; HP/XP/speed tuning lives in the frontend zone config.
  public type MonsterType = {
    #goblin;          // basic; beginner zone
    #wolf;            // forest
    #bear;            // forest/wilderness
    #tiger;           // jungle
    #spider;          // cave
    #bat;             // cave/dark areas
    #troll;           // forest/ruins
    #skeleton;        // ruins
    #cyclops;         // special zone
    #crystal_golem;   // crystal ruins
    #shadow_wolf;     // dark forest — medium HP, fast, drops mid-tier loot
    #stone_golem;     // ancient ruins — high HP, slow, heavy XP
    #cave_bat;        // cave — low HP, fast, swarms in groups
    #cave_troll;      // cave — very high HP, very high XP, rare spawn
  };

  /// Lightweight public profile for character selection screen and leaderboard
  public type PlayerProfile = {
    username : Username;
    class_ : Text;
    level : Nat;
    coins : Nat;
    /// Zone/map name where the character was last seen
    lastZone : Text;
    /// Total playtime in seconds
    totalPlaytime : Nat;
    /// Monster kills count
    monsterKills : Nat;
    /// PVP kills count
    pvpKills : Nat;
    /// Deaths count
    deaths : Nat;
    /// Equipped items as array of item ID strings (weapon/armor/offhand filtered nulls)
    equippedItems : [Text];
    /// Currently active title (empty string if none)
    activeTitle : Text;
  };

  /// Per-player settings persisted on-chain.
  /// All fields optional-compatible via null-safe defaults on read.
  public type PlayerSettings = {
    masterVolume : Float;
    musicVolume : Float;
    sfxVolume : Float;
    ambientSound : Bool;
    particleQuality : Text;   // "high" | "medium" | "low" | "off"
    weatherEffects : Bool;
    dayNightCycle : Bool;
    smoothCamera : Bool;
    autoPickupGold : Bool;
    damageNumbers : Bool;
    killStreaks : Bool;
    chatNotifications : Bool;
    respawnCity : Text;       // "meadow_hub" | "aurelion"
  };
};
