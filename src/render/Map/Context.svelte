<script lang="ts">
    import { setContext } from "svelte";
    import { store, type MapRuntime } from "../../doom";
    import { buildRenderSectors } from "../RenderData";
    import { Color, Euler, Vector3 } from "three";
    import { type useDoomMap } from "../DoomContext";

    export let map: MapRuntime;

    const renderSectors = map ? buildRenderSectors(map.game.wad, map) : [];
    const camera = {
        position: store(new Vector3()),
        angle: store(new Euler(0, 0, 0, 'ZXY')),
    };
    const skyColor = new Color('grey');
    setContext<ReturnType<typeof useDoomMap>>('doom-map', { skyColor, map, renderSectors, camera });

    // NB: we don't use a reactive statement here because we're doing #if/#key below and we don't want to
    // pass a null map to <slot />
    const capturedMap = map;
</script>

{#if map}
    {#key map}
        <slot map={capturedMap} />
    {/key}
{/if}