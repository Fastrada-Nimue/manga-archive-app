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
  status: document.getElementById("status"),
  rating: document.getElementById("rating"),
  notes: document.getElementById("notes"),
  coverFile: document.getElementById("cover-file"),
  coverPreview: document.getElementById("cover-preview"),
  removeCover: document.getElementById("remove-cover"),
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
elements.search.addEventListener("input", render);
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
              ${escapeHtml(entry.series || "No series")} | Vol ${entry.volume ?? "-"} | Ch ${entry.chapter ?? "-"} | ${escapeHtml(entry.status)} | Rating: ${entry.rating ?? "-"}
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
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Silent fail for environments where SW is blocked.
    });
  });
}

function createId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
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
