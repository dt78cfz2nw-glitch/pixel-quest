import Map "mo:core/Map";
import Array "mo:core/Array";
import Order "mo:core/Order";
import Types "../types/player";
import ChatTypes "../types/chat-leaderboard";

module {
  /// PlayerMap alias re-exported for use in mixins
  public type PlayerMap = Map.Map<Principal, Types.PlayerState>;

  /// 30 seconds in nanoseconds
  let expiryNanos : Int = 30_000_000_000;

  /// Maximum messages stored per player
  let maxMessages : Nat = 5;

  /// Validate and store a chat message for a player; keep only last 5; returns #ok or #err
  public func sendChatMessage(
    players : PlayerMap,
    id : Principal,
    text : Text,
    now : ChatTypes.Timestamp,
  ) : { #ok; #err : Text } {
    if (text.size() == 0) return #err("Message cannot be empty");
    if (text.size() > 50) return #err("Message too long (max 50 characters)");

    switch (players.get(id)) {
      case null { #err("Player not found") };
      case (?existing) {
        let newMsg : Types.ChatMessage = { text; timestamp = now };
        let current = existing.chatMessages;
        // Keep only last (maxMessages - 1) existing messages, then append new one
        let kept : [Types.ChatMessage] = if (current.size() >= maxMessages) {
          let keepFrom : Nat = current.size() + 1 - maxMessages;
          current.sliceToArray(keepFrom, current.size());
        } else {
          current;
        };
        let updated = kept.concat([newMsg]);
        players.add(id, {
          existing with
          chatMessages = updated;
          activityScore = existing.activityScore + 10;
          lastActive = now;
        });
        #ok;
      };
    };
  };

  /// Return all players with non-expired messages (within 30s of now)
  public func getRecentMessages(
    players : PlayerMap,
    now : ChatTypes.Timestamp,
  ) : [ChatTypes.PlayerMessages] {
    let cutoff = now - expiryNanos;
    let iter = players.entries().filterMap(
      func((principal, state)) {
        let recent = state.chatMessages.filter(func(msg : Types.ChatMessage) : Bool {
          msg.timestamp >= cutoff
        });
        if (recent.size() == 0) null
        else ?({ principal; username = state.username; messages = recent } : ChatTypes.PlayerMessages)
      }
    );
    iter.toArray();
  };

  /// Record an attack action (+5 activityScore, update lastActive)
  public func recordAttack(players : PlayerMap, id : Principal, now : ChatTypes.Timestamp) {
    switch (players.get(id)) {
      case null {};
      case (?existing) {
        players.add(id, {
          existing with
          activityScore = existing.activityScore + 5;
          lastActive = now;
        });
      };
    };
  };

  /// Return leaderboard entries sorted by activityScore descending
  public func getLeaderboard(players : PlayerMap) : [ChatTypes.LeaderboardEntry] {
    let entries = players.values().map(
      func(state) : ChatTypes.LeaderboardEntry {
        {
          username = state.username;
          level = state.level;
          activityScore = state.activityScore;
          lastActive = state.lastActive;
          monsterKills = state.monsterKills;
          pvpKills = state.pvpKills;
          characterClass = state.selectedClass;
        }
      }
    ).toArray();
    entries.sort<ChatTypes.LeaderboardEntry>(func(a, b) : Order.Order {
      if (a.activityScore > b.activityScore) #less
      else if (a.activityScore < b.activityScore) #greater
      else #equal
    });
  };

  /// Return top 50 entries sorted by level desc → monsterKills desc → pvpKills desc.
  /// Guest accounts (username starts with "guest", case-insensitive) are excluded.
  public func getLeaderboardByLevelKills(players : PlayerMap) : [ChatTypes.LeaderboardEntry] {
    let entries = players.values().filterMap(
      func(state) : ?ChatTypes.LeaderboardEntry {
        // Exclude guest accounts
        if (state.username.toLower().startsWith(#text "guest")) { return null };
        ?{
          username = state.username;
          level = state.level;
          activityScore = state.activityScore;
          lastActive = state.lastActive;
          monsterKills = state.monsterKills;
          pvpKills = state.pvpKills;
          characterClass = state.selectedClass;
        }
      }
    ).toArray();
    let sorted = entries.sort(func(a : ChatTypes.LeaderboardEntry, b : ChatTypes.LeaderboardEntry) : Order.Order {
      // Primary: level descending
      if (a.level > b.level) return #less;
      if (a.level < b.level) return #greater;
      // Secondary: monsterKills descending
      if (a.monsterKills > b.monsterKills) return #less;
      if (a.monsterKills < b.monsterKills) return #greater;
      // Tertiary: pvpKills descending
      if (a.pvpKills > b.pvpKills) return #less;
      if (a.pvpKills < b.pvpKills) return #greater;
      #equal
    });
    // Return top 50
    if (sorted.size() <= 50) { sorted }
    else { sorted.sliceToArray(0, 50) };
  };
};
