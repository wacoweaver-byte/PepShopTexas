/* Pep Shop Texas · Owner app: order inbox, alerts, one-tap texts. Status changes stay in admin.html (it sends the emails). */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc, money } = P;
  let orders = [], items = {}, tab = "pay", me = null, timer = null, protos = {};
  const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : P.fmtDate(t); };
  const os = o => String(o.order_status || o.status || "pending").toLowerCase(), ps = o => String(o.payment_status || "pending").toLowerCase();
  const dead = o => ["rejected", "cancelled", "canceled", "refunded", "failed"].includes(os(o));
  const pickup = o => /local pickup/i.test(o.customer_notes || "");
  const done = o => ["shipped", "delivered", "complete", "completed"].includes(os(o));
  const TABS = {
    pay: { t: "To be paid", f: o => !dead(o) && ps(o) !== "paid" && !done(o) },
    pack: { t: "To pack", f: o => !dead(o) && ps(o) === "paid" && !done(o) && os(o) !== "packed" },
    ready: { t: "Ready / out", f: o => !dead(o) && (os(o) === "packed" || os(o) === "shipped") },
    all: { t: "All", f: () => true }
  };
  const phoneOf = o => String(o.customer_phone || o.shipping_phone || "").replace(/[^\d+]/g, "");
  const first = o => String(o.customer_name || "there").split(/\s+/)[0];
  const sms = (o, body) => `sms:${phoneOf(o)}${/iphone|ipad/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(body)}`;
  const itemsText = o => (items[o.id] || []).map(i => `${i.product_name} ${i.product_strength || ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`.trim()).join(", ");

  async function boot() {
    const root = $("[data-owner]");
    me = await P.getUser();
    if (!me) { root.innerHTML = `<div class="empty"><h1 class="serif">Owner sign in</h1><p>Sign in with your admin account.</p><a class="btn primary" href="login.html?redirect=owner.html">Sign in</a></div>`; return; }
    if (!(await P.isAdmin(me))) { root.innerHTML = `<div class="empty"><h1 class="serif">Owners only</h1><p>This page is for Pep Shop Texas staff.</p><a class="btn ghost" href="index.html">Go to the shop</a></div>`; return; }
    root.innerHTML = `<header class="ohd"><div><small>Pep Shop Texas</small><h1 class="serif">Orders</h1></div><div class="ohr"><button class="btn ghost sm" type="button" data-o="refresh" aria-label="Refresh">↻</button><a class="btn ghost sm" href="admin.html">Admin</a></div></header>
<div data-alerts></div><div class="tiles" data-stats></div><div class="atabs otabs" role="tablist" data-tabs></div><div data-list aria-live="polite"></div>
<details class="ownsec pm" style="margin-top:26px"><summary class="serif">Products <span class="muted small">· add, edit, put live</span></summary><div data-pm><p class="muted small">Loading…</p></div></details>
<details class="ownsec ins" style="margin-top:12px"><summary class="serif">Insights <span class="muted small">· sales, customers &amp; site traffic</span></summary><div data-ins><p class="muted small">Loading…</p></div></details>
<details class="ownsec proto" style="margin-top:12px"><summary class="serif">My protocols <span class="muted small">· private, only you see this</span></summary><div data-protos><p class="muted small">Loading…</p></div></details>
<details class="ownsec" style="margin-top:12px"><summary class="serif">Products: write-ups &amp; reorder times</summary><div data-times><p class="muted small">Loading…</p></div></details>
<section style="margin-top:26px"><h2 class="serif" style="font-size:1.7rem">Running low soon</h2><p class="muted small">Customers likely to run low in the next 10 days, based on their own reorder rhythm. A friendly text sells.</p><div data-due></div></section>`;
    root.addEventListener("click", onClick);
    root.querySelector(".ownsec:not(.proto)").addEventListener("toggle", e => { if (e.target.open) times(); });
    root.querySelector(".ownsec.proto").addEventListener("toggle", e => { if (e.target.open) protoPage(); });
    root.querySelector(".ownsec.ins").addEventListener("toggle", e => { if (e.target.open) insights(30); });
    root.querySelector(".ownsec.pm").addEventListener("toggle", e => { if (e.target.open) pmList(); });
    root.addEventListener("input", e => { if (e.target.matches("[data-pmsearch]")) pmFilter(e.target.value); });
    root.addEventListener("input", e => { if (e.target.matches("[data-psearch]")) protoFilter(e.target.value); });
    root.addEventListener("change", async e => { const t = e.target;
      if (t.matches("[data-pf]")) { saveProto(t.closest("[data-proto]")); return; }
      if (t.matches("[data-days]")) { const v = Math.round(Number(t.value)) || null; setDays(t.dataset.days, v, "owner"); return; }
      if (t.matches("[data-summary]")) { const v = t.value.trim() || null; const { error } = await P.client().from("product_catalog").update({ research_summary: v }).eq("display_name", t.dataset.summary); P.toast(error ? "Couldn't save: " + error.message : v ? "Write-up saved" : "Write-up cleared"); return; }
      if (!t.matches("[data-default]")) return; const v = Math.max(0, Math.min(365, Number(t.value) || 0)) || null;
      const { error } = await P.client().from("product_catalog").update({ reorder_days_default: v }).eq("product_key", t.dataset.default);
      P.toast(error ? "Couldn't save: " + error.message : v ? `Saved: ${v} days` : "Cleared"); });
    alertsCard(); await load();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    timer = setInterval(() => { if (!document.hidden) load(); }, 45000);
    const m = location.hash.match(/o=([\w-]+)/); if (m) { tab = "all"; draw(); const el = $(`[data-card="${m[1]}"]`); if (el) { el.querySelector(".ob").hidden = false; el.scrollIntoView({ block: "center" }); } }
  }
  async function load() {
    let r = await P.client().from("orders").select("*").order("created_at", { ascending: false }).limit(120);
    if (r.error) { $("[data-list]").innerHTML = `<p class="notice err">Couldn't load orders: ${esc(r.error.message)}</p>`; return; }
    orders = r.data || [];
    const ids = orders.map(o => o.id);
    items = {};
    if (ids.length) { const ir = await P.client().from("order_items").select("*").in("order_id", ids); (ir.data || []).forEach(i => (items[i.order_id] ||= []).push(i)); }
    await loadProtos();
    draw(); due();
    if (navigator.setAppBadge) { const n = orders.filter(TABS.pay.f).length; try { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch {} }
  }
  function draw() {
    const today = new Date().toDateString(), tod = orders.filter(o => new Date(o.created_at).toDateString() === today && !dead(o));
    $("[data-stats]").innerHTML = `<div class="tile"><small>Today</small><b>${tod.length}</b><span class="muted small">${money(tod.reduce((s, o) => s + Number(o.total || 0), 0))}</span></div><div class="tile"><small>Waiting on payment</small><b>${orders.filter(TABS.pay.f).length}</b><span class="muted small">${money(orders.filter(TABS.pay.f).reduce((s, o) => s + Number(o.total || 0), 0))}</span></div>`;
    $("[data-tabs]").innerHTML = Object.entries(TABS).map(([k, v]) => `<button class="tab${k === tab ? " on" : ""}" type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${v.t}${k !== "all" ? ` (${orders.filter(v.f).length})` : ""}</button>`).join("");
    const list = orders.filter(TABS[tab].f).slice(0, 60);
    $("[data-list]").innerHTML = list.length ? list.map(card).join("") : `<div class="empty">${P.icon("check", 28)}<p>Nothing here. Nice.</p></div>`;
  }
  function card(o) {
    const its = items[o.id] || [], pk = pickup(o), rem = (o.customer_notes || "").match(/Reorder reminder:\s*(.+)/i);
    const st = dead(o) ? ["bad", os(o)] : done(o) ? ["ship", os(o) === "delivered" ? (pk ? "Picked up" : "Delivered") : pk ? "Ready" : "Shipped"] : os(o) === "packed" ? ["ok", pk ? "Ready for pickup" : "Packed"] : ps(o) === "paid" ? ["ok", "Paid · pack it"] : ["pend", "Awaiting payment"];
    return `<article class="ocard" data-card="${o.id}"><button class="oh" type="button" data-open="${o.id}"><div><b>${esc(o.customer_name || "Customer")} · ${money(o.total)}</b><span>${esc(o.order_number || "")} · ${ago(o.created_at)} · ${pk ? "Pickup" : "Ship"} · ${esc(o.payment_method || "")}</span></div><span class="opill ${st[0]}">${esc(st[1])}</span></button>
<div class="ob" hidden><div class="oitems">${its.map(i => `<div class="oline"><span>${esc(i.product_name)} ${esc(i.product_strength || "")} × ${i.quantity}${i.backorder_quantity ? ` <span class="bo">· ${i.backorder_quantity} on backorder</span>` : ""}</span><b>${money(i.line_total)}</b>${lineDays(o, i)}</div>`).join("")}
<div><span class="muted">${pk ? "Local pickup" : "Shipping"}</span><span>${o.shipping ? money(o.shipping) : "Free"}</span></div><div><b>Total</b><b>${money(o.total)}</b></div></div>
${!pk && o.shipping_address ? `<p class="small muted">${P.icon("truck", 14)} ${esc(o.shipping_address)}</p>` : ""}${rem ? `<p class="small" style="color:var(--gold2)">${P.icon("bell", 14)} Reorder reminder: ${esc(rem[1])}</p>` : ""}
${holdRow(o)}<p class="small muted">${esc(o.customer_email || "")}${phoneOf(o) ? ` · ${esc(o.customer_phone || o.shipping_phone)}` : ""}</p>
<div class="oacts">${phoneOf(o) ? `<button class="btn primary sm" type="button" data-texts="${o.id}">${P.icon("chat", 16)} Text</button><a class="btn ghost sm" href="tel:${phoneOf(o)}">Call</a>` : ""}<a class="btn ghost sm" href="mailto:${esc(o.customer_email || "")}?subject=${encodeURIComponent("Your Pep Shop Texas order " + (o.order_number || ""))}">Email</a><a class="btn ghost sm" href="admin.html">Update in Admin</a><button class="btn ghost sm" type="button" data-copy="${esc(o.order_number || o.id)}">Copy #</button></div></div></article>`;
  }
  function texts(o) {
    const n = first(o), no = o.order_number || "", t = money(o.total);
    const T = [
      ["Got your order", `Hi ${n}, got your order ${no} (${t}). Send it on Venmo to @${P.CFG.venmo} with ${no} in the note and I'll get it ready. Thanks! - Jimmie, Pep Shop Texas`],
      ["Payment received", `Hi ${n}, payment received for ${no}. Thank you! I'll let you know as soon as it's ${pickup(o) ? "ready for pickup" : "on the way"}.`],
      pickup(o) ? ["Ready for pickup", `Hi ${n}, your order ${no} is ready for pickup. Let me know what time works for you today.`] : ["Shipped", `Hi ${n}, your order ${no} shipped${o.tracking_number ? ` (${o.tracking_carrier || "tracking"}: ${o.tracking_number})` : ""}. Thanks!`],
      ["Payment reminder", `Hi ${n}, just a reminder your order ${no} is waiting on payment (${t}). Venmo @${P.CFG.venmo} with ${no} in the note. Thanks!`]
    ];
    P.sheet(`<h2 class="serif">Text ${esc(n)}</h2><p class="muted small">Opens Messages with the text filled in. Edit before sending if you like.</p><div class="pm" style="margin-top:12px">${T.map(([l, b]) => `<a class="txtopt" href="${esc(sms(o, b))}"><b>${l}</b><span>${esc(b)}</span></a>`).join("")}</div>`, { label: "Text customer" });
  }
  /* who's likely running low: their own reorder rhythm -> their reminder choice -> learned product cycle -> product default -> 28d */
  let cyc = {}, prods = [];
  async function due() {
    [cyc, prods] = await Promise.all([P.cycles(), P.products().catch(() => [])]);
    const by = {};
    [...orders].reverse().forEach(o => { if (dead(o) || ps(o) !== "paid") return; (items[o.id] || []).forEach(i => { const k = (o.customer_email || o.customer_id || o.customer_name) + "|" + (i.product_key || i.product_name + i.product_strength); (by[k] ||= []).push({ o, i, t: new Date(o.created_at).getTime() }); }); });
    const out = [];
    for (const k in by) {
      const b = by[k], last = b[b.length - 1], gaps = b.slice(1).map((x, j) => (x.t - b[j].t) / 864e5).filter(d => d >= 5 && d <= 200).sort((x, y) => x - y);
      const p = prods.find(x => x.product_key === last.i.product_key);
      const d = gaps.length ? gaps[gaps.length >> 1] : Number(last.i.reorder_reminder_days) || Number(cyc[last.i.product_key]?.typical_days) || Number(p?.reorder_days_default) || 28;
      const at = new Date(last.t + d * 864e5), days = Math.ceil((at - Date.now()) / 864e5);
      if (days > 10 || days < -30) continue; out.push({ o: last.o, i: last.i, days, at });
    }
    out.sort((a, b) => a.at - b.at);
    $("[data-due]").innerHTML = out.length ? out.map(d => `<div class="dueitem"><div><b>${esc(d.o.customer_name || "Customer")}</b><span class="muted small" style="display:block">${esc(d.i.product_name)} ${esc(d.i.product_strength || "")} · ${d.days <= 0 ? "probably out now" : `in about ${d.days} day${d.days === 1 ? "" : "s"}`}</span></div>${phoneOf(d.o) ? `<a class="btn ghost sm" href="${esc(sms(d.o, `Hi ${first(d.o)}, your ${d.i.product_name} ${d.i.product_strength || ""} is probably running low. Want me to set another aside for you? - Jimmie, Pep Shop Texas`))}">Text</a>` : ""}</div>`).join("") : `<p class="muted small">Nobody's due in the next 10 days.</p>`;
  }
  /* Reorder times: what customers actually do, plus Jimmie's starting guess for new products */
  async function times() {
    const el = $("[data-times]"); [cyc, prods] = await Promise.all([P.cycles(), P.products().catch(() => [])]);
    const gs = P.groups(prods);
    el.innerHTML = `<p class="muted small">Write-ups show on each product page under Overview (plain facts work best; no health claims). Reorder days are the starting guess for running-low reminders until real reorders teach it.</p>
<div class="times">${gs.map(g => `<details class="pgrp"><summary><b>${esc(g[0].display_name)}</b><span class="muted small">${g.map(p => esc(p.strength || "")).join(" · ")}${g.some(p => p.research_summary) ? " · ✓ write-up" : ""}</span></summary>
<label class="tin" style="display:block;margin:8px 0"><span class="small muted">Product write-up</span><textarea data-summary="${esc(g[0].display_name)}" rows="4" maxlength="2000" placeholder="e.g. What it is, form, what's in a blend, storage. Research use only.">${esc(g.find(p => p.research_summary)?.research_summary || "")}</textarea></label>
${g.map(p => { const c = cyc[p.product_key]; return `<div class="trow"><div><b>${esc(p.strength || "")}</b><span class="muted small" style="display:block">${c ? `Learned: ~${Math.round(c.typical_days)} days (${c.samples} reorders)` : "Learned: not enough reorders yet"}</span></div><label class="tin"><input type="number" min="1" max="365" inputmode="numeric" placeholder="28" value="${Number(p.reorder_days_default) || ""}" data-default="${esc(p.product_key)}" aria-label="Typical days for ${esc(p.display_name)} ${esc(p.strength || "")}"><span>days</span></label></div>`; }).join("")}</details>`).join("")}</div>`;
  }

  /* ---- Products: add, edit and put live from the phone (same tables and fields as admin → Products) ---- */
  let pmRows = [], pmInv = {};
  const PM_CATS = ["Peptide", "Multi-Peptide Product", "Supply", "Vitamin", "Other"];
  async function pmLoad() {
    const [c, i] = await Promise.all([P.client().from("product_catalog").select("*").order("display_name"), P.client().from("product_inventory").select("product_key,current_inventory,cost_per_unit,is_active")]);
    if (c.error) throw c.error; pmRows = c.data || []; pmInv = Object.fromEntries((i.data || []).map(x => [x.product_key, x]));
  }
  async function pmList() {
    const el = $("[data-pm]");
    try { await pmLoad(); } catch (err) { el.innerHTML = `<p class="notice err">${esc(err.message)}</p>`; return; }
    el.innerHTML = `<div class="pmtop"><input class="psearch" type="search" data-pmsearch placeholder="Search products" aria-label="Search products"><button class="btn primary sm" type="button" data-pmnew>+ New product</button></div>
<div class="pmlist">${pmRows.map(p => { const on = p.is_active !== false, n = Number(pmInv[p.product_key]?.current_inventory ?? p.current_inventory ?? 0);
  return `<div class="pmrow" data-pmname="${esc(`${p.display_name} ${p.strength || ""} ${p.product_key}`.toLowerCase())}"><button type="button" class="pmmain" data-pmedit="${esc(p.product_key)}">${P.vial(p, 34)}<span><b>${esc(p.display_name)} ${esc(p.strength || "")}</b><small>${money(P.unitPrice(p))} · ${n} on hand · ${esc(P.vialColorName(p))}</small></span></button>
<button type="button" class="pmlive" role="switch" aria-checked="${on}" data-pmlive="${esc(p.product_key)}" aria-label="Live on site"><i></i><span>${on ? "Live" : "Hidden"}</span></button></div>`; }).join("")}</div>`;
  }
  function pmFilter(q) { q = q.trim().toLowerCase(); $$("[data-pmname]").forEach(r => r.hidden = !!q && !r.dataset.pmname.includes(q)); }
  async function pmLive(key, on, btn) {
    btn.disabled = true; const now = new Date().toISOString();
    const a = await P.client().from("product_catalog").update({ is_active: on, updated_at: now }).eq("product_key", key);
    const b = await P.client().from("product_inventory").update({ is_active: on, updated_at: now }).eq("product_key", key);
    btn.disabled = false;
    if (a.error || b.error) { P.toast("Couldn't change it: " + (a.error || b.error).message); return; }
    btn.setAttribute("aria-checked", on); btn.querySelector("span").textContent = on ? "Live" : "Hidden"; P.toast(on ? "Live on the site" : "Hidden from the site");
  }
  function pmNextKey() { const mx = pmRows.reduce((m, p) => { const x = String(p.product_key || "").match(/^PSTP(\d+)$/i); return x ? Math.max(m, +x[1]) : m; }, 100000); return `PSTP${String(mx + 1).padStart(6, "0")}`; }
  function pmEdit(key) {
    const p = key ? pmRows.find(x => x.product_key === key) : null, isNew = !p;
    const v = p || { product_key: "__new", display_name: "", strength: "", category: "Peptide", price: 0, label_color: "", is_active: true };
    const colors = Object.keys(P.LABEL_COLORS).filter(c => c !== "grey").map(c => c[0].toUpperCase() + c.slice(1));
    const w = P.sheet(`<form class="pmform" data-pmform><h2 class="serif">${isNew ? "New product" : esc(`${v.display_name} ${v.strength || ""}`)}</h2>
<div class="pmprev" data-pmprev></div>
<label>Name<input name="display_name" required maxlength="80" value="${esc(v.display_name || "")}" placeholder="e.g. BPC-157"></label>
<div class="pm2"><label>Strength<input name="strength" maxlength="30" value="${esc(v.strength || "")}" placeholder="10mg"></label><label>Price<input name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${Number(v.price || 0).toFixed(2)}"></label></div>
<div class="pm2"><label>Category<select name="category">${[...new Set([...PM_CATS, v.category].filter(Boolean))].map(c => `<option${c === v.category ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
<label>Label color<select name="label_color"><option value="">Auto (${esc(P.vialColorName({ ...v, label_color: "" }))})</option>${colors.map(c => `<option${String(v.label_color || "").toLowerCase() === c.toLowerCase() ? " selected" : ""}>${c}</option>`).join("")}</select></label></div>
<div class="pm2"><label class="toggle"><input type="checkbox" name="sale_enabled"${v.sale_enabled ? " checked" : ""}> On sale</label><label>Sale price<input name="sale_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.sale_price ?? ""}"></label></div>
<label class="toggle"><input type="checkbox" name="is_active"${v.is_active !== false ? " checked" : ""}> Live on the site</label>
${isNew ? `<label>Cost per vial (optional)<input name="cost" type="number" step="0.01" min="0" inputmode="decimal"></label><p class="muted small">New products start with 0 in stock. Receive stock in <a href="inventory.html">Inventory</a>.</p>` : `<p class="muted small">${Number(pmInv[v.product_key]?.current_inventory ?? v.current_inventory ?? 0)} on hand · stock, COAs and costs stay in <a href="products.html">admin → Products</a> and <a href="inventory.html">Inventory</a>.</p>`}
<button class="btn primary wide" type="submit">${isNew ? "Create product" : "Save changes"}</button><p class="status" data-pmstat role="status"></p></form>`, { label: isNew ? "New product" : "Edit product" });
    const f = w.querySelector("form"), prev = w.querySelector("[data-pmprev]");
    const cur = () => ({ ...v, product_key: v.product_key, display_name: f.display_name.value.trim() || "NEW PRODUCT", label_line_1: null, strength: f.strength.value.trim(), label_color: f.label_color.value, category: f.category.value });
    const drawPrev = () => { const c = cur(); c.product_key = "__prev_" + (v.product_key || "new"); prev.innerHTML = P.vial(c, 90); };
    drawPrev(); f.addEventListener("input", () => { clearTimeout(f._t); f._t = setTimeout(drawPrev, 250); });
    f.addEventListener("submit", async e => {
      e.preventDefault(); const st = f.querySelector("[data-pmstat]"), btn = f.querySelector("[type=submit]"); btn.disabled = true; st.textContent = "Saving…"; st.className = "status";
      const now = new Date().toISOString(), name = f.display_name.value.trim(), strength = f.strength.value.trim() || null, category = f.category.value, price = Math.max(0, Number(f.price.value) || 0), live = f.is_active.checked;
      const fields = { display_name: name, strength, category, price, label_color: f.label_color.value || null, is_active: live, blend_stack: category === "Multi-Peptide Product",
        sale_enabled: f.sale_enabled.checked, sale_price: f.sale_enabled.checked && Number(f.sale_price.value) > 0 ? Number(f.sale_price.value) : null, updated_at: now };
      try {
        if (isNew) {
          const k = pmNextKey();
          const r1 = await P.client().from("product_catalog").insert({ product_key: k, sort_name: name, coa_label: "View COA", current_inventory: 0, featured: false, hot_peptide: false, sale_label: null, created_at: now, ...fields }).select("product_key,label_color").single();
          if (r1.error) throw r1.error;
          const cost = Number(f.cost?.value || 0);
          const r2 = await P.client().from("product_inventory").upsert({ product_key: k, display_name: name, category, strength, price, current_inventory: 0, low_stock_threshold: 5, limited_stock_threshold: 10, is_active: live, featured: false, blend_stack: fields.blend_stack, coa_label: "View COA", cost_per_unit: cost > 0 ? cost : null, updated_at: now }, { onConflict: "product_key" });
          if (r2.error) throw new Error(`${k} was created, but the inventory record didn't save: ${r2.error.message}`);
          P.toast(`${name} ${strength || ""} created · label ${r1.data?.label_color || "auto"}`);
        } else {
          const r1 = await P.client().from("product_catalog").update(fields).eq("product_key", v.product_key); if (r1.error) throw r1.error;
          const r2 = await P.client().from("product_inventory").update({ display_name: name, category, strength, price, is_active: live, blend_stack: fields.blend_stack, updated_at: now }).eq("product_key", v.product_key);
          if (r2.error) throw new Error(`Saved to the shop, but the inventory record didn't update: ${r2.error.message}`);
          P.toast("Saved");
        }
        P.closeSheet?.(); document.querySelector("#sheet")?.remove(); document.body.classList.remove("noscroll"); pmList();
      } catch (err) { st.textContent = err.message || "Couldn't save."; st.className = "status bad"; btn.disabled = false; }
    });
  }

  /* ---- Insights: one call to pst_insights (owner-only) ---- */
  async function insights(days) {
    const el = $("[data-ins]"); el.innerHTML = `<p class="muted small">Loading…</p>`;
    const to = new Date(), from = new Date(); if (days === 365) from.setMonth(0, 1); else from.setDate(to.getDate() - days + 1);
    const d = x => x.toISOString().slice(0, 10);
    const { data, error } = await P.client().rpc("pst_insights", { p_from: d(from), p_to: d(to) });
    if (error) { el.innerHTML = `<p class="notice err">Insights aren't set up yet (${esc(error.message)}).</p>`; return; }
    const w = data.web, r = data.retail, st = data.stock, pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + "%";
    const names = Object.fromEntries((prods.length ? prods : await P.products().catch(() => [])).map(p => [p.product_key, `${p.display_name} ${p.strength || ""}`.trim()]));
    const bars = (rows, key, lab) => { const mx = Math.max(1, ...rows.map(x => +x[key] || 0)); return `<div class="ibars">${rows.map(x => `<div title="${esc(x.d)}: ${lab(x)}"><i style="height:${Math.round((+x[key] || 0) / mx * 100)}%"></i></div>`).join("")}</div>`; };
    const list = (rows, label, val) => rows.length ? `<ol class="ilist">${rows.map(x => `<li><span>${label(x)}</span><b>${val(x)}</b></li>`).join("")}</ol>` : `<p class="muted small">Nothing yet.</p>`;
    const f = w.funnel, fz = [["Visits", f.sessions], ["Viewed a product", f.viewed_product], ["Added to bag", f.added_to_bag], ["Started checkout", f.started_checkout], ["Placed order", f.placed_order]];
    el.innerHTML = `<div class="irange">${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "This year"]].map(([n, l]) => `<button type="button" class="tab${n === days ? " on" : ""}" data-range="${n}">${l}</button>`).join("")}</div>
<div class="tiles itiles"><div class="tile"><small>Paid sales</small><b>${money(r.revenue_paid)}</b><span class="muted small">${r.paid_orders} paid · ${money(r.revenue_pending)} waiting</span></div>
<div class="tile"><small>Orders</small><b>${r.orders}</b><span class="muted small">avg ${money(r.avg_order)} · ${r.cancelled} cancelled</span></div>
<div class="tile"><small>Customers</small><b>${r.customers}</b><span class="muted small">${r.new_customers} new · ${r.repeat_customers} returning</span></div>
<div class="tile"><small>Visitors</small><b>${w.visitors}</b><span class="muted small">${w.page_views} page views · ${w.app_sessions} app visits</span></div>
<div class="tile"><small>Conversion</small><b>${pct(f.placed_order, f.sessions)}</b><span class="muted small">of visits placed an order</span></div></div>
<div class="igrid">
<section><h3 class="kick">Sales by day</h3>${bars(r.by_day, "paid", x => money(x.paid))}</section>
<section><h3 class="kick">Visitors by day</h3>${bars(w.by_day, "visitors", x => x.visitors + " visitors")}</section>
<section><h3 class="kick">Shopping funnel</h3><div class="funnel">${fz.map(([l, n]) => `<div><span>${l}</span><i style="width:${f.sessions ? Math.max(2, Math.round(n / f.sessions * 100)) : 0}%"></i><b>${n}</b></div>`).join("")}</div></section>
<section><h3 class="kick">Top products · sales</h3>${list(r.top_products, x => esc(`${x.name} ${x.strength || ""}`), x => `${money(x.revenue)} · ${x.units}`)}</section>
<section><h3 class="kick">Most viewed</h3>${list(w.top_viewed, x => esc(names[x.product_key] || x.product_key), x => x.n)}</section>
<section><h3 class="kick">Where visitors come from</h3>${list(w.sources, x => esc(x.src), x => x.n)}</section>
<section><h3 class="kick">What people search for</h3>${list(w.searches, x => esc(x.term), x => x.n)}</section>
<section><h3 class="kick">Orders</h3>${list([...Object.entries(r.payment_mix).map(([k, v]) => ({ k, v })), { k: "Local pickup", v: r.pickup }, { k: "Shipped", v: r.shipped }], x => esc(x.k), x => x.v)}
<p class="muted small">Discounts ${money(r.discounts)} · store credit ${money(r.store_credit)} · ${r.backorder_units} vials backordered · ${r.auto_cancelled} auto-cancelled unpaid</p></section>
<section><h3 class="kick">Devices</h3>${list(Object.entries(w.devices).map(([k, v]) => ({ k, v })), x => esc(x.k), x => x.v)}</section>
<section><h3 class="kick">Running low</h3>${list(st.low, x => esc(`${x.display_name} ${x.strength || ""}`), x => `${x.current_inventory} left`)}<p class="muted small">${st.out} products out of stock</p></section>
</div><p class="muted small" style="margin-top:12px">Site numbers are counted without cookies or third parties. Admin pages and your own owner app aren't counted.</p>`;
  }

  /* ---- private protocols: Jimmie's own reference, used only to work out how long an order lasts ---- */
  async function loadProtos() {
    const r = await P.client().from("pst_protocols").select("*");
    protos = {}; (r.data || []).forEach(p => protos[p.display_name] = p);
  }
  const UNIT = { mg: 1, mcg: 0.001, iu: 1 };
  // vial amount from the product's strength ("10mg", "500mcg", "10iu"); blends with several amounts are set by hand
  function vialAmount(strength, unit) {
    const m = String(strength || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)\b/g);
    if (!m || m.length !== 1) return null;
    const [, n, u] = m[0].match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)/);
    if ((u === "iu") !== (unit === "iu")) return null;
    return Number(n) * (u === "iu" ? 1 : UNIT[u]);
  }
  function lastsDays(p, strength, qty = 1) {
    if (!p || !(p.amount > 0) || !(p.uses_per_week > 0)) return null;
    const vial = vialAmount(strength, p.amount_unit); if (!vial) return null;
    const per = p.amount * (p.amount_unit === "iu" ? 1 : UNIT[p.amount_unit]);
    const d = Math.floor((vial * qty) / (per * p.uses_per_week / 7));
    return d >= 1 && d <= 365 ? d : null;
  }
  const protoDays = i => lastsDays(protos[i.product_name], i.product_strength, i.quantity);
  function lineDays(o, i) {
    if (dead(o)) return "";
    const d = protoDays(i), cur = Number(i.reorder_reminder_days) || "";
    const basis = i.reorder_basis === "protocol" ? "standard protocol" : i.reorder_basis === "owner" ? "set by you" : cur ? "customer's choice" : "auto estimate";
    return `<div class="odays"><span class="muted small">Lasts</span><input type="number" min="1" max="365" inputmode="numeric" data-days="${i.id}" value="${cur}" placeholder="auto" aria-label="Days this lasts"><span class="muted small">days · ${basis}</span>${d && d !== cur ? `<button class="btn ghost sm" type="button" data-std="${i.id}">Standard protocol · ${d} days</button>` : ""}${!protos[i.product_name] ? `<span class="muted small">· no protocol saved for ${esc(i.product_name)}</span>` : ""}</div>`;
  }
  async function setDays(id, days, basis) {
    const { error } = await P.client().rpc("pst_set_order_line_days", { p_item_id: id, p_days: days, p_basis: basis });
    if (error) { P.toast("Couldn't save: " + error.message); return; }
    const i = Object.values(items).flat().find(x => String(x.id) === String(id)); if (i) { i.reorder_reminder_days = days; i.reorder_basis = days ? basis : null; }
    P.toast(days ? `Reminder set: runs out in about ${days} days` : "Back to the automatic estimate"); draw();
  }
  function holdRow(o) {
    if (dead(o) || done(o) || ps(o) === "paid" || !o.payment_deadline_at) return "";
    const at = new Date(o.payment_deadline_at), held = at - Date.now() > 300 * 864e5;
    const left = Math.max(0, Math.round((at - Date.now()) / 36e5));
    return `<p class="small hold">${P.icon("clock", 14)} ${held ? "Held until paid · auto-cancel off" : `Auto-cancels in ${left}h if unpaid`} <button class="btn ghost sm" type="button" data-hold="${o.id}" data-on="${held ? "0" : "1"}">${held ? "Turn timer back on" : "Hold until paid"}</button></p>`;
  }
  async function protoPage() {
    const el = $("[data-protos]"); prods = await P.products().catch(() => []); await loadProtos();
    const gs = P.groups(prods);
    el.innerHTML = `<p class="muted small">Your reference while you talk with a customer, and the numbers behind "Standard protocol" on an order. Only you can see this page. Orders save how many days the vials last, never what's written here.</p>
<input class="psearch" type="search" data-psearch placeholder="Search a product" aria-label="Search a product">
<div class="times">${gs.map(g => { const name = g[0].display_name, p = protos[name] || {};
  return `<details class="pgrp" data-proto="${esc(name)}" data-name="${esc(name.toLowerCase())}"><summary><b>${esc(name)}</b><span class="muted small">${g.map(x => `${esc(x.strength || "")} <span class="${P.qty(x) > 0 ? "" : "bad"}">(${P.qty(x)} on hand)</span>`).join(" · ")}${p.amount ? " · ✓ protocol" : ""}</span></summary>
<div class="pform"><label><span class="small muted">Amount per use</span><input type="number" step="any" min="0" data-pf="amount" value="${p.amount ?? ""}"></label>
<label><span class="small muted">Unit</span><select data-pf="amount_unit">${["mg", "mcg", "iu"].map(u => `<option${(p.amount_unit || "mg") === u ? " selected" : ""}>${u}</option>`).join("")}</select></label>
<label><span class="small muted">Times per week</span><input type="number" step="any" min="0" max="28" data-pf="uses_per_week" value="${p.uses_per_week ?? ""}"></label>
<label><span class="small muted">Cycle length, weeks</span><input type="number" step="any" min="0" data-pf="cycle_weeks" value="${p.cycle_weeks ?? ""}"></label></div>
<label class="tin" style="display:block;margin:8px 0"><span class="small muted">Notes (reconstitution, timing, anything you tell customers)</span><textarea data-pf="notes" rows="3" maxlength="4000">${esc(p.notes || "")}</textarea></label>
<p class="small" data-plast>${g.map(x => { const d = lastsDays(p, x.strength); return `${esc(x.strength || "")}: ${d ? `one vial lasts about <b>${d} days</b>` : p.amount ? "set days by hand (blend or different unit)" : "fill in the protocol to calculate"}`; }).join("<br>")}</p></details>`; }).join("")}</div>`;
  }
  function protoFilter(q) { q = q.trim().toLowerCase(); $$("[data-proto]").forEach(d => { d.hidden = !!q && !d.dataset.name.includes(q); if (q && !d.hidden) d.open = true; }); }
  async function saveProto(box) {
    const name = box.dataset.proto, v = k => box.querySelector(`[data-pf="${k}"]`).value.trim();
    const num = k => (v(k) === "" ? null : Number(v(k)));
    const row = { display_name: name, amount: num("amount"), amount_unit: v("amount_unit") || "mg", uses_per_week: num("uses_per_week"), cycle_weeks: num("cycle_weeks"), notes: v("notes") || null, updated_at: new Date().toISOString(), updated_by: me?.email || null };
    const { error } = await P.client().from("pst_protocols").upsert(row, { onConflict: "display_name" });
    if (error) { P.toast("Couldn't save: " + error.message); return; }
    protos[name] = row; const g = P.groups(prods).find(x => x[0].display_name === name) || [];
    box.querySelector("[data-plast]").innerHTML = g.map(x => { const d = lastsDays(row, x.strength); return `${esc(x.strength || "")}: ${d ? `one vial lasts about <b>${d} days</b>` : row.amount ? "set days by hand (blend or different unit)" : "fill in the protocol to calculate"}`; }).join("<br>");
    P.toast("Protocol saved"); draw();
  }

  async function alertsCard() {
    const el = $("[data-alerts]"), st = await P.pushState().catch(() => "unsupported");
    if (st === "on") { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="alertcta" style="margin-top:0">${P.icon("bell", 24)}<b>${st === "needs-install" ? "Add this to your Home Screen" : "Get a ping for every new order"}</b><span>${st === "needs-install" ? "Share → Add to Home Screen, open it from there, then turn on alerts." : st === "blocked" ? "Notifications are blocked. Turn them on in Settings → Notifications." : "New orders, with the customer, items and total."}</span>${st === "blocked" || st === "unsupported" ? "" : `<button class="btn primary" type="button" data-o="push">${st === "needs-install" ? "Show me how" : "Turn on new-order alerts"}</button>`}</div>`;
  }
  async function onClick(e) {
    const t = e.target;
    const tb = t.closest("[data-tab]"); if (tb) { tab = tb.dataset.tab; draw(); return; }
    const op = t.closest("[data-open]"); if (op) { const b = op.parentElement.querySelector(".ob"); b.hidden = !b.hidden; return; }
    const tx = t.closest("[data-texts]"); if (tx) { texts(orders.find(o => String(o.id) === tx.dataset.texts)); return; }
    const sp = t.closest("[data-std]"); if (sp) { const i = Object.values(items).flat().find(x => String(x.id) === sp.dataset.std); const d = i && protoDays(i); if (d) await setDays(i.id, d, "protocol"); return; }
    const pe = t.closest("[data-pmedit]"); if (pe) { pmEdit(pe.dataset.pmedit); return; }
    const pn = t.closest("[data-pmnew]"); if (pn) { pmEdit(null); return; }
    const pl = t.closest("[data-pmlive]"); if (pl) { e.preventDefault(); pmLive(pl.dataset.pmlive, pl.getAttribute("aria-checked") !== "true", pl); return; }
    const rg = t.closest("[data-range]"); if (rg) { insights(Number(rg.dataset.range)); return; }
    const hd = t.closest("[data-hold]"); if (hd) { hd.disabled = true; const { error } = await P.client().rpc("pst_hold_until_paid", { p_order_id: hd.dataset.hold, p_hold: hd.dataset.on === "1" }); P.toast(error ? "Couldn't change hold: " + error.message : hd.dataset.on === "1" ? "Held until paid" : "24-hour timer restarted"); await load(); return; }
    const cp = t.closest("[data-copy]"); if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => P.toast("Copied " + cp.dataset.copy)); return; }
    const o = t.closest("[data-o]"); if (!o) return;
    if (o.dataset.o === "refresh") { o.disabled = true; await load(); o.disabled = false; P.toast("Up to date"); }
    if (o.dataset.o === "push") { try { if (await P.enablePush("owner")) { P.toast("New-order alerts are on"); alertsCard(); } } catch (err) { P.toast(err.message); } }
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
