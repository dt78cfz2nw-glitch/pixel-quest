import type { CharacterClass } from "../types/game";

// ─── Audio Engine ─────────────────────────────────────────────────────────────
// Warm, modern adventure-style music and SFX.
// ONLY sine + triangle oscillators — no square/sawtooth (too harsh/retro).
// Melody scheduling via AudioContext.currentTime for precise timing.
// Short room reverb, chorus warmth, smooth ADSR on all sounds.
// Three independent volume buses: master, music, sfx.

const KEY_SETTINGS = "pq_audio_settings";
const KEY_AUDIO_MODE = "pq_audio_mode";

export type AudioMode = "both" | "music" | "sfx" | "mute";
// Legacy key — migrate if found
const KEY_ENABLED_LEGACY = "pq_audio_enabled";
const KEY_VOLUME_LEGACY = "pq_audio_volume";

const CROSSFADE_S = 0.5; // 0.5s crossfade per spec
const WATCHDOG_MS = 10_000;
const LFO_RATE = 0.3;
// const SAME_ZONE_RESUME_MS = 30_000; // resume same zone within 30s (unused after refactor)

// ─── Settings persistence ─────────────────────────────────────────────────────

interface AudioSettings {
  master: number; // 0–1
  music: number; // 0–1
  sfx: number; // 0–1
  enabled: boolean;
}

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        master: clamp(parsed.master ?? 0.75),
        music: clamp(parsed.music ?? 0.8),
        sfx: clamp(parsed.sfx ?? 0.75),
        enabled: parsed.enabled !== false,
      };
    }
    // Migrate legacy keys
    const legacyEnabled = localStorage.getItem(KEY_ENABLED_LEGACY) !== "false";
    const legacyVol = clamp(
      Number.parseFloat(localStorage.getItem(KEY_VOLUME_LEGACY) ?? "0.55"),
    );
    return {
      master: legacyVol,
      music: 0.8,
      sfx: 0.75,
      enabled: legacyEnabled,
    };
  } catch {
    return { master: 0.75, music: 0.8, sfx: 0.75, enabled: true };
  }
}

function saveSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {}
}

function clamp(v: number): number {
  return Number.isNaN(v) ? 0.75 : Math.max(0, Math.min(1, v));
}

// ─── Impulse reverb (short room ~0.8s) ───────────────────────────────────────

function buildReverb(ctx: AudioContext): ConvolverNode {
  const node = ctx.createConvolver();
  const len = Math.round(ctx.sampleRate * 0.8);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.2;
    }
  }
  node.buffer = buf;
  return node;
}

// ─── Music track definitions ──────────────────────────────────────────────────

interface SchedNote {
  t: number;
  freq: number;
  dur: number;
  gain: number;
}
interface TrackDef {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  melody: SchedNote[];
  bass: SchedNote[];
  melodyGain: number;
  bassGain: number;
  waveType: OscillatorType;
}

// ─── MEADOW: C major pentatonic, 72 BPM — calm, light, folk ──────────────────
// Flute-like sine melody, gentle arpeggio feel, acoustic folk warmth
const TRACK_MEADOW: TrackDef = {
  bpm: 72,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.11,
  bassGain: 0.07,
  waveType: "sine",
  melody: [
    // C major pentatonic: C D E G A — arpeggiated phrases
    { t: 0.0, freq: 523.25, dur: 0.9, gain: 1.0 }, // C5
    { t: 1.0, freq: 587.33, dur: 0.7, gain: 0.85 }, // D5
    { t: 1.8, freq: 659.25, dur: 0.9, gain: 0.9 }, // E5
    { t: 2.8, freq: 783.99, dur: 1.1, gain: 0.8 }, // G5
    // Bar 2: descend gently
    { t: 4.0, freq: 880.0, dur: 0.7, gain: 0.75 }, // A5
    { t: 4.8, freq: 783.99, dur: 0.7, gain: 0.8 }, // G5
    { t: 5.6, freq: 659.25, dur: 0.8, gain: 0.85 }, // E5
    { t: 6.5, freq: 523.25, dur: 1.4, gain: 0.7 }, // C5 hold
  ],
  bass: [
    { t: 0.0, freq: 130.81, dur: 1.9, gain: 0.9 }, // C3
    { t: 2.0, freq: 164.81, dur: 1.9, gain: 0.8 }, // E3
    { t: 4.0, freq: 196.0, dur: 1.9, gain: 0.85 }, // G3
    { t: 6.0, freq: 220.0, dur: 1.9, gain: 0.8 }, // A3
  ],
};

// ─── FOREST: A minor, 68 BPM — mysterious, slightly tense ambient ─────────────
// Slower progression, occasional low drone, sine+triangle mix
const TRACK_FOREST: TrackDef = {
  bpm: 68,
  beatsPerBar: 4,
  bars: 3,
  melodyGain: 0.09,
  bassGain: 0.065,
  waveType: "sine",
  melody: [
    { t: 0.0, freq: 440.0, dur: 2.5, gain: 1.0 }, // A4 (tonic)
    { t: 2.5, freq: 392.0, dur: 1.5, gain: 0.8 }, // G4 (tension)
    { t: 4.0, freq: 349.23, dur: 2.0, gain: 0.85 }, // F4
    { t: 6.0, freq: 329.63, dur: 1.5, gain: 0.75 }, // E4
    // Bar 3: resolve partially
    { t: 8.0, freq: 261.63, dur: 1.8, gain: 0.7 }, // C4
    { t: 9.8, freq: 293.66, dur: 2.0, gain: 0.65 }, // D4
    { t: 11.0, freq: 440.0, dur: 1.0, gain: 0.6 }, // A4 return
  ],
  bass: [
    { t: 0.0, freq: 110.0, dur: 3.9, gain: 1.0 }, // A2 drone
    { t: 4.0, freq: 87.31, dur: 3.9, gain: 0.9 }, // F2
    { t: 8.0, freq: 65.41, dur: 3.9, gain: 0.85 }, // C2 deep
  ],
};

// ─── DARK FOREST: A minor, lower octave, slower, more drone ──────────────────
const TRACK_DARK_FOREST: TrackDef = {
  bpm: 52,
  beatsPerBar: 4,
  bars: 4,
  melodyGain: 0.075,
  bassGain: 0.08,
  waveType: "triangle",
  melody: [
    { t: 0.0, freq: 220.0, dur: 4.0, gain: 0.9 }, // A3 long
    { t: 4.0, freq: 196.0, dur: 3.5, gain: 0.8 }, // G3
    { t: 7.5, freq: 174.61, dur: 3.0, gain: 0.75 }, // F3
    { t: 10.5, freq: 164.81, dur: 3.0, gain: 0.7 }, // E3 dissonant
    { t: 13.5, freq: 220.0, dur: 2.5, gain: 0.6 }, // A3 return
  ],
  bass: [
    { t: 0.0, freq: 55.0, dur: 7.9, gain: 1.0 }, // A1 deep drone
    { t: 8.0, freq: 43.65, dur: 7.9, gain: 0.9 }, // F1
  ],
};

// ─── RUINS: D minor, 60 BPM — dark, tense, heavy bass pulses ─────────────────
// Heavy bass pulses on beats, sparse high notes, percussion feel
const TRACK_RUINS: TrackDef = {
  bpm: 60,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.075,
  bassGain: 0.1,
  waveType: "sine",
  melody: [
    { t: 0.0, freq: 293.66, dur: 3.5, gain: 1.0 }, // D4 long sustained
    { t: 3.5, freq: 261.63, dur: 1.0, gain: 0.7 }, // C4 sparse
    { t: 5.0, freq: 349.23, dur: 1.5, gain: 0.75 }, // F4
    { t: 6.5, freq: 220.0, dur: 1.5, gain: 0.65 }, // A3 (descend)
  ],
  bass: [
    // Heavy bass pulses — triangle for percussion thud
    { t: 0.0, freq: 73.42, dur: 0.6, gain: 1.0 }, // D2 pulse
    { t: 2.0, freq: 73.42, dur: 0.6, gain: 0.9 }, // D2 pulse
    { t: 4.0, freq: 58.27, dur: 0.6, gain: 1.0 }, // Bb1 pulse
    { t: 6.0, freq: 65.41, dur: 0.6, gain: 0.95 }, // C2 pulse
  ],
};

// ─── CAVE: ambient drips, very sparse, echoing ────────────────────────────────
const TRACK_CAVE: TrackDef = {
  bpm: 44,
  beatsPerBar: 4,
  bars: 4,
  melodyGain: 0.06,
  bassGain: 0.055,
  waveType: "sine",
  melody: [
    // Sparse drip-like high notes at irregular intervals
    { t: 0.0, freq: 1174.66, dur: 0.15, gain: 0.7 }, // D6 drip
    { t: 3.7, freq: 1318.51, dur: 0.12, gain: 0.6 }, // E6 drip
    { t: 7.2, freq: 987.77, dur: 0.15, gain: 0.65 }, // B5 drip
    { t: 10.5, freq: 1046.5, dur: 0.12, gain: 0.55 }, // C6 drip
    { t: 13.1, freq: 1174.66, dur: 0.15, gain: 0.6 }, // D6
  ],
  bass: [
    { t: 0.0, freq: 55.0, dur: 15.9, gain: 0.75 }, // A1 long low hum
  ],
};

// ─── CRYSTAL / EPIC: E minor, 60 BPM — dramatic swells ──────────────────────
const TRACK_CRYSTAL: TrackDef = {
  bpm: 60,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.1,
  bassGain: 0.065,
  waveType: "sine",
  melody: [
    { t: 0.0, freq: 659.25, dur: 2.8, gain: 1.0 }, // E5
    { t: 2.5, freq: 783.99, dur: 2.8, gain: 0.85 }, // G5
    { t: 4.0, freq: 880.0, dur: 2.8, gain: 0.9 }, // A5
    { t: 5.5, freq: 987.77, dur: 2.8, gain: 0.75 }, // B5
    { t: 7.0, freq: 1174.66, dur: 3.5, gain: 0.65 }, // D6 sparkle
  ],
  bass: [
    { t: 0.0, freq: 82.41, dur: 7.9, gain: 0.9 }, // E2 long drone
    { t: 4.0, freq: 146.83, dur: 3.9, gain: 0.7 }, // D2 shift
  ],
};

