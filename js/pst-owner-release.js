/* Pep Shop Texas · owner app v5.7: updates waiting to go live.
   Claude builds a fix → a card shows "Fix ready to check" with a preview link → Jimmie taps Looks good (or Something's off)
   → Mike sees Publish → one tap merges it (pst-release) and the site + everyone's app updates. */
(function () {
  "use strict";
  const P = window.PST, { esc } = P;
  const PUBLISHERS = ["mike.weaver2013@gmail.com"];
  const isPublisher = me => PUBLISHERS.includes(String(me?.email || "").toLowerCase());
  const OPEN = ["review", "approved", "changes", "publishing", "failed"];
  let me = null, rels = [];
  async function load() { const { data, error } = await P.client().from("pst_releases").select("*").order("created_at", { ascending: false }).limit(20); if (error) return null; rels = data || []; return rels; }
  async function callPublish(id) {
    const { data: { session } } = await P.client().auth.getSession(); if (!session) throw new Error("Sign in again.");
    const r = await fetch(`${P.CFG.url}/functions/v1/pst-release`, { method: "POST", headers: { "Content-Type": "application/json", apikey: P.CFG.key, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ release_id: id }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) throw new Error(j.error || `Publish failed (${r.status}).`); return j;
  }
  const who = e => /wacoweaver@gmail\.com/i.test(e || "") ? "Jimmie" : /mike\.weaver2013/i.test(e || "") ? "Mike" : String(e || "").split("@")[0];
  function card(r) {
    const pub = isPublisher(me), fixes = (r.tickets || []).length ? `<p class="small muted">Fixes report${r.tickets.length > 1 ? "s" : ""} ${r.tickets.map(n => `#${n}`).join(", ")}</p>` : "";
    const head = { review: "Fix ready to check", approved: `${who(r.review_by)} checked it`, changes: `${who(r.review_by)} found something`, publishing: "Publishing…", failed: "Publishing didn't go through" }[r.status] || r.status;
    let actions = "";
    if (["review", "changes"].includes(r.status)) actions = `${r.preview_url ? `<a class="btn ghost sm" href="${esc(r.preview_url)}" target="_blank" rel="noopener">Open the preview</a>` : ""}<button type="button" class="btn primary sm" data-rok="${r.id}">Looks good</button><button type="button" class="btn ghost sm" data-rno="${r.id}">Something's off</button>`;
    if (pub && ["review", "changes", "approved", "failed"].includes(r.status)) actions += `<button type="button" class="btn ${r.status === "approved" ? "primary" : "ghost"} sm" data-rpub="${r.id}">${r.status === "approved" ? "Publish now" : r.status === "failed" ? "Try publishing again" : "Publish anyway"}</button>`;
    if (!pub && r.status === "approved") actions = `<span class="small muted">Waiting for Mike to publish.</span>`;
    return `<article class="relcard ${r.status}" data-rel="${r.id}"><div class="relhd">${P.icon("star", 18)}<div><small>${esc(head)}</small><b>v${esc(r.version)} · ${esc(r.title)}</b></div></div>
${r.notes ? `<p class="relnotes">${esc(r.notes)}</p>` : ""}${fixes}${r.tested ? `<details class="omore"><summary>How it was tested</summary><p class="small">${esc(r.tested)}</p></details>` : ""}
${r.review_note ? `<p class="hreply">${esc(who(r.review_by))}: ${esc(r.review_note)}</p>` : ""}${r.status === "failed" && r.error ? `<p class="small badc">${esc(r.error)}</p>` : ""}
${r.status === "review" && !pub ? `<p class="small muted">Open the preview, try what changed, then tap Looks good. Nothing goes live until Mike publishes it.</p>` : ""}
${r.status === "review" && pub ? `<p class="small muted">Waiting for Jimmie to check the preview. You can publish without waiting.</p>` : ""}
<div class="relbtns">${actions}</div></article>`;
  }
  // v5.10: everything about a published update (Mike asked to tap a published update and see the details)
  function details(r) {
    if (!r) return;
    const repo = "https://github.com/wacoweaver-byte/PepShopTexas", row = (k, v) => v ? `<div class="reldl"><dt>${k}</dt><dd>${v}</dd></div>` : "";
    const w = P.sheet(`<div class="osheet"><small class="muted">${r.status === "published" ? `Published ${P.fmtDate(r.publish_at)}` : esc(r.status)}</small><h2 class="serif">v${esc(r.version)} · ${esc(r.title)}</h2>
<dl class="reldls">${row("What changed", r.notes ? `<p class="relnotes">${esc(r.notes)}</p>` : "")}
${row("Reports it fixed", (r.tickets || []).length ? r.tickets.map(n => `<a class="linkish" href="owner.html#help">#${n}</a>`).join(", ") : "")}
${row("Reply sent on those reports", r.fix_note ? esc(r.fix_note) : "")}
${row("How it was tested", r.tested ? esc(r.tested) : "")}
${row("Database or server changes", r.db_changes ? esc(r.db_changes) : "")}
${row("Checked by", r.review_by ? `${esc(who(r.review_by))}${r.review_at ? `, ${P.fmtDate(r.review_at)}` : ""}${r.review_note ? ` · “${esc(r.review_note)}”` : ""}` : "Not checked before publishing")}
${row("Published by", r.publish_by ? esc(who(r.publish_by)) : "")}
${row("Code", `${r.pr_number ? `<a class="linkish" href="${repo}/pull/${r.pr_number}" target="_blank" rel="noopener">Change #${r.pr_number}</a>` : ""}${r.commit_sha ? ` · <a class="linkish" href="${repo}/commit/${esc(r.commit_sha)}" target="_blank" rel="noopener">${esc(String(r.commit_sha).slice(0, 7))}</a>` : ""}`)}
${r.error ? row("Last error", `<span class="badc">${esc(r.error)}</span>`) : ""}</dl>
<p class="muted small">What's new in the app (More → What's new) has the short version of every update.</p></div>`, { label: `Update v${r.version}` });
    w.classList.add("full");
  }
  async function today(el, user) {
    me = user; if (!el) return; const list = await load(); if (!list) { el.innerHTML = ""; return; }
    const open = list.filter(r => OPEN.includes(r.status));
    el.innerHTML = open.map(card).join(""); bind(el, () => today(el, me));
    const badge = document.querySelector('[data-badge="more"]'); if (badge && open.some(r => (r.status === "review" && !isPublisher(me)) || (r.status === "approved" && isPublisher(me)))) { badge.hidden = false; badge.textContent = "•"; }
  }
  function bind(el, again) {
    el.onclick = async e => {
      const rv = e.target.closest("[data-relview]"); if (rv) { details(rels.find(x => x.id === rv.dataset.relview)); return; }
      const ok = e.target.closest("[data-rok]"); if (ok) { ok.disabled = true; const { error } = await P.client().rpc("pst_review_release", { p_id: ok.dataset.rok, p_ok: true, p_note: null }); P.toast(error ? error.message : isPublisher(me) ? "Marked checked" : "Thanks! Mike will publish it."); again(); return; }
      const no = e.target.closest("[data-rno]"); if (no) { const c = no.closest(".relcard"); c.querySelector(".relbtns").outerHTML = `<div class="hmore"><textarea rows="2" data-rnote placeholder="What's off? Type it, or tap the 🎤 on your keyboard and talk"></textarea><div class="hask"><button type="button" class="btn primary sm" data-rnosend="${no.dataset.rno}">Send</button></div></div>`; c.querySelector("[data-rnote]").focus(); return; }
      const ns = e.target.closest("[data-rnosend]"); if (ns) { const v = ns.closest(".relcard").querySelector("[data-rnote]").value.trim(); if (!v) return; const { error } = await P.client().rpc("pst_review_release", { p_id: ns.dataset.rnosend, p_ok: false, p_note: v }); P.toast(error ? error.message : "Sent. We'll fix it before it goes live."); again(); return; }
      const pb = e.target.closest("[data-rpub]"); if (pb) { const r = rels.find(x => x.id === pb.dataset.rpub);
        if (!(await window.PSTOps.confirmSheet(`Publish v${r.version}?`, `${esc(r.title)}<br><br>It goes live on the site right away, and everyone's app picks it up on its own.${r.status !== "approved" ? "<br><br><b>Jimmie hasn't checked it yet.</b>" : ""}`, "Publish"))) return;
        P.toast("Publishing…"); try { await callPublish(r.id); P.toast(`v${r.version} is published. Live in about a minute.`); } catch (err) { P.toast(err.message); } again(); }
    };
  }
  async function pane(el, user) {
    me = user; el.innerHTML = `<p class="muted small">Loading…</p>`; const list = await load();
    if (!list) { el.innerHTML = `<p class="notice">Updates aren't switched on yet.</p>`; return; }
    const open = list.filter(r => OPEN.includes(r.status)), done = list.filter(r => !OPEN.includes(r.status));
    el.innerHTML = `<p class="muted small">How fixes go live: we build it → ${isPublisher(me) ? "Jimmie" : "you"} check a preview and tap Looks good → Mike taps Publish → your app updates itself.</p>
${open.length ? open.map(card).join("") : `<p class="muted small">Nothing waiting right now.</p>`}
${done.length ? `<h2 class="serif osec">Published</h2><p class="muted small">Tap one to see what changed.</p><div class="rtable">${done.map(r => `<button type="button" class="rrow2 relrow" data-relview="${r.id}"><span></span><span><b>v${esc(r.version)} · ${esc(r.title)}</b><small>${r.status === "published" ? `Published ${P.fmtDate(r.publish_at)}${r.publish_by ? ` by ${esc(who(r.publish_by))}` : ""}` : esc(r.status)}${r.review_by ? ` · checked by ${esc(who(r.review_by))}` : ""}${(r.tickets || []).length ? ` · fixed ${r.tickets.map(n => `#${n}`).join(", ")}` : ""}</small></span>${P.icon("next", 16)}</button>`).join("")}</div>` : ""}`;
    bind(el, () => pane(el, me));
  }
  window.PSTRelease = { today, pane, isPublisher };
})();
