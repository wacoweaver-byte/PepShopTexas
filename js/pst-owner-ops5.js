/* Pep Shop Texas · owner app stage 3 (v5.0), part 2: vendor price lists (= vendor-prices.html).
   Same matching rules (product key → saved SKU+strength → name+strength with his aliases) and the same
   RPCs: pst_admin_import_vendor_catalog (all rows, matched or not) and pst_admin_order_vendor_only_item. */
(function () {
  "use strict";
  const P = window.PST, { $$, esc } = P;
  const usd = n => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normStrength = s => norm(String(s || "").replace(/\s*\/\s*vial\s*[*×x]\s*10\s*vials?\s*$/i, "").replace(/\s*[*×x]\s*10\s*vials?\s*$/i, "").replace(/\s*\/\s*vial\s*$/i, "").replace(/\b(milligrams?|mgs?)\b/gi, "mg").replace(/\b(micrograms?|mcgs?)\b/gi, "mcg"));
  const ALIAS = { retatrutide: "pst3ret", tirzepatide: "pst2tir", semaglutide: "pst1sem", epithalon: "epitalon", kisspeptin10: "kisspeptin", ll37: "ll37", cjc1295nodac: "cjc1295", tb500: "tb4tb500thymosinb4", thymosinalpha1: "thymosinalpha1", b12: "b12", miclipocb12: "miclipocwb12", melanotan2: "melantoninii", hcg: "pst5000iu", bpc15710mgtb50010mg: "wolverine" };
  const matchName = n => ALIAS[norm(n)] || norm(n);
  const get = (r, ...keys) => { for (const k of keys) { const f = Object.keys(r).find(x => norm(x) === norm(k)); if (f && r[f] !== undefined) return String(r[f]).trim(); } return ""; };
  let XL = null;
  const loadXLSX = () => XL || (XL = new Promise((res, rej) => { if (window.XLSX) return res(window.XLSX); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = () => res(window.XLSX); s.onerror = () => { XL = null; rej(new Error("Couldn't load the spreadsheet reader. Check the connection and try again.")); }; document.head.appendChild(s); }));

  let products = [], vendors = [], saved = [], vendorId = "", staged = [];
  const plabel = p => `${p.display_name || p.product_key}${p.strength ? ` ${p.strength}` : ""}`;
  async function loadSaved() {
    const { data, error } = await P.client().from("pst_vendor_catalog_items").select("id,product_key,product_name,strength,vendor_item_number,kit_cost").eq("vendor_id", vendorId).order("product_name");
    if (error) throw error; saved = data || [];
  }
  async function vendorPricesPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const [v, p] = await Promise.all([P.client().from("vendors").select("id,company_name,pst_vendor_id,is_active").order("company_name"), P.client().from("product_catalog").select("product_key,display_name,sort_name,strength").order("sort_name")]);
    if (v.error || p.error) { el.innerHTML = `<p class="notice err">${esc((v.error || p.error).message)}</p>`; return; }
    vendors = v.data || []; products = (p.data || []).sort((a, b) => plabel(a).localeCompare(plabel(b), undefined, { numeric: true, sensitivity: "base" }));
    if (!vendors.some(x => x.id === vendorId)) vendorId = (vendors.find(x => x.is_active !== false) || vendors[0] || {}).id || "";
    staged = [];
    el.innerHTML = `<label>Vendor<select data-vpv>${vendors.map(x => `<option value="${x.id}"${x.id === vendorId ? " selected" : ""}>${esc(x.company_name)}${x.pst_vendor_id ? ` · ${esc(x.pst_vendor_id)}` : ""}</option>`).join("")}</select></label>
<label class="btn primary wide adpick">Upload a price list (Excel or CSV)<input type="file" data-vpf accept=".xlsx,.xls,.csv" hidden></label>
<p class="muted small">Prices are per 10-vial kit. Uploading never changes your shop prices. Rows that match your products fill in automatically on new purchase orders.</p>
<p class="status" data-vps role="status"></p><div data-vpbody></div>`;
    const body = el.querySelector("[data-vpbody]"), st = el.querySelector("[data-vps]");
    const showSaved = async () => {
      if (!vendorId) { body.innerHTML = `<p class="muted small">Add a vendor first under More → Vendors.</p>`; return; }
      body.innerHTML = `<p class="muted small">Loading…</p>`;
      try { await loadSaved(); } catch (e) { body.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
      const m = saved.filter(r => r.product_key).length, byKey = Object.fromEntries(products.map(x => [x.product_key, x]));
      body.innerHTML = `<input class="psearch" type="search" data-vpq placeholder="Search this vendor's list" aria-label="Search vendor list"><p class="muted small">${saved.length} item${saved.length === 1 ? "" : "s"} · ${m} matched to your products · ${saved.length - m} not</p>
<div class="shelf">${saved.map(r => `<div class="shrow vprow${r.product_key ? "" : " low"}" data-vpk="${esc(`${r.product_name} ${r.strength} ${r.vendor_item_number} ${r.product_key || ""}`.toLowerCase())}"><span></span><span><b>${esc(r.product_name)} ${esc(r.strength || "")}</b><small>${esc(r.vendor_item_number || "no SKU")} · ${r.product_key ? `→ ${esc(byKey[r.product_key] ? plabel(byKey[r.product_key]) : r.product_key)}` : "not one of your products"}</small>
<span class="vpact"><button type="button" class="linkish" data-vpe="${r.id}">Change price</button>${r.product_key ? "" : ` · <button type="button" class="linkish" data-vpo="${r.id}">Order it</button>`}</span></span><em>${usd(r.kit_cost)}</em></div>`).join("") || `<p class="muted small">No price list for this vendor yet.</p>`}</div>`;
    };
    const review = () => {
      const claimed = new Map(staged.filter(r => r.key).map(r => [r.key, r])), savedOther = k => saved.find(s => s.product_key === k);
      const opts = r => `<option value="">Not one of my products</option>${products.map(x => { const other = savedOther(x.product_key), lock = (claimed.has(x.product_key) && claimed.get(x.product_key) !== r) || (other && (norm(other.vendor_item_number) + "|" + normStrength(other.strength)) !== (norm(r.sku) + "|" + normStrength(r.strength))); return `<option value="${esc(x.product_key)}"${x.product_key === r.key ? " selected" : ""}${lock ? " disabled" : ""}>${esc(plabel(x))}</option>`; }).join("")}`;
      const m = staged.filter(r => r.key).length;
      body.innerHTML = `<h2 class="serif osec">Check before saving</h2><p class="muted small">${staged.length} rows · ${m} matched · ${staged.length - m} not. Fix any match or price, then save.</p>
<div class="vprev">${staged.map((r, i) => `<div class="vpr${r.key ? "" : " un"}${r.bad ? " bad" : ""}"><b>${esc(r.name)} ${esc(r.strength)}</b><small>row ${r.row}${r.sku ? ` · ${esc(r.sku)}` : ""}${r.bad ? ` · ${esc(r.bad)}` : ""}</small>
<div class="vpctl"><select data-vpm="${i}" aria-label="Match for ${esc(r.name)}">${opts(r)}</select><label class="edp">$<input type="number" min="0" step="0.01" inputmode="decimal" data-vpc="${i}" value="${r.costStr === "" ? "" : r.cost}" placeholder="kit cost" aria-label="Kit cost"></label></div></div>`).join("")}</div>
<div class="rrbar"><button class="btn primary wide" type="button" data-vpsave>Save ${staged.length} rows to ${esc(vendors.find(x => x.id === vendorId)?.company_name || "vendor")}</button><button class="btn ghost wide" type="button" data-vpcancel style="margin-top:8px">Cancel</button></div>`;
    };
    el.onchange = async e => {
      if (e.target.matches("[data-vpv]")) { vendorId = e.target.value; staged = []; st.textContent = ""; showSaved(); return; } // his bug: kept the old review
      if (e.target.matches("[data-vpm]")) { const r = staged[+e.target.dataset.vpm]; r.key = e.target.value || null; review(); return; }
      if (e.target.matches("[data-vpf]")) {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; st.textContent = "Reading…";
        try {
          const X = await loadXLSX(), wb = /\.csv$/i.test(file.name) ? X.read(await file.text(), { type: "string" }) : X.read(new Uint8Array(await file.arrayBuffer()), { type: "array", sheetRows: 5001 });
          const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
          if (rows.length >= 5000) throw new Error("That sheet has more than 5,000 rows. Split it and upload in parts.");
          await loadSaved();
          const map = new Map(saved.filter(s => s.vendor_item_number && s.product_key).map(s => [norm(s.vendor_item_number) + "|" + normStrength(s.strength), s.product_key]));
          staged = rows.map((r, i) => { const name = get(r, "Product Name", "Product", "Name", "Peptide"), strength = get(r, "Strength", "Specification", "Specification per kit", "Size", "Vial Strength"), sku = get(r, "Vendor Item Number", "Vendor SKU", "Item Number", "Item #", "Item", "SKU", "Code"), key0 = get(r, "PST Product Key", "Product Key", "PST SKU"), costStr = get(r, "Kit Cost", "Price per Kit", "Kit Price", "Cost per Kit", "Price", "USD");
            let key = products.find(p => norm(p.product_key) === norm(key0))?.product_key || (sku ? map.get(norm(sku) + "|" + normStrength(strength)) : "") || "";
            if (!key) { const c = products.filter(p => p.display_name && matchName(p.display_name) === matchName(name) && normStrength(p.strength) === normStrength(strength)); if (c.length === 1) key = c[0].product_key; }
            return { row: i + 2, name, strength, sku, key: key || null, costStr, cost: Number(String(costStr).replace(/[$,]/g, "")) };
          }).filter(r => r.name || r.sku || r.key);
          const seen = new Set(); staged.forEach(r => { if (r.key) { if (seen.has(r.key)) r.key = null; else seen.add(r.key); } });
          if (!staged.length) throw new Error("No product rows found. The sheet needs a Product Name (or SKU) column and a Kit Cost column.");
          st.textContent = ""; review();
        } catch (err) { st.textContent = err.message || String(err); }
      }
    };
    el.oninput = e => {
      const c = e.target.closest("[data-vpc]"); if (c) { const r = staged[+c.dataset.vpc]; r.costStr = c.value; r.cost = Number(c.value); return; }
      if (e.target.matches("[data-vpq]")) { const q = e.target.value.trim().toLowerCase(); $$("[data-vpk]", el).forEach(x => x.hidden = !!q && !x.dataset.vpk.includes(q)); }
    };
    el.onclick = async e => {
      if (e.target.closest("[data-vpcancel]")) { staged = []; showSaved(); return; }
      if (e.target.closest("[data-vpsave]")) { // = save(), with his checks plus: a blank cost is an error, not $0
        staged.forEach(r => { r.bad = !r.name ? "needs a product name" : r.costStr === "" || !Number.isFinite(r.cost) || r.cost < 0 ? "needs a kit cost" : ""; });
        const bad = staged.filter(r => r.bad); if (bad.length) { review(); st.textContent = `${bad.length} row${bad.length === 1 ? "" : "s"} need fixing (first: spreadsheet row ${bad[0].row}).`; return; }
        const sk = staged.filter(r => r.sku).map(r => norm(r.sku) + "|" + normStrength(r.strength)); if (new Set(sk).size !== sk.length) { st.textContent = "The same SKU and strength appears twice. Fix the sheet and upload again."; return; }
        const ks = staged.filter(r => r.key).map(r => r.key); if (new Set(ks).size !== ks.length) { st.textContent = "One of your products is matched twice."; return; }
        const vn = vendors.find(x => x.id === vendorId)?.company_name || "this vendor";
        if (!(await window.PSTOps.confirmSheet(`Save ${staged.length} prices for ${vn}?`, "Matched items update the kit cost used on new purchase orders. Your shop prices don't change, and orders already placed keep their prices.", "Save prices"))) { review(); return; }
        const { data, error } = await P.client().rpc("pst_admin_import_vendor_catalog", { p_vendor_id: vendorId, p_rows: staged.map(r => ({ product_name: r.name, strength: r.strength, vendor_item_number: r.sku, kit_cost: r.cost, product_key: r.key || null })) });
        if (error) { review(); st.textContent = "Not saved: " + error.message; return; }
        staged = []; P.toast(`${data} prices saved for ${vn}`); st.textContent = ""; showSaved(); return;
      }
      const ed = e.target.closest("[data-vpe]"); if (ed) { const r = saved.find(x => x.id === ed.dataset.vpe); // one-row import through the same RPC
        const w = P.sheet(`<form class="osheet"><h2 class="serif">${esc(r.product_name)} ${esc(r.strength || "")}</h2><p class="muted small">${esc(r.vendor_item_number || "no SKU")}</p><label>Kit cost (10 vials)<input name="c" type="number" min="0" step="0.01" inputmode="decimal" required value="${Number(r.kit_cost || 0).toFixed(2)}"></label>
<label>Matches my product<select name="k"><option value="">Not one of my products</option>${products.map(x => `<option value="${esc(x.product_key)}"${x.product_key === r.product_key ? " selected" : ""}${saved.some(s => s.product_key === x.product_key && s.id !== r.id) ? " disabled" : ""}>${esc(plabel(x))}</option>`).join("")}</select></label><p class="status" data-vs1></p><button class="btn primary wide" type="submit">Save</button></form>`, { label: "Vendor price" });
        w.querySelector("form").addEventListener("submit", async ev => { ev.preventDefault(); const f = ev.target, c = Number(f.c.value);
          if (f.c.value === "" || !(c >= 0)) { f.querySelector("[data-vs1]").textContent = "Enter the kit cost."; return; }
          const { error } = await P.client().rpc("pst_admin_import_vendor_catalog", { p_vendor_id: vendorId, p_rows: [{ product_name: r.product_name, strength: r.strength ?? "", vendor_item_number: r.vendor_item_number ?? "", kit_cost: c, product_key: f.k.value || null }] });
          if (error) { f.querySelector("[data-vs1]").textContent = error.message; return; } P.closeSheet(); P.toast("Price saved"); showSaved(); });
        return; }
      const od = e.target.closest("[data-vpo]"); if (od) { const r = saved.find(x => x.id === od.dataset.vpo);
        const w = P.sheet(`<form class="osheet"><h2 class="serif">Order ${esc(r.product_name)} ${esc(r.strength || "")}</h2><p class="muted small">It isn't one of your products yet, so it goes on a purchase order but can't be received into stock until it's set up and matched.</p>
<label>Kits (10 vials each)<input name="k" type="number" min="1" max="10000" step="1" inputmode="numeric" value="1" required></label><p class="muted small" data-vo2>${usd(r.kit_cost)} per kit</p><p class="status" data-vs2></p><button class="btn primary wide" type="submit">Create purchase order</button></form>`, { label: "Order vendor item" });
        const f = w.querySelector("form"); f.k.addEventListener("input", () => { f.querySelector("[data-vo2]").textContent = `${Math.max(0, Math.trunc(Number(f.k.value) || 0))} kit(s) · ${usd(Math.trunc(Number(f.k.value) || 0) * Number(r.kit_cost || 0))}`; });
        f.addEventListener("submit", async ev => { ev.preventDefault(); const k = Math.trunc(Number(f.k.value)); if (!(k >= 1)) { f.querySelector("[data-vs2]").textContent = "At least 1 kit."; return; }
          const { data, error } = await P.client().rpc("pst_admin_order_vendor_only_item", { p_item_id: r.id, p_kits: k }); if (error) { f.querySelector("[data-vs2]").textContent = error.message; return; }
          P.closeSheet(); P.toast(`${data} created`); });
      }
    };
    showSaved();
  }
  window.PSTOps5 = { vendorPricesPane };
})();
