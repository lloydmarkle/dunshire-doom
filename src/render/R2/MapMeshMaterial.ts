import { FrontSide, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, type IUniform } from "three";
import type { MapTextureAtlas } from "./TextureAtlas";
import { store } from "../../doom";
import type { MapLighting } from "./MapLighting";

export const inspectorAttributeName = 'doomInspect';

const vertex_pars = `
#include <common>

attribute uvec2 texN;
attribute ivec2 doomOffset;
uniform float tic;
uniform float tWidth;
uniform sampler2D tAtlas;
uniform float tAtlasWidth;
uniform sampler2D tAnimAtlas;
uniform float tAnimAtlasWidth;

varying vec4 vUV;
varying vec2 vDim;
varying vec2 vOff;
`;
const uv_vertex = `
#include <uv_vertex>

float invAtlasWidth = 1.0 / tAtlasWidth;

float txIndex = float(texN.x);
if (texN.y > 0u) {
    vec2 animUV = vec2( mod(float(texN.x), tAtlasWidth), floor(float(texN.x) * invAtlasWidth));
    animUV = (animUV + .5) * invAtlasWidth;
    vec4 animInfo = texture2D( tAnimAtlas, animUV );
    float animOffset = floor(mod(tic / animInfo.x + animInfo.y, animInfo.z));
    txIndex = float(texN.x) + animOffset - animInfo.y;
}

vec2 atlasUV = vec2( mod(txIndex, tAtlasWidth), floor(txIndex * invAtlasWidth));
atlasUV = (atlasUV + .5) * invAtlasWidth;
vUV = texture2D( tAtlas, atlasUV );
vDim = vec2( vUV.z - vUV.x, vUV.w - vUV.y );
vOff = vec2(doomOffset) * tic / tWidth;
`;

const fragment_pars = `
#include <common>

varying vec4 vUV;
varying vec2 vDim;
varying vec2 vOff;
varying vec2 uvMotion;
`;
const map_fragment = `
#ifdef USE_MAP

vec2 mapUV = mod( vMapUv * vDim + vOff + uvMotion, vDim) + vUV.xy;
vec4 sampledDiffuseColor = texture2D( map, mapUV);
diffuseColor *= sampledDiffuseColor;

#endif
`;

export function mapMeshMaterials(ta: MapTextureAtlas, lighting: MapLighting) {
    // extending threejs standard materials feels like a hack BUT doing it this way
    // allows us to take advantage of all the advanced capabilities there
    // (like lighting and shadows)

    const uniforms = store({
        dInspect: { value: [-1, -1] } as IUniform<[number, number]>,
        doomExtraLight: { value: 0 } as IUniform<number>,
        doomFakeContrast: { value: 0 } as IUniform<number>,
        tic: { value: 0 } as IUniform<number>,
        // map lighting info
        tLightMap: { value: lighting.lightMap },
        tLightMapWidth: { value: lighting.lightMap.width },
        // texture meta data
        tWidth: { value: ta.texture.width },
        tAtlas: { value: ta.index },
        tAtlasWidth: { value: ta.index.width },
        tAnimAtlas: { value: ta.animation },
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
            uniform sampler2D tLightMap;
            uniform uint tLightMapWidth;
            uniform float doomExtraLight;
            uniform int doomFakeContrast;
            attribute uint doomLight;
            varying float vSectorLightLevel;
            attribute vec3 doomMotion;
            varying vec2 uvMotion;

            uniform uvec2 dInspect;
            attribute uvec2 ${inspectorAttributeName};
            varying vec3 doomInspectorEmissive;

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
            .replace('#include <project_vertex>', `
                float iTic = 1.0 - fract(tic);
                uvMotion = doomMotion.xy * iTic / tWidth;
                transformed.z += doomMotion.z * iTic;
                #include <project_vertex>
            `)
            .replace('#include <uv_vertex>', uv_vertex + `
            // sector light level
            float invLightMapWidth = 1.0 / float(tLightMapWidth);
            vec2 lightUV = vec2(
                mod(float(doomLight), float(tLightMapWidth)),
                floor(float(doomLight) * invLightMapWidth) );
            vec4 sectorLight = texture2D( tLightMap, (lightUV + .5) * invLightMapWidth );

            sectorLight.rgb += fakeContrast(normal);
            vSectorLightLevel = clamp(sectorLight.g + doomExtraLight, 0.0, 1.0);

            // faded magenta if selected for inspection
            // maybe it's better to simply have an if/else?
            vec2 insp = step(vec2(${inspectorAttributeName} - dInspect), vec2(0.0));
            doomInspectorEmissive = (1.0 - step(dot(vec2(1.0), insp), 1.0)) * vec3(1.0, 0.0, 1.0) * .1;
            `);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars + `
            varying float vSectorLightLevel;
            varying vec3 doomInspectorEmissive;
            `)
            .replace('#include <map_fragment>', map_fragment)
            .replace('#include <lights_fragment_begin>', `
            #include <lights_fragment_begin>

            float minLight = pow(vSectorLightLevel, 8.0);
            float depth = pow(1.0 - pow(gl_FragDepth, vSectorLightLevel * 4.5), 6.0);
            float light = clamp(vSectorLightLevel * depth + minLight, 0.0, 1.0);
            light = ceil(light * 400.0 / 4.0 - .5) * 4.0 / 400.0;
            material.diffuseContribution.rgb *= clamp(light, 0.0, 1.0);

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