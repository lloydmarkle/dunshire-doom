<script lang="ts">
    import { T } from "@threlte/core";
    import { useAppContext, useDoomMap } from "../../DoomContext";
    import { HALF_PI } from "../../../doom";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "../SvelteBridge";

    export let yScale: number;

    // TODO: most cameras (except ortho) only differ by how they set position and angle. We should consolidate
    const fov = useAppContext().settings.fov;
    const { map, camera } = useDoomMap();
    const player = map.player;
    const { viewHeight } = player;

    const { position, angle } = camera;

    onDestroy(monitorMapObject(map, player, mo => {
        $position.x = mo.position.x;
        $position.y = mo.position.y;
        $position.z = mo.position.z + $viewHeight;
        $angle.x = mo.pitch + HALF_PI;
        $angle.z = mo.direction - HALF_PI;
    }));
    $: $position.z = map.player.position.z + $viewHeight;
</script>

<T.PerspectiveCamera
    makeDefault
    rotation.x={$angle.x}
    rotation.y={$angle.y}
    rotation.z={$angle.z}
    rotation.order={$angle.order}
    position.x={$position.x}
    position.y={$position.y}
    position.z={$position.z}
    far={100000}
    fov={$fov}
    scale.y={yScale}
/>
