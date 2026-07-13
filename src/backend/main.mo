import Map "mo:core/Map";
import Types "types/player";
import SocialTypes "types/social";
import GuildTypes "types/guild";
import PlayerLib "lib/player";
import SocialLib "lib/social";
import GuildLib "lib/guild";
import SkillTreeLib "lib/skill-tree";
import DiscoveryLib "lib/discovery";
import PartyLib "lib/party";
import TradeLib "lib/trade";
import PlayerApi "mixins/player-api";
import ChatLeaderboardApi "mixins/chat-leaderboard-api";
import PvpSessionNicknameApi "mixins/pvp-session-nickname-api";
import SocialApi "mixins/social-api";
import GuildApi "mixins/guild-api";
import SkillDiscoveryApi "mixins/skill-discovery-api";
import PartyApi "mixins/party-api";
import TradeApi "mixins/trade-api";
import ProgressionBountyApi "mixins/progression-bounty-api";
import PartyTypes "types/party";
import TradeTypes "types/trade";





actor {
  let players : PlayerLib.PlayerMap = Map.empty<Principal, Types.PlayerState>();
  /// Lowercased nickname -> owner Principal for global uniqueness enforcement
  let nicknameRegistry : Map.Map<Text, Principal> = Map.empty<Text, Principal>();
  /// Per-player settings — keyed by Principal, null means use frontend defaults
  let settingsMap : PlayerLib.SettingsMap = Map.empty<Principal, Types.PlayerSettings>();

  /// Social: friends list keyed by Principal → [FriendRecord]
  let friendsMap : SocialLib.FriendsMap = Map.empty<Principal, [SocialTypes.FriendRecord]>();
  /// Social: whisper inbox keyed by Principal → [WhisperMessage]
  let whispersMap : SocialLib.WhispersMap = Map.empty<Principal, [SocialTypes.WhisperMessage]>();

  /// Guilds: guildId (Text) → GuildData
  let guildsMap : GuildLib.GuildsMap = Map.empty<Text, GuildTypes.GuildData>();
  /// Guild names index: lowercase name → guildId for uniqueness
  let guildNamesMap : GuildLib.GuildNamesMap = Map.empty<Text, Text>();

  /// Skill trees: Principal → JSON-encoded allocations
  let skillTreesMap : SkillTreeLib.SkillTreeMap = Map.empty<Principal, Text>();

  /// Zone discoveries: Principal → [ZoneId]
  let discoveriesMap : DiscoveryLib.DiscoveryMap = Map.empty<Principal, [Text]>();

  /// Parties: partyId → PartyData
  let partiesMap : PartyLib.PartyMap = Map.empty<Text, PartyTypes.PartyData>();
  /// Party invites: invitee Principal → pending PartyInvite
  let partyInvitesMap : PartyLib.PartyInviteMap = Map.empty<Principal, PartyTypes.PartyInvite>();

  /// Active trades: tradeId → TradeSession
  let tradesMap : TradeLib.TradeMap = Map.empty<Text, TradeTypes.TradeSession>();
  /// Trade logs: Principal → [TradeLogEntry]
  let tradeLogsMap : TradeLib.TradeLogMap = Map.empty<Principal, [TradeTypes.TradeLogEntry]>();

  include PlayerApi(players, settingsMap);
  include ChatLeaderboardApi(players);
  include PvpSessionNicknameApi(players, nicknameRegistry);
  include SocialApi(friendsMap, whispersMap);
  include GuildApi(players, guildsMap, guildNamesMap);
  include SkillDiscoveryApi(skillTreesMap, discoveriesMap);
  include PartyApi(players, partiesMap, partyInvitesMap);
  include TradeApi(players, tradesMap, tradeLogsMap);
  include ProgressionBountyApi(players, guildsMap);
};
