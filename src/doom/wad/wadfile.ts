export type Lump = { name: string, data: Uint8Array };
export class WadFile {
    lumps: Lump[];
    type: string;
    size: number;

    constructor(readonly name: string, buffer: ArrayBuffer) {
        const buff = new Uint8Array(buffer);
        this.size = buff.byteLength;
        this.type = String.fromCharCode(buff[0], buff[1], buff[2], buff[3]);
        const numLumps = dword(buff, 4);
        const directoryLocation = dword(buff, 8);

        this.lumps = new Array(numLumps);
        for (let i = 0; i < numLumps; i++) {
            const offset = dword(buff, 0 + directoryLocation + i * 16);
            const size   = dword(buff, 4 + directoryLocation + i * 16);
            const name = lumpString(buff, 8 + directoryLocation + i * 16, 8);
            const lump = { name, data: buff.subarray(offset, offset + size) };
            this.lumps[i] = lump;
        }
    }

    lumpByName(name: string) {
        return this.lumps.find(e => e.name === name);
    }
}

export function pnamesLump(lump: Lump) {
    if (!lump) {
        return [];
    }

    const numPatches = dword(lump.data, 0);
    const names = new Array<string>(numPatches);
    for (let i = 0; i < numPatches; i++) {
        names[i] = lumpString(lump.data, 4 + i * 8, 8);
    }
    return names;
}

interface Patch {
    originX: number;
    originY: number;
    patchId: number;
}
export interface Texture {
    name: string;
    masked: boolean;
    width: number;
    height: number;
    patches: Patch[];
}
export function textureLump(lump: Lump) {
    if (!lump) {
        return [];
    }
    const numTextures = dword(lump.data, 0);

    const offsets = new Array(numTextures);
    for (let i = 0; i < numTextures; i++) {
        offsets[i] = dword(lump.data, 4 + i * 4);
    }

    const textures = new Array<Texture>(numTextures);
    for (let i = 0; i < numTextures; i++) {
        const name = lumpString(lump.data, 0x00 + offsets[i], 8);
        const masked = dword(lump.data, 0x08 + offsets[i]) > 0;
        const width = word(lump.data, 0x0C + offsets[i]);
        const height = word(lump.data, 0x0E + offsets[i]);

        const patchCount = word(lump.data, 0x14 + offsets[i]);
        const patches = new Array<Patch>(patchCount);
        for (let j = 0; j < patchCount; j++) {
            const originX = int16(word(lump.data, 0x16 + offsets[i] + 10 * j));
            const originY = int16(word(lump.data, 0x18 + offsets[i] + 10 * j));
            const patchId = word(lump.data, 0x1A + offsets[i] + 10 * j);
            patches[j] = { originX, originY, patchId };
        }

        textures[i] = { name, masked, width, height, patches };
    }
    return textures;
}

const fixLumpName = (name: string) => {
    const uname = name.toUpperCase();
    for (let i = 0; i < uname.length; i++) {
        const charCode = uname.charCodeAt(i);
        if (charCode > 127 || charCode < 32) {
            return uname.substring(0, i);
        }
    }
    return uname;
}

export const lumpString = (buff: Uint8Array, offset: number, length: number) =>
    fixLumpName(String.fromCharCode(...buff.subarray(offset, offset + length)));

// Nifty little hack! https://stackoverflow.com/questions/50179214
export const int16 = (num: number) => (num << 16) >> 16;
export const word = (buff: Uint8Array, offset: number) => buff[offset + 1] << 8 | buff[offset];
export const dword = (buff: Uint8Array, offset: number) => word(buff, offset + 2) << 16 | word(buff, offset);
