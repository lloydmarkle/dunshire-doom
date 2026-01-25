// A standard error class to help the UI show meaningful error messages
import { Game } from "../doom";

type BaseDoomError<N extends number, T> = {
    message: string;
    code: N;
    details: T;
};

export interface InvalidMap extends BaseDoomError<1, {
    game: Game,
    mapName: string;
    exception: Error,
}> {}

export interface MissingMap extends BaseDoomError<2, {
    game: Game,
    mapName: string;
}> {}

export interface MissingWads extends BaseDoomError<3, {
    succeededWads: string[];
    failedWads: [string, Error][];
}> {}

export interface GameLogicFailure extends BaseDoomError<4, {
    game: Game,
    exception: Error,
}> {}

export type DoomError = InvalidMap | MissingMap | MissingWads | GameLogicFailure;
export const throwDoomError = (t: DoomError) => { throw t; };