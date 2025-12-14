import { type Picture, type Palette, PatchPicture, LumpPicture, FlatPicture } from './picture.ts';
import { Color } from 'three';
import { dword, int16, lumpString, pnamesLump, textureLump, word, type Lump, type Texture, type WadFile } from './wadfile.ts';
import { SoundIndex } from '../doom-things-info.ts';

interface SpriteFrame {
    name: string;
    mirror: boolean;
    frame: number;
    rotation: number;
}

const doomSharewareSoundLumps = ["DSPISTOL", "DSSHOTGN", "DSSGCOCK", "DSSAWUP", "DSSAWIDL", "DSSAWFUL", "DSSAWHIT", "DSRLAUNC", "DSRXPLOD", "DSFIRSHT", "DSFIRXPL", "DSPSTART", "DSPSTOP", "DSDOROPN", "DSDORCLS", "DSSTNMOV", "DSSWTCHN", "DSSWTCHX", "DSPLPAIN", "DSDMPAIN", "DSPOPAIN", "DSSLOP", "DSITEMUP", "DSWPNUP", "DSOOF", "DSTELEPT", "DSPOSIT1", "DSPOSIT2", "DSPOSIT3", "DSBGSIT1", "DSBGSIT2", "DSSGTSIT", "DSBRSSIT", "DSSGTATK", "DSCLAW", "DSPLDETH", "DSPDIEHI", "DSPODTH1", "DSPODTH2", "DSPODTH3", "DSBGDTH1", "DSBGDTH2", "DSSGTDTH", "DSBRSDTH", "DSPOSACT", "DSBGACT", "DSDMACT", "DSNOWAY", "DSBAREXP", "DSPUNCH", "DSTINK", "DSBDOPN", "DSBDCLS", "DSITMBK", "DSGETPOW"];
const doom1SoundLumps = [...doomSharewareSoundLumps, "DSPLASMA", "DSBFG", "DSCACSIT", "DSCYBSIT", "DSSPISIT", "DSSKLATK", "DSCACDTH", "DSSKLDTH", "DSCYBDTH", "DSSPIDTH", "DSHOOF", "DSMETAL"];
const doom2SoundLumps = Object.keys(SoundIndex).slice(Object.keys(SoundIndex).length / 2)
    .filter(snd => snd !== 'sfx_None' && snd !== 'sfx_chgun')
    .map(snd => 'DS' + snd.toUpperCase().split('_')[1])

type TextureAnimation = { frames: string[], speed: number };
type WallTexture = { lump: Texture, pnames: string[] };
export class DoomWad {
    private spriteFrameTable = new Map<string, SpriteFrame[][]>();
    readonly palettes: Palette[] = [];
    private textureData: WallTexture[] = [];
    private flatLumps: Lump[] = [];
    private spriteLumps: Lump[] = [];
    readonly mapLumps = new Map<string, Lump[]>();

    private switchWalls: string[][];
    readonly animatedFlats = new Map<string, TextureAnimation>();
    readonly animatedWalls = new Map<string, TextureAnimation>();

    get mapNames() { return [...this.mapLumps.keys()]; }
    get isIWAD() {
        // Checking for the presence of all sounds (and at least some textures, maps, and certain other lumps)
        // is good. It's not perfect but there isn't really a perfect iwad detection scheme
        // - https://doomwiki.org/wiki/IWAD.
        // - https://www.doomworld.com/forum/topic/106963-reliable-iwad-detection-method/
        const soundLumps =
            // It's a "full" DOOM 1 wad
            this.wads[0].lumpByName('E2M1') ? doom1SoundLumps :
            // Maybe a shareware DOOM 1 wad?
            this.wads[0].lumpByName('E1M1') ? doomSharewareSoundLumps :
            // if it's DOOM2 (or similar), we need to check for all sounds
            doom2SoundLumps;

        return Boolean(
            this.wads.length === 1 && soundLumps.every(name => this.wads[0].lumpByName(name))
            && this.textureData.length && this.spriteLumps.length && this.flatLumps.length
            && this.palettes.length && this.animatedFlats.size && this.animatedWalls.size && this.switchWalls.length
            && this.mapNames.length && this.lumpByName('ENDOOM') && this.lumpByName('COLORMAP'));
    }

