# E2E tests (Playwright)

Black-box tests for EPIC 7 (Facility & Issue Management), run in a real browser
against the dev servers and your local PostgreSQL database.

## Run

```bash
npm install
npx playwright install chromium
npm run test:e2e          # starts the dev servers if they are not running
npm run test:e2e:report   # open the HTML report (a video for every test)
npm run test:e2e:cleanup  # delete the issues created by tests ("E2E ..."), local DB only
```

`test:e2e:cleanup -- --dry-run` shows what would be deleted without deleting. It
skips any test issue that is not Completed or still closes a table.

If your local accounts differ from `apps/backend/prisma/seed.ts`, copy
`e2e/.env.example` to `e2e/.env` and change the values.

## Sessions

`auth.setup.ts` signs in once and saves the sessions. In a test file, pick one:

```ts
import { ADMIN_STATE, USER_STATE } from './helpers/auth';
test.use({ storageState: ADMIN_STATE }); // or USER_STATE
```

- Admin: signs in through the login page.
- User: Google OAuth can't be automated, so it uses the dev login
  `POST /api/auth/login` and stores the token like the app does.

## Rules (the database is not reset between runs)

1. **Create your own data, with unique names.** For example, put a timestamp in an
   issue description and find the row by that text.
2. **Restore anything that changes how the app behaves** (issue blocking, booking
   rules, schedules) in `afterEach`, so it runs even when the test fails.
3. **Never check a fixed number of rows.** Check that every shown row matches the
   filter, and that the row you created is (or is not) in the list.
