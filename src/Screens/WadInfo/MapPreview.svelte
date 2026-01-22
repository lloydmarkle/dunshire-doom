<script lang="ts">
    import { readMapVertexLinedefsAndSectors, type Vertex, type DoomWad, thingsLump } from "../../doom";
    import { defaultPalette } from "../../WadStore";

    export let wad: DoomWad;
    export let mapName: string;

    let canv: HTMLCanvasElement;
    $: mapData = loadMapData(mapName, canv);
    $: if (canv) drawMap(mapData, canv, zoom, offset);

    function loadMapData(mapName: string, canvas: HTMLCanvasElement) {
        const mapLumps = wad.mapLumps.get(mapName)
        const { linedefs } = readMapVertexLinedefsAndSectors(mapLumps);
        const things = thingsLump(mapLumps[1]);

        // figure out map dimensions
        let bounds = { top: -Infinity, bottom: Infinity, left: Infinity, right: -Infinity };
        for (const ld of linedefs) {
            bounds.top = Math.max(ld.v[0].y, ld.v[1].y, bounds.top);
            bounds.bottom = Math.min(ld.v[0].y, ld.v[1].y, bounds.bottom);
            bounds.left = Math.min(ld.v[0].x, ld.v[1].x, bounds.left);
            bounds.right = Math.max(ld.v[0].x, ld.v[1].x, bounds.right);
        }

        if (canvas) {
            zoom = 10;
            const player = things.findLast(e => e.type === 1);
            offset.x = (canvas.clientWidth / 2) + player.x - bounds.left;
            offset.y = (canvas.clientHeight / 4) + bounds.top - player.y;
        }
        return { linedefs, bounds };
    }

    const canvasSize = 2048;
    const canvasPadding = 20;
    function drawMap(map: ReturnType<typeof loadMapData>, canvas: HTMLCanvasElement, zoom: number, offset: Vertex) {
        const { bounds, linedefs } = map;
        const width = (bounds.right - bounds.left);
        const height = (bounds.top - bounds.bottom);
        const tScale = Math.min(height, width) / (Math.min(canvas.clientHeight, canvas.clientWidth) * zoom);
        const palette = wad.palettes[0] ?? defaultPalette;
        // this offset still isn't' right but it's close
        const cOffset = { x: canvas.width / 2, y: canvas.height / 4 };

        // draw linedefs onto image (scale coordinates based on canvasSize and map dimensions)
        const g = canvas.getContext("2d");
        g.fillStyle = '#' + palette[0].getHexString();
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.imageSmoothingEnabled = false;

        for (const ld of linedefs) {
            const lineColour = !ld.left ? palette[176] :
                (ld.left.sector.zFloor !== ld.right.sector.zFloor) ? palette[64] :
                (ld.left.sector.zCeil !== ld.right.sector.zCeil) ? palette[231] :
                palette[96];
            g.strokeStyle = '#' + lineColour.getHexString();

            let x1 = (ld.v[0].x - bounds.left - offset.x) * tScale + cOffset.x;
            let y1 = (bounds.top - ld.v[0].y - offset.y) * tScale + cOffset.y;
            let x2 = (ld.v[1].x - bounds.left - offset.x) * tScale + cOffset.x;
            let y2 = (bounds.top - ld.v[1].y - offset.y) * tScale + cOffset.y;
            g.beginPath();
            g.moveTo(x1 + canvasPadding, y1 + canvasPadding);
            g.lineTo(x2 + canvasPadding, y2 + canvasPadding);
            g.stroke();
        }
    }

    const maxZoom = 300;
    let zoom = 2;
    function mousewheel(ev: WheelEvent) {
        zoom = Math.max(1, Math.min(maxZoom, zoom + ev.deltaY * (zoom / maxZoom)));
    }

    let offset = { x: 0, y: 0 };
    let lastDrag: DOMPoint;
    const pointerdown = (ev: PointerEvent) => lastDrag = new DOMPoint(ev.clientX, ev.clientY);
    const pointerup = () => lastDrag = undefined;
    function pointermove(ev: PointerEvent) {
        if (!lastDrag) {
            return;
        }
        // a crude way to change map position. It would be nicer to drag with momentum but we'd need to apply physics
        // and have some kind of RAF and for such a small feature, it just doesn't seem worth it right now.
        let p = new DOMPoint(ev.clientX, ev.clientY);
        offset.x += (lastDrag.x - p.x) * zoom;
        offset.y += (lastDrag.y - p.y) * zoom;
        lastDrag = p;
    }
</script>

<canvas class="w-full h-full"
    width={canvasSize} height={canvasSize}
    on:pointerdown={pointerdown}
    on:pointerup={pointerup}
    on:pointerleave={pointerup}
    on:pointercancel={pointerup}
    on:pointermove={pointermove}
    on:touchmove|preventDefault
    on:wheel|preventDefault={mousewheel}
    bind:this={canv}
></canvas>
