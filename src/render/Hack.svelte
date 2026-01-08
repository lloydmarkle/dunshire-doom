<script lang="ts">
    import { useThrelte } from "@threlte/core";
    import R1 from "./Map/Root.svelte";
    import R2 from "./R2/Root.svelte";
    import { onDestroy } from "svelte";
    import { SpriteSheet } from "./R2/Sprite/SpriteAtlas";
    import { useAppContext, useDoom } from "./DoomContext";
    import { randInt, randomNorm } from "../doom";
    import { derived } from "svelte/store";
    import type { WebGLRendererParameters } from "three";

    export let viewSize;
    export let paused: boolean;

    const { settings, editor, error } = useAppContext();
    const { game } = useDoom();
    const map = game.map;

    // only create once
    $: spriteSheet = (spriteSheet ?? new SpriteSheet(game.wad, threlteCtx.renderer.capabilities.maxTextureSize));

    const threlteCtx = useThrelte();
    let frameTime: number;
    let tscale: number;
    // force render on screensize change
    $: if (viewSize) threlteCtx.advance();

    // A fun little hack to make the game feel like it used to on my 486sx25
    const { simulate486, timescale, pixelScale, fpsLimit, renderMode } = settings;
    // F5 low-res mode (it should be .5 but that looks to sharp IMO)
    // FIXME: starting the game with low pixel ratio and then increasing doesn't work... why?
    $: threlteCtx.renderer?.setPixelRatio($simulate486 ? .2 : $pixelScale);
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
</script>

{#if $renderMode === 'r2'}
    <R2 map={$map} {spriteSheet} />
{:else}
    <R1 map={$map} />
{/if}
