<script lang="ts">
    import { T, useThrelte } from "@threlte/core";
    import { createSprite, weaponTop, type PlayerMapObject, type Sprite } from "../../doom";
    import WeaponSprite from "../Components/WeaponSprite.svelte";
    import { useDoom, useDoomMap } from "../DoomContext";
    import { monitorMapObject } from "./SvelteBridge";
    import { onMount } from "svelte";

    interface Props {
        player: PlayerMapObject;
        yScale: number;
    }
    let { player, yScale }: Props = $props();
    const { weapon } = $derived(player);
    let { position } = $derived($weapon);

    const mapEvents = useDoomMap().map.events;
    let sprite = $state<Sprite>(createSprite());
    let flashSprite = $state<Sprite>();
    onMount(mapEvents.auto('weapon-sprite', (weapon, flash) => {
        sprite = weapon;
        flashSprite = flash;
    }));

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
        {sprite}
        {sector}
    />
    {#if flashSprite}
        <WeaponSprite
            flash
            sprite={flashSprite}
            {sector}
        />
    {/if}
</T.Group>