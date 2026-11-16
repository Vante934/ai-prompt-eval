/**
 * Route tests for comparison dataset hard-fail (P0).
 *
 * Verifies GET /api/eval/:id/table (JSON/CSV/JSON-export) and metadata-keys
 * reject mismatched or missing datasetIds with HTTP 409 + COMPARISON_DATASET_MISMATCH.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../../src/models/eval';
import { createApp } from '../../../src/server/server';
import { runDbMigrations } from '../../../src/migrate';
import EvalFactory from '../../factories/evalFactory';
import { clearEvalTables } from '../../util/evalDb';
import { setupTestServer } from '../../util/testServer';
import { createMixedResultOptions } from '../../factories/literalFixtures';

async function createEvalWithTests(
  tests: Array<{ vars: Record<string, string> }>,
): Promise<Eval> {
  const eval_ = await Eval.create(
    {
      providers: [{ id: 'test-provider' }],
      prompts: ['Prompt {{q}}'],
      tests,
    },
    [{ raw: 'Prompt {{q}}', label: 'Prompt {{q}}' }],
  );

  await eval_.addPrompts([
    {
      raw: 'Prompt {{q}}',
      label: 'Prompt {{q}}',
      provider: 'test-provider',
      metrics: {
        score: 1,
        testPassCount: tests.length,
        testFailCount: 0,
        testErrorCount: 0,
        assertPassCount: tests.length,
        assertFailCount: 0,
        totalLatencyMs: 100,
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        namedScores: {},
        namedScoresCount: {},
        redteam: {
          pluginPassCount: {},
          pluginFailCount: {},
          strategyPassCount: {},
          strategyFailCount: {},
        },
        cost: 0,
      },
    },
  ]);

  for (let i = 0; i < tests.length; i++) {
    await eval_.addResult({
      description: `row-${i}`,
      promptIdx: 0,
      testIdx: i,
      testCase: { vars: tests[i].vars },
      promptId: 'test-prompt',
      provider: { id: 'test-provider', label: 'test-label' },
      prompt: { raw: 'Prompt {{q}}', label: 'Prompt {{q}}' },
      vars: tests[i].vars,
      response: {
        output: String(Object.values(tests[i].vars)[0] ?? ''),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      },
      error: null,
      failureReason: 0,
      success: true,
      score: 1,
      latencyMs: 10,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'ok',
        namedScores: {},
        tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
        componentResults: [],
      },
      namedScores: {},
      cost: 0,
      metadata: {},
    });
  }

  return (await Eval.findById(eval_.id)) as Eval;
}

describe('GET /api/eval/:id/table - comparison dataset hard-fail', () => {
  const api = setupTestServer(createApp, runDbMigrations);

  beforeEach(() => clearEvalTables(() => vi.resetAllMocks()));
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 and merges columns for same-dataset comparisons', async () => {
    const eval1 = await EvalFactory.create(createMixedResultOptions(4));
    const eval2 = await EvalFactory.create(createMixedResultOptions(4));

    expect(eval1.datasetId).toBeDefined();
    expect(eval2.datasetId).toBe(eval1.datasetId);

    const response = await api.get(`/api/eval/${eval1.id}/table`).query({
      comparisonEvalIds: eval2.id,
      limit: 50,
      offset: 0,
    });

    expect(response.status).toBe(200);
    expect(response.body.table.head.prompts.length).toBeGreaterThan(1);
    expect(response.body.filteredMetrics).toBeNull();
  });

  it('returns 409 COMPARISON_DATASET_MISMATCH for different datasets', async () => {
    const sameA = await createEvalWithTests([
      { vars: { q: 'alpha' } },
      { vars: { q: 'beta' } },
      { vars: { q: 'gamma' } },
    ]);
    const diffDs = await createEvalWithTests([{ vars: { q: 'one' } }, { vars: { q: 'two' } }]);

    expect(sameA.datasetId).toBeDefined();
    expect(diffDs.datasetId).toBeDefined();
    expect(diffDs.datasetId).not.toBe(sameA.datasetId);

    const response = await api.get(`/api/eval/${sameA.id}/table`).query({
      comparisonEvalIds: diffDs.id,
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'Comparison eval dataset mismatch',
      code: 'COMPARISON_DATASET_MISMATCH',
      mainEvalId: sameA.id,
      mainDatasetId: sameA.datasetId,
      mismatches: [
        {
          comparisonEvalId: diffDs.id,
          comparisonDatasetId: diffDs.datasetId,
          reason: 'dataset_id_mismatch',
        },
      ],
    });
    expect(response.body.table).toBeUndefined();
  });

  it('returns 409 for reordered tests (different dataset hash)', async () => {
    const sameA = await createEvalWithTests([
      { vars: { q: 'alpha' } },
      { vars: { q: 'beta' } },
      { vars: { q: 'gamma' } },
    ]);
    const reordered = await createEvalWithTests([
      { vars: { q: 'gamma' } },
      { vars: { q: 'alpha' } },
      { vars: { q: 'beta' } },
    ]);

    expect(reordered.datasetId).not.toBe(sameA.datasetId);

    const response = await api.get(`/api/eval/${sameA.id}/table`).query({
      comparisonEvalIds: reordered.id,
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COMPARISON_DATASET_MISMATCH');
    expect(response.body.mismatches[0].reason).toBe('dataset_id_mismatch');
  });

  it('returns 404 when a comparison eval does not exist', async () => {
    const eval_ = await EvalFactory.create(createMixedResultOptions(2));

    const response = await api.get(`/api/eval/${eval_.id}/table`).query({
      comparisonEvalIds: 'eval-does-not-exist',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Comparison eval not found' });
  });

  it('returns 409 JSON (not CSV) for format=csv with different datasets', async () => {
    const sameA = await createEvalWithTests([
      { vars: { q: 'alpha' } },
      { vars: { q: 'beta' } },
    ]);
    const diffDs = await createEvalWithTests([{ vars: { q: 'one' } }, { vars: { q: 'two' } }]);

    const response = await api.get(`/api/eval/${sameA.id}/table`).query({
      format: 'csv',
      comparisonEvalIds: diffDs.id,
    });

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.code).toBe('COMPARISON_DATASET_MISMATCH');
  });

  it('returns 409 for format=json with different datasets', async () => {
    const sameA = await createEvalWithTests([
      { vars: { q: 'alpha' } },
      { vars: { q: 'beta' } },
    ]);
    const diffDs = await createEvalWithTests([{ vars: { q: 'one' } }, { vars: { q: 'two' } }]);

    const response = await api.get(`/api/eval/${sameA.id}/table`).query({
      format: 'json',
      comparisonEvalIds: diffDs.id,
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COMPARISON_DATASET_MISMATCH');
  });

  it('returns 409 for metadata-keys with different datasets', async () => {
    const sameA = await createEvalWithTests([
      { vars: { q: 'alpha' } },
      { vars: { q: 'beta' } },
    ]);
    const diffDs = await createEvalWithTests([{ vars: { q: 'one' } }, { vars: { q: 'two' } }]);

    const response = await api.get(`/api/eval/${sameA.id}/metadata-keys`).query({
      comparisonEvalIds: diffDs.id,
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COMPARISON_DATASET_MISMATCH');
  });

  it('keeps metadata-keys 400 when comparison eval is missing', async () => {
    const eval_ = await EvalFactory.create(createMixedResultOptions(2));

    const response = await api.get(`/api/eval/${eval_.id}/metadata-keys`).query({
      comparisonEvalIds: 'eval-does-not-exist',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Comparison evals not found');
  });
});
