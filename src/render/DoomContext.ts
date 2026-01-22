import { getContext } from 'svelte'
import { MapTextures, type RenderSector } from './RenderData';
import { Game, MapRuntime, type GameSettings, store, type Store, type DoomError, type Lump } from '../doom';
import { derived, get, writable } from 'svelte/store';
import type { Color, Euler, Vector3 } from 'three';
import { createPointerLockControls } from './Controls/PointerLockControls';
import { createFullscreenControls } from './Controls/FullscreenControls';
import { menuSetting } from './Menu/menu';

export const createDefaultSettings = () => {
    const gameSettings: GameSettings = {
        freeFly: store(false),
        freelook: store(false),
        pistolStart: store(false),
        moveChecksZ: store(false),
        stuckMonstersCanMove: store(false),
        ghostMonsters: store(false),
        spawnMode: store('everything'),
        zAimAssist: store(true),
        xyAimAssist: store(false),
        invicibility: store(false),
        noclip: store(false),
        alwaysRun: store(true),
        compassMove: store(false),
        shotTraceSeconds: store(0),
        maxLostSouls: store(20),
        randomNumbers: store('table'),
        timescale: store(1),
        monsterAI: store('enabled'),
        cameraMode: store('1p'),
    };
    const controllerConfig = {
        mouseSensitivity: writable(2),
        mouseInvertY: writable(false),
        mouseSwitchLeftRightButtons: writable(false),
        keymap: store({
            'mf': ['KeyW', 'ArrowUp'],
            'mb': ['KeyS', 'ArrowDown'],
            'ml': ['KeyA', 'ArrowLeft'],
            'mr': ['KeyD', 'ArrowRight'],
            'mu': ['KeyR'],
            'md': ['KeyT'],
            'u': ['KeyE', 'Space'],
            'a': ['KeyQ'],
            'r': ['ShiftLeft', 'ShiftRight'],
            's': ['AltLeft', 'AltRight'],
            'w1': ['Digit1', 'Numpad1'],
            'w2': ['Digit2', 'Numpad2'],
            'w3': ['Digit3', 'Numpad3'],
            'w4': ['Digit4', 'Numpad4'],
            'w5': ['Digit5', 'Numpad5'],
            'w6': ['Digit6', 'Numpad6'],
            'w7': ['Digit7', 'Numpad7'],
        }),
    };
    const touchControlSettings = {
        touchLookSpeed: writable(110),
        touchDeadZone: writable(0.2),
        tapTriggerTime: writable(0.2),
        analogMovement: writable(true),
        touchAreaSize: writable(80),
    };
    const soundSettings = {
        musicPlayback: writable<'synth' | 'soundfont' | 'off'>('soundfont'),
        muted: writable(false),
        mainVolume: writable(.4),
        musicVolume: writable(.5),
        soundVolume: writable(.5),
        maxSoundChannels: writable(32),
        experimentalSoundHacks: writable(false),
    }
    return {
        ...gameSettings,
        ...soundSettings,
        ...touchControlSettings,
        ...controllerConfig,
        maxHudScale: writable(3),
        hudStyle: writable<'bottom' | 'top' | 'left' | 'right'>('bottom'),
        visibleHudMessages: writable(1),
        simulate486: writable(false),
        showStats: writable(false),
        showPlayerInfo: store(false),
        fpsLimit: writable(60),
        lightScale: writable(1),
        pixelScale: writable(1),
        fov: writable(72),
        interpolateMovement: store(true),
        useTextures: store(true),
        wireframe: writable<'off' | 'visible' | 'all'>('off'),
        showBlockMap: writable(false),
        fakeContrast: writable<'classic' | 'gradual' | 'off'>('classic'),
        renderMode: writable<'r1' | 'r2'>('r2'),
        playerLight: writable("#000000"),
    };
}
export type KeyMap = Pick<ReturnType<typeof createDefaultSettings>, 'keymap'>['keymap']['initial'];