    constructor(readonly name: string, private wads: WadFile[]) {
        // use maps so that the last wad wins
        const textures = new Map<string, WallTexture>();
        const sprites = new Map<string, Lump>();
        const flats = new Map<string, Lump>();
        const patches = new Set<string>();
        for (const wad of wads) {
            const pnames = pnamesLump(wad.lumpByName('PNAMES'));
            pnames.forEach(name => patches.add(name));

            const texture1 = textureLump(wad.lumpByName('TEXTURE1'));
            const texture2 = textureLump(wad.lumpByName('TEXTURE2'));
            [...texture1, ...texture2].forEach(lump => textures.set(lump.name, { lump, pnames }));

            const sStartIndex = wad.lumps.findIndex(e => e.name === 'S_START' || e.name === 'SS_START');
            const sEndIndex = wad.lumps.findIndex(e => e.name === 'S_END' || e.name === 'SS_END');
            for (let i = sStartIndex; i < sEndIndex; i++) {
                if (!wad.lumps[i].name.endsWith('_START') && !wad.lumps[i].name.endsWith('_END')) {
                    sprites.set(wad.lumps[i].name, wad.lumps[i]);
                }
            }

            const fStartIndex = wad.lumps.findIndex(e => e.name === 'F_START' || e.name === 'FF_START');
            const fEndIndex = wad.lumps.findIndex(e => e.name === 'F_END' || e.name === 'FF_END');
            for (let i = fStartIndex; i < fEndIndex; i++) {
                if (!wad.lumps[i].name.endsWith('_START') && !wad.lumps[i].name.endsWith('_END')) {
                    flats.set(wad.lumps[i].name, wad.lumps[i]);
                }
            }

            for (let i = 0; i < wad.lumps.length; i++) {
                if (isMap(wad.lumps[i])) {
                    this.mapLumps.set(wad.lumps[i].name, wad.lumps.slice(i, i + 11));
                }
            }
        }

        this.textureData = [...textures.values()];
        this.spriteLumps = [...sprites.values()];
        this.flatLumps = [...flats.values()];

        // https://doomwiki.org/wiki/PLAYPAL
        const playpal = this.lumpByName('PLAYPAL');
        if (playpal) {
            for (let i = 0; i < 14; i++) {
                const palette = [];
                for (let j = 0; j < 256; j++) {
                    const r = playpal.data[i * 768 + j * 3 + 0];
                    const g = playpal.data[i * 768 + j * 3 + 1];
                    const b = playpal.data[i * 768 + j * 3 + 2];
                    palette.push(new Color(r, g, b));
                }
                this.palettes.push(palette);
            }
        }

        const customAnimations = loadCustomAnimations(this.optionalLump('ANIMATED'));
        // list of animated flats https://doomwiki.org/wiki/Animated_flat
        const allFlats = this.flatsNames();
        [
            { first: 'NUKAGE1', last: 'NUKAGE3' },
            { first: 'FWATER1', last: 'FWATER4' },
            { first: 'SWATER1', last: 'SWATER4' },
            { first: 'LAVA1', last: 'LAVA4' },
            { first: 'BLOOD1', last: 'BLOOD3' },
            { first: 'RROCK05', last: 'RROCK08' },
            { first: 'SLIME01', last: 'SLIME04' },
            { first: 'SLIME05', last: 'SLIME08' },
            { first: 'SLIME09', last: 'SLIME12' },
            ...customAnimations.filter(anim => anim.isFlat),
        ].map(e => {
            const first = allFlats.indexOf(e.first);
            const last = allFlats.indexOf(e.last);
            return { frames: allFlats.slice(first, last + 1), speed: e['speed'] ?? 8 };
        }).filter(e => e.frames.length)
        .forEach(anim => anim.frames.forEach(frame => this.animatedFlats.set(frame, anim)));

        // list of animated walls https://doomwiki.org/wiki/Animated_wall
        const allTextures = this.texturesNames();
        [
            { first: 'BLODGR1', last: 'BLODGR4' },
            { first: 'BLODRIP1', last: 'BLODRIP4' },
            { first: 'FIREBLU1', last: 'FIREBLU2' },
            { first: 'FIRELAV3', last: 'FIRELAVA' },
            { first: 'FIREMAG1', last: 'FIREMAG3' },
            { first: 'FIREWALA', last: 'FIREWALL' },
            { first: 'GSTFONT1', last: 'GSTFONT3' },
            { first: 'ROCKRED1', last: 'ROCKRED3' },
            { first: 'SLADRIP1', last: 'SLADRIP3' },
            { first: 'BFALL1', last: 'BFALL4' },
            { first: 'SFALL1', last: 'SFALL4' },
            { first: 'WFALL1', last: 'WFALL4' },
            { first: 'DBRAIN1', last: 'DBRAIN4' },
            ...customAnimations.filter(anim => anim.isWall),
        ].map(e => {
            const first = allTextures.indexOf(e.first);
            const last = allTextures.indexOf(e.last);
            return { frames: allTextures.slice(first, last + 1), speed: e['speed'] ?? 8 };
        }).filter(e => e.frames.length)
        .forEach(anim => anim.frames.forEach(frame => this.animatedWalls.set(frame, anim)));

        const customSwitches = loadCustomSwitches(this.optionalLump('SWITCHES'));
        this.switchWalls = [
            // Built in wall switches https://doomwiki.org/wiki/Switch
            ['SW1BRCOM', 'SW2BRCOM'],
            ['SW1BRN1', 'SW2BRN1'],
            ['SW1BRN2', 'SW2BRN2'],
            ['SW1BRNGN', 'SW2BRNGN'],
            ['SW1BROWN', 'SW2BROWN'],
            ['SW1COMM', 'SW2COMM'],
            ['SW1COMP', 'SW2COMP'],
            ['SW1DIRT', 'SW2DIRT'],
            ['SW1EXIT', 'SW2EXIT'],
            ['SW1GRAY', 'SW2GRAY'],
            ['SW1GRAY1', 'SW2GRAY1'],
            ['SW1METAL', 'SW2METAL'],
            ['SW1PIPE', 'SW2PIPE'],
            ['SW1SLAD', 'SW2SLAD'],
            ['SW1STARG', 'SW2STARG'],
            ['SW1STON1', 'SW2STON1'],
            ['SW1STON2', 'SW2STON2'],
            ['SW1STONE', 'SW2STONE'],
            ['SW1STRTN', 'SW2STRTN'],
            ['SW1BLUE', 'SW2BLUE'],
            ['SW1CMT', 'SW2CMT'],
            ['SW1GARG', 'SW2GARG'],
            ['SW1GSTON', 'SW2GSTON'],
            ['SW1HOT', 'SW2HOT'],
            ['SW1LION', 'SW2LION'],
            ['SW1SATYR', 'SW2SATYR'],
            ['SW1SKIN', 'SW2SKIN'],
            ['SW1VINE', 'SW2VINE'],
            ['SW1WOOD', 'SW2WOOD'],
            ['SW1PANEL', 'SW2PANEL'],
            ['SW1ROCK', 'SW2ROCK'],
            ['SW1MET2', 'SW2MET2'],
            ['SW1WDMET', 'SW2WDMET'],
            ['SW1BRIK', 'SW2BRIK'],
            ['SW1MOD1', 'SW2MOD1'],
            ['SW1ZIM', 'SW2ZIM'],
            ['SW1STON6', 'SW2STON6'],
            ['SW1TEK', 'SW2TEK'],
            ['SW1MARB', 'SW2MARB'],
            ['SW1SKULL', 'SW2SKULL'],
            ...customSwitches,
        ].map(e => {
            const i1 = allTextures.indexOf(e[0]);
            const i2 = allTextures.indexOf(e[1]);
            return i1 === -1 || i2 === -1 ? null : e;
        }).filter(e => e);
    }

