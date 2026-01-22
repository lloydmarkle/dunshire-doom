import { type Plugin, type MinimalPluginContextWithoutEnvironment as PluginContext } from 'vite'
import { Readable } from 'stream';
import { createHash } from 'crypto';
import path from 'path'
import fs from 'fs/promises'
import * as fflate from 'fflate';
import { WadFile } from '../src/doom/wad/wadfile';

const rethrow = (err: any) => { throw err; }
// probably this shouldn't be a vite plugin, it's a build thing, but it's convenient
// TODO: this code stinks! Definitely needs some love if we want to expand it's purpose
const remoteAssetDownloader = (params: {
  targets: {
    url: string,
    checksum: { algorithm: 'md5' | 'sha256' | 'sha512' | 'sha1', value: string },
    onComplete?: (ctx: PluginContext, filepath: string) => void,
    dest?: string, // defaults to public/remotes
  }[],
}): Plugin => {
  // TODO: we could watch the files too and redownload on change?
    let promises: Promise<any>[] = [];
  return {
    name: 'remote-asset-downloader',
    async buildEnd() {
      await Promise.all(promises);
    },
    buildStart() {
      promises = params.targets.map(target => {
        const filename = path.basename(target.url);
        target.dest = target.dest ?? path.resolve(__dirname, 'public', 'remotes', filename);

        // yes, this _could_ be await but I kind of enjoy the challenge of writing as promise chaining
        return new Promise(resolve => {
          fs.mkdir(path.dirname(target.dest))
            // TODO: it would be good to run a checksum to make sure the downloaded file is correct
            .catch(err => err.code === 'EEXIST' ? null : rethrow(err))
            .then(() => fs.open(target.dest, 'wx'))
            .then(
              file => fetch(target.url)
                .then(res => ({
                  progress: 0,
                  lastProgress: 0,
                  hash: createHash(target.checksum.algorithm),
                  total: (parseInt(res.headers.get('content-length') ?? '1')),
                  stream: Readable.from(res.body as any),
                }))
                .then(({ progress, lastProgress, hash, total, stream }) => stream
                  .addListener('data', data => {
                    hash.update(data);
                    progress += data.length;
                    // only log every 10% (ish)
                    if ((progress - lastProgress) / total > 0.1) {
                      lastProgress = progress;
                      this.info(`${filename}: progress ${Math.floor(100 * progress / total)}% (${progress} of ${total})`)
                    }
                  })
                  .addListener('close', () => {
                    const checksum = hash.digest('hex');
                    if (checksum !== target.checksum.value) {
                      throw new Error(`checksum mismatch for ${target.url}, expected ${target.checksum.value} but got ${checksum}`);
                    }
                    this.info(`downloaded ${target.url} to ${target.dest}`)
                    resolve(target?.onComplete?.(this, target.dest) ?? Promise.resolve());
                  })
                  .pipe(file.createWriteStream()))
                .catch(err => this.error(`error downloading ${filename}: ${err}`)),
              () => {
                this.info(`skip download ${filename}, file exists`);
                resolve(target?.onComplete?.(this, target.dest) ?? Promise.resolve());
              },
            );
        });
      });
    },
  };
}

export const freedoomAssetDownloader = () => remoteAssetDownloader({
  targets: [
    {
      url: 'https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip',
      dest: '_temp-downloads/freedoom-0.13.0.zip',
      checksum: { algorithm: 'sha256', value: '3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59' },
      onComplete: async (ctx, filepath) => {
        const assetPath = path.resolve(__dirname, '..', 'public', 'remotes');
        try {
          await fs.mkdir(assetPath)
        } catch (err: any) {
          if (err.code !== 'EEXIST') {
            throw err;
          }
        }

        const bytes = await fs.readFile(filepath);
        return new Promise<any>(resolve => {
          fflate.unzip(bytes, {}, (err, data) => {
            // extract freedoom1.wad, freedoom2.wad. To be more bandwidth friendly, re-zip the .wad files.
            // This means the browser will have to unzip them but that's actually good because I could
            // see zip/unzipping wads being a useful feature.
            // Also extract COPYING.txt because this is a now a binary distribution of Freedoom.
            const files = ['freedoom1.wad', 'freedoom2.wad', 'COPYING.txt'];
            let promises: Promise<any>[] = [];
            for (const zipfile of Object.keys(data)) {
              const filename = path.basename(zipfile);
              if (files.includes(filename)) {
                const targetFile = path.join(assetPath, filename);
                promises.push(extractedFileHandlers[path.extname(filename)](ctx, targetFile, data[zipfile]));
              }
            }
            resolve(Promise.all(promises));
          });
        });
      },
    },
  ],
});

const extractedFileHandlers: { [key: string]: (ctx: PluginContext, filepath: string, data: Uint8Array) => Promise<any> } = {
  '.wad': (ctx, filepath, data) => {
      const filename = path.basename(filepath);
      const targetFile = path.join(path.dirname(filepath), path.basename(filepath, path.extname(filepath)) + '.zip');
      return new Promise(resolve => {
        fflate.zip({ [filename]: data }, {}, (err, zipData) => {
          ctx.info(`extract ${filename} as ${targetFile}`)
          const p1 = fs.writeFile(targetFile, zipData);

          const wadFile = new WadFile('temp', data.buffer as ArrayBuffer);
          const lump = wadFile.lumpByName('TITLEPIC');
          const titlepic = path.join(path.dirname(filepath), path.basename(filepath, path.extname(filepath)) + '.titlepic.lump')
          ctx.info(`extract ${filename} TITLEPIC as ${titlepic}`);
          const p2 = fs.writeFile(titlepic, lump.data);
          resolve(Promise.all([p1, p2]));
        });
      })
  },
  '.txt': (ctx, filepath, data) => {
    ctx.info(`extract ${filepath}`)
    return fs.writeFile(filepath, data);
  },
};