// ─── DUNGEON: D minor, 58 BPM — tense, sparse underground ───────────────────
const TRACK_DUNGEON: TrackDef = {
  bpm: 58,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.08,
  bassGain: 0.07,
  waveType: "triangle",
  melody: [
    { t: 0.0, freq: 293.66, dur: 2.8, gain: 0.9 }, // D4
    { t: 2.5, freq: 233.08, dur: 2.8, gain: 0.8 }, // Bb3
    { t: 4.0, freq: 261.63, dur: 1.8, gain: 0.75 }, // C4
    { t: 5.5, freq: 220.0, dur: 1.8, gain: 0.7 }, // A3
    { t: 7.0, freq: 196.0, dur: 3.5, gain: 0.65 }, // G3
  ],
  bass: [
    { t: 0.0, freq: 73.42, dur: 3.9, gain: 1.0 }, // D2
    { t: 4.0, freq: 51.91, dur: 1.9, gain: 0.9 }, // Ab1
    { t: 6.0, freq: 58.27, dur: 1.9, gain: 0.95 }, // Bb1
  ],
};

// ─── JUNGLE: F major, 90 BPM ─────────────────────────────────────────────────
const TRACK_JUNGLE: TrackDef = {
  bpm: 90,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.1,
  bassGain: 0.075,
  waveType: "triangle",
  melody: [
    { t: 0.0, freq: 349.23, dur: 0.75, gain: 1.0 },
    { t: 0.75, freq: 440.0, dur: 0.75, gain: 0.85 },
    { t: 1.5, freq: 523.25, dur: 0.75, gain: 0.9 },
    { t: 2.25, freq: 698.46, dur: 0.75, gain: 0.8 },
    { t: 3.0, freq: 587.33, dur: 0.75, gain: 0.85 },
    { t: 3.75, freq: 523.25, dur: 0.75, gain: 0.8 },
    { t: 4.5, freq: 466.16, dur: 0.75, gain: 0.85 },
    { t: 5.25, freq: 392.0, dur: 0.75, gain: 0.8 },
    { t: 6.0, freq: 523.25, dur: 0.75, gain: 0.9 },
    { t: 6.75, freq: 587.33, dur: 0.75, gain: 0.85 },
    { t: 7.5, freq: 523.25, dur: 1.4, gain: 0.75 },
  ],
  bass: [
    { t: 0.0, freq: 174.61, dur: 1.9, gain: 1.0 },
    { t: 2.0, freq: 146.83, dur: 1.9, gain: 0.9 },
    { t: 4.0, freq: 116.54, dur: 1.9, gain: 0.95 },
    { t: 6.0, freq: 130.81, dur: 1.9, gain: 1.0 },
  ],
};

// ─── LAIR: E minor, 70 BPM — boss territory ──────────────────────────────────
const TRACK_LAIR: TrackDef = {
  bpm: 70,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.11,
  bassGain: 0.08,
  waveType: "triangle",
  melody: [
    { t: 0.0, freq: 329.63, dur: 1.8, gain: 1.0 },
    { t: 1.5, freq: 392.0, dur: 1.8, gain: 0.9 },
    { t: 3.0, freq: 261.63, dur: 1.5, gain: 0.85 },
    { t: 4.5, freq: 329.63, dur: 1.5, gain: 0.9 },
    { t: 6.0, freq: 392.0, dur: 1.5, gain: 0.8 },
    { t: 7.5, freq: 440.0, dur: 2.0, gain: 0.75 },
  ],
  bass: [
    { t: 0.0, freq: 82.41, dur: 3.9, gain: 1.0 },
    { t: 4.0, freq: 65.41, dur: 1.9, gain: 0.9 },
    { t: 6.0, freq: 98.0, dur: 1.9, gain: 0.95 },
  ],
};

// ─── CURSED SWAMP: E minor, 48 BPM — oppressive, heavy low drums, eerie strings
// Distinct from Dark Forest: lower BPM, stronger bass drum pulse, high eerie notes
const TRACK_CURSED_SWAMP: TrackDef = {
  bpm: 48,
  beatsPerBar: 4,
  bars: 4,
  melodyGain: 0.065,
  bassGain: 0.11,
  waveType: "triangle",
  melody: [
    // Sparse, high eerie "string" notes — triangle at upper register for ominous feel
    { t: 0.0, freq: 329.63, dur: 5.0, gain: 0.8 }, // E4 long sustain (tonic)
    { t: 5.0, freq: 311.13, dur: 4.0, gain: 0.65 }, // Eb4 semitone dissonance
    { t: 9.0, freq: 293.66, dur: 3.5, gain: 0.7 }, // D4 descent
    // Eerie high note — occasional "string" hit
    { t: 4.0, freq: 987.77, dur: 1.2, gain: 0.3 }, // B5 high eerie note
    { t: 11.5, freq: 1046.5, dur: 1.0, gain: 0.25 }, // C6 eerie
    { t: 14.0, freq: 329.63, dur: 6.0, gain: 0.6 }, // E4 return, sustain
  ],
  bass: [
    // Low "drum" pulses — triangle for dull thud at very low frequency
    { t: 0.0, freq: 41.2, dur: 0.5, gain: 1.0 }, // E1 kick
    { t: 2.5, freq: 41.2, dur: 0.5, gain: 0.85 }, // E1 kick
    { t: 5.0, freq: 36.71, dur: 0.5, gain: 1.0 }, // D1 variant
    { t: 7.5, freq: 41.2, dur: 0.5, gain: 0.9 }, // E1 kick
    { t: 10.0, freq: 41.2, dur: 0.5, gain: 0.95 }, // E1 kick
    { t: 12.5, freq: 32.7, dur: 0.5, gain: 1.0 }, // C1 dark pulse
    { t: 15.0, freq: 41.2, dur: 0.5, gain: 0.85 }, // E1 kick
    { t: 17.5, freq: 41.2, dur: 0.5, gain: 0.9 }, // E1 kick
    // Sustained low drone underneath
    { t: 0.0, freq: 41.2, dur: 19.9, gain: 0.35 }, // E1 drone (low)
  ],
};

// ─── FLOATING RUINS: A minor, 52 BPM — ethereal, wind instruments, haunting
// Breathy sine with slow vibrato, heavy reverb feel, long sustained notes
const TRACK_FLOATING_RUINS: TrackDef = {
  bpm: 52,
  beatsPerBar: 4,
  bars: 4,
  melodyGain: 0.075,
  bassGain: 0.055,
  waveType: "sine",
  melody: [
    // Long sustained "wind instrument" notes — sine with slow attack for breathy feel
    { t: 0.0, freq: 440.0, dur: 7.5, gain: 1.0 }, // A4 long breath (tonic)
    { t: 7.5, freq: 392.0, dur: 5.5, gain: 0.8 }, // G4 — minor seventh feel
    { t: 13.0, freq: 349.23, dur: 5.0, gain: 0.85 }, // F4
    { t: 18.0, freq: 329.63, dur: 4.5, gain: 0.7 }, // E4 — falling phrase
    // High sparse melody notes — haunting intervals
    { t: 3.5, freq: 880.0, dur: 2.0, gain: 0.4 }, // A5 high ghostly note
    { t: 10.0, freq: 987.77, dur: 2.5, gain: 0.35 }, // B5 dissonant peak
    { t: 16.0, freq: 880.0, dur: 2.0, gain: 0.3 }, // A5 echo
  ],
  bass: [
    // Very slow, deep drones — long and sparse
    { t: 0.0, freq: 110.0, dur: 11.9, gain: 0.85 }, // A2 drone
    { t: 12.0, freq: 87.31, dur: 9.9, gain: 0.8 }, // F2 shift
  ],
};

// ─── PIRATE ISLAND: D major, 96 BPM — upbeat, sea shanty, accordion-like sawtooth
// Energetic rhythm, sawtooth through filter for accordion tone, bright melody
const TRACK_PIRATE_ISLAND: TrackDef = {
  bpm: 96,
  beatsPerBar: 4,
  bars: 2,
  melodyGain: 0.09,
  bassGain: 0.085,
  waveType: "sawtooth",
  melody: [
    // D major scale phrases — bright, bouncy sea shanty feel
    { t: 0.0, freq: 587.33, dur: 0.6, gain: 1.0 }, // D5
    { t: 0.6, freq: 659.25, dur: 0.6, gain: 0.9 }, // E5
    { t: 1.25, freq: 739.99, dur: 0.6, gain: 0.95 }, // F#5
    { t: 1.85, freq: 880.0, dur: 0.85, gain: 0.85 }, // A5 (hold)
    { t: 2.8, freq: 739.99, dur: 0.6, gain: 0.8 }, // F#5
    { t: 3.4, freq: 659.25, dur: 0.5, gain: 0.85 }, // E5
    // Bar 2: rhythmic repeat with variation
    { t: 4.0, freq: 587.33, dur: 0.5, gain: 1.0 }, // D5
    { t: 4.55, freq: 739.99, dur: 0.5, gain: 0.9 }, // F#5
    { t: 5.1, freq: 880.0, dur: 0.5, gain: 0.85 }, // A5
    { t: 5.65, freq: 1046.5, dur: 0.65, gain: 0.8 }, // C#6 bright peak
    { t: 6.35, freq: 880.0, dur: 0.5, gain: 0.75 }, // A5
    { t: 6.9, freq: 739.99, dur: 0.5, gain: 0.7 }, // F#5
    { t: 7.45, freq: 587.33, dur: 0.55, gain: 0.65 }, // D5 cadence
  ],
  bass: [
    // Rhythmic accordion-style bass pulses — driving beat
    { t: 0.0, freq: 146.83, dur: 0.55, gain: 1.0 }, // D3 beat 1
    { t: 1.25, freq: 110.0, dur: 0.45, gain: 0.85 }, // A2 beat 2
    { t: 2.5, freq: 123.47, dur: 0.45, gain: 0.9 }, // B2 beat 3
    { t: 3.75, freq: 110.0, dur: 0.45, gain: 0.85 }, // A2 beat 4
    { t: 4.0, freq: 146.83, dur: 0.55, gain: 1.0 }, // D3 repeat
    { t: 5.25, freq: 164.81, dur: 0.45, gain: 0.9 }, // E3 variant
    { t: 6.5, freq: 146.83, dur: 0.45, gain: 0.85 }, // D3
    { t: 7.75, freq: 110.0, dur: 0.45, gain: 0.8 }, // A2 cadence
  ],
};

