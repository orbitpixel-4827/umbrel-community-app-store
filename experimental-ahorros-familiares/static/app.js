const state = { people: [], types: [], transactions: [], summary: null, pendingDeletion: null };

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateFormat = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

function formatMoney(cents) {
  return money.format((Number(cents) || 0) / 100);
}

function formatDate(value) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`)).replaceAll(".", "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ocurrió un problema. Intenta de nuevo.");
  return data;
}

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  $("#toast-region").appendChild(element);
  setTimeout(() => element.remove(), 3600);
}

function optionMarkup(items, selected = "") {
  return items.map((item) => `<option value="${item.id}" ${String(item.id) === String(selected) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
}

function renderCatalogs() {
  const oldValues = {
    formPerson: $("#transaction-person").value,
    formType: $("#transaction-type").value,
    formDestination: $("#transfer-destination").value,
    filterPerson: $("#filter-person").value,
    filterType: $("#filter-type").value,
    statementPerson: $("#statement-person").value,
    statementType: $("#statement-type").value,
  };
  $("#transaction-person").innerHTML = `<option value="">Selecciona</option>${optionMarkup(state.people, oldValues.formPerson)}`;
  $("#transaction-type").innerHTML = `<option value="">Selecciona</option>${optionMarkup(state.types, oldValues.formType)}`;
  $("#transfer-destination").innerHTML = `<option value="">Selecciona</option>${optionMarkup(state.types, oldValues.formDestination)}`;
  $("#filter-person").innerHTML = `<option value="">Todas</option>${optionMarkup(state.people, oldValues.filterPerson)}`;
  $("#filter-type").innerHTML = `<option value="">Todos</option>${optionMarkup(state.types, oldValues.filterType)}`;
  $("#statement-person").innerHTML = `<option value="">Todas</option>${optionMarkup(state.people, oldValues.statementPerson)}`;
  $("#statement-type").innerHTML = `<option value="">Todos</option>${optionMarkup(state.types, oldValues.statementType)}`;

  for (const [kind, items] of [["people", state.people], ["types", state.types]]) {
    const list = $(`#${kind}-list`);
    list.innerHTML = items.length
      ? items.map((item) => `<span class="catalog-chip">${escapeHtml(item.name)}</span>`).join("")
      : `<span class="catalog-placeholder">Aún no hay registros.</span>`;
  }

  const ready = state.people.length > 0 && state.types.length > 0;
  $("#setup-empty").classList.toggle("hidden", ready);
  $("#transaction-form").classList.toggle("hidden", !ready);
}

