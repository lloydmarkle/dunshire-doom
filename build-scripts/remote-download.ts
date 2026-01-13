import { type Plugin, type MinimalPluginContextWithoutEnvironment as PluginContext } from 'vite'
import { Readable } from 'stream';
import { createHash } from 'crypto';
import path from 'path'
import fs from 'fs/promises'
import * as fflate from 'fflate';
import { WadFile } from '../src/doom';

const rethrow = (err: any) => { throw err; }
// probably this shouldn't be a vite plugin, it's a build thing, but it's convenient
const remoteAssetDownloader = (params: {
  targets: {
    url: string,
    checksum: { algorithm: 'md5' | 'sha256' | 'sha512' | 'sha1', value: string },
    onComplete?: (ctx: PluginContext, filepath: string) => void,
    dest?: string, // defaults to public/remotes
  }[],
}): Plugin => {
  // TODO: we could watch the files too and redownload on change?
  return {
    name: 'remote-asset-downloader',
    buildStart() {
      for (const target of params.targets) {
        const filename = path.basename(target.url);
        target.dest = target.dest ?? path.resolve(__dirname, 'public', 'remotes', filename);

        // yes, this _could_ be await but I kind of enjoy the challenge of writing as promise chaining
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
                  target?.onComplete(this, target.dest);
                })
                .pipe(file.createWriteStream()))
              .catch(err => this.error(`error downloading ${filename}: ${err}`)),
            () => {
              this.info(`skip download ${filename}, file exists`);
              target?.onComplete(this, target.dest);
            },
          );
      }
    }
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
        } catch (err) {
          if (err.code !== 'EEXIST') {
            throw err;
          }
        }

        const bytes = await fs.readFile(filepath);
        fflate.unzip(bytes, {}, (err, data) => {
          // extract freedoom1.wad, freedoom2.wad, and COPYING.txt because this is now a binary distribution of freedoom
          // To be more bandwidth friendly, re-zip the .wad files. This means the browser will have to unzip them
          // but that's actually good because I could see zip/unzipping wads being a useful feature.
          const files = ['freedoom1.wad', 'freedoom2.wad', 'COPYING.txt'];
          for (const zipfile of Object.keys(data)) {
            const filename = path.basename(zipfile);
            if (files.includes(filename)) {
              const targetFile = path.join(assetPath, filename);
              extractedFileHandlers[path.extname(filename)](ctx, targetFile, data[zipfile])
            }
          }
        });
      },
    },
  ],
});

const extractedFileHandlers: { [key: string]: (ctx: PluginContext, filepath: string, data: Uint8Array) => void } = {
  '.wad': (ctx, filepath, data) => {
      const filename = path.basename(filepath);
      const targetFile = path.join(path.dirname(filepath), path.basename(filepath, path.extname(filepath)) + '.zip');
      fflate.zip({ [filename]: data }, {}, (err, zipData) => {
        fs.writeFile(targetFile, zipData);
        ctx.info(`extracted ${filename} as ${targetFile}`)

        const wadFile = new WadFile('temp', data.buffer as ArrayBuffer);
        const lump = wadFile.lumpByName('TITLEPIC');
        const titlepic = path.join(path.dirname(filepath), path.basename(filepath, path.extname(filepath)) + '.titlepic.lump')
        fs.writeFile(titlepic, lump.data);
        ctx.info(`extract ${filename} TITLEPIC as ${titlepic}`);
      });
  },
  '.txt': (ctx, filepath, data) => {
      fs.writeFile(filepath, data);
      ctx.info(`extracted ${filepath}`)
  },
};