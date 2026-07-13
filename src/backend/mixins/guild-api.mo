import PlayerLib "../lib/player";
import GuildLib "../lib/guild";
import GuildTypes "../types/guild";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Int "mo:core/Int";

mixin (
  players : PlayerLib.PlayerMap,
  guilds : GuildLib.GuildsMap,
  guildNames : GuildLib.GuildNamesMap,
) {
  /// Create a new guild with the given name.
  /// Caller becomes the Guild Leader.
  /// Returns the new GuildData or an error message.
  /// Guest accounts are rejected.
  public shared ({ caller }) func createGuild(name : Text) : async { #ok : GuildTypes.GuildData; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot create guilds";
    // Check caller has a registered player
    switch (players.get(caller)) {
      case null return #err "player not found";
      case (?player) {
        if (player.guildId != null) return #err "already in a guild";
      };
    };
    let trimmedName = name;
    if (trimmedName.size() == 0) return #err "guild name cannot be empty";
    if (trimmedName.size() > 30) return #err "guild name too long";
    let guildId = caller.toText() # "-" # Time.now().toText();
    switch (GuildLib.createGuild(guilds, guildNames, guildId, trimmedName, caller, Time.now())) {
      case (?guild) #ok guild;
      case null #err "guild name already taken";
    };
  };

  /// Look up a guild by its ID.
  public query func getGuild(guildId : Text) : async ?GuildTypes.GuildData {
    GuildLib.getGuild(guilds, guildId);
  };

  /// Look up a guild by name (case-insensitive).
  public query func getGuildByName(name : Text) : async ?GuildTypes.GuildData {
    GuildLib.getGuildByName(guilds, guildNames, name);
  };

  /// Replace the member list of a guild.
  /// Only the Guild Leader may call this.
  public shared ({ caller }) func updateGuildMembers(
    guildId : Text,
    members : [(Principal, Text)],
  ) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot manage guilds";
    switch (GuildLib.getGuild(guilds, guildId)) {
      case null return #err "guild not found";
      case (?guild) {
        if (guild.leaderId != caller) return #err "only guild leader can update members";
        if (members.size() > GuildLib.MAX_MEMBERS) return #err "too many members";
        GuildLib.updateGuildMembers(guilds, guildId, members);
        #ok;
      };
    };
  };

  /// Disband a guild entirely.
  /// Only the Guild Leader may call this.
  public shared ({ caller }) func removeGuild(guildId : Text) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot manage guilds";
    switch (GuildLib.getGuild(guilds, guildId)) {
      case null return #err "guild not found";
      case (?guild) {
        if (guild.leaderId != caller) return #err "only guild leader can disband guild";
        GuildLib.removeGuild(guilds, guildNames, guildId);
        #ok;
      };
    };
  };

  /// Record guild membership on the caller's PlayerState (guildId + rank).
  /// Pass null for both to leave the guild.
  /// Guest accounts are silently ignored.
  public shared ({ caller }) func saveGuildMembership(guildId : ?Text, guildRank : ?Text) : async () {
    if (caller.isAnonymous()) return;
    switch (players.get(caller)) {
      case null {};
      case (?player) {
        players.add(caller, { player with guildId; guildRank });
      };
    };
  };

  /// Post a message to a guild's chat channel.
  /// Caller must be a member of the guild.
  public shared ({ caller }) func sendGuildChat(
    guildId : Text,
    senderUsername : Text,
    text : Text,
  ) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot use guild chat";
    switch (GuildLib.getGuild(guilds, guildId)) {
      case null return #err "guild not found";
      case (?guild) {
        if (not GuildLib.isMember(guild, caller)) return #err "not a member of this guild";
        let msg : GuildTypes.GuildChatMessage = {
          senderPrincipal = caller.toText();
          senderUsername;
          text;
          timestamp = Time.now();
        };
        GuildLib.addGuildChatMessage(guilds, guildId, msg);
        #ok;
      };
    };
  };

  /// Retrieve the last 20 messages from a guild's chat.
  /// Caller must be a member of the guild.
  public shared ({ caller }) func getGuildMessages(guildId : Text) : async { #ok : [GuildTypes.GuildChatMessage]; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot read guild chat";
    switch (GuildLib.getGuild(guilds, guildId)) {
      case null return #err "guild not found";
      case (?guild) {
        if (not GuildLib.isMember(guild, caller)) return #err "not a member of this guild";
        #ok (GuildLib.getGuildMessages(guilds, guildId));
      };
    };
  };
};
