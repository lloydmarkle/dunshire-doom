import { Color } from "three";
import { store, DoomWad, WadFile } from "./doom";

export const defaultPalette =
    [0, 2037515, 1511175, 4934475, 16777215, 1776411, 1250067, 723723, 460551, 3094303, 2304783, 1515271, 988928, 5192491, 4666147, 4139803, 16758711, 16231339, 15967139, 15439767, 15175567, 14649223, 14383995, 13857651, 13331307, 13067107, 12540763, 12277591, 11751247, 11487047, 10960703, 10697531, 10171187, 9908015, 9382699, 9118499, 8593183, 8330011, 7804695, 7541523, 7016207, 6753035, 6227719, 5965575, 5441287, 5177344, 4653056, 4390912, 16772063, 16770003, 16767943, 16765883, 16764851, 16762791, 16760731, 16759699, 16757635, 16231291, 15704947, 15178603, 14652259, 14125915, 13599571, 13336399, 12548939, 11760455, 11235139, 10709823, 10183483, 9396023, 8869683, 8344367, 7819051, 7030567, 6243107, 5455647, 4929307, 4140823, 3353363, 2827023, 15724527, 15198183, 14671839, 14408667, 13882323, 13355979, 13092807, 12566463, 12040119, 11776947, 11250603, 10987431, 10461087, 9934743, 9671571, 9145227, 8618883, 8355711, 7829367, 7303023, 7039851, 6513507, 5987163, 5723991, 5197647, 4671303, 4408131, 3881787, 3618615, 3092271, 2565927, 2302755, 7864175, 7335783, 6807391, 6278999, 6012751, 5484359, 4955967, 4428599, 4162351, 3633963, 3105571, 2577179, 2048791, 1520399, 1254155, 726791, 12560271, 12033927, 11507583, 10981239, 10454895, 10190699, 9665379, 9139035, 8612695, 8086351, 7823179, 7296835, 6771519, 6245175, 5718835, 5455663, 10453859, 9402195, 8612683, 7823167, 6771507, 5981995, 5192483, 4403995, 8093539, 7304023, 6777679, 5989191, 5461819, 4673331, 4146987, 3620647, 16777075, 15457111, 14138179, 12819247, 11500319, 10181395, 8864519, 7547648, 16777215, 16767963, 16759739, 16751515, 16743291, 16736095, 16727871, 16719647, 16711680, 15663104, 14876672, 14090240, 13303808, 12517376, 11730944, 10944512, 10158080, 9109504, 8323072, 7536640, 6750208, 5963776, 5177344, 4390912, 15198207, 13092863, 11250687, 9408511, 7566335, 5460991, 3618815, 1776639, 255, 227, 203, 179, 155, 131, 107, 83, 16777215, 16772059, 16766907, 16762779, 16757627, 16753499, 16748347, 16744219, 15954711, 15429391, 14640911, 14114571, 13326087, 12799744, 12011264, 11485952, 16777215, 16777175, 16777139, 16777103, 16777067, 16777031, 16776995, 16776960, 10960640, 10434304, 9645824, 8856320, 5192487, 4402971, 3613459, 3087115, 83, 71, 59, 47, 35, 23, 11, 0, 16752451, 16770891, 16743423, 16711935, 13566159, 10420379, 7274603, 10972011]
    .map(c => new Color((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff))

export interface WADInfo {
    name: string;
    image: string;
    iwad: boolean;
    episodicMaps: boolean;
    mapCount: number;
    flatCount: number;
    textureCount: number;
    // TODO: add these?
    // spriteCount: number;
    // soundCount: number;
    // musicCount: number;
}

export class WadStore {
    wads = store([] as WADInfo[]);

    ready: Promise<void>;
    private db: IDBDatabase;

    constructor() {
        const dbRequest = indexedDB.open('doom-db', 6);
        this.ready = new Promise((resolve, reject) => {
            // TODO: What do we do here? dbRequest.onerror = () => ...
            dbRequest.onupgradeneeded = ev => {
                this.db = (ev.target as any).result;
                // separate tables because we want to have info about the wad without actually keeping the wad in memory
                if (!this.db.objectStoreNames.contains('wad-info')) {
                    this.db.createObjectStore('wad-info', { keyPath: 'name' });
                }
                if (!this.db.objectStoreNames.contains('wads')) {
                    this.db.createObjectStore('wads', { keyPath: 'name' });
                }
                resolve();
            };
            dbRequest.onsuccess = ev => {
                this.db = (ev.target as any).result;
                this.updateWadList();
                resolve();
            };
            dbRequest.onerror = reject;
        });
    }

    async fetchWad(name: string): Promise<ArrayBuffer> {
        await this.ready;
        const req = this.db.transaction('wads', 'readonly')
            .objectStore('wads')
            .get(name);
        return new Promise((resolve, reject) => {
            req.onerror = reject;
            req.onsuccess = ev => {
                const record = (ev.target as any).result;
                if (!record) {
                    return reject(new Error('wad not found: ' + name));
                }
                resolve(record.buff);
            };
        });
    }

    saveWad(name: string, buff: ArrayBuffer) {
        name = name.toLowerCase();
        name = name.endsWith('.wad') ? name.slice(0, -4) : name;

        // TODO: what if buff is not actually a doom wad?
        const wad = new DoomWad(name, [new WadFile(name, buff)]);
        // we can't load TITLEPIC if the wad doesn't have a palette so supply a default one (extracted from FreeDoom2)
        if (wad.palettes.length === 0) {
            wad.palettes.push(defaultPalette);
        }

        const info: WADInfo = {
            name,
            image: imageDataUrl(wad, 'TITLEPIC'),
            iwad: wad.isIWAD,
            episodicMaps: wad.mapNames.find(name => name.startsWith('E')) !== undefined,
            mapCount: wad.mapNames.length,
            flatCount: wad.flatsNames.length,
            textureCount: wad.texturesNames.length,
        };

        const tr = this.db.transaction(['wad-info', 'wads'], 'readwrite');
        tr.objectStore('wads').put({ name, buff });
        tr.objectStore('wad-info').put(info);
        // TODO: tr.onerror = () => ...
        tr.oncomplete = () => this.updateWadList();
        return info;
    }

    removeWad(name: string) {
        const tr = this.db.transaction(['wad-info', 'wads'], 'readwrite');
        tr.objectStore('wads').delete(name);
        tr.objectStore('wad-info').delete(name);
        // TODO: tr.onerror = () => ...
        tr.oncomplete = () => this.updateWadList();
    }

    private updateWadList() {
        const req = this.db.transaction('wad-info', 'readonly')
            .objectStore('wad-info')
            .getAll();
        // TODO: req.onerror = () => ...
        req.onsuccess = ev => {
            const data: WADInfo[] = (ev.target as any).result;
            this.wads.set(data.sort((a, b) => a.name.localeCompare(b.name)));
        }
    }
}

function imageDataUrl(wad: DoomWad, name: string) {
    const px = wad.graphic(name);
    if (!px) {
        return null;
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = px.width;
        canvas.height = px.height;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(canvas.width, canvas.height);
        px.toBuffer(img.data);
        ctx.putImageData(img, 0, 0);
        return canvas.toDataURL('image/jpeg');
    } catch {
        // interestingly, some wads contain TITLEPIC but not playpal which means we have images but no palette.
        // We could supply a default palette but for the purpose of the table of wads, it doesn't seem worth it
        return null;
    }
}
