// ─── Skill Tree — Pure Logic ──────────────────────────────────────────────────

import type { CharacterClass } from "../types/game";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillTreeData {
  warriorSkills: {
    ironSkin: number;
    bladeMaster: number;
    shieldExpert: number;
    endurance: number;
  };
  mageSkills: {
    arcaneMind: number;
    spellPower: number;
    manaFlow: number;
    frostMastery: number;
  };
}

export interface SkillBonuses {
  // Warrior bonuses
  maxHpBonus: number; // +% to max HP
  attackBonus: number; // +% to attack
  shieldMpCostReduction: number; // % reduction in shield MP cost
  hpRegenBonus: number; // +% to HP regen rate
  // Mage bonuses
  maxMpBonus: number; // +% to max MP
  spellDamageBonus: number; // +% to spell damage
  mpRegenBonus: number; // +% to MP regen
  frostSlowBonus: number; // +seconds to Frost Nova slow duration
}

// ─── Skill definitions ────────────────────────────────────────────────────────

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  icon: string;
  bonusPerPoint: string;
}

export const WARRIOR_SKILLS: SkillDef[] = [
  {
    id: "ironSkin",
    name: "Iron Skin",
    description: "Toughen your body to withstand more punishment.",
    maxPoints: 5,
    icon: "🛡",
    bonusPerPoint: "+5% Max HP per point",
  },
  {
    id: "bladeMaster",
    name: "Blade Master",
    description: "Hone your blade technique for greater damage.",
    maxPoints: 5,
    icon: "⚔",
    bonusPerPoint: "+3% Attack per point",
  },
  {
    id: "shieldExpert",
    name: "Shield Expert",
    description: "Master the shield's energy cost efficiency.",
    maxPoints: 3,
    icon: "🔰",
    bonusPerPoint: "-10% Shield MP cost per point",
  },
  {
    id: "endurance",
    name: "Endurance",
    description: "Train your body to recover HP faster.",
    maxPoints: 3,
    icon: "❤",
    bonusPerPoint: "+5% HP regen rate per point",
  },
];

export const MAGE_SKILLS: SkillDef[] = [
  {
    id: "arcaneMind",
    name: "Arcane Mind",
    description: "Expand your magical reserves for more spells.",
    maxPoints: 5,
    icon: "✦",
    bonusPerPoint: "+5% Max MP per point",
  },
  {
    id: "spellPower",
    name: "Spell Power",
    description: "Channel raw arcane energy into stronger spells.",
    maxPoints: 5,
    icon: "🪄",
    bonusPerPoint: "+3% Spell damage per point",
  },
  {
    id: "manaFlow",
    name: "Mana Flow",
    description: "Improve your natural mana regeneration.",
    maxPoints: 3,
    icon: "💧",
    bonusPerPoint: "+5% MP regen per point",
  },
  {
    id: "frostMastery",
    name: "Frost Mastery",
    description: "Extend the crippling effect of your frost spells.",
    maxPoints: 3,
    icon: "❄",
    bonusPerPoint: "+1s Frost Nova slow duration per point",
  },
];

// ─── Default ──────────────────────────────────────────────────────────────────

export const DEFAULT_SKILL_TREE: SkillTreeData = {
  warriorSkills: {
    ironSkin: 0,
    bladeMaster: 0,
    shieldExpert: 0,
    endurance: 0,
  },
  mageSkills: {
    arcaneMind: 0,
    spellPower: 0,
    manaFlow: 0,
    frostMastery: 0,
  },
};

// ─── Parse / Encode ───────────────────────────────────────────────────────────

export function parseSkillTree(json: string | null): SkillTreeData {
  if (!json) return { ...DEFAULT_SKILL_TREE };
  try {
    const raw = JSON.parse(json) as Partial<SkillTreeData>;
    return {
      warriorSkills: {
        ironSkin: clamp(raw.warriorSkills?.ironSkin ?? 0, 0, 5),
        bladeMaster: clamp(raw.warriorSkills?.bladeMaster ?? 0, 0, 5),
        shieldExpert: clamp(raw.warriorSkills?.shieldExpert ?? 0, 0, 3),
        endurance: clamp(raw.warriorSkills?.endurance ?? 0, 0, 3),
      },
      mageSkills: {
        arcaneMind: clamp(raw.mageSkills?.arcaneMind ?? 0, 0, 5),
        spellPower: clamp(raw.mageSkills?.spellPower ?? 0, 0, 5),
        manaFlow: clamp(raw.mageSkills?.manaFlow ?? 0, 0, 3),
        frostMastery: clamp(raw.mageSkills?.frostMastery ?? 0, 0, 3),
      },
    };
  } catch {
    return { ...DEFAULT_SKILL_TREE };
  }
}

export function encodeSkillTree(data: SkillTreeData): string {
  return JSON.stringify(data);
}

// ─── Bonuses ──────────────────────────────────────────────────────────────────

export function getSkillBonuses(
  data: SkillTreeData,
  playerClass: CharacterClass,
): SkillBonuses {
  if (playerClass === "warrior") {
    const w = data.warriorSkills;
    return {
      maxHpBonus: w.ironSkin * 5,
      attackBonus: w.bladeMaster * 3,
      shieldMpCostReduction: w.shieldExpert * 10,
      hpRegenBonus: w.endurance * 5,
      maxMpBonus: 0,
      spellDamageBonus: 0,
      mpRegenBonus: 0,
      frostSlowBonus: 0,
    };
  }
  // mage
  const m = data.mageSkills;
  return {
    maxHpBonus: 0,
    attackBonus: 0,
    shieldMpCostReduction: 0,
    hpRegenBonus: 0,
    maxMpBonus: m.arcaneMind * 5,
    spellDamageBonus: m.spellPower * 3,
    mpRegenBonus: m.manaFlow * 5,
    frostSlowBonus: m.frostMastery * 1,
  };
}

// ─── Spent points total ───────────────────────────────────────────────────────

export function totalSpentPoints(data: SkillTreeData): number {
  const w = data.warriorSkills;
  const m = data.mageSkills;
  return (
    w.ironSkin +
    w.bladeMaster +
    w.shieldExpert +
    w.endurance +
    m.arcaneMind +
    m.spellPower +
    m.manaFlow +
    m.frostMastery
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
