import Map "mo:core/Map";
import Types "../types/guild";
import Time "mo:core/Time";
import Array "mo:core/Array";

module {
  /// GuildsMap: guildId (Text) → GuildData
  public type GuildsMap = Map.Map<Text, Types.GuildData>;

  /// GuildNamesMap: lowercase guild name → guildId for uniqueness check
  public type GuildNamesMap = Map.Map<Text, Text>;

  /// Max members per guild
  public let MAX_MEMBERS : Nat = 20;

  /// Max chat messages stored per guild
  public let MAX_CHAT : Nat = 20;

  /// Create a new guild; returns the new GuildData or null if name is taken
  public func createGuild(
    guilds : GuildsMap,
    guildNames : GuildNamesMap,
    guildId : Text,
    name : Text,
    leader : Principal,
    now : Int,
  ) : ?Types.GuildData {
    let lowerName = name.toLower();
    if (guildNames.get(lowerName) != null) return null;
    let guild : Types.GuildData = {
      guildId;
      name;
      leaderId = leader;
      members = [(leader, "leader")];
      maxMembers = MAX_MEMBERS;
      chatMessages = [];
      createdAt = now;
    };
    guilds.add(guildId, guild);
    guildNames.add(lowerName, guildId);
    ?guild;
  };

  /// Get guild data by guildId
  public func getGuild(guilds : GuildsMap, guildId : Text) : ?Types.GuildData {
    guilds.get(guildId);
  };

  /// Get guild data by name (case-insensitive)
  public func getGuildByName(guilds : GuildsMap, guildNames : GuildNamesMap, name : Text) : ?Types.GuildData {
    switch (guildNames.get(name.toLower())) {
      case (?guildId) guilds.get(guildId);
      case null null;
    };
  };

  /// Update the member list for a guild (replaces entire members array)
  public func updateGuildMembers(guilds : GuildsMap, guildId : Text, members : [(Principal, Text)]) {
    switch (guilds.get(guildId)) {
      case (?guild) {
        guilds.add(guildId, { guild with members });
      };
      case null {};
    };
  };

  /// Remove a guild entirely (also cleans guildNames index)
  public func removeGuild(guilds : GuildsMap, guildNames : GuildNamesMap, guildId : Text) {
    switch (guilds.get(guildId)) {
      case (?guild) {
        guildNames.remove(guild.name.toLower());
        guilds.remove(guildId);
      };
      case null {};
    };
  };

  /// Append a chat message to a guild (keeps last MAX_CHAT)
  public func addGuildChatMessage(guilds : GuildsMap, guildId : Text, msg : Types.GuildChatMessage) {
    switch (guilds.get(guildId)) {
      case (?guild) {
        let combined = guild.chatMessages.concat([msg]);
        let len = combined.size();
        let trimmed = if (len > MAX_CHAT) {
          combined.sliceToArray(len - MAX_CHAT : Int, len : Int)
        } else { combined };
        guilds.add(guildId, { guild with chatMessages = trimmed });
      };
      case null {};
    };
  };

  /// Return the last MAX_CHAT messages for a guild
  public func getGuildMessages(guilds : GuildsMap, guildId : Text) : [Types.GuildChatMessage] {
    switch (guilds.get(guildId)) {
      case (?guild) guild.chatMessages;
      case null [];
    };
  };

  /// Check whether a principal is a member of a guild
  public func isMember(guild : Types.GuildData, who : Principal) : Bool {
    guild.members.find(func((p, _)) { p == who }) != null;
  };

  /// Get the rank of a member in a guild; returns null if not a member
  public func getMemberRank(guild : Types.GuildData, who : Principal) : ?Text {
    switch (guild.members.find(func((p, _)) { p == who })) {
      case (?(_, rank)) ?rank;
      case null null;
    };
  };
};
