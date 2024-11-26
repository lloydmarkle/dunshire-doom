import { DataTexture, FloatType, NearestFilter, RGBAIntegerFormat, ShortType } from "three";
import { DoomWad, SpriteNames, states, type Picture } from "../../../doom";
import { findNearestPower2, findPacking } from "../TextureAtlas";

export class SpriteSheet {
    readonly uvIndex: DataTexture;
    readonly spriteInfo: DataTexture;
    readonly sheet: DataTexture;

    constructor(wad: DoomWad, maxSize: number) {
        const sprites = SpriteNames.map(sprite => wad.spriteFrames(sprite).flat().flat().map(f => ({ ...f, sprite }))).flat();

        const sz = findNearestPower2(Math.sqrt(sprites.length));
        const tAtlas = new DataTexture(new Float32Array(sz * sz * 4), sz, sz);
        tAtlas.type = FloatType;
        this.uvIndex = tAtlas;

        const tSpriteInfo = new DataTexture(new Int16Array(sz * sz * 4), sz, sz);
        tSpriteInfo.type = ShortType;
        tSpriteInfo.format = RGBAIntegerFormat;
        tSpriteInfo.internalFormat = 'RGBA16I';
        tSpriteInfo.magFilter = tSpriteInfo.minFilter = NearestFilter;
        tSpriteInfo.generateMipmaps = false;
        this.spriteInfo = tSpriteInfo;
        const storeSpriteInfo = (n: number, gfx: Picture, frame: { mirror: boolean, rotation: number }) => {
            this.spriteInfo.image.data[0 + n * 4] = gfx.xOffset;
            this.spriteInfo.image.data[1 + n * 4] = gfx.yOffset;
            this.spriteInfo.image.data[2 + n * 4] = frame.mirror ? -1 : 1;
            this.spriteInfo.image.data[3 + n * 4] = frame.rotation;
        }

        let spriteFrames = {};
        const indexFrame = (n: number, frame: { sprite : string, rotation: number, frame: number }) => {
            let frames = spriteFrames[frame.sprite] ?? [];
            if (frame.rotation === 0 || frame.rotation === 1) {
                frames[frame.frame] = n;
            }
            spriteFrames[frame.sprite] = frames;
        }

        let textures: [number, Picture][] = [];
        let spriteGfx = new Map<string, number>();
        for (let idx = 0; idx < sprites.length; idx++) {
            const frame = sprites[idx];
            indexFrame(idx, frame);

            let orig = spriteGfx.get(frame.name);
            if (orig) {
                // we've already got this frame so it's probably mirrored, don't insert it into the texture
                // but write a meta entry below to retrieve it
                continue;
            }

            // insert image
            const gfx = wad.spriteTextureData(frame.name);
            textures.push([idx, gfx]);
            spriteGfx.set(frame.name, idx);
        }
        this.uvIndex.needsUpdate = true;
        this.spriteInfo.needsUpdate = true;

        const { tSize, packing, texture } = findPacking(textures, maxSize);
        this.sheet = texture;

        for (const tx of packing) {
            tx.pic.toAtlasBuffer(texture.image.data, tSize, tx.x, tx.y);

            tAtlas.image.data[0 + tx.idx * 4] = tx.x / tSize;
            tAtlas.image.data[1 + tx.idx * 4] = tx.y / tSize;
            tAtlas.image.data[2 + tx.idx * 4] = (tx.x + tx.pic.width) / tSize;
            tAtlas.image.data[3 + tx.idx * 4] = (tx.y + tx.pic.height) / tSize;
        }

        for (let idx = 0; idx < sprites.length; idx++) {
            const frame = sprites[idx];
            const gfx = wad.spriteTextureData(frame.name);
            storeSpriteInfo(idx, gfx, frame);
            let orig = spriteGfx.get(frame.name);
            if (orig) {
                // copy uv coordinates of existing texture
                tAtlas.image.data[0 + idx * 4] = tAtlas.image.data[0 + orig * 4];
                tAtlas.image.data[1 + idx * 4] = tAtlas.image.data[1 + orig * 4];
                tAtlas.image.data[2 + idx * 4] = tAtlas.image.data[2 + orig * 4];
                tAtlas.image.data[3 + idx * 4] = tAtlas.image.data[3 + orig * 4];
            }
        }

        // assign State.spriteIndex:
        for (const state of states) {
            if (spriteFrames[SpriteNames[state.sprite]]) {
                state.spriteIndex = spriteFrames[SpriteNames[state.sprite]][state.frame & 0x7fff];
            }
        }
    }
}
