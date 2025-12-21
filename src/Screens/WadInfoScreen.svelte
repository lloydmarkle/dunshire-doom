<script lang="ts">
    import { Icon } from "@steeze-ui/svelte-icon";
    import { type WadFile, type Lump, DoomWad, SoundIndex } from "../doom";
    import { defaultPalette, type WADInfo } from "../WadStore";
    import ENDOOM from "../render/ENDOOM.svelte";
    import MapSection from './WadInfo/MapSection.svelte'
    import SoundPreview from './WadInfo/SoundPreview.svelte'
    import MusicPreview from './WadInfo/MusicPreview.svelte'
    import GraphicPreview from './WadInfo/GraphicPreview.svelte'
    import { MagnifyingGlass } from "@steeze-ui/heroicons";

    // A SLADE inspired wad view. It's definitely not as complete and does not allow editing
    // but who knows... maybe someday?

    export let wadInfo: WADInfo;
    export let wadFile: WadFile;

    let imageLumpRanges = [];
    function isGraphic(lump: Lump, index: number) {
        // FIXME: this is not a good function at all but I'm not feeling like improving it at the moment
        return (false
            || imageLumpRanges.some(range => index > range[0] && index < range[1])
            || lump.name.startsWith('ST') // STBAR, STNUM, STG, STC... maybe too general?
            || lump.name.startsWith('AMMNUM')
            || lump.name.startsWith('M_')
            || lump.name.startsWith('BRDR')
            || lump.name.startsWith('WI')
            || lump.name.startsWith('CWI')
            || lump.name.startsWith('END')
            || lump.name.startsWith('PFUB')
            || ['TITLEPIC', 'HELP', 'CREDIT', 'BOSSBACK', 'INTERPIC', 'HELP1', 'VICTORY2'].includes(lump.name)
        );
    }

    $: wad = initializeWad(wadInfo.name, wadFile);
    function initializeWad(name: string, file: WadFile) {
        const wad = new DoomWad(name, [file]);
        // we need a default palette to render graphics
        if (wad.palettes.length === 0) {
            wad.palettes.push(defaultPalette);
        }

        let rangeStart = -1;
        for (let i = 0; i < file.lumps.length; i++) {
            if (file.lumps[i].name.endsWith('_START') && rangeStart === -1) {
                rangeStart = i;
            } else if (file.lumps[i].name.endsWith('_END') && rangeStart > 0) {
                imageLumpRanges.push([rangeStart, i]);
                rangeStart = -1;
            }
        }

        return wad;
    }

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

    let searchText = '';
    $: lowerCaseSearchText = searchText.toUpperCase();
    $: filteredLumps = wadFile.lumps.filter(wad => wad.name.includes(lowerCaseSearchText));

    function lumpType(lump: Lump, index: number) {
        if (lump.name === 'ENDOOM') {
            return 'endoom';
        } else if (lump.name.startsWith('D_')) {
            // is starting with D_ really enough??
            return 'music';
        } else if (lump.name.startsWith('DS') && Object.values(SoundIndex).includes('sfx_' + lump.name.substring(2).toLowerCase())) {
            return 'sound';
        } else if (isGraphic(lump, index)) {
            return 'image'
        } else if (lump.data.every(n => n >= 32 && n <= 127)) {
            return 'text';
        }
        return 'n/a';
    }

    let selectedLump: Lump = null;
    let selectedLumpIndex = 0;
    function select(lump: Lump, index: number) {
        selectedLump = lump;
        selectedLumpIndex = index;

        const params = new URLSearchParams(window.location.hash.substring(1));
        params.set('lump', index.toString());
        window.location.hash = params.toString();
    }

    function parseUrlHash(hash: string) {
        const params = new URLSearchParams(hash.substring(1));
        const lumpIndex = params.get('lump');
        if (lumpIndex) {
            const index = Number(lumpIndex);
            select(wadFile.lumps[index], index);
        }
    }
    $: parseUrlHash(window.location.hash);
</script>

<svelte:window on:popstate={() => parseUrlHash(window.location.hash)} />

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
        <div class="collapse-content max-h-[32rem]">
            {#if wc[2]}
                <svelte:component this={wc[1]} {wadFile} {wad} />
            {/if}
        </div>
    </div>
    {/each}
</section>

<section class="">
    <h3 class="text-xl">All Lumps</h3>
    <div class="flex gap-2">
        <div>
            <label class="input input-bordered input-sm flex items-center gap-2 ms-auto">
                <input type="text" class="grow" placeholder="Search" bind:value={searchText} />
                <Icon src={MagnifyingGlass} theme='outline' size="8px" />
            </label>
            <div class="bg-base-300 max-w-xs max-h-[32rem] overflow-y-scroll">
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
                            class:hidden={!filteredLumps.includes(lump)}
                            on:click={() => select(lump, i)}
                        >
                            <th>{i}</th>
                            <td>{lump.name}</td>
                            <td>{printBytes(lump.data.byteLength)}</td>
                            <td>{lumpType(lump, i)}</td>
                        </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="relative overflow-scroll flex-grow">
            {#if selectedLump}
                {@const type = lumpType(selectedLump, selectedLumpIndex)}
                {#if type === 'text'}
                    <pre class="px-2 bg-base-300">{String.fromCharCode(...Array.from(selectedLump.data))}</pre>
                {:else if type === 'endoom'}
                    <ENDOOM {wad} />
                {:else if type === 'music'}
                    <MusicPreview lump={selectedLump} />
                {:else if type === 'sound'}
                    <SoundPreview lump={selectedLump} />
                {:else if type === 'image'}
                    <GraphicPreview {wad} lump={selectedLump} />
                {/if}
            {:else}
                TODO: preview selected lump
            {/if}
        </div>
    </div>
</section>

<style>
    section {
        max-height: 40rem;
        overflow-y: scroll;
        padding-block-start: 1rem;
    }
</style>