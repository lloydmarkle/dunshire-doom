import { getContext } from 'svelte'
import { MapTextures, type RenderSector } from './RenderData';
import { Game, MapRuntime, type GameSettings, store, type Store, type DoomError, type Lump } from '../doom';
import { derived, get, writable, type Writable } from 'svelte/store';
import type { Color, Euler, Vector3 } from 'three';
import { createPointerLockControls } from './Controls/PointerLockControls';
import { createFullscreenControls } from './Controls/FullscreenControls';
import type { Size } from '@threlte/core';

interface RangeSetting extends BaseSetting<number> {
    type: 'range';
    min: number;
    max: number;
    step: number;
}
const range = (cat: MenuSettingCategory, val: Writable<number>, text: string, min: number, max: number, step: number): RangeSetting => ({ type: 'range', cat, min, max, step, val, text });

interface OptionSetting<T> extends BaseSetting<T> {
    type: 'option';
    options: T[];
}
const option = <T>(cat: MenuSettingCategory, val: Writable<T>, text: string, options: T[]): OptionSetting<T> => ({ type: 'option', cat, options, val, text });

interface ColorSetting extends BaseSetting<string> {
    type: 'color';
}
const color = (cat: MenuSettingCategory, val: Writable<string>, text: string): ColorSetting => ({ type: 'color', cat, val, text });

interface ToggleSetting extends BaseSetting<boolean> {
    type: 'toggle';
}
const toggle = (cat: MenuSettingCategory, val: Writable<boolean>, text: string): ToggleSetting => ({ type: 'toggle', cat, val, text });

type MenuSettingCategory = 'normal' | 'compatibility' | 'advanced' | 'debug' | 'experimental';
interface BaseSetting<T> {
    text: string;
    cat: MenuSettingCategory;
    val: Writable<T>;
}
export type MenuSetting = RangeSetting | OptionSetting<any> | ToggleSetting | ColorSetting;

export const createDefaultSettings = () => {
    const gameSettings: GameSettings = {
        freeFly: store(false),
        freelook: store(false),
        pistolStart: store(false),
        moveChecksZ: store(false),
        stuckMonstersCanMove: store(false),
        ghostMonsters: store(false),
        skipInitialSpawn: store(false),
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
        touchLookSpeed: writable(32),
        touchDeadZone: writable(0.2),
        tapTriggerTime: writable(0.2),
        analogMovement: writable(false),
        touchTargetSize: writable(10),
        touchTargetHzPadding: writable(1),
        touchTargetVPadding: writable(4),
    };
    const soundSettings = {
        musicPlayback: writable<'synth' | 'soundfont' | 'off'>('soundfont'),
        musicVolume: writable(.4),
        soundVolume: writable(.5),
        mainVolume: writable(.5),
        muted: writable(false),
        maxSoundChannels: writable(32),
        experimentalSoundHacks: writable(false),
    }
    return {
        ...gameSettings,
        ...soundSettings,
        ...touchControlSettings,
        ...controllerConfig,
        maxHudScale: writable(4),
        hudStyle: writable<'bottom' | 'top' | 'left' | 'right'>('bottom'),
        visibleHudMessages: writable(1),
        simulate486: writable(false),
        showStats: writable(false),
        showPlayerInfo: store(false),
        fpsLimit: writable(60),
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

    const settingsMenu = [
        range('normal', settings.mainVolume, 'Main volume', 0, 1, .1),
        range('normal', settings.soundVolume, 'Sound volume', 0, 1, .1),
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
        toggle('advanced', settings.interpolateMovement, 'Interpolate movement'),
        range('advanced', settings.timescale, 'Timescale', 0.1, 2, .1),
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
        toggle('debug', settings.skipInitialSpawn, 'No items/monsters (reset map progress)'),
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
        .subscribe(volume => mainGain.gain.linearRampToValueAtTime(volume, audio.currentTime + .1));
    settings.soundVolume.subscribe(volume => soundGain.gain.value = volume);
    settings.musicVolume.subscribe(volume => musicGain.gain.value = volume * .4);

    const musicTrack = store<Lump>(null);
    const pointerLock = createPointerLockControls(settings.cameraMode);
    const fullscreen = createFullscreenControls();
    const error = store<DoomError>(null);
    return { settings, settingsMenu, editor, audio, soundGain, musicGain, pointerLock, fullscreen, error, musicTrack };
}

export const createGameContext = (game: Game, viewSize: Size) => {
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