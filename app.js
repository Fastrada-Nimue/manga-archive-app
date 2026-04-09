const STORAGE_KEY = "mangaArchive.entries.v1";
const CLOUD_STORAGE_KEY = "mangaArchive.cloud.v1";
const CLOUD_FILE_NAME = "manga-archive-data.json";
const UI_STORAGE_KEY = "mangaArchive.ui.v1";

const uiSettings = loadUiSettings();

const state = {
  entries: loadEntries(),
  coverDataUrl: "",
  cloud: loadCloudSettings(),
  cloudBusy: false,
  compactMode: uiSettings.compactMode,
  expandedEntryIds: new Set(),
  draggingEntryId: null,
};

const elements = {
  form: document.getElementById("entry-form"),
  id: document.getElementById("entry-id"),
  title: document.getElementById("title"),
  translatedTitle: document.getElementById("translated-title"),
  series: document.getElementById("series"),
  genres: document.getElementById("genres"),
  tags: document.getElementById("tags"),
  volume: document.getElementById("volume"),
  chapter: document.getElementById("chapter"),
  latestChapter: document.getElementById("latest-chapter"),
  latestChapterDate: document.getElementById("latest-chapter-date"),
  status: document.getElementById("status"),
  rating: document.getElementById("rating"),
  notes: document.getElementById("notes"),
  coverFile: document.getElementById("cover-file"),
  coverPreview: document.getElementById("cover-preview"),
  removeCover: document.getElementById("remove-cover"),
  urlImport: document.getElementById("url-import"),
  fetchUrl: document.getElementById("fetch-url"),
  fetchStatus: document.getElementById("fetch-status"),
  cloudToken: document.getElementById("cloud-token"),
  cloudGistId: document.getElementById("cloud-gist-id"),
  cloudAutoSync: document.getElementById("cloud-auto-sync"),
  cloudSave: document.getElementById("cloud-save"),
  cloudPush: document.getElementById("cloud-push"),
  cloudPull: document.getElementById("cloud-pull"),
  cloudStatus: document.getElementById("cloud-status"),
  resetButton: document.getElementById("reset-form"),
  search: document.getElementById("search"),
  statusFilter: document.getElementById("status-filter"),
  genreFilter: document.getElementById("genre-filter"),
  tagFilter: document.getElementById("tag-filter"),
  sortBy: document.getElementById("sort-by"),
  compactMode: document.getElementById("compact-mode"),
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
elements.compactMode.addEventListener("change", onToggleCompactMode);
elements.exportButton.addEventListener("click", exportJson);
elements.importInput.addEventListener("change", importJson);
elements.coverFile.addEventListener("change", onCoverSelected);
elements.removeCover.addEventListener("click", removeCover);
elements.cloudSave.addEventListener("click", onCloudSaveSettings);
elements.cloudPush.addEventListener("click", onCloudPush);
elements.cloudPull.addEventListener("click", onCloudPull);

render();
initCloudUi();
registerServiceWorker();

elements.compactMode.checked = state.compactMode;

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeEntry(item));
    ensureManualOrder(entries);
    return entries;
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function onSave(event) {
  event.preventDefault();

  const isNewEntry = !elements.id.value;
  let entry = {
    id: null, // Will be assigned later
    title: elements.title.value.trim(),
    translatedTitle: elements.translatedTitle.value.trim(),
    sourceUrl: elements.urlImport.value.trim(),
    series: elements.series.value.trim(),
    genres: parseList(elements.genres.value),
    tags: parseList(elements.tags.value),
    volume: normalizeNumber(elements.volume.value),
    chapter: normalizeNumber(elements.chapter.value),
    latestChapter: normalizeNumber(elements.latestChapter.value),
    latestChapterDate: elements.latestChapterDate.value || null,
    status: elements.status.value,
    rating: normalizeNumber(elements.rating.value),
    notes: elements.notes.value.trim(),
    coverDataUrl: state.coverDataUrl || null,
    manualOrder: null,
    updatedAt: new Date().toISOString(),
  };

  if (!entry.title) return;

  let existingIndex = -1;
  let existingEntry = null;

  if (!isNewEntry) {
    // Editing existing entry by ID
    existingEntry = state.entries.find((item) => item.id === elements.id.value);
    existingIndex = state.entries.findIndex((item) => item.id === elements.id.value);
    if (existingEntry) {
      entry.id = existingEntry.id;
    }
  } else {
    // New entry - check for duplicate by title
    existingEntry = findSimilarEntry(entry.title, entry.translatedTitle);
    if (existingEntry) {
      // Found similar entry, update it instead
      existingIndex = state.entries.findIndex((item) => item.id === existingEntry.id);
      entry.id = existingEntry.id;
    } else {
      // No duplicate found, generate new ID
      entry.id = createId();
    }
  }
  
  if (existingIndex >= 0) {
    // Update existing entry, preserve manual order
    entry.manualOrder = state.entries[existingIndex].manualOrder;
    state.entries[existingIndex] = entry;
  } else {
    // New entry
    entry.manualOrder = getNextManualOrderForBucket(statusBucket(entry.status));
    state.entries.unshift(entry);
  }

  saveEntries();
  void maybeAutoCloudPush();
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
  const query = elements.search.value.trim();
  const status = elements.statusFilter.value;
  const genreQuery = elements.genreFilter.value.trim().toLowerCase();
  const tagQuery = elements.tagFilter.value.trim().toLowerCase();
  const sortBy = elements.sortBy.value;

  const filtered = state.entries.filter((entry) => {
    const matchesText = matchesEntrySearch(entry, query);
    const matchesStatus = status === "all" || entry.status === status;
    const matchesGenre = !genreQuery || (entry.genres || []).some((item) => item.includes(genreQuery));
    const matchesTag = !tagQuery || (entry.tags || []).some((item) => item.includes(tagQuery));
    return matchesText && matchesStatus && matchesGenre && matchesTag;
  });

  filtered.sort((a, b) => {
    if (query) {
      const scoreDelta = getEntrySearchScore(b, query) - getEntrySearchScore(a, query);
      if (scoreDelta !== 0) return scoreDelta;
    }
    return sortEntries(a, b, sortBy);
  });

  if (!filtered.length) {
    elements.entries.innerHTML = '<div class="empty">No entries found.</div>';
    return;
  }

  const grouped = {
    begun: filtered.filter((entry) => statusBucket(entry.status) === "begun"),
    completed: filtered.filter((entry) => statusBucket(entry.status) === "completed"),
    potential: filtered.filter((entry) => statusBucket(entry.status) === "potential"),
  };

  const sectionOrder = ["begun", "completed", "potential"];
  const requestedBuckets = status === "all"
    ? sectionOrder
    : Array.from(new Set(filtered.map((entry) => statusBucket(entry.status))));

  elements.entries.innerHTML = requestedBuckets
    .map((bucket) => renderStatusSection(bucket, grouped[bucket], query))
    .join("");

  elements.entries.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      const id = button.getAttribute("data-id");
      if (action === "open-link") openEntrySource(id);
      if (action === "toggle") toggleExpanded(id);
      if (action === "edit") editEntry(id);
      if (action === "refresh") void refreshEntry(id);
      if (action === "delete") deleteEntry(id);
    });
  });

  elements.entries.querySelectorAll("select[data-action='move']").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.getAttribute("data-id");
      const targetBucket = select.value;
      if (!id || !targetBucket) return;
      moveEntryToBucket(id, targetBucket);
    });
  });

  elements.entries.querySelectorAll("article[data-entry-id]").forEach((card) => {
    card.addEventListener("dragstart", onEntryDragStart);
    card.addEventListener("dragend", onEntryDragEnd);
  });

  elements.entries.querySelectorAll(".entry-group-list[data-bucket]").forEach((lane) => {
    lane.addEventListener("dragover", onLaneDragOver);
    lane.addEventListener("drop", onLaneDrop);
    lane.addEventListener("dragenter", onLaneDragEnter);
    lane.addEventListener("dragleave", onLaneDragLeave);
  });
}

