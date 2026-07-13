import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GuildChatMessage,
  GuildData,
  backendInterface,
} from "../backend.d.ts";
import {
  canInvite,
  canKick,
  formatGuildTimestamp,
  parseGuildRank,
} from "../lib/guild";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuildMemberDisplay {
  principalId: string;
  username: string;
  rank: string;
  isOnline: boolean;
  level?: number;
  characterClass?: string;
  lastSeen?: string;
}

interface GuildPanelProps {
  /** Local player coins */
  playerCoins: number;
  /** Local player username */
  username: string;
  /** Player's current guild ID (null = not in guild) */
  guildId?: string | null;
  /** Player's current guild rank */
  guildRank?: string | null;
  /** Backend actor for canister calls */
  actor: backendInterface | null;
  onClose: () => void;
  /** Called when player should teleport to a friend/zone */
  onJoinGuild?: (zone: string) => void;
  onLeaveGuild: (newCoins: number) => void;
  onDisband: () => void;
  /** Whether this is a guest account */
  isGuest?: boolean;
  /** Called after guild creation/leave to update parent state */
  onGuildChanged?: (
    newGuildId: string | null,
    newGuildRank: string | null,
  ) => void;
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type GuildTab = "members" | "chat";
type PanelView = "no_guild" | "in_guild";

// ─── Constants ────────────────────────────────────────────────────────────────

const GUILD_CREATE_COST = 500;
const MAX_MEMBERS = 20;
const RANK_BADGE: Record<string, { label: string; color: string }> = {
  leader: { label: "Leader", color: "#FFD700" },
  officer: { label: "Officer", color: "#67e8f9" },
  member: { label: "Member", color: "#a3a3a3" },
};

// ─── GuildPanel ───────────────────────────────────────────────────────────────

export function GuildPanel({
  playerCoins,
  username,
  guildId,
  guildRank,
  actor,
  onClose,
  onLeaveGuild,
  onDisband,
  isGuest = false,
  onGuildChanged,
}: GuildPanelProps) {
  const [tab, setTab] = useState<GuildTab>("members");
  const [view, setView] = useState<PanelView>(
    guildId ? "in_guild" : "no_guild",
  );

  // No-guild view state
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<GuildData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [joinRequesting, setJoinRequesting] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  // In-guild view state
  const [guildData, setGuildData] = useState<GuildData | null>(null);
  const [members, setMembers] = useState<GuildMemberDisplay[]>([]);
  const [chatMessages, setChatMessages] = useState<GuildChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [loadingGuild, setLoadingGuild] = useState(false);

  // Confirmation states
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [disbandConfirm, setDisbandConfirm] = useState(false);
  const [disbandInput, setDisbandInput] = useState("");
  const [kickConfirmId, setKickConfirmId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myRank = guildRank ? parseGuildRank(guildRank) : "member";
  const isLeader = myRank === "leader";

  // ─── Load guild data ────────────────────────────────────────────────────────

  const loadGuild = useCallback(async () => {
    if (!actor || !guildId) return;
    try {
      const data = await actor.getGuild(guildId);
      if (!data) return;
      setGuildData(data);
      const memberList: GuildMemberDisplay[] = data.members.map(
        ([principal, rank]) => ({
          principalId: principal.toText
            ? principal.toText()
            : String(principal),
          username: `${String(principal).slice(0, 8)}…`,
          rank,
          isOnline: false,
        }),
      );
      setMembers(memberList);
    } catch {
      /* degrade gracefully */
    }
  }, [actor, guildId]);

  const loadChat = useCallback(async () => {
    if (!actor || !guildId) return;
    try {
      const result = await actor.getGuildMessages(guildId);
      if ("ok" in result) {
        setChatMessages([...result.ok]);
        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 50);
      }
    } catch {
      /* degrade gracefully */
    }
  }, [actor, guildId]);

  // Initial load + polling while panel is open
  useEffect(() => {
    if (view !== "in_guild" || !guildId) return;
    setLoadingGuild(true);
    void loadGuild().finally(() => setLoadingGuild(false));
    void loadChat();

    pollIntervalRef.current = setInterval(() => {
      void loadChat();
    }, 10_000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [view, guildId, loadGuild, loadChat]);

  // Scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll trigger only
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  // ─── Create Guild ───────────────────────────────────────────────────────────

  async function handleCreate() {
    const trimmed = createName.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      setCreateError("Name must be 3–20 characters.");
      return;
    }
    if (playerCoins < GUILD_CREATE_COST) {
      setCreateError(`Not enough gold. Need ${GUILD_CREATE_COST} gold.`);
      return;
    }
    if (!actor) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await actor.createGuild(trimmed);
      if ("ok" in result) {
        const newGuild = result.ok;
        await actor.saveGuildMembership(newGuild.guildId, "leader");
        setGuildData(newGuild);
        onGuildChanged?.(newGuild.guildId, "leader");
        setView("in_guild");
      } else if ("err" in result) {
        setCreateError(result.err);
      }
    } catch {
      setCreateError("Failed to create guild. Try again.");
    } finally {
      setCreating(false);
    }
  }

  // ─── Search Guild ───────────────────────────────────────────────────────────

  async function handleSearch() {
    const trimmed = searchName.trim();
    if (!trimmed || !actor) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    setJoinMsg(null);
    try {
      const data = await actor.getGuildByName(trimmed);
      if (data) {
        setSearchResult(data);
      } else {
        setSearchError("No guild found with that name.");
      }
    } catch {
      setSearchError("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  // ─── Join Guild ─────────────────────────────────────────────────────────────

  async function handleJoin() {
    if (!searchResult || !actor) return;
    const memberCount = Number(searchResult.maxMembers ?? MAX_MEMBERS);
    if (searchResult.members.length >= memberCount) {
      setJoinMsg("Guild is full.");
      return;
    }
    setJoinRequesting(true);
    try {
      const newMembers: Array<[{ toText?: () => string }, string]> = [
        ...searchResult.members,
      ];
      // We can't get our own principal easily here; just save membership
      await actor.saveGuildMembership(searchResult.guildId, "member");
      void newMembers;
      setJoinMsg("Join request sent! Guild membership saved.");
      onGuildChanged?.(searchResult.guildId, "member");
      setTimeout(() => {
        setView("in_guild");
      }, 1000);
    } catch {
      setJoinMsg("Failed to join guild.");
    } finally {
      setJoinRequesting(false);
    }
  }

  // ─── Send Chat ──────────────────────────────────────────────────────────────

  async function handleSendChat() {
    const text = chatInput.replace(/^\/g\s*/i, "").trim();
    if (!text || !actor || !guildId) return;
    setSendingChat(true);
    try {
      await actor.sendGuildChat(guildId, username, text);
      setChatInput("");
      await loadChat();
    } catch {
      /* degrade gracefully */
    } finally {
      setSendingChat(false);
    }
  }

  // ─── Kick Member ────────────────────────────────────────────────────────────

  async function handleKick(principalId: string) {
    if (!actor || !guildId || !guildData) return;
    try {
      const newMembers = guildData.members.filter(
        ([p]) => (p.toText ? p.toText() : String(p)) !== principalId,
      );
      await actor.updateGuildMembers(guildId, newMembers);
      setMembers((prev) => prev.filter((m) => m.principalId !== principalId));
      setGuildData((prev) => (prev ? { ...prev, members: newMembers } : prev));
      setKickConfirmId(null);
    } catch {
      /* degrade gracefully */
    }
  }

  // ─── Promote to Officer ─────────────────────────────────────────────────────

  async function handlePromote(principalId: string) {
    if (!actor || !guildId || !guildData) return;
    try {
      const newMembers = guildData.members.map(([p, r]) => {
        const pid = p.toText ? p.toText() : String(p);
        return pid === principalId
          ? ([p, "officer"] as [typeof p, string])
          : ([p, r] as [typeof p, string]);
      });
      await actor.updateGuildMembers(guildId, newMembers);
      setMembers((prev) =>
        prev.map((m) =>
          m.principalId === principalId ? { ...m, rank: "officer" } : m,
        ),
      );
    } catch {
      /* degrade gracefully */
    }
  }

  // ─── Leave Guild ────────────────────────────────────────────────────────────

  async function handleLeave() {
    if (!actor || !guildId) return;
    try {
      await actor.saveGuildMembership(null, null);
      onGuildChanged?.(null, null);
      onLeaveGuild(playerCoins);
      onClose();
    } catch {
      /* degrade gracefully */
      onClose();
    }
  }

  // ─── Disband Guild ──────────────────────────────────────────────────────────

  async function handleDisband() {
    if (!actor || !guildId || !guildData) return;
    if (disbandInput.trim() !== guildData.name) return;
    try {
      await actor.removeGuild(guildId);
      await actor.saveGuildMembership(null, null);
      onGuildChanged?.(null, null);
      onDisband();
      onClose();
    } catch {
      /* degrade gracefully */
      onClose();
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 60, background: "rgba(0,0,0,0.78)" }}
      data-ocid="guild-panel"
    >
      <div
        style={{
          width: "min(96vw, 400px)",
          maxHeight: "90vh",
          background: "rgba(14,10,28,0.97)",
          border: "1.5px solid rgba(103,232,249,0.3)",
          borderRadius: 10,
          boxShadow:
            "0 8px 40px rgba(0,0,0,0.8), 0 0 20px rgba(103,232,249,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "rgba(103,232,249,0.08)",
            borderBottom: "1px solid rgba(103,232,249,0.2)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚔</span>
            <span
              style={{
                color: "#67e8f9",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.06em",
              }}
            >
              GUILD
            </span>
            {guildData && (
              <span style={{ color: "#e0e0e0", fontSize: 13 }}>
                — {guildData.name}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guild panel"
            data-ocid="guild-panel.close_button"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              color: "#aaa",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
              minWidth: 48,
              minHeight: 32,
            }}
          >
            ✕
          </button>
        </div>

        {/* Guest lock */}
        {isGuest ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              gap: 12,
            }}
            data-ocid="guild-panel.empty_state"
          >
            <span style={{ fontSize: 32 }}>🔒</span>
            <p
              style={{
                color: "#a3a3a3",
                textAlign: "center",
                fontSize: 13,
                margin: 0,
              }}
            >
              Create an account to join guilds.
            </p>
            <p
              style={{
                color: "#666",
                textAlign: "center",
                fontSize: 11,
                margin: 0,
              }}
            >
              Guest accounts cannot use the guild system.
            </p>
          </div>
        ) : view === "no_guild" ? (
          <NoGuildView
            playerCoins={playerCoins}
            createName={createName}
            onCreateNameChange={setCreateName}
            createError={createError}
            creating={creating}
            onCreate={handleCreate}
            searchName={searchName}
            onSearchNameChange={setSearchName}
            searching={searching}
            onSearch={handleSearch}
            searchResult={searchResult}
            searchError={searchError}
            joinRequesting={joinRequesting}
            joinMsg={joinMsg}
            onJoin={handleJoin}
          />
        ) : (
          <InGuildView
            guildData={guildData}
            members={members}
            chatMessages={chatMessages}
            chatInput={chatInput}
            onChatInputChange={setChatInput}
            sendingChat={sendingChat}
            onSendChat={handleSendChat}
            tab={tab}
            onTabChange={setTab}
            myUsername={username}
            myRank={myRank}
            isLeader={isLeader}
            loadingGuild={loadingGuild}
            leaveConfirm={leaveConfirm}
            onLeaveConfirmChange={setLeaveConfirm}
            onLeave={handleLeave}
            disbandConfirm={disbandConfirm}
            onDisbandConfirmChange={setDisbandConfirm}
            disbandInput={disbandInput}
            onDisbandInputChange={setDisbandInput}
            onDisband={handleDisband}
            kickConfirmId={kickConfirmId}
            onKickConfirmChange={setKickConfirmId}
            onKick={handleKick}
            onPromote={handlePromote}
            chatEndRef={chatEndRef}
          />
        )}
      </div>
    </div>
  );
}

// ─── No Guild View ────────────────────────────────────────────────────────────

interface NoGuildViewProps {
  playerCoins: number;
  createName: string;
  onCreateNameChange: (v: string) => void;
  createError: string | null;
  creating: boolean;
  onCreate: () => void;
  searchName: string;
  onSearchNameChange: (v: string) => void;
  searching: boolean;
  onSearch: () => void;
  searchResult: GuildData | null;
  searchError: string | null;
  joinRequesting: boolean;
  joinMsg: string | null;
  onJoin: () => void;
}

function NoGuildView({
  playerCoins,
  createName,
  onCreateNameChange,
  createError,
  creating,
  onCreate,
  searchName,
  onSearchNameChange,
  searching,
  onSearch,
  searchResult,
  searchError,
  joinRequesting,
  joinMsg,
  onJoin,
}: NoGuildViewProps) {
  const canCreate = playerCoins >= GUILD_CREATE_COST;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Create Guild */}
      <section>
        <div
          style={{
            color: "#67e8f9",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          CREATE GUILD
        </div>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 12 }}>
          Cost: <span style={{ color: "#FFD700" }}>500 🪙 gold</span> — you have{" "}
          <span style={{ color: canCreate ? "#4ade80" : "#f87171" }}>
            {playerCoins}
          </span>{" "}
          gold
        </div>
        <input
          type="text"
          placeholder="Guild name (3–20 characters)"
          value={createName}
          onChange={(e) => onCreateNameChange(e.target.value)}
          maxLength={20}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          data-ocid="guild-panel.create_name_input"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(103,232,249,0.25)",
            borderRadius: 6,
            color: "#e0e0e0",
            padding: "10px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            boxSizing: "border-box",
            outline: "none",
            marginBottom: 8,
          }}
        />
        {createError && (
          <div
            style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}
            data-ocid="guild-panel.create_error"
          >
            {createError}
          </div>
        )}
        <button
          type="button"
          onClick={onCreate}
          disabled={creating || !canCreate || createName.trim().length < 3}
          data-ocid="guild-panel.create_guild_button"
          style={{
            width: "100%",
            padding: "12px 0",
            background: canCreate
              ? "rgba(103,232,249,0.15)"
              : "rgba(255,255,255,0.04)",
            border: `1.5px solid ${canCreate ? "rgba(103,232,249,0.5)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 7,
            color: canCreate ? "#67e8f9" : "#555",
            cursor: canCreate ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.06em",
            minHeight: 48,
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? "Creating…" : "⚔ Create Guild (500 Gold)"}
        </button>
      </section>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />

      {/* Search Guild */}
      <section>
        <div
          style={{
            color: "#67e8f9",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          JOIN A GUILD
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Search guild name…"
            value={searchName}
            onChange={(e) => onSearchNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            data-ocid="guild-panel.search_input"
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(103,232,249,0.2)",
              borderRadius: 6,
              color: "#e0e0e0",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
              minHeight: 48,
            }}
          />
          <button
            type="button"
            onClick={onSearch}
            disabled={searching || !searchName.trim()}
            data-ocid="guild-panel.search_button"
            style={{
              padding: "0 16px",
              background: "rgba(103,232,249,0.12)",
              border: "1px solid rgba(103,232,249,0.3)",
              borderRadius: 6,
              color: "#67e8f9",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              minWidth: 64,
              minHeight: 48,
            }}
          >
            {searching ? "…" : "Search"}
          </button>
        </div>

        {searchError && (
          <div
            style={{ color: "#f87171", fontSize: 11, marginTop: 8 }}
            data-ocid="guild-panel.search_error"
          >
            {searchError}
          </div>
        )}

        {searchResult && (
          <div
            style={{
              marginTop: 12,
              background: "rgba(103,232,249,0.05)",
              border: "1px solid rgba(103,232,249,0.2)",
              borderRadius: 8,
              padding: 14,
            }}
            data-ocid="guild-panel.search_result"
          >
            <div
              style={{
                color: "#67e8f9",
                fontWeight: 700,
                fontSize: 14,
                marginBottom: 4,
              }}
            >
              {searchResult.name}
            </div>
            <div style={{ color: "#a3a3a3", fontSize: 11, marginBottom: 10 }}>
              Members: {searchResult.members.length}/
              {Number(searchResult.maxMembers ?? MAX_MEMBERS)}
            </div>
            {joinMsg ? (
              <div
                style={{ color: "#4ade80", fontSize: 12 }}
                data-ocid="guild-panel.join_success"
              >
                {joinMsg}
              </div>
            ) : (
              <button
                type="button"
                onClick={onJoin}
                disabled={joinRequesting}
                data-ocid="guild-panel.join_button"
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: "rgba(74,222,128,0.15)",
                  border: "1px solid rgba(74,222,128,0.4)",
                  borderRadius: 6,
                  color: "#4ade80",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  minHeight: 48,
                }}
              >
                {joinRequesting ? "Joining…" : "Join Guild"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── In Guild View ────────────────────────────────────────────────────────────

interface InGuildViewProps {
  guildData: GuildData | null;
  members: GuildMemberDisplay[];
  chatMessages: GuildChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  sendingChat: boolean;
  onSendChat: () => void;
  tab: GuildTab;
  onTabChange: (t: GuildTab) => void;
  myUsername: string;
  myRank: string;
  isLeader: boolean;
  loadingGuild: boolean;
  leaveConfirm: boolean;
  onLeaveConfirmChange: (v: boolean) => void;
  onLeave: () => void;
  disbandConfirm: boolean;
  onDisbandConfirmChange: (v: boolean) => void;
  disbandInput: string;
  onDisbandInputChange: (v: string) => void;
  onDisband: () => void;
  kickConfirmId: string | null;
  onKickConfirmChange: (id: string | null) => void;
  onKick: (principalId: string) => void;
  onPromote: (principalId: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

function InGuildView({
  guildData,
  members,
  chatMessages,
  chatInput,
  onChatInputChange,
  sendingChat,
  onSendChat,
  tab,
  onTabChange,
  myUsername,
  myRank,
  isLeader,
  loadingGuild,
  leaveConfirm,
  onLeaveConfirmChange,
  onLeave,
  disbandConfirm,
  onDisbandConfirmChange,
  disbandInput,
  onDisbandInputChange,
  onDisband,
  kickConfirmId,
  onKickConfirmChange,
  onKick,
  onPromote,
  chatEndRef,
}: InGuildViewProps) {
  const myRankBadge = RANK_BADGE[myRank] ?? RANK_BADGE.member;
  const memberCount = guildData?.members.length ?? members.length;
  const maxMembers = Number(guildData?.maxMembers ?? MAX_MEMBERS);
  const disbandNameMatch = disbandInput.trim() === (guildData?.name ?? "");

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Guild name + rank row */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <span
            style={{ color: "#67e8f9", fontWeight: 700, fontSize: 15 }}
            data-ocid="guild-panel.guild_name"
          >
            [{guildData?.name ?? "…"}]
          </span>
          {isLeader && (
            <span
              style={{
                marginLeft: 8,
                background: "rgba(255,215,0,0.15)",
                border: "1px solid rgba(255,215,0,0.4)",
                borderRadius: 4,
                color: "#FFD700",
                fontSize: 9,
                padding: "1px 6px",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              LEADER
            </span>
          )}
        </div>
        <div style={{ color: "#888", fontSize: 11 }}>
          {memberCount}/{maxMembers}{" "}
          <span style={{ color: myRankBadge.color, fontWeight: 700 }}>
            [{myRankBadge.label}]
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        {(["members", "chat"] as GuildTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            data-ocid={`guild-panel.${t}_tab`}
            style={{
              flex: 1,
              padding: "10px 0",
              background: tab === t ? "rgba(103,232,249,0.1)" : "transparent",
              border: "none",
              borderBottom:
                tab === t ? "2px solid #67e8f9" : "2px solid transparent",
              color: tab === t ? "#67e8f9" : "#666",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              minHeight: 44,
            }}
          >
            {t === "members" ? `👥 Members (${memberCount})` : "💬 Chat"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {tab === "members" ? (
          <MembersTab
            members={members}
            myUsername={myUsername}
            isLeader={isLeader}
            canInviteOrKick={canKick(myRank)}
            canPromote={isLeader}
            loadingGuild={loadingGuild}
            kickConfirmId={kickConfirmId}
            onKickConfirmChange={onKickConfirmChange}
            onKick={onKick}
            onPromote={onPromote}
          />
        ) : (
          <ChatTab
            chatMessages={chatMessages}
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            sendingChat={sendingChat}
            onSendChat={onSendChat}
            chatEndRef={chatEndRef}
          />
        )}
      </div>

      {/* Bottom actions */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "10px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Leave Guild */}
        {!leaveConfirm ? (
          <button
            type="button"
            onClick={() => onLeaveConfirmChange(true)}
            data-ocid="guild-panel.leave_button"
            style={{
              width: "100%",
              padding: "10px 0",
              background: "rgba(251,146,60,0.1)",
              border: "1px solid rgba(251,146,60,0.35)",
              borderRadius: 6,
              color: "#fb923c",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              minHeight: 44,
            }}
          >
            Leave Guild
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onLeave}
              data-ocid="guild-panel.leave_confirm_button"
              style={{
                flex: 1,
                padding: "10px 0",
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.5)",
                borderRadius: 6,
                color: "#ef4444",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                minHeight: 44,
              }}
            >
              Confirm Leave
            </button>
            <button
              type="button"
              onClick={() => onLeaveConfirmChange(false)}
              data-ocid="guild-panel.leave_cancel_button"
              style={{
                flex: 1,
                padding: "10px 0",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                color: "#aaa",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                minHeight: 44,
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Disband Guild (leader only) */}
        {isLeader && !disbandConfirm && (
          <button
            type="button"
            onClick={() => onDisbandConfirmChange(true)}
            data-ocid="guild-panel.disband_button"
            style={{
              width: "100%",
              padding: "8px 0",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 6,
              color: "#ef4444",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              minHeight: 40,
            }}
          >
            Disband Guild
          </button>
        )}

        {isLeader && disbandConfirm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{ color: "#f87171", fontSize: 11, textAlign: "center" }}
            >
              Type guild name to confirm disband:
            </div>
            <input
              type="text"
              placeholder={guildData?.name ?? ""}
              value={disbandInput}
              onChange={(e) => onDisbandInputChange(e.target.value)}
              data-ocid="guild-panel.disband_input"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: 6,
                color: "#e0e0e0",
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                minHeight: 40,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onDisband}
                disabled={!disbandNameMatch}
                data-ocid="guild-panel.disband_confirm_button"
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: disbandNameMatch
                    ? "rgba(239,68,68,0.2)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${disbandNameMatch ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 6,
                  color: disbandNameMatch ? "#ef4444" : "#555",
                  cursor: disbandNameMatch ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 700,
                  minHeight: 40,
                }}
              >
                Disband
              </button>
              <button
                type="button"
                onClick={() => {
                  onDisbandConfirmChange(false);
                  onDisbandInputChange("");
                }}
                data-ocid="guild-panel.disband_cancel_button"
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "#aaa",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11,
                  minHeight: 40,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

interface MembersTabProps {
  members: GuildMemberDisplay[];
  myUsername: string;
  isLeader: boolean;
  canInviteOrKick: boolean;
  canPromote: boolean;
  loadingGuild: boolean;
  kickConfirmId: string | null;
  onKickConfirmChange: (id: string | null) => void;
  onKick: (principalId: string) => void;
  onPromote: (principalId: string) => void;
}

function MembersTab({
  members,
  myUsername,
  isLeader,
  canInviteOrKick,
  canPromote,
  loadingGuild,
  kickConfirmId,
  onKickConfirmChange,
  onKick,
  onPromote,
}: MembersTabProps) {
  if (loadingGuild) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        data-ocid="guild-panel.members.loading_state"
      >
        <span style={{ color: "#67e8f9", fontSize: 12 }}>Loading members…</span>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        data-ocid="guild-panel.members.empty_state"
      >
        <span style={{ color: "#555", fontSize: 12 }}>No members found.</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
      {members.map((member, idx) => {
        const rankBadge =
          RANK_BADGE[parseGuildRank(member.rank)] ?? RANK_BADGE.member;
        const isMe = member.username.startsWith(myUsername.slice(0, 6));
        return (
          <div
            key={member.principalId}
            data-ocid={`guild-panel.members.item.${idx + 1}`}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {/* Online dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: member.isOnline ? "#4ade80" : "#555",
                boxShadow: member.isOnline ? "0 0 4px #4ade80" : "none",
                flexShrink: 0,
              }}
              title={member.isOnline ? "Online" : "Offline"}
            />

            {/* Name + rank */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: isMe ? "#67e8f9" : "#e0e0e0",
                  fontWeight: isMe ? 700 : 400,
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {member.principalId.slice(0, 10)}…
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginTop: 2,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    color: rankBadge.color,
                    fontSize: 9,
                    border: `1px solid ${rankBadge.color}44`,
                    borderRadius: 3,
                    padding: "0 5px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  {rankBadge.label}
                </span>
                {member.level !== undefined && (
                  <span style={{ color: "#888", fontSize: 9 }}>
                    Lv.{member.level}
                  </span>
                )}
                {member.characterClass && (
                  <span style={{ color: "#888", fontSize: 9 }}>
                    {member.characterClass}
                  </span>
                )}
              </div>
            </div>

            {/* Leader actions */}
            {(canInviteOrKick || canPromote) && !isMe && (
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {canPromote && parseGuildRank(member.rank) === "member" && (
                  <button
                    type="button"
                    onClick={() => onPromote(member.principalId)}
                    aria-label={`Promote ${member.principalId}`}
                    data-ocid={`guild-panel.promote_button.${idx + 1}`}
                    style={{
                      padding: "4px 8px",
                      background: "rgba(103,232,249,0.1)",
                      border: "1px solid rgba(103,232,249,0.3)",
                      borderRadius: 4,
                      color: "#67e8f9",
                      cursor: "pointer",
                      fontSize: 10,
                      fontFamily: "inherit",
                      minWidth: 44,
                      minHeight: 32,
                    }}
                    title="Promote to Officer"
                  >
                    ↑
                  </button>
                )}
                {isLeader &&
                  (kickConfirmId === member.principalId ? (
                    <div style={{ display: "flex", gap: 3 }}>
                      <button
                        type="button"
                        onClick={() => onKick(member.principalId)}
                        data-ocid={`guild-panel.kick_confirm_button.${idx + 1}`}
                        style={{
                          padding: "4px 6px",
                          background: "rgba(239,68,68,0.2)",
                          border: "1px solid rgba(239,68,68,0.5)",
                          borderRadius: 4,
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: 10,
                          fontFamily: "inherit",
                          minWidth: 32,
                          minHeight: 32,
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => onKickConfirmChange(null)}
                        data-ocid={`guild-panel.kick_cancel_button.${idx + 1}`}
                        style={{
                          padding: "4px 6px",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 4,
                          color: "#888",
                          cursor: "pointer",
                          fontSize: 10,
                          fontFamily: "inherit",
                          minWidth: 32,
                          minHeight: 32,
                        }}
                      >
                        ✗
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onKickConfirmChange(member.principalId)}
                      aria-label={`Kick ${member.principalId}`}
                      data-ocid={`guild-panel.kick_button.${idx + 1}`}
                      style={{
                        padding: "4px 8px",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: 4,
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: 10,
                        fontFamily: "inherit",
                        minWidth: 44,
                        minHeight: 32,
                      }}
                    >
                      Kick
                    </button>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

interface ChatTabProps {
  chatMessages: GuildChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  sendingChat: boolean;
  onSendChat: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

function ChatTab({
  chatMessages,
  chatInput,
  onChatInputChange,
  sendingChat,
  onSendChat,
  chatEndRef,
}: ChatTabProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Message list */}
      <div
        style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}
        data-ocid="guild-panel.chat_messages"
      >
        {chatMessages.length === 0 ? (
          <div
            style={{
              color: "#555",
              fontSize: 12,
              textAlign: "center",
              marginTop: 24,
            }}
            data-ocid="guild-panel.chat.empty_state"
          >
            No messages yet. Say hello!
          </div>
        ) : (
          chatMessages.map((msg, idx) => (
            <div
              key={`${msg.senderPrincipal}-${String(msg.timestamp)}-${idx}`}
              data-ocid={`guild-panel.chat.item.${idx + 1}`}
              style={{
                marginBottom: 8,
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: "#555" }}>
                [{formatGuildTimestamp(msg.timestamp)}]{" "}
              </span>
              <span style={{ color: "#67e8f9", fontWeight: 700 }}>
                {msg.senderUsername}
              </span>
              <span style={{ color: "#888" }}>: </span>
              <span style={{ color: "#c0e8f0" }}>{msg.text}</span>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          type="text"
          placeholder="Guild message… (/g prefix auto-stripped)"
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sendingChat && onSendChat()}
          maxLength={200}
          data-ocid="guild-panel.chat_input"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(103,232,249,0.2)",
            borderRadius: 6,
            color: "#e0e0e0",
            padding: "10px 12px",
            fontSize: 12,
            fontFamily: "inherit",
            outline: "none",
            minHeight: 44,
          }}
        />
        <button
          type="button"
          onClick={onSendChat}
          disabled={sendingChat || !chatInput.replace(/^\/g\s*/i, "").trim()}
          data-ocid="guild-panel.chat_send_button"
          style={{
            padding: "0 14px",
            background: "rgba(103,232,249,0.12)",
            border: "1px solid rgba(103,232,249,0.3)",
            borderRadius: 6,
            color: "#67e8f9",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            minWidth: 56,
            minHeight: 44,
          }}
        >
          {sendingChat ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
