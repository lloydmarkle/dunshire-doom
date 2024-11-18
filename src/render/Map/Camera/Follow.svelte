<script lang="ts">
    import { T, useTask } from "@threlte/core";
    import { useAppContext, useDoomMap } from "../../DoomContext";
    import { HALF_PI } from "../../../doom";
    import { Euler, Vector3 } from "three";
    import { tweened } from "svelte/motion";
    import { quadOut } from "svelte/easing";

    export let yScale: number;

    const fov = useAppContext().settings.fov;
    const { map, renderSectors, camera } = useDoomMap();
    const player = map.player;
    const { position: playerPosition, direction: yaw, pitch } = player;
    const { cameraMode } = map.game.settings;

    let followHeight = 46;
    let shoulderOffset = -10;
    let zoom = 50;
    useTask(() => {
        zoom = Math.max(10, Math.min(100, zoom + map.game.input.aim.z));
        map.game.input.aim.setZ(0);
    });

    const { position, angle } = camera;
    $: $angle.x = $pitch + HALF_PI;
    $: $angle.z = $yaw - HALF_PI;

    let tz = tweened(0, { easing: quadOut });
    $: $tz = $playerPosition.z;
    $: updatePos($playerPosition, $tz, $angle);
    function updatePos(pos: Vector3, pz: number, angle: Euler) {
        $position.x = -Math.sin(-angle.x) * -Math.sin(-angle.z) * zoom + pos.x + shoulderOffset * Math.cos(angle.z);
        $position.y = -Math.sin(-angle.x) * -Math.cos(-angle.z) * zoom + pos.y + shoulderOffset * Math.sin(angle.z);
        $position.z = Math.cos(angle.x) * zoom + pz + followHeight;
        if ($cameraMode === '3p') {
            clipPosition($position);
        }
    }

    const _ppos = new Vector3();
    const _3pDir = new Vector3();
    function clipPosition(pos: Vector3) {
        // clip to walls and ceiling/floor
        _ppos.copy($playerPosition).setZ($playerPosition.z + followHeight);
        _3pDir.copy(pos).sub(_ppos);
        map.data.traceRay({
            start: _ppos,
            move: _3pDir,
            hitLine: hit => {
                if (hit.line.left) {
                    const ceil = Math.min(hit.line.left.sector.zCeil.val, hit.line.right.sector.zCeil.val);
                    const floor = Math.max(hit.line.left.sector.zFloor.val, hit.line.right.sector.zFloor.val);
                    const gap = ceil - floor;
                    if (gap > 0 && floor - _ppos.z < -20) {
                        return true; // two-sided but there is a gap for the camera so keep searching
                    }
                }
                pos.copy(_ppos).addScaledVector(_3pDir, hit.fraction * .9);
                return false;
            },
        });
    }
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
