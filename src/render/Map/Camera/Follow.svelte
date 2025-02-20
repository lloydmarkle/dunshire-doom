<script lang="ts">
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useAppContext, useDoomMap } from "../../DoomContext";
    import { HALF_PI } from "../../../doom";
    import { Vector3 } from "three";
    import { tweened } from "svelte/motion";
    import { quadOut } from "svelte/easing";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "../SvelteBridge";

    export let yScale: number;

    const fov = useAppContext().settings.fov;
    const { map, camera } = useDoomMap();
    const { cameraMode } = map.game.settings;

    const followHeight = 46;
    const shoulderOffset = -10;
    let zoom = 50;
    useTask(() => {
        zoom = Math.max(10, Math.min(200, zoom + map.game.input.aim.z));
        map.game.input.aim.setZ(0);
    }, { stage: useThrelte().renderStage });

    const _ppos = new Vector3();
    const _3pDir = new Vector3();
    function clipPosition(pos: Vector3) {
        // clip to walls and ceiling/floor
        _ppos.copy(map.player.position).setZ(map.player.position.z + followHeight);
        _3pDir.copy(pos).sub(_ppos);
        map.data.traceRay({
            start: _ppos,
            move: _3pDir,
            hitLine: hit => {
                if (hit.line.left) {
                    const ceil = Math.min(hit.line.left.sector.zCeil, hit.line.right.sector.zCeil);
                    const floor = Math.max(hit.line.left.sector.zFloor, hit.line.right.sector.zFloor);
                    if (pos.z > floor && pos.z < ceil) {
                        return true; // two-sided but the camera is in a gap so keep searching
                    }
                }
                pos.copy(_ppos).addScaledVector(_3pDir, hit.fraction * .9);
                return false;
            },
            hitFlat: hit => {
                pos.copy(_ppos).addScaledVector(_3pDir, hit.fraction * .9);
                return false;
            }
        });
    }

    const { position, angle } = camera;
    const tz = tweened(0, { easing: quadOut });
    onDestroy(monitorMapObject(map, map.player, mo => {
        $angle.x = mo.pitch + HALF_PI;
        $angle.z = mo.direction - HALF_PI;

        $tz = mo.position.z;
        $position.x = -Math.sin(-$angle.x) * -Math.sin(-$angle.z) * zoom + mo.position.x + shoulderOffset * Math.cos($angle.z);
        $position.y = -Math.sin(-$angle.x) * -Math.cos(-$angle.z) * zoom + mo.position.y + shoulderOffset * Math.sin($angle.z);
        $position.z = Math.cos($angle.x) * zoom + $tz + followHeight;
        if ($cameraMode === '3p') {
            clipPosition($position);
        }
    }));
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
