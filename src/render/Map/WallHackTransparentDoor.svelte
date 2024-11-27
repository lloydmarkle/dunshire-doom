<script lang="ts">
    import type { LineDef } from "../../doom";
    import WallFragment from "./WallFragment.svelte";

    export let linedef: LineDef;

    const visible = true;
    const mid = {
        x: (linedef.v[1].x + linedef.v[0].x) * 0.5,
        y: (linedef.v[1].y + linedef.v[0].y) * 0.5,
    };
    const vx = linedef.v[1].x - linedef.v[0].x;
    const vy = linedef.v[1].y - linedef.v[0].y;
    const width = Math.sqrt(vx * vx + vy * vy);
    const angle = Math.atan2(vy, vx);
    const leftAngle = angle + Math.PI;

    const { zFloor : zFloorL, zCeil : zCeilL } = linedef.left.sector.renderData;
    const { zFloor : zFloorR } = linedef.right.sector.renderData;
    const { yOffset } = linedef.left;
    $: floorGap = $zFloorR - $zFloorL;
    $: top = $zCeilL + $yOffset + floorGap;
    $: height = $yOffset;
</script>

{#if width > 0 && height > 0}
    <WallFragment
        {linedef} useLeft doubleSidedMiddle
        {visible} {width} {height} {top} {mid} angle={leftAngle}
    />
    <WallFragment
        {linedef} doubleSidedMiddle
        {visible} {width} {height} {top} {mid} {angle}
    />
{/if}
