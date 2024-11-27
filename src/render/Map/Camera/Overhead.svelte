<script lang="ts">
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useAppContext, useDoomMap } from "../../DoomContext";
    import { HALF_PI } from "../../../doom";
    import { tweened } from "svelte/motion";
    import { quadOut } from "svelte/easing";
    import { FogExp2 } from "three";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "../SvelteBridge";

    export let yScale: number;

    const fov = useAppContext().settings.fov;
    const { map, camera, skyColor: skyColor } = useDoomMap();

    let zoom = 200;
    useTask(() => {
        zoom = Math.max(100, Math.min(2500, zoom + map.game.input.aim.z));
        map.game.input.aim.setZ(0);
    });

    const { position, angle } = camera;
    $: $angle.x = 0;

    const tz = tweened(0, { easing: quadOut });
    onDestroy(monitorMapObject(map, map.player, mo => {
            $position.x = mo.position.x;
            $position.y = mo.position.y;
            $tz = mo.position.z;
            $angle.z = mo.direction - HALF_PI;
    }));
    $: $position.z = zoom + $tz;

    const threlte = useThrelte();
    const originalFog = threlte.scene.fog;
    // kind of cheap looking but fun to play with
    // NOTE: we can't simply use T.Fog because fog isn't an object, it's a property of the scene. Hmmm
    $: threlte.scene.fog = new FogExp2(skyColor, .00035);
    onDestroy(() => {
        threlte.scene.fog = originalFog;
    })
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
    scale.y={yScale}
    far={100000}
    fov={$fov}
/>
