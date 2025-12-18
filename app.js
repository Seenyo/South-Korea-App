const $ = (selector, root = document) => root.querySelector(selector);

const STATUS_KEY = "sc_trip_status_v1";
const LOC_SETTINGS_KEY = "sc_trip_loc_settings_v1";
const THEME_KEY = "sc_trip_map_theme_v1";
const PLANNER_KEY = "sc_trip_planner_v1";
const VIEW_KEY = "sc_trip_view_v1";
const INSTALL_TIP_KEY = "sc_trip_install_tip_v1";

function uid(prefix) {
  const p = prefix ? `${prefix}_` : "";
  if (globalThis.crypto?.randomUUID) return `${p}${globalThis.crypto.randomUUID()}`;
  return `${p}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

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

function timeToMinutes(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function sortPlannerItemsByTime(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const decorated = items.map((it, idx) => {
    const start = timeToMinutes(it?.startTime) ?? timeToMinutes(it?.endTime);
    const end = timeToMinutes(it?.endTime);
    return { it, idx, start: start ?? Infinity, end: end ?? Infinity };
  });
  decorated.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.idx - b.idx;
  });
  return decorated.map((d) => d.it);
}

function buildDefaultPlanner() {
  const dayId = uid("day");
  return {
    version: 2,
    activeDayId: dayId,
    days: [
      {
        id: dayId,
        title: "Day 1",
        items: [],
      },
    ],
  };
}

function normalizePlanner(raw) {
  if (!raw || typeof raw !== "object") return buildDefaultPlanner();
  const days = Array.isArray(raw.days) ? raw.days : [];
  const normalizedDays = days
    .filter((d) => d && typeof d === "object")
    .map((d, idx) => ({
      id: typeof d.id === "string" && d.id ? d.id : uid("day"),
      title: typeof d.title === "string" && d.title ? d.title : `Day ${idx + 1}`,
      items: Array.isArray(d.items)
        ? d.items
            .filter((it) => it && typeof it === "object" && typeof it.placeId === "string" && it.placeId)
            .map((it) => ({
              id: typeof it.id === "string" && it.id ? it.id : uid("item"),
              placeId: it.placeId,
              startTime:
                typeof it.startTime === "string"
                  ? it.startTime
                  : typeof it.start === "string"
                    ? it.start
                    : "",
              endTime:
                typeof it.endTime === "string" ? it.endTime : typeof it.end === "string" ? it.end : "",
              memo: typeof it.memo === "string" ? it.memo : typeof it.note === "string" ? it.note : "",
            }))
        : [],
    }));

  if (!normalizedDays.length) return buildDefaultPlanner();

  const sortedDays = normalizedDays.map((day) => ({
    ...day,
    items: sortPlannerItemsByTime(day.items),
  }));

  const activeDayId =
    typeof raw.activeDayId === "string" && sortedDays.some((d) => d.id === raw.activeDayId)
      ? raw.activeDayId
      : sortedDays[0].id;

  return { version: 2, activeDayId, days: sortedDays };
}

function loadPlanner() {
  try {
    const raw = localStorage.getItem(PLANNER_KEY);
    if (!raw) return buildDefaultPlanner();
    return normalizePlanner(JSON.parse(raw));
  } catch {
    return buildDefaultPlanner();
  }
}

function savePlanner(planner) {
  try {
    localStorage.setItem(PLANNER_KEY, JSON.stringify(planner));
  } catch {
    // ignore
  }
}

function loadViewId() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw === "planner" ? "planner" : "places";
  } catch {
    return "places";
  }
}

function saveViewId(viewId) {
  try {
    localStorage.setItem(VIEW_KEY, viewId);
  } catch {
    // ignore
  }
}

function showToast(message, { durationMs = 1800 } = {}) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  el.dataset.clickable = "false";
  el.onclick = null;
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    el.classList.add("hidden");
    el.dataset.clickable = "false";
    el.onclick = null;
  }, durationMs);
}

function showToastAction(message, { durationMs = 5000, onClick } = {}) {
  if (typeof onClick !== "function") {
    showToast(message, { durationMs });
    return;
  }
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  el.dataset.clickable = "true";
  el.onclick = () => onClick();
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    el.classList.add("hidden");
    el.dataset.clickable = "false";
    el.onclick = null;
  }, durationMs);
}

function ensureTrailingSlashPath() {
  try {
    const { pathname, search, hash } = window.location;
    if (pathname.endsWith("/")) return false;
    const last = pathname.split("/").pop() || "";
    if (last.includes(".")) return false;
    window.location.replace(`${pathname}/${search}${hash}`);
    return true;
  } catch {
    return false;
  }
}

function isStandalone() {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
    );
  } catch {
    return false;
  }
}

function isIos() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua);
}

function registerInstallPrompt() {
  let deferred = null;

  const maybeShow = () => {
    if (!deferred) return;
    if (isStandalone()) return;
    showToastAction("Install app — tap to add", {
      durationMs: 9000,
      onClick: async () => {
        try {
          deferred.prompt?.();
          const choice = await deferred.userChoice;
          const outcome = choice?.outcome;
          showToast(outcome === "accepted" ? "Installing…" : "Install dismissed");
        } catch {
          // ignore
        } finally {
          deferred = null;
        }
      },
    });
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    maybeShow();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    showToast("App installed");
  });

  window.addEventListener("load", () => {
    maybeShow();
    if (isStandalone()) return;
    if (!isIos()) return;
    try {
      if (localStorage.getItem(INSTALL_TIP_KEY) === "1") return;
      localStorage.setItem(INSTALL_TIP_KEY, "1");
      showToast("Install: Share → Add to Home Screen", { durationMs: 7000 });
    } catch {
      // ignore
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  if (ensureTrailingSlashPath()) return;

  const onControllerChange = () => window.location.reload();

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });

      const promptUpdate = () => {
        if (!reg.waiting) return;
        showToastAction("Update available — tap to reload", {
          durationMs: 8000,
          onClick: () => {
            navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, {
              once: true,
            });
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          },
        });
      };

      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate();

      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state !== "installed") return;
          if (navigator.serviceWorker.controller) promptUpdate();
          else showToast("Offline ready");
        });
      });
    } catch {
      // ignore
    }
  });
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

function haversineMeters(a, b) {
  if (!a || !b) return null;
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const R = 6371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function formatDistance(meters) {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return "";
  if (meters < 950) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
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

function createDayNumberIcon(number, { visited = false } = {}) {
  const n = typeof number === "number" && Number.isFinite(number) ? Math.max(1, Math.round(number)) : "";
  const klass = `day-num${visited ? " day-num--visited" : ""}`;
  return L.divIcon({
    className: "",
    html: `<div class="${klass}">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
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

function renderList({ places, selectedId, statusById, inDayPlaceIds }) {
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
    const isInDay = !!inDayPlaceIds?.has?.(place.id);

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
    const addBtn = `
      <button
        type="button"
        data-action="addToDay"
        data-place-id="${escapeHtml(place.id)}"
        class="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-extrabold ring-1 transition ${
          isInDay
            ? "bg-cyan-400/20 text-cyan-200 ring-cyan-300/30"
            : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
        }"
        title="${isInDay ? "Already in this day" : "Add to planner day"}"
      >＋</button>
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
            ${addBtn}
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
  const tabPlaces = $("#tabPlaces");
  const tabPlanner = $("#tabPlanner");
  const placesHeader = $("#placesHeader");
  const plannerHeader = $("#plannerHeader");
  const panelPlaces = $("#panelPlaces");
  const panelPlanner = $("#panelPlanner");
  const btnDayAdd = $("#btnDayAdd");
  const plannerDaysEl = $("#plannerDays");
  const plannerItemsEl = $("#plannerItems");
  const btnPlanRoute = $("#btnPlanRoute");
  const btnPlanFit = $("#btnPlanFit");
  const btnPlanExport = $("#btnPlanExport");
  const planImportEl = $("#planImport");
  const btnDayClear = $("#btnDayClear");

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
  const placeById = new Map(allPlaces.map((p) => [p.id, p]));
  let statusById = loadStatus();
  let locSettings = loadLocSettings();
  let planner = loadPlanner();
  let viewId = loadViewId();
  let expandedPlannerItemId = null;

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

  const plannerLinePane = map.createPane("plannerLine");
  plannerLinePane.style.zIndex = "590";
  plannerLinePane.style.pointerEvents = "none";

  const plannerMarkerPane = map.createPane("plannerMarker");
  plannerMarkerPane.style.zIndex = "640";

  const plannerLayer = L.layerGroup().addTo(map);

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

      const fullH = Math.round(clamp(viewportH, collapsedH + 140, viewportH));

      state.fullHeight = fullH;
      state.yCollapsed = Math.max(0, Math.round(fullH - collapsedH));

      sheetEl.style.height = `${fullH}px`;
    };

    const snapTo = (snap, { immediate = false } = {}) => {
      if (!state.enabled) return;
      state.snap = snap;
      if (immediate) sheetEl.classList.add("is-dragging");
      if (snap === "full") setY(0);
      else setY(state.yCollapsed);
      sheetEl.dataset.sheetSnap = snap;
      if (immediate) requestAnimationFrame(() => sheetEl.classList.remove("is-dragging"));
    };

    const nearestSnap = (y) => {
      const candidates = [
        { snap: "full", y: 0 },
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
        snapTo(v < 0 ? "full" : "collapsed");
        return;
      }

      snapTo(nearestSnap(state.y));
    };

    const toggle = () => {
      if (!state.enabled) return;
      if (state.snap === "collapsed") snapTo("full");
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

  const getActiveDay = () =>
    planner.days.find((d) => d.id === planner.activeDayId) || planner.days[0] || null;

  const getActiveDayPlaceIds = () => {
    const day = getActiveDay();
    const ids = day?.items?.map?.((it) => it.placeId) || [];
    return new Set(ids);
  };

  const commitPlanner = (nextPlanner, { toast } = {}) => {
    planner = normalizePlanner(nextPlanner);
    savePlanner(planner);
    if (toast) showToast(toast);
  };

  const addDay = () => {
    const dayId = uid("day");
    const n = planner.days.length + 1;
    expandedPlannerItemId = null;
    commitPlanner({
      ...planner,
      activeDayId: dayId,
      days: [
        ...planner.days,
        {
          id: dayId,
          title: `Day ${n}`,
          items: [],
        },
      ],
    });
    return dayId;
  };

  const setActiveDayId = (dayId) => {
    if (!planner.days.some((d) => d.id === dayId)) return false;
    expandedPlannerItemId = null;
    commitPlanner({ ...planner, activeDayId: dayId });
    return true;
  };

  const addPlaceToActiveDay = (placeId) => {
    const day = getActiveDay();
    if (!day) {
      commitPlanner(buildDefaultPlanner());
      return { added: false, reason: "no-day" };
    }
    if (day.items.some((it) => it.placeId === placeId)) return { added: false, reason: "exists" };

    commitPlanner({
      ...planner,
      days: planner.days.map((d) =>
        d.id === day.id
          ? {
              ...d,
              items: [...d.items, { id: uid("item"), placeId, startTime: "", endTime: "", memo: "" }],
            }
          : d,
      ),
    });
    return { added: true, dayTitle: day.title };
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
      let safeBottom = sheet.getSafeBottomPxRelativeToMap();
      if (safeBottom < 140) safeBottom = size.y;
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
      const place = placeById.get(id);
      if (!place) continue;
      const icon = createPinIcon({
        category: place.category || "",
        selected: id === state.selectedId,
        kind: guessKind(place),
      });
      marker.setIcon(icon);
    }
    renderList({
      places: state.filtered,
      selectedId: state.selectedId,
      statusById,
      inDayPlaceIds: getActiveDayPlaceIds(),
    });

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
    renderList({
      places: state.filtered,
      selectedId: state.selectedId,
      statusById,
      inDayPlaceIds: getActiveDayPlaceIds(),
    });
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
      if (placeId && action === "addToDay") {
        const result = addPlaceToActiveDay(placeId);
        sync({ keepView: true });
        if (result.added) {
          showToastAction(`Added to ${result.dayTitle} — tap to open Planner`, {
            durationMs: 4500,
            onClick: () => setView("planner"),
          });
        }
        else showToast(result.reason === "exists" ? "Already in this day" : "Could not add");
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

  const clearPlannerOverlay = () => plannerLayer.clearLayers();

  const renderPlannerOverlay = () => {
    clearPlannerOverlay();
    if (viewId !== "planner") return;

    const day = getActiveDay();
    if (!day) return;

    const latLngs = [];
    for (let idx = 0; idx < day.items.length; idx += 1) {
      const item = day.items[idx];
      const place = placeById.get(item.placeId);
      if (!place || !hasCoords(place)) continue;
      latLngs.push([place.lat, place.lon]);
    }

    if (latLngs.length >= 2) {
      L.polyline(latLngs, {
        pane: "plannerLine",
        color: "#fb7185",
        weight: 4,
        opacity: 0.55,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(plannerLayer);
    }

    for (let idx = 0; idx < day.items.length; idx += 1) {
      const item = day.items[idx];
      const place = placeById.get(item.placeId);
      if (!place || !hasCoords(place)) continue;
      const visited = !!statusById?.[place.id]?.visited;
      const marker = L.marker([place.lat, place.lon], {
        pane: "plannerMarker",
        icon: createDayNumberIcon(idx + 1, { visited }),
        keyboard: false,
      });
      marker.on("click", () => {
        state.selectedId = place.id;
        syncSelection();
      });
      marker.addTo(plannerLayer);
    }
  };

  const renderPlannerDays = () => {
    if (!plannerDaysEl) return;
    plannerDaysEl.innerHTML = "";
    for (const day of planner.days) {
      const active = day.id === planner.activeDayId;
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.dayId = day.id;
      el.className = [
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 transition",
        active
          ? "bg-white/10 text-white ring-white/20"
          : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10",
      ].join(" ");
      const count = day.items.length;
      el.innerHTML = `<span>${escapeHtml(day.title)}</span><span class="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-200 ring-1 ring-white/10">${count}</span>`;
      plannerDaysEl.appendChild(el);
    }
  };

	  const renderPlannerItems = () => {
	    if (!plannerItemsEl) return;
	    const day = getActiveDay();
	    if (!day) {
      plannerItemsEl.innerHTML = `
        <div class="p-6 text-center text-sm text-slate-300">
          <div class="font-extrabold text-slate-200">Planner</div>
          <div class="mt-2">No days found.</div>
        </div>
      `;
      return;
    }

    if (!day.items.length) {
      plannerItemsEl.innerHTML = `
        <div class="p-6 text-center text-sm text-slate-300">
          <div class="font-extrabold text-slate-200">No places yet</div>
          <div class="mt-2">Go to Places and tap <span class="font-extrabold">＋</span> to add stops.</div>
          <button
            type="button"
            data-action="goPlaces"
            class="mt-4 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
          >Go to Places</button>
        </div>
      `;
      return;
	    }

	    const rows = [];
	    for (let idx = 0; idx < day.items.length; idx += 1) {
	      const item = day.items[idx];
	      const place = placeById.get(item.placeId);
	      const name = escapeHtml(place?.name || "Unknown place");
	      const cat = escapeHtml(formatCategoryLabel(place?.category));
	      const pinned = !!place && hasCoords(place);
	      const isSelected = state.selectedId === item.placeId;
	      const isExpanded = expandedPlannerItemId === item.id;
	      const prev = idx > 0 ? placeById.get(day.items[idx - 1].placeId) : null;
	      const dist = prev && place ? haversineMeters(prev, place) : null;
	      const distText = dist != null ? formatDistance(dist) : "";
	      const startTime = (item.startTime || "").toString().trim();
	      const endTime = (item.endTime || "").toString().trim();
	      const memo = (item.memo || "").toString();
	      const memoPreview = memo.trim() ? memo.trim().split("\n")[0].slice(0, 80) : "";
	      const timeLabel =
	        startTime && endTime
	          ? `${startTime}–${endTime}`
	          : startTime
	            ? `${startTime}–`
	            : endTime
	              ? `–${endTime}`
	              : "";

	      rows.push(`
	        <div
	          class="group mb-2 w-full rounded-2xl p-3 text-left ring-1 transition ${
	            isSelected || isExpanded
	              ? "bg-fuchsia-500/15 ring-fuchsia-400/35"
	              : "bg-white/5 ring-white/10 hover:bg-white/8"
	          }"
	          data-item-id="${escapeHtml(item.id)}"
	          data-place-id="${escapeHtml(item.placeId)}"
	        >
	          <div class="flex items-start justify-between gap-3">
	            <button
	              type="button"
	              data-action="toggleItem"
	              data-item-id="${escapeHtml(item.id)}"
	              class="min-w-0 flex-1 text-left"
	              aria-expanded="${isExpanded ? "true" : "false"}"
	              title="Edit time & memo"
	            >
	              <div class="flex items-center gap-2">
	                <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-extrabold text-white ring-1 ring-white/10">${
	                  idx + 1
	                }</span>
	                <div class="truncate text-sm font-extrabold tracking-tight">${name}</div>
	              </div>
	              <div class="mt-1 truncate text-[11px] text-slate-300">${cat}</div>
	              <div class="mt-2 flex flex-wrap items-center gap-2">
	                <span class="rounded-full ${
	                  timeLabel
	                    ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/25"
	                    : "bg-white/5 text-slate-200 ring-1 ring-white/10"
	                } px-2 py-0.5 text-[10px] font-bold">${escapeHtml(timeLabel || "Set time")}</span>
	                ${
	                  pinned
	                    ? `<span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-400/25">PIN</span>`
	                    : `<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-400/25">NO PIN</span>`
	                }
	                ${distText ? `<span class="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-200 ring-1 ring-white/10">~${distText}</span>` : ""}
	                ${
	                  memoPreview
	                    ? `<span class="max-w-[14rem] truncate rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-200 ring-1 ring-white/10">📝 ${escapeHtml(memoPreview)}</span>`
	                    : ""
	                }
	              </div>
	            </button>
	            <div class="flex shrink-0 flex-col items-end gap-1">
	              <button
	                type="button"
	                data-action="itemRemove"
	                data-item-id="${escapeHtml(item.id)}"
	                class="inline-flex items-center justify-center rounded-full bg-white/5 px-2 py-1 text-[10px] font-extrabold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
	                title="Remove"
	              >✕</button>
	            </div>
	          </div>
	          <div class="${isExpanded ? "" : "hidden"} mt-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
	            <div class="grid grid-cols-2 gap-2">
	              <label class="block">
	                <div class="mb-1 text-[11px] font-semibold text-slate-300">Start</div>
	                <input
	                  type="time"
	                  value="${escapeHtml(startTime)}"
	                  data-item-id="${escapeHtml(item.id)}"
	                  data-field="startTime"
	                  class="w-full rounded-2xl bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 ring-1 ring-white/10 outline-none transition focus:ring-2 focus:ring-fuchsia-400/60"
	                />
	              </label>
	              <label class="block">
	                <div class="mb-1 text-[11px] font-semibold text-slate-300">End</div>
	                <input
	                  type="time"
	                  value="${escapeHtml(endTime)}"
	                  data-item-id="${escapeHtml(item.id)}"
	                  data-field="endTime"
	                  class="w-full rounded-2xl bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 ring-1 ring-white/10 outline-none transition focus:ring-2 focus:ring-fuchsia-400/60"
	                />
	              </label>
	            </div>
	            <label class="mt-3 block">
	              <div class="mb-1 text-[11px] font-semibold text-slate-300">Memo</div>
	              <textarea
	                rows="4"
	                data-item-id="${escapeHtml(item.id)}"
	                data-field="memo"
	                placeholder="Notes…"
	                class="w-full resize-none rounded-2xl bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 ring-1 ring-white/10 outline-none transition focus:ring-2 focus:ring-fuchsia-400/60"
	              >${escapeHtml(memo)}</textarea>
	            </label>
	            <div class="mt-3 flex justify-end">
	              <button
	                type="button"
	                data-action="collapseItem"
	                data-item-id="${escapeHtml(item.id)}"
	                class="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
	              >Done</button>
	            </div>
	          </div>
	        </div>
	      `);
	    }
	    plannerItemsEl.innerHTML = rows.join("");
	  };

  const renderPlanner = () => {
    renderPlannerDays();
    renderPlannerItems();
    renderPlannerOverlay();
    sheet?.refresh?.();
  };

  const setView = (nextViewId, { persist = true } = {}) => {
    viewId = nextViewId === "planner" ? "planner" : "places";
    if (persist) saveViewId(viewId);

    if (tabPlaces) tabPlaces.dataset.active = viewId === "places" ? "true" : "false";
    if (tabPlanner) tabPlanner.dataset.active = viewId === "planner" ? "true" : "false";

    placesHeader?.classList.toggle("hidden", viewId !== "places");
    panelPlaces?.classList.toggle("hidden", viewId !== "places");
    plannerHeader?.classList.toggle("hidden", viewId !== "planner");
    panelPlanner?.classList.toggle("hidden", viewId !== "planner");

    if (viewId === "planner") renderPlanner();
    else clearPlannerOverlay();

    sheet?.refresh?.();
  };

  tabPlaces?.addEventListener("click", () => setView("places"));
  tabPlanner?.addEventListener("click", () => setView("planner"));

  btnDayAdd?.addEventListener("click", () => {
    addDay();
    sync({ keepView: true });
    setView("planner");
    renderPlanner();
    showToast("Day added");
  });

  plannerDaysEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-day-id]");
    if (!btn) return;
    if (!setActiveDayId(btn.dataset.dayId)) return;
    sync({ keepView: true });
    renderPlanner();
    const day = getActiveDay();
    if (day) showToast(day.title);
  });

  plannerItemsEl?.addEventListener("click", (e) => {
    const goPlacesBtn = e.target.closest("button[data-action='goPlaces']");
    if (goPlacesBtn) {
      setView("places");
      return;
    }

    const actionBtn = e.target.closest("button[data-action][data-item-id]");
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      const itemId = actionBtn.dataset.itemId;
      if (!itemId) return;

      if (action === "collapseItem") {
        if (expandedPlannerItemId === itemId) expandedPlannerItemId = null;
        renderPlannerItems();
        sheet?.refresh?.();
        return;
      }

      if (action === "itemRemove") {
        const day = getActiveDay();
        if (!day) return;
        if (!day.items.some((it) => it.id === itemId)) return;
        if (expandedPlannerItemId === itemId) expandedPlannerItemId = null;
        commitPlanner({
          ...planner,
          days: planner.days.map((d) =>
            d.id === day.id ? { ...d, items: d.items.filter((it) => it.id !== itemId) } : d,
          ),
        });
        sync({ keepView: true });
        renderPlanner();
        showToast("Removed");
        return;
      }
    }

    const toggleBtn = e.target.closest("button[data-action='toggleItem'][data-item-id]");
    if (!toggleBtn) return;
    const card = toggleBtn.closest("[data-item-id][data-place-id]");
    if (!card) return;
    const itemId = card.dataset.itemId;
    const placeId = card.dataset.placeId;
    if (!itemId || !placeId) return;

    expandedPlannerItemId = expandedPlannerItemId === itemId ? null : itemId;

    const place = placeById.get(placeId);
    if (place) {
      state.selectedId = placeId;
      syncSelection();
    }
    renderPlannerItems();
    sheet?.refresh?.();
  });

  let plannerSaveTimer = null;
  const schedulePlannerSave = () => {
    window.clearTimeout(plannerSaveTimer);
    plannerSaveTimer = window.setTimeout(() => savePlanner(planner), 250);
  };
  const flushPlannerSave = () => {
    if (!plannerSaveTimer) return;
    window.clearTimeout(plannerSaveTimer);
    plannerSaveTimer = null;
    savePlanner(planner);
  };

  window.addEventListener("beforeunload", flushPlannerSave);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushPlannerSave();
  });

  const patchPlannerItem = (itemId, patch) => {
    const day = getActiveDay();
    if (!day) return false;
    if (!day.items.some((it) => it.id === itemId)) return false;
    planner = {
      ...planner,
      days: planner.days.map((d) =>
        d.id === day.id
          ? {
              ...d,
              items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
            }
          : d,
      ),
    };
    return true;
  };

  const focusPlannerField = (itemId, field) => {
    if (!plannerItemsEl) return;
    if (!window.matchMedia?.("(pointer: fine)")?.matches) return;
    const escape = globalThis.CSS?.escape ? globalThis.CSS.escape : (s) => String(s).replaceAll('"', '\\"');
    const el = plannerItemsEl.querySelector(
      `[data-item-id="${escape(itemId)}"][data-field="${escape(field)}"]`,
    );
    if (el && typeof el.focus === "function") el.focus();
  };

  plannerItemsEl?.addEventListener("input", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const fieldEl = target.closest("textarea[data-item-id][data-field]");
    if (!fieldEl) return;
    const itemId = fieldEl.dataset.itemId;
    const field = fieldEl.dataset.field;
    if (!itemId || field !== "memo") return;
    if (!patchPlannerItem(itemId, { memo: fieldEl.value })) return;
    schedulePlannerSave();
  });

  plannerItemsEl?.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const fieldEl = target.closest("input[type='time'][data-item-id][data-field]");
    if (!fieldEl) return;
    const itemId = fieldEl.dataset.itemId;
    const field = fieldEl.dataset.field;
    if (!itemId || (field !== "startTime" && field !== "endTime")) return;
    if (!patchPlannerItem(itemId, { [field]: fieldEl.value })) return;

    expandedPlannerItemId = itemId;
    planner = normalizePlanner(planner);
    savePlanner(planner);
    renderPlanner();
    focusPlannerField(itemId, field);
  });

  btnDayClear?.addEventListener("click", () => {
    const day = getActiveDay();
    if (!day) return;
    if (!day.items.length) return;
    if (!confirm(`Clear all stops in ${day.title}?`)) return;
    commitPlanner({
      ...planner,
      days: planner.days.map((d) => (d.id === day.id ? { ...d, items: [] } : d)),
    });
    sync({ keepView: true });
    renderPlanner();
    showToast("Cleared");
  });

  btnPlanExport?.addEventListener("click", () => {
    const payload = {
      ...planner,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trip-planner.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Exported");
  });

  planImportEl?.addEventListener("change", async () => {
    const file = planImportEl.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      commitPlanner(parsed);
      sync({ keepView: true });
      setView("planner");
      renderPlanner();
      showToast("Imported");
    } catch {
      showToast("Import failed");
    } finally {
      planImportEl.value = "";
    }
  });

  btnPlanFit?.addEventListener("click", () => {
    const day = getActiveDay();
    if (!day) return;
    const pts = day.items
      .map((it) => placeById.get(it.placeId))
      .filter((p) => p && hasCoords(p))
      .map((p) => [p.lat, p.lon]);
    if (!pts.length) {
      showToast("No pins in this day");
      return;
    }
    const bounds = L.latLngBounds(pts);
    if (bounds.isValid() && bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(bounds.getCenter(), 15, { animate: true });
      showToast("Fit day");
      return;
    }
    const base = 24;
    const options = { animate: true };
    if (sheet?.isEnabled?.()) {
      const size = map.getSize();
      let safeBottom = sheet.getSafeBottomPxRelativeToMap();
      if (safeBottom < 140) safeBottom = size.y;
      const covered = Math.max(0, size.y - safeBottom);
      options.paddingTopLeft = [base, base];
      options.paddingBottomRight = [base, base + covered];
    } else {
      options.padding = [base, base];
    }
    map.fitBounds(bounds.pad(0.18), options);
    showToast("Fit day");
  });

  const buildDirectionsUrl = ({ origin, destination, waypoints = [] }) => {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    if (origin) url.searchParams.set("origin", origin);
    if (destination) url.searchParams.set("destination", destination);
    if (waypoints.length) url.searchParams.set("waypoints", waypoints.join("|"));
    url.searchParams.set("travelmode", "walking");
    return url.toString();
  };

  btnPlanRoute?.addEventListener("click", () => {
    const day = getActiveDay();
    if (!day) return;
    const stops = day.items
      .map((it) => placeById.get(it.placeId))
      .filter(Boolean)
      .map((p) => (hasCoords(p) ? `${p.lat},${p.lon}` : p.address || p.name || ""))
      .map((s) => String(s).trim())
      .filter(Boolean);

    if (!stops.length) {
      showToast("Add places to plan a route");
      return;
    }

    if (stops.length === 1) {
      window.open(
        buildDirectionsUrl({ destination: stops[0] }),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    const maxStops = 5; // origin + up to 3 waypoints + destination (mobile-friendly)
    if (stops.length <= maxStops) {
      const url = buildDirectionsUrl({
        origin: stops[0],
        destination: stops[stops.length - 1],
        waypoints: stops.slice(1, -1),
      });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const segments = [];
    for (let i = 0; i < stops.length; i += 1) {
      const slice = stops.slice(i, i + maxStops);
      if (slice.length >= 2) segments.push(slice);
      if (i + maxStops >= stops.length) break;
      i += maxStops - 2; // overlap 1 stop (next origin)
    }

    const ok = confirm(
      `This day has ${stops.length} stops.\nGoogle Maps mobile supports up to 3 waypoints per route.\nOpen ${segments.length} route tabs?`,
    );
    const toOpen = ok ? segments : [segments[0]];

    let blocked = false;
    for (const seg of toOpen) {
      const url = buildDirectionsUrl({
        origin: seg[0],
        destination: seg[seg.length - 1],
        waypoints: seg.slice(1, -1),
      });
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) blocked = true;
    }
    if (blocked) showToast("Popup blocked — allow popups to open all segments");
  });

  setView(viewId, { persist: false });

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
    if (sheet?.isEnabled?.()) {
      const safeBottom = sheet.getSafeBottomPxRelativeToMap();
      bottom = safeBottom < 140 ? bottom : Math.min(bottom, safeBottom);
    }
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

registerInstallPrompt();
registerServiceWorker();
main();
