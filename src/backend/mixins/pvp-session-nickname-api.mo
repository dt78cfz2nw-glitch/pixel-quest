import Map "mo:core/Map";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import PlayerLib "../lib/player";

mixin (players : PlayerLib.PlayerMap, nicknameRegistry : Map.Map<Text, Principal>) {

  // ── Nickname helpers ────────────────────────────────────────────────────────

  /// Returns true if `name` is available to register:
  /// - not already taken in the registry (case-insensitive)
  /// - does not start with "guest" (case-insensitive)
  public query func checkNicknameAvailable(name : Text) : async Bool {
    let lower = name.toLower();
    // Reject "Guest" prefix
    if (lower.startsWith(#text "guest")) { return false };
    // Reject if already taken
    switch (nicknameRegistry.get(lower)) {
      case (?_) { false };
      case null { true };
    };
  };

  /// Attempt to claim `name` for the caller's principal.
  /// Returns true on success or if the caller already owns this name.
  /// Returns false if the name is taken by another principal or has a "guest" prefix.
  public shared ({ caller }) func registerNickname(name : Text) : async Bool {
    let lower = name.toLower();
    // Reject "Guest" prefix
    if (lower.startsWith(#text "guest")) { return false };
    switch (nicknameRegistry.get(lower)) {
      case (?owner) {
        // Idempotent: same caller re-registering their own name is fine
        owner == caller;
      };
      case null {
        nicknameRegistry.add(lower, caller);
        true;
      };
    };
  };

  // ── PVP damage ──────────────────────────────────────────────────────────────

  /// Apply PVP damage from `attackerPrincipal` to `victimPrincipal`.
  /// The attacker must be the transaction caller.
  /// Returns: newHp, died flag, xpLost, goldDropped.
  /// On death: victim loses 25% of current xp (floor), drops 5-15% gold,
  /// and is respawned at their chosen respawn city with full HP/MP.
  public shared ({ caller }) func applyPvpDamage(
    victimPrincipal : Principal,
    damage : Nat,
    attackerPrincipal : Principal,
  ) : async { newHp : Int; died : Bool; xpLost : Nat; goldDropped : Nat } {
    // Caller must be the attacker — prevent spoofing
    if (caller != attackerPrincipal) {
      return { newHp = 0; died = false; xpLost = 0; goldDropped = 0 };
    };

    switch (players.get(victimPrincipal)) {
      case null {
        { newHp = 0; died = false; xpLost = 0; goldDropped = 0 };
      };
      case (?victim) {
        let currentHp : Int = victim.hp.toInt();
        let dmg : Int = damage.toInt();
        let newHpInt : Int = currentHp - dmg;

        if (newHpInt > 0) {
          // Victim survives — just update HP
          let newHpNat : Nat = Int.abs(newHpInt);
          players.add(victimPrincipal, {
            victim with
            hp = newHpNat;
            lastActive = Time.now();
          });
          { newHp = newHpInt; died = false; xpLost = 0; goldDropped = 0 };
        } else {
          // Victim dies
          // XP loss: 25% of current xp, floor, can't go below 0
          let xpLost : Nat = victim.xp / 4;
          let newXp : Nat = if (victim.xp >= xpLost) { victim.xp - xpLost } else { 0 };

          // Gold drop: pseudo-random 5–15% using current time as entropy
          let timeNs : Int = Time.now();
          let timeMod : Nat = Int.abs(timeNs) % 11; // 0..10
          let goldPct : Nat = 5 + timeMod; // 5..15
          let goldDropped : Nat = victim.coins * goldPct / 100;
          let newCoins : Nat = if (victim.coins >= goldDropped) { victim.coins - goldDropped } else { 0 };

          // Respawn: full HP/MP at respawn city spawn coords (8, 24 for meadow; same default)
          players.add(victimPrincipal, {
            victim with
            hp = victim.maxHp;
            mp = victim.maxMp;
            xp = newXp;
            coins = newCoins;
            // Teleport to respawn city entry — frontend handles exact tile via respawnCity field
            x = 8;
            y = 24;
            lastActive = Time.now();
          });

          // Increment pvpKills on the attacker
          switch (players.get(attackerPrincipal)) {
            case null {};
            case (?attacker) {
              players.add(attackerPrincipal, {
                attacker with
                pvpKills = attacker.pvpKills + 1;
                lastActive = Time.now();
              });
            };
          };

          { newHp = 0; died = true; xpLost; goldDropped };
        };
      };
    };
  };

  // ── Gold collection ─────────────────────────────────────────────────────────

  /// Add `amount` gold to the caller's coin balance (for collecting dropped gold).
  /// Returns true on success, false if caller has no player record.
  public shared ({ caller }) func collectDroppedGold(amount : Nat) : async Bool {
    switch (players.get(caller)) {
      case null { false };
      case (?existing) {
        players.add(caller, PlayerLib.saveCoins(existing, existing.coins + amount));
        true;
      };
    };
  };
};
