import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import {
  collectRuntimeFiles,
  createZipBuffer,
  validateManifestAndFiles
} from '../scripts/pack.js';

test('manifest.json 满足 Chrome 应用商店基础校验且不包含开发文件', async () => {
  const { manifest, requiredPaths } = await validateManifestAndFiles();
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['history', 'storage', 'tabs']);
  assert.ok(manifest.homepage_url?.startsWith('https://'));
  assert.ok(requiredPaths.includes('popup.html'));
  assert.ok(requiredPaths.includes('background.js'));

  const runtimeFiles = await collectRuntimeFiles();
  assert.ok(runtimeFiles.includes('manifest.json'));
  assert.ok(runtimeFiles.includes('_locales/en/messages.json'));
  assert.ok(runtimeFiles.includes('lib/i18n.js'));
  assert.equal(
    runtimeFiles.some(
      (file) =>
        file.startsWith('tests/') ||
        file.startsWith('scripts/') ||
        file === 'package.json' ||
        file === 'README.md'
    ),
    false
  );
});

test('createZipBuffer 生成标准 ZIP 结构并可无损还原文件内容', async () => {
  const manifestBytes = await readFile(new URL('../manifest.json', import.meta.url));
  const smallBytes = Buffer.from('hi', 'utf8');
  const zip = createZipBuffer([
    { name: 'manifest.json', data: manifestBytes },
    { name: 'dir\\note.txt', data: smallBytes }
  ]);

  // End of central directory signature at offset length - 22
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);

  // Parse first local file header and verify inflated content matches manifest.json
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const method = zip.readUInt16LE(8);
  const compSize = zip.readUInt32LE(18);
  const nameLen = zip.readUInt16LE(26);
  const extraLen = zip.readUInt16LE(28);
  const name = zip.subarray(30, 30 + nameLen).toString('utf8');
  assert.equal(name, 'manifest.json');
  const payload = zip.subarray(30 + nameLen + extraLen, 30 + nameLen + extraLen + compSize);
  const restored = method === 8 ? inflateRawSync(payload) : payload;
  assert.deepEqual(restored, manifestBytes);

  // Verify backslash paths are normalized to forward slashes in ZIP
  assert.ok(zip.includes(Buffer.from('dir/note.txt', 'utf8')));
});
