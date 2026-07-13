import Map "mo:core/Map";
import PartyTypes "../types/party";
import Array "mo:core/Array";

module {
  /// PartyMap: partyId → PartyData
  public type PartyMap = Map.Map<Text, PartyTypes.PartyData>;

  /// PartyInviteMap: invitee Principal → pending invite (at most one at a time)
  public type PartyInviteMap = Map.Map<Principal, PartyTypes.PartyInvite>;

  /// Max members per party
  public let MAX_PARTY_SIZE : Nat = 4;

  /// Create a new party led by leader
  public func createParty(
    parties : PartyMap,
    partyId : Text,
    leader : Principal,
    leaderUsername : Text,
    now : Int,
  ) : PartyTypes.PartyData {
    let party : PartyTypes.PartyData = {
      partyId;
      members = [{ principal = leader; username = leaderUsername }];
      leaderId = leader;
      createdAt = now;
    };
    parties.add(partyId, party);
    party;
  };

  /// Get a party by ID
  public func getParty(parties : PartyMap, partyId : Text) : ?PartyTypes.PartyData {
    parties.get(partyId);
  };

  /// Add a member to a party; returns false if full
  public func joinParty(
    parties : PartyMap,
    partyId : Text,
    member : Principal,
    username : Text,
  ) : Bool {
    switch (parties.get(partyId)) {
      case null false;
      case (?party) {
        if (party.members.size() >= MAX_PARTY_SIZE) return false;
        let newMember : PartyTypes.PartyMember = { principal = member; username };
        parties.add(partyId, { party with members = party.members.concat([newMember]) });
        true;
      };
    };
  };

  /// Remove a member from a party
  public func leaveParty(parties : PartyMap, partyId : Text, member : Principal) {
    switch (parties.get(partyId)) {
      case null {};
      case (?party) {
        let remaining = party.members.filter(
          func(m : PartyTypes.PartyMember) : Bool = m.principal != member
        );
        if (remaining.size() == 0) {
          parties.remove(partyId);
        } else {
          let newLeader = if (party.leaderId == member) remaining[0].principal else party.leaderId;
          parties.add(partyId, { party with members = remaining; leaderId = newLeader });
        };
      };
    };
  };

  /// Check if a principal is already in a party
  public func findPartyOfMember(parties : PartyMap, who : Principal) : ?PartyTypes.PartyData {
    var found : ?PartyTypes.PartyData = null;
    for ((_, party) in parties.entries()) {
      if (party.members.find(func(m : PartyTypes.PartyMember) : Bool = m.principal == who) != null) {
        found := ?party;
      };
    };
    found;
  };
};
