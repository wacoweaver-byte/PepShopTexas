/* Pep Shop Texas · Owner app (v39): Today · Orders · Products · Customers · More. Order actions live in pst-owner-ops.js and follow admin.html's rules. */
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
    pay: { t: "Unpaid", f: o => !dead(o) && ps(o) !== "paid" && !done(o) },
    pack: { t: "To pack", f: o => !dead(o) && ps(o) === "paid" && !done(o) && os(o) !== "packed" },
    ready: { t: "Ready / out", s: "Out", f: o => !dead(o) && (os(o) === "packed" || os(o) === "shipped") },
    all: { t: "All", f: () => true }
  };
  const phoneOf = o => String(o.customer_phone || o.shipping_phone || "").replace(/[^\d+]/g, "");
  const first = o => String(o.customer_name || "there").split(/\s+/)[0];
  const sms = (o, body) => `sms:${phoneOf(o)}${/iphone|ipad/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(body)}`;
  const itemsText = o => (items[o.id] || []).map(i => `${i.product_name} ${i.product_strength || ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`.trim()).join(", ");

  /* ---- v38 app shell: bottom tabs like PepKeep (Today · Orders · Products · Customers · More) ---- */
  let view = "today", oq = "", pmLoaded = false, stockRows = [];
  const NAV = [["today", "home", "Today"], ["orders", "box", "Orders"], ["products", "flask", "Products"], ["customers", "users", "Customers"], ["more", "dots", "More"]];
  const TITLES = { today: "Today", orders: "Orders", products: "Products", customers: "Customers", more: "More", insights: "Insights", protos: "My protocols", times: "Write-ups", requests: "Requests", coa: "Lab reports", vendors: "Vendors", discounts: "Discount codes", promos: "Promotions", blast: "Email blast", ads: "Shop pictures", whatsnew: "What's new", vprices: "Vendor price lists", reports: "Reports", writer: "Report writer", paymethods: "Payment methods", emails: "Emails & reminders" };
  const MORE = [["reports", "chart", "Reports", "Sales, profit, expenses, stock moves"], ["writer", "doc", "Report writer", "Build any list, save it, download it"], ["insights", "chart", "Insights", "Customers and site traffic"], ["requests", "bell", "Requests", "Restock and bulk requests"], ["coa", "doc", "Lab reports", "Upload certificates, copy QR links"], ["stock", "box", "Stock & purchase orders", "Order from vendors, receive, reorder review"], ["vendors", "truck", "Vendors", "Who you buy from and lead times"], ["vprices", "doc", "Vendor price lists", "Upload a vendor's prices, match them"],
    ["discounts", "tag", "Discount codes", "Codes, limits, who can use them"], ["promos", "star", "Promotions", "Banners, free items, spend rewards"],
    ["emails", "bell", "Emails & reminders", "Everything your shop sends, and when"], ["blast", "chat", "Email blast", "Write and send to subscribers"], ["paymethods", "lock", "Payment methods", "What shoppers can pay with, discounts"], ["ads", "shop", "Shop pictures", "The carousel on the shop"],
    ["protos", "lock", "My protocols", "Private reference, only you see it"], ["times", "doc", "Write-ups & reorder times", "Product pages and running-low reminders"]];
  const mcard = (k, i, t, s, href) => `<${href ? `a href="${href}"` : `button type="button" data-more="${k}"`} class="mcard"><span class="mic">${P.icon(i, 20)}</span><span><b>${t}</b><small>${s}</small></span>${P.icon("next", 18)}</${href ? "a" : "button"}>`;

  async function boot() {
    const root = $("[data-owner]");
    me = await P.getUser();
    if (!me) { root.innerHTML = `<div class="empty"><h1 class="serif">Owner sign in</h1><p>Sign in with your admin account.</p><a class="btn primary" href="login.html?redirect=owner.html">Sign in</a></div>`; return; }
    if (!(await P.isAdmin(me))) { root.innerHTML = `<div class="empty"><h1 class="serif">Owners only</h1><p>This page is for Pep Shop Texas staff.</p><a class="btn ghost" href="index.html">Go to the shop</a></div>`; return; }
    document.body.classList.add("oapp");
    root.innerHTML = `<header class="ohd"><div><small>Pep Shop Texas</small><h1 class="serif" data-otitle>Today</h1></div><div class="ohr"><button class="btn ghost sm" type="button" data-q="lookup" aria-label="Look up anything">${P.icon("search", 18)}</button><button class="btn ghost sm bell" type="button" data-bell data-act="inbox" aria-label="Notifications">${P.icon("bell", 18)}<i hidden>0</i></button><button class="btn ghost sm" type="button" data-o="refresh" aria-label="Refresh">↻</button></div></header>
<section class="opane" data-pane="today"><p class="vibe" data-vibe></p><div data-cheer></div><div data-alerts></div><div class="tiles otiles" data-stats></div>
<div class="oquick"><button class="btn primary" type="button" data-q="neworder">${P.icon("plus", 16)} New order</button><button class="btn ghost" type="button" data-q="addcust">${P.icon("users", 16)} Add customer</button></div>
<div data-vmbox></div><h2 class="serif osec">Needs you</h2><div data-attn></div>
<h2 class="serif osec">Running low soon</h2><p class="muted small">Customers likely to run low in the next 10 days, based on their own reorder rhythm. A friendly text sells.</p><div data-due></div></section>
<section class="opane" data-pane="orders" hidden><div class="pmtop"><input class="psearch" type="search" data-osearch placeholder="Search orders" aria-label="Search orders by name, order number or email"><button class="btn primary sm" type="button" data-q="neworder">+ New</button></div><div class="oseg" role="tablist" data-tabs></div><div data-list aria-live="polite"></div></section>
<section class="opane" data-pane="products" hidden><div class="oseg three" role="tablist"><button class="on" type="button" data-psub="catalog">Catalog</button><button type="button" data-psub="stock">Stock</button><button type="button" data-psub="reorder">Reorder</button></div>
<div data-pm><p class="muted small">Loading…</p></div><div data-reorder hidden></div><div data-stock hidden><div class="pmtop"><p class="muted small" style="margin:0;flex:1">Purchase orders and the shelf</p><button class="btn primary sm" type="button" data-newpo>+ New PO</button></div><div data-po></div><h2 class="serif osec">On the shelf</h2><p class="muted small" data-ssum></p><div class="schips" role="tablist" data-schips></div><input class="psearch" type="search" data-ssearch placeholder="Search products" aria-label="Search stock"><div data-slist><p class="muted small">Loading…</p></div><p class="muted small">Tap a product to correct its count.</p></div></section>
<section class="opane" data-pane="customers" hidden><div data-custs></div></section>
<section class="opane" data-pane="more" hidden><div data-morehome><button type="button" class="wnbar" data-more="whatsnew">${P.icon("star", 18)}<span><b>What's new</b><small>v${PSTOps4.RELEASES[0].v} · ${PSTOps4.RELEASES[0].title}</small></span><i data-wndot${PSTOps4.unseen() ? "" : " hidden"}>New</i></button><div class="mcards">${MORE.map(m => mcard(...m)).join("")}${mcard("", "gear", "Full admin", "Everything else, on the computer", "admin.html")}${mcard("", "shop", "View the shop", "See it the way customers do", "index.html")}</div>
<div class="nalbox thbox"><h2 class="serif">Look</h2><div class="oseg three" role="radiogroup" aria-label="App look" data-theme-pick>${[["dark", "Dark"], ["light", "Light"], ["auto", "Match phone"]].map(([k, l]) => `<button type="button" role="radio" data-th="${k}" aria-checked="${themePref() === k}" class="${themePref() === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
<p class="mlinks"><a href="install.html">Install guide</a><button type="button" class="linkish" data-signout>Sign out</button></p>
<div class="nalbox" id="alerts"><h2 class="serif">Alerts on this device</h2><div data-nal><p class="muted small">Loading…</p></div></div></div>
<div data-moresub hidden><button class="oback" type="button" data-moreback>${P.icon("back", 18)} More</button><div data-sub="insights" data-ins hidden></div><div data-sub="requests" data-reqs hidden></div><div data-sub="coa" data-coa hidden></div><div data-sub="vendors" data-vens hidden></div><div data-sub="blast" data-blast hidden></div><div data-sub="ads" data-ads hidden></div><div data-sub="whatsnew" data-wn hidden></div><div data-sub="vprices" data-vpr hidden></div><div data-sub="reports" data-rep hidden></div><div data-sub="writer" data-wri hidden></div><div data-sub="paymethods" data-pay hidden></div><div data-sub="emails" data-ems2 hidden></div><div data-sub="discounts" data-discs hidden></div><div data-sub="promos" data-promos hidden></div><div data-sub="protos" data-protos hidden></div><div data-sub="times" data-times hidden></div></div></section>
<nav class="otabbar" aria-label="Owner app">${NAV.map(([k, i, l]) => `<button type="button" data-go="${k}" aria-current="${k === "today" ? "page" : "false"}">${P.icon(i, 22)}<span>${l}</span><i data-badge="${k}" hidden></i></button>`).join("")}</nav>`;
    setTimeout(wnDot, 0); setTimeout(updNote, 400);
    PSTOps.init({ me, get orders() { return orders; }, get items() { return items; }, reload: load, lineExtra: (o, i) => lineDays(o, i) });
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    window.addEventListener("hashchange", route);
    alertsCard(); P.refreshBell(); await load(); route();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { load(); P.refreshBell(); } });
    timer = setInterval(() => { if (!document.hidden) load(); }, 45000);
  }
  // owner.html#o=<id>&pay=1 (alerts), #alerts, #stock, #products, #customers, #insights…
  function route() {
    const h = location.hash.slice(1), m = h.match(/(?:^|&)o=([\w-]+)/);
    P.closeSheet();
    if (m) { go("orders"); PSTOps.openOrder(m[1], { pay: /(?:^|&)pay=1\b/.test(h) }); return; }
    if (h === "alerts") { go("more"); setTimeout(() => $("#alerts")?.scrollIntoView({ block: "start", behavior: "smooth" }), 120); return; }
    if (h === "stock") { go("products"); sub("stock"); return; }
    if (h === "reorder") { go("products"); sub("reorder"); return; }
    if (h === "products") { go("products"); sub("catalog"); return; }
    if (["insights", "protos", "times", "requests", "coa", "vendors", "discounts", "promos", "blast", "ads", "whatsnew", "vprices", "reports", "writer", "paymethods", "emails"].includes(h)) { go("more"); moreSub(h); return; }
    go(NAV.some(n => n[0] === h) ? h : "today");
  }
  function go(v) {
    view = v; $$("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== v);
    $$("[data-go]").forEach(b => b.setAttribute("aria-current", b.dataset.go === v ? "page" : "false"));
    $("[data-otitle]").textContent = TITLES[v]; history.replaceState(null, "", "#" + v);
    if (v === "products" && !pmLoaded) { pmLoaded = true; pmList(); }
    if (v === "customers") PSTOps.customersPane($("[data-custs]"));
    if (v === "more") moreHome();
    window.scrollTo(0, 0);
  }
  const themePref = () => { try { return localStorage.getItem("pst-owner-theme") || "dark"; } catch { return "dark"; } };
  function applyTheme(t) { try { localStorage.setItem("pst-owner-theme", t); } catch { /* private mode */ }
    const l = t === "light" || (t === "auto" && matchMedia("(prefers-color-scheme: light)").matches); document.documentElement.setAttribute("data-theme", l ? "light" : "dark");
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = l ? "#f6f3ec" : "#0a101c";
    $$("[data-th]").forEach(b => { const on = b.dataset.th === t; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); }); }
  try { matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (themePref() === "auto") applyTheme("auto"); }); } catch { /* old Safari */ }
  // v5.3: tell him when the app updated, with the headline of what's new
  function updNote() {
    const R = window.PSTOps4?.RELEASES?.[0]; if (!R) return; let prev = null; try { prev = localStorage.getItem("pst-owner-ver"); localStorage.setItem("pst-owner-ver", R.v); } catch { /* private mode */ }
    if (prev === R.v) { if (window.PST_JUST_UPDATED) P.toast("App updated"); return; }
    const n = window.PSTVibe ? PSTVibe.nameOf(me) : "", d = document.createElement("div"); d.id = "updnote"; d.setAttribute("role", "status");
    d.innerHTML = `<div class="updin">${P.icon("star", 20)}<div><b>Updated to v${esc(R.v)}${n ? `, ${esc(n)}` : ""}!</b><small>${esc(R.title)}${R.items?.[0] ? ` · ${esc(R.items[0].t)}` : ""}</small></div><button type="button" class="sx" data-updnx aria-label="Dismiss">${P.icon("x", 16)}</button></div>
<div class="updbtns"><a class="btn primary sm" href="owner.html#whatsnew" data-updgo>See what's new</a><button type="button" class="btn ghost sm" data-updnx>Got it</button></div>`;
    d.addEventListener("click", e => { if (e.target.closest("[data-updnx],[data-updgo]")) { d.classList.remove("in"); setTimeout(() => d.remove(), 250); } });
    document.body.appendChild(d); requestAnimationFrame(() => d.classList.add("in")); setTimeout(() => { if (d.isConnected) { d.classList.remove("in"); setTimeout(() => d.remove(), 250); } }, 12000);
  }
  function wnDot() { const u = PSTOps4.unseen(); $$("[data-wndot]").forEach(x => x.hidden = !u); const b = $('[data-badge="more"]'); if (b) { b.hidden = !u; b.textContent = "•"; b.classList.toggle("dot", u); } }
  function moreHome() { $("[data-morehome]").hidden = false; $("[data-moresub]").hidden = true; $("[data-otitle]").textContent = "More"; P.notifyPanel($("[data-nal]"), "owner"); }
  function moreSub(k) {
    if (k === "stock") { go("products"); sub("stock"); return; }
    $("[data-morehome]").hidden = true; $("[data-moresub]").hidden = false; $$("[data-sub]").forEach(x => x.hidden = x.dataset.sub !== k);
    $("[data-otitle]").textContent = TITLES[k]; history.replaceState(null, "", "#" + k);
    if (k === "insights") insights(30); if (k === "protos") protoPage(); if (k === "times") times();
    if (k === "requests") PSTOps.requestsPane($("[data-reqs]")); if (k === "coa") PSTOps.coaPane($("[data-coa]"));
    if (k === "vendors") PSTOps3.vendorsPane($("[data-vens]")); if (k === "discounts") PSTOps2.discountsPane($("[data-discs]")); if (k === "promos") PSTOps2.promotionsPane($("[data-promos]"));
    if (k === "blast") PSTOps4.blastPane($("[data-blast]")); if (k === "ads") PSTOps4.adsPane($("[data-ads]")); if (k === "vprices") PSTOps5.vendorPricesPane($("[data-vpr]")); if (k === "reports") PSTOps6.reportsPane($("[data-rep]")); if (k === "writer") PSTOps7.writerPane($("[data-wri]")); if (k === "paymethods") PSTOps6.payMethodsPane($("[data-pay]")); if (k === "emails") PSTOps8.emailsPane($("[data-ems2]")); if (k === "whatsnew") { PSTOps4.whatsNew($("[data-wn]")); wnDot(); }
    window.scrollTo(0, 0);
  }
  function sub(k) {
    $$("[data-psub]").forEach(b => b.classList.toggle("on", b.dataset.psub === k));
    $("[data-pm]").hidden = k !== "catalog"; $("[data-stock]").hidden = k !== "stock"; $("[data-reorder]").hidden = k !== "reorder";
    history.replaceState(null, "", "#" + (k === "catalog" ? "products" : k));
    if (k === "stock") stockList(); if (k === "reorder") PSTOps3.reorderPane($("[data-reorder]"));
  }
  // v44: the shelf, organized: In stock / Running low / Out of stock / Hidden, with what's on the way. Tap a row to count it.
  let sfilter = "in", sinc = {}, scat = {};
  const sState = p => { const n = Number(p.current_inventory || 0); return p.is_active === false ? "hidden" : n <= 0 ? "out" : n <= Number(p.low_stock_threshold ?? 5) ? "low" : "in"; };
  async function stockList() {
    PSTOps.stockPane($("[data-po]"));
    const [inv, inc, cat] = await Promise.all([P.client().from("product_inventory").select("*").order("display_name"),
      P.client().from("incoming_inventory").select("product_key,product_id,ordered_quantity,expected_arrival_date,status").not("status", "in", "(received,cancelled)"),
      P.client().from("product_catalog").select("*")]);
    if (inv.error) { $("[data-slist]").innerHTML = `<p class="notice err">${esc(inv.error.message)}</p>`; return; }
    stockRows = (inv.data || []).sort((a, b) => P.cmpProduct(a, b));
    scat = Object.fromEntries((cat.data || []).map(c => [c.product_key, c]));
    const idKey = Object.fromEntries(stockRows.map(r => [String(r.id), r.product_key])); sinc = {};
    (inc.data || []).forEach(l => { const k = l.product_key || idKey[String(l.product_id || "")]; if (!k) return; const x = sinc[k] ||= { n: 0, at: null }; x.n += Number(l.ordered_quantity || 0); if (l.expected_arrival_date && (!x.at || l.expected_arrival_date < x.at)) x.at = l.expected_arrival_date; });
    drawShelf();
  }
  function drawShelf() {
    const cnt = { in: 0, low: 0, out: 0, hidden: 0 }; let vials = 0;
    stockRows.forEach(p => { const st = sState(p); cnt[st]++; if (st !== "hidden") vials += Math.max(0, Number(p.current_inventory || 0)); });
    $("[data-ssum]").textContent = `${vials} vials on hand · ${cnt.in + cnt.low} products in stock · ${cnt.out} out`;
    const F = [["in", "In stock", cnt.in + cnt.low], ["low", "Running low", cnt.low], ["out", "Out of stock", cnt.out], ["hidden", "Hidden", cnt.hidden], ["all", "All", stockRows.length]];
    $("[data-schips]").innerHTML = F.map(([k, l, n]) => `<button type="button" class="chip${sfilter === k ? " on" : ""}" data-sf="${k}" role="tab" aria-selected="${sfilter === k}">${l} <b>${n}</b></button>`).join("");
    const show = p => { const st = sState(p); return sfilter === "all" || (sfilter === "in" ? st === "in" || st === "low" : st === sfilter); };
    const list = stockRows.filter(show);
    $("[data-slist]").innerHTML = list.length ? `<div class="shelf">${list.map(p => { const n = Number(p.current_inventory || 0), st = sState(p), inc = sinc[p.product_key], c = scat[p.product_key];
      const sub = [st === "low" ? `Running low` : st === "out" ? (c?.coming_soon ? "Coming soon" : "Out of stock") : st === "hidden" ? "Hidden from the shop" : "", inc ? `${inc.n} on the way${inc.at ? ` · ${P.fmtDate(inc.at)}` : ""}` : ""].filter(Boolean).join(" · ");
      return `<button type="button" class="shrow ${st}" data-count="${esc(p.product_key)}" data-sname="${esc(`${p.display_name} ${p.strength || ""} ${p.product_key}`.toLowerCase())}">${c ? P.vial(c, 26) : `<span class="pov"></span>`}<span><b>${esc(p.display_name)} <span class="muted">${esc(p.strength || "")}</span></b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><em>${n}</em></button>`; }).join("")}</div>`
      : `<p class="muted small" style="padding:14px 0">${sfilter === "low" ? "Nothing running low." : sfilter === "out" ? "Nothing out of stock." : sfilter === "hidden" ? "No hidden products." : "Nothing here."}</p>`;
    const q = $("[data-ssearch]")?.value; if (q) filterRows("[data-sname]", q);
  }
  const filterRows = (sel, q) => { q = q.trim().toLowerCase(); $$(sel).forEach(r => r.hidden = !!q && !r.getAttribute(sel.slice(1, -1)).includes(q)); };
  async function load() {
    let r = await P.client().from("orders").select("*").order("created_at", { ascending: false }).limit(120);
    if (r.error) { $("[data-list]").innerHTML = `<p class="notice err">Couldn't load orders: ${esc(r.error.message)}</p>`; return; }
    orders = r.data || [];
    const ids = orders.map(o => o.id);
    items = {};
    if (ids.length) { const ir = await P.client().from("order_items").select("*").in("order_id", ids); (ir.data || []).forEach(i => (items[i.order_id] ||= []).push(i)); }
    await loadProtos();
    vibe(); draw(); due();
    if (navigator.setAppBadge) { const n = orders.filter(TABS.pay.f).length; try { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch {} }
  }
  // v5.2: a little personality (owner app only)
  let vibeAt = 0, clearLine = "";
  function vibe() {
    if (!window.PSTVibe) return;
    if (Date.now() - vibeAt > 30 * 60000) { vibeAt = Date.now(); const g = $("[data-vibe]"); if (g) g.textContent = PSTVibe.greeting(me); }
    const c = PSTVibe.newOrders(me, orders, { dead, name: o => PSTOps.custName(o) });
    if (c) { const box = $("[data-cheer]"); if (box) box.innerHTML = `<div class="cheer" role="status">${P.icon("bag", 20)}<span>${esc(c.text)}</span><button type="button" class="sx" data-cheerx aria-label="Dismiss">${P.icon("x", 16)}</button></div>`; P.toast(c.text); if (navigator.vibrate) try { navigator.vibrate(30); } catch {} }
  }
  function draw() { drawToday(); drawOrders(); }
  const sum = list => money(list.reduce((s, o) => s + Number(o.total || 0), 0));
  function drawToday() {
    const today = new Date().toDateString(), tod = orders.filter(o => new Date(o.created_at).toDateString() === today && !dead(o));
    const pay = orders.filter(TABS.pay.f), pack = orders.filter(TABS.pack.f), ready = orders.filter(TABS.ready.f);
    const tile = (k, l, n, s) => `<button type="button" class="tile" data-otab="${k}"><small>${l}</small><b>${n}</b><span class="muted small">${s}</span></button>`;
    $("[data-stats]").innerHTML = tile("all", "Today", tod.length, sum(tod)) + tile("pay", "Waiting on payment", pay.length, sum(pay)) + tile("pack", "To pack", pack.length, pack.length ? "paid, ready to go" : "all caught up") + tile("ready", "Ready / out", ready.length, "packed or shipped");
    const attn = [...pack, ...pay];
    $("[data-attn]").innerHTML = attn.length ? attn.slice(0, 8).map(card).join("") + (attn.length > 8 ? `<button class="btn ghost wide" type="button" data-otab="pay">See all ${attn.length}</button>` : "") : `<div class="empty allclear">${P.icon("check", 28)}<p>${esc(clearLine ||= (window.PSTVibe ? PSTVibe.allClear(me) : "Nothing waiting on you. Nice."))}</p></div>`;
    if (attn.length) clearLine = "";
    PSTOps.venmoMatches($("[data-vmbox]"));
    const n = attn.length, bd = $('[data-badge="orders"]'); if (bd) { bd.hidden = !n; bd.textContent = n > 99 ? "99+" : n; }
  }
  function drawOrders() {
    const q = oq.trim().toLowerCase();
    $("[data-tabs]").hidden = !!q;
    $("[data-tabs]").innerHTML = Object.entries(TABS).map(([k, v]) => { const n = k !== "all" ? orders.filter(v.f).length : 0; return `<button class="${k === tab ? "on" : ""}" type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${v.s || v.t}${n ? ` <i>${n}</i>` : ""}</button>`; }).join("");
    const list = (q ? orders.filter(o => `${o.customer_name || ""} ${o.shipping_name || ""} ${o.order_number || ""} ${o.customer_email || ""}`.toLowerCase().includes(q)) : orders.filter(TABS[tab].f)).slice(0, 80);
    $("[data-list]").innerHTML = list.length ? list.map(card).join("") : `<div class="empty">${P.icon(q ? "search" : "check", 28)}<p>${q ? "No orders match that." : "Nothing here. Nice."}</p></div>`;
  }
  function card(o) {
    const st = PSTOps.stage(o), n = (items[o.id] || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
    return `<article class="ocard" data-card="${o.id}"><button class="oh orow2" type="button" data-ord="${o.id}"><span class="or1"><b>${esc(PSTOps.custName(o))}</b><b class="ot">${money(o.total)}</b></span><span class="or2"><span class="opill sm ${st.cls}">${esc(st.t)}</span><span>${esc(o.order_number || "")} · ${ago(o.created_at)} · ${pickup(o) ? "Pickup" : "Ship"}${n ? ` · ${n} item${n === 1 ? "" : "s"}` : ""}${o.payment_method ? ` · ${esc(o.payment_method)}` : ""}</span></span></button></article>`;
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
    const el = $("[data-times]"); [cyc, prods] = await Promise.all([P.cycles(), P.products().catch(() => []), loadProtos().catch(() => {})]);
    const gs = P.groups(prods);
    el.innerHTML = `<p class="muted small">Write-ups show on each product page under Overview (plain facts work best; no health claims). Reminder days = how long one vial lasts. Products with a protocol (green dot) are set from it automatically; for the rest, type the days here.</p>
<div class="times">${gs.map(g => `<details class="pgrp"><summary><b>${protoDot(g[0])}${esc(g[0].display_name)}</b><span class="muted small">${g.map(p => esc(p.strength || "")).join(" · ")}${g.some(p => p.research_summary) ? " · ✓ write-up" : ""}</span></summary>
<label class="tin" style="display:block;margin:8px 0"><span class="small muted">Product write-up</span><textarea data-summary="${esc(g[0].display_name)}" rows="4" maxlength="2000" placeholder="e.g. What it is, form, what's in a blend, storage. Research use only.">${esc(g.find(p => p.research_summary)?.research_summary || "")}</textarea></label>
${g.map(p => { const c = cyc[p.product_key]; return `<div class="trow"><div><b>${esc(p.strength || "")}</b><span class="muted small" style="display:block">${c ? `Learned: ~${Math.round(c.typical_days)} days (${c.samples} reorders)` : "Learned: not enough reorders yet"}</span></div><label class="tin"><input type="number" min="1" max="365" inputmode="numeric" placeholder="28" value="${Number(p.reorder_days_default) || ""}" data-default="${esc(p.product_key)}"${protoOn(p) ? ' title="Set by your protocol" readonly' : ""} aria-label="Typical days for ${esc(p.display_name)} ${esc(p.strength || "")}"><span>days</span></label></div>`; }).join("")}</details>`).join("")}</div>`;
  }

  /* ---- Products: add, edit and put live from the phone (same tables and fields as admin → Products) ---- */
  let pmRows = [], pmInv = {}, pmAsk = {};
  const PM_CATS = ["Peptide", "Multi-Peptide Product", "Supply", "Vitamin", "Other"];
  async function pmLoad() {
    const [c, i, r] = await Promise.all([P.client().from("product_catalog").select("*").order("display_name"), P.client().from("product_inventory").select("product_key,current_inventory,cost_per_unit,is_active"),
      P.client().from("product_availability_requests").select("product_key,customer_email,requested_quantity").eq("status", "pending").limit(2000)]);
    await loadProtos().catch(() => {});
    if (c.error) throw c.error; pmRows = c.data || []; pmInv = Object.fromEntries((i.data || []).map(x => [x.product_key, x]));
    pmAsk = {}; (r.data || []).forEach(x => { const a = pmAsk[x.product_key] ||= { people: new Set(), vials: 0 }; a.people.add(String(x.customer_email || "").toLowerCase()); a.vials += Number(x.requested_quantity || 0); });
  }
  async function pmList() {
    const el = $("[data-pm]");
    try { await pmLoad(); } catch (err) { el.innerHTML = `<p class="notice err">${esc(err.message)}</p>`; return; }
    el.innerHTML = `<div class="pmtop"><input class="psearch" type="search" data-pmsearch placeholder="Search products" aria-label="Search products"><button class="btn primary sm" type="button" data-pmnew>+ New product</button></div><p class="muted small pmbake"><button class="btn ghost sm" type="button" data-pmbake>Update bottle pictures</button> <span data-pmbakest>Makes finished bottle pictures so the shop loads faster. Run it after big changes.</span></p>
<p class="muted small pmleg"><i class="pdot"></i> Protocol entered: anyone who buys it gets their running-low reminder on that timing. <a class="linkish" href="owner.html#protos">Protocols</a></p>
<div class="pmlist">${pmRows.map(p => { const on = p.is_active !== false, n = Number(pmInv[p.product_key]?.current_inventory ?? p.current_inventory ?? 0);
  return `<div class="pmrow" data-pmname="${esc(`${p.display_name} ${p.strength || ""} ${p.product_key}`.toLowerCase())}"><button type="button" class="pmmain" data-pmedit="${esc(p.product_key)}">${P.vial(p, 34)}<span><b>${protoDot(p)}${esc(p.display_name)} ${esc(p.strength || "")}</b><small>${money(P.unitPrice(p))} · ${n} on hand${p.coming_soon && n <= 0 ? " · Coming soon" : ""} · ${esc(P.vialColorName(p))}</small>${pmAsk[p.product_key] ? `<em class="pmask">${pmAsk[p.product_key].people.size} ${pmAsk[p.product_key].people.size === 1 ? "person" : "people"} asked · ${pmAsk[p.product_key].vials} vial${pmAsk[p.product_key].vials === 1 ? "" : "s"}</em>` : ""}</span></button>
<button type="button" class="pmlive" role="switch" aria-checked="${on}" data-pmlive="${esc(p.product_key)}" aria-label="Live on site"><i></i><span>${on ? "Live" : "Hidden"}</span></button></div>`; }).join("")}</div>`;
  }
  async function pmBakeAll(btn) {
    const st = $("[data-pmbakest]"); btn.disabled = true; let done = 0, skipped = 0, failed = 0;
    for (const p of pmRows) {
      if (p.bottle_url && p.bottle_sig === P.vialSig(p)) { skipped++; continue; }
      try { await P.bakeBottle(p); done++; } catch (e) { failed++; if (failed === 1) st.textContent = "Couldn't save: " + (e.message || e); }
      st.textContent = `Updating… ${done + skipped + failed} of ${pmRows.length}`;
    }
    st.textContent = failed ? `${done} updated, ${failed} couldn't be saved.` : `All set: ${done} updated, ${skipped} already current.`; btn.disabled = false;
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
<label>Name on the label <span class="muted small">(optional: only if it should read differently)</span><input name="label_line_1" maxlength="24" value="${esc(v.label_line_1 || "")}" placeholder="${esc(String(v.display_name || "Same as name").replace(/\s*\(.*\)\s*/, "").toUpperCase())}" autocapitalize="characters"></label>
<div class="pm2"><label>Strength<input name="strength" maxlength="30" value="${esc(v.strength || "")}" placeholder="10mg"></label><label>Price<input name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${Number(v.price || 0).toFixed(2)}"></label></div>
<div class="pm2"><label>Category<select name="category">${[...new Set([...PM_CATS, v.category].filter(Boolean))].map(c => `<option${c === v.category ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
<label>Label color<select name="label_color"><option value="" data-pmauto>Auto (${esc(P.vialColorName({ ...v, label_color: "" }))})</option>${colors.map(c => `<option${String(v.label_color || "").toLowerCase() === c.toLowerCase() ? " selected" : ""}>${c}</option>`).join("")}</select></label></div>
<div class="pm2"><label class="toggle"><input type="checkbox" name="sale_enabled"${v.sale_enabled ? " checked" : ""}> On sale</label><label>Sale price<input name="sale_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.sale_price ?? ""}"></label></div>
<label class="toggle"><input type="checkbox" name="is_active"${v.is_active !== false ? " checked" : ""}> Live on the site</label>
<label class="toggle"><input type="checkbox" name="coming_soon"${(isNew || v.coming_soon) ? " checked" : ""}> Coming soon <span class="muted small">(not stocked yet: shoppers see "Coming soon" and can request it. Turns off by itself when stock arrives.)</span></label>
${!isNew && pmAsk[v.product_key] ? `<p class="pmask" style="margin:-4px 0 6px">${pmAsk[v.product_key].people.size} ${pmAsk[v.product_key].people.size === 1 ? "person has" : "people have"} asked for ${pmAsk[v.product_key].vials} vial${pmAsk[v.product_key].vials === 1 ? "" : "s"} · <a class="linkish" href="availability-requests.html">see requests</a></p>` : ""}
${isNew ? "" : protoOn(v) ? `<p class="small pmproto"><i class="pdot"></i> Protocol entered · one vial lasts about <b>${lastsDays(protoFor(v), v.strength) || Number(v.reorder_days_default) || "?"} days</b>, so buyers get their running-low reminder then. <a class="linkish" href="owner.html#protos">Edit protocol</a></p>` : `<p class="small muted pmproto">No protocol yet, so reminders use ${Number(v.reorder_days_default) ? `${Number(v.reorder_days_default)} days` : "the store estimate"}. <a class="linkish" href="owner.html#protos">Add a protocol</a></p>`}
<label>Feature on the home page<select name="home_feature_rank"><option value="">No</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${Number(v.home_feature_rank) === n ? " selected" : ""}>Spot ${n}</option>`).join("")}</select></label>
<div class="pm2"><label>Cost per vial<input name="cost" type="number" step="0.01" min="0" inputmode="decimal" value="${!isNew && Number(pmInv[v.product_key]?.cost_per_unit) > 0 ? Number(pmInv[v.product_key].cost_per_unit).toFixed(2) : ""}" placeholder="${isNew ? "optional" : "not set"}"></label><div class="pmmargin" data-pmmargin></div></div>
<button type="button" class="linkish small" data-pmsug hidden></button>
<details class="omore"${v.admin_only || v.coa_url ? " open" : ""}><summary>More details</summary>
<div class="pm2"><label>Sort name<input name="sort_name" maxlength="80" value="${esc(v.sort_name || "")}" placeholder="${esc(v.display_name || "Same as name")}"></label><label>Sale tag<input name="sale_label" maxlength="30" value="${esc(v.sale_label || "")}" placeholder="Sale"></label></div>
<p class="kick" style="margin:8px 0 4px">Shop by category</p><div class="chips">${["performance", "recovery", "longevity"].map(k => `<label class="chip"><input type="checkbox" name="rf" value="${k}"${((Array.isArray(v.research_focus) ? v.research_focus : String(v.research_focus || "").split(",")).map(x => String(x).trim().toLowerCase())).includes(k) ? " checked" : ""}><span>${k[0].toUpperCase() + k.slice(1)}</span></label>`).join("")}</div>
<label>Lab report link (COA)<input name="coa_url" value="${esc(v.coa_url || "")}" placeholder="/assets/coas/… or https://…"></label><label>Lab report button text<input name="coa_label" maxlength="40" value="${esc(v.coa_label || "View COA")}"></label>
<label>Private notes (only you see these)<textarea name="admin_only" rows="3">${esc(v.admin_only || "")}</textarea></label>
${isNew ? "" : `<p class="muted small">Item # ${esc(v.product_key)} · ${Number(pmInv[v.product_key]?.current_inventory ?? v.current_inventory ?? 0)} on hand · <a class="linkish" href="product.html?key=${encodeURIComponent(v.product_key)}" target="_blank" rel="noopener">see it in the shop</a></p>`}</details>
${isNew ? `<p class="muted small">New products start with 0 in stock. Add stock with a purchase order under Products → Stock.</p>` : ""}
<button class="btn primary wide" type="submit">${isNew ? "Create product" : "Save changes"}</button><p class="status" data-pmstat role="status"></p></form>`, { label: isNew ? "New product" : "Edit product" });
    const f = w.querySelector("form"), prev = w.querySelector("[data-pmprev]");
    const cur = () => ({ ...v, product_key: v.product_key, display_name: f.display_name.value.trim() || "NEW PRODUCT", label_line_1: f.label_line_1.value.trim() || null, strength: f.strength.value.trim(), label_color: f.label_color.value, category: f.category.value });
    const drawPrev = () => { const c = cur(); c.product_key = "__prev_" + (v.product_key || "new"); prev.innerHTML = P.vial(c, 130);
      const a = f.querySelector("[data-pmauto]"); if (a) a.textContent = `Auto (${P.vialColorName({ ...c, label_color: "" })})`;
      f.label_line_1.placeholder = String(f.display_name.value.trim() || "Same as name").replace(/\s*\(.*\)\s*/, "").toUpperCase(); };
    const margin = () => { const c = Number(f.cost.value || 0), pr = f.sale_enabled.checked && Number(f.sale_price.value) > 0 ? Number(f.sale_price.value) : Number(f.price.value || 0), box = f.querySelector("[data-pmmargin]"), sg = f.querySelector("[data-pmsug]");
      box.innerHTML = c > 0 && pr > 0 ? `<small class="muted">Profit</small><b>${(((pr - c) / pr) * 100).toFixed(1)}%</b>` : `<small class="muted">Profit</small><b>—</b>`;
      const sug = c > 0 ? (c / 0.2 + 5).toFixed(2) : ""; sg.hidden = !sug; sg.textContent = `Use 80% margin + $5: $${sug}`; sg.dataset.v = sug; }; // = his Apply 80% Margin + $5
    f.addEventListener("click", e => { const sg = e.target.closest("[data-pmsug]"); if (sg) { f.price.value = sg.dataset.v; margin(); } });
    drawPrev(); margin(); f.addEventListener("input", () => { margin(); clearTimeout(f._t); f._t = setTimeout(drawPrev, 250); });
    f.addEventListener("submit", async e => {
      e.preventDefault(); const st = f.querySelector("[data-pmstat]"), btn = f.querySelector("[type=submit]"); btn.disabled = true; st.textContent = "Saving…"; st.className = "status";
      const now = new Date().toISOString(), name = f.display_name.value.trim(), strength = f.strength.value.trim() || null, category = f.category.value, price = Math.max(0, Number(f.price.value) || 0), live = f.is_active.checked;
      const fields = { display_name: name, label_line_1: f.label_line_1.value.trim().toUpperCase() || null, strength, category, price, label_color: f.label_color.value || null, is_active: live, blend_stack: category === "Multi-Peptide Product",
        coming_soon: f.coming_soon.checked, sale_enabled: f.sale_enabled.checked, sale_price: f.sale_enabled.checked && Number(f.sale_price.value) > 0 ? Number(f.sale_price.value) : null, home_feature_rank: f.home_feature_rank.value ? Number(f.home_feature_rank.value) : null, updated_at: now,
        sort_name: f.sort_name.value.trim() || name, sale_label: f.sale_label.value.trim() || null, research_focus: $$("input[name=rf]:checked", f).map(x => x.value), coa_url: f.coa_url.value.trim() || null, coa_label: f.coa_label.value.trim() || "View COA", admin_only: f.admin_only.value.trim() || null };
      if (f.sale_enabled.checked && !(Number(f.sale_price.value) > 0)) { st.textContent = "Add the sale price, or turn the sale off."; st.className = "status bad"; btn.disabled = false; return; }
      if (f.sale_enabled.checked && Number(f.sale_price.value) >= price) { st.textContent = "The sale price should be lower than the regular price."; st.className = "status bad"; btn.disabled = false; return; }
      if (live && !f.coming_soon.checked && !(price > 0)) { st.textContent = "Set a price before putting it live."; st.className = "status bad"; btn.disabled = false; return; }
      try {
        if (isNew) {
          const k = pmNextKey();
          const ins = () => P.client().from("product_catalog").insert({ product_key: k, current_inventory: 0, featured: false, hot_peptide: false, sale_label: null, created_at: now, ...fields }).select("product_key,label_color").single();
          let r1 = await ins(); if (r1.error && /coming_soon/.test(r1.error.message)) { delete fields.coming_soon; r1 = await ins(); } // before the v9 server update
          if (r1.error) throw r1.error;
          const cost = Number(f.cost?.value || 0);
          const r2 = await P.client().from("product_inventory").upsert({ product_key: k, display_name: name, category, strength, price, current_inventory: 0, low_stock_threshold: 5, limited_stock_threshold: 10, is_active: live, featured: false, blend_stack: fields.blend_stack, coa_url: fields.coa_url, coa_label: fields.coa_label, cost_per_unit: cost > 0 ? cost : null, updated_at: now }, { onConflict: "product_key" });
          if (r2.error) throw new Error(`${k} was created, but the inventory record didn't save: ${r2.error.message}`);
          P.toast(`${name} ${strength || ""} created · label ${r1.data?.label_color || "auto"}`);
        } else {
          let r1 = await P.client().from("product_catalog").update(fields).eq("product_key", v.product_key);
          if (r1.error && /coming_soon/.test(r1.error.message)) { delete fields.coming_soon; r1 = await P.client().from("product_catalog").update(fields).eq("product_key", v.product_key); }
          if (r1.error) throw r1.error;
          const c0 = Number(pmInv[v.product_key]?.cost_per_unit || 0), c1 = Number(f.cost.value || 0), invUp = { display_name: name, category, strength, price, is_active: live, blend_stack: fields.blend_stack, coa_url: fields.coa_url, coa_label: fields.coa_label, updated_at: now };
          if (f.cost.value !== "" && c1 > 0 && Math.abs(c1 - c0) > 0.004) invUp.cost_per_unit = c1; // only when he changes it (his page could overwrite or wipe it)
          const r2 = await P.client().from("product_inventory").update(invUp).eq("product_key", v.product_key);
          if (r2.error) throw new Error(`Saved to the shop, but the inventory record didn't update: ${r2.error.message}`);
          P.toast("Saved");
        }
        // save a finished bottle picture for the shop (needs the v7 server update; the site draws it live until then)
        try { const { data: fresh } = await P.client().from("product_catalog").select("*").eq("display_name", name).eq("strength", strength).order("updated_at", { ascending: false }).limit(1).maybeSingle(); if (fresh) await P.bakeBottle(fresh); } catch {}
        P.closeSheet?.(); pmList();
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
    el.innerHTML = `<div class="ilive" data-ilive><span class="ldot"></span><div><b data-livenum>…</b><small>on the site right now</small></div><span class="muted small" data-livewhere></span></div><div class="oseg">${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "Year"]].map(([n, l]) => `<button type="button" class="${n === days ? "on" : ""}" data-range="${n}">${l}</button>`).join("")}</div>
<div class="tiles itiles"><div class="tile"><small>Paid sales</small><b>${money(r.revenue_paid)}</b><span class="muted small">${r.paid_orders} paid · ${money(r.revenue_pending)} waiting</span></div>
<div class="tile"><small>Orders</small><b>${r.orders}</b><span class="muted small">avg ${money(r.avg_order)} · ${r.cancelled} cancelled</span></div>
<div class="tile"><small>Customers</small><b>${r.customers}</b><span class="muted small">${r.new_customers} new · ${r.repeat_customers} returning</span></div>
<div class="tile"><small>Visitors</small><b>${w.visitors}</b><span class="muted small">${w.page_views} page views · ${w.app_sessions} app visits</span></div>
<div class="tile"><small>Conversion</small><b>${pct(f.placed_order, f.sessions)}</b><span class="muted small">of visits placed an order</span></div></div>
<div class="igrid">
<section><h3 class="kick">Sales by day</h3>${bars(r.by_day, "paid", x => money(x.paid))}</section>
<section><h3 class="kick">Visitors by day</h3>${bars(w.by_day, "visitors", x => x.visitors + " visitors")}</section>
<section><h3 class="kick">Shopping funnel</h3><div class="funnel">${fz.map(([l, n]) => `<div><span>${l}</span><i style="width:${f.sessions ? Math.max(2, Math.round(n / f.sessions * 100)) : 0}%"></i><b>${n}</b></div>`).join("")}</div></section>
<section><h3 class="kick">Top products · sales</h3>${list(r.top_products, x => esc(names[x.product_key] || `${x.name} ${x.strength || ""}`), x => `${money(x.revenue)} · ${x.units}`)}</section>
<section><h3 class="kick">Most viewed</h3>${list(w.top_viewed, x => esc(names[x.product_key] || x.product_key), x => x.n)}</section>
<section><h3 class="kick">Where visitors come from</h3>${list(w.sources, x => esc(x.src), x => x.n)}</section>
<section><h3 class="kick">What people search for</h3>${list(w.searches, x => esc(x.term), x => x.n)}</section>
<section><h3 class="kick">Orders</h3>${list([...Object.entries(r.payment_mix).map(([k, v]) => ({ k, v })), { k: "Local pickup", v: r.pickup }, { k: "Shipped", v: r.shipped }], x => esc(x.k), x => x.v)}
<p class="muted small">Discounts ${money(r.discounts)} · store credit ${money(r.store_credit)} · ${r.backorder_units} vials backordered · ${r.auto_cancelled} auto-cancelled unpaid</p></section>
<section><h3 class="kick">Devices</h3>${list(Object.entries(w.devices).map(([k, v]) => ({ k, v })), x => esc(x.k), x => x.v)}</section>
<section><h3 class="kick">Running low</h3>${list(st.low, x => esc(`${x.display_name} ${x.strength || ""}`), x => `${x.current_inventory} left`)}<p class="muted small">${st.out} products out of stock</p></section>
</div><p class="muted small" style="margin-top:12px">Site numbers are counted without cookies or third parties. Admin pages and your own owner app aren't counted.</p>`;
    liveNow(names);
  }

  /* ---- who's on the site right now: anyone whose browser sent a page or product view in the last 5 minutes ---- */
  let liveTimer = null;
  async function liveNow(names) {
    clearTimeout(liveTimer);
    const box = $("[data-ilive]"); if (!box || box.closest("[hidden]")) return;
    const since = new Date(Date.now() - 5 * 60000).toISOString();
    const { data, error } = await P.client().from("pst_web_events").select("session,path,product_key,device,app,at").gte("at", since).order("at", { ascending: false }).limit(1000);
    if (!error) {
      const last = new Map(); (data || []).forEach(e => { if (!last.has(e.session)) last.set(e.session, e); });
      const now = [...last.values()], n = now.length;
      box.querySelector("[data-livenum]").textContent = n;
      box.classList.toggle("on", n > 0);
      const where = {}; now.forEach(e => { const k = e.product_key ? (names[e.product_key] || e.product_key) : String(e.path || "").replace(/^\//, "").replace(/\.html.*$/, "") || "home"; where[k] = (where[k] || 0) + 1; });
      const apps = now.filter(e => e.app).length;
      box.querySelector("[data-livewhere]").textContent = n ? Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `${c} on ${k === "index" ? "home" : k}`).join(" · ") + (apps ? ` · ${apps} in the app` : "") : "Nobody right now";
    }
    liveTimer = setTimeout(() => liveNow(names), 30000);
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
  // v5.1: green dot = a full protocol is saved for this product, so its reminders run on that timing
  const protoFor = p => protos[p.display_name] || null, protoOn = p => { const x = protoFor(p); return !!(x && x.amount > 0 && x.uses_per_week > 0); };
  const protoDot = p => protoOn(p) ? `<i class="pdot" title="Protocol entered" aria-label="Protocol entered"></i>` : "";
  async function protoSync(name, row) { // writes "days one vial lasts" to each strength, which is what checkout uses for the reminder
    const { data: list0 } = await P.client().from("product_catalog").select("product_key,display_name,strength,reorder_days_default").eq("display_name", name); const list = list0 || []; let n = 0;
    for (const x of list) { const d = lastsDays(row, x.strength); if (!d || Number(x.reorder_days_default) === d) continue;
      const { error } = await P.client().from("product_catalog").update({ reorder_days_default: d }).eq("product_key", x.product_key); if (!error) { n++; [...pmRows, ...(prods || [])].filter(y => y.product_key === x.product_key).forEach(y => { y.reorder_days_default = d; }); } }
    return n;
  }
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
    const stale = gs.filter(g => protoOn(g[0]) && g.some(x => { const d = lastsDays(protos[g[0].display_name], x.strength); return d && Number(x.reorder_days_default) !== d; }));
    el.innerHTML = `<p class="muted small">Your protocol sets when the running-low reminder goes out to anyone who buys that product (how long one vial lasts × how many they bought). Only you can see what's written here; customers only ever see the reminder timing.</p>
<p class="muted small pmleg"><i class="pdot"></i> Protocol entered and driving reminders</p>
${stale.length ? `<div class="notice">${stale.length} protocol${stale.length === 1 ? " isn't" : "s aren't"} setting reminder timing yet. <button class="btn primary sm" type="button" data-psync>Apply now</button></div>` : ""}
<input class="psearch" type="search" data-psearch placeholder="Search a product" aria-label="Search a product">
<div class="times">${gs.map(g => { const name = g[0].display_name, p = protos[name] || {};
  return `<details class="pgrp" data-proto="${esc(name)}" data-name="${esc(name.toLowerCase())}"><summary><b>${protoDot(g[0])}${esc(name)}</b><span class="muted small">${g.map(x => `${esc(x.strength || "")} <span class="${P.qty(x) > 0 ? "" : "bad"}">(${P.qty(x)} on hand)</span>`).join(" · ")}${protoOn(g[0]) ? " · reminders use this" : p.amount ? " · needs times per week" : ""}</span></summary>
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
    protos[name] = row; const synced = await protoSync(name, row); const g = P.groups(prods).find(x => x[0].display_name === name) || [];
    box.querySelector("[data-plast]").innerHTML = g.map(x => { const d = lastsDays(row, x.strength); return `${esc(x.strength || "")}: ${d ? `one vial lasts about <b>${d} days</b>` : row.amount ? "set days by hand (blend or different unit)" : "fill in the protocol to calculate"}`; }).join("<br>");
    P.toast(synced ? `Protocol saved · reminders now follow it` : "Protocol saved"); draw();
  }

  async function alertsCard() {
    const el = $("[data-alerts]"), st = await P.pushState().catch(() => "unsupported");
    if (st === "on") { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="alertcta" style="margin-top:0">${P.icon("bell", 24)}<b>${st === "needs-install" ? "Add this to your Home Screen" : "Get a ping for every new order"}</b><span>${st === "needs-install" ? "Share → Add to Home Screen, open it from there, then turn on alerts." : st === "blocked" ? "Notifications are blocked. Turn them on in Settings → Notifications." : "New orders, with the customer, items and total."}</span>${st === "blocked" || st === "unsupported" ? "" : `<button class="btn primary" type="button" data-o="push">${st === "needs-install" ? "Show me how" : "Turn on new-order alerts"}</button>`}</div>`;
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-pmsearch]")) pmFilter(t.value);
    else if (t.matches("[data-psearch]")) protoFilter(t.value);
    else if (t.matches("[data-csearch]")) PSTOps.filterCustomers(t.value);
    else if (t.matches("[data-osearch]")) { oq = t.value; drawOrders(); }
    else if (t.matches("[data-ssearch]")) { if (t.value.trim() && sfilter !== "all") { sfilter = "all"; drawShelf(); } filterRows("[data-sname]", t.value); }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.matches("[data-pf]")) { saveProto(t.closest("[data-proto]")); return; }
    if (t.matches("[data-days]")) { const v = Math.round(Number(t.value)) || null; setDays(t.dataset.days, v, "owner"); return; }
    if (t.matches("[data-summary]")) { const v = t.value.trim() || null; const { error } = await P.client().from("product_catalog").update({ research_summary: v }).eq("display_name", t.dataset.summary); P.toast(error ? "Couldn't save: " + error.message : v ? "Write-up saved" : "Write-up cleared"); return; }
    if (!t.matches("[data-default]")) return; const v = Math.max(0, Math.min(365, Number(t.value) || 0)) || null;
    const { error } = await P.client().from("product_catalog").update({ reorder_days_default: v }).eq("product_key", t.dataset.default);
    P.toast(error ? "Couldn't save: " + error.message : v ? `Saved: ${v} days` : "Cleared");
  }
  async function onClick(e) {
    const t = e.target;
    const g = t.closest("[data-go]"); if (g) { go(g.dataset.go); return; }
    const ot = t.closest("[data-otab]"); if (ot) { tab = ot.dataset.otab; oq = ""; const s = $("[data-osearch]"); if (s) s.value = ""; go("orders"); drawOrders(); return; }
    const tb = t.closest("[data-tab]"); if (tb) { tab = tb.dataset.tab; drawOrders(); return; }
    const sfb = t.closest("[data-sf]"); if (sfb) { sfilter = sfb.dataset.sf; drawShelf(); return; }
    const psb = t.closest("[data-psub]"); if (psb) { sub(psb.dataset.psub); return; }
    const mo = t.closest("[data-more]"); if (mo) { moreSub(mo.dataset.more); return; }
    if (t.closest("[data-moreback]")) { moreHome(); history.replaceState(null, "", "#more"); window.scrollTo(0, 0); return; }
    const qk = t.closest("[data-q]"); if (qk) { if (qk.dataset.q === "lookup") { PSTOps.lookup(); return; } if (qk.dataset.q === "neworder") PSTOps.pickCustomer(k => PSTOps.newOrderFlow(k)); else PSTOps.addCustomerFlow(k => PSTOps.openCustomer(k)); return; }
    const od = t.closest("[data-ord]"); if (od) { PSTOps.openOrder(od.dataset.ord); return; }
    const vm = t.closest("[data-vm]"); if (vm) { PSTOps.openOrder(vm.dataset.vm, { pay: true }); return; }
    const vx = t.closest("[data-vmx]"); if (vx) { const { error } = await P.client().from("pst_payment_matches").update({ confirmed_at: new Date().toISOString() }).eq("id", vx.dataset.vmx); P.toast(error ? "Couldn't dismiss: " + error.message : "Dismissed"); PSTOps.venmoMatches($("[data-vmbox]")); return; }
    const cu = t.closest("[data-cust]"); if (cu) { PSTOps.openCustomer(cu.dataset.cust); return; }
    if (t.closest("[data-cnew]")) { PSTOps.addCustomerFlow(k => PSTOps.openCustomer(k)); return; }
    const no = t.closest("[data-neworder]"); if (no) { PSTOps.newOrderFlow(no.dataset.neworder); return; }
    const cr = t.closest("[data-credit]"); if (cr) { PSTOps.creditFlow(cr.dataset.credit); return; }
    const rv = t.closest("[data-recv]"); if (rv) { await PSTOps.receivePO(rv.dataset.recv, $("[data-po]")); stockList(); return; }
    const pc = t.closest("[data-poopen]"); if (pc) { PSTOps3.poOpen(pc.dataset.poopen, stockList); return; }
    if (t.closest("[data-newpo]")) { PSTOps3.poSheet({ then: stockList }); return; }
    const ct = t.closest("[data-count]"); if (ct) { const p = stockRows.find(x => x.product_key === ct.dataset.count); if (p) PSTOps.countFlow(p, stockList); return; }
    if (t.closest("[data-signout]")) { await P.client().auth.signOut(); location.href = "login.html?redirect=owner.html"; return; }
    const tx = t.closest("[data-texts]"); if (tx) { texts(orders.find(o => String(o.id) === tx.dataset.texts)); return; }
    const sp = t.closest("[data-std]"); if (sp) { const i = Object.values(items).flat().find(x => String(x.id) === sp.dataset.std); const d = i && protoDays(i); if (d) await setDays(i.id, d, "protocol"); return; }
    if (t.closest("[data-psync]")) { let n = 0; for (const name in protos) if (protoOn({ display_name: name })) n += await protoSync(name, protos[name]); P.toast(`Reminder timing set on ${n} product${n === 1 ? "" : "s"}`); protoPage(); return; }
    if (t.closest("[data-cheerx]")) { $("[data-cheer]").innerHTML = ""; return; }
    const th = t.closest("[data-th]"); if (th) { applyTheme(th.dataset.th); return; }
    const pe = t.closest("[data-pmedit]"); if (pe) { pmEdit(pe.dataset.pmedit); return; }
    const pn = t.closest("[data-pmnew]"); if (pn) { pmEdit(null); return; }
    const pb = t.closest("[data-pmbake]"); if (pb) { pmBakeAll(pb); return; }
    const pl = t.closest("[data-pmlive]"); if (pl) { e.preventDefault(); pmLive(pl.dataset.pmlive, pl.getAttribute("aria-checked") !== "true", pl); return; }
    const rg = t.closest("[data-range]"); if (rg) { insights(Number(rg.dataset.range)); return; }
    const hd = t.closest("[data-hold]"); if (hd) { hd.disabled = true; const { error } = await P.client().rpc("pst_hold_until_paid", { p_order_id: hd.dataset.hold, p_hold: hd.dataset.on === "1" }); P.toast(error ? "Couldn't change hold: " + error.message : hd.dataset.on === "1" ? "Held until paid" : "24-hour timer restarted"); await load(); if (document.querySelector(`[data-osheet="${hd.dataset.hold}"]`)) PSTOps.openOrder(hd.dataset.hold); return; }
    const cp = t.closest("[data-copy]"); if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => P.toast("Copied " + cp.dataset.copy)); return; }
    const o = t.closest("[data-o]"); if (!o) return;
    if (o.dataset.o === "refresh") { o.disabled = true; await load(); o.disabled = false; P.toast("Up to date"); }
    if (o.dataset.o === "push") { try { if (await P.enablePush("owner")) { P.toast("Alerts are on"); alertsCard(); if (view === "more") P.notifyPanel($("[data-nal]"), "owner"); } } catch (err) { P.toast(err.message); } }
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
