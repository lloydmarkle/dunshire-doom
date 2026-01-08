<script lang="ts">
    import { T, useThrelte } from "@threlte/core";
    import { weaponTop, type PlayerMapObject } from "../../doom";
    import WeaponSprite from "../Components/WeaponSprite.svelte";
    import { useDoom } from "../DoomContext";
    import { monitorMapObject } from "./SvelteBridge";
    import { onMount } from "svelte";

    interface Props {
        player: PlayerMapObject;
        yScale: number;
    }
    let { player, yScale }: Props = $props();
    const { weapon } = $derived(player);
    let { sprite, flashSprite, position } = $derived($weapon);

    let sector = $derived(player.sector);
    onMount(() => monitorMapObject(player.map, player, mo => sector = mo.sector));

    const { size } = useThrelte();
    const cameraMode = useDoom().game.settings.cameraMode;
    let scale = $derived($cameraMode === '1p' ? Math.max(2.5, $size.height / 200) : 2);
    let screenPositionX = $derived($cameraMode === '1p'
        ? $position.x - (160 * scale) // center screen
        : $position.x - $size.width * .5); // left side
    let screenPositionY = $derived(
        scale * ($position.y + weaponTop) +
        // Why 135?? *shrug* it looks about right
        -$size.height * .5 + (135 * scale));
</script>

<T.Group
    scale.x={scale}
    scale.y={scale / yScale}
    position.x={screenPositionX}
    position.y={screenPositionY}
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