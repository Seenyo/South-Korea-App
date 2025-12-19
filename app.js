import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from "./config.js";

const $ = (selector, root = document) => root.querySelector(selector);

const STATUS_KEY = "sc_trip_status_v1";
const PLANNER_KEY = "sc_trip_planner_v1";
const VIEW_KEY = "sc_trip_view_v1";
const INSTALL_TIP_KEY = "sc_trip_install_tip_v1";
const CAT_EXPANDED_KEY = "sc_trip_cat_expanded_v1";
const SYNC_SETTINGS_KEY = "sc_trip_sync_v1";
const CLIENT_ID_KEY = "sc_trip_client_id_v1";
const LAST_USER_KEY = "sc_trip_last_user_v1";
const ONBOARDING_SEEN_KEY = "sc_trip_onboarding_seen_v1";
const GMAPS_MODE_KEY = "sc_trip_gmaps_mode_v1";

function uid(prefix) {
  const p = prefix ? `${prefix}_` : "";
  if (globalThis.crypto?.randomUUID) return `${p}${globalThis.crypto.randomUUID()}`;
  return `${p}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function uuidv4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) return uid("uuid");
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  // RFC 4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function loadClientId() {
  try {
    const raw = localStorage.getItem(CLIENT_ID_KEY);
    if (raw) return String(raw);
    const next = uid("client");
    localStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return uid("client");
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${parts.join(",")}}`;
}

function loadSyncSettings() {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const userId = typeof parsed?.userId === "string" ? parsed.userId.trim() : "";
    const tripId = typeof parsed?.tripId === "string" ? parsed.tripId.trim() : "";
    const joinCode = typeof parsed?.joinCode === "string" ? parsed.joinCode.trim() : "";
    if (!tripId || !joinCode) return null;
    return { userId: userId || null, tripId, joinCode };
  } catch {
    return null;
  }
}