    switchToggle(name: string): string | undefined {
        for (const [sw1, sw2] of this.switchWalls) {
            if (sw1 === name) {
                return sw2;
            }
            if (sw2 === name) {
                return sw1;
            }
        }
    }

    texturesNames(): string[] {
        return this.textureData.map(e => e.lump.name);
    }

    flatsNames(): string[] {
        return this.flatLumps.map(lump => lump.name);
    }

    wallTextureData(name: string) {
        if (!name) {
            return null;
        }
        const uname = name.toUpperCase();
        // use patches first because sometimes flats and patches have the same name
        // https://doomwiki.org/wiki/Flat_and_texture_mixing
        // a better approach would be to use F_START/P_START markers

        // try a texture from patches first
        const texture = this.textureData.find(e => e.lump.name === uname);
        if (texture) {
            const { width, height, patches } = texture.lump;
            const pics = patches.map(({ patchId, originX, originY }) => {
                const pname = texture.pnames[patchId];
                const pic = this.graphic(pname) as LumpPicture;
                if (!pic) {
                    console.warn('invalid patch', patchId, pname)
                    return null;
                }
                return { pic, originX, originY };
            }).filter(e => e);
            return new PatchPicture(width, height, pics);
        }

        // not patch, try to load as a graphic
        const pic = this.graphic(uname);
        if (pic) {
            return pic;
        }
        console.warn('missing texture:' + uname)
        return null;
    }

