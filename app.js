const $ = (selector, root = document) => root.querySelector(selector);

const STATUS_KEY = "sc_trip_status_v1";
const LOC_SETTINGS_KEY = "sc_trip_loc_settings_v1";
const THEME_KEY = "sc_trip_map_theme_v1";

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

function loadLocSettings() {
  try {
    const raw = localStorage.getItem(LOC_SETTINGS_KEY);
    if (!raw) return { tracking: true, follow: true };
    const parsed = JSON.parse(raw);
    const tracking = typeof parsed?.tracking === "boolean" ? parsed.tracking : true;
    const follow = typeof parsed?.follow === "boolean" ? parsed.follow : true;
    return { tracking, follow };
  } catch {
    return { tracking: true, follow: true };
  }
}

function saveLocSettings(settings) {
  try {
    localStorage.setItem(LOC_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function loadThemeId() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw ? String(raw) : "dark";
  } catch {
    return "dark";
  }
}

function saveThemeId(themeId) {
  try {
    localStorage.setItem(THEME_KEY, String(themeId));
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
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 transition",
      active
        ? "bg-fuchsia-500/20 text-white ring-fuchsia-400/40"
        : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10",
    ].join(" ");

    el.innerHTML = `<span>${escapeHtml(label)}</span><span class="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-200 ring-1 ring-white/10">${count}</span>`;
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
          <div class="mt-1 truncate text-[11px] text-slate-300">${cat}</div>
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
  const btnFollow = $("#btnFollow");
  const btnTheme = $("#btnTheme");
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
  let locSettings = loadLocSettings();

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
  });
  L.control.zoom({ position: "topright" }).addTo(map);

  map.attributionControl.setPosition("topleft");

  const THEMES = [
    {
      id: "dark",
      label: "Dark",
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      options: {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    {
      id: "light",
      label: "Light",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      options: {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    {
      id: "voyager",
      label: "Voyager",
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      options: {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    {
      id: "osm",
      label: "OSM",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
  ];

  let baseLayer = null;
  let themeId = loadThemeId();

  const setThemeUi = (id) => {
    if (!btnTheme) return;
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    btnTheme.textContent = theme.label;
    btnTheme.title = `Map theme: ${theme.label}`;
    btnTheme.dataset.theme = theme.id;
  };

  const setMapTheme = (id, { persist = true } = {}) => {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    themeId = theme.id;
    if (persist) saveThemeId(themeId);
    setThemeUi(themeId);

    if (baseLayer) {
      map.removeLayer(baseLayer);
      baseLayer = null;
    }

    baseLayer = L.tileLayer(theme.url, theme.options);
    baseLayer.addTo(map);
  };

  const cycleTheme = () => {
    const idx = THEMES.findIndex((t) => t.id === themeId);
    const next = THEMES[(idx + 1) % THEMES.length];
    setMapTheme(next.id);
    showToast(`Theme: ${next.label}`);
  };

  setMapTheme(themeId, { persist: false });
  btnTheme?.addEventListener("click", cycleTheme);

  const clusters = createClusterGroup();
  clusters.addTo(map);

  const sheetEl = $("#sheet");
  const sheetHandle = $("#sheetHandle");
  const sheetHeader = $("#sheetHeader");

  const sheet = (() => {
    if (!sheetEl) return null;

    const mq = window.matchMedia("(max-width: 767px)");
    const state = {
      enabled: false,
      snap: "collapsed",
      fullHeight: 0,
      y: 0,
      yHalf: 0,
      yCollapsed: 0,
    };

    const setY = (y) => {
      state.y = clamp(y, 0, state.yCollapsed);
      sheetEl.style.setProperty("--sheet-y", `${state.y}px`);
    };

    const compute = () => {
      if (!state.enabled) return;
      const viewportH = window.innerHeight || 800;
      const headerH = sheetHeader?.getBoundingClientRect().height || 220;
      const handleH = sheetHandle?.getBoundingClientRect().height || 0;
      const collapsedH = Math.round(handleH + headerH);

      const fullH = Math.round(clamp(viewportH * 0.86, collapsedH + 160, viewportH - 8));
      const halfH = Math.round(clamp(viewportH * 0.56, collapsedH + 120, fullH - 80));

      state.fullHeight = fullH;
      state.yCollapsed = Math.round(fullH - collapsedH);
      state.yHalf = Math.round(fullH - halfH);

      sheetEl.style.height = `${fullH}px`;
    };

    const snapTo = (snap, { immediate = false } = {}) => {
      if (!state.enabled) return;
      state.snap = snap;
      if (immediate) sheetEl.classList.add("is-dragging");
      if (snap === "full") setY(0);
      else if (snap === "half") setY(state.yHalf);
      else setY(state.yCollapsed);
      sheetEl.dataset.sheetSnap = snap;
      if (immediate) requestAnimationFrame(() => sheetEl.classList.remove("is-dragging"));
    };

    const nearestSnap = (y) => {
      const candidates = [
        { snap: "full", y: 0 },
        { snap: "half", y: state.yHalf },
        { snap: "collapsed", y: state.yCollapsed },
      ];
      candidates.sort((a, b) => Math.abs(y - a.y) - Math.abs(y - b.y));
      return candidates[0]?.snap || "collapsed";
    };

    let drag = null;
    const onPointerDown = (e) => {
      if (!state.enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = {
        startY: e.clientY,
        startSheetY: state.y,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
        moved: false,
      };
      sheetEl.classList.add("is-dragging");
      sheetHandle?.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!drag) return;
      const now = performance.now();
      const dy = e.clientY - drag.startY;
      if (Math.abs(dy) > 6) drag.moved = true;
      const next = drag.startSheetY + dy;
      setY(next);

      const dt = Math.max(1, now - drag.lastT);
      drag.velocity = (e.clientY - drag.lastY) / dt; // px/ms
      drag.lastY = e.clientY;
      drag.lastT = now;
    };

    const onPointerUp = () => {
      if (!drag) return;
      sheetEl.classList.remove("is-dragging");

      const v = drag.velocity;
      const moved = drag.moved;
      drag = null;

      if (!moved) {
        toggle();
        return;
      }

      const fast = Math.abs(v) > 0.6;
      if (fast) {
        if (v < 0) {
          snapTo(state.y <= state.yHalf ? "full" : "half");
        } else {
          snapTo(state.y >= state.yHalf ? "collapsed" : "half");
        }
        return;
      }

      snapTo(nearestSnap(state.y));
    };

    const toggle = () => {
      if (!state.enabled) return;
      if (state.snap === "collapsed") snapTo("half");
      else snapTo("collapsed");
    };

    const enable = () => {
      if (state.enabled) return;
      state.enabled = true;
      compute();
      snapTo("collapsed", { immediate: true });
    };

    const disable = () => {
      if (!state.enabled) return;
      state.enabled = false;
      sheetEl.classList.remove("is-dragging");
      sheetEl.style.removeProperty("--sheet-y");
      sheetEl.style.removeProperty("height");
      delete sheetEl.dataset.sheetSnap;
    };

    const sync = () => {
      if (mq.matches) enable();
      else disable();
    };

    sheetHandle?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });

    window.addEventListener("resize", () => {
      if (!state.enabled) return;
      compute();
      snapTo(state.snap, { immediate: true });
    });
    mq.addEventListener("change", sync);
    sync();

    return {
      isEnabled: () => state.enabled,
      refresh: () => {
        if (!state.enabled) return;
        compute();
        snapTo(state.snap, { immediate: true });
      },
      getSafeBottomPxRelativeToMap: () => {
        const mapRect = map.getContainer().getBoundingClientRect();
        const sheetRect = sheetEl.getBoundingClientRect();
        return Math.max(0, sheetRect.top - mapRect.top);
      },
      onSnap: (fn) => {
        const handler = (e) => {
          if (e.target !== sheetEl) return;
          if (e.propertyName !== "transform") return;
          fn(state.snap);
        };
        sheetEl.addEventListener("transitionend", handler);
        return () => sheetEl.removeEventListener("transitionend", handler);
      },
    };
  })();

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
    const base = 24;
    const options = { animate };
    if (sheet?.isEnabled?.()) {
      const size = map.getSize();
      const safeBottom = sheet.getSafeBottomPxRelativeToMap();
      const covered = Math.max(0, size.y - safeBottom);
      options.paddingTopLeft = [base, base];
      options.paddingBottomRight = [base, base + covered];
    } else {
      options.padding = [base, base];
    }
    map.fitBounds(bounds.pad(0.18), options);
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
    sheet?.refresh?.();
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

  const myLocationPane = map.createPane("mylocation");
  myLocationPane.style.zIndex = "650";

  const myLocation = {
    watchId: null,
    marker: null,
    accuracyCircle: null,
    didInitialCenter: false,
    lastLatLng: null,
    lastAccuracyM: null,
  };

  const setLocateUi = (active) => {
    btnLocate.dataset.active = active ? "true" : "false";
    btnLocate.textContent = active ? "Tracking" : "Locate";
    btnLocate.title = active ? "Stop tracking your location" : "Start tracking your location";
  };

  const setFollowUi = (active) => {
    if (!btnFollow) return;
    btnFollow.dataset.active = active ? "true" : "false";
    btnFollow.textContent = active ? "Follow" : "Browse";
    btnFollow.title = active ? "Keep map following your location" : "Stop following your location";
  };

  const myLocationIcon = L.divIcon({
    className: "",
    html: '<div class="my-loc"><div class="my-loc__pulse"></div><div class="my-loc__dot"></div></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });

  const ensureMyLocationLayers = ([lat, lon], accuracyM) => {
    if (!myLocation.marker) {
      myLocation.marker = L.marker([lat, lon], {
        icon: myLocationIcon,
        pane: "mylocation",
      }).addTo(map);
    }

    if (!myLocation.accuracyCircle) {
      myLocation.accuracyCircle = L.circle([lat, lon], {
        radius: Math.max(accuracyM || 0, 10),
        color: "#22d3ee",
        weight: 1,
        opacity: 0.65,
        fillColor: "#22d3ee",
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
    }
  };

  const updateMyLocation = (pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const accuracyM = pos.coords.accuracy;
    const isFirstFix = !myLocation.didInitialCenter;

    ensureMyLocationLayers([lat, lon], accuracyM);

    myLocation.marker.setLatLng([lat, lon]);
    myLocation.accuracyCircle.setLatLng([lat, lon]);
    if (typeof accuracyM === "number" && Number.isFinite(accuracyM)) {
      myLocation.accuracyCircle.setRadius(Math.max(accuracyM, 10));
    }
    myLocation.lastLatLng = L.latLng(lat, lon);
    myLocation.lastAccuracyM = typeof accuracyM === "number" ? accuracyM : null;

    const accText =
      typeof accuracyM === "number" && Number.isFinite(accuracyM)
        ? `Accuracy ~${Math.round(accuracyM)}m`
        : "Accuracy unknown";
    const popupHtml = `
      <div class="min-w-[200px]">
        <div class="text-sm font-extrabold tracking-tight">My Location</div>
        <div class="mt-1 text-xs text-slate-300">${accText}</div>
      </div>
    `;
    const popup = myLocation.marker.getPopup();
    if (popup) popup.setContent(popupHtml);
    else myLocation.marker.bindPopup(popupHtml);

    if (isFirstFix) {
      myLocation.didInitialCenter = true;
      if (locSettings.follow) {
        map.flyTo([lat, lon], Math.max(map.getZoom(), 15), { duration: 0.7 });
        map.once("moveend", () => keepMyLocationInView(true));
        myLocation.marker.openPopup();
      }
      return;
    }

    if (locSettings.follow) keepMyLocationInView(false);
  };

  const stopTracking = ({ persist = true } = {}) => {
    if (myLocation.watchId != null) {
      navigator.geolocation.clearWatch(myLocation.watchId);
      myLocation.watchId = null;
    }
    myLocation.didInitialCenter = false;
    if (myLocation.marker) {
      myLocation.marker.remove();
      myLocation.marker = null;
    }
    if (myLocation.accuracyCircle) {
      myLocation.accuracyCircle.remove();
      myLocation.accuracyCircle = null;
    }
    setLocateUi(false);

    if (persist) {
      locSettings = { ...locSettings, tracking: false };
      saveLocSettings(locSettings);
    }
  };

  const getFollowSafeViewport = () => {
    const size = map.getSize();
    let bottom = size.y;
    if (sheet?.isEnabled?.()) bottom = Math.min(bottom, sheet.getSafeBottomPxRelativeToMap());
    return { left: 0, top: 0, right: size.x, bottom: Math.max(0, bottom) };
  };

  const keepMyLocationInView = (force) => {
    if (!locSettings.follow) return;
    if (!myLocation.lastLatLng) return;

    const safe = getFollowSafeViewport();
    const p = map.latLngToContainerPoint(myLocation.lastLatLng);

    const safeBottom = Math.max(safe.top + 10, safe.bottom);
    const desiredX = (safe.left + safe.right) / 2;

    const desiredYBase = safe.top + (safeBottom - safe.top) * 0.44;
    const minY = Math.min(safe.top + 120, safeBottom - 20);
    const maxY = Math.max(minY, safeBottom - 150);
    const desiredY = clamp(desiredYBase, minY, maxY);

    const dx = p.x - desiredX;
    const dy = p.y - desiredY;
    const thresholdPx = force ? 0 : 10;
    if (Math.hypot(dx, dy) < thresholdPx) return;

    map.panBy([dx, dy], { animate: true, duration: 0.45 });
  };

  const startTracking = ({ auto = false } = {}) => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported");
      return;
    }
    if (myLocation.watchId != null) return;

    setLocateUi(true);
    if (auto) showToast("Locating…");
    locSettings = { ...locSettings, tracking: true };
    saveLocSettings(locSettings);

    myLocation.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        updateMyLocation(pos);
        showToast("Location updated", { durationMs: 800 });
      },
      (err) => {
        const denied = err?.code === 1;
        stopTracking({ persist: denied });
        const msg =
          err?.code === 1
            ? "Location blocked"
            : err?.code === 2
              ? "Location unavailable"
              : err?.code === 3
                ? "Location timeout"
                : "Location error";
        showToast(msg);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
    );
  };

  btnLocate.addEventListener("click", () => {
    if (myLocation.watchId != null) {
      stopTracking();
      showToast("Location off");
      return;
    }
    startTracking({ auto: false });
  });

  btnFollow?.addEventListener("click", () => {
    locSettings = { ...locSettings, follow: !locSettings.follow };
    saveLocSettings(locSettings);
    setFollowUi(locSettings.follow);

    if (locSettings.follow) {
      if (myLocation.lastLatLng) {
        map.flyTo(myLocation.lastLatLng, Math.max(map.getZoom(), 15), { duration: 0.55 });
        map.once("moveend", () => keepMyLocationInView(true));
      } else if (locSettings.tracking && myLocation.watchId == null) {
        startTracking({ auto: false });
      }
      showToast("Follow on");
    } else {
      showToast("Follow off");
    }
  });

  sync();
  fitToPins(false);
  const invalidate = () => map.invalidateSize({ animate: false });
  window.setTimeout(invalidate, 50);
  window.addEventListener("resize", invalidate);

  setFollowUi(locSettings.follow);
  setLocateUi(myLocation.watchId != null);

  if (locSettings.tracking) {
    startTracking({ auto: true });
  } else {
    setLocateUi(false);
  }

  sheet?.onSnap?.(() => keepMyLocationInView(true));

  showToast("Loaded");
}

main();
