<script lang="ts">
    import type { LineDef, MapRuntime } from "../../doom";

    export let map: MapRuntime;
    export let linedef: LineDef;

    const wad = map.game.wad;
    const position = map.player.position;
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

    $: lineOpacity = (function() {
        // if (!linedef.left) {
            return 1;
        // }
        // const ceilingGap = $position.z + map.player.info.height - Math.min($zCeilR, $zCeilL);
        // if (ceilingGap > 0) {
        //     return Math.min(.9, Math.max(0.2, ceilingGap / 100));
        // }
        // const floorDiff = Math.abs($position.z - Math.max($zFloorR, $zFloorL));
        // return Math.min(.9, Math.max(0.2, floorDiff / 100));
    })();
</script>

<line
    x1={linedef.v[0].x}
    y1={linedef.v[0].y}
    x2={linedef.v[1].x}
    y2={linedef.v[1].y}
    stroke-opacity={lineOpacity}
    stroke={'#' + lineStroke.getHexString()}
    stroke-width={2}
    fill='transparent'
/>
