# Manga Archive App

A dependency-free local web app for tracking manga entries.

## Share Online (Cloud Hosting)

This project is configured to deploy to GitHub Pages using:
`/.github/workflows/deploy-pages.yml`

Do this once:

1. Create a new GitHub repository for `manga-archive-app`.
2. Push this folder to the `main` branch.
3. In GitHub: `Settings -> Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Wait for `Deploy Manga Archive To Pages` to finish.

Your app URL will be:
`https://<your-github-username>.github.io/<repo-name>/`

## Features

- Cover image upload and thumbnail cards
- Genres and tags per entry
- Search, status filter, genre/tag filters, and sorting
- Offline-capable installable PWA (when opened via localhost)

## Project Separation

This app is fully separate from `dawnforge-sim`.

- Manga app path: `/home/ubuntu/Desktop/workspace/projects/manga-archive-app`
- Dawnforge path: `/home/ubuntu/Desktop/workspace/projects/dawnforge-sim`

## Quick Start

### Option 1: Run a local server (recommended)

From this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

Then in a Chromium-based browser, use **Install app** from the address bar/menu to install it as an app.

### Option 2: One-command launcher

```bash
./launch-app.sh
```

This starts a local server (if not already running) and opens `http://localhost:4173`.

## Easy Access (Linux Desktop Launcher)

Run:

```bash
chmod +x ./install-desktop-entry.sh
./install-desktop-entry.sh
```

This adds an application launcher named **Manga Archive** to your user applications.
The launcher uses `launch-app.sh`, so it opens via localhost for PWA installability.

## Data Storage

- Entries are saved in browser `localStorage`.
- Use **Export JSON** regularly for backups.
- Use **Import JSON** to restore from backup.
