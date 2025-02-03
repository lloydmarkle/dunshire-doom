import { type ThingType } from '.';
import { SoundIndex } from '../doom-things-info';
import { ticksPerSecond } from '../math';
import type { AmmoType, PlayerInventory, PlayerMapObject } from "../map-object";
import type { MessageId } from '../text';
import { clipAmmo, giveAmmo } from './ammunitions';
import { itemPickedUp, noPickUp } from './pickup';


function giveArmor(amount: number, type: 1 | 2) {
    return (player: PlayerMapObject) => {
        let pickedUp = false;
        player.inventory.update(inv => {
            let units = amount * type;
            if (inv.armor < units) {
                pickedUp = true;
                inv.armorType = type;
                inv.armor = amount;
            }
            return inv;
        });
        return pickedUp
            ? itemPickedUp(SoundIndex.sfx_itemup, type === 2 ? 'GOTMEGA' : 'GOTARMOR')
            : noPickUp();
    };
}

function healthPack(amount: number, message: MessageId, lowHealthMessage?: MessageId) {
    return (player: PlayerMapObject) => {
        let pickedUp = false;
        const msg = player.health.val < 25 ? (lowHealthMessage ?? message) : message;
        player.health.update(health => {
            if (health < 100) {
                health = Math.min(100, health + amount);
                pickedUp = true;
            }
            return health;
        });
        return pickedUp
            ? itemPickedUp(SoundIndex.sfx_itemup, msg)
            : noPickUp();
    }
}

function healthBonus(amount: number, sound: SoundIndex, message: MessageId) {
    return (player: PlayerMapObject) => {
        player.health.update(health => {
            health = Math.min(200, health + amount);
            return health;
        });
        return itemPickedUp(sound, message);
    }
}

function updateInventory(message: MessageId, fn: (inv: PlayerInventory) => void, sound = SoundIndex.sfx_getpow) {
    return (player: PlayerMapObject) => {
        player.inventory.update(inv => {
            fn(inv);
            return inv;
        });
        return itemPickedUp(sound, message);
    }
}

const giveRadSuit = updateInventory('GOTSUIT', inv => inv.items.radiationSuitTicks = 60 * ticksPerSecond);
const giveInvlun = updateInventory('GOTINVUL', inv => inv.items.invincibilityTicks = 30 * ticksPerSecond);
const giveInvis = updateInventory('GOTINVIS', inv => inv.items.invisibilityTicks = 120 * ticksPerSecond);
const giveLightGoggles = updateInventory('GOTVISOR', inv => inv.items.nightVisionTicks = 60 * ticksPerSecond);
const giveBerserk = (player: PlayerMapObject) => {
    player.health.update(health => Math.max(health, 100));
    player.inventory.update(inv => {
        inv.items.berserkTicks = 20 * ticksPerSecond;
        inv.items.berserk = true;
        return inv;
    });
    // switch to fists
    player.nextWeapon = player.inventory.val.weapons[1];
    return itemPickedUp(SoundIndex.sfx_getpow, 'GOTBERSERK');
};

const giveMap = updateInventory('GOTMAP', inv => inv.items.computerMap = true);
const armorBonus = updateInventory('GOTARMBONUS', inv => inv.armor = Math.min(200, inv.armor + 1), SoundIndex.sfx_itemup);
const giveMega = (player: PlayerMapObject) => {
    player.health.set(200);
    giveArmor(200, 2)(player);
    return itemPickedUp(SoundIndex.sfx_getpow, 'GOTMSPHERE');
};
const giveBackpack = (player: PlayerMapObject) => {
    player.inventory.update(inv => {
        inv.ammo.bullets.max = 400;
        inv.ammo.shells.max = 100;
        inv.ammo.rockets.max = 100;
        inv.ammo.cells.max = 600;

        Object.keys(clipAmmo).forEach((type: AmmoType) => giveAmmo(player, inv, type, 1));
        return inv;
    });
    return itemPickedUp(SoundIndex.sfx_itemup, 'GOTBACKPACK');
};

// kind of a stray observation but the names "items" and "powerups" feel reversed to me. I'm taking them from
// https://doomwiki.org/wiki/Thing_types but these items all use the sfx_getpow sound while most powerulps use
// the sfx_itemup sound. Not important but I'm always a little confused
export const items: ThingType[] = [
    { type: 83, class: 'I', description: 'Megasphere', onPickup: giveMega },
    { type: 2013, class: 'I', description: 'Supercharge', onPickup: healthBonus(100, SoundIndex.sfx_getpow, 'GOTSUPER') },
    { type: 2014, class: 'I', description: 'Health bonus', onPickup: healthBonus(1, SoundIndex.sfx_itemup, 'GOTHTHBONUS') },
    { type: 2015, class: 'I', description: 'Armor bonus', onPickup: armorBonus },
    { type: 2022, class: 'I', description: 'Invulnerability', onPickup: giveInvlun },
    { type: 2023, class: 'I', description: 'Berserk', onPickup: giveBerserk },
    { type: 2024, class: 'I', description: 'Partial invisibility', onPickup: giveInvis },
    { type: 2026, class: 'I', description: 'Computer area map', onPickup: giveMap },
    { type: 2045, class: 'I', description: 'Light amplification visor', onPickup: giveLightGoggles },
];

export const powerups: ThingType[] = [
    { type: 8, class: 'P', description: 'Backpack', onPickup: giveBackpack },
    { type: 2011, class: 'P', description: 'Stimpack', onPickup: healthPack(10, 'GOTSTIM') },
    { type: 2012, class: 'P', description: 'Medikit', onPickup: healthPack(25, 'GOTMEDIKIT', 'GOTMEDINEED') },
    { type: 2018, class: 'P', description: 'Armor', onPickup: giveArmor(100, 1) },
    { type: 2019, class: 'P', description: 'Megaarmor', onPickup: giveArmor(200, 2) },
    { type: 2025, class: 'P', description: 'Radiation shielding suit', onPickup: giveRadSuit },
];
