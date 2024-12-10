<script lang="ts">
    import type { EventHandler } from "svelte/elements";
    import { Game, type PlayerMapObject } from "../../doom";
    import RoundMenu from "../Components/RoundMenu.svelte";
    import type { Action, ActionReturn } from "svelte/action";
    import Picture from "../Components/Picture.svelte";
    import type { Size } from "@threlte/core";
    import { useAppContext } from "../DoomContext";

    export let game: Game;
    export let viewSize: Size;
    export let player: PlayerMapObject = null;
    export let showDeadZone = false;

    $: hasSuperShotgun = Boolean(game.wad.spriteTextureData('SHT2A0'));
    $: tickN = game.time.tickN;
    $: inventory = player?.inventory;
    $: playerWeapons = $inventory?.weapons;

    const { settings } = useAppContext();
    const { touchDeadZone, tapTriggerTime, touchLookSpeed, analogMovement, touchTargetHzPadding, touchTargetVPadding, touchTargetSize } = settings;
    const nowTime = () => new Date().getTime() * 0.001;
    const weaponSprites: [string, number, number][] = [
        ['PUNGB0', 26, -5],
        ['SAWGC0', 23, -10],
        ['PISGA0', 25, 0],
        ['SHTGA0', 29, 0],
        ['SHT2A0', 27, 8],
        ['CHGGA0', 14, 0],
        ['MISGB0', 13, -5],
        ['PLSGA0', 17, -7],
        ['BFGGA0', 9, -11],
    ];

    let useButton = false;
    let useLock = false;
    let attackButton = false;
    let attackLock = false;
    $: if ($tickN) {
        game.input.attack = false;
        game.input.use = false;
        if (attackButton || attackLock) {
            game.input.attack = true;
            attackButton = false;
        }
        if (useButton || useLock) {
            game.input.use = true;
            useButton = false;
        }
    }

    function analogClip(val: number) {
        if (Math.abs(val) < $touchDeadZone) {
            return 0;
        }
        const scaled = Math.sign(val) * (Math.abs(val) - $touchDeadZone) / (1 - $touchDeadZone);
        return Math.max(-1, Math.min(1, scaled));
    }

    function dpadClip(val: number) {
        if (Math.abs(val) < $touchDeadZone) {
            return 0;
        }
        return Math.max(-1, Math.min(1, Math.sign(val)));
    }

    function findTouch(tl: TouchList, id: number) {
        for (let i = 0; i < tl.length; i++) {
            if (tl[i].identifier === id) {
                return tl[i];
            }
        }
        return tl[0];
    }

    type Params = { viewSize: Size, clipFn: (x: number) => number };
    type Point = { x: number, y: number };
    interface Attributes {
        'on:tzone-point': EventHandler<CustomEvent<Point>>;
        'on:tzone-tap': EventHandler;
        'on:tzone-lock': EventHandler;
        'on:tzone-unlock': EventHandler;
    }

    const touchZoneControls: Action<HTMLElement, Params, Attributes> = (node, params): ActionReturn<Params, Attributes> => {
        let { clipFn } = params;

        let tapLock = false;
        let touchTime = 0;
        let touchNum: number;
        let touchActive = false;
        let bounds: DOMRect;
        let box = { midX: 0, midY: 0, halfWidth: 0, halfHeight: 0 };
        let point = { x: 0, y: 0 };
        resize();

        node.addEventListener('touchstart', touchstart);
        node.addEventListener('touchmove', touchmove);
        node.addEventListener('touchend', touchend);
        node.addEventListener('touchcancel', touchend);
        const update = (params: Params) => {
            clipFn = params.clipFn;
            resize();
        };
        const destroy = () => {
            node.removeEventListener('touchstart', touchstart);
            node.removeEventListener('touchmove', touchmove);
            node.removeEventListener('touchend', touchend);
            node.removeEventListener('touchcancel', touchend);
        }
        return { update, destroy };

        function resize() {
            bounds = node.getBoundingClientRect();
            box.midX = (bounds.left + bounds.right) * .5;
            box.midY = (bounds.top + bounds.bottom) * .5;
            box.halfWidth = bounds.width * .5;
            box.halfHeight = bounds.height * .5;
        }

        function touchstart(ev: TouchEvent) {
            ev.preventDefault();
            const now = nowTime();
            const elapsed = (now - touchTime);
            if (elapsed < 2 * $tapTriggerTime) {
                tapLock = true;
                node.dispatchEvent(new Event('tzone-lock'));
            }
            touchTime = now;

            touchNum = ev.changedTouches[0].identifier;
            // don't start a second tick function if one is already active
            if (!touchActive) {
                requestAnimationFrame(onTick);
            }
            touchActive = true;
            updateTouch(findTouch(ev.touches, touchNum));
        }

        function touchmove(ev: TouchEvent) {
            ev.preventDefault();
            updateTouch(findTouch(ev.touches, touchNum));
        }

        function touchend(ev: TouchEvent) {
            ev.preventDefault();
            if (nowTime() - touchTime < $tapTriggerTime) {
                node.dispatchEvent(new Event('tzone-tap'));
            }
            tapLock = false;
            node.dispatchEvent(new Event('tzone-unlock'));
            touchActive = false;
            point.x = point.y = 0;
        }

        function updateTouch(t: Touch) {
            point.x = clipFn((t.clientX - box.midX) / box.halfWidth);
            point.y = clipFn((t.clientY - box.midY) / box.halfHeight);
        }

        function onTick() {
            node.dispatchEvent(new CustomEvent('tzone-point', { detail: point }));
            if (touchActive) {
                requestAnimationFrame(onTick);
            }
        }
    };

    let showWeaponMenu = false;
    function weaponWheelTouchMove(ev: TouchEvent) {
        const btn = document.elementFromPoint(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY);
        if (btn instanceof HTMLButtonElement && btn.getAttribute('class').includes('wbutton')) {
            btn.focus()
        }
    }

    function weaponWheelTouchEnd(ev: TouchEvent) {
        const btn = document.elementFromPoint(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY);
        if (btn instanceof HTMLButtonElement && btn.getAttribute('class').includes('wbutton')) {
            btn.click();
        }
        showWeaponMenu = false
    }

    const selectWeapon = (num: number) => () => {
        if (player.weapon.val.name !== playerWeapons[num].name) {
            player.nextWeapon = playerWeapons[num];
        }
    }

    let movePoint = { x: 50, y: 50 };
    function touchMove(ev: CustomEvent<Point>) {
        movePoint.x = (ev.detail.x + 1) * 50;
        movePoint.y = (ev.detail.y + 1) * 50;
        game.input.move.x = ev.detail.x;
        game.input.move.y = -ev.detail.y;
    }

    let lookPoint = { x: 50, y: 50 };
    function touchLook(ev: CustomEvent<Point>) {
        lookPoint.x = (ev.detail.x + 1) * 50;
        lookPoint.y = (ev.detail.y + 1) * 50;
        game.input.aim.x = $touchLookSpeed * ev.detail.x;
        game.input.aim.y = $touchLookSpeed * ev.detail.y;
    }
