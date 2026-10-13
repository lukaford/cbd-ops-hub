# Test the hub on your own computer

The app reads from JobTread and never changes anything there.

1. On Windows, the start file installs **Node.js** for you the first time. On a Mac, install the LTS version from https://nodejs.org.
2. Download the app while signed in to GitHub:
   https://github.com/lukaford/cbd-ops-hub/archive/refs/heads/jobtread-sync.zip
   Unzip it somewhere easy to find, like your Desktop.
3. Get a JobTread grant key from JobTread's API settings. A key for a user with view-only access is safest.
4. Open the unzipped folder and double-click:
   - Windows: `start-windows.bat` (if Windows warns about it, choose **More info**, then **Run anyway**)
   - Mac: `start-mac.command` (the first time, right-click it, choose **Open**, then **Open** again)
5. Paste your JobTread key when asked. It is saved only in a file called `.env.local` in that folder.

On Windows, the first start copies the app to `%LOCALAPPDATA%\CBD Ops Hub\app` (outside OneDrive, which corrupts running apps) and puts a **CBD Ops Hub** icon on your desktop that starts it from there; you can then delete the downloaded folder. It then installs and builds the app, which takes a few minutes. After that, your browser opens http://localhost:3000 with the board. Leave the black window open while you use it; closing it stops the app.

To update on Windows, download the new ZIP and double-click its `start-windows.bat`; it replaces the installed copy and keeps your key. To change the key, delete `.env.local` from `%LOCALAPPDATA%\CBD Ops Hub\app` and start again. To see folder detail from Manager, choose **Paste Special Orders** and paste the table.

## Putting it online

Set these in the host's environment settings:

- `DATABASE_URL`: a Postgres connection string, for example from Neon.
- `JOBTREAD_GRANT_KEY`: the JobTread key.
- `APP_PASSWORD`: the shared password people type on the sign-in page. Without it, anyone with the link can see the board.
