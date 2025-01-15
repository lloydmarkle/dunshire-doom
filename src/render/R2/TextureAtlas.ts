import { DataTexture, FloatType, NearestFilter, RepeatWrapping, SRGBColorSpace } from "three";
import type { DoomWad, Picture } from "../../doom";


export function findNearestPower2(n: number) {
    let t = 1;
    while (t < n) {
        t *= 2;
    }
    return t;
}

export class TextureAtlas {
    private _index: DataTexture;
    get index() { return this._index; };
    private _texture: DataTexture;
    get texture() { return this._texture; };
    private textures: [number, Picture][] = [];
    private count = 0;

    constructor(private maxSize: number) {}

    insertTexture(pic: Picture): [number, Picture] {
        if (!pic) {
            // this means a flat/wall has a texture that isn't in the wad. It shouldn't happen and yet...
            // I've seen it in at least idumea. Instead of failing, just return the first texture as a placeholder
            // (there is already a console.warning() about it
            return this.textures[0];
        }
        let item: [number, Picture] = [this.count++, pic];
        this.textures.push(item);
        return item;
    }

    // actually builds the texture atlas and index
    commit() {
        const size = findNearestPower2(this.textures.length);
        const tAtlas = new DataTexture(new Float32Array((size * size) * 4), size, size);
        tAtlas.type = FloatType;
        tAtlas.needsUpdate = true;
        this._index = tAtlas;

        const { tSize, packing, texture } = findPacking(this.textures, this.maxSize);
        this._texture = texture;

        for (const tx of packing) {
            tx.pic.toAtlasBuffer(this.texture.image.data, tSize, tx.x, tx.y);

            this.index.image.data[0 + tx.idx * 4] = tx.x / tSize;
            this.index.image.data[1 + tx.idx * 4] = tx.y / tSize;
            this.index.image.data[2 + tx.idx * 4] = (tx.x + tx.pic.width) / tSize;
            this.index.image.data[3 + tx.idx * 4] = (tx.y + tx.pic.height) / tSize;
        }
    }
}

export function findPacking(textures: [number, Picture][], maxSize: number) {
    // My iPhone XR says max texture size is 16K but if I do that, the webview uses 1GB of RAM and immediately crashes.
    // 8K is still 256MB RAM but apparently it's okay so have a hard coded limit here
    for (const tSize of [1024, 2048, 4096, 8192]) {
        if (tSize > maxSize) {
            break;
        }
        const packing = packTextures(textures, tSize);
        if (!packing) {
            continue;
        }

        const texture = new DataTexture(new Uint8ClampedArray(tSize * tSize * 4).fill(0), tSize, tSize);
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.magFilter = texture.minFilter = NearestFilter;
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
        return { tSize, packing, texture };
    }
    throw new Error(`cannot build texture atlas with ${[maxSize, textures.length]}`);
}

