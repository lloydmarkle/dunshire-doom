<script lang="ts">
    import { Color, CubeTexture, DataTexture, NearestFilter, SRGBColorSpace } from "three";
    import { useAppContext, useDoom, useDoomMap } from "../DoomContext";
    import { T, useThrelte } from "@threlte/core";
    import { randInt } from "three/src/math/MathUtils";

    const { scene } = useThrelte();
    const { textures } = useDoom();
    const { map, skyColor } = useDoomMap();
    const lightScale = useAppContext().settings.lightScale;

    const sky1 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'].map(e => `MAP${e}`);
    const sky2 = ['12', '13', '14', '15', '16', '17', '18', '19', '20'].map(e => `MAP${e}`);
    const sky3 = ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32'].map(e => `MAP${e}`);
    const textureName =
        map.name.startsWith('E1') || sky1.includes(map.name) ? 'SKY1' :
        map.name.startsWith('E2') || sky2.includes(map.name) ? 'SKY2' :
        map.name.startsWith('E3') || sky3.includes(map.name) ? 'SKY3' :
        map.name.startsWith('E4') ? 'SKY4' :
        'SKY1'
    const sky = textures.get(textureName, 'wall');
    const pic = (sky as DataTexture).image.data;

    // doom and doom2 sky textures are 256x128 and plutonia and tnt are larger (1024x128 or 512x128)
    // and heretic/hexen are more complicated https://doomwiki.org/wiki/Sky.
    // for our purpose, we want a 256x256 texture and just pasting the texture twice didn't look right. So we
    // offset the top a little and mirror the picture about halfway down.
    const width = 256;
    const height = 256;
    const size = width * height;
    // offset the texture from the top of the screen to look "about right"
    const topOffset = 45;
    const midY = 128 - 1;
    // use avergae top row to form top and bottom of cubemap
    const topRowAvgColor = new Color(0, 0, 0);
    // average of whole sky texture (in case we want to highlight outdoor areas?)
    const skyAvgColor = new Color(0, 0, 0);

    let skyWalls: DataTexture[] = [];
    let buff: Uint8ClampedArray;
    let c = 0;
    const widthRatio = sky.userData.width / width;
    for (let k = 0; k < widthRatio; k++) {
        // for TNT, it feels like we need to rotate 45deg but that's kind of a pain so I'm just living with a little less quality
        const kOffset = width * k;
        buff = new Uint8ClampedArray(4 * size);

        for (let i = 0; i < width; i++) {
            for (let j = 0; j < height; j++) {
                // add noise to the section above topOffset
                const noise = j < topOffset ? randInt(0, 3) : 0;
                const textureY =
                    j < topOffset ? 0 : // use top row of picture
                    j > topOffset + midY ? midY - (j - topOffset - midY) + 1 : // <-- reflection
                    j - topOffset; // use image y location
                const pidx = (textureY * sky.userData.width) + kOffset + i + noise;
                const idx = j * width + i;
                buff[idx * 4 + 0] = pic[pidx * 4 + 0];
                buff[idx * 4 + 1] = pic[pidx * 4 + 1];
                buff[idx * 4 + 2] = pic[pidx * 4 + 2];
                buff[idx * 4 + 3] = pic[pidx * 4 + 3];

                // don't use 0 here because the first topOffset rows will be 0 and we won't get a meaningful average
                if (textureY === 1) {
                    topRowAvgColor.r += pic[pidx * 4 + 0] * pic[pidx * 4 + 0];
                    topRowAvgColor.g += pic[pidx * 4 + 1] * pic[pidx * 4 + 1];
                    topRowAvgColor.b += pic[pidx * 4 + 2] * pic[pidx * 4 + 2];
                }
                if (j > topOffset && j < topOffset + midY) {
                    c++
                    skyAvgColor.r += pic[pidx * 4 + 0] * pic[pidx * 4 + 0];
                    skyAvgColor.g += pic[pidx * 4 + 1] * pic[pidx * 4 + 1];
                    skyAvgColor.b += pic[pidx * 4 + 2] * pic[pidx * 4 + 2];
                }
            }
        }
        skyWalls[k] = new DataTexture(buff, width, height);
    }

    // why sqrt? https://sighack.com/post/averaging-rgb-colors-the-right-way
    topRowAvgColor.r = Math.sqrt(topRowAvgColor.r / sky.userData.width);
    topRowAvgColor.g = Math.sqrt(topRowAvgColor.g / sky.userData.width);
    topRowAvgColor.b = Math.sqrt(topRowAvgColor.b / sky.userData.width);
    // divide by 256 because we want range 0-1
    skyAvgColor.r = Math.sqrt(skyAvgColor.r / size / 2) / 256;
    skyAvgColor.g = Math.sqrt(skyAvgColor.g / size / 2) / 256;
    skyAvgColor.b = Math.sqrt(skyAvgColor.b / size / 2) / 256;
    skyColor.set(skyAvgColor);

    // add fade to make the top and bottom transition more subtle
    for (const wall of skyWalls) {
        buff = wall.image.data;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < topOffset; j++) {
                let idx = j * width + i;
                const weight = 1 - (j / topOffset) * (j / topOffset);
                // mixing colors isn't straightforward https://stackoverflow.com/questions/4255973
                // (see also the sqr/sqrt stuff above)
                // fortunately threejs has a class to help
                let c = new Color(buff[idx * 4 + 0], buff[idx * 4 + 1], buff[idx * 4 + 2]);
                c.lerp(topRowAvgColor, weight);
                buff[idx * 4 + 0] = c.r;
                buff[idx * 4 + 1] = c.g;
                buff[idx * 4 + 2] = c.b;

                // bottom
                idx = (height - j) * width + i;
                c = new Color(buff[idx * 4 + 0], buff[idx * 4 + 1], buff[idx * 4 + 2]);
                c.lerp(topRowAvgColor, weight);
                buff[idx * 4 + 0] = c.r;
                buff[idx * 4 + 1] = c.g;
                buff[idx * 4 + 2] = c.b;
            }
        }
    }

    // doom1 and doom2 use 256 width skies so copy to other walls
    if (widthRatio === 1) {
        skyWalls[3] = skyWalls[2] = skyWalls[1] = skyWalls[0];
    }
    // plutonia has some 512 width skies (two different walls) so repeat them
    if (widthRatio === 2) {
        skyWalls[2] = skyWalls[0];
        skyWalls[3] = skyWalls[1];
    }

    buff = new Uint8ClampedArray(4 * size);
    for (let i = 0; i < size; i++) {
        buff[i * 4 + 0] = topRowAvgColor.r;
        buff[i * 4 + 1] = topRowAvgColor.g;
        buff[i * 4 + 2] = topRowAvgColor.b;
        buff[i * 4 + 3] = 255;
    }
    const skyTop = new DataTexture(buff, width, height);

    // we need to hand-rotate textures if we don't use the 0,1,0 up vector
    // https://github.com/mrdoob/three.js/issues/16328
    // using 0,0,1 up vector makes the rendering code is easier to work with so it's worth this little block
    function rotate(texture: DataTexture, turns: 1 | 2 | 3) {
        let buff = new Uint8ClampedArray(4 * size);
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < height; j++) {
                const src = j * width + i;
                const out =
                    turns === 1 ? (width - i - 1) * width + j :
                    turns === 2 ? i * width + (height - j):
                    (height - j - 1) * width + (width - i - 1);
                buff[out * 4 + 0] = texture.image.data[src * 4 + 0];
                buff[out * 4 + 1] = texture.image.data[src * 4 + 1];
                buff[out * 4 + 2] = texture.image.data[src * 4 + 2];
                buff[out * 4 + 3] = texture.image.data[src * 4 + 3];
            }
        }
        return new DataTexture(buff, width, height);
    }

    const tx = new CubeTexture([
        // positive-x, negative-x (then y, then z)
        rotate(skyWalls[1], 1), rotate(skyWalls[3], 2),
        rotate(skyWalls[2], 3), skyWalls[0],
        skyTop, skyTop,
    ]);
    tx.colorSpace = SRGBColorSpace;
    tx.needsUpdate = true;
    tx.magFilter = NearestFilter
    scene.background = tx;
    // scene.background = new Color('magenta');
</script>

<T.AmbientLight color={'white'} intensity={4 * $lightScale} />