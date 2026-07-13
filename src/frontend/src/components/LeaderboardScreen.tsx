import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "../backend";
import type { LeaderboardEntry } from "../backend.d.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardRow {
  rank: number;
  username: string;
  classIcon: string;
  level: number;
  kills: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map activityScore (used as kills proxy) to display kills */
function scoreToKills(score: number): number {
  return score;
}

/** Infer class icon from username heuristic — fallback to ⚔ */
function classIconForEntry(_entry: LeaderboardEntry): string {
  // Backend LeaderboardEntry has no class field yet.
  // We use activityScore parity as a light proxy until backend exposes class.
  // Future: replace with e.class when available.
  return "⚔";
}

const MEDAL_EMOJI = ["🥇", "🥈", "🥉"];

// Row background highlights for podium positions
const PODIUM_BG: Record<number, string> = {
  1: "rgba(255, 215, 0, 0.13)", // gold
  2: "rgba(192, 192, 192, 0.11)", // silver
  3: "rgba(205, 127, 50, 0.11)", // bronze
};

const PODIUM_BORDER: Record<number, string> = {
  1: "oklch(0.82 0.16 85 / 0.35)",
  2: "oklch(0.74 0.04 220 / 0.30)",
  3: "oklch(0.67 0.14 45 / 0.28)",
};

// ─── Leaderboard Screen — full-page mode ──────────────────────────────────────

interface LeaderboardScreenProps {
  onBack: () => void;
  currentUsername?: string;
}

export function LeaderboardScreen({
  onBack,
  currentUsername,
}: LeaderboardScreenProps) {
  const { actor, isFetching } = useActor(createActor);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (!actor) {
        setRows([]);
        setLoading(false);
        return;
      }
      const entries: LeaderboardEntry[] = await actor.getLeaderboard();
      // Sort: level DESC → activityScore DESC
      const sorted = [...entries]
        .sort((a, b) => {
          const lvDiff = Number(b.level) - Number(a.level);
          if (lvDiff !== 0) return lvDiff;
          return Number(b.activityScore) - Number(a.activityScore);
        })
        .slice(0, 20)
        .map(
          (e, i): LeaderboardRow => ({
            rank: i + 1,
            username: e.username,
            classIcon: classIconForEntry(e),
            level: Number(e.level),
            kills: scoreToKills(Number(e.activityScore)),
          }),
        );
      setRows(sorted);
      setLastRefresh(new Date());
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [actor]);

  // Fetch on mount
  useEffect(() => {
    if (isFetching) return;
    void fetchLeaderboard();
  }, [isFetching, fetchLeaderboard]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (isFetching) return;
    intervalRef.current = setInterval(() => {
      void fetchLeaderboard();
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isFetching, fetchLeaderboard]);

  // Entrance fade
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Find own rank
  const ownRankRow = currentUsername
    ? rows.find(
        (r) => r.username.toLowerCase() === currentUsername.toLowerCase(),
      )
    : undefined;
  const ownRankNum = ownRankRow?.rank ?? null;
  const ownInTop20 = ownRankNum !== null && ownRankNum <= 20;

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.35s ease" }}
      data-ocid="leaderboard-screen"
    >
      {/* CRT scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden="true"
        style={{
          background:
            "repeating-linear-gradient(0deg, oklch(0 0 0 / 0.05) 0px, oklch(0 0 0 / 0.05) 1px, transparent 1px, transparent 3px)",
          zIndex: 50,
        }}
      />

      <CornerDecor />

      {/* Header */}
      <div className="w-full max-w-lg px-4 pt-10 pb-2 flex flex-col items-center">
        <p
          className="font-mono uppercase tracking-[0.4em] text-xs mb-1"
          style={{ color: "oklch(0.75 0.2 145)" }}
        >
          ── Rankings ──
        </p>
        <h1
          className="font-mono font-bold tracking-[0.2em] uppercase text-foreground"
          style={{ fontSize: "clamp(1.5rem, 6vw, 2.2rem)" }}
          data-ocid="leaderboard-title"
        >
          🏆 LEADERBOARD
        </h1>
        <p
          className="font-mono text-xs tracking-widest mt-1 uppercase"
          style={{ color: "oklch(0.38 0 0)" }}
        >
          Internet Identity Players Only
        </p>
        {lastRefresh && (
          <p
            className="font-mono text-xs mt-0.5"
            style={{ color: "oklch(0.32 0 0)", fontSize: 9 }}
          >
            Updated {lastRefresh.toLocaleTimeString()} · auto-refreshes every
            60s
          </p>
        )}
      </div>

      {/* Divider */}
      <div
        className="w-full max-w-lg px-4 my-4"
        style={{ borderTop: "1px solid oklch(0.25 0 0)" }}
      />

      {/* Content area */}
      <div className="w-full max-w-lg px-4 flex-1">
        {loading || isFetching ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState onRetry={() => void fetchLeaderboard()} />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <RankingTable rows={rows} currentUsername={currentUsername} />
        )}

        {/* Own rank if not in top 20 */}
        {!loading && !error && currentUsername && !ownInTop20 && (
          <OwnRankFooter username={currentUsername} />
        )}
      </div>

      {/* Footer actions */}
      <div className="w-full max-w-lg px-4 py-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          data-ocid="leaderboard-back-btn"
          className="font-mono uppercase tracking-[0.2em] text-xs px-5 py-2.5 border transition-smooth hover:opacity-80"
          style={{
            borderColor: "oklch(0.35 0 0)",
            color: "oklch(0.55 0 0)",
          }}
          aria-label="Back to menu"
        >
          ← Back
        </button>

        {!loading && !isFetching && (
          <button
            type="button"
            onClick={() => void fetchLeaderboard()}
            data-ocid="leaderboard-refresh-btn"
            className="font-mono uppercase tracking-[0.2em] text-xs px-5 py-2.5 border transition-smooth hover:opacity-80"
            style={{
              borderColor: "oklch(0.35 0 0)",
              color: "oklch(0.55 0 0)",
            }}
            aria-label="Refresh leaderboard"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      <p className="font-mono text-muted-foreground/40 text-[10px] tracking-widest pb-4 uppercase">
        v0.5 · On-chain
      </p>
    </div>
  );
}

