/* Pep Shop Texas · owner app stage 3 (v5.0), part 2: vendor price lists (= vendor-prices.html).
   v5.15: Replace a vendor's list (default) or only add/update, Clear the list, Remove one item, and PDF price lists.
   The uploaded file itself is kept as that vendor's price-list file (one per vendor, private bucket vendor-price-lists).
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

  let PJ = null;
  const loadPdfJs = () => PJ || (PJ = new Promise((res, rej) => { if (window.pdfjsLib) return res(window.pdfjsLib); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); }; s.onerror = () => { PJ = null; rej(new Error("Couldn't load the PDF reader. Check the connection and try again.")); }; document.head.appendChild(s); }));
/* Vendor price-list PDF → rows like a spreadsheet: [{ "Product Name", "Strength", "SKU", "Kit Cost" }].
   Reads the PDF's text layer in the browser (pdf.js, loaded only when a PDF is picked). Two passes:
   1) a header row (Product/Name … Price/Cost …) sets the columns, every line below is split into those columns;
   2) no header found: each line is read as "[code] name strength … price".
   Scanned (image-only) PDFs have no text layer: those return [] and the caller asks for Excel/CSV. */
  async function pdfRows(file, loadPdfJs) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let pn = 1; pn <= Math.min(doc.numPages, 40); pn++) {
    const page = await doc.getPage(pn), tc = await page.getTextContent();
    const items = tc.items.filter(i => String(i.str).trim()).map(i => ({ s: String(i.str).trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) { const r = rows.find(r => Math.abs(r.y - it.y) <= 3); if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] }); }
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const cells = []; // merge pieces that touch into one cell
      for (const it of r.items) { const c = cells[cells.length - 1]; if (c && it.x - (c.x + c.w) < 6) { c.s += (it.x - (c.x + c.w) > 1.5 ? " " : "") + it.s; c.w = it.x + it.w - c.x; } else cells.push({ ...it }); }
      lines.push({ page: pn, cells });
    }
  }
  const STR = /(\d+(?:\.\d+)?)\s*(mg|mcg|μg|ug|iu|ml)\b/i;
  const PRICE = /^\$?\s*(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:usd|\$)?$/i;
  const H = { name: /^(product|product name|name|peptide|item name|description|products?)$/i, strength: /^(strength|spec|specs|specification|size|dosage|mg|content|vial)$/i,
    sku: /^(sku|code|item|item ?#|item no\.?|cat(alog)? ?(no|#)\.?|product code)$/i, idx: /^(no\.?|#|s\.?n\.?|s\/n)$/i, cost: /(price|cost|usd|\$|kit|per kit|10 ?vials?|box)/i };
  const kind = s => { const t = s.trim().toLowerCase().replace(/[:：]$/, ""); return H.idx.test(t) ? "idx" : H.name.test(t) ? "name" : H.strength.test(t) ? "strength" : H.sku.test(t) ? "sku" : H.cost.test(t) && t.length < 30 ? "cost" : null; };
  let hdr = null, out = [];
  for (const ln of lines) {
    const kinds = ln.cells.map(c => kind(c.s));
    if (kinds.includes("name") && kinds.includes("cost")) { hdr = { page: ln.page, cols: ln.cells.map((c, i) => ({ k: kinds[i], x: c.x + c.w / 2 })).filter(c => c.k) }; continue; }
    if (hdr) {
      const rec = {};
      for (const c of ln.cells) { const mid = c.x + c.w / 2; let best = null, d = Infinity; for (const h of hdr.cols) { const e = Math.abs(h.x - mid); if (e < d) { d = e; best = h; } } if (best) rec[best.k] = rec[best.k] ? rec[best.k] + " " + c.s : c.s; }
      if (rec.name && rec.cost) {
        let name = rec.name.trim(), strength = (rec.strength || "").trim();
        if (!strength) { const m = name.match(STR); if (m) { strength = m[0].replace(/\s+/g, ""); name = name.replace(m[0], "").trim(); } }
        const pm = String(rec.cost).replace(/[^\d.,$]/g, " ").trim().split(/\s+/).pop() || "";
        if (PRICE.test(pm)) out.push({ "Product Name": name.replace(/\s*[-–]\s*$/, ""), "Strength": strength, "SKU": (rec.sku || "").trim(), "Kit Cost": pm.replace(/[$,]/g, "") });
      }
      continue;
    }
  }
  if (out.length) return out;
  // no header: read each line as "[code] name strength … price"
  for (const ln of lines) {
    const text = ln.cells.map(c => c.s).join("  ");
    const sm = text.match(STR); if (!sm) continue;
    const prices = [...text.matchAll(/\$\s*(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)|(?:^|\s)(\d{1,5}(?:\.\d{1,2}))(?=\s|$)/g)].map(m => m[1] || m[2]).filter(Boolean);
    if (!prices.length) continue;
    const before = text.slice(0, sm.index).trim();
    const cm = before.match(/^([A-Z]{1,5}[-_]?\d{1,6}[A-Z]?)\s+(.*)$/);
    const name = (cm ? cm[2] : before).replace(/\s{2,}/g, " ").replace(/[-–:|]+$/, "").trim();
    if (!name || name.length > 80) continue;
    out.push({ "Product Name": name, "Strength": sm[0].replace(/\s+/g, ""), "SKU": cm ? cm[1] : "", "Kit Cost": prices[prices.length - 1].replace(/,/g, "") });
  }
  return out;
}

  if (!document.getElementById("vpmode-css")) { const c = document.createElement("style"); c.id = "vpmode-css"; c.textContent = ".vpmode{border:1px solid var(--line,#d9dee5);border-radius:12px;padding:6px 12px;margin:10px 0;display:grid;gap:2px}.vpmode label{display:grid;grid-template-columns:22px 1fr;align-items:start;gap:0 6px;padding:8px 0;margin:0;font-weight:400}.vpmode label+label{border-top:1px solid var(--line,#d9dee5)}.vpmode input{margin:3px 0 0}.vpmode small{grid-column:2;color:var(--muted,#6b7785);font-size:13px}.vpfile{display:grid;grid-template-columns:28px 1fr;gap:4px 8px;align-items:start;border:1px solid var(--line,#d9dee5);border-radius:12px;padding:12px;margin:10px 0}.vpfile>span:first-child{font-size:20px;line-height:1.2}.vpfile b{display:block;overflow-wrap:anywhere}.vpfile small{display:block;color:var(--muted,#6b7785);font-size:13px}"; document.head.appendChild(c); }
  const rowKey = (sku, strength) => `${sku ?? ""}|${strength ?? ""}`; // = the server's replace check
  let products = [], vendors = [], saved = [], vendorId = "", staged = [], mode = "replace", stagedFrom = "", stagedFile = null, fileRec = null;
  const FB = "vendor-price-lists";
  const plabel = p => `${p.display_name || p.product_key}${p.strength ? ` ${p.strength}` : ""}`;
  async function loadSaved() {
    const { data, error } = await P.client().from("pst_vendor_catalog_items").select("id,product_key,product_name,strength,vendor_item_number,kit_cost").eq("vendor_id", vendorId).order("product_name");
    if (error) throw error; saved = data || [];
  }
  async function loadFile() {
    const { data, error } = await P.client().from("pst_vendor_price_files").select("id,file_name,storage_path,size_bytes,item_count,uploaded_at").eq("vendor_id", vendorId);
    fileRec = error ? null : (data || [])[0] || null; // table missing (SQL not run yet) = no file
  }
  // Keep the uploaded file as this vendor's price-list file; the old one is replaced. Returns "" or a problem.
  async function keepFile(file, count) {
    const safe = file.name.replace(/[^\w.\-]+/g, "-").slice(-80), path = `${vendorId}/${Date.now()}-${safe}`;
    const up = await P.client().storage.from(FB).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (up.error) return up.error.message;
    const old = fileRec?.storage_path;
    const row = { vendor_id: vendorId, file_name: file.name, storage_path: path, content_type: file.type || null, size_bytes: file.size, item_count: count, uploaded_at: new Date().toISOString() };
    const r = await P.client().from("pst_vendor_price_files").upsert(row, { onConflict: "vendor_id" });
    if (r.error) { await P.client().storage.from(FB).remove([path]); return r.error.message; }
    if (old && old !== path) await P.client().storage.from(FB).remove([old]);
    return "";
  }
  const fileCard = vn => fileRec
    ? `<div class="vpfile"><span aria-hidden="true">📄</span><span><b>${esc(fileRec.file_name)}</b><small>${esc(vn)}'s price list · ${new Date(fileRec.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${fileRec.item_count != null ? ` · ${fileRec.item_count} items` : ""}</small>
<span class="vpact"><button type="button" class="linkish" data-vpview>View</button> · <button type="button" class="linkish" data-vpfdel>Remove file</button></span></span></div>`
    : `<p class="muted small">No price list file saved for ${esc(vn)} yet. The file you upload is kept here.</p>`;
  async function vendorPricesPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const [v, p] = await Promise.all([P.client().from("vendors").select("id,company_name,pst_vendor_id,is_active").order("company_name"), P.client().from("product_catalog").select("product_key,display_name,sort_name,strength").order("sort_name")]);
    if (v.error || p.error) { el.innerHTML = `<p class="notice err">${esc((v.error || p.error).message)}</p>`; return; }
    vendors = v.data || []; products = (p.data || []).sort((a, b) => plabel(a).localeCompare(plabel(b), undefined, { numeric: true, sensitivity: "base" }));
    if (!vendors.some(x => x.id === vendorId)) vendorId = (vendors.find(x => x.is_active !== false) || vendors[0] || {}).id || "";
    staged = [];
    el.innerHTML = `<label>Vendor<select data-vpv>${vendors.map(x => `<option value="${x.id}"${x.id === vendorId ? " selected" : ""}>${esc(x.company_name)}${x.pst_vendor_id ? ` · ${esc(x.pst_vendor_id)}` : ""}</option>`).join("")}</select></label>
<label class="btn primary wide adpick">Upload a price list (Excel, CSV or PDF)<input type="file" data-vpf accept=".xlsx,.xls,.csv,.pdf,application/pdf" hidden></label>
<p class="muted small">Prices are per 10-vial kit. Uploading never changes your shop prices. Rows that match your products fill in automatically on new purchase orders.</p>
<p class="status" data-vps role="status"></p><div data-vpbody></div>`;
    const body = el.querySelector("[data-vpbody]"), st = el.querySelector("[data-vps]");
    const showSaved = async () => {
      if (!vendorId) { body.innerHTML = `<p class="muted small">Add a vendor first under More → Vendors.</p>`; return; }
      body.innerHTML = `<p class="muted small">Loading…</p>`;
      try { await Promise.all([loadSaved(), loadFile()]); } catch (e) { body.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
      const m = saved.filter(r => r.product_key).length, byKey = Object.fromEntries(products.map(x => [x.product_key, x]));
      // matched items show and sort by his product name (BAC Water matched to PST Recon → "PST Recon", under P); the vendor's own name stays in the small line
      const sname = r => r.product_key && byKey[r.product_key] ? plabel(byKey[r.product_key]) : `${r.product_name} ${r.strength || ""}`.trim();
      body.innerHTML = `${fileCard(vendors.find(x => x.id === vendorId)?.company_name || "This vendor")}<input class="psearch" type="search" data-vpq placeholder="Search this vendor's list" aria-label="Search vendor list"><p class="muted small">${saved.length} item${saved.length === 1 ? "" : "s"} · ${m} matched to your products · ${saved.length - m} not${saved.length ? ` · <button type="button" class="linkish" data-vpclear>Clear this list</button>` : ""}</p>
<div class="shelf">${[...saved].sort((a, b) => sname(a).localeCompare(sname(b), undefined, { numeric: true, sensitivity: "base" })).map(r => `<div class="shrow vprow${r.product_key ? "" : " low"}" data-vpk="${esc(`${r.product_name} ${r.strength} ${r.vendor_item_number} ${r.product_key || ""} ${sname(r)}`.toLowerCase())}"><span></span><span><b>${esc(sname(r))}</b><small>${r.product_key ? `${esc(`Vendor: ${r.product_name} ${r.strength || ""}`.trim())} · ` : ""}${esc(r.vendor_item_number || "no SKU")}${r.product_key ? "" : " · not one of your products"}</small>
<span class="vpact"><button type="button" class="linkish" data-vpe="${r.id}">Change price</button>${r.product_key ? "" : ` · <button type="button" class="linkish" data-vpo="${r.id}">Order it</button>`} · <button type="button" class="linkish" data-vpdel="${r.id}">Remove</button></span></span><em>${usd(r.kit_cost)}</em></div>`).join("") || `<p class="muted small">No price list for this vendor yet.</p>`}</div>`;
    };
    const review = () => {
      const claimed = new Map(staged.filter(r => r.key).map(r => [r.key, r])), savedOther = k => saved.find(s => s.product_key === k);
      const opts = r => `<option value="">Not one of my products</option>${products.map(x => { const other = savedOther(x.product_key), lock = (claimed.has(x.product_key) && claimed.get(x.product_key) !== r) || (other && (norm(other.vendor_item_number) + "|" + normStrength(other.strength)) !== (norm(r.sku) + "|" + normStrength(r.strength))); return `<option value="${esc(x.product_key)}"${x.product_key === r.key ? " selected" : ""}${lock ? " disabled" : ""}>${esc(plabel(x))}</option>`; }).join("")}`;
      const m = staged.filter(r => r.key).length, vn = esc(vendors.find(x => x.id === vendorId)?.company_name || "this vendor");
      const keep = new Set(staged.map(r => rowKey(r.sku, r.strength))), drop = saved.filter(s => !keep.has(rowKey(s.vendor_item_number, s.strength))).length;
      body.innerHTML = `<h2 class="serif osec">Check before saving</h2><p class="muted small">${esc(stagedFrom)} · ${staged.length} rows · ${m} matched · ${staged.length - m} not. Fix any match or price, then save.</p>
${saved.length ? `<fieldset class="vpmode"><label><input type="radio" name="vpmode" value="replace"${mode === "replace" ? " checked" : ""}> <b>Replace ${vn}'s list</b><small>${drop ? `${drop} saved item${drop === 1 ? "" : "s"} not in this file will be removed` : "Nothing saved goes away"}</small></label>
<label><input type="radio" name="vpmode" value="add"${mode === "add" ? " checked" : ""}> <b>Only add and update</b><small>Keeps all ${saved.length} saved items, updates the ones in this file</small></label></fieldset>` : ""}
<div class="vprev">${staged.map((r, i) => `<div class="vpr${r.key ? "" : " un"}${r.bad ? " bad" : ""}"><b>${esc(r.name)} ${esc(r.strength)}</b><small>${stagedFrom && /\.pdf$/i.test(stagedFrom) ? "line" : "row"} ${r.row}${r.sku ? ` · ${esc(r.sku)}` : ""}${r.bad ? ` · ${esc(r.bad)}` : ""}</small>
<div class="vpctl"><select data-vpm="${i}" aria-label="Match for ${esc(r.name)}">${opts(r)}</select><label class="edp">$<input type="number" min="0" step="0.01" inputmode="decimal" data-vpc="${i}" value="${r.costStr === "" ? "" : r.cost}" placeholder="kit cost" aria-label="Kit cost"></label></div></div>`).join("")}</div>
<div class="rrbar"><button class="btn primary wide" type="button" data-vpsave>${saved.length && mode === "replace" ? "Replace with" : "Save"} ${staged.length} rows${saved.length && mode === "replace" ? "" : ` to ${vn}`}</button><button class="btn ghost wide" type="button" data-vpcancel style="margin-top:8px">Cancel</button></div>`;
    };
    el.onchange = async e => {
      if (e.target.matches("[data-vpv]")) { vendorId = e.target.value; staged = []; stagedFile = null; st.textContent = ""; showSaved(); return; } // his bug: kept the old review
      if (e.target.name === "vpmode") { mode = e.target.value; review(); return; }
      if (e.target.matches("[data-vpm]")) { const r = staged[+e.target.dataset.vpm]; r.key = e.target.value || null; review(); return; }
      if (e.target.matches("[data-vpf]")) {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; st.textContent = "Reading…";
        try {
          const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
          let rows;
          if (isPdf) {
            rows = await pdfRows(file, loadPdfJs);
            if (!rows.length) { stagedFile = file; st.innerHTML = `Couldn't read prices from that PDF (it may be a scan or a picture). <button type="button" class="linkish" data-vpkeep>Keep it as ${esc(vendors.find(x => x.id === vendorId)?.company_name || "this vendor")}'s price list file</button> and type prices with Change price, or ask the vendor for the Excel/CSV list.`; return; }
          } else {
            const X = await loadXLSX(), wb = /\.csv$/i.test(file.name) ? X.read(await file.text(), { type: "string" }) : X.read(new Uint8Array(await file.arrayBuffer()), { type: "array", sheetRows: 5001 });
            rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
          }
          if (rows.length >= 5000) throw new Error("That sheet has more than 5,000 rows. Split it and upload in parts.");
          await loadSaved();
          const map = new Map(saved.filter(s => s.vendor_item_number && s.product_key).map(s => [norm(s.vendor_item_number) + "|" + normStrength(s.strength), s.product_key]));
          staged = rows.map((r, i) => { const name = get(r, "Product Name", "Product", "Name", "Peptide"), strength = get(r, "Strength", "Specification", "Specification per kit", "Size", "Vial Strength"), sku = get(r, "Vendor Item Number", "Vendor SKU", "Item Number", "Item #", "Item", "SKU", "Code"), key0 = get(r, "PST Product Key", "Product Key", "PST SKU"), costStr = get(r, "Kit Cost", "Price per Kit", "Kit Price", "Cost per Kit", "Price", "USD");
            let key = products.find(p => norm(p.product_key) === norm(key0))?.product_key || (sku ? map.get(norm(sku) + "|" + normStrength(strength)) : "") || "";
            if (!key) { const c = products.filter(p => p.display_name && matchName(p.display_name) === matchName(name) && normStrength(p.strength) === normStrength(strength)); if (c.length === 1) key = c[0].product_key; }
            return { row: isPdf ? i + 1 : i + 2, name, strength, sku, key: key || null, costStr, cost: Number(String(costStr).replace(/[$,]/g, "")) };
          }).filter(r => r.name || r.sku || r.key);
          const seen = new Set(); staged.forEach(r => { if (r.key) { if (seen.has(r.key)) r.key = null; else seen.add(r.key); } });
          if (!staged.length) throw new Error("No product rows found. The sheet needs a Product Name (or SKU) column and a Kit Cost column.");
          if (staged.length > 1000) throw new Error(`That list has ${staged.length} items; the most in one upload is 1,000.`);
          stagedFrom = file.name; stagedFile = file; mode = "replace"; st.textContent = ""; review();
        } catch (err) { st.textContent = err.message || String(err); }
      }
    };
    el.oninput = e => {
      const c = e.target.closest("[data-vpc]"); if (c) { const r = staged[+c.dataset.vpc]; r.costStr = c.value; r.cost = Number(c.value); return; }
      if (e.target.matches("[data-vpq]")) { const q = e.target.value.trim().toLowerCase(); $$("[data-vpk]", el).forEach(x => x.hidden = !!q && !x.dataset.vpk.includes(q)); }
    };
    el.onclick = async e => {
      if (e.target.closest("[data-vpcancel]")) { staged = []; stagedFile = null; showSaved(); return; }
      if (e.target.closest("[data-vpsave]")) { // = save(), with his checks plus: a blank cost is an error, not $0
        staged.forEach(r => { r.bad = !r.name ? "needs a product name" : r.costStr === "" || !Number.isFinite(r.cost) || r.cost < 0 ? "needs a kit cost" : ""; });
        const bad = staged.filter(r => r.bad); if (bad.length) { review(); st.textContent = `${bad.length} row${bad.length === 1 ? "" : "s"} need fixing (first: row ${bad[0].row}).`; return; }
        const sk = staged.filter(r => r.sku).map(r => norm(r.sku) + "|" + normStrength(r.strength)); if (new Set(sk).size !== sk.length) { st.textContent = "The same SKU and strength appears twice. Fix the sheet and upload again."; return; }
        const ks = staged.filter(r => r.key).map(r => r.key); if (new Set(ks).size !== ks.length) { st.textContent = "One of your products is matched twice."; return; }
        const vn = vendors.find(x => x.id === vendorId)?.company_name || "this vendor", repl = saved.length > 0 && mode === "replace";
        const keep = new Set(staged.map(r => rowKey(r.sku, r.strength))), drop = repl ? saved.filter(s => !keep.has(rowKey(s.vendor_item_number, s.strength))).length : 0;
        const ok = await window.PSTOps.confirmSheet(repl ? `Replace ${vn}'s price list?` : `Save ${staged.length} prices for ${vn}?`,
          (repl ? `The list becomes these ${staged.length} items${drop ? ` and ${drop} old item${drop === 1 ? "" : "s"} not in this file ${drop === 1 ? "is" : "are"} removed` : ""}. ` : "") + "Matched items update the kit cost used on new purchase orders. Your shop prices don't change, and orders already placed keep their prices.", repl ? "Replace list" : "Save prices");
        if (!ok) { review(); return; }
        const p_rows = staged.map(r => ({ product_name: r.name, strength: r.strength, vendor_item_number: r.sku, kit_cost: r.cost, product_key: r.key || null }));
        const { data, error } = await P.client().rpc(repl ? "pst_admin_replace_vendor_catalog" : "pst_admin_import_vendor_catalog", { p_vendor_id: vendorId, p_rows });
        if (error) { review(); st.textContent = "Not saved: " + error.message; return; }
        const n = repl ? data.saved : data, fp = stagedFile ? await keepFile(stagedFile, n) : "";
        staged = []; stagedFile = null; P.toast((repl ? `${vn}: ${n} prices saved${data.removed ? `, ${data.removed} old removed` : ""}` : `${n} prices saved for ${vn}`) + (fp ? " (the file itself wasn't kept)" : ", file kept")); st.textContent = fp ? "Prices saved, but the file wasn't kept: " + fp : ""; showSaved(); return;
      }
      if (e.target.closest("[data-vpkeep]")) { const vn = vendors.find(x => x.id === vendorId)?.company_name || "this vendor"; await loadFile();
        const fp = await keepFile(stagedFile, null); stagedFile = null; st.textContent = fp ? "File not kept: " + fp : ""; if (!fp) P.toast(`Kept as ${vn}'s price list file`); showSaved(); return;
      }
      if (e.target.closest("[data-vpview]")) { const w = window.open("", "_blank"); // open first so phones don't block it
        const { data, error } = await P.client().storage.from(FB).createSignedUrl(fileRec.storage_path, 300);
        if (error) { w?.close(); st.textContent = error.message; return; } if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl; return;
      }
      if (e.target.closest("[data-vpfdel]")) { const vn = vendors.find(x => x.id === vendorId)?.company_name || "this vendor";
        if (!(await window.PSTOps.confirmSheet(`Remove ${vn}'s price list file?`, "Only the file is removed. The prices saved from it stay.", "Remove file"))) return;
        const r = await P.client().from("pst_vendor_price_files").delete().eq("vendor_id", vendorId); if (r.error) { st.textContent = r.error.message; return; }
        await P.client().storage.from(FB).remove([fileRec.storage_path]); P.toast("File removed"); showSaved(); return;
      }
      if (e.target.closest("[data-vpclear]")) {
        const vn = vendors.find(x => x.id === vendorId)?.company_name || "this vendor";
        if (!(await window.PSTOps.confirmSheet(`Clear ${vn}'s price list?`, `All ${saved.length} items come off, and new purchase orders won't fill in ${vn}'s prices until you upload a list again. Orders already placed keep their prices.`, "Clear list"))) return;
        const { data, error } = await P.client().rpc("pst_admin_clear_vendor_catalog", { p_vendor_id: vendorId });
        if (error) { st.textContent = "Not cleared: " + error.message; return; }
        P.toast(`${vn}'s list cleared (${data} items)`); showSaved(); return;
      }
      const dl = e.target.closest("[data-vpdel]"); if (dl) { const r = saved.find(x => x.id === dl.dataset.vpdel); if (!r) return;
        if (!(await window.PSTOps.confirmSheet(`Remove ${r.product_name} ${r.strength || ""}?`, r.product_key ? "It comes off this vendor's list, and new purchase orders won't fill in this vendor's price for it." : "It comes off this vendor's list.", "Remove"))) return;
        const { error } = await P.client().rpc("pst_admin_delete_vendor_catalog_item", { p_item_id: r.id });
        if (error) { st.textContent = "Not removed: " + error.message; return; }
        P.toast("Removed"); showSaved(); return;
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
