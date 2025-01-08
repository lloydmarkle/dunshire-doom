<script lang="ts">
    import type { Size } from "@threlte/core";
    import MapObject from "./MapObject.svelte";
    import Wall from "./Wall.svelte";
    import BspDepthHeatMap from "./BspDepthHeatMap.svelte";
    import { type MapRuntime, type SubSector } from "../../doom";
    import { useAppContext, useDoomMap } from "../DoomContext";
    import { Color } from "three";
    import type { RenderSector } from "../RenderData";
    import { onDestroy } from "svelte";
    import { bridgeEventsToReadables, type MapObject as MObj } from "../Map/SvelteBridge";

    export let size: Size;
    export let map: MapRuntime;

    const { renderSectors } = useDoomMap();
    const bridge = bridgeEventsToReadables(map, renderSectors);
    onDestroy(bridge.dispose);

    let mobjs: MObj[] = map.objs as any;
    const updateMobjs = (mo: MObj) => mobjs = map.objs as any;
    map.events.on('mobj-added', updateMobjs);
    map.events.on('mobj-removed', updateMobjs);
    onDestroy(() => {
        map.events.off('mobj-added', updateMobjs);
        map.events.off('mobj-removed', updateMobjs);
    });

    const { position, direction } = map.player.renderData as any;
    const { showBlockMap } = useAppContext().settings;

    // DOOM vertexes are in the range -32768 and 32767 so maps have a fixed maximum size
    const mapSize = 65536;
    let zoom = 60;
    let bounds = map.data.blockMapBounds;
    $: tScale = -Math.min(size.height, size.width) / mapSize;

    function mousedown(ev: MouseEvent) {
        if (ev.buttons & 1) {
            map.game.input.attack = true;
        }
    }

    function mouseup(ev: MouseEvent) {
        if ((ev.buttons & 1) === 0) {
            map.game.input.attack = false;
        }
    }

    function mousewheel(ev: WheelEvent) {
        zoom = Math.max(1, Math.min(200, zoom + ev.deltaY * (zoom / 200)));
    }

    function mousemove(ev: MouseEvent) {
        let p = new DOMPoint(ev.clientX, ev.clientY);
        let sp = p.matrixTransform((ev.target as any).getScreenCTM().inverse());
        // set player direction based on click location
        const ang = Math.atan2(sp.y - $position.y, sp.x - $position.x);
        map.player.direction = ang;
        $direction = ang;
    }

    let selRS: RenderSector;
    let selSubSec: SubSector;
    function selectRS(rs: RenderSector, subsec: SubSector) {
        // helpful for debugging...
        selRS = rs;
        selSubSec = subsec;
    }

    let debugShowBspDepthMap = false;
    let debugShowSubsectors = false;
    // TODO: this needs input handling somehow...
    const namedColor = (n: number) =>
        '#' + Object.values(Color.NAMES)[n % Object.keys(Color.NAMES).length].toString(16).padStart(6, '0');
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<svg
    width={size.width} height={size.height}
    viewBox="{mapSize * -.5} {mapSize * -.5} {mapSize} {mapSize}"
    style="
    transform:
        scale({zoom})
        translate({tScale * $position.x}px, {tScale * $position.y}px);
    "
    on:mousemove={mousemove}
    on:mousedown={mousedown}
    on:mouseup={mouseup}
    on:wheel={mousewheel}
