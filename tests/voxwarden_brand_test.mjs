import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { IDENTITY } from '../bridge/identity.mjs';
import { addonEntries } from '../tools/package-addon.mjs';

test('Voxwarden has an independent owner, installer, key store and update destination', () => {
  assert.equal(IDENTITY.productName, 'Voxwarden');
  assert.equal(IDENTITY.appId, 'com.voxwarden.app');
  assert.equal(IDENTITY.keychainService, 'Voxwarden');
  assert.notEqual(IDENTITY.nsisGuid, '41dade80-3a47-5a7a-986a-4e589f1545a2');
  assert.deepEqual(IDENTITY.releases, { owner: 'davrodwconnections', repo: 'voxwarden' });
  assert.match(IDENTITY.copyright, /David Rodriguez/);
  const license = fs.readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.match(license, /Copyright \(c\) 2026 chelinho139/);
  assert.match(license, /The NeverQuestAlone authors/);
  assert.match(license, /Copyright \(c\) 2026 David Rodriguez/);
});

test('the addon artifact carries Voxwarden branding, attribution and compatible saved-variable identifiers', () => {
  const { entries } = addonEntries();
  const toc = entries.find(e => e.name === 'Voxwarden/Voxwarden.toc');
  assert.ok(toc, 'the independent addon has its own folder and TOC');
  assert.match(toc.data.toString(), /## Title: Voxwarden/);
  assert.match(toc.data.toString(), /## Author: David Rodriguez/);
  assert.match(toc.data.toString(), /## SavedVariables: NQADB, NQAMapDB/);
  assert.ok(entries.some(e => e.name === 'Voxwarden/LICENSE.txt'));
  assert.ok(!entries.some(e => /brain\.sqlite|SavedVariables|api-keys|\.config\//i.test(e.name)), 'no personal state or external-addon databases ship');
  assert.ok(!entries.some(e => e.name.startsWith('NeverQuestAlone/')));
});

test('the distributed brand mark is original and the app includes its brain and voice source', () => {
  const icon = fs.readFileSync(new URL('../app/desktop/build/icon.png', import.meta.url));
  assert.notEqual(crypto.createHash('sha256').update(icon).digest('hex'), '804a727105c07e2d6df7a5af72e52e83692dd89ec59b65e64b9cf85c7a0439f6');
  assert.equal(fs.existsSync(new URL('../app/desktop/build/Assets.car', import.meta.url)), false, 'the inherited compiled art catalog is removed');
  const config = fs.readFileSync(new URL('../app/desktop/electron-builder.yml', import.meta.url), 'utf8');
  assert.match(config, /from: \.\.\/\.\.\/tools/);
  assert.match(config, /brain\/\*\*\/\*\.mjs/);
  assert.match(config, /voice\/\*\*\/\*\.mjs/);
});
