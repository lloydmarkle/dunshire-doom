import type { Action, ActionReturn } from 'svelte/action';
import { type Game, type Store, mapMusicTrack, type PlayerInventory, ticksPerSecond } from '../../doom';
import { allWeapons, giveWeapon } from '../../doom/things/weapons';
import { useAppContext } from '../DoomContext';
import { get, type Writable } from 'svelte/store';

export const keyboardCheatControls: Action<HTMLElement, Game> = (node, game): ActionReturn => {
    const doc = node.ownerDocument;

    let cheatStrings: CheatCode[] = [];
    function keyup(ev: KeyboardEvent) {
        let lowerKey = ev.key.toLowerCase();
        let keyCode = lowerKey.charCodeAt(0);
        const isAlphaNumeric = (keyCode > 47 && keyCode < 58) || (keyCode > 96 && keyCode < 123);
        if (isAlphaNumeric) {
            cheatStrings.forEach(cs => cs.handleKey(lowerKey));
        }
    }
    doc.addEventListener('keyup', keyup);
    const destroy = () => {
        doc.removeEventListener('keyup', keyup);
    }

    const update = (game: Game) => {
        const showPlayerInfo = useAppContext().settings.showPlayerInfo;
        const editor = useAppContext().editor;
        cheatStrings = [
            new CheatCode(game, 'idclip', toggleFn(game.settings.noclip, 'No clipping mode')),
            new CheatCode(game, 'idspispopd', toggleFn(game.settings.noclip, 'No clipping mode')),
            new CheatCode(game, 'iddqd', toggleFn(game.settings.invicibility, 'Degreelessness mode')),
            new CheatCode(game, 'idfa', idfa),
            new CheatCode(game, 'idkfa', idkfa),
            new CheatCode(game, 'idclev??', warp),
            new CheatCode(game, 'idmus??', changeMusic),
            new CheatCode(game, 'idmypos', toggleFn(showPlayerInfo, 'Player info')),
            new CheatCode(game, 'idchoppers', idchoppers),
            // only shows the message
            new CheatCode(game, 'idbehold', (game) => game.map?.val?.player?.hudMessage?.set('inVuln, Str, Inviso, Rad, Allmap, or Lite-amp')),
            // actually applies the powerup
            new CheatCode(game, 'idbeholdv', idbeholdInvulnerable),
            new CheatCode(game, 'idbeholds', idbeholdBerserk),
            new CheatCode(game, 'idbeholdi', idbeholdInvisible),
            new CheatCode(game, 'idbeholdr', idbeholdRadiation),
            new CheatCode(game, 'idbeholda', idbeholdAllMap),
            new CheatCode(game, 'idbeholdl', idbeholdLiteAmp),
            // helpful debug cheats
            new CheatCode(game, 'fly', toggleFn(game.settings.freeFly, 'Free fly')),
            new CheatCode(game, 'inspect', toggleInspector(editor)),
        ];
    };
    update(game);

    return { destroy, update };
};

class CheatCode {
    private index = 0;
    private extraKeys = [];
    private keys: string[];
    constructor(private game: Game, chars: string, private fn: (game: Game, extra?: string[]) => void) {
        this.keys = chars.split('');
    }

    handleKey(key: string) {
        if (this.keys[this.index] === key) {
            this.index += 1;
        } else if (this.keys[this.index] === '?') {
            this.extraKeys.push(key);
            this.index += 1;
        } else {
            this.reset();
        }

        if (this.keys.length === this.index) {
            this.fn(this.game, this.extraKeys);
            this.reset();
        }
    }

    private reset() {
        this.index = 0;
        this.extraKeys.length = 0
    }
}

const toggleInspector = (editor: Writable<any>) => (game: Game) => {
    const e = get(editor);
    game.map.val?.player?.hudMessage?.set('Map inspector ' + (e.active ? 'OFF' : 'ON'));
    editor.update(v => {
        v.selected = null;
        v.active = !v.active;
        return v;
    });
}

const toggleFn = (v: Store<boolean>, message: string) => (game: Game) => {
    v.set(!v.val);
    game.map.val?.player?.hudMessage?.set(message + ' ' + (v.val ? 'ON' : 'OFF'));
};

const idbehold = (powerup: (inv: PlayerInventory) => void) => (game: Game) => {
    game.map?.val?.player?.hudMessage?.set('Power-up Toggled');
    game.map?.val?.player?.inventory?.update(inv => {
        powerup(inv);
        return inv;
    });
}

