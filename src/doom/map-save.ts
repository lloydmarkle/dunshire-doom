import type { LineDef, Sector } from "./map-data";
import { MapObject, stopVelocity } from "./map-object";
import type { MapRuntime } from "./map-runtime";
import { tickTime } from "./math";
import { inventoryWeapon, thingSpec } from "./things";

export type MapExport = ReturnType<typeof exportMap>;

export const exportMap = (map: MapRuntime) => {
    // TODO: for v2, a more advanced save would also save sound state (what sounds were playing and their progress...)
    // TODO: for v2, a lot of data is numbers and numbers are inefficient to store in json. Binary would be nicer

    const mobjs = new Map(map.objs.values().map((v, i) => [v, i]));
    const actionState = [...map.actions].filter(e => typeof e !== 'function');
    const mobjState = (mobj: MapObject) => ({
        type: mobj.type,
        direction: mobj.direction,
        position: mobj.position,
        ...(mobj.velocity.lengthSq() > stopVelocity && { velocity: mobj.velocity }),
        // Many values come directly from type so only save them if they are not default values
        ...(mobj.health.val !== (mobj as any).spec.mo.spawnhealth && { health: mobj.health.val }),
        ...(mobj.info.radius !== (mobj as any).spec.mo.radius && { radius: mobj.info.radius }),
        ...(mobj.info.height !== (mobj as any).spec.mo.height && { height: mobj.info.height }),
        ...(mobj.info.flags !== (mobj as any).spec.mo.flags && { flags: mobj.info.flags }),
        ...(mobj.stateIndex !== mobj.info.spawnstate && { state: mobj.stateIndex }),
        ...{ stateTics: mobj.stateTics },
        // ai
        ...(mobj.movedir > -1 && { movedir: mobj.movedir }),
        ...(mobj.movecount && { movecount: mobj.movecount }),
        ...(mobj.reactiontime && { reactiontime: mobj.reactiontime }),
        ...(mobj.chaseThreshold && { chaseThreshold: mobj.chaseThreshold }),
        ...(mobj.chaseTarget && { chaseTargetId: mobjs.get(mobj.chaseTarget) }),
        ...(mobj.tracerTarget && { tracerTargetId: mobjs.get(mobj.tracerTarget) }),
        ...(mobj.lastPlayerCheck && { lastPlayerCheck: mobj.lastPlayerCheck }),
    });

    // only store properties that are different from captured initial state
    const sectorChanged = (sector: Sector) => _sectorChanged(sector, map.initialMapState.sectors[sector.num]);
    const _sectorChanged = (sector: Sector, initial: InitialMapState['sectors'][0]) => false
        || sector.ceilFlat !== initial.ceilFlat
        || sector.zCeil !== initial.zCeil
        || sector.floorFlat !== initial.floorFlat
        || sector.zFloor !== initial.zFloor
        || sector.light !== initial.light
        || sector.type !== initial.type;
    const sectorState = (sector: Sector) => _sectorState(sector, map.initialMapState.sectors[sector.num]);
    const _sectorState = (sector: Sector, initial: InitialMapState['sectors'][0]) => ({
        num: sector.num,
        ...(sector.type !== initial.type && { type: sector.type }),
        ...(sector.floorFlat !== initial.floorFlat && { floorFlat: sector.floorFlat }),
        ...(sector.zFloor !== initial.zFloor && { zFloor: sector.zFloor }),
        ...(sector.ceilFlat !== initial.ceilFlat && { ceilFlat: sector.ceilFlat }),
        ...(sector.zCeil !== initial.zCeil && { zCeil: sector.zCeil }),
        ...(sector.light !== initial.light && { light: sector.light }),
        ...(sector.specialData && { special: actionState.indexOf(sector.specialData) }),
    });

    const linedefChanged = (ld: LineDef) => _linedefChanged(ld, map.initialMapState.linedefs[ld.num]);
    const _linedefChanged = (ld: LineDef, initial: InitialMapState['linedefs'][0]) => false
        || ld.right.lower !== initial.lower
        || ld.right.middle !== initial.middle
        || ld.right.upper !== initial.upper
        || ld.special !== initial.special
    const linedefState = (ld: LineDef) => _linedefState(ld, map.initialMapState.linedefs[ld.num]);
    const _linedefState = (ld: LineDef, initial: InitialMapState['linedefs'][0]) => ({
        num: ld.num,
        ...(ld.special !== initial.special && { special: ld.special }),
        ...(ld.right.lower !== initial.lower && { lower: ld.right.lower }),
        ...(ld.right.middle !== initial.middle && { middle: ld.right.middle }),
        ...(ld.right.upper !== initial.upper && { upper: ld.right.upper }),
    });

    const game = {
        mapName: map.name,
        skill: map.game.skill,
        elapsedTime: map.game.time.elapsed,
        playTime: map.game.time.playTime,
        rngIndex: map.game.rng.index,
        // TODO: convert to hash of wads or some other signature?
        wads: map.game.wad.name.split('&').map(e => e.split('=')[1]),
    };
    const mapState = {
        things: [...mobjs.keys().map(mobjState)],
        sectors: [...map.data.sectors.filter(sectorChanged).map(sectorState)],
        linedefs: [...map.data.linedefs.filter(linedefChanged).map(linedefState)],
        actions: actionState,
    };
    const player = {
        damageCount: map.player.damageCount.val,
        bonusCount: map.player.bonusCount.val,
        attacking: map.player.attacking,
        refire: map.player.refire,
        pitch: map.player.pitch,
        bob: map.player.bob,
        viewHeightOffset: (map.player as any).viewHeightOffset,
        deltaViewHeight: (map.player as any).deltaViewHeight,
        stats: map.player.stats,
        extraLight: map.player.extraLight.val,
        weaponPosition: map.player.weapon.val.position.val,
        weaponState: map.player.weapon.val.stateSM.stateIndex,
        weaponTic: map.player.weapon.val.stateSM.stateTics,
        weaponFlashState: map.player.weapon.val.flashSM.stateIndex,
        weaponFlashTic: map.player.weapon.val.flashSM.stateTics,
        inventory: {
            ...map.player.inventory.val,
            weapons: map.game.inventory.weapons.map(e => e?.name),
            nextWeapon: map.player.nextWeapon?.name,
            lastWeapon: map.game.inventory.lastWeapon?.name,
            // hmmm... next weapon is tricky. How to save that? It's related to weapon ticks/sprite too
        },
    };
    return { game, map: mapState, player };
};

