import Common "common";

module {
  public type Timestamp = Common.Timestamp;

  /// One side of a trade offer
  public type TradeOffer = {
    principal : Principal;
    itemIds : [Text];   // inventory item IDs being offered
    goldAmount : Nat;    // gold being offered
    accepted : Bool;
  };

  /// A pending or completed trade
  public type TradeSession = {
    tradeId : Text;
    offerA : TradeOffer;
    offerB : TradeOffer;
    createdAt : Timestamp;
    completedAt : ?Timestamp;
  };

  /// A trade log entry stored per player
  public type TradeLogEntry = {
    tradeId : Text;
    counterpartyUsername : Text;
    offeredItemIds : [Text];
    receivedItemIds : [Text];
    goldChange : Int;   // negative = paid, positive = received
    timestamp : Timestamp;
  };
};
