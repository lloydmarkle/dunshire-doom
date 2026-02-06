import type { Color, TypedArray } from "three";
import { dword, int16, word } from "./wadfile";

export type Palette = Color[];

export interface Picture {
    readonly xOffset: number;
    readonly yOffset: number;
    readonly width: number;
    readonly height: number;

    toBuffer(buffer: TypedArray): void;
    toAtlasBuffer(buffer: TypedArray, width: number, x: number, y: number): void;
}

export class FlatPicture implements Picture {
    readonly xOffset = 0;
    readonly yOffset = 0;
    readonly width = 64;
    readonly height = 64;

    constructor(private lump: Uint8Array, readonly palette: Palette) {}

    toBuffer(buffer: TypedArray) {
        const size = this.width * this.height;
        for (let i = 0; i < size; i++) {
            let col = this.palette[this.lump[i]];
            buffer[i * 4 + 0] = col.r;
            buffer[i * 4 + 1] = col.g;
            buffer[i * 4 + 2] = col.b;
            buffer[i * 4 + 3] = 255;
        }
    }

    toAtlasBuffer(buffer: TypedArray, width: number, ax: number, ay: number) {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                let col = this.palette[this.lump[y * this.width + x]];
                // NB: we y-flip flat textures for the texture atlas (NOT wall textures though)
                const n = (ay + (this.height - y - 1)) * width + x + ax;
                buffer[n * 4 + 0] = col.r;
                buffer[n * 4 + 1] = col.g;
                buffer[n * 4 + 2] = col.b;
                buffer[n * 4 + 3] = 255;
            }
        }
    }
}

export class LumpPicture implements Picture {
    readonly xOffset: number;
    readonly yOffset: number;
    readonly width: number;
    readonly height: number;

    constructor(private lump: Uint8Array, readonly palette: Palette) {
        this.width = word(this.lump, 0);
        this.height = word(this.lump, 2);
        this.xOffset = int16(word(this.lump, 4));
        this.yOffset = int16(word(this.lump, 6));
        if (this.lump.length !== 4096 && (this.width > 2048 || this.height > 2048)) {
            console.warn('bad pic?', lump, this.width, this.height)
        }
    }

    toAtlasBuffer(buffer: TypedArray, width: number, ax: number, ay: number) {
        this.pixels((col, x, y) => {
            let i = 4 * ((ay + y) * width + x + ax);
            buffer[i + 0] = col.r;
            buffer[i + 1] = col.g;
            buffer[i + 2] = col.b;
            buffer[i + 3] = 255;
        });
    }

    toBuffer(buffer: TypedArray): void {
        this.pixels((col, x, y) => {
            let i = 4 * (y * this.width + x);
            buffer[i + 0] = col.r;
            buffer[i + 1] = col.g;
            buffer[i + 2] = col.b;
            buffer[i + 3] = 255;
        });
    }

    applyPatch(buff: TypedArray, width: number, height: number, originX: number, originY: number) {
        this.pixels((col, x, y) => {
            const tx = originX + x;
            const ty = originY + y;
            if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
                return;
            }
            const idx = 4 * (ty * width + tx);
            buff[idx + 0] = col.r;
            buff[idx + 1] = col.g;
            buff[idx + 2] = col.b;
            buff[idx + 3] = 255;
        });
    }

    applyPatchAtlas(buff: TypedArray, aWidth: number, ax: number, ay: number, width: number, height: number, originX: number, originY: number) {
        this.pixels((col, x, y) => {
            const tx = originX + x;
            const ty = originY + y;
            if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
                return;
            }
            const idx = 4 * ((ty + ay) * aWidth + tx + ax);
            buff[idx + 0] = col.r;
            buff[idx + 1] = col.g;
            buff[idx + 2] = col.b;
            buff[idx + 3] = 255;
        });
    }

    private pixels(fn: (col: Color, x: number, y: number) => void) {
        // Based on the "Converting from a doom picture" of https://doomwiki.org/wiki/Picture_format
        for (let x = 0; x < this.width; x++) {
            let seek = dword(this.lump, 8 + x * 4);

            let topOffset = 0;
            for (let rowStart = this.lump[seek]; rowStart !== undefined && rowStart !== 255; rowStart = this.lump[seek]) {
                // tall patch support https://doomwiki.org/wiki/Picture_format#Tall_patches
                topOffset = (rowStart <= topOffset) ? topOffset + rowStart : rowStart;

                let pixelCount = this.lump[seek + 1];
                seek += 3; // 2 + 1 dummy byte
                for (let y = 0; y < pixelCount; y++) {
                    fn(this.palette[this.lump[seek]], x, y + topOffset);
                    seek += 1;
                }
                seek += 1; // dummy byte
            }
        }
    }
}

interface Patch {
    pic: LumpPicture;
    originX: number;
    originY: number;
}

export class PatchPicture implements Picture {
    readonly xOffset = 0;
    readonly yOffset = 0;

    constructor(
        readonly width: number,
        readonly height: number,
        private patches: Patch[]) {}

    toAtlasBuffer(buffer: TypedArray, width: number, x: number, y: number) {
        for (const patch of this.patches) {
            patch.pic.applyPatchAtlas(buffer, width, x, y, this.width, this.height, patch.originX, patch.originY);
        }
    }

    toBuffer(buffer: TypedArray): void {
        for (const patch of this.patches) {
            patch.pic.applyPatch(buffer, this.width, this.height, patch.originX, patch.originY);
        }
    }
}
