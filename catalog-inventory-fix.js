/* PST catalog inventory display fix
   Purpose: make public catalog show incoming inventory badges reliably. */
(function () {
  if (window.__pstCatalogInventoryFixLoaded) return;
  window.__pstCatalogInventoryFixLoaded = true;

  const OPEN_STATUS_PATTERN = /(ordered|order|on[_\s-]?order|pending|purchased|submitted|in[_\s-]?transit|transit|shipped|enroute|en[_\s-]?route)/i;
  const CLOSED_STATUS_PATTERN = /(received|complete|completed|cancelled|canceled|issue|closed)/i;

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

  async function robustFetchIncomingStatusRows(keys = []) {
    const client = requireSupabaseClient();
    const productKeys = Array.from(new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean)));
    if (!productKeys.length) return [];

    const byKey = new Map();

    const viewResult = await client
      .from("product_incoming_status")
      .select("*")
      .in("product_key", productKeys);

    if (!viewResult.error) {
      (viewResult.data || []).forEach((row) => addIncomingRow(byKey, row));
    } else {
      console.warn("Incoming status view unavailable; trying incoming_inventory fallback", viewResult.error);
    }

    const rawResult = await client
      .from("incoming_inventory")
      .select("*")
      .in("product_key", productKeys);

    if (!rawResult.error) {
      (rawResult.data || []).forEach((row) => addIncomingRow(byKey, row));
    } else if (byKey.size === 0) {
      console.warn("Incoming inventory fallback unavailable", rawResult.error);
    }

    return toIncomingRows(byKey);
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

  function applyOverrides() {
    if (typeof requireSupabaseClient !== "function") return false;
    fetchIncomingStatusRows = robustFetchIncomingStatusRows;
    productIncomingLabel = incomingLabel;
    productIncomingPlainText = incomingPlainText;
    productIncomingNotice = incomingNotice;
    productIncomingPill = incomingPill;
    return true;
  }

  async function redrawAfterPatch() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (applyOverrides()) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const page = document.body?.dataset?.page;
    if (page === "products" && typeof renderCatalog === "function" && !window.__pstCatalogInventoryFixRedrew) {
      window.__pstCatalogInventoryFixRedrew = true;
      renderCatalog();
    }
    if (page === "product-detail" && typeof renderProductDetail === "function" && !window.__pstProductInventoryFixRedrew) {
      window.__pstProductInventoryFixRedrew = true;
      renderProductDetail();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", redrawAfterPatch, { once: true });
  } else {
    redrawAfterPatch();
  }
})();
