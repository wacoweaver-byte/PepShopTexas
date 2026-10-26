/* Pep Shop Texas · owner app v5.1: "Emails & reminders" — every message the shop sends, when it goes out,
   a live preview from the real email template, and how many went out lately (from order_audit_log). Read-only. */
(function () {
  "use strict";
  const P = window.PST, { esc } = P;
  const ROWS = [
    { g: "Goes out on its own", items: [
      { k: "account_created", t: "Welcome", when: "Someone creates an account on the shop.", ch: "Email" },
      { k: "order_received", t: "Thanks for your order", when: "The moment a customer checks out. Includes the order, total and how to pay. Unpaid orders are held 24 hours.", ch: "Email", prev: true },
      { k: "new_order_owner", t: "New order (to you)", when: "Every new order, to your inbox and as a phone alert.", ch: "Email + alert" },
      { k: "restock", t: "It's back in stock", when: "A product someone asked about comes back. Goes to everyone on that product's request list.", ch: "Email" },
      { k: "reminder", t: "Running low?", when: "Timed per product: your protocol (green dot) says how long a vial lasts × how many they bought. After a customer reorders a couple of times, it follows their own rhythm.", ch: "Phone alert", warn: "Only reaches customers who turned on alerts in the app. There is no reminder email yet." },
      { k: "low_stock_owner", t: "Low stock (to you)", when: "Once a day if anything is low or sold out.", ch: "Alert" }] },
    { g: "Goes out when you act on an order", items: [
      { k: "payment_accepted", t: "Payment confirmed", when: "You mark an order paid with \"email the customer\" on.", ch: "Email + alert", prev: true },
      { k: "awaiting_payment", t: "Payment reminder", when: "You tap Remind on an unpaid order.", ch: "Email", prev: true },
      { k: "order_packed", t: "Packed / ready for pickup", when: "You mark it packed (pickup orders say ready to pick up).", ch: "Email + alert", prev: true },
      { k: "order_shipped", t: "Shipped, with tracking", when: "You ship the whole order. You see it before it sends.", ch: "Email + alert", prev: true },
      { k: "shipment_update", t: "Part of your order shipped", when: "You ship some items; the rest stay on backorder.", ch: "Email", prev: true },
      { k: "order_delivered", t: "Delivered / thanks for picking up", when: "You mark it delivered or picked up.", ch: "Email + alert", prev: true },
      { k: "order_cancelled", t: "Order cancelled", when: "You cancel an order. You see it before it sends.", ch: "Email + alert", prev: true },
      { k: "order_rejected", t: "Order rejected", when: "You reject an order. You see it before it sends.", ch: "Email", prev: true }] },
    { g: "Marketing", items: [
      { k: "blast", t: "Email blast", when: "Only when you write and send one. Only to customers who said yes to emails, each with an unsubscribe link.", ch: "Email", link: "#blast" },
      { k: "texts", t: "Text blast", when: "Only when you write and send one. Only to customers who checked \"text me deals\", at most 4 a month each, 9am to 8pm Central. Replying STOP turns them off.", ch: "Text", link: "#texts" },
      { k: "emailpromos", t: "Promos in emails", when: "Partner and sale boxes at the bottom of the order emails above (thanks, paid, packed, shipped, delivered). PepKeep is on to start.", ch: "In emails", link: "#emailpromos" }] }
  ];
  async function emailsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const since = new Date(); since.setDate(since.getDate() - 30);
    const [log, last] = await Promise.all([
      P.client().from("order_audit_log").select("action_type,old_value,new_value,order_number,created_at").in("action_type", ["email_sent", "email_failed"]).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(1000),
      P.client().from("orders").select("*").order("created_at", { ascending: false }).limit(1)]);
    const L = window.PSTOps.LABEL || {}, sent = {}, failed = [];
    (log.data || []).forEach(r => { const k = Object.keys(L).find(x => L[x] === r.old_value) || r.old_value; if (r.action_type === "email_sent") sent[k] = (sent[k] || 0) + 1; else failed.push(r); });
    const sample = (last.data || [])[0] || null;
    el.innerHTML = `<p class="muted small">Every message your shop sends, and what makes it go out. Counts are emails sent from the app in the last 30 days.</p>
${failed.length ? `<div class="notice err">${failed.length} email${failed.length === 1 ? "" : "s"} failed in the last 30 days. Newest: ${esc(failed[0].old_value || "")} for ${esc(failed[0].order_number || "")} (${esc(String(failed[0].new_value || "").split("|").slice(2).join("|").trim() || "no detail")}).</div>` : ""}
${ROWS.map(sec => `<h2 class="serif osec">${esc(sec.g)}</h2><div class="rtable">${sec.items.map(x => `<div class="emrow"><div class="emhd"><b>${esc(x.t)}</b><span class="opill pend">${esc(x.ch)}</span></div><p class="small muted">${esc(x.when)}</p>${x.warn ? `<p class="small emwarn">${esc(x.warn)}</p>` : ""}
<div class="emft">${sent[x.k] ? `<span class="small">${sent[x.k]} sent in 30 days</span>` : `<span class="small muted">${x.prev ? "none sent from the app in 30 days" : ""}</span>`}${x.prev && sample ? `<button type="button" class="btn ghost sm" data-emp="${x.k}">Preview</button>` : ""}${x.link ? `<a class="btn ghost sm" href="owner.html${x.link}">Open</a>` : ""}</div></div>`).join("")}</div>`).join("")}
<p class="muted small">Previews use your newest order (${sample ? esc(sample.order_number || "") : "none yet"}) so you see real names and totals. Nothing is sent from this page.</p>`;
    el.onclick = async e => { const b = e.target.closest("[data-emp]"); if (!b || !sample) return; b.disabled = true;
      const w = P.sheet(`<div class="osheet"><h2 class="serif">${esc(ROWS.flatMap(s => s.items).find(x => x.k === b.dataset.emp)?.t || "Email")}</h2><p class="muted small" data-ems>Loading the real template…</p><iframe class="eframe" title="Email preview" data-emf></iframe></div>`, { label: "Email preview" }); w.classList.add("full");
      try { const pv = await window.PSTOps.emailPreview(sample, b.dataset.emp); w.querySelector("[data-emf]").srcdoc = pv.html || "<p>No preview</p>"; w.querySelector("[data-ems]").textContent = pv.subject ? `Subject: ${pv.subject}` : ""; }
      catch (err) { w.querySelector("[data-ems]").textContent = "Preview failed: " + (err.message || err); }
      b.disabled = false; };
  }
  window.PSTOps8 = { emailsPane };
})();
