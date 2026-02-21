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
uniform int tAtlasWidth;
uniform sampler2D tAnimAtlas;
varying vec2 uvMotion;

varying vec4 vUV;
varying vec2 vDim;
varying vec2 vOff;
`;
const uv_vertex = `
#include <uv_vertex>

int txIndex = int(texN.x);
if (texN.y > 0u) {
    vec4 animInfo = texelFetch( tAnimAtlas, ivec2( txIndex % tAtlasWidth, txIndex / tAtlasWidth ), 0 );
    float animOffset = mod(floor(tic / animInfo.x + animInfo.y), animInfo.z);
    txIndex += int(animOffset - animInfo.y);
}

vUV = texelFetch( tAtlas, ivec2( txIndex % tAtlasWidth, txIndex / tAtlasWidth), 0 );
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

            uniform uvec2 dInspect;
            attribute uvec2 ${inspectorAttributeName};
            varying vec3 doomInspectorEmissive;
            varying vec4 vPlayerPos;

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
            ivec2 lightUV = ivec2(doomLight % tLightMapWidth, doomLight / tLightMapWidth);
            vec4 sectorLight = texelFetch( tLightMap, lightUV, 0 );

            sectorLight.rgb += fakeContrast(normal);
            vSectorLightLevel = clamp(sectorLight.g + doomExtraLight, 0.0, 1.0);

            // faded magenta if selected for inspection
            // maybe it's better to simply have an if/else?
            vec2 insp = step(vec2(${inspectorAttributeName} - dInspect), vec2(0.0));
            doomInspectorEmissive = (1.0 - step(dot(vec2(1.0), insp), 1.0)) * vec3(1.0, 0.0, 1.0) * .1;
            `)
            .replace('#include <fog_vertex>', `
            #include <fog_vertex>
            vPlayerPos = modelViewMatrix * vec4(cameraPosition, 1.0);
            `);


        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars + `
            varying float vSectorLightLevel;
            varying vec3 doomInspectorEmissive;
            varying vec4 vPlayerPos;
            `)
            .replace('#include <map_fragment>', map_fragment)
            .replace('#include <lights_fragment_begin>', `
            #include <lights_fragment_begin>

            // Inspired heavily by:
            // https://www.doomworld.com/forum/topic/57270-things-about-doom-you-just-found-out/?do=findComment&comment=1336402
            // There is a massive wealth of information in that forum.
            float camDist = isOrthographic ? distance(vViewPosition.xy, vPlayerPos.xy) / 2.0 * vSectorLightLevel : vViewPosition.z;
            float light = clamp(vSectorLightLevel + 80.0 / (camDist + 80.0) - 0.9 * (1.0 - vSectorLightLevel), 0.0, vSectorLightLevel);
            light = isOrthographic ? light * light : ceil(light * light * 64.0) / 64.0;
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