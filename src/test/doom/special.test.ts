import * as fs from 'fs';
import * as path from 'path';
import { DoomWad, Game, type MapObject, MapObjectIndex, MapRuntime, MFFlags, SoundIndex, mobjStateMachine, ticksPerSecond, tickTime, WadFile } from "../../doom";
import { createDefaultSettings } from '../../render/DoomContext';
import { expect } from 'chai';

// probably need a "helper" library
const waitTime = (game: Game, ticks = 1) =>
    // add just a little time to make sure we process all tics and don't get bitten by a rounding error
    game.tick(tickTime * ticks + .000001);
const waitUntil = (game: Game, fn: () => boolean) => {
    let ticks = 0;
    while (!fn() && ticks < 1000) {
        waitTime(game);
        ticks += 1;
    }
    return ticks;
}

const initGame = (wadName: string, mapName: string) => {
    const buff = fs.readFileSync(path.join(process.env.WADROOT, wadName));
    const wad = new DoomWad(wadName, [new WadFile(wadName, buff.buffer)]);
    const settings = createDefaultSettings();
    settings.monsterAI.set('disabled');
    const game = new Game(wad, 4, settings);
    game.maxTimeDeltaSeconds = 20;
    const map = game.startMap(mapName);
    return { game, map };
}

// These tests are not great unit tests. If one fails, several tests after amy fail depending on what parts of the
// map they are touching. Still, it give me some confidence to refactor specials
describe('linedef specials (E1M2)', () => {
    let monster: MapObject;
    let game: Game;
    let map: MapRuntime;
    before(() => {
        let testGame = initGame('doom.wad', 'E1M2');
        game = testGame.game;
        map = testGame.map;
        monster = [...map.objs.values()].find(e => e.isMonster);
    });

    describe('platform', () => {
        it('special 88 lowers platform and raises after 105 tic delay', () => {
            const sec = map.data.sectors.find(e => e.num === 109);
            expect(sec.zFloor).to.equal(192);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 289), map.player, 'W', 1);
            // nit: it would be cool to write expect(sec.zFloor).to.equal(64).after.ticks(32) (or something like that)
            waitTime(game, 32);
            expect(sec.zFloor).to.equal(64);

            // platform goes back up
            waitTime(game, 105 + 32 + 1);
            expect(sec.zFloor).to.equal(192);
            waitTime(game);
            expect(sec.specialData).to.be.null;
        });

        it('special 62 activated by switch lowers, raises, then re-lowers when blocked', () => {
            const sec = map.data.sectors.find(e => e.num === 137);
            expect(sec.zFloor).to.equal(248);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 178), map.player, 'S', 1);
            waitTime(game, 64);
            expect(sec.zFloor).to.equal(0);
            // put monster onto lift
            monster.position.set(-1536, 1664, 0);
            monster.applyPositionChanged();

            // lift goes up, is blocked, and goes back down
            waitTime(game, 105 + 60);
            expect(sec.zFloor).to.equal(48);
            waitTime(game, 12);
            expect(sec.zFloor).to.equal(0);
        });

        it('platforms play start and stop sounds at top and bottom', () => {
            let sounds = [];
            const sec = map.data.sectors.find(e => e.num === 109);
            game.onSound((snd, position) => position === sec ? sounds.push(snd) : null);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 289), map.player, 'W', 1);
            waitTime(game, 32);

            // platform goes back up
            waitTime(game, 105 + 32 + 1 + 1);
            expect(sounds).to.have.ordered.members([
                SoundIndex.sfx_pstart, SoundIndex.sfx_pstop,
                SoundIndex.sfx_pstart, SoundIndex.sfx_pstop,
            ]);
        });

        it('special 89 stops platforms', () => {
            let { game, map } = initGame('doom.wad', 'E2M2');
            const sec = map.data.sectors.find(e => e.num === 61);

            expect(sec.zFloor).to.equal(0);
            map.triggerSpecial(map.data.linedefs.find(e => e.num === 1515), map.player, 'W', 1);
            waitTime(game, 10);
            const zFloorCapture = sec.zFloor;
            expect(zFloorCapture).to.be.lessThan(0);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 1549), map.player, 'W', 1);
            waitTime(game, 10);
            expect(sec.zFloor).to.be.equal(zFloorCapture);
        });
    });

    describe('door', () => {
        it('special 1 opens door to 4 less than ceiling, then closes after 150 tic delay', () => {
            const sec = map.data.sectors.find(e => e.num === 26);
            expect(sec.zCeil).to.equal(24);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 329), map.player, 'P', 1);
            waitTime(game, 62);
            expect(sec.specialData).to.not.be.null;
            expect(sec.zCeil).to.equal(148);

            waitTime(game, 150 + 62 + 1);
            expect(sec.zCeil).to.equal(24);
            waitTime(game);
            expect(sec.specialData).to.be.null;
        });

        it('trigger opening door and it will start to close', () => {
            const sec = map.data.sectors.find(e => e.num === 26);
            expect(sec.zCeil).to.equal(24);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 329), map.player, 'P', 1);
            waitTime(game, 10);
            expect(sec.zCeil).to.equal(44);
            map.triggerSpecial(map.data.linedefs.find(e => e.num === 329), map.player, 'P', 1);

            waitTime(game);
            expect(sec.zCeil).to.equal(42);
        });

        it('monsters do not close doors that are opening', () => {
            const sec = map.data.sectors.find(e => e.num === 78);
            expect(sec.zCeil).to.equal(24);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 325), map.player, 'P', 1);
            waitTime(game, 10);
            expect(sec.zCeil).to.equal(44);
            const trig = map.triggerSpecial(map.data.linedefs.find(e => e.num === 325), monster, 'P', 1);

            waitTime(game);
            expect(trig).to.not.be.null;
            expect(sec.zCeil).to.equal(46);
        });

        it('plays open sound for closed doors and closing sound after wait', () => {
            let sounds = [];
            const sec = map.data.sectors.find(e => e.num === 55);
            game.onSound((snd, position) => position === sec ? sounds.push(snd) : null);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 854), map.player, 'P', 1);
            waitTime(game, 36 + 150);

            expect(sounds).to.have.ordered.members([SoundIndex.sfx_doropn, SoundIndex.sfx_dorcls]);
        });

        it('door re-opens when it hits something', () => {
            const sec = map.data.sectors.find(e => e.num === 116);
            map.triggerSpecial(map.data.linedefs.find(e => e.num === 378), map.player, 'P', 1);
            waitTime(game, 36 + 150);
            monster.position.set(312, 288, 24);
            monster.applyPositionChanged();

            waitTime(game, 16);
            expect(sec.zCeil).to.equal(92);
        });

        it('door crunches weapons and dead things', () => {
            // door is already open from the test above
            // kill the monster and drop a chaingun for testing
            monster.damage(monster.health.val);
            const mobj = map.spawn(MapObjectIndex.MT_CHAINGUN, monster.position.x, monster.position.y);
            mobj.info.flags |= MFFlags.MF_DROPPED;

            // wait for the door to crush things
            let removed = [];
            map.events.on('mobj-removed', mo => removed.push(mo.id));
            waitTime(game, 36 + 150);

            expect(removed).to.include(mobj.id);
            expect(mobjStateMachine.sprite(monster).name).to.equal('POL5');
        });
        // TODO: door states: openwaitclose, openstay, etc.
        // TODO: A Close and Stay Closed will rest on the head until it leaves the door sector.
    });

    it('special 9 applies the "donut" effect', () => {
        const ring = map.data.sectors.find(e => e.num === 175);
        const hole = map.data.sectors.find(e => e.num === 176);

        map.triggerSpecial(map.data.linedefs.find(e => e.num === 604), map.player, 'S', 1);
        let tic1 = waitUntil(game, () => ring.zFloor === 128);
        expect(tic1).to.be.equal(48);
        let tic2 = waitUntil(game, () => hole.zFloor === 128);
        expect(tic2).to.be.equal(208 - tic1);

        expect(ring.floorFlat).to.equal('FLOOR5_3');
        expect(hole.floorFlat).to.equal('FLOOR4_8');
    });

    describe('lighting effects', () => {
        it('sector type 8 fades in and out', () => {
            const max = 255 - 8; // not 255 because glow never reaches max or min
            const sec = map.data.sectors.find(e => e.num == 105);
            // reset from previous tests
            waitTime(game, 2);
            waitUntil(game, () => sec.light === max);

            waitTime(game, 2);
            expect(sec.light).to.equal(max - 8);

            let ticks = waitUntil(game, () => sec.light === max);
            // time to go to 112 and back to max
            expect(ticks).to.be.equal(Math.floor((max - 112) / 8) * 2);
        });

        it('sector type 3 strobes to full bright for 5 tics then dark for one second', () => {
            const max = 255;
            const sec = map.data.sectors.find(e => e.num == 87);
            // reset from previous tests
            waitUntil(game, () => sec.light === max)
            waitUntil(game, () => sec.light !== max);
            let tics = waitUntil(game, () => sec.light === max);
            expect(tics).to.be.equal(35);

            tics = waitUntil(game, () => sec.light !== max);
            expect(tics).to.be.equal(5);
        });

        it('sector type 1 flickers randomly', () => {
            const max = 255;
            const sec = map.data.sectors.find(e => e.num == 37);
            // reset from previous tests
            waitUntil(game, () => sec.light === max)
            let tics = waitUntil(game, () => sec.light !== max);
            expect(tics).to.be.greaterThanOrEqual(1).and.lessThanOrEqual(64);

            tics = waitUntil(game, () => sec.light === max);
            expect(tics).to.be.greaterThanOrEqual(1).and.lessThanOrEqual(7);
        });
    });
});

