import { performance, PerformanceObserver } from 'perf_hooks';
import { memoryUsage } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Test Params:
const params = {
    wadNames: [
        'doom2',
        'oversaturationrc1',
        'sunder 2407',
        // 'cosmogenesis',
        // 'nuts',
    ],
    mapName: 'MAP08',
    warmupSeconds: 2,
    timeIntervalSeconds: 1 / 35, // DOOM runs at 35fps
    testReps: 10,
    testDurationSeconds: 2,
};

// neat little hack https://stackoverflow.com/a/75007985
import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
import { DoomWad, Game, WadFile } from '../doom';
import { createDefaultSettings } from '../render/DoomContext';
setFlagsFromString('--expose_gc');
const megabyte = 1024 * 1024;

if (!process.env.WADROOT) {
    console.error('Missing env variable WADROOT')
    process.exit(1);
}

// https://stackoverflow.com/questions/7343890
const stats = (arr: number[], usePopulation = false) => {
    const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
    const standardDeviation= Math.sqrt(
        arr.reduce((acc, val) => acc.concat((val - mean) ** 2), [])
            .reduce((acc, val) => acc + val, 0) / (arr.length - (usePopulation ? 0 : 1))
    );
    return { mean, standardDeviation };
};

describe('perf', () => {
    it('benchmark', async () => {
        const wads = params.wadNames.map(wad => {
            const buff = fs.readFileSync(path.join(process.env.WADROOT, wad + '.wad'))
            return new WadFile(wad, buff);
        })
        const wad = new DoomWad(params.wadNames.join('+'), wads);
        const settings = createDefaultSettings();
        // FIXME: The test score goes nuts if we leave this false but... why?
        settings.moveChecksZ.set(true);
        const game = new Game(wad, 4, settings);
        game.startMap(params.mapName);
        // fire a shot to wakeup enemies
        game.input.attack = true;
        // let the game idle for a few seconds before measuring
        while (game.time.elapsed < params.warmupSeconds) {
            game.tick(params.timeIntervalSeconds);
        }

        let gcEntries = [];
        const obs = new PerformanceObserver((list) => {
            gcEntries = gcEntries.concat(list.getEntries()[0]);
        });
        obs.observe({ entryTypes: ['gc'] });
        const memory = [];
        const ticks = new Array(params.testReps).fill(0);

        // simulate several ticks of the game several times to calculate some averages
        for (let i = 0; i < params.testReps; i++) {
            runInNewContext('gc')();
            const tStart = Math.trunc(game.time.tick.val);
            const mStart = memoryUsage().heapUsed;
            const endTime = performance.now() + params.testDurationSeconds * 1000;
            while (performance.now() < endTime) {
                game.tick(params.timeIntervalSeconds);
            }
            ticks[i] = Math.trunc(game.time.tick.val) - tStart;
            memory.push((memoryUsage().heapUsed - mStart) / megabyte);
            process.stdout.write('.')
        }
        obs.disconnect();
        console.log('params', params);
        console.log('raw', memory, ticks, gcEntries);
        console.log('ticks', stats(ticks));
        console.log('mem', stats(memory));
    }).timeout(100_000);
});