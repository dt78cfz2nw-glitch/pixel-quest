import Map "mo:core/Map";
import Types "../types/social";
import Array "mo:core/Array";
import Time "mo:core/Time";

module {
  /// FriendsMap: Principal → array of FriendRecord (max 20)
  public type FriendsMap = Map.Map<Principal, [Types.FriendRecord]>;

  /// WhispersMap: Principal → array of WhisperMessage (last 50)
  public type WhispersMap = Map.Map<Principal, [Types.WhisperMessage]>;

  /// Max friends per account
  public let MAX_FRIENDS : Nat = 20;

  /// Max whispers stored per player
  public let MAX_WHISPERS : Nat = 50;

  /// Get the friends list for a given principal
  public func getFriendsList(friends : FriendsMap, owner : Principal) : [Types.FriendRecord] {
    switch (friends.get(owner)) {
      case (?list) list;
      case null [];
    };
  };

  /// Save (replace) the friends list for a given principal — max 20 enforced
  public func saveFriendsList(friends : FriendsMap, owner : Principal, list : [Types.FriendRecord]) {
    let trimmed = if (list.size() > MAX_FRIENDS) {
      list.sliceToArray(0, MAX_FRIENDS)
    } else { list };
    friends.add(owner, trimmed);
  };

  /// Append a whisper to the recipient's inbox (keeps last 50)
  public func sendWhisper(whispers : WhispersMap, recipientPrincipal : Principal, msg : Types.WhisperMessage) {
    let existing = switch (whispers.get(recipientPrincipal)) {
      case (?msgs) msgs;
      case null [];
    };
    let combined = existing.concat([msg]);
    let trimmed = if (combined.size() > MAX_WHISPERS) {
      combined.sliceToArray(combined.size() - MAX_WHISPERS, combined.size())
    } else { combined };
    whispers.add(recipientPrincipal, trimmed);
  };

  /// Get all whispers for a given principal
  public func getWhispers(whispers : WhispersMap, owner : Principal) : [Types.WhisperMessage] {
    switch (whispers.get(owner)) {
      case (?msgs) msgs;
      case null [];
    };
  };
};
