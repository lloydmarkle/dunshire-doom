<script lang="ts">
    import type { DoomWad, WadFile } from "../../doom";
    import MapPreview from './MapPreview.svelte';

    interface Props {
        wadFile: WadFile;
        wad: DoomWad;
    }
    let { wadFile, wad }: Props = $props();

    const mapNames = $derived([...wad.mapNames].sort());
    let selectedMap = $derived(mapNames[0]);
</script>

<div class="flex flex-col gap-1">
    <div class="flex gap-2 items-center">
        <label class="label max-w-sm">
            <span class="label-text">Preview</span>
            <select class="select w-full max-w-xs" bind:value={selectedMap}>
                {#each mapNames as opt}
                    <option>{opt}</option>
                {/each}
            </select>
        </label>
        <a class="btn btn-primary" href="#wad={wad.mapNames.includes('MAP01') ? 'doom2' : 'doom'}&wad={wadFile.name}&map={selectedMap}&play">Play</a>
    </div>
    <div>
        {#if selectedMap}
            <MapPreview {wad} mapName={selectedMap} />
        {/if}
    </div>
</div>