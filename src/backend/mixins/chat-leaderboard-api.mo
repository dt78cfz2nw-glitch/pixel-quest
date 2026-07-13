import Time "mo:core/Time";
import ChatTypes "../types/chat-leaderboard";
import ChatLib "../lib/chat-leaderboard";

mixin (players : ChatLib.PlayerMap) {
  /// Send a chat message for the caller (max 50 chars; stores last 5; +10 activityScore)
  public shared ({ caller }) func sendChatMessage(text : Text) : async { #ok; #err : Text } {
    let now = Time.now();
    ChatLib.sendChatMessage(players, caller, text, now);
  };

  /// Query all players with recent (non-expired, within 30s) messages
  public query func getRecentMessages() : async [ChatTypes.PlayerMessages] {
    let now = Time.now();
    ChatLib.getRecentMessages(players, now);
  };

  /// Record an attack for the caller (+5 activityScore, update lastActive)
  public shared ({ caller }) func recordAttack() : async () {
    let now = Time.now();
    ChatLib.recordAttack(players, caller, now);
  };

  /// Query leaderboard sorted by activityScore descending
  public query func getLeaderboard() : async [ChatTypes.LeaderboardEntry] {
    ChatLib.getLeaderboard(players);
  };

  /// Query leaderboard sorted by level → monsterKills → pvpKills descending.
  /// Guest accounts are excluded. Returns top 50 entries.
  public query func getLeaderboardByLevelKills() : async [ChatTypes.LeaderboardEntry] {
    ChatLib.getLeaderboardByLevelKills(players);
  };
};
