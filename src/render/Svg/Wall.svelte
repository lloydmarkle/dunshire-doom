<script lang="ts">
    import type { LineDef, MapRuntime } from "../../doom";

    export let map: MapRuntime;
    export let linedef: LineDef;

    const wad = map.game.wad;
    const palette = wad.palettes[0];

    const { zFloor : zFloorL, zCeil : zCeilL } = linedef.left?.sector?.renderData ?? {};
    const { zFloor : zFloorR, zCeil : zCeilR } = linedef.right.sector.renderData

    $: lineStroke = (function() {
        // return !linedef.left || (linedef.flags & 0x0020) ? palette[176] :
        return !linedef.left ? palette[176] :
            ($zFloorL !== $zFloorR) ? palette[64] :
            ($zCeilL !== $zCeilR) ? palette[231] :
            palette[96];
    })();
</script>

<line
    x1={linedef.v[0].x}
    y1={linedef.v[0].y}
    x2={linedef.v[1].x}
    y2={linedef.v[1].y}
    stroke-opacity={1}
    stroke={'#' + lineStroke.getHexString()}
    stroke-width={4}
    fill='transparent'
/>
