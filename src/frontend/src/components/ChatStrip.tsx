import { useCallback, useEffect, useRef, useState } from "react";
import { setChatInputFocused } from "../lib/input";
import type { CharacterClass, ChatMessage } from "../types/game";

interface ChatStripProps {
  messages: ChatMessage[];
  currentUsername: string;
  selectedClass: CharacterClass;
  isGuest: boolean;
  onSendMessage: (text: string) => void;
  /** Called when the chat text input gains focus — blocks WASD movement */
  onChatFocus?: () => void;
  /** Called when the chat text input loses focus — restores WASD movement */
  onChatBlur?: () => void;
}

interface ExtendedChatMessage extends ChatMessage {
  characterClass?: CharacterClass;
}

const CLASS_COLORS: Record<CharacterClass, string> = {
  warrior: "#ff6644",
  mage: "#44aaff",
};

function getNameColor(
  username: string,
  msg: ExtendedChatMessage,
  currentUsername: string,
  selectedClass: CharacterClass,
  isGuest: boolean,
): string {
  if (username.startsWith("Guest")) return "#888888";
  if (username === currentUsername && !isGuest)
    return CLASS_COLORS[selectedClass];
  if (msg.characterClass) return CLASS_COLORS[msg.characterClass];
  return "#dddddd";
}

