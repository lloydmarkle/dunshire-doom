<script lang="ts">
    import { HALF_PI, MapObject } from "../../../doom";
    import { T, useTask } from "@threlte/core";
    import { useDoomMap } from "../../DoomContext";
    import { onDestroy } from "svelte";

    export let yScale: number;

    let zoom = 100;
    const { map, camera } = useDoomMap();
    const { viewHeightNoBob } = map.player;

    const rotation = camera.angle;
    $: $rotation.x = HALF_PI * 3 / 4;
    const position = camera.position;

    const scale = { x: 1, y: 1 };
    $: scale.x = (zoom / 1000) + .25;
    $: scale.y = scale.x * yScale;

    const updatePosition = (mo: MapObject) => {
        if (mo === map.player) {
            $rotation.z = map.player.direction - HALF_PI;
            $position.x = -Math.sin(-$rotation.z) * 300 + map.player.position.x;
            $position.y = -Math.cos(-$rotation.z) * 300 + map.player.position.y;
            $position.z = Math.cos($rotation.x) * 400 + map.player.position.z + $viewHeightNoBob;
        }
    }
    $: $position.z = Math.cos($rotation.x) * 400 + map.player.position.z + $viewHeightNoBob;
    updatePosition(map.player);

    map.events.on('mobj-updated-position', updatePosition);
    onDestroy(() => map.events.off('mobj-updated-position', updatePosition));

    useTask(() => {
        zoom = Math.max(50, Math.min(1000, zoom + map.game.input.aim.z));
        map.game.input.aim.setZ(0);
    });
</script>

<T.OrthographicCamera
    makeDefault
    rotation.x={$rotation.x}
    rotation.y={$rotation.y}
    rotation.z={$rotation.z}
    rotation.order={$rotation.order}
    position.x={$position.x}
    position.y={$position.y}
    position.z={$position.z}
    scale.x={scale.x}
    scale.y={scale.y}
    far={100000}
/>
