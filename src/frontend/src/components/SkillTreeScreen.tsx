import { useEffect, useState } from "react";
import {
  MAGE_SKILLS,
  WARRIOR_SKILLS,
  encodeSkillTree,
  getSkillBonuses,
  parseSkillTree,
  totalSpentPoints,
} from "../lib/skillTree";
import type { SkillDef, SkillTreeData } from "../lib/skillTree";
import type { CharacterClass } from "../types/game";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SkillTreeScreenProps {
  isOpen: boolean;
  playerClass: CharacterClass;
  playerLevel: number;
  playerCoins: number;
  /** [] | [bigint] from backend */
  skillPointsRaw: [] | [bigint];
  /** JSON string from backend, or null */
  skillTreeJson: string | null;
  isGuest: boolean;
  onSpendPoint: (encodedTree: string) => void;
  onResetTree: (newCoins: number) => void;
  onClose: () => void;
}

const RESET_COST = 200;

// ─── SkillTreeScreen ──────────────────────────────────────────────────────────

export function SkillTreeScreen({
  isOpen,
  playerClass,
  playerLevel,
  playerCoins,
  skillPointsRaw,
  skillTreeJson,
  isGuest,
  onSpendPoint,
  onResetTree,
  onClose,
}: SkillTreeScreenProps) {
  const [visible, setVisible] = useState(false);
  const [confirmSkill, setConfirmSkill] = useState<SkillDef | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const skillPoints = skillPointsRaw.length > 0 ? Number(skillPointsRaw[0]) : 0;
  const treeData = parseSkillTree(skillTreeJson);
  const spent = totalSpentPoints(treeData);
  // Available = total ever earned (level - 1) minus already spent
  const totalEarned = Math.max(0, playerLevel - 1);
  const available = Math.max(0, totalEarned - spent + skillPoints);
  const bonuses = getSkillBonuses(treeData, playerClass);
  const skills = playerClass === "warrior" ? WARRIOR_SKILLS : MAGE_SKILLS;

  // Slide-up animation
  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (confirmSkill) {
          setConfirmSkill(null);
        } else if (confirmReset) {
          setConfirmReset(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [isOpen, confirmSkill, confirmReset, onClose]);

  if (!isOpen) return null;

  function getCurrentPoints(skill: SkillDef): number {
    if (playerClass === "warrior") {
      return treeData.warriorSkills[
        skill.id as keyof typeof treeData.warriorSkills
      ];
    }
    return treeData.mageSkills[skill.id as keyof typeof treeData.mageSkills];
  }

  function handleSpend(skill: SkillDef) {
    const current = getCurrentPoints(skill);
    if (current >= skill.maxPoints || available <= 0) return;
    const updated: SkillTreeData = {
      warriorSkills: { ...treeData.warriorSkills },
      mageSkills: { ...treeData.mageSkills },
    };
    if (playerClass === "warrior") {
      updated.warriorSkills = {
        ...treeData.warriorSkills,
        [skill.id]: current + 1,
      };
    } else {
      updated.mageSkills = {
        ...treeData.mageSkills,
        [skill.id]: current + 1,
      };
    }
    onSpendPoint(encodeSkillTree(updated));
    setConfirmSkill(null);
  }

  function handleReset() {
    if (playerCoins < RESET_COST) return;
    onResetTree(playerCoins - RESET_COST);
    setConfirmReset(false);
  }

  const classColor =
    playerClass === "warrior" ? "oklch(0.72 0.20 25)" : "oklch(0.68 0.18 270)";
  const classIcon = playerClass === "warrior" ? "⚔" : "✦";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{
          background: "rgba(0,0,0,0.6)",
          zIndex: 200,
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        aria-hidden="true"
        data-ocid="skill-tree.backdrop"
      />

      {/* Panel */}
      <dialog
        open
        className="fixed inset-x-0 bottom-0 flex justify-center bg-transparent p-0 m-0 max-w-none max-h-none w-full"
        style={{ zIndex: 201, pointerEvents: "none", border: "none" }}
        data-ocid="skill-tree.dialog"
        aria-label="Skill Tree"
      >
        <div
          style={{
            width: "min(520px, 100vw)",
            maxHeight: "90vh",
            background: "rgba(6,6,10,0.97)",
            border: `1px solid ${classColor}44`,
            borderBottom: "none",
            borderRadius: "10px 10px 0 0",
            boxShadow: `0 -8px 48px rgba(0,0,0,0.75), 0 0 0 1px ${classColor}18`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
            transform: visible ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 12px",
              borderBottom: "1px solid oklch(0.20 0 0 / 0.8)",
              flexShrink: 0,
              background: `linear-gradient(to right, ${classColor}12, transparent)`,
            }}
            data-ocid="skill-tree.header"
          >
            <div className="flex flex-col gap-0.5">
              <div
                className="font-mono font-bold uppercase tracking-widest"
                style={{
                  fontSize: "clamp(0.85rem, 3vw, 1rem)",
                  color: classColor,
                  textShadow: `0 0 14px ${classColor}55`,
                  letterSpacing: "0.18em",
                }}
              >
                {classIcon} Skill Tree
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 9,
                  color: "oklch(0.40 0 0)",
                  letterSpacing: "0.08em",
                }}
              >
                {playerClass.toUpperCase()} · Level {playerLevel}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Points available badge */}
              <div
                data-ocid="skill-tree.points_available"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  background:
                    available > 0
                      ? "rgba(255,232,124,0.10)"
                      : "oklch(0.12 0 0)",
                  border:
                    available > 0
                      ? "1px solid rgba(255,232,124,0.45)"
                      : "1px solid oklch(0.22 0 0)",
                  borderRadius: 4,
                }}
              >
                <span style={{ fontSize: 11 }}>⬡</span>
                <span
                  className="font-mono font-bold"
                  style={{
                    fontSize: 12,
                    color: available > 0 ? "#FFE87C" : "oklch(0.38 0 0)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {available}
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    color: "oklch(0.40 0 0)",
                    letterSpacing: "0.06em",
                  }}
                >
                  pts
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                data-ocid="skill-tree.close_button"
                style={{
                  width: 34,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "oklch(0.50 0 0)",
                  border: "1px solid oklch(0.24 0 0 / 0.7)",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: "transparent",
                  fontSize: 14,
                  transition: "color 0.12s, border-color 0.12s",
                  flexShrink: 0,
                }}
                aria-label="Close skill tree"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Content ── */}
          <div style={{ flex: 1, overflow: "auto", padding: "14px 12px 8px" }}>
            {isGuest ? (
              <GuestLock />
            ) : (
              <>
                {/* 2×2 skill grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                  data-ocid="skill-tree.grid"
                >
                  {skills.map((skill) => {
                    const current = getCurrentPoints(skill);
                    const canSpend = available > 0 && current < skill.maxPoints;
                    return (
                      <SkillNode
                        key={skill.id}
                        skill={skill}
                        current={current}
                        canSpend={canSpend}
                        classColor={classColor}
                        onTap={() => canSpend && setConfirmSkill(skill)}
                      />
                    );
                  })}
                </div>

                {/* Bonus summary */}
                <BonusSummary bonuses={bonuses} playerClass={playerClass} />
              </>
            )}
          </div>

          {/* ── Reset Footer ── */}
          {!isGuest && (
            <div
              style={{
                padding: "10px 14px 16px",
                borderTop: "1px solid oklch(0.18 0 0)",
                flexShrink: 0,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: "oklch(0.38 0 0)" }}
                  >
                    🪙
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      color:
                        playerCoins >= RESET_COST
                          ? "oklch(0.65 0.14 90)"
                          : "oklch(0.42 0 0)",
                    }}
                    data-ocid="skill-tree.gold_display"
                  >
                    {playerCoins} gold
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    spent > 0 &&
                    playerCoins >= RESET_COST &&
                    setConfirmReset(true)
                  }
                  disabled={spent === 0 || playerCoins < RESET_COST}
                  data-ocid="skill-tree.reset_button"
                  style={{
                    padding: "8px 16px",
                    minHeight: 40,
                    background:
                      spent > 0 && playerCoins >= RESET_COST
                        ? "rgba(220,50,50,0.15)"
                        : "oklch(0.10 0 0)",
                    border:
                      spent > 0 && playerCoins >= RESET_COST
                        ? "1px solid rgba(220,50,50,0.45)"
                        : "1px solid oklch(0.20 0 0)",
                    borderRadius: 4,
                    color:
                      spent > 0 && playerCoins >= RESET_COST
                        ? "oklch(0.72 0.20 25)"
                        : "oklch(0.32 0 0)",
                    cursor:
                      spent > 0 && playerCoins >= RESET_COST
                        ? "pointer"
                        : "not-allowed",
                    fontFamily: "monospace",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  aria-label={`Reset all skills for ${RESET_COST} gold`}
                >
                  Reset All — {RESET_COST} gold
                </button>
              </div>
              <p
                className="font-mono text-center mt-2"
                style={{ fontSize: 9, color: "oklch(0.28 0 0)" }}
              >
                {spent} points allocated · full reset only
              </p>
            </div>
          )}
        </div>
      </dialog>

      {/* ── Confirm Spend Popup ── */}
      {confirmSkill && (
        <ConfirmPopup
          title={`Spend 1 point on ${confirmSkill.name}?`}
          body={confirmSkill.bonusPerPoint}
          confirmLabel="Confirm"
          onConfirm={() => handleSpend(confirmSkill)}
          onCancel={() => setConfirmSkill(null)}
          accentColor={classColor}
        />
      )}

      {/* ── Confirm Reset Popup ── */}
      {confirmReset && (
        <ConfirmPopup
          title="Reset all skill points?"
          body={`This will cost ${RESET_COST} gold. All points will be refunded.`}
          confirmLabel={`Pay ${RESET_COST} gold`}
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
          accentColor="oklch(0.72 0.20 25)"
          danger
        />
      )}
    </>
  );
}

