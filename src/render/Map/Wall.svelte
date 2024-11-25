<script lang="ts">
    import type { LineDef } from "../../doom";
    import type { RenderSector } from "../RenderData";
    import WallFragment from "./WallFragment.svelte";

    export let renderSector: RenderSector;
    export let linedef: LineDef;

    const vis = renderSector.visible;
    $: visible = $vis;
    const mid = {
        x: (linedef.v[1].x + linedef.v[0].x) * 0.5,
        y: (linedef.v[1].y + linedef.v[0].y) * 0.5,
    };
    const vx = linedef.v[1].x - linedef.v[0].x;
    const vy = linedef.v[1].y - linedef.v[0].y;
    const width = Math.sqrt(vx * vx + vy * vy);
    const angle = Math.atan2(vy, vx);
    const leftAngle = angle + Math.PI;

    const { zFloor : zFloorL, zCeil : zCeilL } = linedef.left?.sector?.renderData ?? {};
    const { middle: middleL }  = linedef.left?.renderData ?? {};
    const { zFloor : zFloorR, zCeil : zCeilR } = linedef.right.sector.renderData
    const { middle: middleR }  = linedef.right.renderData;

    // sky-hack https://doomwiki.org/wiki/Sky_hack
    const { ceilFlat: ceilFlatL } = linedef.left?.sector?.renderData ?? {};
    const { ceilFlat: ceilFlatR } = linedef.right.sector.renderData;

    // Detect the skyhack is simple but how it's handled is... messy. How it
    // works is:
    // (1) we set render order to 1 for everything non-sky
    // (2) put extra walls from top of line to sky with (renderOrder=0, writeColor=false, and writeDepth=true)
    //   to occlude geometry behind them
    //
    // These extra walls are mostly fine but not perfect. If you go close to an edge and look toward the bunker thing
    // you can see part of the walls occluded which shouldn't be. Interestingly you can see the same thing in gzDoom
    //
    // What I really want to do is not draw stuff that occluded but I can't think of way to do that.
    // Overall we draw way more geometry than needed.
    //
    // See also E3M6 https://doomwiki.org/wiki/File:E3m6_three.PNG
    const needSkyWall = $ceilFlatR === 'F_SKY1'
    const skyHack = ($ceilFlatL === 'F_SKY1' && needSkyWall);
    const skyHeight = linedef.right.sector.skyHeight;
</script>

{#if width > 0}
    {#if needSkyWall && !skyHack}
        <WallFragment
            skyHack {linedef}
            {visible} {width} height={skyHeight - $zCeilR} top={skyHeight} {mid} {angle}
        />
    {/if}

    {#if linedef.left}
        <!-- two-sided so figure out top and bottom -->
        {#if $zCeilR !== $zCeilL && !skyHack}
            {@const useLeft = $zCeilL > $zCeilR}
            {@const height = useLeft ? $zCeilL - $zCeilR : $zCeilR - $zCeilL}
            {@const top = Math.max($zCeilR, $zCeilL)}
            {#if height > 0}
                <WallFragment
                    {linedef} {useLeft}
                    {visible} {width} {height} {top} {mid} angle={useLeft ? leftAngle : angle}
                    type={'upper'}
                />
            {/if}
        {/if}
        {#if $zFloorL !== $zFloorR}
            {@const useLeft = $zFloorR > $zFloorL}
            {@const height = useLeft ? $zFloorR - $zFloorL : $zFloorL - $zFloorR}
            {@const top = Math.max($zFloorR, $zFloorL)}
            {#if height > 0}
                <WallFragment
                    {linedef} {useLeft}
                    {visible} {width} {height} {top} {mid} angle={useLeft ? leftAngle : angle}
                    type={'lower'}
                />
            {/if}
        {/if}
        <!-- And middle(s) -->
        {@const top = Math.min($zCeilL, $zCeilR)}
        {@const height = top - Math.max($zFloorL, $zFloorR)}
        {#if height > 0}
            {#if $middleL}
                <WallFragment
                    {linedef} useLeft doubleSidedMiddle
                    {visible} {width} {height} {top} {mid} angle={leftAngle}
                />
            {/if}
            {#if $middleR}
                <WallFragment
                    {linedef} doubleSidedMiddle
                    {visible} {width} {height} {top} {mid} {angle}
                />
            {/if}
        {/if}

    {:else}
        {@const height = $zCeilR - $zFloorR}
        {#if height > 0}
            <WallFragment
                {linedef}
                {visible} {width} {height} top={$zCeilR} {mid} {angle}
            />
        {/if}
    {/if}
{/if}
