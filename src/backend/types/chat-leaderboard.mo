import Common "common";

module {
  public type Timestamp = Common.Timestamp;
  public type Username = Common.Username;

  /// A single chat message stored per player — max 50 chars enforced
  public type ChatMessage = {
    text : Text;
    timestamp : Timestamp;
  };

  /// Per-player chat messages payload for getRecentMessages response
  public type PlayerMessages = {
    principal : Principal;
    username : Username;
    messages : [ChatMessage];
  };

  /// Entry in the leaderboard response — sorted by activityScore descending
  public type LeaderboardEntry = {
    username : Username;
    level : Nat;
    activityScore : Nat;
    lastActive : Timestamp;
    /// Kill counts for level-kills leaderboard ranking
    monsterKills : Nat;
    pvpKills : Nat;
    /// Character class for display icon in frontend
    characterClass : Text;
  };
};
