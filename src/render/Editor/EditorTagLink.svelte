<script lang="ts">
    import { T } from "@threlte/core";
    import type { LineDef, MapRuntime, Sector } from "../../doom";
    import { useAppContext, useDoomMap } from "../DoomContext";
    import { BoxGeometry, BufferGeometry, Color, LineBasicMaterial, MeshBasicMaterial, Vector3 } from "three";

    export let map: MapRuntime;

    const { editor } = useAppContext();
    const { renderSectors } = useDoomMap();

    const mapHeight = map.data.sectors.reduce((top, sec) => Math.max(sec.zCeil, top), -Infinity);
    const lineMaterial = new MeshBasicMaterial({ depthTest: false, color: 'cyan' });
    const sectorMaterial = new MeshBasicMaterial({ depthTest: false, color: 'magenta' });

    $: tag = ($editor.selected && 'tag' in $editor.selected && $editor.selected.tag > 0) ? $editor.selected.tag : null;
    $: linedefs = (!tag ? [] : map.data.linedefs.filter(e => e.tag === tag)) as LineDef[];
    $: sectors = (!tag ? [] : map.data.sectors.filter(e => e.tag === tag)) as Sector[];

    function position(item: LineDef | Sector) {
        const pos = new Vector3();
        if (!item) {
            return pos;
        }

        if ('zFloor' in item) {
            const rsecs = renderSectors.filter(e => e.sector === item);
            const vec = new Vector3();
            const verts = rsecs.map(e => {
                e.geometry.computeBoundingBox()
                e.geometry.boundingBox.getCenter(vec);
                return vec.clone();
            });
            verts.forEach(v => {
                pos.x += v.x;
                pos.y += v.y;
            });
            pos.x /= verts.length;
            pos.y /= verts.length;
            pos.z = (rsecs[0].sector.zCeil + rsecs[0].sector.zFloor) / 2;
        } else {
            pos.x = (item.v[0].x + item.v[1].x) / 2;
            pos.y = (item.v[0].y + item.v[1].y) / 2;
            pos.z = (item.right.sector.zCeil + item.right.sector.zFloor) / 2;
        }
        return pos;
    }
    const boxSize = 24;
</script>

{#each sectors ?? [] as sector}
    {@const sectorPosition = position(sector)}
    <T.Mesh
        renderOrder={2}
        material={sectorMaterial}
        position={[...sectorPosition]}
        geometry={new BoxGeometry(boxSize, boxSize, boxSize)}
    />

    {#each linedefs ?? [] as linedef}
        {@const linedefPosition = position(linedef)}
        <T.Mesh
            renderOrder={2}
            material={lineMaterial}
            position={[...linedefPosition]}
            geometry={new BoxGeometry(boxSize, boxSize, boxSize)}
        />

        <T.Line
            args={[new BufferGeometry().setFromPoints([
                linedefPosition,
                new Vector3().copy(linedefPosition).setZ(mapHeight),
                new Vector3().copy(sectorPosition).setZ(mapHeight),
                sectorPosition,
            ]),
            new LineBasicMaterial({ depthTest: false, color: Color.NAMES.cyan })]}
            renderOrder={2}
        />
    {/each}
{/each}