import Debug "mo:core/Debug";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Int "mo:core/Int";
import PlayerLib "../lib/player";
import PartyLib "../lib/party";
import PartyTypes "../types/party";

mixin (
  players : PlayerLib.PlayerMap,
  parties : PartyLib.PartyMap,
  partyInvites : PartyLib.PartyInviteMap,
) {
  /// Invite another player to a party.
  /// If the caller is not in a party yet, a new party is created.
  /// Guest accounts are rejected.
  public shared ({ caller }) func inviteToParty(
    targetPrincipalText : Text,
    callerUsername : Text,
  ) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot use party system";
    let targetPrincipal = Principal.fromText(targetPrincipalText);
    if (players.get(targetPrincipal) == null) return #err "target player not found";
    // Find or create caller's party
    let partyId = switch (PartyLib.findPartyOfMember(parties, caller)) {
      case (?party) {
        if (party.leaderId != caller) return #err "only party leader can invite";
        if (party.members.size() >= PartyLib.MAX_PARTY_SIZE) return #err "party is full";
        party.partyId;
      };
      case null {
        let pid = caller.toText() # "-party-" # Time.now().toText();
        ignore PartyLib.createParty(parties, pid, caller, callerUsername, Time.now());
        // Update caller's partyId in player state
        switch (players.get(caller)) {
          case (?p) players.add(caller, { p with partyId = ?pid });
          case null {};
        };
        pid;
      };
    };
    // Store invite for target
    let invite : PartyTypes.PartyInvite = {
      partyId;
      fromPrincipal = caller.toText();
      fromUsername = callerUsername;
      toPrincipal = targetPrincipal;
      timestamp = Time.now();
    };
    partyInvites.add(targetPrincipal, invite);
    #ok;
  };

  /// Accept a pending party invite.
  /// Guest accounts are rejected.
  public shared ({ caller }) func acceptPartyInvite(acceptingUsername : Text) : async { #ok : PartyTypes.PartyData; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot use party system";
    switch (partyInvites.get(caller)) {
      case null return #err "no pending invite";
      case (?invite) {
        partyInvites.remove(caller);
        if (not PartyLib.joinParty(parties, invite.partyId, caller, acceptingUsername)) {
          return #err "party is full or no longer exists";
        };
        // Update player partyId
        switch (players.get(caller)) {
          case (?p) players.add(caller, { p with partyId = ?invite.partyId });
          case null {};
        };
        switch (PartyLib.getParty(parties, invite.partyId)) {
          case (?party) #ok party;
          case null #err "party not found after join";
        };
      };
    };
  };

  /// Leave the caller's current party.
  public shared ({ caller }) func leaveParty() : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot use party system";
    switch (PartyLib.findPartyOfMember(parties, caller)) {
      case null return #err "not in a party";
      case (?party) {
        PartyLib.leaveParty(parties, party.partyId, caller);
        switch (players.get(caller)) {
          case (?p) players.add(caller, { p with partyId = null });
          case null {};
        };
        #ok;
      };
    };
  };

  /// Get the caller's current party, or null.
  public shared ({ caller }) func getMyParty() : async ?PartyTypes.PartyData {
    if (caller.isAnonymous()) return null;
    PartyLib.findPartyOfMember(parties, caller);
  };

  /// Get pending party invite for the caller.
  public shared ({ caller }) func getPendingPartyInvite() : async ?PartyTypes.PartyInvite {
    if (caller.isAnonymous()) return null;
    partyInvites.get(caller);
  };
};
