const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/knowledge.js'), 'utf8'), context);
const kb = context.window.ORACLE_KNOWLEDGE;

test('every technical rule and fact resolves its source identifiers without duplicate identities', () => {
  const sources = new Set(kb.sources.map(source => source.id));
  assert.equal(sources.size, kb.sources.length);
  for (const collection of [kb.rules, kb.facts]) {
    assert.equal(new Set(collection.map(item => item.id)).size, collection.length);
    for (const item of collection) {
      for (const id of item.sourceIds || []) assert.ok(sources.has(id), `${item.id}: ${id}`);
    }
  }
});

test('local source summaries never masquerade as retained original manuals', () => {
  for (const source of kb.sources) {
    assert.equal(source.originalAvailable, false, source.id);
    assert.equal(source.indexed, false, source.id);
    assert.equal(source.localSummaryAvailable, true, source.id);
    assert.ok(source.referenceName || /^https:\/\//.test(source.url), source.id);
    assert.ok(source.referenceYears[0] <= source.referenceYears[1], source.id);
    if (source.provenance === 'local-reference') {
      assert.ok(source.referenceName.endsWith('.pdf'), source.id);
      assert.equal(source.sha256, undefined, 'do not invent an original-file hash');
    }
  }
});

test('specific manufacturer codes remain scoped and exact values retain source attribution', () => {
  for (const [code, entry] of Object.entries(kb.dtcs)) {
    assert.match(code, /^(?:[PBCU][0-3][0-9A-F]{3}|DF\d{3,4})$/);
    if (code.startsWith('DF')) assert.ok(entry.scope?.length, code);
  }
  for (const fact of kb.facts) {
    assert.ok(fact.sourceIds?.length, fact.id);
    assert.ok(fact.models?.length, fact.id);
    assert.ok(fact.brands?.length, fact.id);
  }
});
