import Common "common";

module {
  public type Timestamp = Common.Timestamp;

  /// Party member entry
  public type PartyMember = {
    principal : Principal;
    username : Text;
  };

  /// A party (up to 4 players)
  public type PartyData = {
    partyId : Text;
    members : [PartyMember];
    leaderId : Principal;
    createdAt : Timestamp;
  };

  /// A pending party invite
  public type PartyInvite = {
    partyId : Text;
    fromPrincipal : Text;
    fromUsername : Text;
    toPrincipal : Principal;
    timestamp : Timestamp;
  };
};
