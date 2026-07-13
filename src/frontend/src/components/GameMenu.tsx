import { useState } from "react";
import type { CharacterClass } from "../types/game";

// ─── Types ──────────────────────────────────────────────────────────────────

type SubPanel =
  | null
  | "backpack"
  | "outfit"
  | "skills"
  | "stats"
  | "settings"
  | "world_map"
  | "quests"
  | "titles"
  | "friends";

interface GameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  characterClass: CharacterClass;
  username: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  coins: number;
  isGuest: boolean;
  onLogout: () => void;
}

// ─── Menu item definition ─────────────────────────────────────────────────────

const MENU_ITEMS: Array<{ id: SubPanel; icon: string; label: string }> = [
  { id: "backpack", icon: "🏵", label: "BACKPACK" },
  { id: "outfit", icon: "👕", label: "OUTFIT" },
  { id: "world_map", icon: "🗺", label: "MAP" },
  { id: "skills", icon: "⚔", label: "SKILLS" },
  { id: "quests", icon: "🏆", label: "QUESTS" },
  { id: "titles", icon: "🏅", label: "TITLES" },
  { id: "friends", icon: "👥", label: "FRIENDS" },
  { id: "stats", icon: "📊", label: "STATS" },
  { id: "settings", icon: "⚙", label: "SETTINGS" },
];

// Warrior / Mage skill trees
const WARRIOR_SKILLS = [
  {
    id: "iron_skin",
    name: "Iron Skin",
    desc: "+12 max HP per point",
    icon: "🛡",
  },
  {
    id: "blade_master",
    name: "Blade Master",
    desc: "+8% attack per point",
    icon: "⚔",
  },
  {
    id: "shield_expert",
    name: "Shield Expert",
    desc: "-5 MP shield cost per point",
    icon: "🛡",
  },
  {
    id: "endurance",
    name: "Endurance",
    desc: "+3 HP regen/tick per point",
    icon: "❤",
  },
];
const MAGE_SKILLS = [
  {
    id: "arcane_mind",
    name: "Arcane Mind",
    desc: "+10 max MP per point",
    icon: "🔵",
  },
  {
    id: "spell_power",
    name: "Spell Power",
    desc: "+10% spell dmg per point",
    icon: "✨",
  },
  {
    id: "mana_flow",
    name: "Mana Flow",
    desc: "+3 MP regen/tick per point",
    icon: "💧",
  },
  {
    id: "frost_mastery",
    name: "Frost Mastery",
    desc: "+0.5s Frost slow per point",
    icon: "❄",
  },
];

// ─── Shared styles ─────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  background: "rgba(5,5,18,0.97)",
  borderTop: "1.5px solid rgba(212,175,55,0.4)",
  zIndex: 80,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  animation: "menuSlideUp 0.22s cubic-bezier(0.22,1,0.36,1)",
  maxHeight: "68%",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.18em",
  color: "#d4af37",
  textTransform: "uppercase" as const,
};

const closeButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "50%",
  cursor: "pointer",
  color: "rgba(255,255,255,0.6)",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  WebkitTapHighlightColor: "transparent",
};

// ─── Sub-panel back button ──────────────────────────────────────────────────────────

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      aria-label="Back to menu"
      data-ocid="game-menu.back_button"
      onClick={onBack}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#d4af37",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.08em",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 4px",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      ← BACK
    </button>
  );
}

// ─── Stats Sub-panel ────────────────────────────────────────────────────────────────

