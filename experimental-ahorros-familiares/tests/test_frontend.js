// Run from the app directory with JavaScriptCore: jsc tests/test_frontend.js
const nodes = new Map();
const messages = [];
function element() {
  const classes = new Set();
  return {
    value: "", textContent: "", innerHTML: "", disabled: false,
    dataset: {}, listeners: {}, classList: {
      add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, show) { if (show) classes.add(name); else classes.delete(name); },
    },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    appendChild(node) { messages.push(node.textContent); }, focus() {}, remove() {},
  };
}
const document = {
  body: element(),
  querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  },
  querySelectorAll() { return []; }, addEventListener() {},
  createElement() { return element(); },
};
const setTimeout = () => 0;
const URLSearchParams = class {
  constructor(query = "") {
    this.values = new Map(query.replace(/^\?/, "").split("&").filter(Boolean).map((part) => part.split("=").map(decodeURIComponent)));
  }
  set(key, value) { this.values.set(key, String(value)); }
  toString() { return Array.from(this.values, ([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value)).join("&"); }
};
const FormData = class {
  constructor(form) { this.data = form.data; }
  get(key) { return this.data[key] || ""; }
};
function response(data, ok = true) { return { ok, json: async () => data }; }
const summary = (balance) => ({ total: { balance_cents: balance }, breakdown: [] });
const history = (id) => ({ items: id ? [{ id, occurred_at: "2026-11-17", kind: "deposit", amount_cents: id }] : [], total: id ? 1 : 0, next_offset: null });
let fetch = async (url) => response(url.includes("summary") ? summary(0) : url.includes("transactions") ? history() : { items: [] });
load("static/app.js");
function assert(condition, message) { if (!condition) throw new Error(message); }

(async () => {
  await refreshAll();
  const pending = [];
  fetch = (url) => new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
  document.querySelector("#filter-person").value = "1";
  const first = loadDashboard();
  document.querySelector("#filter-person").value = "2";
  const second = loadDashboard();
  pending[2].resolve(response(summary(200)));
  pending[3].resolve(response(history(2)));
  await second;
  const visibleBalance = document.querySelector("#balance-total").textContent;
  pending[0].resolve(response(summary(100)));
  pending[1].resolve(response(history(1)));
  await first;
  assert(document.querySelector("#balance-total").textContent === visibleBalance, "Stale response replaced last filter");
  assert(document.querySelector("#history-body").innerHTML.includes('data-delete-transaction="2"'), "Wrong history after filter race");

  let posts = 0;
  fetch = async (url, options = {}) => {
    if (options.method === "POST") { posts++; return response({ id: 5 }); }
    return response({ error: "Fallo GET simulado" }, false);
  };
  const form = document.querySelector("#transaction-form");
  form.data = { person_id: "1", type_id: "1", kind: "deposit", amount: "10", occurred_at: "2026-11-17" };
  form.querySelector = () => element();
  form.reset = () => {};
  await form.listeners.submit({ preventDefault() {}, currentTarget: form });
  assert(posts === 1, "Unexpected duplicate POST");
  assert(messages.some((message) => message.includes("Movimiento guardado.") && message.includes("No repitas")), "Committed mutation was reported as failed");
  fetch = async (url) => response(url.includes("summary") ? summary(1000) : url.includes("transactions") ? history(5) : { items: [] });
  await document.querySelector("#dashboard-retry").listeners.click();
  assert(posts === 1, "Retry duplicated mutation");
  document.querySelector("#dashboard-retry").classList.add("hidden");
  let catalogFailed = false;
  fetch = async () => response({ error: "Fallo catálogo simulado" }, false);
  await refreshAfterChange("Persona agregada.", refreshAll);
  assert(!document.querySelector("#dashboard-retry").classList.contains("hidden"), "Catalog failure offers no retry");
  assert(messages.some((message) => message.includes("Persona agregada.") && message.includes("No repitas")), "Catalog success lost");
  print("PASS: inverted filter responses, POST success + GET failure, GET-only retry");
})().catch((error) => { print(error.stack); quit(1); });
