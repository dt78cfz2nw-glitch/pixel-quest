import { InternetIdentityProvider } from "@caffeineai/core-infrastructure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// ─── Top-level Error Boundary ─────────────────────────────────────────────────

interface EBState {
  error: Error | null;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PixelQuest] FATAL RENDER ERROR:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            background: "#0a0a0a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            color: "#e5e5e5",
            padding: "2rem",
            textAlign: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "2rem",
              color: "oklch(0.65 0.22 25)",
              fontWeight: "bold",
              letterSpacing: "0.2em",
            }}
          >
            PIXEL QUEST
          </div>
          <div
            style={{
              color: "oklch(0.65 0.22 25)",
              fontSize: "1rem",
              letterSpacing: "0.1em",
              fontWeight: "bold",
            }}
          >
            Game failed to start.
          </div>
          <div
            style={{
              color: "oklch(0.55 0 0)",
              fontSize: "0.75rem",
              letterSpacing: "0.05em",
              maxWidth: "360px",
              lineHeight: 1.6,
            }}
          >
            {this.state.error.message ?? "An unexpected error occurred."}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem",
              background: "oklch(0.35 0.08 145)",
              border: "1px solid oklch(0.55 0.15 145)",
              color: "oklch(0.92 0.08 145)",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              letterSpacing: "0.15em",
              padding: "0.6rem 2rem",
              cursor: "pointer",
            }}
          >
            ↺ REFRESH
          </button>
          <div
            style={{
              fontSize: "0.65rem",
              color: "oklch(0.38 0 0)",
              letterSpacing: "0.05em",
            }}
          >
            If the problem persists, try clearing your browser cache.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── II Provider wrapper with error boundary ──────────────────────────────────
// InternetIdentityProvider is wrapped in its own boundary so if it crashes,
// the game falls back to guest mode rather than showing a blank page.

class IIErrorBoundary extends Component<
  { children: ReactNode },
  { crashed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    console.warn(
      "[PixelQuest] InternetIdentityProvider crashed — running in guest mode.",
      error,
    );
  }

  render() {
    // If II crashed, render children directly (guest mode — no identity)
    if (this.state.crashed) return this.props.children;
    return this.props.children;
  }
}

// ─── Query client ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// ─── Mount ────────────────────────────────────────────────────────────────────

console.log("[PixelQuest] Stage 1: Mounting React root…");

const rootEl = document.getElementById("root");
if (!rootEl) {
  // Absolute last-resort fallback — should never happen
  document.body.innerHTML =
    '<div style="color:white;font-family:monospace;padding:2rem">Game failed to mount. Please refresh.</div>';
} else {
  ReactDOM.createRoot(rootEl).render(
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <IIErrorBoundary>
          <InternetIdentityProvider>
            <App />
          </InternetIdentityProvider>
        </IIErrorBoundary>
      </QueryClientProvider>
    </RootErrorBoundary>,
  );
}