// TODO: can't we use the pickup item function so we don't duplicate times and behaviour?
export const idbeholdBerserk = idbehold(inv => {
    inv.items.berserk = !inv.items.berserk;
    inv.items.berserkTicks = inv.items.berserk ? 30 * ticksPerSecond : 0;
});
export const idbeholdInvisible = idbehold(inv => inv.items.invisibilityTicks = (1 - Math.sign(inv.items.invisibilityTicks)) * 30 * ticksPerSecond);
export const idbeholdRadiation = idbehold(inv => inv.items.radiationSuitTicks = (1 - Math.sign(inv.items.radiationSuitTicks)) * 30 * ticksPerSecond);
export const idbeholdAllMap = idbehold(inv => inv.items.computerMap = !inv.items.computerMap);
// NB: we don't go to zero here but 1 (see how light override is done in inventory up in MapObject)
export const idbeholdLiteAmp = idbehold(inv => inv.items.nightVisionTicks = 1 + (1 - Math.sign(inv.items.nightVisionTicks)) * 60 * ticksPerSecond);
export const idbeholdInvulnerable = idbehold(inv => inv.items.invincibilityTicks = 1 + (1 - Math.sign(inv.items.invincibilityTicks)) * 30 * ticksPerSecond);

export function idkfa(game: Game) {
    game.map?.val?.player?.inventory?.update(inv => {
        inv.keys = 'byrBYR';
        return inv;
    });
    addFullAmmo(game);
    game.map.val?.player?.hudMessage?.set('Very Happy Ammo Added');
}

function addFullAmmo(game: Game) {
    const player = game.map?.val?.player;
    game.map?.val?.player?.inventory?.update(inv => {
        inv.ammo.bullets.max = 400;
        inv.ammo.shells.max = 100;
        inv.ammo.rockets.max = 100;
        inv.ammo.cells.max = 600;

        for (const t of Object.keys(inv.ammo)) {
            inv.ammo[t].amount = inv.ammo[t].max;
        }
        let w = [...allWeapons];
        if (!player.map.game.wad.spriteTextureData('BFGGA0')) {
            // no BFG (shareware doom?)
            w[w.findIndex(e => e.name === 'bfg')] = undefined;
        }
        if (!player.map.game.wad.spriteTextureData('PLSGA0')) {
            // no plasma rifle (shareware doom?)
            w[w.findIndex(e => e.name === 'plasma rifle')] = undefined;
        }
        if (!player.map.game.wad.spriteTextureData('SHT2A0')) {
            // no super shotgun in this wad so remove it from the weapon list
            w[w.findIndex(e => e.name === 'super shotgun')] = undefined;
        }
        inv.weapons = w;
        inv.armorType = 2;
        inv.armor = 200;
        return inv;
    });
}

export function idfa(game: Game) {
    addFullAmmo(game);
    game.map.val?.player?.hudMessage?.set('Ammo (no keys) Added');
}

function warp(game: Game, extra: string[]) {
    const mapName = game.episodic ? `E${extra[0]}M${extra[1]}` : `MAP${extra[0]}${extra[1]}`;
    if (game.wad.mapNames.includes(mapName)) {
        idclev(game, mapName);
    }
}

export function idclev(game: Game, mapName: string) {
    game.map.val?.player?.hudMessage?.set('Changing Level...');
    game.resetInventory();
    game.startMap(mapName);
}

function changeMusic(game: Game, extra: string[]) {
    const mapName = game.episodic ? `E${extra[0]}M${extra[1]}` : `MAP${extra[0]}${extra[1]}`;
    if (game.wad.mapNames.includes(mapName)) {
        idmus(game, mapName);
    } else {
        game.map.val?.player?.hudMessage?.set('IMPOSSIBLE SELECTION');
    }
}

export function idmus(game: Game, mapName: string) {
    game.map.val?.player?.hudMessage?.set('Music Change');
    game.map?.val?.musicTrack?.set(mapMusicTrack(game, mapName));
}

export function idchoppers(game: Game) {
    if (game.map.val?.player) {
        const player = game.map.val?.player;
        player.hudMessage?.set("... doesn't suck - GM");
        if (player.inventory.val.weapons[1]) {
            return;
        }
        giveWeapon('chainsaw')(player, null);
    }
}