const STORAGE_KEY = "mangaArchive.entries.v1";

const state = {
  entries: loadEntries(),
  coverDataUrl: "",
};

const elements = {
  form: document.getElementById("entry-form"),
  id: document.getElementById("entry-id"),
  title: document.getElementById("title"),
  series: document.getElementById("series"),
  genres: document.getElementById("genres"),
  tags: document.getElementById("tags"),
  volume: document.getElementById("volume"),
  chapter: document.getElementById("chapter"),
  latestChapter: document.getElementById("latest-chapter"),
  status: document.getElementById("status"),
  rating: document.getElementById("rating"),
  notes: document.getElementById("notes"),
  coverFile: document.getElementById("cover-file"),
  coverPreview: document.getElementById("cover-preview"),
  removeCover: document.getElementById("remove-cover"),
  urlImport: document.getElementById("url-import"),
  fetchUrl: document.getElementById("fetch-url"),
  fetchStatus: document.getElementById("fetch-status"),
  resetButton: document.getElementById("reset-form"),
  search: document.getElementById("search"),
  statusFilter: document.getElementById("status-filter"),
  genreFilter: document.getElementById("genre-filter"),
  tagFilter: document.getElementById("tag-filter"),
  sortBy: document.getElementById("sort-by"),
  entries: document.getElementById("entries"),
  exportButton: document.getElementById("export-json"),
  importInput: document.getElementById("import-json"),
};

elements.form.addEventListener("submit", onSave);
elements.resetButton.addEventListener("click", clearForm);
elements.fetchUrl.addEventListener("click", onFetchUrl);
elements.urlImport.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); onFetchUrl(); }
});
elements.search.addEventListener("input", render);

// ── PWA install banner ────────────────────────────────────────────────────────
let _installPromptEvent = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _installPromptEvent = e;
  document.getElementById("install-banner")?.classList.remove("hidden");
});

document.getElementById("install-accept")?.addEventListener("click", async () => {
  if (!_installPromptEvent) return;
  _installPromptEvent.prompt();
  await _installPromptEvent.userChoice;
  _installPromptEvent = null;
  document.getElementById("install-banner")?.classList.add("hidden");
});

document.getElementById("install-dismiss")?.addEventListener("click", () => {
  document.getElementById("install-banner")?.classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  document.getElementById("install-banner")?.classList.add("hidden");
});
elements.statusFilter.addEventListener("change", render);
elements.genreFilter.addEventListener("input", render);
elements.tagFilter.addEventListener("input", render);
elements.sortBy.addEventListener("change", render);
elements.exportButton.addEventListener("click", exportJson);
elements.importInput.addEventListener("change", importJson);
elements.coverFile.addEventListener("change", onCoverSelected);
elements.removeCover.addEventListener("click", removeCover);

render();
registerServiceWorker();

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeEntry(item));
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function onSave(event) {
  event.preventDefault();

  const entry = {
    id: elements.id.value || createId(),
    title: elements.title.value.trim(),
    series: elements.series.value.trim(),
    genres: parseList(elements.genres.value),
    tags: parseList(elements.tags.value),
    volume: normalizeNumber(elements.volume.value),
    chapter: normalizeNumber(elements.chapter.value),
    latestChapter: normalizeNumber(elements.latestChapter.value),
    status: elements.status.value,
    rating: normalizeNumber(elements.rating.value),
    notes: elements.notes.value.trim(),
    coverDataUrl: state.coverDataUrl || null,
    updatedAt: new Date().toISOString(),
  };

  if (!entry.title) return;

  const existingIndex = state.entries.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    state.entries[existingIndex] = entry;
  } else {
    state.entries.unshift(entry);
  }

  saveEntries();
  clearForm();
  render();
}

