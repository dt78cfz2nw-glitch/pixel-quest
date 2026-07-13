# Design Brief

## Direction

Pixel Quest — Professional online RPG with login/character management UI redesigned for premium feel. Game worlds: 10 distinct outdoor exploration zones, each with unique color palette, terrain, and atmospheric overlay. Pure open-world design (no interior/building UI styling). Pseudo-isometric top-down RPG with zone-specific tilesets, creature-appropriate aesthetics, enhanced UI bar gradients with glow effects, and smooth transitions. Modern clean pixel-art with strong character class identity, soft fantasy tone, lightweight and consistent.

## Tone

**Menus & Authentication:** Dark atmospheric fantasy. Gold (#FFD700) reserved for primary actions and selected states. Purple-blue magical accents (from Aurelion zone) create cohesive atmosphere. Login screen: 3-layer parallax (clouds, city silhouette, particles) immerses user before authentication. Character selection: left panel lists slots with gold glow on selection, right panel previews sprite + stats. Character creation: visual progression across 4 steps (class selection, appearance, name, confirmation) with gold-bordered class cards on step 1.

**Game worlds:** Open-world explorer's palette — Warm zones (meadow, jungle) evoke safety and life; cool zones (caves) evoke mystery and danger; hostile zones (ruins, lair) evoke dread and power. **Zone atmospheres:** Forest zones receive subtle darkening overlay (0/0/0 8% opacity) for density; Ruins zones receive cold desaturation overlay (200° C 0.02 12% opacity) for dread; Caves receive deep darkness overlay (0/0/0 15% opacity) for underground claustrophobia; Jungle receives golden humid haze (85° C 0.04 8% opacity). **Character Classes:** Warrior (orange-red 0.6/0.22/25, stocky armored silhouette, bold accent glow); Mage (violet 0.55/0.18/260, slim robed silhouette, mystical accent glow). High contrast for gameplay clarity.

## UI Bars & Progression

| Bar Type | Gradient Start | Gradient End | Glow | Effect |
| -------- | -------------- | ------------ | ---- | ------ |
| HP (Health) | 0.55 0.18 145 | 0.65 0.2 145 | Subtle → Full | Deep green gradient with glow when full |
| MP (Mana) | 0.45 0.16 260 | 0.55 0.18 255 | Subtle → Full | Vibrant blue gradient with glow when full |
| XP (Experience) | 0.6 0.15 85 | 0.7 0.18 75 | Subtle → Full | Golden yellow gradient with glow when full |

## Zone Palettes

| Zone                | Base      | Highlight | Shadow    | Accent    | Monsters | Feel                        |
| ------------------- | --------- | --------- | --------- | --------- | -------- | --------------------------- |
| Meadow Hub          | 0.45 0.1 145 | 0.55 0.12 145 | 0.35 0.08 145 | 0.75 0.2 145 | None     | Safe, lush, welcoming       |
| Wolf Forest         | 0.28 0.08 145 | 0.38 0.1 145 | 0.18 0.06 145 | 0.55 0.18 260 | Wolves   | Dense, predatory, cool      |
| Tiger Jungle        | 0.42 0.14 90 | 0.52 0.16 80 | 0.32 0.1 100 | 0.65 0.18 30 | Tigers   | Tropical, warm, humid       |
| Bear Forest         | 0.35 0.06 55 | 0.45 0.08 50 | 0.25 0.04 60 | 0.6 0.22 25 | Bears    | Earthy, rugged, natural     |
| Ancient Ruins       | 0.32 0.02 200 | 0.42 0.03 200 | 0.18 0.01 200 | 0.5 0.08 30 | Trolls   | Crumbling, desaturated      |
| Crystal Ruins       | 0.16 0.01 200 | 0.35 0.12 260 | 0.08 0 0 | 0.45 0.14 270 | Golems   | Ominous, dark, magical      |
| Bat Cave            | 0.12 0.01 200 | 0.22 0.02 200 | 0.06 0 0 | 0.55 0.18 260 | Bats     | Dark, cramped, underground  |
| Spider Cave         | 0.16 0.03 55 | 0.26 0.04 50 | 0.08 0.02 60 | 0.45 0.12 25 | Spiders  | Organic, creepy, rust       |
| Cyclops Lair        | 0.28 0.12 25 | 0.38 0.14 20 | 0.16 0.08 30 | 0.65 0.18 30 | Cyclops  | Volcanic, hostile, menacing |
| Wilderness          | 0.38 0.08 145 | 0.48 0.1 145 | 0.28 0.06 145 | 0.75 0.2 145 | Slimes   | Varied, accessible, starter |
| Dungeon             | 0.24 0.01 200 | 0.34 0.02 200 | 0.12 0.01 200 | 0.55 0.18 260 | Mixed    | Cold, oppressive, grey      |

## Typography

Display: Space Grotesk, Body: Space Grotesk, Mono: JetBrains Mono. HUD `text-xs uppercase`, Player name `text-lg font-bold`, Class badge `text-xs font-bold uppercase` with zone-color border and glow.

## Elevation & Depth

Tile shading via 3-tier OKLCH variants (base/highlight/shadow). Top-lit directional lighting, soft drop shadows (6×12px, 50% opacity) beneath characters. Pseudo-isometric tilt via sprite placement and layering. Bars and UI elements use subtle gradient depth with 4px glow on full state. No blur effects—clarity prioritized.

## Animation & Motion

Idle: 1.5s ease-in-out bob, Walk: 6-frame enhanced cycle 0.6s, Attack: Warrior 0.3s rotate, Mage 0.4s projectile. Camera: 150ms smooth pursuit. Portal: 1.2s pulse. Loot: 0.8s bob. **Bars:** HP/MP/XP smooth fill 0.3s cubic-bezier with glow pulse on full. Zone transitions: 0.15s fade-out, 0.15s fade-in per zone accent color. Button press: 0.3s scale pulse with accent glow.

## UI Screens

**Login:** 3-layer parallax background (slow clouds, Aurelion silhouette purple-blue, magical particles). "PIXEL QUEST" title with pulsing golden glow. Gold-bordered button (Internet Identity + shield icon), silver guest button. Live player counter bottom bar. Ambient epic music.

**Character Select:** 2-panel layout. Left: 3 character slots showing class portrait, name, level, last zone, playtime. Selected: gold 2px border + glow shadow. Right: large idle sprite, class-themed background (Warrior: stone hall + torches; Mage: arcane library + particles), stats with icons (⚔/❤/💧), active title yellow, equipped items row. Buttons: gold "Enter World", red "Delete" with confirmation.

**Character Creation:** Step 1 — two large cards (Warrior left, Mage right) with artwork, class description, stat bars, gold glow on select. Step 2 — appearance thumbnails + live color picker. Step 3 — name input with real-time canister validation. Step 4 — summary card with confirm.

**Loading Screen:** Animated logo, smooth gold gradient bar, rotating tips every 2s, zone artwork background, minimum 1s display, fade to black on entry.

**Settings:** Tabbed (Audio/Graphics/Gameplay/Account), sliders/toggles matching RPG gold theme, all settings saved to canister, applied instantly.

## Interactive Elements

Portal tiles: Glowing base with animated pulse. Stairs: Stone step visual, clear descend cue. Path exits: Arrow or highlight at zone edge. Doors: Marked entrance tiles. Loot: Coin bobbing with glimmer, item glow. Transitions: Color-tinted fade per zone (Meadow emerald, Forest cool blue-green, Ruins cold cyan, Jungle golden, Caves deep purple). Login buttons: Gold primary (#FFD700 border + rgba glow), silver secondary, smooth press feedback.

## Constraints

Canvas-only tile rendering using OKLCH vars. No buildings/interiors in outdoor zones. Portable and lightweight. Grid-aligned collision for clarity. Zone atmospheric overlays render via CSS gradient with pointer-events: none, layered over canvas. Character class accents (Warrior orange, Mage violet) reinforce visual identity across all UI elements. Every zone has clear exit points and no dead-ends. UI bars support graceful degradation (glow effect optional if performance constraints arise).

## Signature Detail

**Marketing Website (Separate ICP Canister):** Standalone landing page, separate canister. Pure HTML/CSS/JS, no React. AAA fantasy game aesthetic. Canvas starfield hero (200 stars, shooting stars, aurora), gold-glowing "PIXEL QUEST" title, green "PLAY NOW" button. Sections: About (on-chain gameplay), Classes (Warrior/Mage with HP/MP/ATK/DEF bars), World (8-island grid with difficulty/zone badges), Technology (ICP + Motoko + AI narrative + 6 tech badges), Live Leaderboard (10 rows, real-time updates), Final CTA, Footer. Typography: Press Start 2P headings, Inter body. Colors: Gold (#ffdd44) accent, Purple (#8844ff) secondary, Blue (#4466ff) tertiary, Green (#22cc44) CTAs, dark backgrounds (#0a0a1a/#0d0d20/#080818). Animations: CSS/GPU only (transform/opacity, no DOM particles). Responsive: mobile-first 320px–1400px, hamburger menu, 44px touch targets. Performance: Lighthouse 90+, FCP <1.5s, TTI <2.5s, zero external deps. Live data: Polls game canister every 30–60s for player count, leaderboard, kill counter (graceful fallback to "--" if unreachable).

**Login Atmosphere:** Parallax background creates depth before entry. Aurelion purple-blue silhouette (from existing zone) grounds fantasy setting. Gold glow on logo pulses slowly, reinforcing premium feel. Buttons use existing gold border system — no new colors introduced.

**Character Management:** Selection left/right panel balance mimics professional game launchers. Gold glow on selected slot reuses existing `.character-class-warrior` / `.character-class-mage` box-shadow system. Class cards in creation use existing border-2 border-primary + bg-primary/10 selected state.

**Multi-zone open world with enhanced atmospheres:** Meadow Hub (bright emerald 0.45/0.1/145, no overlay) → Wolf Forest (dense green 0.28/0.08/145, dark -8% overlay) → Tiger Jungle (tropical gold 0.42/0.14/90, golden haze overlay) → Bear Forest (earthy brown 0.35/0.06/55) → Ancient Ruins (desaturated stone 0.32/0.02/200, cold blue overlay -12%) → Crystal Ruins (dark purple with cyan glow 0.16/0.01/200 → 0.35/0.12/260) → Bat Cave (dark blue-grey 0.12/0.01/200, deep shadow -15% overlay) → Spider Cave (rust-brown 0.16/0.03/55) → Cyclops Lair (volcanic red 0.28/0.12/25) → Dungeon (cold grey 0.24/0.01/200). **Class Identity:** Warrior badge glows orange-red with armored silhouette; Mage badge glows violet with robed silhouette. **UI Feedback:** HP bar deep green gradient with glow, MP bar vibrant blue gradient with glow, XP bar golden gradient with glow. Each zone texture-distinct, creature-appropriate, visually memorable. Top-lit pseudo-isometric shading unified across all zones.

