import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Int "mo:core/Int";
import PlayerLib "../lib/player";
import PlayerTypes "../types/player";
import GuildLib "../lib/guild";
import GuildTypes "../types/guild";
import Array "mo:core/Array";
import Order "mo:core/Order";

mixin (
  players : PlayerLib.PlayerMap,
  guilds : GuildLib.GuildsMap,
) {
  let SECONDS_PER_DAY : Int = 86_400;
  /// Claim daily login bonus (25 gold on first login per day).
  /// Guest accounts are rejected.
  public shared ({ caller }) func claimDailyBonus() : async { #ok : Nat; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot claim daily bonus";
    switch (players.get(caller)) {
      case null return #err "player not found";
      case (?player) {
        let nowSecs : Int = Time.now() / 1_000_000_000;
        let lastBonus = switch (player.lastDailyBonus) {
          case (?ts) ts;
          case null 0;
        };
        if (nowSecs - lastBonus < SECONDS_PER_DAY) {
          return #err "already claimed today";
        };
        let bonus : Nat = 25;
        players.add(caller, {
          player with
          coins = player.coins + bonus;
          lastDailyBonus = ?(nowSecs);
        });
        #ok bonus;
      };
    };
  };

  /// Record a crafted item for achievement tracking.
  /// Guest accounts are rejected.
  public shared ({ caller }) func recordCraftedItem(itemId : Text) : async () {
    if (caller.isAnonymous()) return;
    switch (players.get(caller)) {
      case null {};
      case (?player) {
        let existing = switch (player.craftedItems) {
          case (?items) items;
          case null [];
        };
        players.add(caller, { player with craftedItems = ?(existing.concat([itemId])) });
      };
    };
  };

  /// Grant an achievement to a player.
  /// Guest accounts are silently ignored.
  /// Duplicate achievements are not added.
  public shared ({ caller }) func grantAchievement(achievementId : Text) : async () {
    if (caller.isAnonymous()) return;
    switch (players.get(caller)) {
      case null {};
      case (?player) {
        if (player.achievements.find(func(a : Text) : Bool { a == achievementId }) != null) return;
        players.add(caller, { player with achievements = player.achievements.concat([achievementId]) });
      };
    };
  };

  /// Grant a title to a player.
  /// Guest accounts are silently ignored.
  public shared ({ caller }) func grantTitle(titleId : Text) : async () {
    if (caller.isAnonymous()) return;
    switch (players.get(caller)) {
      case null {};
      case (?player) {
        let existing = switch (player.playerTitles) {
          case (?titles) titles;
          case null [];
        };
        if (existing.find(func(t : Text) : Bool { t == titleId }) != null) return;
        players.add(caller, { player with playerTitles = ?(existing.concat([titleId])) });
      };
    };
  };

  /// Record a PVP kill for bounty tracking.
  /// Updates pvpKillsSession, isWanted flag, and bountyAmount.
  /// Guest accounts are silently ignored.
  public shared ({ caller }) func recordPvpKill() : async { #becameWanted : Nat; #addedBounty : Nat; #ok } {
    if (caller.isAnonymous()) return #ok;
    switch (players.get(caller)) {
      case null #ok;
      case (?player) {
        let sessionKills = (switch (player.pvpKillsSession) { case (?n) n; case null 0 }) + 1;
        let bounty : Nat = if (sessionKills > 2) (sessionKills - 2) * 50 else 0;
        let wasWanted = switch (player.isWanted) { case (?b) b; case null false };
        players.add(caller, {
          player with
          pvpKillsSession = ?sessionKills;
          isWanted = ?(sessionKills >= 3);
          bountyAmount = ?bounty;
          pvpKills = player.pvpKills + 1;
        });
        if (sessionKills == 3 and not wasWanted) {
          #becameWanted bounty;
        } else if (sessionKills > 3) {
          #addedBounty bounty;
        } else {
          #ok;
        };
      };
    };
  };

  /// Collect a bounty on a wanted player when they are killed.
  /// Transfers bounty gold to the collector (caller).
  /// Guest accounts are rejected.
  public shared ({ caller }) func collectBounty(wantedPrincipalText : Text) : async { #ok : Nat; #err : Text } {
    if (caller.isAnonymous()) return #err "guests cannot collect bounties";
    let wantedPrincipal = Principal.fromText(wantedPrincipalText);
    switch (players.get(wantedPrincipal)) {
      case null return #err "wanted player not found";
      case (?wanted) {
        let isWanted = switch (wanted.isWanted) { case (?b) b; case null false };
        if (not isWanted) return #err "player is not wanted";
        let bounty = switch (wanted.bountyAmount) { case (?n) n; case null 0 };
        // Reset bounty on wanted player
        players.add(wantedPrincipal, {
          wanted with
          isWanted = ?false;
          bountyAmount = ?0;
          pvpKillsSession = ?0;
        });
        // Award gold to collector
        switch (players.get(caller)) {
          case (?collector) {
            players.add(caller, { collector with coins = collector.coins + bounty });
          };
          case null {};
        };
        #ok bounty;
      };
    };
  };

  /// Reset bounty when a wanted player enters a safe zone.
  public shared ({ caller }) func resetBountyOnSafeZone() : async () {
    if (caller.isAnonymous()) return;
    switch (players.get(caller)) {
      case null {};
      case (?player) {
        players.add(caller, {
          player with
          isWanted = ?false;
          bountyAmount = ?0;
          pvpKillsSession = ?0;
        });
      };
    };
  };

  /// Get the guild leaderboard: top 10 guilds by combined member levels and kills.
  public query func getGuildLeaderboard() : async [GuildTypes.GuildLeaderboardEntry] {
    var entries : [GuildTypes.GuildLeaderboardEntry] = [];
    for ((_, guild) in guilds.entries()) {
      var totalLevels : Nat = 0;
      var totalKills : Nat = 0;
      for ((memberPrincipal, _) in guild.members.values()) {
        switch (players.get(memberPrincipal)) {
          case (?p) {
            totalLevels += p.level;
            totalKills += p.monsterKills + p.pvpKills;
          };
          case null {};
        };
      };
      let entry : GuildTypes.GuildLeaderboardEntry = {
        guildId = guild.guildId;
        name = guild.name;
        memberCount = guild.members.size();
        totalMemberLevels = totalLevels;
        totalKills;
      };
      entries := entries.concat([entry]);
    };
    // Sort by totalMemberLevels descending, take top 10
    let sorted = entries.sort(func(a : GuildTypes.GuildLeaderboardEntry, b : GuildTypes.GuildLeaderboardEntry) : Order.Order {
      if (a.totalMemberLevels > b.totalMemberLevels) #less
      else if (a.totalMemberLevels < b.totalMemberLevels) #greater
      else #equal
    });
    let len = sorted.size();
    if (len > 10) sorted.sliceToArray(0, 10) else sorted;
  };
};
