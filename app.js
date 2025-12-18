const $ = (selector, root = document) => root.querySelector(selector);

const STATUS_KEY = "sc_trip_status_v1";

function loadStatus() {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStatus(status) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // ignore
  }
}

function showToast(message, { durationMs = 1800 } = {}) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    el.classList.add("hidden");
  }, durationMs);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const PALETTE = [
  { name: "rose", gradient: ["#fb7185", "#f472b6"] },
  { name: "amber", gradient: ["#fbbf24", "#fb7185"] },
  { name: "lime", gradient: ["#84cc16", "#22c55e"] },
  { name: "cyan", gradient: ["#22d3ee", "#60a5fa"] },
  { name: "violet", gradient: ["#a78bfa", "#f472b6"] },
  { name: "sky", gradient: ["#38bdf8", "#34d399"] },
  { name: "fuchsia", gradient: ["#e879f9", "#fb7185"] },
  { name: "emerald", gradient: ["#34d399", "#22c55e"] },
];

function categoryStyle(category) {
  const h = hashString(category || "");
  const idx = h % PALETTE.length;
  return PALETTE[idx];
}

function hasCoords(place) {
  return typeof place.lat === "number" && typeof place.lon === "number";
}

function normalize(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGoogleMapsSearchUrl(place) {
  const q = place.address || place.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function buildNaverEntryUrl(place) {
  const placeId = place?.naver?.placeId;
  if (!placeId) return null;
  return `https://map.naver.com/p/entry/place/${placeId}`;
}

function formatCategoryLabel(category) {
  if (!category) return "Uncategorized";
  return category;
}

async function loadPlaces() {
  const resp = await fetch("./data/places.json", { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`Failed to load data/places.json (${resp.status})`);
  }
  const json = await resp.json();
  const places = Array.isArray(json?.places) ? json.places : [];
  return { meta: json, places };
}

function createPinIcon({ category, selected, kind }) {
  const palette = categoryStyle(category);
  const [c1, c2] = palette.gradient;
  const label =
    kind === "hotel" ? "🏨" : kind === "food" ? "🍽️" : kind === "spot" ? "📍" : "";
  const bubble = `
    <div class="pin ${selected ? "pin--selected" : ""}">
      <div class="pin__bubble" style="background: linear-gradient(135deg, ${c1}, ${c2});">
        <div style="position:absolute; inset:0; display:grid; place-items:center;">
          <div class="pin__dot"></div>
        </div>
        ${
          label
            ? `<div style="position:absolute; inset:0; display:grid; place-items:center; font-size:12px; filter: drop-shadow(0 8px 10px rgba(0,0,0,0.35));">${label}</div>`
            : ""
        }
      </div>
    </div>
  `;
  return L.divIcon({
    className: "",
    html: bubble,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30],
  });
}

function createClusterGroup() {
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 52,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      const t = clamp(count / 24, 0, 1);
      const c1 = `rgba(${Math.round(236 - 80 * t)}, ${Math.round(72 + 70 * t)}, ${Math.round(
        153 + 50 * t,
      )}, 0.92)`;
      const c2 = `rgba(${Math.round(56 + 80 * t)}, ${Math.round(189 - 40 * t)}, ${Math.round(
        248 - 90 * t,
      )}, 0.88)`;
      const html = `<div class="cluster" style="background: linear-gradient(135deg, ${c1}, ${c2});">${count}</div>`;
      return L.divIcon({ html, className: "", iconSize: [42, 42] });
    },
  });
}

