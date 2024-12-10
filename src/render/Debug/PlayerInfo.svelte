<script lang="ts">
    import { Vector3 } from "three";
    import type { PlayerInventory, PlayerMapObject } from "../../doom";
    import { ToDegrees, tickTime, ticksPerSecond } from "../../doom";
    import { fly } from "svelte/transition";
    import { useAppContext } from "../DoomContext";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "../Map/SvelteBridge";

    export let player: PlayerMapObject;
    export let interactive = true;
    const { settings, editor } = useAppContext();
    const timescale = settings.timescale;
    let { position, direction, sector, inventory, viewHeight } = player;
    const tickN = player.map.game.time.tickN;

    let sectors = [];
    onDestroy(monitorMapObject(player.map, player, mo => {
        position = player.position;
        direction = player.direction;
        sector = player.sector;
        sectors.length = 0;
        player.sectorMap.forEach((n, sec) => sectors.push(sec));
    }));

    const debugBuild = import.meta.env.DEV;

    let velocity = player.velocity;
    $: if (!($tickN & 10)) {
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
        <div class:hidden={!debugBuild}>sect: {sector.num}, [floor, ceil]=[{sector.zFloor}, {sector.zCeil}]</div>
        <div class:hidden={!debugBuild}>Sectors: [{sectors.map(e => e.num)}]</div>
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