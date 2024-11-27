<script lang="ts">
    import { type Size, T } from "@threlte/core";
    import { weaponTop, type PlayerMapObject } from "../../doom";
    import WeaponSprite from "../Components/WeaponSprite.svelte";
    import { useDoom } from "../DoomContext";
    import type { MapObject } from "./SvelteBridge";
    import { onDestroy } from "svelte";

    export let player: PlayerMapObject;
    export let screenSize: Size;
    export let yScale: number;

    const { weapon } = player;

    let sector = player.sector;
    const movePlayer = (mo: MapObject) => sector = (mo === player) ? mo.sector : sector;
    player.map.events.on('mobj-updated-position', movePlayer);
    onDestroy(() => player.map.events.off('mobj-updated-position', movePlayer));

    $: sprite = $weapon.sprite;
    $: flashSprite = $weapon.flashSprite;
    $: pos = $weapon.position;

    const cameraMode = useDoom().game.settings.cameraMode;
    $: scale = $cameraMode === '1p' ? Math.max(2.5, screenSize.height / 200) : 1;
    const screenPosition = { x: 0, y: 0 };
    $: screenPosition.x = $cameraMode === '1p'
        ? $pos.x - (160 * scale) // center screen
        : $pos.x - screenSize.width * .5; // right side
    $: screenPosition.y = scale * ($pos.y + weaponTop) +
        ($cameraMode === '1p'
            // Why 135 and 160?? *shrug* it looks about right
            ? -screenSize.height * .5 + (135 * scale)
            : -screenSize.height * .5 + (160 * yScale / scale));
</script>

<T.Group
    scale.x={scale}
    scale.y={scale / yScale}
    position.x={screenPosition.x}
    position.y={screenPosition.y}
>
    <WeaponSprite
        sprite={$sprite}
        {sector}
    />
    {#if $flashSprite}
        <WeaponSprite
            flash
            sprite={$flashSprite}
            {sector}
        />
    {/if}
</T.Group>