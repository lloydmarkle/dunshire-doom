<script lang="ts">
    import { derived, writable } from "svelte/store";
    import type { LineDef, MapRuntime } from "../../doom";
    import { useDoom } from "../DoomContext";
    import SectorEditor from "./SectorEditor.svelte";
    import TextureChooser from "./TextureChooser.svelte";

    export let linedef: LineDef;
    export let side: 'left' | 'right';
    export let map: MapRuntime;

    const { wad } = useDoom();
    const sidedef = linedef[side];
    const { xOffset, yOffset } = sidedef;
    const upper = writable(sidedef.upper);
    const middle = writable(sidedef.middle);
    const lower = writable(sidedef.lower);

    derived([upper, middle, lower, xOffset, yOffset], () => new Date()).subscribe(() => {
        sidedef.upper = $upper;
        sidedef.middle = $middle;
        sidedef.lower = $lower;
        map.events.emit('wall-texture', linedef);
    });
</script>

<div class="bg-base-100 rounded-box p-2">
    <label class="label">
        <span class="label-text">Texture x-offset</span>
        <input class="input" type="number" bind:value={$xOffset} />
    </label>
    <label class="label">
        <span class="label-text">Texture y-offset</span>
        <input class="input" type="number" bind:value={$yOffset} />
    </label>
    <TextureChooser {wad} label="Upper" type="wall" bind:value={$upper} on:change={() => map.initializeWallTextureAnimation(linedef,  side, 'upper')} />
    <TextureChooser {wad} label="Middle" type="wall" bind:value={$middle} on:change={() => map.initializeWallTextureAnimation(linedef,  side, 'middle')} />
    <TextureChooser {wad} label="Lower" type="wall" bind:value={$lower} on:change={() => map.initializeWallTextureAnimation(linedef,  side, 'lower')} />

    <div class="bg-base-300 rounded-box p-2 mt-4 flex flex-col gap-2">
        <SectorEditor {map} sector={sidedef.sector} />
    </div>
</div>