export function ChatStrip({
  messages,
  currentUsername,
  selectedClass,
  isGuest,
  onSendMessage,
  onChatFocus,
  onChatBlur,
}: ChatStripProps) {
  const [inputValue, setInputValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stripFlash, setStripFlash] = useState(false);
  const prevMsgCountRef = useRef(messages.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const stripFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentThree = messages.slice(0, 3).reverse();
  const recentTwenty = messages.slice(0, 20).reverse();

  // Flash strip background briefly when new message arrives
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      setStripFlash(true);
      if (stripFlashTimerRef.current) clearTimeout(stripFlashTimerRef.current);
      stripFlashTimerRef.current = setTimeout(() => setStripFlash(false), 400);
    }
    prevMsgCountRef.current = messages.length;
    return () => {
      if (stripFlashTimerRef.current) clearTimeout(stripFlashTimerRef.current);
    };
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isGuest) return;
    onSendMessage(text);
    setInputValue("");
    inputRef.current?.blur();
    setChatInputFocused(false);
    onChatBlur?.();
  }, [inputValue, isGuest, onSendMessage, onChatBlur]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation(); // prevent game from seeing these key events
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setInputValue("");
        inputRef.current?.blur();
        setChatInputFocused(false);
        onChatBlur?.();
      }
    },
    [handleSend, onChatBlur],
  );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [historyOpen]);

  return (
    <div
      style={{
        flexShrink: 0,
        position: "relative",
        zIndex: 35,
      }}
    >
      {/* Full history panel — slides down from strip INTO controls area */}
      {historyOpen && (
        <div
          ref={historyRef}
          data-ocid="chat-history-panel"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "rgba(5,5,18,0.97)",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            zIndex: 36,
            maxHeight: 200,
            overflowY: "auto",
            padding: "8px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Chat History
            </span>
            <button
              type="button"
              aria-label="Close chat history"
              data-ocid="chat-history-close"
              onClick={() => setHistoryOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.45)",
                fontSize: 14,
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              ×
            </button>
          </div>
          {recentTwenty.length === 0 ? (
            <span
              style={{
                fontSize: 11,
                color: "#555",
                fontStyle: "italic",
                fontFamily: "monospace",
              }}
            >
              No messages yet…
            </span>
          ) : (
            recentTwenty.map((msg, i) => (
              <div
                key={`${msg.username}-${msg.timestamp}-${i}`}
                style={{
                  fontSize: 11,
                  lineHeight: 1.4,
                  fontFamily: "monospace",
                }}
              >
                <span
                  style={{
                    color: getNameColor(
                      msg.username,
                      msg as ExtendedChatMessage,
                      currentUsername,
                      selectedClass,
                      isGuest,
                    ),
                    fontWeight: 700,
                    marginRight: 2,
                  }}
                >
                  {msg.username}:
                </span>
                <span style={{ color: "#cccccc" }}>{msg.text}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Main chat strip bar */}
      <div
        data-ocid="chat-strip"
        style={{
          height: 55,
          background: stripFlash ? "rgba(255,220,50,0.18)" : "rgba(0,0,0,0.85)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 10,
          paddingRight: 8,
          gap: 8,
          boxSizing: "border-box",
          overflow: "hidden",
          transition: "background 0.15s ease",
        }}
      >
        {/* Left side: recent messages area — tap to focus input */}
        <button
          type="button"
          aria-label="Tap to type a message"
          data-ocid="chat.message_area"
          onClick={focusInput}
          style={{
            flex: "1 1 0%",
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            justifyContent: "center",
            cursor: "text",
            height: "100%",
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {recentThree.length === 0 ? (
            <span
              style={{
                fontSize: 11,
                color: "#555",
                fontStyle: "italic",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Tap CHAT to talk…
            </span>
          ) : (
            recentThree.map((msg, i) => {
              // Nearby player tint: messages from players within 5 tiles get a blue-tinted bg
              const isNearby =
                (msg as ExtendedChatMessage).characterClass !== undefined;
              return (
                <div
                  key={`${msg.username}-${msg.timestamp}-${i}`}
                  style={{
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.4,
                    fontFamily: "system-ui, monospace",
                    background:
                      isNearby && i === 0
                        ? "rgba(100,150,255,0.08)"
                        : undefined,
                    borderRadius: isNearby && i === 0 ? 2 : undefined,
                  }}
                >
                  <span
                    style={{
                      color: getNameColor(
                        msg.username,
                        msg as ExtendedChatMessage,
                        currentUsername,
                        selectedClass,
                        isGuest,
                      ),
                      fontWeight: 700,
                      marginRight: 3,
                    }}
                  >
                    {msg.username}:
                  </span>
                  <span style={{ color: "#dddddd", fontWeight: 400 }}>
                    {msg.text}
                  </span>
                </div>
              );
            })
          )}
        </button>

        {/* Right side: input + send + expand */}
        <div
          style={{
            flexShrink: 0,
            width: "35%",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 16,
              paddingLeft: 8,
              paddingRight: 4,
              height: 32,
              overflow: "hidden",
            }}
          >
            <input
              ref={inputRef}
              data-ocid="chat.input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isGuest ? "Guests can't chat" : "Say something…"}
              disabled={isGuest}
              aria-label="Chat message input"
              onFocus={() => {
                setChatInputFocused(true);
                onChatFocus?.();
              }}
              onBlur={() => {
                setChatInputFocused(false);
                onChatBlur?.();
              }}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: isGuest ? "rgba(255,255,255,0.3)" : "#ffffff",
                fontSize: 12,
                fontFamily: "system-ui, monospace",
                minWidth: 0,
                padding: 0,
              }}
            />
          </div>

          {/* Send button — blue circle with arrow */}
          <button
            type="button"
            aria-label="Send chat message"
            data-ocid="chat.send_button"
            onClick={handleSend}
            disabled={isGuest || !inputValue.trim()}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: "50%",
              background:
                isGuest || !inputValue.trim()
                  ? "rgba(255,255,255,0.05)"
                  : "#1976d2",
              border:
                isGuest || !inputValue.trim()
                  ? "1px solid rgba(255,255,255,0.10)"
                  : "1px solid rgba(100,180,255,0.60)",
              boxShadow:
                isGuest || !inputValue.trim()
                  ? "none"
                  : "0 0 8px rgba(25,118,210,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isGuest || !inputValue.trim() ? "default" : "pointer",
              WebkitTapHighlightColor: "transparent",
              transition: "all 0.15s ease",
            }}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path
                d="M2 6h8M7 3l3 3-3 3"
                stroke={
                  isGuest || !inputValue.trim()
                    ? "rgba(255,255,255,0.25)"
                    : "#44aaff"
                }
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Expand history icon */}
          <button
            type="button"
            aria-label={
              historyOpen ? "Close chat history" : "View chat history"
            }
            data-ocid="chat.expand_button"
            onClick={() => setHistoryOpen((o) => !o)}
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: 4,
              background: historyOpen
                ? "rgba(255,255,255,0.15)"
                : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
            >
              <path
                d={historyOpen ? "M2 6l3-3 3 3" : "M2 4l3 3 3-3"}
                stroke="rgba(255,255,255,0.50)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
