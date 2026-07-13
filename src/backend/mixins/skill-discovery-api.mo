import DiscoveryLib "../lib/discovery";
import SkillTreeLib "../lib/skill-tree";
import Principal "mo:core/Principal";

mixin (
  skillTrees : SkillTreeLib.SkillTreeMap,
  discoveries : DiscoveryLib.DiscoveryMap,
) {
  /// Save JSON-encoded skill tree allocations for the caller.
  /// Guest accounts are silently ignored.
  public shared ({ caller }) func saveSkillTree(json : Text) : async () {
    if (caller.isAnonymous()) return;
    SkillTreeLib.saveSkillTree(skillTrees, caller, json);
  };

  /// Return the caller's skill tree JSON, or null if never saved.
  /// Guest accounts always return null.
  public shared ({ caller }) func getSkillTree() : async ?Text {
    if (caller.isAnonymous()) return null;
    SkillTreeLib.getSkillTree(skillTrees, caller);
  };

  /// Replace the caller's full list of discovered zone IDs.
  /// Guest accounts are silently ignored.
  public shared ({ caller }) func saveDiscoveredZones(zones : [Text]) : async () {
    if (caller.isAnonymous()) return;
    DiscoveryLib.saveDiscoveredZones(discoveries, caller, zones);
  };

  /// Return all zone IDs the caller has discovered.
  /// Guest accounts always return an empty array.
  public shared ({ caller }) func getDiscoveredZones() : async [Text] {
    if (caller.isAnonymous()) return [];
    DiscoveryLib.getDiscoveredZones(discoveries, caller);
  };
};
