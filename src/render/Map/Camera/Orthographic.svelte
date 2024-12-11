<script lang="ts">
    import { HALF_PI } from "../../../doom";
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useDoomMap } from "../../DoomContext";
    import { expoIn } from "svelte/easing";
    import { Vector3 } from "three";
    import { monitorMapObject } from "../SvelteBridge";
    import { onDestroy } from "svelte";

    export let yScale: number;

    const camDistance = 32_000;
    let zoomVal = 800;
    let zoom = 2.5;
    const { map, camera } = useDoomMap();
    const { viewHeightNoBob } = map.player;
    const { camera: tCam, renderStage } = useThrelte();
    $: $tCam.up.set(0, 0, 1);

    const pitch = HALF_PI * 2 / 3;
    const position = camera.position;
    const lookPos = new Vector3();

    onDestroy(monitorMapObject(map, map.player, mo => {
        lookPos.copy(mo.position);
        lookPos.z += $viewHeightNoBob;

        const yaw = mo.direction - HALF_PI;
        $tCam.position.set(
            -Math.sin(-yaw) * camDistance + mo.position.x,
            -Math.cos(-yaw) * camDistance + mo.position.y,
            Math.cos(pitch) * camDistance + mo.position.z + $viewHeightNoBob,
        );
        $tCam.lookAt(lookPos);
        $position = $tCam.position;
    }));

    useTask(() => {
        zoomVal = Math.max(1, Math.min(1000, zoomVal + map.game.input.aim.z));
        zoom = expoIn(zoomVal / 1000) * 10;
        map.game.input.aim.setZ(0);
    }, { stage: renderStage });
</script>

<T.OrthographicCamera
    makeDefault
    {zoom} scale.y={yScale} far={100_000}
/>
