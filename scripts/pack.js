import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RUNTIME_ROOT_FILES = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'styles.css'
];

const RUNTIME_DIRS = ['lib', 'icons', '_locales'];

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function listFilesRecursive(baseDir, relativePrefix = '') {
  const entries = await readdir(baseDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, relPath)));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

export async function collectRuntimeFiles(rootDir = ROOT_DIR) {
  const files = [...RUNTIME_ROOT_FILES];
  for (const dir of RUNTIME_DIRS) {
    const dirPath = path.join(rootDir, dir);
    const nested = await listFilesRecursive(dirPath, dir);
    files.push(...nested);
  }
  return files;
}

export async function validateManifestAndFiles(rootDir = ROOT_DIR) {
  const manifestPath = path.join(rootDir, 'manifest.json');
  const pkgPath = path.join(rootDir, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));

  if (manifest.manifest_version !== 3) {
    throw new Error(`Expected manifest_version 3, got ${manifest.manifest_version}`);
  }
  if (!/^\d+(\.\d+){0,3}$/.test(String(manifest.version || ''))) {
    throw new Error(`Invalid extension version in manifest.json: ${manifest.version}`);
  }
  if (pkg.version !== manifest.version) {
    throw new Error(`Version mismatch: package.json=${pkg.version}, manifest.json=${manifest.version}`);
  }

  const perms = new Set(manifest.permissions || []);
  if (perms.has('tabs') && perms.has('activeTab')) {
    throw new Error('Redundant activeTab permission alongside tabs permission');
  }

  const requiredPaths = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ].filter(Boolean);

  if (manifest.default_locale) {
    requiredPaths.push(`_locales/${manifest.default_locale}/messages.json`);
  }

  for (const relPath of requiredPaths) {
    const info = await stat(path.join(rootDir, relPath));
    if (!info.isFile()) {
      throw new Error(`Missing required manifest asset: ${relPath}`);
    }
  }

  return { manifest, requiredPaths };
}

/**
 * Create a standard ZIP archive buffer with forward-slash paths and deflate compression.
 */
export function createZipBuffer(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const fileName = name.replace(/\\/g, '/');
    const nameBuf = Buffer.from(fileName, 'utf8');
    const rawBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const compressedBuf = deflateRawSync(rawBuf, { level: 9 });
    const useDeflate = compressedBuf.length < rawBuf.length;
    const payload = useDeflate ? compressedBuf : rawBuf;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(rawBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5421, 12); // mod date (fixed deterministic date)
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, endRecord]);
}

export async function packExtension(rootDir = ROOT_DIR) {
  const { manifest } = await validateManifestAndFiles(rootDir);
  const runtimeFiles = await collectRuntimeFiles(rootDir);

  const distDir = path.join(rootDir, 'dist');
  const unpackedDir = path.join(distDir, 'unpacked');
  const zipName = `historyguard-v${manifest.version}.zip`;
  const zipPath = path.join(distDir, zipName);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(unpackedDir, { recursive: true });

  const entries = [];
  for (const relPath of runtimeFiles) {
    const src = path.join(rootDir, relPath);
    const dest = path.join(unpackedDir, relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest);
    entries.push({
      name: relPath,
      data: await readFile(src)
    });
  }

  const zipBuffer = createZipBuffer(entries);
  await writeFile(zipPath, zipBuffer);

  return {
    version: manifest.version,
    fileCount: entries.length,
    files: runtimeFiles,
    unpackedDir,
    zipPath,
    zipBytes: zipBuffer.length
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packExtension();
  console.log(
    `Packed HistoryGuard v${result.version}: ${result.fileCount} files -> ${path.relative(ROOT_DIR, result.zipPath)} (${result.zipBytes} bytes)`
  );
}
