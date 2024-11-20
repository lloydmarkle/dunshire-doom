<script lang="ts">
    import { T } from "@threlte/core";
    import { useAppContext, useDoomMap } from "../../DoomContext";
    import { HALF_PI, MapObject } from "../../../doom";
    import { onDestroy } from "svelte";

    export let yScale: number;

    // TODO: most cameras (except ortho) only differ by how they set position and angle. We should consolidate
    const fov = useAppContext().settings.fov;
    const { map, renderSectors, camera } = useDoomMap();
    const player = map.player;
    const { viewHeight } = player;

    const { position, angle } = camera;

    const updatePosition = (mo: MapObject) => {
        if (mo === map.player) {
            $position.x = map.player.position.x;
            $position.y = map.player.position.y;
            $position.z = map.player.position.z + $viewHeight;
            $angle.x = map.player.pitch + HALF_PI;
            $angle.z = map.player.direction - HALF_PI;
        }
    }
    $: $position.z = map.player.position.z + $viewHeight;
    updatePosition(player);

    map.events.on('mobj-updated-position', updatePosition);
    onDestroy(() => map.events.off('mobj-updated-position', updatePosition));
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