function StatsPanel({
  username,
  characterClass,
  level,
  hp,
  maxHp,
  mp,
  maxMp,
}: {
  username: string;
  characterClass: CharacterClass;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
}) {
  const classLabel = characterClass === "warrior" ? "Warrior" : "Mage";
  const classColor = characterClass === "warrior" ? "#ff6644" : "#44aaff";
  const baseAtk = characterClass === "warrior" ? 20 : 15;
  const atk = Math.ceil(baseAtk * 1.05 ** (level - 1));

  return (
    <div
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: `${classColor}22`,
            border: `2px solid ${classColor}66`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          {characterClass === "warrior" ? "⚔" : "🔮"}
        </div>
        <div>
          <div
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: 13,
              color: "#fff",
            }}
          >
            {username}
          </div>
          <div
            style={{ fontFamily: "monospace", fontSize: 10, color: classColor }}
          >
            Lv.{level} {classLabel}
          </div>
        </div>
      </div>
      {(
        [
          ["HP", hp, maxHp, "#ff4444"],
          ["MP", mp, maxMp, "#44aaff"],
          ["ATK", atk, atk, "#ff8833"],
        ] as [string, number, number, string][]
      ).map(([label, val, max, color]) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "#aaa",
              width: 32,
            }}
          >
            {label}
          </div>
          <div
            style={{
              flex: 1,
              height: 6,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (val / max) * 100)}%`,
                background: color,
                borderRadius: 3,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "#ccc",
              minWidth: 50,
              textAlign: "right",
            }}
          >
            {val}/{max}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skills Sub-panel ────────────────────────────────────────────────────────────────

function SkillsPanel({
  characterClass,
  isGuest,
}: {
  characterClass: CharacterClass;
  isGuest: boolean;
}) {
  const [skillPoints, setSkillPoints] = useState(isGuest ? 0 : 2);
  const [invested, setInvested] = useState<Record<string, number>>({});
  const skills = characterClass === "warrior" ? WARRIOR_SKILLS : MAGE_SKILLS;
  const classColor = characterClass === "warrior" ? "#ff6644" : "#44aaff";

  const invest = (id: string) => {
    if (skillPoints <= 0 || isGuest) return;
    setSkillPoints((p) => p - 1);
    setInvested((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          color: "#d4af37",
          marginBottom: 4,
        }}
      >
        Skill Points: <strong>{skillPoints}</strong>
        {isGuest && " (unavailable for guests)"}
      </div>
      {skills.map((skill) => {
        const pts = invested[skill.id] ?? 0;
        return (
          <div
            key={skill.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${pts > 0 ? `${classColor}44` : "rgba(255,255,255,0.08)"}`,
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 18 }}>{skill.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {skill.name}{" "}
                {pts > 0 && <span style={{ color: classColor }}>+{pts}</span>}
              </div>
              <div
                style={{ fontFamily: "monospace", fontSize: 10, color: "#888" }}
              >
                {skill.desc}
              </div>
            </div>
            <button
              type="button"
              onClick={() => invest(skill.id)}
              disabled={skillPoints <= 0 || isGuest}
              data-ocid={`game-menu.skill-invest.${skill.id}`}
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background:
                  skillPoints > 0 && !isGuest
                    ? `${classColor}33`
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${skillPoints > 0 && !isGuest ? classColor : "rgba(255,255,255,0.12)"}`,
                color: skillPoints > 0 && !isGuest ? classColor : "#444",
                fontSize: 16,
                cursor: skillPoints > 0 && !isGuest ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings Sub-panel ──────────────────────────────────────────────────────────────

function SettingsSubPanel({
  isGuest,
  onLogout,
}: {
  isGuest: boolean;
  onLogout: () => void;
}) {
  const [masterVol, setMasterVol] = useState(80);
  const [particles, setParticles] = useState<"high" | "medium" | "low" | "off">(
    "high",
  );
  const [autoGold, setAutoGold] = useState(true);
  const [showDmg, setShowDmg] = useState(true);

  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
      }}
    >
      {/* Volume slider */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa" }}>
          Master Volume: {masterVol}%
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={masterVol}
          onChange={(e) => setMasterVol(Number(e.target.value))}
          data-ocid="game-menu.settings.master-volume"
          style={{ width: "100%", accentColor: "#d4af37" }}
        />
      </div>

      {/* Particles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa" }}>
          Particles
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["high", "medium", "low", "off"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setParticles(opt)}
              data-ocid={`game-menu.settings.particles-${opt}`}
              style={{
                flex: 1,
                padding: "5px 2px",
                fontFamily: "monospace",
                fontSize: 9,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
                background:
                  particles === opt
                    ? "rgba(212,175,55,0.2)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${particles === opt ? "#d4af37" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 4,
                color: particles === opt ? "#d4af37" : "#555",
                cursor: "pointer",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      {[
        {
          label: "Auto-pickup Gold",
          value: autoGold,
          set: setAutoGold,
          id: "auto-gold",
        },
        {
          label: "Damage Numbers",
          value: showDmg,
          set: setShowDmg,
          id: "show-dmg",
        },
      ].map(({ label, value, set, id }) => (
        <div
          key={id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa" }}>
            {label}
          </div>
          <button
            type="button"
            onClick={() => set((v: boolean) => !v)}
            data-ocid={`game-menu.settings.${id}`}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              background: value
                ? "rgba(72,200,100,0.4)"
                : "rgba(255,255,255,0.06)",
              border: `1px solid ${value ? "#48c864" : "rgba(255,255,255,0.1)"}`,
              cursor: "pointer",
              position: "relative",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 3,
                left: value ? 21 : 3,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: value ? "#48c864" : "#555",
                transition: "all 0.2s ease",
              }}
            />
          </button>
        </div>
      ))}

      {/* Logout */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <button
          type="button"
          onClick={onLogout}
          data-ocid="game-menu.logout_button"
          style={{
            width: "100%",
            padding: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.10em",
            background: "rgba(180,30,30,0.2)",
            border: "1.5px solid rgba(220,60,60,0.5)",
            borderRadius: 6,
            color: "#ff6666",
            cursor: "pointer",
          }}
        >
          {isGuest ? "LEAVE GAME" : "LOGOUT"}
        </button>
      </div>
    </div>
  );
}

// ─── Generic placeholder for unfinished sub-panels ──────────────────────────────────

function PlaceholderPanel({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        color: "#555",
      }}
    >
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
        }}
      >
        {label} — coming soon
      </div>
    </div>
  );
}

// ─── Main GameMenu component ────────────────────────────────────────────────────────

export function GameMenu({
  isOpen,
  onClose,
  characterClass,
  username,
  level,
  hp,
  maxHp,
  mp,
  maxMp,
  coins,
  isGuest,
  onLogout,
}: GameMenuProps) {
  const [activePanel, setActivePanel] = useState<SubPanel>(null);

  if (!isOpen) return null;

  const activeItem = MENU_ITEMS.find((m) => m.id === activePanel);

  const renderSubPanel = () => {
    switch (activePanel) {
      case "stats":
        return (
          <StatsPanel
            username={username}
            characterClass={characterClass}
            level={level}
            hp={hp}
            maxHp={maxHp}
            mp={mp}
            maxMp={maxMp}
          />
        );
      case "skills":
        return (
          <SkillsPanel characterClass={characterClass} isGuest={isGuest} />
        );
      case "settings":
        return <SettingsSubPanel isGuest={isGuest} onLogout={onLogout} />;
      default:
        return (
          <PlaceholderPanel
            icon={activeItem?.icon ?? "❓"}
            label={activeItem?.label ?? ""}
          />
        );
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: game overlay panel
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game Menu"
      data-ocid="game-menu.panel"
      style={panelStyle}
    >
      {/* Header */}
      <div style={headerStyle}>
        {activePanel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BackBtn onBack={() => setActivePanel(null)} />
            <span style={titleStyle}>
              {activeItem?.icon} {activeItem?.label}
            </span>
          </div>
        ) : (
          <span style={titleStyle}>☰ MENU</span>
        )}
        <button
          type="button"
          aria-label="Close game menu"
          data-ocid="game-menu.close_button"
          onClick={onClose}
          style={closeButtonStyle}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {activePanel === null ? (
          // Main grid
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              padding: 12,
            }}
          >
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-ocid={`game-menu.${item.id}_button`}
                onClick={() => setActivePanel(item.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                  padding: "12px 8px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                  minHeight: 72,
                  transition: "background 0.15s",
                }}
              >
                <div style={{ fontSize: 24 }}>{item.icon}</div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    color: "#aaa",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {item.label}
                </div>
              </button>
            ))}
          </div>
        ) : (
          renderSubPanel()
        )}
      </div>

      {/* Coins footer (only on main panel) */}
      {activePanel === null && (
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14 }}>💰</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 700,
              color: "#d4af37",
            }}
          >
            {coins.toLocaleString()} Gold
          </span>
          {isGuest && (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: "#555",
                marginLeft: 8,
              }}
            >
              (guest — saves disabled)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