// Cool background I found while trying to improve this: https://www.david-colson.com/2020/03/10/exploring-rect-packing.html
// My function is similar to the "row splitter" with a few extra heuristics for splitting rows
type RowEdge = { x: number, y: number, rowHeight: number };
type PackInfo = { idx: number, pic: Picture, x: number, y: number };
function packTextures(textures: [number, Picture][], maxSize: number) {
    let rows: RowEdge[] = [{ x: 0, y: 0, rowHeight: maxSize }];
    const findSpace = (pic: Picture): RowEdge => {
        const perfectMatch = rows.find(row => row.rowHeight === pic.height && row.x + pic.width < maxSize);
        if (perfectMatch) {
            return perfectMatch;
        }

        const noSplit = rows.find(row => pic.height < row.rowHeight && pic.height / row.rowHeight > .5 && row.x + pic.width < maxSize);
        if (noSplit) {
            return noSplit;
        }

        const smallFit = rows.find(row => pic.height < row.rowHeight && pic.height / row.rowHeight <= .5 && row.x + pic.width < maxSize);
        if (smallFit) {
            // split the row so insert a new row with the remainder of the space
            rows.push({ x: smallFit.x, y: smallFit.y + pic.height, rowHeight: smallFit.rowHeight - pic.height });
            // and change the row height to match the picture we're inserting
            smallFit.rowHeight = pic.height;
            return smallFit;
        }

        const end = rows[rows.length - 1];
        if (end.rowHeight >= pic.height) {
            // split
            rows.push({ x: end.x, y: end.y + pic.height, rowHeight: end.rowHeight - pic.height });
            end.rowHeight = pic.height;
            return end;
        }
        // no space!
        return null;
    }

    const imgArea = (pic: Picture) => pic.width * pic.height;

    let result: PackInfo[] = [];
    const sortedTx = [...textures].sort((a, b) => imgArea(b[1]) - imgArea(a[1]));
    for (const [idx, pic] of sortedTx) {
        let row = findSpace(pic);
        if (!row) {
            return null;
        }
        result.push({ pic, idx, x: row.x, y: row.y });
        row.x += pic.width;
    }

    return result;
}

export class TransparentWindowTexture implements Picture {
    static TextureName = '$WHITE';
    readonly xOffset = 0;
    readonly yOffset = 0;
    readonly width = 1;
    readonly height = 1;

    toBuffer(buffer: Uint8ClampedArray): void {
        buffer[0] = buffer[1] = buffer[2] = 255;
        buffer[3] = 25;
    }

    toAtlasBuffer(buffer: Uint8ClampedArray, width: number, ax: number, ay: number): void {
        let i = 4 * (ay * width + ax);
        buffer[i + 0] = buffer[i + 1] = buffer[i + 2] = 255;
        buffer[i + 3] = 25;
    }
}

export class MapTextureAtlas {
    index: DataTexture;
    texture: DataTexture;
    private textures = new Map<string, [number, Picture]>();
    private flats = new Map<string, [number, Picture]>();

    constructor(private wad: DoomWad, private atlas: TextureAtlas) {
        const data = this.atlas.insertTexture(new TransparentWindowTexture());
        this.textures.set(TransparentWindowTexture.TextureName, data);
    }

    commit() {
        this.atlas.commit();
        this.index = this.atlas.index;
        this.texture = this.atlas.texture;
    }

    // animations cause jank after map load as the different frames are loaded into the atlas.
    // So we store the texture names that are part of animations and if one is loaded, we load the rest
    wallTexture(name: string): [number, Picture] {
        let data = this.textures.get(name);
        if (!data) {
            const pic = this.wad.wallTextureData(name);
            data = this.atlas.insertTexture(pic);
            this.textures.set(name, data);

            if (this.wad.animatedWalls.has(name)) {
                // load the rest of the animation frames
                for (const frame of this.wad.animatedWalls.get(name).frames) {
                    if (frame === name) {
                        continue;
                    }
                    const pic = this.wad.wallTextureData(frame);
                    this.textures.set(frame, this.atlas.insertTexture(pic));
                }
            }

            const toggle = this.wad.switchToggle(name);
            if (toggle) {
                const pic = this.wad.wallTextureData(toggle);
                this.textures.set(toggle, this.atlas.insertTexture(pic));
            }
        }
        return data;
    }

    flatTexture(name: string): [number, Picture] {
        let data = this.flats.get(name);
        if (!data) {
            const pic = this.wad.flatTextureData(name);
            data = this.atlas.insertTexture(pic);
            this.flats.set(name, data);

            if (this.wad.animatedFlats.has(name)) {
                // load the rest of the animation frames
                for (const frame of this.wad.animatedFlats.get(name).frames) {
                    if (frame === name) {
                        continue;
                    }
                    const pic = this.wad.flatTextureData(frame);
                    this.flats.set(frame, this.atlas.insertTexture(pic));
                }
            }
        }
        return data;
    }
}