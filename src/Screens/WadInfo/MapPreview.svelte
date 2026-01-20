<script lang="ts">
    import { readMapVertexLinedefsAndSectors, type Vertex, type DoomWad } from "../../doom";
    import { defaultPalette } from "../../WadStore";

    export let wad: DoomWad;
    export let mapName: string;

    let canv: HTMLCanvasElement;
    $: mapData = loadMapData(mapName);
    $: if (canv) drawMap(mapData, canv, zoom, offset);

    function loadMapData(mapName: string) {
        const { linedefs } = readMapVertexLinedefsAndSectors(wad.mapLumps.get(mapName));

        // figure out map dimensions
        let bounds = { top: -Infinity, bottom: Infinity, left: Infinity, right: -Infinity };
        for (const ld of linedefs) {
            bounds.top = Math.max(ld.v[0].y, ld.v[1].y, bounds.top);
            bounds.bottom = Math.min(ld.v[0].y, ld.v[1].y, bounds.bottom);
            bounds.left = Math.min(ld.v[0].x, ld.v[1].x, bounds.left);
            bounds.right = Math.max(ld.v[0].x, ld.v[1].x, bounds.right);
        }

        // TODO: this isn't right and we don't zoom on the pointer/touch position and we don't set a reasonable
        // default zoom. Overall sloppy.
        offset.x = (bounds.right - bounds.left) / 2;
        offset.y = (bounds.top - bounds.bottom) / 2;
        return { linedefs, bounds };
    }

    const canvasSize = 2048;
    const canvasPadding = 20;
    function drawMap(map: ReturnType<typeof loadMapData>, canvas: HTMLCanvasElement, zoom: number, offset: Vertex) {
        const { bounds, linedefs } = map;
        const width = (bounds.right - bounds.left);
        const height = (bounds.top - bounds.bottom);
        const tScale = Math.min(height, width) / (canvasSize * zoom);
        const palette = wad.palettes[0] ?? defaultPalette;

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

            let x1 = (offset.x + ld.v[0].x - bounds.left) * tScale;
            let y1 = (offset.y + bounds.top - ld.v[0].y) * tScale;
            let x2 = (offset.x + ld.v[1].x - bounds.left) * tScale;
            let y2 = (offset.y + bounds.top - ld.v[1].y) * tScale;

            g.beginPath();
            g.moveTo(x1 + canvasPadding, y1 + canvasPadding);
            g.lineTo(x2 + canvasPadding, y2 + canvasPadding);
            g.stroke();
        }
    }

    const maxZoom = 300;
    let zoom = 60;
    function mousewheel(ev: WheelEvent) {
        zoom = Math.max(1, Math.min(maxZoom, zoom + ev.deltaY * (zoom / maxZoom)));
    }

    let dragStart: DOMPoint;
    let offset = { x: 0, y: 0 };
    const pointerdown = (ev: PointerEvent) => dragStart = new DOMPoint(ev.clientX, ev.clientY);
    const pointerup = () => dragStart = undefined;
    function pointermove(ev: PointerEvent) {
        if (!dragStart) {
            return;
        }
        // a crude way to change map position. It would be nicer to drag with momentum but we'd need to apply physics
        // and have some kind of RAF and for such a small feature, it just doesn't seem worth it right now.
        let p = new DOMPoint(ev.clientX, ev.clientY);
        offset.x += (dragStart.x - p.x);
        offset.y += (dragStart.y - p.y);
    }
</script>

<canvas class="w-full h-full"
    width={canvasSize} height={canvasSize}
    on:pointerdown={pointerdown}
    on:pointerup={pointerup}
    on:pointercancel={pointerup}
    on:pointermove={pointermove}
    on:touchmove|preventDefault
    on:wheel|preventDefault={mousewheel}
    bind:this={canv}
></canvas>
