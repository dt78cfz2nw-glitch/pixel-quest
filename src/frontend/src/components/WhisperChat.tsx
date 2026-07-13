import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "../backend";
import type { WhisperMessage } from "../backend.d";

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(ts: bigint): string {
  const diffMs = Date.now() - Number(ts);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WhisperChatProps {
  toUsername: string;
  whispers: WhisperMessage[];
  localUsername: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WhisperChat({
  toUsername,
  whispers,
  localUsername,
  onSend,
  onClose,
}: WhisperChatProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const conversation = whispers
    .filter(
      (w) =>
        (w.from === localUsername && w.to === toUsername) ||
        (w.from === toUsername && w.to === localUsername),
    )
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional scroll-to-bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whispers]);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    onSend(text);
    setInputText("");
    if ("ontouchstart" in window) {
      inputRef.current?.blur();
    }
  }, [inputText, onSend]);

  return (
    <div
      data-ocid="whisper_chat.panel"
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0 0 0 / 0.55)",
        zIndex: 250,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "oklch(0.15 0.04 290)",
          border: "1.5px solid oklch(0.30 0.10 290)",
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: 480,
          height: "60vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "whisperSlideUp 0.22s ease-out",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px 10px",
            borderBottom: "1px solid oklch(0.25 0.08 290)",
            flexShrink: 0,
          }}
        >
          <div>
            <span
              style={{
                color: "oklch(0.85 0.14 310)",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              💬 Whisper
            </span>
            <span
              style={{
                color: "oklch(0.72 0.08 290)",
                fontSize: 14,
                marginLeft: 6,
              }}
            >
              → {toUsername}
            </span>
          </div>
          <button
            type="button"
            data-ocid="whisper_chat.close_button"
            onClick={onClose}
            aria-label="Close whisper"
            style={{
              background: "none",
              border: "none",
              color: "oklch(0.55 0.06 290)",
              fontSize: 20,
              cursor: "pointer",
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

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {conversation.length === 0 && (
            <div
              data-ocid="whisper_chat.empty_state"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "oklch(0.50 0.06 290)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              Start a private conversation with {toUsername}
            </div>
          )}

          {conversation.map((msg, idx) => {
            const isLocal = msg.from === localUsername;
            const msgKey = `${msg.from}-${String(msg.timestamp)}-${idx}`;
            return (
              <div
                key={msgKey}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isLocal ? "flex-end" : "flex-start",
                }}
              >
                <span
                  style={{
                    color: "oklch(0.75 0.18 310)",
                    fontSize: 11,
                    marginBottom: 2,
                    fontWeight: 600,
                  }}
                >
                  [Whisper] {msg.from}
                </span>
                <div
                  style={{
                    background: isLocal
                      ? "oklch(0.35 0.16 310)"
                      : "oklch(0.24 0.10 290)",
                    borderRadius: isLocal
                      ? "12px 4px 12px 12px"
                      : "4px 12px 12px 12px",
                    padding: "8px 12px",
                    maxWidth: "80%",
                    wordBreak: "break-word",
                  }}
                >
                  <span
                    style={{
                      color: "oklch(0.92 0.08 310)",
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    {msg.text}
                  </span>
                </div>
                <span
                  style={{
                    color: "oklch(0.48 0.05 290)",
                    fontSize: 10,
                    marginTop: 2,
                  }}
                >
                  {relativeTime(msg.timestamp)}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid oklch(0.24 0.08 290)",
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            data-ocid="whisper_chat.input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${toUsername}…`}
            maxLength={200}
            style={{
              flex: 1,
              background: "oklch(0.22 0.06 290)",
              border: "1px solid oklch(0.32 0.10 290)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "oklch(0.90 0.06 290)",
              fontSize: 13,
              minHeight: 44,
              outline: "none",
            }}
          />
          <button
            type="button"
            data-ocid="whisper_chat.submit_button"
            onClick={handleSend}
            disabled={!inputText.trim()}
            style={{
              background: inputText.trim()
                ? "oklch(0.52 0.22 310)"
                : "oklch(0.28 0.06 290)",
              border: "none",
              borderRadius: 8,
              color: "oklch(0.95 0.04 290)",
              padding: "8px 16px",
              fontSize: 13,
              cursor: inputText.trim() ? "pointer" : "not-allowed",
              minHeight: 44,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes whisperSlideUp {
          from { transform: translateY(60px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Whisper notification hook ────────────────────────────────────────────────

interface UseWhisperNotificationsResult {
  unreadCount: number;
  whispers: WhisperMessage[];
  clearUnread: () => void;
}

export function useWhisperNotifications(
  isGuest: boolean,
  openConversationUsername: string | null,
): UseWhisperNotificationsResult {
  const { actor } = useActor(createActor);
  const [whispers, setWhispers] = useState<WhisperMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenCountRef = useRef(0);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
    lastSeenCountRef.current = whispers.length;
  }, [whispers.length]);

  const pollWhispers = useCallback(async () => {
    if (!actor || isGuest) return;
    try {
      const msgs = await actor.getWhispers();
      setWhispers(msgs);
      // Only count messages not from the current open conversation
      const incoming = msgs.filter(
        (m) =>
          openConversationUsername === null ||
          m.from !== openConversationUsername,
      );
      const newCount = Math.max(0, incoming.length - lastSeenCountRef.current);
      if (newCount > 0) {
        setUnreadCount((prev) => prev + newCount);
        lastSeenCountRef.current = incoming.length;
      }
    } catch {
      // Degrade gracefully
    }
  }, [actor, isGuest, openConversationUsername]);

  useEffect(() => {
    if (isGuest) return;
    void pollWhispers();
    const id = setInterval(() => void pollWhispers(), 15_000);
    return () => clearInterval(id);
  }, [isGuest, pollWhispers]);

  return { unreadCount, whispers, clearUnread };
}
