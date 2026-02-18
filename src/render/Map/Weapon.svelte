<script lang="ts">
    import { T, useThrelte } from "@threlte/core";
    import { createSprite, weaponTop, type PlayerMapObject, type Sprite } from "../../doom";
    import WeaponSprite from "../Components/WeaponSprite.svelte";
    import { useAppContext, useDoom } from "../DoomContext";
    import { monitorMapObject } from "./SvelteBridge";
    import { onMount } from "svelte";
    import { useDoomMap } from "./Context.svelte";

    interface Props {
        player: PlayerMapObject;
        yScale: number;
    }
    let { player, yScale }: Props = $props();

    const { settings } = useAppContext();
    const { cameraMode, interpolateMovement } = settings;
    const { weapon } = $derived(player);
    const tick = useDoom().game.time.tick;
    let partialTic = $derived($interpolateMovement ? $tick - Math.trunc($tick) - 1 : 0);
    let position = $state({ x: 0, y : 0 });
    let vel = $state({ x: 0, y : 0 });

    const mapEvents = useDoomMap().map.events;
    let sprite = $state<Sprite>(createSprite());
    let flashSprite = $state<Sprite>();
    onMount(mapEvents.auto('weapon-sprite', (weapon, flash) => {
        sprite = weapon;
        flashSprite = flash;
        vel.x = $weapon.position.x - position.x;
        vel.y = $weapon.position.y - position.y;
        position.x = $weapon.position.x;
        position.y = $weapon.position.y;
    }));

    let sector = $derived(player.sector);
    onMount(() => monitorMapObject(player.map, player, mo => sector = mo.sector));

    const { size } = useThrelte();
    let scale = $derived($cameraMode === '1p' ? Math.max(2.5, $size.height / 200) : 2);
    let screenPositionX = $derived($cameraMode === '1p'
        ? (partialTic * vel.x + position.x) - (160 * scale) // center screen
        : (partialTic * vel.x + position.x) - $size.width * .5); // left side
    let screenPositionY = $derived(
        // NOTE: use partialTick-1 when weapon is lowering to avoid the big jump on first A_Lower
        // ((vel.y < 0 ? partialTic - 1 : partialTic) * vel.y + position.y + weaponTop) * scale +
        (partialTic * vel.y + position.y + weaponTop) * scale +
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