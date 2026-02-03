<script lang="ts">
    import { T } from "@threlte/core";
    import Thing from "./Thing.svelte";
    import { CircleGeometry, MeshStandardMaterial } from "three";
    import { useAppContext, useDoomMap } from "../DoomContext";
    import OrthoCam from "./Camera/Orthographic.svelte";
    import FirstPersonCam from "./Camera/FirstPerson.svelte";
    import OverheadCam from "./Camera/Overhead.svelte";
    import FollowCam from "./Camera/Follow.svelte";
    import { monitorMapObject, type PlayerMapObject } from "./SvelteBridge";
    import { onDestroy } from "svelte";

    const { map, renderSectors } = useDoomMap();
    const { cameraMode, renderMode } = useAppContext().settings;
    const player = map.player as PlayerMapObject;

    const { position: playerPosition } = player.renderData;
    let zFloor = 0;
    let sector = player.sector;
    onDestroy(monitorMapObject(map, player, mo => {
        sector = mo.sector;
        zFloor = mo.position.z;
    }));

    // not sure this is correct but it looks about right https://doomwiki.org/wiki/Aspect_ratio
    const yScale = (4 / 3) / (16 / 10);
</script>

{#if $renderMode === 'r1' && $cameraMode !== '1p'}
    <Thing renderSector={renderSectors.find(e => e.sector === sector)} thing={player} />

    <T.Mesh
        geometry={new CircleGeometry(player.info.radius)}
        position.x={$playerPosition.x}
        position.y={$playerPosition.y}
        position.z={zFloor + 1}
        material={new MeshStandardMaterial({ color: "black", opacity: 0.6, transparent: true })}
    />
{/if}

{#if $cameraMode === "ortho"}
    <OrthoCam {yScale} />
{:else if $cameraMode === "bird"}
    <OverheadCam {yScale} />
{:else if $cameraMode === '3p' || $cameraMode === '3p-noclip'}
    <FollowCam {yScale} />
{:else}
    <FirstPersonCam {yScale} />
{/if}
