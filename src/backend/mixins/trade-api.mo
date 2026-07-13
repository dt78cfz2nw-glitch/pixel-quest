import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Array "mo:core/Array";
import PlayerLib "../lib/player";
import PlayerTypes "../types/player";
import TradeLib "../lib/trade";
import TradeTypes "../types/trade";

mixin (
  players : PlayerLib.PlayerMap,
  trades : TradeLib.TradeMap,
  tradeLogs : TradeLib.TradeLogMap,
) {
  /// Initiate a trade with another player.
  /// Guest accounts are rejected.
  public shared ({ caller }) func initiateTrade(
    counterpartyPrincipalText : Text,
  ) : async { #ok : TradeTypes.TradeSession; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot trade";
    let counterparty = Principal.fromText(counterpartyPrincipalText);
    if (caller == counterparty) return #err "cannot trade with yourself";
    if (players.get(counterparty) == null) return #err "counterparty not found";
    let tradeId = caller.toText() # "-trade-" # Time.now().toText();
    let session = TradeLib.initiateTrade(trades, tradeId, caller, counterparty, Time.now());
    #ok session;
  };

  /// Update the caller's side of a trade offer.
  public shared ({ caller }) func updateTradeOffer(
    tradeId : Text,
    itemIds : [Text],
    goldAmount : Nat,
  ) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot trade";
    if (TradeLib.updateOffer(trades, tradeId, caller, itemIds, goldAmount)) {
      #ok;
    } else {
      #err "trade not found or caller is not a participant";
    };
  };

  /// Accept the trade. If both parties accept, the trade is recorded in logs.
  /// Actual item/gold transfer is handled by the frontend calling savePlayerState.
  public shared ({ caller }) func acceptTrade(
    tradeId : Text,
  ) : async { #ok : Bool; #err : Text } {
    // #ok(true) = both accepted (complete), #ok(false) = waiting for other party
    if (caller.isAnonymous()) return #err "guests cannot trade";
    switch (TradeLib.acceptTrade(trades, tradeId, caller, Time.now())) {
      case (#bothAccepted session) {
        // Record trade log entries for both participants
        let counterpartyA = session.offerB.principal;
        let counterpartyB = session.offerA.principal;
        let usernameA = switch (players.get(counterpartyA)) {
          case (?p) p.username;
          case null "unknown";
        };
        let usernameB = switch (players.get(counterpartyB)) {
          case (?p) p.username;
          case null "unknown";
        };
        let goldChangeA : Int = session.offerB.goldAmount - session.offerA.goldAmount;
        let goldChangeB : Int = session.offerA.goldAmount - session.offerB.goldAmount;
        let entryA : TradeTypes.TradeLogEntry = {
          tradeId;
          counterpartyUsername = usernameA;
          offeredItemIds = session.offerA.itemIds;
          receivedItemIds = session.offerB.itemIds;
          goldChange = goldChangeA;
          timestamp = Time.now();
        };
        let entryB : TradeTypes.TradeLogEntry = {
          tradeId;
          counterpartyUsername = usernameB;
          offeredItemIds = session.offerB.itemIds;
          receivedItemIds = session.offerA.itemIds;
          goldChange = goldChangeB;
          timestamp = Time.now();
        };
        TradeLib.addTradeLog(tradeLogs, session.offerA.principal, entryA);
        TradeLib.addTradeLog(tradeLogs, session.offerB.principal, entryB);
        TradeLib.cancelTrade(trades, tradeId);
        #ok true;
      };
      case (#oneAccepted) { #ok false };
      case (#notFound) { #err "trade not found" };
      case (#notParticipant) { #err "caller is not a participant" };
    };
  };

  /// Cancel a pending trade.
  public shared ({ caller }) func cancelTrade(tradeId : Text) : async { #ok; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot trade";
    switch (trades.get(tradeId)) {
      case null return #err "trade not found";
      case (?session) {
        if (session.offerA.principal != caller and session.offerB.principal != caller) {
          return #err "caller is not a participant";
        };
        TradeLib.cancelTrade(trades, tradeId);
        #ok;
      };
    };
  };

  /// Get the caller's trade log.
  public shared ({ caller }) func getTradeLog() : async [TradeTypes.TradeLogEntry] {
    if (caller.isAnonymous()) return [];
    TradeLib.getTradeLog(tradeLogs, caller);
  };
};
