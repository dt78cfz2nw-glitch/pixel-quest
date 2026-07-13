import Principal "mo:core/Principal";
import SocialLib "../lib/social";
import SocialTypes "../types/social";
import Time "mo:core/Time";

mixin (
  friends : SocialLib.FriendsMap,
  whispers : SocialLib.WhispersMap,
) {
  /// Return the caller's friends list.
  /// Guest accounts (anonymous principal) always return an empty array.
  public shared ({ caller }) func getFriendsList() : async [SocialTypes.FriendRecord] {
    if (caller.isAnonymous()) return [];
    SocialLib.getFriendsList(friends, caller);
  };

  /// Replace the caller's friends list (max 20 entries enforced).
  /// Guest accounts are silently ignored.
  public shared ({ caller }) func saveFriendsList(list : [SocialTypes.FriendRecord]) : async () {
    if (caller.isAnonymous()) return;
    SocialLib.saveFriendsList(friends, caller, list);
  };

  /// Send a whisper to a player identified by their principal text.
  /// Stored in recipient's inbox (last 50 kept).
  /// Guest callers are silently ignored.
  public shared ({ caller }) func sendWhisper(
    recipientPrincipalText : Text,
    recipientUsername : Text,
    senderUsername : Text,
    text : Text,
  ) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot send whispers";
    let recipientPrincipal = Principal.fromText(recipientPrincipalText);
    ignore recipientUsername;
    ignore senderUsername;
    let msg : SocialTypes.WhisperMessage = {
      from = senderUsername;
      to = recipientUsername;
      text;
      timestamp = Time.now();
    };
    SocialLib.sendWhisper(whispers, recipientPrincipal, msg);
    #ok;
  };

  /// Return all whispers in the caller's inbox.
  /// Guest accounts always return an empty array.
  public shared ({ caller }) func getWhispers() : async [SocialTypes.WhisperMessage] {
    if (caller.isAnonymous()) return [];
    SocialLib.getWhispers(whispers, caller);
  };
};
