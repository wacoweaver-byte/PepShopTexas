/* Pep Shop Texas · Black Label: home, collection, product pages */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc, money } = P;

  /* shared card */
  function card(g, opts = {}) {
    const p = P.gBest(g), st = P.stock(p), out = !P.gIn(g), t = P.titleParts(p), multi = g.length > 1;
    const sale = g.some(P.onSale);
    const action = out
      ? `<button class="btn ghost sm qa" type="button" data-avail="${esc(p.product_key)}">Request</button>`
      : multi ? `<a class="btn ghost sm qa" href="${P.productUrl(p)}">Choose strength</a>`
        : `<button class="btn primary sm qa" type="button" data-add="${esc(p.product_key)}">Add to bag</button>`;
    const bd = P.badges(g); if (P.isBlend(p) && !bd.length) bd.push("Blend");
    return `<article class="lcard${out ? " isout" : ""}">${bd.length ? `<span class="tag">${esc(bd[0])}</span>` : ""}${P.heart(p, "onc")}
<a href="${P.productUrl(p)}" class="limg" tabindex="-1" aria-hidden="true">${P.vial(p, opts.w || 84)}</a>
<a href="${P.productUrl(p)}"><h3>${esc(t.main)}</h3></a>${t.sub ? `<span class="sub">${esc(t.sub)}</span>` : ""}
<span class="sz">${esc(g.map(x => x.strength).filter(Boolean).join(" · "))}</span>
<span class="pr">${multi ? "from " : ""}${money(P.gMin(g))}</span>
<span class="stk stk-${out ? (p.incoming_quantity ? "inc" : g.some(x => x.coming_soon) ? "soon" : "out") : st.k}">${out ? (p.incoming_quantity ? "On order" : g.some(x => x.coming_soon) ? "Coming soon" : "Sold out") : st.t}</span>${action}</article>`;
  }
  function bindCards(root) {
    root.addEventListener("click", async e => {
      const a = e.target.closest("[data-add]"), r = e.target.closest("[data-avail]");
      if (a) { P.addAndShow(a.dataset.add, 1); a.textContent = "✓ Added"; setTimeout(() => a.textContent = "Add to bag", 1600); }
      if (r) { const p = (await P.products()).find(x => x.product_key === r.dataset.avail); if (p) P.openAvailability(p); }
    });
  }
  const skeleton = n => Array.from({ length: n }, () => `<div class="lcard skcard"><div class="skel"></div></div>`).join("");
  const sortStockFirst = gs => [...gs].sort((a, b) => (P.gIn(b) - P.gIn(a)) || P.cmpProduct(a[0], b[0]));

  /* ---------------- MY PRODUCTS (signed-in home, web + app) ---------------- */
  const sent = () => P.store.get("pst_paid_sent", {});
  function orderBanner(o, items) {
    const st = P.stageOf(o), its = (items[o.id] || []).map(i => `${i.product_name} ${i.product_strength || ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`.trim()).join(", ");
    const venmo = /venmo/i.test(o.payment_method || ""), notified = sent()[o.id];
    let act = "";
    if (st.n === 0) act = `${venmo ? `<a class="btn venmo sm" href="${esc(P.venmoLink(o.total, o.order_number || o.id))}" target="_blank" rel="noopener">Pay ${money(o.total)} with Venmo</a>` : ""}<button class="btn ghost sm" type="button" data-sent="${o.id}"${notified ? " disabled" : ""}>${notified ? "✓ Payment sent" : "I've sent payment"}</button>`;
    else if (st.n >= 2 && st.pickup) act = `<span class="muted small">We'll text you the pickup spot and time.</span>`;
    else if (st.n === 3 && o.tracking_number && !/no tracking/i.test(o.tracking_number) && !P.handedOff(o)) act = `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(o.tracking_number)}">Track package</a>`;
    return `<div class="obanner ${st.cls}"><div class="obt"><span class="opill ${st.cls}">${esc(st.label)}</span><b>${esc(o.order_number || "Your order")} · ${money(o.total)}</b><span class="muted small">${esc(its)}</span></div><div class="oacts">${act}<a class="btn ghost sm" href="account.html?o=${esc(o.id)}#orders">Details</a></div></div>`;
  }
  function productRow(m) {
    const p = m.p, n = p ? P.qty(p) : 0, t = p ? P.titleParts(p) : { main: m.name, sub: "" };
    const when = m.inProgress ? `<span class="rl ship">${esc(P.stageOf(m.last.o).label)}</span>`
      : m.left <= 0 ? `<span class="rl bad">Probably running out now</span>` : m.left <= 7 ? `<span class="rl warn">Running low · ~${P.fmtDate(m.at).replace(/, \d{4}$/, "")}</span>` : `<span class="rl">Lasts until ~${P.fmtDate(m.at).replace(/, \d{4}$/, "")}</span>`;
    const why = { yours: "based on your reorders", chosen: "your reminder", typical: "typical for this item", default: "estimate", store: "estimate" }[m.est.basis];
    const act = !p ? `<span class="muted small">No longer listed</span>`
      : n <= 0 ? `<button class="btn ghost sm" type="button" data-avail="${esc(p.product_key)}">${p.incoming_quantity ? "On order · notify me" : "Notify me"}</button>`
      : `<div class="qty sm"><button type="button" data-mq="-1" aria-label="Fewer">−</button><span data-mqv>${Math.min(m.qty, n)}</span><button type="button" data-mq="1" aria-label="More">+</button></div><button class="btn primary sm" type="button" data-reorder="${esc(p.product_key)}">Reorder</button>`;
    return `<div class="myrow${m.left <= 7 && !m.inProgress ? " due" : ""}" data-key="${esc(m.key)}" data-max="${n}">${p ? `<a href="${P.productUrl(p)}" class="mi" aria-hidden="true" tabindex="-1">${P.vial(p, 40)}</a>` : `<span class="mi"></span>`}
<div class="mt"><a href="${p ? P.productUrl(p) : "#"}"><b>${esc(t.main)} <span class="muted">${esc(m.strength || p?.strength || "")}</span></b></a><span class="muted small">Last ordered ${P.fmtDate(m.last.at)} · ${m.qty} vial${m.qty > 1 ? "s" : ""}</span>${when}<button class="pkby" type="button" data-pkby title="Run-out date ${esc(why)}"><img src="img/pepkeep-icon-64.png" alt="" width="13" height="13"><span>Estimated by PepKeep</span></button></div>
<div class="ma">${act}</div></div>`;
  }
  // "Estimated by PepKeep" under each run-out date: a small note with the partner link (30 days free via ?via=pepshoptexas)
  function pkNote(btn) {
    const was = document.querySelector(".pkpop"), row = btn.closest(".myrow"); was?.remove(); if (was && was.parentNode === null && was.dataset.for === row.dataset.key) return;
    const d = document.createElement("div"); d.className = "pkpop"; d.dataset.for = row.dataset.key; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Run-out dates by PepKeep");
    d.style.left = Math.max(0, btn.offsetLeft - 12) + "px"; d.style.top = (btn.offsetTop + btn.offsetHeight + 10) + "px";
    d.innerHTML = `<div class="h"><img src="img/pepkeep-icon-64.png" alt="" width="22" height="22">Run-out dates by PepKeep</div><p>PepKeep gives you reminders for dosage, cost and schedule, and estimates run-out dates. Use Siri to add a new vial, log a dose or change your protocol entirely.</p><p>Pep Shop customers get PepKeep free for 30 days.</p><div class="acts"><a class="go" href="https://pepkeep.io/?via=pepshoptexas" target="_blank" rel="noopener">Try PepKeep free</a><button class="x" type="button" data-pkx>Got it</button></div>`;
    row.appendChild(d); P.track?.("pepkeep_note");
    const L = Math.max(8, Math.min(btn.offsetLeft - 12, row.clientWidth - d.offsetWidth - 8)); d.style.left = L + "px"; d.style.setProperty("--ar", Math.max(14, btn.offsetLeft + 14 - L) + "px"); // keep it inside the card, arrow under the icon
    const off = e => { if (!d.contains(e.target) && !e.target.closest("[data-pkby]")) { d.remove(); document.removeEventListener("click", off, true); document.removeEventListener("keydown", esc2, true); } };
    const esc2 = e => { if (e.key === "Escape") { d.remove(); btn.focus(); document.removeEventListener("click", off, true); document.removeEventListener("keydown", esc2, true); } };
    setTimeout(() => { document.addEventListener("click", off, true); document.addEventListener("keydown", esc2, true); });
    d.querySelector(".go").focus({ preventScroll: true });
  }
  async function shelf() {
    const el = $("[data-shelf]"); if (!el) return;
    const user = await P.getUser(); if (!user) { document.documentElement.classList.remove("signed-in"); try { localStorage.removeItem("pst-shelf-cache"); } catch {} el.innerHTML = ""; el.hidden = true; return; } // saved sign-in had expired: show the normal home
    const cached = el.dataset.cached && el.dataset.cached === user.id && el.innerHTML.trim();
    if (P.isStandalone()) document.body.classList.add("app-home");
    el.hidden = false; if (!cached) el.innerHTML = ""; // no grey loading boxes: a saved copy (or nothing) shows until the fresh one is ready
    const [prof, hist] = await Promise.all([P.getProfile(user), P.myHistory(user)]);
    const mine = (await P.myProducts(hist)).filter(m => (Date.now() - new Date(m.last.at)) / 864e5 < 400).slice(0, 12);
    const active = hist.orders.filter(o => !P.isDone(o)).slice(0, 2);
    const due = mine.filter(m => !m.inProgress && m.left <= 7 && m.p && P.qty(m.p) > 0);
    const html = `<div class="wrap shelf"><div class="shead"><div><span class="kick">Welcome back</span><h1 class="serif" style="font-size:2.3rem;margin:0">Hi, ${esc(P.firstName(prof, user))}</h1></div><a class="lnk" href="account.html">Account →</a></div>
${active.map(o => orderBanner(o, hist.items)).join("")}
${mine.length ? `<details class="myacc" data-myacc><summary><span class="myacc-t"><b class="serif">My products</b><small>${mine.length} product${mine.length === 1 ? "" : "s"}${due.length ? ` · <span class="myacc-low">${due.length} running low</span>` : ""}</small></span><span class="myacc-c" aria-hidden="true">${P.icon("next", 18)}</span></summary>
<div class="myacc-b">${due.length > 1 ? `<button class="btn primary sm" type="button" data-reorder-due>Reorder all ${due.length} running low</button>` : ""}<div class="mylist">${mine.map(productRow).join("")}</div><p class="muted small" style="margin-top:8px">Run-out dates are estimates by PepKeep from your order history. Tap Reorder to drop it in your bag; you can add more before checking out.</p></div></details>`
        : active.length ? "" : `<a class="shelfempty" href="catalog.html"><span class="se-ic">${P.icon("bag", 22)}</span><span class="se-tx"><b>No orders yet</b><span>Order once and your products show up here for one-tap reorder.</span></span><span class="btn primary sm se-go">Shop the collection</span></a>`}</div>`;
    let prev = null; try { prev = JSON.parse(localStorage.getItem("pst-shelf-cache") || "null")?.html || null; } catch {}
    if (!cached || prev !== html) el.innerHTML = html; // only redraw if something changed since last visit
    // My products folds away (closed by default) so the featured products below show; the choice is remembered on this device
    const acc = el.querySelector("[data-myacc]");
    if (acc) { try { acc.open = localStorage.getItem("pst-myopen") === "1"; } catch {} acc.addEventListener("toggle", () => { try { localStorage.setItem("pst-myopen", acc.open ? "1" : "0"); } catch {} }); }
    try { localStorage.setItem("pst-shelf-cache", JSON.stringify({ uid: user.id, html })); } catch {}
    el.addEventListener("click", async e => {
      const mq = e.target.closest("[data-mq]"); if (mq) { const row = mq.closest(".myrow"), v = row.querySelector("[data-mqv]"); v.textContent = Math.max(1, Math.min(Number(row.dataset.max) || 1, Number(v.textContent) + Number(mq.dataset.mq))); return; }
      const ro = e.target.closest("[data-reorder]"); if (ro) { const row = ro.closest(".myrow"); P.addToCart(ro.dataset.reorder, Number(row.querySelector("[data-mqv]").textContent) || 1); location.href = "cart.html?from=mine"; return; }
      if (e.target.closest("[data-reorder-due]")) { due.forEach(m => P.addToCart(m.p.product_key, Math.min(m.qty, P.qty(m.p)))); location.href = "cart.html?from=mine"; return; }
      const pk = e.target.closest("[data-pkby]"); if (pk) { pkNote(pk); return; }
      if (e.target.closest("[data-pkx]")) { el.querySelector(".pkpop")?.remove(); return; }
      const sd = e.target.closest("[data-sent]"); if (sd) { sd.disabled = true; sd.textContent = "Sending…"; const ok = await P.paidNotice(sd.dataset.sent); const m = sent(); m[sd.dataset.sent] = 1; P.store.set("pst_paid_sent", m); sd.textContent = "✓ Payment sent"; P.toast(ok ? "Thanks! Jimmie's been notified." : "Thanks! We'll match it to your order."); return; }
    });
    bindCards(el);
  }

  /* ---------------- HOME ---------------- */
  /* v5.12: live promotions get real space (Jimmie report #8: a live deal was only a thin line in the top bar) */
  let DEALS = null;
  const dealsP = () => DEALS ? Promise.resolve(DEALS) : P.getUser().then(u => P.activePromotions(u)).then(d => (DEALS = d || []), () => (DEALS = []));
  const endsTxt = p => p.ends_at ? "Ends " + new Date(p.ends_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "";
  function dealNote() { const d = (DEALS || [])[0]; if (!d) return "";
    return `<div class="pdeal">${P.icon("tag", 16)}<span><b>${esc(d.title)}</b>${d.body ? ` · ${esc(d.body)}` : ""}${endsTxt(d) ? ` <small>${esc(endsTxt(d))}</small>` : ""}</span></div>`; }
  async function dealsHome(all) {
    const ds = await dealsP(); if (!ds.length) return;
    const hero = document.querySelector(".hero"); if (!hero || document.querySelector("[data-deals]")) return;
    const card = d => { const r = d.promotion_type === "free_product" && d.reward_product_key ? all.find(x => x.product_key === d.reward_product_key) : null;
      return `<a class="dealc" href="${esc(d.button_link || "catalog.html")}">${r ? `<span class="dealimg">${P.vial(r, 70)}<i>FREE</i></span>` : `<span class="dealic">${P.icon("tag", 26)}</span>`}
<span class="dealtx"><span class="kick">${esc(d.badge || "Live deal")}${endsTxt(d) ? ` · ${esc(endsTxt(d))}` : ""}</span><b class="serif">${esc(d.title)}</b>${d.body ? `<span class="muted">${esc(d.body)}</span>` : ""}<span class="lnk">${esc(d.button_text || "Shop the deal")} →</span></span></a>`; };
    hero.insertAdjacentHTML("afterend", `<section class="wrap deals" data-deals aria-label="Current deals">${ds.slice(0, 3).map(card).join("")}</section>`);
  }
  async function home() {
    shelf();
    const avail = $("[data-avail-grid]"), ed = $("[data-editorial]"), marq = $("[data-marquee]"), ads = $("[data-ads]");
    if (avail) { avail.innerHTML = skeleton(4); bindCards(avail); }
    loadAds(ads);
    try {
      const all = await P.products(), gs = P.groups(all), inS = sortStockFirst(gs).filter(P.gIn);
      dealsHome(all).catch(() => {});
      const st = $("[data-hstats]"); if (st) st.innerHTML = `<div><b>${gs.length}</b>Compounds</div><div><b>${inS.length}</b>In stock</div><div><b>${all.filter(p => P.coaHref(p)).length}</b>Lab reports</div>`;
      if (marq) { const items = inS.map(g => `<a href="${P.productUrl(P.gBest(g))}">${esc(P.titleParts(g[0]).main)}</a>`).join("<i>✦</i>"); marq.innerHTML = `<div aria-hidden="true">${items}<i>✦</i>${items}<i>✦</i></div>`; }
      if (avail) avail.innerHTML = inS.slice(0, 8).map(g => card(g)).join("") || `<p class="empty">Restocking now. Check back soon.</p>`;
      const hr = $("[data-home-recent]"); if (hr) { const rg = P.recent().map(k => gs.find(g => P.gkey(g[0]) === k)).filter(Boolean).slice(0, 4); if (rg.length) { hr.innerHTML = `<div class="shead" style="margin-top:36px"><h2 class="serif">Recently viewed</h2></div><div class="lgrid">${rg.map(g => card(g)).join("")}</div>`; bindCards(hr); } }
      if (ed) {
        const pick = [...inS.filter(g => g.some(p => p.featured || p.hot_peptide)), ...inS].filter((g, i, arr) => arr.indexOf(g) === i).slice(0, 3);
        ed.innerHTML = pick.map((g, i) => { const p = P.gBest(g), t = P.titleParts(p), coa = g.some(P.coaHref);
          return `<div class="ed ${i % 2 ? "rev" : ""}"><a href="${P.productUrl(p)}" class="edimg" aria-hidden="true" tabindex="-1">${P.vial(p, 150)}</a>
<div class="edtx"><span class="kick">${esc(P.focuses(p).map(f => P.FOCUS[f]).join(" · ") || (P.isBlend(p) ? "Research blend" : "Research peptide"))}</span><h3 class="serif">${esc(t.main)}</h3>${t.sub ? `<p class="muted">${esc(t.sub)}</p>` : ""}
<p>${esc(g.map(x => x.strength).filter(Boolean).join(" · "))} <span class="muted">· from ${money(P.gMin(g))}</span></p>
<p class="muted small">${coa ? "Third-party lab report on file." : "Lab report for this batch is in progress."}</p><a class="lnk" href="${P.productUrl(p)}">View ${esc(t.main)} →</a></div></div>`; }).join("");
      }
    } catch (err) { if (avail) avail.innerHTML = `<p class="empty">Couldn't load products. ${esc(err.message || "")}</p>`; }
  }
  async function loadAds(host) {
    if (!host) return;
    try {
      const feat = P.groups(await P.products()).map(g => ({ g, r: Math.min(...g.map(x => x.home_feature_rank || 99)) })).filter(x => x.r < 99).sort((a, b) => a.r - b.r);
      if (feat.length) {
        host.classList.add("featrow");
        host.innerHTML = feat.map(({ g }) => { const p = g.find(x => x.home_feature_rank) || P.gBest(g), t = P.titleParts(p), inS = g.some(x => P.qty(x) > 0);
          return `<a class="featcard" href="${P.productUrl(p)}"><div class="fimg">${P.vial(p, 150)}</div><div class="ftxt"><span class="kick">${esc((P.focuses(p).map(f => P.FOCUS[f])[0]) || (P.isBlend(p) ? "Research blend" : "Research peptide"))}</span><b class="serif">${esc(t.main)}</b><small>${esc(g.map(x => x.strength).filter(Boolean).join(" · "))}</small><span class="fpr">from ${money(P.gMin(g))}${inS ? "" : " · <i>restocking</i>"}</span><span class="lnk">Shop now →</span></div></a>`; }).join("");
        return;
      }
      const { data } = await P.client().from("catalog_carousel_ads").select("id,title,image_path,sort_order").eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (!data?.length) { host.closest("section")?.remove(); return; }
      host.innerHTML = data.map((ad, i) => `<a href="catalog.html"><img src="${esc(P.client().storage.from("catalog-carousel").getPublicUrl(ad.image_path).data.publicUrl)}" alt="Pep Shop Texas feature ${i + 1}" loading="${i ? "lazy" : "eager"}"></a>`).join("");
    } catch { host.closest("section")?.remove(); }
  }

  /* ---------------- COLLECTION ---------------- */
  async function catalog() {
    const grid = $("[data-grid]"), q = $("#cq"), tabs = $("[data-tabs]"), only = $("#instock"), head = $("[data-head]"), cnt = $("[data-count]");
    grid.innerHTML = skeleton(8); bindCards(grid);
    const reqCat = P.params.get("category") || "", cat0 = ["Blend", "Stack", "Multi-Peptide Product"].includes(reqCat) ? "blend" : reqCat === "Supply" ? "supply" : "";
    if (P.params.get("search")) P.track("search", { term: P.params.get("search").slice(0, 80) });
    const state = { f: (P.params.get("focus") || "").toLowerCase(), c: cat0, s: P.params.get("search") || "", only: P.params.get("stock") === "1", sort: P.params.get("sort") || "name" }; // v38: A–Z by default (5-Amino first)
    const sortSel = $("#csort"); if (sortSel) { sortSel.value = state.sort; sortSel.addEventListener("change", () => { state.sort = sortSel.value; draw(); }); }
    if (!P.FOCUS[state.f]) state.f = "";
    q.value = state.s; only.checked = state.only;
    let all = [];
    const TABS = [["", "", "All"], ["f", "performance", "Performance"], ["f", "recovery", "Recovery"], ["f", "longevity", "Longevity"], ["c", "blend", "Blends"], ["c", "supply", "Supplies"]];
    function drawTabs() { tabs.innerHTML = TABS.map(([k, v, t]) => `<button class="tab" type="button" data-k="${k}" data-v="${v}" aria-pressed="${k ? state[k] === v : !state.f && !state.c}">${t}</button>`).join(""); }
    function syncUrl() { const u = new URLSearchParams(); if (state.s) u.set("search", state.s); if (state.f) u.set("focus", state.f); if (state.c === "blend") u.set("category", "Multi-Peptide Product"); if (state.c === "supply") u.set("category", "Supply"); if (state.only) u.set("stock", "1"); if (state.sort && state.sort !== "name") u.set("sort", state.sort); history.replaceState(null, "", "catalog.html" + (u.toString() ? "?" + u : "")); }
    function draw() {
      const s = state.s.trim().toLowerCase();
      let list = all.filter(p => {
        const hay = [p.display_name, p.strength, p.category, p.series, p.product_key, ...P.focuses(p)].filter(Boolean).join(" ").toLowerCase();
        return (!s || hay.includes(s)) && (!state.f || P.focuses(p).includes(state.f)) && (!state.c || (state.c === "blend" ? P.isBlend(p) : p.category === "Supply"));
      });
      let gs = sortStockFirst(P.groups(list)); if (state.only) gs = gs.filter(P.gIn);
      const newest = g => Math.max(...g.map(x => new Date(x.created_at || 0).getTime())), best = g => g.some(x => x.hot_peptide || x.featured);
      const by = { price: (a, b) => P.gMin(a) - P.gMin(b), pricedesc: (a, b) => P.gMin(b) - P.gMin(a), name: (a, b) => P.cmpProduct(a[0], b[0]), new: (a, b) => newest(b) - newest(a), best: (a, b) => (best(b) - best(a)) || (P.gIn(b) - P.gIn(a)) || P.cmpProduct(a[0], b[0]) }[state.sort];
      if (by) gs = [...gs].sort((a, b) => (state.sort === "name" || state.sort === "new" ? 0 : P.gIn(b) - P.gIn(a)) || by(a, b));
      head.textContent = s ? `“${state.s.trim()}”` : state.f ? P.FOCUS[state.f] : state.sort === "new" ? "New arrivals" : state.sort === "best" ? "Best sellers" : state.c === "blend" ? "Research blends" : state.c === "supply" ? "Supplies" : state.only ? "Available now" : "The Collection";
      cnt.textContent = `${gs.length} ${gs.length === 1 ? "product" : "products"}`;
      grid.innerHTML = gs.map(g => card(g)).join("") || `<div class="empty" style="grid-column:1/-1">${P.icon("search", 28)}<p>Nothing matches that. <button class="linkish" type="button" data-clear>Clear filters</button></p></div>`;
      syncUrl(); document.title = `${head.textContent} | Pep Shop Texas`;
    }
    tabs.addEventListener("click", e => { const b = e.target.closest(".tab"); if (!b) return; const { k, v } = b.dataset; if (!k) { state.f = ""; state.c = ""; } else { const other = k === "f" ? "c" : "f"; state[other] = ""; state[k] = state[k] === v ? "" : v; } drawTabs(); draw(); });
    let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.s = q.value; draw(); }, 140); });
    $("[data-cform]").addEventListener("submit", e => { e.preventDefault(); state.s = q.value; draw(); q.blur(); });
    only.addEventListener("change", () => { state.only = only.checked; draw(); });
    grid.addEventListener("click", e => { if (e.target.closest("[data-clear]")) { Object.assign(state, { f: "", c: "", s: "", only: false }); q.value = ""; only.checked = false; drawTabs(); draw(); } });
    if (state.sort === "new") head.dataset.alt = "New arrivals"; if (state.sort === "best") head.dataset.alt = "Best sellers";
    drawTabs();
    try { all = await P.products(); draw(); } catch (err) { grid.innerHTML = `<p class="empty" style="grid-column:1/-1">Couldn't load the collection. ${esc(err.message || "")}</p>`; }
  }

  /* ---------------- PRODUCT ---------------- */
  async function product() {
    dealsP().then(() => { const el = document.querySelector("[data-pdeal]"); if (el && !el.innerHTML) el.innerHTML = dealNote(); });
    const host = $("[data-pdp]"), key = P.params.get("key") || P.params.get("id") || "";
    if (!key) { host.innerHTML = `<div class="wrap pad empty"><p>No product selected.</p><a class="btn ghost" href="catalog.html">Browse the collection</a></div>`; return; }
    let all;
    try { all = await P.products(); } catch (err) { host.innerHTML = `<div class="wrap pad empty"><p>Couldn't load this product. ${esc(err.message || "")}</p></div>`; return; }
    let cur = all.find(p => p.product_key === key);
    if (!cur) {
      try { const { data } = await P.client().from("product_key_aliases").select("new_product_key").eq("old_product_key", key).maybeSingle(); if (data?.new_product_key) cur = all.find(p => p.product_key === data.new_product_key); } catch {}
      const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!cur) cur = all.find(p => [p.id, p.product_key, p.display_name, `${p.display_name} ${p.strength}`].map(norm).includes(norm(key)));
    }
    if (!cur) { host.innerHTML = `<div class="wrap pad empty"><h1 class="serif">That product isn't listed right now</h1><p>It may have been renamed or retired.</p><a class="btn primary" href="catalog.html">Browse the collection</a></div>`; return; }
    const group = all.filter(p => String(p.display_name || "").trim().toLowerCase() === String(cur.display_name || "").trim().toLowerCase()).sort(P.cmpProduct);
    // v46: share the product's own page (it carries the product picture and name for texts and social posts) when it exists
    let shareUrl = location.href; { const g0 = group[0] || cur, slug = String(P.titleParts(g0).main || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
      const cand = new URL(`${slug}-${String(g0.product_key || "").toLowerCase()}.html`, location.href).href; fetch(cand, { method: "HEAD" }).then(r => { if (r.ok) shareUrl = cand; }).catch(() => {}); }
    if (P.qty(cur) <= 0 && !P.params.get("key")) cur = P.gBest(group);
    let qty = 1;
    const t = P.titleParts(cur);
    function draw() {
      const st = P.stock(cur), out = P.qty(cur) <= 0, coa = P.coaHref(cur), sale = P.onSale(cur);
      const inCount = group.filter(p => P.qty(p) > 0).length;
      P.track("product_view", { key: cur.product_key });
      document.title = `${cur.display_name} ${cur.strength || ""} | Pep Shop Texas`;
      host.innerHTML = `<div class="pdp">
<div class="spot"><a class="back" href="catalog.html">${P.icon("back", 16)} Collection</a><div class="pacts">${P.heart(cur)}<button type="button" class="heartb" data-act2="share" aria-label="Share">${P.icon("share", 18)}</button></div><div class="vstick">${P.photo(cur) ? `<button type="button" class="zoomb" data-act2="zoom" aria-label="View larger photo">${P.vial(cur, 210)}<span class="zhint">${P.icon("search", 14)} Tap to enlarge</span></button>` : P.vial(cur, 170)}${coa ? `<a class="coapeek" href="${esc(coa)}" target="_blank" rel="noopener" data-coapeek="${esc(coa)}" data-coatitle="${esc(`${cur.display_name} ${cur.strength || ""} · lab report`)}" aria-label="Lab report for ${esc(cur.display_name)} ${esc(cur.strength || "")}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13l2 2 4-4"/></svg><span><b>COA</b><small>Lab report</small></span></a>` : ""}</div></div>
<div class="pinfo"><nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="catalog.html">Collection</a>${P.focuses(cur)[0] ? `<span>/</span><a href="catalog.html?focus=${P.focuses(cur)[0]}">${P.FOCUS[P.focuses(cur)[0]]}</a>` : P.isBlend(cur) ? `<span>/</span><a href="catalog.html?category=Multi-Peptide%20Product">Blends</a>` : ""}<span>/</span><span aria-current="page">${esc(t.main)}</span></nav>
${P.badges(group).length ? `<div class="pbadges">${P.badges(group).map(b => `<span>${esc(b)}</span>`).join("")}</div>` : ""}<span class="kick">${esc(P.focuses(cur).map(f => P.FOCUS[f]).join(" · ") || (P.isBlend(cur) ? "Research blend" : cur.category || "Research product"))}</span>
<h1 class="serif">${esc(t.main)}</h1>${t.sub ? `<p class="sub">${esc(t.sub)}</p>` : ""}<div class="rule"></div>
<div class="pp"><b>${money(P.unitPrice(cur))}</b>${sale ? `<s class="was">${money(cur.price)}</s><span class="sale">${esc(cur.sale_label || "Sale")}</span>` : ""}<span class="stk stk-${st.k}">${st.t}</span></div>
${st.sub ? `<p class="muted small">${esc(st.sub)}</p>` : ""}
${group.length > 1 ? `<p class="kick" style="margin-top:14px">Strength <span class="muted" style="letter-spacing:.06em;text-transform:none">· ${inCount} of ${group.length} in stock</span></p><div class="strengths" role="group" aria-label="Choose a strength">${group.map(p => `<button type="button" class="sopt${P.qty(p) <= 0 ? " out" : ""}" data-key="${esc(p.product_key)}" aria-pressed="${p === cur}"><b>${esc(p.strength || "Standard")}</b><span>${money(P.unitPrice(p))}</span><small>${P.qty(p) > 0 ? P.stock(p).t : "Out"}</small></button>`).join("")}</div>` : `<p class="muted">${esc(cur.strength || "")} vial</p>`}
<div data-pdeal>${dealNote()}</div><div class="buy">${out ? "" : `<div class="qty"><button type="button" data-q="-1" aria-label="Fewer">−</button><input id="pq" value="${qty}" inputmode="numeric" aria-label="Quantity"><button type="button" data-q="1" aria-label="More">+</button></div>`}
${out ? `<button class="btn ghost wide" type="button" data-act2="avail">Request availability</button>` : `<button class="btn primary wide" type="button" data-act2="add">Add to bag · ${money(P.unitPrice(cur) * qty)}</button>`}</div>
<div class="facts"><div>${P.icon("flask", 18)}<b>${coa ? "Lab report" : "COA pending"}</b>${coa ? `<a href="${esc(coa)}" target="_blank" rel="noopener">${esc(cur.coa_label || "View COA")}</a>` : "<span>At the lab</span>"}</div><div>${P.icon("truck", 18)}<b>Ships same night</b><span>USPS Priority</span></div><div>${P.icon("pin", 18)}<b>Free pickup</b><span>Or ship ${money(P.CFG.shipRate)}</span></div></div>
${addons()}
<p class="bulkn">${P.icon("box", 16)} Need 10+ vials? <a href="bulk-request.html">Request bulk pricing →</a></p>
<div class="acc"><details open><summary>Overview</summary><div class="in">${summary()}</div></details>
<details><summary>Specifications</summary><div class="in"><table class="specs">
<tr><td>Strength</td><td>${esc(cur.strength || "—")}</td></tr><tr><td>Form</td><td>Lyophilized powder, sealed vial</td></tr>
<tr><td>Type</td><td>${P.isBlend(cur) ? "Multi-peptide research blend" : esc(cur.category || "Research peptide")}</td></tr>
<tr><td>Research focus</td><td>${esc(P.focuses(cur).map(f => P.FOCUS[f]).join(", ") || "—")}</td></tr>
<tr><td>Storage</td><td>Ships as a dry powder. Store as directed on the label.</td></tr><tr><td>Lab report</td><td>${coa ? `<a class="linkish" href="${esc(coa)}" target="_blank" rel="noopener">Third-party COA (PDF)</a>` : "Pending for the current batch"}</td></tr></table></div></details>
<details><summary>Pickup &amp; shipping</summary><div class="in">Free local pickup: we text you when it's ready. Shipping is a flat ${money(P.CFG.shipRate)} anywhere in the US, free over ${money(P.CFG.freeShip)}. Orders ship once payment is confirmed.</div></details>
<details><summary>Paying</summary><div class="in">Venmo is the fastest: after you place the order, one tap opens Venmo with the amount and your order number filled in. Other payment options are listed at checkout.</div></details></div>
<div class="ruo">For research use only. Not for human or veterinary use. Not evaluated by the FDA.</div></div></div>
<div class="buybar">${out ? `<div class="bp"><span>${esc(cur.strength || "")}</span><b>${money(P.unitPrice(cur))}</b></div><button class="btn ghost" type="button" data-act2="avail">Request availability</button>`
        : `<div class="qty sm"><button type="button" data-q="-1" aria-label="Fewer">−</button><span data-qv>${qty}</span><button type="button" data-q="1" aria-label="More">+</button></div><button class="btn primary" type="button" data-act2="add">Add · ${money(P.unitPrice(cur) * qty)}</button>`}</div>
<section class="wrap related" data-related></section><section class="wrap related" data-recent></section>`;
      seo(); recentRow(); P.recordRecent(cur);
      related();
    }
    /* his own write-up when he's added one in the owner app, otherwise plain facts only (no claims) */
    function summary() {
      const txt = String(group.find(p => p.research_summary)?.research_summary || "").trim();
      if (txt) return txt.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`).join("");
      return `<p>${esc(cur.display_name)} is supplied as a lyophilized (freeze-dried) powder in a sealed ${esc(cur.strength || "")} vial${group.length > 1 ? `, and comes in ${group.length} strengths: ${esc(group.map(x => x.strength).filter(Boolean).join(", "))}` : ""}. ${P.isBlend(cur) ? "It is a multi-peptide research blend. " : ""}${P.coaHref(cur) ? "A third-party certificate of analysis for the current batch is linked below." : "The certificate of analysis for the current batch is in progress at an independent lab."}</p><p class="muted small">Sold for laboratory research use only. Not for human or veterinary use.</p>`;
    }
    function addons() {
      const sup = all.filter(p => p.category === "Supply" && P.qty(p) > 0 && p.product_key !== cur.product_key).slice(0, 3);
      if (!sup.length || cur.category === "Supply") return "";
      return `<div class="addons"><span class="kick">Often added</span>${sup.map(p => `<div class="addon">${P.vial(p, 26)}<span><b>${esc(p.display_name)} ${esc(p.strength || "")}</b><small>${money(P.unitPrice(p))}</small></span><button type="button" class="btn ghost sm" data-addon="${esc(p.product_key)}">+ Add</button></div>`).join("")}</div>`;
    }
    function recentRow() {
      const el = $("[data-recent]"), ks = P.recent().filter(k => k !== P.gkey(cur)).slice(0, 4);
      const gs = ks.map(k => P.groups(all).find(g => P.gkey(g[0]) === k)).filter(Boolean);
      if (!gs.length) { el.remove(); return; }
      el.innerHTML = `<div class="shead"><h2 class="serif">Recently viewed</h2></div><div class="lgrid">${gs.map(g => card(g)).join("")}</div>`; bindCards(el);
    }
    function seo() {
      let s = document.getElementById("ldp"); if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = "ldp"; document.head.appendChild(s); }
      s.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: `${cur.display_name} ${cur.strength || ""}`.trim(), sku: cur.product_key, brand: { "@type": "Brand", name: "Pep Shop Texas" }, category: cur.category || "Research peptide",
        image: "https://www.pepshoptexas.com/icons/icon-512.png", description: `${cur.display_name} ${cur.strength || ""} research peptide, lyophilized powder in a sealed vial. For research use only.`,
        offers: group.map(p => ({ "@type": "Offer", sku: p.product_key, price: P.unitPrice(p).toFixed(2), priceCurrency: "USD", availability: P.qty(p) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `https://www.pepshoptexas.com/${P.productUrl(p)}` })) });
      const m = document.querySelector('meta[name=description]'); if (m) m.content = `${cur.display_name} ${cur.strength || ""} from Pep Shop Texas: ${P.qty(cur) > 0 ? "in stock" : "restocking"}, ${money(P.unitPrice(cur))}, ${P.coaHref(cur) ? "third-party lab report on file" : "lab-tested"}. Free local pickup.`;
    }
    function related() {
      const el = $("[data-related]"), fs = P.focuses(cur);
      const gs = sortStockFirst(P.groups(all)).filter(g => g[0].display_name !== cur.display_name && P.gIn(g) && P.focuses(g[0]).some(f => fs.includes(f))).slice(0, 4);
      if (!gs.length) { el.remove(); return; }
      el.innerHTML = `<div class="shead"><h2 class="serif">Also available</h2><a class="lnk" href="catalog.html?stock=1">See all →</a></div><div class="lgrid">${gs.map(g => card(g)).join("")}</div>`;
      bindCards(el);
    }
    function setQty(n) { qty = Math.max(1, Math.min(Math.max(1, P.qty(cur)), n || 1)); const i = $("#pq"); if (i) i.value = qty; const v = $("[data-qv]"); if (v) v.textContent = qty; $$("[data-act2=add]").forEach((b, i2) => b.textContent = (b.closest(".buybar") ? "Add · " : "Add to bag · ") + money(P.unitPrice(cur) * qty)); }
    host.addEventListener("click", e => {
      const s = e.target.closest(".sopt"); if (s) { cur = group.find(p => p.product_key === s.dataset.key) || cur; qty = 1; history.replaceState(null, "", P.productUrl(cur)); draw(); return; }
      const q = e.target.closest("[data-q]"); if (q) { setQty(qty + Number(q.dataset.q)); return; }
      const b = e.target.closest("[data-act2]"); if (!b) return;
      if (b.dataset.act2 === "avail") P.openAvailability(cur);
      if (b.dataset.act2 === "zoom") P.vialStudio(cur).then(src => P.sheet(`<figure class="zoomfig"><img src="${src}" alt="${esc(cur.display_name)} ${esc(cur.strength || "")}"><figcaption>${esc(cur.display_name)} · ${esc(cur.strength || "")}<span>For research use only</span></figcaption></figure>`, { label: "Product photo" }));
      if (b.dataset.act2 === "add") P.addAndShow(cur.product_key, qty);
      if (b.dataset.act2 === "share") { const url = shareUrl, title = `${cur.display_name} ${cur.strength || ""} · Pep Shop Texas`; if (navigator.share) navigator.share({ title, url }).catch(() => {}); else navigator.clipboard?.writeText(url).then(() => P.toast("Link copied")); }
      const ad = e.target.closest("[data-addon]"); if (ad) P.addAndShow(ad.dataset.addon, 1);
    });
    host.addEventListener("change", e => { if (e.target.id === "pq") setQty(Number(e.target.value)); });
    draw();
  }

  /* ---------------- SAVED ---------------- */
  async function savedPage() {
    const el = $("[data-saved]"), all = await P.products().catch(() => []), gs = P.saved().map(k => P.groups(all).find(g => P.gkey(g[0]) === k)).filter(Boolean);
    el.innerHTML = gs.length ? `<div class="lgrid">${gs.map(g => card(g)).join("")}</div>` : `<div class="empty">${P.icon("heart", 30)}<p>Nothing saved yet. Tap the heart on any product to keep it here.</p><a class="btn primary" href="catalog.html">Browse the collection</a></div>`;
    bindCards(el);
    el.addEventListener("click", e => { if (e.target.closest("[data-save]")) setTimeout(savedPage, 50); });
  }
  document.addEventListener("DOMContentLoaded", () => {
    const pg = document.body.dataset.page;
    if (pg === "home") home(); if (pg === "catalog") catalog(); if (pg === "product") product(); if (pg === "saved") savedPage();
  });
  window.PSTShop = { card, bindCards };
})();
