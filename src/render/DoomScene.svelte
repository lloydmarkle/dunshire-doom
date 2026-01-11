<script lang="ts">
    import { useThrelte } from "@threlte/core";
    import R1 from "./Map/Root.svelte";
    import R2 from "./R2/Root.svelte";
    import { onMount } from "svelte";
    import { SpriteSheet } from "./R2/Sprite/SpriteAtlas";
    import { useAppContext } from "./DoomContext";
    import { derived } from "svelte/store";
    import type { MapRuntime } from "../doom";

    export let map: MapRuntime;
    export let frameTime: number;
    export let paused: boolean;

    const { settings, editor } = useAppContext();

    const { renderer, advance } = useThrelte();
    // TODO: it would be nice to create this once per game
    $: spriteSheet = (spriteSheet ?? new SpriteSheet(map.game.wad, renderer.capabilities.maxTextureSize));

    // A fun little hack to make the game feel like it used to on my 486sx25
    const { simulate486, pixelScale, renderMode } = settings;
    // F5 low-res mode (it should be .5 but that looks to sharp IMO)
    // FIXME: starting the game with low pixel ratio and then increasing doesn't work... why?
    $: renderer.setPixelRatio($simulate486 ? .2 : $pixelScale);

    onMount(() => {
        // use negative number so we always render first frame as fast as possible
        let lastFrameTime = -1000;

        // A nifty hack to watch all settings for changes and then force a re-render when the menu is open
        const allSettings = Object.keys(settings).filter(k => typeof settings[k] === 'object').map(k => settings[k]);
        derived(allSettings, () => new Date()).subscribe(advance);

        let frameReq = requestAnimationFrame(function renderFrame(time) {
            time *= .001;
            frameReq = requestAnimationFrame(renderFrame);
            // update within 50ms on editor selection otherwise use 1fps
            let ft = !paused ? frameTime : ($editor.selected ? .05 : 1);
            if (time - lastFrameTime > ft) {
                advance();
                lastFrameTime = time - (time % ft);
            }
        });
        return () => cancelAnimationFrame(frameReq);
    });
</script>

{#if $renderMode === 'r2'}
    <R2 map={map} {spriteSheet} />
{:else}
    <R1 map={map} />
{/if}