describe('linedef specials (E2M2)', () => {
    let game: Game;
    let map: MapRuntime;
    before(() => {
        let testGame = initGame('doom.wad', 'E2M2');
        game = testGame.game;
        map = testGame.map;
    });

    describe('crushers', () => {
        it('special 77 lowers to floor+8 and back to original height', () => {
            const sec = map.data.sectors.find(e => e.num === 2);
            expect(sec.zCeil).to.equal(136);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 1564), map.player, 'W', 1);
            waitTime(game, 32);
            expect(sec.zCeil).to.equal(64 + 8);

            // goes back up (need an extra tick because doom platforms pause for one tick when they reach destination)
            waitTime(game);
            waitTime(game, 32);
            expect(sec.zCeil).to.equal(136);

            // clear special
            map.actions.delete(sec.specialData);
            sec.specialData = null;
            waitTime(game);
        });

        it('special 73 lowers at slower speed and goes even slower when hitting an object', () => {
            const sec = map.data.sectors.find(e => e.num === 2);
            expect(sec.zCeil).to.equal(136);

            map.triggerSpecial(map.data.linedefs.find(e => e.num === 1606), map.player, 'W', 1);
            waitTime(game, 32);
            expect(sec.zCeil).to.equal(104);

            // move player into crusher
            game.settings.invicibility.set(true);
            map.player.position.set(352, -320, 64);
            map.player.applyPositionChanged();

            // and check we've only moved 1/8 as fast as before (we moved 1 unit per tick before so now we only move 5 total)
            // the +1 is because the first tick crushes but does not slow down until next tick
            waitTime(game, 32 + 1);
            expect(sec.zCeil).to.equal(99);
        });

        it('damages mobjs (every 4th tick)', () => {
            map.player.position.set(352, -320, 64);
            map.player.applyPositionChanged();
            game.settings.invicibility.set(false);
            let health = map.player.health.val;

            waitTime(game, 4);
            expect(map.player.health.val + 10).to.equal(health);
            game.settings.invicibility.set(true);
        });

        it('plays sounds every 8 tics during move and at stops', () => {
            let sounds = [];
            const sec = map.data.sectors.find(e => e.num === 2);
            game.onSound((snd, position) => position === sec ? sounds.push(snd) : null);

            let tics = waitUntil(game, () => sec.zCeil === 72);
            waitTime(game); // wait an extra tick to get the stop sound because reversing crushers takes 1 tic
            expect(sounds).to.have.ordered.members([
                ...Array(Math.floor(tics / 8)).fill(SoundIndex.sfx_stnmov),
                SoundIndex.sfx_pstop,
            ]);
        });

        // it might be nice to have a stop and resume test
    });

    it('special 20 raises floor to nearest neightbour and plays move and stop sounds', () => {
        let sounds = [];
        const sec = map.data.sectors.find(e => e.num === 1);
        game.onSound((snd, position) => position === sec ? sounds.push(snd) : null);
        map.triggerSpecial(map.data.linedefs.find(e => e.num === 1336), map.player, 'S', 1);

        let tics = waitUntil(game, () => sec.zFloor === 64);
        waitTime(game); // wait an extra tick to get the stop sound

        expect(sec.floorFlat).to.equal('FLOOR3_3');
        expect(sounds).to.have.ordered.members([
            ...Array(Math.floor(tics / 8)).fill(SoundIndex.sfx_stnmov),
            SoundIndex.sfx_pstop,
        ]);
    });
});

