import * as fs from 'node:fs';
import * as path from 'node:path';
import { DoomWad, MapData, WadFile } from '../doom';

// Searches for a special in the given set of wads and quits when found
console.time = () => {};
console.timeEnd = () => {};
const params = {
    special: 141,
    // special: [0x3000, 0x3400],
    wadNames: [
        'doom', 'doom2',
        // 'tnt', 'plutonia',
        // 'freedoom1' ,'freedoom2',
        // 'SIGIL_v1_21', 'SIGIL_II_V1_0',
        // 'SODfinal',
        // 'CChest2',
        // 'EARTH',
        // 'SCYTHE',
        // 'MSCP_v1a',
        // 'AV',
        // 'aaliens_v1_2',
        // 'sunlust',
        // 'cosmogenesis', 'oversaturationrc1',
        // 'sunder 2510',
    ]
}

describe('map scanning', () => {
    it(`find-special ${params.special}`, async () => {
        const special = Array.isArray(params.special) ? params.special : [params.special, params.special + 1]
        for (const wadName of params.wadNames) {
            const buff = fs.readFileSync(path.join(process.env.WADROOT, wadName + '.wad'))
            const wad = new DoomWad(wadName, [new WadFile(wadName, buff.buffer)]);

            for (const map of wad.mapNames) {
                console.log('w',wadName,map)
                const md = new MapData(wad.mapLumps.get(map));
                const lds = md.linedefs.filter(ld => ld.special >= special[0] && ld.special < special[1]);
                if (lds.length) {
                    console.log('found', wadName, map, lds.map(ld => [ld.num, ld.special, ld.flags, JSON.stringify(ld.v)]));
                    // return;
                }
            }
        }
    }).timeout(60_000);
});