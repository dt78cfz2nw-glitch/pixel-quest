// ─── Guild Utility Types & Functions ─────────────────────────────────────────

export type GuildRank = "leader" | "officer" | "member";

export interface GuildInfo {
  guildId: string;
  name: string;
  rank: GuildRank;
  memberCount: number;
}

/** Normalize a raw rank string from the canister into a typed GuildRank. */
export function parseGuildRank(rank: string): GuildRank {
  const r = rank.toLowerCase().trim();
  if (r === "leader") return "leader";
  if (r === "officer") return "officer";
  return "member";
}

/** Returns true if the rank can invite new members (leader or officer). */
export function canInvite(rank: string): boolean {
  const r = parseGuildRank(rank);
  return r === "leader" || r === "officer";
}

/** Returns true if the rank can kick members (leader only). */
export function canKick(rank: string): boolean {
  return parseGuildRank(rank) === "leader";
}

/** Format a bigint timestamp (nanoseconds from canister) to HH:MM string. */
export function formatGuildTimestamp(timestamp: bigint): string {
  try {
    const ms = Number(timestamp / 1_000_000n);
    const d = new Date(ms);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "--:--";
  }
}
