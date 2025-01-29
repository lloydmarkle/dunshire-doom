<script lang="ts">
    import { type WadFile, type Lump, DoomWad } from "../doom";
    import type { WADInfo } from "../WadStore";
    import MapSection from './WadInfo/MapSection.svelte'

    // A SLADE inspired wad view. It's definitely not as complete and does not allow editing
    // but who knows... maybe someday?

    export let wadInfo: WADInfo;
    export let wadFile: WadFile;

    $: wad = new DoomWad(wadInfo.name, [wadFile]);
    $: wadComponents = [
        wad.mapNames.length ? [`Maps (${wad.mapNames.length})`, MapSection, false] : null,
        // wad.texturesNames.length ? ['Textures', ] : [],
        // wad.flatsNames.length ? ['Flats', ] : [],
        // wad.sprites.length ? ['Sprites', ] : [],
        // (status bar, fonts, backgrounds, ENDOOM)
        // wad.graphics.length ? ['Graphics', ] : [],
        // wad.Sounds.length ? ['Sounds', ] : [],
        // wad.music.length ? ['Music', ] : [],
    ].filter(e => e) as any;

    const printBytes = (n: number) =>
        (n >> 20) > 0 ? (n / 1024 / 1024).toFixed(1) + 'MB' :
        (n >> 10) > 0 ? (n / 1024).toFixed(1) + 'KB' :
        n + 'B';

    let selectedLump: Lump = null;
    function lumpType(lump: Lump) {
        return 'n/a';
    }
</script>

<section class="flex justify-between">
    <div>
        <h2 class="text-2xl font-mono">{wadInfo.name}</h2>
        <span>{printBytes(wadFile.size)}, {wadFile.lumps.length} Lumps.</span>
    </div>
    <button class="btn">Delete</button>
</section>

<section>
    {#each wadComponents as wc}
    <div class="collapse collapse-arrow bg-base-200">
        <input type="checkbox" name="wad-content" on:change={() => wc[2] = !wc[2]} />
        <div class="collapse-title text-xl font-medium">{wc[0]}</div>
        <div class="collapse-content">
            {#if wc[2]}
                <svelte:component this={wc[1]} {wadFile} {wad} />
            {/if}
        </div>
    </div>
    {/each}
</section>

<section>
    <h3 class="text-xl">All Lumps</h3>
    <div class="flex">
        <div class="bg-base-300 max-h-[calc(100vh-4rem)] overflow-y-scroll">
            <table class="table table-xs">
                <!-- head -->
                <thead>
                    <tr>
                        <th></th>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Type</th>
                    </tr>
                </thead>
                <tbody>
                    {#each wadFile.lumps as lump, i}
                    <tr
                        class="cursor-pointer"
                        class:bg-accent={selectedLump === lump}
                        on:click={() => selectedLump = lump}
                    >
                        <th>{i}</th>
                        <td>{lump.name}</td>
                        <td>{printBytes(lump.data.byteLength)}</td>
                        <td>{lumpType(lump)}</td>
                    </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <div class="flex-grow relative">TODO: preview selected lump</div>
    </div>
</section>

<style>
    section {
        padding-block-start: 1rem;
    }
</style>