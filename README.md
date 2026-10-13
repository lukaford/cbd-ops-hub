# CBD Ops Hub

One place for every department at our Closets by Design location to see where each job stands.

The first piece is the **Install Readiness Board**. It reads every sold job from JobTread (Status 2.0 and Confirmed Install Date) and shows which jobs install within 14 days but are not yet in production. The **Folders** page adds per-folder step detail from a pasted Closets by Design Manager Special Orders table.

**The hub never changes anything in JobTread.** The JobTread client (`src/lib/jobtread/client.ts`) only sends read queries and refuses anything else before it leaves the app.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. To run it without a terminal, see [TESTING.md](TESTING.md).

To read from JobTread, create a grant key in JobTread's API settings (ideally for a user with view-only access) and set it as `JOBTREAD_GRANT_KEY` in `.env.local` or the host's environment settings. Never commit it. The board refreshes from JobTread when it is more than 5 minutes old, or on **Refresh from JobTread**.

For folder detail, choose **Paste Special Orders** and paste the table copied from Manager.

Without `DATABASE_URL`, data is kept in a built-in database under `.data/`. Set `DATABASE_URL` to a hosted Postgres connection string (Supabase or Neon) for a shared deployment. `SHOP_TIME_ZONE` sets the shop's time zone (default `America/New_York`).

## How JobTread is read

- Jobs on the board: any job whose Status 2.0 is Sold through Ready for Install (Complete and Unsold stay off), plus any job with a Confirmed Install Date from a week ago onward.
- "Not yet in production" means Status 2.0 is before Production, or not set.
- "Since" on a stage is when Status 2.0 was last changed in JobTread.
- When the Manager paste has a different install date for the same job number, the board flags it.

## How the paste is read

- Each folder (A, B, C…) on a job has numbered rows: 1 Folder created, 2 CAD drawings, 3 Purchasing approval, 4 Price check, 5 Folder QA, 6 Folder nested, 7 Folder scanned, 8 Job color, 9 Received by production, and 10 Final measurements.
- A step is done when Manager shows a received date. Manager often leaves earlier steps undated, so a folder's progress is its furthest dated step. Job color counts once a color is entered.
- Other rows (deco, countertops, glass) are special orders with a vendor, ETA and received date.
- Each paste replaces the last. Jobs missing from a new paste are taken off the board.

## Development

```bash
npm test            # parser and import tests (uses an in-memory database)
npm run lint        # type check
npm run db:generate # write a migration after changing src/db/schema.ts
```

The plan for the wider app (JobTread sync, Adobe Sign, department queues) lives in the project's architecture doc.
