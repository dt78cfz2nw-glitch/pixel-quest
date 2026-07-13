import Map "mo:core/Map";

module {
  /// DiscoveryMap: Principal → array of discovered zone ID strings
  public type DiscoveryMap = Map.Map<Principal, [Text]>;

  /// Save the full discovered zones list for a player (replaces existing)
  public func saveDiscoveredZones(discoveries : DiscoveryMap, owner : Principal, zones : [Text]) {
    discoveries.add(owner, zones);
  };

  /// Get all discovered zone IDs for a player; returns empty array if none
  public func getDiscoveredZones(discoveries : DiscoveryMap, owner : Principal) : [Text] {
    switch (discoveries.get(owner)) {
      case (?zones) zones;
      case null [];
    };
  };
};
