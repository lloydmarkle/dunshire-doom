import { performance, PerformanceObserver } from 'perf_hooks';
import { memoryUsage } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Test Params:
const params = {
    wadNames: [
        'doom2',
        'oversaturationrc1',
        // 'nuts',
    ],
    mapName: 'MAP01',
    warmupSeconds: 2,
    timeIntervalMS: 1 / 35, // DOOM runs at 35fps
    testReps: 10,
    testDurationSeconds: 2,
};

// neat little hack https://stackoverflow.com/a/75007985
import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
import { DoomWad, Game, MapRuntime, store, WadFile } from '../doom';
import { createAppContext } from '../render/DoomContext';
setFlagsFromString('--expose_gc');
const megabyte = 1024 * 1024;

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
        // const wadStore = new WadStore();
        // const wadResolvers = wadNames.map(name => wadStore.fetchWad(name).then(buff => new WadFile(name, buff)));
        // const wads = await Promise.all(wadResolvers);
        const wads = params.wadNames.map(wad => {
            const buff = fs.readFileSync(path.join(process.env.WADROOT, wad + '.wad'))
            return new WadFile(wad, buff);
        })
        const wad = new DoomWad(params.wadNames.join('+'), wads);
        // TODO: we use some browser APIs here but if we can separate those a little better, we can save some code here
        // const settings = createAppContext().settings;
        const settings: any = {
            timescale: store(1),
            freelook: store(false),
            skipInitialSpawn: store(false),
            xyAimAssist: store(false),
            zAimAssist: store(false),
            noclip: store(false),
            alwaysRun: store(false),
            freeFly: store(false),
            maxLostSouls: store(0),
            randomNumbers: store('table'),
            monsterAI: store('enabled'),
            shotTraceSeconds: store(0),
            compassMove: store(false),
            invicibility: store(false),
            cameraMode: store('1p'),
        }
        const game = new Game(wad, 4, settings);
        game.startMap(new MapRuntime(params.mapName, game));
        // let the game idle for a few seconds before measuring
        while (game.time.elapsed < params.warmupSeconds) {
            game.tick(params.timeIntervalMS);
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
            const mstart = memoryUsage.rss();
            const tstart = performance.now();
            const endTime = tstart + params.testDurationSeconds * 1000;
            while (performance.now() < endTime) {
                game.tick(params.timeIntervalMS);
                ticks[i] += 1;
            }
            memory.push((memoryUsage.rss() - mstart) / megabyte);
            process.stdout.write('.')
        }
        obs.disconnect();
        console.log('params', params);
        console.log('raw', memory, ticks, gcEntries);
        console.log('ticks', stats(ticks));
        console.log('mem', stats(memory));
    }).timeout(100_000);
});