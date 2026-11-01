import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createIssueReport } from '../lib/issues';

test('mock floor-plan data never sends an issue report POST', async () => {
  let fetchCalls = 0;

  mock.method(globalThis, 'fetch', async () => {
    fetchCalls += 1;
    throw new Error('fetch should not be called');
  });

  try {
    const result = await createIssueReport(
      { tableId: 101, issueInformation: 'Damaged table' },
      'mock'
    );

    assert.equal(result.ok, false);
    assert.equal(fetchCalls, 0);
  } finally {
    mock.restoreAll();
  }
});
