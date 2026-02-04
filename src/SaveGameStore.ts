import { type Game, type MapExport } from "./doom";

interface BaseSaveGame {
    id?: number;
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
    mapExport?: () => Promise<MapExport>;
    saveData?: ArrayBuffer;
}
export interface SaveGame extends BaseSaveGame {
    id: number;
    mapExport: () => Promise<MapExport>;
}
interface SaveGameRecord extends BaseSaveGame {
    saveData: ArrayBuffer;
}

export class SaveGameStore {
    private db: Promise<IDBDatabase>;
    filters: Promise<[string, number][]>;

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

        this.filters = this.loadFilters();
    }

    private async loadFilters() {
        const db = await this.db;
        const store = db.transaction('saves', 'readonly').objectStore('saves');
        const req = store.openCursor();
        return new Promise<[string, number][]>((resolve, reject) => {
            const freq = new Map<string, number>();
            req.onerror = reject;
            req.onsuccess = ev => {
                const ref: IDBCursorWithValue = (ev.target as any).result;
                if (!ref) {
                    const result = [...freq.entries()]
                        .sort((a, b) => b[1] - a[1]);
                    return resolve(result);
                }

                ref.value.searchText.forEach(term => freq.set(term, (freq.get(term) ?? 0) + 1))
                ref.continue();
            }
        })
    }

    async storeGameRecord(data: MapExport, record: Omit<BaseSaveGame, 'searchText'>): Promise<SaveGameRecord> {
        const db = await this.db;
        // indexdb hack to get text search working. It's far from perfect. Maybe it's just better to filter in JS?
        const searchText = [
            ...(data.game.mapName.startsWith('MAP')
                ? ['MAP', data.game.mapName.slice(3)]
                : ['E', 'M', data.game.mapName.slice(0, 2), data.game.mapName.slice(2, 4)]),
            data.game.mapName,
            ...data.game.wads.map(e => e.toUpperCase()),
            ...record.name.toUpperCase().split(' '),
        ];
        // TODO compress? Or maybe only compress at a certain size?
        const gameBytes = new TextEncoder().encode(JSON.stringify(data)).buffer;
        const saveData: SaveGameRecord = { ...record, searchText, saveData: gameBytes };
        const tr = db.transaction('saves', 'readwrite')
            .objectStore('saves')
            .put(saveData);
        return new Promise((resolve, reject) => {
            tr.onerror = reject;
            tr.onsuccess = () => resolve(saveData);
        });
    }

    async storeGame(name: string, image: string, game: Game, data: MapExport, id?: number): Promise<SaveGameRecord> {
        return this.storeGameRecord(data, {
            ...(id && { id }),
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
        });
    }

    async loadGames(searchText: string): Promise<SaveGame[]> {
        const db = await this.db;
        const store = db.transaction('saves', 'readonly').objectStore('saves');

        const queryResults = new Map<number, SaveGame>();
        const terms = searchText.split(' ').filter(e => e.length);
        await Promise.all(terms.length
            ? terms.map(term => this.querySearchText(store, term, queryResults))
            : [this.querySearchText(store, '', queryResults)]);

        const result = [...queryResults.values()]
            .filter(e => terms.every(t => e.searchText.includes(t)))
            .sort((a, b) => b.lastModified - a.lastModified);
        result.forEach(e => e.mapExport = async () => JSON.parse(new TextDecoder().decode(e.saveData)));
        return Promise.resolve(result);
    }

    private querySearchText(store: IDBObjectStore, term: string, result: Map<number, SaveGame>) {
        const req = term.length
            ? store.index('searchText').openCursor(IDBKeyRange.only(term))
            : store.openCursor();
        return new Promise<void>((resolve, reject) => {
            req.onerror = reject;
            req.onsuccess = ev => {
                const ref: IDBCursorWithValue = (ev.target as any).result;
                if (!ref) {
                    return resolve();
                }

                if (!result.has(ref.value.id)) {
                    result.set(ref.value.id, ref.value);
                }
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
