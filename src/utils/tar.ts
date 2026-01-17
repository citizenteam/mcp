import archiver from 'archiver';
import { createWriteStream, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export async function createTarGz(sourceDir: string, outputPath?: string): Promise<string> {
  const output = outputPath || join(tmpdir(), `deploy-${Date.now()}.tar.gz`);

  return new Promise((resolve, reject) => {
    const outputStream = createWriteStream(output);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 9
      }
    });

    outputStream.on('close', () => {
      resolve(output);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(outputStream);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export function readTarGz(path: string): Buffer {
  return Buffer.from(createReadStream(path).read());
}
