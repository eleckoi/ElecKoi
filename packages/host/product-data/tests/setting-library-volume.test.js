import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import productDataPlugin from '@eleckoi/dsh-product-data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { creatorCapabilities } from '../src/domain/creatorStudio/capabilities';
import { decodeCharacterCard } from '../src/domain/characterTransfer/characterCardFormats';
import { decodeSettingLibrarySnapshot } from '../src/domain/characterTransfer/portableSnapshots';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });

async function database() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-settings-volume-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(root, 'product.sqlite'));
  vi.stubEnv('ELECKOI_MEDIA_ROOT', join(root, 'media'));
  const open = async () => { const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await ctx.plugin(productDataPlugin); return ctx; };
  return { ctx: await open(), open };
}

describe('large character-card setting libraries', () => {
  it.each([101, 1_001, 10_001])('preserves %i imported entries, full text and all keywords through save, export, disk reopen and Studio capabilities', async count => {
    const probes = new Set([0, Math.floor(count / 2), count - 1]);
    const entries = Array.from({ length: count }, (_, index) => ({
      name: `合成导入条目-${index}`,
      content: `首-${index}|${probes.has(index) ? '合成𠮷'.repeat(32_769) : '合成正文'}|尾-${index}`,
      keys: Array.from({ length: probes.has(index) ? 1_501 : 2 }, (_, key) => `合成导入关键词-${index}-${key}`),
      secondary_keys: [`合成条件-${index}`], constant: index % 3 === 0,
      enabled: index !== count - 2, extensions: { scan_depth: count + index + 1 },
    }));
    const card = { spec: 'chara_card_v3', spec_version: '3.0', data: { name: '合成大量条目角色', description: '', first_mes: '合成开场', character_book: { name: '合成大量条目库', entries } } };
    const f = await database(), data = f.ctx.eleckoiProductData;
    const preview = data.prepareCharacterImports([{ displayName: 'synthetic-volume.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(card)).toString('base64') }], 'sillytavern');
    expect(preview.items[0].importable).toBe(true);
    expect(preview.items[0].warnings).toEqual([]);
    const committed = data.commitCharacterImports(preview.token);
    expect(committed.failedMessages).toEqual([]);
    const characterId = committed.importedCharacterIds[0];
    const imported = data.readSettingLibrary(characterId);
    const actual = imported.entries.filter(entry => entry.kind === 'normal');
    expect(actual).toHaveLength(count);
    for (const [index, entry] of actual.entries()) {
      const source = entries[index];
      expect(entry.title).toBe(source.name);
      expect(entry.content).toBe(source.content);
      expect(entry.enabled).toBe(source.enabled);
      expect(entry.keywordScanDepth).toBe(source.extensions.scan_depth);
      expect(entry.keywords).toEqual(source.constant ? [] : source.keys);
      expect(entry.conditionKeywords).toEqual(source.constant ? [] : source.secondary_keys);
    }
    const saved = data.saveSettingLibrary(characterId, imported);
    expect(saved.entries).toHaveLength(count);
    const exported = data.exportCharacter(characterId, 'zip');
    const decoded = decodeCharacterCard(Buffer.from(exported.base64, 'base64'), 'eleckoi');
    const portable = decodeSettingLibrarySnapshot(decoded.packageData.settingLibraryJson, characterId);
    expect(portable.entries).toHaveLength(count);
    expect(portable.entries.map(entry => ({ id: entry.id, content: entry.content, keywords: entry.keywords, conditionKeywords: entry.conditionKeywords })))
      .toEqual(saved.entries.map(entry => ({ id: entry.id, content: entry.content, keywords: entry.keywords, conditionKeywords: entry.conditionKeywords })));
    await f.ctx.fiber.dispose();
    const reopened = (await f.open()).eleckoiProductData;
    const restored = reopened.readSettingLibrary(characterId);
    expect(restored).toEqual(saved);
    const operations = new Map(creatorCapabilities(reopened).map(operation => [operation.id, operation]));
    const listed = operations.get('settings.list').execute(characterId, {});
    expect(listed.entries.map(entry => entry.id)).toEqual(saved.entries.map(entry => entry.id));
    for (const index of probes) {
      const expected = actual[index];
      const value = operations.get('settings.read').execute(characterId, { id: expected.id });
      expect(value.content).toBe(entries[index].content);
      expect(value.keywordScanDepth).toBe(entries[index].extensions.scan_depth);
      expect(value.keywords).toEqual(expected.keywords);
      expect(value.conditionKeywords).toEqual(expected.conditionKeywords);
      expect(value.content.endsWith(`|尾-${index}`)).toBe(true);
    }
  }, 120_000);
});
