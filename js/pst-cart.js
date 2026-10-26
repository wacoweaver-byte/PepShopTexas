/* Pep Shop Texas · Black Label: bag + checkout (Venmo first, pickup first) */
(function () {
  "use strict";
  const P = window.PST, { $, esc, money, round } = P;
  const ss = { get: (k, d) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  let delivery = P.store.get("pst_delivery", "pickup"), discount = ss.get("pst_discount", null), applyCredit = false, pay = ss.get("pst_pay", ""), notes = "", smsOn = false, smsPhone = "", smsCustom = false;
  const picks = {}, suggest = {};
  let allP = [];
  /* new bag items default to an Auto reminder seeded from the product's typical reorder time */
  async function primeReminders() {
    const rem = P.reminders();
    for (const r of rows) { if (!r.product) continue; suggest[r.key] = await P.suggestDays(r.product); if (!(r.key in rem)) P.setReminder(r.key, suggest[r.key].d, true, !!suggest[r.key].perVial); }
  }
  let bo = false, rows = [], user = null, profile = null, methods = [], credit = 0, frees = [], choices = [], busy = false;
  const host = () => $("[data-cart]");

  function totals() {
    const live = rows.filter(r => r.product);
    const sub = round(live.reduce((s, r) => s + P.unitPrice(r.product) * r.quantity, 0));
    const ship = !live.length || delivery === "pickup" || sub >= P.CFG.freeShip ? 0 : P.CFG.shipRate;
    const pm = methods.find(m => m.label === pay), pd = P.payDiscount(sub, pm, discount);
    const disc = P.discountAmount(sub, discount), total = Math.max(0, round(sub + ship - disc - pd));
    const cr = applyCredit ? Math.min(credit, total) : 0;
    return { sub, ship, disc, pd, pm, total, cr, due: Math.max(0, round(total - cr)) };
  }
  // with backorders on, only a fully sold-out item blocks checkout; extra quantity goes on backorder
  const blocked = () => rows.some(r => !r.product || P.qty(r.product) <= 0 || (!bo && P.qty(r.product) < r.quantity));

  function lineHtml(r) {
    const p = r.product, rem = P.reminders()[r.key] || { d: 0, a: false }, sg = suggest[r.key] || { d: 28 }, autoD = sg.perVial ? Math.min(365, sg.d * Math.max(1, r.quantity)) : sg.d;
    if (!p) return `<div class="cline"><div class="ci"></div><div><h3>Item no longer listed</h3><p class="warn">This product isn't in the catalog anymore.</p><div class="row"><button class="rm" type="button" data-rm="${esc(r.key)}">Remove</button></div></div><span></span></div>`;
    const n = P.qty(p), t = P.titleParts(p);
    const warn = n <= 0 ? `<p class="warn">Sold out${p.incoming_quantity ? " · restock on the way" : ""}. Remove it to check out.</p>` : r.quantity > n ? (bo ? `<p class="warn bo">${n} ready now · ${r.quantity - n} on backorder. Backordered vials go out as soon as they arrive.</p>` : `<p class="warn">Only ${n} available. Lower the quantity to check out.</p>`) : "";
    return `<div class="cline"><a class="ci" href="${P.productUrl(p)}" aria-hidden="true" tabindex="-1">${P.vial(p, 40)}</a>
<div><a href="${P.productUrl(p)}"><h3>${esc(t.main)}</h3></a><span class="meta">${esc(p.strength || "")} · ${money(P.unitPrice(p))} each</span>${warn}
<div class="row"><div class="qty sm"><button type="button" data-cq="${esc(r.key)}" data-d="-1" aria-label="Fewer">−</button><span>${r.quantity}</span><button type="button" data-cq="${esc(r.key)}" data-d="1" aria-label="More"${!bo && r.quantity >= n ? " disabled" : ""}>+</button></div><button class="rm" type="button" data-rm="${esc(r.key)}">Remove</button></div></div>
<b class="lt">${money(P.unitPrice(p) * r.quantity)}</b>
<div class="remind"><span>${P.icon("bell", 14)} Running-low reminder</span><div class="chips" role="group" aria-label="Reorder reminder for ${esc(p.display_name)}">
<button type="button" class="auto" data-rem="${esc(r.key)}" data-days="${sg.d}" data-auto="1"${sg.perVial ? ' data-pv="1"' : ""} aria-pressed="${rem.a}" title="Starts at ${Math.max(1, Math.round(autoD / 7))} week${Math.max(1, Math.round(autoD / 7)) === 1 ? "" : "s"}${sg.perVial ? " (how long this many vials usually last)" : sg.basis === "typical" ? " (typical for this item)" : ""}, then learns from your reorders">Auto · ~${Math.max(1, Math.round(autoD / 7))} wks</button>
${P.REMIND.slice(1).map(([d, l]) => `<button type="button" data-rem="${esc(r.key)}" data-days="${d}" aria-pressed="${!rem.a && rem.d === d}">${l}</button>`).join("")}<button type="button" data-rem="${esc(r.key)}" data-days="0" aria-pressed="${!rem.d}">Off</button></div></div></div>`;
  }

  function sideHtml() {
    const t = totals(), live = rows.filter(r => r.product);
    const sum = `<div class="sum"><div class="r"><span>Subtotal</span><b>${money(t.sub)}</b></div>
${t.disc ? `<div class="r disc"><span>Code ${esc(discount?.code || "")}</span><b>−${money(t.disc)}</b></div>` : ""}
${t.pd ? `<div class="r disc"><span>${esc(P.payLabel(t.pm))} savings · ${t.pm.pct}%</span><b>−${money(t.pd)}</b></div>` : ""}
<div class="r"><span>${delivery === "pickup" ? "Local pickup" : "Shipping"}</span><b>${t.ship ? money(t.ship) : "Free"}</b></div>
${t.cr ? `<div class="r disc"><span>Store credit</span><b>−${money(t.cr)}</b></div>` : ""}
<div class="r tot"><span>Total</span><b>${money(t.due)}</b></div>
${delivery === "ship" && live.length ? `<div class="ship"><div class="shipbar"><i style="width:${Math.min(100, t.sub / P.CFG.freeShip * 100)}%"></i></div><span>${t.ship ? `${money(P.CFG.freeShip - t.sub)} away from free shipping` : "You've got free shipping"}</span></div>` : ""}</div>`;
    if (!user) return `<div class="box">${sum}</div><div class="signin"><h3 class="serif" style="font-size:1.5rem">Sign in to check out</h3><p class="muted small">Orders are saved to your account so you can track them and reorder in a tap.</p>
<a class="btn primary wide" href="login.html?redirect=cart.html">Sign in</a><a class="btn ghost wide" style="margin-top:8px" href="register.html">Create an account</a></div>`;
    const addr = [profile?.shipping_address || profile?.address1 || profile?.address, [profile?.shipping_city || profile?.city, profile?.shipping_state || profile?.state, profile?.shipping_zip || profile?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const venmo = methods.find(m => /venmo/i.test(m.id + m.label)), others = methods.filter(m => m !== venmo);
    if (!pay || !methods.some(m => m.label === pay)) pay = venmo ? venmo.label : methods[0]?.label || "";
    const pmRow = (m, best) => `<label><input type="radio" name="pm" value="${esc(m.label)}" ${pay === m.label ? "checked" : ""}>${best ? `<span class="vlogo"><svg viewBox="0 0 48 48" width="18" height="18"><path d="M33.6 11c1 1.6 1.4 3.3 1.4 5.4 0 6.7-5.7 15.4-10.4 21.6H13.9L9.6 12.4l9.4-.9 2.3 18.4c2.1-3.5 4.7-9 4.7-12.7 0-2-.3-3.4-.9-4.6l8.5-1.6z" fill="#fff"/></svg></span>` : ""}<span>${esc(P.payLabel(m))}</span>${m.pct ? `<span class="best">${m.pct}% off${discount ? " · not with codes" : ""}</span>` : best ? '<span class="best">Fastest · one tap</span>' : ""}</label>`;
    return `<div class="box"><h3>Delivery</h3><div class="dpick">
<label><input type="radio" name="dl" value="pickup" ${delivery === "pickup" ? "checked" : ""}><span><b>Local pickup</b><small>Free. We'll text you when it's ready.</small></span></label>
<label><input type="radio" name="dl" value="ship" ${delivery === "ship" ? "checked" : ""}><span><b>Ship it</b><small>${money(P.CFG.shipRate)} flat, free over ${money(P.CFG.freeShip)}. USPS Priority, about 4 days.</small></span></label></div>
${delivery === "ship" ? `<p class="addr" style="margin:10px 0 0">${addr ? `Ships to: ${esc(addr)} · <a href="account.html#profile">Change</a>` : `<span style="color:var(--bad)">No shipping address on your account yet.</span> <a href="account.html#profile">Add one</a>`}</p>` : ""}</div>
${frees.length || choices.length ? `<div class="box"><h3>Your rewards</h3>${frees.map(f => `<div class="reward"><b>${esc(f.name)} · FREE</b><br><span class="muted small">${esc(f.title || "Promotion")} · qty ${f.qty}. Awarded when payment is confirmed, while supplies last.</span></div>`).join("")}
${choices.map(c => `<div class="reward"><b>${esc(c.title)}</b><br><span class="muted small">Pick ${c.qty} free vial${c.qty > 1 ? "s" : ""}.</span>${c.options.length ? `<select data-choice="${esc(c.id)}" aria-label="${esc(c.title)}"><option value="">Choose your free vial</option>${c.options.map(o => `<option value="${esc(o.product_key)}"${picks[c.id] === o.product_key ? " selected" : ""}>${esc([o.display_name, o.strength].filter(Boolean).join(" · "))}</option>`).join("")}</select>` : `<p class="muted small">All eligible rewards are out right now.</p>`}</div>`).join("")}</div>` : ""}
<div class="box"><h3>Discount${credit > 0 ? " &amp; credit" : ""}</h3>
${discount ? `<div class="promo"><input value="${esc(discount.code)}" readonly aria-label="Applied code"><button class="btn ghost sm" type="button" data-act3="rmcode">Remove</button></div><p class="status good">${esc(discount.code)} applied.</p>`
        : `<form class="promo" data-codeform><input name="code" placeholder="Discount code" autocomplete="off" aria-label="Discount code"><button class="btn ghost sm">Apply</button></form><p class="status" data-codestat></p>`}
${credit > 0 ? `<label class="toggle" style="margin-top:10px"><input type="checkbox" data-credit ${applyCredit ? "checked" : ""}> Use my ${money(credit)} store credit</label>` : ""}</div>
<div class="box"><h3>Payment</h3><div class="pm">${venmo ? pmRow(venmo, true) : ""}${others.length ? (venmo ? `<details${pay && pay !== venmo?.label ? " open" : ""}><summary>Other ways to pay</summary><div class="pm">${others.map(m => pmRow(m)).join("")}</div></details>` : others.map(m => pmRow(m)).join("")) : ""}</div>
<p class="muted small" style="margin:10px 0 0">${pay && venmo && pay === venmo.label ? "After you place the order, Venmo opens with the amount and your order number filled in." : "Payment instructions are emailed to you right after you place the order."}</p></div>
<div class="box">${sum}
<label class="form" style="display:block"><span class="sr">Order notes</span><textarea data-notes placeholder="Notes for Pep Shop Texas (optional)" style="width:100%;background:var(--bg);border:1px solid var(--line2);padding:10px;min-height:60px;font-size:15px;border-radius:4px">${esc(notes)}</textarea></label>
${smsBox()}
<button class="btn primary wide" type="button" data-place ${!live.length || blocked() ? "disabled" : ""} style="margin-top:12px">${blocked() ? "Update your bag to continue" : `Place order · ${money(t.due)}`}</button>
<p class="status" data-placestat role="status"></p><p class="muted small" style="text-align:center;margin:4px 0 0">For research use only. Nothing ships until payment is confirmed.</p></div>`;
  }

  async function draw() {
    const el = host();
    if (!rows.length) {
      el.innerHTML = `<div class="empty">${P.icon("bag", 34)}<h2 class="serif" style="font-size:2rem;color:var(--ink)">Your bag is empty</h2><p>Browse the collection and add what you need.</p><a class="btn primary" href="catalog.html">Browse the collection</a>${user ? ` <a class="btn ghost" href="account.html">Reorder from past orders</a>` : ""}</div>`;
      return;
    }
    let notice = sessionStorage.getItem("pst_reorder_notice_v1"); if (notice) sessionStorage.removeItem("pst_reorder_notice_v1");
    if (!notice && P.params.get("from") === "mine" && !draw.once) notice = "Added from My products. Change the quantity or add anything else below.";
    draw.once = true;
    el.innerHTML = `${notice ? `<p class="notice ok" style="margin-bottom:14px">${esc(notice)}</p>` : ""}<div class="cartgrid"><div><div data-lines>${rows.map(lineHtml).join("")}</div>
<p class="muted small" style="margin-top:12px">${P.icon("bell", 14)} One alert when a vial is likely running low. Auto starts with a typical time and learns from how often you reorder. No dosing info is ever asked.</p>${addMore()}</div><aside class="side" data-side>${sideHtml()}</aside></div>`;
  }
  /* "add to this order" strip: in-stock items not already in the bag, closest research focus first */
  function addMore() {
    if (!allP.length) return "";
    const inBag = new Set(rows.map(r => r.product?.display_name)), fs = new Set(rows.flatMap(r => r.product ? P.focuses(r.product) : []));
    const gs = P.groups(allP).filter(g => P.gIn(g) && !inBag.has(g[0].display_name)).sort((a, b) => (P.focuses(b[0]).some(f => fs.has(f)) - P.focuses(a[0]).some(f => fs.has(f))) || P.cmpProduct(a[0], b[0])).slice(0, 10);
    if (!gs.length) return "";
    return `<section class="addmore" aria-label="Add to this order"><h3 class="kick">Add to this order</h3><div class="row">${gs.map(g => { const p = P.gBest(g); return `<div class="amc">${P.vial(p, 40)}<b>${esc(P.titleParts(p).main)}</b><span>${g.length > 1 ? "from " : ""}${money(P.gMin(g))}</span>${g.length > 1 ? `<a class="btn ghost sm" href="${P.productUrl(p)}">Choose</a>` : `<button class="btn ghost sm" type="button" data-addmore="${esc(p.product_key)}">+ Add</button>`}</div>`; }).join("")}</div></section>`;
  }
  // v5.8: optional promo-text opt-in at checkout (never pre-checked, never required). Hidden once they've said yes.
  function smsBox() {
    if (!user || !profile || profile.sms_opt_in === true) return "";
    const has = P.usPhone(profile.phone);
    return `<div class="smsopt"><label class="chk"><input type="checkbox" data-sms ${smsOn ? "checked" : ""}><span>${esc(P.SMS_CONSENT)} <a href="privacy.html#texts" target="_blank" rel="noopener">Privacy</a></span></label>
${smsOn ? (has && !smsCustom ? `<p class="muted small">Texts go to ${esc(P.fmtPhone(profile.phone))}. <button type="button" class="linkish" data-smsedit>Use a different number</button></p>` : `<input data-smsph type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number" value="${esc(smsPhone)}" aria-label="Mobile number for texts">`) : ""}</div>`;
  }
  const redrawSide = () => { const s = $("[data-side]"); if (s) s.innerHTML = sideHtml(); };

  async function load() {
    const el = host();
    el.innerHTML = `<div class="cartgrid"><div>${[1, 2].map(() => `<div class="cline"><div class="ci skel" style="height:70px"></div><div><div class="skel" style="height:18px;width:60%"></div><div class="skel" style="height:12px;width:40%;margin-top:8px"></div></div><span></span></div>`).join("")}</div></div>`;
    try {
      [rows, user, allP] = await Promise.all([P.cartRows(), P.getUser(), P.products()]);
      await primeReminders();
      if (user) {
        [profile, methods] = await Promise.all([P.getProfile(user), P.paymentMethods()]);
        credit = await P.creditBalance().catch(() => 0);
        [frees, choices] = await Promise.all([P.freeVials(rows).catch(() => []), P.choiceRewards(rows).catch(() => [])]);
      }
      bo = await P.backordersOn().catch(() => false);
      draw();
    } catch (err) { el.innerHTML = `<p class="empty">Couldn't load your bag. ${esc(err.message || "")}</p>`; }
  }

  async function place(btn) {
    if (busy) return; busy = true; P.track("checkout_start", { value: totals().due });
    const stat = $("[data-placestat]"); btn.disabled = true; btn.textContent = "Placing order…"; stat.textContent = ""; stat.className = "status";
    try {
      if (delivery === "ship" && !(profile?.shipping_address || profile?.address1 || profile?.address)) throw new Error("Add a shipping address in your account, or choose local pickup.");
      const smsTo = smsOn ? (P.usPhone(profile?.phone) && !smsCustom ? P.usPhone(profile.phone) : P.usPhone(smsPhone)) : "";
      if (smsOn && !smsTo) throw new Error("Enter a 10-digit mobile number for texts, or uncheck the text box.");
      const rewardChoices = [...document.querySelectorAll("[data-choice]")].map(s => ({ promotionId: s.dataset.choice, productKey: s.value }));
      const res = await P.submitOrder({ paymentLabel: pay, payMethod: methods.find(m => m.label === pay) || null, delivery, discount, applyCredit, rewardChoices, notes: notes.trim() });
      ss.set("pst_discount", null); P.store.set("pst_delivery", delivery);
      if (smsTo) P.client().rpc("pst_sms_consent", { p_on: true, p_phone: smsTo, p_source: "checkout", p_text: P.SMS_CONSENT }).then(r => { if (!r.error && profile) profile.sms_opt_in = true; });
      placed(res);
    } catch (err) {
      stat.textContent = err.message || "That didn't go through. Try again."; stat.className = "status bad";
      btn.disabled = false; btn.textContent = `Place order · ${money(totals().due)}`;
    } finally { busy = false; }
  }

  async function placed(r) {
    const isV = /venmo/i.test(r.method || ""), link = P.venmoLink(r.due, r.no);
    window.scrollTo(0, 0); const bt = $("[data-bagtitle]"); if (bt) bt.hidden = true; document.title = `Order ${r.no} | Pep Shop Texas`;
    host().innerHTML = `<div class="placed"><div class="okc">${P.icon("check", 30)}</div><span class="kick">Order received</span><h1 class="serif">Order ${esc(r.no)}</h1>
<p class="muted">${r.emailed ? `A confirmation is on its way to ${esc(r.email)}.` : "Your order is saved. The confirmation email didn't send, but we can see your order."}</p>
${r.due > 0 ? `<div data-paycard><div class="paycard"><p class="muted">Loading payment details…</p></div></div>` : ""}
${r.due > 0 ? `<p class="holdnote">${P.icon("clock", 15)} We're holding your items until <b>${new Date(r.deadline).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</b>. Pay within 24 hours, or the order is cancelled automatically and the items go back on the shelf.</p>` : ""}
${r.backorder?.length ? `<p class="holdnote">${P.icon("box", 15)} ${r.backorder.map(esc).join("<br>")}. Backordered vials go out as soon as they arrive.</p>` : ""}
<ol class="track"><li class="ok"><b>Order placed</b><span>Just now</span></li><li class="cur"><b>Payment confirmed</b><span>We match it to your order number</span></li><li><b>${r.delivery === "pickup" ? "Ready for pickup" : "Packed"}</b><span>${r.delivery === "pickup" ? "We'll text you where and when" : "Goes out the same night"}</span></li><li><b>${r.delivery === "pickup" ? "Picked up" : "Shipped"}</b><span>${r.delivery === "pickup" ? "" : "Tracking in your account"}</span></li></ol>
<div data-alertcta></div>
<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn ghost" href="account.html">Track this order</a><a class="btn ghost" href="catalog.html">Keep browsing</a></div></div>`;
    if (r.due > 0) P.payCard(r.method, r.due, r.no, r.id).then(h => { const el = $("[data-paycard]"); if (el) el.innerHTML = h; }).catch(() => {});
    const cta = $("[data-alertcta]"), st = await P.pushState().catch(() => "unsupported");
    if (st === "off" || st === "needs-install") {
      cta.innerHTML = `<div class="alertcta">${P.icon("bell", 26)}<b>Get a ping when it's confirmed</b><span>${st === "needs-install" ? "Add Pep Shop Texas to your Home Screen to get order alerts on your iPhone." : "Payment confirmed, ready for pickup, shipped. One alert each."}</span><button class="btn primary" type="button" data-act3="push">${st === "needs-install" ? "Show me how" : "Turn on order alerts"}</button></div>`;
    }
  }

  document.addEventListener("click", async e => {
    if (document.body.dataset.page !== "cart") return;
    const t = e.target;
    const cq = t.closest("[data-cq]"); if (cq) { const r = rows.find(x => x.key === cq.dataset.cq); if (r) { r.quantity = Math.max(0, r.quantity + Number(cq.dataset.d)); P.setQty(r.key, r.quantity); rows = rows.filter(x => x.quantity > 0); P.refreshCount(); refreshChoices(); } return; }
    const rm = t.closest("[data-rm]"); if (rm) { P.setQty(rm.dataset.rm, 0); P.setReminder(rm.dataset.rm, 0); rows = rows.filter(x => x.key !== rm.dataset.rm); refreshChoices(); return; }
    const rem = t.closest("[data-rem]"); if (rem) { P.setReminder(rem.dataset.rem, Number(rem.dataset.days), !!rem.dataset.auto, !!rem.dataset.pv); rem.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === rem)); return; }
    const am = t.closest("[data-addmore]"); if (am) { P.addToCart(am.dataset.addmore, 1); rows = await P.cartRows(); await primeReminders(); refreshChoices(); P.toast("Added to this order"); return; }
    const sd = t.closest("[data-sent]"); if (sd) { sd.disabled = true; sd.textContent = "Sending…"; const ok = await P.paidNotice(sd.dataset.sent); const m = P.store.get("pst_paid_sent", {}); m[sd.dataset.sent] = 1; P.store.set("pst_paid_sent", m); sd.textContent = "✓ Payment sent"; P.toast(ok ? "Thanks! Jimmie's been notified." : "Thanks! We'll match it to your order."); return; }
    const a = t.closest("[data-act3]"); if (a) {
      if (a.dataset.act3 === "rmcode") { discount = null; ss.set("pst_discount", null); redrawSide(); }
      if (a.dataset.act3 === "push") { try { if (await P.enablePush("customer")) { a.closest(".alertcta").innerHTML = `${P.icon("check", 26)}<b>Order alerts are on</b><span>We'll ping this device as your order moves.</span>`; } } catch (err) { P.toast(err.message); } }
      return;
    }
    if (t.closest("[data-smsedit]")) { smsCustom = true; redrawSide(); $("[data-smsph]")?.focus(); return; }
    const pl = t.closest("[data-place]"); if (pl) place(pl);
  });
  async function refreshChoices() { if (user) { [frees, choices] = await Promise.all([P.freeVials(rows).catch(() => []), P.choiceRewards(rows).catch(() => [])]); } draw(); }
  document.addEventListener("change", e => {
    if (document.body.dataset.page !== "cart") return;
    const t = e.target;
    if (t.name === "dl") { delivery = t.value; P.store.set("pst_delivery", delivery); redrawSide(); }
    if (t.name === "pm") { pay = t.value; ss.set("pst_pay", pay); redrawSide(); }
    if (t.matches("[data-credit]")) { applyCredit = t.checked; redrawSide(); }
    if (t.matches("[data-choice]")) picks[t.dataset.choice] = t.value;
    if (t.matches("[data-sms]")) { smsOn = t.checked; redrawSide(); if (smsOn) $("[data-smsph]")?.focus(); }
  });
  document.addEventListener("input", e => { if (e.target.matches("[data-notes]")) notes = e.target.value; if (e.target.matches("[data-smsph]")) smsPhone = e.target.value; });
  document.addEventListener("submit", async e => {
    if (!e.target.matches("[data-codeform]")) return; e.preventDefault();
    const stat = $("[data-codestat]"), b = e.target.querySelector("button"); b.disabled = true; stat.textContent = "Checking…"; stat.className = "status";
    try { discount = await P.validateDiscount(e.target.code.value); ss.set("pst_discount", discount); redrawSide(); }
    catch (err) { stat.textContent = err.message || "That code isn't valid."; stat.className = "status bad"; b.disabled = false; }
  });
  document.addEventListener("DOMContentLoaded", () => { if (document.body.dataset.page === "cart") load(); });
})();
