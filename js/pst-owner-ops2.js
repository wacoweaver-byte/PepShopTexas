/* Pep Shop Texas · owner app stage 2 (v4.9): discounts (= discounts.html) and promotions (= promotions.html).
   Same tables, columns and RPCs as his pages. Two of his bugs are not copied:
   - discounts.html reads dates back in UTC, so every re-save pushed expiry/end dates a day later. Here dates read back as local dates.
   - promotions.html could insert a duplicate on a second Save. Here the saved promotion stays selected. */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc, money } = P;
  const sheet = (html, label) => { const w = P.sheet(html, { label }); w.classList.add("full"); return w; };
  const ymdLocal = v => { if (!v) return ""; const d = new Date(v); if (isNaN(d)) return String(v).slice(0, 10); const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const isoLocal = v => { if (!v) return ""; const d = new Date(v); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocal = v => v ? new Date(v).toISOString() : null;
  const dlabel = r => { const pct = Number(r.percent_off || r.discount_percent || 0), amt = Number(r.amount_off || r.discount_amount || 0); return pct ? `${pct}% off` : amt ? `${money(amt)} off` : "Discount not set"; };
  const pill = (t, cls) => `<span class="opill sm ${cls}">${esc(t)}</span>`;
  const me = () => window.PSTOwnerMe || null;

  /* ================= DISCOUNT CODES ================= */
  let codes = [], assigns = [], custs = null;
  async function loadCodes() {
    const [a, b] = await Promise.all([P.client().from("discount_codes").select("*").order("created_at", { ascending: false }), P.client().from("discount_customer_assignments").select("discount_id,customer_id")]);
    if (a.error) throw a.error; codes = a.data || []; assigns = b.data || [];
  }
  async function loadCusts() {
    if (custs) return custs;
    const { data } = await P.client().from("customer_profiles").select("user_id,first_name,last_name,email,customer_number,account_status").order("first_name", { ascending: true });
    custs = (data || []).filter(c => String(c.account_status || "active").toLowerCase() !== "deleted").map(c => ({ ...c, name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Customer" }));
    return custs;
  }
  const liveCode = r => r.active === true && (!r.expires_at || new Date(r.expires_at).getTime() >= Date.now());
  async function discountsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    try { await loadCodes(); } catch (e) { el.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
    el.innerHTML = `<div class="pmtop"><p class="muted small" style="margin:0;flex:1">${codes.filter(liveCode).length} active · ${codes.length} total</p><button class="btn primary sm" type="button" data-dnew>+ New code</button></div>
<div class="clist">${codes.map(r => { const n = assigns.filter(a => a.discount_id === r.id).length, live = liveCode(r);
  return `<button type="button" class="dcard" data-dcode="${esc(r.code)}"><span class="dtop"><b class="dcode">${esc(r.code)}</b>${pill(live ? "Active" : r.active ? "Expired" : "Off", live ? "ok" : "bad")}</span>
<span class="dline">${esc(dlabel(r))} · ${r.audience === "selected" ? `${n} selected customer${n === 1 ? "" : "s"}` : "everyone"} · used ${Number(r.times_used || r.uses || 0)}/${Number(r.max_uses || 0) || "∞"}</span>
<span class="dline muted">${r.expires_at ? `Expires ${P.fmtDate(r.expires_at)}` : "No expiration"}${r.hero_banner_active ? " · on the home page" : ""}${r.promotion_title ? ` · ${esc(r.promotion_title)}` : ""}</span></button>`; }).join("") || `<p class="muted small">No discount codes yet.</p>`}</div>`;
    el.onclick = e => { if (e.target.closest("[data-dnew]")) { codeSheet(null, () => discountsPane(el)); return; } const c = e.target.closest("[data-dcode]"); if (c) codeSheet(codes.find(x => x.code === c.dataset.dcode), () => discountsPane(el)); };
  }
  function codeSheet(r, then) {
    const v = r || { discount_type: "standard", active: true, hero_banner_active: false };
    const pct = Number(v.percent_off || v.discount_percent || 0), amt = Number(v.amount_off || v.discount_amount || 0);
    const w = sheet(`<form class="osheet" data-df><h2 class="serif">${r ? esc(r.code) : "New discount code"}</h2>
<div class="dprev" data-dprev></div>
${r ? "" : `<label>Code<input name="code" required autocapitalize="characters" autocomplete="off" placeholder="SPRING15"></label>`}
<p class="kick" style="margin:6px 0 0">Type</p><div class="chips">${[["standard", "Standard"], ["one_time", "One-time use"], ["friends_family", "Friends & family"]].map(([k, l]) => `<label class="chip"><input type="radio" name="dt" value="${k}"${(v.discount_type || "standard") === k ? " checked" : ""}><span>${l}</span></label>`).join("")}</div>
<div class="pm2"><label>Percent off<input name="pct" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${pct || ""}" placeholder="15"></label><label>or Dollars off<input name="amt" type="number" min="0" step="0.01" inputmode="decimal" value="${amt || ""}" placeholder="10.00"></label></div>
<div class="pm2"><label>Expires<input name="exp" type="date" value="${ymdLocal(v.expires_at)}"></label><label>Max uses<input name="max" type="number" min="0" step="1" inputmode="numeric" value="${Number(v.max_uses || 0) || ""}" placeholder="Unlimited"></label></div>
<label class="toggle"><input type="checkbox" name="act"${v.active !== false ? " checked" : ""}> Active</label>
<details class="omore"${v.promotion_title || v.hero_banner_active ? " open" : ""}><summary>Promotion card &amp; home page</summary>
<label>Promotion title<input name="pt" value="${esc(v.promotion_title || "")}"></label><label>Promotion description<textarea name="pd" rows="2">${esc(v.promotion_description || "")}</textarea></label>
<label>Home page banner text<input name="ht" value="${esc(v.hero_banner_text || "")}"></label><label class="toggle"><input type="checkbox" name="hb"${v.hero_banner_active ? " checked" : ""}> Show on the home page</label>
<div class="pm2"><label>Promotion starts<input name="ps" type="date" value="${ymdLocal(v.promotion_starts_at)}"></label><label>Promotion ends<input name="pe" type="date" value="${ymdLocal(v.promotion_ends_at)}"></label></div></details>
<div data-aud></div>
<p class="status" data-dst role="status"></p><button class="btn primary wide" type="submit">${r ? "Save changes" : "Create code"}</button></form>`, "Discount code");
    const f = w.querySelector("form");
    const prev = () => { const c = (r ? r.code : (f.code.value || "CODE")).trim().toUpperCase(), p = Number(f.pct.value || 0), a = Number(f.amt.value || 0);
      w.querySelector("[data-dprev]").innerHTML = `<b>${esc(f.pt.value || "Promotion title")}</b><small>${esc(f.pd.value || "Promotion description")}</small><span class="dpcode">${esc(c)} · ${p ? p + "% off" : a ? money(a) + " off" : "amount not set"}</span>${f.ht.value ? `<em>${esc(f.ht.value)}</em>` : ""}`; };
    f.addEventListener("input", prev); prev();
    if (r && liveCode(r)) audienceBlock(w.querySelector("[data-aud]"), r);
    f.addEventListener("submit", async e => { e.preventDefault(); const st = f.querySelector("[data-dst]"), b = f.querySelector("[type=submit]");
      const code = (r ? r.code : f.code.value || "").trim().toUpperCase(), percentOff = Number(f.pct.value || 0), amountOff = Number(f.amt.value || 0), maxUsesRaw = Number(f.max.value || 0), dt = f.dt.value;
      if (!code) { st.textContent = "Enter a discount code."; return; }
      if (percentOff <= 0 && amountOff <= 0) { st.textContent = "Enter a percent off or a dollar amount off."; return; }
      if (percentOff > 100) { st.textContent = "Percent off can't be more than 100%."; return; }
      if (!r && codes.some(x => String(x.code).toUpperCase() === code)) { st.textContent = `${code} already exists. Open it from the list to edit it.`; return; }
      const existing = codes.find(x => String(x.code || "").toUpperCase() === code);
      const payload = { code, discount_type: dt, percent_off: percentOff || 0, amount_off: amountOff || 0, assigned_email: null, audience: existing?.audience || "all", one_time_use: dt === "one_time",
        max_uses: maxUsesRaw || (dt === "one_time" ? 1 : null), active: f.act.checked, expires_at: f.exp.value ? new Date(f.exp.value + "T23:59:59").toISOString() : null,
        promotion_title: f.pt.value.trim() || null, promotion_description: f.pd.value.trim() || null, hero_banner_text: f.ht.value.trim() || null, hero_banner_active: f.hb.checked,
        promotion_starts_at: f.ps.value ? new Date(f.ps.value + "T00:00:00").toISOString() : null, promotion_ends_at: f.pe.value ? new Date(f.pe.value + "T23:59:59").toISOString() : null, created_by: me()?.email || null };
      b.disabled = true;
      const { error } = await P.client().from("discount_codes").upsert(payload, { onConflict: "code" });
      if (error) { st.textContent = error.message; b.disabled = false; return; }
      P.closeSheet(); P.toast(`${code} saved`); then && then();
    });
  }
  async function audienceBlock(box, r) { // = his assignment card
    const list = await loadCusts(), chosen = new Set(assigns.filter(a => a.discount_id === r.id).map(a => String(a.customer_id)));
    let aud = r.audience === "selected" ? "selected" : "all";
    box.innerHTML = `<div class="audbox"><p class="kick" style="margin:0 0 6px">Who can use it</p><div class="oseg two"><button type="button" data-au="all">Everyone</button><button type="button" data-au="selected">Selected customers</button></div>
<div data-aulist hidden><input class="psearch" type="search" data-auq placeholder="Search customers" aria-label="Search customers"><div class="austools"><span class="muted small" data-aun></span><button type="button" class="linkish" data-auv>Select shown</button><button type="button" class="linkish" data-auc>Clear</button></div>
<div class="aulist">${list.map(c => `<label class="aurow" data-aus="${esc(`${c.name} ${c.customer_number || ""} ${c.email || ""}`.toLowerCase())}"><input type="checkbox" value="${esc(String(c.user_id || ""))}"${chosen.has(String(c.user_id)) ? " checked" : ""}><span><b>${esc(c.name)}</b><small>${c.customer_number ? "PST-C" + esc(c.customer_number) : "No customer number"} · ${esc(c.email || "")}</small></span></label>`).join("")}</div></div>
<p class="status" data-aust></p><button class="btn ghost wide" type="button" data-ausave>Save who can use it</button></div>`;
    const draw = () => { $$("[data-au]", box).forEach(b => b.classList.toggle("on", b.dataset.au === aud)); box.querySelector("[data-aulist]").hidden = aud !== "selected"; const n = $$(".aurow input:checked", box).length; box.querySelector("[data-aun]").textContent = `${n} customer${n === 1 ? "" : "s"} selected`; };
    box.addEventListener("click", async e => {
      const a = e.target.closest("[data-au]"); if (a) { aud = a.dataset.au; draw(); return; }
      if (e.target.closest("[data-auv]")) { $$(".aurow:not([hidden]) input", box).forEach(i => i.checked = true); draw(); return; }
      if (e.target.closest("[data-auc]")) { $$(".aurow input", box).forEach(i => i.checked = false); draw(); return; }
      const s = e.target.closest("[data-ausave]"); if (!s) return;
      const ids = $$(".aurow input:checked", box).map(i => i.value).filter(Boolean), st = box.querySelector("[data-aust]");
      if (aud === "selected" && !ids.length) { st.textContent = "Pick at least one customer, or choose Everyone."; return; }
      s.disabled = true;
      const { error } = await P.client().rpc("admin_set_discount_customer_assignments", { p_discount_id: r.id, p_audience: aud, p_customer_ids: ids });
      s.disabled = false; if (error) { st.textContent = error.message; return; }
      r.audience = aud; await loadCodes(); st.textContent = "Saved."; P.toast("Who can use it: saved");
    });
    box.addEventListener("change", draw);
    box.addEventListener("input", e => { if (!e.target.matches("[data-auq]")) return; const q = e.target.value.trim().toLowerCase(); $$(".aurow", box).forEach(x => x.hidden = !!q && !x.dataset.aus.includes(q)); });
    draw();
  }

  /* ================= PROMOTIONS ================= */
  let promos = [], dopts = [], rprods = [], rall = [], pcusts = null;
  const pstate = p => { const now = Date.now(), s = p.starts_at ? new Date(p.starts_at).getTime() : null, e = p.ends_at ? new Date(p.ends_at).getTime() : null;
    if (!p.is_active) return ["Off", "bad"]; if (s && s > now) return ["Scheduled", "pend"]; if (e && e < now) return ["Ended", "bad"]; return ["Live", "ok"]; };
  async function loadPromos() {
    const { data, error } = await P.client().from("site_promotions").select("*, discount_codes(id,code,percent_off,amount_off,active,assigned_email,expires_at)").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) throw error; promos = data || [];
  }
  async function promotionsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    try { await loadPromos(); } catch (e) { el.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
    const c = { Live: 0, Scheduled: 0, other: 0, free: promos.filter(p => p.promotion_type === "free_product").length }; promos.forEach(p => { const s = pstate(p)[0]; if (s === "Live" || s === "Scheduled") c[s]++; else c.other++; });
    el.innerHTML = `<div class="tiles otiles"><div class="tile"><small>Live</small><b>${c.Live}</b></div><div class="tile"><small>Scheduled</small><b>${c.Scheduled}</b></div><div class="tile"><small>Off or ended</small><b>${c.other}</b></div><div class="tile"><small>Free product</small><b>${c.free}</b></div></div>
<div class="pmtop"><span style="flex:1"></span><button class="btn primary sm" type="button" data-pnew>+ New promotion</button></div>
<div class="clist">${promos.map(p => { const s = pstate(p); return `<button type="button" class="dcard" data-pid="${p.id}"><span class="dtop"><b>${esc(p.title || "(Untitled)")}</b>${pill(s[0], s[1])}</span><span class="dline">${p.promotion_type === "free_product" ? "Buy X, get Y free" : "Banner"}${p.discount_codes?.code ? ` · code ${esc(String(p.discount_codes.code).toUpperCase())}` : ""} · ${p.audience === "selected_customers" ? "selected customers" : "everyone"} · order ${p.sort_order ?? 100}</span>${p.starts_at || p.ends_at ? `<span class="dline muted">${p.starts_at ? new Date(p.starts_at).toLocaleString() : "now"} → ${p.ends_at ? new Date(p.ends_at).toLocaleString() : "no end"}</span>` : ""}</button>`; }).join("") || `<p class="muted small">No promotions yet.</p>`}</div>`;
    el.onclick = e => { if (e.target.closest("[data-pnew]")) { promoSheet(null, () => promotionsPane(el)); return; } const b = e.target.closest("[data-pid]"); if (b) promoSheet(promos.find(p => p.id === b.dataset.pid), () => promotionsPane(el)); };
  }
  async function promoOptions() {
    const [d, r1, r2, a, b] = await Promise.all([
      P.client().from("discount_codes").select("id,code,percent_off,amount_off,active,assigned_email,expires_at").order("code", { ascending: true }),
      P.client().from("product_inventory").select("product_key,display_name,strength,current_inventory").eq("is_active", true).order("display_name"),
      P.client().from("product_inventory").select("product_key,display_name,strength,current_inventory").order("display_name").limit(1000),
      pcusts ? { data: null } : P.client().from("customer_profiles").select("email,first_name,last_name").limit(1000),
      pcusts ? { data: null } : P.client().from("manual_customers").select("email,first_name,last_name").limit(1000)]);
    dopts = d.data || []; rprods = r1.data || []; rall = r2.data || [];
    if (!pcusts) { const m = new Map(); [...(a.data || []), ...(b.data || [])].forEach(c => { const k = String(c.email || "").trim().toLowerCase(); if (!k || m.has(k)) return; m.set(k, { email: k, name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email }); }); pcusts = [...m.values()].sort((x, y) => x.name.localeCompare(y.name)); }
  }
  async function promoSheet(p, then) {
    await promoOptions();
    let id = p?.id || "";
    const v = { promotion_type: "banner", reward_quantity: 1, minimum_paid_quantity: 1, redemption_limit: "once_per_customer", is_active: false, sort_order: 100, title_bold: true, title_size: 28, body_size: 15, text_align: "center", text_color: "#101820", background_color: "#ffffff", accent_color: "#000000", ...(p || {}) };
    if (!/^#[0-9a-f]{6}$/i.test(v.accent_color || "")) v.accent_color = "#000000";
    const [rk, pe] = id ? await Promise.all([P.client().rpc("pst_get_promotion_reward_options", { p_id: id }), P.client().rpc("pst_get_promotion_customers", { p_id: id })]) : [{ data: [] }, { data: [] }];
    const rewardSet = new Set((rk.data || []).map(String)), custSet = new Set((pe.data || []).map(x => String(x).toLowerCase()));
    const dl = d => `${String(d.code).toUpperCase()} — ${Number(d.percent_off) > 0 ? Number(d.percent_off) + "% off" : Number(d.amount_off) > 0 ? money(d.amount_off) + " off" : "No value set"} — ${d.active !== false ? "Active" : "Inactive"}${d.assigned_email ? " · " + d.assigned_email : ""}`;
    const w = sheet(`<form class="osheet pform2" data-pf><h2 class="serif">${id ? "Edit promotion" : "New promotion"}</h2>
<div class="ppv" data-ppv></div>
<div class="oseg two"><button type="button" data-pt="banner">Banner</button><button type="button" data-pt="free_product">Buy X, get Y free</button></div>
<label>Title<input name="title" value="${esc(v.title || "")}"></label><label>Message<textarea name="body" rows="2">${esc(v.body || "")}</textarea></label>
<div class="pm2"><label>Badge<input name="badge" value="${esc(v.badge || "")}" placeholder="LIMITED"></label><label>Button text<input name="button_text" value="${esc(v.button_text || "")}"></label></div>
<label>Button link<input name="button_link" value="${esc(v.button_link || "")}" placeholder="catalog.html"></label><label>Image link (optional)<input name="image_url" value="${esc(v.image_url || "")}"></label>
<div data-only="free_product"><p class="kick">Reward</p><div class="oseg two"><button type="button" data-rm="fixed">One set product</button><button type="button" data-rm="customer_choice">They choose</button></div>
<label data-rmonly="fixed">Free product<select name="reward_product_key"><option value="">Choose…</option>${rprods.map(x => `<option value="${esc(x.product_key)}"${v.reward_product_key === x.product_key ? " selected" : ""}>${esc(x.display_name)} ${esc(x.strength || "")} — ${x.current_inventory || 0} in stock</option>`).join("")}</select></label>
<div data-rmonly="customer_choice"><input class="psearch" type="search" data-rq placeholder="Search products" aria-label="Search products"><span class="muted small" data-rn></span><div class="aulist">${rall.map(x => `<label class="aurow" data-rs="${esc(`${x.display_name} ${x.strength} ${x.product_key}`.toLowerCase())}"><input type="checkbox" value="${esc(x.product_key)}"${rewardSet.has(x.product_key) ? " checked" : ""} data-rw><span><b>${esc(x.display_name)} ${esc(x.strength || "")}</b><small>${x.current_inventory || 0} available</small></span></label>`).join("")}</div></div>
<div class="pm2"><label>Free vials<input name="reward_quantity" type="number" min="1" step="1" value="${v.reward_quantity ?? 1}"></label><label>Paid vials needed<input name="minimum_paid_quantity" type="number" min="1" step="1" value="${v.minimum_paid_quantity ?? 1}"></label></div>
<div class="pm2"><label>Limit<select name="redemption_limit"><option value="once_per_customer"${v.redemption_limit !== "once_per_order" ? " selected" : ""}>Once per customer</option><option value="once_per_order"${v.redemption_limit === "once_per_order" ? " selected" : ""}>Once per order</option></select></label><label>Max total uses<input name="max_redemptions" type="number" min="1" step="1" value="${v.max_redemptions ?? ""}" placeholder="Unlimited"></label></div></div>
<div data-only="banner"><label>Linked discount code<select name="discount_id"><option value="">No linked discount</option>${dopts.map(d => `<option value="${d.id}"${v.discount_id === d.id ? " selected" : ""}>${esc(dl(d))}</option>`).join("")}</select></label><label class="toggle"><input type="checkbox" name="auto_apply_discount"${v.auto_apply_discount ? " checked" : ""}> Apply the code automatically</label></div>
<p class="kick">Who sees it</p><div class="oseg two"><button type="button" data-ad="public_all">Everyone</button><button type="button" data-ad="selected_customers">Selected customers</button></div>
<div data-adlist><input class="psearch" type="search" data-cq placeholder="Search customers" aria-label="Search customers"><span class="muted small" data-cn></span><div class="aulist">${pcusts.map(c => `<label class="aurow" data-cs="${esc(`${c.name} ${c.email}`.toLowerCase())}"><input type="checkbox" value="${esc(c.email)}"${custSet.has(c.email) ? " checked" : ""} data-cu><span><b>${esc(c.name)}</b><small>${esc(c.email)}</small></span></label>`).join("")}</div></div>
<p class="kick">When</p><label class="toggle"><input type="checkbox" name="is_active"${v.is_active ? " checked" : ""}> Active</label>
<div class="pm2"><label>Starts<input name="starts_at" type="datetime-local" value="${isoLocal(v.starts_at)}"></label><label>Ends<input name="ends_at" type="datetime-local" value="${isoLocal(v.ends_at)}"></label></div>
<label>Order on the page<input name="sort_order" type="number" step="1" value="${v.sort_order ?? 100}"></label>
<details class="omore"><summary>Look</summary>
<div class="pm2"><label>Title size<input name="title_size" type="number" min="10" max="72" value="${v.title_size ?? 28}"></label><label>Message size<input name="body_size" type="number" min="10" max="40" value="${v.body_size ?? 15}"></label></div>
<div class="chips">${[["title_bold", "Title bold"], ["title_italic", "Title italic"], ["title_underline", "Title underline"], ["body_bold", "Message bold"], ["body_italic", "Message italic"], ["body_underline", "Message underline"]].map(([k, l]) => `<label class="chip"><input type="checkbox" name="${k}"${v[k] ? " checked" : ""}><span>${l}</span></label>`).join("")}</div>
<label>Align<select name="text_align">${["center", "left", "right"].map(a => `<option${v.text_align === a ? " selected" : ""}>${a}</option>`).join("")}</select></label>
<div class="pm3"><label>Text<input name="text_color" type="color" value="${esc(v.text_color || "#101820")}"></label><label>Background<input name="background_color" type="color" value="${esc(v.background_color || "#ffffff")}"></label><label>Accent<input name="accent_color" type="color" value="${esc(v.accent_color)}"></label></div></details>
<p class="status" data-pst role="status"></p><button class="btn primary wide" type="submit">Save promotion</button>${id ? `<button class="btn danger wide" type="button" data-pdel style="margin-top:8px">Delete</button>` : ""}</form>`, "Promotion");
    const f = w.querySelector("form");
    let ptype = v.promotion_type === "free_product" ? "free_product" : "banner", rmode = v.reward_mode === "customer_choice" ? "customer_choice" : "fixed", aud = v.audience === "selected_customers" ? "selected_customers" : "public_all";
    const draw = () => {
      $$("[data-pt]", f).forEach(b => b.classList.toggle("on", b.dataset.pt === ptype)); $$("[data-rm]", f).forEach(b => b.classList.toggle("on", b.dataset.rm === rmode)); $$("[data-ad]", f).forEach(b => b.classList.toggle("on", b.dataset.ad === aud));
      $$("[data-only]", f).forEach(x => x.hidden = x.dataset.only !== ptype); $$("[data-rmonly]", f).forEach(x => x.hidden = x.dataset.rmonly !== rmode); f.querySelector("[data-adlist]").hidden = aud !== "selected_customers";
      const rn = $$("[data-rw]:checked", f).length, cn = $$("[data-cu]:checked", f).length; f.querySelector("[data-rn]").textContent = `${rn} eligible product${rn === 1 ? "" : "s"}`; f.querySelector("[data-cn]").textContent = `${cn} customer${cn === 1 ? "" : "s"} selected`;
      const d = dopts.find(x => x.id === f.discount_id.value), btnTxt = f.button_text.value || (d && ptype === "banner" ? "Code: " + String(d.code).toUpperCase() : ""), al = f.text_align.value;
      const deco = (b, i, u, wb) => `font-weight:${f[b].checked ? wb : 400};font-style:${f[i].checked ? "italic" : "normal"};text-decoration:${f[u].checked ? "underline" : "none"}`;
      f.querySelector("[data-ppv]").innerHTML = `<div class="ppvbox" style="background:${esc(f.background_color.value)};text-align:${esc(al)};align-items:${al === "left" ? "flex-start" : al === "right" ? "flex-end" : "center"}">${f.badge.value ? `<span class="ppvbadge" style="color:${esc(f.accent_color.value)}">${esc(f.badge.value)}</span>` : ""}${f.image_url.value ? `<img src="${esc(f.image_url.value)}" alt="">` : ""}<div style="font-size:${Number(f.title_size.value || 28)}px;color:${esc(f.text_color.value)};${deco("title_bold", "title_italic", "title_underline", 900)}">${esc(f.title.value || "Promotion title")}</div><div style="margin-top:8px;font-size:${Number(f.body_size.value || 15)}px;color:${esc(f.text_color.value)};${deco("body_bold", "body_italic", "body_underline", 800)}">${esc(f.body.value || "Promotion message…")}</div>${btnTxt ? `<span class="ppvbtn" style="background:${esc(f.accent_color.value)}">${esc(btnTxt)}</span>` : ""}</div><small class="muted">Preview. Free-product rules are enforced at checkout.</small>`;
    };
    f.addEventListener("click", async e => {
      const t = e.target.closest("[data-pt]"); if (t) { ptype = t.dataset.pt; draw(); return; }
      const m = e.target.closest("[data-rm]"); if (m) { rmode = m.dataset.rm; draw(); return; }
      const a = e.target.closest("[data-ad]"); if (a) { aud = a.dataset.ad; draw(); return; }
      const del = e.target.closest("[data-pdel]"); if (del) {
        if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Tap again to delete it for good"; return; }
        const { error } = await P.client().from("site_promotions").delete().eq("id", id); if (error) { f.querySelector("[data-pst]").textContent = error.message; return; }
        P.closeSheet(); P.toast("Promotion deleted"); then && then();
      }
    });
    f.addEventListener("input", e => {
      if (e.target.matches("[data-rq]")) { const q = e.target.value.trim().toLowerCase(); $$("[data-rs]", f).forEach(x => x.hidden = !!q && !x.dataset.rs.includes(q)); return; }
      if (e.target.matches("[data-cq]")) { const q = e.target.value.trim().toLowerCase(); $$("[data-cs]", f).forEach(x => x.hidden = !!q && !x.dataset.cs.includes(q)); return; }
      draw();
    });
    f.addEventListener("change", draw);
    f.addEventListener("submit", async e => { e.preventDefault(); const st = f.querySelector("[data-pst]"), b = f.querySelector("[type=submit]");
      const num = (k, d) => Number(f[k].value || d);
      const payload = { title: f.title.value, body: f.body.value, badge: f.badge.value, button_text: f.button_text.value, button_link: f.button_link.value, image_url: f.image_url.value,
        promotion_type: ptype, reward_product_key: f.reward_product_key.value || null, reward_quantity: num("reward_quantity", 1), minimum_paid_quantity: num("minimum_paid_quantity", 1),
        redemption_limit: f.redemption_limit.value, max_redemptions: f.max_redemptions.value ? Number(f.max_redemptions.value) : null, discount_id: f.discount_id.value || null,
        auto_apply_discount: f.auto_apply_discount.checked, is_active: f.is_active.checked, starts_at: fromLocal(f.starts_at.value), ends_at: fromLocal(f.ends_at.value), sort_order: num("sort_order", 100),
        title_bold: f.title_bold.checked, title_italic: f.title_italic.checked, title_underline: f.title_underline.checked, body_bold: f.body_bold.checked, body_italic: f.body_italic.checked, body_underline: f.body_underline.checked,
        title_size: num("title_size", 28), body_size: num("body_size", 15), text_align: f.text_align.value, text_color: f.text_color.value, background_color: f.background_color.value, accent_color: f.accent_color.value,
        reward_mode: rmode, audience: aud };
      const keys = $$("[data-rw]:checked", f).map(i => i.value), emails = $$("[data-cu]:checked", f).map(i => i.value.toLowerCase());
      if (ptype === "free_product" && payload.reward_mode === "customer_choice" && !keys.length) { st.textContent = "Choose at least one product they can pick."; return; }
      if (payload.audience === "selected_customers" && !emails.length) { st.textContent = "Pick at least one customer, or choose Everyone."; return; }
      if (payload.audience === "selected_customers" && p?.audience !== "selected_customers") payload.eligibility_starts_at = new Date().toISOString();
      if (ptype === "free_product") { if (payload.reward_mode === "fixed" && !payload.reward_product_key) { st.textContent = "Choose the free vial and strength."; return; } payload.discount_id = null; payload.auto_apply_discount = false; }
      b.disabled = true; st.textContent = "Saving…";
      let res;
      if (id) res = await P.client().from("site_promotions").update(payload).eq("id", id);
      else { res = await P.client().from("site_promotions").insert({ ...payload, eligibility_starts_at: payload.audience === "selected_customers" ? new Date().toISOString() : null }).select("id").single(); if (!res.error) id = res.data.id; }
      if (res.error) { st.textContent = res.error.message; b.disabled = false; return; }
      p = { ...(p || {}), ...payload, id }; // keep the saved promotion selected (no duplicate on a second save)
      const c1 = await P.client().rpc("pst_set_promotion_customers", { p_id: id, p_emails: payload.audience === "selected_customers" ? emails : [] });
      if (c1.error) { st.textContent = "Promotion saved, but who sees it wasn't: " + c1.error.message; b.disabled = false; return; }
      const c2 = await P.client().rpc("pst_save_promotion_reward_options", { p_promotion_id: id, p_keys: payload.reward_mode === "customer_choice" ? keys : [] });
      if (c2.error) { st.textContent = "Promotion saved, but the product choices weren't: " + c2.error.message; b.disabled = false; return; }
      P.closeSheet(); P.toast("Promotion saved"); then && then();
    });
    draw();
  }

  window.PSTOps2 = { discountsPane, promotionsPane };
})();
