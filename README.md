# Trip Map (list.md / hotel.txt)

This repo generates a modern, interactive map (Leaflet + Tailwind CSS) from:

- `list.md` (places + Naver short links)
- `hotel.txt` (hotel address)

## Quick start

```bash
node scripts/generate-places.mjs
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## GitHub Pages

1) Push to GitHub
2) GitHub repo → **Settings** → **Pages** → Deploy from a branch → `main` / `/ (root)`
3) Open the published URL (usually `https://<user>.github.io/<repo>/`)

## PWA (Install)

- Android (Chrome): open the site → tap **Install app** (toast) or browser menu → Install
- iPhone (Safari): Share → **Add to Home Screen**

## Itinerary / Day Planner

- Open the **Planner** tab
- Tap **＋** on a place to add it to the active day
- Tap a stop to edit **Start/End time** + **Memo**
- Stops are automatically sorted by time; remove with **✕**
- Use **Export/Import** to back up / restore your plan

## Update pins

After editing `list.md` / `hotel.txt`, regenerate:

```bash
node scripts/generate-places.mjs
```

The output is written to `data/places.json`.
