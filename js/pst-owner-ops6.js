/* Pep Shop Texas · owner app stage 3 (v5.0), part 3: reports + expenses + payment methods (= reports.html).
   Same status rules (status wins unless "pending", then order_status), same revenue classes, same tables.
   Deliberate fixes vs his page are marked FIX and listed in the stage 3 notes. */
(function () {
  "use strict";
  const P = window.PST, { $$, esc, money } = P;
  const norm = v => String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const first = (o, ks) => { for (const k of ks) { const v = o?.[k]; if (v !== undefined && v !== null && v !== "" && Number(v) !== 0) return v; } return 0; }; // his `a || b || c`
  const effStatus = o => { const s = o.status, x = o.order_status; if (s && norm(s) !== "pending") return s; if (x && norm(x) !== "pending") return x; return s || x || "no_status_legacy"; };
  const REAL = ["shipped", "delivered", "complete", "completed"], EXCL = ["rejected", "reject", "cancelled", "canceled", "cancelled_order", "canceled_order", "inventory_failed", "failed", "refunded", "void", "voided"];
  const klass = o => { const s = norm(effStatus(o)); return REAL.includes(s) ? "realized" : EXCL.includes(s) ? "excluded" : "pending"; };
  const oTotal = o => num(first(o, ["total", "total_amount", "order_total", "grand_total"])), oTax = o => num(first(o, ["tax_amount", "tax", "sales_tax"])), oShip = o => num(first(o, ["shipping_amount", "shipping", "shipping_total"])), oDisc = o => num(first(o, ["discount_amount", "discount", "discount_total"])), oSub = o => num(first(o, ["subtotal", "subtotal_amount", "items_subtotal", "product_subtotal"]));
  const oDate = o => o.created_at || o.order_date || o.date || o.submitted_at || o.created || null;
  const oNum = o => o.order_number || o.order_no || o.order_id || o.id || "—";
  const oName = o => o.shipping_name || o.customer_name || [o.first_name, o.last_name].filter(Boolean).join(" ") || String(o.customer_email || o.shipping_email || "").split("@")[0] || "Customer";
  const oEmail = o => o.customer_email || o.email || o.contact_email || o.shipping_email || o.billing_email || "";
  const z = n => String(n).padStart(2, "0"), ymd = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const dayKey = v => { const d = new Date(v); return isNaN(d) ? "" : ymd(d); };
  const csvCell = v => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function download(name, rows, crlf) { const blob = new Blob([rows.map(r => r.map(csvCell).join(",")).join(crlf ? "\r\n" : "\n")], { type: "text/csv" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  /* ---- range (local time, like his reports page) ---- */
  let R = { k: "last7", s: "", e: "" };
  try { const s = JSON.parse(sessionStorage.getItem("pst_owner_report_range") || "null"); if (s?.k) R = s; } catch { /* ignore */ }
  function bounds() {
    const t = new Date(); t.setHours(0, 0, 0, 0); const back = n => { const d = new Date(t); d.setDate(d.getDate() - n); return d; };
    let s = null, e = null;
    if (R.k === "today") { s = t; e = t; } else if (R.k === "last7") { s = back(6); e = t; } else if (R.k === "last30") { s = back(29); e = t; } else if (R.k === "last90") { s = back(89); e = t; }
    else if (R.k === "custom") { const p = v => { if (!v) return null; const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); }; s = p(R.s); e = p(R.e); }
    const end = e ? new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999) : null;
    const days = s && end ? Math.max(1, Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - s) / 864e5) + 1) : null; // FIX: his Last 90 used 1, custom counted an extra day
    return { s, end, days };
  }
  const label = () => ({ today: "Today", last7: "Last 7 days", last30: "Last 30 days", last90: "Last 90 days", all: "All time" }[R.k] || `${R.s || "start"} to ${R.e || "today"}`);
  const inRange = (v, b) => { if (R.k === "all") return true; if (!v) return false; const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? (([y, m, dd]) => new Date(y, m - 1, dd))(String(v).split("-").map(Number)) : new Date(v); if (isNaN(d)) return false; return (!b.s || d >= b.s) && (!b.end || d <= b.end); }; // FIX: plain dates read as local days

  async function pageAll(build) { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await build().range(from, from + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; } return out; }
  let D = null;
  async function load() {
    const b = bounds(), q = () => { let x = P.client().from("orders").select("*").order("created_at", { ascending: true }); if (R.k !== "all") { if (b.s) x = x.gte("created_at", b.s.toISOString()); if (b.end) x = x.lte("created_at", b.end.toISOString()); } return x; };
    const [orders, inv, cat, inc, exp, mv] = await Promise.all([pageAll(q), pageAll(() => P.client().from("product_inventory").select("*").order("product_key")), pageAll(() => P.client().from("product_catalog").select("*").order("product_key")),
      pageAll(() => P.client().from("incoming_inventory").select("*").order("created_at")), pageAll(() => P.client().from("operating_expenses").select("*").order("created_at")),
      (() => { let x = P.client().from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(500); if (R.k !== "all") { if (b.s) x = x.gte("created_at", b.s.toISOString()); if (b.end) x = x.lte("created_at", b.end.toISOString()); } return x; })()]);
    const items = []; for (let i = 0; i < orders.length; i += 150) { const { data, error } = await P.client().from("order_items").select("*").in("order_id", orders.slice(i, i + 150).map(o => o.id)); if (error) throw error; items.push(...(data || [])); } // FIX: his single request failed silently past a few hundred orders
    D = { b, orders: orders.filter(o => inRange(oDate(o), b)), inv, cat, inc, exp, mv: (mv.data || []), items };
  }
  function productRows(orderSet) {
    const ids = new Set(orderSet.map(o => String(o.id))), byId = Object.fromEntries(D.cat.map(c => [String(c.id), c])), byKey = Object.fromEntries(D.cat.map(c => [c.product_key, c])), rows = {};
    D.items.filter(i => ids.has(String(i.order_id))).forEach(i => {
      const c = byKey[i.product_key] || byId[String(i.product_id)] || null, name = c ? c.display_name : (i.product_name || i.name || "Unknown product"), str = c ? c.strength : (i.product_strength || i.strength || "");
      const lab = str && !String(name).toLowerCase().includes(String(str).toLowerCase()) ? `${name} ${str}` : name, k = c?.product_key || `n:${norm(lab)}`;
      const q = num(i.quantity ?? i.qty ?? i.vials ?? 1), lt = i.line_total ?? i.total ?? i.subtotal ?? i.amount, line = lt !== null && lt !== undefined && Number.isFinite(Number(lt)) ? Number(lt) : q * num(i.unit_price ?? i.price ?? i.sale_price); // FIX: qty 0 stays 0; a $0 (free) line stays $0
      const r = rows[k] ||= { k, label: lab, sku: c?.product_key || i.product_key || "", qty: 0, sales: 0 }; r.qty += q; r.sales += line;
    });
    return Object.values(rows);
  }
  const tot = list => list.reduce((t, o) => ({ n: t.n + 1, gross: t.gross + oTotal(o), tax: t.tax + oTax(o), ship: t.ship + oShip(o), disc: t.disc + oDisc(o) }), { n: 0, gross: 0, tax: 0, ship: 0, disc: 0 });
  const tile = (l, v, sub) => `<div class="tile"><small>${l}</small><b>${v}</b>${sub ? `<span class="muted small">${sub}</span>` : ""}</div>`;

  /* ---- views ---- */
  function salesView(el) {
    const real = D.orders.filter(o => klass(o) === "realized"), pend = D.orders.filter(o => klass(o) === "pending"), rt = tot(real), pt = tot(pend), prod = productRows(real).sort((a, b) => b.sales - a.sales || b.qty - a.qty || a.label.localeCompare(b.label));
    const units = prod.reduce((s, r) => s + r.qty, 0), itemSales = prod.reduce((s, r) => s + r.sales, 0), top = prod[0];
    const days = {}; real.forEach(o => { const k = dayKey(oDate(o)); if (!k) return; const d = days[k] ||= { n: 0, sales: 0, tax: 0, ship: 0, units: 0 }; d.n++; d.sales += oTotal(o); d.tax += oTax(o); d.ship += oShip(o); });
    D.items.forEach(i => { const o = real.find(x => String(x.id) === String(i.order_id)); if (o) { const k = dayKey(oDate(o)); if (days[k]) days[k].units += num(i.quantity ?? 1); } });
    const dl = Object.entries(days).sort((a, b) => b[0].localeCompare(a[0]));
    el.innerHTML = `<div class="tiles otiles">${tile("Sales (shipped / done)", money(rt.gross))}${tile("Still open", money(pt.gross), `${pt.n} order${pt.n === 1 ? "" : "s"}`)}${tile("Orders done", rt.n)}${tile("Average order", money(rt.n ? rt.gross / rt.n : 0))}${tile("Vials sold", units)}${tile("Top product", top ? esc(top.label) : "—", top ? `${top.qty} sold` : "")}</div>
<p class="muted small">Counts orders that are shipped, delivered or complete. Open orders are shown separately. Totals include tax and shipping, like your old report.</p>
<h2 class="serif osec">Top products</h2>${prod.length ? `<div class="rtable">${prod.slice(0, 50).map((r, i) => `<div class="rrow2"><span class="rk">${i + 1}</span><span><b>${esc(r.label)}</b><small>${r.qty} sold · avg ${money(r.qty ? r.sales / r.qty : 0)}</small></span><span class="rv"><b>${money(r.sales)}</b><small>${itemSales ? (r.sales / itemSales * 100).toFixed(1) : "0.0"}%</small></span></div>`).join("")}</div>` : `<p class="muted small">No completed sales in this range.</p>`}
<h2 class="serif osec">By day</h2>${dl.length ? `<div class="rtable">${dl.map(([k, d]) => `<div class="rrow2"><span></span><span><b>${P.fmtDate(k + "T12:00:00")}</b><small>${d.n} order${d.n === 1 ? "" : "s"} · ${d.units} vials · tax ${money(d.tax)} · ship ${money(d.ship)}</small></span><span class="rv"><b>${money(d.sales)}</b><small>avg ${money(d.sales / d.n)}</small></span></div>`).join("")}</div>` : `<p class="muted small">Nothing yet.</p>`}
<button class="btn ghost wide" type="button" data-rx="sales">Download sales (CSV)</button>`;
    el._csv = () => download(`pep-shop-texas-sales-${R.k}-${ymd(new Date())}.csv`, [["Pep Shop Texas Sales Report"], ["Generated", new Date().toLocaleString()], [], ["Daily Sales Breakdown"], ["Date", "Realized Orders", "Realized Sales", "Units Sold", "Tax Collected", "Shipping Collected", "Average Order"],
      ...dl.map(([k, d]) => [new Date(k + "T12:00:00").toLocaleDateString(), d.n, d.sales.toFixed(2), d.units, d.tax.toFixed(2), d.ship.toFixed(2), (d.sales / d.n).toFixed(2)]), [], ["Top Products by Sales"], ["Rank", "Product", "SKU", "Qty Sold", "Sales", "Avg Price"],
      ...prod.map((r, i) => [i + 1, r.label, r.sku, r.qty, r.sales.toFixed(2), (r.qty ? r.sales / r.qty : 0).toFixed(2)])], true);
  }
  const ORDER = ["pending", "awaiting_payment", "processing", "packed", "shipped", "delivered", "complete", "cancelled", "rejected", "no_status_legacy"];
  function ordersView(el) {
    const live = D.orders.filter(o => klass(o) !== "excluded"), ex = D.orders.filter(o => klass(o) === "excluded"), t = tot(live), xt = tot(ex), g = {};
    D.orders.forEach(o => { const s = norm(effStatus(o)); const x = g[s] ||= { n: 0, total: 0 }; x.n++; x.total += oTotal(o); });
    const st = Object.entries(g).sort((a, b) => { const i = ORDER.indexOf(a[0]), j = ORDER.indexOf(b[0]); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a[0].localeCompare(b[0]); });
    const list = [...D.orders].sort((a, b) => new Date(oDate(b) || 0) - new Date(oDate(a) || 0));
    el.innerHTML = `<div class="tiles otiles">${tile("Orders", t.n)}${tile("Order totals", money(t.gross))}${tile("Tax collected", money(t.tax))}${tile("Shipping collected", money(t.ship))}${tile("Discounts given", money(t.disc))}${tile("Average order", money(t.n ? t.gross / t.n : 0))}</div>
${ex.length ? `<p class="muted small">Not counted: ${ex.length} cancelled, rejected or refunded order${ex.length === 1 ? "" : "s"} (${money(xt.gross)}).</p>` : ""}
<h2 class="serif osec">By status</h2><div class="rtable">${st.map(([s, x]) => `<div class="rrow2"><span></span><span><b>${s === "no_status_legacy" ? "No status (old)" : esc(s.replace(/_/g, " "))}</b><small>${x.n} order${x.n === 1 ? "" : "s"}</small></span><span class="rv"><b>${money(x.total)}</b></span></div>`).join("") || `<p class="muted small">No orders.</p>`}</div>
<h2 class="serif osec">Orders</h2><div class="rtable">${list.slice(0, 200).map(o => `<button type="button" class="rrow2 rbtn" data-ord="${esc(o.id)}"><span></span><span><b>#${esc(oNum(o))} · ${esc(oName(o))}</b><small>${new Date(oDate(o)).toLocaleString([], { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" })} · ${esc(String(effStatus(o)).replace(/_/g, " "))}</small></span><span class="rv"><b>${money(oTotal(o))}</b><small class="rc ${klass(o)}">${{ realized: "done", pending: "open", excluded: "not counted" }[klass(o)]}</small></span></button>`).join("")}</div>${list.length > 200 ? `<p class="muted small">Showing the newest 200. The download has all ${list.length}.</p>` : ""}
<button class="btn ghost wide" type="button" data-rx="orders">Download orders (CSV)</button>`;
    el._csv = () => download(`pep-shop-texas-orders-${R.k}-${ymd(new Date())}.csv`, [["Date", "Order #", "Customer", "Email", "Status", "Payment", "Revenue Class", "Subtotal", "Discount", "Tax", "Shipping", "Total"],
      ...list.map(o => [oDate(o) ? new Date(oDate(o)).toLocaleString() : "", oNum(o), oName(o), oEmail(o), String(effStatus(o)).replace(/_/g, " "), String(o.payment_status || o.payment || "pending").replace(/_/g, " "), { realized: "Realized", pending: "Pending / Open", excluded: "Excluded" }[klass(o)], oSub(o).toFixed(2), oDisc(o).toFixed(2), oTax(o).toFixed(2), oShip(o).toFixed(2), oTotal(o).toFixed(2)])], true);
  }
  const CATS = ["Supplies", "Shipping Supplies", "Peptide Bags", "Packaging", "Merchandise", "Website / Software", "Payment Fees", "Operating Cost", "Misc Expense"];
  function moneyView(el) {
    const b = D.b, real = D.orders.filter(o => klass(o) === "realized"), pend = D.orders.filter(o => klass(o) === "pending"), rt = tot(real), pt = tot(pend);
    const poRows = D.inc.filter(r => String(r.status || "").toLowerCase() !== "cancelled" && inRange(r.ordered_at || r.created_at || r.date_ordered, b)); // FIX: cancelled PO lines weren't paid
    const poCost = r => { const x = num(r.total_cost ?? r.total_paid ?? r.amount_paid); return x > 0 ? x : num(r.ordered_quantity) * num(r.cost_per_unit ?? r.unit_cost) + num(r.shipping_cost ?? r.freight_cost ?? r.fees); };
    const spend = poRows.reduce((s, r) => s + poCost(r), 0), exps = D.exp.filter(e => inRange(e.date || e.created_at, b)).sort((a, c) => String(c.date || c.created_at).localeCompare(String(a.date || a.created_at))), expT = exps.reduce((s, e) => s + num(e.amount), 0);
    const pos = Object.values(poRows.reduce((m, r) => { const k = r.po_number || r.id, x = m[k] ||= { po: r.po_number || "(no number)", vendor: r.vendor_name || r.supplier_name || "Vendor", d: dayKey(r.ordered_at || r.created_at), total: 0, lines: 0, open: false }; x.total += poCost(r); x.lines++; if (!["received", "cancelled"].includes(String(r.status || "").toLowerCase())) x.open = true; return m; }, {}));
    const profit = rt.gross - rt.tax - spend - expT; // FIX: his profit counted sales tax (money you owe) as profit
    const catBy = Object.fromEntries(D.cat.map(c => [c.product_key, c])), lastCost = {};
    [...D.inc].filter(r => r.received_at && num(r.cost_per_unit) > 0).sort((a, c) => new Date(a.received_at) - new Date(c.received_at)).forEach(r => { if (r.product_key) lastCost[r.product_key] = num(r.cost_per_unit); });
    let invVal = 0, potRev = 0, units = 0; D.inv.forEach(r => { const q = Math.max(0, num(r.current_inventory)); if (!q) return; const c = num(r.cost_per_unit) || lastCost[r.product_key] || 0, cat = catBy[r.product_key] || {}, price = cat.sale_enabled && num(cat.sale_price) > 0 ? num(cat.sale_price) : num(cat.price ?? r.price); units += q; invVal += q * c; potRev += q * price; });
    el.innerHTML = `<div class="tiles otiles">${tile("Sales (shipped / done)", money(rt.gross))}${tile("Still open", money(pt.gross))}${tile("Sales tax in that", money(rt.tax), "you owe this, so it's left out of profit")}${tile("Bought from vendors", money(spend), `${poRows.length} PO line${poRows.length === 1 ? "" : "s"}`)}${tile("Other expenses", money(expT), `${exps.length} entr${exps.length === 1 ? "y" : "ies"}`)}${tile("Estimated profit", `<span class="${profit >= 0 ? "okc" : "badc"}">${money(profit)}</span>`, "sales − tax − vendors − expenses")}</div>
<h2 class="serif osec">On the shelf now</h2><div class="tiles otiles">${tile("Vials", units)}${tile("What they cost you", money(invVal))}${tile("What they'd sell for", money(potRev))}${tile("Potential profit", money(potRev - invVal))}</div>
<div class="pmtop"><h2 class="serif osec" style="flex:1;margin:0">Expenses</h2><button class="btn primary sm" type="button" data-exnew>+ Add</button></div>
<p class="muted small">Purchase orders land here on their own (${money(spend)}). Add anything else you pay for: supplies, shipping, fees.</p>
<div class="rtable">${[...pos.map(x => ({ ...x, kind: "po" })), ...exps.map(e => ({ kind: "ex", e, d: String(e.date || e.created_at || "").slice(0, 10) }))].sort((a, c) => String(c.d).localeCompare(String(a.d))).map(x => x.kind === "po"
      ? `<button type="button" class="rrow2 rbtn" data-expo="${esc(x.po)}"><span></span><span><b>${esc(x.vendor)}</b><small>${x.d ? P.fmtDate(x.d + "T12:00:00") : ""} · Purchase order ${esc(x.po)} · ${x.lines} line${x.lines === 1 ? "" : "s"}${x.open ? " · not received yet" : ""}</small></span><span class="rv"><b>${money(x.total)}</b><small class="muted">auto</small></span></button>`
      : `<button type="button" class="rrow2 rbtn" data-exid="${esc(x.e.id)}"><span></span><span><b>${esc(x.e.company_name || x.e.category || "Expense")}</b><small>${x.e.date ? P.fmtDate(String(x.e.date).slice(0, 10) + "T12:00:00") : ""} · ${esc(x.e.category || "")}${x.e.description ? ` · ${esc(x.e.description)}` : ""}${x.e.method ? ` · ${esc(x.e.method)}` : ""}</small></span><span class="rv"><b>${money(x.e.amount)}</b></span></button>`).join("") || `<p class="muted small">No expenses in this range.</p>`}</div>
<div class="tiles otiles">${tile("All expenses", money(spend + expT), "purchase orders + other")}</div>`;
    el._exps = exps;
  }
  function expenseSheet(e, then) {
    const v = e || { date: ymd(new Date()), category: CATS[0] }; // FIX: his default date was the UTC day (tomorrow after 7pm)
    const w = P.sheet(`<form class="osheet"><h2 class="serif">${e ? "Edit expense" : "Add an expense"}</h2>
<div class="pm2"><label>Date<input name="date" type="date" required value="${esc(String(v.date || "").slice(0, 10))}"></label><label>Amount ($)<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${e ? num(e.amount).toFixed(2) : ""}"></label></div>
<label>Company<input name="company_name" value="${esc(v.company_name || "")}"></label><label>Category<select name="category">${[...new Set([...CATS, v.category].filter(Boolean))].map(c => `<option${c === v.category ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
<label>Description<input name="description" value="${esc(v.description || "")}"></label><label>Paid with<input name="method" value="${esc(v.method || "")}" placeholder="Card, Venmo, cash…"></label>
<p class="status" data-exs></p><button class="btn primary wide" type="submit">${e ? "Save" : "Add expense"}</button>${e ? `<button class="btn danger wide" type="button" data-exdel style="margin-top:8px">Delete</button>` : ""}</form>`, { label: "Expense" });
    const f = w.querySelector("form"), st = f.querySelector("[data-exs]");
    f.addEventListener("submit", async ev => { ev.preventDefault(); const amt = Number(f.amount.value); if (!(amt > 0)) { st.textContent = "Enter an amount greater than zero."; return; }
      const now = new Date().toISOString(), row = { date: f.date.value, company_name: f.company_name.value.trim(), category: f.category.value, description: f.description.value.trim(), amount: amt, method: f.method.value.trim(), updated_at: now };
      let r; if (e) r = await P.client().from("operating_expenses").update(row).eq("id", e.id).select("*").maybeSingle();
      else { const u = await P.getUser(); r = await P.client().from("operating_expenses").insert({ id: crypto.randomUUID(), ...row, created_at: now, created_by: u?.id || null, created_by_email: u?.email || null }).select("*").maybeSingle(); }
      if (r.error) { st.textContent = r.error.message; return; } P.closeSheet(); P.toast(e ? "Expense saved" : "Expense added"); then(); }); // FIX: his page quietly fell back to this-browser-only on an error
    f.querySelector("[data-exdel]")?.addEventListener("click", async ev => { const btn = ev.target; if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = "Tap again to delete"; return; }
      const { error } = await P.client().from("operating_expenses").delete().eq("id", e.id); if (error) { st.textContent = error.message; return; } P.closeSheet(); P.toast("Expense deleted"); then(); });
  }
  function movesView(el) {
    const byKey = Object.fromEntries(D.inv.map(r => [r.product_key, r]));
    el.innerHTML = `<p class="muted small">Every stock change in this range, newest first${D.mv.length >= 500 ? " (newest 500)" : ""}.</p><div class="rtable">${D.mv.map(m => { const q = num(m.quantity_change ?? m.qty_change ?? m.change ?? m.quantity), p = byKey[m.product_key]; return `<div class="rrow2"><span></span><span><b>${esc(p ? `${p.display_name} ${p.strength || ""}` : m.product_key || "Product")}</b><small>${new Date(m.created_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${esc(String(m.movement_type || m.type || "").replace(/_/g, " "))} · ${m.previous_quantity ?? "—"} → ${m.new_quantity ?? "—"}${m.created_by_email ? ` · ${esc(m.created_by_email)}` : ""}${m.admin_note ? `<br>${esc(m.admin_note)}` : ""}</small></span><span class="rv"><b class="${q >= 0 ? "okc" : "badc"}">${q > 0 ? "+" : ""}${q}</b></span></div>`; }).join("") || `<p class="muted small">No stock changes in this range.</p>`}</div>`;
  }

  let tab = "sales";
  async function reportsPane(el) {
    const draw = async () => {
      el.innerHTML = `<div class="schips" role="tablist">${[["today", "Today"], ["last7", "7 days"], ["last30", "30 days"], ["last90", "90 days"], ["all", "All time"], ["custom", "Custom"]].map(([k, l]) => `<button type="button" class="chip${R.k === k ? " on" : ""}" data-rg="${k}">${l}</button>`).join("")}</div>
${R.k === "custom" ? `<div class="pm2"><label>From<input type="date" data-rs value="${esc(R.s)}"></label><label>To<input type="date" data-re value="${esc(R.e)}"></label></div>` : ""}
<div class="oseg" role="tablist">${[["sales", "Sales"], ["orders", "Orders"], ["money", "Money"], ["moves", "Stock moves"]].map(([k, l]) => `<button type="button" class="${tab === k ? "on" : ""}" data-rt="${k}">${l}</button>`).join("")}</div>
<p class="muted small" data-rlab>${esc(label())}</p><div data-rbody><p class="muted small">Adding it up…</p></div>
<p class="mlinks"><a href="owner.html#writer">Report writer</a><a href="owner.html#paymethods">Payment methods</a></p>`;
      const body = el.querySelector("[data-rbody]");
      try { if (!D || D._k !== JSON.stringify(R)) { await load(); D._k = JSON.stringify(R); } } catch (e) { body.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
      ({ sales: salesView, orders: ordersView, money: moneyView, moves: movesView })[tab](body);
      body.onclick = e => { const x = e.target.closest("[data-rx]"); if (x) { body._csv && body._csv(); return; }
        const o = e.target.closest("[data-ord]"); if (o) { window.PSTOps.openOrder(o.dataset.ord); return; }
        if (e.target.closest("[data-exnew]")) { expenseSheet(null, () => { D = null; draw(); }); return; }
        const xp = e.target.closest("[data-expo]"); if (xp) { window.PSTOps3.poOpen(xp.dataset.expo, () => { D = null; draw(); }); return; }
        const ex = e.target.closest("[data-exid]"); if (ex) expenseSheet(body._exps.find(r => String(r.id) === ex.dataset.exid), () => { D = null; draw(); }); };
    };
    const save = () => { try { sessionStorage.setItem("pst_owner_report_range", JSON.stringify(R)); } catch { /* ignore */ } };
    el.onclick = e => { const g = e.target.closest("[data-rg]"); if (g) { R.k = g.dataset.rg; if (R.k === "custom" && !R.s) { const d = new Date(); R.e = ymd(d); d.setDate(1); R.s = ymd(d); } save(); draw(); return; }
      const t = e.target.closest("[data-rt]"); if (t) { tab = t.dataset.rt; draw(); } };
    el.onchange = e => { if (e.target.matches("[data-rs],[data-re]")) { R.k = "custom"; R.s = el.querySelector("[data-rs]").value; R.e = el.querySelector("[data-re]").value; save(); draw(); } };
    D = null; draw();
  }

  /* ================= PAYMENT METHODS (= reports.html Payment Methods Manager) ================= */
  const DEF = [
    { id: "venmo", label: "Venmo", accountLabel: "Send payment to", enabled: false, discountPercent: 0, account: "", qrUrl: "", instructions: "Please include your order number in the Venmo note. Your order will remain pending until payment is verified." },
    { id: "zelle", label: "Zelle", accountLabel: "Send payment to", enabled: false, discountPercent: 5, account: "", qrUrl: "", instructions: "Please send payment by Zelle and include your order number if possible. Your order will remain pending until payment is verified." },
    { id: "bitcoin", label: "Bitcoin", accountLabel: "Wallet address", enabled: false, discountPercent: 10, account: "", qrUrl: "", instructions: "Send the exact order total. Your order will remain pending until the transaction is confirmed." },
    { id: "credit_card", label: "Credit Card", accountLabel: "Payment instructions", enabled: false, discountPercent: 0, account: "", qrUrl: "", instructions: "Credit card payment instructions will be provided after order review. Your order will remain pending until payment is verified." },
    { id: "apple_pay", label: "Apple Pay", accountLabel: "Send payment to", enabled: false, discountPercent: 5, account: "", qrUrl: "", instructions: "Send payment using Apple Cash / Apple Pay and include your order number. Your order will remain pending until payment is verified." },
    { id: "google_pay", label: "Google Pay", accountLabel: "Send payment to", enabled: false, discountPercent: 0, account: "", qrUrl: "", instructions: "Send payment using Google Pay and include your order number. Your order will remain pending until payment is verified." }];
  const pct = (v, f = 0) => { const n = Number(v); return Math.min(100, Math.max(0, Number.isFinite(n) ? n : Number(f || 0))); };
  function normPM(row) { // = normalizePSTPaymentMethodsAdmin
    let m = null; if (Array.isArray(row)) m = row; else if (row && Array.isArray(row.payment_methods)) m = row.payment_methods; else if (row && typeof row.payment_methods === "string") { try { m = JSON.parse(row.payment_methods); } catch { /* ignore */ } }
    const d = DEF.map(x => ({ ...x })), ids = d.map(x => x.id), by = Object.fromEntries(d.map(x => [x.id, x]));
    (m || []).forEach(x => { const id = String(x.id || x.key || "").trim(); if (!id) return; const ex = by[id] || { id, label: String(x.label || id).trim(), accountLabel: "Send payment to", enabled: false, discountPercent: 0, account: "", qrUrl: "", instructions: "Order will remain pending until payment is confirmed." }; if (!by[id]) ids.push(id);
      by[id] = { ...ex, ...x, enabled: x.enabled === true || String(x.enabled || "").toLowerCase() === "true", discountPercent: pct(x.discountPercent ?? x.discount_percent, ex.discountPercent), account: String(x.account || x.handle || x.wallet || x.value || "").trim(), qrUrl: String(x.qrUrl || x.qr_url || x.qr || "").trim(), instructions: String(x.instructions || x.note || x.notes || ex.instructions || "").trim() }; });
    if (row && (row.venmo_enabled || row.venmo_handle || row.venmo_note)) { by.venmo.enabled = row.venmo_enabled === true || String(row.venmo_enabled || "").toLowerCase() === "true"; by.venmo.account = String(row.venmo_handle || by.venmo.account || "").trim(); by.venmo.instructions = String(row.venmo_note || by.venmo.instructions || "").trim(); }
    return ids.map(id => by[id]);
  }
  async function payMethodsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const { data, error } = await P.client().from("site_payment_options").select("payment_methods, venmo_enabled, venmo_handle, venmo_note, updated_at").eq("id", 1).maybeSingle();
    if (error) { el.innerHTML = `<p class="notice err">${esc(error.message)}</p>`; return; }
    let list = normPM(data || []);
    const draw = () => { el.innerHTML = `<p class="muted small">What shoppers can pay with at checkout. A discount here comes off their order when they pick that method.${data?.updated_at ? ` Last saved ${P.fmtDate(data.updated_at)}.` : ""}</p>
${list.map((m, i) => `<details class="pmcard"${m.enabled ? " open" : ""}><summary><b>${esc(m.label)}</b><span class="opill ${m.enabled ? "ok" : "pend"}">${m.enabled ? "On" : "Off"}</span>${m.discountPercent ? `<span class="muted small">${m.discountPercent}% off</span>` : ""}</summary>
<div class="pmbody" data-pmi="${i}"><label class="toggle"><input type="checkbox" data-pf="enabled"${m.enabled ? " checked" : ""}> Show at checkout</label>
<div class="pm2"><label>Name<input data-pf="label" value="${esc(m.label)}"></label><label>Discount %<input data-pf="discountPercent" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${m.discountPercent}"></label></div>
<div class="pm2"><label>Label<input data-pf="accountLabel" value="${esc(m.accountLabel || "")}"></label><label>Account / handle<input data-pf="account" value="${esc(m.account || "")}"></label></div>
<label>Instructions<textarea data-pf="instructions" rows="3">${esc(m.instructions || "")}</textarea></label>
<label>QR code (link or picture)<input data-pf="qrUrl" value="${esc(String(m.qrUrl || "").startsWith("data:") ? "" : m.qrUrl || "")}" placeholder="${String(m.qrUrl || "").startsWith("data:") ? "Picture saved" : "https://…"}"></label>
<label class="btn ghost wide adpick">Upload a QR picture<input type="file" accept="image/*" data-pq hidden></label>${m.qrUrl ? `<img class="pmqr" src="${esc(m.qrUrl)}" alt="QR">` : ""}</div></details>`).join("")}
<button class="btn ghost wide" type="button" data-pmadd>+ Add a payment method</button><p class="status" data-pms role="status"></p><div class="rrbar"><button class="btn primary wide" type="button" data-pmsave>Save payment methods</button></div>`; };
    const read = () => { $$("[data-pmi]", el).forEach(b => { const m = list[+b.dataset.pmi]; $$("[data-pf]", b).forEach(x => { const k = x.dataset.pf; if (k === "enabled") m.enabled = x.checked; else if (k === "discountPercent") m.discountPercent = pct(x.value, 0); else if (k === "qrUrl") { if (x.value.trim() || !String(m.qrUrl || "").startsWith("data:")) m.qrUrl = x.value.trim(); } else m[k] = x.value.trim(); }); }); };
    el.onchange = async e => { const q = e.target.closest("[data-pq]"); if (!q) return; const file = q.files[0]; if (!file) return; if (file.size > 450000) { P.toast("Pick a picture under 450 KB"); return; }
      const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(file); }); read(); list[+q.closest("[data-pmi]").dataset.pmi].qrUrl = url; draw(); };
    el.onclick = async e => {
      if (e.target.closest("[data-pmadd]")) { read(); const ids = new Set(list.map(m => m.id)); let n = list.filter(m => String(m.id).startsWith("custom_")).length + 1; while (ids.has(`custom_${n}`)) n++;
        list.push({ id: `custom_${n}`, label: "New Payment Method", accountLabel: "Send payment to", enabled: false, discountPercent: 0, account: "", qrUrl: "", instructions: "Order will remain pending until payment is confirmed." }); draw(); return; }
      if (e.target.closest("[data-pmsave]")) { read(); list = normPM(list); const v = list.find(m => m.id === "venmo") || {};
        const { error: er } = await P.client().from("site_payment_options").upsert({ id: 1, payment_methods: list, venmo_enabled: !!v.enabled, venmo_handle: v.account || "", venmo_note: v.instructions || "", updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (er) { el.querySelector("[data-pms]").textContent = er.message; return; } P.toast("Payment methods saved · checkout uses them now"); draw(); }
    };
    draw();
  }
  window.PSTOps6 = { reportsPane, payMethodsPane, effStatus, klass };
})();
