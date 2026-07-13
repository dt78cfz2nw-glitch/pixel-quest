import Array "mo:core/Array";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/player";
import PlayerLib "../lib/player";

mixin (players : PlayerLib.PlayerMap, settings : PlayerLib.SettingsMap) {
  /// Load player state for the caller; spawns at town center (8, 24) with default class if new.
  /// Legacy outfitStyle values are normalized to the new appearance keys on every load.
  public shared ({ caller }) func loadPlayer(username : Types.Username, selectedClass : Types.CharacterClass) : async Types.PlayerState {
    switch (players.get(caller)) {
      case (?existing) {
        // Normalize legacy style keys and refresh lastActive on login
        let normalizedStyle = PlayerLib.normalizeOutfitStyle(existing.outfitStyle);
        let updated = { existing with outfitStyle = normalizedStyle; lastActive = Time.now() };
        players.add(caller, updated);
        updated;
      };
      case null {
        // New player — spawn at (8, 24) with hp:100, maxHp:100, mp:50, maxMp:50
        let newState = {
          username;
          x = 8;
          y = 24;
          selectedClass;
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
          craftedItems = null;
          pvpKillsSession = null;
          isWanted = null;
          bountyAmount = null;
          partyId = null;
          lastDailyBonus = null;
        };
        players.add(caller, newState);
        newState;
      };
    };
  };

  /// Save the current player position for the caller (+1 activityScore, update lastActive)
  public shared ({ caller }) func savePlayerPosition(x : Nat, y : Nat) : async () {
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        players.add(caller, {
          existing with
          x;
          y;
          activityScore = existing.activityScore + 1;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Store the selected character class on-chain for the caller
  public shared ({ caller }) func savePlayerClass(selectedClass : Types.CharacterClass) : async () {
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        PlayerLib.saveClass(players, caller, existing.username, selectedClass);
      };
    };
  };

  /// Set an ephemeral emote for the caller (+3 activityScore, update lastActive)
  public shared ({ caller }) func saveEmote(emote : Types.EmoteType) : async () {
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        PlayerLib.saveEmote(players, caller, existing.username, emote, Time.now());
      };
    };
  };

  /// Update HP/MP state for the caller (for respawn and combat damage sync)
  public shared ({ caller }) func savePlayerHP(hp : Nat, mp : Nat) : async () {
    PlayerLib.saveHP(players, caller, hp, mp);
  };

  /// Save XP and level progression for the caller
  public shared ({ caller }) func savePlayerXP(xp : Nat, level : Nat) : async () {
    PlayerLib.saveXP(players, caller, xp, level);
  };

  /// Save outfit customization (color, style, and optional hair color) for the caller.
  /// Backward compatible — hairColor is optional; omitting it preserves the existing value.
  /// Legacy style values (default/heavy/light/mystic/scholar) are accepted and normalized.
  public shared ({ caller }) func savePlayerOutfit(color : Text, style : Text, hairColor : ?Text) : async () {
    PlayerLib.saveOutfit(players, caller, color, style, hairColor);
  };

  /// Record a monster kill for the caller (+20 activityScore, +1 kills)
  public shared ({ caller }) func recordMonsterKill() : async () {
    PlayerLib.recordKill(players, caller);
  };

  /// Return all players for multiplayer rendering — includes all new fields
  public query func getAllPlayers() : async [(Principal, Types.PlayerState)] {
    PlayerLib.getAllPlayers(players);
  };

  /// Save coin balance for the caller
  public shared ({ caller }) func savePlayerCoins(coins : Nat) : async () {
    let existing = switch (players.get(caller)) {
      case (?p) p;
      case null { return };
    };
    players.add(caller, PlayerLib.saveCoins(existing, coins));
  };

  /// Save the full inventory item-ID list for the caller (max 20 entries enforced)
  public shared ({ caller }) func savePlayerInventory(items : [Text]) : async () {
    if (items.size() > 20) {
      Runtime.trap("inventory exceeds 20 items");
    };
    let existing = switch (players.get(caller)) {
      case (?p) p;
      case null { return };
    };
    players.add(caller, PlayerLib.saveInventory(existing, items));
  };

  /// Save all three equipment slots at once for the caller
  public shared ({ caller }) func savePlayerEquipment(weapon : ?Text, armor : ?Text, offhand : ?Text) : async () {
    let existing = switch (players.get(caller)) {
      case (?p) p;
      case null { return };
    };
    players.add(caller, PlayerLib.saveEquipment(existing, weapon, armor, offhand));
  };

  /// Return lightweight enhanced profiles for all characters (used by character selection screen)
  public query func getAllCharacters() : async [Types.PlayerProfile] {
    PlayerLib.getAllCharacters(players);
  };

  /// Return the number of characters for the caller's principal (0 or 1 in single-slot architecture)
  public query ({ caller }) func getCharacterCount() : async Nat {
    PlayerLib.getCharacterCount(players, caller);
  };

  /// Return count of players active within the last 5 minutes
  public query func getOnlinePlayerCount() : async Nat {
    PlayerLib.getOnlinePlayerCount(players);
  };

  /// Save quest progress for the caller — sets activeQuestId and questProgress
  public shared ({ caller }) func saveQuestProgress(questId : Text, progress : Nat) : async () {
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        players.add(caller, {
          existing with
          activeQuestId = ?questId;
          questProgress = ?progress;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Mark the active quest as complete: append questId to completedQuestIds, clear active quest
  public shared ({ caller }) func completeQuest(questId : Text) : async () {
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        let updated = existing.completedQuestIds.concat([questId]);
        players.add(caller, {
          existing with
          completedQuestIds = updated;
          activeQuestId = null;
          questProgress = null;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Unlock an achievement for the caller.
  /// Returns true if newly unlocked, false if already present.
  public shared ({ caller }) func unlockAchievement(achievementId : Text) : async Bool {
    switch (players.get(caller)) {
      case null { false };
      case (?existing) {
        // Check if already unlocked
        let alreadyHas = existing.achievements.find(func(a : Text) : Bool { a == achievementId }) != null;
        if (alreadyHas) {
          false;
        } else {
          let updated = existing.achievements.concat([achievementId]);
          players.add(caller, {
            existing with
            achievements = updated;
            lastActive = Time.now();
          });
          true;
        };
      };
    };
  };

  /// Save the chosen respawn city for the caller
  public shared ({ caller }) func saveRespawnCity(cityId : Text) : async () {
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        players.add(caller, {
          existing with
          respawnCity = ?cityId;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Save the health potion count (0–5) for the caller
  public shared ({ caller }) func savePotionCount(count : Nat) : async () {
    let capped : Nat = if (count > 5) { 5 } else { count };
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        players.add(caller, {
          existing with
          potionCount = ?capped;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Save the full achievements list for the caller (client is authoritative).
  /// Replaces the entire list — client provides the complete updated array.
  /// Guest callers (anonymous principal) are silently ignored.
  public shared ({ caller }) func savePlayerAchievements(achievements : [Text]) : async () {
    // Block anonymous / guest callers
    if (caller == Principal.fromText("2vxsx-fae")) { return };
    switch (players.get(caller)) {
      case null {};
      case (?existing) {
        players.add(caller, {
          existing with
          achievements;
          lastActive = Time.now();
        });
      };
    };
  };

  /// Return the achievements list for the caller.
  /// Returns empty array for unknown or guest callers.
  public shared ({ caller }) func getPlayerAchievements() : async [Text] {
    if (caller == Principal.fromText("2vxsx-fae")) { return [] };
    switch (players.get(caller)) {
      case null { [] };
      case (?existing) { existing.achievements };
    };
  };

  /// Save the active title for the caller. Pass null to clear the title.
  /// Guest callers are silently ignored.
  public shared ({ caller }) func saveActiveTitle(title : ?Text) : async () {
    if (caller == Principal.fromText("2vxsx-fae")) { return };
    PlayerLib.saveActiveTitle(players, caller, title);
  };

  /// Save the full earned titles list and active title for the caller.
  /// Guest callers are silently ignored.
  public shared ({ caller }) func savePlayerTitles(titles : [Text], activeTitle : ?Text) : async () {
    if (caller == Principal.fromText("2vxsx-fae")) { return };
    PlayerLib.savePlayerTitles(players, caller, titles, activeTitle);
  };

  /// Save the player's current zone and add to total playtime.
  /// additionalSeconds: seconds to add to totalPlaytime.
  public shared ({ caller }) func saveZoneAndPlaytime(zone : Text, additionalSeconds : Nat) : async () {
    PlayerLib.saveZoneAndPlaytime(players, caller, zone, additionalSeconds);
  };

  /// Record a death for the caller (increments deaths counter).
  public shared ({ caller }) func recordPlayerDeath() : async () {
    PlayerLib.recordDeath(players, caller);
  };

  // ── Settings ────────────────────────────────────────────────────────────────

  /// Save all player settings for the caller. Applied instantly; stored per Principal.
  /// Guest callers (anonymous principal) are silently ignored.
  public shared ({ caller }) func savePlayerSettings(s : Types.PlayerSettings) : async () {
    if (caller == Principal.fromText("2vxsx-fae")) { return };
    settings.add(caller, s);
  };

  /// Return saved settings for the caller.
  /// Returns null for new/existing players without saved settings — frontend uses defaults.
  public shared ({ caller }) func getPlayerSettings() : async ?Types.PlayerSettings {
    if (caller == Principal.fromText("2vxsx-fae")) { return null };
    settings.get(caller);
  };
};