export const createAppContext = () => {
    const settings = createDefaultSettings();
    const editor = writable({
        active: false,
        selected: null,
    });

    const touchDevice = matchMedia('(hover: none)').matches;
    if (touchDevice) {
        // set some different default settings for touch devices
        settings.xyAimAssist.set(true);
        settings.fov.set(90);
        settings.hudStyle.set('top');
    }

    function loadSettings() {
        try {
            const prefs = JSON.parse(localStorage.getItem('doom-prefs'));
            Object.keys(settings).filter(k => prefs[k] !== undefined)
                .forEach(k => {
                    if (typeof settings[k] === 'object') {
                        settings[k].set(prefs[k]);
                    } else {
                        settings[k] = prefs[k]
                    };
                });
        } catch {
            console.warn('failed to restore preferences, using defaults');
        }
    }
    loadSettings();

    function saveSettings() {
        const obj = Object.keys(settings).reduce((o, k) => {
                o[k] = typeof settings[k] === 'object' ? get(settings[k]) : settings[k];
                return o;
            }, {});
        localStorage.setItem('doom-prefs', JSON.stringify(obj));
    }
    Object.keys(settings).filter(k => typeof settings[k] === 'object').forEach(k => settings[k].subscribe(saveSettings));

    const { range, option, toggle, color } = menuSetting;
    const settingsMenu = [
        toggle('normal', settings.muted, 'Mute sound'),
        range('normal', settings.mainVolume, 'Main volume', 0, 1, .1),
        range('normal', settings.soundVolume, 'Effects volume', 0, 1, .1),
        range('normal', settings.musicVolume, 'Music volume', 0, 1, .1),
        option('normal', settings.maxSoundChannels, 'Sound channels', [4, 8, 16, 32, 64]),
        option('normal', settings.musicPlayback, 'Music voice', ['synth', 'soundfont', 'off']),
        option('advanced', settings.cameraMode, 'Camera', ['bird', 'ortho', '1p', '3p', '3p-noclip', 'svg']),
        toggle('advanced', settings.xyAimAssist, 'Aim assist'),
        toggle('advanced', settings.zAimAssist, 'Auto Z-Aim'),
        toggle('advanced', settings.alwaysRun, 'Always run'),
        toggle('advanced', settings.freelook, 'Free look'),
        toggle('advanced', settings.pistolStart, 'Pistol start'),
        range('advanced', settings.maxHudScale, 'Max status bar size', .5, 10, .1),
        option('advanced', settings.hudStyle, 'Status bar style', ['top', 'bottom']),
        range('advanced', settings.visibleHudMessages, 'Visible messages', 1, 10, 1),
        range('advanced', settings.fov, 'Field of view (FOV)', 50, 120, 2),
        range('advanced', settings.lightScale, 'Brightness', .1, 4, .1),
        toggle('advanced', settings.interpolateMovement, 'Interpolate movement'),
        range('advanced', settings.timescale, 'Timescale', 0.1, 4, .1),
        option('advanced', settings.fakeContrast, 'Fake contrast', ['classic', 'gradual', 'off']),
        range('advanced', settings.fpsLimit, 'Max FPS', 5, 200, 5),
        range('advanced', settings.pixelScale, 'Pixel scale', .1, window.devicePixelRatio, .1),
        color('advanced', settings.playerLight, 'Player light'),
        toggle('compatibility', settings.moveChecksZ, 'Allow walking over or under monsters'),
        toggle('compatibility', settings.stuckMonstersCanMove, 'Allow stuck monsters to move'),
        toggle('compatibility', settings.ghostMonsters, 'Allow ghost monsters'),
        range('compatibility', settings.maxLostSouls, 'Max Lost Souls (0 means no limit)', 0, 50, 5),
        option('compatibility', settings.randomNumbers, 'Random numbers', ['table', 'computed']),
        // toggle($editor.active, 'Inspector'),
        toggle('debug', settings.showStats, 'Show render stats'),
        toggle('debug', settings.showBlockMap, 'Show blockmap'),
        toggle('debug', settings.useTextures, 'Show textures'),
        range('debug', settings.shotTraceSeconds, 'Shot tracer duration (seconds)', 0, 20, .25),
        option('debug', settings.monsterAI, 'AI mode', ['enabled', 'disabled', 'move-only', 'fast']),
        option('debug', settings.spawnMode, 'Spawn mode (reset map progress)', [ 'everything', 'items-only', 'players-only']),
        option('debug', settings.wireframe, 'Show geometry', ['off', 'visible', 'all']),
        option('debug', settings.renderMode, 'Render engine', ['r1', 'r2']),
        // experimental
        toggle('experimental', settings.experimentalSoundHacks, 'Room accoustics (experimental)'),
    ];

    const audio = new AudioContext();
    const soundGain = audio.createGain();
    const musicGain = audio.createGain();
    const mainGain = audio.createGain();
    mainGain.connect(audio.destination);
    soundGain.connect(mainGain);
    musicGain.connect(mainGain);
    derived([settings.muted, settings.mainVolume],
        ([muted, volume]) => muted ? 0 : volume)
        .subscribe(volume => mainGain.gain.value = volume);
    settings.soundVolume.subscribe(volume => soundGain.gain.value = volume);
    settings.musicVolume.subscribe(volume => musicGain.gain.value = volume * .4);

    const musicTrack = store<Lump>(null);
    const pointerLock = createPointerLockControls(settings.cameraMode);
    const fullscreen = createFullscreenControls();
    const error = store<DoomError>(null);
    return { settings, settingsMenu, editor, audio, soundGain, musicGain, pointerLock, fullscreen, error, musicTrack };
}

export const createGameContext = (game: Game, viewSize: Store<{ width: number; height: number }>) => {
    const textures = new MapTextures(game.wad);
    const wad = game.wad;
    return { game, wad, textures, viewSize };
}

export const useAppContext = (): ReturnType<typeof createAppContext> => getContext('doom-app-context');
export const useDoom = (): ReturnType<typeof createGameContext> => getContext('doom-game-context');
export const useDoomMap = (): {
    map: MapRuntime,
    renderSectors: RenderSector[],
    skyColor: Color,
    camera: { position: Store<Vector3>, angle: Store<Euler> },
} => getContext('doom-map');