function escapeHtml(text) {
  return (text || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPopupHtml(place) {
  const name = escapeHtml(place.name || "Untitled");
  const category = escapeHtml(formatCategoryLabel(place.category));
  const address = escapeHtml(place.address || "");
  const notes =
    Array.isArray(place.notes) && place.notes.length
      ? `<div class="mt-2 text-xs text-slate-300">${place.notes
          .map((n) => `<div>${escapeHtml(n)}</div>`)
          .join("")}</div>`
      : "";
  const naverUrl = buildNaverEntryUrl(place);
  const googleUrl = buildGoogleMapsSearchUrl(place);
  const sourceUrl = place.url || naverUrl;

  const buttons = [
    naverUrl
      ? `<a class="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15" target="_blank" rel="noreferrer" href="${naverUrl}">Naver</a>`
      : "",
    sourceUrl && /^https?:\/\//.test(sourceUrl)
      ? `<a class="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15" target="_blank" rel="noreferrer" href="${sourceUrl}">Link</a>`
      : "",
    `<a class="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15" target="_blank" rel="noreferrer" href="${googleUrl}">Google Maps</a>`,
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="min-w-[240px]">
      <div class="text-sm font-extrabold tracking-tight">${name}</div>
      <div class="mt-0.5 text-xs text-slate-300">${category}</div>
      ${address ? `<div class="mt-2 text-xs text-slate-200">${address}</div>` : ""}
      ${notes}
      <div class="mt-3 flex flex-wrap gap-2">${buttons}</div>
    </div>
  `;
}

function renderChips({ categories, activeCategory }) {
  const root = $("#categoryChips");
  root.innerHTML = "";

  const chip = ({ id, label, active, count }) => {
    const el = document.createElement("button");
    el.type = "button";
    el.dataset.category = id;
    el.className = [
      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
      active
        ? "bg-fuchsia-500/20 text-white ring-fuchsia-400/40"
        : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10",
    ].join(" ");

    el.innerHTML = `<span>${escapeHtml(label)}</span><span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-200 ring-1 ring-white/10">${count}</span>`;
    return el;
  };

  const allCount = categories.reduce((sum, c) => sum + c.count, 0);
  root.appendChild(
    chip({
      id: "__all__",
      label: "All",
      active: activeCategory === "__all__",
      count: allCount,
    }),
  );

  for (const c of categories) {
    root.appendChild(
      chip({
        id: c.name,
        label: c.name,
        active: activeCategory === c.name,
        count: c.count,
      }),
    );
  }
}

function renderStats({ total, pinned, favorites, visited, generatedAt }) {
  const root = $("#stats");
  const dt = generatedAt ? new Date(generatedAt) : null;
  const stamp = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString() : "";
  const extras = [
    typeof favorites === "number" ? `★${favorites}` : null,
    typeof visited === "number" ? `✓${visited}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  root.textContent = `${pinned}/${total} pinned${extras ? ` · ${extras}` : ""}${
    stamp ? ` · generated ${stamp}` : ""
  }`;
}

function renderList({ places, selectedId, statusById }) {
  const root = $("#placeList");
  root.innerHTML = "";

  const sorted = [...places].sort((a, b) => {
    const af = statusById?.[a.id]?.favorite ? 1 : 0;
    const bf = statusById?.[b.id]?.favorite ? 1 : 0;
    if (af !== bf) return bf - af;
    const ac = a.category || "";
    const bc = b.category || "";
    if (ac !== bc) return ac.localeCompare(bc);
    return (a.name || "").localeCompare(b.name || "");
  });

  for (const place of sorted) {
    const palette = categoryStyle(place.category);
    const pinned = hasCoords(place);
    const isSelected = place.id === selectedId;
    const isFavorite = !!statusById?.[place.id]?.favorite;
    const isVisited = !!statusById?.[place.id]?.visited;

    const el = document.createElement("div");
    el.dataset.placeId = place.id;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.className = [
      "group mb-2 w-full rounded-2xl p-3 text-left ring-1 transition",
      isSelected
        ? "bg-fuchsia-500/15 ring-fuchsia-400/35"
        : "bg-white/5 ring-white/10 hover:bg-white/8",
    ].join(" ");

    const name = escapeHtml(place.name || "Untitled");
    const address = escapeHtml(place.address || "");
    const cat = escapeHtml(formatCategoryLabel(place.category));
    const badge = pinned
      ? `<span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-400/25">PIN</span>`
      : `<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-400/25">NO PIN</span>`;

    const naverUrl = buildNaverEntryUrl(place);
    const link = place.url || naverUrl;
    const linkIcon = link
      ? `<span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200 ring-1 ring-white/10">LINK</span>`
      : "";

    const favoriteBtn = `
      <button
        type="button"
        data-action="favorite"
        data-place-id="${escapeHtml(place.id)}"
        class="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-extrabold ring-1 transition ${
          isFavorite
            ? "bg-yellow-400/20 text-yellow-200 ring-yellow-400/30"
            : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
        }"
        title="お気に入り"
      >★</button>
    `;
    const visitedBtn = `
      <button
        type="button"
        data-action="visited"
        data-place-id="${escapeHtml(place.id)}"
        class="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-extrabold ring-1 transition ${
          isVisited
            ? "bg-emerald-400/20 text-emerald-200 ring-emerald-400/30"
            : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
        }"
        title="行った"
      >✓</button>
    `;

    el.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background: linear-gradient(135deg, ${palette.gradient[0]}, ${palette.gradient[1]});"></span>
            <div class="truncate text-sm font-extrabold tracking-tight">${name}</div>
          </div>
          <div class="mt-1 truncate text-xs text-slate-300">${cat}</div>
          ${address ? `<div class="mt-2 line-clamp-2 text-xs text-slate-200">${address}</div>` : ""}
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          ${badge}
          ${linkIcon}
          <div class="mt-1 flex items-center gap-1">
            ${favoriteBtn}
            ${visitedBtn}
          </div>
        </div>
      </div>
    `;
    root.appendChild(el);
  }
}

function buildCategories(places) {
  const counts = new Map();
  for (const p of places) {
    const c = formatCategoryLabel(p.category);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function filterPlaces(places, { query, category }) {
  const q = normalize(query);
  const cat = category && category !== "__all__" ? category : null;
  return places.filter((p) => {
    if (cat && formatCategoryLabel(p.category) !== cat) return false;
    if (!q) return true;
    const hay = normalize(`${p.name || ""} ${p.address || ""} ${p.category || ""}`);
    return hay.includes(q);
  });
}

function computeBounds(places) {
  const pts = places.filter(hasCoords).map((p) => [p.lat, p.lon]);
  if (!pts.length) return null;
  return L.latLngBounds(pts);
}

function guessKind(place) {
  if (place.source === "hotel.txt") return "hotel";
  if (/焼肉|冷麺|ソルロンタン|チキン|カンジャンケジャン|イタリアン/.test(place.category || ""))
    return "food";
  return "spot";
}

async function main() {
  const btnFit = $("#btnFit");
  const btnLocate = $("#btnLocate");
  const searchInput = $("#search");
  const btnClearSearch = $("#btnClearSearch");

  let data;
  try {
    data = await loadPlaces();
  } catch (err) {
    document.body.innerHTML = `
      <div class="min-h-dvh w-full bg-slate-950 text-slate-50 p-6">
        <div class="max-w-xl">
          <div class="text-xl font-extrabold">Failed to load data</div>
          <div class="mt-2 text-slate-300 text-sm">${escapeHtml(String(err?.message || err))}</div>
          <div class="mt-4 text-sm text-slate-200">
            <div>1) Generate data:</div>
            <div class="mt-1 font-mono">node scripts/generate-places.mjs</div>
            <div class="mt-4">2) Serve this folder (file://だとfetchが動かない場合があります):</div>
            <div class="mt-1 font-mono">python3 -m http.server 5173</div>
            <div class="mt-2">Open:</div>
            <div class="mt-1 font-mono">http://localhost:5173</div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const allPlaces = data.places || [];
  let statusById = loadStatus();

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  });
  tiles.addTo(map);

  const clusters = createClusterGroup();
  clusters.addTo(map);

  const markersById = new Map();
  for (const place of allPlaces) {
    if (!hasCoords(place)) continue;
    const selected = false;
    const icon = createPinIcon({
      category: place.category || "",
      selected,
      kind: guessKind(place),
    });
    const marker = L.marker([place.lat, place.lon], { icon });
    marker.bindPopup(buildPopupHtml(place), { closeButton: true, autoPanPadding: [14, 14] });
    marker.on("click", () => {
      state.selectedId = place.id;
      syncSelection();
    });
    markersById.set(place.id, marker);
  }

  const state = {
    query: "",
    category: "__all__",
    selectedId: null,
    filtered: allPlaces,
  };

  const fitToPins = (animate = true) => {
    const bounds = computeBounds(state.filtered);
    if (!bounds) {
      map.setView([37.5665, 126.978], 12, { animate });
      return;
    }
    if (bounds.isValid() && bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(bounds.getCenter(), 15, { animate });
      return;
    }
    map.fitBounds(bounds.pad(0.18), { animate });
  };

  const syncMarkers = () => {
    clusters.clearLayers();
    for (const place of state.filtered) {
      const marker = markersById.get(place.id);
      if (marker) clusters.addLayer(marker);
    }
  };

  const syncSelection = () => {
    for (const [id, marker] of markersById.entries()) {
      const place = allPlaces.find((p) => p.id === id);
      if (!place) continue;
      const icon = createPinIcon({
        category: place.category || "",
        selected: id === state.selectedId,
        kind: guessKind(place),
      });
      marker.setIcon(icon);
    }
    renderList({ places: state.filtered, selectedId: state.selectedId, statusById });

    const selectedMarker = state.selectedId ? markersById.get(state.selectedId) : null;
    if (!selectedMarker) return;
    clusters.zoomToShowLayer(selectedMarker, () => {
      selectedMarker.openPopup();
      map.flyTo(selectedMarker.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.65 });
    });
  };

  const sync = ({ keepView = false } = {}) => {
    state.filtered = filterPlaces(allPlaces, { query: state.query, category: state.category });
    const categories = buildCategories(allPlaces);
    renderChips({ categories, activeCategory: state.category });
    renderStats({
      total: allPlaces.length,
      pinned: allPlaces.filter(hasCoords).length,
      favorites: allPlaces.filter((p) => statusById?.[p.id]?.favorite).length,
      visited: allPlaces.filter((p) => statusById?.[p.id]?.visited).length,
      generatedAt: data.meta?.generatedAt,
    });
    renderList({ places: state.filtered, selectedId: state.selectedId, statusById });
    syncMarkers();
    if (!keepView) fitToPins(false);
  };

  $("#categoryChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-category]");
    if (!btn) return;
    state.category = btn.dataset.category || "__all__";
    state.selectedId = null;
    sync();
  });

  const toggleStatus = (placeId, key) => {
    const current = statusById?.[placeId] || {};
    const next = { ...current, [key]: !current[key] };
    statusById = { ...statusById, [placeId]: next };
    saveStatus(statusById);
  };

  $("#placeList").addEventListener("click", (e) => {
    const actionBtn = e.target.closest("button[data-action][data-place-id]");
    if (actionBtn) {
      const placeId = actionBtn.dataset.placeId;
      const action = actionBtn.dataset.action;
      if (placeId && action === "favorite") {
        toggleStatus(placeId, "favorite");
        sync({ keepView: true });
        showToast(statusById?.[placeId]?.favorite ? "Favorited" : "Unfavorited");
        return;
      }
      if (placeId && action === "visited") {
        toggleStatus(placeId, "visited");
        sync({ keepView: true });
        showToast(statusById?.[placeId]?.visited ? "Visited" : "Unvisited");
        return;
      }
      return;
    }

    const card = e.target.closest("[data-place-id]");
    if (!card) return;
    const id = card.dataset.placeId;
    state.selectedId = id;
    syncSelection();
  });

  $("#placeList").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-place-id]");
    if (!card) return;
    e.preventDefault();
    const id = card.dataset.placeId;
    state.selectedId = id;
    syncSelection();
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value || "";
    state.selectedId = null;
    sync({ keepView: true });
  });

  btnClearSearch.addEventListener("click", () => {
    searchInput.value = "";
    state.query = "";
    state.selectedId = null;
    sync({ keepView: true });
    showToast("Search cleared");
  });

  btnFit.addEventListener("click", () => {
    fitToPins(true);
    showToast("Fit to pins");
  });

  btnLocate.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const here = L.circleMarker([lat, lon], {
          radius: 7,
          weight: 2,
          color: "#22d3ee",
          fillColor: "#22d3ee",
          fillOpacity: 0.25,
        }).addTo(map);
        here.bindPopup("You are here").openPopup();
        map.flyTo([lat, lon], 14, { duration: 0.7 });
        window.setTimeout(() => here.remove(), 30_000);
        showToast("Located");
      },
      () => showToast("Location blocked"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });

  sync();
  fitToPins(false);
  const invalidate = () => map.invalidateSize({ animate: false });
  window.setTimeout(invalidate, 50);
  window.addEventListener("resize", invalidate);
  showToast("Loaded");
}

main();
