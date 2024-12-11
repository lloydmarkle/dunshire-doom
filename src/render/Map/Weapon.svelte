<script lang="ts">
    import { type Size, T } from "@threlte/core";
    import { weaponTop, type PlayerMapObject } from "../../doom";
    import WeaponSprite from "../Components/WeaponSprite.svelte";
    import { useDoom } from "../DoomContext";
    import { monitorMapObject } from "./SvelteBridge";
    import { onDestroy } from "svelte";

    export let player: PlayerMapObject;
    export let screenSize: Size;
    export let yScale: number;

    const { weapon } = player;

    let sector = player.sector;
    onDestroy(monitorMapObject(player.map, player, mo => sector = mo.sector));

    $: sprite = $weapon.sprite;
    $: flashSprite = $weapon.flashSprite;
    $: pos = $weapon.position;

    const cameraMode = useDoom().game.settings.cameraMode;
    $: scale = $cameraMode === '1p' ? Math.max(2.5, screenSize.height / 200) : 2;
    const screenPosition = { x: 0, y: 0 };
    $: screenPosition.x = $cameraMode === '1p'
        ? $pos.x - (160 * scale) // center screen
        : $pos.x - screenSize.width * .5; // left side
    $: screenPosition.y =
        scale * ($pos.y + weaponTop) +
        // Why 135?? *shrug* it looks about right
        -screenSize.height * .5 + (135 * scale);
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