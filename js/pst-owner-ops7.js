/* Pep Shop Texas · owner app stage 3 (v5.0), part 4: report writer (= report-writer.html).
   Same sources, same AND filters, same saved_report_templates table and configuration shape,
   so reports he already saved on the computer open here and the other way round. */
(function () {
  "use strict";
  const P = window.PST, { $$, esc, money } = P;
  const SRC = {
    orders: ["Orders", "orders", "created_at", "id,customer_id,order_number,status,subtotal,shipping,tax,total,shipping_name,shipping_email,shipping_phone,shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_zip,payment_method,payment_status,tracking_number,tracking_carrier,customer_notes,admin_notes,created_at,updated_at,order_status,discount_code,discount_amount,refund_status,refund_amount"],
    order_items: ["Order items", "order_items", "created_at", "id,order_id,product_id,product_name,product_strength,product_category,quantity,unit_price,line_total,created_at"],
    customer_profiles: ["Customers", "customer_profiles", "created_at", "user_id,first_name,last_name,email,phone,shipping_address,shipping_city,shipping_state,shipping_zip,account_status,admin_notes,created_at,updated_at,marketing_opt_in,marketing_opt_out,customer_tags,research_role,customer_number"],
    product_inventory: ["Product inventory", "product_inventory", "updated_at", "id,product_key,display_name,category,strength,price,current_inventory,low_stock_threshold,limited_stock_threshold,is_active,featured,blend_stack,created_at,updated_at,cost_per_unit,coa_url,coa_label"],
    product_catalog: ["Product catalog", "product_catalog", "updated_at", "id,product_key,display_name,strength,category,admin_only,price,current_inventory,is_active,featured,blend_stack,sort_name,created_at,updated_at,hot_peptide,sale_enabled,sale_price,sale_label,coa_url,coa_label"],
    incoming_inventory: ["Incoming (purchase orders)", "incoming_inventory", "ordered_at", "id,po_number,product_id,product_key,product_name,ordered_quantity,kit_cost,kit_vial_count,cost_per_unit,shipping_cost,total_cost,supplier_name,tracking_number,status,notes,ordered_at,expected_arrival_date,received_at,received_quantity,vendor_name,lead_time_days"],
    inventory_movements: ["Stock moves", "inventory_movements", "created_at", "id,product_id,product_key,movement_type,quantity_change,previous_quantity,new_quantity,admin_note,created_by_email,created_at"],
    operating_expenses: ["Expenses", "operating_expenses", "date", "id,date,category,description,amount,method,created_by_email,created_at,updated_at"],
    discount_codes: ["Discount codes", "discount_codes", "created_at", "id,code,discount_type,percent_off,amount_off,max_uses,times_used,active,expires_at,created_at"],
    discount_usage: ["Discount usage", "discount_usage", "used_at", "id,discount_id,order_id,customer_email,amount_saved,used_at"],
    customer_credits: ["Store credit", "customer_credits", "created_at", "id,user_id,customer_email,customer_name,amount,remaining_amount,reason,related_order_number,source,status,created_at"],
    order_audit_log: ["Order history", "order_audit_log", "created_at", "id,order_id,order_number,action_type,field_name,old_value,new_value,changed_by_email,created_at"],
    site_promotions: ["Promotions", "site_promotions", "created_at", "id,title,body,badge,is_active,starts_at,ends_at,sort_order,created_at"],
    site_payment_options: ["Payment options", "site_payment_options", "updated_at", "id,payment_methods,venmo_enabled,venmo_handle,updated_at"],
    admin_users: ["Admins", "admin_users", "created_at", "user_id,created_at,email,is_active"],
    vendors: ["Vendors", "vendors", "created_at", "id,pst_vendor_id,company_name,address,contact_name,standard_shipping_lead_time,whatsapp_number,is_active,created_at"],
    product_key_aliases: ["Product key aliases", "product_key_aliases", "created_at", "old_product_key,new_product_key,product_id,display_name,strength,migration_label,created_at"],
    inventory_labels: ["Labels (on hand + incoming)", "product_inventory", null, "display_name,sort_name,label_color,strength,product_key,current_inventory,incoming_quantity,total_quantity,inventory_status,last_order_date,last_received_date"]
  };
  const EXTRA = ["inventory_status", "last_order_date", "last_received_date"], PRODUCT_SRC = ["product_inventory", "product_catalog", "order_items", "incoming_inventory", "inventory_movements", "inventory_labels"];
  const lab = f => String(f).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const MONEY = /(amount|total|price|cost|tax|subtotal|credit|refund_amount|amount_saved)$/i;
  const fmt = (f, v) => { if (v === null || v === undefined) return ""; if (typeof v === "object") return JSON.stringify(v); if (typeof v === "number" && MONEY.test(f)) return money(v); if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && MONEY.test(f)) return money(Number(v)); return String(v); }; // FIX: his preview blanked text like shipping_name
  const z = n => String(n).padStart(2, "0"), ymd = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  function presetDates(p) { const t = new Date(), back = n => { const d = new Date(t); d.setDate(d.getDate() - n); return ymd(d); }; // FIX: local days, not UTC
    return p === "today" ? [ymd(t), ymd(t)] : p === "7" ? [back(6), ymd(t)] : p === "30" ? [back(29), ymd(t)] : p === "mtd" ? [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)] : p === "all" ? ["", ""] : null; }
  const isoStart = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toISOString(); }, isoEnd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(); };

  let S = null, fields = [], rows = [], lookups = null, templates = [], editingId = null;
  const fresh = () => ({ name: "", source: "orders", fields: [], datePreset: "all", startDate: "", endDate: "", sorts: [{ field: "", direction: "desc" }], limitRows: "50", filters: [] });
  async function loadFields(src) {
    const c = SRC[src], base = c[3].split(",");
    if (src === "inventory_labels") return base;
    const { data } = await P.client().from(c[1]).select("*").limit(1);
    const live = data?.[0] ? Object.keys(data[0]) : [];
    return [...new Set([...live, ...base.filter(f => !live.length || live.includes(f))]), ...(PRODUCT_SRC.includes(src) ? EXTRA : [])];
  }
  async function loadLookups() {
    const [cat, inv, inc] = await Promise.all([P.client().from("product_catalog").select("product_key,display_name,strength,sort_name,label_color").limit(5000), P.client().from("product_inventory").select("id,product_key,display_name,strength,cost_per_unit,current_inventory,is_active").limit(5000),
      P.client().from("incoming_inventory").select("id,product_id,product_key,status,ordered_at,received_at,ordered_quantity,received_quantity,product_name").limit(5000)]);
    lookups = { cat: cat.data || [], inv: inv.data || [], inc: inc.data || [] };
  }
  const lk = v => String(v || "").toLowerCase();
  function product(row) { const L = lookups; if (!L) return null; const id = S.source === "product_inventory" || S.source === "inventory_labels" ? row.id : row.product_id;
    return L.inv.find(p => id && String(p.id) === String(id)) || L.inv.find(p => row.product_key && lk(p.product_key) === lk(row.product_key)) || L.inv.find(p => lk(p.display_name) === lk(row.display_name || row.product_name) && (!row.strength && !row.product_strength || lk(p.strength) === lk(row.strength || row.product_strength))) || null; }
  function history(p) { // = inventoryHistoryFor
    if (!p) return { status: "Not linked", lastO: null, lastR: null };
    const r = lookups.inc.filter(x => (x.product_id && String(x.product_id) === String(p.id)) || (x.product_key && lk(x.product_key) === lk(p.product_key)));
    const mx = k => r.map(x => x[k]).filter(Boolean).sort().pop() || null, open = r.filter(x => ["ordered", "in_transit", "issue_shorted"].includes(x.status)).sort((a, b) => String(b.ordered_at).localeCompare(String(a.ordered_at)))[0], s = Number(p.current_inventory || 0);
    const status = open?.status === "issue_shorted" ? (s > 0 ? "In Stock / Issue" : "Order Issue") : open?.status === "in_transit" ? (s > 0 ? "In Stock / Transit" : "In Transit") : open?.status === "ordered" ? (s > 0 ? "In Stock / On Order" : "On Order") : s > 0 ? "In Stock" : "Out of Stock";
    return { status, lastO: mx("ordered_at"), lastR: mx("received_at") };
  }
  const dshort = v => v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";
  function value(row, f) {
    const computedCat = (f === "sort_name" || f === "label_color") && S.source !== "product_catalog";
    if (!EXTRA.includes(f) && !computedCat) return row[f];
    const p = product(row);
    if (computedCat) { const c = lookups.cat.find(x => p && x.product_key === p.product_key) || lookups.cat.find(x => lk(x.display_name) === lk(row.display_name) && lk(x.strength) === lk(row.strength)); return c?.[f] || ""; }
    const h = history(p); return f === "inventory_status" ? h.status : f === "last_order_date" ? dshort(h.lastO) : dshort(h.lastR);
  }
  async function fetchRows() {
    const c = SRC[S.source]; if (PRODUCT_SRC.includes(S.source)) await loadLookups();
    if (S.source === "inventory_labels") { // = buildLabelRows
      return lookups.inv.map(p => { const on = Number(p.current_inventory || 0), inc = lookups.inc.filter(x => (x.product_id && String(x.product_id) === String(p.id)) || (x.product_key && lk(x.product_key) === lk(p.product_key))).filter(x => ["ordered", "in_transit", "issue_shorted"].includes(x.status)).reduce((s, x) => s + Math.max(0, Number(x.ordered_quantity || 0) - Number(x.received_quantity || 0)), 0);
        return on > 0 || inc > 0 ? { ...p, incoming_quantity: inc, total_quantity: on + inc } : null; }).filter(Boolean);
    }
    const live = fields.filter(f => !EXTRA.includes(f) && !(["sort_name", "label_color"].includes(f) && S.source !== "product_catalog"));
    const ident = { product_inventory: ["id", "product_key", "display_name", "strength"], product_catalog: ["id", "product_key", "display_name", "strength"], order_items: ["product_id", "product_name", "product_strength"], incoming_inventory: ["product_id", "product_key", "product_name"], inventory_movements: ["product_id", "product_key"] }[S.source] || [];
    const sel = [...new Set([...S.fields, ...S.sorts.map(s => s.field).filter(Boolean), ...ident])].filter(f => live.includes(f));
    const stable = live.includes("id") ? "id" : live[0], out = [];
    for (let from = 0; ; from += 1000) {
      let q = P.client().from(c[1]).select(sel.join(",") || "*").order(stable, { ascending: true }).range(from, from + 999);
      for (const x of S.filters) { if (!x.field || x.value === "" || !live.includes(x.field)) continue; q = x.op === "equals" ? q.eq(x.field, x.value) : x.op === "not_equals" ? q.neq(x.field, x.value) : x.op === "gte" ? q.gte(x.field, x.value) : x.op === "lte" ? q.lte(x.field, x.value) : q.ilike(x.field, `%${x.value}%`); }
      if (c[2] && S.startDate) q = q.gte(c[2], c[2] === "date" ? S.startDate : isoStart(S.startDate));
      if (c[2] && S.endDate) q = q.lte(c[2], c[2] === "date" ? S.endDate : isoEnd(S.endDate));
      const { data, error } = await q; if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    return out;
  }
  const cmp = (a, b) => { const ea = a === null || a === undefined || a === "", eb = b === null || b === undefined || b === ""; if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; const na = Number(a), nb = Number(b); if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== "" && String(b).trim() !== "") return na - nb; return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }); };
  function sortRows() { const ss = S.sorts.filter(s => s.field); rows.sort((a, b) => { for (const s of ss) { const va = value(a, s.field), vb = value(b, s.field), ea = va === null || va === undefined || va === "", eb = vb === null || vb === undefined || vb === ""; if (ea !== eb) return ea ? 1 : -1; const r = cmp(va, vb) * (s.direction === "asc" ? 1 : -1); if (r) return r; } return 0; }); } // FIX: blanks always last

  async function writerPane(el) {
    S = S || fresh(); el.innerHTML = `<p class="muted small">Loading…</p>`;
    const t = await P.client().from("saved_report_templates").select("id,name,source,configuration,created_by_email,created_at,updated_at").order("updated_at", { ascending: false }).limit(200);
    templates = t.data || [];
    fields = await loadFields(S.source); if (!S.fields.length) S.fields = fields.filter(f => !EXTRA.includes(f)).slice(0, 12);
    draw(el);
  }
  function draw(el) {
    const c = SRC[S.source], sortable = fields;
    el.innerHTML = `${templates.length ? `<details class="omore"${!rows.length ? " open" : ""}><summary>Saved reports (${templates.length})</summary><div class="rtable">${templates.map(x => `<div class="rrow2"><span></span><span><b>${esc(x.name)}</b><small>${esc(SRC[x.source]?.[0] || x.source)} · ${(x.configuration?.fields || []).length} fields${x.created_by_email ? ` · ${esc(x.created_by_email)}` : ""}</small></span><span class="rv"><button type="button" class="btn primary sm" data-wl="${x.id}">Open</button></span></div>`).join("")}</div></details>` : ""}
<form class="osheet wform" data-wf><label>Report name<input name="name" value="${esc(S.name)}" placeholder="e.g. Low stock list"></label>
<label>What to list<select name="source">${Object.entries(SRC).map(([k, v]) => `<option value="${k}"${k === S.source ? " selected" : ""}>${esc(v[0])}</option>`).join("")}</select></label>
${c[2] ? `<label>Dates (${esc(lab(c[2]))})<select name="preset">${[["all", "All dates"], ["today", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["mtd", "This month"], ["custom", "Custom"]].map(([k, l]) => `<option value="${k}"${S.datePreset === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>${S.datePreset === "custom" ? `<div class="pm2"><label>From<input type="date" name="sd" value="${esc(S.startDate)}"></label><label>To<input type="date" name="ed" value="${esc(S.endDate)}"></label></div>` : ""}` : `<p class="muted small">This list doesn't use dates.</p>`}
<details class="omore"><summary>Columns (${S.fields.length})</summary><div class="austools"><button type="button" class="linkish" data-wall>All</button><button type="button" class="linkish" data-wnone>None</button></div>
<div class="aulist wcols">${[...S.fields, ...fields.filter(f => !S.fields.includes(f))].map(f => `<div class="aurow wcol"><input type="checkbox" value="${esc(f)}" data-wc${S.fields.includes(f) ? " checked" : ""} aria-label="${esc(lab(f))}"><span><b>${esc(lab(f))}</b></span>${S.fields.includes(f) ? `<span class="wmv"><button type="button" class="ibtn" data-wu="${esc(f)}" aria-label="Move up">↑</button><button type="button" class="ibtn" data-wd="${esc(f)}" aria-label="Move down">↓</button></span>` : ""}</div>`).join("")}</div></details>
<details class="omore"${S.filters.length ? " open" : ""}><summary>Filters (${S.filters.filter(x => x.value !== "").length})</summary>${S.filters.map((x, i) => `<div class="wfil"><select data-ff="${i}" aria-label="Filter column">${fields.filter(f => !EXTRA.includes(f)).map(f => `<option value="${esc(f)}"${f === x.field ? " selected" : ""}>${esc(lab(f))}</option>`).join("")}</select><select data-fo="${i}" aria-label="Filter rule">${[["contains", "contains"], ["equals", "is"], ["not_equals", "is not"], ["gte", "≥"], ["lte", "≤"]].map(([k, l]) => `<option value="${k}"${x.op === k ? " selected" : ""}>${l}</option>`).join("")}</select><input data-fv="${i}" value="${esc(x.value)}" placeholder="value" aria-label="Filter value"><button type="button" class="ibtn" data-fx="${i}" aria-label="Remove filter">×</button></div>`).join("")}<button type="button" class="linkish" data-fadd>+ Add a filter</button></details>
<details class="omore"><summary>Sort</summary>${S.sorts.map((s, i) => `<div class="wfil"><select data-sf="${i}" aria-label="Sort column"><option value="">None</option>${sortable.map(f => `<option value="${esc(f)}"${f === s.field ? " selected" : ""}>${esc(lab(f))}</option>`).join("")}</select><select data-sd="${i}" aria-label="Direction"><option value="desc"${s.direction !== "asc" ? " selected" : ""}>High → low / newest</option><option value="asc"${s.direction === "asc" ? " selected" : ""}>Low → high / oldest</option></select></div>`).join("")}<button type="button" class="linkish" data-sadd>+ Then by</button></details>
<div class="obar"><button class="btn primary wide" type="button" data-wrun>Run report</button></div>
<p class="status" data-ws role="status"></p></form><div data-wout></div>`;
    if (rows.length) out(el);
  }
  /* v5.10 (report #4): Save as PDF. Builds the PDF on the phone (jsPDF, loaded only when tapped) with every row of the report,
     then opens the share sheet so it can be printed, saved to Files, AirDropped or emailed. Falls back to a download. */
  const loadJs = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const t = document.createElement("script"); t.src = src; t.onload = res; t.onerror = () => rej(new Error("Couldn't load the PDF maker. Check your connection and try again.")); document.head.appendChild(t); });
  async function savePdf() {
    if (!window.jspdf?.jsPDF?.API?.autoTable) { await loadJs("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"); await loadJs("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"); }
    const cols = S.fields, wide = cols.length > 5, doc = new window.jspdf.jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "letter" });
    const title = S.name || "Report", when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    const cell = v => v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(title, 40, 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110); doc.text(`Pep Shop Texas · ${rows.length} row${rows.length === 1 ? "" : "s"} · ${when}`, 40, 56);
    doc.autoTable({ startY: 68, head: [cols.map(lab)], body: rows.slice(0, 5000).map(r => cols.map(f => cell(fmt(f, value(r, f))))), margin: { left: 40, right: 40 },
      styles: { fontSize: wide ? 7.5 : 9, cellPadding: 4, overflow: "linebreak" }, headStyles: { fillColor: [16, 42, 67], textColor: 255 }, alternateRowStyles: { fillColor: [246, 243, 236] },
      didDrawPage: d => { doc.setFontSize(8); doc.setTextColor(140); doc.text(`Page ${d.pageNumber}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20); } });
    const slug = (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report") + "-" + ymd(new Date()) + ".pdf";
    const blob = doc.output("blob"), file = new File([blob], slug, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title }); return; } catch (err) { if (err?.name === "AbortError") return; } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = slug; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function out(el) {
    const o = el.querySelector("[data-wout]"), lim = Number(S.limitRows || 50), cols = S.fields;
    o.innerHTML = `<div class="pmtop"><p class="muted small" style="flex:1;margin:0">${Math.min(lim, rows.length)} of ${rows.length} row${rows.length === 1 ? "" : "s"}</p><select data-wlim aria-label="Rows shown">${[50, 100, 250, 500, 1000].map(n => `<option${n === lim ? " selected" : ""}>${n}</option>`).join("")}</select></div>
<div class="wtable"><table><thead><tr>${cols.map(f => `<th>${esc(lab(f))}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, lim).map(r => `<tr>${cols.map(f => `<td>${esc(fmt(f, value(r, f)))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<div class="obar"><button class="btn primary wide" type="button" data-wpdf>Save as PDF (all ${rows.length})</button><button class="btn ghost wide" type="button" data-wcsv>Download CSV (all ${rows.length})</button><button class="btn ghost wide" type="button" data-wsave>${editingId ? "Save changes to this report" : "Save this report"}</button>${editingId ? `<button class="btn ghost wide" type="button" data-wsaveas>Save as a new report</button><button class="btn danger wide" type="button" data-wdel>Delete this saved report</button>` : ""}</div>`;
  }
  const readForm = el => { const f = el.querySelector("[data-wf]"); S.name = f.name.value.trim(); if (f.preset) { S.datePreset = f.preset.value; const d = presetDates(S.datePreset); if (d) [S.startDate, S.endDate] = d; else { S.startDate = f.sd?.value || S.startDate; S.endDate = f.ed?.value || S.endDate; } }
    $$("[data-ff]", f).forEach(x => { S.filters[+x.dataset.ff].field = x.value; }); $$("[data-fo]", f).forEach(x => { S.filters[+x.dataset.fo].op = x.value; }); $$("[data-fv]", f).forEach(x => { S.filters[+x.dataset.fv].value = x.value.trim(); });
    $$("[data-sf]", f).forEach(x => { S.sorts[+x.dataset.sf].field = x.value; }); $$("[data-sd]", f).forEach(x => { S.sorts[+x.dataset.sd].direction = x.value; }); };
  const config = () => ({ name: S.name, source: S.source, fields: [...S.fields], datePreset: S.datePreset, startDate: S.startDate, endDate: S.endDate, sorts: S.sorts.filter(s => s.field), sortField: S.sorts[0]?.field || "", sortDirection: S.sorts[0]?.direction || "desc", limitRows: S.limitRows, filters: S.filters.filter(x => x.field && x.value !== ""), saved_at: new Date().toISOString() });
  async function run(el) { const st = el.querySelector("[data-ws]"); st.textContent = "Running…"; try { rows = await fetchRows(); sortRows(); st.textContent = ""; out(el); el.querySelector("[data-wout]").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { st.textContent = e.message; } }
  function bind(el) {
    el.onchange = async e => {
      const t = e.target;
      if (t.name === "source") { readForm(el); S = { ...fresh(), name: S.name, source: t.value }; editingId = null; rows = []; fields = await loadFields(S.source); S.fields = fields.filter(x => !EXTRA.includes(x)).slice(0, 12); draw(el); return; }
      if (t.name === "preset" || t.name === "sd" || t.name === "ed") { readForm(el); draw(el); return; }
      if (t.matches("[data-wc]")) { readForm(el); S.fields = t.checked ? [...S.fields, t.value] : S.fields.filter(x => x !== t.value); draw(el); el.querySelectorAll(".wform details")[0]?.setAttribute("open", ""); return; }
      if (t.matches("[data-wlim]")) { S.limitRows = t.value; out(el); }
    };
    el.onclick = async e => {
      const L = e.target.closest("[data-wl]"); if (L) { const x = templates.find(v => v.id === L.dataset.wl), cfg = x.configuration || {}; // FIX: relative dates are worked out again from today
        S = { ...fresh(), ...cfg, name: x.name, source: x.source, sorts: cfg.sorts?.length ? cfg.sorts : [{ field: cfg.sortField || "", direction: cfg.sortDirection || "desc" }], filters: cfg.filters || [], limitRows: String(cfg.limitRows || "50") };
        const d = presetDates(S.datePreset); if (d) [S.startDate, S.endDate] = d; editingId = x.id;
        fields = await loadFields(S.source); S.fields = (cfg.fields || []).filter(f => fields.includes(f)); if (!S.fields.length) S.fields = fields.slice(0, 12);
        S.filters = S.filters.filter(f => fields.includes(f.field)); rows = []; draw(el); run(el); return; } // FIX: a filter on a missing column is dropped, not moved to another column
      if (e.target.closest("[data-wall]")) { readForm(el); S.fields = [...fields]; draw(el); return; }
      if (e.target.closest("[data-wnone]")) { readForm(el); S.fields = []; draw(el); return; }
      const u = e.target.closest("[data-wu],[data-wd]"); if (u) { readForm(el); const f = u.dataset.wu || u.dataset.wd, i = S.fields.indexOf(f), j = u.dataset.wu ? i - 1 : i + 1; if (j >= 0 && j < S.fields.length) { [S.fields[i], S.fields[j]] = [S.fields[j], S.fields[i]]; } draw(el); el.querySelectorAll(".wform details")[0]?.setAttribute("open", ""); if (rows.length) out(el); return; }
      if (e.target.closest("[data-fadd]")) { readForm(el); S.filters.push({ field: fields[0], op: "contains", value: "" }); draw(el); return; }
      const fx = e.target.closest("[data-fx]"); if (fx) { readForm(el); S.filters.splice(+fx.dataset.fx, 1); draw(el); return; }
      if (e.target.closest("[data-sadd]")) { readForm(el); S.sorts.push({ field: "", direction: "asc" }); draw(el); return; }
      if (e.target.closest("[data-wrun]")) { readForm(el); if (!S.fields.length) { el.querySelector("[data-ws]").textContent = "Pick at least one column."; return; } run(el); return; }
      const pdfb = e.target.closest("[data-wpdf]"); if (pdfb) { pdfb.disabled = true; const was = pdfb.textContent; pdfb.textContent = "Making the PDF…";
        try { await savePdf(); } catch (err) { P.toast(err.message || "The PDF couldn't be made."); } pdfb.disabled = false; pdfb.textContent = was; return; }
      if (e.target.closest("[data-wcsv]")) { const slug = (S.name || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
        const cell = v => `"${String(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v).replace(/"/g, '""')}"`; // FIX: objects were written as [object Object]
        const blob = new Blob([[S.fields.map(cell).join(","), ...rows.map(r => S.fields.map(f => cell(value(r, f))).join(","))].join("\n")], { type: "text/csv" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${slug}-${ymd(new Date())}.csv`; document.body.appendChild(a); a.click(); a.remove(); return; }
      const sv = e.target.closest("[data-wsave],[data-wsaveas]"); if (sv) { readForm(el); if (!S.name) { P.toast("Give the report a name first"); el.querySelector("[data-wf] [name=name]").focus(); return; }
        const u2 = await P.getUser(), now = new Date().toISOString(), cfg = config();
        const r = editingId && sv.matches("[data-wsave]") ? await P.client().from("saved_report_templates").update({ name: S.name, source: S.source, configuration: cfg, updated_at: now }).eq("id", editingId).select("id").single() // FIX: his page could only add new copies
          : await P.client().from("saved_report_templates").insert({ name: S.name, source: S.source, configuration: cfg, created_by: u2?.id || null, created_by_email: u2?.email || null, updated_at: now }).select("id").single();
        if (r.error) { P.toast(r.error.message); return; } editingId = r.data.id; P.toast("Report saved"); const t = await P.client().from("saved_report_templates").select("id,name,source,configuration,created_by_email,created_at,updated_at").order("updated_at", { ascending: false }).limit(200); templates = t.data || []; draw(el); return; }
      if (e.target.closest("[data-wdel]")) { if (!(await window.PSTOps.confirmSheet(`Delete "${S.name}"?`, "The saved report is removed for everyone. The data itself isn't touched.", "Delete", true))) return;
        const { error } = await P.client().from("saved_report_templates").delete().eq("id", editingId); if (error) { P.toast(error.message); return; } P.toast("Saved report deleted"); editingId = null; S = fresh(); rows = []; writerPane(el); }
    };
  }
  const _wp = writerPane;
  window.PSTOps7 = { writerPane: async el => { await _wp(el); bind(el); } };
})();