</script>

<div
    class="absolute w-full flex justify-between opacity-30"
    style="
        --deadZone:{$touchDeadZone * 100}%;
        padding-inline:{$touchTargetHzPadding}rem;
        bottom:{$touchTargetVPadding}rem;
">
    <div
        use:touchZoneControls={{ viewSize, clipFn: $analogMovement ? analogClip : dpadClip }}
        on:tzone-tap={() => useButton = true}
        on:tzone-lock={() => useLock = true}
        on:tzone-unlock={() => useLock = false}
        on:tzone-point={touchMove}
        style="--px:{movePoint.x}%; --py:{movePoint.y}%; --size:{$touchTargetSize}rem;"
        class="touchGradient border-2 border-accent border-opacity-40 rounded-full"
        class:show-dead-zone={showDeadZone}
        class:extra-active={useButton || useLock}
        class:dpad-move={!$analogMovement}
    />
    <div
        class="touchGradient rounded-full relative"
        style="--px:50%; --py:50%; --size:{$touchTargetSize * .8}em; top:{$touchTargetVPadding * .5}rem;"
        on:touchstart|preventDefault={() => showWeaponMenu = true}
        on:touchmove|preventDefault={weaponWheelTouchMove}
        on:touchend={weaponWheelTouchEnd}
        on:touchcancel={() => showWeaponMenu = false}
    />
    <div
        use:touchZoneControls={{ viewSize, clipFn: analogClip }}
        on:tzone-tap={() => attackButton = true}
        on:tzone-lock={() => attackLock = true}
        on:tzone-unlock={() => attackLock = false}
        on:tzone-point={touchLook}
        style="--px:{lookPoint.x}%; --py:{lookPoint.y}%; --size:{$touchTargetSize}rem;"
        class="touchGradient border-2 border-accent border-opacity-40 rounded-full"
        class:show-dead-zone={showDeadZone}
        class:extra-active={attackButton || attackLock}
    />