export const importMap = (map: MapRuntime, data: MapExport) => {
    // restore player inventory and weapon. Position and other bits come when restoring mobjs
    const player = map.player;
    player.damageCount.set(data.player.damageCount);
    player.bonusCount.set(data.player.bonusCount);
    player.attacking = data.player.attacking;
    player.refire = data.player.refire;
    player.pitch = data.player.pitch;
    player.bob = data.player.bob;
    (player as any).viewHeightOffset = data.player.viewHeightOffset;
    (player as any).deltaViewHeight = data.player.deltaViewHeight;
    Object.assign(player.stats, data.player.stats);
    player.extraLight.set(data.player.extraLight);
    player.inventory.update(inv => {
        inv.ammo = data.player.inventory.ammo;
        inv.armor = data.player.inventory.armor;
        inv.armorType = data.player.inventory.armorType;
        inv.items = data.player.inventory.items;
        inv.keys = data.player.inventory.keys;
        inv.weapons = data.player.inventory.weapons.map(inventoryWeapon);
        return inv;
    });
    if (data.player.inventory.nextWeapon) player.nextWeapon = inventoryWeapon(data.player.inventory.nextWeapon);
    player.weapon.set(inventoryWeapon(data.player.inventory.lastWeapon).fn());
    map.player.weapon.val.stateSM.stateIndex = data.player.weaponState;
    map.player.weapon.val.stateSM.stateTics = data.player.weaponTic;
    map.player.weapon.val.flashSM.stateIndex = data.player.weaponFlashState;
    map.player.weapon.val.flashSM.stateTics = data.player.weaponFlashTic;
    map.player.weapon.val.position.update(vec => vec.set(data.player.weaponPosition.x, data.player.weaponPosition.y));

    // restore mobjs
    let mobjs: MapObject[] = [];
    let restoredPlayer = false;
    // do this in reverse so we get the right player object. It would be nice not to handle players in a special case
    // but camera movement and player movement are both messy right now. We also need to do it in two passes to make
    // sure we get the correct mobj when looking at chaseTargetId and traceTargetId
    for (let i = data.map.things.length - 1; i >= 0; i--) {
        const thing = data.map.things[i];
        let mo = new MapObject(map, thingSpec(thing.type), { x: thing.position.x, y: thing.position.y }, thing.direction);
        if (thing.type === 0 && !restoredPlayer) {
            // player restore is a little different. Other mobjs are reset to default because they are
            // created fresh but players needs some properties to be reset manually
            restoredPlayer = true;
            player.health.set(mo.health.val);
            (mo.info as any) = mo.info;
            player.reactiontime = mo.reactiontime;
            mo.dispose();
            mo = player;
        }
        mobjs.push(mo);

        mo.direction = thing.direction;
        mo.position.set(thing.position.x, thing.position.y, thing.position.z);
        mo.applyPositionChanged();
        if ('velocity' in thing) mo.velocity.set(thing.velocity.x, thing.velocity.y, thing.velocity.z);
        if ('health' in thing) mo.health.set(thing.health);
        if ('radius' in thing) mo.info.radius = thing.radius;
        if ('height' in thing) mo.info.height = thing.height;
        if ('flags' in thing) mo.info.flags = thing.flags;
        if ('movedir' in thing) mo.movedir = thing.movedir;
        if ('movecount' in thing) mo.movecount = thing.movecount;
        if ('reactiontime' in thing) mo.reactiontime = thing.reactiontime;
        if ('chaseThreshold' in thing) mo.chaseThreshold = thing.chaseThreshold;
        if ('lastPlayerCheck' in thing) mo.lastPlayerCheck = thing.lastPlayerCheck;
        mo.stateIndex = thing.state ?? mo.info.spawnstate;
        if ('stateTics' in thing) mo.stateTics = thing.stateTics;
    }
    mobjs.reverse();
    // destroy non-player mobjs becasue the loop below will add them back. Note also remove player to make sure it is added
    // back in the right place
    map.objs.values().filter(e => e !== player).forEach(e => map.destroy(e));
    map.objs.delete(player);
    for (let i = 0; i < data.map.things.length; i++) {
        const thing = data.map.things[i];
        // now that we have the list of mobjs, reset their chase and trace targets
        if ('chaseTargetId' in thing) mobjs[i].chaseTarget = mobjs[thing.chaseTargetId];
        if ('tracerTargetId' in thing) mobjs[i].tracerTarget = mobjs[thing.tracerTargetId];
        // add them to the map list
        map.objs.add(mobjs[i]);
        map.events.emit('mobj-added', mobjs[i]);
    }

    // restore map sectors by using initial values then applying saved diffs
    for (let i = 0; i < map.initialMapState.sectors.length; i++) {
        const ini = map.initialMapState.sectors[i];
        const sec = map.data.sectors[i];
        sec.specialData = null; // clear as it will be updated during restore later
        sec.type = ini.type;
        if (ini.zCeil !== sec.zCeil || ini.zFloor !== sec.zFloor) {
            sec.zCeil = ini.zCeil;
            sec.zFloor = ini.zFloor;
            map.events.emit('sector-z', sec);
        }
        if (ini.ceilFlat !== sec.ceilFlat || ini.floorFlat !== sec.floorFlat) {
            sec.ceilFlat = ini.ceilFlat;
            sec.floorFlat = ini.floorFlat;
            map.events.emit('sector-flat', sec);
        }
        if (ini.light !== sec.light) {
            sec.light = ini.light;
            map.events.emit('sector-light', sec);
        }
    }
    for (let sec of data.map.sectors) {
        const dest = map.data.sectors[sec.num];
        if ('type' in sec) dest.type = sec.type;
        if ('special' in sec) dest.specialData = data.map.actions[sec.special];
        if ('light' in sec) {
            dest.light = sec.light;
            map.events.emit('sector-light', dest);
        }
        if ('ceilFlat' in sec || 'floorFlat' in sec) {
            dest.ceilFlat = sec.ceilFlat ?? dest.ceilFlat;
            dest.floorFlat = sec.floorFlat ?? dest.floorFlat;
            map.events.emit('sector-flat', dest);
        }
        if ('zCeil' in sec || 'zFloor' in sec) {
            dest.zCeil = sec.zCeil ?? dest.zCeil;
            dest.zFloor = sec.zFloor ?? dest.zFloor;
            map.events.emit('sector-z', dest);
        }
    }
    // now handle linedefs the same way
    for (let i = 0; i < map.initialMapState.linedefs.length; i++) {
        const ini = map.initialMapState.linedefs[i];
        const ld = map.data.linedefs[i];
        if (ini.lower !== ld.right.lower || ini.middle !== ld.right.middle || ini.upper !== ld.right.upper || ini.special !== ld.special) {
            ld.right.lower = ini.lower ?? ld.right.lower;
            ld.right.middle = ini.middle ?? ld.right.middle;
            ld.right.upper = ini.upper ?? ld.right.upper;
            ld.special = ini.special ?? ld.special;
            map.events.emit('wall-texture', ld);
        }
    }
    for (let ld of data.map.linedefs) {
        const dest = map.data.linedefs[ld.num];
        if (dest.right) {
            if ('special' in ld) dest.special = ld.special;
            if ('lower' in ld) dest.right.lower = ld.lower;
            if ('middle' in ld) dest.right.middle = ld.middle;
            if ('upper' in ld) dest.right.upper = ld.upper;
        }
        map.events.emit('wall-texture', dest);
    }

    // restore sector move actions and light animations (and switch toggles)
    map.synchronizeSpecials();
    map.actions.values().filter(e => typeof e !== 'function').forEach(e => map.actions.delete(e));
    data.map.actions.forEach(e => map.actions.add(e));

    // restore game time
    map.game.time.playTime = data.game.playTime;
    map.game.time.elapsed = data.game.elapsedTime;
    (map.game as any).nextTickTime = Math.ceil(data.game.elapsedTime / tickTime) * tickTime;
    if (data.game.rngIndex > -1) {
        (map.game.rng as any)._index = data.game.rngIndex;
    }
};

export type InitialMapState = ReturnType<typeof captureInitialMapState>;
export const captureInitialMapState = (map: MapRuntime) => {
    // for game save/load, this is all the map state that is needed (for now)
    const sectors = map.data.sectors.map(sec => ({
        ceilFlat: sec.ceilFlat,
        zCeil: sec.zCeil,
        floorFlat: sec.floorFlat,
        zFloor: sec.zFloor,
        light: sec.light,
        type: sec.type,
    }));
    const linedefs = map.data.linedefs.map(ld => ({
        special: ld.special,
        lower: ld.right.lower,
        middle: ld.right.middle,
        upper: ld.right.upper,
    }));
    return { sectors, linedefs, };
}