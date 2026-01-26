import * as fs from 'fs';
import * as path from 'path';
import { DoomWad, Game, type MapObject, MapObjectIndex, MapRuntime, MFFlags, SoundIndex, tickTime, WadFile } from "../../doom";
import { createDefaultSettings } from '../../render/DoomContext';
import { expect } from 'chai';

// probably need a "helper" library
const waitTime = (game: Game, ticks = 1) =>
    // add just a little time to make sure we process all tics and don't get bitten by a rounding error
    game.tick(tickTime * ticks + .000001);

describe('linedef specials', () => {
    let monster: MapObject;
    let game: Game;
    let map: MapRuntime;
    before(() => {
        // DOOM 1
        const wadName = 'doom.wad';
        const mapName = 'E1M2';
        const buff = fs.readFileSync(path.join(process.env.WADROOT, wadName));
        const wad = new DoomWad(wadName, [new WadFile(wadName, buff.buffer)]);
        const settings = createDefaultSettings();
        settings.monsterAI.set('disabled');
        game = new Game(wad, 4, settings);
        game.maxTimeDeltaSeconds = 20;
        map = game.startMap(mapName);

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

        // TODO: hit something?
        // TODO: sounds?
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
            expect(monster.sprite.val.name).to.equal('POL5');
        });
        // TODO: door states: openwaitclose, openstay, etc.
        // TODO: A Close and Stay Closed will rest on the head until it leaves the door sector.
    });
});