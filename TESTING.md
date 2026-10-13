# Test the hub on your own computer

The app reads from JobTread and never changes anything there.

1. Install **Node.js** (the LTS version) from https://nodejs.org. Accept the defaults.
2. Download the app while signed in to GitHub:
   https://github.com/lukaford/cbd-ops-hub/archive/refs/heads/jobtread-sync.zip
   Unzip it somewhere easy to find, like your Desktop.
3. Get a JobTread grant key from JobTread's API settings. A key for a user with view-only access is safest.
4. Open the unzipped folder and double-click:
   - Windows: `start-windows.bat` (if Windows warns about it, choose **More info**, then **Run anyway**)
   - Mac: `start-mac.command` (the first time, right-click it, choose **Open**, then **Open** again)
5. Paste your JobTread key when asked. It is saved only in a file called `.env.local` in that folder.

The first start installs and builds the app, which takes a few minutes. After that, your browser opens http://localhost:3000 with the board. Leave the black window open while you use it; closing it stops the app.

To change the key later, delete `.env.local` and start again. To see folder detail from Manager, choose **Paste Special Orders** and paste the table.
