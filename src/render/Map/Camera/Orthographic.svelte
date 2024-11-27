<script lang="ts">
    import { HALF_PI } from "../../../doom";
    import { T, useTask } from "@threlte/core";
    import { useDoomMap } from "../../DoomContext";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "../SvelteBridge";

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

    onDestroy(monitorMapObject(map, map.player, mo => {
        $rotation.z = mo.direction - HALF_PI;
        $position.x = -Math.sin(-$rotation.z) * 300 + mo.position.x;
        $position.y = -Math.cos(-$rotation.z) * 300 + mo.position.y;
        $position.z = Math.cos($rotation.x) * 400 + mo.position.z + $viewHeightNoBob;
    }));
    $: $position.z = Math.cos($rotation.x) * 400 + map.player.position.z + $viewHeightNoBob;

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
