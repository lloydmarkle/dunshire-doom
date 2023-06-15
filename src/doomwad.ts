//
// Heavily adapted from https://github.com/jmickle66666666/wad-js/blob/develop/src/wad/mapdata.js
//

import KaitaiStream from 'kaitai-struct/KaitaiStream';
import DoomWadRaw from './doom-wad.ksy.js';

type ThingType = number;

interface Thing {
    x: number;
    y: number;
    angle: number;
    type: ThingType;
    flags: number;
}

export interface LineDef {
    v1: Vertex;
    v2: Vertex;
    flags: number;
    action: number;
    tag: number;
    right?: SideDef;
    left?: SideDef;
}
const toLineDef = (ld: any, vertexes: Vertex[], sidedefs: SideDef[]): LineDef => ({
    v1: vertexes[ld.vertexStartIdx],
    v2: vertexes[ld.vertexEndIdx],
    left: sidedefs[ld.sidedefLeftIdx],
    right: sidedefs[ld.sidedefRightIdx],
    tag: ld.sectorTag,
    action: ld.lineType,
    flags: ld.flags,
});

interface SideDef {
    xOffset: number;
    yOffset: number;
    sector: Sector;
    upper: string;
    lower: string;
    middle: string;
}
const toSideDef = (sd: any, sectors: Sector[]): SideDef => ({
    xOffset: sd.offsetX,
    yOffset: sd.offsetY,
    sector: sectors[sd.sectorId],
    lower: sd.lowerTextureName,
    middle: sd.middleTextureName,
    upper: sd.upperTextureName,
});

interface Vertex {
    x: number;
    y: number;
}

interface Seg {
    vx1: Vertex;
    vx2: Vertex;
    angle: number;
    linedef: LineDef;
    direction: number;
    offset: number;
}

export interface Sector {
    zFloor: number;
    zCeil: number;
    floortFlat: string;
    ceilFlat: string;
    light: number;
    type: number;
    tag: number;
}
const toSector = (sd: any): Sector => ({
    zFloor: sd.floorZ,
    floortFlat: sd.floortFlat,
    zCeil: sd.ceilZ,
    ceilFlat: sd.ceilFlat,
    light: sd.light,
    type: sd.specialType,
    tag: sd.tag,
});

interface SubSector {
    segCount: number;
    first: Seg;
}

interface Node {
    partitionX: number;
    partitionY: number;
    changeX: number;
    changeY: number;
    boundsRight: number;
    boundsLeft: number;
    childRight: number;
    childLeft: number;
}

export interface DoomMap {
    name: string;
    things: Thing[];
    linedefs: LineDef[];
    sidedefs: SideDef[];
    vertexes: Vertex[];
    sectors: Sector[];
    subsectors: SubSector[];
    segs: Seg[];
    nodes: Node[];
}

type RGB = string;
type Palette = RGB[];

export class DoomWad {
    palettes: Palette[] = [];
    maps: DoomMap[] = [];
    raw: any;

    constructor(wad: ArrayBuffer) {
        const data = new DoomWadRaw(new KaitaiStream(wad), null, null);
        this.raw = data.index;

        // https://doomwiki.org/wiki/PLAYPAL
        const playpal = data.index.find(p => p.name === 'PLAYPAL');
        if (playpal) {
            for (let i = 0; i < 14; i++) {
                const palette = [];
                for (let j = 0; j < 256; j++) {
                    const r = playpal.contents[i * 768 + j * 3 + 0];
                    const g = playpal.contents[i * 768 + j * 3 + 1];
                    const b = playpal.contents[i * 768 + j * 3 + 2];
                    palette.push("#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
                }
                this.palettes.push(palette);
            }
        }

        for (let i = 0; i < data.index.length; i++) {
            if (isMap(data.index[i])) {
                this.maps.push(createMap(data.index, i));
            }
        }
    }
}
// 7
const createMap = (items, index): DoomMap => {
    const name = items[index].name;

    const things = items[index + 1].contents.entries;
    const sectors = items[index + 8].contents.entries.map(s => toSector(s));
    const vertexes = items[index + 4].contents.entries;
    const sidedefs = items[index + 3].contents.entries.map(sd => toSideDef(sd, sectors));
    const linedefs = items[index + 2].contents.entries.map(ld => toLineDef(ld, vertexes, sidedefs));
    const subsectors = [];
    const segs = [];
    const nodes = [];

    return { name, things, linedefs, sidedefs, vertexes, sectors, subsectors, segs, nodes };
}

const isMap = (item) => (
    /^MAP\d\d$/.test(item.name) ||
    /^E\dM\d$/.test(item.name)
);