<script lang="ts" context="module">
    // all walls are planes so may as well use the same geometry
    const geometry = new PlaneGeometry();
</script>
<script lang="ts">
    import { MeshStandardMaterial, PlaneGeometry, Color } from "three";
    import { T } from "@threlte/core";
    import { HALF_PI, ToDegrees, type LineDef, type Vertex, normalizeAngle } from "../../doom";
    import Wireframe from "../Debug/Wireframe.svelte";
    import { useAppContext, useDoom, useDoomMap } from "../DoomContext";
    import { namedColor } from "../RenderData";

    export let linedef: LineDef;
    export let useLeft = false;
    export let type: 'upper' | 'lower' | 'middle' = 'middle';

    // geometry
    export let skyHack = false;
    export let visible: boolean;
    export let angle: number;
    export let width: number;
    export let height: number;
    export let top: number;
    export let mid: Vertex;
    export let doubleSidedMiddle = false;

    const sidedef = useLeft ? linedef.left : linedef.right;
    // In MAP29 in Doom2, the teleports in the blood only have right texture but seg.direction 1 so we get nothing.
    // https://doomwiki.org/wiki/MAP29:_The_Living_End_(Doom_II)#Bugs
    // There may be other places this happens but we correct it by doing a little hack
    // Actually gzdoom has lots of little corrections https://github.com/ZDoom/gzdoom/blob/master/wadsrc/static/zscript/level_compatibility.zs
    $: textureL = linedef.left?.renderData?.[type];
    $: textureR = linedef.right.renderData[type];
    $: texture = useLeft ? ($textureL ?? $textureR) : ($textureR ?? $textureL);

    const { yOffset, xOffset } = sidedef;
    const { flags } = linedef;

    const { settings, editor } = useAppContext();
    const { useTextures, cameraMode, fakeContrast } = settings;
    const { wad, textures } = useDoom();
    const { map } = useDoomMap();

    $: fakeContrastValue =
        $fakeContrast === 'classic' ? (
            linedef.v[1].x === linedef.v[0].x ? 16 :
            linedef.v[1].y === linedef.v[0].y ? -16 :
            0
        ) :
        $fakeContrast === 'gradual' ? Math.cos(angle * 2 + Math.PI) * 16 :
        0;
    const extraLight = map.player.extraLight;
    const { light } = sidedef.sector.renderData;
    const { zFloor : zFloorL, zCeil : zCeilL } = linedef.left?.sector?.renderData ?? {};
    const { zFloor : zFloorR, zCeil : zCeilR, skyHeight } = linedef.right.sector.renderData

    // TODO: We could actually use MeshBasic here (and in Thing and Flat) because we don't have any dynamic lighting
    // and we get a ~25% performance boost. I'd rather keep this and use the BSP to cull walls
    $: material = new MeshStandardMaterial({ color: lineStroke() });
    $: texture2 = texture ? textures.get(texture, 'wall').clone() : null;
    $: if (texture2) {
        if (doubleSidedMiddle) {
            const zFloor = Math.max($zFloorL, $zFloorR);
            const zCeil = Math.min($zCeilL, $zCeilR);
            let clippedTop = 0;
            if (linedef.flags & 0x0010) {
                // lower unpegged sticks to the ground
                top = zFloor + texture2.userData.height + $yOffset;
                clippedTop = Math.min(zCeil, top);
            } else {
                top = zCeil + $yOffset;
                clippedTop = Math.min(Math.max($zCeilL, $zCeilR), top);
            }
            const yOff = top - clippedTop;
            height = Math.min(texture2.userData.height - yOff, clippedTop - zFloor);
        }
        texture2.repeat.x = width * texture2.userData.invWidth;
        texture2.repeat.y = height * texture2.userData.invHeight;
        material.map = $useTextures ? texture2 : null;
        material.transparent = ($cameraMode === 'ortho');
        material.needsUpdate = true;
    } else if (linedef.transparentWindowHack) {
        material.transparent = true;
        material.opacity = 0.1;
    } else {
        material.map = null;
    }

    $: if (material.map && (flags || $xOffset || $yOffset)) {
        // texture alignment is complex https://doomwiki.org/wiki/Texture_alignment
        // threejs uses 0,0 in bottom left but doom uses 0,0 for top left so we by default
        // "peg" the corner to the top left by offsetting by height
        let pegging = -height;
        if (linedef.left) {
            if (type === 'lower' && (flags & 0x0010)) {
                // unpegged so subtract higher floor from ceiling to get real offset
                // NOTE: we use skyheight (if available) instead of zCeil because of the blue wall switch in E3M6.
                pegging -= (skyHeight ?? $zCeilR) - Math.max($zFloorL, $zFloorR);
            } else if (type === 'upper' && !(flags & 0x0008)) {
                pegging = 0;
            } else if (type === 'middle') {
                // two-sided segs with a middle texture need alpha test
                material.alphaTest = 1;
            }
        } else if (flags & 0x0010) {
            // peg to floor (bottom left)
            pegging = 0;
        }
        material.map.offset.x = $xOffset * texture2.userData.invWidth;
        material.map.offset.y = doubleSidedMiddle ? 0 : ((-$yOffset + pegging) * texture2.userData.invHeight);
    }
    $: if ($light !== undefined) {
        const col = textures.lightColor(fakeContrastValue + $light + $extraLight);
        material.color = $useTextures ? col : new Color(namedColor(linedef.num)).lerp(col, .5);
    }

    $: if ($editor.selected === linedef) {
        material.emissive = new Color('magenta');
        material.emissiveIntensity = 0.1;
    } else {
        material.emissiveIntensity = 0;
    }

    $: if (skyHack) {
        material.map = null;
        material.colorWrite = false;
        material.depthWrite = true;
    }

    function lineStroke() {
        return !linedef.left ? wad.palettes[0][176] :
            (linedef.left.sector.zFloor !== linedef.right.sector.zFloor) ? wad.palettes[0][64] :
            (linedef.left.sector.zCeil !== linedef.right.sector.zCeil) ?  wad.palettes[0][231] :
            wad.palettes[0][96];
    }

    function hit(ev) {
        ev.stopPropagation();
        $editor.selected = linedef;
    }
</script>

{#if !$useTextures || texture2 || skyHack || linedef.transparentWindowHack || $editor.active}
    <T.Mesh
        userData={{ type: 'wall' }}
        visible={visible}
        on:click={hit}
        renderOrder={skyHack ? 0 : 1}
        position.x={mid.x}
        position.y={mid.y}
        position.z={top - height * .5}
        rotation.x={HALF_PI}
        rotation.z={angle}
        rotation.order={'ZXY'}
        scale.x={width}
        scale.y={height}
        {geometry}
        {material}
    >
        <Wireframe />
    </T.Mesh>
{/if}