</div>

{#if showWeaponMenu && player}
    <div class="absolute flex justify-center items-center w-full bottom-8">
        <div class="absolute w-[30%] translate-y-[-75%] top-0">
            <RoundMenu slices={weaponSprites.length - (hasSuperShotgun ? 0 : 1)} spanAngle={360} let:num let:rotation>
                {@const weaponNum = !hasSuperShotgun && num > 3 ? num + 1 : num}
                <button
                    disabled={!playerWeapons[weaponNum]}
                    class="wbutton btn no-animation w-full h-full opacity-80"
                    style="--btn-focus-scale:.9; --rotation:{rotation}deg;"
                    on:click={selectWeapon(weaponNum)}
                    on:touchend={() => showWeaponMenu = false}
                >
                    <span
                        class="roundMenuItem"
                        class:hidden={!playerWeapons[weaponNum]}
                        style="--top-offset:{weaponSprites[weaponNum][1]}%; --right-offset:{weaponSprites[weaponNum][2]}%;"
                    >
                        <Picture name={weaponSprites[weaponNum][0]} />
                    </span>
                </button>
            </RoundMenu>
        </div>
    </div>
{/if}

<style>
    /* https://stackoverflow.com/questions/4472891 */
    :root {
        touch-action: pan-x pan-y;
    }

    .touchGradient {
        --grad-bg: transparent;
        --grad-size: 25%;
        background-image: radial-gradient(
            circle at var(--px) var(--py),
            oklch(var(--a)), oklch(var(--a)) var(--grad-size), var(--grad-bg) calc(var(--grad-size) + 5%));
        width: var(--size);
        height: var(--size);
    }

    .dpad-move {
        --grad-size: 40%;
        clip-path: polygon(35% 0%,65% 0%,65% 35%,100% 35%,100% 60%,65% 60%,65% 100%,35% 100%,35% 60%,0% 60%,0% 35%,35% 35%);
        /* background-color: oklch(var(--b1)); */
        border: none;
        border-radius: 0;
        transform: scale(.8)
    }

    .extra-active {
        --a: var(--s);
        --grad-bg: oklch(var(--b3));
    }

    .show-dead-zone {
        --a: var(--b1);
        --grad-bg: oklch(var(--p));
        --grad-size: var(--deadZone);
    }

    .wbutton:focus {
        --btn-color: var(--a);
    }

    .roundMenuItem {
        position: absolute;
        top: var(--top-offset);
        right: var(--right-offset);
        transform: rotate(calc(var(--rotation))) scale(.7);
        pointer-events: none;
    }
</style>