function clearForm() {
  elements.form.reset();
  elements.id.value = "";
  elements.status.value = "reading";
  state.coverDataUrl = "";
  syncCoverPreview();
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  const genreQuery = elements.genreFilter.value.trim().toLowerCase();
  const tagQuery = elements.tagFilter.value.trim().toLowerCase();
  const sortBy = elements.sortBy.value;

  const filtered = state.entries.filter((entry) => {
    const matchesText =
      !query ||
      entry.title.toLowerCase().includes(query) ||
      (entry.series || "").toLowerCase().includes(query);
    const matchesStatus = status === "all" || entry.status === status;
    const matchesGenre = !genreQuery || (entry.genres || []).some((item) => item.includes(genreQuery));
    const matchesTag = !tagQuery || (entry.tags || []).some((item) => item.includes(tagQuery));
    return matchesText && matchesStatus && matchesGenre && matchesTag;
  });

  filtered.sort((a, b) => sortEntries(a, b, sortBy));

  if (!filtered.length) {
    elements.entries.innerHTML = '<div class="empty">No entries found.</div>';
    return;
  }

  elements.entries.innerHTML = filtered
    .map(
      (entry) => `
      <article class="entry">
        <div class="entry-head">
          ${
            entry.coverDataUrl
              ? `<img src="${escapeHtml(entry.coverDataUrl)}" class="entry-cover" alt="Cover for ${escapeHtml(entry.title)}" />`
              : `<div class="entry-cover placeholder">No Cover</div>`
          }
          <div>
            <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
            <p class="entry-meta">
              ${escapeHtml(entry.series || "No series")} | Vol ${entry.volume ?? "-"} | Ch ${entry.chapter ?? "-"} / ${entry.latestChapter ?? "?"} | Left: ${chaptersLeft(entry)} | ${escapeHtml(entry.status)} | Rating: ${entry.rating ?? "-"}
            </p>
            <p class="entry-meta">Genres: ${escapeHtml((entry.genres || []).join(", ") || "-")}</p>
            <p class="entry-meta">Tags: ${escapeHtml((entry.tags || []).join(", ") || "-")}</p>
          </div>
        </div>
        ${
          entry.notes
            ? `<p class="entry-notes">${escapeHtml(entry.notes)}</p>`
            : ""
        }
        <div class="entry-actions">
          <button type="button" data-action="edit" data-id="${entry.id}">Edit</button>
          <button type="button" class="secondary" data-action="delete" data-id="${entry.id}">Delete</button>
        </div>
      </article>
      `,
    )
    .join("");

  elements.entries.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      const id = button.getAttribute("data-id");
      if (action === "edit") editEntry(id);
      if (action === "delete") deleteEntry(id);
    });
  });
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  elements.id.value = entry.id;
  elements.title.value = entry.title || "";
  elements.series.value = entry.series || "";
  elements.genres.value = (entry.genres || []).join(", ");
  elements.tags.value = (entry.tags || []).join(", ");
  elements.volume.value = entry.volume ?? "";
  elements.chapter.value = entry.chapter ?? "";
  elements.latestChapter.value = entry.latestChapter ?? "";
  elements.status.value = entry.status || "reading";
  elements.rating.value = entry.rating ?? "";
  elements.notes.value = entry.notes || "";
  state.coverDataUrl = entry.coverDataUrl || "";
  syncCoverPreview();

  elements.title.focus();
}

function deleteEntry(id) {
  state.entries = state.entries.filter((item) => item.id !== id);
  saveEntries();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manga-archive-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed)) {
        alert("Import failed: JSON must be an array of entries.");
        return;
      }

      // Replace all entries for predictable imports from backups.
      state.entries = parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => normalizeEntry(item));
      saveEntries();
      render();
      clearForm();
    } catch {
      alert("Import failed: invalid JSON file.");
    } finally {
      elements.importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function onCoverSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Cover must be an image file.");
    elements.coverFile.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    state.coverDataUrl = dataUrl;
    syncCoverPreview();
  };
  reader.readAsDataURL(file);
}

function removeCover() {
  state.coverDataUrl = "";
  elements.coverFile.value = "";
  syncCoverPreview();
}

function syncCoverPreview() {
  if (!state.coverDataUrl) {
    elements.coverPreview.classList.add("hidden");
    elements.removeCover.classList.add("hidden");
    elements.coverPreview.removeAttribute("src");
    return;
  }

  elements.coverPreview.src = state.coverDataUrl;
  elements.coverPreview.classList.remove("hidden");
  elements.removeCover.classList.remove("hidden");
}

function parseList(value) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function sortEntries(a, b, sortBy) {
  if (sortBy === "title-asc") return sortText(a.title, b.title);
  if (sortBy === "rating-desc") return sortNumberDesc(a.rating, b.rating);
  if (sortBy === "volume-desc") return sortNumberDesc(a.volume, b.volume);
  if (sortBy === "chapter-desc") return sortNumberDesc(a.chapter, b.chapter);

  return sortText(b.updatedAt || "", a.updatedAt || "");
}

function sortNumberDesc(left, right) {
  return (right ?? -1) - (left ?? -1);
}

function sortText(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function normalizeEntry(raw) {
  return {
    id: raw.id || createId(),
    title: String(raw.title || ""),
    series: String(raw.series || ""),
    genres: normalizeStringArray(raw.genres),
    tags: normalizeStringArray(raw.tags),
    volume: normalizeNumber(raw.volume),
    chapter: normalizeNumber(raw.chapter),
    latestChapter: normalizeNumber(raw.latestChapter),
    status: String(raw.status || "planned"),
    rating: normalizeNumber(raw.rating),
    notes: String(raw.notes || ""),
    coverDataUrl: typeof raw.coverDataUrl === "string" ? raw.coverDataUrl : null,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      // When a new SW version activates (e.g. after a deploy), reload the page
      // automatically so users always get the latest app.js without clearing cache.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
      // Immediately check for a new version in case one is already waiting.
      reg.update();
    }).catch(() => {
      // Silent fail for environments where SW is blocked.
    });
  });
}

