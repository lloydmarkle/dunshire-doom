<script lang="ts">
    import { Color } from "three";
    import { signedLineDistance, type MapRuntime, type SubSector, type TreeNode } from "../../doom";

    export let map: MapRuntime;

    const vertex = { x: 0, y: 0 };
    function findTreeDepth(root: TreeNode, x: number, y: number) {
        vertex.x = x;
        vertex.y = y;
        let node: TreeNode | SubSector = root;
        let depth = 0;
        while (true) {
            depth += 1;
            if ('segs' in node) {
                break;
            }
            const side = signedLineDistance(node.v, vertex);
            node = side <= 0 ? node.childLeft : node.childRight;
        }
        return depth;
    }

    // Making this number smaller has a big memory impact on large maps
    const gridSize = 32;
    const bbox = map.data.blockMapBounds;
    const bspRoot = map.data.nodes[map.data.nodes.length - 1];
    const depths: number[] = [];
    let maxDepth = -Infinity;
    let minDepth = Infinity;
    for (let x = bbox.left; x < bbox.right; x += gridSize) {
        for (let y = bbox.bottom; y < bbox.top; y += gridSize) {
            const depth = findTreeDepth(bspRoot, x, y);
            maxDepth = Math.max(depth, maxDepth);
            minDepth = Math.min(depth, minDepth);
            depths.push(depth);
        }
    }

    const scaleStops: number[] = [];
    const depthRange = maxDepth - minDepth;
    const stepSize =
        depthRange > 100 ? 20 :
        depthRange > 50 ? 10 :
        depthRange > 20 ? 5 :
        1
    const scaleBoxHeight = (bbox.top - bbox.bottom) / ((maxDepth - minDepth) / stepSize);
    for (let i = minDepth; i < maxDepth; i += stepSize) {
        scaleStops.push(i);
    }

    function depthColor(depth: number) {
        const val = ((depth - minDepth) / depthRange);
        return '#' + new Color().setRGB(val, val, val).getHexString();
    }

    const numRows = Math.floor((bbox.bottom - bbox.top) / gridSize);
</script>

<!-- Very cool! https://expensive.toys/blog/svg-filter-heat-map -->
<filter id="thermal-vision" color-interpolation-filters="sRGB">
    <feComponentTransfer>
      <feFuncR type="table" tableValues="0  0.125  0.8    1      1" />
      <feFuncG type="table" tableValues="0  0      0      0.843  1" />
      <feFuncB type="table" tableValues="0  0.549  0.466  0      1" />
    </feComponentTransfer>
</filter>

<g style="filter:url('#thermal-vision')">
    {#each scaleStops as stop, i}
        {@const yOffset = i * scaleBoxHeight}
        <rect
            x={bbox.left - 200} y={bbox.bottom + yOffset}
            width={60} height={scaleBoxHeight}
            opacity={.8}
            fill={depthColor(stop)} />
        <text x={bbox.left - 280} y={-(bbox.bottom + yOffset)} fill='white'>{stop}</text>
    {/each}

    {#each depths as depth, i}
        {@const row = i % numRows}
        {@const col = Math.ceil(i / numRows)}
        <rect
            x={bbox.left - col * gridSize} y={bbox.bottom + row * gridSize}
            width={gridSize} height={gridSize}
            opacity={.8}
            fill={depthColor(depth)} />
    {/each}
</g>

<style>
    text {
        font-size: x-large;
        width: 10em;
        transform: scaleY(-1);
    }
</style>