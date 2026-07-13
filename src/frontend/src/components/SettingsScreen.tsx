import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio";
import type { TitleId } from "../types/game";
import { TITLE_LABELS } from "../types/game";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GameSettings {
  // Audio
  masterVolume: number; // 0–100
  musicVolume: number; // 0–100
  sfxVolume: number; // 0–100
  ambientSound: boolean;
  // Graphics
  particleQuality: "high" | "medium" | "low" | "off";
  weatherEffects: boolean;
  dayNightCycle: boolean;
  smoothCamera: boolean;
  // Gameplay
  autoPickupGold: boolean;
  damageNumbers: boolean;
  killStreaks: boolean;
  chatNotifications: boolean;
  // Accessibility / Performance
  colorblindMode?: boolean;
  reducedMotion?: boolean;
  lowPerformanceMode?: boolean;
  cameraSnap?: boolean;
  // Account
  respawnCity: "meadow_hub" | "aurelion";
  activeTitleId: TitleId;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 75,
  musicVolume: 80,
  sfxVolume: 75,
  ambientSound: true,
  particleQuality: "high",
  weatherEffects: true,
  dayNightCycle: true,
  smoothCamera: true,
  autoPickupGold: true,
  damageNumbers: true,
  killStreaks: true,
  chatNotifications: true,
  colorblindMode: false,
  reducedMotion: false,
  lowPerformanceMode: false,
  cameraSnap: false,
  respawnCity: "meadow_hub",
  activeTitleId: "novice",
};

const SETTINGS_STORAGE_KEY = "pq_game_settings";

export function loadStoredSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettingsLocally(s: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

// ─── Global settings store (module-level singleton) ────────────────────────────
// Allows GameCanvas and other systems to read settings without prop drilling.

let _currentSettings: GameSettings = loadStoredSettings();

export function getCurrentSettings(): GameSettings {
  return _currentSettings;
}

export function applySettingsGlobally(s: GameSettings): void {
  _currentSettings = s;
  saveSettingsLocally(s);
  // Apply audio immediately
  audioEngine.setMasterVolume(s.masterVolume / 100);
  audioEngine.setMusicVolume(s.musicVolume / 100);
  audioEngine.setSfxVolume(s.sfxVolume / 100);
  // Broadcast to any listeners (GameCanvas, etc.)
  window.dispatchEvent(new CustomEvent("pq_settings_changed", { detail: s }));
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "audio" | "graphics" | "gameplay" | "account";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "audio", label: "Audio", icon: "🔊" },
  { id: "graphics", label: "Graphics", icon: "🖼" },
  { id: "gameplay", label: "Gameplay", icon: "⚔" },
  { id: "account", label: "Account", icon: "👤" },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function SettingsLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        color: "oklch(0.70 0 0)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  ocid,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  ocid: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <SettingsLabel>{label}</SettingsLabel>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "oklch(0.85 0.15 55)",
            minWidth: 28,
            textAlign: "right",
          }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-ocid={ocid}
        aria-label={label}
        style={{
          width: "100%",
          height: 6,
          accentColor: "oklch(0.78 0.18 55)",
          cursor: "pointer",
        }}
      />
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  ocid,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  ocid: string;
}) {
  return (
    <div
      className="flex justify-between items-center"
      style={{ minHeight: 44 }}
    >
      <SettingsLabel>{label}</SettingsLabel>
      <button
        type="button"
        onClick={() => onChange(!value)}
        data-ocid={ocid}
        aria-pressed={value}
        aria-label={`${label}: ${value ? "On" : "Off"}`}
        style={{
          width: 52,
          height: 28,
          borderRadius: 14,
          border: `1.5px solid ${value ? "oklch(0.65 0.18 145 / 0.8)" : "oklch(0.35 0 0)"}`,
          background: value ? "oklch(0.45 0.18 145 / 0.35)" : "oklch(0.15 0 0)",
          position: "relative",
          cursor: "pointer",
          transition: "all 0.2s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: value ? 26 : 4,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: value ? "oklch(0.78 0.2 145)" : "oklch(0.50 0 0)",
            transition: "all 0.2s ease",
            boxShadow: value ? "0 0 6px oklch(0.78 0.2 145 / 0.6)" : "none",
          }}
        />
      </button>
    </div>
  );
}

