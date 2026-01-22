import type { Writable } from "svelte/store";

type MenuSettingCategory = 'normal' | 'compatibility' | 'advanced' | 'debug' | 'experimental';

const range = (cat: MenuSettingCategory, val: Writable<number>, text: string, min: number, max: number, step: number) =>
    ({ type: 'range' as 'range', cat, min, max, step, val, text });

const option = <T>(cat: MenuSettingCategory, val: Writable<T>, text: string, options: T[]) =>
    ({ type: 'option' as 'option', cat, options, val, text });

const color = (cat: MenuSettingCategory, val: Writable<string>, text: string) =>
    ({ type: 'color' as 'color', cat, val, text });

const toggle = (cat: MenuSettingCategory, val: Writable<boolean>, text: string) =>
    ({ type: 'toggle' as 'toggle', cat, val, text });

export const menuSetting = { range, option, color, toggle };
export type MenuSetting = ReturnType<typeof range> | ReturnType<typeof option<any>> | ReturnType<typeof toggle> | ReturnType<typeof color>;
