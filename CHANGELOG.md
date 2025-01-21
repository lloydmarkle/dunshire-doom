# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.10.0] - 2025-01-21

### Added
- [Property transfer linedefs](https://doomwiki.org/wiki/Linedef_type#Property_transfer). Not including palette change but otherwise it should _just work_.
- Play sounds for moving platforms. All DOOM sound effects should play properly now.
- Partial [voodoo doll](https://doomwiki.org/wiki/Voodoo_doll) support. Dolls move and trigger lines but will not pick up items or take damage.
- Keyboard shortcuts for cheats: `fly` (toggle freefly) and `inspect` (toggle inspector)

### Changed
- Use [SpessaSynth](https://github.com/spessasus/SpessaSynth) for midi playback. Way better music playback now.
- Link to FreeDoom assets for first time users
- Improved tracking and for isometric camera. Players can now see the whole map.
- Use Blockmap for collision detection and [many other performance improvements](https://www.lloydmarkle.com/quieter-life/2025/doom-perf-part-3/):
    - Reduce memory usage by moving away from svelte stores in core logic
    - Use Maps and Sets to speed up map load and map queries
    - Faster monster move checks when in a crowd

### Fixed
- BFG tracers not hitting targets
- Auto z-aim aiming at monster feet
- Do not slow crushers when crushing non-solid objects (eg. medikits)
- Map fail to load when linedef does not have front sidedef (!)
- Do not `console.warn()` when triggering known linedef types
- Delayed sprite rotation at low framerates (< 5fps)
- Monster moving when they start in a sector with low ceiling
- Missiles skimming the ground instead of exploding when they hit trees
- Linedef type 53 choosing wrong neighbour sector
- Numerous sound fixes:
    - Stop crackling/popping on sound playback
    - Adjustable max channels
    - Replace distance sounds with closer sounds
    - Don't crash on zero length sounds
    - Sound propagation
- Intermission timing and sound playback stopping too early

## [0.9.1] - 2024-11-21

### Fixed
- Fix player not sliding along walls in some maps
- Fix BFG trace position and trace hit sprite offset

## [0.9.0] - 2024-11-18

### Added
- Error screen to show when maps are invalid, fail to load, or the game crashes

### Changed
- R2: sprites rendered via instance geometry (big performance boost)
- smaller texture atlas to speed up map load (600ms -> 10ms)
- Improved algorithm to generate "fake floors"
- Reduce render frequency when showing menu (reduce energy use)
- R2: scrolling wall calculation done in shader to reduce CPU load and enable interpolation

### Fixed
- Load maps with missing textures (eg. idumea MAP02)
- Fade in and out timing on nightvision was wrong
- Set sky height properly (eg. E3M1)
- Reset game when wads in url change

## [0.8.1] - 2024-10-28

### Fixed
- Limit texture atlas to 8K so we don't crash webviews on iOS
- Fix animated textures not being removed

## [0.8.0] - 2024-10-26

### Added
- Url parameters to setup player position and direction (for sharing)
- Setting to turn off monsters/things when loading a map
- Tall patch support for wall textures taller than 256px
- MP3 and MIDI music playback
- Handle custom wall animations and switches ([ANIMATED](https://doomwiki.org/wiki/ANIMATED) and [SWITCHES](https://doomwiki.org/wiki/SWITCHES) lumps)
- Vertical texture scrolling
- Point light that follows the player and casts shadows

### Changed
- Added new renderer (R2) with significantly better performance for map geometry. Monsters/items still needs work.
- Add short pause after monster death in Doom2 victory screen

### Fixed
- yOffset on middle textures wasn't applied properly in some cases
- Use [logarithmic depth buffer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.logarithmicDepthBuffer) to avoid z-fighting in large maps (Sunder)
- Fix fog on overhead camera view
- Fix several holes in map floors/ceilings
- Reduce animated wall texture init on large maps from 2s to 50ms
- Reduce map render data init by 5-8s for large maps

## [0.7.1] - 2024-10-08

### Fixed
- Doom 2 victory screen

## [0.7.0] - 2024-10-08

### Added
- Doom random number generator (RNG) and setting
- Loading uncompressed zdoom bsp nodes (XNOD) for modern maps (like cosmogenesis)

### Changed
- Removed kaitai struct dependency for reading wads. Remove 1 dependency and 1KLoC
- Use CSS transforms (instead of changing viewbox) to make large SVGs render faster

### Fixed
- Monster interpolation even after target dies
- Custom textures from PWADs were not loaded properly
- Power up duration corrected for: rad suit, light amp, and invis
- Improve map load performance (from 3-4seconds to 400-800ms on larger maps)

## [0.6.0] - 2024-09-10

### Changed
- Renamed project (iso is not really specific enough)

## [0.5.0] - 2024-04-08

### Added
- Field of view (FOV) setting
- Interpolate movement (especially noticeable with timescale)
- full screen

### Fixed
- Added back WAD dropbox on startup screen
- Fix pain elementals spawning lost souls above the ceiling

## [0.4.1] - 2024-03-25
Fixed scrolling in menu screens (broken due to screen wipe).

## [0.4.0] - 2024-03-23

### Added
- `<noscript>` block if javascript is disabled
- Quick options in menu (camera, mute, and 486-mode)
- "Next episode" button in menu when completing M8 levels in DOOM 1
- Pressing use or attack will restart the map when dead
- Basic screen wipes

### Changed
- Smooth transition on intro menu and improve intro menu workflow
- Intro menus update url fragment which gives a nice behaviour with browser back button
- Pause game when showing menu

### Fixed
- Health showing 0% but player not dead
- Player thrust is applied consistently in different timescale and max fps
- Floating monsters not floating over obstacles
- Map transitions not working in E2, E3, and E4

## [0.3.0] - 2024-03-07

### Added
- Configuration screen for touch controls
- Keyboard control remap
- keyboard cheat codes
- aim assist setting (mostly for touch screens)

### Fixed
- several collision detection bugs
- fix monsters not opening doors
- fix crushers/doors reversing even when they've crushed objects
- fix sound propagating too far
- missile auto aim
- revenant tracer rockets turning too fast
- chainsaw idle sounds

## [0.2.0] - 2024-02-22

### Added

- Victory screens
- Fake contrast lighting
- Switch weapons wehen out of ammo
- Setting to limit fps
- Toggle fps on release builds
- Always run setting
- Mobile controls (v1). Not super friendly but they work.

### Changed
- Upgrade to threlte v7
- Lock pointer when starting game (1-less click to play)

### Fixed
- Render enemies in invisible sectors (eg. cages in plutonia MAP24)
- GL shaders on old hardware
- Layout and menu fixes and tweaks

## [0.1.0] - 2024-02-12
- Initial release with bugs and missing features (see README). We'll improve that over time.