function renderStatusSection(bucket, entries, query = "") {
  const labels = {
    begun: "Begun",
    completed: "Completed",
    potential: "Potential",
  };

  const rows = entries.length
    ? entries.map((entry, index) => renderEntryRow(entry, index + 1, query)).join("")
    : '<div class="entry-empty-lane">No entries in this group.</div>';

  return `
    <section class="entry-group entry-group-${bucket}">
      <h3 class="entry-group-title">${labels[bucket]} <span class="entry-group-count">${entries.length}</span></h3>
      <div class="entry-group-list" data-bucket="${bucket}">
        ${rows}
      </div>
    </section>
  `;
}

function renderEntryRow(entry, index, query = "") {
  const linkHref = safeExternalHref(entry.sourceUrl);
  const leftCount = chaptersLeft(entry);
  const hasNew = leftCount !== "?" && Number(leftCount) > 0;
  const displaySeries = entry.series || "No series";
  const titleTone = getFieldMatchTone(entry.title, query, "strong");
  const translatedTone = getFieldMatchTone(entry.translatedTitle, query, "medium");
  const seriesTone = getFieldMatchTone(displaySeries, query, "medium");
  const genresText = (entry.genres || []).join(", ") || "-";
  const tagsText = (entry.tags || []).join(", ") || "-";
  const genresTone = getFieldMatchTone(genresText, query, "soft");
  const tagsTone = getFieldMatchTone(tagsText, query, "soft");
  const coverContent = entry.coverDataUrl
    ? `<img src="${escapeHtml(entry.coverDataUrl)}" class="entry-cover entry-cover-small" alt="Cover for ${escapeHtml(entry.title)}" />`
    : `<div class="entry-cover entry-cover-small placeholder">No Cover</div>`;
  const coverMarkup = linkHref
    ? `<button type="button" class="entry-cover-link" data-action="open-link" data-id="${entry.id}" aria-label="Open ${escapeHtml(entry.title)} source">${coverContent}</button>`
    : coverContent;

  return `
    <article class="entry entry-compact ${state.compactMode ? "entry-one-line" : ""} ${state.expandedEntryIds.has(entry.id) ? "expanded" : ""}" draggable="true" data-entry-id="${entry.id}">
      <div class="entry-index">${index}</div>
      ${coverMarkup}
      <div class="entry-main">
        <h3 class="entry-title">${highlightText(entry.title, query, titleTone)}${hasNew ? `<span class="entry-new-badge">+${leftCount}</span>` : ""}</h3>
        <p class="entry-summary-line">
          ${highlightText(displaySeries, query, seriesTone)} | Vol ${entry.volume ?? "-"} | Ch ${entry.chapter ?? "-"} / ${entry.latestChapter ?? "?"} | Left: ${leftCount} | ${escapeHtml(entry.status)} | Rating: ${entry.rating ?? "-"}
        </p>
        <div class="entry-details">
          ${entry.translatedTitle ? `<p class="entry-subtitle">${highlightText(entry.translatedTitle, query, translatedTone)}</p>` : ""}
          <p class="entry-meta">Genres: ${highlightText(genresText, query, genresTone)}</p>
          <p class="entry-meta">Tags: ${highlightText(tagsText, query, tagsTone)}</p>
          ${entry.notes ? `<p class="entry-notes compact">${escapeHtml(entry.notes)}</p>` : ""}
        </div>
      </div>
      <div class="entry-actions entry-actions-compact">
        <select class="move-select" data-action="move" data-id="${entry.id}" aria-label="Move ${escapeHtml(entry.title)} to group">
          <option value="begun" ${statusBucket(entry.status) === "begun" ? "selected" : ""}>Move: Begun</option>
          <option value="completed" ${statusBucket(entry.status) === "completed" ? "selected" : ""}>Move: Completed</option>
          <option value="potential" ${statusBucket(entry.status) === "potential" ? "selected" : ""}>Move: Potential</option>
        </select>
        <button type="button" class="secondary" data-action="toggle" data-id="${entry.id}">${state.expandedEntryIds.has(entry.id) ? "Collapse" : "Expand"}</button>
        <button type="button" data-action="edit" data-id="${entry.id}">Edit</button>
        <button type="button" class="secondary" data-action="refresh" data-id="${entry.id}">Refresh</button>
        <button type="button" class="secondary" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </article>
  `;
}

