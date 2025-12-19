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

## Sync with friends (Supabase)

GitHub Pages is static, so cross-device sync needs a backend. This app can sync:

- ✅ Shared: Planner (days/stops/time/memo), Favorite / Visited
- ❌ Not shared: Location tracking, Follow mode, map theme, UI state

### 1) Supabase setup (one-time)

1) Supabase Dashboard → **Authentication** → **Providers** → enable **Google**
   - You’ll need a Google OAuth Client ID/Secret (Google Cloud Console → Credentials).
2) Supabase Dashboard → **Authentication** → **URL Configuration**
   - **Site URL**: `https://seenyo.github.io/South-Korea-App/`
   - **Redirect URLs**: add `https://seenyo.github.io/South-Korea-App/*`
3) Supabase Dashboard → **SQL Editor** → run `supabase_setup.sql`

If you see `Supabase policy blocked sync`, re-run `supabase_setup.sql` (policies updated).
You can also confirm the helper exists:

```sql
select to_regproc('public.request_uid') as request_uid_fn;
```

### 2) Use it

- Open the app → sign in with Google → Planner → **Trips**
- Create a new trip → copy the share link → send to friends
- Friends open the link and choose **Use cloud** / **Upload local** if asked

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
