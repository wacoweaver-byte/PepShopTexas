/* Pep Shop Texas · owner app: Gold Standard lab (v545 + v546)
   More → Gold Standard lab. Everything goes through the pst-gsa server function (owners only):
   - Connect once: Gold Standard then tells the shop the moment a certificate is published.
   - Needs you: certificates the server couldn't place by item # (pick the product, or "Not ours").
   - Certificates: what came back and where it went (on a product, didn't pass, withdrawn).
   - Order a test: pick products, tests and speed, see the price with the shipping label, pay by card.
     Each sample's lot is written as "<item #> · <vendor lot>", so the certificate finds its product by itself. */
(() => {
  const P = window.PST, esc = P.esc;
  const usd = c => (Number(c || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const ALIAS = { pstcg1: "hCG", pst2tr: "Tirzepatide", pst3rt: "Retatrutide", fst344: "Follistatin 344", thymosinalpha1: "Thymosin α1", wolverine: "BPC-157 / TB-500 blend" }; // his names → Gold Standard's
  const compoundOf = p => { const n = String(p.display_name || "").split("(")[0].trim(); return ALIAS[n.toLowerCase().replace(/[^a-z0-9]/g, "")] || n; };
  const pname = p => p ? `${p.display_name}${p.strength ? ` ${p.strength}` : ""}` : "";
  let el = null, prods = [], byKey = {};

  async function api(action, body = {}) {
    const { data } = await P.client().auth.getSession(); const t = data?.session?.access_token;
    if (!t) throw new Error("Sign in to the owner app first.");
    const r = await fetch(`${P.CFG.url}/functions/v1/pst-gsa`, { method: "POST", headers: { "Content-Type": "application/json", apikey: P.CFG.key, Authorization: `Bearer ${t}` }, body: JSON.stringify({ action, ...body }) }).catch(() => null);
    if (!r) throw new Error("Couldn't reach the server. Check your connection.");
    if (r.status === 404) throw new Error("The Gold Standard connection isn't installed on the server yet.");
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || `Something went wrong (${r.status}).`); e.code = j.code; e.details = j.details; throw e; } return j;
  }

  const PILL = { attached: ["On the site", "ok"], suggested: ["Needs you", "pend"], unmatched: ["Needs you", "pend"], failed: ["Didn't pass", "bad"], retracted: ["Withdrawn", "bad"], dismissed: ["Hidden", "pend"] };
  const STATUS = { placed: "Placed", invoice_sent: "Waiting on payment", overdue: "Payment overdue", paid: "Paid", label_generated: "Label ready", in_transit: "On the way to the lab", sample_received: "At the lab", in_lab: "Testing", reporting: "Writing the report", completed: "Done" };

  async function pane(root) {
    el = root; el.innerHTML = `<p class="muted small">Loading…</p>`;
    let s; try { [s, prods] = await Promise.all([api("status"), P.products().catch(() => [])]); } catch (e) { el.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
    byKey = Object.fromEntries(prods.map(p => [p.product_key, p]));
    const sorted = [...prods].sort((a, b) => pname(a).localeCompare(pname(b)));
    const need = s.coas.filter(c => ["suggested", "unmatched"].includes(c.status)), rest = s.coas.filter(c => !["suggested", "unmatched"].includes(c.status));
    const opts = (cands) => { const c = (cands || []).filter(k => byKey[k]); return `<option value="">Pick the product…</option>${c.length ? `<optgroup label="Best matches">${c.map(k => `<option value="${esc(k)}">${esc(pname(byKey[k]))} · ${esc(k)}</option>`).join("")}</optgroup>` : ""}<optgroup label="All products">${sorted.map(p => `<option value="${esc(p.product_key)}">${esc(pname(p))} · ${esc(p.product_key)}</option>`).join("")}</optgroup>`; };
    const cert = c => `<a class="linkish" href="https://www.goldstandardanalytics.com/coa/${esc(c.accession)}" target="_blank" rel="noopener">${esc(c.accession)} ↗</a>`;
    el.innerHTML = `
${!s.keySet ? `<p class="notice err">The Gold Standard key isn't on the server yet (GSA_API_KEY). Mike can add it.</p>` : s.accountError ? `<p class="notice err">Gold Standard: ${esc(s.accountError)}</p>` : ""}
${s.keySet && !s.connected ? `<div class="osheet"><b>Connect to Gold Standard</b><p class="muted small">One time. After this, Gold Standard tells your shop the moment a certificate is published, and it goes on the right product by itself when the lot has the item #.</p><button class="btn primary wide" type="button" data-gconnect>Connect</button><p class="status" data-gst role="status"></p></div>` : s.connected ? `<p class="small okc">Connected. New certificates arrive here by themselves.</p>` : ""}
${need.length ? `<h2 class="serif osec">Needs you <span class="muted small">(${need.length})</span></h2>${need.map(c => `<div class="osheet" data-gneed="${esc(c.accession)}"><div class="emhd"><b>${esc(c.compound || "Certificate")}</b><span class="opill pend">Needs you</span></div>
<small class="muted">${cert(c)}${c.lot ? ` · Lot ${esc(c.lot)}` : ""}${c.verdict && c.verdict !== "unknown" ? ` · ${esc(c.verdict)}` : ""}</small>${c.note ? `<p class="small">${esc(c.note)}</p>` : ""}
<label>Goes on<select data-gpick>${opts(c.candidates)}</select></label><div class="hask"><button class="btn primary sm" type="button" data-gattach>Attach</button><button class="btn ghost sm" type="button" data-gdismiss>Not ours</button></div></div>`).join("")}` : ""}
<div class="pmtop" style="margin-top:14px"><button class="btn primary" type="button" data-gorder>Order a test</button><button class="btn ghost" type="button" data-gadd>Add a certificate by number</button></div>
<h2 class="serif osec">Test orders</h2>${s.orders.length ? `<div class="rtable">${s.orders.map(o => `<div class="osheet"><div class="emhd"><b>${esc(o.reference)}</b><span class="opill ${o.status === "completed" ? "ok" : "pend"}">${esc(STATUS[o.status] || o.status || "Placed")}</span></div>
<small class="muted">${P.fmtDate(o.created_at)} · ${esc((o.items || []).map(i => byKey[i.product_key] ? pname(byKey[i.product_key]) : i.compound).join(", "))}${o.total_cents ? ` · ${usd(o.total_cents)}` : ""}</small>
<div class="hask">${o.payment_url && ["placed", "invoice_sent", "overdue"].includes(o.status || "placed") ? `<a class="btn primary sm" href="${esc(o.payment_url)}" target="_blank" rel="noopener">Pay</a>` : ""}<button class="btn ghost sm" type="button" data-glabel="${esc(o.reference)}">Shipping label</button><button class="btn ghost sm" type="button" data-gtrack="${esc(o.reference)}">Track</button></div></div>`).join("")}</div>` : `<p class="muted small">No test orders from the app yet.</p>`}
<h2 class="serif osec">Certificates</h2>${rest.length ? `<div class="rtable">${rest.map(c => { const pl = PILL[c.status] || [c.status, "pend"]; return `<div class="osheet"><div class="emhd"><b>${esc(c.product_key && byKey[c.product_key] ? pname(byKey[c.product_key]) : c.compound || c.accession)}</b><span class="opill ${pl[1]}">${esc(pl[0])}</span></div><small class="muted">${cert(c)}${c.lot ? ` · Lot ${esc(c.lot)}` : ""} · ${P.fmtDate(c.updated_at)}</small>${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ""}</div>`; }).join("")}</div>` : `<p class="muted small">Nothing yet. When Gold Standard publishes a certificate it shows up here.</p>`}
<p class="muted small" style="margin-top:14px">Tip: when you send samples any other way (their website or Telegram), put the item # in the lot field, like <b>PSTP100063 · vendor lot</b>.</p>`;
  }

  async function onClick(e) {
    const t = e.target;
    if (t.closest("[data-gconnect]")) { const b = t.closest("button"), st = el.querySelector("[data-gst]"); b.disabled = true; st.textContent = "Connecting…"; try { await api("connect"); P.toast("Connected to Gold Standard"); pane(el); } catch (er) { st.textContent = er.message; st.className = "status bad"; b.disabled = false; } return; }
    const card = t.closest("[data-gneed]");
    if (card && t.closest("[data-gattach]")) { const key = card.querySelector("[data-gpick]").value; if (!key) { P.toast("Pick the product first."); return; } try { await api("attach", { accession: card.dataset.gneed, product_key: key }); P.toast(`On ${pname(byKey[key])} now`); pane(el); } catch (er) { P.toast(er.message); } return; }
    if (card && t.closest("[data-gdismiss]")) { try { await api("dismiss", { accession: card.dataset.gneed }); pane(el); } catch (er) { P.toast(er.message); } return; }
    if (t.closest("[data-gadd]")) { addSheet(); return; }
    if (t.closest("[data-gorder]")) { orderSheet(); return; }
    const lb = t.closest("[data-glabel]"); if (lb) { lb.disabled = true; try { const r = await api("label", { reference: lb.dataset.glabel }); const d = r.data || r; const u = d.url || d.labelUrl || d.downloadUrl || (r.pdfBase64 ? URL.createObjectURL(new Blob([Uint8Array.from(atob(r.pdfBase64), c => c.charCodeAt(0))], { type: "application/pdf" })) : ""); if (u) window.open(u, "_blank", "noopener"); else P.toast(d.message || "The label isn't ready yet. It's made once the order is paid."); } catch (er) { P.toast(/not.?found|404|not ready/i.test(er.message) ? "The label isn't ready yet. It's made once the order is paid." : er.message); } lb.disabled = false; return; }
    const tr = t.closest("[data-gtrack]"); if (tr) { trackSheet(tr.dataset.gtrack); return; }
  }

  function addSheet() {
    const w = P.sheet(`<form class="osheet" data-gaddf><h2 class="serif">Add a certificate</h2><p class="muted small">For a certificate from before the connection, or one that didn't come through. It's matched the same way: by the item # in its lot, or you pick.</p>
<label>Gold Standard number<input name="acc" required placeholder="GSA-2026-018432" autocapitalize="characters"></label><button class="btn primary wide" type="submit">Add</button><p class="status" role="status"></p></form>`, { label: "Add a certificate" });
    w.querySelector("form").addEventListener("submit", async e => { e.preventDefault(); const st = w.querySelector(".status"); st.textContent = "Checking with Gold Standard…"; try { await api("add", { accession: (window.PSTGSA?.acc(e.target.acc.value) || e.target.acc.value.trim()) }); P.closeSheet?.(); pane(el); } catch (er) { st.textContent = er.message; st.className = "status bad"; } });
  }

  async function trackSheet(ref) {
    const w = P.sheet(`<div class="osheet"><h2 class="serif">Order ${esc(ref)}</h2><div data-gtr><p class="muted small">Loading…</p></div></div>`, { label: "Track order" });
    try { const r = await api("order_detail", { reference: ref }), o = r.order || {}, eta = r.eta || {};
      const tl = (o.timeline || o.history || []).map(x => `<li class="ok">${esc(STATUS[x.toStatus || x.to_status] || x.toStatus || x.to_status || "")}<small class="muted"> · ${P.fmtDate(x.at || x.timestamp || x.created_at)}</small></li>`).join("");
      w.querySelector("[data-gtr]").innerHTML = `<p><span class="opill pend">${esc(STATUS[o.status] || o.status || "")}</span></p>${eta.eta || eta.estimatedCompletion ? `<p class="small">Estimated: ${esc(P.fmtDate(eta.eta || eta.estimatedCompletion))} <span class="muted">(not a promise)</span></p>` : ""}${tl ? `<ol class="track">${tl}</ol>` : ""}${o.shipment?.trackingNumber ? `<p class="small">Tracking: ${esc(o.shipment.trackingNumber)}</p>` : ""}`;
    } catch (er) { w.querySelector("[data-gtr]").innerHTML = `<p class="notice err">${esc(er.message)}</p>`; }
  }

  /* ---------- v546: order a test ---------- */
  // Gold Standard's catalog: one list of { kind: category | compound | test | bundle | sample_requirement } (checked Oct 31, 2026)
  const catParse = j => { const a = j?.data?.items || j?.items || [];
    const tests = a.filter(x => x.kind === "test" && (x.categoryIds || ["peptides"]).includes("peptides") && (x.selectionMode || "toggle") === "toggle")
      .map(x => ({ id: String(x.id), name: String(x.name || x.label || x.id), cents: Number(x.priceCents || 0), included: !!x.included, extraVial: !!x.extraVialRequired, desc: String(x.description || "") }));
    const compounds = a.filter(x => x.kind === "compound").map(x => ({ name: String(x.name || x.id), cents: Number(x.basePriceCents || 0), family: x.family || "" }));
    return { tests, compounds }; };
  // best guess of Gold Standard's compound name for one of his products (he can change it)
  const nz = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const guessCompound = (p, list) => { const base = nz(compoundOf(p)), full = nz(p.display_name); if (!base) return "";
    const hit = list.find(c => nz(c.name) === base) || list.find(c => nz(c.name.split("(")[0]) === base) || list.find(c => nz(c.name).startsWith(base) && /blend/i.test(c.name)) || list.find(c => nz(c.name).startsWith(base)) || list.find(c => full.includes(nz(c.name)) && nz(c.name).length > 3);
    return hit ? hit.name : ""; };
  // a quote takes each compound once, so two strengths of one peptide go in separate orders
  const batches = picks => { const out = []; for (const p of picks) { let b = out.find(x => !x.some(y => y.compound.toLowerCase() === p.compound.toLowerCase())); if (!b) out.push(b = []); b.push(p); } return out; };

  async function orderSheet() {
    const live = [...prods].filter(p => p.is_active !== false).sort((a, b) => pname(a).localeCompare(pname(b)));
    const w = P.sheet(`<div class="osheet gord"><h2 class="serif">Order a test</h2>
<p class="kick" style="margin:6px 0 4px">1 · Products</p><input type="search" placeholder="Search products" data-gq style="width:100%;margin-bottom:6px">
<div data-gprods style="max-height:260px;overflow:auto;border:1px solid var(--line);padding:4px 8px">${live.map(p => `<label class="gpr" data-n="${esc(pname(p).toLowerCase())} ${esc(p.product_key.toLowerCase())}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><input type="checkbox" value="${esc(p.product_key)}"><span style="flex:1">${esc(pname(p))} <small class="muted">${esc(p.product_key)}</small></span><span class="glot" data-row="${esc(p.product_key)}" hidden style="width:100%;display:grid;grid-template-columns:1fr 1fr;gap:6px"><select data-cmp="${esc(p.product_key)}" aria-label="Gold Standard compound"></select><input data-lot="${esc(p.product_key)}" placeholder="Vendor lot (optional)"></span></label>`).join("")}</div>
<p class="kick" style="margin:12px 0 4px">2 · Tests</p><div data-gtests><p class="muted small">Loading Gold Standard's tests…</p></div>
<label style="margin-top:8px">Speed<select data-gspeed><option value="standard">Standard</option><option value="expedited">Expedited</option><option value="priority">Priority</option></select></label>
<button class="btn primary wide" type="button" data-gprice style="margin-top:10px">Get the price</button><div data-gquote></div><p class="status" data-gost role="status"></p></div>`, { label: "Order a test" });
    const q = s => w.querySelector(s), st = q("[data-gost]");
    q("[data-gq]").addEventListener("input", e => { const v = e.target.value.toLowerCase(); w.querySelectorAll(".gpr").forEach(r => r.hidden = v && !r.dataset.n.includes(v)); });
    let cat = { tests: [], compounds: [] };
    const cmpOpts = (p) => { const g = guessCompound(p, cat.compounds); return `<option value="">Gold Standard name…</option>${cat.compounds.map(c => `<option${c.name === g ? " selected" : ""}>${esc(c.name)}</option>`).join("")}`; };
    q("[data-gprods]").addEventListener("change", e => { const c = e.target.closest("input[type=checkbox]"); if (!c) return; const row = c.closest("label").querySelector(".glot"); row.hidden = !c.checked;
      const sel = row.querySelector("select"); if (c.checked && !sel.options.length) sel.innerHTML = cmpOpts(byKey[c.value]); });
    try { cat = catParse(await api("catalog"));
      q("[data-gtests]").innerHTML = cat.tests.length ? `<div class="chips">${cat.tests.map(t => `<label class="chip" title="${esc(t.desc)}"><input type="checkbox" value="${esc(t.id)}"${t.included ? " checked disabled" : ""}><span>${esc(t.name)} · ${t.included ? "included" : `+${usd(t.cents)}`}${t.extraVial ? " · needs an extra vial" : ""}</span></label>`).join("")}</div><p class="muted small">Each sample starts at the peptide's base price with the included test. Prices are per sample; the quote below is the real price.</p>` : `<p class="notice err">Couldn't read Gold Standard's test list. Order on their site for now and put the item # in the lot.</p>`;
    } catch (er) { q("[data-gtests]").innerHTML = `<p class="notice err">${esc(er.message)}</p>`; }

    let plan = [];
    q("[data-gprice]").addEventListener("click", async () => {
      const picks = [...w.querySelectorAll("[data-gprods] input[type=checkbox]:checked")].map(c => { const k = CSS.escape(c.value), vl = w.querySelector(`[data-lot="${k}"]`).value.trim(); return { product_key: c.value, compound: w.querySelector(`[data-cmp="${k}"]`).value, lot: `${c.value}${vl ? ` · ${vl}` : ""}` }; });
      const testIds = [...w.querySelectorAll("[data-gtests] input:checked")].map(c => c.value);
      const nameless = picks.filter(x => !x.compound); if (nameless.length) { st.textContent = `Pick Gold Standard's name for ${nameless.map(x => pname(byKey[x.product_key])).join(", ")}.`; st.className = "status bad"; return; }
      if (!picks.length) { st.textContent = "Pick at least one product."; st.className = "status bad"; return; }
      if (!testIds.length) { st.textContent = "Pick at least one test."; st.className = "status bad"; return; }
      st.textContent = "Getting the price…"; st.className = "status"; q("[data-gquote]").innerHTML = "";
      try {
        plan = [];
        for (const b of batches(picks)) { const r = await api("quote", { compoundNames: b.map(x => x.compound), testIds, turnaround: q("[data-gspeed]").value }); plan.push({ items: b, testIds, ...r }); }
        // Gold Standard money is { currency, cents } (checked Oct 31, 2026); plain numbers still work
        const cts = v => v == null ? null : typeof v === "number" ? v : v.cents ?? v.amount?.cents ?? null;
        const money = r => { const qt = r.quote || {}, sh = r.shipping || {}, sel = sh.selected || sh.recommended || (sh.options || [])[0] || {};
          const testing = cts(sh.testing) ?? cts(qt.amount), ship = cts(sel.amount), total = cts(sh.orderTotal) ?? (testing != null && ship != null ? testing + ship : null);
          return { testing, ship, total, token: sel.quoteToken || "", carrier: sel.service || sel.carrierName || sel.carrier || "" }; };
        plan.forEach(r => Object.assign(r, money(r)));
        const grand = plan.reduce((t, r) => t + (Number(r.total) || 0), 0);
        q("[data-gquote]").innerHTML = `<div class="notice" style="margin-top:10px">${plan.map((r, i) => `<p style="margin:0 0 6px"><b>${plan.length > 1 ? `Order ${i + 1}: ` : ""}${esc(r.items.map(x => pname(byKey[x.product_key])).join(", "))}</b><br><small>Testing ${r.testing != null ? usd(r.testing) : "—"} · Shipping label ${r.ship != null ? `${usd(r.ship)}${r.carrier ? ` (${esc(r.carrier)})` : ""}` : esc(r.shippingError || "priced at checkout")}${r.total != null ? ` · <b>${usd(r.total)}</b>` : ""}</small></p>`).join("")}
${plan.length > 1 ? `<p class="small muted">Split in ${plan.length} because Gold Standard takes each peptide once per order.</p>` : ""}${grand ? `<p style="margin:6px 0 0"><b>Total ${usd(grand)}</b></p>` : ""}
<p class="small muted">Each sample's lot will read: ${esc(plan.flatMap(r => r.items.map(x => x.lot)).join(" / "))}</p></div><button class="btn primary wide" type="button" data-gplace>Place order and pay by card</button>`;
        st.textContent = "";
      } catch (er) { st.textContent = er.message; st.className = "status bad"; }
    });
    w.addEventListener("click", async e => {
      const b = e.target.closest("[data-gplace]"); if (!b) return; b.disabled = true; st.textContent = "Placing the order…"; st.className = "status";
      const done = [];
      try {
        for (const r of plan) {
          const k = r.idem || (r.idem = `pst-order-${crypto.randomUUID()}`);
          const o = await api("order", { quoteId: r.quoteId, quoteToken: r.token, items: r.items, tests: r.testIds, idempotencyKey: k });
          done.push(o); if (o.paymentUrl) window.open(o.paymentUrl, "_blank", "noopener");
        }
        q("[data-gquote]").innerHTML = `<div class="notice ok" style="margin-top:10px"><b>Ordered: ${esc(done.map(d => d.reference).join(", "))}</b><p class="small">Pay in the page that opened (or tap Pay on the order). The shipping label is made once it's paid: open it from Test orders and print it.</p>${done.map(d => (d.shipping?.packingInstructions?.steps || []).length ? `<ol class="small">${d.shipping.packingInstructions.steps.map(s => `<li>${esc(typeof s === "string" ? s : s.text || s.step || "")}</li>`).join("")}</ol>` : "").join("")}</div>`;
        st.textContent = ""; pane(el);
      } catch (er) { st.textContent = er.code === "SHIPPING_PRICE_CHANGED" ? "The shipping price changed. Tap Get the price again." : er.message; st.className = "status bad"; b.disabled = false; }
    });
  }

  document.addEventListener("click", e => { if (el && el.contains(e.target)) onClick(e); });
  window.PSTGsaOwner = { pane };
})();
