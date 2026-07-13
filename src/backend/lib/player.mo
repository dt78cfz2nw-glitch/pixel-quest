import Array "mo:core/Array";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Order "mo:core/Order";
import Time "mo:core/Time";
import Types "../types/player";

module {
  /// PlayerMap is keyed by Principal — the caller's identity is the authoritative key
  public type PlayerMap = Map.Map<Principal, Types.PlayerState>;

  /// SettingsMap is keyed by Principal — stores per-player settings
  public type SettingsMap = Map.Map<Principal, Types.PlayerSettings>;

  /// 5-minute window in nanoseconds for "online" detection (5 * 60 * 1_000_000_000)
  let ONLINE_WINDOW_NS : Int = 300_000_000_000;

  /// Map legacy outfit style values to the new appearance system keys
  public func normalizeOutfitStyle(style : Text) : Text {
    switch (style) {
      case "default"  "warrior_A";
      case "heavy"    "warrior_A";
      case "light"    "warrior_C";
      case "mystic"   "mage_A";
      case "scholar"  "mage_B";
      // Already a new-style key — return unchanged
      case other      other;
    };
  };

  /// Create a new player state at town center (8, 24) with default class and full stats
  public func newPlayer(username : Types.Username) : Types.PlayerState {
    {
      username;
      x = 8;
      y = 24;
      selectedClass = "warrior";
      currentEmote = null;
      emoteTimestamp = Time.now();
      level = 1;
      activityScore = 0;
      lastActive = Time.now();
      chatMessages = [];
      hp = 100;
      maxHp = 100;
      mp = 50;
      maxMp = 50;
      xp = 0;
      kills = 0;
      monsterKills = 0;
      pvpKills = 0;
      outfitColor = "default";
      outfitStyle = "warrior_A";
      hairColor = "brown";
      coins = 0;
      inventoryItems = [];
      equippedWeapon = null;
      equippedArmor = null;
      equippedOffhand = null;
      characterId = 0;
      activeQuestId = null;
      questProgress = null;
      completedQuestIds = [];
      achievements = [];
      respawnCity = null;
      potionCount = null;
      playerTitles = null;
      activeTitle = null;
      totalPlaytime = null;
      lastZone = null;
      deaths = null;
      friendsList = null;
      guildId = null;
      guildRank = null;
      skillPoints = null;
      skillTree = null;
      discoveredZones = null;
      partyId = null;
      lastDailyBonus = null;
      craftedItems = null;
      isWanted = null;
      pvpKillsSession = null;
      bountyAmount = null;
    };
  };

  /// Get a player's current state by Principal; returns null if not found
  public func getPlayer(players : PlayerMap, id : Principal) : ?Types.PlayerState {
    players.get(id);
  };

  /// Save (upsert) player state in the map keyed by Principal
  public func savePlayer(players : PlayerMap, id : Principal, state : Types.PlayerState) {
    players.add(id, state);
  };

  /// Update only the class field for an existing player; spawns if new
  public func saveClass(players : PlayerMap, id : Principal, username : Types.Username, selectedClass : Types.CharacterClass) {
    let existing = switch (players.get(id)) {
      case (?p) p;
      case null newPlayer(username);
    };
    players.add(id, { existing with selectedClass; lastActive = Time.now() });
  };

  /// Set the emote for a player; spawns if new
  public func saveEmote(players : PlayerMap, id : Principal, username : Types.Username, emote : Types.EmoteType, ts : Types.Timestamp) {
    let existing = switch (players.get(id)) {
      case (?p) p;
      case null newPlayer(username);
    };
    players.add(id, {
      existing with
      currentEmote = ?emote;
      emoteTimestamp = ts;
      activityScore = existing.activityScore + 3;
      lastActive = ts;
    });
  };

  /// Return all stored players as an array of (Principal, PlayerState) for multiplayer rendering
  public func getAllPlayers(players : PlayerMap) : [(Principal, Types.PlayerState)] {
    players.toArray();
  };

  /// Update HP/MP for a player (for respawn and combat damage sync)
  public func saveHP(players : PlayerMap, id : Principal, hp : Nat, mp : Nat) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        players.add(id, { existing with hp; mp; lastActive = Time.now() });
      };
    };
  };

  /// Update XP and level for a player, respecting leveling milestones (every 100 XP = 1 level)
  public func saveXP(players : PlayerMap, id : Principal, xp : Nat, level : Nat) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        // Auto-level: if xp >= level * 100 then increment level
        let newLevel = if (xp >= level * 100) { level + 1 } else { level };
        players.add(id, { existing with xp; level = newLevel; lastActive = Time.now() });
      };
    };
  };

  /// Update outfit customization (color, style, and optional hair color) for a player.
  /// Legacy style values are normalized to the new appearance keys automatically.
  public func saveOutfit(players : PlayerMap, id : Principal, outfitColor : Text, outfitStyle : Text, hairColor : ?Text) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        let normalizedStyle = normalizeOutfitStyle(outfitStyle);
        let resolvedHair = switch (hairColor) {
          case (?h) h;
          case null existing.hairColor;
        };
        players.add(id, { existing with outfitColor; outfitStyle = normalizedStyle; hairColor = resolvedHair; lastActive = Time.now() });
      };
    };
  };

  /// Record a monster kill: +20 activityScore, +1 kills counter, +1 monsterKills
  public func recordKill(players : PlayerMap, id : Principal) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        players.add(id, {
          existing with
          activityScore = existing.activityScore + 20;
          kills = existing.kills + 1;
          monsterKills = existing.monsterKills + 1;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Return updated state with new coin balance
  public func saveCoins(state : Types.PlayerState, coins : Nat) : Types.PlayerState {
    { state with coins; lastActive = Time.now() };
  };

  /// Return updated state with new inventory (max 20 items enforced)
  public func saveInventory(state : Types.PlayerState, items : [Text]) : Types.PlayerState {
    let capped = if (items.size() > 20) {
      items.sliceToArray(0, 20);
    } else {
      items;
    };
    { state with inventoryItems = capped; lastActive = Time.now() };
  };

  /// Return updated state with new equipment slots
  public func saveEquipment(state : Types.PlayerState, weapon : ?Text, armor : ?Text, offhand : ?Text) : Types.PlayerState {
    { state with equippedWeapon = weapon; equippedArmor = armor; equippedOffhand = offhand; lastActive = Time.now() };
  };

  /// Build the equipped items array from optional slots (filters out nulls)
  func buildEquippedItems(state : Types.PlayerState) : [Text] {
    let slots : [?Text] = [state.equippedWeapon, state.equippedArmor, state.equippedOffhand];
    slots.filterMap(func(s : ?Text) : ?Text { s });
  };

  /// Return lightweight enhanced profiles for all stored players, sorted by level desc
  public func getAllCharacters(players : PlayerMap) : [Types.PlayerProfile] {
    let profiles = players.values().map(
      func(s : Types.PlayerState) : Types.PlayerProfile {
        {
          username = s.username;
          class_ = s.selectedClass;
          level = s.level;
          coins = s.coins;
          lastZone = switch (s.lastZone) { case (?z) z; case null "meadow_hub" };
          totalPlaytime = switch (s.totalPlaytime) { case (?t) t; case null 0 };
          monsterKills = s.monsterKills;
          pvpKills = s.pvpKills;
          deaths = switch (s.deaths) { case (?d) d; case null 0 };
          equippedItems = buildEquippedItems(s);
          activeTitle = switch (s.activeTitle) { case (?t) t; case null "" };
        };
      }
    ).toArray();
    profiles.sort(func(a : Types.PlayerProfile, b : Types.PlayerProfile) : Order.Order { Nat.compare(b.level, a.level) });
  };

  /// Return the number of characters (players) for a given principal.
  /// Since the architecture is 1 PlayerState per Principal, returns 0 or 1.
  public func getCharacterCount(players : PlayerMap, id : Principal) : Nat {
    switch (players.get(id)) {
      case (?_) 1;
      case null 0;
    };
  };

  /// Count players whose lastActive is within the last 5 minutes
  public func getOnlinePlayerCount(players : PlayerMap) : Nat {
    let now : Int = Time.now();
    players.values().foldLeft(
      0,
      func(count : Nat, s : Types.PlayerState) : Nat {
        if (now - s.lastActive <= ONLINE_WINDOW_NS) { count + 1 } else { count };
      }
    );
  };

  /// Save the active title for a player
  public func saveActiveTitle(players : PlayerMap, id : Principal, title : ?Text) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        players.add(id, { existing with activeTitle = title; lastActive = Time.now() });
      };
    };
  };

  /// Save (replace) the full player titles list and active title
  public func savePlayerTitles(players : PlayerMap, id : Principal, titles : [Text], activeTitle : ?Text) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        players.add(id, {
          existing with
          playerTitles = ?titles;
          activeTitle;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Save lastZone and increment totalPlaytime (in seconds) for a player
  public func saveZoneAndPlaytime(players : PlayerMap, id : Principal, zone : Text, additionalSeconds : Nat) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        let currentPlaytime = switch (existing.totalPlaytime) { case (?t) t; case null 0 };
        players.add(id, {
          existing with
          lastZone = ?zone;
          totalPlaytime = ?(currentPlaytime + additionalSeconds);
          lastActive = Time.now();
        });
      };
    };
  };

  /// Increment death counter for a player
  public func recordDeath(players : PlayerMap, id : Principal) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        let currentDeaths = switch (existing.deaths) { case (?d) d; case null 0 };
        players.add(id, {
          existing with
          deaths = ?(currentDeaths + 1);
          lastActive = Time.now();
        });
      };
    };
  };
};