// ─── CURSED GALLEON: D minor, 56 BPM — tense, slow percussion, creaking ship
// Slow kick pattern, dark melody, minor key dread — distinct from Pirate Island
const TRACK_CURSED_GALLEON: TrackDef = {
  bpm: 56,
  beatsPerBar: 4,
  bars: 3,
  melodyGain: 0.08,
  bassGain: 0.1,
  waveType: "triangle",
  melody: [
    // Slow, tense D minor melody — sparse and dark
    { t: 0.0, freq: 293.66, dur: 4.5, gain: 1.0 }, // D4 long (tonic minor)
    { t: 4.5, freq: 261.63, dur: 3.0, gain: 0.85 }, // C4 descent
    { t: 7.5, freq: 233.08, dur: 3.5, gain: 0.8 }, // Bb3 minor color
    { t: 11.0, freq: 220.0, dur: 3.0, gain: 0.75 }, // A3 (dominant)
    // Eerie high stab — very occasional
    { t: 3.5, freq: 1174.66, dur: 0.4, gain: 0.25 }, // D6 brief stab
    { t: 10.0, freq: 1046.5, dur: 0.4, gain: 0.2 }, // C6 brief stab
  ],
  bass: [
    // Slow kick/drum pattern — steady 2-beat thuds, very low
    { t: 0.0, freq: 36.71, dur: 0.45, gain: 1.0 }, // D1 kick
    { t: 2.14, freq: 36.71, dur: 0.45, gain: 0.9 }, // D1 (half-bar)
    { t: 4.29, freq: 32.7, dur: 0.45, gain: 0.95 }, // C1 variant
    { t: 6.43, freq: 36.71, dur: 0.45, gain: 0.88 }, // D1
    { t: 8.57, freq: 36.71, dur: 0.45, gain: 1.0 }, // D1
    { t: 10.71, freq: 29.14, dur: 0.45, gain: 0.92 }, // Bb0 dark
    // Long low drone for tension
    { t: 0.0, freq: 36.71, dur: 12.8, gain: 0.3 }, // D1 drone
  ],
};

// ─── Zone alias map ───────────────────────────────────────────────────────────

const ZONE_ALIAS: Record<string, string> = {
  meadow_hub: "meadow",
  aurelion: "meadow",
  wilderness: "forest",
  forest_depths: "forest",
  wolf_forest: "forest",
  bear_forest: "forest",
  tiger_jungle: "jungle",
  ancient_ruins: "ruins",
  ancient_ruins_deep: "dungeon",
  crystal_ruins: "crystal",
  cyclops_lair: "lair",
  goblin_warrens: "dungeon",
  hub_basement: "dungeon",
  bat_cave: "cave",
  cave_interior: "cave",
  deep_cave: "cave",
  wilderness_dungeon: "dungeon",
  forest_dungeon: "dungeon",
  dark_forest: "dark_forest",
  boss_chamber: "lair",
  cursed_swamp: "cursed_swamp",
  floating_ruins: "floating_ruins",
  pirate_island: "pirate_island",
  cursed_galleon: "cursed_galleon",
};

const TRACKS: Record<string, TrackDef> = {
  meadow: TRACK_MEADOW,
  forest: TRACK_FOREST,
  dark_forest: TRACK_DARK_FOREST,
  ruins: TRACK_RUINS,
  cave: TRACK_CAVE,
  crystal: TRACK_CRYSTAL,
  dungeon: TRACK_DUNGEON,
  jungle: TRACK_JUNGLE,
  lair: TRACK_LAIR,
  cursed_swamp: TRACK_CURSED_SWAMP,
  floating_ruins: TRACK_FLOATING_RUINS,
  pirate_island: TRACK_PIRATE_ISLAND,
  cursed_galleon: TRACK_CURSED_GALLEON,
};

function resolveTrack(zone: string): TrackDef {
  const key = ZONE_ALIAS[zone] ?? zone;
  return TRACKS[key] ?? TRACKS.forest!;
}

// ─── Active music session ─────────────────────────────────────────────────────

interface MusicSession {
  zone: string;
  gainNode: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  stopped: boolean;
  loopTimeoutId: ReturnType<typeof setTimeout> | null;
  loopStartTime: number;
  loopDuration: number;
  startedAt: number; // wall clock ms
}

