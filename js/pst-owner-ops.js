/* Pep Shop Texas · owner app actions (v3.8, site v38: loads any order on demand, customer picker for new orders). Every step follows the same rules as admin.html:
   - mark paid: payment method required; pending → processing; paid_at/processing_at; "Payment accepted" email sent automatically
   - packed / ready: packed_at; "Packed" email automatic
   - ship / hand off: order_shipments + order_shipment_items; shipped or partially_shipped; tracking required unless hand delivered;
     "Shipped" email is previewed before sending (his rule)
   - delivered / picked up: only when every item has shipped; "Delivered" email automatic
   - cancel: password re-check (his protected-action rule), restore_inventory_for_order when stock was taken; email previewed
   - every change is written to the order's admin notes in his format; every email is logged in order_audit_log
   Also: Venmo matches, customers + store credit, add customer, new order for a customer (with the BAC water prompt), stock. */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc, money } = P;
  const nm = (v, fb = "pending") => String(v || fb).toLowerCase().replace(/\s+/g, "_");
  const oStatus = o => { const s = String(o.status || ""), x = String(o.order_status || ""); if (s && nm(s, "") !== "pending") return s; if (x && nm(x, "") !== "pending") return x; return s || x || "pending"; };
  const pStatus = o => o.payment_status || "pending";
  const isPickup = o => /local pickup/i.test(o.customer_notes || "");
  const custName = o => o.customer_name || o.shipping_name || "Customer";
  const custEmail = o => o.customer_email || o.email || o.shipping_email || o.contact_email || o.billing_email || "";
  const phoneOf = o => String(o.customer_phone || o.shipping_phone || o.phone || "").replace(/[^\d+]/g, "");
  const dead = o => ["rejected", "cancelled", "canceled", "refunded", "failed", "void"].includes(nm(oStatus(o)));
  const LABEL = { order_received: "Order received", awaiting_payment: "Awaiting payment", payment_accepted: "Payment accepted", payment_issue: "Payment issue", order_processing: "Processing", order_packed: "Packed / awaiting carrier pickup", order_shipped: "Shipped", order_delivered: "Delivered", shipment_update: "Shipment update", order_cancelled: "Cancelled", order_rejected: "Rejected" };
  const PREVIEW = ["order_shipped", "order_cancelled", "order_rejected", "shipment_update"];
  let ctx = null; // { me, orders, items, reload, openTab }
  const me = () => ctx.me;
  const adminName = () => String(me()?.email || "").toLowerCase() === "wacoweaver@gmail.com" ? "Jimmie Weaver" : (me()?.user_metadata?.full_name || me()?.email || "Admin");
  const auditLine = t => `[${new Date().toLocaleString()}] ${t} | Admin account: ${adminName()}`;
  const missingCol = e => { const m = String(e?.message || e || ""); return (m.match(/column\s+orders\.([a-zA-Z0-9_]+)\s+does\s+not\s+exist/i) || m.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?orders"?\s+does\s+not\s+exist/i) || m.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i) || [])[1] || ""; };
  const trackUrl = (c, n) => { if (!n) return ""; const x = encodeURIComponent(n), k = String(c || "").toLowerCase(); return k.includes("usps") ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${x}` : k.includes("ups") ? `https://www.ups.com/track?tracknum=${x}` : k.includes("fedex") ? `https://www.fedex.com/fedextrack/?trknbr=${x}` : ""; };
  const nowIso = () => new Date().toISOString();

  /* ---- same as his safeUpdateOrder: only columns the order row has; retry without a missing column ---- */
  async function safeUpdate(o, updates) {
    const keys = new Set(Object.keys(o).filter(k => !["items", "profile"].includes(k)));
    const payload = {}; for (const [k, v] of Object.entries(updates)) if (v !== undefined && keys.has(k)) payload[k] = v;
    if (!Object.keys(payload).length) throw new Error("No matching order columns were available to update.");
    let { error } = await P.client().from("orders").update(payload).eq("id", o.id);
    if (error) { const m = missingCol(error); if (m && m in payload) { delete payload[m]; if (Object.keys(payload).length) ({ error } = await P.client().from("orders").update(payload).eq("id", o.id)); } }
    if (error) throw error;
    Object.assign(o, payload);
  }
  /* ---- same as his appendAdminAudit ---- */
  async function audit(o, text) {
    let cur = o.admin_note || o.admin_notes || "";
    try { const { data } = await P.client().from("orders").select("admin_note, admin_notes").eq("id", o.id).maybeSingle(); if (data) cur = data.admin_note || data.admin_notes || cur; } catch {}
    const base = String(cur || "").trim(), next = `${base}${base ? "\n\n\n" : ""}${auditLine(text)}`;
    await safeUpdate(o, { admin_note: next, admin_notes: next, updated_at: nowIso() }).catch(() => {});
  }
  /* ---- email, same payload as his makeEmailPayload ---- */
  async function payConfig(label) { const all = await P.paymentMethods().catch(() => []); return all.find(m => String(m.label).toLowerCase() === String(label || "").toLowerCase() || String(m.id).toLowerCase() === String(label || "").toLowerCase()) || null; }
  async function payload(o, type, opt = {}) {
    const its = opt.lines || ctx.items[o.id] || [];
    const noTr = o.no_tracking_required === true || String(o.no_tracking_required) === "true";
    let carrier = opt.carrier ?? (o.tracking_carrier || o.carrier || ""), tracking = opt.tracking ?? (o.tracking_number || o.tracking || "");
    if (type === "order_shipped" && noTr && (!carrier || !tracking)) { carrier = carrier || "No tracking required"; tracking = tracking || o.no_tracking_reason || "No tracking required"; }
    let pm = o.payment_method || "", pstat = pStatus(o), pins = o.payment_instructions_snapshot || "", qr = "", acct = "", acctLabel = "Send payment to";
    if (type === "awaiting_payment" || type === "order_received") { const c = await payConfig(pm); if (c) { pm = c.label; pins = c.instructions || pins; qr = c.qr || ""; acct = c.account || ""; acctLabel = c.accountLabel || acctLabel; } if (type === "awaiting_payment") pstat = "pending"; }
    const item = i => ({ name: i.product_name || i.name || i.product_key || "Item", product_id: i.product_id || null, product_key: i.product_key || "", product_name: i.product_name || i.name || "", strength: i.product_strength || i.strength || "", quantity: i.quantity || i.qty || 1, price: i.unit_price ?? i.price ?? 0, total: i.line_total ?? i.total ?? null });
    return { type, originalType: type, to: custEmail(o), customerName: custName(o), orderNumber: o.order_number || o.id, orderDate: o.created_at, subtotal: Number(o.subtotal || 0), discount: Number(o.discount_amount || 0), shipping: Number(o.shipping || 0), tax: Number(o.tax || 0), total: Number(o.total || 0),
      carrier, trackingNumber: tracking, trackingUrl: opt.trackingUrl || o.tracking_url || trackUrl(carrier, tracking), noTrackingRequired: noTr, no_tracking_required: noTr, noTrackingReason: o.no_tracking_reason || "", no_tracking_reason: o.no_tracking_reason || "",
      statusNote: type === "order_packed" ? "Your order has been packed and is awaiting carrier pickup." : type === "order_received" ? (pins || "Your order has been received and is pending payment/processing.") : "",
      paymentMethod: pm, paymentStatus: pstat, paymentInstructions: pins, paymentQrUrl: qr, payment_qr_url: qr, paymentAccount: acct, payment_account: acct, paymentAccountLabel: acctLabel, payment_account_label: acctLabel,
      rejectionReason: o.rejection_reason || "", items: its.map(item), remainingItems: (opt.remaining || []).map(i => ({ ...item(i), quantity: i.remaining })) };
  }
  async function callEmail(body) {
    const { data } = await P.client().auth.getSession();
    const r = await fetch(`${P.CFG.url}/functions/v1/${P.CFG.emailFn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: P.CFG.key, Authorization: `Bearer ${data?.session?.access_token || P.CFG.key}` }, body: JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
    if (!r.ok || (j && j.ok === false)) throw new Error((j && j.error) || t || "Email function failed.");
    return j;
  }
  async function emailLog(o, type, to, status, detail = "") { // = his recordEmailAudit
    const label = LABEL[type] || type;
    await P.client().from("order_audit_log").insert({ order_id: o.id, action_type: status === "sent" ? "email_sent" : "email_failed", field_name: "customer_email", old_value: label, new_value: `${status.toUpperCase()} | ${to}${detail ? " | " + detail : ""}`, changed_by: adminName(), changed_by_email: me()?.email || null, created_at: nowIso() }).then(() => {}, () => {});
    await audit(o, `Email ${status}: ${label} to ${to}${detail ? " (" + detail + ")" : ""}`);
  }
  async function sendEmail(o, type, opt = {}) {
    const to = custEmail(o); if (!to) { P.toast("This order has no customer email, so no email was sent."); return false; }
    if (PREVIEW.includes(type) && !opt.skipPreview) return previewEmail(o, type, opt);
    try {
      await callEmail(await payload(o, type, opt));
      if (type === "order_shipped") await safeUpdate(o, { shipping_email_sent_at: nowIso(), updated_at: nowIso() }).catch(() => {});
      await emailLog(o, type, to, "sent", "Accepted by email service"); return true;
    } catch (e) { await emailLog(o, type, to, "failed", String(e.message || e)); P.toast("Saved, but the email failed: " + (e.message || e)); return false; }
  }
  function previewEmail(o, type, opt) {
    return new Promise(async resolve => {
      const w = P.sheet(`<div class="osheet"><h2 class="serif">${esc(LABEL[type] || "Email")} email</h2><p class="muted small">To ${esc(custEmail(o))}. Check it, then send.</p><div class="eprev" data-eprev><p class="muted small">Loading preview…</p></div>
<div class="obar"><button class="btn primary wide" type="button" data-es="send">Send email</button><button class="btn ghost wide" type="button" data-es="skip">Don't send</button></div></div>`, { label: "Email preview" });
      w.classList.add("full");
      try { const j = await callEmail({ ...(await payload(o, type, opt)), preview_only: true }); const f = document.createElement("iframe"); f.className = "eframe"; f.srcdoc = j.preview?.html || "<p>No preview</p>"; f.title = "Email preview"; w.querySelector("[data-eprev]").replaceChildren(f); }
      catch (e) { w.querySelector("[data-eprev]").innerHTML = `<p class="notice err">Preview failed: ${esc(e.message || e)}</p>`; }
      w.addEventListener("click", async e => { const b = e.target.closest("[data-es]"); if (!b) return;
        if (b.dataset.es === "skip") { P.closeSheet(); resolve(false); return; }
        b.disabled = true; b.textContent = "Sending…"; const ok = await sendEmail(o, type, { ...opt, skipPreview: true }); P.closeSheet(); P.toast(ok ? "Email sent" : "Email not sent"); resolve(ok); });
    });
  }
  /* ---- his protected-action rule: re-enter the admin password ---- */
  function confirmPassword(reason) {
    return new Promise(resolve => {
      const w = P.sheet(`<form class="osheet" data-pwf><h2 class="serif">Confirm it's you</h2><p class="muted">${esc(reason)}. Enter your admin password to continue.</p><label>Password<input type="password" name="pw" autocomplete="current-password" required></label><p class="status" data-pws role="status"></p><button class="btn primary wide" type="submit">Confirm</button><button class="btn ghost wide" type="button" data-pwx style="margin-top:8px">Cancel</button></form>`, { label: "Confirm password" });
      const f = w.querySelector("form");
      w.querySelector("[data-pwx]").addEventListener("click", () => { P.closeSheet(); resolve(false); });
      f.addEventListener("submit", async e => { e.preventDefault(); const b = f.querySelector("[type=submit]"); b.disabled = true;
        const { error } = await P.client().auth.signInWithPassword({ email: me().email, password: f.pw.value });
        if (error) { f.querySelector("[data-pws]").textContent = "That password didn't work. Nothing was changed."; b.disabled = false; return; }
        P.closeSheet(); resolve(true); });
    });
  }
  function confirmSheet(title, body, yes, danger) {
    return new Promise(resolve => {
      const w = P.sheet(`<div class="osheet"><h2 class="serif">${esc(title)}</h2><div class="muted">${body}</div><div class="obar"><button class="btn ${danger ? "danger" : "primary"} wide" type="button" data-cy>${esc(yes)}</button><button class="btn ghost wide" type="button" data-cn>Back</button></div></div>`, { label: title });
      w.querySelector("[data-cy]").addEventListener("click", () => { P.closeSheet(); resolve(true); });
      w.querySelector("[data-cn]").addEventListener("click", () => { P.closeSheet(); resolve(false); });
    });
  }

  /* ================= ORDER SHEET ================= */
  async function shipHistory(o) {
    const { data: sh, error } = await P.client().from("order_shipments").select("*").eq("order_id", o.id).order("created_at", { ascending: true });
    if (error) throw error; if (!sh?.length) return [];
    const { data: ln, error: e2 } = await P.client().from("order_shipment_items").select("*").in("shipment_id", sh.map(x => x.id)); if (e2) throw e2;
    return sh.map(s => ({ ...s, lines: (ln || []).filter(l => l.shipment_id === s.id) }));
  }
  const shippedMap = hist => { const m = new Map(); hist.forEach(s => s.lines.forEach(l => m.set(String(l.order_item_id), (m.get(String(l.order_item_id)) || 0) + Number(l.quantity || 0)))); return m; };
  function stage(o) {
    const s = nm(oStatus(o)), pay = nm(pStatus(o)), pk = isPickup(o);
    if (dead(o)) return { k: "dead", t: s.replace(/_/g, " "), cls: "bad" };
    if (["delivered", "complete", "completed"].includes(s)) return { k: "done", t: pk ? "Picked up" : "Delivered", cls: "ship" };
    if (s === "shipped" && P.handedOff(o)) return { k: "done", t: pk ? "Picked up" : "Hand delivered", cls: "ship" }; // his pickup convention: Hand Delivered shipment = picked up
    if (s === "shipped") return { k: "shipped", t: pk ? "Handed off" : "Shipped", cls: "ship" };
    if (s === "partially_shipped") return { k: "partial", t: "Partly shipped", cls: "ok" };
    if (pay !== "paid") return { k: "unpaid", t: "Awaiting payment", cls: "pend" };
    if (s === "packed") return { k: "packed", t: pk ? "Ready for pickup" : "Packed", cls: "ok" };
    return { k: "paid", t: "Paid · pack it", cls: "ok" };
  }
  async function openOrder(id, opt = {}) {
    let o = ctx.orders.find(x => String(x.id) === String(id));
    if (!o) { const r = await P.client().from("orders").select("*").eq("id", id).maybeSingle(); o = r.data; if (!o) { P.toast("Order not found."); return; } ctx.orders.push(o); }
    if (!ctx.items[o.id]) { const r = await P.client().from("order_items").select("*").eq("order_id", o.id); ctx.items[o.id] = r.data || []; }
    const its = ctx.items[o.id] || [], st = stage(o), pk = isPickup(o), ph = phoneOf(o);
    const [hist, match] = await Promise.all([shipHistory(o).catch(() => []), P.client().from("pst_payment_matches").select("*").eq("order_id", o.id).is("confirmed_at", null).in("status", ["matched", "amount_mismatch", "guessed"]).order("id", { ascending: false }).limit(1).then(r => r.data?.[0], () => null)]);
    const shipped = shippedMap(hist), left = its.reduce((n, i) => n + Math.max(0, Number(i.quantity || 1) - (shipped.get(String(i.id)) || 0)), 0);
    const btn = (a, label, cls = "ghost") => `<button class="btn ${cls} wide" type="button" data-oa="${a}">${label}</button>`;
    const next = st.k === "unpaid" ? btn("paid", `${P.icon("check", 16)} Mark paid`, "primary") + btn("remind", "Email a payment reminder")
      : st.k === "paid" ? (pk ? btn("packed", "Ready for pickup", "primary") + btn("pickedup", "Picked up (hand off now)") : btn("packed", "Mark packed", "primary") + btn("ship", "Ship it (add tracking)"))
      : st.k === "packed" ? (pk ? btn("pickedup", "Picked up", "primary") : btn("ship", "Ship it (add tracking)", "primary"))
      : st.k === "partial" ? btn("ship", "Ship the rest", "primary")
      : st.k === "shipped" ? btn("delivered", pk ? "Mark picked up" : "Mark delivered", "primary") : "";
    const w = P.sheet(`<div class="osheet" data-osheet="${o.id}">
<div class="oshead"><div><small class="muted">${esc(o.order_number || "")} · ${P.fmtDate(o.created_at)}</small><h2 class="serif">${esc(custName(o))}</h2><b class="ostot">${money(o.total)}</b> <span class="opill ${st.cls}">${esc(st.t)}</span> <span class="muted small">· ${pk ? "Pickup" : "Ship"} · ${esc(o.payment_method || "payment not chosen")}</span></div></div>
${match ? `<div class="vmatch ${match.status === "matched" ? "ok" : "warn"}">${P.icon(match.status === "matched" ? "check" : "bell", 18)}<span><b>Venmo ${money(match.amount)} from ${esc(match.payer || "someone")}</b><small>${match.status === "matched" ? "Matches this order." : match.status === "guessed" ? "No order number in the note, same total as this order." : `Order total is ${money(o.total)}.`}</small></span></div>` : ""}
${o.payment_deadline_at && st.k === "unpaid" ? (() => { const at = new Date(o.payment_deadline_at), held = at - Date.now() > 300 * 864e5; return `<p class="small hold">${P.icon("clock", 14)} ${held ? "Held until paid · auto-cancel off" : `Auto-cancels in ${Math.max(0, Math.round((at - Date.now()) / 36e5))}h if unpaid`} <button class="btn ghost sm" type="button" data-hold="${o.id}" data-on="${held ? "0" : "1"}">${held ? "Turn timer back on" : "Hold until paid"}</button></p>`; })() : ""}
<div class="oitems">${its.map(i => { const s = shipped.get(String(i.id)) || 0; return `<div class="oline"><span>${esc(i.product_name)} ${esc(i.product_strength || "")} × ${i.quantity}${i.backorder_quantity ? ` <span class="bo">· ${i.backorder_quantity} on backorder</span>` : ""}${s ? ` <span class="muted small">· ${s} shipped</span>` : ""}</span><b>${money(i.line_total)}</b>${ctx.lineExtra ? ctx.lineExtra(o, i) : ""}</div>`; }).join("")}
<div><span class="muted">${pk ? "Local pickup" : "Shipping"}</span><span>${Number(o.shipping) ? money(o.shipping) : "Free"}</span></div>${Number(o.discount_amount) ? `<div><span class="muted">Discount</span><span>−${money(o.discount_amount)}</span></div>` : ""}<div><b>Total</b><b>${money(o.total)}</b></div></div>
${o.tracking_number ? `<p class="small">${P.icon("truck", 14)} ${esc(o.tracking_carrier || "")} ${esc(o.tracking_number)}</p>` : ""}${!pk && (o.shipping_address || o.shipping_address_line1) ? `<p class="small muted">${P.icon("pin", 14)} ${esc([o.shipping_address || o.shipping_address_line1, o.shipping_city, o.shipping_state, o.shipping_zip].filter(Boolean).join(", "))}</p>` : ""}
<p class="small muted">${esc(custEmail(o))}${ph ? ` · ${esc(o.customer_phone || o.shipping_phone)}` : ""}</p>
<div class="ocontact">${ph ? `<button class="btn ghost sm" type="button" data-texts="${o.id}">${P.icon("chat", 15)} Text</button><a class="btn ghost sm" href="tel:${ph}">Call</a>` : ""}${custEmail(o) ? `<a class="btn ghost sm" href="mailto:${esc(custEmail(o))}?subject=${encodeURIComponent("Your Pep Shop Texas order " + (o.order_number || ""))}">Email</a>` : ""}<button class="btn ghost sm" type="button" data-copy="${esc(o.order_number || o.id)}">Copy #</button></div>
<div class="obar">${next}</div>
${st.k !== "dead" && st.k !== "done" ? `<details class="omore"><summary>More</summary>${btn("cancel", "Cancel order", "danger")}<a class="btn ghost wide" href="admin.html">Open in full admin</a></details>` : `<a class="btn ghost wide" href="admin.html" style="margin-top:10px">Open in full admin</a>`}
</div>`, { label: `Order ${o.order_number || ""}` });
    w.classList.add("full");
    w.addEventListener("click", e => { const b = e.target.closest("[data-oa]"); if (b) act(o, b.dataset.oa, { match, hist, left }); });
    if (opt.pay && st.k === "unpaid") setTimeout(() => act(o, "paid", { match }), 200);
  }
  async function done(o, msg) { P.toast(msg); await ctx.reload(); const fresh = ctx.orders.find(x => x.id === o.id); if (fresh) openOrder(o.id); } // show the order again with its new status and next step

  async function act(o, a, extra = {}) {
    try {
      if (a === "paid") return payFlow(o, extra.match);
      if (a === "remind") { if (!(await confirmSheet("Send a payment reminder?", `Emails ${esc(custEmail(o))} the payment details for ${esc(o.order_number || "")} (${money(o.total)}).`, "Send reminder"))) return; const ok = await sendEmail(o, "awaiting_payment"); P.toast(ok ? "Reminder sent" : "Reminder not sent"); return; }
      if (a === "packed") {
        const now = nowIso(), from = oStatus(o);
        await safeUpdate(o, { order_status: "packed", status: "packed", packed_at: now, last_admin_actor: adminName(), last_admin_actor_email: me().email, updated_at: now });
        await audit(o, `Order status changed by ${adminName()}: ${String(from).replaceAll("_", " ")} → packed`);
        await sendEmail(o, "order_packed"); return done(o, isPickup(o) ? "Marked ready for pickup" : "Marked packed");
      }
      if (a === "ship") return shipFlow(o);
      if (a === "pickedup") {
        if (!(await confirmSheet("Picked up?", `Records ${esc(o.order_number || "")} as handed off and complete, and emails ${esc(custName(o))} a thank-you.`, "Yes, picked up"))) return;
        const hist = await shipHistory(o), m = shippedMap(hist), lines = (ctx.items[o.id] || []).map(i => ({ id: i.id, qty: Math.max(0, Number(i.quantity || 1) - (m.get(String(i.id)) || 0)) })).filter(x => x.qty > 0);
        if (lines.length) await recordShipment(o, "Hand Delivered", "Hand Delivered", lines, hist);
        return markDelivered(o);
      }
      if (a === "delivered") return markDelivered(o);
      if (a === "cancel") {
        const taken = o.inventory_deducted === true || String(o.inventory_deducted) === "true", restored = o.inventory_restored === true || String(o.inventory_restored) === "true";
        if (!(await confirmSheet("Cancel this order?", `${esc(o.order_number || "")} · ${money(o.total)} · ${esc(custName(o))}${taken && !restored ? "<br><br>The vials go back on the shelf." : ""}`, "Cancel order", true))) return;
        const sensitive = taken || restored || nm(pStatus(o)) === "paid" || ["processing", "packed", "shipped", "delivered", "complete", "completed"].includes(nm(oStatus(o)));
        if (sensitive && !(await confirmPassword("Cancelling may put stock back"))) return;
        const now = nowIso(), from = oStatus(o);
        await safeUpdate(o, { order_status: "cancelled", status: "cancelled", cancelled_at: now, last_admin_actor: adminName(), last_admin_actor_email: me().email, updated_at: now });
        await audit(o, `Order status changed by ${adminName()}: ${String(from).replaceAll("_", " ")} → cancelled`);
        if (taken && !restored) { // his inventoryRestoreNeeded
          const { data, error } = await P.client().rpc("restore_inventory_for_order", { p_order_id: o.id, p_reason: `cancel order / possible inventory restoration by ${adminName()}` });
          if (error || data?.success === false) P.toast("Cancelled, but stock didn't go back: " + (error?.message || data?.message || "unknown")); else await audit(o, `cancel order / possible inventory restoration. ${data?.message || "Inventory restore request completed."}`);
        }
        await sendEmail(o, "order_cancelled"); return done(o, "Order cancelled");
      }
    } catch (e) { P.toast(e.message || "That didn't save."); }
  }
  async function markDelivered(o) {
    const hist = await shipHistory(o), m = shippedMap(hist);
    const missing = (ctx.items[o.id] || []).filter(i => (m.get(String(i.id)) || 0) < Number(i.quantity || 1));
    if (missing.length) { P.toast("Can't mark delivered yet: " + missing.map(i => `${i.product_name} (${Number(i.quantity || 1) - (m.get(String(i.id)) || 0)} unshipped)`).join(", ")); return; }
    const now = nowIso(), from = oStatus(o);
    await safeUpdate(o, { order_status: "delivered", status: "delivered", delivered_at: now, last_admin_actor: adminName(), last_admin_actor_email: me().email, updated_at: now });
    await audit(o, `Order status changed by ${adminName()}: ${String(from).replaceAll("_", " ")} → delivered`);
    await sendEmail(o, "order_delivered"); return done(o, isPickup(o) ? "Picked up · thank-you email sent" : "Marked delivered");
  }
  async function recordShipment(o, carrier, tracking, lines, hist) { // = his pstSaveShipment
    const fresh = await shipHistory(o), m = shippedMap(fresh), its = ctx.items[o.id] || [];
    for (const l of lines) { const it = its.find(i => String(i.id) === String(l.id)); if (!it || (m.get(String(l.id)) || 0) + l.qty > Number(it.quantity || 1)) throw new Error("Shipment quantities changed. Reload and retry."); }
    const { data: sh, error } = await P.client().from("order_shipments").insert({ order_id: o.id, carrier, tracking_number: tracking }).select("id").single(); if (error) throw error;
    const { error: e2 } = await P.client().from("order_shipment_items").insert(lines.map(l => ({ shipment_id: sh.id, order_item_id: l.id, quantity: l.qty })));
    if (e2) { await P.client().from("order_shipments").delete().eq("id", sh.id); throw e2; }
    const complete = its.every(i => Number(i.quantity || 1) === (m.get(String(i.id)) || 0) + (lines.find(l => String(l.id) === String(i.id))?.qty || 0));
    const now = nowIso(), s = complete ? "shipped" : "partially_shipped";
    await safeUpdate(o, { order_status: s, status: s, tracking_carrier: carrier, carrier, tracking_number: tracking, tracking, tracking_url: trackUrl(carrier, tracking), shipped_at: now, updated_at: now });
    await audit(o, `Shipment recorded: ${carrier} ${tracking}; ${lines.map(l => `${its.find(i => String(i.id) === String(l.id))?.product_name || "Item"} ×${l.qty}`).join(", ")}. ${complete ? "All items shipped" : "Remaining items backordered"}.`);
    return { complete, remaining: its.map(i => ({ ...i, remaining: Number(i.quantity || 1) - (m.get(String(i.id)) || 0) - (lines.find(l => String(l.id) === String(i.id))?.qty || 0) })).filter(i => i.remaining > 0) };
  }
  async function shipFlow(o) {
    const hist = await shipHistory(o), m = shippedMap(hist), its = (ctx.items[o.id] || []).map(i => ({ ...i, left: Math.max(0, Number(i.quantity || 1) - (m.get(String(i.id)) || 0) - Math.max(0, Number(i.backorder_quantity || 0))) })).filter(i => Number(i.quantity || 1) - (m.get(String(i.id)) || 0) > 0);
    const w = P.sheet(`<form class="osheet" data-shipf><h2 class="serif">Ship ${esc(o.order_number || "")}</h2>
<div class="chips" data-carrier>${["USPS", "UPS", "FedEx", "Hand Delivered"].map((c, k) => `<label class="chip"><input type="radio" name="carrier" value="${c}"${k === 0 ? " checked" : ""}><span>${c}</span></label>`).join("")}</div>
<label data-trk>Tracking number<input name="tracking" inputmode="text" autocomplete="off" placeholder="9400…" required></label>
<p class="kick" style="margin:14px 0 6px">What's in this box</p>${its.map(i => `<div class="shiprow"><span>${esc(i.product_name)} ${esc(i.product_strength || "")}${i.backorder_quantity ? ` <span class="bo">· ${i.backorder_quantity} waiting on stock</span>` : ""}</span><input type="number" min="0" max="${i.left}" value="${i.left}" inputmode="numeric" data-sq="${i.id}" aria-label="Quantity"><span class="muted small">of ${Number(i.quantity || 1) - (m.get(String(i.id)) || 0)}</span></div>`).join("")}
<p class="status" data-shs role="status"></p><button class="btn primary wide" type="submit">Record shipment</button></form>`, { label: "Ship order" });
    w.classList.add("full");
    const f = w.querySelector("form"), trk = f.querySelector("[data-trk]");
    f.addEventListener("change", () => { const hand = f.carrier.value === "Hand Delivered"; trk.hidden = hand; f.tracking.required = !hand; });
    f.addEventListener("submit", async e => {
      e.preventDefault(); const b = f.querySelector("[type=submit]"), st = f.querySelector("[data-shs]");
      const carrier = f.carrier.value, hand = carrier === "Hand Delivered", tracking = hand ? "Hand Delivered" : f.tracking.value.trim();
      const lines = $$("[data-sq]", f).map(x => ({ id: x.dataset.sq, qty: Number(x.value || 0), max: Number(x.max) })).filter(x => x.qty !== 0);
      if (!tracking) { st.textContent = "Enter the tracking number, or choose Hand Delivered."; return; }
      if (!lines.length || lines.some(x => !Number.isInteger(x.qty) || x.qty < 1 || x.qty > x.max)) { st.textContent = "Choose a valid quantity for at least one item."; return; }
      b.disabled = true; b.textContent = "Saving…";
      try {
        const r = await recordShipment(o, carrier, tracking, lines, hist); P.closeSheet();
        const sl = (ctx.items[o.id] || []).filter(i => lines.some(l => String(l.id) === String(i.id))).map(i => ({ ...i, quantity: lines.find(l => String(l.id) === String(i.id)).qty, line_total: Math.round(Number(i.unit_price || 0) * lines.find(l => String(l.id) === String(i.id)).qty * 100) / 100 }));
        await sendEmail(o, r.complete ? "order_shipped" : "shipment_update", { carrier, tracking, lines: sl, remaining: r.remaining });
        done(o, r.complete ? "Shipped" : "Partial shipment recorded");
      } catch (err) { st.textContent = err.message || "Couldn't record the shipment."; b.disabled = false; b.textContent = "Record shipment"; }
    });
  }
  async function payFlow(o, match) {
    const methods = await P.paymentMethods().catch(() => [{ id: "venmo", label: "Venmo" }]);
    const cur = methods.find(m => String(m.label).toLowerCase() === String(o.payment_method || "").toLowerCase());
    const pre = cur ? cur.label : match ? "Venmo" : "";
    const w = P.sheet(`<form class="osheet" data-payf><h2 class="serif">Mark ${esc(o.order_number || "")} paid</h2><p class="muted">${money(o.total)} from ${esc(custName(o))}${match ? `<br>Venmo says ${money(match.amount)} from ${esc(match.payer || "someone")}.` : ""}</p>
<p class="kick" style="margin:14px 0 6px">How did they pay?</p><div class="chips">${methods.map(m => `<label class="chip"><input type="radio" name="pm" value="${esc(m.label)}"${m.label === pre ? " checked" : ""} required><span>${esc(P.payLabel(m))}</span></label>`).join("")}</div>
<label class="toggle" style="margin-top:12px"><input type="checkbox" name="em" checked> Email ${esc(custName(o).split(/\s+/)[0])} "Payment accepted"</label>
<p class="status" data-pys role="status"></p><button class="btn primary wide" type="submit">${P.icon("check", 16)} Mark paid</button></form>`, { label: "Mark paid" });
    const f = w.querySelector("form");
    f.addEventListener("submit", async e => {
      e.preventDefault(); const method = f.pm.value, b = f.querySelector("[type=submit]");
      if (!method) { f.querySelector("[data-pys]").textContent = "Choose how the order was paid before marking it paid."; return; } // his rule
      b.disabled = true; b.textContent = "Saving…";
      try {
        const cfg = methods.find(m => m.label === method), now = nowIso(), fromOs = oStatus(o), fromPs = pStatus(o), fromPm = o.payment_method || "";
        const u = { payment_status: "paid", payment_method: method, payment_type: method, pay_method: method, selected_payment_method: method, payment_instructions_snapshot: cfg?.instructions || o.payment_instructions_snapshot || null, last_admin_actor: adminName(), last_admin_actor_email: me().email, updated_at: now, paid_at: now };
        const auto = ["pending", "awaiting_payment"].includes(nm(fromOs));
        if (auto) Object.assign(u, { order_status: "processing", status: "processing", processing_at: now });
        await safeUpdate(o, u);
        const lines = [`Payment status changed by ${adminName()}: ${String(fromPs).replaceAll("_", " ")} → paid`];
        if (auto) lines.push(`Order status changed by ${adminName()}: ${String(fromOs).replaceAll("_", " ")} → processing`);
        if (fromPm.toLowerCase() !== method.toLowerCase()) { lines.push(`Payment method changed by ${adminName()}: ${fromPm || "none"} → ${method}`); await P.client().from("order_audit_log").insert({ order_id: o.id, action_type: "payment_method_changed", field_name: "payment_method", old_value: fromPm, new_value: method, changed_by: adminName(), changed_by_email: me().email, created_at: now }).then(() => {}, () => {}); }
        if (match) { await P.client().from("pst_payment_matches").update({ confirmed_at: now }).eq("id", match.id).then(() => {}, () => {}); lines.push(`Venmo payment ${money(match.amount)} from ${match.payer || "customer"} confirmed in the owner app`); }
        await audit(o, lines.join("; "));
        P.closeSheet();
        if (f.em.checked) await sendEmail(o, "payment_accepted"); // order_processing is skipped when it moved there automatically (his rule)
        done(o, "Marked paid");
      } catch (err) { f.querySelector("[data-pys]").textContent = err.message || "Couldn't save."; b.disabled = false; b.innerHTML = `${P.icon("check", 16)} Mark paid`; }
    });
  }

  /* ================= TODAY: Venmo matches ================= */
  async function venmoMatches(el) {
    const { data, error } = await P.client().from("pst_payment_matches").select("*").is("confirmed_at", null).in("status", ["matched", "amount_mismatch", "guessed", "no_order"]).order("id", { ascending: false }).limit(15);
    if (error || !data?.length) { el.innerHTML = ""; return; }
    const live = data.filter(m => !m.order_id || ctx.orders.some(o => o.id === m.order_id && nm(pStatus(o)) !== "paid"));
    el.innerHTML = live.length ? `<h2 class="serif osec">Venmo payments in</h2>${live.map(m => `<button type="button" class="vrow ${m.status === "matched" ? "ok" : "warn"}" ${m.order_id ? `data-vm="${m.order_id}"` : `data-vmx="${m.id}"`}><span class="vic">${P.icon(m.status === "matched" ? "check" : "bell", 16)}</span><span><b>${money(m.amount)} · ${esc(m.payer || "")}</b><small>${m.status === "matched" ? `Matches ${esc(m.order_number)} · tap to mark paid` : m.status === "amount_mismatch" ? `${esc(m.order_number)} total is ${money(m.order_total)}` : m.status === "guessed" ? `Probably ${esc(m.order_number)} (no number in the note)` : "No matching open order · tap to dismiss"}</small></span></button>`).join("")}` : "";
  }

  /* ================= CUSTOMERS ================= */
  let custs = [];
  async function loadCustomers() {
    const [a, b] = await Promise.all([P.client().from("customer_profiles").select("user_id,customer_number,first_name,last_name,email,phone,shipping_address,shipping_city,shipping_state,shipping_zip,created_at"), P.client().from("manual_customers").select("id,customer_number,first_name,last_name,email,phone,shipping_address,shipping_city,shipping_state,shipping_zip,created_at")]);
    if (a.error) throw a.error;
    custs = [...(a.data || []).map(c => ({ ...c, source: "online", id: c.user_id })), ...(b.data || []).map(c => ({ ...c, source: "manual" }))]
      .map(c => ({ ...c, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer", number: c.customer_number ? "PST-C" + c.customer_number : "" }));
    const spent = {}; ctx.orders.filter(o => !dead(o)).forEach(o => { const k = String(o.customer_id || o.user_id || "") || String(custEmail(o)).toLowerCase(); (spent[k] ||= { n: 0, t: 0, last: o.created_at }).n++; spent[k].t += Number(o.total || 0); if (o.created_at > spent[k].last) spent[k].last = o.created_at; });
    custs.forEach(c => { c.stats = spent[String(c.user_id || "")] || spent[String(c.email || "").toLowerCase()] || { n: 0, t: 0 }; });
    custs.sort((x, y) => String(y.stats.last || y.created_at || "").localeCompare(String(x.stats.last || x.created_at || "")));
  }
  async function customersPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    try { await loadCustomers(); } catch (e) { el.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
    el.innerHTML = `<div class="pmtop"><input class="psearch" type="search" data-csearch placeholder="Name, PST-C number or email" aria-label="Search customers"><button class="btn primary sm" type="button" data-cnew>+ Add</button></div>
<div class="clist" data-clist>${custs.map(crow).join("")}</div>`;
  }
  const crow = c => `<button type="button" class="crow" data-cust="${esc(c.source + ":" + c.id)}" data-cname="${esc(`${c.name} ${c.number} ${c.email || ""}`.toLowerCase())}"><span class="cav">${esc((c.first_name || c.name || "?")[0].toUpperCase())}</span><span><b>${esc(c.name)}</b><small>${esc([c.number, c.shipping_city].filter(Boolean).join(" · "))}${c.source === "manual" ? " · added by you" : ""}</small></span><em>${c.stats.n ? `${c.stats.n} order${c.stats.n === 1 ? "" : "s"}<br>${money(c.stats.t)}` : "New"}</em></button>`;
  async function pickCustomer(then) { // New order from Today/Orders: choose who it's for (or add them first)
    try { await loadCustomers(); } catch (e) { P.toast(e.message); return; }
    const w = P.sheet(`<div class="osheet"><h2 class="serif">New order for…</h2><div class="pmtop"><input class="psearch" type="search" data-pcq placeholder="Name, PST-C number or email" aria-label="Find a customer"><button class="btn primary sm" type="button" data-pcnew>+ New</button></div><div class="clist" data-pcl>${custs.map(crow).join("")}</div></div>`, { label: "Choose customer" });
    w.classList.add("full");
    w.querySelector("[data-pcq]").addEventListener("input", e => { const q = e.target.value.trim().toLowerCase(); $$("[data-pcl] [data-cname]").forEach(r => r.hidden = !!q && !r.dataset.cname.includes(q)); });
    w.addEventListener("click", e => {
      const c = e.target.closest("[data-cust]"); if (c) { e.stopPropagation(); then(c.dataset.cust); return; }
      if (e.target.closest("[data-pcnew]")) { e.stopPropagation(); addCustomerFlow(then); }
    });
  }
  function filterCustomers(q) { q = q.trim().toLowerCase(); $$("[data-cname]").forEach(r => r.hidden = !!q && !r.dataset.cname.includes(q)); }
  async function openCustomer(key) {
    const c = custs.find(x => x.source + ":" + x.id === key); if (!c) return;
    const r = c.source === "online" ? await P.client().from("orders").select("*").or(`customer_id.eq.${c.id},user_id.eq.${c.id}`).order("created_at", { ascending: false }) : await P.client().from("orders").select("*").ilike("customer_email", c.email || "__none__").order("created_at", { ascending: false });
    const os = r.data || []; os.forEach(o => { if (!ctx.orders.some(x => x.id === o.id)) ctx.orders.push(o); });
    let credit = null; if (c.source === "online") { const cr = await P.client().from("store_credit_transactions").select("amount_cents").eq("customer_user_id", c.id); if (!cr.error) credit = (cr.data || []).reduce((n, x) => n + Number(x.amount_cents || 0), 0) / 100; }
    const ph = String(c.phone || "").replace(/[^\d+]/g, "");
    const w = P.sheet(`<div class="osheet"><div class="oshead"><div><small class="muted">${esc(c.number)}${c.source === "manual" ? " · no website account" : ""}</small><h2 class="serif">${esc(c.name)}</h2><span class="muted small">${esc([c.shipping_city, c.shipping_state].filter(Boolean).join(", "))}</span></div></div>
<div class="ocontact">${ph ? `<a class="btn ghost sm" href="sms:${ph}">${P.icon("chat", 15)} Text</a><a class="btn ghost sm" href="tel:${ph}">Call</a>` : ""}${c.email ? `<a class="btn ghost sm" href="mailto:${esc(c.email)}">Email</a>` : ""}</div>
<div class="tiles"><div class="tile"><small>Orders</small><b>${os.filter(o => !dead(o)).length}</b><span class="muted small">${money(os.filter(o => !dead(o)).reduce((n, o) => n + Number(o.total || 0), 0))}</span></div>${credit !== null ? `<div class="tile"><small>Store credit</small><b>${money(credit)}</b><button class="btn ghost sm" type="button" data-credit="${esc(key)}">Adjust</button></div>` : ""}</div>
<div class="obar"><button class="btn primary wide" type="button" data-neworder="${esc(key)}">${P.icon("plus", 16)} New order for ${esc(c.first_name || c.name)}</button></div>
<h3 class="kick" style="margin-top:18px">Orders</h3>${os.length ? os.map(o => `<button type="button" class="crow" data-ord="${o.id}"><span class="cav">${P.icon("box", 16)}</span><span><b>${esc(o.order_number || "")} · ${money(o.total)}</b><small>${P.fmtDate(o.created_at)} · ${esc(stage(o).t)}</small></span></button>`).join("") : `<p class="muted small">No orders yet.</p>`}</div>`, { label: c.name });
    w.classList.add("full");
  }
  function creditFlow(key) {
    const c = custs.find(x => x.source + ":" + x.id === key); if (!c) return;
    const w = P.sheet(`<form class="osheet"><h2 class="serif">Store credit · ${esc(c.name)}</h2><div class="chips"><label class="chip"><input type="radio" name="dir" value="1" checked><span>Add</span></label><label class="chip"><input type="radio" name="dir" value="-1"><span>Remove</span></label></div>
<label>Amount ($)<input name="amt" type="number" min="0.01" step="0.01" inputmode="decimal" required></label><label>Reason<input name="why" required maxlength="200" placeholder="e.g. Referral bonus"></label><p class="status" data-crs></p><button class="btn primary wide" type="submit">Save</button></form>`, { label: "Store credit" });
    const f = w.querySelector("form");
    f.addEventListener("submit", async e => { e.preventDefault(); const cents = Math.round(Number(f.amt.value) * 100) * Number(f.dir.value);
      const { error } = await P.client().rpc("admin_adjust_store_credit", { p_customer_user_id: c.id, p_customer_email: c.email, p_amount_cents: cents, p_reason: f.why.value.trim() });
      if (error) { f.querySelector("[data-crs]").textContent = error.message; return; } P.closeSheet(); P.toast("Store credit saved"); openCustomer(key); });
  }
  function addCustomerFlow(then) { // same fields and rules as his customers.html → Add manual customer
    const w = P.sheet(`<form class="osheet" data-addc><h2 class="serif">Add a customer</h2><p class="muted small">For people who order by text or in person. They don't need a website account.</p>
<div class="pm2"><label>First name<input name="first_name" required autocomplete="off"></label><label>Last name<input name="last_name" required autocomplete="off"></label></div>
<div class="pm2"><label>Phone<input name="phone" type="tel" inputmode="tel" autocomplete="off"></label><label>Email<input name="email" type="email" inputmode="email" autocomplete="off"></label></div>
<label>Researcher type<select name="research_role" required><option>Independent Researcher</option><option>Academic Researcher</option><option>Laboratory</option><option>Clinic / Practice</option><option>Other</option></select></label>
<label>Street address<input name="shipping_address" autocomplete="off"></label><div class="pm2"><label>City<input name="shipping_city"></label><label>State<input name="shipping_state" maxlength="20" value="TX"></label></div><label>ZIP<input name="shipping_zip" inputmode="numeric" maxlength="10"></label>
<label class="toggle"><input type="checkbox" name="marketing_opt_in"> They said yes to deals and restock emails</label>
<label>Notes (only you see these)<input name="admin_notes" maxlength="500"></label>
<p class="status" data-acs role="status"></p><button class="btn primary wide" type="submit">Save customer</button></form>`, { label: "Add customer" });
    w.classList.add("full");
    const f = w.querySelector("form");
    f.addEventListener("submit", async e => {
      e.preventDefault(); const v = k => String(f[k]?.value || "").trim(), email = v("email").toLowerCase(), st = f.querySelector("[data-acs]");
      if (email && custs.some(c => String(c.email || "").toLowerCase() === email)) { st.textContent = "A customer with that email already exists."; return; }
      const opt = f.marketing_opt_in.checked;
      const row = { first_name: v("first_name"), last_name: v("last_name"), email: email || null, phone: v("phone") || null, shipping_address: v("shipping_address") || null, shipping_city: v("shipping_city") || null, shipping_state: v("shipping_state") || null, shipping_zip: v("shipping_zip") || null, research_role: v("research_role"), marketing_opt_in: opt, marketing_opt_out: false, marketing_opt_in_at: opt ? nowIso() : null, marketing_source: opt ? "admin_manual_confirmed_consent" : null, admin_notes: v("admin_notes") || null, created_by: me().id };
      const b = f.querySelector("[type=submit]"); b.disabled = true;
      const { data, error } = await P.client().from("manual_customers").insert(row).select("id").single();
      if (error) { st.textContent = error.code === "23505" ? "That email is already in your customer list." : error.message; b.disabled = false; return; }
      P.closeSheet(); P.toast("Customer saved"); await loadCustomers(); const el = $("[data-clist]"); if (el) el.innerHTML = custs.map(crow).join("");
      if (then) then("manual:" + data.id);
    });
  }

  /* ================= NEW ORDER (his admin_create_manual_order), with the BAC water nudge ================= */
  async function newOrderFlow(key) {
    const c = custs.find(x => x.source + ":" + x.id === key); if (!c) return;
    const prods = (await P.products().catch(() => [])).filter(p => p.product_key);
    const bac = prods.filter(p => /bacteriostatic|bac water|^pst-misc$/i.test(p.display_name)).sort((a, b) => P.unitPrice(a) - P.unitPrice(b));
    const methods = await P.paymentMethods().catch(() => [{ id: "venmo", label: "Venmo" }]);
    const lines = []; let bacAsked = false;
    const w = P.sheet(`<div class="osheet" data-nof><h2 class="serif">New order · ${esc(c.name)}</h2>
<div class="csearch nopick">${P.icon("search", 18)}<input type="search" data-npq placeholder="Add a product" autocomplete="off" aria-label="Add a product"></div><div class="sres" data-npr></div>
<div data-nlines></div><div data-bac></div>
<div class="chips" style="margin-top:12px"><label class="chip"><input type="radio" name="dl" value="pickup" checked><span>Local pickup</span></label><label class="chip"><input type="radio" name="dl" value="ship"><span>Ship</span></label></div>
<label data-shipamt hidden>Shipping ($)<input type="number" name="ship" min="0" step="0.01" inputmode="decimal" value="${P.CFG.shipRate}"></label>
<p class="kick" style="margin:14px 0 6px">They'll pay with</p><div class="chips">${methods.map((m, k) => `<label class="chip"><input type="radio" name="pm" value="${esc(m.label)}"${k === 0 ? " checked" : ""}><span>${esc(P.payLabel(m))}</span></label>`).join("")}</div>
<label>Notes (only you see these)<input name="notes" maxlength="500"></label>
<div class="ntot" data-ntot></div><p class="status" data-nst role="status"></p><button class="btn primary wide" type="button" data-ncreate disabled>Create order</button></div>`, { label: "New order" });
    w.classList.add("full");
    const root = w.querySelector("[data-nof]"), q = root.querySelector("[data-npq]"), res = root.querySelector("[data-npr]");
    const isPep = p => p && !/supply|vitamin/i.test(p.category || "") && !/bacteriostatic|bac water|^pst-misc$/i.test(p.display_name);
    const draw = () => {
      root.querySelector("[data-nlines]").innerHTML = lines.map((l, k) => `<div class="nline"><span><b>${esc(l.p.display_name)}</b> <small>${esc(l.p.strength || "")} · ${money(P.unitPrice(l.p))}${P.qty(l.p) < l.q ? ` · <span class="bo">${P.qty(l.p)} in stock</span>` : ""}</small></span><span class="qstep"><button type="button" data-nq="${k}" data-d="-1" aria-label="Less">−</button><b>${l.q}</b><button type="button" data-nq="${k}" data-d="1" aria-label="More">+</button></span></div>`).join("") || `<p class="muted small">Search above to add products.</p>`;
      // the nice touch: peptides in the order and no BAC water yet → ask once
      const needs = !bacAsked && bac.length && lines.some(l => isPep(l.p)) && !lines.some(l => /bacteriostatic|bac water|^pst-misc$/i.test(l.p.display_name));
      root.querySelector("[data-bac]").innerHTML = needs ? `<div class="bacask">${P.icon("flask", 20)}<span><b>Do they need BAC water?</b><small>Easy to forget, and they'll need it to mix.</small></span><div class="chips">${bac.map(p => `<button type="button" class="chip on" data-bacadd="${esc(p.product_key)}">+ BAC water ${esc(p.strength || "")} · ${money(P.unitPrice(p))}</button>`).join("")}<button type="button" class="chip" data-bacno>No thanks</button></div></div>` : "";
      const ship = root.querySelector("[name=dl]:checked").value === "ship" ? Math.max(0, Number(root.querySelector("[name=ship]").value) || 0) : 0;
      const sub = lines.reduce((n, l) => n + P.unitPrice(l.p) * l.q, 0);
      root.querySelector("[data-ntot]").innerHTML = lines.length ? `<div><span>Items</span><b>${money(sub)}</b></div><div><span>${ship ? "Shipping" : "Pickup"}</span><b>${ship ? money(ship) : "Free"}</b></div><div class="big"><span>Total</span><b>${money(sub + ship)}</b></div>` : "";
      root.querySelector("[data-ncreate]").disabled = !lines.length;
    };
    const add = p => { const l = lines.find(x => x.p.product_key === p.product_key); if (l) l.q++; else lines.push({ p, q: 1 }); q.value = ""; res.innerHTML = ""; draw(); };
    q.addEventListener("input", () => { const s = q.value.trim().toLowerCase(); res.innerHTML = s ? prods.filter(p => `${p.display_name} ${p.strength} ${p.product_key}`.toLowerCase().includes(s)).sort((a, b) => (P.qty(b) > 0) - (P.qty(a) > 0)).slice(0, 8).map(p => `<button type="button" class="sr1" data-npadd="${esc(p.product_key)}">${P.vial(p, 26)}<span><b>${esc(p.display_name)}</b><small>${esc(p.strength || "")} · ${P.qty(p)} in stock</small></span><span class="srr"><em>${money(P.unitPrice(p))}</em></span></button>`).join("") || `<p class="muted small">No match.</p>` : ""; });
    root.addEventListener("click", async e => {
      const a = e.target.closest("[data-npadd]"); if (a) { add(prods.find(p => p.product_key === a.dataset.npadd)); return; }
      const s = e.target.closest("[data-nq]"); if (s) { const l = lines[+s.dataset.nq]; l.q += +s.dataset.d; if (l.q < 1) lines.splice(+s.dataset.nq, 1); draw(); return; }
      const bb = e.target.closest("[data-bacadd]"); if (bb) { bacAsked = true; add(prods.find(p => p.product_key === bb.dataset.bacadd)); P.toast("BAC water added"); return; }
      if (e.target.closest("[data-bacno]")) { bacAsked = true; draw(); return; }
      const cr = e.target.closest("[data-ncreate]"); if (!cr) return;
      const st = root.querySelector("[data-nst]"), pickupOrder = root.querySelector("[name=dl]:checked").value === "pickup", method = root.querySelector("[name=pm]:checked")?.value || "";
      const ship = pickupOrder ? 0 : Math.max(0, Number(root.querySelector("[name=ship]").value) || 0);
      cr.disabled = true; cr.textContent = "Creating…";
      try {
        const { data, error } = await P.client().rpc("admin_create_manual_order", { p_customer_source: c.source, p_customer_uuid: c.id, p_lines: lines.map(l => ({ product_key: l.p.product_key, quantity: l.q })), p_shipping: ship, p_notes: root.querySelector("[name=notes]").value || null });
        if (error) throw error;
        await ctx.reload(); const o = ctx.orders.find(x => String(x.id) === String(data.id));
        if (o) { // his manual orders don't record delivery or payment method; save both so pickup/payment flows work
          await safeUpdate(o, { customer_notes: `Delivery method: ${pickupOrder ? "Local Pickup" : "Shipping"}`, payment_method: method || undefined, selected_payment_method: method || undefined, customer_name: o.customer_name || c.name, updated_at: nowIso() }).catch(() => {});
          await audit(o, `Order created in the owner app by ${adminName()}${pickupOrder ? " · local pickup" : ""}${method ? " · " + method : ""}`);
        }
        P.closeSheet();
        const w2 = P.sheet(`<div class="osheet okmsg">${P.icon("check", 30)}<h2 class="serif">${esc(data.order_number)} created</h2><p class="muted">${money(data.total)} · ${esc(c.name)}. It's waiting on payment, and the 24-hour hold applies like any order.</p>
${c.email ? `<button class="btn primary wide" type="button" data-sendinv>Email ${esc(c.first_name || "them")} the order with payment details</button>` : `<p class="muted small">No email on file. Text them the payment details instead.</p>`}<button class="btn ghost wide" type="button" data-openo style="margin-top:8px">Open the order</button></div>`, { label: "Order created" });
        w2.querySelector("[data-openo]").addEventListener("click", () => { P.closeSheet(); openOrder(data.id); });
        w2.querySelector("[data-sendinv]")?.addEventListener("click", async ev => { ev.target.disabled = true; ev.target.textContent = "Sending…"; const fo = ctx.orders.find(x => String(x.id) === String(data.id)); const ok = fo && await sendEmail(fo, "order_received"); ev.target.textContent = ok ? "✓ Sent" : "Couldn't send"; });
      } catch (err) {
        const m = String(err.message || "").match(/Insufficient stock for (\S+?): requested (\d+), available (-?\d+)/i), lp = m && lines.find(l => l.p.product_key === m[1])?.p;
        st.textContent = m ? `Not enough ${lp ? `${lp.display_name} ${lp.strength || ""}`.trim() : m[1]} in stock: ${Math.max(0, +m[3])} on hand, ${m[2]} on this order. Lower the quantity or receive stock first.` : (err.message || "Couldn't create the order.");
        st.className = "status bad"; cr.disabled = false; cr.textContent = "Create order"; }
    });
    root.addEventListener("change", e => { if (e.target.name === "dl") root.querySelector("[data-shipamt]").hidden = e.target.value !== "ship"; draw(); });
    root.addEventListener("input", e => { if (e.target.name === "ship") draw(); });
    draw(); setTimeout(() => q.focus(), 80);
  }

  /* ================= STOCK: receive a PO, count correction (same as inventory.html) ================= */
  async function stockPane(el) { // v44: one clean card per PO; each line shows the product as it's named in the shop
    const { data, error } = await P.client().from("incoming_inventory").select("*").not("status", "in", "(received,cancelled)").order("ordered_at", { ascending: false }).limit(200);
    if (error) { el.innerHTML = ""; return; }
    const rows = data || [], pos = {}; rows.forEach(r => { const k = r.po_number || "(no PO number)"; (pos[k] ||= []).push(r); });
    const keys = [...new Set(rows.map(r => r.product_key).filter(Boolean))], ids = [...new Set(rows.map(r => r.product_id).filter(Boolean))];
    const [inv, cat] = await Promise.all([
      ids.length || keys.length ? P.client().from("product_inventory").select("id,product_key,display_name,strength").or([ids.length ? `id.in.(${ids.join(",")})` : "", keys.length ? `product_key.in.(${keys.map(k => `"${k}"`).join(",")})` : ""].filter(Boolean).join(",")) : { data: [] },
      keys.length ? P.client().from("product_catalog").select("*").in("product_key", keys) : { data: [] }]);
    const byId = Object.fromEntries((inv.data || []).map(x => [String(x.id), x])), byKey = Object.fromEntries((inv.data || []).map(x => [x.product_key, x])), catBy = Object.fromEntries((cat.data || []).map(x => [x.product_key, x]));
    const link = r => byId[String(r.product_id || "")] || byKey[r.product_key] || null;
    const clean = n => String(n || "Item").replace(/\s*[—-]\s*PSTP\d+\s*$/i, "").replace(/\s+—\s+/g, " ");
    const when = d => { if (!d) return ""; const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5); return days === 0 ? "arriving today" : days === 1 ? "arriving tomorrow" : days > 1 ? `arriving in ${days} days` : `${-days} day${days === -1 ? "" : "s"} late`; };
    el.innerHTML = Object.keys(pos).length ? `<h2 class="serif osec">Incoming</h2>${Object.entries(pos).map(([po, rs]) => {
      const vials = rs.reduce((n, r) => n + Number(r.ordered_quantity || 0), 0), un = rs.filter(r => !link(r)), r0 = rs[0], late = r0.expected_arrival_date && new Date(r0.expected_arrival_date) < new Date(new Date().setHours(0, 0, 0, 0));
      return `<article class="pocard"><div class="pohd"><div><b>${esc(po)}</b><small>${r0.expected_arrival_date ? `Expected ${P.fmtDate(r0.expected_arrival_date)} · ${when(r0.expected_arrival_date)}` : "No arrival date"}${r0.vendor_name || r0.supplier_name ? ` · ${esc(r0.vendor_name || r0.supplier_name)}` : ""}</small></div><span class="opill ${late ? "bad" : "pend"}">${esc(String(r0.status || "ordered").replace(/_/g, " "))}</span></div>
<div class="posum"><b>${vials}</b> vials · ${rs.length} product${rs.length === 1 ? "" : "s"}</div>
<div class="polines">${rs.map(r => { const l = link(r), c = l && catBy[l.product_key]; return `<div class="poline${l ? "" : " warn"}">${c ? P.vial(c, 22) : `<span class="pov"></span>`}<span><b>${esc(l ? `${l.display_name} ${l.strength || ""}`.trim() : clean(r.product_name))}</b>${l ? "" : `<small>Not set up in your products yet</small>`}</span><em>×${Number(r.ordered_quantity || 0)}</em></div>`; }).join("")}</div>
${un.length ? `<p class="small powarn">${P.icon("bell", 14)} ${un.length} item${un.length === 1 ? " isn't" : "s aren't"} linked to a product, so this order can't be received yet. Add ${un.length === 1 ? "it" : "them"} under Products (or link ${un.length === 1 ? "it" : "them"} in Inventory on the computer), then receive.</p>` : ""}
${po !== "(no PO number)" ? `<button class="btn ${un.length ? "ghost" : "primary"} wide" type="button" data-recv="${esc(po)}"${un.length ? " disabled" : ""}>Receive ${vials} vials</button>` : ""}</article>`; }).join("")}` : "";
    el._pos = pos;
  }
  async function receivePO(po, el) {
    const rows = el._pos?.[po] || [], n = rows.reduce((s, r) => s + Number(r.ordered_quantity || 0), 0);
    if (!(await confirmSheet(`Receive ${po}?`, `${rows.map(r => `• ${esc(r.product_name)} — ${r.ordered_quantity} vial(s)`).join("<br>")}<br><br>Total: ${n} vial(s). Confirm only after every vial has been inspected and counted.`, "Receive and add to stock"))) return;
    const { data, error } = await P.client().rpc("receive_incoming_purchase_order", { p_po_number: po });
    if (error) { P.toast(error.message); return; }
    P.toast(`${po} received: ${Number(data?.received_vials ?? n)} vials added`); stockPane(el);
  }
  function countFlow(p, onDone) { // inventory.html saveRow: physical count with a required note, movement "physical_count"
    const cur = Number(p.current_inventory || 0);
    const w = P.sheet(`<form class="osheet"><h2 class="serif">Count ${esc(p.display_name)} ${esc(p.strength || "")}</h2><p class="muted">On hand now: <b>${cur}</b></p>
<label>Actual count<input name="n" type="number" min="0" step="1" inputmode="numeric" value="${cur}" required></label><label>Reason (required if it changes)<input name="why" maxlength="200" placeholder="e.g. Shelf count, damaged vial"></label><p class="status" data-cts></p><button class="btn primary wide" type="submit">Save count</button></form>`, { label: "Count stock" });
    const f = w.querySelector("form");
    f.addEventListener("submit", async e => {
      e.preventDefault(); const n = Math.max(0, Math.floor(Number(f.n.value))), why = f.why.value.trim(), st = f.querySelector("[data-cts]");
      if (n === cur) { P.closeSheet(); return; } if (!why) { st.textContent = "Enter a reason for the count correction."; return; }
      const { data: inv, error: e0 } = await P.client().from("product_inventory").select("*").eq("product_key", p.product_key).maybeSingle(); if (e0 || !inv) { st.textContent = e0?.message || "Inventory row not found."; return; }
      const prev = Number(inv.current_inventory || 0), now = nowIso();
      const a = await P.client().from("product_inventory").update({ current_inventory: n, updated_at: now }).eq("id", inv.id); if (a.error) { st.textContent = a.error.message; return; }
      await P.client().from("product_catalog").update({ current_inventory: n, updated_at: now }).eq("product_key", p.product_key);
      await P.client().from("inventory_movements").insert({ product_id: inv.id, product_key: p.product_key, movement_type: "physical_count", quantity_change: n - prev, previous_quantity: prev, new_quantity: n, admin_note: why, created_by: me().id, created_by_email: me().email });
      P.closeSheet(); P.toast(`Count saved: ${n}`); onDone && onDone();
    });
  }

  window.PSTOps = { init: c => { ctx = c; }, openOrder, stage, venmoMatches, customersPane, filterCustomers, openCustomer, creditFlow, addCustomerFlow, newOrderFlow, pickCustomer, stockPane, receivePO, countFlow, custName, isPickup };
})();