>
    <defs>
        <!-- https://developer.mozilla.org/en-US/docs/Web/SVG/Element/marker -->
        <!-- A marker to be used as an arrowhead -->
        <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" stroke="context-stroke" fill="context-fill"/>
        </marker>

        <pattern id="smallGrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="grey" stroke-width="0.25"/>
        </pattern>
        <pattern id="grid" x={bounds.left} y={bounds.bottom} width="128" height="128" patternUnits="userSpaceOnUse">
            <!-- <rect width="128" height="128" fill="url(#smallGrid)"/> -->
            <path d="M 128 0 L 0 0 0 128" fill="none" stroke="grey" stroke-width="1"/>
        </pattern>
    </defs>

    <g
        stroke-linecap={'round'}
    >
        {#if debugShowBspDepthMap}
            <BspDepthHeatMap {map} {renderSectors} />
        {/if}

        {#if $showBlockMap}
            <rect
                x={bounds.left} y={bounds.bottom}
                width={bounds.right - bounds.left} height={bounds.top - bounds.bottom}
                opacity={0.5}
                fill="url(#grid)" />
        {/if}

        {#each map.data.linedefs as linedef}
            <Wall {map} {linedef} />
        {/each}

        {#each mobjs as mobj (mobj.id)}
            <MapObject {mobj} />
        {/each}

        {#if selSubSec}
            <g class="selection-info">
                {#each selSubSec.segs as seg}
                    <line x1={seg.v[0].x} y1={seg.v[0].y} x2={seg.v[1].x} y2={seg.v[1].y} stroke='yellow' stroke-width={3} />
                    <!-- <text x={(seg.v[0].x+seg.v[1].x)/2} y={-(seg.v[0].y+seg.v[1].y)/2} fill='yellow'>{seg.linedef.num}</text> -->
                {/each}
                {#each selSubSec.bspLines as line}
                    {@const x = 5000}
                    {@const m = (line[1].y - line[0].y) / (line[1].x - line[0].x + .00000001)}
                    {@const c = (m * -line[1].x) + line[1].y}
                    <line x1={line[0].x} y1={line[0].y} x2={line[1].x} y2={line[1].y} stroke='cyan' stroke-width={2} />
                    <line x1={-x} y1={-x * m + c} x2={x} y2={x * m + c} stroke='magenta' stroke-width={.2} />
                {/each}
                <rect x={selSubSec.bounds.left} y={selSubSec.bounds.top}
                    width={selSubSec.bounds.right - selSubSec.bounds.left} height={selSubSec.bounds.bottom - selSubSec.bounds.top}
                    stroke='orange' stroke-width={.4} fill='none' />
                {#each selSubSec.vertexes as v}
                    <circle cx={v.x} cy={v.y} r={1} fill='blue' />
                    <text x={v.x} y={-v.y} fill='blue'>{v.x.toFixed(2)},{v.y.toFixed(2)}</text>
                {/each}
                <text x={selSubSec.bounds.left} y={-selSubSec.bounds.top - 10} fill='white'>{selSubSec.num}</text>
            </g>
        {/if}

        {#if debugShowSubsectors}
        {#each renderSectors as rs, i}
            {#each rs.subsectors as subsector, j}
                <polygon
                    points={subsector.vertexes.map(e => e.x + ',' + e.y).join(' ')}
                    fill={namedColor(i)}
                    on:click={() => selectRS(rs, subsector)} />
                <polygon
                    points={subsector.vertexes.map(e => e.x + ',' + e.y).join(' ')}
                    opacity={.1}
                    fill={namedColor(j)}
                    on:click={() => selectRS(rs, subsector)} />
            {/each}
        {/each}
        {/if}
    </g>
</svg>

<div class="dropdown dropdown-end absolute right-0">
    <div tabindex="0" role="button" class="btn">Overlays</div>
    <div tabindex="-1" class="
        dropdown-content z-10 shadow bg-base-100 w-screen max-w-96 rounded-box
    ">
        <ul class="menu">
            <li>
                <label class="label cursor-pointer">
                    <span class="label-text">Subsectors</span>
                    <input type="checkbox" class="checkbox" bind:checked={debugShowSubsectors} />
                </label>
            </li>
            <li>
                <label class="label cursor-pointer">
                    <span class="label-text">Blockmap</span>
                    <input type="checkbox" class="checkbox" bind:checked={$showBlockMap} />
                </label>
            </li>
            <li>
                <label class="label cursor-pointer">
                    <span class="label-text">BSP depth heatmap</span>
                    <input type="checkbox" class="checkbox" bind:checked={debugShowBspDepthMap} />
                </label>
            </li>
        </ul>
    </div>
</div>

<style>
    svg {
        /* transform: translate(var(--tran)) scale(var(--scale)); */
        /* invert top and bottom */
        scale: 1 -1;
        user-select: none;
    }

    g {
        pointer-events: none;
    }

    polygon {
        pointer-events: all;
    }

    text {
        font-size: .3em;
        transform: scaleY(-1);
    }
</style>
