# Shadow vs Ivory

Create a polished browser-based 2D action fighting/shooting game with smooth animations and responsive keyboard controls.

GAME TITLE:
Shadow vs Ivory

CORE CONCEPT:
The player controls a fictional fighter named "Shadow." Shadow wears a black tactical outfit. The enemies belong to a fictional faction called "Ivory" and wear white outfits.

These are fictional factions based only on costume colors and must not represent any real-world race, ethnicity, nationality, religion, or protected group.

GAMEPLAY:

The player controls Shadow.

Shadow can attack enemies with:

A handgun

Punches

Kicks

Knee strikes

Close-range melee combos

Ivory enemies do not use guns.

Ivory enemies attack using:

Punches

Kicks

Close-range melee attacks

Enemies should move toward the player using simple combat AI.

Include player health and enemy health.

Include damage animations, hit reactions, knockback, and defeat animations.

Do not include graphic gore.

CONTROLS:

Left Arrow = move left

Right Arrow = move right

Up Arrow = jump

Spacebar = fire gun

A = punch

S = kick

D = knee attack

Shift = sprint or dodge

LEVEL SYSTEM:
Create exactly 5 levels.

Level 1 — Easy:

Small map

Few enemies

Slow enemy movement

Low enemy health

Introduce the controls

Level 2 — Medium:

More enemies

Slightly larger environment

Faster enemies

Introduce stronger melee enemies

Level 3 — Hard:

Larger map

More aggressive enemies

Enemies can surround the player

Increased enemy health and damage

Add environmental obstacles

Level 4 — Very Hard:

Multiple waves of enemies

Faster and smarter enemy AI

Less health recovery

Stronger elite enemies

More difficult platforming and combat sections

Level 5 — Extreme / Final:

Largest map

Multiple enemy waves

Elite enemies

Very aggressive AI

Final boss battle

The boss should have significantly more health, special melee attacks, dodging behavior, and multiple combat phases

VISUAL STYLE:
Create a beautiful, soft, eye-catching environment.

Color palette:

Ground: vibrant natural green

Sky: smooth blue-and-white gradient

Clouds: soft white

Environment: clean, bright, colorful, and visually relaxing

Shadows: soft and subtle

Lighting: warm and smooth

Use rounded shapes, smooth gradients, subtle particle effects, atmospheric depth, and polished animations.

The environment should feel visually attractive rather than dark or disturbing.

GAME WORLD:
Include:

Green grass

Hills

Trees

Rocks

Platforms

Small buildings or structures

Clouds

Background mountains

Decorative plants

Add parallax scrolling to background elements so the world feels deeper.

PLAYER UI:
Show:

Player health bar

Ammo count

Current level

Score

Remaining enemies

Current weapon

Pause button

GAME FLOW:

Main Menu

Start Game

Level selection screen

Gameplay

Level completed screen

Unlock next level

Game-over screen if player health reaches zero

Restart button

Final victory screen after completing Level 5

COMBAT SYSTEM:
Make combat responsive and satisfying.

Implement:

Shooting cooldown

Bullet collision

Melee hitboxes

Attack cooldowns

Combo attacks

Enemy hit reactions

Player hit reactions

Knockback

Jump attacks

Enemy death/defeat states

Temporary invulnerability after being hit

Ammo reload system

AI:
Enemies should:

Detect the player within a certain radius

Walk toward the player

Attack at close range

Move around obstacles

Occasionally dodge

Become more aggressive at higher levels

Higher levels should increase:

Enemy speed

Enemy health

Enemy damage

Enemy count

Enemy reaction speed

AI aggression

TECHNICAL REQUIREMENTS:
Build the game as a playable web application using HTML5 Canvas and JavaScript or React with a suitable browser game engine/library.

The game must:

Work directly in the browser

Support desktop keyboard controls

Maintain smooth animation near 60 FPS

Use reusable components/classes for Player, Enemy, Bullet, Level, Health, Combat, and GameState

Keep the code modular and easy to expand

Include collision detection

Include gravity

Include jumping physics

Include level progression

Include restart and pause systems

Add placeholder graphics made from polished vector-style shapes if final artwork is unavailable.

Make the first generated version fully playable rather than creating only a static UI mockup.

Prioritize:

Working player movement

Shooting

Melee combat

Enemy AI

Health and damage

Five-level progression

Attractive visual effects

Sound effects and polish

Generate the complete playable prototype, including all necessary components, game logic, UI, level configuration, and styling.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b93b9ee3-f4c5-4fa0-8221-43e4fcd934c4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