function statusBucket(status) {
  if (status === "reading") return "begun";
  if (status === "completed") return "completed";
  return "potential";
}

function moveEntryToBucket(id, bucket) {
  moveEntryToBucketAtPosition(id, bucket, null);
}

function moveEntryToBucketAtPosition(id, bucket, beforeId) {
  const index = state.entries.findIndex((item) => item.id === id);
  if (index < 0) return;

  const entry = { ...state.entries[index] };
  const sourceBucket = statusBucket(entry.status);
  entry.status = statusForBucket(bucket, entry.status);
  entry.updatedAt = new Date().toISOString();

  state.entries[index] = normalizeEntry(entry);
  normalizeManualOrderForBucket(sourceBucket);
  placeEntryInBucketOrder(id, bucket, beforeId);

  elements.sortBy.value = "manual";
  saveEntries();
  void maybeAutoCloudPush();
  render();
}

function statusForBucket(bucket, previousStatus) {
  if (bucket === "begun") return "reading";
  if (bucket === "completed") return "completed";
  return previousStatus === "on-hold" ? "on-hold" : "planned";
}

function onEntryDragStart(event) {
  const card = event.currentTarget;
  const id = card.getAttribute("data-entry-id");
  if (!id) return;

  state.draggingEntryId = id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
  card.classList.add("dragging");
}

function onEntryDragEnd(event) {
  state.draggingEntryId = null;
  event.currentTarget.classList.remove("dragging");
  elements.entries.querySelectorAll(".entry-group-list.drop-active").forEach((lane) => {
    lane.classList.remove("drop-active");
  });
}

function onLaneDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function onLaneDrop(event) {
  event.preventDefault();
  const lane = event.currentTarget;
  const targetBucket = lane.getAttribute("data-bucket");
  const draggedId = event.dataTransfer.getData("text/plain") || state.draggingEntryId;
  const targetCard = event.target.closest("article[data-entry-id]");
  lane.classList.remove("drop-active");
  if (!draggedId || !targetBucket) return;

  let beforeId = null;
  if (targetCard && lane.contains(targetCard)) {
    beforeId = targetCard.getAttribute("data-entry-id");
    const rect = targetCard.getBoundingClientRect();
    const droppingAfter = event.clientY > rect.top + rect.height / 2;
    if (droppingAfter) {
      const nextSibling = targetCard.nextElementSibling?.closest("article[data-entry-id]");
      beforeId = nextSibling ? nextSibling.getAttribute("data-entry-id") : null;
    }
  }

  moveEntryToBucketAtPosition(draggedId, targetBucket, beforeId);
}

function onLaneDragEnter(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drop-active");
}

function onLaneDragLeave(event) {
  const lane = event.currentTarget;
  if (!lane.contains(event.relatedTarget)) {
    lane.classList.remove("drop-active");
  }
}

function toggleExpanded(id) {
  if (!state.compactMode) return;
  if (state.expandedEntryIds.has(id)) state.expandedEntryIds.delete(id);
  else state.expandedEntryIds.add(id);
  render();
}

function onToggleCompactMode() {
  state.compactMode = elements.compactMode.checked;
  state.expandedEntryIds.clear();
  saveUiSettings();
  render();
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  elements.id.value = entry.id;
  elements.title.value = entry.title || "";
  elements.translatedTitle.value = entry.translatedTitle || "";
  elements.urlImport.value = entry.sourceUrl || "";
  elements.series.value = entry.series || "";
  elements.genres.value = (entry.genres || []).join(", ");
  elements.tags.value = (entry.tags || []).join(", ");
  elements.volume.value = entry.volume ?? "";
  elements.chapter.value = entry.chapter ?? "";
  elements.latestChapter.value = entry.latestChapter ?? "";
  elements.latestChapterDate.value = entry.latestChapterDate || "";
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
  void maybeAutoCloudPush();
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
      ensureManualOrder(state.entries);
      saveEntries();
      void maybeAutoCloudPush();
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
  if (sortBy === "manual") return sortNumberAsc(a.manualOrder, b.manualOrder);
  if (sortBy === "title-asc") return sortText(a.title, b.title);
  if (sortBy === "rating-desc") return sortNumberDesc(a.rating, b.rating);
  if (sortBy === "volume-desc") return sortNumberDesc(a.volume, b.volume);
  if (sortBy === "chapter-desc") return sortNumberDesc(a.chapter, b.chapter);

  return sortText(b.updatedAt || "", a.updatedAt || "");
}

function sortNumberDesc(left, right) {
  return (right ?? -1) - (left ?? -1);
}

function sortNumberAsc(left, right) {
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
}

