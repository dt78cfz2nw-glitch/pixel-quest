import Map "mo:core/Map";

module {
  /// SkillTreeMap: Principal → JSON-encoded skill allocation text
  public type SkillTreeMap = Map.Map<Principal, Text>;

  /// Save skill tree allocation JSON for a player
  public func saveSkillTree(skillTrees : SkillTreeMap, owner : Principal, json : Text) {
    skillTrees.add(owner, json);
  };

  /// Get skill tree allocation JSON for a player; returns null if never saved
  public func getSkillTree(skillTrees : SkillTreeMap, owner : Principal) : ?Text {
    skillTrees.get(owner);
  };
};
