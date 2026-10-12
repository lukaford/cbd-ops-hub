# CBD Ops Hub

One place for every department at our Closets by Design location to see where each job stands.

The first piece is the **Install Readiness Board**. Front office pastes the Special Orders table from Closets by Design Manager, and the board shows every production folder by its firm install date, the step it is waiting on, and which folders install within 14 days but are not yet received by production.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, choose **Paste Special Orders**, and paste the table copied from Manager.

Without `DATABASE_URL`, data is kept in a built-in database under `.data/`. Set `DATABASE_URL` to a hosted Postgres connection string (Supabase or Neon) for a shared deployment. `SHOP_TIME_ZONE` sets the shop's time zone (default `America/New_York`).

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
