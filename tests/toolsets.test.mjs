import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTools, tools } from '../src/tool_handler.ts';

test('tool groups preserve full inventory and expose only selected groups', () => {
  assert.deepEqual(selectTools('all'), tools.filter(t => t.name !== 'manage_consultant_project'));
  assert.ok(selectTools('consultant').some(t => t.name === 'manage_consultant_project'));
  assert.ok(!selectTools('all').some(t => t.name === 'manage_consultant_project'));
  const combined = selectTools('query,data,config,deploy,diagnostics,consultant');
  assert.deepEqual(new Set(combined.map(t => t.name)), new Set(tools.map(t => t.name)));
  const query = selectTools('query');
  assert.ok(query.some(t => t.name === 'query_by_fetchxml'));
  assert.ok(!query.some(t => t.name === 'publish_sitemap'));
  assert.deepEqual(selectTools('query,query'), query);
  assert.throws(() => selectTools('query,unknown'), /unknown groups/);
  assert.throws(() => selectTools('all,query'), /cannot be combined/);
});
