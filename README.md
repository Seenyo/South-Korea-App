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

## Update pins

After editing `list.md` / `hotel.txt`, regenerate:

```bash
node scripts/generate-places.mjs
```

The output is written to `data/places.json`.

