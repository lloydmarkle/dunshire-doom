<script lang="ts">
    import { DoomWad } from '../doom';

    export let wad: DoomWad;

    let viewSize = { width: 1024, height: 600 };
    // FIXME: this still needs some work for mobile screens in portrait orientation
    $: style = [
        `transform: scale(${Math.min(viewSize.width / 800, viewSize.height / 400)})`,
        `transform-origin: top`,
    ].join(';');

    // mapping from https://en.wikipedia.org/wiki/Code_page_437 to unicode
    // There are a couple characters I'm not sure about: 124, 127
    const cp437 = [
        0X0020, 0X263A, 0X263B, 0X2665, 0X2666, 0X2663, 0X2660, 0X2022, 0X25D8, 0X25CB, 0X25D9, 0X2642, 0X2640, 0X266A, 0X266B, 0X263C,
        0X25BA, 0X25C4, 0X2195, 0X203C, 0X00B6, 0X00A7, 0X25AC, 0X21A8, 0X2191, 0X2193, 0X2192, 0X2190, 0X221F, 0X2194, 0X25B2, 0X25BC,
        0X0020, 0X0021, 0X0022, 0X0023, 0X0024, 0X0025, 0X0026, 0X0027, 0X0028, 0X0029, 0X002A, 0X002B, 0X002C, 0X002D, 0X002E, 0X002F,
        0x0030, 0X0031, 0X0032, 0X0033, 0X0034, 0X0035, 0X0036, 0X0037, 0X0038, 0X0039, 0X003A, 0X003B, 0X003C, 0X003D, 0X003E, 0X003F,
        0x0040, 0X0041, 0X0042, 0X0043, 0X0044, 0X0045, 0X0046, 0X0047, 0X0048, 0X0049, 0X004A, 0X004B, 0X004C, 0X004D, 0X004E, 0X004F,
        0x0050, 0X0051, 0x0052, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057, 0x0058, 0x0059, 0x005A, 0x005B, 0x005C, 0x005D, 0x005E, 0x005F,
        0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067, 0x0068, 0x0069, 0x006A, 0x006B, 0x006C, 0x006D, 0x006E, 0x006F,
        0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077, 0x0078, 0x0079, 0x007A, 0x007B, 0x007C, 0x007D, 0x007E, 0x2302,
        0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7, 0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
        0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9, 0x00FF, 0x00D6, 0x00DC, 0x00A2, 0x00A3, 0x00A5, 0x20A7, 0x0192,
        0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA, 0x00BF, 0x2310, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
        0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255D, 0x255C, 0x255B, 0x2510,
        0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x255E, 0x255F, 0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x2567,
        0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256B, 0x256A, 0x2518, 0x250C, 0x2588, 0x2584, 0x258C, 0x2590, 0x2580,
        0x03B1, 0x00DF, 0x0393, 0x03C0, 0x03A3, 0x03C3, 0x00B5, 0x03C4, 0x03A6, 0x0398, 0x03A9, 0x03B4, 0x221E, 0x03C6, 0x03B5, 0x2229,
        0x2261, 0x00B1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00F7, 0x2248, 0x00B0, 0x2219, 0x00B7, 0x221A, 0x207F, 0x00B2, 0x25A0, 0x00A0,
    ].map(c => String.fromCodePoint(c));
    const colours = [
        '#000000', '#0000AA', '#00AA00', '#00AAAA',
        '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
        '#555555', '#5555FF', '#55FF55', '#55FFFF',
        '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF',
    ];

    // Fun! https://doomwiki.org/wiki/ENDOOM
    $: bytes = wad.lumpByName('ENDOOM').data;
    $: values = Array.from(bytes).map((_, i, arr) => i % 2 ? null : [arr[i], arr[i + 1]]).filter(e => e);
</script>

<div
    class="h-full w-full bg-black"
    bind:clientHeight={viewSize.height}
    bind:clientWidth={viewSize.width}
>
    <div class="flex justify-around">
        <div class="grid-80x25" style="{style}">
            {#each values as [char, col]}
                {@const style = `
                    background:${colours[(col >> 4) & 0x7]};
                    color:${colours[col & 0xf]};
                `}
                <span class="box" {style}>
                    <span class:blink={col & 0x80}>{cp437[char]}</span>
                </span>
            {/each}
        </div>
    </div>
</div>

<style>
    .grid-80x25 {
        display: grid;
        grid-template-rows: repeat(25, 1fr);
        grid-template-columns: repeat(80, 1fr);

        font-family: monospace;
        line-height: 1rem;
    }
    .box {
        display: inline-block;
    }
    .blink {
        animation: blink-frames .4s steps(1) infinite;
    }
    @keyframes blink-frames {
        0% { opacity: 0 }
        50% { opacity: 1 }
        100% { opacity: 0 }
    }
</style>