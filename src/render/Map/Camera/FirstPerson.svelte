<script lang="ts">
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useAppContext } from "../../DoomContext";
    import { HALF_PI } from "../../../doom";
    import { useDoomMap } from "../Context.svelte";

    export let yScale: number;

    // TODO: most cameras (except ortho) only differ by how they set position and angle. We should consolidate
    const { fov, interpolateMovement } = useAppContext().settings;
    const { map, camera } = useDoomMap();
    const player = map.player;
    const { viewHeight } = player;

    const { tick } = map.game.time;
    const { position, angle } = camera;

    $: partialTic = $interpolateMovement ? $tick - Math.trunc($tick) - 1 : 0;
    let dzf = 0;

    useTask(() => {
        $position.x = player.position.x;
        $position.y = player.position.y;
        $position.z = map.player.position.z + $viewHeight;
        $angle.x = player.pitch + HALF_PI;
        $angle.z = player.direction - HALF_PI;

        // there should be a better way. I could apply interpolation to all settings and process player at 35hz like the
        // rest of the game but I don't want to do that (yet...)
        dzf = map.player.deltaSectorZFloor;
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
    position.z={$position.z + partialTic * dzf}
    far={100000}
    fov={$fov}
    scale.y={yScale}
/>