function saveSyncSettings(settings) {
  try {
    if (!settings) {
      localStorage.removeItem(SYNC_SETTINGS_KEY);
      return;
    }
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
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

function loadGmapsMode() {
  try {
    const raw = localStorage.getItem(GMAPS_MODE_KEY);
    return raw === "driving" || raw === "transit" || raw === "walking" ? raw : "walking";
  } catch {
    return "walking";
  }
}

function saveGmapsMode(mode) {
  const next = mode === "driving" || mode === "transit" || mode === "walking" ? mode : "walking";
  try {
    localStorage.setItem(GMAPS_MODE_KEY, next);
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

function loadCategoryExpanded() {
  try {
    return localStorage.getItem(CAT_EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCategoryExpanded(expanded) {
  try {
    localStorage.setItem(CAT_EXPANDED_KEY, expanded ? "1" : "0");
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

let googleMapsLoadPromise = null;
function loadGoogleMapsJsApi({ apiKey, libraries = [] } = {}) {
  if (window.google?.maps) return Promise.resolve();
  const key = String(apiKey || "").trim();
  if (!key) {
    return Promise.reject(
      new Error("Missing Google Maps API key. Set GOOGLE_MAPS_API_KEY in config.js"),
    );
  }

  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const cb = `__gmaps_cb_${Math.random().toString(36).slice(2)}`;
    window[cb] = () => {
      try {
        delete window[cb];
      } catch {
        // ignore
      }
      resolve();
    };

    const params = new URLSearchParams({
      key,
      v: "weekly",
      callback: cb,
    });
    const libs = Array.isArray(libraries) ? libraries.filter(Boolean) : [];
    if (libs.length) params.set("libraries", libs.join(","));

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      try {
        delete window[cb];
      } catch {
        // ignore
      }
      reject(new Error("Failed to load Google Maps JavaScript API"));
    };

    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
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

function buildMarkerIconDataUrl({ category, selected }) {
  const palette = categoryStyle(category);
  const [c1, c2] = palette.gradient;
  const ring = selected
    ? `<circle cx="17" cy="17" r="16.5" fill="rgba(236,72,153,0.18)" />`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
        <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="rgba(0,0,0,0.55)"/>
        </filter>
      </defs>
      ${ring}
      <circle cx="17" cy="17" r="14.8" fill="url(#g)" stroke="rgba(255,255,255,0.18)" stroke-width="1" filter="url(#s)"/>
      <circle cx="17" cy="17" r="5.2" fill="rgba(255,255,255,0.86)"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
  const sourceUrl = place.url || naverUrl;

  const buttons = [
    `<button class="inline-flex items-center justify-center rounded-xl bg-fuchsia-500/20 px-3 py-2 text-xs font-extrabold text-white ring-1 ring-fuchsia-400/35 hover:bg-fuchsia-500/25" type="button" data-action="popupAdd" data-place-id="${escapeHtml(place.id)}">Add</button>`,
    `<button class="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15" type="button" data-action="popupDirections" data-place-id="${escapeHtml(place.id)}">Directions</button>`,
    naverUrl
      ? `<a class="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15" target="_blank" rel="noreferrer" href="${naverUrl}">Naver</a>`
      : "",
    sourceUrl && /^https?:\/\//.test(sourceUrl)
      ? `<a class="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15" target="_blank" rel="noreferrer" href="${sourceUrl}">Link</a>`
      : "",
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
      "flex w-full items-center justify-between gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 transition",
      active
        ? "bg-fuchsia-500/20 text-white ring-fuchsia-400/40"
        : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10",
    ].join(" ");

    el.innerHTML = `<span class="min-w-0 truncate">${escapeHtml(label)}</span><span class="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-200 ring-1 ring-white/10">${count}</span>`;
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

function renderList({ places, selectedId, statusById, inPlannerPlaceIds }) {
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
    const isInPlanner = !!inPlannerPlaceIds?.has?.(place.id);

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
          isInPlanner
            ? "bg-cyan-400/20 text-cyan-200 ring-cyan-300/30"
            : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
        }"
        title="${isInPlanner ? "Already in planner (tap to add)" : "Add to planner"}"
      >＋</button>
    `;

    const hasDirectionTarget = pinned;

    const directionsBtn = `
      <button
        type="button"
        data-action="directions"
        data-place-id="${escapeHtml(place.id)}"
        ${hasDirectionTarget ? "" : "disabled"}
        class="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-extrabold ring-1 transition ${
          hasDirectionTarget
            ? "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
            : "bg-white/5 text-slate-200/70 ring-white/10 opacity-40 cursor-not-allowed"
        }"
        title="${
          hasDirectionTarget ? "Directions" : "Directions need a pin coordinate"
        }"
      >↗</button>
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
            ${directionsBtn}
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

async function main() {
  const searchInput = $("#search");
  const btnClearSearch = $("#btnClearSearch");
  const tabPlaces = $("#tabPlaces");
  const tabPlanner = $("#tabPlanner");
  const placesHeader = $("#placesHeader");
  const plannerHeader = $("#plannerHeader");
  const panelPlaces = $("#panelPlaces");
  const panelPlanner = $("#panelPlanner");
  const btnToggleCategories = $("#btnToggleCategories");
  const categoryWrap = $("#categoryWrap");
  const categorySummary = $("#categorySummary");
  const categoryCaret = $("#categoryCaret");
  const btnDayAdd = $("#btnDayAdd");
  const btnDayDelete = $("#btnDayDelete");
  const btnSync = $("#btnSync");
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
  let gmapsMode = loadGmapsMode();
  let planner = loadPlanner();
  let viewId = loadViewId();
  let expandedPlannerItemId = null;
  const clientId = loadClientId();

  const SUPABASE_URL = "https://mpqbactsrbpoqtveqomm.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wcWJhY3RzcmJwb3F0dmVxb21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNDAzNzMsImV4cCI6MjA4MTYxNjM3M30.Ddjn-9Jkk7lvncMavUYRuUdSrXoHSdj0fCJVv9z9EIo";
  const SUPABASE_JS_VERSION = "2.88.0";

  const authState = {
    session: null,
    userId: null,
    nickname: null,
  };

  const syncState = {
    enabled: false,
    connecting: false,
    tripId: null,
    joinCode: null,
    tripTitle: null,
    tripCreatedBy: null,
    client: null,
    channel: null,
    pushTimer: null,
    pushInFlight: false,
    plannerVersion: 0,
    statusVersion: 0,
    pushedPlannerVersion: 0,
    pushedStatusVersion: 0,
    suppressPush: false,
  };

  const setSyncUi = (state) => {
    if (!btnSync) return;
    const base = [
      "rounded-full",
      "px-3",
      "py-1.5",
      "text-xs",
      "font-semibold",
      "text-white",
      "ring-1",
      "transition",
      "hover:bg-white/15",
    ];
    btnSync.className = base.join(" ");
    btnSync.textContent = state === "on" ? "Trips ✓" : state === "connecting" ? "Trips…" : "Trips";
    if (state === "on") {
      btnSync.classList.add("bg-emerald-500/15", "ring-emerald-400/30");
    } else if (state === "connecting") {
      btnSync.classList.add("bg-amber-500/15", "ring-amber-400/30");
    } else {
      btnSync.classList.add("bg-white/10", "ring-white/10");
    }
  };

  setSyncUi("off");

  const randomJoinCode = () => {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      let str = "";
      for (const b of bytes) str += String.fromCharCode(b);
      return btoa(str).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    } catch {
      return uid("join");
    }
  };

  const parseTripParamsFromUrl = (urlLike) => {
    try {
      const u = new URL(String(urlLike), window.location.href);
      const tripId = (u.searchParams.get("trip") || "").trim();
      const joinCode = (u.searchParams.get("key") || "").trim();
      if (!tripId || !joinCode) return null;
      return { tripId, joinCode };
    } catch {
      return null;
    }
  };

  const buildShareUrl = ({ tripId, joinCode }) => {
    const u = new URL(window.location.href);
    u.searchParams.set("trip", tripId);
    u.searchParams.set("key", joinCode);
    return u.toString();
  };

  const stripShareParamsFromUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete("trip");
    u.searchParams.delete("key");
    return u.toString();
  };

  const isEmptyPlanner = (p) => {
    const days = Array.isArray(p?.days) ? p.days : [];
    for (const d of days) {
      if (Array.isArray(d?.items) && d.items.length) return false;
    }
    return true;
  };

  const isEmptyStatus = (s) => {
    if (!s || typeof s !== "object") return true;
    for (const v of Object.values(s)) {
      if (v && typeof v === "object" && (v.favorite || v.visited)) return false;
    }
    return true;
  };

  const summarizeLocal = () => {
    const dayCount = planner.days.length;
    const stopCount = planner.days.reduce((n, d) => n + (d.items?.length || 0), 0);
    const favorites = allPlaces.filter((p) => statusById?.[p.id]?.favorite).length;
    const visited = allPlaces.filter((p) => statusById?.[p.id]?.visited).length;
    return { dayCount, stopCount, favorites, visited };
  };

  const summarizeRemote = ({ planner: rp, status: rs }) => {
    const p = normalizePlanner(rp);
    const s = rs && typeof rs === "object" ? rs : {};
    const dayCount = p.days.length;
    const stopCount = p.days.reduce((n, d) => n + (d.items?.length || 0), 0);
    const favorites = allPlaces.filter((pl) => s?.[pl.id]?.favorite).length;
    const visited = allPlaces.filter((pl) => s?.[pl.id]?.visited).length;
    return { dayCount, stopCount, favorites, visited };
  };

  const copyToClipboard = async (text) => {
    const value = String(text || "");
    if (!value) return false;
    try {
      await navigator.clipboard?.writeText?.(value);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  };

  let supabaseModulePromise = null;
  const getSupabaseClient = async () => {
    if (syncState.client) return syncState.client;
    if (!supabaseModulePromise) {
      supabaseModulePromise = import(
        `https://esm.sh/@supabase/supabase-js@${encodeURIComponent(SUPABASE_JS_VERSION)}`,
      );
    }
    const mod = await supabaseModulePromise;
    const createClient = mod?.createClient;
    if (typeof createClient !== "function") throw new Error("Supabase client load failed");

    syncState.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
    return syncState.client;
  };

  const syncErrorMessage = (err) => {
    const msg = String(err?.message || err || "");
    const lower = msg.toLowerCase();
    const code = typeof err?.code === "string" ? err.code : "";
    if (code === "42501" || lower.includes("row-level security") || lower.includes("row level security")) {
      return "Supabase policy blocked sync — re-run supabase_setup.sql";
    }
    return null;
  };

  const stripAuthParamsFromUrl = () => {
    try {
      const u = new URL(window.location.href);
      for (const k of [
        "code",
        "state",
        "error",
        "error_code",
        "error_description",
        "provider",
        "type",
      ]) {
        u.searchParams.delete(k);
      }
      return u.toString();
    } catch {
      return null;
    }
  };

  const getNicknameFromSession = (session) => {
    const meta = session?.user?.user_metadata;
    const nick = typeof meta?.nickname === "string" ? meta.nickname.trim() : "";
    return nick || null;
  };

  const showSignInGate = async (client, { errorMessage } = {}) => {
    const existing = $("#authGate");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "authGate";
    overlay.className = "fixed inset-0 z-[6000] flex items-center justify-center p-6";

    overlay.innerHTML = `
      <div class="absolute inset-0 bg-black/65 backdrop-blur-md"></div>
      <div class="relative w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl">
        <div class="text-lg font-extrabold tracking-tight text-white">Trip Planner</div>
        <div class="mt-1 text-sm text-slate-300">Sign in to sync across devices & friends.</div>
        ${errorMessage ? `<div class="mt-3 rounded-2xl bg-rose-500/10 p-3 text-[11px] text-rose-100 ring-1 ring-rose-400/20">${escapeHtml(errorMessage)}</div>` : ""}

        <div class="mt-5 grid gap-2">
          <button
            type="button"
            data-action="google"
            class="w-full rounded-2xl bg-white/10 px-4 py-3 text-left ring-1 ring-white/10 transition hover:bg-white/15"
          >
            <div class="text-sm font-extrabold text-white">Continue with Google</div>
            <div class="mt-1 text-[11px] text-slate-300">Required</div>
          </button>
          <div class="text-[11px] text-slate-400">Tip: if nothing happens, disable pop-up blockers and try again.</div>
        </div>
      </div>
    `;

    overlay.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action='google']");
      if (!btn) return;
      btn.disabled = true;
      try {
        await client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.href },
        });
      } catch (err) {
        btn.disabled = false;
        showToast(String(err?.message || err || "Sign-in failed"), { durationMs: 4000 });
      }
    });

    document.body.appendChild(overlay);
  };

  const openNicknameModal = ({ suggested } = {}) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[6100] flex items-end md:items-center justify-center";
      overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
        <div class="relative w-full md:max-w-md md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
          <div class="border-b border-white/10 px-5 py-4">
            <div class="text-base font-extrabold tracking-tight text-white">Pick a nickname</div>
            <div class="mt-1 text-xs text-slate-300">Shown to collaborators in the future.</div>
          </div>

          <div class="px-5 py-4">
            <label class="block">
              <span class="sr-only">Nickname</span>
              <input
                id="nickInput"
                type="text"
                autocomplete="nickname"
                maxlength="30"
                placeholder="e.g. Kenta"
                value="${escapeHtml(String(suggested || ""))}"
                class="w-full rounded-2xl bg-black/25 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-fuchsia-400/60"
              />
            </label>
            <div class="mt-2 text-[11px] text-slate-400">You can change this later.</div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              data-action="cancel"
              class="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >Sign out</button>
            <button
              type="button"
              data-action="save"
              class="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
            >Save</button>
          </div>
        </div>
      `;

      let cleanup = () => overlay.remove();
      const close = (value) => {
        cleanup();
        resolve(value);
      };

      const input = overlay.querySelector("#nickInput");
      const saveBtn = overlay.querySelector("button[data-action='save']");
      const updateSaveEnabled = () => {
        const value = String(input?.value || "").trim();
        saveBtn.disabled = value.length < 1;
      };
      input?.addEventListener("input", updateSaveEnabled);
      updateSaveEnabled();

      overlay.addEventListener("click", (e) => {
        if (e.target.closest("button[data-action='cancel']")) return close(null);
        if (e.target.closest("button[data-action='save']")) {
          const value = String(input?.value || "").trim();
          if (!value) return;
          return close(value);
        }
      });

      document.body.appendChild(overlay);
      input?.focus?.();
      try {
        input?.setSelectionRange?.(999, 999);
      } catch {
        // ignore
      }
    });

  const openTextPromptModal = ({
    title,
    subtitle,
    placeholder,
    initialValue,
    confirmLabel = "Save",
  } = {}) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[6100] flex items-end md:items-center justify-center";
      overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
        <div class="relative w-full md:max-w-md md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
          <div class="border-b border-white/10 px-5 py-4">
            <div class="text-base font-extrabold tracking-tight text-white">${escapeHtml(
              String(title || "Edit"),
            )}</div>
            ${subtitle ? `<div class="mt-1 text-xs text-slate-300">${escapeHtml(String(subtitle))}</div>` : ""}
          </div>

          <div class="px-5 py-4">
            <label class="block">
              <span class="sr-only">Value</span>
              <input
                id="promptInput"
                type="text"
                maxlength="60"
                placeholder="${escapeHtml(String(placeholder || ""))}"
                value="${escapeHtml(String(initialValue || ""))}"
                class="w-full rounded-2xl bg-black/25 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-fuchsia-400/60"
              />
            </label>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              data-action="cancel"
              class="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >Cancel</button>
            <button
              type="button"
              data-action="save"
              class="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
            >${escapeHtml(String(confirmLabel || "Save"))}</button>
          </div>
        </div>
      `;

      const cleanup = () => overlay.remove();
      const close = (value) => {
        cleanup();
        resolve(value);
      };

      const input = overlay.querySelector("#promptInput");
      const saveBtn = overlay.querySelector("button[data-action='save']");
      const updateEnabled = () => {
        const value = String(input?.value || "").trim();
        saveBtn.disabled = value.length < 1;
      };
      input?.addEventListener("input", updateEnabled);
      updateEnabled();

      const onKeyDown = (e) => {
        if (e.key === "Escape") close(null);
        if (e.key === "Enter") {
          const value = String(input?.value || "").trim();
          if (value) close(value);
        }
      };
      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", (e) => {
        if (e.target.closest("button[data-action='cancel']")) return close(null);
        if (e.target.closest("button[data-action='save']")) {
          const value = String(input?.value || "").trim();
          if (!value) return;
          return close(value);
        }
      });

      document.body.appendChild(overlay);
      input?.focus?.();
      try {
        input?.setSelectionRange?.(999, 999);
      } catch {
        // ignore
      }

      const originalCleanup = cleanup;
      cleanup = () => {
        originalCleanup();
        window.removeEventListener("keydown", onKeyDown);
      };
    });

  const ensureSignedIn = async () => {
    const client = await getSupabaseClient();

    const url = new URL(window.location.href);
    const authErr =
      url.searchParams.get("error_description") ||
      url.searchParams.get("error") ||
      url.searchParams.get("error_code");
    if (authErr) showToast(String(authErr).slice(0, 140), { durationMs: 5000 });

    if (url.searchParams.get("code")) {
      try {
        const ex = await client.auth.exchangeCodeForSession(window.location.href);
        if (ex?.error) showToast(String(ex.error?.message || ex.error || "Auth failed"), { durationMs: 5000 });
      } catch {
        // ignore
      }
    }

    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session || null;

    if (!session) {
      await showSignInGate(client, { errorMessage: authErr });
      return null;
    }

    const cleanUrl = stripAuthParamsFromUrl();
    if (cleanUrl) {
      try {
        window.history.replaceState({}, "", cleanUrl);
      } catch {
        // ignore
      }
    }

    authState.session = session;
    authState.userId = session.user?.id || null;
    authState.nickname = getNicknameFromSession(session);

    try {
      const prev = localStorage.getItem(LAST_USER_KEY);
      const next = authState.userId || "";
      if (prev && next && prev !== next) {
        localStorage.removeItem(PLANNER_KEY);
        localStorage.removeItem(STATUS_KEY);
        localStorage.removeItem(SYNC_SETTINGS_KEY);
        planner = buildDefaultPlanner();
        statusById = {};
      }
      if (next) localStorage.setItem(LAST_USER_KEY, next);
    } catch {
      // ignore
    }

    if (!authState.nickname) {
      const meta = session?.user?.user_metadata || {};
      const suggested =
        (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta?.name === "string" && meta.name.trim()) ||
        "";
      const picked = await openNicknameModal({ suggested });
      if (!picked) {
        try {
          await client.auth.signOut();
        } catch {
          // ignore
        }
        await showSignInGate(client);
        return null;
      }
      const up = await client.auth.updateUser({ data: { nickname: picked } });
      if (up?.error) {
        showToast(String(up.error?.message || up.error || "Nickname save failed"), { durationMs: 5000 });
      } else {
        authState.nickname = picked;
      }
    }

    const gate = $("#authGate");
    if (gate) gate.remove();
    return session;
  };

  const authedSession = await ensureSignedIn();
  if (!authedSession) return;

  const openSyncConflictModal = ({ local, remote }) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[2600] flex items-end md:items-center justify-center";

      overlay.innerHTML = `
        <div data-action="backdrop" class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
        <div class="relative w-full md:max-w-md md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
          <div class="border-b border-white/10 px-5 py-4">
            <div class="text-base font-extrabold tracking-tight text-white">Choose data to keep</div>
            <div class="mt-1 text-xs text-slate-300">Your device and the cloud have different data.</div>
          </div>

          <div class="px-5 py-4">
            <div class="grid gap-3">
              <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div class="text-xs font-semibold text-slate-300">This device</div>
                <div class="mt-2 text-sm font-extrabold text-white">${local.dayCount} days · ${
                  local.stopCount
                } stops</div>
                <div class="mt-1 text-[11px] text-slate-300">${local.favorites} favorites · ${
                  local.visited
                } visited</div>
              </div>
              <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div class="text-xs font-semibold text-slate-300">Cloud</div>
                <div class="mt-2 text-sm font-extrabold text-white">${remote.dayCount} days · ${
                  remote.stopCount
                } stops</div>
                <div class="mt-1 text-[11px] text-slate-300">${remote.favorites} favorites · ${
                  remote.visited
                } visited</div>
              </div>
            </div>

            <div class="mt-4 grid gap-2">
              <button
                type="button"
                data-action="useCloud"
                class="w-full rounded-2xl bg-emerald-500/15 px-4 py-3 text-left ring-1 ring-emerald-400/30 transition hover:bg-emerald-500/20"
              >
                <div class="text-sm font-extrabold text-white">Use cloud</div>
                <div class="mt-1 text-[11px] text-slate-200/80">Replace this device's data</div>
              </button>

              <button
                type="button"
                data-action="useLocal"
                class="w-full rounded-2xl bg-rose-500/15 px-4 py-3 text-left ring-1 ring-rose-400/30 transition hover:bg-rose-500/20"
              >
                <div class="text-sm font-extrabold text-white">Upload local</div>
                <div class="mt-1 text-[11px] text-slate-200/80">Replace the cloud data</div>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              data-action="cancel"
              class="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >Cancel</button>
          </div>
        </div>
      `;

      const cleanup = () => {
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown);
      };

      const close = (value) => {
        cleanup();
        resolve(value);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") close(null);
      };
      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", (e) => {
        if (e.target.closest("[data-action='backdrop']")) return close(null);
        if (e.target.closest("button[data-action='cancel']")) return close(null);
        if (e.target.closest("button[data-action='useCloud']")) return close("cloud");
        if (e.target.closest("button[data-action='useLocal']")) return close("local");
      });

      document.body.appendChild(overlay);
    });

  const applyRemoteState = ({ remotePlanner, remoteStatus }) => {
    syncState.suppressPush = true;
    try {
      if (remotePlanner) {
        planner = normalizePlanner(remotePlanner);
        savePlanner(planner);
      }
      if (remoteStatus) {
        statusById = remoteStatus && typeof remoteStatus === "object" ? remoteStatus : {};
        saveStatus(statusById);
      }
    } finally {
      syncState.suppressPush = false;
    }
  };

  const subscribeToTrip = async (client) => {
    if (!syncState.tripId) return;
    if (syncState.channel) {
      try {
        await syncState.channel.unsubscribe();
      } catch {
        // ignore
      }
      syncState.channel = null;
    }

    syncState.channel = client
      .channel(`trip:${syncState.tripId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trips",
          filter: `id=eq.${syncState.tripId}`,
        },
        (payload) => {
          const next = payload?.new;
          if (!next || typeof next !== "object") return;
          if (next.updated_by && String(next.updated_by) === clientId) return;

          if (typeof next.title === "string") syncState.tripTitle = next.title;
          if ("created_by" in next) syncState.tripCreatedBy = next.created_by || null;

          const remotePlanner = next.planner;
          const remoteStatus = next.status;
          applyRemoteState({ remotePlanner, remoteStatus });

          sync({ keepView: true });
          if (viewId === "planner") renderPlanner();
          showToast("Synced");
        },
      )
      .subscribe();
  };

  const connectToTrip = async ({ tripId, joinCode }, { source = "manual" } = {}) => {
    if (!tripId || !joinCode) return false;
    if (syncState.connecting) return false;

    syncState.connecting = true;
    setSyncUi("connecting");

    try {
      const client = await getSupabaseClient();
      const userId = authState.userId;
      if (!userId) throw new Error("Please sign in");

      if (syncState.enabled && syncState.tripId && String(syncState.tripId) !== String(tripId)) {
        try {
          await pushTripUpdates();
        } catch {
          // ignore
        }
        try {
          await disconnectSync({ silent: true });
        } catch {
          // ignore
        }
        planner = buildDefaultPlanner();
        statusById = {};
        savePlanner(planner);
        saveStatus(statusById);
      }

      const joinRes = await client
        .from("trip_members")
        .insert({ trip_id: tripId, user_id: userId, join_code: joinCode });
      if (joinRes?.error && joinRes.error?.code !== "23505") throw joinRes.error;

      const tripRes = await client
        .from("trips")
        .select("id,title,created_by,planner,status,join_code,updated_at,updated_by")
        .eq("id", tripId)
        .single();
      if (tripRes?.error) throw tripRes.error;
      const row = tripRes.data;

      const remoteJoinCode = typeof row?.join_code === "string" && row.join_code ? row.join_code : joinCode;
      const remoteTitle = typeof row?.title === "string" ? row.title : "";
      const remoteCreatedBy = row?.created_by || null;

      const remotePlanner = normalizePlanner(row?.planner);
      const remoteStatus = row?.status && typeof row.status === "object" ? row.status : {};

      const localHas = !isEmptyPlanner(planner) || !isEmptyStatus(statusById);
      const remoteHas = !isEmptyPlanner(remotePlanner) || !isEmptyStatus(remoteStatus);

      const localSig = stableStringify({ planner, statusById });
      const remoteSig = stableStringify({ planner: remotePlanner, statusById: remoteStatus });

      if (localHas && remoteHas && localSig !== remoteSig) {
        const choice = await openSyncConflictModal({
          local: summarizeLocal(),
          remote: summarizeRemote({ planner: remotePlanner, status: remoteStatus }),
        });

        if (!choice) {
          setSyncUi("off");
          syncState.connecting = false;
          return false;
        }

        if (choice === "cloud") {
          applyRemoteState({ remotePlanner, remoteStatus });
        } else if (choice === "local") {
          await client
            .from("trips")
            .update({
              planner,
              status: statusById,
              updated_by: clientId,
            })
            .eq("id", tripId);
        }
      } else if (remoteHas) {
        applyRemoteState({ remotePlanner, remoteStatus });
      }

      syncState.enabled = true;
      syncState.tripId = tripId;
      syncState.joinCode = remoteJoinCode;
      syncState.tripTitle = remoteTitle || null;
      syncState.tripCreatedBy = remoteCreatedBy;
      saveSyncSettings({ userId, tripId, joinCode: remoteJoinCode });

      try {
        const url = buildShareUrl({ tripId, joinCode: remoteJoinCode });
        window.history.replaceState({}, "", url);
      } catch {
        // ignore
      }

      await subscribeToTrip(client);

      sync({ keepView: true });
      if (viewId === "planner") renderPlanner();

      showToast(source === "auto" ? "Trip connected" : "Connected");
      setSyncUi("on");
      return true;
    } catch (err) {
      showToast(syncErrorMessage(err) || "Connection failed");
      setSyncUi("off");
      return false;
    } finally {
      syncState.connecting = false;
    }
  };

  const createSharedTrip = async ({ title } = {}) => {
    if (syncState.connecting) return null;
    syncState.connecting = true;
    setSyncUi("connecting");

    try {
      const client = await getSupabaseClient();
      const userId = authState.userId;
      if (!userId) throw new Error("Please sign in");

      if (syncState.enabled && syncState.tripId) {
        try {
          await pushTripUpdates();
        } catch {
          // ignore
        }
        try {
          await disconnectSync({ silent: true });
        } catch {
          // ignore
        }
      }

      const tripId = uuidv4();
      const tripTitle = String(title || "").trim() || "New trip";
      const emptyPlanner = buildDefaultPlanner();
      const emptyStatus = {};

      let joinCode = randomJoinCode();
      let insertOk = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const insertRes = await client.from("trips").insert({
          id: tripId,
          join_code: joinCode,
          title: tripTitle,
          created_by: userId,
          planner: emptyPlanner,
          status: emptyStatus,
          updated_by: clientId,
        });
        if (!insertRes?.error) {
          insertOk = true;
          break;
        }
        // Collision (extremely rare). Regenerate join code and retry.
        if (insertRes.error?.code === "23505") {
          joinCode = randomJoinCode();
          continue;
        }
        throw insertRes.error;
      }
      if (!insertOk) throw new Error("Trip create failed");

      const joinRes = await client
        .from("trip_members")
        .insert({ trip_id: tripId, user_id: userId, join_code: joinCode });
      if (joinRes?.error && joinRes.error?.code !== "23505") throw joinRes.error;

      planner = emptyPlanner;
      statusById = emptyStatus;
      savePlanner(planner);
      saveStatus(statusById);

      syncState.enabled = true;
      syncState.tripId = tripId;
      syncState.joinCode = joinCode;
      syncState.tripTitle = tripTitle;
      syncState.tripCreatedBy = userId;
      saveSyncSettings({ userId, tripId, joinCode });

      try {
        window.history.replaceState({}, "", buildShareUrl({ tripId, joinCode }));
      } catch {
        // ignore
      }

      await subscribeToTrip(client);

      sync({ keepView: true });
      if (viewId === "planner") renderPlanner();

      setSyncUi("on");
      showToast("Trip created");
      return { tripId, joinCode };
    } catch (err) {
      showToast(syncErrorMessage(err) || "Could not create trip");
      setSyncUi("off");
      return null;
    } finally {
      syncState.connecting = false;
    }
  };

  const disconnectSync = async ({ silent } = {}) => {
    syncState.enabled = false;
    syncState.tripId = null;
    syncState.joinCode = null;
    syncState.tripTitle = null;
    syncState.tripCreatedBy = null;
    saveSyncSettings(null);
    setSyncUi("off");

    if (syncState.channel) {
      try {
        await syncState.channel.unsubscribe();
      } catch {
        // ignore
      }
      syncState.channel = null;
    }

    try {
      window.history.replaceState({}, "", stripShareParamsFromUrl());
    } catch {
      // ignore
    }

    if (!silent) showToast("Disconnected");
  };

  const markPlannerDirty = () => {
    if (!syncState.enabled) return;
    if (syncState.suppressPush) return;
    syncState.plannerVersion += 1;
    scheduleTripPush();
  };

  const markStatusDirty = () => {
    if (!syncState.enabled) return;
    if (syncState.suppressPush) return;
    syncState.statusVersion += 1;
    scheduleTripPush();
  };

  const scheduleTripPush = () => {
    if (!syncState.enabled) return;
    if (syncState.suppressPush) return;
    window.clearTimeout(syncState.pushTimer);
    syncState.pushTimer = window.setTimeout(() => pushTripUpdates(), 900);
  };

  const pushTripUpdates = async () => {
    if (!syncState.enabled) return;
    if (syncState.suppressPush) return;
    if (!syncState.tripId) return;
    if (syncState.pushInFlight) return;

    const shouldPushPlanner = syncState.plannerVersion !== syncState.pushedPlannerVersion;
    const shouldPushStatus = syncState.statusVersion !== syncState.pushedStatusVersion;
    if (!shouldPushPlanner && !shouldPushStatus) return;

    const sentPlannerVersion = syncState.plannerVersion;
    const sentStatusVersion = syncState.statusVersion;

    const patch = { updated_by: clientId };
    if (shouldPushPlanner) patch.planner = planner;
    if (shouldPushStatus) patch.status = statusById;

    syncState.pushInFlight = true;
    try {
      const client = await getSupabaseClient();
      const res = await client.from("trips").update(patch).eq("id", syncState.tripId);
      if (res?.error) throw res.error;

      if (shouldPushPlanner) syncState.pushedPlannerVersion = sentPlannerVersion;
      if (shouldPushStatus) syncState.pushedStatusVersion = sentStatusVersion;

      if (
        syncState.plannerVersion !== syncState.pushedPlannerVersion ||
        syncState.statusVersion !== syncState.pushedStatusVersion
      ) {
        scheduleTripPush();
      }
    } catch {
      // transient errors are expected on mobile networks; retry later.
      window.clearTimeout(syncState.pushTimer);
      syncState.pushTimer = window.setTimeout(() => pushTripUpdates(), 2500);
    } finally {
      syncState.pushInFlight = false;
    }
  };

  const hasSeenOnboarding = () => {
    const userId = authState.userId;
    if (!userId) return true;
    try {
      const raw = localStorage.getItem(ONBOARDING_SEEN_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && parsed[userId] === 1;
    } catch {
      return false;
    }
  };

  const markOnboardingSeen = () => {
    const userId = authState.userId;
    if (!userId) return;
    try {
      const raw = localStorage.getItem(ONBOARDING_SEEN_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = parsed && typeof parsed === "object" ? parsed : {};
      next[userId] = 1;
      localStorage.setItem(ONBOARDING_SEEN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const fetchTrips = async () => {
    const client = await getSupabaseClient();
    const res = await client
      .from("trips")
      .select("id,title,created_by,updated_at,created_at,join_code")
      .order("updated_at", { ascending: false });
    if (res?.error) throw res.error;
    return Array.isArray(res?.data) ? res.data : [];
  };

  const signOut = async () => {
    const ok = confirm("Sign out?");
    if (!ok) return;
    try {
      await disconnectSync({ silent: true });
    } catch {
      // ignore
    }
    try {
      const client = await getSupabaseClient();
      await client.auth.signOut();
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(LAST_USER_KEY);
      localStorage.removeItem(SYNC_SETTINGS_KEY);
      localStorage.removeItem(PLANNER_KEY);
      localStorage.removeItem(STATUS_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const renameTrip = async ({ tripId, currentTitle } = {}) => {
    if (!tripId) return false;
    const nextTitle = await openTextPromptModal({
      title: "Rename trip",
      subtitle: "Visible to everyone with edit access.",
      placeholder: "Trip name",
      initialValue: currentTitle || "",
      confirmLabel: "Rename",
    });
    if (!nextTitle) return false;
    try {
      const client = await getSupabaseClient();
      const res = await client.from("trips").update({ title: nextTitle, updated_by: clientId }).eq("id", tripId);
      if (res?.error) throw res.error;
      if (syncState.tripId === tripId) syncState.tripTitle = nextTitle;
      showToast("Trip renamed");
      return true;
    } catch (err) {
      showToast(syncErrorMessage(err) || "Rename failed");
      return false;
    }
  };

  const openSyncModal = ({ intent = "manage" } = {}) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[2600] flex items-end md:items-center justify-center";

      let trips = [];
      let tripsLoading = true;
      let tripsError = "";

      const loadTrips = async () => {
        tripsLoading = true;
        tripsError = "";
        render();
        try {
          trips = await fetchTrips();
        } catch (err) {
          tripsError = String(err?.message || err || "Failed to load trips");
          trips = [];
        } finally {
          tripsLoading = false;
          render();
        }
      };

      const renderTrips = () => {
        if (tripsLoading) {
          return `
            <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div class="text-xs font-semibold text-slate-300">Your trips</div>
              <div class="mt-2 text-[11px] text-slate-400">Loading…</div>
            </div>
          `;
        }
        if (tripsError) {
          return `
            <div class="rounded-2xl bg-rose-500/10 p-4 ring-1 ring-rose-400/20">
              <div class="text-xs font-semibold text-rose-100">Trips unavailable</div>
              <div class="mt-1 text-[11px] text-rose-100/80">${escapeHtml(tripsError)}</div>
            </div>
          `;
        }
        if (!trips.length) {
          return `
            <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div class="text-xs font-semibold text-slate-300">Your trips</div>
              <div class="mt-2 text-[11px] text-slate-400">No trips yet.</div>
            </div>
          `;
        }

        const rows = trips
          .map((t) => {
            const title = typeof t?.title === "string" && t.title.trim() ? t.title.trim() : "Untitled trip";
            const isOwned = authState.userId && t?.created_by && String(t.created_by) === String(authState.userId);
            const isOpen = syncState.tripId && String(syncState.tripId) === String(t?.id);
            const badge = isOwned ? "Owned" : "Shared";
            return `
              <button
                type="button"
                data-action="openTrip"
                data-trip-id="${escapeHtml(String(t.id || ""))}"
                data-trip-key="${escapeHtml(String(t.join_code || ""))}"
                class="w-full rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-extrabold text-white">${escapeHtml(title)}</div>
                    <div class="mt-1 text-[11px] text-slate-400">${escapeHtml(badge)}${
                      isOpen ? " · Open" : ""
                    }</div>
                  </div>
                  <div class="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10">${
                    isOpen ? "Current" : "Open"
                  }</div>
                </div>
              </button>
            `;
          })
          .join("");

        return `
          <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-semibold text-slate-300">Your trips</div>
              <button
                type="button"
                data-action="refreshTrips"
                class="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
              >Refresh</button>
            </div>
            <div class="mt-3 grid gap-2">${rows}</div>
          </div>
        `;
      };

      const render = () => {
        const connected = !!(syncState.enabled && syncState.tripId && syncState.joinCode);
        const shareUrl = connected
          ? buildShareUrl({ tripId: syncState.tripId, joinCode: syncState.joinCode })
          : "";
        const userLine = authState.nickname ? `Signed in as ${authState.nickname}` : "Signed in";

        const ownedCount = trips.filter(
          (t) => authState.userId && t?.created_by && String(t.created_by) === String(authState.userId),
        ).length;
        const showWelcome = intent === "onboarding" || (!hasSeenOnboarding() && ownedCount === 0);

        overlay.innerHTML = `
          <div data-action="backdrop" class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
          <div class="relative w-full md:max-w-md md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
            <div class="border-b border-white/10 px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-base font-extrabold tracking-tight text-white">Trips</div>
                  <div class="mt-1 text-xs text-slate-300">${escapeHtml(userLine)}</div>
                </div>
                <button
                  type="button"
                  data-action="signOut"
                  class="rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
                >Sign out</button>
              </div>
            </div>

            <div class="px-5 py-4 grid gap-4">
              ${
                showWelcome
                  ? `
                    <div class="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/20">
                      <div class="text-xs font-semibold text-emerald-100">Welcome</div>
                      <div class="mt-1 text-[11px] text-emerald-100/80">Create a new trip or join a friend’s plan to start.</div>
                    </div>
                  `
                  : ""
              }

              ${
                connected
                  ? `
                    <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="text-xs font-semibold text-slate-300">Current trip</div>
                          <div class="mt-1 truncate text-sm font-extrabold text-white">${escapeHtml(
                            syncState.tripTitle || "Untitled trip",
                          )}</div>
                        </div>
                        <button
                          type="button"
                          data-action="renameCurrent"
                          class="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
                        >Rename</button>
                      </div>

                      <div class="mt-3">
                        <div class="text-xs font-semibold text-slate-300">Share link</div>
                        <div class="mt-2">
                          <input
                            id="syncShareUrl"
                            type="text"
                            readonly
                            value="${escapeHtml(shareUrl)}"
                            class="w-full rounded-2xl bg-black/25 px-3 py-2 text-xs text-slate-100 ring-1 ring-white/10 outline-none"
                          />
                        </div>
                        <div class="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-action="copy"
                            class="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
                          >Copy</button>
                          <button
                            type="button"
                            data-action="disconnect"
                            class="rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
                          >Disconnect</button>
                        </div>
                      </div>
                    </div>
                  `
                  : ""
              }

              <div class="grid gap-3">
                <button
                  type="button"
                  data-action="create"
                  class="w-full rounded-2xl bg-white/10 px-4 py-3 text-left ring-1 ring-white/10 transition hover:bg-white/15"
                >
                  <div class="text-sm font-extrabold text-white">Create new trip</div>
                  <div class="mt-1 text-[11px] text-slate-300">Starts empty</div>
                </button>

                <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <div class="text-xs font-semibold text-slate-300">Join</div>
                  <div class="mt-2 flex items-center gap-2">
                    <input
                      id="syncJoinInput"
                      type="url"
                      placeholder="Paste share link…"
                      class="min-w-0 flex-1 rounded-2xl bg-black/25 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 ring-1 ring-white/10 outline-none"
                    />
                    <button
                      type="button"
                      data-action="join"
                      class="shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
                    >Join</button>
                  </div>
                  <div class="mt-2 text-[11px] text-slate-400">Tip: opening the share link directly also works.</div>
                </div>
              </div>

              ${renderTrips()}
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                data-action="close"
                class="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >Close</button>
            </div>
          </div>
        `;
      };

      render();
      loadTrips();

      const cleanup = () => {
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown);
      };
      const close = () => {
        markOnboardingSeen();
        cleanup();
        resolve();
      };
      const onKeyDown = (e) => {
        if (e.key === "Escape") close();
      };
      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", async (e) => {
        if (e.target.closest("[data-action='backdrop']")) return close();
        if (e.target.closest("button[data-action='close']")) return close();

        if (e.target.closest("button[data-action='signOut']")) return signOut();

        const refreshBtn = e.target.closest("button[data-action='refreshTrips']");
        if (refreshBtn) {
          refreshBtn.disabled = true;
          await loadTrips();
          refreshBtn.disabled = false;
          return;
        }

        const renameBtn = e.target.closest("button[data-action='renameCurrent']");
        if (renameBtn) {
          renameBtn.disabled = true;
          await renameTrip({ tripId: syncState.tripId, currentTitle: syncState.tripTitle || "" });
          await loadTrips();
          renameBtn.disabled = false;
          return;
        }

        const createBtn = e.target.closest("button[data-action='create']");
        if (createBtn) {
          createBtn.disabled = true;
          const title = await openTextPromptModal({
            title: "Create trip",
            subtitle: "You can rename it later.",
            placeholder: "Trip name",
            initialValue: "New trip",
            confirmLabel: "Create",
          });
          if (!title) {
            createBtn.disabled = false;
            return;
          }
          const created = await createSharedTrip({ title });
          createBtn.disabled = false;
          if (created) {
            await loadTrips();
            render();
          }
          return;
        }

        const joinBtn = e.target.closest("button[data-action='join']");
        if (joinBtn) {
          const input = overlay.querySelector("#syncJoinInput");
          const link = input?.value?.trim();
          const params = link ? parseTripParamsFromUrl(link) : null;
          if (!params) {
            showToast("Invalid link");
            return;
          }
          joinBtn.disabled = true;
          const ok = await connectToTrip(params, { source: "manual" });
          joinBtn.disabled = false;
          if (ok) {
            await loadTrips();
            render();
          }
          return;
        }

        const openBtn = e.target.closest("button[data-action='openTrip']");
        if (openBtn) {
          const tripId = openBtn.dataset.tripId;
          const joinCode = openBtn.dataset.tripKey;
          if (!tripId || !joinCode) return;
          if (syncState.tripId && String(syncState.tripId) === String(tripId)) {
            showToast("Already open");
            return;
          }

          openBtn.disabled = true;
          try {
            await pushTripUpdates();
          } catch {
            // ignore
          }
          try {
            await disconnectSync({ silent: true });
          } catch {
            // ignore
          }
          planner = buildDefaultPlanner();
          statusById = {};
          savePlanner(planner);
          saveStatus(statusById);

          const ok = await connectToTrip({ tripId, joinCode }, { source: "manual" });
          openBtn.disabled = false;
          if (ok) {
            await loadTrips();
            render();
          }
          return;
        }

        const copyBtn = e.target.closest("button[data-action='copy']");
        if (copyBtn) {
          const input = overlay.querySelector("#syncShareUrl");
          const url = input?.value || buildShareUrl({ tripId: syncState.tripId, joinCode: syncState.joinCode });
          const ok = await copyToClipboard(url);
          showToast(ok ? "Copied" : "Copy failed");
          return;
        }

        const disconnectBtn = e.target.closest("button[data-action='disconnect']");
        if (disconnectBtn) {
          await disconnectSync();
          await loadTrips();
          render();
        }
      });

      document.body.appendChild(overlay);
    });

  try {
    await loadGoogleMapsJsApi({
      apiKey: GOOGLE_MAPS_API_KEY,
      libraries: ["places", "geometry"],
    });
  } catch (err) {
    document.body.innerHTML = `
      <div class="min-h-dvh w-full bg-slate-950 text-slate-50 p-6">
        <div class="max-w-xl">
          <div class="text-xl font-extrabold">Google Maps is not configured</div>
          <div class="mt-2 text-slate-300 text-sm">${escapeHtml(String(err?.message || err))}</div>
          <div class="mt-4 text-sm text-slate-200">
            <div>1) Open <span class="font-mono">config.js</span></div>
            <div class="mt-1">2) Set <span class="font-mono">GOOGLE_MAPS_API_KEY</span></div>
            <div class="mt-4 text-slate-300 text-xs">
              Tip: restrict the key by HTTP referrer (GitHub Pages + localhost).
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const mapDiv = $("#map");
  if (!mapDiv) {
    showToast("Map container missing", { durationMs: 5000 });
    return;
  }

  const map = new google.maps.Map(mapDiv, {
    center: { lat: 37.5665, lng: 126.978 },
    zoom: 12,
    mapId: GOOGLE_MAPS_MAP_ID ? String(GOOGLE_MAPS_MAP_ID) : undefined,
    fullscreenControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    clickableIcons: false,
  });

  const infoWindow = new google.maps.InfoWindow();
  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    preserveViewport: false,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#fb7185",
      strokeOpacity: 0.65,
      strokeWeight: 5,
    },
  });
  directionsRenderer.setMap(null);

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
        const mapRect = mapDiv.getBoundingClientRect();
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
  const markerIconSize = new google.maps.Size(34, 34);
  const markerIconAnchor = new google.maps.Point(17, 17);
  for (const place of allPlaces) {
    if (!hasCoords(place)) continue;
    const iconUrl = buildMarkerIconDataUrl({ category: place.category || "", selected: false });
    const marker = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lon },
      map,
      title: String(place.name || ""),
      icon: {
        url: iconUrl,
        scaledSize: markerIconSize,
        anchor: markerIconAnchor,
      },
    });
    marker.addListener("click", () => {
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

  const mqDesktop = window.matchMedia("(min-width: 768px)");
  let categoriesExpanded = loadCategoryExpanded();

  const applyCategoryExpandedUi = () => {
    const expanded = mqDesktop.matches ? true : categoriesExpanded;
    categoryWrap?.classList.toggle("hidden", !expanded);
    if (categoryCaret) categoryCaret.textContent = expanded ? "▴" : "▾";
  };

  const setCategorySummaryUi = () => {
    if (!categorySummary) return;
    const label = state.category === "__all__" ? "All" : formatCategoryLabel(state.category);
    categorySummary.textContent = label;
  };

  btnToggleCategories?.addEventListener("click", () => {
    categoriesExpanded = !categoriesExpanded;
    saveCategoryExpanded(categoriesExpanded);
    applyCategoryExpandedUi();
    sheet?.refresh?.();
  });
  mqDesktop.addEventListener("change", () => {
    applyCategoryExpandedUi();
    sheet?.refresh?.();
  });

  const getActiveDay = () =>
    planner.days.find((d) => d.id === planner.activeDayId) || planner.days[0] || null;

  const getPlannerPlaceIds = () => {
    const ids = [];
    for (const day of planner.days) {
      for (const it of day.items || []) ids.push(it.placeId);
    }
    return new Set(ids);
  };

  const commitPlanner = (nextPlanner, { toast } = {}) => {
    planner = normalizePlanner(nextPlanner);
    savePlanner(planner);
    markPlannerDirty();
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

  const deleteDayId = (dayId) => {
    if (!planner.days.some((d) => d.id === dayId)) return false;
    expandedPlannerItemId = null;

    const idx = planner.days.findIndex((d) => d.id === dayId);
    const nextDays = planner.days.filter((d) => d.id !== dayId);

    if (!nextDays.length) {
      commitPlanner(buildDefaultPlanner());
      return true;
    }

    const nextActive = nextDays[Math.min(idx, nextDays.length - 1)];
    commitPlanner({ ...planner, activeDayId: nextActive.id, days: nextDays });
    return true;
  };

  const ensurePlannerHasDay = () => {
    if (planner.days.length) return;
    expandedPlannerItemId = null;
    commitPlanner(buildDefaultPlanner());
  };

  const addPlaceToDayId = (placeId, dayId) => {
    ensurePlannerHasDay();
    const day = planner.days.find((d) => d.id === dayId) || planner.days[0] || null;
    if (!day) return { added: false, reason: "no-day" };
    if (day.items.some((it) => it.placeId === placeId))
      return { added: false, reason: "exists", dayTitle: day.title };

    commitPlanner({
      ...planner,
      activeDayId: day.id,
      days: planner.days.map((d) =>
        d.id === day.id
          ? {
              ...d,
              items: [
                ...d.items,
                { id: uid("item"), placeId, startTime: "", endTime: "", memo: "" },
              ],
            }
          : d,
      ),
    });
    const nextDay = planner.days.find((d) => d.id === day.id) || day;
    return { added: true, dayTitle: nextDay.title };
  };

  const openDayPicker = ({ title, subtitle, placeId } = {}) =>
    new Promise((resolve) => {
      ensurePlannerHasDay();

      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[2600] flex items-end md:items-center justify-center";

      const place = placeId ? placeById.get(placeId) : null;
      const placeName = place?.name ? escapeHtml(place.name) : null;
      const alreadyIn = new Set();
      if (placeId) {
        for (const d of planner.days) {
          if (d.items.some((it) => it.placeId === placeId)) alreadyIn.add(d.id);
        }
      }

      const dayButtons = planner.days
        .map((d) => {
          const active = d.id === planner.activeDayId;
          const hasIt = alreadyIn.has(d.id);
          const count = d.items.length;
          return `
            <button
              type="button"
              data-day-id="${escapeHtml(d.id)}"
              class="w-full rounded-2xl bg-white/5 px-4 py-3 text-left ring-1 ring-white/10 transition hover:bg-white/10"
              title="${hasIt ? "Already contains this place" : "Add to this day"}"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-extrabold text-white">${escapeHtml(d.title)}</div>
                  <div class="mt-1 text-[11px] text-slate-300">${count} stops${
                    active ? " · Active" : ""
                  }${hasIt ? " · Added" : ""}</div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  ${
                    hasIt
                      ? `<span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-400/25">✓</span>`
                      : ""
                  }
                  <span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200 ring-1 ring-white/10">${count}</span>
                </div>
              </div>
            </button>
          `;
        })
        .join("");

      overlay.innerHTML = `
        <div data-action="backdrop" class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
        <div class="relative w-full md:max-w-md md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
          <div class="border-b border-white/10 px-5 py-4">
            <div class="text-base font-extrabold tracking-tight text-white">${escapeHtml(
              title || "Add to day",
            )}</div>
            <div class="mt-1 text-xs text-slate-300">${
              subtitle ? escapeHtml(subtitle) : placeName ? `Place: ${placeName}` : "Choose a day"
            }</div>
          </div>

          <div class="max-h-[55dvh] overflow-auto px-5 py-4">
            <div class="grid gap-2">
              ${dayButtons}
              <button
                type="button"
                data-action="newDay"
                class="w-full rounded-2xl bg-fuchsia-500/15 px-4 py-3 text-left ring-1 ring-fuchsia-400/30 transition hover:bg-fuchsia-500/20"
                title="Create a new day"
              >
                <div class="text-sm font-extrabold text-white">＋ New day</div>
                <div class="mt-1 text-[11px] text-slate-200/80">Create Day ${
                  planner.days.length + 1
                }</div>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              data-action="cancel"
              class="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >Cancel</button>
          </div>
        </div>
      `;

      const cleanup = () => {
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown);
      };

      const close = (value) => {
        cleanup();
        resolve(value);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") close(null);
      };
      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", (e) => {
        const backdrop = e.target.closest("[data-action='backdrop']");
        if (backdrop) {
          close(null);
          return;
        }

        const cancel = e.target.closest("button[data-action='cancel']");
        if (cancel) {
          close(null);
          return;
        }

        const newDayBtn = e.target.closest("button[data-action='newDay']");
        if (newDayBtn) {
          const id = addDay();
          close(id);
          return;
        }

        const dayBtn = e.target.closest("button[data-day-id]");
        if (dayBtn) {
          close(dayBtn.dataset.dayId || null);
        }
      });

      document.body.appendChild(overlay);
    });

  const addPlaceFlow = async (placeId, { closeMapPopup = false } = {}) => {
    const hadNoDays = planner.days.length === 0;
    ensurePlannerHasDay();

    if (hadNoDays) {
      const result = addPlaceToDayId(placeId, planner.activeDayId);
      sync({ keepView: true });
      if (viewId === "planner") renderPlanner();
      if (closeMapPopup) infoWindow.close();
      if (result.added) {
        showToastAction(`Added to ${result.dayTitle} — tap to open Planner`, {
          durationMs: 4500,
          onClick: () => setView("planner"),
        });
      }
      return;
    }

    const chosenDayId = await openDayPicker({ title: "Add to Planner", placeId });
    if (!chosenDayId) return;

    const result = addPlaceToDayId(placeId, chosenDayId);
    sync({ keepView: true });
    if (viewId === "planner") renderPlanner();
    if (closeMapPopup) infoWindow.close();

    if (result.added) {
      showToastAction(`Added to ${result.dayTitle} — tap to open Planner`, {
        durationMs: 4500,
        onClick: () => setView("planner"),
      });
    } else {
      showToast(
        result.reason === "exists" && result.dayTitle ? `Already in ${result.dayTitle}` : "Could not add",
      );
    }
  };

  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest("button[data-action='popupAdd'][data-place-id]");
    if (addBtn) {
      const placeId = addBtn.dataset.placeId;
      if (!placeId) return;
      e.preventDefault();
      addPlaceFlow(placeId, { closeMapPopup: true });
      return;
    }

    const dirBtn = e.target.closest("button[data-action='popupDirections'][data-place-id]");
    if (dirBtn) {
      const placeId = dirBtn.dataset.placeId;
      if (!placeId) return;
      e.preventDefault();
      infoWindow.close();
      showDirectionsToPlace(placeId);
    }
  });

  const fitToPins = (animate = true) => {
    const base = 24;
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    for (const p of state.filtered) {
      if (!hasCoords(p)) continue;
      bounds.extend({ lat: p.lat, lng: p.lon });
      count += 1;
    }

    if (!count) {
      map.setCenter({ lat: 37.5665, lng: 126.978 });
      map.setZoom(12);
      return;
    }

    if (count === 1) {
      const c = bounds.getCenter();
      map.setCenter(c);
      map.setZoom(Math.max(map.getZoom() || 0, 15));
      return;
    }

    const mapRect = mapDiv.getBoundingClientRect();
    const sizeY = Math.max(0, Math.round(mapRect.height));
    let padding = { top: base, right: base, bottom: base, left: base };
    if (sheet?.isEnabled?.()) {
      let safeBottom = sheet.getSafeBottomPxRelativeToMap();
      if (safeBottom < 140) safeBottom = sizeY;
      const covered = Math.max(0, sizeY - safeBottom);
      padding = { top: base, right: base, bottom: base + covered, left: base };
    }

    map.fitBounds(bounds, padding);
  };

  const syncMarkers = () => {
    const visible =
      viewId === "planner"
        ? (() => {
            const ids = new Set();
            const day = getActiveDay();
            for (const it of day?.items || []) {
              if (it?.placeId) ids.add(it.placeId);
            }
            if (state.selectedId) ids.add(state.selectedId);
            return ids;
          })()
        : new Set(state.filtered.filter(hasCoords).map((p) => p.id));
    for (const [id, marker] of markersById.entries()) {
      marker.setVisible(visible.has(id));
    }
  };

  const syncSelection = ({ pan = true } = {}) => {
    for (const [id, marker] of markersById.entries()) {
      const place = placeById.get(id);
      if (!place) continue;
      marker.setIcon({
        url: buildMarkerIconDataUrl({
          category: place.category || "",
          selected: id === state.selectedId,
        }),
        scaledSize: markerIconSize,
        anchor: markerIconAnchor,
      });
    }
    renderList({
      places: state.filtered,
      selectedId: state.selectedId,
      statusById,
      inPlannerPlaceIds: getPlannerPlaceIds(),
    });

    const selectedMarker = state.selectedId ? markersById.get(state.selectedId) : null;
    if (!selectedMarker || !selectedMarker.getVisible()) {
      infoWindow.close();
      return;
    }

    const place = state.selectedId ? placeById.get(state.selectedId) : null;
    if (place) {
      infoWindow.setContent(buildPopupHtml(place));
      infoWindow.open({ map, anchor: selectedMarker });
    }

    if (pan) {
      map.panTo(selectedMarker.getPosition());
      map.setZoom(Math.max(map.getZoom() || 0, 15));
    }
  };

  const sync = ({ keepView = false } = {}) => {
    state.filtered = filterPlaces(allPlaces, { query: state.query, category: state.category });
    const categories = buildCategories(allPlaces);
    renderChips({ categories, activeCategory: state.category });
    setCategorySummaryUi();
    applyCategoryExpandedUi();
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
      inPlannerPlaceIds: getPlannerPlaceIds(),
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
    if (!mqDesktop.matches) {
      categoriesExpanded = false;
      saveCategoryExpanded(categoriesExpanded);
      applyCategoryExpandedUi();
    }
    sync();
  });

  const toggleStatus = (placeId, key) => {
    const current = statusById?.[placeId] || {};
    const next = { ...current, [key]: !current[key] };
    statusById = { ...statusById, [placeId]: next };
    saveStatus(statusById);
    markStatusDirty();
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
        addPlaceFlow(placeId);
        return;
      }
      if (placeId && action === "directions") {
        showDirectionsToPlace(placeId);
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

  let plannerPolyline = null;
  const clearPlannerOverlay = () => {
    if (plannerPolyline) {
      plannerPolyline.setMap(null);
      plannerPolyline = null;
    }
  };

  const renderPlannerOverlay = () => {
    clearPlannerOverlay();
    if (viewId !== "planner") return;

    const day = getActiveDay();
    if (!day) return;

    const path = [];
    for (let idx = 0; idx < day.items.length; idx += 1) {
      const item = day.items[idx];
      const place = placeById.get(item.placeId);
      if (!place || !hasCoords(place)) continue;
      path.push({ lat: place.lat, lng: place.lon });
    }

    if (path.length >= 2) {
      plannerPolyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: "#fb7185",
        strokeOpacity: 0.55,
        strokeWeight: 4,
        clickable: false,
      });
      plannerPolyline.setMap(map);
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

    syncMarkers();
    if (state.selectedId) syncSelection({ pan: false });

    sheet?.refresh?.();
  };

  tabPlaces?.addEventListener("click", () => setView("places"));
  tabPlanner?.addEventListener("click", () => setView("planner"));
  btnSync?.addEventListener("click", () => openSyncModal());

  btnDayAdd?.addEventListener("click", () => {
    addDay();
    sync({ keepView: true });
    setView("planner");
    renderPlanner();
    showToast("Day added");
  });

  btnDayDelete?.addEventListener("click", () => {
    const day = getActiveDay();
    if (!day) return;
    const ok = confirm(`Delete ${day.title}?\nThis will remove all stops in this day.`);
    if (!ok) return;
    deleteDayId(day.id);
    sync({ keepView: true });
    renderPlanner();
    showToast("Day deleted");
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
    plannerSaveTimer = window.setTimeout(() => {
      savePlanner(planner);
      markPlannerDirty();
    }, 250);
  };
  const flushPlannerSave = () => {
    if (!plannerSaveTimer) return;
    window.clearTimeout(plannerSaveTimer);
    plannerSaveTimer = null;
    savePlanner(planner);
    markPlannerDirty();
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
    markPlannerDirty();
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
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    for (const it of day.items) {
      const p = placeById.get(it.placeId);
      if (!p || !hasCoords(p)) continue;
      bounds.extend({ lat: p.lat, lng: p.lon });
      count += 1;
    }
    if (!count) {
      showToast("No pins in this day");
      return;
    }
    const base = 24;
    if (count === 1) {
      const c = bounds.getCenter();
      map.setCenter(c);
      map.setZoom(Math.max(map.getZoom() || 0, 15));
      showToast("Fit day");
      return;
    }
    const mapRect = mapDiv.getBoundingClientRect();
    const sizeY = Math.max(0, Math.round(mapRect.height));
    let padding = { top: base, right: base, bottom: base, left: base };
    if (sheet?.isEnabled?.()) {
      let safeBottom = sheet.getSafeBottomPxRelativeToMap();
      if (safeBottom < 140) safeBottom = sizeY;
      const covered = Math.max(0, sizeY - safeBottom);
      padding = { top: base, right: base, bottom: base + covered, left: base };
    }
    map.fitBounds(bounds, padding);
    showToast("Fit day");
  });

  setView(viewId, { persist: false });

  const travelModeToEnum = (mode) => {
    if (mode === "driving") return google.maps.TravelMode.DRIVING;
    if (mode === "transit") return google.maps.TravelMode.TRANSIT;
    return google.maps.TravelMode.WALKING;
  };

  let activeDirections = null; // { kind: 'day'|'place', key: string }

  const clearDirections = ({ toast } = {}) => {
    directionsRenderer.setMap(null);
    activeDirections = null;
    if (toast) showToast(toast);
  };

  const summarizeDirections = (result) => {
    const route = result?.routes?.[0];
    if (!route || !Array.isArray(route.legs)) return "";
    let distM = 0;
    let durS = 0;
    for (const leg of route.legs) {
      distM += leg?.distance?.value || 0;
      durS += leg?.duration?.value || 0;
    }
    const parts = [];
    if (distM > 0) {
      parts.push(distM < 950 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(distM >= 10_000 ? 0 : 1)} km`);
    }
    if (durS > 0) {
      const minutes = Math.max(1, Math.round(durS / 60));
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      parts.push(hours ? `${hours}h ${mins}m` : `${minutes} min`);
    }
    return parts.join(" · ");
  };

  const requestDirections = (request) =>
    new Promise((resolve, reject) => {
      directionsService.route(request, (result, status) => {
        if (status === "OK" && result) return resolve(result);
        reject(new Error(typeof status === "string" ? status : "Directions failed"));
      });
    });

  const getActiveDayPinnedStops = () => {
    const day = getActiveDay();
    const stops = [];
    for (const it of day?.items || []) {
      const p = placeById.get(it.placeId);
      if (!p || !hasCoords(p)) continue;
      stops.push({ placeId: p.id, lat: p.lat, lng: p.lon });
    }
    return { day, stops };
  };

  const showDirectionsForActiveDay = async () => {
    const { day, stops } = getActiveDayPinnedStops();
    if (!day) return;

    if (activeDirections?.kind === "day" && activeDirections?.key === day.id) {
      clearDirections({ toast: "Directions cleared" });
      return;
    }

    if (stops.length < 2) {
      clearDirections();
      showToast("Add at least 2 pinned stops in this day");
      return;
    }

    const origin = { lat: stops[0].lat, lng: stops[0].lng };
    const destination = { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng };
    const waypoints = stops.slice(1, -1).map((s) => ({
      location: { lat: s.lat, lng: s.lng },
      stopover: true,
    }));

    try {
      const result = await requestDirections({
        origin,
        destination,
        waypoints,
        optimizeWaypoints: false,
        travelMode: travelModeToEnum(gmapsMode),
      });
      directionsRenderer.setMap(map);
      directionsRenderer.setDirections(result);
      activeDirections = { kind: "day", key: day.id };
      showToast(summarizeDirections(result) || "Directions shown", { durationMs: 3500 });
    } catch (err) {
      clearDirections();
      showToast(`Directions failed: ${String(err?.message || err)}`.slice(0, 140), { durationMs: 5000 });
    }
  };

  const showDirectionsToPlace = async (placeId) => {
    const destPlace = placeById.get(placeId);
    if (!destPlace || !hasCoords(destPlace)) {
      showToast("This place has no pin coordinates");
      return;
    }
    const destination = { lat: destPlace.lat, lng: destPlace.lon };

    let origin = null;
    let originId = "";

    const { stops } = getActiveDayPinnedStops();
    if (stops.length) {
      const idx = stops.findIndex((s) => s.placeId === placeId);
      if (idx > 0) {
        const prev = stops[idx - 1];
        origin = { lat: prev.lat, lng: prev.lng };
        originId = prev.placeId;
      } else if (idx === -1) {
        const last = stops[stops.length - 1];
        origin = { lat: last.lat, lng: last.lng };
        originId = last.placeId;
      } else {
        showToast("This is the first stop of the day — use Day Directions");
        return;
      }
    }

    if (!origin) {
      const selectedId = state.selectedId;
      if (selectedId && selectedId !== placeId) {
        const selectedPlace = placeById.get(selectedId);
        if (selectedPlace && hasCoords(selectedPlace)) {
          origin = { lat: selectedPlace.lat, lng: selectedPlace.lon };
          originId = selectedPlace.id;
        }
      }
    }

    if (!origin) {
      showToast("Pick an origin: add a pinned stop (Planner) or select another pinned place");
      return;
    }

    const key = `${originId || `${origin.lat},${origin.lng}`}>${placeId}`;
    if (activeDirections?.kind === "place" && activeDirections?.key === key) {
      clearDirections({ toast: "Directions cleared" });
      return;
    }

    try {
      const result = await requestDirections({
        origin,
        destination,
        travelMode: travelModeToEnum(gmapsMode),
      });
      directionsRenderer.setMap(map);
      directionsRenderer.setDirections(result);
      activeDirections = { kind: "place", key };
      showToast(summarizeDirections(result) || "Directions shown", { durationMs: 3500 });
    } catch (err) {
      clearDirections();
      showToast(`Directions failed: ${String(err?.message || err)}`.slice(0, 140), { durationMs: 5000 });
    }
  };

  btnPlanRoute?.addEventListener("click", () => showDirectionsForActiveDay());

  const refreshMap = () => {
    try {
      google.maps.event.trigger(map, "resize");
    } catch {
      // ignore
    }
  };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => refreshMap());
    ro.observe(mapDiv);
  }
  window.addEventListener("resize", refreshMap);

  if (false) {
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

  const getPlaceGoogleMeta = (placeId) => {
    const meta = statusById?.[placeId]?.google;
    if (!meta || typeof meta !== "object") return { url: "", placeId: "", lat: null, lon: null };
    const url = typeof meta.url === "string" ? meta.url : "";
    const pid = typeof meta.placeId === "string" ? meta.placeId : "";
    const lat = typeof meta.lat === "number" && Number.isFinite(meta.lat) ? meta.lat : null;
    const lon = typeof meta.lon === "number" && Number.isFinite(meta.lon) ? meta.lon : null;
    return { url, placeId: pid, lat, lon };
  };

  const setPlaceGoogleMeta = (placeId, nextMeta) => {
    const current = statusById?.[placeId] || {};
    const next = { ...current, google: nextMeta };
    statusById = { ...statusById, [placeId]: next };
    saveStatus(statusById);
    markStatusDirty();
  };

  const resolvePlaceLatLon = (placeId) => {
    const place = placeById.get(placeId);
    if (place && hasCoords(place)) return { lat: place.lat, lon: place.lon, source: "pin" };
    const meta = getPlaceGoogleMeta(placeId);
    if (meta.lat != null && meta.lon != null) return { lat: meta.lat, lon: meta.lon, source: "google" };
    const inferred = meta.url ? extractLatLngFromGoogleMapsUrl(meta.url) : null;
    if (inferred) return { lat: inferred.lat, lon: inferred.lon, source: "google" };
    return null;
  };

  const resolveDayStartLatLon = () => {
    const day = getActiveDay();
    for (const it of day?.items || []) {
      if (!it?.placeId) continue;
      const ll = resolvePlaceLatLon(it.placeId);
      if (ll) return ll;
    }
    return null;
  };

  const openPlaceModal = (placeId, { tab = "directions" } = {}) =>
    new Promise((resolve) => {
      const place = placeById.get(placeId);
      if (!place) return resolve();

      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[4200] flex items-end md:items-center justify-center";

      let activeTab = tab === "google" ? "google" : "directions";
      let originMode = "my";

      const myLatLng = myLocation.lastLatLng;
      const dayStart = resolveDayStartLatLon();
      if (!myLatLng && dayStart) originMode = "day";

      let mode = gmapsMode;

      const meta0 = getPlaceGoogleMeta(placeId);
      let googleUrl = meta0.url;
      let googlePlaceId = meta0.placeId;
      let googleLat = meta0.lat;
      let googleLon = meta0.lon;

      const applyGoogleUrlDerived = (url) => {
        const pid = extractGooglePlaceIdFromUrl(url);
        if (pid) googlePlaceId = pid;
        const ll = extractLatLngFromGoogleMapsUrl(url);
        if (ll) {
          googleLat = ll.lat;
          googleLon = ll.lon;
        }
      };

      const buildDirectionsSrc = () => {
        const dest = resolvePlaceLatLon(placeId);
        if (!dest) return { src: null, reason: "Destination has no coordinates" };

        const origin =
          originMode === "my"
            ? myLocation.lastLatLng
              ? { lat: myLocation.lastLatLng.lat, lon: myLocation.lastLatLng.lng }
              : null
            : originMode === "day"
              ? dayStart
                ? { lat: dayStart.lat, lon: dayStart.lon }
                : null
              : null;

        if (!origin) return { src: null, reason: originMode === "my" ? "My location not available" : "Day start missing" };

        const src = buildGoogleMapsEmbedDirectionsUrl({
          origin,
          destination: { lat: dest.lat, lon: dest.lon },
          mode,
        });
        return src ? { src, reason: "" } : { src: null, reason: "Could not build directions" };
      };

      const render = () => {
        const name = escapeHtml(place.name || "Untitled");
        const address = escapeHtml(place.address || "");
        const category = escapeHtml(formatCategoryLabel(place.category));
        const dest = resolvePlaceLatLon(placeId);
        const destNote = dest?.source === "google" ? "Using Google coordinates" : "";

        const d = buildDirectionsSrc();
        const hasMy = !!myLocation.lastLatLng;
        const hasDay = !!dayStart;
        const canDirections = !!d.src;

        overlay.innerHTML = `
          <div data-action="backdrop" class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
          <div class="relative w-full md:max-w-4xl md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
            <div class="border-b border-white/10 px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-base font-extrabold tracking-tight text-white">${name}</div>
                  <div class="mt-1 truncate text-xs text-slate-300">${category}${address ? ` · ${address}` : ""}</div>
                  ${destNote ? `<div class="mt-1 text-[11px] text-slate-400">${escapeHtml(destNote)}</div>` : ""}
                </div>
                <button
                  type="button"
                  data-action="close"
                  class="shrink-0 rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
                >Close</button>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <div class="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
                  <button
                    type="button"
                    data-action="tab"
                    data-tab="directions"
                    class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                      activeTab === "directions" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                    }"
                  >Directions</button>
                  <button
                    type="button"
                    data-action="tab"
                    data-tab="google"
                    class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                      activeTab === "google" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                    }"
                  >Google</button>
                </div>
              </div>
            </div>

            <div class="px-5 py-4">
              ${
                activeTab === "directions"
                  ? `
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <div class="text-xs font-semibold text-slate-300">From</div>
                        <div class="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
                          <button
                            type="button"
                            data-action="origin"
                            data-origin="my"
                            ${hasMy ? "" : "disabled"}
                            class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                              originMode === "my" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                            } ${hasMy ? "" : "opacity-40 cursor-not-allowed"}"
                          >My location</button>
                          <button
                            type="button"
                            data-action="origin"
                            data-origin="day"
                            ${hasDay ? "" : "disabled"}
                            class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                              originMode === "day" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                            } ${hasDay ? "" : "opacity-40 cursor-not-allowed"}"
                          >Day start</button>
                        </div>
                        ${
                          !hasMy
                            ? `<button type="button" data-action="getLocation" class="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15">Get location</button>`
                            : ""
                        }
                      </div>

                      <div class="flex flex-wrap items-center gap-2">
                        <div class="text-xs font-semibold text-slate-300">Mode</div>
                        <div class="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
                          <button
                            type="button"
                            data-action="mode"
                            data-mode="walking"
                            class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                              mode === "walking" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                            }"
                          >Walk</button>
                          <button
                            type="button"
                            data-action="mode"
                            data-mode="driving"
                            class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                              mode === "driving" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                            }"
                          >Drive</button>
                          <button
                            type="button"
                            data-action="mode"
                            data-mode="transit"
                            class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                              mode === "transit" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                            }"
                          >Transit</button>
                        </div>
                      </div>
                    </div>

                    <div class="mt-4">
                      ${
                        canDirections
                          ? `
                            <div class="overflow-hidden rounded-2xl ring-1 ring-white/10 bg-black/10">
                              <iframe
                                title="Directions"
                                src="${escapeHtml(d.src)}"
                                class="h-[55vh] min-h-[360px] w-full"
                                loading="lazy"
                                referrerpolicy="no-referrer-when-downgrade"
                              ></iframe>
                            </div>
                          `
                          : `
                            <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                              <div class="text-sm font-extrabold text-white">Directions unavailable</div>
                              <div class="mt-1 text-xs text-slate-300">${escapeHtml(
                                d.reason || "Missing coordinates",
                              )}</div>
                              <div class="mt-2 text-[11px] text-slate-400">Tip: add a pin, or paste a Google Maps URL in the Google tab (URLs with @lat,lon work best).</div>
                            </div>
                          `
                      }
                    </div>
                  `
                  : `
                    <div class="grid gap-3">
                      <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                        <div class="text-xs font-semibold text-slate-300">Google Maps URL</div>
                        <div class="mt-2">
                          <input
                            id="googleUrlInput"
                            type="url"
                            placeholder="Paste a Google Maps link…"
                            value="${escapeHtml(googleUrl)}"
                            class="w-full rounded-2xl bg-black/25 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-fuchsia-400/60"
                          />
                        </div>
                        <div class="mt-2 text-[11px] text-slate-400">We try to extract Place ID and coordinates when possible.</div>
                      </div>

                      <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                        <div class="text-xs font-semibold text-slate-300">Place ID</div>
                        <div class="mt-2">
                          <input
                            id="googlePlaceIdInput"
                            type="text"
                            placeholder="Optional (e.g. ChIJ...)"
                            value="${escapeHtml(googlePlaceId)}"
                            class="w-full rounded-2xl bg-black/25 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-fuchsia-400/60"
                          />
                        </div>
                        <div class="mt-2 text-[11px] text-slate-400">Stored with the trip (shared).</div>
                      </div>

                      <div class="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          data-action="clearGoogle"
                          class="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
                        >Clear</button>
                        <button
                          type="button"
                          data-action="saveGoogle"
                          class="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
                        >Save</button>
                      </div>
                    </div>
                  `
              }
            </div>
          </div>
        `;
      };

      render();

      const onKeyDown = (e) => {
        if (e.key === "Escape") close();
      };

      const cleanup = () => {
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown);
      };
      const close = () => {
        cleanup();
        resolve();
      };

      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", async (e) => {
        if (e.target.closest("[data-action='backdrop']")) return close();
        if (e.target.closest("button[data-action='close']")) return close();

        const tabBtn = e.target.closest("button[data-action='tab'][data-tab]");
        if (tabBtn) {
          activeTab = tabBtn.dataset.tab === "google" ? "google" : "directions";
          render();
          return;
        }

        const originBtn = e.target.closest("button[data-action='origin'][data-origin]");
        if (originBtn) {
          originMode = originBtn.dataset.origin === "day" ? "day" : "my";
          render();
          return;
        }

        const modeBtn = e.target.closest("button[data-action='mode'][data-mode]");
        if (modeBtn) {
          mode = modeBtn.dataset.mode === "driving" ? "driving" : modeBtn.dataset.mode === "transit" ? "transit" : "walking";
          gmapsMode = mode;
          saveGmapsMode(gmapsMode);
          render();
          return;
        }

        const locBtn = e.target.closest("button[data-action='getLocation']");
        if (locBtn) {
          startTracking({ auto: false });
          render();
          return;
        }

        const clearBtn = e.target.closest("button[data-action='clearGoogle']");
        if (clearBtn) {
          googleUrl = "";
          googlePlaceId = "";
          googleLat = null;
          googleLon = null;
          setPlaceGoogleMeta(placeId, {});
          render();
          showToast("Cleared");
          return;
        }

        const saveBtn = e.target.closest("button[data-action='saveGoogle']");
        if (saveBtn) {
          const urlEl = overlay.querySelector("#googleUrlInput");
          const pidEl = overlay.querySelector("#googlePlaceIdInput");
          googleUrl = String(urlEl?.value || "").trim();
          googlePlaceId = String(pidEl?.value || "").trim();
          if (googleUrl) applyGoogleUrlDerived(googleUrl);

          const nextMeta = {};
          if (googleUrl) nextMeta.url = googleUrl;
          if (googlePlaceId) nextMeta.placeId = googlePlaceId;
          if (typeof googleLat === "number" && Number.isFinite(googleLat)) nextMeta.lat = googleLat;
          if (typeof googleLon === "number" && Number.isFinite(googleLon)) nextMeta.lon = googleLon;
          setPlaceGoogleMeta(placeId, nextMeta);
          render();
          showToast("Saved");
          return;
        }
      });

      overlay.addEventListener("input", (e) => {
        const el = e.target;
        if (el?.id === "googleUrlInput") {
          googleUrl = String(el.value || "");
          const pid = extractGooglePlaceIdFromUrl(googleUrl);
          if (pid && (!googlePlaceId || googlePlaceId.length < 8)) {
            googlePlaceId = pid;
            const pidEl = overlay.querySelector("#googlePlaceIdInput");
            if (pidEl) pidEl.value = pid;
          }
          const ll = extractLatLngFromGoogleMapsUrl(googleUrl);
          if (ll) {
            googleLat = ll.lat;
            googleLon = ll.lon;
          }
        }
      });

      document.body.appendChild(overlay);
    });

  const openDayDirectionsModal = () =>
    new Promise((resolve) => {
      const day = getActiveDay();
      if (!day) return resolve();

      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-[4200] flex items-end md:items-center justify-center";

      let mode = gmapsMode;
      let startFromMy = false;
      let selectedIdx = 0;

      const getStops = () =>
        (day.items || [])
          .map((it) => ({ it, place: placeById.get(it.placeId) }))
          .filter((x) => x.place && x.it && x.it.placeId)
          .map((x) => ({
            placeId: x.it.placeId,
            title: x.place.name || "Untitled",
            latLon: resolvePlaceLatLon(x.it.placeId),
            startTime: x.it.startTime || "",
            endTime: x.it.endTime || "",
          }))
          .filter((x) => x.latLon);

      const buildLegs = () => {
        const stops = getStops();
        const legs = [];

        if (startFromMy && myLocation.lastLatLng && stops.length) {
          legs.push({
            fromLabel: "My location",
            toLabel: stops[0].title,
            from: { lat: myLocation.lastLatLng.lat, lon: myLocation.lastLatLng.lng },
            to: { lat: stops[0].latLon.lat, lon: stops[0].latLon.lon },
          });
        }

        for (let i = 0; i < stops.length - 1; i += 1) {
          const a = stops[i];
          const b = stops[i + 1];
          legs.push({
            fromLabel: a.title,
            toLabel: b.title,
            from: { lat: a.latLon.lat, lon: a.latLon.lon },
            to: { lat: b.latLon.lat, lon: b.latLon.lon },
          });
        }
        return legs;
      };

      const render = () => {
        const legs = buildLegs();
        const hasMy = !!myLocation.lastLatLng;
        if (selectedIdx >= legs.length) selectedIdx = Math.max(0, legs.length - 1);
        const selected = legs[selectedIdx] || null;
        const src = selected ? buildGoogleMapsEmbedDirectionsUrl({ origin: selected.from, destination: selected.to, mode }) : null;

        const rows = legs
          .map((l, idx) => {
            const active = idx === selectedIdx;
            return `
              <button
                type="button"
                data-action="leg"
                data-idx="${idx}"
                class="w-full rounded-2xl p-3 text-left ring-1 transition ${
                  active ? "bg-fuchsia-500/15 ring-fuchsia-400/35 text-white" : "bg-white/5 ring-white/10 hover:bg-white/10 text-slate-100"
                }"
              >
                <div class="text-xs font-semibold ${active ? "text-white" : "text-slate-300"}">${escapeHtml(
                  l.fromLabel,
                )} → ${escapeHtml(l.toLabel)}</div>
              </button>
            `;
          })
          .join("");

        const chips = legs
          .map((l, idx) => {
            const active = idx === selectedIdx;
            return `
              <button
                type="button"
                data-action="leg"
                data-idx="${idx}"
                class="shrink-0 rounded-full px-3 py-2 text-xs font-extrabold ring-1 transition ${
                  active ? "bg-fuchsia-500/15 text-white ring-fuchsia-400/35" : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
                }"
              >${escapeHtml(l.fromLabel)} → ${escapeHtml(l.toLabel)}</button>
            `;
          })
          .join("");

        overlay.innerHTML = `
          <div data-action="backdrop" class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>
          <div class="relative w-full md:max-w-5xl md:rounded-3xl rounded-t-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
            <div class="border-b border-white/10 px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-base font-extrabold tracking-tight text-white">${escapeHtml(day.title || "Day")}</div>
                  <div class="mt-1 text-xs text-slate-300">Google directions (in-app)</div>
                </div>
                <button
                  type="button"
                  data-action="close"
                  class="shrink-0 rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
                >Close</button>
              </div>

              <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  <div class="text-xs font-semibold text-slate-300">Mode</div>
                  <div class="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
                    <button type="button" data-action="mode" data-mode="walking" class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                      mode === "walking" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                    }">Walk</button>
                    <button type="button" data-action="mode" data-mode="driving" class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                      mode === "driving" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                    }">Drive</button>
                    <button type="button" data-action="mode" data-mode="transit" class="rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                      mode === "transit" ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
                    }">Transit</button>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <label class="inline-flex items-center gap-2 text-xs text-slate-200">
                    <input type="checkbox" data-action="startFromMy" ${startFromMy ? "checked" : ""} ${
                      hasMy ? "" : "disabled"
                    } />
                    <span class="${hasMy ? "" : "opacity-40"}">Start from my location</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="px-5 py-4">
              ${
                legs.length
                  ? `
                    <div class="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                      <div class="hidden md:grid gap-2 max-h-[55vh] overflow-auto pr-1">${rows}</div>
                      <div class="overflow-hidden rounded-2xl ring-1 ring-white/10 bg-black/10">
                        ${
                          src
                            ? `<iframe title="Directions" src="${escapeHtml(
                                src,
                              )}" class="h-[55vh] min-h-[360px] w-full" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
                            : `<div class="p-4 text-sm text-slate-300">Could not load directions.</div>`
                        }
                      </div>
                    </div>
                    <div class="mt-3 flex gap-2 overflow-auto pr-1 md:hidden">${chips}</div>
                  `
                  : `
                    <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <div class="text-sm font-extrabold text-white">Not enough pinned stops</div>
                      <div class="mt-1 text-xs text-slate-300">Add at least 2 stops with coordinates (pins). You can also paste a Google Maps URL on each place to provide coordinates.</div>
                    </div>
                  `
              }
            </div>
          </div>
        `;
      };

      render();

      const onKeyDown = (e) => {
        if (e.key === "Escape") close();
      };

      const cleanup = () => {
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown);
      };
      const close = () => {
        cleanup();
        resolve();
      };

      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", (e) => {
        if (e.target.closest("[data-action='backdrop']")) return close();
        if (e.target.closest("button[data-action='close']")) return close();

        const legBtn = e.target.closest("button[data-action='leg'][data-idx]");
        if (legBtn) {
          selectedIdx = Math.max(0, Number(legBtn.dataset.idx || 0));
          render();
          return;
        }

        const modeBtn = e.target.closest("button[data-action='mode'][data-mode]");
        if (modeBtn) {
          mode = modeBtn.dataset.mode === "driving" ? "driving" : modeBtn.dataset.mode === "transit" ? "transit" : "walking";
          gmapsMode = mode;
          saveGmapsMode(gmapsMode);
          render();
          return;
        }
      });

      overlay.addEventListener("change", (e) => {
        const el = e.target;
        if (el?.matches?.("input[data-action='startFromMy']")) {
          startFromMy = !!el.checked;
          render();
        }
      });

      document.body.appendChild(overlay);
    });

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

  }

  sync();
  window.setTimeout(refreshMap, 50);

  const maybeAutoConnect = async () => {
    const fromUrl = parseTripParamsFromUrl(window.location.href);
    const stored = loadSyncSettings();
    const storedOk =
      stored &&
      (!stored.userId || !authState.userId || stored.userId === authState.userId) &&
      stored.tripId &&
      stored.joinCode;
    const target = fromUrl || storedOk;
    if (target) {
      const ok = await connectToTrip(target, { source: "auto" });
      if (ok) {
        markOnboardingSeen();
        return;
      }
    }

    if (!syncState.enabled) {
      await openSyncModal({ intent: "onboarding" });
    }
  };

  await maybeAutoConnect();
}

registerInstallPrompt();
registerServiceWorker();
main();
