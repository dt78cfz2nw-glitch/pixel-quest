import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "../backend";
import type { FriendRecord } from "../backend.d";
import { FriendStatus } from "../backend.d";

// ─── PVP Zones ────────────────────────────────────────────────────────────────

const PVP_ZONES = new Set([
  "boss_chamber",
  "cursed_swamp",
  "floating_ruins",
  "pirate_island",
  "cursed_galleon",
  "dark_forest",
  "ancient_ruins_deep",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnline(lastActive: number): boolean {
  return Date.now() - lastActive < 5 * 60 * 1000;
}

function classIcon(cls: string): string {
  return cls === "mage" ? "🔮" : "⚔";
}

function formatZoneName(zone: string): string {
  return zone
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Extended friend record (with online / zone info from OtherPlayer) ────────

export interface FriendListEntry extends FriendRecord {
  online: boolean;
  zone: string;
  level: number;
  class: string;
  /** ms timestamp — used to derive online status */
  lastActive?: number;
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenu {
  username: string;
  zone: string;
  online: boolean;
  anchorY: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FriendListPanelProps {
  isGuest: boolean;
  /** Current zone of the local player (to check PVP restriction) */
  currentZone?: string;
  /** Map of online players to determine friend status */
  onlinePlayers: Array<{
    username: string;
    zone: string;
    level: number;
    class: string;
    lastActive?: number;
  }>;
  onWhisper: (username: string) => void;
  onJoinFriend: (zone: string) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FriendListPanel({
  isGuest,
  onlinePlayers,
  onWhisper,
  onJoinFriend,
  onClose,
}: FriendListPanelProps) {
  const { actor } = useActor(createActor);
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Load friends list on mount ──────────────────────────────────────────────

  const loadFriends = useCallback(async () => {
    if (!actor || isGuest) return;
    try {
      const raw = await actor.getFriendsList();
      const onlineMap = new Map(onlinePlayers.map((p) => [p.username, p]));
      const enriched: FriendListEntry[] = raw.map((r) => {
        const op = onlineMap.get(r.username);
        const lastActive = op?.lastActive ?? 0;
        return {
          ...r,
          online: op ? isOnline(lastActive) : false,
          zone: op?.zone ?? "Unknown",
          level: op?.level ?? 1,
          class: op?.class ?? "warrior",
          lastActive,
        };
      });
      // Sort: pending first, then online, then offline
      enriched.sort((a, b) => {
        const aStatus =
          a.status === FriendStatus.pending ? 0 : a.online ? 1 : 2;
        const bStatus =
          b.status === FriendStatus.pending ? 0 : b.online ? 1 : 2;
        return aStatus - bStatus;
      });
      setFriends(enriched);
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false);
    }
  }, [actor, isGuest, onlinePlayers]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  // ── Dismiss context menu on outside click ──────────────────────────────────

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("pointerdown", handler, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", handler, { capture: true });
  }, [contextMenu]);

  // ── Add friend ──────────────────────────────────────────────────────────────

  const handleAddFriend = useCallback(async () => {
    if (!actor || !addName.trim()) return;
    const name = addName.trim();
    setAddError(null);

    // Check max friends
    const accepted = friends.filter((f) => f.status === FriendStatus.accepted);
    if (accepted.length >= 20) {
      setAddError("Friend list full (max 20)");
      return;
    }

    // Already in list
    if (friends.some((f) => f.username.toLowerCase() === name.toLowerCase())) {
      setAddError("Already in your friend list");
      return;
    }

    setAddLoading(true);
    try {
      // Look up player by username
      const allChars = await actor.getAllCharacters();
      const found = allChars.find(
        (c) => c.username.toLowerCase() === name.toLowerCase(),
      );
      if (!found) {
        setAddError("Player not found");
        setAddLoading(false);
        return;
      }

      const newRecord: FriendRecord = {
        username: found.username,
        principalId: found.username, // principalId stored as username key
        status: FriendStatus.pending,
      };
      const updated = [
        ...friends,
        {
          ...newRecord,
          online: false,
          zone: "Unknown",
          level: Number(found.level),
          class: found.class,
        },
      ];
      setFriends(updated);
      await actor.saveFriendsList(
        updated.map((f) => ({
          username: f.username,
          principalId: f.principalId,
          status: f.status,
        })),
      );
      setAddName("");
    } catch {
      setAddError("Failed to send friend request");
    } finally {
      setAddLoading(false);
    }
  }, [actor, addName, friends]);

  // ── Accept / Decline pending request ───────────────────────────────────────

  const handleAccept = useCallback(
    async (username: string) => {
      if (!actor) return;
      const updated = friends.map((f) =>
        f.username === username ? { ...f, status: FriendStatus.accepted } : f,
      );
      setFriends(updated);
      try {
        await actor.saveFriendsList(
          updated.map((f) => ({
            username: f.username,
            principalId: f.principalId,
            status: f.status,
          })),
        );
      } catch {
        /* non-fatal */
      }
    },
    [actor, friends],
  );

  const handleDecline = useCallback(
    async (username: string) => {
      if (!actor) return;
      const updated = friends.filter((f) => f.username !== username);
      setFriends(updated);
      try {
        await actor.saveFriendsList(
          updated.map((f) => ({
            username: f.username,
            principalId: f.principalId,
            status: f.status,
          })),
        );
      } catch {
        /* non-fatal */
      }
    },
    [actor, friends],
  );

  // ── Remove friend ───────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    async (username: string) => {
      if (!actor) return;
      const updated = friends.filter((f) => f.username !== username);
      setFriends(updated);
      setContextMenu(null);
      try {
        await actor.saveFriendsList(
          updated.map((f) => ({
            username: f.username,
            principalId: f.principalId,
            status: f.status,
          })),
        );
      } catch {
        /* non-fatal */
      }
    },
    [actor, friends],
  );

  // ── Join friend ─────────────────────────────────────────────────────────────

  const handleJoin = useCallback(
    (zone: string) => {
      if (PVP_ZONES.has(zone)) return;
      setContextMenu(null);
      onJoinFriend(zone);
    },
    [onJoinFriend],
  );

  const acceptedCount = friends.filter(
    (f) => f.status === FriendStatus.accepted,
  ).length;
  const pendingFriends = friends.filter(
    (f) => f.status === FriendStatus.pending,
  );
  const acceptedFriends = friends.filter(
    (f) => f.status === FriendStatus.accepted,
  );

  // ── Locked panel for guests ─────────────────────────────────────────────────

  if (isGuest) {
    return (
      <div
        data-ocid="friend_list.panel"
        style={{
          position: "fixed",
          inset: 0,
          background: "oklch(0 0 0 / 0.6)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          style={{
            background: "oklch(0.18 0.04 265)",
            border: "1.5px solid oklch(0.35 0.08 265)",
            borderRadius: 12,
            padding: "28px 24px",
            maxWidth: 320,
            width: "90vw",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <p
            style={{
              color: "oklch(0.75 0.06 265)",
              fontSize: 14,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Create an account to use the friend system
          </p>
          <button
            type="button"
            data-ocid="friend_list.close_button"
            onClick={onClose}
            style={{
              marginTop: 16,
              padding: "10px 24px",
              background: "oklch(0.35 0.08 265)",
              color: "oklch(0.9 0.04 265)",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              minHeight: 44,
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-ocid="friend_list.panel"
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0 0 0 / 0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        style={{
          background: "oklch(0.16 0.04 265)",
          border: "1.5px solid oklch(0.32 0.08 265)",
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "slideUp 0.22s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: "1px solid oklch(0.28 0.06 265)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              color: "oklch(0.85 0.1 265)",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Friends ({acceptedCount}/20)
          </span>
          <button
            type="button"
            data-ocid="friend_list.close_button"
            onClick={onClose}
            aria-label="Close friend list"
            style={{
              background: "none",
              border: "none",
              color: "oklch(0.6 0.06 265)",
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 8px",
              minHeight: 44,
              minWidth: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Add friend */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid oklch(0.24 0.05 265)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              data-ocid="friend_list.search_input"
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void handleAddFriend()}
              placeholder="Add friend by name…"
              style={{
                flex: 1,
                background: "oklch(0.22 0.04 265)",
                border: "1px solid oklch(0.32 0.07 265)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "oklch(0.88 0.04 265)",
                fontSize: 13,
                minHeight: 44,
                outline: "none",
              }}
            />
            <button
              type="button"
              data-ocid="friend_list.add_button"
              onClick={() => void handleAddFriend()}
              disabled={addLoading || !addName.trim()}
              style={{
                background:
                  addLoading || !addName.trim()
                    ? "oklch(0.28 0.06 265)"
                    : "oklch(0.55 0.18 145)",
                border: "none",
                borderRadius: 8,
                color: "oklch(0.95 0.04 265)",
                padding: "8px 16px",
                fontSize: 13,
                cursor:
                  addLoading || !addName.trim() ? "not-allowed" : "pointer",
                minHeight: 44,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {addLoading ? "…" : "Add"}
            </button>
          </div>
          {addError && (
            <p
              data-ocid="friend_list.error_state"
              style={{
                color: "oklch(0.65 0.2 25)",
                fontSize: 12,
                margin: "6px 0 0",
                paddingLeft: 4,
              }}
            >
              {addError}
            </p>
          )}
        </div>

        {/* Scrollable list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading ? (
            <div
              data-ocid="friend_list.loading_state"
              style={{
                padding: 20,
                textAlign: "center",
                color: "oklch(0.55 0.05 265)",
                fontSize: 13,
              }}
            >
              Loading…
            </div>
          ) : (
            <>
              {/* Pending requests */}
              {pendingFriends.length > 0 && (
                <div>
                  <p
                    style={{
                      color: "oklch(0.6 0.05 265)",
                      fontSize: 11,
                      padding: "4px 16px",
                      margin: 0,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    Pending
                  </p>
                  {pendingFriends.map((f) => (
                    <div
                      key={f.username}
                      data-ocid="friend_list.pending.item"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 16px",
                        borderBottom: "1px solid oklch(0.22 0.04 265)",
                      }}
                    >
                      <span style={{ fontSize: 18 }}>⏳</span>
                      <span
                        style={{
                          flex: 1,
                          color: "oklch(0.82 0.06 265)",
                          fontSize: 14,
                        }}
                      >
                        {f.username}
                      </span>
                      <button
                        type="button"
                        data-ocid="friend_list.accept_button"
                        onClick={() => void handleAccept(f.username)}
                        style={{
                          background: "oklch(0.50 0.18 145)",
                          border: "none",
                          borderRadius: 6,
                          color: "oklch(0.95 0.04 265)",
                          padding: "6px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                          minHeight: 36,
                          fontWeight: 600,
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        data-ocid="friend_list.decline_button"
                        onClick={() => void handleDecline(f.username)}
                        style={{
                          background: "oklch(0.38 0.14 25)",
                          border: "none",
                          borderRadius: 6,
                          color: "oklch(0.9 0.05 265)",
                          padding: "6px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                          minHeight: 36,
                          fontWeight: 600,
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Accepted friends */}
              {acceptedFriends.length === 0 && pendingFriends.length === 0 && (
                <div
                  data-ocid="friend_list.empty_state"
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "oklch(0.55 0.05 265)",
                    fontSize: 13,
                  }}
                >
                  No friends yet. Add someone by their character name!
                </div>
              )}
              {acceptedFriends.map((f, idx) => (
                <button
                  type="button"
                  key={f.username}
                  data-ocid={`friend_list.item.${idx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({
                      username: f.username,
                      zone: f.zone,
                      online: f.online,
                      anchorY: e.currentTarget.getBoundingClientRect().bottom,
                    });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    width: "100%",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid oklch(0.20 0.04 265)",
                    cursor: "pointer",
                    textAlign: "left",
                    minHeight: 52,
                  }}
                >
                  {/* Online dot */}
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: f.online
                        ? "oklch(0.72 0.22 145)"
                        : "oklch(0.45 0.05 265)",
                      flexShrink: 0,
                    }}
                    title={f.online ? "Online" : "Offline"}
                  />
                  {/* Class icon */}
                  <span style={{ fontSize: 14, flexShrink: 0 }}>
                    {classIcon(f.class)}
                  </span>
                  {/* Name + zone */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: "oklch(0.88 0.06 265)",
                        fontSize: 14,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.username}
                    </div>
                    <div
                      style={{
                        color: "oklch(0.55 0.05 265)",
                        fontSize: 11,
                        marginTop: 1,
                      }}
                    >
                      {f.online ? `In: ${formatZoneName(f.zone)}` : "Offline"}
                    </div>
                  </div>
                  {/* Level badge */}
                  <span
                    style={{
                      background: "oklch(0.28 0.06 265)",
                      color: "oklch(0.75 0.08 265)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    Lv {f.level}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          data-ocid="friend_list.popover"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: Math.min(contextMenu.anchorY, window.innerHeight - 180),
            left: "50%",
            transform: "translateX(-50%)",
            background: "oklch(0.20 0.05 265)",
            border: "1.5px solid oklch(0.35 0.09 265)",
            borderRadius: 10,
            padding: "6px 0",
            zIndex: 220,
            minWidth: 180,
            boxShadow: "0 8px 24px oklch(0 0 0 / 0.5)",
          }}
        >
          {/* Join */}
          {contextMenu.online && !PVP_ZONES.has(contextMenu.zone) ? (
            <button
              type="button"
              data-ocid="friend_list.join_button"
              onClick={() => handleJoin(contextMenu.zone)}
              style={ctxBtnStyle}
            >
              🗺 Join in {formatZoneName(contextMenu.zone)}
            </button>
          ) : (
            <button
              type="button"
              data-ocid="friend_list.join_button"
              disabled
              title={
                PVP_ZONES.has(contextMenu.zone)
                  ? "Cannot join PVP zone"
                  : "Friend is offline"
              }
              style={{ ...ctxBtnStyle, opacity: 0.4, cursor: "not-allowed" }}
            >
              🗺{" "}
              {PVP_ZONES.has(contextMenu.zone)
                ? "Cannot join PVP zone"
                : "Offline"}
            </button>
          )}
          {/* Whisper */}
          <button
            type="button"
            data-ocid="friend_list.whisper_button"
            onClick={() => {
              setContextMenu(null);
              onWhisper(contextMenu.username);
            }}
            style={ctxBtnStyle}
          >
            💬 Whisper
          </button>
          {/* Remove */}
          <button
            type="button"
            data-ocid="friend_list.remove_button"
            onClick={() => void handleRemove(contextMenu.username)}
            style={{ ...ctxBtnStyle, color: "oklch(0.65 0.20 25)" }}
          >
            ✕ Remove Friend
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(60px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const ctxBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "none",
  border: "none",
  color: "oklch(0.85 0.06 265)",
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 14,
  cursor: "pointer",
  minHeight: 48,
};
