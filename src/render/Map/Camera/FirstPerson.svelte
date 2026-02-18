<script lang="ts">
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useAppContext } from "../../DoomContext";
    import { HALF_PI } from "../../../doom";
    import { useDoomMap } from "../Context.svelte";

    export let yScale: number;

    // TODO: most cameras (except ortho) only differ by how they set position and angle. We should consolidate
    const fov = useAppContext().settings.fov;
    const { map, camera } = useDoomMap();
    const player = map.player;
    const { viewHeight } = player;

    const { position, angle } = camera;

    useTask(() => {
        $position.x = player.position.x;
        $position.y = player.position.y;
        $position.z = map.player.position.z + $viewHeight;
        $angle.x = player.pitch + HALF_PI;
        $angle.z = player.direction - HALF_PI;
    }, { stage: useThrelte().renderStage, before: 'doom-render' });
    // why does doing this in the task cause the floor to jank when riding lifts?
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
