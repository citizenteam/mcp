import archiver from 'archiver';
import { createWriteStream, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Directories and files to exclude from deployment
const EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.gitignore',
  '*.log',
  '.env',
  '.env.*',
  'dist/**',
  '.next/**',
  '.nuxt/**',
  '.cache/**',
  'coverage/**',
  '.DS_Store',
  'Thumbs.db',
];

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
    
    // Add directory with exclusions
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: EXCLUDE_PATTERNS,
      dot: true,
    });
    
    archive.finalize();
  });
}

export function readTarGz(path: string): Buffer {
  return Buffer.from(createReadStream(path).read());
}
