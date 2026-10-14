const App = (() => {
  const state = {
    items: [],
    view: "home",
    searchCategory: "Película",
    searchQuery: "",
    searchResults: [],
    searchWarnings: [],
    hasSearched: false,
    searching: false,
    filters: {
      libraryCategory: "all",
      libraryYear: "all",
      librarySearch: "",
      pendingCategory: "all",
      pendingSearch: "",
      wishlistCategory: "all",
      wishlistSearch: "",
      statsYear: "all"
    },
    pagination: {
      libraryPage: 1
    },
    saving: false,
    formDirty: false,
    chart: null
  };

  const views = {
    home: "Inicio",
    library: "Biblioteca",
    pending: "Pendientes",
    wishlist: "Lista de deseos",
    stats: "Estadísticas"
  };

  const statusLabels = {
    wishlist: "Lista de deseos",
    pending: "Pendiente",
    active: "Actualmente",
    finished: "Terminado"
  };

  const categories = ["Película", "Libro", "Videojuego", "Cómic", "Manga"];
  const libraryPageSize = 50;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  function refreshIcons() {
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function askConfirmation(title, message, action = "Eliminar") {
    const dialog = $("#confirm-dialog");
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-action").textContent = action;
    dialog.returnValue = "cancel";
    dialog.showModal();
    return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
  }

  async function requestClose() {
    if (state.saving) return;
    if ($("#item-dialog").open && state.formDirty) {
      if (!await askConfirmation("¿Descartar cambios?", "Los cambios de este formulario aún no se han guardado.", "Descartar")) return;
    }
    state.formDirty = false;
    closeModals();
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No se pudo completar la operación.");
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function loadItems() {
    state.items = await api("/api/items");
  }

  function switchView(view) {
    state.view = view;
    $$(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
      if (button.dataset.view === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    render();
  }

  function formatDate(date) {
    if (!date) return "";
    const timestamp = parseDateValue(date);
    if (timestamp === null) return date;
    return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(timestamp));
  }

  function normalizeSortText(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function titleSort(a, b) {
    return normalizeSortText(a.title).localeCompare(normalizeSortText(b.title), "es");
  }

  function dateParts(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

    let year;
    let month;
    let day;

    if (isoMatch) {
      [, year, month, day] = isoMatch;
    } else if (slashMatch) {
      [, day, month, year] = slashMatch;
    } else if (dashMatch) {
      [, day, month, year] = dashMatch;
    } else {
      return null;
    }

    return {
      year: Number(year),
      month: Number(month),
      day: Number(day)
    };
  }

  function parseDateValue(value) {
    const parts = dateParts(value);
    if (!parts) return null;

    const parsed = new Date(parts.year, parts.month - 1, parts.day);
    if (
      parsed.getFullYear() !== parts.year ||
      parsed.getMonth() !== parts.month - 1 ||
      parsed.getDate() !== parts.day
    ) {
      return null;
    }

    return parsed.getTime();
  }

  function dateYear(value) {
    const parts = dateParts(value);
    return parts?.year ? String(parts.year) : "";
  }

  function finishedDateTime(item) {
    return parseDateValue(item.finished_date);
  }

  function recentSortTime(item) {
    return finishedDateTime(item) ?? parseDateValue(item.created_at?.slice(0, 10)) ?? 0;
  }

  function librarySort(a, b) {
    const aTime = finishedDateTime(a);
    const bTime = finishedDateTime(b);
    if (aTime !== null && bTime !== null) return bTime - aTime;
    if (aTime !== null && bTime === null) return -1;
    if (aTime === null && bTime !== null) return 1;
    return 0;
  }

  function matchesTitleSearch(item, search) {
    const query = normalizeSortText(search);
    if (!query) return true;
    return normalizeSortText(item.title).includes(query);
  }

  function searchField(filterKey, placeholder = "Buscar por título...") {
    return `
      <label class="field search-filter">
        <span>Buscar</span>
        <input value="${escapeHtml(state.filters[filterKey])}" data-search-filter="${filterKey}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
      </label>
    `;
  }

  function imageHtml(item, className = "") {
    const title = escapeHtml(item.title || "Sin título");
    const fallback = `<span class="poster-fallback"><i data-lucide="image"></i>${title}</span>`;
    return `<div class="poster ${className}">${item.cover_url ? `<img src="${escapeHtml(item.cover_url)}" alt="Portada de ${title}" loading="lazy">` : ""}<span class="cover-placeholder" ${item.cover_url ? "hidden" : ""}>${fallback}</span></div>`;
  }

  function card(item) {
    return `
      <article class="card" role="button" tabindex="0" data-category="${escapeHtml(item.category)}" data-open-detail="${item.id}" aria-label="Ver ${escapeHtml(item.title)}">
        ${imageHtml(item)}
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="meta">
            <span class="badge">${escapeHtml(item.category)}</span>
            ${item.year ? `<span class="badge neutral">${item.year}</span>` : ""}
            ${item.personal_rating ? `<span class="badge neutral">${"★".repeat(item.personal_rating)}</span>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function grid(items, emptyText = "No hay registros todavia.") {
    if (!items.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return `<div class="grid">${items.map(card).join("")}</div>`;
  }

  function recentItems() {
    return [...state.items]
      .filter((item) => item.status === "finished")
      .sort((a, b) => recentSortTime(b) - recentSortTime(a))
      .slice(0, 8);
  }

  function renderHome() {
    const current = state.items.filter((item) => item.status === "active");
    return `
      <section class="home-section"><div class="section-header">
        <h2>Actualmente</h2>
        <span class="badge neutral">${current.length} activos</span>
      </div>
      ${grid(current, "No hay registros activos. Usa + para agregar algo que estés consumiendo.")}
      </section>
      <section class="home-section"><div class="section-header">
        <h2>Recientes</h2>
        <span class="badge neutral">${state.items.filter((item) => item.status === "finished").length} terminados</span>
      </div>
      ${grid(recentItems(), "Agrega tu primer registro con el botón +.")}
      </section>
    `;
  }

  function finishedYearOptions(items) {
    const years = [
      ...new Set(items.map((item) => dateYear(item.finished_date)).filter(Boolean))
    ].sort((a, b) => Number(b) - Number(a));
    return `<option value="all">Todos los años</option>${years.map((year) => `<option value="${year}">${year}</option>`).join("")}`;
  }

  function renderLibrary() {
    const base = state.items.filter((item) => item.status === "finished");
    const filtered = base.filter((item) => {
      const byCategory = state.filters.libraryCategory === "all" || item.category === state.filters.libraryCategory;
      const byYear = state.filters.libraryYear === "all" || dateYear(item.finished_date) === state.filters.libraryYear;
      const bySearch = matchesTitleSearch(item, state.filters.librarySearch);
      return byCategory && byYear && bySearch;
    }).sort(librarySort);
    const totalPages = Math.max(1, Math.ceil(filtered.length / libraryPageSize));
    const currentPage = Math.min(state.pagination.libraryPage, totalPages);
    state.pagination.libraryPage = currentPage;
    const pageStart = (currentPage - 1) * libraryPageSize;
    const pageItems = filtered.slice(pageStart, pageStart + libraryPageSize);

    return `
      <section class="section-header">
        <span class="badge neutral">${filtered.length} registros</span>
      </section>
      <div class="filter-row panel">
        ${searchField("librarySearch")}
        <label class="field">
          <span>Categoría</span>
          <select data-filter="libraryCategory">${categoryOptions(state.filters.libraryCategory)}</select>
        </label>
        <label class="field">
          <span>Año</span>
          <select data-filter="libraryYear">${finishedYearOptions(base).replace(`value="${state.filters.libraryYear}"`, `value="${state.filters.libraryYear}" selected`)}</select>
        </label>
      </div>
      <br>
      ${grid(pageItems, "La biblioteca muestra solo registros terminados.")}
      ${renderLibraryPagination(currentPage, totalPages, filtered.length)}
    `;
  }

  function renderLibraryPagination(currentPage, totalPages, totalItems) {
    if (totalItems <= libraryPageSize) return "";
    return `
      <nav class="pagination" aria-label="Paginación de Biblioteca">
        <button class="button secondary" type="button" data-library-page="prev" ${currentPage <= 1 ? "disabled" : ""}>Página anterior</button>
        <span class="badge neutral">Página ${currentPage} de ${totalPages}</span>
        <button class="button secondary" type="button" data-library-page="next" ${currentPage >= totalPages ? "disabled" : ""}>Página siguiente</button>
      </nav>
    `;
  }

  function categoryOptions(current) {
    return `<option value="all" ${current === "all" ? "selected" : ""}>Todas</option>${categories
      .map((cat) => `<option value="${cat}" ${current === cat ? "selected" : ""}>${cat}</option>`)
      .join("")}`;
  }

  function renderStatusList(status, filterKey, emptyText) {
    const searchKey = status === "pending" ? "pendingSearch" : "wishlistSearch";
    const base = state.items.filter((item) => item.status === status);
    const filtered = base
      .filter((item) => state.filters[filterKey] === "all" || item.category === state.filters[filterKey])
      .filter((item) => matchesTitleSearch(item, state.filters[searchKey]))
      .sort(titleSort);
    return `
      <section class="section-header">
        <span class="badge neutral">${filtered.length} registros</span>
      </section>
      <div class="filter-row panel">
        ${searchField(searchKey)}
        <label class="field">
          <span>Categoría</span>
          <select data-filter="${filterKey}">${categoryOptions(state.filters[filterKey])}</select>
        </label>
      </div>
      <br>
      ${grid(filtered, emptyText)}
    `;
  }

  function statsItems() {
    return state.items
      .filter((item) => item.status === "finished")
      .filter((item) => state.filters.statsYear === "all" || dateYear(item.finished_date) === state.filters.statsYear);
  }

  function statsYearOptions() {
    const years = [
      ...new Set(
        state.items
          .filter((item) => item.status === "finished" && item.finished_date)
          .map((item) => dateYear(item.finished_date))
          .filter(Boolean)
      )
    ].sort((a, b) => Number(b) - Number(a));
    return `<option value="all" ${state.filters.statsYear === "all" ? "selected" : ""}>Todos los años</option>${years
      .map((year) => `<option value="${year}" ${state.filters.statsYear === year ? "selected" : ""}>${year}</option>`)
      .join("")}`;
  }

  function renderStats() {
    const items = statsItems();
    setTimeout(() => renderChart(items), 0);

    return `
      <section class="stats-options panel">
        <label class="field">
          <span>Año</span>
          <select data-filter="statsYear">${statsYearOptions()}</select>
        </label>
      </section>
      <br>
      <section class="stat-grid">
        ${categories.map((category, i) => `<div class="stat" data-category="${category}"><span class="muted">${["Películas", "Libros", "Videojuegos", "Cómics", "Manga"][i]}</span><strong>${items.filter((item) => item.category === category).length}</strong></div>`).join("")}
      </section>
      <section class="chart-wrap"><canvas id="stats-chart" aria-label="Estadísticas por categoría"></canvas></section>
    `;
  }

  function renderChart(items) {
    const canvas = $("#stats-chart");
    if (!canvas || !window.Chart) return;
    const counts = categories.map((cat) => items.filter((item) => item.category === cat).length);
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: categories,
        datasets: [
          {
            label: "Registros",
            data: counts,
            backgroundColor: ["#f5a146", "#59b566", "#529bd9", "#d1445e", "#ad5ec9"],
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function render() {
    const app = $("#app");
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    if (state.view === "home") app.innerHTML = renderHome();
    if (state.view === "library") app.innerHTML = renderLibrary();
    if (state.view === "pending") app.innerHTML = renderStatusList("pending", "pendingCategory", "No hay pendientes.");
    if (state.view === "wishlist") app.innerHTML = renderStatusList("wishlist", "wishlistCategory", "No hay registros en lista de deseos.");
    if (state.view === "stats") app.innerHTML = renderStats();
    refreshIcons();
  }

  function openModal(item = null) {
    const dialog = $("#item-dialog");
    const form = $("#item-form");
    form.reset();
    state.saving = false;
    state.formDirty = false;
    $("#save-item-btn").disabled = false;
    $("#save-item-btn").textContent = "Guardar";
    $("#modal-mode").textContent = item?.id ? "Editar registro" : "Tu colección";
    $("#modal-title").textContent = item?.id ? item.title : "Nuevo registro";

    const values = item || { category: "Película", status: "pending" };
    Object.entries(values).forEach(([key, value]) => {
      const input = form.elements[key];
      if (input && input.type !== "file") {
        const parts = input.type === "date" ? dateParts(value) : null;
        input.value = parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : value ?? "";
      }
    });
    if (values.cover_url?.startsWith("/uploads/")) form.elements.cover_url.value = "";
    dialog.showModal();
    $("#title").focus();
  }

  function openSearchModal() {
    const dialog = $("#search-dialog");
    $("#search-form").reset();
    $("#search-category").value = state.searchCategory;
    state.searchQuery = "";
    state.searchResults = [];
    state.searchWarnings = [];
    state.hasSearched = false;
    state.searching = false;
    renderSearchModalResults();
    dialog.showModal();
    setTimeout(() => $("#search-title")?.focus(), 50);
  }

  function renderSearchModalResults() {
    const container = $("#modal-search-results");
    if (!container) return;

    const warnings = state.searchWarnings
      .map((warning) => `<p class="notice">${escapeHtml(warning)}</p>`)
      .join("");

    if (state.searching) {
      container.innerHTML = `${warnings}<div class="empty">Buscando coincidencias...</div>`;
      return;
    }

    if (!state.hasSearched) {
      container.innerHTML = warnings;
      return;
    }

    if (!state.searchResults.length) {
      container.innerHTML = `
        ${warnings}
        <div class="empty">
          <div>
            <p>No encontré coincidencias para "${escapeHtml(state.searchQuery)}".</p>
            <br>
            <button class="button primary" type="button" data-open-manual>Agregar manualmente</button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      ${warnings}
      ${state.searchResults
        .map(
          (item, index) => `
          <div class="result-row">
            ${item.cover_url ? `<img src="${escapeHtml(item.cover_url)}" alt="">` : `<div class="poster"><span class="poster-fallback">${escapeHtml(item.category)}</span></div>`}
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p class="muted">${[item.year, item.creator, item.source].filter(Boolean).map(escapeHtml).join(" · ")}</p>
              ${item.description ? `<p class="result-description">${escapeHtml(item.description)}</p>` : ""}
            </div>
            <button class="button primary" type="button" data-use-result="${index}">Seleccionar</button>
          </div>
        `
        )
        .join("")}
    `;
  }

  async function submitSearch(event) {
    event.preventDefault();
    const query = $("#search-title").value.trim();
    const category = $("#search-category").value;
    state.searchQuery = query;
    state.searchCategory = category;
    state.searchResults = [];
    state.searchWarnings = [];
    state.hasSearched = true;

    if (query.length < 2) {
      state.searchWarnings = ["Escribe al menos dos caracteres para buscar."];
      renderSearchModalResults();
      return;
    }

    state.searching = true;
    $("#search-submit-btn").disabled = true;
    $("#search-submit-btn").textContent = "Buscando...";
    renderSearchModalResults();

    try {
      const result = await ApiServices.search(query, category);
      state.searchResults = result.items || [];
      state.searchWarnings = result.warnings || [];
      if (!state.searchResults.length && !state.searchWarnings.length) {
        state.searchWarnings = ["No hubo resultados en las fuentes configuradas."];
      }
    } catch (error) {
      console.error("[Registro multimedia] Error buscando contenido", error);
      state.searchWarnings = ["No se pudo completar la búsqueda. Revisa la consola del navegador."];
    } finally {
      state.searching = false;
      $("#search-submit-btn").disabled = false;
      $("#search-submit-btn").textContent = "Buscar";
      renderSearchModalResults();
    }
  }

  function openManualFromSearch() {
    const category = $("#search-category")?.value || state.searchCategory || "Película";
    const title = $("#search-title")?.value.trim() || "";
    closeModals();
    openModal({ title, category, status: "pending" });
  }

  function closeModals() {
    $$(".modal[open]").forEach((dialog) => dialog.close());
  }

  function formPayload(form, existingItem = null) {
    const data = new FormData(form);
    const coverText = String(data.get("cover_url") || "").trim();
    const existingCover = existingItem?.cover_url || "";
    const hasManualCover = existingCover.startsWith("/uploads/");
    return {
      title: data.get("title"),
      category: data.get("category"),
      status: data.get("status"),
      cover_url: hasManualCover ? existingCover : coverText || existingCover,
      year: data.get("year"),
      genres: data.get("genres"),
      source: data.get("source"),
      external_id: data.get("external_id"),
      personal_rating: data.get("personal_rating"),
      notes: data.get("notes"),
      finished_date: data.get("finished_date")
    };
  }

  async function uploadCoverIfNeeded(form, payload) {
    const file = form.elements.cover_file.files[0];
    if (!file) return payload;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("La portada debe ser jpg, jpeg, png o webp.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("La portada no puede pesar mas de 5 MB.");
    }
    const uploadData = new FormData();
    uploadData.append("cover", file);
    const uploaded = await api("/api/uploads/cover", { method: "POST", body: uploadData });
    return { ...payload, cover_url: uploaded.cover_url };
  }

  async function saveItem(event) {
    event.preventDefault();
    if (state.saving) return;
    const form = event.currentTarget;
    const id = form.elements.id.value;
    const title = form.elements.title.value.trim();
    if (!title) return toast("Escribe un título.");
    const existingItem = id ? state.items.find((item) => String(item.id) === String(id)) : null;

    state.saving = true;
    $("#save-item-btn").disabled = true;
    $("#save-item-btn").textContent = "Guardando...";
    try {
      const payload = await uploadCoverIfNeeded(form, formPayload(form, existingItem));
      if (id) await api(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/api/items", { method: "POST", body: JSON.stringify(payload) });
      await loadItems();
      closeModals();
      form.reset();
      render();
      toast(id ? "Registro actualizado." : "Registro guardado.");
    } catch (error) {
      toast(error.message);
    } finally {
      state.saving = false;
      $("#save-item-btn").disabled = false;
      $("#save-item-btn").textContent = "Guardar";
    }
  }

  function detailModal(item) {
    if (!item) return;
    const dialog = $("#detail-dialog");
    dialog.innerHTML = `
      <div class="modal-card" data-category="${escapeHtml(item.category)}">
        <div class="modal-header">
          <div>
            <p class="eyebrow">${escapeHtml(item.category)}</p>
            <h2 id="detail-title">${escapeHtml(item.title)}</h2>
          </div>
          <button class="icon-button ghost" type="button" data-close-modal aria-label="Cerrar" title="Cerrar"><i data-lucide="x"></i></button>
        </div>
        <div class="detail-layout">
          ${imageHtml(item)}
          <div class="detail-text">
            <div class="meta">
              <span class="badge">${statusLabels[item.status]}</span>
              ${item.year ? `<span class="badge neutral">${item.year}</span>` : ""}
              ${item.personal_rating ? `<span class="badge neutral">${"★".repeat(item.personal_rating)}</span>` : ""}
            </div>
            ${item.creator ? `<p><strong>Creador:</strong> ${escapeHtml(item.creator)}</p>` : ""}
            ${item.genres ? `<p><strong>Géneros:</strong> ${escapeHtml(item.genres)}</p>` : ""}
            ${item.finished_date ? `<p><strong>Finalizado:</strong> ${formatDate(item.finished_date)}</p>` : ""}
            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
            ${item.notes ? `<p><strong>Notas:</strong> ${escapeHtml(item.notes)}</p>` : ""}
            <label class="field">
              <span>Cambiar estado</span>
              <select data-status-change="${item.id}">
                ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-edit="${item.id}">Editar</button>
          <button class="button danger" type="button" data-delete="${item.id}">Eliminar</button>
        </div>
      </div>
    `;
    refreshIcons();
    if (!dialog.open) dialog.showModal();
  }

  async function changeStatus(id, status) {
    const item = state.items.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    const payload = { ...item, status };
    if (status === "finished" && !payload.finished_date) payload.finished_date = new Date().toISOString().slice(0, 10);
    await api(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    await loadItems();
    render();
    detailModal(state.items.find((entry) => String(entry.id) === String(id)));
    toast("Estado actualizado.");
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const target = event.target.closest("button, [data-open-detail]");
      if (!target) return;

      if (target.matches(".nav-item")) switchView(target.dataset.view);
      if (target.matches("#open-add-btn")) openSearchModal();
      if (target.matches("[data-open-manual]")) openManualFromSearch();
      if (target.matches("[data-close-modal]")) await requestClose();
      if (target.dataset.libraryPage) {
        if (target.dataset.libraryPage === "prev") state.pagination.libraryPage = Math.max(1, state.pagination.libraryPage - 1);
        if (target.dataset.libraryPage === "next") state.pagination.libraryPage += 1;
        render();
      }
      if (target.dataset.openDetail) {
        const item = state.items.find((entry) => String(entry.id) === target.dataset.openDetail);
        if (item) detailModal(item);
      }
      if (target.dataset.useResult) {
        const item = state.searchResults[Number(target.dataset.useResult)];
        if (item) {
          closeModals();
          openModal(item);
        }
      }
      if (target.dataset.edit) {
        const item = state.items.find((entry) => String(entry.id) === target.dataset.edit);
        closeModals();
        if (item) openModal(item);
      }
      if (target.dataset.delete) {
        const item = state.items.find((entry) => String(entry.id) === target.dataset.delete);
        if (!item) return;
        if (!await askConfirmation("¿Eliminar registro?", `Se eliminará «${item.title}». Esta acción no se puede deshacer.`)) return;
        await api(`/api/items/${item.id}`, { method: "DELETE" });
        await loadItems();
        closeModals();
        render();
        toast("Registro eliminado.");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const cardEl = event.target.closest("[data-open-detail]");
      if (cardEl) {
        event.preventDefault();
        cardEl.click();
      }
    });

    document.addEventListener("input", (event) => {
      if (event.target.closest("#item-form")) state.formDirty = true;
      if (event.target.dataset.searchFilter) {
        const filterKey = event.target.dataset.searchFilter;
        const cursor = event.target.selectionStart;
        state.filters[filterKey] = event.target.value;
        if (filterKey === "librarySearch") state.pagination.libraryPage = 1;
        render();
        const input = document.querySelector(`[data-search-filter="${filterKey}"]`);
        if (input) {
          input.focus();
          input.setSelectionRange(cursor, cursor);
        }
      }
    });

    document.addEventListener("change", async (event) => {
      if (event.target.closest("#item-form")) state.formDirty = true;
      if (event.target.id === "search-category") {
        state.searchCategory = event.target.value;
        state.searchResults = [];
        state.searchWarnings = [];
        state.hasSearched = false;
        renderSearchModalResults();
      }
      if (event.target.dataset.filter) {
        state.filters[event.target.dataset.filter] = event.target.value;
        if (["libraryCategory", "libraryYear"].includes(event.target.dataset.filter)) state.pagination.libraryPage = 1;
        render();
      }
      if (event.target.dataset.statusChange) {
        await changeStatus(event.target.dataset.statusChange, event.target.value);
      }
    });

    $("#item-form").addEventListener("submit", saveItem);
    $("#search-form").addEventListener("submit", submitSearch);
    $("#item-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      requestClose();
    });
    document.addEventListener("error", (event) => {
      const img = event.target;
      if (img instanceof HTMLImageElement && img.closest(".poster")) {
        const placeholder = img.parentElement.querySelector(".cover-placeholder");
        if (placeholder) placeholder.hidden = false;
        img.remove();
      }
    }, true);
  }

  async function init() {
    bindEvents();
    await ApiServices.loadServerConfig();
    await loadItems();
    switchView("home");

    if (window.isSecureContext && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
