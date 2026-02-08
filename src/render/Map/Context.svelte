<script lang="ts" module>
    export type MapDataCache = <T>(key: string, create: () => T, dispose?: (t: T) => void) => T;
    const cache = new Map<string, any>();
    const cacheDispose: (() => void)[] = [];
    const dataCache = <T>(key: string, create: () => T, dispose?: (t: T) => void): T => {
        const data = cache.get(key) ?? create();
        if (dispose && !cache.has(key)) {
            cacheDispose.push(() => dispose(data));
        }
        cache.set(key, data);
        return data;
    }

    export const clearCache = () => {
        cacheDispose.forEach(d => d());
        cacheDispose.length = 0;
        cache.clear();
    }
</script>
<script lang="ts">
    import { setContext } from "svelte";
    import { store, type MapRuntime } from "../../doom";
    import { buildRenderSectors } from "../RenderData";
    import { Color, Euler, Vector3 } from "three";
    import { type useDoomMap } from "../DoomContext";

    export let map: MapRuntime;

    if (map && (map.name + ':' + map.game.wad.name) !== cache.get('$key')) {
        clearCache();
        cache.set('$key', (map.name + ':' + map.game.wad.name))
    }
    const renderSectors = map ? dataCache('renderSectors', () => buildRenderSectors(map.game.wad, map)) : [];
    const camera = {
        position: store(new Vector3()),
        angle: store(new Euler(0, 0, 0, 'ZXY')),
    };
    const skyColor = new Color('grey');
    setContext<ReturnType<typeof useDoomMap>>('doom-map', { dataCache, skyColor, map, renderSectors, camera });

    // NB: we don't use a reactive statement here because we're doing #if/#key below and we don't want to
    // pass a null map to <slot />
    const capturedMap = map;
</script>

{#if map}
    {#key map}
        <slot map={capturedMap} />
    {/key}
{/if}