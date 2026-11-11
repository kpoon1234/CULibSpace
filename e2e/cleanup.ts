/**
 * Deletes the issue reports that E2E tests created (description starts with "E2E ")
 * and their admin history rows. The app has no delete API for issues, so this
 * talks to the local database directly.
 *
 *   npm run test:e2e:cleanup              # delete
 *   npm run test:e2e:cleanup -- --dry-run # only show what would be deleted
 *
 * Which database: E2E_DATABASE_URL (e.g. a deployed staging DB, set in e2e/.env),
 * otherwise DATABASE_URL from apps/backend/.env (your local DB).
 *
 * Safety: only runs against localhost, or a host listed in E2E_CLEANUP_ALLOWED_HOSTS
 * (comma-separated, exact host names). Never deletes an issue that is still open
 * or closing a table (finish it in the admin page first).
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const E2E_ENV_FILE = 'e2e/.env';
const BACKEND_ENV_FILE = 'apps/backend/.env';
const PREFIX = 'E2E ';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

if (fs.existsSync(E2E_ENV_FILE)) process.loadEnvFile(E2E_ENV_FILE);
if (!process.env.E2E_DATABASE_URL && !process.env.DATABASE_URL && fs.existsSync(BACKEND_ENV_FILE)) {
  process.loadEnvFile(BACKEND_ENV_FILE);
}
const databaseUrl = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`No database URL: set E2E_DATABASE_URL in ${E2E_ENV_FILE}, or DATABASE_URL.`);
  process.exit(1);
}

const host = new URL(databaseUrl).hostname;
const allowedHosts = [
  ...LOCAL_HOSTS,
  ...(process.env.E2E_CLEANUP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
];
if (!allowedHosts.includes(host)) {
  console.error(
    `Refusing to clean "${host}". Add it to E2E_CLEANUP_ALLOWED_HOSTS only if it is a test/staging database.`
  );
  process.exit(1);
}
console.log(`Database host: ${host}`);

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