// ─── Skill Node ───────────────────────────────────────────────────────────────

function SkillNode({
  skill,
  current,
  canSpend,
  classColor,
  onTap,
}: {
  skill: SkillDef;
  current: number;
  canSpend: boolean;
  classColor: string;
  onTap: () => void;
}) {
  const isFull = current >= skill.maxPoints;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!canSpend}
      data-ocid={`skill-tree.skill.${skill.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 12px 10px",
        minHeight: 130,
        background: isFull
          ? `${classColor}14`
          : canSpend
            ? "rgba(255,232,124,0.05)"
            : "rgba(255,255,255,0.02)",
        border: isFull
          ? `1px solid ${classColor}55`
          : canSpend
            ? "1px solid rgba(255,232,124,0.25)"
            : "1px solid oklch(0.20 0 0)",
        borderRadius: 6,
        cursor: canSpend ? "pointer" : "default",
        textAlign: "left",
        transition: "background 0.15s, border-color 0.15s",
      }}
      aria-label={`${skill.name}: ${current}/${skill.maxPoints} points. ${canSpend ? "Tap to spend a point." : isFull ? "Maxed out." : "No points available."}`}
    >
      {/* Icon + Name row */}
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
          {skill.icon}
        </span>
        <span
          className="font-mono font-bold"
          style={{
            fontSize: 11,
            color: isFull
              ? classColor
              : canSpend
                ? "#FFE87C"
                : "oklch(0.55 0 0)",
            letterSpacing: "0.04em",
            textShadow: isFull ? `0 0 8px ${classColor}66` : "none",
          }}
        >
          {skill.name}
        </span>
        {canSpend && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              fontFamily: "monospace",
              padding: "1px 5px",
              background: "rgba(255,232,124,0.12)",
              border: "1px solid rgba(255,232,124,0.35)",
              borderRadius: 2,
              color: "#FFE87C",
              flexShrink: 0,
            }}
          >
            TAP
          </span>
        )}
      </div>

      {/* Description */}
      <p
        className="font-mono"
        style={{
          fontSize: 9,
          color: "oklch(0.42 0 0)",
          lineHeight: 1.5,
          letterSpacing: "0.02em",
          flex: 1,
        }}
      >
        {skill.description}
      </p>

      {/* Bonus text */}
      <p
        className="font-mono"
        style={{
          fontSize: 9,
          color: isFull ? classColor : "oklch(0.52 0 0)",
          letterSpacing: "0.04em",
        }}
      >
        {skill.bonusPerPoint}
      </p>

      {/* Point dots */}
      <div className="flex items-center justify-between">
        <div
          className="flex gap-1.5"
          aria-label={`${current} of ${skill.maxPoints} points spent`}
        >
          {Array.from({ length: skill.maxPoints }).map((_, i) => (
            <span
              key={`${skill.id}-dot-${i}`}
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: i < current ? classColor : "transparent",
                border: `1.5px solid ${i < current ? classColor : "oklch(0.28 0 0)"}`,
                display: "inline-block",
                boxShadow: i < current ? `0 0 4px ${classColor}88` : "none",
                transition: "background 0.15s, box-shadow 0.15s",
              }}
              aria-hidden="true"
            />
          ))}
        </div>
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            color: isFull ? classColor : "oklch(0.38 0 0)",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          {current}/{skill.maxPoints}
        </span>
      </div>
    </button>
  );
}

// ─── Bonus Summary ────────────────────────────────────────────────────────────

function BonusSummary({
  bonuses,
  playerClass,
}: {
  bonuses: ReturnType<typeof getSkillBonuses>;
  playerClass: CharacterClass;
}) {
  const lines =
    playerClass === "warrior"
      ? [
          {
            label: "Max HP Bonus",
            value: `+${bonuses.maxHpBonus}%`,
            active: bonuses.maxHpBonus > 0,
          },
          {
            label: "Attack Bonus",
            value: `+${bonuses.attackBonus}%`,
            active: bonuses.attackBonus > 0,
          },
          {
            label: "Shield MP Reduction",
            value: `-${bonuses.shieldMpCostReduction}%`,
            active: bonuses.shieldMpCostReduction > 0,
          },
          {
            label: "HP Regen Bonus",
            value: `+${bonuses.hpRegenBonus}%`,
            active: bonuses.hpRegenBonus > 0,
          },
        ]
      : [
          {
            label: "Max MP Bonus",
            value: `+${bonuses.maxMpBonus}%`,
            active: bonuses.maxMpBonus > 0,
          },
          {
            label: "Spell Damage Bonus",
            value: `+${bonuses.spellDamageBonus}%`,
            active: bonuses.spellDamageBonus > 0,
          },
          {
            label: "MP Regen Bonus",
            value: `+${bonuses.mpRegenBonus}%`,
            active: bonuses.mpRegenBonus > 0,
          },
          {
            label: "Frost Slow Duration",
            value: `+${bonuses.frostSlowBonus}s`,
            active: bonuses.frostSlowBonus > 0,
          },
        ];

  const hasAny = lines.some((l) => l.active);
  if (!hasAny) return null;

  return (
    <div
      style={{
        marginTop: 14,
        padding: "10px 12px",
        background: "oklch(0.08 0 0 / 0.8)",
        border: "1px solid oklch(0.20 0 0 / 0.6)",
        borderRadius: 6,
      }}
      data-ocid="skill-tree.bonus_summary"
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: 9,
          color: "oklch(0.38 0 0)",
          letterSpacing: "0.12em",
          marginBottom: 8,
        }}
      >
        Active Bonuses
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4px 8px",
        }}
      >
        {lines
          .filter((l) => l.active)
          .map((l) => (
            <div
              key={l.label}
              className="flex items-center justify-between gap-2"
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 9,
                  color: "oklch(0.50 0 0)",
                  letterSpacing: "0.02em",
                }}
              >
                {l.label}
              </span>
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: 10,
                  color: "oklch(0.72 0.18 145)",
                  letterSpacing: "0.04em",
                }}
              >
                {l.value}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Guest Lock ───────────────────────────────────────────────────────────────

function GuestLock() {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-6 text-center"
      data-ocid="skill-tree.empty_state"
    >
      <span style={{ fontSize: 40, marginBottom: 14 }}>🔒</span>
      <p
        className="font-mono uppercase tracking-widest"
        style={{
          fontSize: 13,
          color: "oklch(0.55 0 0)",
          letterSpacing: "0.16em",
        }}
      >
        Skill Tree Locked
      </p>
      <p
        className="font-mono mt-3"
        style={{
          fontSize: 10,
          color: "oklch(0.38 0 0)",
          maxWidth: 280,
          lineHeight: 1.7,
          letterSpacing: "0.03em",
        }}
      >
        Create an account to use the skill system. Login with Internet Identity
        to earn skill points and customize your character's abilities.
      </p>
    </div>
  );
}

// ─── Confirm Popup ────────────────────────────────────────────────────────────

function ConfirmPopup({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  accentColor,
  danger = false,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  accentColor: string;
  danger?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 250, padding: "0 16px" }}
      data-ocid="skill-tree.dialog"
    >
      <div
        style={{
          width: "min(320px, 100%)",
          background: "rgba(6,6,10,0.98)",
          border: `1px solid ${accentColor}44`,
          borderRadius: 8,
          padding: "20px 18px 16px",
          boxShadow: "0 16px 64px rgba(0,0,0,0.85)",
        }}
      >
        <p
          className="font-mono font-bold"
          style={{
            fontSize: 13,
            color: danger ? "oklch(0.72 0.20 25)" : accentColor,
            marginBottom: 8,
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </p>
        <p
          className="font-mono"
          style={{
            fontSize: 10,
            color: "oklch(0.55 0 0)",
            lineHeight: 1.6,
            marginBottom: 18,
          }}
        >
          {body}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            data-ocid="skill-tree.cancel_button"
            style={{
              flex: 1,
              minHeight: 44,
              background: "oklch(0.10 0 0)",
              border: "1px solid oklch(0.22 0 0)",
              borderRadius: 4,
              color: "oklch(0.50 0 0)",
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-ocid="skill-tree.confirm_button"
            style={{
              flex: 1,
              minHeight: 44,
              background: danger ? "rgba(220,50,50,0.18)" : `${accentColor}18`,
              border: danger
                ? "1px solid rgba(220,50,50,0.50)"
                : `1px solid ${accentColor}55`,
              borderRadius: 4,
              color: danger ? "oklch(0.72 0.20 25)" : accentColor,
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