    spriteFrames(name: string): SpriteFrame[][] {
        const uname = name.toUpperCase();
        if (this.spriteFrameTable.has(uname)) {
            return this.spriteFrameTable.get(uname)
        }

        // reverse because we prioritize sprites from the last wad loaded
        const sprites = this.spriteLumps.filter(lump => lump.name.startsWith(uname)).reverse();
        const frames: SpriteFrame[] = [];
        for (const lump of sprites) {
            const spriteName = lump.name;
            let frame = spriteName.charCodeAt(4) - 65;
            let rotation = spriteName.charCodeAt(5) - 48;

            if (frames.find(fr => fr.frame === frame && fr.rotation === rotation)) {
                // already have a sprite for this rotation and frame so ignore it
                continue;
            }

            frames.push({ frame, rotation, name: spriteName, mirror: false });
            if (rotation === 0) {
                continue;
            }

            if (spriteName.length === 8) {
                let frame = spriteName.charCodeAt(6) - 65;
                let rotation = spriteName.charCodeAt(7) - 48;
                frames.push({ frame, rotation, name: spriteName, mirror: true });
            }
        }

        const result: SpriteFrame[][] = [];
        for (const frame of frames.map(e => e.frame)) {
            result[frame] = frames.filter(e => e.frame === frame).sort((a, b) => a.rotation - b.rotation);
        }
        this.spriteFrameTable.set(uname, result);
        return result;
    }

    spriteTextureData(name: string): Picture {
        const uname = name.toUpperCase();
        const lump = this.spriteLumps.find(lump => lump.name === uname);
        if (lump) {
            return new LumpPicture(lump.data, this.palettes[0]);
        }
        console.warn('missing sprite:' + uname)
        return null;
    }

    flatTextureData(name: string): Picture {
        const uname = name.toUpperCase();
        const lump = this.flatLumps.find(lump => lump.name === uname);
        if (lump) {
            return new FlatPicture(lump.data, this.palettes[0]);
        }
        console.warn('missing flat:' + uname)
        return null;
    }

    graphic(name: string): Picture {
        // Some DOOM WADs have PNGs so... should we load those too?
        const uname = name.toUpperCase();
        const lump = this.lumpByName(uname);
        if (!lump) {
            return null;
        }
        return new LumpPicture(lump.data, this.palettes[0]);
    }

    lumpByName(name: string) {
        const lump = this.optionalLump(name);
        if (!lump) {
            console.warn('unknown lump', name);
        }
        return lump;
    }

    optionalLump(name: string) {
        // go from last wad to first because the last wad lump wins
        for (let i = this.wads.length - 1; i >= 0; i--) {
            const lump = this.wads[i].lumpByName(name);
            if (lump) {
                return lump;
            }
        }
        return null;
    }
}

const isMap = (item: Lump) =>
    /^MAP\d\d$/.test(item.name) ||
    /^E\dM\d$/.test(item.name);

function loadCustomAnimations(lump: Lump) {
    // custom animations https://doomwiki.org/wiki/ANIMATED
    type AnimInfo = { first: string, last: string, speed: number, isWall: boolean, isFlat: boolean, supportsDecals: boolean };
    const customAnimations: AnimInfo[] = [];
    let offset = 0;
    while (lump && lump.data[offset] < 255) {
        customAnimations.push({
            last: lumpString(lump.data, offset + 1, 9),
            first: lumpString(lump.data, offset + 10, 9),
            // TODO: speed over 64K is a warping texture, do we care?
            speed: dword(lump.data, offset + 19),
            isFlat: lump.data[offset] === 0,
            isWall: lump.data[offset] !== 0,
            // not used but.. maybe someday?
            supportsDecals: lump.data[offset] === 3,
        });
        offset += 23;
    }
    return customAnimations;
}

function loadCustomSwitches(lump: Lump) {
    // custom switches https://doomwiki.org/wiki/SWITCHES
    const customSwitches: string[][] = [];
    let offset = 0;
    while (lump && int16(word(lump.data, offset + 18))) {
        customSwitches.push([
            lumpString(lump.data, offset + 0, 9),
            lumpString(lump.data, offset + 9, 9),
        ]);
        offset += 20;
    }
    return customSwitches;
}