function sortText(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function normalizeEntry(raw) {
  return {
    id: raw.id || createId(),
    title: String(raw.title || ""),
    translatedTitle: String(raw.translatedTitle || ""),
    sourceUrl: String(raw.sourceUrl || ""),
    series: String(raw.series || ""),
    genres: normalizeStringArray(raw.genres),
    tags: normalizeStringArray(raw.tags),
    volume: normalizeNumber(raw.volume),
    chapter: normalizeNumber(raw.chapter),
    latestChapter: normalizeNumber(raw.latestChapter),
    latestChapterDate: raw.latestChapterDate || null,
    status: String(raw.status || "planned"),
    rating: normalizeNumber(raw.rating),
    notes: String(raw.notes || ""),
    coverDataUrl: typeof raw.coverDataUrl === "string" ? raw.coverDataUrl : null,
    manualOrder: normalizeNumber(raw.manualOrder),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function ensureManualOrder(entries) {
  const buckets = ["begun", "completed", "potential"];
  for (const bucket of buckets) {
    const lane = entries
      .filter((item) => statusBucket(item.status) === bucket)
      .sort((a, b) => sortNumberAsc(a.manualOrder, b.manualOrder));
    lane.forEach((item, i) => {
      item.manualOrder = i + 1;
    });
  }
}

function getNextManualOrderForBucket(bucket) {
  const lane = state.entries.filter((item) => statusBucket(item.status) === bucket);
  const currentMax = lane.reduce((max, item) => Math.max(max, item.manualOrder ?? 0), 0);
  return currentMax + 1;
}

function normalizeManualOrderForBucket(bucket) {
  const lane = state.entries
    .filter((item) => statusBucket(item.status) === bucket)
    .sort((a, b) => sortNumberAsc(a.manualOrder, b.manualOrder));

  lane.forEach((item, i) => {
    item.manualOrder = i + 1;
  });
}

function placeEntryInBucketOrder(entryId, bucket, beforeId) {
  const lane = state.entries
    .filter((item) => statusBucket(item.status) === bucket)
    .sort((a, b) => sortNumberAsc(a.manualOrder, b.manualOrder));

  const withoutDragged = lane.filter((item) => item.id !== entryId);
  const dragged = lane.find((item) => item.id === entryId);
  if (!dragged) return;

  let insertIndex = withoutDragged.length;
  if (beforeId) {
    const idx = withoutDragged.findIndex((item) => item.id === beforeId);
    if (idx >= 0) insertIndex = idx;
  }

  withoutDragged.splice(insertIndex, 0, dragged);
  withoutDragged.forEach((item, i) => {
    item.manualOrder = i + 1;
  });
}

async function refreshEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  if (!entry.sourceUrl) {
    alert("No source URL saved for this entry. Edit it, paste a supported URL, then save.");
    return;
  }

  try {
    const meta = await fetchMetaFromUrl(entry.sourceUrl);
    const estimate = await fetchLatestChapterEstimate(entry.title, entry.translatedTitle);
    const index = state.entries.findIndex((item) => item.id === id);
    if (index < 0) return;

    const next = { ...state.entries[index] };
    const candidates = [meta.latestChapter, estimate?.latestChapter].filter((value) => value != null);
    if (candidates.length) next.latestChapter = Math.max(...candidates);
    next.latestChapterDate = pickNewestDate(meta.latestChapterDate, estimate?.latestChapterDate, next.latestChapterDate);
    if (meta.status) next.status = meta.status;
    if (meta.genres?.length) next.genres = meta.genres;
    if (meta.tags?.length) next.tags = meta.tags;
    if (meta.coverUrl) next.coverDataUrl = meta.coverUrl;
    next.updatedAt = new Date().toISOString();

    state.entries[index] = normalizeEntry(next);
    saveEntries();
    render();
    void maybeAutoCloudPush();
    alert(`Updated latest chapter for ${next.title}.`);
  } catch (error) {
    alert(`Could not refresh this entry: ${error.message}`);
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
}

function loadCloudSettings() {
  try {
    const raw = localStorage.getItem(CLOUD_STORAGE_KEY);
    if (!raw) return { token: "", gistId: "", autoSync: false };
    const parsed = JSON.parse(raw);
    return {
      token: String(parsed.token || ""),
      gistId: String(parsed.gistId || ""),
      autoSync: Boolean(parsed.autoSync),
    };
  } catch {
    return { token: "", gistId: "", autoSync: false };
  }
}

function loadUiSettings() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { compactMode: true };
    const parsed = JSON.parse(raw);
    return { compactMode: parsed.compactMode !== false };
  } catch {
    return { compactMode: true };
  }
}

function saveUiSettings() {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ compactMode: state.compactMode }));
}

function saveCloudSettings() {
  localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(state.cloud));
}

function initCloudUi() {
  elements.cloudToken.value = state.cloud.token;
  elements.cloudGistId.value = state.cloud.gistId;
  elements.cloudAutoSync.checked = state.cloud.autoSync;

  if (state.cloud.token && state.cloud.gistId) {
    setCloudStatus("idle", `Connected to gist ${state.cloud.gistId.slice(0, 8)}...`);
  } else {
    setCloudStatus("idle", "Cloud sync is not configured.");
  }
}

function setCloudStatus(type, message) {
  const el = elements.cloudStatus;
  el.className = "cloud-status";
  el.classList.add(`cloud-${type}`);
  el.textContent = message || "";
}

function withCloudLock(action) {
  if (state.cloudBusy) {
    setCloudStatus("loading", "Cloud sync already running...");
    return;
  }

  state.cloudBusy = true;
  elements.cloudSave.disabled = true;
  elements.cloudPush.disabled = true;
  elements.cloudPull.disabled = true;

  Promise.resolve(action())
    .catch((error) => {
      setCloudStatus("error", `Cloud sync failed: ${error.message}`);
    })
    .finally(() => {
      state.cloudBusy = false;
      elements.cloudSave.disabled = false;
      elements.cloudPush.disabled = false;
      elements.cloudPull.disabled = false;
    });
}

function readCloudFormSettings() {
  return {
    token: elements.cloudToken.value.trim(),
    gistId: elements.cloudGistId.value.trim(),
    autoSync: elements.cloudAutoSync.checked,
  };
}

async function onCloudSaveSettings() {
  withCloudLock(async () => {
    const next = readCloudFormSettings();
    if (!next.token) {
      state.cloud = { token: "", gistId: "", autoSync: next.autoSync };
      saveCloudSettings();
      setCloudStatus("idle", "Cloud settings cleared.");
      return;
    }

    setCloudStatus("loading", "Connecting to GitHub...");
    const gistId = await ensureCloudGist(next.token, next.gistId);
    state.cloud = { token: next.token, gistId, autoSync: next.autoSync };
    saveCloudSettings();
    elements.cloudGistId.value = gistId;
    setCloudStatus("success", "Cloud connected. You can now push/pull your library.");
  });
}

