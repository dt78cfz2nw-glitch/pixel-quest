import Map "mo:core/Map";
import Time "mo:core/Time";
import TradeTypes "../types/trade";
import Array "mo:core/Array";

module {
  /// TradeMap: tradeId → TradeSession (active trades)
  public type TradeMap = Map.Map<Text, TradeTypes.TradeSession>;

  /// TradeLogMap: Principal → [TradeLogEntry] (last 20 per player)
  public type TradeLogMap = Map.Map<Principal, [TradeTypes.TradeLogEntry]>;

  public let MAX_LOG_ENTRIES : Nat = 20;

  /// Initiate a trade between two principals
  public func initiateTrade(
    trades : TradeMap,
    tradeId : Text,
    initiator : Principal,
    counterparty : Principal,
    now : Int,
  ) : TradeTypes.TradeSession {
    let session : TradeTypes.TradeSession = {
      tradeId;
      offerA = { principal = initiator; itemIds = []; goldAmount = 0; accepted = false };
      offerB = { principal = counterparty; itemIds = []; goldAmount = 0; accepted = false };
      createdAt = now;
      completedAt = null;
    };
    trades.add(tradeId, session);
    session;
  };

  /// Update one side's offer
  public func updateOffer(
    trades : TradeMap,
    tradeId : Text,
    who : Principal,
    itemIds : [Text],
    goldAmount : Nat,
  ) : Bool {
    switch (trades.get(tradeId)) {
      case null false;
      case (?session) {
        let newSession = if (session.offerA.principal == who) {
          { session with offerA = { principal = who; itemIds; goldAmount; accepted = false } };
        } else if (session.offerB.principal == who) {
          { session with offerB = { principal = who; itemIds; goldAmount; accepted = false } };
        } else {
          return false;
        };
        trades.add(tradeId, newSession);
        true;
      };
    };
  };

  /// Accept trade by one party; returns true if both have now accepted (trade complete)
  public func acceptTrade(
    trades : TradeMap,
    tradeId : Text,
    who : Principal,
    now : Int,
  ) : { #bothAccepted : TradeTypes.TradeSession; #oneAccepted; #notFound; #notParticipant } {
    switch (trades.get(tradeId)) {
      case null #notFound;
      case (?session) {
        let newSession = if (session.offerA.principal == who) {
          { session with offerA = { session.offerA with accepted = true } };
        } else if (session.offerB.principal == who) {
          { session with offerB = { session.offerB with accepted = true } };
        } else {
          return #notParticipant;
        };
        if (newSession.offerA.accepted and newSession.offerB.accepted) {
          let completed = { newSession with completedAt = ?now };
          trades.add(tradeId, completed);
          #bothAccepted completed;
        } else {
          trades.add(tradeId, newSession);
          #oneAccepted;
        };
      };
    };
  };

  /// Cancel and remove a trade
  public func cancelTrade(trades : TradeMap, tradeId : Text) {
    trades.remove(tradeId);
  };

  /// Append a trade log entry for a player (keeps last MAX_LOG_ENTRIES)
  public func addTradeLog(
    tradeLogs : TradeLogMap,
    player : Principal,
    entry : TradeTypes.TradeLogEntry,
  ) {
    let existing = switch (tradeLogs.get(player)) {
      case (?logs) logs;
      case null [];
    };
    let combined = existing.concat([entry]);
    let len = combined.size();
    let trimmed = if (len > MAX_LOG_ENTRIES) {
      combined.sliceToArray(len - MAX_LOG_ENTRIES, len)
    } else { combined };
    tradeLogs.add(player, trimmed);
  };

  /// Get trade log for a player
  public func getTradeLog(tradeLogs : TradeLogMap, player : Principal) : [TradeTypes.TradeLogEntry] {
    switch (tradeLogs.get(player)) {
      case (?logs) logs;
      case null [];
    };
  };
};
