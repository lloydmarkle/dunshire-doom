<script lang="ts">
    import type { Vector3 } from "three";
    import type { MapRuntime, Sector, SideDef } from "../../doom";
    import { useAppContext, useDoom } from "../DoomContext";
    import NumberChooser from "./NumberChooser.svelte";
    import TextureChooser from "./TextureChooser.svelte";
    import { derived, writable } from "svelte/store";

    export let map: MapRuntime;
    export let sector: Sector;

    const { editor } = useAppContext();
    const { wad } = useDoom();
    const originalZCeil = sector.zCeil;
    const originalZFloor = sector.zFloor;

    const light = writable(sector.light);
    const ceilFlat = writable(sector.ceilFlat);
    const floorFlat = writable(sector.floorFlat);
    const zFloor = writable(sector.zFloor);
    const zCeil = writable(sector.zCeil);
    derived([light, floorFlat, ceilFlat, zCeil, zFloor], () => new Date()).subscribe(() => {
        sector.ceilFlat = $ceilFlat;
        sector.floorFlat = $floorFlat;
        sector.zCeil = $zCeil;
        sector.zFloor = $zFloor;
        sector.light = $light;
        // it's simpler to just notify that everything changed (even if it didn't)
        map.events.emit('sector-flat', sector);
        map.events.emit('sector-light', sector);
        map.events.emit('sector-z', sector);
        map.initializeFlatTextureAnimation(sector, 'ceilFlat');
        map.initializeFlatTextureAnimation(sector, 'floorFlat');
    });

    let showSelector = false;
    function toggleSelector() {
        showSelector = !showSelector;
    }

    function vecPrint(v: Vector3) {
        return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`
    }

    // https://doomwiki.org/wiki/Sector
    const types = {
        0: 'Normal',
        1: 'Blink random',
        2: 'Blink 0.5 second',
        3: 'Blink 1.0 second',
        4: '20% damage per second plus light blink 0.5 second',
        5: '10% damage per second',
        7: '5% damage per second',
        8: 'Oscillates',
        9: 'Player entering this sector gets credit for finding a secret',
        10: '30 seconds after level start, ceiling closes like a door',
        11: "20% damage per second. The level ends when the player's health drops below 11% and is touching the floor. Player health cannot drop below 1% while anywhere in a sector with this sector type.",
        12: 'Blink 1.0 second, synchronized',
        13: 'Blink 0.5 second, synchronized',
        14: '300 seconds after level start, ceiling opens like a door',
        16: '20% damage per second',
        17: 'Flickers randomly',
    };

    function changeType(n: number) {
        sector.type = n;
        showSelector = false;
        map.synchronizeSpecials();
    }

    function tagLinedef() {
        $editor.selected = map.data.linedefs.find(e => e.tag === sector.tag)
    }

    function goto() {
        map.player.position.copy(sector.center);
        map.events.emit('mobj-updated-position', map.player);
    }

    function changeSector(ev) {
        const sector = map.data.sectors.find(e => e.num === ev.detail)
        if (sector) {
            $editor.selected = sector;
        }
    }

    $: linedefs = map.data.linedefs.filter(ld => ld.right.sector === sector || ld.left?.sector === sector);
    const sidedefBrief = (side: SideDef) =>
        `z[${side.sector.zFloor}:${side.sector.zCeil}], [${[side.lower, side.middle, side.upper]}]`;
</script>

<h3>Sector <NumberChooser num={sector.num} on:select={changeSector} /></h3>
<div class="text-xs">
    <span>{vecPrint(sector.center)}</span>
    <button class="btn" on:click={goto}>Goto</button>
    <button class="btn" on:click={tagLinedef}>Tag: {sector.tag}</button>
</div>
<div>
    <button class="btn" on:click={toggleSelector}>{types[sector.type]}</button>
    {#if showSelector}
        <div class="absolute z-10
            overflow-y-scroll max-h-96
            flex flex-col gap-2 bg-base-100 rounded-box shadow p-2
        ">
            {#each Object.keys(types) as t, i}
                <button class="btn h-full" on:click={() => changeType(i)}>{types[t]}</button>
            {/each}
        </div>
    {/if}
</div>
<label class="label">
    <span class="label-text">Light level {$light}</span>
    <input type="range" class="range" min="0" max="255" step="8" bind:value={$light} />
</label>
<!--
TODO: we could actually do so much better here. Imagine something like:

--| 70
    |
    |
    | height: 78
    |
    |
--| -8

Where we can drag top and bottom and buttons to help line up with neighbouring sectors

There are lots of possibilities.
-->
<div class="bg-neutral rounded-box p-2">
    <span>Floor ceiling gap {$zCeil - $zFloor}</span>
    <label class="label">
        <span class="label-text">Ceiling height {$zCeil} (original {originalZCeil})</span>
        <input type="text" class="input" inputmode="numeric" pattern="[0-9]*" bind:value={$zCeil} />
    </label>
    <label class="label">
        <span class="label-text">Floor height {$zFloor} (original {originalZFloor})</span>
        <input type="text" class="input" inputmode="numeric" pattern="[0-9]*" bind:value={$zFloor} />
    </label>
</div>
<TextureChooser {wad} label="Ceiling" type="flat" bind:value={$ceilFlat} />
<TextureChooser {wad} label="Floor" type="flat" bind:value={$floorFlat} />

<div class="collapse bg-neutral collapse-arrow">
    <input type="checkbox" />
    <div class="collapse-title text-xl font-medium">Linedef summary</div>
    <div class="collapse-content">
        <ul>
            {#each linedefs as ld}
            <li class="flex flex-row gap-2 pb-2">
                <button class="link flex-1" on:click={() => $editor.selected = ld}>LD:{ld.num}</button>
                <div>R:
                    <button class="link" on:click={() => $editor.selected = ld.right.sector}>S:{ld.right.sector.num}</button>
                    {sidedefBrief(ld.right)}
                </div>
                {#if ld.left}
                    <div>L: <button class="link" on:click={() => $editor.selected = ld.right.sector}>S:{ld.left.sector.num}</button>
                        {sidedefBrief(ld.left)}
                    </div>
                {/if}
            </li>
            {/each}
        </ul>
    </div>
</div>