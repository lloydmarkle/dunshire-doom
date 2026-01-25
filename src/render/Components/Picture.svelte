<script lang="ts" module>
    // cache image url so we don't always create a new image context when we load a new image
    const imageCache = new Map<string, string>();
    const picutreCache = new Map<string, Picture>();
    let lastWad: DoomWad;

    function loadData(wad: DoomWad, name: string, type: ImageType) {
        const key = name + type;
        let pic = picutreCache.get(key);
        if (pic) {
            return pic;
        }

        pic = wad.graphic(name);
        if (pic) {
            picutreCache.set(key, pic);
        }
        return pic;
    }

    type ImageType = 'wall' | 'flat' | 'sprite' | 'any';
    export function imageDataUrl(wad: DoomWad, name: string, type: ImageType, format = 'image/png') {
        if (wad !== lastWad) {
            lastWad = wad;
            picutreCache.clear();
            imageCache.clear();
        }

        const key = name + type;
        let dataUrl = imageCache.get(key);
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
            imageCache.set(key, dataUrl);
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

    interface Props {
        name: string;
        type?: ImageType;
        wad?: DoomWad;
    }
    let { name, type = 'any', wad = useDoom().wad }: Props = $props();

    let gfx = $derived(loadData(wad, name, type));
    let dataUrl = $derived(imageDataUrl(wad, name, type));
</script>

<img src={dataUrl} alt={name}
    style={type === 'sprite' ? `transform: translate(0px, ${-gfx.yOffset + .5 * gfx.height}px)` : ''} />