// ─── AudioEngine class ────────────────────────────────────────────────────────

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSendGain: GainNode | null = null;
  private settings: AudioSettings = loadSettings();
  private ready = false;
  private disabled = false; // set true if AudioContext creation fails
  private currentZone = "";
  private sessions: MusicSession[] = [];
  private debounce: Record<string, ReturnType<typeof setTimeout>> = {};
  private watchdogId: ReturnType<typeof setInterval> | null = null;
  // 30s same-zone resume: track last zone left and when
  private lastZoneLeft: string | null = null;
  private lastZoneLeftAt = 0;

  // ─── Init ───────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.disabled) return;
    try {
      if (!this.ready) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) {
          this.disabled = true;
          return;
        }
        this.ctx = new AC();

        // Master output
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.settings.enabled
          ? this.settings.master
          : 0;
        this.masterGain.connect(this.ctx.destination);

        // Music bus (feeds into master)
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.settings.music;
        this.musicBus.connect(this.masterGain);

        // SFX bus (feeds into master)
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.settings.sfx;
        this.sfxBus.connect(this.masterGain);

        // Reverb (optional ambient send)
        this.reverbNode = buildReverb(this.ctx);
        this.reverbSendGain = this.ctx.createGain();
        this.reverbSendGain.gain.value = 0.12;
        this.reverbNode.connect(this.masterGain);
        this.reverbSendGain.connect(this.reverbNode);

        this.ready = true;

        this.watchdogId = setInterval(() => {
          if (!this.settings.enabled || !this.currentZone) return;
          if (!this.ctx || this.ctx.state === "closed") return;
          if (this.ctx.state === "suspended") {
            void this.ctx.resume();
            return;
          }
          const hasLive = this.sessions.some((s) => !s.stopped);
          if (!hasLive) this._playZone(this.currentZone);
        }, WATCHDOG_MS);
      }

      if (this.ctx?.state === "suspended") await this.ctx.resume();
      if (this.settings.enabled && this.ctx?.state === "running") {
        const hasLive = this.sessions.some((s) => !s.stopped);
        if (!hasLive && this.currentZone) this._playZone(this.currentZone);
      }
    } catch {
      this.disabled = true;
    }
  }

  destroy(): void {
    if (this.watchdogId !== null) {
      clearInterval(this.watchdogId);
      this.watchdogId = null;
    }
    this._stopAllSessions();
    try {
      this.ctx?.close();
    } catch {}
  }

  private getCtx(): AudioContext | null {
    if (this.disabled || !this.ctx || !this.ready) return null;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx.state === "closed" ? null : this.ctx;
  }

  private async getCtxAsync(): Promise<AudioContext | null> {
    if (this.disabled || !this.ctx || !this.ready) return null;
    try {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx.state === "closed" ? null : this.ctx;
    } catch {
      return null;
    }
  }

  // ─── Zone music ─────────────────────────────────────────────────────────────

  playZoneMusic(zone: string): void {
    if (this.disabled) return;
    const wasZone = this.currentZone;
    this.currentZone = zone;
    if (!this.settings.enabled || !this.ready) return;

    const last = this.sessions[this.sessions.length - 1];

    // Same zone — never restart
    if (last && !last.stopped && last.zone === zone) return;

    // Record the zone being left
    const now = Date.now();
    if (wasZone && wasZone !== zone) {
      this.lastZoneLeft = wasZone;
      this.lastZoneLeftAt = now;
    }

    this._playZone(zone);

    // Start / stop ambient layer for new zone
    const AMBIENT_ZONES = new Set([
      "cursed_swamp",
      "floating_ruins",
      "meadow_hub",
      "aurelion",
      "cave",
      "cave_interior",
      "bat_cave",
      "deep_cave",
      "pirate_island",
      "cursed_galleon",
    ]);
    if (AMBIENT_ZONES.has(zone)) {
      this.playAmbientLayer(zone);
    } else {
      this.stopAmbientLayer();
    }
  }

  private _playZone(zone: string): void {
    void (async () => {
      const ctx = await this.getCtxAsync();
      if (!ctx || !this.musicBus || !this.settings.enabled) return;

      const def = resolveTrack(zone);

      // Crossfade out existing sessions
      for (const s of this.sessions) {
        if (!s.stopped) this._fadeOutSession(s, CROSSFADE_S);
      }
      setTimeout(
        () => {
          this.sessions = this.sessions.filter((s) => !s.stopped);
        },
        (CROSSFADE_S + 0.2) * 1000,
      );

      const session = this._startSession(zone, def, ctx);
      this.sessions.push(session);

      // Fade in
      const now = ctx.currentTime;
      session.gainNode.gain.cancelScheduledValues(now);
      session.gainNode.gain.setValueAtTime(0.0001, now);
      session.gainNode.gain.linearRampToValueAtTime(1.0, now + CROSSFADE_S);
    })();
  }

  private _startSession(
    zone: string,
    def: TrackDef,
    ctx: AudioContext,
  ): MusicSession {
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.0001;
    gainNode.connect(this.musicBus!);
    if (this.reverbSendGain) gainNode.connect(this.reverbSendGain);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = LFO_RATE;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    lfo.start();

    const beatS = 60 / def.bpm;
    const loopDuration = def.bars * def.beatsPerBar * beatS;

    const session: MusicSession = {
      zone,
      gainNode,
      lfo,
      lfoGain,
      stopped: false,
      loopTimeoutId: null,
      loopStartTime: ctx.currentTime,
      loopDuration,
      startedAt: Date.now(),
    };

    this._scheduleLoop(session, def, ctx, ctx.currentTime);
    return session;
  }

  private _scheduleLoop(
    session: MusicSession,
    def: TrackDef,
    ctx: AudioContext,
    startTime: number,
  ): void {
    if (session.stopped) return;

    const beatS = 60 / def.bpm;
    const loopDur = def.bars * def.beatsPerBar * beatS;
    session.loopStartTime = startTime;

    for (const note of def.melody) {
      const t = startTime + note.t * beatS;
      const dur = note.dur * beatS;
      this._scheduleNote(
        ctx,
        session.gainNode,
        def.waveType,
        note.freq,
        t,
        dur,
        def.melodyGain * note.gain,
        true,
      );
    }

    for (const note of def.bass) {
      const t = startTime + note.t * beatS;
      const dur = note.dur * beatS;
      this._scheduleNote(
        ctx,
        session.gainNode,
        "triangle",
        note.freq,
        t,
        dur,
        def.bassGain * note.gain,
        false,
      );
    }

    const msUntilNextLoop = (loopDur - 0.05) * 1000;
    session.loopTimeoutId = setTimeout(
      () => {
        if (session.stopped) return;
        const actx = this.getCtx();
        if (!actx) return;
        this._scheduleLoop(session, def, actx, startTime + loopDur);
      },
      Math.max(50, msUntilNextLoop),
    );
  }

  private _scheduleNote(
    ctx: AudioContext,
    dest: AudioNode,
    wave: OscillatorType,
    freq: number,
    startT: number,
    dur: number,
    peakGain: number,
    addChorus: boolean,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;

    const attack = Math.min(0.06, dur * 0.15);
    const release = Math.min(dur * 0.35, 0.25);

    gain.gain.setValueAtTime(0.0001, startT);
    gain.gain.linearRampToValueAtTime(peakGain, startT + attack);
    gain.gain.setValueAtTime(peakGain * 0.82, startT + dur - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startT);
    osc.stop(startT + dur + 0.01);

    if (addChorus) {
      const chorus = ctx.createOscillator();
      const chorusGain = ctx.createGain();
      chorus.type = wave;
      chorus.frequency.value = freq;
      chorus.detune.value = 3;
      chorusGain.gain.setValueAtTime(0.0001, startT);
      chorusGain.gain.linearRampToValueAtTime(peakGain * 0.28, startT + attack);
      chorusGain.gain.setValueAtTime(peakGain * 0.22, startT + dur - release);
      chorusGain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
      chorus.connect(chorusGain);
      chorusGain.connect(dest);
      chorus.start(startT);
      chorus.stop(startT + dur + 0.01);
    }
  }

  private _fadeOutSession(session: MusicSession, durationS: number): void {
    const ctx = this.getCtx();
    if (!ctx) {
      this._killSession(session);
      return;
    }
    const now = ctx.currentTime;
    session.gainNode.gain.cancelScheduledValues(now);
    session.gainNode.gain.setValueAtTime(
      Math.max(session.gainNode.gain.value, 0.0001),
      now,
    );
    session.gainNode.gain.linearRampToValueAtTime(0.0001, now + durationS);
    setTimeout(() => this._killSession(session), (durationS + 0.1) * 1000);
  }

  private _killSession(session: MusicSession): void {
    if (session.stopped) return;
    session.stopped = true;
    if (session.loopTimeoutId !== null) {
      clearTimeout(session.loopTimeoutId);
      session.loopTimeoutId = null;
    }
    try {
      session.lfo.stop();
    } catch {}
    try {
      session.gainNode.disconnect();
    } catch {}
  }

  private _stopAllSessions(): void {
    for (const s of this.sessions) this._killSession(s);
    this.sessions = [];
  }

  // ─── SFX helpers ──────────────────────────────────────────────────────────

  private debounced(key: string, ms: number, fn: () => void): void {
    if (this.debounce[key]) return;
    fn();
    this.debounce[key] = setTimeout(() => {
      delete this.debounce[key];
    }, ms);
  }

  private sfx(fn: (ctx: AudioContext, out: GainNode) => void): void {
    if (this.disabled || !this.settings.enabled) return;
    const ctx = this.getCtx();
    if (!ctx || !this.sfxBus) return;
    try {
      fn(ctx, this.sfxBus);
    } catch {}
  }

  // ─── Footstep ─────────────────────────────────────────────────────────────
  // Surface-based variants: grass, stone, wood, sand, default (dirt).
  // Alternate A/B per surface to avoid robotic repetition.

  private lastSurfaceVariant: Record<string, boolean> = {};

  playFootstep(
    surface: "grass" | "stone" | "wood" | "sand" | "default" = "default",
  ): void {
    this.debounced("foot", 180, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        // Toggle A/B for this surface
        const variantB = !this.lastSurfaceVariant[surface];
        this.lastSurfaceVariant[surface] = variantB;

        if (surface === "grass") {
          // Soft rustle — low volume, short noise burst
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          // Variant B: slightly lower pitch rustle
          osc.frequency.setValueAtTime(variantB ? 110 : 130, now);
          osc.frequency.exponentialRampToValueAtTime(70, now + 0.055);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(variantB ? 0.08 : 0.1, now + 0.005);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
          osc.connect(g);
          g.connect(out);
          osc.start(now);
          osc.stop(now + 0.07);
        } else if (surface === "stone") {
          // Harder tap — brief percussive click
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(variantB ? 75 : 85, now);
          osc.frequency.exponentialRampToValueAtTime(35, now + 0.075);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(variantB ? 0.14 : 0.13, now + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(g);
          g.connect(out);
          osc.start(now);
          osc.stop(now + 0.09);
        } else if (surface === "wood") {
          // Hollow thud — slightly resonant sine with click
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(variantB ? 200 : 180, now);
          osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.12, now + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.connect(g);
          g.connect(out);
          osc.start(now);
          osc.stop(now + 0.11);
          // Second partial for resonance
          const osc2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          osc2.type = "triangle";
          osc2.frequency.value = variantB ? 320 : 290;
          g2.gain.setValueAtTime(0.0001, now);
          g2.gain.linearRampToValueAtTime(0.04, now + 0.005);
          g2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc2.connect(g2);
          g2.connect(out);
          osc2.start(now);
          osc2.stop(now + 0.07);
        } else if (surface === "sand") {
          // Soft crunch — quiet, slightly longer
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(variantB ? 95 : 105, now);
          osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(variantB ? 0.08 : 0.09, now + 0.007);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
          osc.connect(g);
          g.connect(out);
          osc.start(now);
          osc.stop(now + 0.08);
        } else {
          // Default (dirt): medium sine 100Hz
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(variantB ? 105 : 95, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.065);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.11, now + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
          osc.connect(g);
          g.connect(out);
          osc.start(now);
          osc.stop(now + 0.07);
        }
      });
    });
  }

  // ─── Warrior attack ───────────────────────────────────────────────────────

  playWarriorAttack(): void {
    const slot = ["atk0", "atk1", "atk2"].find((k) => !this.debounce[k]);
    if (!slot) return;
    this.debounce[slot] = setTimeout(() => {
      delete this.debounce[slot];
    }, 200);
    this.sfx((ctx, out) => {
      const now = ctx.currentTime;
      // Noise burst with fast decay (metallic hit)
      const bufLen = Math.round(ctx.sampleRate * 0.15);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++)
        d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) ** 0.8;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.setValueAtTime(1600, now);
      bpf.frequency.exponentialRampToValueAtTime(380, now + 0.13);
      bpf.Q.value = 0.9;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.45, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(bpf);
      bpf.connect(ng);
      ng.connect(out);
      noise.start(now);
      noise.stop(now + 0.16);
      // Metallic ring at 2000Hz
      const ring = ctx.createOscillator();
      const rg = ctx.createGain();
      ring.type = "sine";
      ring.frequency.setValueAtTime(2000, now);
      ring.frequency.exponentialRampToValueAtTime(800, now + 0.12);
      rg.gain.setValueAtTime(0.0001, now);
      rg.gain.linearRampToValueAtTime(0.22, now + 0.008);
      rg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      ring.connect(rg);
      rg.connect(out);
      ring.start(now);
      ring.stop(now + 0.16);
    });
  }

  // ─── Mage attack ──────────────────────────────────────────────────────────

  playMageAttack(): void {
    const slot = ["atk0", "atk1", "atk2"].find((k) => !this.debounce[k]);
    if (!slot) return;
    this.debounce[slot] = setTimeout(() => {
      delete this.debounce[slot];
    }, 220);
    this.sfx((ctx, out) => {
      const now = ctx.currentTime;
      // Magical whoosh: frequency sweep 2000→500Hz sine, 200ms
      const sweep = ctx.createOscillator();
      const sg = ctx.createGain();
      sweep.type = "sine";
      sweep.frequency.setValueAtTime(2000, now);
      sweep.frequency.exponentialRampToValueAtTime(500, now + 0.2);
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.linearRampToValueAtTime(0.3, now + 0.015);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      sweep.connect(sg);
      sg.connect(out);
      sweep.start(now);
      sweep.stop(now + 0.24);
      // Shimmer layer
      const shimmer = ctx.createOscillator();
      const shg = ctx.createGain();
      shimmer.type = "triangle";
      shimmer.frequency.setValueAtTime(3000, now);
      shimmer.frequency.exponentialRampToValueAtTime(1200, now + 0.18);
      shg.gain.setValueAtTime(0.0001, now);
      shg.gain.linearRampToValueAtTime(0.12, now + 0.01);
      shg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      shimmer.connect(shg);
      shg.connect(out);
      shimmer.start(now);
      shimmer.stop(now + 0.22);
    });
  }

  // ─── Unified attack (by class) ────────────────────────────────────────────

  playAttack(cls: CharacterClass): void {
    if (!this.settings.enabled || !this.ready || this.disabled) return;
    if (cls === "warrior") this.playWarriorAttack();
    else this.playMageAttack();
  }

  // ─── Monster hit ──────────────────────────────────────────────────────────

  playMonsterHit(): void {
    this.debounced("mhit", 120, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        // Short noise burst + 150Hz thud
        const bufLen = Math.round(ctx.sampleRate * 0.04);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++)
          d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.25, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        noise.connect(ng);
        ng.connect(out);
        noise.start(now);
        noise.stop(now + 0.05);

        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.04);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.05);
      });
    });
  }

  // ─── Monster death ────────────────────────────────────────────────────────

  playMonsterDeath(): void {
    this.debounced("mdeath", 300, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        // Descending pitch sweep: 500→100Hz, 300ms
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.35, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.34);

        // Noise burst for impact
        const bufLen = Math.round(ctx.sampleRate * 0.08);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++)
          d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) ** 0.6;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.15, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(ng);
        ng.connect(out);
        noise.start(now);
        noise.stop(now + 0.09);
      });
    });
  }

  // ─── Level up ─────────────────────────────────────────────────────────────

  playLevelUp(): void {
    this.sfx((ctx, out) => {
      const now = ctx.currentTime;
      // Ascending chime: C5 E5 G5, 150ms each, triangle wave
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const t = now + i * 0.15;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.4, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(g);
        g.connect(out);
        if (this.reverbSendGain) g.connect(this.reverbSendGain);
        osc.start(t);
        osc.stop(t + 0.3);
        // Octave shimmer
        const sh = ctx.createOscillator();
        const sg = ctx.createGain();
        sh.type = "sine";
        sh.frequency.value = freq * 2;
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.linearRampToValueAtTime(0.12, t + 0.01);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        sh.connect(sg);
        sg.connect(out);
        sh.start(t);
        sh.stop(t + 0.24);
      });
    });
  }

  // ─── Loot pickup ──────────────────────────────────────────────────────────

  playLootPickup(): void {
    this.debounced("loot", 400, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        // Coin chime: triangle wave at 1400Hz, 120ms with quick decay
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.12);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.32, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.15);
        // Second note slightly after for sparkle
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.value = 1760; // A6
        g2.gain.setValueAtTime(0.0001, now + 0.05);
        g2.gain.linearRampToValueAtTime(0.15, now + 0.06);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc2.connect(g2);
        g2.connect(out);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.17);
      });
    });
  }

  // ─── Zone transition whoosh ───────────────────────────────────────────────

  playZoneTransition(): void {
    this.debounced("ztrans", 800, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        // Whoosh: freq sweep 200→800Hz, 400ms, sine
        const sweep = ctx.createOscillator();
        const sg = ctx.createGain();
        sweep.type = "sine";
        sweep.frequency.setValueAtTime(200, now);
        sweep.frequency.exponentialRampToValueAtTime(800, now + 0.4);
        sg.gain.setValueAtTime(0.0001, now);
        sg.gain.linearRampToValueAtTime(0.35, now + 0.05);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        sweep.connect(sg);
        sg.connect(out);
        if (this.reverbSendGain) sg.connect(this.reverbSendGain);
        sweep.start(now);
        sweep.stop(now + 0.44);
        // Triangle warmth layer
        const tri = ctx.createOscillator();
        const tg = ctx.createGain();
        tri.type = "triangle";
        tri.frequency.setValueAtTime(200, now);
        tri.frequency.exponentialRampToValueAtTime(600, now + 0.38);
        tg.gain.setValueAtTime(0.0001, now);
        tg.gain.linearRampToValueAtTime(0.16, now + 0.06);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        tri.connect(tg);
        tg.connect(out);
        tri.start(now);
        tri.stop(now + 0.42);
        // Chord bloom
        [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
          const t = now + 0.08 + i * 0.04;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "triangle";
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.1, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          o.connect(g);
          g.connect(out);
          o.start(t);
          o.stop(t + 0.34);
        });
      });
    });
  }

  // ─── Legacy aliases ───────────────────────────────────────────────────────

  /** @deprecated Use playLootPickup */
  playCollectLoot(): void {
    this.playLootPickup();
  }
  /** @deprecated Use playZoneTransition */
  playPortalActivate(): void {
    this.playZoneTransition();
  }
  /** @deprecated Use playZoneTransition */
  playStairActivate(): void {
    this.playZoneTransition();
  }
  /** @deprecated Use playMonsterHit */
  playHit(): void {
    this.playMonsterHit();
  }

  // ─── Healing chime (C5+E5+G5 soft chord, 0.3s) ────────────────────────────

  playHealingChime(): void {
    this.debounced("heal", 400, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        // Soft sine chord: C5 (523Hz), E5 (659Hz), G5 (784Hz) — gentle, warm
        const notes = [523.25, 659.25, 783.99];
        const gains = [0.18, 0.14, 0.12];
        notes.forEach((freq, i) => {
          const t = now + i * 0.03; // slight stagger for warmth
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(gains[i]!, t + 0.02);
          g.gain.setValueAtTime(gains[i]! * 0.75, t + 0.18);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
          osc.connect(g);
          g.connect(out);
          if (this.reverbSendGain) g.connect(this.reverbSendGain);
          osc.start(t);
          osc.stop(t + 0.35);
        });
      });
    });
  }

  playUIClick(): void {
    this.debounced("click", 80, () => {
      this.sfx((ctx, out) => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.08);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.15, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.09);
      });
    });
  }

  // ─── Zone ambient layers (for cursed_swamp and floating_ruins) ──────────────

  private ambientNodes: AudioNode[] = [];
  private ambientZone = "";

  playAmbientLayer(zone: string): void {
    if (this.disabled || !this.settings.enabled) return;
    // Normalize cave variants
    const normalZone =
      zone === "cave_interior" || zone === "bat_cave" || zone === "deep_cave"
        ? "cave"
        : zone;
    if (this.ambientZone === normalZone) return;
    this.stopAmbientLayer();
    this.ambientZone = normalZone;
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    // Ambient gain target: ~15-20% of music bus gain (quiet background layer only)
    const ambientGainLevel = 0.17 * this.settings.music;
    try {
      if (normalZone === "meadow_hub") {
        // Wind: sine at 800Hz, very low amplitude, slow LFO for gentle flutter
        const windOsc = ctx.createOscillator();
        const windLfo = ctx.createOscillator();
        const windLfoGain = ctx.createGain();
        const windGain = ctx.createGain();
        windOsc.type = "sine";
        windOsc.frequency.value = 800;
        windLfo.type = "sine";
        windLfo.frequency.value = 0.15;
        windLfoGain.gain.value = 0.015;
        windLfo.connect(windLfoGain);
        windLfoGain.connect(windGain.gain);
        windGain.gain.value = 0.03 * ambientGainLevel;
        windOsc.connect(windGain);
        windGain.connect(this.masterGain);
        windOsc.start();
        windLfo.start();
        this.ambientNodes.push(windOsc, windLfo, windLfoGain, windGain);
        // Bird chirps: triangle at 2400Hz, slow LFO modulation, very soft
        const birdOsc = ctx.createOscillator();
        const birdLfo = ctx.createOscillator();
        const birdLfoGain = ctx.createGain();
        const birdGain = ctx.createGain();
        birdOsc.type = "triangle";
        birdOsc.frequency.value = 2400;
        birdLfo.type = "sine";
        birdLfo.frequency.value = 0.4;
        birdLfoGain.gain.value = 0.012;
        birdLfo.connect(birdLfoGain);
        birdLfoGain.connect(birdGain.gain);
        birdGain.gain.value = 0.02 * ambientGainLevel;
        birdOsc.connect(birdGain);
        birdGain.connect(this.masterGain);
        birdOsc.start();
        birdLfo.start();
        this.ambientNodes.push(birdOsc, birdLfo, birdLfoGain, birdGain);
      } else if (normalZone === "aurelion") {
        // Magical hum: sine at 220Hz with slow vibrato (LFO 0.3Hz, depth 5Hz)
        const humOsc = ctx.createOscillator();
        const humVibLfo = ctx.createOscillator();
        const humVibGain = ctx.createGain();
        const humGain = ctx.createGain();
        humOsc.type = "sine";
        humOsc.frequency.value = 220;
        humVibLfo.type = "sine";
        humVibLfo.frequency.value = 0.3;
        humVibGain.gain.value = 5;
        humVibLfo.connect(humVibGain);
        humVibGain.connect(humOsc.frequency);
        humGain.gain.value = 0.04 * ambientGainLevel;
        humOsc.connect(humGain);
        humGain.connect(this.masterGain);
        humOsc.start();
        humVibLfo.start();
        this.ambientNodes.push(humOsc, humVibLfo, humVibGain, humGain);
        // Crowd murmur: triangle at 440Hz, very soft
        const crowdOsc = ctx.createOscillator();
        const crowdLfo = ctx.createOscillator();
        const crowdLfoGain = ctx.createGain();
        const crowdGain = ctx.createGain();
        crowdOsc.type = "triangle";
        crowdOsc.frequency.value = 440;
        crowdLfo.type = "sine";
        crowdLfo.frequency.value = 0.2;
        crowdLfoGain.gain.value = 0.01;
        crowdLfo.connect(crowdLfoGain);
        crowdLfoGain.connect(crowdGain.gain);
        crowdGain.gain.value = 0.015 * ambientGainLevel;
        crowdOsc.connect(crowdGain);
        crowdGain.connect(this.masterGain);
        crowdOsc.start();
        crowdLfo.start();
        this.ambientNodes.push(crowdOsc, crowdLfo, crowdLfoGain, crowdGain);
      } else if (normalZone === "cursed_swamp") {
        // Low-freq bubbling: slow LFO on sine 80Hz — sludgy, oppressive
        const bubbleOsc = ctx.createOscillator();
        const bubbleLfo = ctx.createOscillator();
        const bubbleLfoGain = ctx.createGain();
        const bubbleGain = ctx.createGain();
        bubbleOsc.type = "sine";
        bubbleOsc.frequency.value = 80;
        bubbleLfo.type = "sine";
        bubbleLfo.frequency.value = 0.25; // slow bubble rhythm
        bubbleLfoGain.gain.value = 18;
        bubbleLfo.connect(bubbleLfoGain);
        bubbleLfoGain.connect(bubbleOsc.frequency);
        bubbleGain.gain.value = 0.05 * ambientGainLevel;
        bubbleOsc.connect(bubbleGain);
        bubbleGain.connect(this.masterGain);
        bubbleOsc.start();
        bubbleLfo.start();
        this.ambientNodes.push(bubbleOsc, bubbleLfo, bubbleLfoGain, bubbleGain);
        // Eerie wind: bandpass-filtered noise, slowly modulating center freq
        const windBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const dw = windBuf.getChannelData(0);
        for (let i = 0; i < dw.length; i++) dw[i] = Math.random() * 2 - 1;
        const windSrc = ctx.createBufferSource();
        windSrc.buffer = windBuf;
        windSrc.loop = true;
        const windBpf = ctx.createBiquadFilter();
        windBpf.type = "bandpass";
        windBpf.frequency.value = 300;
        windBpf.Q.value = 0.4;
        const windLfo = ctx.createOscillator();
        const windLfoGain = ctx.createGain();
        windLfo.type = "sine";
        windLfo.frequency.value = 0.08; // very slow sweep
        windLfoGain.gain.value = 80;
        windLfo.connect(windLfoGain);
        windLfoGain.connect(windBpf.frequency);
        const windGain = ctx.createGain();
        windGain.gain.value = 0.035 * ambientGainLevel;
        windSrc.connect(windBpf);
        windBpf.connect(windGain);
        windGain.connect(this.masterGain);
        windSrc.start();
        windLfo.start();
        this.ambientNodes.push(
          windSrc,
          windBpf,
          windLfo,
          windLfoGain,
          windGain,
        );
        // Distant frog-like periodic pops: periodic low-freq sine burst
        this._scheduleAmbientPop(ctx, 65, 1800, 3200, 0.04 * ambientGainLevel);
      } else if (normalZone === "floating_ruins") {
        // Howling wind: highpass-filtered noise with slow gain modulation
        const windBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
        const dw = windBuf.getChannelData(0);
        for (let i = 0; i < dw.length; i++) dw[i] = Math.random() * 2 - 1;
        const windSrc = ctx.createBufferSource();
        windSrc.buffer = windBuf;
        windSrc.loop = true;
        const windHpf = ctx.createBiquadFilter();
        windHpf.type = "highpass";
        windHpf.frequency.value = 600;
        const windLfo = ctx.createOscillator();
        const windLfoGain = ctx.createGain();
        windLfo.type = "sine";
        windLfo.frequency.value = 0.12; // slow howl cycle
        windLfoGain.gain.value = 0.04 * ambientGainLevel;
        windLfo.connect(windLfoGain);
        windLfoGain.connect(windHpf.frequency);
        const windGain = ctx.createGain();
        windGain.gain.value = 0.06 * ambientGainLevel;
        windSrc.connect(windHpf);
        windHpf.connect(windGain);
        windGain.connect(this.masterGain);
        windSrc.start();
        windLfo.start();
        this.ambientNodes.push(
          windSrc,
          windHpf,
          windLfo,
          windLfoGain,
          windGain,
        );
        // Occasional stone rumble: periodic noise burst at low freq
        this._scheduleAmbientRumble(ctx, 0.045 * ambientGainLevel);
      } else if (normalZone === "cave") {
        // Dripping water: periodic short sine click at random 1-4s intervals
        this._scheduleCaveDrip(ctx, 0.06 * ambientGainLevel);
        // Distant bat squeak: brief high-freq sine sweep every 8-15s
        this._scheduleBatSqueak(ctx, 0.04 * ambientGainLevel);
        // Low cave hum: very quiet low sine for underground atmosphere
        const humOsc = ctx.createOscillator();
        const humGain = ctx.createGain();
        humOsc.type = "sine";
        humOsc.frequency.value = 55; // A1 deep cave resonance
        humGain.gain.value = 0.025 * ambientGainLevel;
        humOsc.connect(humGain);
        humGain.connect(this.masterGain);
        humOsc.start();
        this.ambientNodes.push(humOsc, humGain);
      } else if (normalZone === "pirate_island") {
        // Ocean waves: filtered white noise with slow LFO for wave rhythm
        const waveBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
        const dwave = waveBuf.getChannelData(0);
        for (let i = 0; i < dwave.length; i++) dwave[i] = Math.random() * 2 - 1;
        const waveSrc = ctx.createBufferSource();
        waveSrc.buffer = waveBuf;
        waveSrc.loop = true;
        const waveLpf = ctx.createBiquadFilter();
        waveLpf.type = "lowpass";
        waveLpf.frequency.value = 400;
        const waveLfo = ctx.createOscillator();
        const waveLfoGain = ctx.createGain();
        waveLfo.type = "sine";
        waveLfo.frequency.value = 0.18; // ~5.5s wave cycle
        waveLfoGain.gain.value = 0.04 * ambientGainLevel;
        waveLfo.connect(waveLfoGain);
        waveLfoGain.connect(waveLpf.frequency);
        const waveGain = ctx.createGain();
        waveGain.gain.value = 0.07 * ambientGainLevel;
        waveSrc.connect(waveLpf);
        waveLpf.connect(waveGain);
        waveGain.connect(this.masterGain);
        waveSrc.start();
        waveLfo.start();
        this.ambientNodes.push(
          waveSrc,
          waveLpf,
          waveLfo,
          waveLfoGain,
          waveGain,
        );
        // Seagull calls: brief high swooping sine sweep every 10-20s
        this._scheduleSeagull(ctx, 0.05 * ambientGainLevel);
      } else if (normalZone === "cursed_galleon") {
        // Creaking wood: low-freq noise burst every ~4s, filtered
        this._scheduleCreak(ctx, 0.06 * ambientGainLevel);
        // Ocean lap: similar to pirate_island but quieter (inside ship)
        const waveBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const dwave = waveBuf.getChannelData(0);
        for (let i = 0; i < dwave.length; i++) dwave[i] = Math.random() * 2 - 1;
        const waveSrc = ctx.createBufferSource();
        waveSrc.buffer = waveBuf;
        waveSrc.loop = true;
        const waveLpf = ctx.createBiquadFilter();
        waveLpf.type = "lowpass";
        waveLpf.frequency.value = 250;
        const waveGain = ctx.createGain();
        waveGain.gain.value = 0.035 * ambientGainLevel;
        waveSrc.connect(waveLpf);
        waveLpf.connect(waveGain);
        waveGain.connect(this.masterGain);
        waveSrc.start();
        this.ambientNodes.push(waveSrc, waveLpf, waveGain);
      }
    } catch {
      /* fail silently */
    }
  }

  // ─── Ambient scheduling helpers ────────────────────────────────────────────
  // These use setTimeout chains to simulate periodic random events.
  // A sentinel AbortController-like flag is stored on ambientZone to stop loops.

  private _scheduleAmbientPop(
    ctx: AudioContext,
    freq: number,
    minMs: number,
    maxMs: number,
    gain: number,
  ): void {
    const zone = this.ambientZone;
    const fire = (): void => {
      if (this.ambientZone !== zone || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
      } catch {}
      const delay = minMs + Math.random() * (maxMs - minMs);
      setTimeout(fire, delay);
    };
    setTimeout(fire, minMs + Math.random() * (maxMs - minMs));
  }

  private _scheduleAmbientRumble(ctx: AudioContext, gain: number): void {
    const zone = this.ambientZone;
    const fire = (): void => {
      if (this.ambientZone !== zone || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        const dur = 0.6 + Math.random() * 0.4;
        const bufLen = Math.round(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++)
          d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) ** 0.5;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lpf = ctx.createBiquadFilter();
        lpf.type = "lowpass";
        lpf.frequency.value = 120;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(lpf);
        lpf.connect(g);
        g.connect(this.masterGain);
        src.start(now);
        src.stop(now + dur + 0.05);
      } catch {}
      const delay = 8000 + Math.random() * 12000;
      setTimeout(fire, delay);
    };
    setTimeout(fire, 5000 + Math.random() * 8000);
  }

  private _scheduleCaveDrip(ctx: AudioContext, gain: number): void {
    const zone = this.ambientZone;
    const fire = (): void => {
      if (this.ambientZone !== zone || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        const freq = 900 + Math.random() * 400; // 900-1300Hz water drip
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + 0.04);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        osc.connect(g);
        g.connect(this.masterGain);
        if (this.reverbSendGain) {
          const send = ctx.createGain();
          send.gain.value = 0.3;
          g.connect(send);
          send.connect(this.reverbSendGain);
          this.ambientNodes.push(send);
        }
        osc.start(now);
        osc.stop(now + 0.05);
      } catch {}
      const delay = 1000 + Math.random() * 3000;
      setTimeout(fire, delay);
    };
    setTimeout(fire, 800 + Math.random() * 1500);
  }

  private _scheduleBatSqueak(ctx: AudioContext, gain: number): void {
    const zone = this.ambientZone;
    const fire = (): void => {
      if (this.ambientZone !== zone || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        // Brief high-freq sine sweep: 3000→6000Hz in 0.08s
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(3000, now);
        osc.frequency.exponentialRampToValueAtTime(6000, now + 0.04);
        osc.frequency.exponentialRampToValueAtTime(3000, now + 0.08);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.09);
      } catch {}
      const delay = 8000 + Math.random() * 7000;
      setTimeout(fire, delay);
    };
    setTimeout(fire, 6000 + Math.random() * 6000);
  }

  private _scheduleSeagull(ctx: AudioContext, gain: number): void {
    const zone = this.ambientZone;
    const fire = (): void => {
      if (this.ambientZone !== zone || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        // Seagull: swooping sine 1200→2200→1000Hz, 0.3s
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(2200, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.3);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.02);
        g.gain.setValueAtTime(gain * 0.7, now + 0.22);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.34);
      } catch {}
      const delay = 10000 + Math.random() * 10000;
      setTimeout(fire, delay);
    };
    setTimeout(fire, 4000 + Math.random() * 8000);
  }

  private _scheduleCreak(ctx: AudioContext, gain: number): void {
    const zone = this.ambientZone;
    const fire = (): void => {
      if (this.ambientZone !== zone || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        // Creaking wood: short low-freq noise burst, bandpass filtered
        const dur = 0.15 + Math.random() * 0.15;
        const bufLen = Math.round(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++)
          d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) ** 0.6;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bpf = ctx.createBiquadFilter();
        bpf.type = "bandpass";
        bpf.frequency.value = 180 + Math.random() * 80; // 180-260Hz creak
        bpf.Q.value = 2.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(bpf);
        bpf.connect(g);
        g.connect(this.masterGain);
        src.start(now);
        src.stop(now + dur + 0.02);
      } catch {}
      const delay = 3500 + Math.random() * 2500; // every ~4s ± variation
      setTimeout(fire, delay);
    };
    setTimeout(fire, 2000 + Math.random() * 2000);
  }

  // ─── Voice emotes ────────────────────────────────────────────────────────────
  // laugh: 3 quick ascending notes C4 E4 G4
  // cheer: 4-note ascending arpeggio C4 E4 G4 C5
  // no:    2 descending notes E4 C4 (flat, minor feel)
  // yes:   2 ascending notes G4 C5 (clean sine chime)

  playVoiceEmote(type: "laugh" | "cheer" | "no" | "yes"): void {
    if (this.disabled || !this.settings.enabled) return;
    this.sfx((ctx, out) => {
      const now = ctx.currentTime;
      try {
        if (type === "laugh") {
          // 3 quick ascending notes: C4(261) E4(329) G4(392), 0.08s each
          const notes = [261.63, 329.63, 392.0];
          notes.forEach((freq, i) => {
            const t = now + i * 0.1;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.28, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
            osc.connect(g);
            g.connect(out);
            osc.start(t);
            osc.stop(t + 0.1);
          });
        } else if (type === "cheer") {
          // Bright arpeggio: C4 E4 G4 C5, quick stagger, major feel
          const notes = [261.63, 329.63, 392.0, 523.25];
          notes.forEach((freq, i) => {
            const t = now + i * 0.08;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.3 - i * 0.03, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            osc.connect(g);
            g.connect(out);
            if (this.reverbSendGain) {
              const send = ctx.createGain();
              send.gain.value = 0.2;
              g.connect(send);
              send.connect(this.reverbSendGain);
            }
            osc.start(t);
            osc.stop(t + 0.25);
          });
        } else if (type === "no") {
          // 2 descending notes: E4(329) then C4(261), buzzer-like — slightly flat/dissonant
          const pairs: [number, number][] = [
            [329.63, 0],
            [261.63, 0.15],
          ];
          for (const [freq, offset] of pairs) {
            const t = now + offset;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.92, t + 0.12); // slight flat slide
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.32, t + 0.01);
            g.gain.setValueAtTime(0.28, t + 0.06);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
            osc.connect(g);
            g.connect(out);
            osc.start(t);
            osc.stop(t + 0.15);
          }
        } else if (type === "yes") {
          // 2 ascending notes: G4(392) then C5(523), clean sine chime
          const pairs: [number, number][] = [
            [392.0, 0],
            [523.25, 0.14],
          ];
          for (const [freq, offset] of pairs) {
            const t = now + offset;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.3, t + 0.012);
            g.gain.setValueAtTime(0.26, t + 0.1);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
            osc.connect(g);
            g.connect(out);
            if (this.reverbSendGain) {
              const send = ctx.createGain();
              send.gain.value = 0.15;
              g.connect(send);
              send.connect(this.reverbSendGain);
            }
            osc.start(t);
            osc.stop(t + 0.3);
          }
        }
      } catch {}
    });
  }

  stopAmbientLayer(): void {
    for (const node of this.ambientNodes) {
      try {
        if (
          node instanceof AudioBufferSourceNode ||
          node instanceof OscillatorNode
        )
          node.stop();
        node.disconnect();
      } catch {}
    }
    this.ambientNodes = [];
    this.ambientZone = "";
  }

  // ─── Login screen ambient music ──────────────────────────────────────────────

  private loginMusicGain: GainNode | null = null;
  private loginOscillators: OscillatorNode[] = [];
  private loginLfo: OscillatorNode | null = null;
  private loginActive = false;

  playLoginMusic(): void {
    if (this.disabled || !this.ready || !this.ctx || !this.masterGain) return;
    if (this.loginActive) return;

    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();

    try {
      this.loginActive = true;

      // Master gain for login music — low volume ambient feel
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);
      gainNode.connect(this.masterGain);
      this.loginMusicGain = gainNode;

      // Route through reverb for atmosphere
      if (this.reverbSendGain) {
        gainNode.connect(this.reverbSendGain);
      }

      // Two oscillators: F3 (174Hz) base + C4 fifth (261Hz), triangle wave
      const freqs = [174.61, 261.63, 349.23]; // F3, C4, F4 — F major chord
      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        noteGain.gain.value =
          freq === 174.61 ? 1.0 : freq === 261.63 ? 0.7 : 0.45;
        osc.connect(noteGain);
        noteGain.connect(gainNode);
        osc.start();
        this.loginOscillators.push(osc);
      }

      // Also add a gentle upper harmony — A4 (440Hz) very soft
      const harmOsc = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harmOsc.type = "sine";
      harmOsc.frequency.value = 440;
      harmGain.gain.value = 0.2;
      harmOsc.connect(harmGain);
      harmGain.connect(gainNode);
      harmOsc.start();
      this.loginOscillators.push(harmOsc);

      // Slow LFO on gain for gentle swell effect (0.03Hz = ~33s cycle)
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.03;
      lfoGain.gain.value = 0.025; // Very subtle swell
      lfo.connect(lfoGain);
      lfoGain.connect(gainNode.gain);
      lfo.start();
      this.loginLfo = lfo;
    } catch {
      this.loginActive = false;
    }
  }

  stopLoginMusic(): void {
    if (!this.loginActive) return;
    this.loginActive = false;

    try {
      const ctx = this.ctx;
      if (ctx && this.loginMusicGain) {
        const now = ctx.currentTime;
        this.loginMusicGain.gain.cancelScheduledValues(now);
        this.loginMusicGain.gain.setValueAtTime(
          Math.max(this.loginMusicGain.gain.value, 0.0001),
          now,
        );
        this.loginMusicGain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
      }
      setTimeout(() => {
        for (const osc of this.loginOscillators) {
          try {
            osc.stop();
            osc.disconnect();
          } catch {}
        }
        this.loginOscillators = [];
        if (this.loginLfo) {
          try {
            this.loginLfo.stop();
            this.loginLfo.disconnect();
          } catch {}
          this.loginLfo = null;
        }
        if (this.loginMusicGain) {
          try {
            this.loginMusicGain.disconnect();
          } catch {}
          this.loginMusicGain = null;
        }
      }, 1300);
    } catch {
      // cleanup silently
    }
  }

  // ─── Volume control ───────────────────────────────────────────────────────

  setMasterVolume(vol: number): void {
    const v = clamp(vol);
    this.settings.master = v;
    saveSettings(this.settings);
    if (!this.masterGain) return;
    const ctx = this.getCtx();
    const now = ctx ? ctx.currentTime : 0;
    if (ctx) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(
        Math.max(this.masterGain.gain.value, 0.0001),
        now,
      );
      this.masterGain.gain.linearRampToValueAtTime(
        this.settings.enabled ? v : 0,
        now + 0.05,
      );
    } else {
      this.masterGain.gain.value = this.settings.enabled ? v : 0;
    }
  }

  setMusicVolume(vol: number): void {
    const v = clamp(vol);
    this.settings.music = v;
    saveSettings(this.settings);
    if (!this.musicBus) return;
    const ctx = this.getCtx();
    const now = ctx ? ctx.currentTime : 0;
    if (ctx) {
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(
        Math.max(this.musicBus.gain.value, 0.0001),
        now,
      );
      this.musicBus.gain.linearRampToValueAtTime(v, now + 0.05);
    } else {
      this.musicBus.gain.value = v;
    }
  }

  setSfxVolume(vol: number): void {
    const v = clamp(vol);
    this.settings.sfx = v;
    saveSettings(this.settings);
    if (!this.sfxBus) return;
    const ctx = this.getCtx();
    const now = ctx ? ctx.currentTime : 0;
    if (ctx) {
      this.sfxBus.gain.cancelScheduledValues(now);
      this.sfxBus.gain.setValueAtTime(
        Math.max(this.sfxBus.gain.value, 0.0001),
        now,
      );
      this.sfxBus.gain.linearRampToValueAtTime(v, now + 0.05);
    } else {
      this.sfxBus.gain.value = v;
    }
  }

  toggleMaster(): boolean {
    this.settings.enabled = !this.settings.enabled;
    saveSettings(this.settings);
    if (!this.masterGain) return this.settings.enabled;
    const ctx = this.getCtx();
    const now = ctx ? ctx.currentTime : 0;
    if (this.settings.enabled) {
      if (ctx) {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(0.0001, now);
        this.masterGain.gain.linearRampToValueAtTime(
          this.settings.master,
          now + 0.3,
        );
      } else {
        this.masterGain.gain.value = this.settings.master;
      }
      if (this.currentZone && !this.sessions.some((s) => !s.stopped)) {
        this._playZone(this.currentZone);
      }
    } else {
      if (ctx) {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(
          Math.max(this.masterGain.gain.value, 0.0001),
          now,
        );
        this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
        setTimeout(() => {
          if (this.masterGain) this.masterGain.gain.value = 0;
          this._stopAllSessions();
        }, 350);
      } else {
        this.masterGain.gain.value = 0;
        this._stopAllSessions();
      }
    }
    return this.settings.enabled;
  }

  get isEnabled(): boolean {
    return this.settings.enabled;
  }
  get masterVolume(): number {
    return this.settings.master;
  }
  get musicVolume(): number {
    return this.settings.music;
  }
  get sfxVolume(): number {
    return this.settings.sfx;
  }
  get isReady(): boolean {
    return (
      !this.disabled && this.ready && !!this.ctx && this.ctx.state === "running"
    );
  }
  get isDisabled(): boolean {
    return this.disabled;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const audioEngine = new AudioEngine();

export async function initAudio(): Promise<void> {
  return audioEngine.init();
}
export function playAttack(cls: CharacterClass): void {
  audioEngine.playAttack(cls);
}
export function playWarriorAttack(): void {
  audioEngine.playWarriorAttack();
}
export function playMageAttack(): void {
  audioEngine.playMageAttack();
}
export function playMonsterHit(): void {
  audioEngine.playMonsterHit();
}
export function playMonsterDeath(): void {
  audioEngine.playMonsterDeath();
}
export function playLevelUp(): void {
  audioEngine.playLevelUp();
}
export function playFootstep(
  surface: "grass" | "stone" | "wood" | "sand" | "default" = "default",
): void {
  audioEngine.playFootstep(surface);
}
export function playLootPickup(): void {
  audioEngine.playLootPickup();
}
export function playZoneTransition(): void {
  audioEngine.playZoneTransition();
}
// Legacy aliases kept for existing call sites
export function playHit(): void {
  audioEngine.playMonsterHit();
}
export function playCollectLoot(): void {
  audioEngine.playLootPickup();
}
export function playPortalActivate(): void {
  audioEngine.playZoneTransition();
}
export function playStairActivate(): void {
  audioEngine.playZoneTransition();
}
export function playZoneMusic(zone: string): void {
  audioEngine.playZoneMusic(zone);
}
export function playUIClick(): void {
  audioEngine.playUIClick();
}
export function toggleMaster(): boolean {
  return audioEngine.toggleMaster();
}
export function setMasterVolume(vol: number): void {
  audioEngine.setMasterVolume(vol);
}
export function setMusicVolume(vol: number): void {
  audioEngine.setMusicVolume(vol);
}
export function setSfxVolume(vol: number): void {
  audioEngine.setSfxVolume(vol);
}

/** Cycle through audio modes: both → music → sfx → mute → both.
 *  Saves to localStorage and updates bus gains immediately.
 */
export function setAudioMode(mode: AudioMode): void {
  try {
    localStorage.setItem(KEY_AUDIO_MODE, mode);
  } catch {}
  const eng = audioEngine as unknown as {
    musicBus: GainNode | null;
    sfxBus: GainNode | null;
    settings: { enabled: boolean; music: number; sfx: number };
    getCtx: () => AudioContext | null;
  };
  const musicEnabled = mode === "both" || mode === "music";
  const sfxEnabled = mode === "both" || mode === "sfx";
  const ctx = eng.getCtx?.();
  const now = ctx ? ctx.currentTime : 0;
  if (eng.musicBus) {
    const target = musicEnabled ? (eng.settings?.music ?? 0.8) : 0.0001;
    if (ctx) {
      eng.musicBus.gain.cancelScheduledValues(now);
      eng.musicBus.gain.setValueAtTime(
        Math.max(eng.musicBus.gain.value, 0.0001),
        now,
      );
      eng.musicBus.gain.linearRampToValueAtTime(target, now + 0.1);
    } else {
      eng.musicBus.gain.value = target;
    }
  }
  if (eng.sfxBus) {
    const target = sfxEnabled ? (eng.settings?.sfx ?? 0.75) : 0.0001;
    if (ctx) {
      eng.sfxBus.gain.cancelScheduledValues(now);
      eng.sfxBus.gain.setValueAtTime(
        Math.max(eng.sfxBus.gain.value, 0.0001),
        now,
      );
      eng.sfxBus.gain.linearRampToValueAtTime(target, now + 0.1);
    } else {
      eng.sfxBus.gain.value = target;
    }
  }
  if (mode === "mute" && eng.settings) {
    eng.settings.enabled = false;
  } else if (eng.settings) {
    eng.settings.enabled = true;
  }
}

export function getAudioMode(): AudioMode {
  try {
    const stored = localStorage.getItem(KEY_AUDIO_MODE) as AudioMode | null;
    if (stored && ["both", "music", "sfx", "mute"].includes(stored))
      return stored;
  } catch {}
  return "both";
}

export function cycleAudioMode(): AudioMode {
  const current = getAudioMode();
  const modes: AudioMode[] = ["both", "music", "sfx", "mute"];
  const idx = modes.indexOf(current);
  const next = modes[(idx + 1) % modes.length]!;
  setAudioMode(next);
  return next;
}
export function isAudioEnabled(): boolean {
  return audioEngine.isEnabled;
}
export function playAmbientLayer(zone: string): void {
  audioEngine.playAmbientLayer(zone);
}
export function stopAmbientLayer(): void {
  audioEngine.stopAmbientLayer();
}
export function playLoginMusic(): void {
  audioEngine.playLoginMusic();
}
export function stopLoginMusic(): void {
  audioEngine.stopLoginMusic();
}
export function playHealingChime(): void {
  audioEngine.playHealingChime();
}
export function playVoiceEmote(type: "laugh" | "cheer" | "no" | "yes"): void {
  audioEngine.playVoiceEmote(type);
}

/** Synthesized thunder boom: low bass rumble at ~80Hz with quick fade */
export function playThunder(): void {
  const eng = audioEngine as unknown as {
    sfxBus: GainNode | null;
    settings: { enabled: boolean };
    disabled: boolean;
    ready: boolean;
    masterGain: GainNode | null;
    getCtx: () => AudioContext | null;
  };
  if (eng.disabled || !eng.settings?.enabled) return;
  const ctx = eng.getCtx?.();
  if (!ctx || !eng.masterGain) return;
  try {
    const now = ctx.currentTime;
    // Low rumble: triangle oscillator at 80Hz, fast decay
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.45, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.connect(g);
    g.connect(eng.masterGain);
    osc.start(now);
    osc.stop(now + 1.3);
    // Second lower partial for depth
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(40, now);
    osc2.frequency.exponentialRampToValueAtTime(20, now + 0.6);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(0.3, now + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(g2);
    g2.connect(eng.masterGain);
    osc2.start(now);
    osc2.stop(now + 1.0);
  } catch {
    /* non-fatal */
  }
}

// ─── New SFX: critical hit + dodge ───────────────────────────────────────────

/** Distinct critical hit sound — higher pitch, more impact than normal hit */
export function playCriticalHit(): void {
  const eng = audioEngine as unknown as {
    sfx: (fn: (ctx: AudioContext, out: GainNode) => void) => void;
    sfxBus: GainNode | null;
    settings: { enabled: boolean };
    disabled: boolean;
    ready: boolean;
    getCtx: () => AudioContext | null;
  };
  if (eng.disabled || !eng.settings?.enabled) return;
  const ctx = eng.getCtx?.();
  if (!ctx || !eng.sfxBus) return;
  try {
    const now = ctx.currentTime;
    // Sharp metallic ping at 3500Hz → 1800Hz (distinct, satisfying)
    const ping = ctx.createOscillator();
    const pg = ctx.createGain();
    ping.type = "sine";
    ping.frequency.setValueAtTime(3500, now);
    ping.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
    pg.gain.setValueAtTime(0.0001, now);
    pg.gain.linearRampToValueAtTime(0.35, now + 0.008);
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    ping.connect(pg);
    pg.connect(eng.sfxBus);
    ping.start(now);
    ping.stop(now + 0.2);
    // Impact noise burst
    const bufLen = Math.round(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) ** 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 2400;
    bpf.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(bpf);
    bpf.connect(ng);
    ng.connect(eng.sfxBus);
    noise.start(now);
    noise.stop(now + 0.06);
  } catch {
    /* non-fatal */
  }
}

/** Dodge roll whoosh sound */
export function playDodge(): void {
  const eng = audioEngine as unknown as {
    sfx: (fn: (ctx: AudioContext, out: GainNode) => void) => void;
    sfxBus: GainNode | null;
    settings: { enabled: boolean };
    disabled: boolean;
    ready: boolean;
    getCtx: () => AudioContext | null;
  };
  if (eng.disabled || !eng.settings?.enabled) return;
  const ctx = eng.getCtx?.();
  if (!ctx || !eng.sfxBus) return;
  try {
    const now = ctx.currentTime;
    // Fast whoosh: 800 → 200Hz sweep, very short
    const sweep = ctx.createOscillator();
    const sg = ctx.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(800, now);
    sweep.frequency.exponentialRampToValueAtTime(200, now + 0.18);
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.linearRampToValueAtTime(0.22, now + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    sweep.connect(sg);
    sg.connect(eng.sfxBus);
    sweep.start(now);
    sweep.stop(now + 0.22);
  } catch {
    /* non-fatal */
  }
}