function SelectRow<T extends string>({
  label,
  options,
  value,
  onChange,
  ocid,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ocid: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SettingsLabel>{label}</SettingsLabel>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            data-ocid={`${ocid}.${opt.value}`}
            aria-pressed={value === opt.value}
            style={{
              flex: 1,
              minWidth: 60,
              minHeight: 48,
              padding: "6px 10px",
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.05em",
              cursor: "pointer",
              transition: "all 0.15s ease",
              border:
                value === opt.value
                  ? "1.5px solid oklch(0.78 0.18 55)"
                  : "1.5px solid oklch(0.28 0 0)",
              background:
                value === opt.value
                  ? "oklch(0.45 0.14 55 / 0.3)"
                  : "oklch(0.13 0 0)",
              color:
                value === opt.value ? "oklch(0.88 0.15 55)" : "oklch(0.55 0 0)",
              boxShadow:
                value === opt.value
                  ? "0 0 8px oklch(0.78 0.18 55 / 0.25)"
                  : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" style={{ margin: "8px 0 4px" }}>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: "0.2em",
          color: "oklch(0.50 0.10 55)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 1,
          background: "oklch(0.28 0.05 55 / 0.4)",
        }}
      />
    </div>
  );
}

// ─── Main SettingsScreen component ────────────────────────────────────────────

export interface SettingsScreenProps {
  onBack: () => void;
  onLogout?: () => void;
  currentPrincipal?: string;
  earnedTitles?: TitleId[];
  activeTitleId?: TitleId;
  context: "character_select" | "in_game";
  isGuest?: boolean;
}

