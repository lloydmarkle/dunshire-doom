<script lang="ts" module>
    export type MapDataCache = typeof dataCache;
    const dataCache = (() => {
        const cache = new Map<string, { data: any, dispose: () => void }>();

        const validate = (key: string) => {
            if (key !== cache.get('$key')?.data) {
                cache.values().forEach(v => v.dispose?.());
                cache.clear();
                cache.set('$key', { data: key, dispose: null });
            }
        }

        const fetch = <T>(key: string, create: () => T, dispose?: (t: T) => void): T => {
            let item = cache.get(key);
            if (!item) {
                let data = create();
                item = { data, dispose: dispose ? () => dispose(data) : null };
                cache.set(key, item);
            }
            return item.data;
        }

        const remove = (key: string) => {
            const item = cache.get(key);
            item?.dispose?.();
            cache.delete(key);
        }

        return { validate, remove, fetch };
    })();

    export const clearCache = () => dataCache.validate(null);
</script>
<script lang="ts">
    import { setContext } from "svelte";
    import { store, type MapRuntime } from "../../doom";
    import { buildRenderSectors } from "../RenderData";
    import { Color, Euler, Vector3 } from "three";
    import { type useDoomMap } from "../DoomContext";

    export let map: MapRuntime;

    dataCache.validate(map ? map.name + ':' + map.game.wad.name : null);
    const renderSectors = map ? dataCache.fetch('renderSectors', () => buildRenderSectors(map.game.wad, map)) : [];

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