async function onCloudPush() {
  withCloudLock(async () => {
    try {
      await pushEntriesToCloud();
      setCloudStatus("success", `Uploaded ${state.entries.length} entries to cloud.`);
    } catch (error) {
      setCloudStatus("error", `Push failed: ${error.message}`);
    }
  });
}

async function onCloudPull() {
  withCloudLock(async () => {
    try {
      const cloudEntries = await pullEntriesFromCloud();
      state.entries = cloudEntries;
      ensureManualOrder(state.entries);
      saveEntries();
      render();
      clearForm();
      setCloudStatus("success", `Downloaded ${state.entries.length} entries from cloud.`);
    } catch (error) {
      setCloudStatus("error", `Pull failed: ${error.message}`);
    }
  });
}

async function maybeAutoCloudPush() {
  if (!state.cloud.autoSync || !state.cloud.token || !state.cloud.gistId) return;
  if (state.cloudBusy) return;

  try {
    await pushEntriesToCloud();
    setCloudStatus("success", `Auto-synced ${state.entries.length} entries.`);
  } catch (error) {
    setCloudStatus("error", `Auto-sync failed: ${error.message}`);
  }
}

async function ensureCloudGist(token, gistId) {
  if (gistId) {
    await githubApiRequest(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, token, {
      method: "GET",
    });
    return gistId;
  }

  const payload = {
    description: "Manga Archive cloud backup",
    public: false,
    files: {
      [CLOUD_FILE_NAME]: {
        content: JSON.stringify(state.entries, null, 2),
      },
    },
  };

  const created = await githubApiRequest("https://api.github.com/gists", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!created.id) throw new Error("Could not create gist.");
  return created.id;
}