export function SettingsScreen({
  onBack,
  onLogout,
  currentPrincipal,
  earnedTitles = ["novice"],
  activeTitleId: externalActiveTitleId = "novice",
  context,
  isGuest = false,
}: SettingsScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>("audio");
  const [settings, setSettings] = useState<GameSettings>(() => {
    const stored = loadStoredSettings();
    // Override activeTitleId from external (live game state)
    return { ...stored, activeTitleId: externalActiveTitleId };
  });

  // Debounce timer for saving to canister
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether backdrop was clicked to close
  const backdropRef = useRef<HTMLDivElement>(null);

  // Apply settings immediately when they change
  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      applySettingsGlobally(next);
      // Debounced canister save (500ms)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        // Future: savePlayerSettings(next)
        saveSettingsLocally(next);
      }, 500);
      return next;
    });
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveSettingsLocally(settings);
      }
    };
  }, [settings]);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    applySettingsGlobally(settings);
    saveSettingsLocally(settings);
    onBack();
  }, [onBack, settings]);

  const handleLogout = useCallback(() => {
    applySettingsGlobally(settings);
    saveSettingsLocally(settings);
    onLogout?.();
  }, [onLogout, settings]);

  const truncatePrincipal = (p: string) => {
    if (p.length <= 14) return p;
    return `${p.slice(0, 8)}...${p.slice(-4)}`;
  };

  // ── Tab content renderers ────────────────────────────────────────────────────

  const renderAudioTab = () => (
    <div className="flex flex-col gap-5">
      <SectionDivider label="Volume" />
      <SliderRow
        label="Master Volume"
        value={settings.masterVolume}
        onChange={(v) => updateSettings({ masterVolume: v })}
        ocid="settings.master_volume"
      />
      <SliderRow
        label="Music Volume"
        value={settings.musicVolume}
        onChange={(v) => updateSettings({ musicVolume: v })}
        ocid="settings.music_volume"
      />
      <SliderRow
        label="SFX Volume"
        value={settings.sfxVolume}
        onChange={(v) => updateSettings({ sfxVolume: v })}
        ocid="settings.sfx_volume"
      />
      <SectionDivider label="Options" />
      <ToggleRow
        label="Ambient Sound"
        value={settings.ambientSound}
        onChange={(v) => updateSettings({ ambientSound: v })}
        ocid="settings.ambient_sound"
      />
    </div>
  );

  const renderGraphicsTab = () => (
    <div className="flex flex-col gap-5">
      <SectionDivider label="Quality" />
      <SelectRow
        label="Particle Quality"
        value={settings.particleQuality}
        options={[
          { value: "high", label: "High" },
          { value: "medium", label: "Med" },
          { value: "low", label: "Low" },
          { value: "off", label: "Off" },
        ]}
        onChange={(v) => updateSettings({ particleQuality: v })}
        ocid="settings.particles"
      />
      <SectionDivider label="Effects" />
      <ToggleRow
        label="Weather Effects"
        value={settings.weatherEffects}
        onChange={(v) => updateSettings({ weatherEffects: v })}
        ocid="settings.weather_effects"
      />
      <ToggleRow
        label="Day/Night Cycle"
        value={settings.dayNightCycle}
        onChange={(v) => updateSettings({ dayNightCycle: v })}
        ocid="settings.day_night_cycle"
      />
      <ToggleRow
        label="Smooth Camera"
        value={settings.smoothCamera}
        onChange={(v) => updateSettings({ smoothCamera: v })}
        ocid="settings.smooth_camera"
      />
      <SectionDivider label="Accessibility" />
      <ToggleRow
        label="Colorblind Mode"
        value={settings.colorblindMode ?? false}
        onChange={(v) => updateSettings({ colorblindMode: v })}
        ocid="settings.colorblind_mode"
      />
      <ToggleRow
        label="Reduced Motion"
        value={settings.reducedMotion ?? false}
        onChange={(v) => updateSettings({ reducedMotion: v })}
        ocid="settings.reduced_motion"
      />
      <SectionDivider label="Performance" />
      <ToggleRow
        label="Low Performance Mode"
        value={settings.lowPerformanceMode ?? false}
        onChange={(v) => updateSettings({ lowPerformanceMode: v })}
        ocid="settings.low_performance_mode"
      />
    </div>
  );

  const renderGameplayTab = () => (
    <div className="flex flex-col gap-5">
      <SectionDivider label="Convenience" />
      <ToggleRow
        label="Auto-pickup Gold"
        value={settings.autoPickupGold}
        onChange={(v) => updateSettings({ autoPickupGold: v })}
        ocid="settings.auto_pickup_gold"
      />
      <SectionDivider label="Camera" />
      <ToggleRow
        label="Camera Snap"
        value={settings.cameraSnap ?? false}
        onChange={(v) => updateSettings({ cameraSnap: v })}
        ocid="settings.camera_snap"
      />
      <SectionDivider label="UI Feedback" />
      <ToggleRow
        label="Damage Numbers"
        value={settings.damageNumbers}
        onChange={(v) => updateSettings({ damageNumbers: v })}
        ocid="settings.damage_numbers"
      />
      <ToggleRow
        label="Kill Streaks"
        value={settings.killStreaks}
        onChange={(v) => updateSettings({ killStreaks: v })}
        ocid="settings.kill_streaks"
      />
      <ToggleRow
        label="Chat Notifications"
        value={settings.chatNotifications}
        onChange={(v) => updateSettings({ chatNotifications: v })}
        ocid="settings.chat_notifications"
      />
    </div>
  );

  const renderAccountTab = () => (
    <div className="flex flex-col gap-5">
      {/* Principal */}
      {currentPrincipal && !isGuest && (
        <>
          <SectionDivider label="Identity" />
          <div className="flex flex-col gap-1">
            <SettingsLabel>Internet Identity</SettingsLabel>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "oklch(0.65 0.10 260)",
                background: "oklch(0.10 0.02 260 / 0.5)",
                border: "1px solid oklch(0.28 0.05 260 / 0.5)",
                borderRadius: 6,
                padding: "6px 10px",
                letterSpacing: "0.03em",
                wordBreak: "break-all",
              }}
              data-ocid="settings.principal_display"
            >
              {truncatePrincipal(currentPrincipal)}
            </span>
          </div>
        </>
      )}

      {isGuest && (
        <>
          <SectionDivider label="Identity" />
          <div
            style={{
              background: "oklch(0.10 0.03 55 / 0.4)",
              border: "1px solid oklch(0.30 0.08 55 / 0.5)",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "oklch(0.65 0.12 55)",
              }}
            >
              👤 Guest Mode — no saving, no titles
            </span>
          </div>
        </>
      )}

      {/* Respawn City */}
      <SectionDivider label="Respawn" />
      <SelectRow
        label="Home Respawn City"
        value={settings.respawnCity}
        options={[
          { value: "meadow_hub", label: "Meadow Hub" },
          { value: "aurelion", label: "Aurelion" },
        ]}
        onChange={(v) => updateSettings({ respawnCity: v })}
        ocid="settings.respawn_city"
      />

      {/* Active Title */}
      {!isGuest && earnedTitles.length > 0 && (
        <>
          <SectionDivider label="Title" />
          <div className="flex flex-col gap-2">
            <SettingsLabel>Active Title</SettingsLabel>
            <div
              className="flex flex-col gap-2"
              style={{ maxHeight: 160, overflowY: "auto" }}
            >
              {earnedTitles.map((titleId) => {
                const label = TITLE_LABELS[titleId] ?? titleId;
                const isActive = settings.activeTitleId === titleId;
                return (
                  <button
                    key={titleId}
                    type="button"
                    onClick={() => updateSettings({ activeTitleId: titleId })}
                    data-ocid={`settings.title.${titleId}`}
                    aria-pressed={isActive}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      border: isActive
                        ? "1.5px solid oklch(0.78 0.18 55)"
                        : "1.5px solid oklch(0.28 0 0)",
                      background: isActive
                        ? "oklch(0.35 0.12 55 / 0.35)"
                        : "oklch(0.12 0 0)",
                      color: isActive
                        ? "oklch(0.90 0.18 55)"
                        : "oklch(0.60 0 0)",
                      boxShadow: isActive
                        ? "0 0 8px oklch(0.78 0.18 55 / 0.3)"
                        : "none",
                    }}
                  >
                    {isActive ? "✦ " : "  "}[{label}]
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Logout */}
      {onLogout && !isGuest && (
        <>
          <SectionDivider label="Session" />
          <button
            type="button"
            onClick={handleLogout}
            data-ocid="settings.logout_button"
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              border: "1.5px solid oklch(0.55 0.22 25 / 0.7)",
              background: "oklch(0.22 0.08 25 / 0.35)",
              color: "oklch(0.75 0.20 25)",
              transition: "all 0.15s ease",
              textTransform: "uppercase",
              minHeight: 48,
            }}
          >
            ⏻ Logout
          </button>
        </>
      )}
    </div>
  );

  const tabContent: Record<Tab, React.ReactNode> = {
    audio: renderAudioTab(),
    graphics: renderGraphicsTab(),
    gameplay: renderGameplayTab(),
    account: renderAccountTab(),
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 500,
        background: "oklch(0 0 0 / 0.72)",
        backdropFilter: "blur(3px)",
        padding: "16px",
      }}
      data-ocid="settings.dialog"
    >
      <dialog
        open
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "oklch(0.08 0.01 260)",
          border: "2px solid oklch(0.55 0.18 55 / 0.6)",
          borderRadius: 12,
          boxShadow:
            "0 0 40px oklch(0.55 0.18 55 / 0.15), 0 20px 60px oklch(0 0 0 / 0.6)",
          overflow: "hidden",
          padding: 0,
          position: "relative",
          margin: 0,
        }}
        aria-label="Game Settings"
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid oklch(0.28 0.05 260 / 0.6)",
            background: "oklch(0.10 0.02 260 / 0.8)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            data-ocid="settings.close_button"
            aria-label="Back to game"
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: "1px solid oklch(0.30 0.05 260 / 0.6)",
              background: "oklch(0.12 0.02 260 / 0.8)",
              color: "oklch(0.70 0.08 260)",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            ←
          </button>

          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "oklch(0.88 0.14 55)",
              textTransform: "uppercase",
            }}
          >
            ⚙ Settings
          </span>

          <div
            style={{
              width: 44,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: "oklch(0.40 0 0)",
              textAlign: "right",
              letterSpacing: "0.04em",
            }}
          >
            {context === "in_game" ? "in-game" : "lobby"}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid oklch(0.22 0.03 260 / 0.6)",
            background: "oklch(0.09 0.015 260)",
            flexShrink: 0,
          }}
          role="tablist"
          aria-label="Settings tabs"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                data-ocid={`settings.tab.${tab.id}`}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: "10px 4px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  border: "none",
                  borderBottom: isActive
                    ? "2px solid oklch(0.78 0.18 55)"
                    : "2px solid transparent",
                  background: "transparent",
                  color: isActive ? "oklch(0.88 0.15 55)" : "oklch(0.50 0 0)",
                  transition: "all 0.15s ease",
                  textTransform: "uppercase",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 16 }} aria-hidden="true">
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
          }}
          role="tabpanel"
          aria-label={`${activeTab} settings`}
        >
          {tabContent[activeTab]}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid oklch(0.18 0.02 260 / 0.5)",
            background: "oklch(0.07 0.01 260 / 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: "oklch(0.35 0 0)",
              letterSpacing: "0.04em",
            }}
          >
            Settings saved automatically
          </span>
          <button
            type="button"
            onClick={handleBack}
            data-ocid="settings.back_button"
            style={{
              padding: "8px 20px",
              minHeight: 48,
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              border: "1.5px solid oklch(0.55 0.18 55 / 0.6)",
              background: "oklch(0.30 0.10 55 / 0.25)",
              color: "oklch(0.80 0.15 55)",
              transition: "all 0.15s ease",
              textTransform: "uppercase",
            }}
          >
            Done
          </button>
        </div>
      </dialog>
    </div>
  );
}
