import Common "common";

module {
  public type Timestamp = Common.Timestamp;

  /// A single guild chat message — stored last 20 per guild
  public type GuildChatMessage = {
    senderPrincipal : Text;
    senderUsername : Text;
    text : Text;
    timestamp : Timestamp;
  };

  /// Full guild record stored in the guilds map
  public type GuildData = {
    guildId : Text;
    name : Text;
    leaderId : Principal;
    /// Members as (Principal, rank) pairs where rank: "leader" | "officer" | "member"
    members : [(Principal, Text)];
    maxMembers : Nat;
    chatMessages : [GuildChatMessage];
    createdAt : Timestamp;
  };

  /// Guild leaderboard entry — top 10 guilds ranked by combined member levels or kills
  public type GuildLeaderboardEntry = {
    guildId : Text;
    name : Text;
    memberCount : Nat;
    totalMemberLevels : Nat;
    totalKills : Nat;
  };
};
