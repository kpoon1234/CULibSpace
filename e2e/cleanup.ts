/**
 * Deletes the issue reports that E2E tests created (description starts with "E2E ")
 * and their admin history rows. The app has no delete API for issues, so this
 * talks to the local database directly.
 *
 *   npm run test:e2e:cleanup              # delete
 *   npm run test:e2e:cleanup -- --dry-run # only show what would be deleted
 *
 * Safety: only runs against a database on localhost, and never deletes an issue
 * that is still open or closing a table (finish it in the admin page first).
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const ENV_FILE = 'apps/backend/.env';
const PREFIX = 'E2E ';

if (!process.env.DATABASE_URL && fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`DATABASE_URL is not set (looked in ${ENV_FILE}).`);
  process.exit(1);
}

const host = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to clean "${host}": this script only runs against a local database.`);
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

async function main() {
  const testIssues = await prisma.issueReport.findMany({
    where: { issueInformation: { startsWith: PREFIX } },
    select: { issueId: true, status: true, blocksTable: true },
  });
  const active = testIssues.filter((i) => i.status !== 'COMPLETED' || i.blocksTable);
  const ids = testIssues.filter((i) => !active.includes(i)).map((i) => i.issueId);
  const historyRows = await prisma.manageIssue.count({ where: { issueId: { in: ids } } });

  console.log(`Test issues found: ${testIssues.length}`);
  console.log(`  to delete: ${ids.length} issues + ${historyRows} admin history rows`);
  if (active.length > 0) {
    console.log(
      `  skipped (not Completed, or closing a table): ${active.map((i) => `#${i.issueId}`).join(', ')}`
    );
  }

  if (dryRun) {
    console.log('Dry run: nothing deleted.');
  } else if (ids.length > 0) {
    const [history, issues] = await prisma.$transaction([
      prisma.manageIssue.deleteMany({ where: { issueId: { in: ids } } }),
      prisma.issueReport.deleteMany({ where: { issueId: { in: ids } } }),
    ]);
    console.log(`Deleted ${issues.count} issues and ${history.count} admin history rows.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