// ─── Leaderboard Overlay — in-game HUD panel ──────────────────────────────────

interface LeaderboardOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername?: string;
}

export function LeaderboardOverlay({
  isOpen,
  onClose,
  currentUsername,
}: LeaderboardOverlayProps) {
  const { actor, isFetching } = useActor(createActor);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (!actor) {
        setRows([]);
        setLoading(false);
        return;
      }
      const entries: LeaderboardEntry[] = await actor.getLeaderboard();
      const sorted = [...entries]
        .sort((a, b) => {
          const lvDiff = Number(b.level) - Number(a.level);
          if (lvDiff !== 0) return lvDiff;
          return Number(b.activityScore) - Number(a.activityScore);
        })
        .slice(0, 20)
        .map(
          (e, i): LeaderboardRow => ({
            rank: i + 1,
            username: e.username,
            classIcon: classIconForEntry(e),
            level: Number(e.level),
            kills: scoreToKills(Number(e.activityScore)),
          }),
        );
      setRows(sorted);
      setLastRefresh(new Date());
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [actor]);

  // Fetch when overlay opens
  useEffect(() => {
    if (!isOpen || isFetching) return;
    void fetchLeaderboard();
  }, [isOpen, isFetching, fetchLeaderboard]);

  // Auto-refresh every 60s while open
  useEffect(() => {
    if (!isOpen || isFetching) return;
    intervalRef.current = setInterval(() => {
      void fetchLeaderboard();
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, isFetching, fetchLeaderboard]);

  // Slide-in animation
  useEffect(() => {
    if (!isOpen) {
      setPanelVisible(false);
      return;
    }
    const t = setTimeout(() => setPanelVisible(true), 10);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Find own rank
  const ownRankRow = currentUsername
    ? rows.find(
        (r) => r.username.toLowerCase() === currentUsername.toLowerCase(),
      )
    : undefined;
  const ownRankNum = ownRankRow?.rank ?? null;
  const ownInTop20 = ownRankNum !== null && ownRankNum <= 20;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{
          background: "rgba(0,0,0,0.55)",
          zIndex: 200,
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        aria-hidden="true"
        data-ocid="leaderboard-overlay.backdrop"
      />

      {/* Panel */}
      <dialog
        open
        className="fixed inset-x-0 bottom-0 flex justify-center bg-transparent p-0 m-0 max-w-none max-h-none w-full"
        style={{ zIndex: 201, pointerEvents: "none", border: "none" }}
        data-ocid="leaderboard-overlay.dialog"
        aria-label="Leaderboard"
      >
        <div
          style={{
            width: "min(520px, 100vw)",
            maxHeight: "88vh",
            background: "rgba(0,0,0,0.92)",
            border: "1px solid oklch(0.82 0.16 85 / 0.45)",
            borderBottom: "none",
            borderRadius: "8px 8px 0 0",
            boxShadow:
              "0 -8px 48px rgba(0,0,0,0.7), 0 0 0 1px oklch(0.82 0.16 85 / 0.15)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
            transform: panelVisible ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 10px",
              borderBottom: "1px solid oklch(0.22 0 0 / 0.7)",
              flexShrink: 0,
            }}
          >
            <div>
              <div
                className="font-mono font-bold tracking-widest uppercase"
                style={{
                  fontSize: "clamp(0.85rem, 3vw, 1.05rem)",
                  color: "oklch(0.82 0.16 85)",
                  textShadow: "0 0 12px oklch(0.82 0.16 85 / 0.5)",
                  letterSpacing: "0.2em",
                }}
              >
                🏆 Leaderboard
              </div>
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: 9,
                  color: "oklch(0.38 0 0)",
                  marginTop: 2,
                  letterSpacing: "0.1em",
                }}
              >
                Internet Identity Players Only
              </div>
              {lastRefresh && (
                <div
                  className="font-mono"
                  style={{
                    fontSize: 8,
                    color: "oklch(0.30 0 0)",
                    marginTop: 1,
                  }}
                >
                  Updated {lastRefresh.toLocaleTimeString()} · auto-refreshes
                  every 60s
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              data-ocid="leaderboard-overlay.close_button"
              className="font-mono text-sm transition-colors hover:opacity-80"
              style={{
                color: "oklch(0.50 0 0)",
                border: "1px solid oklch(0.28 0 0 / 0.6)",
                borderRadius: 3,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
              }}
              aria-label="Close leaderboard"
            >
              ✕
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {loading || isFetching ? (
              <div style={{ padding: "32px 16px" }}>
                <LoadingSpinner compact />
              </div>
            ) : error ? (
              <div style={{ padding: "16px" }}>
                <ErrorState onRetry={() => void fetchLeaderboard()} />
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "16px" }}>
                <EmptyState />
              </div>
            ) : (
              <div style={{ padding: "0 0 8px" }}>
                <RankingTable
                  rows={rows}
                  currentUsername={currentUsername}
                  compact
                />

                {/* Own rank if not in top 20 */}
                {!loading && !error && currentUsername && !ownInTop20 && (
                  <div style={{ padding: "8px 12px 4px" }}>
                    <OwnRankFooter username={currentUsername} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

// ─── Ranking Table ────────────────────────────────────────────────────────────

function RankingTable({
  rows,
  currentUsername,
  compact = false,
}: {
  rows: LeaderboardRow[];
  currentUsername?: string;
  compact?: boolean;
}) {
  const px = compact ? "px-3" : "px-3";
  const headerPy = compact ? "py-2" : "py-2";
  return (
    <div
      className="w-full"
      style={{ border: compact ? "none" : "1px solid oklch(0.22 0 0)" }}
      data-ocid="leaderboard-table"
    >
      {/* Column headers */}
      <div
        className={`grid font-mono uppercase text-[9px] tracking-widest ${px} ${headerPy}`}
        style={{
          gridTemplateColumns: "2.2rem 1fr 2rem 3rem 4rem",
          background: "oklch(0.10 0 0)",
          borderBottom: "1px solid oklch(0.22 0 0)",
          color: "oklch(0.38 0 0)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <span>Rank</span>
        <span>Name</span>
        <span className="text-center">Cls</span>
        <span className="text-right">Lvl</span>
        <span className="text-right">Kills</span>
      </div>

      {rows.map((row, idx) => (
        <RankRow
          key={row.rank}
          row={row}
          isEven={idx % 2 === 1}
          isOwnRow={
            currentUsername
              ? row.username.toLowerCase() === currentUsername.toLowerCase()
              : false
          }
          compact={compact}
        />
      ))}
    </div>
  );
}

function RankRow({
  row,
  isEven,
  isOwnRow,
  compact = false,
}: {
  row: LeaderboardRow;
  isEven: boolean;
  isOwnRow: boolean;
  compact?: boolean;
}) {
  const isPodium = row.rank <= 3;
  const podiumBg = isPodium ? PODIUM_BG[row.rank] : null;
  const podiumBorder = isPodium ? PODIUM_BORDER[row.rank] : null;

  const rowBg = podiumBg
    ? podiumBg
    : isEven
      ? "oklch(0.12 0 0)"
      : "oklch(0.10 0 0)";

  const nameColor = isPodium
    ? ["oklch(0.88 0.18 85)", "oklch(0.82 0.05 220)", "oklch(0.78 0.16 45)"][
        row.rank - 1
      ]
    : isOwnRow
      ? "oklch(0.88 0.18 85)"
      : "oklch(0.78 0 0)";

  const py = compact ? "py-2" : "py-2.5";

  return (
    <div
      className={`grid items-center font-mono text-xs px-3 ${py}`}
      style={{
        gridTemplateColumns: "2.2rem 1fr 2rem 3rem 4rem",
        background: rowBg,
        borderBottom: "1px solid oklch(0.16 0 0 / 0.8)",
        outline: isOwnRow
          ? "1px solid oklch(0.82 0.16 85 / 0.55)"
          : podiumBorder
            ? `1px solid ${podiumBorder}`
            : "none",
        outlineOffset: "-1px",
        position: "relative",
      }}
      data-ocid={`leaderboard-row.item.${row.rank}`}
      aria-current={isOwnRow ? "true" : undefined}
    >
      {/* Rank */}
      <span
        style={{
          color: isPodium
            ? [
                "oklch(0.82 0.16 85)",
                "oklch(0.74 0.04 220)",
                "oklch(0.67 0.14 45)",
              ][row.rank - 1]
            : "oklch(0.35 0 0)",
          fontWeight: isPodium ? 700 : 400,
          fontSize: isPodium ? "0.78rem" : undefined,
        }}
      >
        {isPodium ? MEDAL_EMOJI[row.rank - 1] : `#${row.rank}`}
      </span>

      {/* Name */}
      <span
        className="truncate pr-1 min-w-0"
        style={{
          color: nameColor,
          fontWeight: isPodium || isOwnRow ? 600 : 400,
        }}
      >
        {row.username}
        {isOwnRow && (
          <span
            style={{
              fontSize: 8,
              color: "oklch(0.82 0.16 85 / 0.8)",
              marginLeft: 4,
              letterSpacing: "0.05em",
            }}
          >
            ◀ YOU
          </span>
        )}
      </span>

      {/* Class icon */}
      <span
        className="text-center"
        style={{ fontSize: "0.7rem", color: "oklch(0.55 0 0)" }}
        title="Class"
      >
        {row.classIcon}
      </span>

      {/* Level */}
      <div className="flex justify-end">
        <span
          className="tabular-nums text-right"
          style={{
            fontSize: "0.65rem",
            background: "oklch(0.18 0.04 145 / 0.5)",
            color: "oklch(0.65 0.15 145)",
            border: "1px solid oklch(0.35 0.1 145 / 0.4)",
            padding: "1px 5px",
            minWidth: "1.8rem",
            textAlign: "center",
          }}
        >
          {row.level}
        </span>
      </div>

      {/* Kills */}
      <span
        className="text-right tabular-nums"
        style={{
          color: isPodium
            ? [
                "oklch(0.82 0.16 85)",
                "oklch(0.74 0.04 220)",
                "oklch(0.67 0.14 45)",
              ][row.rank - 1]
            : "oklch(0.60 0 0)",
          fontWeight: isPodium ? 700 : 400,
          fontSize: "0.65rem",
        }}
      >
        {row.kills.toLocaleString()}
      </span>
    </div>
  );
}

// ─── Own Rank Footer ──────────────────────────────────────────────────────────

function OwnRankFooter({ username }: { username: string }) {
  return (
    <div
      className="font-mono text-xs"
      style={{
        borderTop: "1px dashed oklch(0.82 0.16 85 / 0.25)",
        paddingTop: 8,
        color: "oklch(0.82 0.16 85)",
        textAlign: "center",
        letterSpacing: "0.06em",
      }}
      data-ocid="leaderboard-own-rank"
    >
      {username} — not yet in top 20 · keep climbing! 🏅
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function LoadingSpinner({ compact = false }: { compact?: boolean }) {
  const size = compact ? 24 : 32;
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ padding: compact ? "24px 0" : "48px 0" }}
      aria-label="Loading leaderboard…"
      data-ocid="leaderboard-loading"
    >
      {/* Spinning ring */}
      <div
        style={{
          width: size,
          height: size,
          border: "3px solid oklch(0.22 0 0)",
          borderTopColor: "oklch(0.82 0.16 85)",
          borderRadius: "50%",
          animation: "spin 0.75s linear infinite",
          marginBottom: compact ? 8 : 12,
        }}
        aria-hidden="true"
      />
      <p
        className="font-mono uppercase tracking-widest"
        style={{
          color: "oklch(0.40 0 0)",
          fontSize: compact ? 8 : 10,
        }}
      >
        Loading rankings…
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center"
      data-ocid="leaderboard-empty"
    >
      <span className="text-4xl mb-3" aria-hidden="true">
        🏆
      </span>
      <p
        className="font-mono uppercase tracking-widest text-sm"
        style={{ color: "oklch(0.75 0.2 145)" }}
      >
        No adventurers yet
      </p>
      <p
        className="font-mono text-xs mt-2 tracking-wider"
        style={{ color: "oklch(0.4 0 0)" }}
      >
        Be the first to leave your mark!
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center"
      data-ocid="leaderboard-error"
    >
      <span className="text-3xl mb-3" aria-hidden="true">
        ✦
      </span>
      <p
        className="font-mono uppercase tracking-widest text-sm"
        style={{ color: "oklch(0.55 0.22 25)" }}
      >
        Could not load rankings
      </p>
      <p
        className="font-mono text-xs mt-2 mb-4 tracking-wider"
        style={{ color: "oklch(0.4 0 0)" }}
      >
        Blockchain may be syncing — try again shortly
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="font-mono uppercase tracking-[0.2em] text-xs px-5 py-2 border transition-smooth hover:opacity-80"
        style={{
          borderColor: "oklch(0.35 0 0)",
          color: "oklch(0.55 0 0)",
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Corner Decorations ───────────────────────────────────────────────────────

function CornerDecor() {
  return (
    <>
      <div
        className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2"
        style={{ borderColor: "oklch(0.75 0.2 145 / 0.4)" }}
        aria-hidden="true"
      />
      <div
        className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2"
        style={{ borderColor: "oklch(0.75 0.2 145 / 0.4)" }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2"
        style={{ borderColor: "oklch(0.75 0.2 145 / 0.4)" }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2"
        style={{ borderColor: "oklch(0.75 0.2 145 / 0.4)" }}
        aria-hidden="true"
      />
    </>
  );
}