// ── URL auto-categorisation ───────────────────────────────────────────────────

const URL_PATTERNS = {
  mangadex: /mangadex\.org\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  anilist:  /anilist\.co\/manga\/(\d+)/i,
  mal:      /myanimelist\.net\/manga\/(\d+)/i,
  manhuafast: /manhuafast\.net/i,
};

async function onFetchUrl() {
  const raw = elements.urlImport.value.trim();
  if (!raw) return;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    setFetchStatus("error", "Not a valid URL.");
    return;
  }

  // Only allow known hosts — never fetch the user-supplied URL directly.
  const host = parsed.hostname.replace(/^www\./, "");
  const isManhuafast = host.endsWith("manhuafast.net");
  const allowed = ["mangadex.org", "anilist.co", "myanimelist.net"];
  if (!allowed.includes(host) && !isManhuafast) {
    setFetchStatus("error", "Unsupported site. Paste a MangaDex, AniList, MyAnimeList, or ManhuaFast URL.");
    return;
  }

  setFetchStatus("loading", "Fetching details…");

  try {
    let meta;
    const mdMatch = URL_PATTERNS.mangadex.exec(raw);
    const alMatch = URL_PATTERNS.anilist.exec(raw);
    const malMatch = URL_PATTERNS.mal.exec(raw);
    const mhMatch = URL_PATTERNS.manhuafast.exec(raw);

    if (mdMatch)       meta = await fetchMangaDex(mdMatch[1]);
    else if (alMatch)  meta = await fetchAniList(Number(alMatch[1]));
    else if (malMatch) meta = await fetchJikan(Number(malMatch[1]));
    else if (mhMatch)  meta = await fetchManhuafast(parsed);
    else {
      setFetchStatus("error", "Could not find a recognised ID in that URL.");
      return;
    }

    const chapterFromUrl = extractChapterFromUrl(parsed);
    if (chapterFromUrl != null && meta.chapter == null) {
      meta.chapter = chapterFromUrl;
    }

    fillFormFromMeta(meta);
    setFetchStatus("success", `Auto-filled from ${meta.source}!`);
    setTimeout(() => setFetchStatus("hidden"), 3500);
  } catch {
    setFetchStatus("error", "Fetch failed. The API may be temporarily unavailable — try again.");
  }
}

async function fetchMangaDex(uuid) {
  const res = await fetch(
    `https://api.mangadex.org/manga/${encodeURIComponent(uuid)}?includes[]=tag&includes[]=cover_art`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`MangaDex ${res.status}`);
  const json = await res.json();
  if (json.result !== "ok") throw new Error("MangaDex: no result");

  const attr = json.data.attributes;
  const title =
    attr.title?.en ||
    Object.values(attr.title || {})[0] ||
    "";
  const genres = (attr.tags || [])
    .filter((t) => t.attributes?.group === "genre")
    .map((t) => t.attributes?.name?.en || "")
    .filter(Boolean)
    .map((g) => g.toLowerCase());
  const tags = (attr.tags || [])
    .filter((t) => t.attributes?.group === "theme")
    .map((t) => t.attributes?.name?.en || "")
    .filter(Boolean)
    .map((t) => t.toLowerCase());

  const coverRelation = (json.data.relationships || []).find((r) => r.type === "cover_art");
  const coverFileName = coverRelation?.attributes?.fileName;
  const coverUrl = coverFileName
    ? `https://uploads.mangadex.org/covers/${uuid}/${coverFileName}.512.jpg`
    : null;

  return {
    source: "MangaDex",
    title,
    genres,
    tags,
    status: { ongoing: "reading", completed: "completed", hiatus: "on-hold", cancelled: "on-hold" }[attr.status] ?? "planned",
    coverUrl,
  };
}

async function fetchAniList(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        title { romaji english }
        status
        genres
        chapters
        coverImage { large }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  const media = json.data?.Media;
  if (!media) throw new Error("AniList: no data");

  const statusMap = {
    RELEASING: "reading",
    FINISHED: "completed",
    HIATUS: "on-hold",
    CANCELLED: "on-hold",
    NOT_YET_RELEASED: "planned",
  };

  return {
    source: "AniList",
    title: media.title?.english || media.title?.romaji || "",
    genres: (media.genres || []).map((g) => g.toLowerCase()),
    tags: [],
    status: statusMap[media.status] ?? "planned",
    latestChapter: normalizeNumber(media.chapters),
    coverUrl: media.coverImage?.large || null,
  };
}

