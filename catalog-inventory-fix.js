/* PST catalog inventory display fix
   Purpose: show exactly one incoming inventory badge on desktop and mobile. */
(function () {
  if (window.__pstCatalogInventoryFixLoaded) return;
  window.__pstCatalogInventoryFixLoaded = true;

  const OPEN_STATUS_PATTERN = /(ordered|order|on[_\s-]?order|pending|purchased|submitted|in[_\s-]?transit|transit|shipped|enroute|en[_\s-]?route)/i;
  const CLOSED_STATUS_PATTERN = /(received|complete|completed|cancelled|canceled|issue|closed)/i;
  let incomingMap = new Map();
  let fetchTimer = null;
  let patching = false;

  function normalizeIncomingStatus(value) {
    const raw = String(value || "ordered").trim().toLowerCase();
    if (!raw) return "ordered";
    const compact = raw.replace(/[\s-]+/g, "_");
    if (compact.includes("in_transit") || compact.includes("transit") || compact.includes("shipped") || compact.includes("en_route")) return "in_transit";
    if (compact.includes("received") || compact.includes("complete") || compact.includes("cancel") || compact.includes("issue") || compact.includes("closed")) return "";
    return "ordered";
  }

  function numberFrom(row, names) {
    for (const name of names) {
      if (row && row[name] !== undefined && row[name] !== null && row[name] !== "") return Number(row[name] || 0);
    }
    return 0;
  }

  function dateFrom(row) {
    return row?.incoming_expected_arrival_date || row?.expected_arrival_date || row?.expected_arrival || row?.arrival_date || row?.eta || "";
  }

  function addIncomingRow(byKey, row) {
    const key = String(row?.product_key || row?.sku || row?.product_sku || "").trim();
    if (!key) return;

    const rawStatus = String(row?.incoming_status || row?.status || row?.po_status || row?.order_status || "ordered");
    if (CLOSED_STATUS_PATTERN.test(rawStatus) && !OPEN_STATUS_PATTERN.test(rawStatus)) return;

    const status = normalizeIncomingStatus(rawStatus);
    if (!status) return;

    const incomingQty = numberFrom(row, ["incoming_quantity", "open_quantity", "on_order_quantity", "quantity_on_order"]);
    const orderedQty = numberFrom(row, ["ordered_quantity", "quantity_ordered", "order_quantity", "expected_quantity", "quantity", "qty", "vials_ordered"]);
    const receivedQty = numberFrom(row, ["received_quantity", "quantity_received", "received_qty", "received", "vials_received"]);
    const openQty = Math.max(0, incomingQty || (orderedQty - receivedQty) || orderedQty);
    if (openQty <= 0) return;

    const current = byKey.get(key) || { product_key: key, incoming_quantity: 0, statuses: new Set(), dates: [] };
    current.incoming_quantity += openQty;
    current.statuses.add(status);
    const arrival = dateFrom(row);
    if (arrival) current.dates.push(arrival);
    byKey.set(key, current);
  }

  function toIncomingRows(byKey) {
    return Array.from(byKey.values()).map((row) => ({
      product_key: row.product_key,
      incoming_quantity: row.incoming_quantity,
      incoming_status: row.statuses.has("in_transit") ? "in_transit" : "ordered",
      incoming_expected_arrival_date: row.dates.sort()[0] || ""
    }));
  }

  function incomingLabel(product = {}) {
    const qty = Number(product.incoming_quantity || 0);
    if (qty <= 0) return "";
    return normalizeIncomingStatus(product.incoming_status) === "in_transit" ? "In Transit" : "On Order";
  }

  function incomingPlainText(product = {}) {
    const label = incomingLabel(product);
    return label ? `${label} / pending arrival. Not available for checkout until received into inventory.` : "";
  }

  function incomingNotice(product = {}) {
    const text = incomingPlainText(product);
    return text ? `<p class="checkout-note">${escapeHtml(text)}</p>` : "";
  }

  function incomingPill(product = {}) {
    const label = incomingLabel(product);
    return label ? `<span class="catalog-incoming-pill">${escapeHtml(label)}</span>` : "";
  }

  function improvedStockText(product = {}) {
    const count = Number(product.current_inventory || 0);
    if (count <= 0) return "Out of Stock";
    if (count <= 10) return "Limited";
    return "In Stock";
  }

  async function robustFetchIncomingStatusRows(keys = []) {
    const client = requireSupabaseClient();
    const productKeys = Array.from(new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean)));
    if (!productKeys.length) return [];

    const { data, error } = await client.rpc("get_public_product_incoming_status", {
      p_product_keys: productKeys
    });

    if (error) {
      console.warn("Incoming inventory status unavailable", error);
      return [];
    }

    const byKey = new Map();
    (data || []).forEach((row) => addIncomingRow(byKey, row));
    return toIncomingRows(byKey);
  }

  function collectRenderedKeys() {
    return Array.from(document.querySelectorAll("[data-add-to-cart]"))
      .map((button) => String(button.dataset.addToCart || "").trim())
      .filter(Boolean);
  }

  function rowForButton(button) {
    return button.closest(".catalog-dose-option") || button.closest(".catalog-row-actions") || button.parentElement;
  }

  function hasNativeIncomingBadge(row, actionCell) {
    const nativeSelector = ".catalog-incoming-pill:not(.catalog-inventory-fix-pill)";
    return !!(actionCell?.querySelector(nativeSelector) || row?.querySelector(nativeSelector));
  }

  function normalizeStockLabels() {
    document.querySelectorAll(".catalog-dose-option").forEach((row) => {
      const stock = row.querySelector(".catalog-stock");
      if (!stock) return;
      if (stock.classList.contains("out")) {
        stock.textContent = "Out of Stock";
        stock.setAttribute("aria-label", "Out of Stock");
      } else if (stock.classList.contains("limited")) {
        stock.textContent = "Limited";
        stock.setAttribute("aria-label", "Limited");
      } else if (stock.classList.contains("available")) {
        stock.textContent = "In Stock";
        stock.setAttribute("aria-label", "In Stock");
      }
    });
  }

  function renderIncomingBadges() {
    if (patching) return;
    patching = true;
    try {
      document.querySelectorAll(".catalog-inventory-fix-pill").forEach((node) => node.remove());
      normalizeStockLabels();

      document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
        const row = button.closest(".catalog-dose-option");
        if (!row) return; // Do not inject catalog badges into product detail, cart, or admin buttons.

        const actionCell = button.closest(".catalog-row-actions");
        if (!actionCell) return;

        const key = String(button.dataset.addToCart || "").trim();
        const incoming = incomingMap.get(key);
        const label = incomingLabel(incoming || {});
        if (!label) return;

        // If app.js already rendered an On Order / In Transit badge, do not add another one.
        if (hasNativeIncomingBadge(row, actionCell)) return;

        const pill = document.createElement("span");
        pill.className = "catalog-incoming-pill catalog-inventory-fix-pill";
        pill.textContent = label;
        pill.title = incomingPlainText(incoming);
        actionCell.insertBefore(pill, button);
      });
    } finally {
      patching = false;
    }
  }

  async function refreshIncomingMap() {
    if (typeof requireSupabaseClient !== "function") return;
    const keys = Array.from(new Set(collectRenderedKeys()));
    if (!keys.length) return;

    try {
      const rows = await robustFetchIncomingStatusRows(keys);
      incomingMap = new Map(rows.map((row) => [String(row.product_key || "").trim(), row]));
      renderIncomingBadges();
    } catch (error) {
      console.warn("Catalog incoming badge patch failed", error);
    }
  }

  function scheduleRefresh() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(refreshIncomingMap, 120);
  }

  function applyFunctionOverrides() {
    if (typeof requireSupabaseClient !== "function") return false;
    try { fetchIncomingStatusRows = robustFetchIncomingStatusRows; } catch (_) {}
    try { productIncomingLabel = incomingLabel; } catch (_) {}
    try { productIncomingPlainText = incomingPlainText; } catch (_) {}
    try { productIncomingNotice = incomingNotice; } catch (_) {}
    try { productIncomingPill = incomingPill; } catch (_) {}
    try { stockText = improvedStockText; } catch (_) {}
    return true;
  }

  async function start() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (applyFunctionOverrides()) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    scheduleRefresh();

    const grid = document.querySelector("[data-catalog-grid]") || document.body;
    const observer = new MutationObserver(() => scheduleRefresh());
    observer.observe(grid, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
