import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_OUTFILE = path.join(ROOT, "data", "places.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  const bytes = Buffer.from(input, "utf8");
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUTFILE,
    nominatimEmail: process.env.NOMINATIM_EMAIL || "",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      args.out = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--email") {
      args.nominatimEmail = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
  }
  return args;
}

function parseListMarkdown(markdown) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let currentCategory = "Uncategorized";
  const places = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const place = { ...current };
    current = null;
    if (!place.name) return;
    places.push(place);
  };

  for (const line of lines) {
    if (line.startsWith("●")) {
      flush();
      currentCategory = line.replace(/^●\s*/, "").trim() || "Uncategorized";
      continue;
    }

    if (line.startsWith("・")) {
      flush();
      places.push({
        name: line.replace(/^・+/, "").trim(),
        category: currentCategory,
        notes: [],
        address: "",
        url: "",
      });
      continue;
    }

    if (line.startsWith("http://") || line.startsWith("https://")) {
      if (!current) continue;
      current.url = line;
      flush();
      continue;
    }

    if (line.startsWith("※") || line.startsWith("*")) {
      if (!current) {
        current = {
          name: "",
          category: currentCategory,
          notes: [line],
          address: "",
          url: "",
        };
      } else {
        current.notes.push(line);
      }
      continue;
    }

    if (!current) {
      current = {
        name: line,
        category: currentCategory,
        notes: [],
        address: "",
        url: "",
      };
      continue;
    }

    if (!current.address) {
      current.address = line;
      continue;
    }

    current.notes.push(line);
  }

  flush();

  return places.map((p) => ({
    ...p,
    source: "list.md",
  }));
}

function parseHotelText(text) {
  const address = text.trim();
  return [
    {
      name: "Hotel",
      category: "Hotel",
      notes: [],
      address,
      url: "",
      source: "hotel.txt",
    },
  ];
}

function extractNaverPlaceId(url) {
  if (!url) return null;
  const patterns = [
    /\/entry\/place\/(\d+)/,
    /\/place\/(\d+)/,
    /placeId=(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function resolveNaverPlaceId(url) {
  if (!url) return null;
  const direct = extractNaverPlaceId(url);
  if (direct) return direct;

  if (!/naver\.me\//.test(url)) return null;

  const headers = {
    "user-agent": "sc-trip-map/0.1 (data generator)",
  };

  const headResp = await fetch(url, { method: "HEAD", redirect: "follow", headers }).catch(
    () => null,
  );
  if (headResp && headResp.ok) {
    headResp.body?.cancel();
    return extractNaverPlaceId(headResp.url);
  }

  const getResp = await fetch(url, { method: "GET", redirect: "follow", headers });
  getResp.body?.cancel();
  return extractNaverPlaceId(getResp.url);
}

async function fetchNaverPlaceSummary(placeId) {
  const summaryUrl = `https://map.naver.com/p/api/place/summary/${placeId}`;
  const referer = `https://map.naver.com/p/entry/place/${placeId}`;
  const resp = await fetch(summaryUrl, {
    headers: {
      "user-agent": "sc-trip-map/0.1 (data generator)",
      referer,
    },
  });
  if (!resp.ok) {
    throw new Error(`Naver summary failed (${resp.status}) for ${placeId}`);
  }
  const json = await resp.json();
  const coordinate = json?.data?.placeDetail?.coordinate;
  const name = json?.data?.placeDetail?.name;
  if (!coordinate?.latitude || !coordinate?.longitude) {
    throw new Error(`Missing coordinates for ${placeId}`);
  }
  return {
    lat: Number(coordinate.latitude),
    lon: Number(coordinate.longitude),
    naverName: typeof name === "string" ? name : "",
  };
}

async function geocodeNominatim(query, { email } = {}) {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "kr",
    q: query,
  });
  if (email) params.set("email", email);
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      "user-agent": "sc-trip-map/0.1 (data generator)",
    },
  });
  if (!resp.ok) {
    throw new Error(`Nominatim failed (${resp.status})`);
  }
  const results = await resp.json();
  const first = results?.[0];
  if (!first?.lat || !first?.lon) return null;
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    displayName: first.display_name || "",
  };
}

function buildId(place) {
  const key = [place.source, place.category, place.name, place.address, place.url]
    .filter(Boolean)
    .join("|");
  return `p_${fnv1aHex(key)}`;
}

function buildNominatimQueries(place) {
  const hintsByName = new Map([
    ["60鶏チキン", ["60계치킨"]],
    ["カンブチキン", ["깐부치킨 명동점", "깐부치킨"]],
  ]);

  const queries = [];
  const name = (place.name || "").trim();
  const address = (place.address || "").trim();

  if (name && address) queries.push(`${name} ${address}`);
  if (address) queries.push(address);
  if (name && !address) queries.push(name);

  const hints = name ? hintsByName.get(name) : null;
  if (hints) {
    for (const hint of hints) {
      queries.push(hint);
      queries.push(`${hint} Seoul`);
      queries.push(`${hint} 서울`);
    }
  }

  if (address) {
    const ascii = address
      .replace(/[^\x00-\x7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const asciiNoFloor = ascii
      .replace(/\b\d+(?:-\d+)?\s*F(?:L)?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const extras = [ascii, asciiNoFloor]
      .filter(Boolean)
      .flatMap((q) => [q, `${q}, Seoul, South Korea`]);
    for (const q of extras) queries.push(q);
  }

  return [...new Set(queries)].filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const listPath = path.join(ROOT, "list.md");
  const hotelPath = path.join(ROOT, "hotel.txt");

  const [listMarkdown, hotelText] = await Promise.all([
    readFile(listPath, "utf8"),
    readFile(hotelPath, "utf8"),
  ]);

  const rawPlaces = [...parseHotelText(hotelText), ...parseListMarkdown(listMarkdown)].map(
    (p) => ({
      id: buildId(p),
      ...p,
    }),
  );

  const places = [];
  for (const place of rawPlaces) {
    const out = { ...place };
    out.lat = null;
    out.lon = null;
    out.geocoding = null;
    out.naver = null;

    try {
      const placeId = await resolveNaverPlaceId(out.url);
      if (placeId) {
        const summary = await fetchNaverPlaceSummary(placeId);
        out.lat = summary.lat;
        out.lon = summary.lon;
        out.naver = {
          placeId,
          name: summary.naverName,
          sourceUrl: out.url,
        };
        out.geocoding = { provider: "naver", precision: "place" };
      }
    } catch (err) {
      out.geocoding = { provider: "naver", error: String(err?.message || err) };
    }

    if (out.lat == null || out.lon == null) {
      try {
        for (const query of buildNominatimQueries(out)) {
          const geo = await geocodeNominatim(query, { email: args.nominatimEmail });
          if (!geo) continue;
          out.lat = geo.lat;
          out.lon = geo.lon;
          out.geocoding = {
            provider: "nominatim",
            precision: "search",
            displayName: geo.displayName,
            query,
          };
          break;
        }
      } catch (err) {
        out.geocoding = { provider: "nominatim", error: String(err?.message || err) };
      }
    }

    places.push(out);
    await sleep(250);
  }

  const pinned = places.filter((p) => typeof p.lat === "number" && typeof p.lon === "number").length;
  const total = places.length;
  const outfile = args.out;
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stats: { total, pinned },
    places,
  };

  if (args.dryRun) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await mkdir(path.dirname(outfile), { recursive: true });
  await writeFile(outfile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outfile} (${pinned}/${total} pinned)`);
}

await main();