async function fetchJikan(id) {
  const res = await fetch(`https://api.jikan.moe/v4/manga/${id}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  const json = await res.json();
  const data = json.data;
  if (!data) throw new Error("Jikan: no data");

  const genres = [
    ...(data.genres || []),
    ...(data.explicit_genres || []),
  ].map((g) => g.name.toLowerCase());
  const tags = (data.themes || []).map((t) => t.name.toLowerCase());

  let status = "planned";
  const s = data.status || "";
  if (s.includes("Publishing")) status = "reading";
  else if (s.includes("Finished")) status = "completed";
  else if (s.includes("Hiatus") || s.includes("Discontinued")) status = "on-hold";

  return {
    source: "MyAnimeList",
    title: data.title_english || data.title || "",
    genres,
    tags,
    status,
    latestChapter: normalizeNumber(data.chapters),
    coverUrl: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || null,
  };
}

function fetchManhuafast(parsedUrl) {
  const skip = new Set(["manga", "manhua", "manhwa", "comic", "series", "read", "chapter"]);
  const segments = parsedUrl.pathname
    .split("/")
    .map((part) => decodeURIComponent(part).trim().toLowerCase())
    .filter(Boolean)
    .filter((part) => !skip.has(part));

  const slug = segments[segments.length - 1] || "";
  const title = slugToTitle(slug) || "Unknown title";

  return fetchManhuafastEnriched(title);
}

async function fetchManhuafastEnriched(title) {
  const enriched = await fetchAniListBySearch(title);

  return {
    source: enriched ? "ManhuaFast + AniList" : "ManhuaFast",
    title: enriched?.title || title,
    genres: enriched?.genres || [],
    tags: ["manhuafast", ...(enriched?.tags || [])],
    status: enriched?.status || "planned",
    latestChapter: enriched?.latestChapter ?? null,
    coverUrl: enriched?.coverUrl || null,
  };
}

function slugToTitle(slug) {
  if (!slug) return "";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchAniListBySearch(title) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA) {
        title { romaji english }
        status
        genres
        chapters
        coverImage { large }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: title } }),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const media = json.data?.Media;
    if (!media) return null;

    const statusMap = {
      RELEASING: "reading",
      FINISHED: "completed",
      HIATUS: "on-hold",
      CANCELLED: "on-hold",
      NOT_YET_RELEASED: "planned",
    };

    return {
      title: media.title?.english || media.title?.romaji || title,
      genres: (media.genres || []).map((item) => item.toLowerCase()),
      tags: [],
      status: statusMap[media.status] ?? "planned",
      latestChapter: normalizeNumber(media.chapters),
      coverUrl: media.coverImage?.large || null,
    };
  } catch {
    return null;
  }
}

function fillFormFromMeta(meta) {
  if (meta.title && !elements.title.value.trim()) {
    elements.title.value = meta.title;
  }
  if (meta.genres?.length) {
    elements.genres.value = meta.genres.join(", ");
  }
  if (meta.tags?.length) {
    elements.tags.value = meta.tags.join(", ");
  }
  if (meta.status) {
    elements.status.value = meta.status;
  }
  if (meta.latestChapter != null) {
    elements.latestChapter.value = meta.latestChapter;
  }
  if (meta.chapter != null) {
    elements.chapter.value = meta.chapter;
  }
  if (meta.coverUrl && !state.coverDataUrl) {
    state.coverDataUrl = meta.coverUrl;
    syncCoverPreview();
  }
}

function extractChapterFromUrl(parsedUrl) {
  const queryChapter = parsedUrl.searchParams.get("chapter") || parsedUrl.searchParams.get("ch");
  const parsedQuery = normalizeNumber(queryChapter);
  if (parsedQuery != null) return parsedQuery;

  const path = decodeURIComponent(parsedUrl.pathname.toLowerCase());
  const patterns = [
    /chapter[-_\/]?(\d+(?:\.\d+)?)/,
    /(?:^|[\/_-])ch(?:apter)?[-_ ]?(\d+(?:\.\d+)?)(?:$|[\/_-])/, 
  ];

  for (const regex of patterns) {
    const match = path.match(regex);
    if (match?.[1]) {
      const value = normalizeNumber(match[1]);
      if (value != null) return value;
    }
  }

  return null;
}

function setFetchStatus(type, message) {
  const el = elements.fetchStatus;
  el.className = "fetch-status";
  if (type === "hidden") {
    el.classList.add("hidden");
    return;
  }
  el.classList.add(`fetch-${type}`);
  el.textContent = message || "";
}

function createId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function chaptersLeft(entry) {
  if (entry.latestChapter == null) return "?";
  if (entry.chapter == null) return String(entry.latestChapter);
  return String(Math.max(0, entry.latestChapter - entry.chapter));
}

function normalizeNumber(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
