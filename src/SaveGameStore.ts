import { type Game, type MapExport } from "./doom";

interface BaseSaveGame {
    name: string;
    image: string;
    wads: string[];
    skill: number;
    time: number;
    searchText: string[];
    lastModified: number;
    mapInfo: {
        name: string;
        kills: number;
        totalKills: number;
        secrets: number;
        totalSecrets: number;
        items: number;
        totalItems: number;
        time: number;
    };
}
export interface SaveGame extends BaseSaveGame {
    id: number;
    mapExport: MapExport;
}
interface SaveGameRecord extends BaseSaveGame {
    id?: number;
    saveData: ArrayBuffer;
}

export class SaveGameStore {
    private db: Promise<IDBDatabase>;

    constructor() {
        const dbRequest = indexedDB.open('doom-saves', 1);
        this.db = new Promise<IDBDatabase>((resolve, reject) => {
            dbRequest.onupgradeneeded = ev => {
                const db: IDBDatabase = (ev.target as any).result;
                if (!db.objectStoreNames.contains('saves')) {
                    const store = db.createObjectStore('saves', { keyPath: 'id', autoIncrement: true, });
                    store.createIndex('searchText', 'searchText', { multiEntry: true });
                }
            };
            dbRequest.onsuccess = ev => resolve((ev.target as any).result);
            dbRequest.onerror = reject;
        });
    }

    async storeGame(name: string, image: string, game: Game, data: MapExport, id?: number): Promise<SaveGameRecord> {
        const db = await this.db;
        // indexdb hack to get text search working. It's far from perfect. Maybe it's just better to filter in JS?
        const searchText = [
            ...(data.game.mapName.startsWith('MAP')
                ? ['MAP', data.game.mapName.slice(3)]
                : ['E', 'M', data.game.mapName.slice(0, 2), data.game.mapName.slice(2, 4)]),
            data.game.mapName,
            ...data.game.wads.map(e => e.toUpperCase()),
            name.toUpperCase(),
        ];
        // TODO compress? Or maybe only compress at a certain size?
        const gameBytes = new TextEncoder().encode(JSON.stringify(data)).buffer;
        const saveData: SaveGameRecord = {
            ...(id && { id }),
            searchText,
            name,
            image,
            lastModified: new Date().getTime(),
            skill: game.skill,
            time: game.time.elapsed,
            wads: data.game.wads,
            mapInfo: {
                name: data.game.mapName,
                items: data.player.stats.items,
                totalItems: game.map.val.stats.totalItems,
                kills: data.player.stats.kills,
                totalKills: game.map.val.stats.totalKills,
                secrets: data.player.stats.secrets,
                totalSecrets: game.map.val.stats.totalSecrets,
                time: game.map.val.stats.elapsedTime,
            },
            saveData: gameBytes,
        };
        const tr = db.transaction('saves', 'readwrite')
            .objectStore('saves')
            .put(saveData);
        return new Promise((resolve, reject) => {
            tr.onsuccess = () => resolve(saveData);
            tr.onerror = reject;
        });
    }

    async loadGames(searchText: string): Promise<SaveGame[]> {
        const db = await this.db;
        const store = db.transaction('saves', 'readonly').objectStore('saves');

        let result: SaveGame[] = [];
        const req = searchText.length
            ? store.index('searchText').openCursor(IDBKeyRange.only(searchText))
            : store.openCursor();
        return new Promise((resolve, reject) => {
            req.onerror = reject;
            req.onsuccess = ev => {
                const ref: IDBCursorWithValue = (ev.target as any).result;
                if (!ref) {
                    result.sort((a, b) => b.lastModified - a.lastModified);
                    return resolve(result);
                }

                ref.value.mapExport = JSON.parse(new TextDecoder().decode(ref.value.saveData));
                result.push(ref.value)
                ref.continue();
            }
        });
    }

    async deleteGame(id: number) {
        const db = await this.db;
        const store = db.transaction('saves', 'readwrite').objectStore('saves');
        const req = store.delete(id);
        return new Promise<void>((resolve, reject) => {
            req.onerror = reject;
            req.onsuccess = () => resolve();
        });
    }
}
