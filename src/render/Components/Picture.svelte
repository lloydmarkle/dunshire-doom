<script lang="ts" context="module">
    // cache image url so we don't always create a new image context when we load a new image
    const cache = new Map<string, string>();
    let lastWad: DoomWad;

    type ImageType = 'wall' | 'flat' | 'sprite' | 'any';
    export function imageDataUrl(wad: DoomWad, name: string, type: ImageType, format = 'image/png') {
        if (wad !== lastWad) {
            cache.clear();
        }

        const key = name + type;
        let dataUrl = cache.get(key);
        if (dataUrl) {
            return dataUrl;
        }

        const px =
            type === 'flat' ? wad.flatTextureData(name) :
            type === 'wall' ? wad.wallTextureData(name) :
            wad.graphic(name);
        if (!px) {
            return '';
        }

        dataUrl = pictureDataUrl(px, format);
        if (dataUrl.length) {
            cache.set(key, dataUrl);
        }
        return dataUrl;
    }

    export function pictureDataUrl(pic: Picture, format = 'image/png') {
        try {
            // draw image onto canvas
            const canvas = document.createElement('canvas');
            canvas.width = pic.width;
            canvas.height = pic.height;
            const ctx = canvas.getContext('2d');
            const img = ctx.createImageData(canvas.width, canvas.height);
            pic.toBuffer(img.data);
            ctx.putImageData(img, 0, 0);

            // convert to data url
            const dataUrl = canvas.toDataURL(format);
            return dataUrl;
        } catch {
            // interestingly, some wads contain TITLEPIC but not playpal which means we have images but no palette.
            // We could supply a default palette but for the purpose of the table of wads, it doesn't seem worth it
            return '';
        }
    }
</script>
<script lang="ts">
    import { useDoom } from "../DoomContext";
    import type { DoomWad, Picture } from "../../doom";

    export let name: string;
    export let type: ImageType = 'any';
    export let wad: DoomWad = null;

    wad = wad ?? useDoom().wad;

    $: gfx = wad.graphic(name);
    $: dataUrl = imageDataUrl(wad, name, type);
    $: style = type !== 'sprite' ? '' : `transform: translate(0px, ${-gfx.yOffset + .5 * gfx.height}px)`;
</script>

<img {style} src={dataUrl} alt={name} />
