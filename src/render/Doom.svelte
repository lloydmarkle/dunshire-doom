<script lang="ts">
    import { type Game, randomNorm, store } from "../doom";
    import { onDestroy, setContext } from "svelte";
    import { createGameContext, useAppContext } from "./DoomContext";
    import EditPanel from "./Editor/EditPanel.svelte";
    import PlayerInfo from "./Debug/PlayerInfo.svelte";
    import { buildRenderSectors } from "./RenderData";
    import { Canvas, type ThrelteContext } from "@threlte/core";
    import HUD from "./HUD/HUD.svelte";
    import R1 from "./Map/Root.svelte";
    import R2 from "./R2/Root.svelte";
    import SvgMapRoot from "./Svg/Root.svelte";
    import MapContext from "./Map/Context.svelte";
    import Intermission from "./Intermission/Intermission.svelte";
    import SoundPlayer from "./SoundPlayer.svelte";
    import WipeContainer from "./Components/WipeContainer.svelte";
    import { randInt } from "three/src/math/MathUtils";
    import { type WebGLRendererParameters } from "three";
    import { derived } from "svelte/store";
    import { SpriteSheet } from "./R2/Sprite/SpriteAtlas";

    export let game: Game;
    export let soundGain: GainNode;
    export let paused: boolean;

    let viewSize = store({ width: 320, height: 200 });
    const doomContext = createGameContext(game, viewSize);
    setContext("doom-game-context", doomContext);
    const { settings, editor, error, pointerLock, musicTrack } = useAppContext();
    const { cameraMode, showPlayerInfo, renderMode } = settings;
    const { map, intermission } = game;

    // NOTE: add noise to map name so that idclev to same map does screen wipe
    $: screenName = ($map?.name ?? '') + Math.random();
    $: intScreen = $intermission ? 'summary' : null;

    let intermissionMusic: string;
    $: mapMusicTrack = $map?.musicTrack;
    $: $musicTrack = game.wad.optionalLump($mapMusicTrack ?? intermissionMusic);

    // only create once
    $: spriteSheet = ($cameraMode !== 'svg' && threlteCtx) ? (spriteSheet ?? new SpriteSheet(game.wad, threlteCtx.renderer.capabilities.maxTextureSize)) : spriteSheet;
    $: renderSectors = $map ? buildRenderSectors(game.wad, $map) : [];
    $: settings.compassMove.set($cameraMode === "svg");

    let threlteCtx: ThrelteContext;
    let frameTime: number;
    let tscale: number;
    // force render on screensize change
    $: if (viewSize) threlteCtx?.advance();

    // A fun little hack to make the game feel like it used to on my 486sx25
    const { simulate486, timescale, pixelScale, fpsLimit } = settings;
    // F5 low-res mode (it should be .5 but that looks to sharp IMO)
    // FIXME: starting the game with low pixel ratio and then increasing doesn't work... why?
    $: threlteCtx?.renderer?.setPixelRatio($simulate486 ? .2 : $pixelScale);
    const use486TimeParams = () => {
        if (!$simulate486) {
            return;
        }
        setTimeout(use486TimeParams, randInt(200, 800));
        // a real 486 would slow down if there was a lot of geometry or bad guys but this was simple and fun.
        // This guy has some neat numbers though we're not strictly following it https://www.youtube.com/watch?v=rZcAo4oUc4o
        frameTime = 1 / randomNorm(2, 18, 1.2);
        // IIRC even game logic would slow down when the CPU was busy. We simulate that slowing down time (just a little)
        tscale = 1 - frameTime * 2;
    }
    const useNormalTimeParams = (fpsLimit: number, timescale: number) => {
        frameTime = 1 / fpsLimit;
        tscale = timescale;
    }
    $: $simulate486 ? use486TimeParams() : useNormalTimeParams($fpsLimit, $timescale);

    const { switchRAF, stopRAF } = (function() {
        let frameReq: number;
        let lastTickTime = 0;
        // use negative number so we always render first frame as fast as possible
        let lastFrameTime = -1000;

        // A nifty hack to watch all settings for changes and then force a re-render when the menu is open
        const allSettings = Object.keys(settings).filter(k => typeof settings[k] === 'object').map(k => settings[k]);
        derived(allSettings, () => new Date()).subscribe(() => threlteCtx?.advance());

        const menuFn: FrameRequestCallback = (time) => {
            time *= .001;
            frameReq = requestAnimationFrame(nextFn);
            // update within 50ms on editor selection otherwise use 1fps
            let frameTime = $editor.selected ? .05 : 1;
            if (time - lastFrameTime > frameTime) {
                threlteCtx?.advance();
                lastFrameTime = time - (time % frameTime);
            }
            lastTickTime = time;
        };

        const gameFn: FrameRequestCallback = (time) => {
            time *= .001;
            frameReq = requestAnimationFrame(nextFn);
            if (time - lastFrameTime > frameTime) {
                threlteCtx?.advance();
                lastFrameTime = time - (time % frameTime);

                try {
                    game.tick(time - lastTickTime, tscale);
                    lastTickTime = time;
                } catch (e) {
                    $error = e;
                }
            }
        };

        let nextFn = menuFn;
        nextFn(0);
        return {
            switchRAF: (paused: boolean) => nextFn = paused ? menuFn : gameFn,
            stopRAF: () => cancelAnimationFrame(frameReq),
        };
    })();
    $: switchRAF(paused);
    onDestroy(stopRAF);

    const rendererParameters: WebGLRendererParameters = {
        // resolves issues with z-fighting for large maps with small sectors (eg. Sunder 15 and 20 at least)
        logarithmicDepthBuffer: true,
    };

    // Someday I hope to live in a world where I can use fullscreen API in safari on iPhone
    // https://forums.developer.apple.com/forums/thread/133248
    // https://caniuse.com/fullscreen
    function scrollBottom() {
        setTimeout(() => window.scrollTo(0, 1), 50);
    }

    function keyup(ev: KeyboardEvent) {
        switch (ev.code) {
            // show menu, we don't need to catch "escape" because pointer lock handles that
            case "Backquote":
                pointerLock.releaseLock();
                break;
        }
    }
</script>

<svelte:window on:load={scrollBottom} on:keyup|preventDefault={keyup} />

<WipeContainer key={intScreen ?? screenName}>
    <div
        class="relative grid h-full w-full bg-black"
        bind:clientHeight={$viewSize.height}
        bind:clientWidth={$viewSize.width}
    >
    {#if $intermission}
        <!-- NOTE: be cautious with #key and bind: https://github.com/sveltejs/svelte/issues/7704 (until svelte5) -->
        <Intermission details={$intermission}
            size={$viewSize}
            bind:musicTrack={intermissionMusic}
            bind:screenName={screenName} />
    {/if}

    <MapContext map={$map} {renderSectors}>
        {#if $cameraMode === 'svg'}
        <SvgMapRoot
            size={$viewSize}
            map={$map}
        />
        {:else}
        <Canvas bind:ctx={threlteCtx} renderMode='manual' {rendererParameters} autoRender={false}>
            {#if $renderMode === 'r2'}
                <R2 map={$map} {spriteSheet} />
            {:else}
                <R1 map={$map} />
            {/if}
        </Canvas>
        {/if}
        <HUD size={$viewSize} player={$map.player} />

        {#if $showPlayerInfo}
        <PlayerInfo player={$map.player} interactive={paused} />
        {/if}
        <EditPanel map={$map} />
    </MapContext>
    </div>
</WipeContainer>

<SoundPlayer wad={game.wad} audioRoot={soundGain} soundEmitter={game} timescale={$timescale} player={$map?.player} />

<slot />