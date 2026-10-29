/* Pep Shop Texas · Black Label: account, sign in, register, password, bulk, lab reports, rewards */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc, money } = P;
  const notice = (el, msg, kind = "") => { if (!el) return; el.textContent = msg; el.className = "notice " + kind; el.hidden = !msg; };
  const base = () => location.href.replace(/[^/]*([?#].*)?$/, "");
  function safeRedirect(v, fb = "account.html") {
    const t = String(v || "").trim(); if (!t || t.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(t)) return fb;
    try { const u = new URL(t, location.href); if (u.origin !== location.origin) return fb; return (u.pathname.split("/").pop() || fb) + u.search + u.hash; } catch { return fb; }
  }
  function pwToggles(root = document) {
    $$("[data-pw]", root).forEach(b => b.addEventListener("click", () => { const i = document.getElementById(b.dataset.pw); const show = i.type === "password"; i.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password"); }));
  }

  /* ---------------- ACCOUNT ---------------- */
  let user, profile, orders = [], items = {}, admin = false, mine = [];
  const stageOf = o => {
    const s = String(o.order_status || o.status || "pending").toLowerCase(), pay = String(o.payment_status || "pending").toLowerCase();
    const pickup = /local pickup/i.test(o.customer_notes || "");
    if (["rejected", "cancelled", "canceled", "refunded", "failed"].includes(s)) return { bad: true, label: s.charAt(0).toUpperCase() + s.slice(1), cls: "bad", n: -1, pickup };
    const n = ["shipped", "delivered", "complete", "completed"].includes(s) ? 3 : s === "packed" ? 2 : (pay === "paid" || s === "processing" || s === "paid") ? 1 : 0;
    const label = n === 3 ? (P.handedOff(o) ? (pickup ? "Picked up" : "Hand delivered") : pickup ? (s === "shipped" ? "Ready for pickup" : "Picked up") : s === "delivered" ? "Delivered" : "Shipped") : n === 2 ? (pickup ? "Ready for pickup" : "Packed") : n === 1 ? "Paid" : "Awaiting payment";
    return { n, label, cls: n === 0 ? "pend" : n === 3 ? "ship" : "ok", pickup };
  };
  const trackUrl = (c, n) => { c = String(c || "").toLowerCase(); n = encodeURIComponent(n); return c.includes("ups") ? `https://www.ups.com/track?tracknum=${n}` : c.includes("fedex") ? `https://www.fedex.com/fedextrack/?trknbr=${n}` : `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`; };

  async function account() {
    const root = $("[data-account]");
    user = await P.getUser();
    if (!user) { location.href = "login.html?redirect=" + encodeURIComponent("account.html" + location.search + location.hash); return; } // keep the alert's deep link
    root.innerHTML = `<p class="muted">Loading your account…</p>`;
    profile = await P.getProfile(user);
    admin = await P.isAdmin(user).catch(() => false);
    let r = await P.client().from("orders").select("id,order_number,status,order_status,total,subtotal,shipping,tax,payment_status,payment_method,tracking_number,tracking_carrier,customer_notes,created_at,updated_at").eq("customer_id", user.id).order("created_at", { ascending: false });
    if (r.error) r = await P.client().from("orders").select("id,order_number,status,total,subtotal,shipping,tax,payment_status,tracking_number,tracking_carrier,created_at").eq("customer_id", user.id).order("created_at", { ascending: false });
    orders = r.data || []; items = {};
    if (orders.length) {
      const ids = orders.map(o => o.id);
      let ir = await P.client().from("order_items").select("id,order_id,product_id,product_key,product_name,product_strength,product_category,quantity,unit_price,line_total,reorder_reminder_days").in("order_id", ids);
      if (ir.error) ir = await P.client().from("order_items").select("id,order_id,product_id,product_name,product_strength,product_category,quantity,unit_price,line_total").in("order_id", ids);
      (ir.data || []).forEach(i => (items[i.order_id] ||= []).push(i));
    }
    mine = await P.myProducts(await P.myHistory(user)).catch(() => []);
    const due = mine.filter(m => !m.inProgress && m.left <= 7).map(m => ({ days: m.left }));
    root.innerHTML = `<div class="hello"><img src="img/pst-emblem-96.webp" width="52" height="52" alt=""><div><small>${esc(profile?.customer_number ? "Customer PST-C" + profile.customer_number : "My account")}</small><h1 class="serif" style="font-size:2.2rem;margin:0">Hi, ${esc(P.firstName(profile, user))}</h1></div></div>
<div class="acct"><nav class="atabs" aria-label="Account sections">${[["orders", "Orders"], ["running-low", `Running low${due.filter(d => d.days <= 7).length ? ` (${due.filter(d => d.days <= 7).length})` : ""}`], ["rewards", "Rewards"], ["profile", "Profile"], ["alerts", "Notifications"]].map(([k, t]) => `<button class="tab" type="button" data-tab="${k}">${t}</button>`).join("")}</nav><div data-pane></div></div>`;
    root.addEventListener("click", accountClick);
    showTab((location.hash || "#orders").slice(1));
  }
  function showTab(k) {
    if (!["orders", "running-low", "rewards", "profile", "alerts"].includes(k)) k = "orders";
    $$(".atabs .tab").forEach(b => { b.classList.toggle("on", b.dataset.tab === k); b.setAttribute("aria-selected", b.dataset.tab === k); });
    history.replaceState(null, "", "#" + k);
    const pane = $("[data-pane]");
    ({ orders: paneOrders, "running-low": paneDue, rewards: paneRewards, profile: paneProfile, alerts: paneAlerts })[k](pane);
  }
  function paneOrders(el) {
    const on = P.params.get("on"), want = P.params.get("o") || (on ? String((orders.find(o => String(o.order_number || "").toLowerCase() === on.toLowerCase()) || {}).id || "") : "") || null, wantItem = P.params.get("item"), openIdx = Math.max(0, orders.findIndex(o => String(o.id) === want));
    if (!orders.length) { el.innerHTML = `<div class="empty">${P.icon("box", 32)}<p>No orders yet. When you check out, your orders show up here with live status.</p><a class="btn primary" href="catalog.html">Browse the collection</a></div>`; return; }
    el.innerHTML = orders.map((o, i) => {
      const st = stageOf(o), its = items[o.id] || [], unpaid = st.n === 0 && !st.bad, venmo = /venmo/i.test(o.payment_method || "");
      const isOpen = i === openIdx, done = !st.bad && st.n >= 1;
      return `<article class="ocard${want && String(o.id) === want ? " target" : ""}" data-ocard="${o.id}"><button class="oh" type="button" data-open="${o.id}" aria-expanded="${isOpen}"><div><b>${esc(o.order_number || "Order")}</b><span>${P.fmtDate(o.created_at)} · ${money(o.total)}${its.length ? ` · ${its.reduce((s, x) => s + Number(x.quantity || 0), 0)} item${its.length > 1 ? "s" : ""}` : ""}</span></div><span class="opill ${st.cls}">${esc(st.label)}</span></button>
<div class="ob" id="o-${o.id}"${isOpen ? "" : " hidden"}>${st.bad ? "" : `<ol class="track">${[["Order placed", ""], ["Payment confirmed", ""], [st.pickup ? "Ready for pickup" : "Packed", ""], [st.pickup ? "Picked up" : P.handedOff(o) ? "Hand delivered" : "Shipped", o.tracking_number && !P.handedOff(o) && !/no tracking/i.test(o.tracking_number) ? `${esc(o.tracking_carrier || "Tracking")}: <a class="linkish" target="_blank" rel="noopener" href="${trackUrl(o.tracking_carrier, o.tracking_number)}">${esc(o.tracking_number)}</a>` : ""]].map(([t, s], k) => `<li class="${k <= st.n ? "ok" : k === st.n + 1 ? "cur" : ""}"><b>${t}</b>${s ? `<span>${s}</span>` : ""}</li>`).join("")}</ol>`}
<div class="oitems">${its.map(x => `<div class="oline${wantItem && x.product_key === wantItem && isOpen ? " hit" : ""}"><span>${esc(x.product_name)} ${esc(x.product_strength || "")} × ${Number(x.quantity || 0)}</span><b>${money(x.line_total)}</b>${x.product_key ? `<button class="btn ${wantItem && x.product_key === wantItem && isOpen ? "primary" : "ghost"} xs oadd" type="button" data-again="${esc(x.product_key)}" data-pid="${esc(x.product_id || "")}" data-q="${Number(x.quantity || 1)}">${P.icon("plus", 14)} Add to bag</button>` : ""}</div>`).join("") || "<div><span class='muted'>No item details.</span></div>"}
<div><span class="muted">Shipping</span><span>${o.shipping ? money(o.shipping) : "Free"}</span></div><div><b>Total</b><b>${money(o.total)}</b></div></div>
${unpaid ? `<div data-howpay="${o.id}" data-m="${esc(o.payment_method || "")}" data-t="${Number(o.total || 0)}" data-n="${esc(o.order_number || "")}"></div>` : ""}<div class="oacts">${unpaid ? `<button class="btn ghost sm" type="button" data-sent="${o.id}"${P.store.get("pst_paid_sent", {})[o.id] ? " disabled>✓ Payment sent" : ">I've sent payment"}</button>` : ""}<button class="btn ${done ? "primary" : "ghost"} sm" type="button" data-reorder="${o.id}">${P.icon("bag", 15)} Reorder all</button><a class="btn ghost sm" href="mailto:${P.CFG.support}?subject=${encodeURIComponent("Order " + (o.order_number || ""))}">Get help</a></div></div></article>`;
    }).join("") + `<p class="status" data-ostat role="status"></p>`;
    $$("[data-howpay]", el).forEach(h => P.payCard(h.dataset.m, Number(h.dataset.t), h.dataset.n, null).then(x => { h.innerHTML = x; }).catch(() => {}));
    if (want) setTimeout(() => { const c = el.querySelector(`[data-ocard="${CSS.escape(want)}"]`); c?.scrollIntoView({ block: "start", behavior: "smooth" }); }, 120);
    // the "Add to bag" button on a running-low alert (Android / computer) lands here with add=1: add it once
    if (want && wantItem && P.params.get("add") === "1" && !sessionStorage.getItem("pst_added_" + want + wantItem)) {
      sessionStorage.setItem("pst_added_" + want + wantItem, "1");
      const b = el.querySelector(`[data-ocard="${CSS.escape(want)}"] .oline.hit [data-again]`); if (b) setTimeout(() => b.click(), 300);
    }
  }
  function dueList() {
    const out = [];
    orders.forEach(o => { const st = stageOf(o); if (st.bad) return; (items[o.id] || []).forEach(x => { const d = Number(x.reorder_reminder_days || 0); if (!d) return; const at = new Date(new Date(o.created_at).getTime() + d * 864e5); out.push({ o, x, at, days: Math.ceil((at - Date.now()) / 864e5) }); }); });
    const seen = new Set(); return out.sort((a, b) => b.o.created_at.localeCompare(a.o.created_at)).filter(d => { const k = d.x.product_key || d.x.product_name + d.x.product_strength; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.at - b.at);
  }
  function paneDue(el) {
    el.innerHTML = `<h2 class="serif" style="font-size:2rem">Running low</h2><p class="muted">Estimates come from how often you reorder each item (or your reminder choice until there's history). No dosing info is used.</p>
${mine.length ? mine.map(m => `<div class="dueitem"><div><b>${esc(m.name)} ${esc(m.strength || "")}</b><span class="muted small" style="display:block">${m.inProgress ? esc(P.stageOf(m.last.o).label) : m.left <= 0 ? "Probably running out now" : `Lasts until ~${P.fmtDate(m.at)} · ${m.left} day${m.left === 1 ? "" : "s"}`}</span></div>${m.p && P.qty(m.p) > 0 ? `<button class="btn ${m.left <= 7 && !m.inProgress ? "primary" : "ghost"} sm" type="button" data-again="${esc(m.p.product_key)}" data-pid="" data-q="${m.qty}">Reorder</button>` : m.p ? `<button class="btn ghost sm" type="button" data-again="${esc(m.p.product_key)}" data-pid="" data-q="1">Notify me</button>` : ""}</div>`).join("")
        : `<div class="empty">${P.icon("bell", 30)}<p>Nothing yet. After your first order, each item shows here with an estimate of when you'll run low.</p></div>`}`;
  }
  function paneDueOld(el) {
    const due = dueList();
    el.innerHTML = `<h2 class="serif" style="font-size:2rem">Running low</h2><p class="muted">When you set a reorder reminder at checkout, it shows here, and we send one alert around that date.</p>
${due.length ? due.map(d => `<div class="dueitem"><div><b>${esc(d.x.product_name)} ${esc(d.x.product_strength || "")}</b><span class="muted small" style="display:block">${d.days <= 0 ? "Probably running low now" : `Reorder around ${P.fmtDate(d.at)} · in ${d.days} day${d.days === 1 ? "" : "s"}`}</span></div><button class="btn ${d.days <= 7 ? "primary" : "ghost"} sm" type="button" data-again="${esc(d.x.product_key || "")}" data-pid="${esc(d.x.product_id || "")}" data-q="${Number(d.x.quantity || 1)}">Reorder</button></div>`).join("")
        : `<div class="empty">${P.icon("bell", 30)}<p>No reminders yet. Next time you check out, pick “Remind me to reorder” on any item.</p></div>`}`;
  }
  async function paneRewards(el) {
    el.innerHTML = `<h2 class="serif" style="font-size:2rem">Researcher Rewards</h2><div class="tiles"><div class="tile"><small>Store credit</small><b data-credit>…</b></div><div class="tile"><small>Level</small><b data-tier>…</b></div></div><div data-tierinfo class="muted small"></div><p style="margin-top:16px"><a class="lnk" href="rewards.html">How rewards work →</a></p>`;
    P.creditBalance().then(v => $("[data-credit]").textContent = money(v)).catch(() => $("[data-credit]").textContent = "—");
    const { data, error } = await P.client().rpc("pst_my_loyalty_status");
    if (error || !data) { $("[data-tier]").textContent = "Bronze"; return; }
    const tier = String(data.tier || "bronze").toLowerCase(), names = { bronze: "Bronze", silver: "Silver", gold: "Gold", diamond: "Diamond" };
    $("[data-tier]").textContent = names[tier] || "Bronze";
    const q = Number(data.qualifying_total || 0), nx = Number(data.next_threshold || 0);
    $("[data-tierinfo]").innerHTML = `Qualifying purchases: <b style="color:var(--ink)">${money(q)}</b>${nx ? `<div class="tierbar"><i style="width:${Math.min(100, q / nx * 100)}%"></i></div>${money(data.amount_to_next)} to the next level` : "<br>Highest level reached."}`;
  }
  function paneProfile(el) {
    const v = k => esc(profile?.[k] || "");
    const pref = String(profile?.communication_preference || "email").toLowerCase();
    const mk = profile?.marketing_opt_in === true || String(profile?.marketing_opt_in) === "true";
    el.innerHTML = `<h2 class="serif" style="font-size:2rem">Profile</h2>
<form class="form" data-form="profile"><div class="g2"><label>First name<input name="first_name" value="${v("first_name")}" autocomplete="given-name"></label><label>Last name<input name="last_name" value="${v("last_name")}" autocomplete="family-name"></label></div>
<div class="g2"><label>Email<input name="email" type="email" value="${esc(profile?.email || user.email || "")}" autocomplete="email"></label><label>Mobile<input name="phone" value="${v("phone")}" inputmode="tel" autocomplete="tel"></label></div>

<fieldset><legend>Shipping address</legend><label>Street<input name="shipping_address" value="${esc(profile?.shipping_address || profile?.address_line1 || profile?.billing_address || "")}" autocomplete="shipping street-address"></label>
<div class="g3"><label>City<input name="shipping_city" value="${esc(profile?.shipping_city || profile?.city || "")}" autocomplete="shipping address-level2"></label><label>State<input name="shipping_state" value="${esc(profile?.shipping_state || profile?.state || "")}" autocomplete="shipping address-level1" maxlength="20"></label><label>ZIP<input name="shipping_zip" value="${esc(profile?.shipping_zip || profile?.zip || "")}" inputmode="numeric" autocomplete="shipping postal-code"></label></div></fieldset>
<fieldset><legend>Billing address</legend><label class="chk"><input type="checkbox" data-same ${(profile?.billing_address || "") === (profile?.shipping_address || "") ? "checked" : ""}> Same as shipping</label><div data-bill>
<label>Street<input name="billing_address" value="${v("billing_address")}" autocomplete="billing street-address"></label><div class="g3"><label>City<input name="billing_city" value="${v("billing_city")}"></label><label>State<input name="billing_state" value="${v("billing_state")}"></label><label>ZIP<input name="billing_zip" value="${v("billing_zip")}" inputmode="numeric"></label></div></div></fieldset>
<label>Order updates by<select name="communication_preference"><option value="email"${pref === "email" ? " selected" : ""}>Email</option><option value="text"${pref === "text" ? " selected" : ""}>Text</option><option value="both"${pref === "both" ? " selected" : ""}>Email and text</option></select></label>
<label class="chk"><input type="checkbox" name="marketing_opt_in" ${mk ? "checked" : ""}> Email me restocks, promotions and updates. Unsubscribe any time.</label>
<label class="chk"><input type="checkbox" name="sms_opt_in" ${profile?.sms_opt_in === true ? "checked" : ""}> <span>${esc(P.SMS_CONSENT)} <a href="privacy.html#texts">Privacy</a></span></label>
<button class="btn primary">Save profile</button><p class="notice" data-pstat hidden></p></form>`;
    const same = $("[data-same]"), bill = $("[data-bill]"); const sync = () => bill.hidden = same.checked; same.addEventListener("change", sync); sync();
    $("[data-form=profile]").addEventListener("submit", saveProfile);
  }
  async function saveProfile(e) {
    e.preventDefault(); const f = e.target, b = f.querySelector("button"), st = $("[data-pstat]"), g = n => String(f.elements[n]?.value || "").trim();
    const same = $("[data-same]").checked, now = new Date().toISOString(), opt = f.elements.marketing_opt_in.checked;
    const payload = { user_id: user.id, first_name: g("first_name"), last_name: g("last_name"), email: g("email") || user.email || "", phone: g("phone"),
      shipping_address: g("shipping_address"), shipping_city: g("shipping_city"), shipping_state: g("shipping_state"), shipping_zip: g("shipping_zip"),
      billing_address: same ? g("shipping_address") : g("billing_address"), billing_city: same ? g("shipping_city") : g("billing_city"), billing_state: same ? g("shipping_state") : g("billing_state"), billing_zip: same ? g("shipping_zip") : g("billing_zip"),
      account_status: "active" };
    if (f.elements.sms_opt_in?.checked && !P.usPhone(g("phone"))) { notice(st, "Add a 10-digit US mobile number to get texts, or uncheck the text box.", "err"); f.elements.phone.focus(); return; }
    b.disabled = true; b.textContent = "Saving…";
    try {
      let r = await P.client().from("customer_profiles").update(payload).eq("user_id", user.id).select("*").maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) { r = await P.client().from("customer_profiles").insert(payload).select("*").maybeSingle(); if (r.error) throw r.error; }
      profile = r.data || { ...profile, ...payload };
      const wasOpt = profile?.marketing_opt_in === true || String(profile?.marketing_opt_in) === "true";
      if (opt !== wasOpt) { const m = { marketing_opt_in: opt, marketing_opt_out: !opt, marketing_source: opt ? "account_preferences_opt_in" : "account_preferences_opt_out", ...(opt ? { marketing_opt_in_at: now, marketing_opt_out_at: null } : { marketing_opt_out_at: now }) }; const r2 = await P.client().from("customer_profiles").update(m).eq("user_id", user.id).select("*").maybeSingle(); if (!r2.error && r2.data) profile = r2.data; }
      const smsOn = !!f.elements.sms_opt_in?.checked, smsWas = profile?.sms_opt_in === true, ph = P.usPhone(g("phone"));
      if (smsOn !== smsWas || (smsOn && ph && P.usPhone(profile?.sms_phone) !== ph)) { const r4 = await P.client().rpc("pst_sms_consent", { p_on: smsOn, p_phone: ph || null, p_source: "account", p_text: smsOn ? P.SMS_CONSENT : null }); if (r4.error) throw r4.error; profile = { ...profile, sms_opt_in: smsOn, sms_phone: smsOn ? "+1" + ph : profile?.sms_phone }; }
      const cp = g("communication_preference"); if (cp && cp !== profile?.communication_preference) { const r3 = await P.client().from("customer_profiles").update({ communication_preference: cp }).eq("user_id", user.id).select("*").maybeSingle(); if (!r3.error && r3.data) profile = r3.data; }
      notice(st, "Profile saved.", "ok");
    } catch (err) { notice(st, "Couldn't save: " + (err.message || err), "err"); }
    finally { b.disabled = false; b.textContent = "Save profile"; }
  }
  async function paneAlerts(el) {
    el.innerHTML = `<h2 class="serif" style="font-size:2rem">Notifications</h2><div data-npanel><p class="muted small">Loading…</p></div>
<h3 class="serif" style="font-size:1.4rem;margin:30px 0 8px">The app</h3>
<div class="setrow"><div><b>Pep Shop Texas app</b><span>${P.isStandalone() ? "You're using the app. It opens on the shop and keeps you signed in." : "Add it to your Home Screen. It opens signed in, right on the shop."}</span></div>${P.isStandalone() ? "" : `<a class="btn ghost sm" href="install.html">Get the app</a>`}</div>
${admin ? `<div class="setrow"><div><b>Store owner</b><span>The owner app (orders, payments, products, customers, alerts) and the full admin dashboard. Add the owner app to your Home Screen from its page.</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary sm" href="owner.html">Owner app</a><a class="btn ghost sm" href="admin.html">Admin</a></div></div>` : ""}
<div class="setrow"><div><b>Signed in as</b><span>${esc(user.email)}</span></div><button class="btn ghost sm" type="button" data-signout>Sign out</button></div>
<details class="pwalt setpw" style="margin-top:14px"><summary>Set a new password</summary><form class="form" data-form="setpw"><p class="muted small">Optional. You can always sign in with an email code instead.</p><label class="pw">New password<input id="spw" name="password" type="password" autocomplete="new-password" minlength="10" required><button type="button" data-pw="spw" aria-label="Show password">Show</button></label><button class="btn ghost wide" type="submit">Save password</button><p class="notice" data-spmsg hidden role="status"></p></form></details>`;
    P.notifyPanel($("[data-npanel]", el), "customer");
    const sp = $("[data-form=setpw]", el); if (sp) { pwToggles(sp); sp.addEventListener("submit", async e => { e.preventDefault(); const m = $("[data-spmsg]", sp), b = sp.querySelector("button[type=submit]"); if (sp.password.value.length < 10) return notice(m, "Use at least 10 characters.", "err"); b.disabled = true; b.textContent = "Saving…";
      const { error } = await P.client().auth.updateUser({ password: sp.password.value }); b.disabled = false; b.textContent = "Save password";
      if (error) notice(m, "Couldn't save: " + error.message, "err"); else { sp.reset(); notice(m, "Password saved. You can use it or an email code.", "ok"); } }); }
  }
  async function reorder(ids, stat) {
    const want = ids.flatMap(id => items[id] || []);
    if (!want.length) return;
    const all = await P.products(); const cart = P.readCart(); let added = 0, skipped = 0;
    want.forEach(x => {
      const p = all.find(q => q.id === x.product_id || q.product_key === x.product_key || q.product_key === String(x.product_id || "").replace(/^(?:product|stack):/i, ""));
      const n = p ? P.qty(p) : 0; if (!p || n <= 0) { skipped++; return; }
      const e = cart.find(c => c.key === p.product_key), have = e?.quantity || 0, add = Math.max(0, Math.min(Number(x.quantity || 1), n - have));
      if (!add) { skipped++; return; } if (e) e.quantity += add; else cart.push({ key: p.product_key, quantity: add }); added += add;
    });
    if (!added) { if (stat) { stat.textContent = "None of those items are in stock right now."; stat.className = "status bad"; } return; }
    P.writeCart(cart); P.refreshCount();
    P.miniBag(want[0] && (all.find(q => q.product_key === want[0].product_key) || {}).product_key); // stays on this page, bag slides in
    if (skipped) setTimeout(() => P.toast(`${skipped} item${skipped > 1 ? "s were" : " was"} out of stock and skipped.`), 400);
  }
  async function accountClick(e) {
    const t = e.target;
    const tab = t.closest("[data-tab]"); if (tab) { showTab(tab.dataset.tab); return; }
    const op = t.closest("[data-open]"); if (op) { const b = $("#o-" + op.dataset.open); b.hidden = !b.hidden; op.setAttribute("aria-expanded", !b.hidden); return; }
    const ro = t.closest("[data-reorder]"); if (ro) { reorder([ro.dataset.reorder], $("[data-ostat]")); return; }
    const ag = t.closest("[data-again]"); if (ag) { const all = await P.products(); const p = all.find(q => q.product_key === ag.dataset.again || q.id === ag.dataset.pid); if (p && P.qty(p) > 0) { P.addAndShow(p.product_key, Math.max(1, Math.min(Number(ag.dataset.q || 1), P.qty(p)))); ag.innerHTML = `${P.icon("check", 14)} Added`; setTimeout(() => { ag.innerHTML = `${P.icon("plus", 14)} Add to bag`; }, 2200); } else if (p) P.openAvailability(p); else P.toast("That item isn't listed right now."); return; }
    const sd = t.closest("[data-sent]"); if (sd) { sd.disabled = true; sd.textContent = "Sending…"; const ok = await P.paidNotice(sd.dataset.sent); const m = P.store.get("pst_paid_sent", {}); m[sd.dataset.sent] = 1; P.store.set("pst_paid_sent", m); sd.textContent = "✓ Payment sent"; P.toast(ok ? "Thanks! Jimmie's been notified." : "Thanks! We'll match it to your order."); return; }
    const pu = t.closest("[data-push]"); if (pu) { try { if (pu.dataset.push === "on") await P.enablePush("customer"); else await P.disablePush(); showTab("alerts"); } catch (err) { P.toast(err.message); } return; }
    if (t.closest("[data-signout]")) { (localStorage.removeItem("pst-shelf-cache"), await P.client().auth.signOut()); location.href = "index.html"; }
  }

  /* ---------------- SIGN IN: email code first (no password to remember), password as the backup ---------------- */
  const LAST = "ppu-last-email";
  const remember = e => { try { localStorage.setItem(LAST, String(e || "").trim().toLowerCase()); } catch {} };
  const lastEmail = () => { try { return localStorage.getItem(LAST) || ""; } catch { return ""; } };
  function login() {
    const to = safeRedirect(P.params.get("redirect"), "account.html");
    const cf = $("[data-form=code]"), vf = $("[data-form=verify]"), cmsg = $("[data-cmsg]"), vmsg = $("[data-vmsg]"), pwalt = $("[data-pwalt]"), pf = $("[data-form=login]");
    if (P.params.get("password") === "reset") { pwalt.open = true; notice($("[data-msg]"), "Password updated. Sign in with your new password.", "ok"); }
    if (P.params.get("app") === "1" || P.isStandalone()) { // first launch of the Home Screen app: sign in once, stay signed in
      const card = $(".authcard"); card.classList.add("appwelcome");
      card.querySelector("[data-akick]").textContent = "Welcome to the app";
      card.querySelector("[data-ah1]").textContent = "Sign in once";
      card.querySelector("[data-asub]").textContent = "You'll stay signed in on this phone. Enter your email and we'll send you a code.";
      card.insertAdjacentHTML("beforeend", `<button type="button" class="linkish small appguest" data-guest>Browse without signing in</button>`);
      card.querySelector("[data-guest]").addEventListener("click", () => { sessionStorage.setItem("pst_app_guest", "1"); location.replace(to === "account.html" ? "catalog.html" : to); });
    }
    $$("a[data-keep-redirect]").forEach(a => { if (P.params.get("redirect")) a.href += (a.href.includes("?") ? "&" : "?") + "redirect=" + encodeURIComponent(P.params.get("redirect")); });
    P.getUser().then(u => { if (u && !P.params.get("switch")) location.replace(to); });
    const pre = (P.params.get("email") || lastEmail()).trim();
    if (pre) { cf.email.value = pre; pf.email.value = pre; }
    cf.email.addEventListener("input", () => { if (!pf.email.value || pf.email.dataset.sync) { pf.email.value = cf.email.value; pf.email.dataset.sync = "1"; } });
    let email = "";
    const h1 = $("[data-ah1]"), sub = $("[data-asub]"), more = $("[data-amore]"), first = { h1: h1.textContent, sub: sub.textContent };
    const WAIT = "pst-code-wait", wait = v => { try { v ? localStorage.setItem(WAIT, JSON.stringify(v)) : localStorage.removeItem(WAIT); } catch {} };
    const step = n => { // 1 = enter email, 2 = enter the code (one thing to do at a time)
      cf.hidden = n !== 1; vf.hidden = n !== 2; more.hidden = n !== 1;
      window.__holdReload = n === 2; // never swap in a new site version while someone is waiting on a code
      if (n === 2) wait({ email, t: Date.now() }); else wait(null);
      if (n === 2) { h1.textContent = "Check your email"; sub.innerHTML = `We sent a 6-digit code to <b>${esc(email)}</b>Type it below, or open the email and tap the gold <span style="font-weight:700;color:var(--ink)">Sign me in</span> button. You can leave this page to check your email. It'll still be here when you come back.`; }
      else { h1.textContent = first.h1; sub.textContent = first.sub; }
    };
    const send = async (btn) => {
      const lbl = btn.textContent; btn.disabled = true; btn.textContent = "Sending…"; notice(cmsg, ""); notice(vmsg, "");
      try {
        const { error: oe } = await P.client().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: base() + to } });
        const d = !oe ? { ok: true } : { ok: false, reason: /signup|not allowed|not found|no user/i.test(oe.message) ? "no_account" : /rate|seconds|too many/i.test(oe.message) || oe.status === 429 ? "too_many" : /invalid.*email|email.*invalid/i.test(oe.message) ? "bad_email" : "error" };
        if (d.ok) { remember(email); step(2); vf.code.value = ""; setTimeout(() => vf.code.focus(), 50); if (btn.dataset.resend !== undefined) notice(vmsg, "New code sent. Use the newest one.", "ok"); return; }
        const m = d.reason === "no_account" ? `No account uses <b>${esc(email)}</b>. Check the spelling, or <a href="register.html?email=${encodeURIComponent(email)}">create an account</a>.`
          : d.reason === "too_many" ? "A code was just sent. Use the newest one in your email, or wait a minute and try again."
          : d.reason === "bad_email" ? "That doesn't look like an email address." : "Couldn't send the code. Try again, or sign in with your password below.";
        const box = vf.hidden ? cmsg : vmsg; notice(box, "", "err"); box.hidden = false; box.innerHTML = m; box.className = "notice err";
      } catch { notice(vf.hidden ? cmsg : vmsg, "Couldn't reach the shop. Check your connection and try again.", "err"); }
      finally { btn.disabled = false; btn.textContent = lbl; }
    };
    cf.addEventListener("submit", e => { e.preventDefault(); email = cf.email.value.trim().toLowerCase(); send(cf.querySelector("button[type=submit]")); });
    try { const w = JSON.parse(localStorage.getItem(WAIT) || "null"), pe = (P.params.get("email") || "").trim().toLowerCase();
      if (w && w.email && Date.now() - w.t < 20 * 60000 && (!pe || pe === w.email)) { email = w.email; cf.email.value = email; step(2); } else if (w) wait(null); } catch {}
    vf.querySelector("[data-resend]").addEventListener("click", e => send(e.currentTarget));
    vf.querySelector("[data-other]").addEventListener("click", () => { step(1); notice(cmsg, ""); notice(vmsg, ""); cf.email.focus(); cf.email.select(); });
    let busy = false;
    const verify = async () => {
      const code = vf.code.value.replace(/\D/g, ""); if (code.length < 6 || busy) return; busy = true;
      const b = vf.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Signing in…"; notice(vmsg, "");
      let { error } = await P.client().auth.verifyOtp({ email, token: code, type: "email" });
      if (error) ({ error } = await P.client().auth.verifyOtp({ email, token: code, type: "magiclink" }));
      if (!error) { remember(email); wait(null); location.href = to; return; }
      busy = false; b.disabled = false; b.textContent = "Sign in";
      notice(vmsg, /expired|invalid/i.test(error.message) ? "That code didn't work. It may be mistyped or expired. Check the newest email, or send a new code." : error.message, "err");
    };
    let vt = 0; // sign in once the code is typed or pasted (6 or 8 digits, depending on the project)
    vf.code.addEventListener("input", () => { vf.code.value = vf.code.value.replace(/\D/g, "").slice(0, 8); clearTimeout(vt); const n = vf.code.value.length; if (n === 8) verify(); else if (n === 6) vt = setTimeout(verify, 700); });
    vf.addEventListener("submit", e => { e.preventDefault(); verify(); });
    loginPw(to);
  }
  /* ---------------- SIGN IN ---------------- */
  function loginPw(to) {
    const f = $("[data-form=login]"), msg = $("[data-msg]");
    pwToggles(f);
    f.addEventListener("submit", async e => {
      e.preventDefault(); const b = f.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Signing in…"; notice(msg, "");
      const { error } = await P.client().auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) { notice(msg, /invalid/i.test(error.message) ? "That email and password don't match. Try again or reset your password." : error.message, "err"); b.disabled = false; b.textContent = "Sign in"; return; }
      remember(f.email.value); location.href = to;
    });
  }
  /* ---------------- REGISTER (same sign-up data + welcome email as before) ---------------- */
  function register() {
    const f = $("[data-form=register]"), msg = $("[data-msg]"); pwToggles(f);
    if (P.params.get("email")) f.email.value = P.params.get("email"); if (P.params.get("news") === "1") f.marketing_opt_in.checked = true;
    const same = f.same_as_shipping, bill = $("[data-bill]"); const sync = () => bill.hidden = same.checked; same.addEventListener("change", sync); sync();
    f.addEventListener("submit", async e => {
      e.preventDefault(); const b = f.querySelector("button[type=submit]"), v = n => String(f.elements[n]?.value || "").trim();
      const email = v("email").toLowerCase(), pw = f.password.value, mk = f.marketing_opt_in.checked;
      const sh = { shipping_address: v("shipping_address"), shipping_city: v("shipping_city"), shipping_state: v("shipping_state"), shipping_zip: v("shipping_zip") };
      const data = { first_name: v("first_name"), last_name: v("last_name"), email, phone: v("phone"), research_role: v("research_role"),
        billing_address: same.checked ? sh.shipping_address : v("billing_address"), billing_city: same.checked ? sh.shipping_city : v("billing_city"), billing_state: same.checked ? sh.shipping_state : v("billing_state"), billing_zip: same.checked ? sh.shipping_zip : v("billing_zip"),
        ...sh, marketing_opt_in: mk, marketing_opt_out: false, marketing_source: mk ? "registration" : null };
      b.disabled = true; b.textContent = "Creating account…"; notice(msg, "");
      try {
        const { error } = await P.client().auth.signUp({ email, password: pw, options: { emailRedirectTo: "https://www.pepshoptexas.com/login.html", data } });
        if (error) throw error;
        P.track("signup");
        try { await fetch(`${P.CFG.url}/functions/v1/${P.CFG.emailFn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${P.CFG.key}` }, body: JSON.stringify({ type: "account_created", to: email, customer_email: email, customer_name: [data.first_name, data.last_name].filter(Boolean).join(" "), ...data }) }); } catch {}
        f.innerHTML = `<div class="okmsg">${P.icon("check", 34)}<h2 class="serif">Check your email</h2><p class="muted">We sent a confirmation link to <b style="color:var(--ink)">${esc(email)}</b>. Tap it, then sign in. Your bag will be waiting.</p><a class="btn primary" href="login.html?redirect=cart.html">Go to sign in</a></div>`;
      } catch (err) { notice(msg, err.message || "Something went wrong creating the account.", "err"); b.disabled = false; b.textContent = "Create account"; }
    });
  }
  /* ---------------- PASSWORD ---------------- */
  function forgot() {
    const f = $("[data-form=forgot]"), msg = $("[data-msg]"), cl = $("[data-codelink]");
    if (cl && lastEmail()) cl.href = "login.html?email=" + encodeURIComponent(lastEmail());
    f.addEventListener("submit", async e => {
      e.preventDefault(); const b = f.querySelector("button"); b.disabled = true; b.textContent = "Sending…";
      try { const { error } = await P.client().auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: base() + "reset-password.html" }); if (error) throw error; notice(msg, "If that email has an account, a reset link is on its way. Check your inbox and spam folder.", "ok"); f.reset(); }
      catch (err) { notice(msg, "Couldn't send the reset email: " + (err.message || err), "err"); }
      finally { b.disabled = false; b.textContent = "Send reset link"; }
    });
  }
  function reset() {
    const f = $("[data-form=reset]"), msg = $("[data-msg]"); let ready = false; pwToggles(f);
    const ok = () => { ready = true; f.hidden = false; notice(msg, "Link confirmed. Choose a new password.", "ok"); };
    P.client().auth.onAuthStateChange((ev, s) => { if ((ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN") && s?.user) ok(); });
    setTimeout(async () => { const { data } = await P.client().auth.getSession(); if (data?.session?.user) ok(); else if (!ready) notice(msg, "Open this page from the reset link in your email.", "err"); }, 700);
    f.addEventListener("submit", async e => {
      e.preventDefault(); const pw = f.password.value, b = f.querySelector("button[type=submit]");
      if (!ready) return notice(msg, "Open this page from the reset link in your email.", "err");
      if (pw.length < 10) return notice(msg, "Use at least 10 characters.", "err");
      if (pw !== f.confirm.value) return notice(msg, "Those passwords don't match.", "err");
      b.disabled = true; b.textContent = "Saving…";
      try { const { error } = await P.client().auth.updateUser({ password: pw }); if (error) throw error; (localStorage.removeItem("pst-shelf-cache"), await P.client().auth.signOut()); location.href = "login.html?password=reset"; }
      catch (err) { notice(msg, "Couldn't update the password: " + (err.message || err), "err"); b.disabled = false; b.textContent = "Save new password"; }
    });
  }
  /* ---------------- BULK (same RPC) ---------------- */
  function bulk() {
    const f = $("[data-form=bulk]"), msg = $("[data-msg]");
    P.products().then(all => { const dl = $("#bulkproducts"); if (dl) dl.innerHTML = P.groups(all).map(g => `<option value="${esc(g[0].display_name)}">`).join(""); }).catch(() => {});
    f.addEventListener("submit", async e => {
      e.preventDefault(); const b = f.querySelector("button[type=submit]"), v = n => f.elements[n].value; b.disabled = true; b.textContent = "Sending…";
      try {
        const { data, error } = await P.client().rpc("pst_submit_bulk_request", { p_name: v("name"), p_company: v("company"), p_email: v("email"), p_phone: v("phone"), p_product: v("product"), p_strength: v("strength"), p_kits: Number(v("kits")), p_requirements: v("requirements"), p_testing_path: v("testing"), p_acknowledgment: f.ack.checked });
        if (error) throw error;
        f.innerHTML = `<div class="okmsg">${P.icon("check", 34)}<h2 class="serif">Request received</h2><p>Your reference number is <b style="color:var(--gold2)">PST-B${String(data).padStart(6, "0")}</b>.</p><p class="muted">We'll review it and email you. No order or payment has been created.</p><a class="btn ghost" href="catalog.html">Back to the collection</a></div>`;
      } catch (err) { notice(msg, err.message || "We couldn't send your request.", "err"); b.disabled = false; b.textContent = "Send bulk request"; }
    });
  }
  /* ---------------- LAB REPORTS list ---------------- */
  async function testing() {
    const el = $("[data-coas]"); if (!el) return;
    try {
      const all = await P.products(), w = all.filter(p => P.coaHref(p));
      el.innerHTML = w.length ? w.map(p => `<a class="coac" href="${esc(P.coaHref(p))}" target="_blank" rel="noopener">${P.vial(p, 34)}<div><b>${esc(p.display_name)} ${esc(p.strength || "")}</b><span>${esc(p.coa_label || "Certificate of analysis")} · PDF</span></div></a>`).join("") : `<p class="muted">Reports are being uploaded.</p>`;
      const n = $("[data-coacount]"); if (n) n.textContent = w.length;
    } catch { el.innerHTML = `<p class="muted">Couldn't load reports right now.</p>`; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const pg = document.body.dataset.page;
    ({ account, login, register, forgot, reset, bulk, testing }[pg] || (() => {}))();
  });
})();