function currentQuery() {
  const params = new URLSearchParams();
  if ($("#filter-person").value) params.set("person_id", $("#filter-person").value);
  if ($("#filter-type").value) params.set("type_id", $("#filter-type").value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function renderSummary() {
  const total = state.summary?.total || {};
  $("#balance-total").textContent = formatMoney(total.balance_cents);
  $("#deposit-total").textContent = formatMoney(total.deposits_cents);
  $("#withdrawal-total").textContent = formatMoney(total.withdrawals_cents);
  $("#movement-count").textContent = Number(total.movement_count || 0).toLocaleString("es-MX");

  const person = state.people.find((item) => String(item.id) === $("#filter-person").value)?.name || "Todas las personas";
  const type = state.types.find((item) => String(item.id) === $("#filter-type").value)?.name || "Todos los tipos";
  $("#summary-scope").textContent = `${person} · ${type}`;

  const rows = state.summary?.breakdown || [];
  $("#breakdown-body").innerHTML = rows.map((row) => `
    <tr>
      <td class="person-cell">${escapeHtml(row.person_name)}</td>
      <td><span class="type-badge">${escapeHtml(row.type_name)}</span></td>
      <td>${formatMoney(row.deposits_cents)}</td>
      <td>${formatMoney(row.withdrawals_cents)}</td>
      <td class="${row.balance_cents >= 0 ? "amount-positive" : "amount-negative"}">${formatMoney(row.balance_cents)}</td>
    </tr>`).join("");
  $("#breakdown-empty").classList.toggle("hidden", rows.length > 0);
}

function renderTransactions() {
  const seenTransfers = new Set();
  const visibleItems = state.transactions.filter((item) => {
    if (!item.transfer_id) return true;
    if (seenTransfers.has(item.transfer_id)) return false;
    seenTransfers.add(item.transfer_id);
    return true;
  });
  $("#history-body").innerHTML = visibleItems.map((item) => {
    if (item.transfer_id) {
      const typeFiltered = Boolean($("#filter-type").value);
      const incoming = item.kind === "deposit";
      const amountClass = typeFiltered ? (incoming ? "amount-positive" : "amount-negative") : "transfer-amount";
      const amountPrefix = typeFiltered ? (incoming ? "+" : "−") : "⇄ ";
      return `<tr>
        <td class="date-cell">${formatDate(item.occurred_at)}</td>
        <td class="person-cell">${escapeHtml(item.person_name)}</td>
        <td><span class="type-badge">${escapeHtml(item.transfer_from_name)} → ${escapeHtml(item.transfer_to_name)}</span></td>
        <td class="note-cell" title="${escapeHtml(item.note)}">${escapeHtml(item.note || "Traspaso entre tipos")}</td>
        <td class="${amountClass}">${amountPrefix}${formatMoney(item.amount_cents)}</td>
        <td><button class="delete-button" type="button" data-delete-transaction="${item.id}" aria-label="Eliminar traspaso" title="Eliminar traspaso">×</button></td>
      </tr>`;
    }
    const deposit = item.kind === "deposit";
    return `<tr>
      <td class="date-cell">${formatDate(item.occurred_at)}</td>
      <td class="person-cell">${escapeHtml(item.person_name)}</td>
      <td><span class="type-badge">${escapeHtml(item.type_name)}</span></td>
      <td class="note-cell" title="${escapeHtml(item.note)}">${escapeHtml(item.note || "—")}</td>
      <td class="${deposit ? "amount-positive" : "amount-negative"}">${deposit ? "+" : "−"}${formatMoney(item.amount_cents)}</td>
      <td><button class="delete-button" type="button" data-delete-transaction="${item.id}" aria-label="Eliminar movimiento" title="Eliminar movimiento">×</button></td>
    </tr>`;
  }).join("");
  const count = visibleItems.length;
  $("#history-count").textContent = `${count} ${count === 1 ? "registro" : "registros"}`;
  $("#history-empty").classList.toggle("hidden", count > 0);
}

async function loadCatalogs() {
  const [people, types] = await Promise.all([api("/api/people"), api("/api/types")]);
  state.people = people.items;
  state.types = types.items;
  renderCatalogs();
}

async function loadDashboard() {
  const query = currentQuery();
  const [summary, transactions] = await Promise.all([api(`/api/summary${query}`), api(`/api/transactions${query}`)]);
  state.summary = summary;
  state.transactions = transactions.items;
  renderSummary();
  renderTransactions();
}

async function refreshAll() {
  await loadCatalogs();
  await loadDashboard();
}

document.addEventListener("click", async (event) => {
  const scrollButton = event.target.closest("[data-scroll-target]");
  if (scrollButton) {
    const target = document.getElementById(scrollButton.dataset.scrollTarget);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".mobile-nav-item").forEach((item) => item.classList.toggle("is-active", item === scrollButton));
    return;
  }

  const opener = event.target.closest("[data-open-dialog]");
  if (opener) {
    if (opener.dataset.openDialog === "statement-dialog") {
      $("#statement-person").value = $("#filter-person").value;
      $("#statement-type").value = $("#filter-type").value;
    }
    $(`#${opener.dataset.openDialog}`).showModal();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-transaction]");
  if (deleteButton) {
    const isTransfer = deleteButton.getAttribute("aria-label").includes("traspaso");
    state.pendingDeletion = { id: deleteButton.dataset.deleteTransaction, isTransfer, trigger: deleteButton };
    $("#delete-title").textContent = isTransfer ? "Eliminar traspaso" : "Eliminar movimiento";
    $("#delete-message").textContent = isTransfer
      ? "Se quitarán juntas la salida y la entrada entre tipos de ahorro. Esta acción no se puede deshacer."
      : "El saldo se actualizará inmediatamente. Esta acción no se puede deshacer.";
    $("#delete-dialog").showModal();
  }
});

$("#delete-dialog form").addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") {
    state.pendingDeletion = null;
    return;
  }
  event.preventDefault();
  if (!state.pendingDeletion) return;
  const { id, isTransfer } = state.pendingDeletion;
  const button = $("#confirm-delete");
  button.disabled = true;
  button.textContent = "Eliminando…";
  try {
    await api(`/api/transactions/${id}`, { method: "DELETE" });
    $("#delete-dialog").close();
    state.pendingDeletion = null;
    await loadDashboard();
    toast(isTransfer ? "Traspaso eliminado y saldos actualizados." : "Movimiento eliminado y saldo actualizado.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Sí, eliminar";
  }
});

