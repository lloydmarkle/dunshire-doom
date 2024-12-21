<script lang="ts">
    import { thingSpec, type ThingSpec, states, SpriteNames, MapRuntime, mapObjectInfo, MapObjectIndex } from "../../doom";
    import { useAppContext, useDoom } from "../DoomContext";
    import ThingSprite from "./ThingSprite.svelte";
    import { ToDegrees, ToRadians } from "../../doom";
    import FlagList from "./FlagList.svelte";
    import { MapObject } from "../../doom/map-object";
    import NumberChooser from "./NumberChooser.svelte";
    import { reveal } from "./TextureChooser.svelte";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "../Map/SvelteBridge";

    const { editor } = useAppContext();
    const { textures, wad } = useDoom();

    export let map: MapRuntime;
    export let thing: MapObject;

    // https://doomwiki.org/wiki/Thing#Flags
    const flagInfo: [number, string][] = [
        [0x0001, 'On skill 1 and 2 ("I\'m too young to die." and "Hey, not too rough.")'],
        [0x0002, 'On skill 3 ("Hurt me plenty.")'],
        [0x0004, 'On skill 4 and 5 ("Ultra Violence." and "Nightmare!")'],
        [0x0008, 'Ambush (aka the "deaf" flag)'],
        [0x0010, 'Multiplayer-only'],
    ]

    const { sprite, position } = thing;
    $: frames = wad.spriteFrames($sprite.name);
    $: frame = frames[$sprite.frame][8] ?? frames[$sprite.frame][0];
    $: texture = textures.get(frame.name, 'sprite');

    let showOptions = false;
    let selectorFilter = '';
    function toggleSelector() {
        showOptions = !showOptions;
    }

    type ParialThingSpec = Omit<ThingSpec, 'mo'>
    function changeType(th: ParialThingSpec) {
        map.destroy(thing);
        const pos = thing.position;
        thing = map.spawn(mapObjectInfo.findIndex(e => e.doomednum === th.type), pos.x, pos.y);
        setDirection(thing.direction * ToDegrees)();
        $editor.selected = thing;

        selectorFilter = '';
        showOptions = false;
    }

    $: directionButton = Math.floor(thing.direction * ToDegrees) / 45;
    function setDirection(degrees: number) {
        return () => {
            thing.direction = degrees * ToRadians;
            map.events.emit('mobj-updated-sprite', thing, thing.sprite.val);
        };
    }

    function editorThing(idx: any) {
        const value = thingSpec(idx);
        const state = states[value.mo.spawnstate];
        const sprite = SpriteNames[state.sprite];
        const frames = (sprite && wad.spriteFrames(sprite)) ?? [];
        const text = `${value.description} (${value.type})`;
        if (frames.length === 0) {
            // if we don't have sprite frames (like for a doom2 enemy but we're using a doom1 wad)
            // then return null and filter later
            return null;
        }
        return { value, state, frames, text };
    }

    function changeThing(ev) {
        const mobj = [...map.objs].find(e => e.id === ev.detail);
        if (mobj) {
            $editor.selected = mobj;
        }
    }

    let sectors = [];
    onDestroy(monitorMapObject(map, thing, mo => {
        sectors.length = 0;
        thing.sectorMap.forEach((n, sec) => sectors.push(sec));
    }));

    $: types = Object.keys(MapObjectIndex)
        .filter(e => !isNaN(Number(e)))
        .map(editorThing)
        .filter(e => e?.value.mo.doomednum >= 0);
</script>

<h3>Thing <NumberChooser num={thing.id} on:select={changeThing} /></h3>
<div class="relative">
    <button class="btn flex flex-col" on:click={toggleSelector}>
        <ThingSprite frames={frames} state={states[thing.info.spawnstate]} text={thing.description} />
    </button>
    {#if showOptions}
    <div class="relative h-0">
        <div
            transition:reveal
            class="z-30 absolute top-0 left-0 p-2 flex flex-col gap-2 shadow-2xl bg-neutral rounded-box"
        >
            <!-- svelte-ignore a11y-autofocus -->
            <input autofocus class="input" type="text" placeholder="Search..." autocomplete="off" id="searchInput" bind:value={selectorFilter} on:input>
            <div class="overflow-y-scroll max-h-96 flex flex-wrap gap-2">
            {#each types as t}
                {#if !selectorFilter.length || t.text.toLowerCase().includes(selectorFilter)}
                    <button class="btn h-full flex flex-col overflow-hidden" on:click={() => changeType(t.value)}>
                        <ThingSprite frames={t.frames} state={t.state} text={t.text} />
                    </button>
                {/if}
            {/each}
            </div>
        </div>
    </div>
    {/if}
</div>
<div>
    <!--
    Hmm... during some refactoring, we removed this data from MObj. Should we bring it back?
    <FlagList info={flagInfo} bind:flags={thing.source.flags} />
    -->
</div>
<div>
    <div>Position: {[Math.floor(position.x), Math.floor(position.y), Math.floor(position.z)]}</div>
    <div>Sectors: [
        {#each sectors as sector}
            <button class="link link-primary ps-1" on:click={() => $editor.selected = sector}>{sector.num}</button>
        {/each}
    ]</div>
</div>
<div class="self-center p-4 w-48 grid grid-cols-3 gap-1 rounded-box bg-neutral">
    <button class="btn" class:btn-primary={directionButton === 7} on:click={setDirection(315)}>NW</button>
    <button class="btn" class:btn-primary={directionButton === 6} on:click={setDirection(270)}>North</button>
    <button class="btn" class:btn-primary={directionButton === 5} on:click={setDirection(225)}>NE</button>
    <button class="btn" class:btn-primary={directionButton === 0} on:click={setDirection(0)}>West</button>
    <span class="w-8 text-center self-center text-xs">{Math.floor(thing.direction * ToDegrees)} degrees</span>
    <button class="btn" class:btn-primary={directionButton === 4} on:click={setDirection(180)}>East</button>
    <button class="btn" class:btn-primary={directionButton === 1} on:click={setDirection(45)}>SW</button>
    <button class="btn" class:btn-primary={directionButton === 2} on:click={setDirection(90)}>South</button>
    <button class="btn" class:btn-primary={directionButton === 3} on:click={setDirection(135)}>SE</button>
</div>
<div class="bg-base-100 p-2 rounded-box">
    <span>Sprite Info</span>
    <div>name: {frame.name}</div>
    <div>[width, height]: [{texture.userData.width}, {texture.userData.height}]</div>
    <div>[xOffset, yOffset]: [{texture.userData.xOffset}, {texture.userData.yOffset}]</div>
    <div>fullbright: {$sprite.fullbright}</div>
</div>

<style>
    div {
        position: relative;
    }

    input[type="text"] {
        padding: .25em .5em;
        font-size: 1.2em;
    }
</style>