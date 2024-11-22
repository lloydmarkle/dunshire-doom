<script lang="ts">
    import { Vector3 } from "three";
    import type { MapObject, PlayerInventory, PlayerMapObject } from "../../doom";
    import { ToDegrees, tickTime, ticksPerSecond } from "../../doom";
    import { fly } from "svelte/transition";
    import { useAppContext } from "../DoomContext";
    import { onDestroy } from "svelte";

    export let player: PlayerMapObject;
    export let interactive = true;
    const { settings, editor } = useAppContext();
    const timescale = settings.timescale;
    let { position, direction, sector, inventory, viewHeight } = player;
    const tick = player.map.game.time.tick;

    let subsectors = [];
    const updatePosition = (mo: MapObject) => {
        if (mo === player) {
            position = player.position;
            direction = player.direction;
            subsectors.length = 0;
            player.subsectors(s => subsectors.push(s));
        }
    }
    updatePosition(player);

    player.map.events.on('mobj-updated-position', updatePosition);
    onDestroy(() => player.map.events.off('mobj-updated-position', updatePosition));

    const debugBuild = import.meta.env.DEV;

    let velocity = player.velocity;
    $: if ($tick & 10) {
        // rx hack because velocity is not a store
        velocity = player.velocity;
    }

    function vec(v: Vector3) {
        return `[x: ${v.x.toFixed(2)}, y: ${v.y.toFixed(2)}, z: ${v.z.toFixed(2)}]`;
    }

    function updateInv(fn: (inv: PlayerInventory) => void) {
        return () => {
            inventory.update(inv => {
                fn(inv);
                return inv;
            });
        }
    }

    function timeFromTicks(ticks: number) {
        return (ticks / ticksPerSecond).toFixed(2);
    }
    const velocityPerTick = (vel: number) => vel * tickTime * 60 / $timescale;
</script>

<div class="root" style="right: {$editor.active ? '25em' : '0'}">
    <div
        class="settings bg-base-100 bg-honeycomb shadow-2xl"
        class:sloped={!interactive}
        transition:fly={{ y: 200}}
    >
        <div>pos: {vec(position)}</div>
        <div>vel: {vec(velocity)} {velocityPerTick(velocity.length()).toFixed(2)}</div>
        <div>dir: [{(direction * ToDegrees).toFixed(3)}]</div>
        <div class:hidden={!debugBuild}>sect: {$sector.num}, [floor, ceil]=[{$sector.zFloor.val}, {$sector.zCeil.val}]</div>
        <div class:hidden={!debugBuild}>Sectors: [{[...new Set(subsectors.map(e=>e.sector.num))]}]</div>
        <div class:hidden={!debugBuild}>Subsectors: [{subsectors.map(e => e.num)}]</div>
        <div class:hidden={!debugBuild}>viewHeight: {$viewHeight.toFixed(2)}</div>
        <div
            class="grid grid-cols-2 justify-items-stretch gap-1 pt-1"
            class:hidden={!debugBuild || !interactive}
        >
            <button class="btn" on:click={() => player.bonusCount.update(val => val + 6)}>bouns flash</button>
            <button class="btn" on:click={() => player.damageCount.update(val => val + 10)}>hurt flash</button>
            <button class="btn" on:click={updateInv(inv => inv.items.invincibilityTicks += 4 * ticksPerSecond)}>
                +4s invuln {timeFromTicks($inventory.items.invincibilityTicks)}</button>
            <button class="btn" on:click={updateInv(inv => inv.items.radiationSuitTicks += 4 * ticksPerSecond)}>
                +4s rad suit {timeFromTicks($inventory.items.radiationSuitTicks)}</button>
            <button class="btn" on:click={updateInv(inv => inv.items.berserkTicks += 4 * ticksPerSecond)}>
                +4s berserk {timeFromTicks($inventory.items.berserkTicks)}</button>
            <button class="btn" on:click={updateInv(inv => inv.items.nightVisionTicks += 4 * ticksPerSecond)}>
                +4s lightamp {timeFromTicks($inventory.items.nightVisionTicks)}</button>
            <button class="btn" on:click={updateInv(inv => inv.items.invisibilityTicks += 4 * ticksPerSecond)}>
                +4s invis {timeFromTicks($inventory.items.invisibilityTicks)}</button>
        </div>
    </div>
</div>

<style>
    .root {
        position: absolute;
        right: 0;
        bottom: 5em;
        perspective: 200px;
    }

    .settings {
        transform: scale(1);
        transform-origin: right;
        transition: transform .5s;
    }
    .sloped {
        transform: rotateY(-4deg) scale(0.9);
    }

    .settings {
        text-align: left;
        padding-inline-start: 1em;
        padding-inline-end: 1em;
        min-width: 24em;
    }
</style>