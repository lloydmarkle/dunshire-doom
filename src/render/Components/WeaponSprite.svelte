<script lang="ts">
    import { T } from "@threlte/core";
    import Wireframe from "../Debug/Wireframe.svelte";
    import { MeshStandardMaterial, PlaneGeometry, ShaderMaterial } from "three";
    import { type Sector } from "../../doom";
    import { useDoom, useDoomMap } from "../DoomContext";
    import type { Sprite } from "../../doom/sprite";
    import { ShadowsShader } from '../Shaders/ShadowsShader';

    export let sprite: Sprite;
    export let sector: Sector;
    export let flash = false;

    const { textures, wad } = useDoom();
    const { map } = useDoomMap();
    const tick = map.game.time.tick;
    const extraLight = map.player.extraLight;
    const renderShadow = map.player.renderShadow;

    $: frames = wad.spriteFrames(sprite.name);
    $: frame = frames[sprite.frame][0];
    $: texture = textures.get(frame.name, 'sprite');

    $: material = $renderShadow
        ? new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, ...ShadowsShader() })
        : new MeshStandardMaterial({ transparent: true, depthTest: false, depthWrite: false });

    $: if (material instanceof ShaderMaterial && $tick) {
        material.uniforms.time.value = map.game.time.elapsed;
    }

    $: if (texture) {
        if (material instanceof MeshStandardMaterial) {
            material.map = texture;
        } else {
            material.uniforms.map.value = texture;
        }
    }

    // FIXME: we can't subscribe here anymore!
    $: light = sector.light;
    $: if (sprite && (sprite.fullbright || light !== undefined)) {
        const col = textures.lightColor(sprite?.fullbright ? 255 : light + $extraLight);
        if (material instanceof MeshStandardMaterial) {
            material.color = col;
        } else {
            material.uniforms.light.value = col;
        }
    }
</script>

{#if texture}
    <T.Mesh
        {material}
        renderOrder={2}
        geometry={new PlaneGeometry()}
        scale.x={frame.mirror ? -texture.userData.width : texture.userData.width}
        scale.y={texture.userData.height}
        position.x={-texture.userData.xOffset + (texture.userData.width * .5)}
        position.y={texture.userData.yOffset - (texture.userData.height * .5)}
        position.z={flash ? -1 : -2}
    >
        <Wireframe />
    </T.Mesh>
{/if}