/* Pep Shop Texas · Gold Standard Analytics certificates (v1.0, v543)
   A product's lab report link (coa_url) can be a Gold Standard certificate: the link to
   https://www.goldstandardanalytics.com/coa/GSA-YYYY-NNNNNN, or just the number GSA-YYYY-NNNNNN.
   The shop then reads the certificate live from the lab's free public lookup
   (GET /api/coa/{accession}.json: no key, CORS-open, CC BY 4.0, 60 lookups a minute per visitor)
   and shows a "Verified by Gold Standard Analytics" card with the per-test results.
   Only a passing certificate shows as verified. A retracted, failed, missing or unreachable one makes the
   page fall back to "COA pending" so a shopper never sees a report the lab no longer stands behind.
   Results are cached in the visitor's browser for 5 minutes (the lab's own cache time). */
(() => {
  const BASE = "https://www.goldstandardanalytics.com";
  const RX = /GSA-\d{4}-\d{6}/i;
  const TTL = 5 * 60 * 1000;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const acc = v => { const m = String(v || "").match(RX); return m ? m[0].toUpperCase() : ""; };
  const certUrl = a => `${BASE}/coa/${a}`;
  const mem = {};

  /* one lookup: { ok, status: "pass"|"unknown"|"fail"|"retracted"|"missing"|"error", rec } */
  function lookup(a) {
    a = acc(a); if (!a) return Promise.resolve({ ok: false, status: "missing" });
    if (mem[a]) return mem[a];
    try { const c = JSON.parse(sessionStorage.getItem("pst-gsa:" + a) || "null"); if (c && Date.now() - c.t < TTL) return (mem[a] = Promise.resolve(c.v)); } catch (e) {}
    const get = () => fetch(`${BASE}/api/coa/${a}.json`, { headers: { Accept: "application/json" } });
    // the lab's 404 carries no CORS header, so a wrong number shows up here as a network error, not a 404: retry once, then treat it as unconfirmed
    return (mem[a] = get().catch(() => new Promise(ok => setTimeout(ok, 1200)).then(get))
      .then(async r => {
        if (r.status === 404) return { ok: false, status: "missing" };
        if (!r.ok) return { ok: false, status: "error", code: r.status };
        const rec = await r.json(), v = String(rec.verdict || "unknown").toLowerCase();
        return { ok: v === "pass" || v === "unknown", status: v, rec };
      })
      .catch(() => ({ ok: false, status: "error" }))
      .then(v => { if (v.status !== "error") { try { sessionStorage.setItem("pst-gsa:" + a, JSON.stringify({ t: Date.now(), v })); } catch (e) {} } else delete mem[a]; return v; }));
  }

  const date = d => { if (!d) return ""; const x = new Date(String(d).slice(0, 10) + "T12:00:00"); return isNaN(x) ? String(d) : x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const tick = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

  /* the results card (product page and the lab-report peek) */
  function card(rec, status) {
    const a = esc(rec.accession), rows = (rec.results || []).map(r => `<tr><td>${esc(r.analyte)}</td><td><b>${esc(r.result)}</b></td><td>${esc(r.specification || "")}</td><td>${r.verdict === "pass" ? `<span class="gsaok" aria-label="Passed">${tick}</span>` : r.verdict === "fail" ? "Fail" : ""}</td></tr>`).join("");
    const pass = status === "pass";
    return `<div class="gsacard">
<div class="gsahead">${pass ? `<span class="gsaseal">${tick}</span>` : ""}<div><b>${pass ? "Verified by Gold Standard Analytics" : "Lab results from Gold Standard Analytics"}</b>
<span>${esc(rec.compound || "")}${rec.lot ? ` · Lot ${esc(rec.lot)}` : ""}${rec.issued ? ` · Issued ${esc(date(rec.issued))}` : ""}</span></div></div>
${rows ? `<table class="gsares"><thead><tr><th>Test</th><th>Result</th><th>Spec</th><th><span class="sr">Passed</span></th></tr></thead><tbody>${rows}</tbody></table>` : ""}
<p class="gsafoot"><a href="${esc(rec.url || certUrl(rec.accession))}" target="_blank" rel="noopener">View certificate ${a} ↗</a><span>Independent lab in Houston, TX. Results from Gold Standard Analytics, read live (CC BY 4.0).</span></p></div>`;
  }

  const CSS = `.gsacard{border:1px solid var(--line2,#3a3424);background:var(--card,#111a2b);padding:14px;margin:12px 0 16px;font-size:13px;color:var(--muted,#a59f93)}
.gsahead{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.gsahead b{display:block;color:var(--ink,#f3ede1);font-size:14px}.gsahead span{font-size:12px}
.gsaseal{flex:0 0 28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--goldg,#c9a45c);color:#1a1408}
.gsares{width:100%;border-collapse:collapse;font-size:12.5px}.gsares th{text-align:left;font-weight:600;color:var(--dim,#7c776c);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:4px 6px 6px 0;border-bottom:1px solid var(--line,#1f2838)}
.gsares td{padding:7px 6px 7px 0;border-bottom:1px solid var(--line,#1f2838);vertical-align:top}.gsares td b{color:var(--ink,#f3ede1);font-weight:700}.gsares td:last-child{width:22px;text-align:right}
.gsaok{color:var(--ok,#7fcf9f)}.gsafoot{display:flex;flex-direction:column;gap:3px;margin:10px 0 0;font-size:11.5px}.gsafoot a{color:var(--gold,#c9a45c);font-weight:700;font-size:12.5px}
.gsawait{font-size:12px;color:var(--dim,#7c776c);margin:12px 0}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.coasheet .gsacard,.coapop .gsacard{margin:12px;border:0}
.gsachk{font-size:12px;margin:-2px 0 8px}.gsachk.ok{color:var(--ok,#7fcf9f)}.gsachk.bad{color:var(--bad,#f08a8a)}.gsachk.warn{color:var(--warn,#e9c46a)}`;
  const style = () => { if (document.getElementById("pst-gsa-css")) return; const s = document.createElement("style"); s.id = "pst-gsa-css"; s.textContent = CSS; document.head.appendChild(s); };

  /* product page: fill every [data-gsa] slot; on a bad certificate, show "COA pending" instead */
  function pending(root) {
    root.querySelectorAll("[data-gsa-fact]").forEach(f => { f.innerHTML = f.innerHTML.replace(/<b>Lab report<\/b>[\s\S]*$/, "<b>COA pending</b><span>At the lab</span>"); });
    root.querySelectorAll("[data-gsa-spec]").forEach(td => { td.textContent = "Pending for the current batch"; });
    root.querySelectorAll(".coapeek[data-gsa-acc]").forEach(b => b.remove());
  }
  async function fill(slot) {
    if (slot.dataset.gsaDone) return; slot.dataset.gsaDone = "1"; style();
    const a = slot.dataset.gsa; slot.innerHTML = `<p class="gsawait">Checking the lab report with Gold Standard Analytics…</p>`;
    const r = await lookup(a);
    if (r.ok) { slot.innerHTML = card(r.rec, r.status); return; }
    // anything the lab can't confirm (not found, retracted, failed, or unreachable) shows as "COA pending"; we never show an unconfirmed report as a lab report
    slot.innerHTML = ""; pending(slot.closest(".pdp") || document);
  }
  const scan = () => document.querySelectorAll("[data-gsa]:not([data-gsa-done])").forEach(fill);
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", scan);

  /* the lab-report peek asks for a certificate's card here (it can't draw a web page as a picture) */
  async function peek(box, a) {
    style(); box.innerHTML = `<p class="gsawait" style="margin:16px">Loading the certificate…</p>`;
    const r = await lookup(a);
    box.innerHTML = r.ok ? card(r.rec, r.status) : `<p class="gsawait" style="margin:16px">This certificate isn't available right now. <a href="${esc(certUrl(a))}" target="_blank" rel="noopener">Open it at Gold Standard ↗</a></p>`;
  }

  /* owner app: a live check under the lab report field */
  function verdictLine(r, a, productName) {
    if (r.status === "error") return { cls: "bad", t: `Couldn't find ${a} at Gold Standard: the number may be wrong, or their site is down. Shoppers see "COA pending" until it checks out.` };
    if (r.status === "missing") return { cls: "bad", t: `${a} isn't a Gold Standard certificate (not found at the lab). Check the number.` };
    if (r.status === "retracted") return { cls: "bad", t: `${a} was retracted by the lab. The shop will show "COA pending" until you link a new one.` };
    if (r.status === "fail") return { cls: "bad", t: `${a} did not pass at the lab. The shop will show "COA pending" for this product.` };
    const rec = r.rec, pu = rec.results?.find(x => /purity/i.test(x.analyte || ""));
    const base = `${a}: ${rec.compound}${rec.lot ? `, lot ${rec.lot}` : ""}${pu ? `, ${pu.result} purity` : ""}${r.status === "pass" ? ", passed" : ", no pass/fail on it"}${rec.issued ? `, issued ${date(rec.issued)}` : ""}.`;
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const n1 = norm(productName).replace(/\d+(mg|mcg|iu|ml)$/, ""), n2 = norm(rec.compound);
    const off = n1 && n2 && !n1.includes(n2) && !n2.includes(n1);
    return off ? { cls: "warn", t: `${base} Heads up: this certificate is for ${rec.compound}, not ${productName}.` } : { cls: "ok", t: `✓ ${base} Shoppers will see it as verified.` };
  }
  function ownerField(input, nameOf) {
    if (!input || input.dataset.gsaWired) return; input.dataset.gsaWired = "1"; style();
    const line = document.createElement("p"); line.className = "gsachk"; line.setAttribute("role", "status"); line.hidden = true;
    (input.closest("label") || input).insertAdjacentElement("afterend", line);
    let t = 0, seq = 0;
    const run = () => { clearTimeout(t); const a = acc(input.value); if (!a) { line.hidden = true; return; }
      line.hidden = false; line.className = "gsachk"; line.textContent = `Checking ${a} with Gold Standard…`; const my = ++seq;
      t = setTimeout(async () => { const r = await lookup(a); if (my !== seq) return; const v = verdictLine(r, a, nameOf ? nameOf() : ""); line.className = "gsachk " + v.cls; line.textContent = v.t; }, 350); };
    input.addEventListener("input", run); input.addEventListener("blur", () => { const a = acc(input.value); if (a && !/^https?:/i.test(input.value.trim())) input.value = certUrl(a); });
    run();
  }
  /* what gets saved: a bare GSA number becomes the full certificate link */
  const normalize = v => { const s = String(v || "").trim(), a = acc(s); return a && !/^https?:/i.test(s) ? certUrl(a) : s; };

  window.PSTGSA = { acc, lookup, card, peek, certUrl, ownerField, normalize, style };
})();
