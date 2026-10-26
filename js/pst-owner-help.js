/* Pep Shop Texas · owner app v5.5: "Report a problem". Owners describe what went wrong, add screenshots,
   and the app attaches diagnostics (version, phone, screen, recent errors and failed requests). Saved to
   pst_support_tickets / pst_support_shots; Claude reads them and replies, and the reply shows here. */
(function () {
  "use strict";
  const P = window.PST, { esc } = P, $ = q => document.querySelector(q); let $$;
  /* ---- diagnostics recorder: starts as soon as this file loads ---- */
  const LOG = [], SCREENS = [], push = (kind, msg) => { LOG.push({ t: new Date().toISOString(), kind, msg: String(msg).slice(0, 400) }); if (LOG.length > 40) LOG.shift(); };
  window.addEventListener("error", e => push("error", `${e.message} @ ${String(e.filename || "").split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", e => push("promise", e.reason?.message || e.reason));
  const ce = console.error.bind(console); console.error = (...a) => { push("console", a.map(x => x?.message || (typeof x === "object" ? JSON.stringify(x) : x)).join(" ")); ce(...a); };
  const of = window.fetch.bind(window);
  window.fetch = async (...a) => { const url = String(a[0]?.url || a[0] || ""); try { const r = await of(...a); if (!r.ok) push("http", `${r.status} ${url.replace(/^https:\/\/[^/]+/, "").split("?")[0]}`); return r; } catch (e) { push("network", `${e.message} ${url.replace(/^https:\/\/[^/]+/, "").split("?")[0]}`); throw e; } };
  const noteScreen = () => { const h = location.hash.slice(1) || "today"; if (SCREENS[SCREENS.length - 1] !== h) { SCREENS.push(h); if (SCREENS.length > 8) SCREENS.shift(); } };
  window.addEventListener("hashchange", noteScreen); noteScreen();
  const rs = history.replaceState.bind(history); history.replaceState = (...a) => { rs(...a); noteScreen(); }; // the app switches screens with replaceState

  async function diag() {
    let push = "unknown"; try { push = await P.pushState("owner"); } catch { /* ignore */ }
    const sw = navigator.serviceWorker?.controller ? "active" : "none", sheet = document.querySelector("#sheet .sheet");
    return { app: window.PSTOps4?.RELEASES?.[0]?.v || "?", page: location.pathname.split("/").pop() + location.hash, screens: [...SCREENS],
      open_sheet: sheet ? (sheet.getAttribute("aria-label") || sheet.querySelector("h2")?.textContent || "sheet").slice(0, 80) : null,
      ua: navigator.userAgent, standalone: !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches), screen: `${screen.width}x${screen.height} @${devicePixelRatio}x`,
      viewport: `${innerWidth}x${innerHeight}`, visual: window.visualViewport ? `${Math.round(visualViewport.width)}x${Math.round(visualViewport.height)} scale ${visualViewport.scale}` : null,
      theme: document.documentElement.dataset.theme || "dark", online: navigator.onLine, push, sw, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, at: new Date().toString(), log: [...LOG] };
  }
  // resize a photo to ~1000px JPEG so it fits the database row
  function shrink(file) {
    return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const max = 1000, k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); let q = .72, d = c.toDataURL("image/jpeg", q); while (d.length > 880000 && q > .3) { q -= .12; d = c.toDataURL("image/jpeg", q); } res(d); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That picture couldn't be read.")); }; img.src = url; });
  }
  const STATUS = { new: ["Sent", "pend"], looking: ["Looking into it", "pend"], testing: ["Fix ready, being checked", "pend"], need_info: ["Need a bit more info", "bad"], fixed: ["Fixed", "ok"], wont_fix: ["Closed", "pend"], reopened: ["Still happening, looking again", "bad"] };
  const STEPS = ["Sent", "Looking", "Fix being checked", "Fixed"], stepOf = s => ({ new: 0, reopened: 1, looking: 1, need_info: 1, testing: 2, fixed: 3, wont_fix: 3 })[s] ?? 0;
  // v5.8: the in-app Talk buttons are gone (iPhone wouldn't let them stop). The keyboard's own 🎤 does the same job.
  const URG = [["blocking", "Can't do my work"], ["annoying", "Annoying"], ["idea", "Idea / request"]];
  const SCREEN_NAMES = { today: "Today", orders: "Orders", products: "Products", stock: "Stock & purchase orders", reorder: "Reorder", customers: "Customers", more: "More" };

  async function helpPane(el, opts = {}) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const { data, error } = await P.client().from("pst_support_tickets").select("id,ticket_no,created_at,created_by_email,screen,what,urgency,status,reply,replied_at,fixed_in,shot_count,confirmed,followups").order("created_at", { ascending: false }).limit(30);
    const last = [...SCREENS].reverse().find(s => !["help", "more"].includes(s)) || "today";
    el.innerHTML = `<p class="muted small">Something not working, or an idea? Tell us here. Screenshots help a lot: take one the normal way (side button + volume up), then add it below. Your phone and app details are attached for you.</p>
<form class="osheet hform" data-hf><label>What happened? <span class="muted small">Type it, or tap the 🎤 on your keyboard and just talk.</span><textarea name="what" rows="4" maxlength="4000" required placeholder="e.g. I searched for Tirz on a new PO and nothing came up"></textarea></label>
<label>What did you expect? <span class="muted small">(optional)</span><textarea name="expected" rows="2" maxlength="2000"></textarea></label>
<label>Where?<select name="screen">${[...new Set([last, ...Object.keys(SCREEN_NAMES)])].map(s => `<option value="${esc(s)}"${s === last ? " selected" : ""}>${esc(SCREEN_NAMES[s] || s.replace(/^o=.*/, "An order").replace(/^\w/, c => c.toUpperCase()))}</option>`).join("")}<option value="other">Somewhere else</option></select></label>
<p class="kick" style="margin:6px 0 4px">How bad?</p><div class="chips">${URG.map(([k, l], i) => `<label class="chip"><input type="radio" name="urg" value="${k}"${i === 1 ? " checked" : ""}><span>${l}</span></label>`).join("")}</div>
<p class="kick" style="margin:10px 0 4px">Screenshots <span class="muted small">(up to 4)</span></p><div class="hshots" data-hs></div>
<label class="btn ghost wide adpick">+ Add screenshots<input type="file" accept="image/*" multiple hidden data-hfile></label>
<details class="omore"><summary>What gets sent with it</summary><pre class="hdiag" data-hd>…</pre></details>
<p class="status" data-hst role="status"></p><button class="btn primary wide" type="submit">Send report</button></form>
${error ? `<p class="notice err">${/relation|does not exist|schema cache/i.test(error.message) ? "Problem reports aren't switched on for the store yet. Mike can turn them on." : esc(error.message)}</p>` : (data || []).length ? `<h2 class="serif osec">Your reports</h2><div class="rtable">${data.map(t => { const s = STATUS[t.status] || [t.status, "pend"], k = stepOf(t.status); return `<div class="htk" data-tk="${t.id}"><div class="emhd"><b>#${t.ticket_no} · ${esc(String(t.what).split("\n")[0].slice(0, 70))}${t.what.length > 70 ? "…" : ""}</b><span class="opill ${s[1]}">${esc(s[0])}</span></div>
<small class="muted">${P.fmtDate(t.created_at)} · ${esc(SCREEN_NAMES[t.screen] || t.screen || "")}${t.shot_count ? ` · ${t.shot_count} screenshot${t.shot_count === 1 ? "" : "s"}` : ""}${t.created_by_email ? ` · ${esc(t.created_by_email)}` : ""}</small>
${t.status === "wont_fix" ? "" : `<ol class="hsteps">${STEPS.map((x, i) => `<li class="${i < k ? "done" : i === k ? "now" : ""}">${x}</li>`).join("")}</ol>`}
${t.reply ? `<p class="hreply">${esc(t.reply)}${t.fixed_in ? ` <span class="muted small">(fixed in v${esc(t.fixed_in)})</span>` : ""}</p>` : ""}
${(t.followups || []).map(f => `<p class="hfollow"><span class="muted small">${P.fmtDate(f.at)} · you added:</span> ${esc(f.text)}</p>`).join("")}
${t.status === "fixed" && t.confirmed == null ? `<div class="hask"><span>Is it fixed for you?</span><button type="button" class="btn primary sm" data-hok="${t.id}">Yes, fixed</button><button type="button" class="btn ghost sm" data-hno="${t.id}">Still happening</button></div>` : ""}
${t.status === "fixed" && t.confirmed ? `<p class="small okc">You confirmed it's fixed. Thanks!</p>` : ""}
${t.status === "need_info" ? `<div class="hmore"><textarea rows="2" data-hinfo="${t.id}" placeholder="Answer here, or tap the 🎤 on your keyboard and talk"></textarea><div class="hask"><button type="button" class="btn primary sm" data-hsend="${t.id}">Send</button></div></div>` : ""}</div>`;}).join("")}</div>` : ""}`;
    const f = el.querySelector("[data-hf]"), shots = [], st = f.querySelector("[data-hst]");
    const drawShots = () => { f.querySelector("[data-hs]").innerHTML = shots.map((d, i) => `<span class="hshot"><img src="${d}" alt="Screenshot ${i + 1}"><button type="button" class="sx" data-hx="${i}" aria-label="Remove screenshot">${P.icon("x", 14)}</button></span>`).join(""); };
    $$ = (sel, r = el) => [...r.querySelectorAll(sel)];
    const row = id => (data || []).find(x => x.id === id), follow = async (id, text, status) => { const t = row(id), fu = [...(t.followups || []), { at: new Date().toISOString(), text }];
      const { error: e } = await P.client().from("pst_support_tickets").update({ followups: fu, status, updated_at: new Date().toISOString(), ...(status === "reopened" ? { confirmed: false, confirmed_at: new Date().toISOString() } : {}) }).eq("id", id); if (e) { P.toast(e.message); return false; } return true; };
    el.onclick = async e => {
      const ok = e.target.closest("[data-hok]"); if (ok) { const { error: e2 } = await P.client().from("pst_support_tickets").update({ confirmed: true, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ok.dataset.hok); P.toast(e2 ? e2.message : "Great, marked fixed. Thanks!"); window.PSTHelp.helpPane(el); return; }
      const no = e.target.closest("[data-hno]"); if (no) { const box = no.closest(".hask"); box.outerHTML = `<div class="hmore"><textarea rows="2" data-hre="${no.dataset.hno}" placeholder="What's still happening? Type or tap the 🎤 on your keyboard"></textarea><div class="hask"><button type="button" class="btn primary sm" data-hreopen="${no.dataset.hno}">Send</button></div></div>`;
        el.querySelector(`[data-hre="${no.dataset.hno}"]`).focus(); return; }
      const ro = e.target.closest("[data-hreopen]"); if (ro) { const r = row(ro.dataset.hreopen), v = el.querySelector(`[data-hre="${r.id}"]`).value.trim() || "Still happening."; if (await follow(r.id, v, "reopened")) { P.toast(`#${r.ticket_no} reopened. We'll take another look.`); window.PSTHelp.helpPane(el); } return; }
      const sd = e.target.closest("[data-hsend]"); if (sd) { const ta = el.querySelector(`[data-hinfo="${sd.dataset.hsend}"]`), v = ta.value.trim(); if (!v) { ta.focus(); return; } if (await follow(sd.dataset.hsend, v, "looking")) { P.toast("Sent. Thanks!"); window.PSTHelp.helpPane(el); } }
    };
    diag().then(d => { f.querySelector("[data-hd]").textContent = JSON.stringify({ ...d, log: d.log.slice(-8) }, null, 2); });
    f.addEventListener("change", async e => { if (!e.target.matches("[data-hfile]")) return; const files = [...e.target.files].slice(0, 4 - shots.length); e.target.value = "";
      st.textContent = files.length ? "Adding…" : "That's the limit of 4."; for (const x of files) { try { shots.push(await shrink(x)); } catch (err) { st.textContent = err.message; } } if (files.length) st.textContent = ""; drawShots(); });
    f.addEventListener("click", e => { const x = e.target.closest("[data-hx]"); if (x) { shots.splice(+x.dataset.hx, 1); drawShots(); } });
    f.addEventListener("submit", async e => { e.preventDefault(); const what = f.what.value.trim(); if (what.length < 3) { st.textContent = "Tell us what happened."; return; }
      const b = f.querySelector("[type=submit]"); b.disabled = true; st.textContent = "Sending…";
      try {
        const u = await P.getUser(), d = await diag();
        const { data: t, error: e1 } = await P.client().from("pst_support_tickets").insert({ created_by_email: u?.email || null, screen: f.screen.value, what, expected: f.expected.value.trim() || null, urgency: f.urg.value, shot_count: shots.length, diag: d }).select("id,ticket_no").single();
        if (e1) throw e1;
        for (let i = 0; i < shots.length; i++) { const m = shots[i].match(/^data:(image\/\w+);base64,(.*)$/); const { error: e2 } = await P.client().from("pst_support_shots").insert({ ticket_id: t.id, idx: i, mime: m[1], data: m[2] }); if (e2) throw new Error(`Report #${t.ticket_no} saved, but screenshot ${i + 1} didn't: ${e2.message}`); }
        P.toast(`Report #${t.ticket_no} sent. Thank you! Updates will show up right here.`); window.PSTHelp.helpPane(el);
      } catch (err) { st.textContent = err.message || String(err); b.disabled = false; }
    });
    if (opts.focus) f.what.focus();
  }
  // tell the owner when a report gets an answer or a new status (checked when the app opens)
  const SEEN = "pst-help-seen";
  async function notices(onCount) {
    let seen = null; try { seen = localStorage.getItem(SEEN); } catch { /* ignore */ }
    if (!seen) { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* ignore */ } return; }
    const { data } = await P.client().from("pst_support_tickets").select("id,ticket_no,status,reply,fixed_in,replied_at").gt("replied_at", seen).order("replied_at", { ascending: false }).limit(10);
    const list = data || []; onCount && onCount(list.length); if (!list.length) return;
    const t = list[0], s = (STATUS[t.status] || [t.status])[0], n = document.createElement("a"); n.id = "pushnote"; n.href = "owner.html#help";
    n.innerHTML = `${P.icon("chat", 18)}<span><b>Report #${t.ticket_no}: ${esc(s)}${t.fixed_in ? ` in v${esc(t.fixed_in)}` : ""}</b><small>${esc(String(t.reply || "Tap to see the update.").slice(0, 140))}${list.length > 1 ? ` · +${list.length - 1} more update${list.length > 2 ? "s" : ""}` : ""}</small></span><button type="button" class="sx" aria-label="Dismiss">${P.icon("x", 14)}</button>`;
    n.addEventListener("click", e => { if (e.target.closest(".sx")) { e.preventDefault(); n.remove(); } });
    $("#pushnote")?.remove(); document.body.appendChild(n); requestAnimationFrame(() => n.classList.add("in")); setTimeout(() => { if (n.isConnected) { n.classList.remove("in"); setTimeout(() => n.remove(), 300); } }, 9000);
  }
  const markSeen = () => { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* ignore */ } };
  const _hp = helpPane;
  window.PSTHelp = { helpPane: async (el, o) => { await _hp(el, o); markSeen(); }, diag, notices };
})();
