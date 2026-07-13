import Common "common";

module {
  public type Timestamp = Common.Timestamp;

  /// Friendship request status
  public type FriendStatus = { #pending; #accepted };

  /// A single friend entry stored per player
  public type FriendRecord = {
    principalId : Text;
    username : Text;
    status : FriendStatus;
  };

  /// A whisper/private message
  public type WhisperMessage = {
    from : Text;    // sender username
    to : Text;      // recipient username
    text : Text;
    timestamp : Timestamp;
  };
};
