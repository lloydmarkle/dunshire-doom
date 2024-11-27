import { FrontSide, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, type IUniform } from "three";
import type { MapTextureAtlas } from "./TextureAtlas";
import { store } from "../../doom";
import type { MapLighting } from "./MapLighting";

export const inspectorAttributeName = 'doomInspect';

const vertex_pars = `
#include <common>

attribute uint texN;
attribute ivec2 doomOffset;
uniform float time;
uniform uint tWidth;
uniform sampler2D tAtlas;
uniform uint tAtlasWidth;

varying vec4 vUV;
varying vec2 vDim;
varying vec2 vOff;
`;
const uv_vertex = `
#include <uv_vertex>

float invAtlasWidth = 1.0 / float(tAtlasWidth);
vec2 atlasUV = vec2( mod(float(texN), float(tAtlasWidth)), floor(float(texN) * invAtlasWidth));
atlasUV = (atlasUV + .5) * invAtlasWidth;
vUV = texture2D( tAtlas, atlasUV );
vDim = vec2( vUV.z - vUV.x, vUV.w - vUV.y );
vOff = vec2( float(doomOffset.x), float(doomOffset.y) ) * time / float(tWidth);
`;

const fragment_pars = `
#include <common>

varying vec4 vUV;
varying vec2 vDim;
varying vec2 vOff;
`;
const map_fragment = `
#ifdef USE_MAP

vec2 mapUV = mod( vMapUv * vDim + vOff, vDim) + vUV.xy;
vec4 sampledDiffuseColor = texture2D( map, mapUV );
diffuseColor *= sampledDiffuseColor;

#endif
`;

export function mapMeshMaterials(ta: MapTextureAtlas, lighting: MapLighting) {
    // extending threejs standard materials feels like a hack BUT doing it this way
    // allows us to take advantage of all the advanced capabilities there
    // (like lighting and shadows)

    const uniforms = store({
        dInspect: { value: [-1, -1] } as IUniform,
        doomExtraLight: { value: 0 } as IUniform,
        doomFakeContrast: { value: 0 } as IUniform,
        time: { value: 0 } as IUniform,
        // map lighting info
        tLightLevels: { value: lighting.lightLevels },
        tLightMap: { value: lighting.lightMap },
        tLightMapWidth: { value: lighting.lightMap.image.width },
        // texture meta data
        tWidth: { value: ta.texture.image.width },
        tAtlas: { value: ta.index },
        tAtlasWidth: { value: ta.index.image.width },
    });

    const material = new MeshStandardMaterial({
        map: ta.texture,
        alphaTest: 1.0,
        shadowSide: FrontSide,
    });
    material.onBeforeCompile = shader => {
        Object.keys(uniforms.val).forEach(key => shader.uniforms[key] = uniforms.val[key])

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertex_pars + `
            uniform sampler2D tLightLevels;
            uniform sampler2D tLightMap;
            uniform uint tLightMapWidth;
            uniform float doomExtraLight;
            uniform int doomFakeContrast;
            attribute uint doomLight;
            varying float vScaledLightLevel;

            uniform uvec2 dInspect;
            attribute uvec2 ${inspectorAttributeName};
            varying vec3 doomInspectorEmissive;

            const float oneSixteenth = 1.0 / 16.0;
            float doomLightLevel(float level) {
                float light = clamp(level, 0.0, 1.0) * 255.0;
                vec2 luv = vec2( mod(light, oneSixteenth), floor(light * oneSixteenth) );
                vec4 sectorLightLevel = texture2D( tLightLevels, (luv + .5) * oneSixteenth );
                return sectorLightLevel.g;
            }

            const float fakeContrastStep = 16.0 / 256.0;
            float fakeContrast(vec3 normal) {
                vec3 absNormal = abs(normal);
                float dotN = dot(normal, vec3(0, 1, 0));
                float dotN2 = dotN * dotN;
                float dfc = float(doomFakeContrast);
                float gradual = step(2.0, dfc);
                float classic = step(1.0, dfc) * (1.0 - gradual);
                return (
                    (classic * (
                        step(1.0, absNormal.y) * -fakeContrastStep +
                        step(1.0, absNormal.x) * fakeContrastStep
                    ))
                    + (gradual * (
                        dotN2 * -2.0 * fakeContrastStep
                        + step(absNormal.z, 0.0) * fakeContrastStep
                    ))
                );
            }
            `)
            .replace('#include <uv_vertex>', uv_vertex + `
            // sector light level
            float invLightMapWidth = 1.0 / float(tLightMapWidth);
            vec2 lightUV = vec2(
                mod(float(doomLight), float(tLightMapWidth)),
                floor(float(doomLight) * invLightMapWidth) );
            vec4 sectorLight = texture2D( tLightMap, (lightUV + .5) * invLightMapWidth );

            sectorLight.rgb += fakeContrast(normal);
            vScaledLightLevel = doomLightLevel(sectorLight.g + doomExtraLight);
            // vScaledLightLevel = sectorLight.g;

            // faded magenta if selected for inspection
            // maybe it's better to simply have an if/else?
            vec2 insp = step(vec2(${inspectorAttributeName} - dInspect), vec2(0.0));
            doomInspectorEmissive = (1.0 - step(dot(vec2(1.0), insp), 1.0)) * vec3(1.0, 0.0, 1.0) * .1;
            `);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars + `
            varying float vScaledLightLevel;
            varying vec3 doomInspectorEmissive;
            `)
            .replace('#include <map_fragment>', map_fragment)
            .replace('#include <lights_fragment_begin>', `
            #include <lights_fragment_begin>
            // apply lighting
            material.diffuseColor.rgb *= vScaledLightLevel;
            // material.diffuseColor.rgb = vec3(scaledLightLevel);
            // material.diffuseColor.rgb = vec3(fakeContrast(normal_) * 4.0 + .5);
            // material.diffuseColor.rgb = abs(normal_);

            totalEmissiveRadiance += doomInspectorEmissive;
            `);
    };

    const depthMaterial = new MeshDepthMaterial({ alphaTest: 1.0 });
    depthMaterial.onBeforeCompile = shader => {
        Object.keys(uniforms.val).forEach(key => shader.uniforms[key] = uniforms.val[key])

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertex_pars)
            .replace('#include <uv_vertex>', uv_vertex);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars)
            .replace('#include <map_fragment>', map_fragment);
    };

    const distanceMaterial = new MeshDistanceMaterial({ alphaTest: 1.0 });
    distanceMaterial.onBeforeCompile = shader => {
        Object.keys(uniforms.val).forEach(key => shader.uniforms[key] = uniforms.val[key])

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertex_pars)
            .replace('#include <uv_vertex>', uv_vertex);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars)
            .replace('#include <map_fragment>', map_fragment);
    };

    return { material, depthMaterial, distanceMaterial, uniforms };
}