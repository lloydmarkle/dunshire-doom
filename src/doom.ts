// not sure why but I can't get doom/index.ts to work. Maybe it's an ESM thing?
// I didn't look too hard. This is a simple workaround that is easy to change
export * from './doom/wad/wadfile';
export * from './doom/wad/doomwad';
export * from './doom/wad/picture';
export * from './doom/game'
export * from './doom/map-data'
export * from './doom/map-object'
export * from './doom/map-runtime'
export * from './doom/math'
export * from './doom/things'
export * from './doom/doom-things-info'
export * from './doom/store'
export * from './doom/text'
export * from './doom/sprite'
export * from './doom/error'

export const data = {
    skills: [
        { num: 1, pic: 'M_JKILL', name: "I'm too young to die.", alias: 'ITYTD' },
        { num: 2, pic: 'M_ROUGH', name: "Hey, not too rough.", alias: 'HNTR' },
        { num: 3, pic: 'M_HURT', name: "Hurt me plenty.", alias: 'HMP' },
        { num: 4, pic: 'M_ULTRA', name: "Ultra Violence.", alias: 'UV' },
        { num: 5, pic: 'M_NMARE', name: "Nightmare!", alias: 'NM' },
    ],
}