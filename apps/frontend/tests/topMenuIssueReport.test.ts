import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const topMenuPath = fileURLToPath(new URL('../components/Topmenu/topMenu.tsx', import.meta.url));

test('TopMenu Report Issue sends users to the floor plan to choose a real table', async () => {
  const topMenuSource = await readFile(topMenuPath, 'utf8');

  assert.match(
    topMenuSource,
    /onClick=\{\(\)\s*=>\s*router\.push\('\/zones'\)\}/,
    'Report Issue should navigate to the floor plan'
  );
  assert.match(
    topMenuSource,
    /aria-label="Choose a table before reporting a facility issue"/,
    'the action should tell users to choose a table first'
  );
  assert.doesNotMatch(
    topMenuSource,
    /tableId\s*:\s*0/,
    'TopMenu must not submit an issue with a placeholder table ID'
  );
  assert.doesNotMatch(
    topMenuSource,
    /import\s+IssueReportModal\s+from/,
    'TopMenu must not open the report form without a selected table'
  );
});
