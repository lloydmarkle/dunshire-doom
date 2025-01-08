<script lang="ts">
    import { Color } from "three";
    import { signedLineDistance, type MapRuntime, type SubSector, type TreeNode, type Vertex } from "../../doom";
    import type { RenderSector } from "../RenderData";

    export let map: MapRuntime;
    export let renderSectors: RenderSector[];

    function findTreeDepth(root: TreeNode, point: Vertex) {
        let node: TreeNode | SubSector = root;
        let depth = 0;
        while (true) {
            depth += 1;
            if ('segs' in node) {
                break;
            }
            const side = signedLineDistance(node.v, point);
            node = side <= 0 ? node.childLeft : node.childRight;
        }
        return depth;
    }

    const bbox = map.data.blockMapBounds;
    const bspRoot = map.data.nodes[map.data.nodes.length - 1];
    const subsectorDepth = new Map<SubSector, number>();
    for (const node of map.data.nodes) {
        if ('segs' in node.childLeft) {
            const depth = findTreeDepth(bspRoot, node.childLeft.vertexes[0]);
            subsectorDepth.set(node.childLeft, depth);
        }
        if ('segs' in node.childRight) {
            const depth = findTreeDepth(bspRoot, node.childRight.vertexes[0]);
            subsectorDepth.set(node.childRight, depth);
        }
    }
    const depths = [...subsectorDepth.values()];
    let maxDepth = depths.reduce((a, b) => Math.max(a, b), -Infinity);
    let minDepth = depths.reduce((a, b) => Math.min(a, b), Infinity);
    let depthRange = maxDepth - minDepth;
    const distribution = depths.reduce((map, v) => map.set(v, 1 + (map.get(v) ?? 0)), new Map<number, number>());
    console.log('distribution', distribution);

    const subsectorColor = (subsec: SubSector) =>
        depthColor(subsectorDepth.get(subsec) ?? maxDepth);

    function depthColor(n: number) {
        const v = (n) / maxDepth;
        return '#' + new Color().setRGB(v, v, v).getHexString();
    }

    const scaleStops: number[] = [];
    const stepSize =
        depthRange > 20 ? 5 :
        1
    const scaleBoxHeight = (bbox.top - bbox.bottom) / (maxDepth / stepSize);
    for (let i = 0; i < maxDepth; i += stepSize) {
        scaleStops.push(i);
    }
</script>

<!-- Very cool! https://expensive.toys/blog/svg-filter-heat-map -->
<filter id="thermal-vision" color-interpolation-filters="sRGB">
    <feComponentTransfer>
    <feFuncR type="table" tableValues="0  0.125  0.8    1      1" />
    <feFuncG type="table" tableValues="0  0      0      0.843  1" />
    <feFuncB type="table" tableValues="0  0.549  0.466  0      1" />
    </feComponentTransfer>
</filter>

<g style="filter:url('#thermal-vision');">
    {#each scaleStops as stop, i}
        {@const yOffset = i * scaleBoxHeight}
        <rect
            x={bbox.left - 200} y={bbox.bottom + yOffset}
            width={60} height={scaleBoxHeight}
            opacity={.8}
            fill={depthColor(stop)} />
        <text x={bbox.left - 280} y={-(bbox.bottom + yOffset)} fill='white'>{stop}</text>
    {/each}

    {#each renderSectors as rs}
        {#each rs.subsectors as subsector}
            <polygon
                points={subsector.vertexes.map(e => e.x + ',' + e.y).join(' ')}
                fill={subsectorColor(subsector)} />
        {/each}
    {/each}
</g>

<style>
    text {
        font-size: x-large;
        width: 10em;
        transform: scaleY(-1);
    }
</style>