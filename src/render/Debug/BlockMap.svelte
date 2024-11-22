<script lang="ts">
    import { HALF_PI, type MapRuntime, type Store } from "../../doom";
    import { T } from "@threlte/core";
    import { useAppContext } from "../DoomContext";
    import type { Vector3 } from "three";

    export let map: MapRuntime;

    const showBlockmap = useAppContext().settings.showBlockMap;
    const playerPosition = map.player.renderData['position'] as Store<Vector3>;

    const bbox = map.data.blockMapBounds;
    const width = bbox.right - bbox.left;
    const height = bbox.top - bbox.bottom;
    const size = Math.max(width, height);
</script>

{#if $showBlockmap}
    <T.GridHelper
        args={[size, Math.ceil(size / 128)]}
        rotation.x={HALF_PI}
        position.x={bbox.left + size * .5}
        position.y={bbox.bottom + size * .5}
        position.z={$playerPosition.z + 1 }
    />
{/if}
