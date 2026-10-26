/* Pep Shop Texas · owner app stage 2 (v4.9): purchase orders, receiving, reorder review, vendors (= inventory.html).
   Same tables, columns, formulas and RPCs as his page: 10-vial kits, shipping and discount split by kit share,
   landed cost per vial before discount, PO numbers from next_incoming_po_number, receiving through
   receive_incoming_purchase_order_lines. Creating a PO never touches stock; receiving does (server side). */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc, money } = P;
  const KIT = 10, LEAD = 10, SKIP = ["PSTP100087", "PSTP100048", "PSTP100049", "PSTP100085"];
  const sheet = (html, label) => { const w = P.sheet(html, { label }); w.classList.add("full"); return w; };
  const nk = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const usd = n => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const STATUS = { ordered: "Ordered", in_transit: "In transit", received: "Received", cancelled: "Cancelled", issue_shorted: "Issue / shorted" };
  const open = r => !["received", "cancelled"].includes(String(r.status || "ordered").toLowerCase());
  const addDays = (iso, d) => { const x = new Date(iso); x.setDate(x.getDate() + Number(d || 0)); return x; };
  const todayYmd = () => { const d = new Date(), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const orderDateISO = ymd => { if (!ymd) return new Date().toISOString(); const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0).toISOString(); };
  let me = null;
  async function who() { if (!me) me = await P.getUser(); return me; }
  async function shortName() { // = his shortLoggedInUserName
    const u = await who(), md = u?.user_metadata || {}, f = md.first_name || md.given_name, l = md.last_name || md.family_name;
    if (f && l) return `${String(f)[0].toUpperCase()}.${l}`;
    const full = String(md.full_name || md.name || "").trim().split(/\s+/); if (full.length >= 2) return `${full[0][0].toUpperCase()}.${full[full.length - 1]}`;
    if (String(u?.email || "").toLowerCase() === "wacoweaver@gmail.com") return "J.Weaver";
    return String(u?.email || "").split("@")[0] || "";
  }
  const vendorLead = v => { const n = Number(v?.standard_shipping_lead_time ?? LEAD); return Number.isFinite(n) && n >= 0 ? n : LEAD; };
  const vendorLabel = v => `${v.pst_vendor_id || "Vendor"} - ${v.company_name || "Unnamed Vendor"}`;

  /* ---- shared data ---- */
  let items = [], catBy = {}, vendors = [];
  async function loadBase() {
    const [inv, cat, ven] = await Promise.all([P.client().from("product_inventory").select("*"), P.client().from("product_catalog").select("*"), P.client().from("vendors").select("*").order("company_name", { ascending: true })]);
    catBy = Object.fromEntries((cat.data || []).map(c => [nk(c.product_key), c]));
    const seen = new Set();
    items = (inv.data || []).filter(i => { const k = nk(i.product_key || i.id); if (seen.has(k) || SKIP.includes(i.product_key)) return false; seen.add(k); return true; })
      .sort((a, b) => label(a).localeCompare(label(b), undefined, { numeric: true }));
    vendors = ven.data || [];
  }
  function label(i) { // = his incomingProductLabel
    const c = catBy[nk(i.product_key)] || {}, display = String(c.display_name || i.display_name || i.product_key || "Product").trim(), strength = String(c.strength || i.strength || "").trim();
    return strength && !display.toLowerCase().includes(strength.toLowerCase()) ? `${display} — ${strength}` : display;
  }
  async function vendorPrices(vendorId) {
    if (!vendorId) return { prices: new Map(), catalog: [] };
    const [a, b] = await Promise.all([P.client().from("pst_vendor_prices").select("product_key,kit_cost,vendor_item_number").eq("vendor_id", vendorId),
      P.client().from("pst_vendor_catalog_items").select("id,product_key,product_name,strength,vendor_item_number,kit_cost").eq("vendor_id", vendorId).order("product_name")]);
    return { prices: new Map((a.data || []).map(r => [r.product_key, r])), catalog: b.data || [] };
  }
  function priceFor(item, vp) { // = his pstIncomingVendorPriceForProduct
    if (!item) return null;
    const byKey = vp.catalog.filter(x => x.product_key && x.product_key === item.product_key); if (byKey.length === 1) return byKey[0];
    const saved = vp.prices.get(item.product_key); if (saved) return saved;
    const c = catBy[nk(item.product_key)] || {}, n = nk(c.display_name || item.display_name), s = nk(c.strength || item.strength);
    const m = vp.catalog.filter(x => nk(x.product_name) === n && nk(x.strength) === s); return m.length === 1 ? m[0] : null;
  }
  function autoKitCost(item, vp, vendorSelected) { // = his incomingAutoKitCostForProduct
    const r = priceFor(item, vp); if (r) return Number(r.kit_cost);
    if (vendorSelected) return 0;
    const u = Number(item?.cost_per_unit ?? 0); return Number.isFinite(u) && u > 0 ? u * KIT : 0;
  }

  /* ================= NEW / EDIT PURCHASE ORDER ================= */
  async function poSheet(opt = {}) { // opt: { lines:[{key,qty}], edit:{po, rows} , then }
    await loadBase();
    const editing = opt.edit || null, first = editing?.rows?.[0] || null;
    let vendorId = first?.vendor_id || "", vp = await vendorPrices(vendorId);
    const lines = [];
    if (editing) editing.rows.filter(open).forEach(r => lines.push({ originalRowId: r.id, original: r, productId: r.product_id || null, productKey: r.product_key || null, productName: r.product_name, vendorOnly: !r.product_id && !r.product_key, qty: Number(r.ordered_quantity || 0), kitCost: Number(r.kit_cost ?? 0) }));
    (opt.lines || []).forEach(l => { const it = items.find(i => i.product_key === l.key); if (it) lines.push({ productId: it.id, productKey: it.product_key, productName: label(it), qty: Math.max(KIT, Math.ceil(Number(l.qty || KIT) / KIT) * KIT), kitCost: 0 }); });
    const disc0 = editing ? editing.rows.filter(open).reduce((s, r) => { const pc = Number(r.kit_cost || 0) > 0 ? Number(r.ordered_quantity || 0) / KIT * Number(r.kit_cost) : Number(r.ordered_quantity || 0) * Number(r.cost_per_unit || 0); return s + Math.max(0, pc + Number(r.shipping_cost || 0) - Number(r.total_cost || 0)); }, 0) : 0;
    const ship0 = editing ? editing.rows.filter(open).reduce((s, r) => s + Number(r.shipping_cost || 0), 0) : 0;
    const d0 = first?.ordered_at ? (d => { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; })(new Date(first.ordered_at)) : todayYmd();
    const st0 = ["ordered", "in_transit", "issue_shorted"].includes(String(first?.status)) ? first.status : "ordered";
    const w = sheet(`<form class="osheet" data-pof><h2 class="serif">${editing ? `Edit ${esc(editing.po)}` : "New purchase order"}</h2>
<label>Vendor<select name="vendor"><option value="">No vendor</option>${vendors.filter(v => v.is_active !== false).map(v => `<option value="${v.id}"${v.id === vendorId ? " selected" : ""}>${esc(v.company_name)} · ${vendorLead(v)}-day lead</option>`).join("")}</select></label>
<div class="pm2"><label>Order date<input name="date" type="date" value="${d0}"></label><label>Status<select name="status">${["ordered", "in_transit", "issue_shorted"].map(s => `<option value="${s}"${s === st0 ? " selected" : ""}>${STATUS[s]}</option>`).join("")}</select></label></div>
${editing ? `<label>Tracking number<input name="tracking" value="${esc(first?.tracking_number || "")}"></label>` : ""}
<p class="kick" style="margin:8px 0 0">Products</p><div data-polines></div>
<div class="csearch nopick">${P.icon("search", 18)}<input type="search" data-poq placeholder="Search: tirz, TR10, BPC…" autocomplete="off" aria-label="Search products to add"></div><div class="sres" data-por></div>
<div class="pm2"><label>Shipping &amp; fees ($)<input name="ship" type="number" min="0" step="0.01" inputmode="decimal" value="${ship0 ? ship0.toFixed(2) : ""}"></label><label>Discount ($)<input name="disc" type="number" min="0" step="0.01" inputmode="decimal" value="${disc0 > 0.004 ? disc0.toFixed(2) : ""}"></label></div>
<div class="ntot" data-potot></div><p class="status" data-pos role="status"></p><button class="btn primary wide" type="submit">${editing ? "Save changes" : "Save purchase order"}</button></form>`, editing ? "Edit purchase order" : "New purchase order");
    const f = w.querySelector("form"), q = f.querySelector("[data-poq]"), res = f.querySelector("[data-por]");
    const vendor = () => vendors.find(v => v.id === f.vendor.value) || null;
    const kitCostOf = l => { const c = Number(l.kitCost || 0); if (c > 0) return c; if (l.vendorOnly) return 0; return autoKitCost(items.find(i => i.id === l.productId) || items.find(i => i.product_key === l.productKey), vp, !!vendor()); };
    const totals = () => { const kits = lines.reduce((s, l) => s + l.qty / KIT, 0), prod = lines.reduce((s, l) => s + l.qty / KIT * kitCostOf(l), 0), ship = Number(f.ship.value || 0), disc = Math.max(0, Number(f.disc.value || 0)); return { kits, prod, ship, disc, total: Math.max(0, prod + ship - disc) }; };
    const draw = () => {
      f.querySelector("[data-polines]").innerHTML = lines.map((l, k) => { const kc = kitCostOf(l); return `<div class="edrow"><div><b>${esc(l.productName)}</b>${l.vendorOnly ? ` <small class="bo">not set up in your products: can't be received until it is</small>` : ""}</div>
<div class="edctl"><span class="qstep"><button type="button" data-pk="${k}" data-d="-1" aria-label="One less kit">−</button><b>${l.qty / KIT}</b><button type="button" data-pk="${k}" data-d="1" aria-label="One more kit">+</button></span><small class="muted">kit${l.qty === KIT ? "" : "s"} · ${l.qty} vials</small>
<label class="edp">$<input type="number" min="0" step="0.01" inputmode="decimal" value="${kc > 0 ? kc.toFixed(2) : ""}" placeholder="kit cost" data-pc="${k}" aria-label="Cost per 10-vial kit"></label><button type="button" class="linkish" data-px="${k}">Remove</button></div></div>`; }).join("") || `<p class="muted small">${f.vendor.value ? "Tap items below to add them." : "Pick a vendor to see their price list, or search below."}</p>`;
      const t = totals(); f.querySelector("[data-potot]").innerHTML = lines.length ? `<div><span>${t.kits} kit${t.kits === 1 ? "" : "s"} · ${t.kits * KIT} vials</span><b>${usd(t.prod)}</b></div><div><span>Shipping &amp; fees</span><b>${usd(t.ship)}</b></div>${t.disc ? `<div><span>Discount</span><b>−${usd(t.disc)}</b></div>` : ""}<div class="big"><span>Total paid</span><b>${usd(t.total)}</b></div>` : "";
    };
    // v5.2: his shop names are discreet (PST-2TR …), so search also matches the vendor's own names, SKUs and the usual peptide names
    const ALIAS = [[/pst-?1/i, "semaglutide sema"], [/pst-?2/i, "tirzepatide tirz"], [/pst-?3/i, "retatrutide reta"], [/pst-?5000/i, "hcg"], [/pst-misc/i, "bac water bacteriostatic"]];
    const alias = n => ALIAS.filter(([r]) => r.test(n)).map(a => a[1]).join(" ");
    const thumb = i => { const c = i && catBy[nk(i.product_key)]; return c ? P.vial(c, 26) : `<span class="pov"></span>`; };
    const added = key => lines.some(l => l.productKey && l.productKey === key);
    const rowInv = (i, x) => { const kc = x ? Number(x.kit_cost) : autoKitCost(i, vp, !!vendor()), v = vendor(), on = added(i.product_key);
      return `<button type="button" class="porow${on ? " on" : ""}" data-poadd="${esc(i.id)}">${thumb(i)}<span><b>${esc(label(i))}</b><small>${x ? `${esc(x.vendor_item_number || "")} · ${esc(`${x.product_name} ${x.strength || ""}`.trim())} · ` : v ? "not on this vendor's list · " : ""}${Number(i.current_inventory || 0)} on hand</small></span><em>${on ? "added" : kc > 0 ? usd(kc) + "/kit" : "no price"}</em></button>`; };
    const rowVo = x => `<button type="button" class="porow vo" data-povo="${esc(x.id)}"><span class="pov"></span><span><b>${esc(`${x.product_name} ${x.strength || ""}`.trim())}</b><small>${esc(x.vendor_item_number || "")} · not set up in your products yet</small></span><em>${usd(x.kit_cost)}/kit</em></button>`;
    const search = () => { const s = q.value.trim().toLowerCase(), v = vendor(), byKey = Object.fromEntries(items.map(i => [i.product_key, i]));
      const vrows = vp.catalog.map(x => ({ x, i: x.product_key ? byKey[x.product_key] : null })).sort((a, c) => `${a.x.product_name} ${a.x.strength}`.localeCompare(`${c.x.product_name} ${c.x.strength}`, undefined, { numeric: true, sensitivity: "base" }));
      const hayV = r => `${r.x.product_name} ${r.x.strength} ${r.x.vendor_item_number} ${r.i ? `${label(r.i)} ${r.i.product_key} ${alias(label(r.i))}` : ""}`.toLowerCase();
      if (!s) { res.innerHTML = v && vrows.length ? `<p class="kick sreshd">${esc(v.company_name)}'s price list · ${vrows.length} item${vrows.length === 1 ? "" : "s"} · tap to add</p>${vrows.map(r => r.i ? rowInv(r.i, r.x) : rowVo(r.x)).join("")}` : v ? `<p class="muted small">${esc(v.company_name)} has no price list yet. Search your products, or upload one under More → Vendor price lists.</p>` : ""; return; }
      const words = s.split(/\s+/).filter(Boolean), hit = h => words.every(w => h.includes(w));
      const vHits = vrows.filter(r => hit(hayV(r))), inV = new Set(vHits.filter(r => r.i).map(r => r.i.product_key)), onList = new Set(vrows.filter(r => r.i).map(r => r.i.product_key));
      const others = items.filter(i => !onList.has(i.product_key) && hit(`${label(i)} ${i.product_key} ${alias(label(i))}`.toLowerCase())).slice(0, 8);
      res.innerHTML = [...vHits.map(r => r.i ? rowInv(r.i, r.x) : rowVo(r.x)), ...others.filter(i => !inV.has(i.product_key)).map(i => rowInv(i, null))].join("") || `<p class="muted small">No match for "${esc(q.value.trim())}".</p>`; };
    q.addEventListener("input", search);
    f.addEventListener("change", async e => { if (e.target.name === "vendor") { vendorId = f.vendor.value; vp = await vendorPrices(vendorId); lines.forEach(l => { if (!l.originalRowId) l.kitCost = 0; }); search(); } draw(); });
    f.addEventListener("input", e => { const c = e.target.closest("[data-pc]"); if (c) { lines[+c.dataset.pc].kitCost = Number(c.value || 0); const t = totals(); const tb = f.querySelector("[data-potot] .big b"); if (tb) tb.textContent = usd(t.total); return; } if (["ship", "disc"].includes(e.target.name)) draw(); });
    f.addEventListener("click", e => {
      const a = e.target.closest("[data-poadd]"); if (a) { const it = items.find(i => String(i.id) === a.dataset.poadd); if (added(it.product_key)) { P.toast("Already on this order: use + to add kits"); return; } lines.push({ productId: it.id, productKey: it.product_key || null, productName: label(it), qty: KIT, kitCost: 0 }); q.value = ""; draw(); search(); P.toast(`${label(it)} added`); return; }
      const vo = e.target.closest("[data-povo]"); if (vo) { const x = vp.catalog.find(c => c.id === vo.dataset.povo); lines.push({ productId: null, productKey: null, productName: `${x.product_name} — ${x.strength || ""}`, vendorOnly: true, qty: KIT, kitCost: Number(x.kit_cost) }); q.value = ""; draw(); search(); return; }
      const s = e.target.closest("[data-pk]"); if (s) { const l = lines[+s.dataset.pk]; l.qty = Math.max(KIT, l.qty + Number(s.dataset.d) * KIT); draw(); return; }
      const x = e.target.closest("[data-px]"); if (x) { lines.splice(+x.dataset.px, 1); draw(); }
    });
    f.addEventListener("submit", async e => { e.preventDefault(); const st = f.querySelector("[data-pos]"), b = f.querySelector("[type=submit]");
      if (!lines.length && !editing) { st.textContent = "Add at least one product."; return; }
      if (lines.some(l => kitCostOf(l) <= 0)) { st.textContent = "Every line needs a cost per kit. Add the vendor's price."; return; }
      if (lines.some(l => (!l.productId && !String(l.productName || "").trim()) || !(l.qty > 0))) { st.textContent = "Every line needs a product and a quantity."; return; }
      const v = vendor(), t = totals(), orderedAt = orderDateISO(f.date.value), now = new Date().toISOString(), u = await who(), nm = await shortName();
      const lead = v ? vendorLead(v) : editing ? Number(first?.lead_time_days ?? LEAD) : LEAD, eta = addDays(orderedAt, lead).toISOString();
      const supplier = v?.company_name || (editing ? first?.vendor_name || first?.supplier_name : null) || null, vid = v?.id || (editing ? first?.vendor_id : null) || null;
      const build = (l, i, po, extra) => { const qty = Number(l.qty), kc = kitCostOf(l), kits = qty / KIT, sh = t.ship > 0 && t.kits > 0 ? t.ship * (kits / t.kits) : 0, ds = t.disc > 0 && t.kits > 0 ? t.disc * (kits / t.kits) : 0;
        const landed = qty > 0 && (kits * kc + sh) > 0 ? (kits * kc + sh) / qty : 0;
        return { qty, kc, kits, sh, ds, landed, row: { po_number: po, product_id: l.productId || null, product_key: l.productKey || null, product_name: l.productName || "Product", ordered_quantity: qty, kit_cost: kc, kit_vial_count: KIT, cost_per_unit: landed,
          shipping_cost: sh, total_cost: Math.max(0, kits * kc + sh - ds), supplier_name: supplier, vendor_id: vid, vendor_name: supplier, lead_time_days: lead || LEAD, status: f.status.value || "ordered", ordered_at: orderedAt, expected_arrival_date: eta, ...extra } }; };
      if (editing && !lines.length) { st.textContent = "That would empty the order. Use Cancel a line on the order instead."; return; }
      b.disabled = true; st.textContent = "Saving…";
      try {
        if (!editing) {
          const { data, error } = await P.client().rpc("next_incoming_po_number"); if (error) throw error;
          const po = String(data || "").trim(); if (!po) throw new Error("A purchase order number couldn't be made.");
          const gid = crypto.randomUUID();
          const rows = lines.map((l, i) => { const x = build(l, i, po, {}); return { ...x.row, id: crypto.randomUUID(), tracking_number: null, notes: l.vendorOnly ? "UNMATCHED VENDOR PRODUCT — receiving must be manually matched before inventory addition" : (nm || null),
            created_at: orderedAt, updated_at: orderedAt, created_by: u?.id || null, created_by_email: u?.email || null, received_at: null, received_quantity: null,
            audit_note: `Incoming purchase order ${po} (${gid}). Line ${i + 1} of ${lines.length}. Vendor ${v ? vendorLabel(v) : "not selected"}. Entered by ${nm}. Qty ${x.qty} vial(s) (${x.kits.toFixed(2)} kit(s)). Kit cost ${usd(x.kc)} per 10-vial kit. Allocated shipping/fees ${usd(x.sh)} from total PO shipping/fees ${usd(t.ship)}. Blanket PO discount allocated ${usd(x.ds)} from total PO discount ${usd(t.disc)}. Discount reduces PO total only and does not change kit cost or landed cost per vial. Landed cost ${usd(x.landed)}/vial before blanket discount. Expected arrival ${new Date(eta).toLocaleDateString()} using ${lead}-day vendor lead time.` }; });
          const { error: e2 } = await P.client().from("incoming_inventory").insert(rows); if (e2) throw e2;
          P.closeSheet(); P.toast(`${po} saved · ${t.kits} kit${t.kits === 1 ? "" : "s"}`); opt.then && opt.then(po);
        } else {
          const kept = new Set(lines.filter(l => l.originalRowId).map(l => l.originalRowId)), removed = editing.rows.filter(open).filter(r => !kept.has(r.id)).map(r => r.id);
          const sum = `${lines.length} line(s), ${t.kits} kit(s), total ${usd(t.total)}`;
          const rows = lines.map((l, i) => { const o = l.original || {}, x = build(l, i, editing.po, {}); return { ...o, ...x.row, id: l.originalRowId || crypto.randomUUID(), tracking_number: f.tracking.value.trim() || null, notes: nm || null,
            created_at: o.created_at || now, updated_at: now, created_by: o.created_by || u?.id || null, created_by_email: o.created_by_email || u?.email || null,
            audit_note: `${o.audit_note || ""}\nPO ${editing.po} edited ${new Date().toLocaleString()} by ${u?.email || "Admin"}: line ${l.originalRowId ? "retained/updated" : "added"}; ${sum}.`.trim() }; });
          if (rows.length) { const { data, error } = await P.client().from("incoming_inventory").upsert(rows, { onConflict: "id" }).select("id"); if (error) throw error; if ((data || []).length !== rows.length) throw new Error(`Saved ${(data || []).length} of ${rows.length} lines. Nothing was removed.`); }
          if (removed.length) { const { data, error } = await P.client().from("incoming_inventory").delete().in("id", removed).select("id"); if (error) throw error; if ((data || []).length !== removed.length) throw new Error(`Removed ${(data || []).length} of ${removed.length} lines. Reload and check ${editing.po}.`); }
          P.closeSheet(); P.toast(`${editing.po} saved`); opt.then && opt.then(editing.po);
        }
      } catch (err) { st.textContent = err.message || String(err); st.className = "status bad"; b.disabled = false; }
    });
    draw(); search();
  }

  /* ================= ONE PO: receive all / some, tracking, status, edit, cancel a line ================= */
  async function poOpen(po, then) {
    const { data } = await P.client().from("incoming_inventory").select("*").ilike("po_number", po).order("created_at").order("product_name");
    const rows = data || [], op = rows.filter(open); if (!rows.length) return;
    const linked = r => !!(r.product_id || r.product_key);
    const w = sheet(`<div class="osheet"><div class="oshead"><div><small class="muted">${esc(rows[0].vendor_name || rows[0].supplier_name || "No vendor")} · ordered ${P.fmtDate(rows[0].ordered_at)}</small><h2 class="serif">${esc(po)}</h2><span class="muted small">${rows[0].expected_arrival_date ? `Expected ${P.fmtDate(rows[0].expected_arrival_date)}` : ""}${rows[0].tracking_number ? ` · tracking ${esc(rows[0].tracking_number)}` : ""}</span></div></div>
<div class="polines">${rows.map(r => `<label class="poline${open(r) ? "" : " done"}${linked(r) ? "" : " warn"}">${open(r) && linked(r) ? `<input type="checkbox" data-rl="${esc(r.id)}" checked>` : `<span class="pov"></span>`}<span><b>${esc(String(r.product_name || "").replace(/\s*[—-]\s*PSTP\d+\s*$/i, ""))}</b><small>${STATUS[String(r.status || "ordered").toLowerCase()] || r.status} · ${usd(r.kit_cost)}/kit · ${usd(r.total_cost)}${linked(r) ? "" : " · not set up in your products"}</small></span><em>×${Number(r.ordered_quantity || 0)}</em></label>`).join("")}</div>
${op.length ? `<div class="obar"><button class="btn primary wide" type="button" data-rc>Receive checked</button>
<button class="btn ghost wide" type="button" data-ed>Edit this order</button></div>
<details class="omore"><summary>Tracking number</summary><div class="pm2 inl"><input data-trkv value="${esc(rows.find(r => r.tracking_number)?.tracking_number || "")}" placeholder="Tracking number" aria-label="Tracking number"><button class="btn ghost" type="button" data-trk>Save</button></div></details>
<details class="omore"><summary>Status</summary><div class="pm2 inl"><select data-stsv aria-label="Status">${["ordered", "in_transit"].map(s => `<option value="${s}"${op[0].status === s ? " selected" : ""}>${STATUS[s]}</option>`).join("")}</select><button class="btn ghost" type="button" data-sts>Save</button></div></details>
<details class="omore"><summary>Cancel a line</summary>${op.map(r => `<button class="btn danger wide" type="button" data-cx="${esc(r.id)}">Cancel ${esc(String(r.product_name).replace(/\s*[—-]\s*PSTP\d+\s*$/i, ""))} ×${r.ordered_quantity}</button>`).join("")}</details>` : `<p class="muted small">Everything on this order is received or cancelled.</p>`}
<p class="status" data-ps role="status"></p></div>`, po);
    const st = w.querySelector("[data-ps]"), reload = () => { P.closeSheet(); then && then(); };
    const ask = async (t, body, yes, danger) => { const ok = await window.PSTOps.confirmSheet(t, body, yes, danger); if (!ok) poOpen(po, then); return ok; };
    const fail = msg => { P.toast(msg); poOpen(po, then); };
    const moving = op.filter(r => ["ordered", "in_transit"].includes(String(r.status || "ordered").toLowerCase()));
    w.addEventListener("click", async e => {
      if (e.target.closest("[data-rc]")) { // = receivePurchaseOrderLines
        const ids = $$("[data-rl]:checked", w).map(x => x.dataset.rl); if (!ids.length) { st.textContent = "Check the lines that arrived."; return; }
        const pick = op.filter(r => ids.includes(r.id)), vials = pick.reduce((n, r) => n + Number(r.ordered_quantity || 0), 0);
        if (!(await ask(`Receive ${ids.length === op.length ? "everything" : `${pick.length} line${pick.length === 1 ? "" : "s"}`} on ${po}?`, `${pick.map(r => `• ${esc(r.product_name)} — ${r.ordered_quantity} vial(s)`).join("<br>")}<br><br>Total: ${vials} vial(s) go on the shelf. Confirm only after they've been inspected and counted.`, `Receive ${vials} vials`))) return;
        const { data: d, error } = await P.client().rpc("receive_incoming_purchase_order_lines", { p_po_number: po, p_line_ids: ids });
        if (error) { fail(error.message); return; }
        P.toast(`${po}: received ${d?.received_lines ?? ids.length} line(s), ${d?.received_vials ?? vials} vials`); then && then(); return;
      }
      if (e.target.closest("[data-trk]")) { // = applyTrackingFromPurchaseOrderCenter: every line of the PO
        const t = w.querySelector("[data-trkv]").value.trim(); if (!t) { st.textContent = "Type the tracking number."; return; }
        const { data: d, error } = await P.client().from("incoming_inventory").update({ tracking_number: t, updated_at: new Date().toISOString() }).in("id", rows.map(r => r.id)).select("id");
        if (error || (d || []).length !== rows.length) { st.textContent = error?.message || `Tracking updated ${(d || []).length} of ${rows.length} lines.`; return; }
        P.toast("Tracking saved"); reload(); return;
      }
      if (e.target.closest("[data-sts]")) { // = applyStatusFromPurchaseOrderCenter: open Ordered / In transit lines only
        const to = w.querySelector("[data-stsv]").value; if (!moving.length) { st.textContent = "No ordered or in-transit lines to change."; return; }
        const { data: d, error } = await P.client().from("incoming_inventory").update({ status: to, updated_at: new Date().toISOString() }).in("id", moving.map(r => r.id)).select("id");
        if (error || (d || []).length !== moving.length) { st.textContent = error?.message || `Status updated ${(d || []).length} of ${moving.length} lines.`; return; }
        P.toast(`${po}: ${STATUS[to]}`); reload(); return;
      }
      if (e.target.closest("[data-ed]")) { P.closeSheet(); poSheet({ edit: { po, rows }, then }); return; }
      const cx = e.target.closest("[data-cx]"); if (cx) { // = updateIncomingStatus(id, "cancelled")
        const r = rows.find(x => x.id === cx.dataset.cx);
        if (!(await ask("Cancel this line?", `${esc(r.product_name)} ×${r.ordered_quantity}. Nothing on the shelf changes.`, "Cancel the line", true))) return;
        const u = await who(), audit = `${r.audit_note || ""}\nStatus changed to Cancelled on ${new Date().toLocaleString()} by ${u?.email || "Admin"}.`.trim();
        const { error } = await P.client().from("incoming_inventory").update({ status: "cancelled", updated_at: new Date().toISOString(), audit_note: audit }).eq("id", r.id);
        if (error) { fail(error.message); return; } P.toast("Line cancelled"); poOpen(po, then); then && then();
      }
    });
  }

  /* ================= REORDER REVIEW (= renderReorderReview) ================= */
  const DEAD = ["cancelled", "rejected", "refunded", "failed"];
  const normSt = v => String(v || "").toLowerCase().replace(/\s+/g, "_");
  const activeSt = o => { const s = normSt(o.status), x = normSt(o.order_status); return s && s !== "pending" ? s : x && x !== "pending" ? x : "pending"; };
  async function reorderPane(el, range = 30) {
    el.innerHTML = `<p class="muted small">Working it out…</p>`;
    await loadBase();
    const since = new Date(); since.setDate(since.getDate() - range); since.setHours(0, 0, 0, 0);
    const { data: ords } = await P.client().from("orders").select("*");
    const kept = (ords || []).filter(o => new Date(o.created_at || o.order_date || o.updated_at) >= since && !DEAD.includes(activeSt(o)));
    const sales = {}; for (let i = 0; i < kept.length; i += 200) { const { data } = await P.client().from("order_items").select("*").in("order_id", kept.slice(i, i + 200).map(o => o.id)); (data || []).forEach(it => { const keys = [it.product_key, it.product_id].filter(Boolean).map(nk); const m = items.find(x => keys.includes(nk(x.product_key)) || keys.includes(nk(x.id)) || keys.includes(nk(x.product_id))); if (!m) return; const s = sales[m.id] ||= { qty: 0 }; s.qty += Number(it.quantity ?? it.qty ?? 1) || 1; }); }
    const { data: mv } = await P.client().from("inventory_movements").select("product_key,previous_quantity,new_quantity");
    const hi = {}; (mv || []).forEach(m => { const k = nk(m.product_key); hi[k] = Math.max(hi[k] || 0, Number(m.previous_quantity || 0), Number(m.new_quantity || 0)); });
    const r5 = v => { const n = Math.max(0, Number(v || 0)); return n <= 0 ? 0 : Math.ceil(n / 5) * 5; };
    const rows = items.filter(i => i.is_active !== false).map(i => {
      const cur = Number(i.current_inventory || 0), avg = (sales[i.id]?.qty || 0) / Math.max(1, range), days = avg > 0 ? cur / avg : Infinity;
      const base = Math.max(hi[nk(i.product_key)] || 0, Number(i.starting_inventory || i.initial_inventory || 0), cur), orig = base > 0 ? base : cur <= 10 ? 10 : cur, pct = orig > 0 ? Math.max(0, orig - cur) / orig : 0;
      let s; if (avg <= 0) s = cur <= 0 ? ["Out of stock", 0] : (cur <= 2 || pct >= .9) ? ["Critical low", 0] : (cur <= 4 || pct >= .8) ? ["Reorder now", 1] : (cur <= 5 || pct >= .5) ? ["Watch", 2] : ["No recent sales", 4];
      else s = cur <= 0 ? ["Out of stock", 0] : cur <= 2 ? ["Critical low", 0] : days <= 7 ? ["Critical", 0] : days <= 21 ? ["Reorder now", 1] : days <= 30 ? ["Watch", 2] : ["Healthy", 3];
      const target = avg > 0 ? Math.ceil(avg * 30) : 10, sug = r5(Math.ceil(target - cur));
      return { i, cur, avg, days, s, sug: sug > 0 ? sug : 10, sold: sales[i.id]?.qty || 0 };
    });
    const dead = r => r.cur <= 0 && r.avg <= 0, byDays = (a, b) => a.days - b.days || a.cur - b.cur;
    const groups = [["Act now", rows.filter(r => !dead(r) && r.s[1] <= 1 && r.avg > 0).sort(byDays), "Selling and running out"],
      ["Watch", rows.filter(r => !dead(r) && (r.s[1] === 2 || (r.s[1] <= 1 && r.avg <= 0))).sort(byDays), "Low, or getting there"],
      ["Out and not selling", rows.filter(dead), "Nothing sold in this window. Reorder only if you want them back."],
      ["Fine for now", rows.filter(r => !dead(r) && r.s[1] >= 3).sort(byDays), ""]];
    const row = r => `<label class="shrow rrow ${r.s[1] <= 1 ? "low" : r.s[1] === 2 ? "" : "fine"}">${r.s[1] <= 2 ? `<input type="checkbox" data-rp="${esc(r.i.product_key)}" data-rq="${r.sug}"${r.s[1] <= 1 && r.avg > 0 ? " checked" : ""}>` : `<span></span>`}<span><b>${esc(label(r.i))}</b><small>${esc(r.s[0])} · ${r.avg > 0 ? `${Math.ceil(r.days)} day${Math.ceil(r.days) === 1 ? "" : "s"} left · sold ${r.sold}` : "no recent sales"}${r.s[1] <= 2 ? ` · suggest ${r.sug}` : ""}</small></span><em>${r.cur}</em></label>`;
    el.innerHTML = `<div class="oseg">${[7, 30, 60, 90].map(n => `<button type="button" class="${n === range ? "on" : ""}" data-rr="${n}">${n} days</button>`).join("")}</div>
<p class="muted small">Based on what sold in the last ${range} days, including orders not paid yet. Suggested amounts aim for 30 days of stock, rounded to 5.</p>
${groups.map(([t, list, sub], gi) => gi >= 2 ? `<details class="omore rrfold"><summary>${t} (${list.length})</summary>${sub ? `<p class="muted small">${sub}</p>` : ""}<div class="shelf">${list.map(row).join("")}</div></details>` : `<h2 class="serif osec">${t} <span class="muted small">(${list.length})</span></h2>${list.length ? `<div class="shelf">${list.map(row).join("")}</div>` : `<p class="muted small">Nothing here.</p>`}`).join("")}
<div class="rrbar"><button class="btn primary wide" type="button" data-rpo>New PO from the checked items</button></div>`;
    el.onclick = e => {
      const rr = e.target.closest("[data-rr]"); if (rr) { reorderPane(el, Number(rr.dataset.rr)); return; }
      if (e.target.closest("[data-rpo]")) { const pick = $$("[data-rp]:checked", el).map(x => ({ key: x.dataset.rp, qty: Number(x.dataset.rq) })); if (!pick.length) { P.toast("Check at least one item"); return; } poSheet({ lines: pick, then: () => P.toast("Find it under Stock & incoming") }); }
    };
  }

  /* ================= VENDORS (= addVendor / saveVendorEdit) ================= */
  async function vendorsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const { data, error } = await P.client().from("vendors").select("*").order("company_name", { ascending: true });
    if (error) { el.innerHTML = `<p class="notice err">${esc(error.message)}</p>`; return; }
    vendors = data || [];
    el.innerHTML = `<div class="pmtop"><p class="muted small" style="margin:0;flex:1">${vendors.filter(v => v.is_active !== false).length} active</p><button class="btn primary sm" type="button" data-vnew>+ Add vendor</button></div>
<div class="clist">${vendors.map(v => `<button type="button" class="crow" data-vid="${v.id}"><span class="cav">${esc(String(v.company_name || "?")[0])}</span><span><b>${esc(v.company_name)}</b><small>${esc(v.pst_vendor_id || "")} · ${vendorLead(v)}-day lead${v.contact_name ? ` · ${esc(v.contact_name)}` : ""}${v.is_active === false ? " · inactive" : ""}</small></span></button>`).join("")}</div>`;
    el.onclick = e => { if (e.target.closest("[data-vnew]")) { vendorSheet(null, () => vendorsPane(el)); return; } const b = e.target.closest("[data-vid]"); if (b) vendorSheet(vendors.find(v => v.id === b.dataset.vid), () => vendorsPane(el)); };
  }
  function nextVendorNumber() { const max = vendors.reduce((m, v) => { const r = String(v.pst_vendor_id || "").match(/^V(\d+)$/i); return r ? Math.max(m, Number(r[1])) : m; }, 0); return `V${String(max + 1).padStart(5, "0")}`; }
  function vendorSheet(v, then) {
    const w = sheet(`<form class="osheet"><h2 class="serif">${v ? esc(v.company_name) : "Add a vendor"}</h2>
${v ? `<p class="muted small">${esc(v.pst_vendor_id || "")}</p>` : `<label>Vendor number<input name="pid" value="${nextVendorNumber()}"></label>`}
<label>Company name<input name="cn" required value="${esc(v?.company_name || "")}"></label><label>Contact<input name="ct" value="${esc(v?.contact_name || "")}"></label>
<label>WhatsApp<input name="wa" type="tel" value="${esc(v?.whatsapp_number || "")}"></label><label>Address<textarea name="ad" rows="2">${esc(v?.address || "")}</textarea></label>
<label>Shipping lead time (days)<input name="lt" type="number" min="0" step="1" inputmode="numeric" value="${v ? vendorLead(v) : 10}"></label>
${v ? `<label class="toggle"><input type="checkbox" name="act"${v.is_active !== false ? " checked" : ""}> Active (shows up on new orders)</label>` : ""}
<p class="status" data-vs></p><button class="btn primary wide" type="submit">${v ? "Save" : "Add vendor"}</button></form>`, "Vendor");
    const f = w.querySelector("form");
    f.addEventListener("submit", async e => { e.preventDefault(); const st = f.querySelector("[data-vs]"), cn = f.cn.value.trim(), lead = Number(f.lt.value || 10);
      if (!cn) { st.textContent = "Company name is required."; return; }
      if (v && (!Number.isFinite(lead) || lead < 0)) { st.textContent = "Lead time must be zero or more."; return; }
      const base = { company_name: cn, address: f.ad.value.trim() || null, contact_name: f.ct.value.trim() || null, whatsapp_number: f.wa.value.trim() || null, updated_at: new Date().toISOString() };
      const res = v ? await P.client().from("vendors").update({ ...base, standard_shipping_lead_time: lead, is_active: f.act.checked }).eq("id", v.id).select("*").single()
        : await P.client().from("vendors").insert({ ...base, pst_vendor_id: f.pid.value.trim() || nextVendorNumber(), standard_shipping_lead_time: Number.isFinite(lead) && lead >= 0 ? lead : 10, is_active: true }).select("*").single();
      if (res.error) { st.textContent = res.error.message; return; }
      P.closeSheet(); P.toast(v ? "Vendor saved" : "Vendor added"); then && then();
    });
  }

  window.PSTOps3 = { poSheet, poOpen, reorderPane, vendorsPane };
})();
