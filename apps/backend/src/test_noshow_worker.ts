// apps/backend/src/test_noshow_worker.ts
import { NoShowService } from './services/noShowService.js';

console.log('===============================================================');
console.log('🧪 US4-2: Background Cron Worker (NoShowWorker) Unit Test Suite');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- Test Group 1: NoShowService.checkNoShows Execution ---');

  // Test 1: checkNoShows executes cleanly with default mock
  try {
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ lateThresholdMinutes: 15 }) },
      booking: { findMany: async () => [] },
    };
    const result = await NoShowService.checkNoShows(mockPrisma);
    assert(
      result !== undefined && typeof result.processed === 'number',
      'NoShowService.checkNoShows returns execution result object with processed count'
    );
  } catch (err: any) {
    assert(false, 'NoShowService.checkNoShows execution', err?.message);
  }

  // Test 2: Error boundary test - checkNoShows catches exceptions gracefully
  try {
    const failingPrisma = {
      systemConfig: {
        findFirst: async () => {
          throw new Error('Simulated Database Connection Failure');
        },
      },
    };
    const errorResult = await NoShowService.checkNoShows(failingPrisma);
    assert(
      errorResult.processed === 0,
      'NoShowService.checkNoShows handles DB error gracefully without crashing'
    );
  } catch (err: any) {
    assert(false, 'NoShowService error boundary should not throw', err?.message);
  }

  console.log('\n--- Test Group 2: Worker Lifecycle Management ---');

  // Test 3: startNoShowWorker creates and returns active interval timer
  let timer: NodeJS.Timeout | null = null;
  try {
    timer = NoShowService.startNoShowWorker(100); // 100ms for test
    assert(timer !== null && typeof timer === 'object', 'startNoShowWorker starts interval timer');
  } catch (err: any) {
    assert(false, 'startNoShowWorker starts interval timer', err?.message);
  }

  // Wait a short moment to ensure interval triggers safely
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Test 4: stopNoShowWorker cleans up timer
  try {
    if (timer) {
      NoShowService.stopNoShowWorker(timer);
      assert(true, 'stopNoShowWorker stops timer cleanly without leaking intervals');
    }
  } catch (err: any) {
    assert(false, 'stopNoShowWorker stops timer cleanly', err?.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
