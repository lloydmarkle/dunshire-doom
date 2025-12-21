<script lang="ts">
    import type { PlayerMapObject } from "../../doom";
    import Picture, { imageDataUrl } from "../Components/Picture.svelte";
    import Face from "./Face.svelte";
    import KeyCard from "./KeyCard.svelte";
    import type { Size } from "@threlte/core";
    import HUDMessages from "./HUDMessages.svelte";
    import STNumber from "../Components/STNumber.svelte";
    import { useAppContext } from "../DoomContext";

    export let player: PlayerMapObject;
    export let size: Size;
    const { maxHudScale, hudStyle } = useAppContext().settings;

    const { health, weapon, inventory } = player;
    $: weaponLights = $inventory.weapons.map(e => e?.keynum);
    const background = imageDataUrl(player.map.game.wad, 'STBAR', 'any');
    const gfx = player.map.game.wad.graphic('STBAR');
    const offsetX = (320 - gfx.width) / 2;
    $: scale = Math.min(size.width / gfx.width, size.height / gfx.height, $maxHudScale);
    $: hudHeight = gfx.height * scale; // why *2? Because we are scaling by 2 in a css transform below
</script>

<HUDMessages {scale} topOffset={$hudStyle === 'top' ? hudHeight : 0} {player} />

<div
    class="root"
    style:--st-top="{$hudStyle === 'bottom' ? size.height - hudHeight : 0}px"
    style:--st-bg="url({background})"
    style:--st-bg-offsetx="{offsetX}px"
    style:--st-scale="{scale}"
>
    <!-- <Picture name={'STBAR'} /> -->
    <div class="ammo">
        {#if $inventory.ammo[$weapon.ammoType]}
            <STNumber sprite='STTNUM' value={$inventory.ammo[$weapon.ammoType].amount} />
        {/if}
    </div>
    <div class="health">
        <STNumber sprite='STTNUM' value={$health} percent />
    </div>
    <div class="arms">
        <Picture name={'STARMS'} />
        <span><STNumber sprite={weaponLights.includes(2) ? 'STYSNUM' : 'STGNUM'} value={2} /></span>
        <span><STNumber sprite={weaponLights.includes(3) ? 'STYSNUM' : 'STGNUM'} value={3} /></span>
        <span><STNumber sprite={weaponLights.includes(4) ? 'STYSNUM' : 'STGNUM'} value={4} /></span>
        <span><STNumber sprite={weaponLights.includes(5) ? 'STYSNUM' : 'STGNUM'} value={5} /></span>
        <span><STNumber sprite={weaponLights.includes(6) ? 'STYSNUM' : 'STGNUM'} value={6} /></span>
        <span><STNumber sprite={weaponLights.includes(7) ? 'STYSNUM' : 'STGNUM'} value={7} /></span>
    </div>
    <div class="face">
        <Face {player} />
    </div>
    <div class="armor">
        <STNumber sprite='STTNUM' value={$inventory.armor} percent />
    </div>
    <div class="keys">
        {#if $inventory.keys.includes('B') || $inventory.keys.includes('b')}
            <span><KeyCard keys={$inventory.keys} key={'B'} /></span>
        {/if}
        {#if  $inventory.keys.includes('Y') || $inventory.keys.includes('y')}
            <span><KeyCard keys={$inventory.keys} key={'Y'} /></span>
        {/if}
        {#if  $inventory.keys.includes('R') || $inventory.keys.includes('r')}
            <span><KeyCard keys={$inventory.keys} key={'R'} /></span>
        {/if}
    </div>
    <div class="backpack">
        <span>
            <STNumber sprite='STYSNUM' value={$inventory.ammo.bullets.amount} />
            <STNumber sprite='STYSNUM' value={$inventory.ammo.bullets.max} />
        </span>
        <span>
            <STNumber sprite='STYSNUM' value={$inventory.ammo.shells.amount} />
            <STNumber sprite='STYSNUM' value={$inventory.ammo.shells.max} />
        </span>
        <span>
            <STNumber sprite='STYSNUM' value={$inventory.ammo.rockets.amount} />
            <STNumber sprite='STYSNUM' value={$inventory.ammo.rockets.max} />
        </span>
        <span>
            <STNumber sprite='STYSNUM' value={$inventory.ammo.cells.amount} />
            <STNumber sprite='STYSNUM' value={$inventory.ammo.cells.max} />
        </span>
    </div>
</div>

<style>
    div {
        position: absolute;
        top: 0px;
        display: inline-block;
        line-height: 0;
    }

    .root {
        user-select: none;
        place-self: center;
        width: 320px;
        height: 32px;
        transform: scale(var(--st-scale));
        transform-origin: top center;
        top: var(--st-top);
        background: var(--st-bg);
        background-position: var(--st-bg-offsetx) 0px;
    }

    .ammo {
        left: 3px;
        top: 3px;
    }

    .health {
        left: 48px;
        top: 3px;
    }

    .arms {
        display: inline-flex;
        flex-direction: row;
        left: 104px;
        top: 0px;
    }
    .arms span {
        position: absolute;
    }
    .arms span:nth-child(2) {
        top: 4px;
        left: -1px;
    }
    .arms span:nth-child(3) {
        top: 4px;
        left: 11px;
    }
    .arms span:nth-child(4) {
        top: 4px;
        left: 22.5px;
    }
    .arms span:nth-child(5) {
        top: 14px;
        left: -1px;
    }
    .arms span:nth-child(6) {
        top: 14px;
        left: 11px;
    }
    .arms span:nth-child(7) {
        top: 14px;
        left: 22.5px;
    }

    .face {
        top: 2px;
        left: 148px;
    }

    .armor {
        left: 179px;
        top: 3px;
    }

    .keys {
        left: 238.5px;
    }
    .keys span {
        width: 7px;
        position: absolute;
    }
    .keys span:nth-child(1) {
        top: 3px;
    }
    .keys span:nth-child(2) {
        top: 13px;
    }
    .keys span:nth-child(3) {
        top: 23px;
    }

    .backpack {
        display: inline-flex;
        flex-direction: column;
        left: 250px;
        top: 0px;
    }
    .backpack span {
        position: absolute;
        display: flex;
        flex-direction: row;
        gap: 12px;
    }
    .backpack span:nth-child(1) {
        top: 5px;
        left: 27px;
    }
    .backpack span:nth-child(2) {
        top: 11px;
        left: 27px;
    }
    .backpack span:nth-child(3) {
        top: 17px;
        left: 27px;
    }
    .backpack span:nth-child(4) {
        top: 23px;
        left: 27px;
    }
</style>