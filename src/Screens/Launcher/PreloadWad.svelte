<script lang="ts" module>
    // TODO: generate this in build-scripts/remote-download ?
    type PreloadedWad = typeof preloadedWads[0];
    export const preloadedWads = $state([
        { name: 'Freedoom Phase 1', link: '/remotes/freedoom1.zip', size: '10MB', installProgress: 0 },
        { name: 'Freedoom Phase 2', link: '/remotes/freedoom2.zip', size: '10.5MB', installProgress: 0 },
    ]);
</script>
<script lang="ts">
    import { LumpPicture } from "../../doom";
    import { unzip } from "fflate";
    import { pictureDataUrl } from "../../render/Components/Picture.svelte";
    import { defaultPalette, type WadStore } from "../../WadStore";
    import type { Snippet } from "svelte";

    interface Props {
        wadStore: WadStore;
        wad: PreloadedWad;
        children?: Snippet;
    }
    let { wad, wadStore, children, ...others }: Props = $props();

    async function installWad(wadStore: WadStore, wad: PreloadedWad) {
        const response = await fetch(wad.link);
        const totalSize = parseInt(response.headers.get('content-length') ?? '1');
        const zippedWad = new Uint8Array(totalSize);
        let progress = 0;
        for await (const chunk of response.body) {
            zippedWad.set(chunk, progress);
            progress += chunk.byteLength;
            wad.installProgress = progress / totalSize;
        }

        unzip(zippedWad, {}, (err, data) => {
            const wadName = wad.link.split('/').pop().split('.').shift();
            wadStore.saveWad(wadName, data[wadName + '.wad'] as any)
                // it would be cool to use <a href..> in the markup instead of navigating like this but if we do that
                // navigation happens before the download/install finishes so see an error (temporarily)
                .then(() => history.pushState(null, null, `#wad=${wadName}`));
        });
    }

    let titlepic = $derived(wad.link.replace('.zip', '.titlepic.lump'));
    let dataUrl = $derived(fetch(titlepic)
        .then(res => res.bytes())
        .then(bytes => new LumpPicture(bytes, defaultPalette))
        .then(pic => pictureDataUrl(pic, 'image/png')));
</script>

<button
    {...others}
    class={[ others['class'] ?? '', "btn wad-install h-auto no-animation p-0 overflow-hidden shadow-2xl relative" ]}
    style:--wad-install-progress="{wad.installProgress}turn"
    onpointerenter={others['on:pointerenter']}
    onclick={() => installWad(wadStore, wad)}
>
    {#await dataUrl}
        <div class="flex justify-center">
            <span class="loading loading-spinner loading-md"></span>
        </div>
    {:then data}
        <div class="grid grid-rows-1 grid-cols-1">
            <img width="320" height="200" src={data} alt={wad.name} />
            <img width="320" height="200" src={data} alt={wad.name} />
        </div>
    {/await}

    <div
        class="download-info absolute bottom-2 left-2 p-2 items-end text-secondary bg-black rounded-lg flex flex-col gap-2"
        style:--tw-bg-opacity={.5}
    >
        <span>{wad.name}</span>
        <span>{wad.size} download</span>
    </div>

    {@render children?.()}
</button>

<style>
    .wad-install .download-info {
        transition: transform .2s;
        transform: translate(0, 150%);
    }
    .wad-install:hover .download-info {
        transform: translate(0, 0);
    }
    @media (hover: none) {
        .download-info {
            transform: none;
        }
    }

    .wad-install img {
        grid-row: 1;
        grid-column: 1;
    }
    .wad-install img:nth-child(2) {
        filter: sepia(100%);
        mask-image: conic-gradient(
            transparent 0deg,
            transparent var(--wad-install-progress),
            rgba(0, 0, 0, 1) var(--wad-install-progress));
    }
</style>