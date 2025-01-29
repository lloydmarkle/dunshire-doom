<script lang="ts">
    import type { DoomWad, WadFile } from "../../doom";
    import MapPreview from './MapPreview.svelte';

    export let wadFile: WadFile;
    export let wad: DoomWad;

    const mapNames = [...wad.mapNames].sort();
    let selectedMap = mapNames[0];
</script>

<div class="flex flex-col gap-2">
    <label class="label max-w-sm">
        <span class="label-text">Preview</span>
        <select class="select w-full max-w-xs" bind:value={selectedMap}>
            {#each mapNames as opt}
                <option>{opt}</option>
            {/each}
        </select>
    </label>
    <div>
        {#if selectedMap}
            <MapPreview {wad} mapName={selectedMap} />
        {/if}
    </div>
</div>