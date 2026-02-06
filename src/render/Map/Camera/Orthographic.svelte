<script lang="ts">
    import { HALF_PI } from "../../../doom";
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useDoomMap } from "../../DoomContext";
    import { expoIn, quadIn, quadOut } from "svelte/easing";
    import { Vector3 } from "three";
    import { Tween } from "svelte/motion";

    export let yScale: number;

    const camDistance = 32_000;
    let zoomVal = 800;
    const { map, camera } = useDoomMap();
    const { viewHeightNoBob } = map.player;
    const { camera: tCam, renderStage } = useThrelte();
    $: $tCam.up.set(0, 0, 1);

    const pitch = HALF_PI * 2 / 3;
    const position = camera.position;
    const lookPos = new Vector3();

    const tz = new Tween(0, { easing: quadIn, duration: 60 });
    useTask(() => {
        lookPos.copy(map.player.position);
        lookPos.z += $viewHeightNoBob;

        const yaw = map.player.direction - HALF_PI;
        $tCam.position.set(
            -Math.sin(-yaw) * camDistance + map.player.position.x,
            -Math.cos(-yaw) * camDistance + map.player.position.y,
            Math.cos(pitch) * camDistance + map.player.position.z + $viewHeightNoBob,
        );
        $tCam.lookAt(lookPos);
        tz.set($tCam.position.z);
        $position.set($tCam.position.x, $tCam.position.y, tz.current);

        zoomVal = Math.max(1, Math.min(1000, zoomVal + map.game.input.aim.z));
        map.game.input.aim.setZ(0);
    }, { stage: renderStage, before: 'doom-render' });
</script>

<T.OrthographicCamera
    makeDefault
    zoom={expoIn(zoomVal / 1000) * 10}
    scale.y={yScale}
    far={100_000}
/>