function updateMovementFields() {
  const kind = document.querySelector("input[name='kind']:checked").value;
  const transfer = kind === "transfer";
  $("#transfer-destination-field").classList.toggle("hidden", !transfer);
  $("#transfer-destination").required = transfer;
  $("#transaction-type-label").textContent = transfer ? "Tipo de ahorro de origen" : "Tipo de ahorro";
}

for (const input of document.querySelectorAll("input[name='kind']")) {
  input.addEventListener("change", updateMovementFields);
}

for (const form of document.querySelectorAll("[data-catalog-form]")) {
  form.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.value === "cancel") return;
    event.preventDefault();
    const kind = form.dataset.catalogForm;
    const name = new FormData(form).get("name");
    try {
      await api(`/api/${kind}`, { method: "POST", body: JSON.stringify({ name }) });
      form.reset();
      form.closest("dialog").close();
      await loadCatalogs();
      toast(kind === "people" ? "Persona agregada." : "Tipo de ahorro agregado.");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

$("#transaction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  const amountCents = Math.round((amount + Number.EPSILON) * 100);
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        person_id: data.get("person_id"),
        type_id: data.get("type_id"),
        kind: data.get("kind"),
        to_type_id: data.get("to_type_id"),
        amount_cents: amountCents,
        occurred_at: data.get("occurred_at"),
        note: data.get("note"),
      }),
    });
    const selectedPerson = data.get("person_id");
    const selectedType = data.get("type_id");
    const selectedDestination = data.get("to_type_id");
    form.reset();
    $("#occurred-at").value = todayLocal();
    $("#transaction-person").value = selectedPerson;
    $("#transaction-type").value = selectedType;
    $("#transfer-destination").value = selectedDestination;
    updateMovementFields();
    await loadDashboard();
    toast("Movimiento guardado y saldo actualizado.");
    $("#amount").focus();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg> Guardar movimiento';
  }
});

for (const select of [$("#filter-person"), $("#filter-type")]) {
  select.addEventListener("change", () => loadDashboard().catch((error) => toast(error.message, "error")));
}

$("#clear-filters").addEventListener("click", () => {
  $("#filter-person").value = "";
  $("#filter-type").value = "";
  loadDashboard().catch((error) => toast(error.message, "error"));
});

$("#statement-form").addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const dateFrom = data.get("date_from");
  const dateTo = data.get("date_to");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    toast("La fecha inicial no puede ser posterior a la fecha final.", "error");
    return;
  }
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (value) params.set(key, value);
  }
  const button = form.querySelector(".statement-button");
  button.disabled = true;
  button.textContent = "Generando PDF…";
  try {
    const response = await fetch(`/api/statement.pdf?${params.toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No fue posible generar el estado de cuenta.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "estado-de-cuenta.pdf";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    form.closest("dialog").close();
    toast("Estado de cuenta generado.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg> Descargar PDF';
  }
});

$("#occurred-at").value = todayLocal();
updateMovementFields();
refreshAll()
  .catch((error) => toast(error.message, "error"))
  .finally(() => document.body.classList.remove("is-loading"));