describe('stair builders (various maps/wads)', () => {
    it('special 8 builds stairs', () => {
        const { game, map } = initGame('doom.wad', 'E2M2');
        const steps = map.data.sectors.filter(e => e.num >= 93 && e.num <= 98);
        expect(steps.map(e => e.zFloor)).to.have.members([0, 0, 0, 0, 0, 0]);

        map.triggerSpecial(map.data.linedefs.find(e => e.num === 638), map.player, 'W', 1);
        let ticks = waitUntil(game, () => steps[5].zFloor === 48)
        expect(ticks).to.equal(48 / .25); // height change over speed
    });

    it('TNT MAP30: special 7 builds stairs (quirky)', () => {
        const { game, map } = initGame('tnt.wad', 'MAP30');
        const steps = map.data.sectors.filter(e => (e.num >= 325 && e.num <= 335) || (e.num >= 244 && e.num <= 250));
        const lastStep = steps.find(e => e.num === 249);
        expect(steps.map(e => e.zFloor)).to.have.members(Array(steps.length).fill(-128));

        map.triggerSpecial(map.data.linedefs.find(e => e.num === 2018), map.player, 'S', 1);
        let ticks = waitUntil(game, () => lastStep.zFloor === 64)
        expect(ticks).to.equal(192 / .25); // height change over speed
    });
});

it('repeatable switches revert texture and play sound 1s after press', () => {
    let { game, map } = initGame('doom.wad', 'E1M1');
    const line = map.data.linedefs.find(e => e.num === 136);
    expect(line.right.lower).to.equal('SW1COMP');

    const trig = map.triggerSpecial(line, map.player, 'S');
    expect(trig.repeatable).to.be.true;
    expect(line.right.lower).to.equal('SW2COMP');

    let ticks = waitUntil(game, () => line.right.lower === 'SW1COMP');
    expect(ticks).to.equal(ticksPerSecond);
});