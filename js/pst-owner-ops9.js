/* Pep Shop Texas · owner app v5.8:
   1) "Promos in emails": partner / sale boxes at the bottom of the automatic customer emails (table pst_email_promos,
      read by send-order-email v52). PepKeep starts on. Preview uses the real email template with your newest order.
   2) "Text blast": promo texts to customers who opted in themselves (send-sms-blast). "Send a test to myself" first.
      Brand name and "Reply STOP to opt out" are added for you. Nothing sends until the text account is connected. */
(function () {
  "use strict";
  const P = window.PST, { $$, esc } = P;
  const EMAILS = [["order_received", "Thanks for your order"], ["payment_accepted", "Payment confirmed"], ["order_packed", "Packed / ready"], ["order_shipped", "Shipped"], ["shipment_update", "Part shipped"], ["order_delivered", "Delivered"]];
  const ALL_TYPES = ["order_received", "order_placed", "payment_accepted", "order_packed", "order_shipped", "shipment_update", "order_delivered", "shipment_delivered"];
  // types that travel together (the second is the same email under another name)
  const PAIR = { order_received: "order_placed", order_delivered: "shipment_delivered" };
  // words that turn a promo into a health claim; we flag them so the emails stay products-and-deals only
  const RISKY = /\b(dos(e|es|ing)|inject\w*|cure[sd]?|treat(s|ment|ing)?|heal(s|ing)?|weight[- ]?loss|lose weight|fat[- ]?loss|diabet\w*|disease|prescri\w*|anti[- ]?aging|clinical(ly)?|FDA|mg\/kg|units? to draw|side effects?)\b/i;
  const SHORTENERS = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly)\b/i;
  const sheet = (html, label) => { const w = P.sheet(html, { label }); w.classList.add("full"); return w; };
  const me = async () => (await P.getUser())?.email || null;

  /* ================= PROMOS IN EMAILS ================= */
  let promos = [], sample = null;
  async function promosPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const [r, o] = await Promise.all([P.client().from("pst_email_promos").select("*").order("sort").order("created_at"), P.client().from("orders").select("*").order("created_at", { ascending: false }).limit(1)]);
    if (r.error) { el.innerHTML = `<p class="notice">Promos in emails aren't switched on yet.</p>`; return; }
    promos = r.data || []; sample = (o.data || [])[0] || null;
    const on = promos.filter(p => p.enabled);
    el.innerHTML = `<p class="muted small">These boxes show at the bottom of your automatic customer emails: thanks for your order, payment confirmed, packed, shipped and delivered. Never on cancelled, rejected or payment-problem emails. Up to 2 show at once, top of the list first.</p>
${on.length > 2 ? `<p class="notice">${on.length} promos are on, so only the first 2 show in each email.</p>` : ""}
<div class="rtable">${promos.map(card).join("") || `<p class="muted small" style="padding:12px">No promos yet.</p>`}</div>
<div class="obar"><button class="btn primary wide" type="button" data-epnew>+ Add a promo</button>${sample ? `<button class="btn ghost wide" type="button" data-epall>Preview an email</button>` : ""}</div>`;
    el.onclick = async e => {
      const t = e.target;
      if (t.closest("[data-epnew]")) { edit(null, () => promosPane(el)); return; }
      const ed = t.closest("[data-eped]"); if (ed) { edit(promos.find(p => p.id === ed.dataset.eped), () => promosPane(el)); return; }
      const pv = t.closest("[data-eppv]"); if (pv) { preview([promos.find(p => p.id === pv.dataset.eppv)]); return; }
      if (t.closest("[data-epall]")) { preview(null); return; }
      const mv = t.closest("[data-epmv]"); if (mv) { const i = promos.findIndex(p => p.id === mv.dataset.epmv), j = i + Number(mv.dataset.d); if (j < 0 || j >= promos.length) return;
        [promos[i], promos[j]] = [promos[j], promos[i]]; await Promise.all(promos.map((p, k) => P.client().from("pst_email_promos").update({ sort: k }).eq("id", p.id))); promosPane(el); }
    };
    el.onchange = async e => { const tg = e.target.closest("[data-eptog]"); if (!tg) return; tg.disabled = true;
      const { error } = await P.client().from("pst_email_promos").update({ enabled: tg.checked, updated_at: new Date().toISOString(), updated_by: await me() }).eq("id", tg.dataset.eptog);
      P.toast(error ? error.message : tg.checked ? "On. It shows in the next emails." : "Off. Emails won't show it."); promosPane(el); };
  }
  function when(p) {
    const today = new Date().toLocaleDateString("en-CA"), types = (p.show_on || []).filter(t => EMAILS.some(x => x[0] === t));
    const bits = [types.length && types.length < EMAILS.length ? types.map(t => EMAILS.find(x => x[0] === t)[1]).join(", ") : "All order emails"];
    if (p.ends_on && p.ends_on < today) bits.push("ended " + P.fmtDate(p.ends_on + "T12:00"));
    else if (p.starts_on && p.starts_on > today) bits.push("starts " + P.fmtDate(p.starts_on + "T12:00"));
    else if (p.ends_on) bits.push("until " + P.fmtDate(p.ends_on + "T12:00"));
    return bits.join(" · ");
  }
  function card(p, i) {
    return `<div class="eprow${p.enabled ? "" : " off"}">${p.logo_url ? `<img src="${esc(p.logo_url)}" alt="" width="40" height="40" loading="lazy">` : `<span class="epph">${P.icon(p.kind === "sale" ? "star" : "shop", 18)}</span>`}
<div class="epb"><small>${p.kind === "sale" ? "Your sale" : "Partner"} · ${esc(p.name)}</small><b>${esc(p.headline)}</b>${p.body ? `<span>${esc(p.body)}</span>` : ""}<small class="muted">${esc(when(p))}</small>
<div class="epbtns"><button type="button" class="btn ghost sm" data-eped="${p.id}">Edit</button><button type="button" class="btn ghost sm" data-eppv="${p.id}">Preview</button>${promos.length > 1 ? `<button type="button" class="linkish" data-epmv="${p.id}" data-d="-1" aria-label="Move up"${i ? "" : " disabled"}>↑</button><button type="button" class="linkish" data-epmv="${p.id}" data-d="1" aria-label="Move down"${i < promos.length - 1 ? "" : " disabled"}>↓</button>` : ""}</div></div>
<label class="toggle" aria-label="Show ${esc(p.name)} in emails"><input type="checkbox" data-eptog="${p.id}" ${p.enabled ? "checked" : ""}></label></div>`;
  }
  async function preview(list, type = "order_received") {
    if (!sample) { P.toast("Previews need at least one order."); return; }
    const w = sheet(`<div class="osheet"><h2 class="serif">Email preview</h2><div class="chips" data-ept>${EMAILS.map(([k, l]) => `<button type="button" class="chip${k === type ? " on" : ""}" data-k="${k}">${esc(l)}</button>`).join("")}</div><p class="muted small" data-eps>Loading the real template…</p><iframe class="eframe" title="Email preview" data-epf></iframe><p class="muted small">Uses your newest order (${esc(sample.order_number || "")}). Nothing is sent.</p></div>`, "Email preview");
    const go = async k => { w.querySelector("[data-eps]").textContent = "Loading the real template…";
      try { const pv = await window.PSTOps.emailPreview(sample, k, list ? { promos_override: list } : {}); const f = w.querySelector("[data-epf]"); f.srcdoc = pv.html || "<p>No preview</p>"; f.onload = () => { try { f.contentWindow.scrollTo(0, f.contentDocument.body.scrollHeight); } catch { /* cross-origin */ } }; w.querySelector("[data-eps]").textContent = pv.subject ? `Subject: ${pv.subject}` : ""; }
      catch (err) { w.querySelector("[data-eps]").textContent = "Preview failed: " + (err.message || err); } };
    w.querySelector("[data-ept]").onclick = e => { const c = e.target.closest("[data-k]"); if (!c) return; $$("[data-k]", w).forEach(x => x.classList.toggle("on", x === c)); go(c.dataset.k); };
    go(type);
  }
  function edit(p, done) {
    const isNew = !p; p = p || { kind: "sale", name: "", headline: "", body: "", link_url: "https://www.pepshoptexas.com/catalog.html", link_text: "Shop now", logo_url: "", show_on: ALL_TYPES, starts_on: null, ends_on: null, enabled: true };
    const shown = new Set(p.show_on?.length ? p.show_on : ALL_TYPES);
    const w = sheet(`<form class="osheet epform" data-epf2><h2 class="serif">${isNew ? "New promo" : "Edit promo"}</h2>
<div class="chips" role="radiogroup" aria-label="Kind"><label class="chip"><input type="radio" name="kind" value="sale" ${p.kind === "sale" ? "checked" : ""}><span>My sale</span></label><label class="chip"><input type="radio" name="kind" value="partner" ${p.kind === "partner" ? "checked" : ""}><span>Partner</span></label></div>
<label>Name <span class="muted small">(just for you)</span><input name="name" maxlength="60" required value="${esc(p.name)}" placeholder="e.g. Fall sale, PepKeep"></label>
<label>Headline<input name="headline" maxlength="90" required value="${esc(p.headline)}" placeholder="e.g. 15% off BPC-157 this week"></label>
<label>Short text <span class="muted small">(optional)</span><textarea name="body" rows="3" maxlength="220">${esc(p.body || "")}</textarea></label>
<div class="pm2"><label>Button words<input name="link_text" maxlength="40" value="${esc(p.link_text || "Learn more")}"></label><label>Link<input name="link_url" type="url" maxlength="500" value="${esc(p.link_url || "")}" placeholder="https://"></label></div>
<details class="omore"${p.logo_url || p.starts_on || p.ends_on || shown.size < ALL_TYPES.length ? " open" : ""}><summary>Logo, dates, which emails</summary>
<label>Logo link <span class="muted small">(optional, https, square works best)</span><input name="logo_url" type="url" maxlength="500" value="${esc(p.logo_url || "")}"></label>
<div class="pm2"><label>Starts<input name="starts_on" type="date" value="${esc(p.starts_on || "")}"></label><label>Ends<input name="ends_on" type="date" value="${esc(p.ends_on || "")}"></label></div>
<p class="kick" style="margin:8px 0 4px">Show it on</p><div class="chips">${EMAILS.map(([k, l]) => `<label class="chip"><input type="checkbox" name="em" value="${k}" ${shown.has(k) ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}</div></details>
<p class="small emwarn" data-epw hidden></p>
<div class="obar"><button class="btn ghost wide" type="button" data-eptry>Preview</button><button class="btn primary wide">Save</button></div>
${isNew ? "" : `<button type="button" class="linkish badc" data-epdel style="margin-top:10px">Delete this promo</button>`}<p class="status" data-epst role="status"></p></form>`, isNew ? "New promo" : "Edit promo");
    const f = w.querySelector("[data-epf2]"), st = f.querySelector("[data-epst]"), warn = f.querySelector("[data-epw]");
    const read = () => { const g = n => String(f[n].value || "").trim(), ems = $$("input[name=em]:checked", f).map(x => x.value);
      return { kind: f.kind.value, name: g("name"), headline: g("headline"), body: g("body") || null, link_text: g("link_text") || "Learn more", link_url: g("link_url") || null, logo_url: g("logo_url") || null,
        starts_on: g("starts_on") || null, ends_on: g("ends_on") || null, show_on: ems.flatMap(k => PAIR[k] ? [k, PAIR[k]] : [k]), enabled: p.enabled !== false }; };
    const check = d => { if (!d.name) return "Give it a name."; if (!d.headline) return "Add a headline."; if (d.link_url && !/^https:\/\//i.test(d.link_url)) return "The link needs to start with https://"; if (d.logo_url && !/^https:\/\//i.test(d.logo_url)) return "The logo link needs to start with https://";
      if (!d.show_on.length) return "Pick at least one email."; if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) return "The end date is before the start date."; return ""; };
    const lint = () => { const d = read(), hit = `${d.headline} ${d.body || ""}`.match(RISKY); warn.hidden = !hit; if (hit) warn.textContent = `"${hit[0]}" reads like a health claim. Keep promos to products, prices and deals.`; };
    f.addEventListener("input", lint); lint();
    f.querySelector("[data-eptry]").onclick = () => { const d = read(), m = check(d); if (m) { st.textContent = m; return; } preview([{ ...d, enabled: true, starts_on: null, ends_on: null, show_on: ALL_TYPES }], d.show_on.find(t => EMAILS.some(x => x[0] === t)) || "order_received"); };
    f.querySelector("[data-epdel]")?.addEventListener("click", async e => { const b = e.target; if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tap again to delete it"; return; }
      const { error } = await P.client().from("pst_email_promos").delete().eq("id", p.id); if (error) { st.textContent = error.message; return; } P.closeSheet(); P.toast("Deleted"); done(); });
    f.addEventListener("submit", async e => { e.preventDefault(); const d = read(), m = check(d); if (m) { st.textContent = m; return; }
      const b = f.querySelector("button:not([type])"); b.disabled = true; st.textContent = "Saving…";
      const row = { ...d, updated_at: new Date().toISOString(), updated_by: await me() };
      const { error } = isNew ? await P.client().from("pst_email_promos").insert({ ...row, sort: promos.length }) : await P.client().from("pst_email_promos").update(row).eq("id", p.id);
      if (error) { st.textContent = error.message; b.disabled = false; return; }
      P.closeSheet(); P.toast(isNew ? "Added. It shows in the next emails." : "Saved"); done(); });
  }

  /* ================= TEXT BLAST ================= */
  async function callSms(body) {
    const { data: { session } } = await P.client().auth.getSession(); if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
    const r = await fetch(`${P.CFG.url}/functions/v1/send-sms-blast`, { method: "POST", headers: { "Content-Type": "application/json", apikey: P.CFG.key, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) throw new Error(j.error || `Text service returned ${r.status}.`); return j;
  }
  // SMS length: plain text is 160 per text (153 when split); emoji or curly quotes drop it to 70 (67)
  const segs = t => { const uni = /[^\n\r -~£¥èéùìòÇØøÅå_ÆæßÉ¡ÄÖÑÜ§¿äöñüà€^{}\\[~\]|]/.test(t), one = uni ? 70 : 160, many = uni ? 67 : 153; return { n: t.length <= one ? 1 : Math.ceil(t.length / many), uni }; };
  async function textsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    let s; try { s = await callSms({ action: "status" }); } catch (e) { el.innerHTML = `<p class="notice">Text promotions aren't switched on yet. ${esc(e.message)}</p>`; return; }
    const mode = s.practice ? `<div class="notice">Practice mode: texts are logged here but nobody gets one.</div>` : !s.connected ? `<div class="notice">Your text account isn't connected yet. You can write and save your number, but nothing sends until it's connected.</div>` : "";
    el.innerHTML = `${mode}<div class="tiles otiles"><div class="tile"><small>Said yes to texts</small><b>${s.eligible.length}</b></div><div class="tile"><small>Blasts in 30 days</small><b>${s.sent_30d}</b></div></div>
<p class="muted small">Only customers who checked "text me deals" in their account or at checkout can get these. Each person gets at most 4 in 30 days, and blasts only go out 9am to 8pm Central.</p>
<form class="osheet bform" data-tf>
<label>Message<textarea name="body" rows="4" maxlength="${s.max_body}" placeholder="e.g. Restock alert: BPC-157 and TB-500 are back. Shop: pepshoptexas.com"></textarea></label>
<div class="smsprev" aria-live="polite"><small>What they'll get</small><p data-tprev></p><small data-tlen></small></div><p class="small emwarn" data-tw hidden></p>
<details class="omore"><summary>Your phone for tests${s.test_phone ? ` · ${esc(P.fmtPhone(s.test_phone))}` : ""}</summary><div class="promo"><input name="tphone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(P.fmtPhone(s.test_phone))}" placeholder="Your mobile number" aria-label="Your mobile number"><button class="btn ghost sm" type="button" data-tsave>Save</button></div></details>
<button class="btn ghost wide" type="button" data-ttest>Send a test to myself</button>
<p class="kick" style="margin:14px 0 4px">Send to</p>
<div class="austools"><span class="muted small" data-tn></span><button type="button" class="linkish" data-tall>Select all</button><button type="button" class="linkish" data-tnone>Clear</button></div>
<div class="aulist" data-tl>${s.eligible.map(c => `<label class="aurow"><input type="checkbox" value="${esc(c.id)}" checked><span><b>${esc(c.name)}</b><small>${esc(c.phone)}${c.since ? ` · said yes ${P.fmtDate(c.since)}` : ""}</small></span></label>`).join("") || `<p class="muted small" style="padding:10px">Nobody has said yes to texts yet. The checkbox is in checkout and in each customer's account.</p>`}</div>
<button class="btn primary wide" type="button" data-tsend ${s.eligible.length ? "" : "disabled"}>Send</button>${s.quiet_ok ? "" : `<p class="muted small">It's outside 9am to 8pm Central, so blasts wait. Tests still work.</p>`}<p class="status" data-ts role="status"></p></form>
${s.campaigns.length ? `<h2 class="serif osec">Sent</h2><div class="rtable">${s.campaigns.map(c => `<div class="rrow2"><span></span><span><b>${esc(c.body)}</b><small>${P.fmtDate(c.created_at)} · ${c.is_test ? "test to you" : `${c.sent} sent${c.skipped ? `, ${c.skipped} skipped` : ""}${c.failed ? `, ${c.failed} failed` : ""}`}${c.status === "practice" ? " · practice" : ""}</small></span></div>`).join("")}</div>` : ""}`;
    const f = el.querySelector("[data-tf]"), st = f.querySelector("[data-ts]"), list = f.querySelector("[data-tl]");
    const chosen = () => $$("input:checked", list).map(i => i.value);
    const draw = () => { const b = f.body.value.replace(/\s+/g, " ").trim(), full = s.brand + (b || "…") + (/\bstop\b/i.test(b) ? "" : s.stop), g = segs(full);
      f.querySelector("[data-tprev]").textContent = full; f.querySelector("[data-tlen]").textContent = `${full.length} characters · ${g.n} text${g.n > 1 ? "s" : ""} each${g.uni ? " (emoji or curly quotes make texts shorter)" : ""}`;
      const w = f.querySelector("[data-tw]"), risky = b.match(RISKY), short = SHORTENERS.test(b), caps = b.length > 20 && b === b.toUpperCase();
      w.hidden = !(risky || short || caps); w.textContent = risky ? `"${risky[0]}" reads like a health claim. Phone carriers block those, and they're not allowed here. Keep it to products and deals.` : short ? "Link shorteners (bit.ly and friends) get texts blocked. Use the full pepshoptexas.com link." : caps ? "All caps reads as spam to carriers. Try normal capitals." : "";
      const n = chosen().length; f.querySelector("[data-tn]").textContent = `${n} of ${s.eligible.length} picked`; const sb = f.querySelector("[data-tsend]"); sb.textContent = n ? `Send to ${n}` : "Send"; };
    draw(); f.addEventListener("input", draw); list.addEventListener("change", draw);
    f.querySelector("[data-tall]").onclick = () => { $$("input", list).forEach(i => i.checked = true); draw(); };
    f.querySelector("[data-tnone]").onclick = () => { $$("input", list).forEach(i => i.checked = false); draw(); };
    f.querySelector("[data-tsave]").onclick = async e => { const b = e.target; b.disabled = true; try { const r = await callSms({ action: "save_test_phone", phone: f.tphone.value }); s.test_phone = r.test_phone; f.tphone.value = P.fmtPhone(r.test_phone); P.toast("Saved"); } catch (err) { P.toast(err.message); } b.disabled = false; };
    const body = () => { const b = f.body.value.replace(/\s+/g, " ").trim(); if (!b) { st.textContent = "Write the message first."; f.body.focus(); return null; } if (RISKY.test(b)) { st.textContent = "Take out the health wording first."; return null; } return b; };
    f.querySelector("[data-ttest]").onclick = async e => { const b = body(); if (!b) return;
      if (!s.test_phone) { const d = f.querySelector("details"); d.open = true; f.tphone.focus(); st.textContent = "Add your phone number, tap Save, then send the test."; return; }
      e.target.disabled = true; st.textContent = "Sending your test…";
      try { const r = await callSms({ action: "test", body: b }); st.textContent = r.practice ? `Practice: a test would go to ${r.to}.` : `Test sent to ${r.to}. Check your phone.`; } catch (err) { st.textContent = err.message; }
      e.target.disabled = false; };
    f.querySelector("[data-tsend]").onclick = async () => { const b = body(); if (!b) return; const ids = chosen(); if (!ids.length) { st.textContent = "Pick at least one person."; return; }
      if (!(await window.PSTOps.confirmSheet(`Text ${ids.length} customer${ids.length === 1 ? "" : "s"}?`, `<p class="smsprev"><span>${esc(s.brand + b + (/\bstop\b/i.test(b) ? "" : s.stop))}</span></p>Texts can't be unsent. Did you send yourself a test first?`, `Send to ${ids.length}`))) return;
      st.textContent = "Sending…"; f.querySelector("[data-tsend]").disabled = true;
      try { const r = await callSms({ action: "send", body: b, user_ids: ids }); P.toast(r.practice ? `Practice: ${r.sent} would get it` : `Sent to ${r.sent}${r.skipped ? ` · ${r.skipped} skipped` : ""}${r.failed ? ` · ${r.failed} failed` : ""}`); textsPane(el); }
      catch (err) { st.textContent = err.message; f.querySelector("[data-tsend]").disabled = false; } };
  }
  window.PSTOps9 = { promosPane, textsPane };
})();