async function pushEntriesToCloud() {
  if (!state.cloud.token) throw new Error("Missing GitHub token.");
  const gistId = await ensureCloudGist(state.cloud.token, state.cloud.gistId);
  if (gistId !== state.cloud.gistId) {
    state.cloud.gistId = gistId;
    saveCloudSettings();
    elements.cloudGistId.value = gistId;
  }

  const payload = {
    files: {
      [CLOUD_FILE_NAME]: {
        content: JSON.stringify(state.entries, null, 2),
      },
    },
  };

  await githubApiRequest(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, state.cloud.token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function pullEntriesFromCloud() {
  if (!state.cloud.token || !state.cloud.gistId) {
    throw new Error("Set token and gist ID first.");
  }

  const gist = await githubApiRequest(
    `https://api.github.com/gists/${encodeURIComponent(state.cloud.gistId)}`,
    state.cloud.token,
    { method: "GET" },
  );

  const files = gist.files || {};
  const file = files[CLOUD_FILE_NAME] || Object.values(files)[0];
  if (!file) throw new Error("No data file found in gist.");

  let content = file.content || "";
  if (!content && file.raw_url) {
    const rawRes = await fetch(file.raw_url, {
      headers: {
        Authorization: `Bearer ${state.cloud.token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!rawRes.ok) throw new Error(`Cloud read failed (${rawRes.status}).`);
    content = await rawRes.text();
  }

  const parsed = JSON.parse(content || "[]");
  if (!Array.isArray(parsed)) throw new Error("Cloud data is not an array.");
  return parsed
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeEntry(item));
}

async function githubApiRequest(url, token, options) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${response.status}${details ? `: ${details.slice(0, 120)}` : ""}`);
  }

  if (response.status === 204) return {};
  return response.json();
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

  setFetchStatus("loading", "Fetching details…");

  try {
    const meta = await fetchMetaFromUrl(raw);

    fillFormFromMeta(meta);
    setFetchStatus("success", `Auto-filled from ${meta.source}!`);
    setTimeout(() => setFetchStatus("hidden"), 3500);
  } catch {
    setFetchStatus("error", "Fetch failed. The API may be temporarily unavailable — try again.");
  }
}

async function fetchMetaFromUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Not a valid URL.");
  }

  // Only allow known hosts — never fetch the user-supplied URL directly.
  const host = parsed.hostname.replace(/^www\./, "");
  const isManhuafast = host.endsWith("manhuafast.net");
  const allowed = ["mangadex.org", "anilist.co", "myanimelist.net"];
  if (!allowed.includes(host) && !isManhuafast) {
    throw new Error("Unsupported site. Use MangaDex, AniList, MyAnimeList, or ManhuaFast URL.");
  }

  const mdMatch = URL_PATTERNS.mangadex.exec(raw);
  const alMatch = URL_PATTERNS.anilist.exec(raw);
  const malMatch = URL_PATTERNS.mal.exec(raw);
  const mhMatch = URL_PATTERNS.manhuafast.exec(raw);

  let meta;
  if (mdMatch) meta = await fetchMangaDex(mdMatch[1]);
  else if (alMatch) meta = await fetchAniList(Number(alMatch[1]));
  else if (malMatch) meta = await fetchJikan(Number(malMatch[1]));
  else if (mhMatch) meta = await fetchManhuafast(parsed);
  else throw new Error("Could not find a recognised ID in that URL.");

  const chapterFromUrl = extractChapterFromUrl(parsed);
  if (chapterFromUrl != null && meta.chapter == null) {
    meta.chapter = chapterFromUrl;
  }

  const estimate = await fetchLatestChapterEstimate(meta.title, meta.translatedTitle);
  const chapterCandidates = [meta.latestChapter, estimate?.latestChapter].filter((value) => value != null);
  if (chapterCandidates.length) {
    meta.latestChapter = Math.max(...chapterCandidates);
  }
  meta.latestChapterDate = pickNewestDate(meta.latestChapterDate, estimate?.latestChapterDate);

  return meta;
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
  const translatedTitle = pickAlternateTitle(title, [
    ...Object.values(attr.title || {}),
    ...(attr.altTitles || []).flatMap((item) => Object.values(item || {})),
  ]);
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

  // Fetch latest chapter date
  let latestChapterDate = null;
  try {
    const chaptersRes = await fetch(
      `https://api.mangadex.org/manga/${encodeURIComponent(uuid)}/feed?limit=1&order[publishAt]=desc`,
      { headers: { Accept: "application/json" } },
    );
    if (chaptersRes.ok) {
      const chaptersJson = await chaptersRes.json();
      const latestChapter = chaptersJson.data?.[0];
      if (latestChapter?.attributes?.publishAt) {
        const dateStr = latestChapter.attributes.publishAt;
        latestChapterDate = dateStr.split("T")[0]; // Extract YYYY-MM-DD
      }
    }
  } catch {
    // Silently fail if chapter fetch doesn't work
  }

  return {
    source: "MangaDex",
    title,
    translatedTitle,
    genres,
    tags,
    status: { ongoing: "reading", completed: "completed", hiatus: "on-hold", cancelled: "on-hold" }[attr.status] ?? "planned",
    coverUrl,
    latestChapterDate,
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
        nextAiringEpisode {
          media { title { romaji } }
          airingAt
        }
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

  let latestChapterDate = null;
  if (media.nextAiringEpisode?.airingAt) {
    const timestamp = media.nextAiringEpisode.airingAt * 1000;
    latestChapterDate = new Date(timestamp).toISOString().split("T")[0];
  }

  return {
    source: "AniList",
    title: media.title?.english || media.title?.romaji || "",
    translatedTitle: media.title?.romaji && media.title?.english && media.title.romaji !== media.title.english
      ? media.title.romaji
      : "",
    genres: (media.genres || []).map((g) => g.toLowerCase()),
    tags: [],
    status: statusMap[media.status] ?? "planned",
    latestChapter: normalizeNumber(media.chapters),
    coverUrl: media.coverImage?.large || null,
    latestChapterDate,
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

  let latestChapterDate = null;
  if (data.published?.from) {
    latestChapterDate = data.published.from.split("T")[0];
  }

  return {
    source: "MyAnimeList",
    title: data.title_english || data.title || "",
    translatedTitle: data.title_english && data.title && data.title_english !== data.title ? data.title : "",
    genres,
    tags,
    status,
    latestChapter: normalizeNumber(data.chapters),
    coverUrl: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || null,
    latestChapterDate,
  };
}

function fetchManhuafast(parsedUrl) {
  const containerMarkers = new Set(["manga", "manhua", "manhwa", "comic", "series", "read"]);
  const rawSegments = parsedUrl.pathname
    .split("/")
    .map((part) => decodeURIComponent(part).trim().toLowerCase())
    .filter(Boolean);

  let slug = "";

  // Prefer the segment immediately after container markers like /manga/{series-slug}/...
  for (let i = 0; i < rawSegments.length - 1; i += 1) {
    if (!containerMarkers.has(rawSegments[i])) continue;
    const next = rawSegments[i + 1];
    if (next && !containerMarkers.has(next) && !isChapterLikeSegment(next)) {
      slug = next;
      break;
    }
  }

  // Fallback: choose the longest non-chapter segment that is not a container marker.
  if (!slug) {
    const candidates = rawSegments.filter(
      (part) => !containerMarkers.has(part) && !isChapterLikeSegment(part),
    );
    slug = candidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  const title = slugToTitle(slug) || "Unknown title";

  return fetchManhuafastEnriched(title, parsedUrl);
}

function isChapterLikeSegment(part) {
  if (!part) return false;
  return /^(ch|chapter|ep|episode)[-_ ]?\d+(?:\.\d+)?$/i.test(part)
    || /^\d+(?:\.\d+)?$/.test(part);
}

async function fetchManhuafastEnriched(title, parsedUrl) {
  const pageCoverUrl = await fetchManhuafastCover(parsedUrl);
  const enriched = await fetchAniListBySearch(title);
  const jikanFallback = enriched?.coverUrl ? null : await fetchJikanBySearch(title);
  const trustedEnriched = enriched && namesLikelySameSeries(title, enriched.title, enriched.translatedTitle)
    ? enriched
    : null;
  const trustedJikan = jikanFallback && namesLikelySameSeries(title, jikanFallback.title)
    ? jikanFallback
    : null;

  const normalizedBase = normalizeForComparison(title);
  const normalizedEnrichedTitle = normalizeForComparison(trustedEnriched?.title || "");

  // Keep the URL-derived title as primary unless AniList found effectively the same name.
  const primaryTitle =
    trustedEnriched?.title && normalizedEnrichedTitle === normalizedBase
      ? trustedEnriched.title
      : title;

  const alternateTitle = pickAlternateTitle(primaryTitle, [
    trustedEnriched?.title,
    trustedEnriched?.translatedTitle,
  ]);

  const meta = trustedEnriched || trustedJikan;

  return {
    source: trustedEnriched
      ? "ManhuaFast + AniList"
      : (trustedJikan ? "ManhuaFast + MyAnimeList" : "ManhuaFast"),
    title: primaryTitle,
    translatedTitle: alternateTitle,
    genres: meta?.genres || [],
    tags: ["manhuafast", ...(trustedEnriched?.tags || [])],
    status: meta?.status || "planned",
    latestChapter: meta?.latestChapter ?? null,
    coverUrl: pageCoverUrl || meta?.coverUrl || null,
    latestChapterDate: meta?.latestChapterDate || null,
  };
}

async function fetchManhuafastCover(parsedUrl) {
  if (!parsedUrl) return null;

  const candidates = new Set();
  candidates.add(parsedUrl.toString());

  const chapterPath = parsedUrl.pathname.replace(/\/?(chapter|ch|episode|ep)[-_ ]?\d+(?:\.\d+)?\/?$/i, "/");
  if (chapterPath !== parsedUrl.pathname) {
    candidates.add(new URL(chapterPath, parsedUrl.origin).toString());
  }

  for (const pageUrl of candidates) {
    const ogImage = await fetchOpenGraphImageFromUrl(pageUrl);
    if (ogImage) return ogImage;
  }

  return null;
}

async function fetchOpenGraphImageFromUrl(pageUrl) {
  const mirrors = [
    pageUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
  ];

  for (const url of mirrors) {
    try {
      const res = await fetch(url, { headers: { Accept: "text/html" } });
      if (!res.ok) continue;
      const html = await res.text();
      const image = extractMetaImageFromHtml(html, pageUrl);
      if (image) return image;
    } catch {
      // Try next mirror.
    }
  }

  return null;
}

function extractMetaImageFromHtml(html, baseUrl) {
  if (!html) return null;

  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match?.[1]?.trim();
    if (!value) continue;
    try {
      const absolute = new URL(value, baseUrl).toString();
      if (/^https?:\/\//i.test(absolute)) return absolute;
    } catch {
      // Continue scanning patterns.
    }
  }

  return null;
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
        nextAiringEpisode {
          media { title { romaji } }
          airingAt
        }
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

    let latestChapterDate = null;
    if (media.nextAiringEpisode?.airingAt) {
      const timestamp = media.nextAiringEpisode.airingAt * 1000;
      latestChapterDate = new Date(timestamp).toISOString().split("T")[0];
    }

    return {
      title: media.title?.english || media.title?.romaji || title,
      translatedTitle: media.title?.romaji && media.title?.english && media.title.romaji !== media.title.english
        ? media.title.romaji
        : "",
      genres: (media.genres || []).map((item) => item.toLowerCase()),
      tags: [],
      status: statusMap[media.status] ?? "planned",
      latestChapter: normalizeNumber(media.chapters),
      coverUrl: media.coverImage?.large || null,
      latestChapterDate,
    };
  } catch {
    return null;
  }
}

async function fetchJikanBySearch(title) {
  const query = encodeURIComponent(title || "");
  if (!query) return null;

  try {
    const res = await fetch(`https://api.jikan.moe/v4/manga?q=${query}&limit=5`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const items = Array.isArray(json.data) ? json.data : [];
    if (!items.length) return null;

    const normalizedNeedle = normalizeForComparison(title);
    const ranked = items
      .map((item) => {
        const t1 = normalizeForComparison(item.title || "");
        const t2 = normalizeForComparison(item.title_english || "");
        const t3 = normalizeForComparison(item.title_japanese || "");
        const isExact = normalizedNeedle && [t1, t2, t3].includes(normalizedNeedle);
        return {
          item,
          score: isExact ? 2 : 1,
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.item;
    if (!best) return null;

    return {
      title: best.title_english || best.title || title,
      latestChapter: normalizeNumber(best.chapters),
      latestChapterDate: (best.published?.from || "").split("T")[0] || null,
      coverUrl: best.images?.jpg?.large_image_url || best.images?.jpg?.image_url || null,
      genres: (best.genres || []).map((item) => String(item.name || "").toLowerCase()).filter(Boolean),
      status: String(best.status || "").includes("Publishing")
        ? "reading"
        : String(best.status || "").includes("Finished")
          ? "completed"
          : (String(best.status || "").includes("Hiatus") || String(best.status || "").includes("Discontinued"))
            ? "on-hold"
            : "planned",
      source: "Jikan search",
    };
  } catch {
    return null;
  }
}

function namesLikelySameSeries(baseTitle, ...candidateTitles) {
  const base = normalizeForMerge(baseTitle || "");
  if (!base) return false;
  const baseCompact = base.replace(/\s+/g, "");

  return candidateTitles.some((value) => {
    const candidate = normalizeForMerge(value || "");
    if (!candidate) return false;
    if (candidate === base) return true;

    const candidateCompact = candidate.replace(/\s+/g, "");
    return candidateCompact === baseCompact;
  });
}

async function fetchLatestChapterEstimate(title, translatedTitle) {
  const searchTitle = title || translatedTitle || "";
  if (!searchTitle) return null;

  const [aniResult, jikanResult] = await Promise.allSettled([
    fetchAniListBySearch(searchTitle),
    fetchJikanBySearch(searchTitle),
  ]);

  const candidates = [
    aniResult.status === "fulfilled" ? aniResult.value : null,
    jikanResult.status === "fulfilled" ? jikanResult.value : null,
  ].filter(Boolean);

  if (!candidates.length) return null;

  const chapters = candidates
    .map((item) => normalizeNumber(item.latestChapter))
    .filter((value) => value != null);

  return {
    latestChapter: chapters.length ? Math.max(...chapters) : null,
    latestChapterDate: pickNewestDate(...candidates.map((item) => item.latestChapterDate)),
    source: candidates.map((item) => item.source).filter(Boolean).join(" + "),
  };
}

function pickNewestDate(...dates) {
  const valid = dates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  if (!valid.length) return null;
  return valid.sort().at(-1) || null;
}

function fillFormFromMeta(meta) {
  if (meta.title) {
    elements.title.value = meta.title;
  }
  if (Object.prototype.hasOwnProperty.call(meta, "translatedTitle")) {
    elements.translatedTitle.value = meta.translatedTitle || "";
  }
  if (Array.isArray(meta.genres)) {
    elements.genres.value = meta.genres.join(", ");
  }
  if (Array.isArray(meta.tags)) {
    elements.tags.value = meta.tags.join(", ");
  }
  if (meta.status) {
    elements.status.value = meta.status;
  }
  if (Object.prototype.hasOwnProperty.call(meta, "latestChapter")) {
    elements.latestChapter.value = meta.latestChapter ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(meta, "latestChapterDate")) {
    elements.latestChapterDate.value = meta.latestChapterDate || "";
  }
  if (Object.prototype.hasOwnProperty.call(meta, "chapter")) {
    elements.chapter.value = meta.chapter ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(meta, "coverUrl")) {
    state.coverDataUrl = meta.coverUrl || "";
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(value, query, tone = "soft") {
  const text = String(value || "");
  const escapedText = escapeHtml(text);
  const rawQuery = String(query || "").trim();
  if (!rawQuery) return escapedText;

  const terms = rawQuery
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => escapeRegExp(term));

  if (!terms.length) return escapedText;

  const pattern = new RegExp(`(${terms.join("|")})`, "ig");
  const safeTone = ["strong", "medium", "soft"].includes(tone) ? tone : "soft";
  return escapedText.replace(pattern, `<mark class="entry-highlight entry-highlight-${safeTone}">$1</mark>`);
}

function getFieldMatchTone(value, query, fallbackTone = "soft") {
  const normalizedValue = normalizeForComparison(value || "");
  const normalizedQuery = normalizeForComparison(query || "");
  if (!normalizedValue || !normalizedQuery) return fallbackTone;

  const compactValue = normalizedValue.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");

  if (normalizedValue === normalizedQuery || (compactQuery && compactValue === compactQuery)) {
    return "strong";
  }
  if (normalizedValue.startsWith(normalizedQuery) || (compactQuery && compactValue.startsWith(compactQuery))) {
    return "medium";
  }
  if (normalizedValue.includes(normalizedQuery) || (compactQuery && compactValue.includes(compactQuery))) {
    return "soft";
  }

  return fallbackTone;
}

function safeExternalHref(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function openEntrySource(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  const href = safeExternalHref(entry.sourceUrl);
  if (!href) {
    alert("No valid source URL saved for this entry.");
    return;
  }

  window.open(href, "_blank", "noopener,noreferrer");
}

function pickAlternateTitle(primary, candidates) {
  const normalizedPrimary = String(primary || "").trim().toLowerCase();
  for (const item of candidates || []) {
    const value = String(item || "").trim();
    if (!value) continue;
    if (value.toLowerCase() === normalizedPrimary) continue;
    return value;
  }
  return "";
}

function normalizeForComparison(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special chars
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

function buildEntrySearchText(entry) {
  return normalizeForComparison([
    entry.title,
    entry.translatedTitle,
    entry.series,
    ...(entry.genres || []),
    ...(entry.tags || []),
  ].filter(Boolean).join(" "));
}

function matchesEntrySearch(entry, query) {
  if (!query) return true;

  const normalizedQuery = normalizeForComparison(query);
  if (!normalizedQuery) return true;

  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  const haystack = buildEntrySearchText(entry);
  const haystackCompact = haystack.replace(/\s+/g, "");

  if (haystack.includes(normalizedQuery)) return true;
  if (queryCompact && haystackCompact.includes(queryCompact)) return true;

  const parts = normalizedQuery.split(" ").filter(Boolean);
  return parts.every((part) => haystack.includes(part) || haystackCompact.includes(part));
}

function getEntrySearchScore(entry, query) {
  const normalizedQuery = normalizeForComparison(query);
  if (!normalizedQuery) return 0;

  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  const parts = normalizedQuery.split(" ").filter(Boolean);

  const title = normalizeForComparison(entry.title || "");
  const translated = normalizeForComparison(entry.translatedTitle || "");
  const series = normalizeForComparison(entry.series || "");
  const genres = normalizeForComparison((entry.genres || []).join(" "));
  const tags = normalizeForComparison((entry.tags || []).join(" "));

  const titleCompact = title.replace(/\s+/g, "");
  const translatedCompact = translated.replace(/\s+/g, "");
  const seriesCompact = series.replace(/\s+/g, "");

  let score = 0;

  if (title === normalizedQuery) score = Math.max(score, 1200);
  else if (title.startsWith(normalizedQuery)) score = Math.max(score, 1000);
  else if (title.includes(normalizedQuery)) score = Math.max(score, 860);
  else if (queryCompact && titleCompact.includes(queryCompact)) score = Math.max(score, 820);

  if (translated === normalizedQuery) score = Math.max(score, 800);
  else if (translated.startsWith(normalizedQuery)) score = Math.max(score, 740);
  else if (translated.includes(normalizedQuery) || (queryCompact && translatedCompact.includes(queryCompact))) {
    score = Math.max(score, 680);
  }

  if (series === normalizedQuery) score = Math.max(score, 640);
  else if (series.startsWith(normalizedQuery)) score = Math.max(score, 600);
  else if (series.includes(normalizedQuery) || (queryCompact && seriesCompact.includes(queryCompact))) {
    score = Math.max(score, 560);
  }

  if (genres.includes(normalizedQuery)) score = Math.max(score, 420);
  if (tags.includes(normalizedQuery)) score = Math.max(score, 420);

  if (parts.length > 1) {
    const searchable = [title, translated, series, genres, tags].join(" ");
    const matchedParts = parts.filter((part) => searchable.includes(part)).length;
    score += matchedParts * 12;
  }

  return score;
}

function normalizeForMerge(text) {
  if (!text) return "";
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMergeTitleKeys(title, translatedTitle) {
  const keys = new Set();
  const values = [title, translatedTitle].filter(Boolean);

  for (const value of values) {
    const normalized = normalizeForMerge(value);
    if (!normalized) continue;
    keys.add(normalized);

    const compact = normalized.replace(/\s+/g, "");
    if (compact.length >= 4) keys.add(compact);
  }

  return keys;
}

function findSimilarEntry(title, translatedTitle, currentId = null) {
  if (!title) return null;

  const incomingKeys = buildMergeTitleKeys(title, translatedTitle);
  if (!incomingKeys.size) return null;

  let bestMatch = null;
  let bestUpdatedAt = -1;

  for (const entry of state.entries) {
    if (currentId && entry.id === currentId) continue; // Skip self

    const existingKeys = buildMergeTitleKeys(entry.title, entry.translatedTitle);
    const hasMatch = Array.from(incomingKeys).some((key) => existingKeys.has(key));
    if (!hasMatch) continue;

    const updatedAtTs = Date.parse(entry.updatedAt || "") || 0;
    if (updatedAtTs > bestUpdatedAt) {
      bestUpdatedAt = updatedAtTs;
      bestMatch = entry;
    }
  }

  return bestMatch;
}
