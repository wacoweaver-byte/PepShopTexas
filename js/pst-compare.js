/* Pep Shop Texas · owner app: Compare suppliers (v1.0, ported from Patriot)
   Every product he sells, with each supplier's price for a 10-vial kit, the cost per vial, and his margin at today's
   shop price. The cheapest supplier is marked. Tick products (cheapest supplier pre-chosen, tap another row to switch),
   set kits, and "Create PO" opens the normal purchase-order sheet pre-filled for that supplier, one PO per supplier.
   Reads: product_catalog, vendors, pst_vendor_catalog_items. Writes nothing itself; the PO sheet does the saving. */
(() => {
  const P = window.PST, esc = P.esc, usd = n => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  let el = null, prods = [], vend = {}, offers = {}, unlinked = 0, zero = 0, q = "", f = "", pick = {}; // pick[key] = { vendorId, kits }
  const margin = (price, kitCost) => price > 0 ? (price - kitCost / 10) / price : 0;
  const label = p => `${p.display_name}${p.strength ? ` ${p.strength}` : ""}`;

  // The database hands back at most 1,000 rows per request, so read every price-list row page by page
  // (with more than 1,000 rows, suppliers near the end, like Catherine, were cut off).
  async function allRows(make) { const out = []; for (let i = 0; i < 50000; i += 1000) { const r = await make().range(i, i + 999); if (r.error) return r; out.push(...(r.data || [])); if ((r.data || []).length < 1000) break; } return { data: out, error: null }; }
  let onOrd = {};
  async function onOrderMap(c) { // open purchase-order lines (not received or cancelled), per product: units still coming + PO numbers
    const m = {}; for (let i = 0; i < 20000; i += 1000) { const r = await c.from("incoming_inventory").select("id,product_key,ordered_quantity,received_quantity,status,po_number").order("id").range(i, i + 999); if (r.error || !r.data) break;
      for (const x of r.data) { if (!x.product_key || ["received", "cancelled"].includes(String(x.status || "ordered").toLowerCase())) continue; const left = Math.max(0, Number(x.ordered_quantity || 0) - Number(x.received_quantity || 0)); if (!left) continue;
        const e = m[x.product_key] ||= { qty: 0, pos: [] }; e.qty += left; if (x.po_number && !e.pos.includes(x.po_number)) e.pos.push(x.po_number); }
      if (r.data.length < 1000) break; }
    return m; }
  async function load() {
    const c = P.client();
    const [pr, vr, ir] = await Promise.all([
      c.from("product_catalog").select("product_key,display_name,strength,price,sale_enabled,sale_price,category,current_inventory,low_stock_threshold,is_active").order("display_name"),
      c.from("vendors").select("id,company_name,is_active"),
      allRows(() => c.from("pst_vendor_catalog_items").select("vendor_id,vendor_item_number,product_name,strength,kit_cost,product_key").order("id"))
    ]);
    const err = pr.error || vr.error || ir.error; if (err) throw err;
    try { onOrd = await onOrderMap(c); } catch { onOrd = {}; }
    prods = (pr.data || []).filter(p => p.is_active !== false && !/10-vial/i.test(p.strength || "")).sort(P.cmpProduct);
    vend = Object.fromEntries((vr.data || []).map(v => [v.id, v]));
    offers = {}; unlinked = 0; zero = 0;
    for (const r of ir.data || []) {
      if (!(Number(r.kit_cost) > 0)) { zero++; continue; }
      if (!r.product_key) { unlinked++; continue; }
      if (vend[r.vendor_id]?.is_active === false) continue;
      (offers[r.product_key] ||= []).push(r);
    }
    for (const k in offers) { // one row per supplier (their cheapest matching line), cheapest first
      const best = {}; offers[k].forEach(r => { if (!best[r.vendor_id] || Number(r.kit_cost) < Number(best[r.vendor_id].kit_cost)) best[r.vendor_id] = r; });
      offers[k] = Object.values(best).sort((a, b) => a.kit_cost - b.kit_cost);
    }
  }
  const shopPrice = p => P.unitPrice(p);
  const low = p => Number(p.current_inventory || 0) <= Number(p.low_stock_threshold ?? 5);

  function summary() {
    const have = prods.filter(p => offers[p.product_key]?.length), wins = {};
    have.forEach(p => { const v = offers[p.product_key][0].vendor_id; wins[v] = (wins[v] || 0) + 1; });
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${esc(vend[v]?.company_name || "?")} ${n}`).join(" · ");
    return `<div class="cmpsum"><div><b>${have.length}</b><small>of ${prods.length} products priced</small></div><div><b>${Object.keys(vend).length}</b><small>suppliers</small></div><div class="wide"><small>Cheapest most often</small><span>${top || "—"}</span></div></div>`;
  }
  function card(p) {
    const os = offers[p.product_key] || [], price = shopPrice(p), sel = pick[p.product_key];
    if (!os.length) return `<article class="cmpc none"><header><b>${esc(label(p))}</b><span class="muted small">${usd(price)} a vial · ${Number(p.current_inventory || 0)} on hand${(onOrd[p.product_key]) ? ` · <b class="onord">${(onOrd[p.product_key]).qty} on order${(onOrd[p.product_key]).pos.length ? ` (${(onOrd[p.product_key]).pos.slice(0, 2).map(esc).join(", ")}${(onOrd[p.product_key]).pos.length > 2 ? "…" : ""})` : ""}</b>` : ""}</span></header><p class="muted small">No supplier lists this size yet. Add it to a supplier's price list under More → Vendor price lists.</p></article>`;
    const best = os[0];
    return `<article class="cmpc${sel ? " on" : ""}" data-ck="${esc(p.product_key)}">
<header><label class="cmpchk"><input type="checkbox" data-cmpsel ${sel ? "checked" : ""} aria-label="Add ${esc(label(p))} to a purchase order"><span><b>${esc(label(p))}</b><span class="muted small">Sells ${usd(price)} a vial · ${Number(p.current_inventory || 0)} on hand${(onOrd[p.product_key]) ? ` · <b class="onord">${(onOrd[p.product_key]).qty} on order${(onOrd[p.product_key]).pos.length ? ` (${(onOrd[p.product_key]).pos.slice(0, 2).map(esc).join(", ")}${(onOrd[p.product_key]).pos.length > 2 ? "…" : ""})` : ""}</b>` : ""}${low(p) ? ` · <em class="lowtag">Low</em>` : ""}</span></span></label></header>
<div class="cmprows" role="radiogroup" aria-label="Supplier for ${esc(label(p))}">${os.map((o, i) => { const m = margin(price, o.kit_cost), chosen = sel ? sel.vendorId === o.vendor_id : i === 0, diff = o.kit_cost - best.kit_cost;
  return `<button type="button" role="radio" aria-checked="${chosen}" class="cmpr${chosen ? " chosen" : ""}${i === 0 ? " best" : ""}" data-cmpv="${o.vendor_id}">
<span class="cv"><b>${esc(vend[o.vendor_id]?.company_name || "Supplier")}</b><small>${esc(o.vendor_item_number || "")}${i === 0 ? ` · <i>Cheapest</i>` : diff > 0 ? ` · +${usd(diff)}` : ""}</small></span>
<span class="cn"><b>${usd(o.kit_cost)}</b><small>${usd(o.kit_cost / 10)}/vial</small></span><span class="cm ${m < .75 ? "bad" : m < .85 ? "mid" : "ok"}">${Math.round(m * 100)}%</span></button>`; }).join("")}</div>
${sel ? `<div class="cmpqty"><span>Kits of 10</span><button type="button" data-cmpq="-1" aria-label="One fewer kit">−</button><b>${sel.kits}</b><button type="button" data-cmpq="1" aria-label="One more kit">+</button></div>` : ""}</article>`;
  }
  function bar() {
    const groups = {}; Object.entries(pick).forEach(([k, s]) => { const o = (offers[k] || []).find(x => x.vendor_id === s.vendorId); if (!o) return; (groups[s.vendorId] ||= []).push({ k, kits: s.kits, cost: o.kit_cost }); });
    const g = Object.entries(groups);
    if (!g.length) return "";
    return `<div class="cmpbar"><span><b>${Object.keys(pick).length} product${Object.keys(pick).length === 1 ? "" : "s"}</b> · ${g.length} supplier${g.length === 1 ? "" : "s"} · ${usd(g.reduce((s, [, ls]) => s + ls.reduce((a, l) => a + l.kits * l.cost, 0), 0))}</span>
${g.map(([v, ls]) => `<button type="button" class="btn primary sm" data-cmppo="${v}">PO · ${esc(vend[v]?.company_name || "Supplier")} (${ls.length})</button>`).join("")}</div>`;
  }
  function draw() {
    const term = q.trim().toLowerCase();
    let list = prods.filter(p => !term || label(p).toLowerCase().includes(term));
    if (f === "low") list = list.filter(low);
    if (f === "margin") list = list.filter(p => offers[p.product_key]?.length && margin(shopPrice(p), offers[p.product_key][0].kit_cost) < .85);
    if (f === "none") list = list.filter(p => !offers[p.product_key]?.length);
    el.innerHTML = `${summary()}
<input class="psearch" type="search" placeholder="Search products" aria-label="Search products" data-cmpq-s value="${esc(q)}">
<div class="schips" role="tablist">${[["", "All"], ["low", "Running low"], ["margin", "Margin under 85%"], ["none", "No supplier"]].map(([k, l]) => `<button type="button" class="${f === k ? "on" : ""}" data-cmpf="${k}">${l}</button>`).join("")}</div>
<p class="muted small">Prices are per 10-vial kit from your suppliers' lists. Margin uses today's shop price. Tick a product, tap the supplier you want, then create the PO.</p>
<div class="cmplist">${list.map(card).join("") || `<p class="empty">Nothing here.</p>`}</div>
${unlinked || zero ? `<details class="cmpnote"><summary>${unlinked} supplier lines aren't linked to a product${zero ? ` · ${zero} lines priced $0.00` : ""}</summary><p class="muted small">Those are items you don't sell (or sizes you don't carry). Link or fix them under More → Vendor price lists.</p></details>` : ""}
${bar()}`;
  }
  async function pane(target) {
    el = target; el.innerHTML = `<p class="muted small">Loading suppliers…</p>`;
    try { await load(); draw(); } catch (e) { el.innerHTML = `<p class="notice err">Couldn't load supplier prices: ${esc(e.message || e)}</p>`; }
  }
  document.addEventListener("click", e => {
    if (!el || !el.isConnected || !el.contains(e.target)) return;
    const t = e.target, c = t.closest("[data-ck]"), k = c?.dataset.ck;
    if (t.closest("[data-cmpf]")) { f = t.closest("[data-cmpf]").dataset.cmpf; draw(); return; }
    if (t.closest("[data-cmpv]") && k) { const v = t.closest("[data-cmpv]").dataset.cmpv; pick[k] = { vendorId: v, kits: pick[k]?.kits || 1 }; draw(); return; }
    if (t.closest("[data-cmpq]") && k && pick[k]) { pick[k].kits = Math.max(1, Math.min(99, pick[k].kits + Number(t.closest("[data-cmpq]").dataset.cmpq))); draw(); return; }
    if (t.closest("[data-cmppo]")) {
      const v = t.closest("[data-cmppo]").dataset.cmppo, keys = Object.keys(pick).filter(x => pick[x].vendorId === v);
      const lines = keys.map(x => ({ key: x, qty: pick[x].kits * 10, kitCost: (offers[x] || []).find(o => o.vendor_id === v)?.kit_cost || 0 }));
      window.PSTOps3.poSheet({ vendorId: v, lines, then: () => { keys.forEach(x => delete pick[x]); draw(); P.toast?.("Purchase order saved. Find it under Products → Stock."); } });
    }
  });
  document.addEventListener("change", e => {
    if (!el || !el.contains(e.target) || !e.target.matches("[data-cmpsel]")) return;
    const k = e.target.closest("[data-ck]").dataset.ck;
    if (e.target.checked) pick[k] = { vendorId: (offers[k] || [])[0]?.vendor_id, kits: 1 }; else delete pick[k];
    draw();
  });
  document.addEventListener("input", e => { if (el && el.contains(e.target) && e.target.matches("[data-cmpq-s]")) { q = e.target.value; const pos = e.target.selectionStart; draw(); const s = el.querySelector("[data-cmpq-s]"); s.focus(); s.setSelectionRange(pos, pos); } });
  window.PPUCompare = { pane };
})();
