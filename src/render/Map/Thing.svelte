<script lang="ts" context="module">
    // all things are planes so may as well use the same geometry
    // TODO: actually we can do better than this. We can use instancing per thing type
    // so that we only have one draw call per type. It means we'll need to create a sprite
    // sheet though and uv index to the appropriate frame but it's doable.
    // TODO2: next level... single sprite sheet for all sprites so one draw call for all mobjs?
    const geometry = new PlaneGeometry();
</script>
<script lang="ts">
    import { T } from '@threlte/core';
    import { MeshStandardMaterial, PlaneGeometry, ShaderMaterial, DoubleSide, BackSide } from 'three';
    import { useAppContext, useDoom, useDoomMap } from '../DoomContext';
    import { EIGHTH_PI, QUARTER_PI, HALF_PI, MFFlags, normalizeAngle, MapObjectIndex } from '../../doom';
    import { ShadowsShader } from '../Shaders/ShadowsShader';
    import Wireframe from '../Debug/Wireframe.svelte';
    import type { RenderSector } from '../RenderData';
    import { MoveDirection } from '../../doom/things/monsters';
    import type { MapObject } from './SvelteBridge';

    export let thing: MapObject;
    export let renderSector: RenderSector;

    const { map, camera } = useDoomMap();
    const { tick, partialTick } = map.game.time;
    const { editor, settings } = useAppContext();
    const interpolateMovement = settings.interpolateMovement;
    const { textures, wad } = useDoom();
    const cameraMode = map.game.settings.cameraMode;
    const extraLight = map.player.extraLight;

    const vis = renderSector.visible;
    $: visible = $vis;
    const { sector, sprite, renderShadow } = thing;
    const { direction, position: tpos } = thing.renderData;
    const invertYOffset = (thing.info.flags & MFFlags.InvertSpriteYOffset);
    const isBillboard = (thing.info.flags & MFFlags.BillboardSprite);
    const isMissile = (thing.info.flags & MFFlags.MF_MISSILE || thing.type === MapObjectIndex.MT_EXTRABFG);
    const camPos = camera.position;
    const camAngle = camera.angle;

    $: ang = $cameraMode === 'bird' ? $direction + Math.PI : Math.atan2($tpos.y - $camPos.y, $tpos.x - $camPos.x);
    $: rot =  Math.floor((EIGHTH_PI + normalizeAngle(ang - $direction)) / QUARTER_PI) % 8;
    $: frames = wad.spriteFrames($sprite.name);
    $: frame = frames[$sprite.frame][rot] ?? frames[$sprite.frame][0];

    $: texture = textures.get(frame.name, 'sprite');
    // Sprite offset is much more complicated than this but this is simple and looks okay-ish.
    // https://www.doomworld.com/forum/topic/110008-what-is-this-bs-with-gl-hardware-mode
    // and https://www.doomworld.com/forum/topic/68145-source-port-sprites-through-the-floor
    $: vOffset =
        Math.max(texture.userData.yOffset - texture.userData.height, 0)
        + (texture.userData.height * .5) * (invertYOffset ? -1 : 1)
        + (isMissile ? texture.userData.yOffset - texture.userData.height : 0);
    $: hOffset = texture.userData.xOffset - texture.userData.width * .5;

    // Position is interpolated based on partial tick time, velocity, and move direction. Move direction is more
    // complicated because objects don't move every tick so we need to know how close they are to their next move.
    // Interpolation is most useful for fast moving objects like fireballs and rockets when the timescale is small or
    // else the mobj jumps to the new position every 1/35s.
    // It's still not perfect if you watch closely. mobj.movecount can mess it up and so can collisions but it's pretty good.
    const ppos = { x: 0, y: 0, z: 0 };
    $: if ($interpolateMovement && thing.type !== MapObjectIndex.MT_PLAYER) {
        const floating = thing.info.flags & MFFlags.MF_INFLOAT;
        if (!floating) {
            const partialMove = ($partialTick * thing.spriteTime + thing.spriteCompletion) * thing.info.speed;
            ppos.x = $partialTick * thing.velocity.x + (thing.movedir === MoveDirection.None ? 0 : Math.cos(thing.movedir) * partialMove);
            ppos.y = $partialTick * thing.velocity.y + (thing.movedir === MoveDirection.None ? 0 : Math.sin(thing.movedir) * partialMove);
        }
        ppos.z = $partialTick * thing.velocity.z;
    }

    const rotation = { x: 0, y: 0, z: 0 };
    $: if ($cameraMode === 'bird') {
        rotation.x = Math.PI;
        rotation.y = -Math.PI;
        rotation.z = $direction - HALF_PI;
    } else if (isBillboard) {
        rotation.x = $camAngle.x;
        rotation.y = 0;
        rotation.z = $camAngle.z;
    } else {
        rotation.x = HALF_PI;
        rotation.y = $camAngle.z;
        rotation.z = 0;
    }

    $: material = $renderShadow
        ? new ShaderMaterial({ transparent: true, ...ShadowsShader() })
        : new MeshStandardMaterial({ alphaTest: 1, emissive: 'magenta' });

    $: if (material instanceof MeshStandardMaterial) {
        material.emissiveIntensity = ($editor.selected === thing) ? 0.1 : 0;
        material.shadowSide = $cameraMode === 'ortho' ? DoubleSide : BackSide;
    }

    $: if (material instanceof ShaderMaterial && $tick) {
        material.uniforms.time.value = map.game.time.elapsed;
    }

    $: if (texture) {
        if (material instanceof ShaderMaterial) {
            material.uniforms.map.value = texture;
        } else {
            material.map = texture;
        }
    }

    $: light = $sector.light;
    $: if ($sprite.fullbright || $light !== undefined) {
        const col = textures.lightColor($sprite.fullbright ? 255 : $light + $extraLight);
        if (material instanceof ShaderMaterial) {
            material.uniforms.light.value = col;
        } else {
            material.color = col;
        }
    }

    function hit(ev) {
        ev.stopPropagation();
        $editor.selected = thing;
    }

    const castShadow = thing.type !== MapObjectIndex.MT_PLAYER;
    const receiveShadow = castShadow;
</script>

<T.Mesh
    {castShadow}
    {receiveShadow}
    on:click={hit}
    userData={{ type: 'mobj', moType: thing.type }}
    renderOrder={1}
    {visible}
    {material}
    {geometry}
    scale.x={frame.mirror ? -texture.userData.width : texture.userData.width}
    scale.y={texture.userData.height}
    rotation.x={rotation.x}
    rotation.y={rotation.y}
    rotation.z={rotation.z ?? 0}
    rotation.order={'ZXY'}
    position.x={ppos.x + $tpos.x - Math.sin(ang) * hOffset}
    position.y={ppos.y + $tpos.y + Math.cos(ang) * hOffset}
    position.z={ppos.z + $tpos.z + vOffset}
>
    <Wireframe />
</T.Mesh>
