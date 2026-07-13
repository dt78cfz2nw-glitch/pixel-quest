import type { CharacterClass, Quest } from "../types/game";

// ─── Quest Definitions ─────────────────────────────────────────────────────────────────────

/** Class restriction for class-gated quests (undefined = available to all) */
export const QUEST_CLASS_RESTRICTION: Record<string, CharacterClass> = {
  warrior_trial: "warrior",
  arcane_study: "mage",
};

export const ALL_QUESTS: Record<string, Quest> = {
  first_steps: {
    id: "first_steps",
    title: "First Steps",
    description:
      "Slay 5 monsters to prove your worth. The meadow guard is watching.",
    objectiveType: "kill_monsters",
    objectiveTarget: "any",
    objectiveCount: 5,
    currentCount: 0,
    reward: { gold: 75, xp: 150, potions: 1 },
    giverNpcId: "meadow_guard",
    completed: false,
  },
  the_ancient_city: {
    id: "the_ancient_city",
    title: "The Ancient City",
    description: "Find and enter the legendary city of Aurelion to the north.",
    objectiveType: "visit_zone",
    objectiveTarget: "aurelion",
    objectiveCount: 1,
    currentCount: 0,
    reward: { gold: 150, xp: 300, potions: 0 },
    giverNpcId: "old_villager",
    completed: false,
  },
  warrior_trial: {
    id: "warrior_trial",
    title: "Warrior Trial",
    description:
      "Kill 10 enemies using the Shield skill. Discipline defines a warrior.",
    objectiveType: "kill_monsters",
    objectiveTarget: "any",
    objectiveCount: 10,
    currentCount: 0,
    reward: { gold: 200, xp: 400, potions: 0 },
    giverNpcId: "warrior_trainer",
    completed: false,
  },
  arcane_study: {
    id: "arcane_study",
    title: "Arcane Study",
    description:
      "Cast all 4 mage spells in combat. Practice each spell at least once.",
    objectiveType: "kill_monsters",
    objectiveTarget: "any",
    objectiveCount: 4,
    currentCount: 0,
    reward: { gold: 200, xp: 400, potions: 0 },
    giverNpcId: "mage_trainer",
    completed: false,
  },
  into_the_dark: {
    id: "into_the_dark",
    title: "Into the Dark",
    description: "Explore the depths of the wilderness.",
    objectiveType: "visit_zone",
    objectiveTarget: "wilderness",
    objectiveCount: 1,
    currentCount: 0,
    reward: { gold: 75, xp: 150, potions: 0 },
    giverNpcId: "scout_renalt",
    completed: false,
  },
  monster_hunter: {
    id: "monster_hunter",
    title: "Monster Hunter",
    description: "Prove your strength \u2014 hunt down 20 monsters.",
    objectiveType: "kill_monsters",
    objectiveTarget: "any",
    objectiveCount: 20,
    currentCount: 0,
    reward: { gold: 150, xp: 300, potions: 1 },
    giverNpcId: "warrior_trainer",
    completed: false,
  },
  face_the_warden: {
    id: "face_the_warden",
    title: "Face the Warden",
    description: "Dare to enter the Boss Chamber and face The Stone Warden.",
    objectiveType: "visit_zone",
    objectiveTarget: "boss_chamber",
    objectiveCount: 1,
    currentCount: 0,
    reward: { gold: 500, xp: 500, potions: 0 },
    giverNpcId: "oracle",
    completed: false,
  },
  pirate_slayer: {
    id: "pirate_slayer",
    title: "Pirate Slayer",
    description:
      "The Oracle has seen it — 20 pirates must fall on Pirate Island.",
    objectiveType: "kill_monsters",
    objectiveTarget: "any",
    objectiveCount: 20,
    currentCount: 0,
    reward: { gold: 300, xp: 600, potions: 1 },
    giverNpcId: "oracle",
    completed: false,
  },
};

/** NPCs that offer a quest (npcId \u2192 questId) */
export const QUEST_GIVERS: Record<string, string> = {
  meadow_guard: "first_steps",
  scout_renalt: "into_the_dark",
  old_villager: "the_ancient_city",
  warrior_trainer: "warrior_trial",
  mage_trainer: "arcane_study",
  oracle: "face_the_warden",
};

/**
 * Returns true if the quest is available to the given class.
 * Non-class-restricted quests are available to all classes.
 */
export function isQuestAvailableForClass(
  questId: string,
  cls: CharacterClass,
): boolean {
  const restriction = QUEST_CLASS_RESTRICTION[questId];
  return restriction === undefined || restriction === cls;
}

/** Create a fresh copy of a quest (for active assignment) */
export function cloneQuest(questId: string): Quest | null {
  const base = ALL_QUESTS[questId];
  if (!base) return null;
  return { ...base, currentCount: 0, completed: false };
}
