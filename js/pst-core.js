/* Pep Shop Texas · Black Label storefront core (v1, Oct 2026)
   Same Supabase project, tables, RPCs, cart key (pst_cart_v1) and order flow as the original app.js,
   so admin.html, order emails, store credit, rewards and discounts keep working untouched. */
(function () {
  "use strict";
  const CFG = {
    url: "https://ucejjztsbmrogiteivxl.supabase.co",
    key: "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX",
    venmo: "jimmie-weaver-2",              // Venmo handle for the one-tap pay button
    support: "support@pepshoptexas.com",
    adminEmails: ["wacoweaver@gmail.com"], // order alert emails (same as app.js)
    shipRate: 12.00, freeShip: 250.00,     // same as app.js
    emailFn: "send-order-email",
    pushFn: "pst-push",
    minAge: 18,                            // matches his current sign-up rule (change to 21 here if he wants)
    cartKey: "pst_cart_v1", remindKey: "pst_remind_v1", gateKey: "pst_gate_v1",
    fields: "id,product_key,display_name,strength,category,research_focus,series,price,current_inventory,low_stock_threshold,limited_stock_threshold,is_active,featured,blend_stack,sort_name,created_at,updated_at,hot_peptide,sale_enabled,sale_price,sale_label,coa_url,coa_label,label_color,label_line_1,reorder_days_default,research_summary,home_feature_rank,coming_soon,bottle_url,bottle_sig"
  };
  const FOCUS = { performance: "Performance", recovery: "Recovery", longevity: "Longevity" };
  const COLORS = { Blue: "#1d4ea3", Orange: "#e2661b", Red: "#c3262c", Purple: "#6b3fb4", Black: "#1d1d1f", Green: "#2c7a4b" };
  const REMIND = [[0, "No reminder"], [14, "2 wks"], [28, "4 wks"], [42, "6 wks"], [56, "8 wks"]];

  /* ---------- tiny helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"'`]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
  const money = v => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const round = v => Math.round((Number(v) || 0) * 100) / 100;
  const params = new URLSearchParams(location.search);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const fmtDate = v => { const d = new Date(v); return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  /* ---------- Supabase ---------- */
  let sb = null;
  function client() {
    if (sb) return sb;
    if (!window.supabase?.createClient) throw new Error("Couldn't connect. Check your connection and refresh.");
    sb = window.supabase.createClient(CFG.url, CFG.key);
    return sb;
  }
  let userP = null;
  function getUser(fresh) {
    if (!userP || fresh) userP = client().auth.getUser().then(r => r.data?.user || null).catch(() => null);
    return userP;
  }
  async function getProfile(user) {
    if (!user) return null;
    const { data, error } = await client().from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) return { user_id: user.id, email: user.email };
    return data || { user_id: user.id, email: user.email };
  }
  async function isAdmin(user) {
    if (!user) return false;
    const rs = await Promise.allSettled([
      client().from("admin_users").select("*").eq("user_id", user.id).maybeSingle(),
      client().from("admin_users").select("*").eq("email", user.email).maybeSingle()
    ]);
    const rows = rs.filter(r => r.status === "fulfilled" && r.value?.data).map(r => r.value.data);
    return rows.some(r => r && (r.is_active === true || r.active === true || r.is_admin === true || r.email === user.email));
  }
  const customerName = (p = {}, u = {}) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || u.user_metadata?.full_name || u.email || "Customer";
  const firstName = (p = {}, u = {}) => String(p.first_name || p.full_name || u.user_metadata?.first_name || u.email || "there").trim().split(/[\s@]+/)[0];

  /* ---------- products (same query + incoming status as app.js) ---------- */
  // v528: COAs uploaded in the owner app (coa_records + coa-pdfs storage) show on the matching product.
  // Match = product name (before any "(...)") + strength, ignoring case, spaces and punctuation. Coded names map to the real peptide.
  // The newest published upload wins; products without one keep their typed coa_url.
  const COA_ALIAS = { pstcg1: "hcg", pst2tr: "tirzepatide", pst3rt: "retatrutide" };
  const coaKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const coaName = n => { const k = coaKey(String(n || "").split("(")[0]); return COA_ALIAS[k] || k; };
  async function linkUploadedCoas(rows) {
    const { data, error } = await client().from("coa_records").select("peptide_name,strength,lot_number,storage_path,created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(500);
    if (error || !data || !data.length) return;
    const by = new Map();
    for (const r of data) { const k = coaName(r.peptide_name) + "|" + coaKey(r.strength); if (r.storage_path && !by.has(k)) by.set(k, r); }
    for (const p of rows) {
      const r = by.get(coaName(p.display_name) + "|" + coaKey(p.strength)); if (!r) continue;
      p.coa_url = client().storage.from("coa-pdfs").getPublicUrl(r.storage_path).data.publicUrl;
      p.coa_label = r.lot_number ? `View COA · Lot ${r.lot_number}` : "View COA";
    }
  }
  let productsP = null;
  // Saved copy of the product list: pages draw products instantly from it while a fresh copy loads for next time.
  // The bag/checkout always use the fresh list, and a saved copy older than 12 hours is ignored.
  const PCACHE = "pst-products-cache", PMAX = 12 * 3600e3;
  try { if (/(owner|admin)[^/]*\.html$/.test(location.pathname)) localStorage.removeItem(PCACHE); } catch {} // opening the owner app or admin always forces a fresh list next time
  function products() {
    if (productsP) return productsP;
    const page = document.body?.dataset.page || "", ownerSide = ["owner", "admin"].includes(page) || !!document.body?.classList.contains("oapp");
    const fresh = fetchProducts();
    if (ownerSide) { try { localStorage.removeItem(PCACHE); } catch {} } // owner app: always fresh, and the next shop page reloads it, so edits show right away
    else fresh.then(rows => { try { localStorage.setItem(PCACHE, JSON.stringify({ t: Date.now(), rows })); } catch {} }, () => {});
    let saved = null;
    try { const c = JSON.parse(localStorage.getItem(PCACHE) || "null"); if (c && Array.isArray(c.rows) && c.rows.length && Date.now() - c.t < PMAX) saved = c.rows; } catch {}
    productsP = saved && !ownerSide && !["cart", "checkout"].includes(page) ? Promise.resolve(saved) : fresh;
    productsP.catch(() => { productsP = null; });
    return productsP;
  }
  function fetchProducts() {
    return (async () => {
      const q = f => client().from("product_catalog").select(f).eq("is_active", true).order("display_name", { ascending: true });
      // ask for every column; if his table doesn't have one yet (before install day), drop just that one and retry
      let cols = CFG.fields.split(","), data, error;
      for (let i = 0; i < 8; i++) {
        ({ data, error } = await q(cols.join(",")));
        const m = error && String(error.message || "").match(/column [\w.]*?(\w+) does not exist/i);
        if (!m || !cols.includes(m[1])) break; cols = cols.filter(c => c !== m[1]);
      }
      if (error) throw error;
      const rows = data || [];
      try {
        const keys = [...new Set(rows.map(p => p.product_key).filter(Boolean))];
        const r = await client().rpc("get_public_product_incoming_status", { p_product_keys: keys });
        const by = new Map((r.data || []).map(x => [String(x.product_key || "").trim(), x]));
        rows.forEach(p => { const x = by.get(p.product_key); if (x && Number(x.incoming_quantity || 0) > 0) { p.incoming_quantity = Number(x.incoming_quantity); p.incoming_status = String(x.incoming_status || "ordered").toLowerCase(); p.incoming_date = x.incoming_expected_arrival_date || ""; } });
      } catch {}
      try { await linkUploadedCoas(rows); } catch {}
      return rows.sort(cmpProduct);
    })();
  }
  const txt = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
  const doseVal = v => { const m = String(v || "").match(/\d+(?:\.\d+)?/g); return m ? m.reduce((s, x) => s + Number(x), 0) : Infinity; };
  function cmpProduct(a, b) { return txt(a.display_name, b.display_name) || (doseVal(a.strength) - doseVal(b.strength)) || txt(a.product_key, b.product_key); }
  const unitPrice = p => Number(p.sale_enabled && p.sale_price ? p.sale_price : p.price || 0);
  const onSale = p => !!(p.sale_enabled && p.sale_price && Number(p.sale_price) < Number(p.price));
  const qty = p => Number(p.current_inventory || 0);
  const thresholds = p => { const low = Math.max(0, Number(p.low_stock_threshold ?? 5) || 0); return { low, limited: Math.max(low, Number(p.limited_stock_threshold ?? 10) || 0) }; };
  function stock(p) {
    const n = qty(p), t = thresholds(p);
    if (n <= 0) return p.incoming_quantity ? { k: "inc", t: p.incoming_status === "in_transit" ? "In transit" : "On order", sub: p.incoming_date ? `Expected ${fmtDate(p.incoming_date)}` : "Restock on the way" } : p.coming_soon ? { k: "soon", t: "Coming soon" } : { k: "out", t: "Out of stock" };
    if (n <= t.low) return { k: "low", t: "Low stock" };
    if (n <= t.limited) return { k: "lim", t: "Limited" };
    return { k: "in", t: "In stock" };
  }
  const focuses = p => { const raw = Array.isArray(p.research_focus) ? p.research_focus : String(p.research_focus || "").split(","); return [...new Set(raw.map(x => String(x).trim().toLowerCase()).filter(x => FOCUS[x]))]; };
  const isBlend = p => ["Multi-Peptide Product", "Blend", "Stack"].includes(p.category) || p.blend_stack;
  function groups(list) {
    const m = new Map();
    list.forEach(p => { const k = String(p.display_name || p.product_key).trim().toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
    return [...m.values()].map(g => g.sort(cmpProduct));
  }
  const gIn = g => g.some(p => qty(p) > 0);
  const gBest = g => g.find(p => qty(p) > 0) || g[0];
  const gMin = g => Math.min(...g.map(unitPrice));
  function titleParts(p) {
    const t = String(p.display_name || "").trim(), m = t.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
    if (m) return { main: m[1].trim(), sub: m[2].replace(/\s*\/\s*/g, " · ").trim() };
    if (/^wolverine$/i.test(t)) return { main: t.charAt(0) + t.slice(1).toLowerCase(), sub: "BPC-157 · TB-500" };
    return { main: t, sub: "" };
  }
  const productUrl = p => `product.html?key=${encodeURIComponent(p.product_key)}`;
  const coaHref = p => { const u = String(p.coa_url || "").trim(); if (!u || /pending/i.test(u)) return ""; return /^https?:/.test(u) ? u : u.replace(/^\/?(a?ssets\/)/, "assets/").replace(/^ssets\//, "assets/"); };

  /* vial artwork from the product's label colour (no photos needed) */
  /* ---------- product bottles: Jimmie's photo vial, his label drawn live from the product's name, strength and Label Color ----------
     Any new product or color change shows up on its own. Colors are names from his list (Blue, Orange…) or a #hex. */
  const VIAL_ON = true, BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const LABEL_COLORS = { blue: "#1f4aa8", navy: "#1b2f6b", black: "#1a1a1c", green: "#1f8a46", orange: "#e8650f", red: "#c8202b", purple: "#6a2fa0", teal: "#0e8a8c", pink: "#d6337a", yellow: "#e0b00f", gold: "#b8913f", gray: "#6b7280", grey: "#6b7280", brown: "#7a4b25" };
  // starting colors for products Jimmie hasn't picked yet (he can change any of them in admin → Products → Label Color)
  const COLOR_RULES = [[/semaglutide|1sem|survodutide/i, "Teal"], [/tirzepatide|2tir/i, "Purple"], [/retatrutide|3ret/i, "Red"], [/water|misc/i, "Green"],
    [/b12|carnitine|mic\b|lipo|hcg|5000iu/i, "Black"], [/ipamorelin|cjc|sermorelin|tesamorelin|aod|kisspeptin|pt-141|melanotan|melantonin|oxytocin|cagri/i, "Orange"]];
  const vialColorName = p => { const c = String(p.label_color || "").trim(); if (c && (LABEL_COLORS[c.toLowerCase()] || /^#[0-9a-f]{6}$/i.test(c))) return c;
    const name = `${p.display_name} ${p.product_key}`; for (const [re, col] of COLOR_RULES) if (re.test(name)) return col; return "Blue"; };
  const vialHex = p => { const c = vialColorName(p); return /^#/.test(c) ? c : LABEL_COLORS[c.toLowerCase()]; };
  const vialName = p => String(p.label_line_1 || p.display_name || "").replace(/\s*\(.*\)\s*/, "").toUpperCase();
  const vialStrength = p => { const v = String(p.strength || "").replace(/\s+/g, ""); return /^b-?12\b/i.test(String(p.display_name || "")) ? v.replace(/\/.*$/, "") : v; }; // B12 label reads "10mg" (Mike's rule)
  // Mike's rules (Oct 2026): what the liquid below the label looks like. Everything else shows the white powder cake.
  const LIQUID = [[/^b-?12\b/i, "#a3122a"], [/ghk-?cu|^glow\b|^klow\b/i, "#1f5fc4"], [/5-?amino/i, "#f1b67c"]];
  const vialLiquid = p => (LIQUID.find(([re]) => re.test(String(p.display_name || ""))) || [])[1] || "";
  const vialSig = p => [p.product_key, vialName(p), vialStrength(p), vialHex(p), vialLiquid(p)].join("|");
  const vialCache = new Map(); let vialAssets = null; const vialByKey = new Map();
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function vialAssetsP() {
    return vialAssets || (vialAssets = Promise.all([loadImg("img/vial-base.webp"), loadImg("img/vial-shade.png"), loadImg("img/vial-stock.png"), fetch("img/vial.json").then(r => r.json()),
      document.fonts.load("700 40px PSTLabel"), document.fonts.load("17px PSTLabelR")]).then(([base, shade, stock, m]) => ({ base, shade, stock, m })));
  }
  async function vialCanvas(p, S = 2) {
    const { base, shade, stock, m } = await vialAssetsP(), col = vialHex(p), W = m.w * S, H = m.h * S;
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const out = mk(), g = out.getContext("2d"); g.drawImage(base, 0, 0, W, H);
    // color bands with the photo's metallic shading
    const bandC = mk(), bg = bandC.getContext("2d"); bg.fillStyle = col; bg.fillRect(0, 0, W, H);
    bg.globalCompositeOperation = "hard-light"; bg.drawImage(shade, 0, 0, W, H); bg.globalCompositeOperation = "destination-in"; bg.drawImage(shade, 0, 0, W, H);
    g.drawImage(bandC, 0, 0);
    // liquid below the label: tint the glass bottom, keeping the photo's light and shadow
    const liq = vialLiquid(p);
    if (liq) {
      const y0 = (m.label[1] + m.label[3]) * S, liqC = mk(), lq = liqC.getContext("2d");
      lq.drawImage(base, 0, 0, W, H); lq.globalCompositeOperation = "multiply"; lq.fillStyle = liq; lq.fillRect(0, 0, W, H);
      lq.globalCompositeOperation = "destination-in"; lq.drawImage(base, 0, 0, W, H);
      g.save(); g.beginPath(); g.rect(0, y0, W, H - y0); g.clip(); g.globalAlpha = .92; g.drawImage(liqC, 0, 0); g.restore();
    }
    // flat artwork: name, strength bar, research line, rule, vertical strength
    const art = mk(), a = art.getContext("2d"), name = vialName(p), str = vialStrength(p), X = v => v * S;
    let fs = m.name.size; a.font = `700 ${X(fs)}px PSTLabel`; while (a.measureText(name).width > X(m.name.maxW) && fs > 14) { fs--; a.font = `700 ${X(fs)}px PSTLabel`; }
    a.fillStyle = "#121214"; a.textBaseline = "alphabetic"; a.fillText(name, X(m.name.x), X(m.name.y));
    const barC = mk(), bb = barC.getContext("2d"); bb.fillStyle = col; bb.fillRect(X(m.bar.x), X(m.bar.y), X(m.bar.w), X(m.bar.h));
    bb.globalCompositeOperation = "hard-light"; bb.drawImage(stock, 0, 0, W, H); bb.globalCompositeOperation = "destination-in"; bb.fillRect(X(m.bar.x), X(m.bar.y), X(m.bar.w), X(m.bar.h));
    a.drawImage(barC, 0, 0);
    a.fillStyle = "#fbfbfb"; a.font = `700 ${X(m.bar.text.size)}px PSTLabel`; a.textBaseline = "middle"; a.fillText(str, X(m.bar.text.x), X(m.bar.text.y));
    a.fillStyle = "#222"; a.font = `${X(m.ruo.size)}px PSTLabelR`; a.textBaseline = "alphabetic"; a.fillText("For Research Use Only", X(m.ruo.x), X(m.ruo.y));
    a.fillRect(X(m.rule.x), X(m.rule.y), Math.max(2, X(1.6)), X(m.rule.h));
    if (m.rightBand) { a.save(); a.translate(X((m.rightBand[0] + m.rightBand[1]) / 2), X(m.vert.y)); a.rotate(Math.PI / 2); a.fillStyle = "#fbfbfb"; a.font = `700 ${X(m.vert.size)}px PSTLabel`; a.textAlign = "center"; a.textBaseline = "middle"; a.fillText(str, 0, 0); a.restore(); }
    // wrap the artwork around the bottle (cylinder) column by column
    const [lx, ly, lw, lh] = m.label.map(X), cx = lx + lw / 2, half = lw / 2, ang = m.warpDeg * Math.PI / 180, rad = half / Math.sin(ang);
    for (let x = 0; x < lw; x++) { const xs = x - half, src = rad * Math.asin(Math.max(-1, Math.min(1, xs / rad))) * (half / (rad * ang)) + cx; g.drawImage(art, src, ly, 1, lh, lx + x, ly, 1, lh); }
    return out;
  }
  // draw only as many pixels as the spot needs (thumbnails are ~10x cheaper), remember results across visits
  const vialScale = w => { const px = w * Math.min(2, window.devicePixelRatio || 1); return px <= 70 ? .4 : px <= 160 ? .7 : px <= 260 ? 1.2 : 2; };
  const toBlob = (c, type = "image/webp", q = .88) => new Promise(r => c.toBlob(r, type, q));
  async function vialURL(p, sc = 2) {
    const sig = vialSig(p) + "@" + sc; if (vialCache.has(sig)) return vialCache.get(sig);
    const req = location.origin + "/__pst_vial/" + encodeURIComponent(sig);
    let box = null; try { box = await caches.open("pst-vials-v2"); const hit = await box.match(req); if (hit) { const u = URL.createObjectURL(await hit.blob()); vialCache.set(sig, u); return u; } } catch {}
    const c = await vialCanvas(p, sc), blob = await toBlob(c);
    const u = URL.createObjectURL(blob); vialCache.set(sig, u);
    try { box && blob && box.put(req, new Response(blob, { headers: { "Content-Type": blob.type } })); } catch {}
    return u;
  }
  // owner app: make the full-size bottle once and save it, so shoppers download a finished picture
  async function bakeBottle(p) {
    const sig = vialSig(p), c = await vialCanvas(p, 2), blob = await toBlob(c, "image/webp", .9);
    const ext = blob.type === "image/webp" ? "webp" : "png";
    let h = 0; for (const ch of sig) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const path = `${p.product_key}-${h.toString(36)}.${ext}`;
    const up = await client().storage.from("product-bottles").upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "31536000" });
    if (up.error) throw up.error;
    const url = client().storage.from("product-bottles").getPublicUrl(path).data.publicUrl;
    const { error } = await client().from("product_catalog").update({ bottle_url: url, bottle_sig: sig }).eq("product_key", p.product_key);
    if (error) throw error;
    p.bottle_url = url; p.bottle_sig = sig; return url;
  }
  async function vialStudio(p, size = 1200) {
    const [bgI, v] = await Promise.all([loadImg("img/vial-studio.webp"), vialCanvas(p, 3)]);
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); g.drawImage(bgI, 0, 0, size, size);
    const horizon = size * .8, s = (size * .7) / (v.height / 3), vw = v.width / 3 * s, vh = v.height / 3 * s, x = (size - vw) / 2, y = horizon - vh + 10 * s;
    g.save(); g.globalAlpha = .14; g.translate(x, y + vh * 2 - 22 * s); g.scale(1, -1); g.drawImage(v, 0, 0, vw, vh); g.restore();
    const fade = g.createLinearGradient(0, horizon, 0, size); fade.addColorStop(0, "rgba(10,16,28,0)"); fade.addColorStop(.3, "rgba(10,16,28,1)"); g.fillStyle = fade; g.fillRect(0, horizon + 2, size, size);
    g.drawImage(v, x, y, vw, vh); return c.toDataURL("image/jpeg", .9);
  }
  // fill in bottles as they appear on the page
  let vq = Promise.resolve();
  const fill = im => { const p = vialByKey.get(im.dataset.vkey); if (!p) return; const sc = Number(im.dataset.vs) || 2, sig = vialSig(p) + "@" + sc;
    if (im.dataset.vsig === sig) return; im.dataset.vsig = sig;
    vq = vq.then(() => vialURL(p, sc)).then(u => { im.src = u; }, () => {}); };   // one at a time keeps the page responsive
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: "400px" }) : null;
  function hydrateVials(root = document) {
    root.querySelectorAll?.("img[data-vkey]").forEach(im => { const p = vialByKey.get(im.dataset.vkey); if (!p) return;
      if (im.dataset.vsig === vialSig(p) + "@" + (Number(im.dataset.vs) || 2)) return; io ? io.observe(im) : fill(im); });
  }
  if (typeof MutationObserver !== "undefined") new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => n.nodeType === 1 && hydrateVials(n.matches?.("img[data-vkey]") ? n.parentNode : n)); })
    .observe(document.documentElement, { childList: true, subtree: true });
  function vial(p, w = 110) {
    if (p?.product_key) vialByKey.set(p.product_key, p);
    if (VIAL_ON) {
      const alt = `${esc(p.display_name)} ${esc(p.strength || "")} vial`, h = Math.round(w * 200 / 120);
      if (p.bottle_url && p.bottle_sig === vialSig(p)) return `<img class="vial vimg" src="${esc(p.bottle_url)}" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async">`;
      const sc = vialScale(w);
      return `<img class="vial vimg" data-vkey="${esc(p.product_key)}" data-vs="${sc}" src="${vialCache.get(vialSig(p) + "@" + sc) || BLANK}" width="${w}" height="${h}" alt="${alt}" decoding="async">`;
    }
    const c = COLORS[p.label_color] || "#13294b", id = "v" + Math.random().toString(36).slice(2, 7);
    let name = titleParts(p).main; if (name.length > 13) name = name.replace(/\s*\(.*\)/, "").slice(0, 13);
    const fs = name.length > 7 ? 12 : 14, fit = name.length * fs * .62 > 52 ? ' textLength="52" lengthAdjust="spacingAndGlyphs"' : "";
    return `<svg class="vial" viewBox="0 0 120 200" width="${w}" height="${Math.round(w * 200 / 120)}" role="img" aria-label="${esc(p.display_name)} ${esc(p.strength || "")} vial">
<defs><linearGradient id="${id}c" x1="0" x2="1"><stop offset="0" stop-color="#8d7a4f"/><stop offset=".45" stop-color="#ecdcaa"/><stop offset="1" stop-color="#7d6a3f"/></linearGradient>
<linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="#dfe6ee"/><stop offset=".2" stop-color="#fff"/><stop offset=".75" stop-color="#eef2f6"/><stop offset="1" stop-color="#c9d2dc"/></linearGradient></defs>
<ellipse cx="60" cy="194" rx="40" ry="5" fill="#000" opacity=".25"/><rect x="34" y="8" width="52" height="28" rx="5" fill="url(#${id}c)"/><rect x="40" y="34" width="40" height="12" fill="#c9cfd6"/>
<rect x="22" y="46" width="76" height="146" rx="12" fill="url(#${id}g)" stroke="#b9c3ce"/><rect x="28" y="150" width="64" height="36" rx="6" fill="${vialLiquid(p) || "#f4f1ea"}" opacity=".9"/>
<rect x="22" y="78" width="76" height="62" fill="#fff"/><rect x="22" y="78" width="10" height="62" fill="${c}"/><rect x="88" y="78" width="10" height="62" fill="${c}"/>
<text x="60" y="100" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fs}" fill="#13294b"${fit}>${esc(name)}</text>
<rect x="38" y="107" width="44" height="15" rx="3" fill="${c}"/><text x="60" y="118.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="10" fill="#fff">${esc(p.strength || "")}</text>
<text x="60" y="133" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="5.5" fill="#6b7280" textLength="50" lengthAdjust="spacingAndGlyphs">RESEARCH USE ONLY</text>
<rect x="30" y="50" width="6" height="134" rx="3" fill="#fff" opacity=".7"/></svg>`;
  }

  /* ---------- cart (same storage format as app.js) ---------- */
  function readCart() {
    const c = store.get(CFG.cartKey, []);
    return Array.isArray(c) ? c.filter(i => i && typeof i.key === "string" && Number(i.quantity) > 0).map(i => ({ key: i.key, quantity: Math.min(9999, Math.max(1, Math.floor(Number(i.quantity)))) })) : [];
  }
  function writeCart(c) { store.set(CFG.cartKey, c); refreshCount(); }
  /* ---------- built-in analytics (no cookies, no third parties; owner-only reports) ---------- */
  const ANALYTICS_OFF = () => PREVIEW || /^(owner|admin)/.test(document.body?.dataset.page || "") || /admin|owner|inventory|reports|products|customers|discounts|promotions|manual-order|report-writer|vendor|catalog-ads|availability-requests|bulk-requests/.test(location.pathname.split("/").pop() || "");
  function ids() {
    let v = store.get("pst_vid", ""); if (!v) { v = (crypto.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, "").slice(0, 24); store.set("pst_vid", v); }
    let s = null; try { s = JSON.parse(sessionStorage.getItem("pst_sid") || "null"); } catch {}
    if (!s || Date.now() - s.t > 30 * 60e3) s = { id: (crypto.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, "").slice(0, 24), utm: {} };
    const q = new URLSearchParams(location.search); ["source", "medium", "campaign"].forEach(k => { if (q.get("utm_" + k)) s.utm[k] = q.get("utm_" + k).slice(0, 60); });
    s.t = Date.now(); try { sessionStorage.setItem("pst_sid", JSON.stringify(s)); } catch {}
    return { v, s };
  }
  function track(event, d = {}) {
    try {
      if (ANALYTICS_OFF() || window.PST_DEMO) return;
      const { v, s } = ids(), w = innerWidth, ref = document.referrer ? new URL(document.referrer).host : "";
      const p = { visitor: v, session: s.id, event, path: location.pathname.split("/").pop() || "index.html", product_key: d.key || null, qty: d.qty ?? null, value: d.value ?? null, term: d.term || null,
        ref_host: ref && ref !== location.host ? ref : null, utm_source: s.utm.source || null, utm_medium: s.utm.medium || null, utm_campaign: s.utm.campaign || null,
        device: w < 700 ? "mobile" : w < 1100 ? "tablet" : "desktop", app: matchMedia("(display-mode: standalone)").matches || !!navigator.standalone };
      client().rpc("pst_track", { p }).then(() => {}, () => {});
    } catch {}
  }
  function addToCart(key, n = 1) { track("add_to_bag", { key, qty: n }); const c = readCart(), e = c.find(i => i.key === key); if (e) e.quantity += n; else c.push({ key, quantity: n }); writeCart(c); }
  function setQty(key, n) { n = Math.min(9999, Math.max(0, Math.floor(Number(n) || 0))); writeCart(readCart().map(i => i.key === key ? { ...i, quantity: n } : i).filter(i => i.quantity > 0)); }
  const count = () => readCart().reduce((s, i) => s + i.quantity, 0);
  function refreshCount() { const n = count(); $$("[data-cart-count]").forEach(el => { el.textContent = n; el.hidden = !n; }); }
  async function aliasMap(cart) {
    const legacy = [...new Set(cart.map(i => i.key).filter(k => k && !/^PSTP\d+$/i.test(k)))];
    if (!legacy.length) return {};
    try { const { data } = await client().from("product_key_aliases").select("old_product_key,new_product_key").in("old_product_key", legacy); return Object.fromEntries((data || []).map(r => [r.old_product_key, r.new_product_key])); } catch { return {}; }
  }
  async function cartRows() {
    const cart = readCart(); if (!cart.length) return [];
    const [all, al] = await Promise.all([products(), aliasMap(cart)]);
    return cart.map(i => ({ key: i.key, quantity: i.quantity, product: all.find(p => p.product_key === (al[i.key] || i.key)) || null }));
  }
  /* reorder reminders: {key: {d: days (0 = off), a: auto}} — auto learns from the customer's own reorder rhythm */
  function reminders() { const r = store.get(CFG.remindKey, {}), o = {}; for (const k in r) o[k] = typeof r[k] === "number" ? { d: r[k], a: false } : r[k]; return o; }
  function setReminder(key, days, auto = false, perVial = false) { const r = reminders(); if (days === null) delete r[key]; else r[key] = { d: Number(days) || 0, a: !!auto && Number(days) > 0, pv: !!auto && !!perVial }; store.set(CFG.remindKey, r); }

  /* run-out estimates (no doses): own history -> chosen reminder -> learned product cycle -> Jimmie's default -> 28 days */
  let cyclesP = null;
  function cycles() {
    if (!cyclesP) cyclesP = client().from("pst_product_cycles").select("product_key,typical_days,samples").then(r => Object.fromEntries((r.data || []).map(c => [c.product_key, c]))).catch(() => ({}));
    return cyclesP;
  }
  async function suggestDays(p) {
    // v5.1: Jimmie's protocol (saved as days one vial lasts) sets the timing first; learned reorder rhythm is the fallback
    if (Number(p.reorder_days_default) > 0) return { d: Number(p.reorder_days_default), basis: "default", perVial: true };
    const c = (await cycles())[p.product_key];
    if (c && Number(c.typical_days) > 0) return { d: Math.round(Number(c.typical_days)), basis: "typical", n: c.samples };
    return { d: 28, basis: "store" };
  }
  const DEAD = ["rejected", "cancelled", "canceled", "refunded", "failed"];
  async function myHistory(user) {
    user = user || await getUser(); if (!user) return null;
    let r = await client().from("orders").select("id,order_number,status,order_status,total,subtotal,shipping,payment_status,payment_method,tracking_number,tracking_carrier,customer_notes,created_at,updated_at").eq("customer_id", user.id).order("created_at", { ascending: false });
    if (r.error) r = await client().from("orders").select("id,order_number,status,total,subtotal,shipping,payment_status,tracking_number,tracking_carrier,created_at").eq("customer_id", user.id).order("created_at", { ascending: false });
    const orders = (r.data || []).filter(o => !DEAD.includes(String(o.order_status || o.status || "").toLowerCase()));
    const items = {};
    if (orders.length) {
      let ir = await client().from("order_items").select("id,order_id,product_id,product_key,product_name,product_strength,quantity,unit_price,line_total,reorder_reminder_days,reorder_reminder_auto").in("order_id", orders.map(o => o.id));
      if (ir.error) ir = await client().from("order_items").select("id,order_id,product_id,product_key,product_name,product_strength,quantity,unit_price,line_total").in("order_id", orders.map(o => o.id));
      (ir.data || []).forEach(i => (items[i.order_id] ||= []).push(i));
    }
    return { orders, items, all: r.data || [] };
  }
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  /* one row per product the customer has bought, newest first, with a run-out estimate */
  async function myProducts(hist) {
    if (!hist) return [];
    const all = await products(), by = {};
    [...hist.orders].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(o => (hist.items[o.id] || []).forEach(i => {
      const p = all.find(x => x.product_key === i.product_key || x.id === i.product_id); const k = p ? p.product_key : (i.product_key || i.product_name + i.product_strength);
      (by[k] ||= { key: k, p, name: i.product_name, strength: i.product_strength, buys: [] }).buys.push({ at: o.created_at, q: Number(i.quantity || 1), i, o });
    }));
    const out = [];
    for (const k in by) {
      const g = by[k], last = g.buys[g.buys.length - 1], dates = g.buys.map(b => new Date(b.at).getTime());
      const gaps = dates.slice(1).map((t, j) => (t - dates[j]) / 864e5).filter(d => d >= 5 && d <= 200);
      let est;
      if (gaps.length) est = { d: Math.round(median(gaps)), basis: "yours" };
      else if (Number(last.i.reorder_reminder_days) > 0) est = { d: Number(last.i.reorder_reminder_days), basis: "chosen" };
      else est = g.p ? await suggestDays(g.p) : { d: 28, basis: "store" };
      const at = new Date(new Date(last.at).getTime() + est.d * 864e5), left = Math.ceil((at - Date.now()) / 864e5);
      out.push({ ...g, last, est, at, left, qty: last.q, inProgress: !isDone(last.o) });
    }
    return out.sort((a, b) => a.left - b.left);
  }
  // Jimmie records a pickup hand-off as a "Hand Delivered" shipment (status shipped): that order is picked up, i.e. done
  const handedOff = o => /hand\s*deliver/i.test(`${o.tracking_carrier || ""} ${o.tracking_number || ""}`);
  function isDone(o) { const s = String(o.order_status || o.status || "").toLowerCase(); return ["delivered", "complete", "completed"].includes(s) || (s === "shipped" && (!/local pickup/i.test(o.customer_notes || "") || handedOff(o))); }
  /* where an order is, in customer words */
  function stageOf(o) {
    const s = String(o.order_status || o.status || "pending").toLowerCase(), pay = String(o.payment_status || "pending").toLowerCase(), pickup = /local pickup/i.test(o.customer_notes || "");
    if (DEAD.includes(s)) return { n: -1, label: s.charAt(0).toUpperCase() + s.slice(1), cls: "bad", pickup };
    const n = ["shipped", "delivered", "complete", "completed"].includes(s) ? 3 : s === "packed" ? 2 : (pay === "paid" || s === "processing" || s === "paid") ? 1 : 0;
    const label = n === 3 ? (handedOff(o) ? (pickup ? "Picked up" : "Hand delivered") : pickup ? (s === "shipped" ? "Ready for pickup" : "Picked up") : s === "delivered" ? "Delivered" : "On the way") : n === 2 ? (pickup ? "Ready for pickup" : "Packed") : n === 1 ? "Paid · getting it ready" : "Awaiting payment";
    return { n, label, cls: n === 0 ? "pend" : n === 3 ? "ship" : "ok", pickup };
  }
  async function paidNotice(orderId) {
    const { data } = await client().auth.getSession();
    const r = await fetch(`${CFG.url}/functions/v1/${CFG.pushFn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: `Bearer ${data?.session?.access_token}` }, body: JSON.stringify({ paid_notice: orderId }) }).catch(() => null);
    return !!(r && r.ok);
  }

  /* ---------- discounts / credit / rewards (same RPCs as app.js) ---------- */
  async function validateDiscount(code) {
    code = String(code || "").trim(); if (!code) throw new Error("Enter a discount code first.");
    const { data, error } = await client().rpc("validate_cart_discount_code", { p_code: code });
    if (error) throw error;
    const r = data && typeof data === "object" ? data : {};
    if (!r.valid) throw new Error(r.message || "That code isn't valid for this account.");
    return { id: r.discount_id, code: r.code, discount_type: r.discount_type, percent_off: Number(r.percent_off || 0), amount_off: Number(r.amount_off || 0) };
  }
  // payment-method savings: % of subtotal, never combined with a discount code (his rule)
  const payDiscount = (sub, method, code) => (code || !method?.pct ? 0 : round(sub * method.pct / 100));
  /* v3.7: "how to pay" card with his own QR code, account and instructions (checkout confirmation + unpaid orders) */
  async function payCard(methodLabel, due, orderNo, orderId) {
    const all = await paymentMethods().catch(() => []);
    const m = all.find(x => String(x.label).toLowerCase() === String(methodLabel || "").toLowerCase() || String(x.id).toLowerCase() === String(methodLabel || "").toLowerCase()) || { label: methodLabel || "Payment" };
    const isV = /venmo/i.test(m.id || m.label), label = payLabel(m), handle = (m.account || "@" + CFG.venmo).replace(/^@?/, "@");
    const qr = m.qr && /^(https?:|data:image\/|[\w./-]+\.(png|jpe?g|webp|gif)$)/i.test(m.qr) ? m.qr : "";
    const vlink = venmoLink(due, orderNo);
    return `<div class="paycard paycard2"><div class="vh">${isV ? `<span class="vlogo" style="width:40px;height:40px;border-radius:9px;background:#008CFF;display:grid;place-items:center"><svg viewBox="0 0 48 48" width="26" height="26"><path d="M33.6 11c1 1.6 1.4 3.3 1.4 5.4 0 6.7-5.7 15.4-10.4 21.6H13.9L9.6 12.4l9.4-.9 2.3 18.4c2.1-3.5 4.7-9 4.7-12.7 0-2-.3-3.4-.9-4.6l8.5-1.6z" fill="#fff"/></svg></span>` : `<span class="pcic">${icon("check", 20)}</span>`}<div><b>Send ${money(due)} ${isV ? "on Venmo" : `with ${esc(label)}`}</b>${m.account ? `<span>${esc(m.accountLabel || "Send payment to")}: <strong class="pcacct">${esc(isV ? handle : m.account)}</strong> <button type="button" class="pccopy" data-copyval="${esc(isV ? handle : m.account)}">Copy</button></span>` : ""}</div></div>
<div class="paygrid2">${qr ? `<figure class="pcqr"><img src="${esc(qr)}" alt="${esc(label)} QR code" width="180" height="180" loading="lazy"><figcaption>Scan to pay</figcaption></figure>` : ""}<div>
${m.instructions ? `<p class="pcins">${esc(m.instructions)}</p>` : ""}
<p class="pcnote">Payment note: <code>${esc(orderNo)}</code> <span class="muted small">(the order number only, don't mention products)</span></p>
${isV ? `<a class="btn venmo wide" href="${esc(vlink)}" target="_blank" rel="noopener">Pay ${money(due)} with Venmo</a>` : ""}
${orderId ? `<button class="btn ghost wide" type="button" data-sent="${esc(orderId)}" style="margin-top:8px">I've sent payment</button>` : ""}</div></div></div>`;
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-copyval]"); if (!b) return; navigator.clipboard?.writeText(b.dataset.copyval).then(() => { b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1500); }); });
  const payLabel = m => (/apple/i.test(m?.id || "") && /apple pay/i.test(m?.label || "") ? "Apple Cash" : m?.label || ""); // what his Apple option really is
  let boP = null; // checkout backorders are on only after the v4 server update is installed
  const backordersOn = () => boP || (boP = client().rpc("pst_backorders_enabled").then(r => r.data === true, () => false));
  function discountAmount(sub, d) {
    const base = Math.max(0, Number(sub || 0)); if (!d || base <= 0) return 0;
    const t = String(d.discount_type || "").toLowerCase(), pc = Math.max(0, d.percent_off || 0), am = Math.max(0, d.amount_off || 0);
    if (t === "percent" || pc > 0) return round(Math.min(base, base * pc / 100));
    if (t === "amount" || t === "fixed" || am > 0) return round(Math.min(base, am));
    return 0;
  }
  async function creditBalance() { const r = await client().rpc("pst_my_store_credit_balance"); if (r.error) throw r.error; return Math.max(0, Number(r.data || 0)); }
  const countsForRewards = rows => rows.reduce((n, r) => { const c = String(r.product?.category || "").toLowerCase(); return n + ((c.includes("peptide") || c.includes("glp")) ? Number(r.quantity || 0) : 0); }, 0);
  async function freeVials(rows) {
    const bought = countsForRewards(rows); if (!bought) return [];
    const { data: promos, error } = await client().from("site_promotions").select("id,title,reward_product_key,reward_quantity,minimum_paid_quantity,starts_at,ends_at").eq("is_active", true).eq("promotion_type", "free_product").eq("reward_mode", "fixed");
    if (error) return [];
    const now = Date.now(), q = (promos || []).filter(p => p.reward_product_key && bought >= Number(p.minimum_paid_quantity || 1) && (!p.starts_at || Date.parse(p.starts_at) <= now) && (!p.ends_at || Date.parse(p.ends_at) >= now));
    if (!q.length) return [];
    const { data: inv } = await client().from("product_inventory").select("product_key,display_name,strength,current_inventory").in("product_key", q.map(p => p.reward_product_key));
    return q.map(p => { const r = (inv || []).find(i => i.product_key === p.reward_product_key); return r && Number(r.current_inventory || 0) >= Number(p.reward_quantity || 1) ? { title: p.title, name: [r.display_name, r.strength].filter(Boolean).join(" · "), qty: Number(p.reward_quantity || 1) } : null; }).filter(Boolean);
  }
  /* "Buy any peptide, get X free": the free vial shows as a real $0 line in the bag for everyone (signed in or not).
     It is display only. The order still gets the free vial the same way as before (added when payment is confirmed). */
  let giftP = null, giftT = 0;
  async function giftLines(rows, user) {
    const bought = countsForRewards(rows); if (!bought) return [];
    if (!giftP || Date.now() - giftT > 60000) { giftT = Date.now(); giftP = activePromotions(user).catch(() => []); }
    const promos = (await giftP).filter(p => p.promotion_type === "free_product" && (p.reward_mode || "fixed") === "fixed" && p.reward_product_key && bought >= Number(p.minimum_paid_quantity || 1));
    if (!promos.length) return [];
    const all = await products().catch(() => []);
    return promos.map(p => { const r = all.find(x => x.product_key === p.reward_product_key), q = Number(p.reward_quantity || 1); return r && qty(r) >= q ? { p: r, qty: q, title: p.title, body: p.body || "" } : null; }).filter(Boolean);
  }
  async function choiceRewards(rows) {
    const bought = countsForRewards(rows); if (!bought) return [];
    const { data: promos, error } = await client().from("site_promotions").select("id,title,minimum_paid_quantity,reward_quantity,starts_at,ends_at,audience").eq("is_active", true).eq("promotion_type", "free_product").eq("reward_mode", "customer_choice");
    if (error) return [];
    const now = Date.now(), out = [];
    for (const p of promos || []) {
      if (bought < Number(p.minimum_paid_quantity || 1) || (p.starts_at && Date.parse(p.starts_at) > now) || (p.ends_at && Date.parse(p.ends_at) < now)) continue;
      const { data: ok, error: e2 } = await client().rpc("pst_promotion_visible_to_current_customer", { p_id: p.id });
      if (e2 || !ok) continue; out.push(p);
    }
    if (!out.length) return [];
    const { data: opts } = await client().rpc("pst_public_reward_options");
    return out.map(p => ({ id: p.id, title: p.title || "Choose your free vial", qty: Number(p.reward_quantity || 1), options: (opts || []).filter(v => v.promotion_id === p.id && Number(v.current_inventory) >= Number(p.reward_quantity || 1)) }));
  }
  async function paymentMethods() {
    try {
      const r = await fetch(`${CFG.url}/functions/v1/${CFG.emailFn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key }, body: JSON.stringify({ action: "payment_options" }) });
      const j = await r.json();
      if (j.ok && Array.isArray(j.methods)) {
        const list = j.methods.filter(m => m.id && m.label).map(m => ({ ...m, pct: 0 }));
        try { // v3.2: his per-method discount (e.g. Bitcoin 10%), same rule as his cart-payment-discounts.js
          const { data } = await client().from("site_payment_options").select("payment_methods").eq("id", 1).maybeSingle();
          let saved = data?.payment_methods; if (typeof saved === "string") saved = JSON.parse(saved);
          for (const m of list) { const s = (saved || []).find(x => String(x.id) === String(m.id)); const n = Number(s?.discountPercent ?? s?.discount_percent); m.pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
            // v3.7: his saved payment details, same fields his old checkout showed (QR, account, instructions)
            if (s) { m.account = String(s.account || s.handle || s.wallet || s.value || "").trim(); m.accountLabel = String(s.accountLabel || s.account_label || "Send payment to").trim(); m.instructions = String(s.instructions || s.note || s.notes || "").trim(); m.qr = String(s.qr_image || s.qrUrl || s.qr_url || s.qr || s.qr_code || s.qr_image_url || s.image || s.image_url || "").trim(); } }
        } catch {}
        return list;
      }
    } catch {}
    return [{ id: "venmo", label: "Venmo", pct: 0 }];
  }
  // v5.12: every live promotion this shopper can see (the top bar shows only the first; the home page lists them all)
  async function activePromotions(user) {
    const { data, error } = await client().from("site_promotions").select("id,title,body,badge,button_text,button_link,starts_at,ends_at,sort_order,audience,promotion_type,reward_product_key,minimum_paid_quantity,reward_quantity,reward_mode").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false });
    if (error) return [];
    const now = Date.now(), out = [];
    for (const p of data || []) {
      if ((p.starts_at && Date.parse(p.starts_at) > now) || (p.ends_at && Date.parse(p.ends_at) < now)) continue;
      const href = String(p.button_link || "").toLowerCase(), acct = href.includes("register.html") || /create account/i.test(p.button_text || "") || /welcome/i.test(p.title || "");
      if (user && acct) continue;
      if (p.audience === "selected_customers") { const r = await client().rpc("pst_promotion_visible_to_current_customer", { p_id: p.id }); if (r.error || !r.data) continue; }
      out.push(p);
    }
    return out;
  }
  async function activePromotion(user) {
    const { data, error } = await client().from("site_promotions").select("id,title,body,badge,button_text,button_link,is_active,starts_at,ends_at,sort_order,accent_color,audience,promotion_type").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false });
    if (error) return null;
    const now = Date.now();
    for (const p of data || []) {
      if (p.promotion_type === "free_product" && !p.body) continue;
      if ((p.starts_at && Date.parse(p.starts_at) > now) || (p.ends_at && Date.parse(p.ends_at) < now)) continue;
      const href = String(p.button_link || "").toLowerCase(), acct = href.includes("register.html") || /create account/i.test(p.button_text || "") || /welcome/i.test(p.title || "");
      if (user && acct) continue;
      if (p.audience === "selected_customers") { const r = await client().rpc("pst_promotion_visible_to_current_customer", { p_id: p.id }); if (r.error || !r.data) continue; }
      return p;
    }
    return null;
  }

  /* ---------- order submission (mirrors app.js handleInquirySubmit) ---------- */
  function missingCol(err, table) {
    const msg = String(err?.message || err || "");
    const pats = [new RegExp(`column\\s+${table}\\.([a-zA-Z0-9_]+)\\s+does\\s+not\\s+exist`, "i"), new RegExp(`column\\s+\\"?([a-zA-Z0-9_]+)\\"?\\s+of\\s+relation\\s+\\"?${table}\\"?\\s+does\\s+not\\s+exist`, "i"), /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i, /Could not find ['"]([a-zA-Z0-9_]+)['"] in the schema cache/i];
    for (const p of pats) { const m = msg.match(p); if (m?.[1]) return m[1]; }
    return "";
  }
  async function insertOne(table, payload) {
    const w = { ...payload };
    for (let i = 0; i < Object.keys(payload).length + 5; i++) {
      const { data, error } = await client().from(table).insert(w).select().single();
      if (!error) return data;
      const m = missingCol(error, table); if (m && m in w) { delete w[m]; continue; } throw error;
    }
    throw new Error(`Could not save ${table}.`);
  }
  async function insertMany(table, rows) {
    let w = rows.map(r => ({ ...r }));
    for (let i = 0; i < Object.keys(rows[0] || {}).length + 5; i++) {
      const { error } = await client().from(table).insert(w);
      if (!error) return w;
      const m = missingCol(error, table); if (m && w.some(r => m in r)) { w = w.map(r => { const n = { ...r }; delete n[m]; return n; }); continue; } throw error;
    }
    throw new Error(`Could not save ${table}.`);
  }
  async function postEmail(payload) {
    const { data } = await client().auth.getSession();
    const token = data?.session?.access_token || CFG.key;
    const r = await fetch(`${CFG.url}/functions/v1/${CFG.emailFn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error("email " + r.status);
  }
  function emailPayload(order, ctx, over = {}) {
    return {
      type: "order_received", originalType: "order_received", to: ctx.customerEmail,
      customerName: ctx.customerName, customerEmail: ctx.customerEmail, customerNumber: ctx.customerNumber || "",
      orderNumber: order.order_number || order.id, orderDate: order.created_at,
      subtotal: ctx.subtotal, discount: ctx.discount ?? order.discount ?? order.discount_amount ?? 0, shipping: ctx.shipping, tax: 0, total: ctx.total,
      subject: `Pep Shop Texas Order Received${order.order_number ? ` #${order.order_number}` : ""}`,
      statusNote: "Your order has been received and is being reviewed.",
      paymentMethod: ctx.paymentMethod, paymentStatus: "pending", paymentInstructions: "", paymentQr: "", paymentQrImage: "",
      deliveryMethod: ctx.deliveryMethod,
      items: ctx.items.map(i => ({ name: [i.product_name, i.product_strength].filter(Boolean).join(" · "), strength: i.product_strength || "", quantity: i.quantity, price: i.unit_price, total: i.line_total })),
      ...over
    };
  }
  async function submitOrder({ paymentLabel, payMethod = null, delivery, discount, applyCredit, rewardChoices = [], notes = "" }) {
    const { data: ud } = await client().auth.getUser(); const user = ud?.user;
    if (!user) { location.href = `login.html?redirect=cart.html`; throw new Error("Please sign in to place your order."); }
    const profile = await getProfile(user);
    const name = customerName(profile, user), email = String(profile?.email || user.email || "").trim();
    if (!email) throw new Error("Your account needs an email address.");
    const rows = (await cartRows()).filter(r => r.product);
    if (!rows.length) throw new Error("Your cart is empty.");
    const bo = await backordersOn();
    const bad = rows.find(r => (bo ? qty(r.product) <= 0 : qty(r.product) < r.quantity));
    if (bad) throw new Error(qty(bad.product) <= 0 ? `${bad.product.display_name} ${bad.product.strength || ""} just sold out. Remove it to continue.` : `Only ${qty(bad.product)} of ${bad.product.display_name} ${bad.product.strength || ""} left. Lower the quantity to continue.`);
    if (rewardChoices.some(c => !c.productKey)) throw new Error("Pick your free vial for each reward before placing the order.");
    const now = new Date().toISOString(), id = crypto.randomUUID(), rem = reminders();
    const priced = rows.map(r => ({ p: r.product, q: r.quantity, u: unitPrice(r.product), t: unitPrice(r.product) * r.quantity }));
    const sub = priced.reduce((s, i) => s + i.t, 0);
    const ship = delivery === "pickup" || sub >= CFG.freeShip ? 0 : CFG.shipRate;
    const codeDisc = discountAmount(sub, discount), payDisc = payDiscount(sub, payMethod, discount);
    const disc = round(codeDisc + payDisc);
    const total = round(sub + ship - disc);
    const short = priced.filter(i => i.q > qty(i.p)).map(i => `${i.p.display_name} ${i.p.strength || ""}`.trim() + `: ${qty(i.p)} ready now, ${i.q - qty(i.p)} on backorder`);
    const rd = k => (rem[k] && rem[k].d > 0 ? rem[k] : null), rdays = i => { const r = rd(i.p.product_key); return r ? (r.a && r.pv ? Math.min(365, r.d * Math.max(1, i.q)) : r.d) : null; };
    const remindLines = priced.filter(i => rd(i.p.product_key)).map(i => `${i.p.display_name} ${i.p.strength || ""}`.trim() + ` ${rd(i.p.product_key).a ? "auto, ~" : "in "}${Math.round(rdays(i) / 7)} wks`);
    const l1 = profile?.shipping_address_line1 || profile?.address1 || (String(profile?.shipping_address || "").trim() || null), // profiles keep the street in shipping_address
      l2 = profile?.shipping_address_line2 || profile?.address2 || null;
    const city = profile?.shipping_city || profile?.city || null, st = profile?.shipping_state || profile?.state || null, zip = profile?.shipping_zip || profile?.zip || null;
    const addr = profile?.shipping_address || profile?.address || [l1, l2, city, st, zip].filter(Boolean).join(", ") || null;
    const phone = profile?.phone || "";
    const order = await insertOne("orders", {
      id, order_number: null, user_id: user.id, customer_id: user.id, customer_uuid: user.id, profile_id: profile?.id || user.id,
      customer_name: name, customer_email: email, customer_phone: phone, shipping_address: addr, shipping_name: name, shipping_email: email, shipping_phone: phone,
      shipping_address_line1: l1, shipping_address_line2: l2, shipping_city: city, shipping_state: st, shipping_zip: zip,
      status: "pending", order_status: "pending", payment_status: "pending", payment_method: paymentLabel,
      payment_instructions_snapshot: null, payment_qr_image: null,
      customer_notes: [`Delivery method: ${delivery === "pickup" ? "Local Pickup" : "Shipping"}`, remindLines.length ? `Reorder reminder: ${remindLines.join("; ")}` : "", payDisc ? `Payment discount: ${payMethod.label} ${payMethod.pct}% (−$${payDisc.toFixed(2)})` : "", short.length ? `Backorder: ${short.join("; ")}` : "", notes].filter(Boolean).join("\n"),
      subtotal: sub, discount: disc, subtotal_before_discount: sub, discount_amount: disc, discount_code_amount: codeDisc, discount_percent: payDisc ? payMethod.pct : undefined, store_credit_applied: 0,
      shipping: ship, tax: 0, tax_rate: 0, tax_region: "", tax_jurisdiction: "", total, source: "website_inquiry", created_at: now, updated_at: now
    });
    const items = priced.map(i => ({
      order_id: order.id, user_id: user.id, customer_id: user.id, product_id: i.p.id, product_key: i.p.product_key, product_name: i.p.display_name,
      product_strength: i.p.strength || "", product_category: i.p.category || "", quantity: i.q, unit_price: i.u, line_total: i.t,
      reorder_reminder_days: rdays(i) || null, reorder_reminder_auto: !!rd(i.p.product_key)?.a, created_at: now, updated_at: now
    }));
    await insertMany("order_items", items);
    for (const c of rewardChoices) {
      const { error } = await client().rpc("pst_choose_order_reward", { p_order_id: order.id, p_promotion_id: c.promotionId, p_product_key: c.productKey });
      if (error) throw new Error(`Your order was placed, but the free vial choice didn't save. Don't reorder. Contact us with order ${order.order_number || order.id}.`);
    }
    let credit = 0;
    if (applyCredit) { const r = await client().rpc("pst_redeem_store_credit", { p_order_id: order.id }); if (r.error) throw r.error; credit = Number(r.data || 0); }
    const due = Math.max(0, round(total - credit));
    const ctx = { customerName: name, customerEmail: email, customerNumber: profile?.customer_number ? `PST-C${profile.customer_number}` : "", items, subtotal: sub, discount: disc, shipping: ship, total: due, paymentMethod: paymentLabel, deliveryMethod: delivery === "pickup" ? "Local Pickup" : "Shipping" };
    let emailed = false;
    try { await postEmail(emailPayload({ ...order, store_credit_applied: credit }, ctx)); emailed = true; } catch {}
    // admin email: his current checkout sends only the customer email; send-order-email handles the rest, so nothing extra here
    writeCart([]);
    track("order_placed", { value: due });
    const last = { id: order.id, no: order.order_number || order.id, due, method: paymentLabel, delivery, at: now, deadline: order.payment_deadline_at || new Date(Date.now() + 864e5).toISOString(), backorder: short, items: items.map(i => ({ n: i.product_name, s: i.product_strength, q: i.quantity })) };
    try { sessionStorage.setItem("pst_last_order", JSON.stringify(last)); } catch {}
    return { ...last, emailed, email };
  }
  const venmoLink = (amount, note) => `https://venmo.com/${CFG.venmo}?txn=pay&amount=${Number(amount).toFixed(2)}&note=${encodeURIComponent(note)}`;
  async function submitAvailability(p, f) {
    const { data, error } = await client().rpc("pst_submit_availability_request", { p_product_key: p.product_key, p_quantity: Number(f.quantity), p_name: f.name, p_email: f.email, p_notify: !!f.notify });
    if (error) throw error;
    // "You're on the list" email: the confirmation function needs a signed-in session. Guests' requests show in the owner app
    // under Requests with a Send button instead. Never blocks the request itself.
    try { const id = typeof data === "string" ? data : data?.id || (Array.isArray(data) ? data[0]?.id : null);
      const { data: s } = await client().auth.getSession();
      if (id && s?.session?.access_token) fetch(`${CFG.url}/functions/v1/pst-availability-confirmation`, { method: "POST", headers: { Authorization: "Bearer " + s.session.access_token, apikey: CFG.key, "Content-Type": "application/json" }, body: JSON.stringify({ request_id: id }) }).catch(() => {});
    } catch {}
  }

  /* ---------- layout chrome ---------- */
  const IC = {
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    shop: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    back: '<path d="m15 18-6-6 6-6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-6-10V3"/>', snow: '<path d="M12 2v20M4 6l16 12M20 6 4 18"/>',
    heart: '<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z"/>', share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    chat: '<path d="M21 12a8 8 0 0 1-12 7l-5 1 1.5-4A8 8 0 1 1 21 12z"/>', check: '<path d="M20 6 9 17l-5-5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    pin: '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>', tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>', truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.2a5.5 5.5 0 0 1 5.5 5.8"/>',
    chart: '<path d="M4 4v16h16"/><path d="m7 15 4-4 3 3 5-6"/>', doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', next: '<path d="m9 18 6-6-6-6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'
  };
  const icon = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ""}</svg>`;
  const EMB = "img/pst-emblem-96.webp", EMB2 = "img/pst-emblem-192.webp";
  function header(page) {
    const a = (h, t, k) => `<a href="${h}"${page === k ? ' aria-current="page"' : ""}>${t}</a>`;
    return `<a class="skip" href="#main">Skip to content</a>
<div class="annc" data-annc hidden></div>
<header class="hd"><div class="wrap hrow">
  <button class="mobi" type="button" data-act="drawer" aria-label="Menu" aria-controls="drawer">${icon("menu")}</button>
  <nav class="nav l" aria-label="Shop">
    <div class="mm"><button type="button" class="mmb" data-act="mega" aria-expanded="false" aria-controls="mega">Shop <span aria-hidden="true">▾</span></button></div>
    ${a("catalog.html?category=Multi-Peptide%20Product", "Blends", "blends")}${a("testing.html", "Lab reports", "testing")}${a("rewards.html", "Rewards", "rewards")}</nav>
  <a href="index.html" class="brand" aria-label="Pep Shop Texas home"><img src="${EMB}" alt="" width="40" height="40"><span>PEP SHOP <em>TEXAS</em></span></a>
  <nav class="nav r" aria-label="Account">
    <button type="button" class="hbtn" data-act="search" aria-label="Search">${icon("search", 18)} <span>Search</span></button>
    <a href="account.html" data-acct${page === "account" ? ' aria-current="page"' : ""}>Sign in</a>
    <button type="button" class="hbtn bell" data-bell data-act="inbox" aria-label="Notifications" hidden>${icon("bell", 18)}<i hidden>0</i></button>
    <a href="saved.html" class="hbtn" aria-label="Saved items">${icon("heart", 18)}<i data-saved-count hidden>0</i></a>
    <button type="button" class="bagl" data-act="minibag" aria-label="Bag">Bag <i data-cart-count hidden>0</i></button></nav>
  <div class="mobr"><button class="mobi bell" type="button" data-bell data-act="inbox" aria-label="Notifications" hidden>${icon("bell")}<i hidden>0</i></button><button class="mobi" type="button" data-act="search" aria-label="Search">${icon("search")}</button></div>
</div>
<div class="mega" id="mega" hidden><div class="wrap mgrid">
  <div><b>Shop by type</b><a href="catalog.html">All products</a><a href="catalog.html?category=Peptide">Peptides</a><a href="catalog.html?category=Multi-Peptide%20Product">Research blends</a><a href="catalog.html?category=Supply">Supplies</a></div>
  <div><b>Research focus</b><a href="catalog.html?focus=performance">Performance</a><a href="catalog.html?focus=recovery">Recovery</a><a href="catalog.html?focus=longevity">Longevity</a></div>
  <div><b>Quick links</b><a href="catalog.html?stock=1">Available now</a><a href="catalog.html?sort=new">New arrivals</a><a href="catalog.html?sort=best">Best sellers</a><a href="testing.html">Lab reports</a><a href="bulk-request.html">Bulk requests</a></div>
  <div class="mfeat" data-mfeat></div>
</div></div></header>
<div class="drawerwrap" id="drawer" hidden><aside class="drawer" role="dialog" aria-modal="true" aria-label="Menu">
  <div class="dh"><a href="index.html" class="brand"><img src="${EMB}" alt="" width="34" height="34"><span>PEP SHOP <em>TEXAS</em></span></a><button type="button" class="sx" data-act="drawer-close" aria-label="Close">${icon("x")}</button></div>
  <button type="button" class="dsearch" data-act="search">${icon("search", 18)} Search peptides, blends, strengths</button>
  <nav aria-label="Menu">
  <details open><summary>Shop</summary><a href="catalog.html">All products</a><a href="catalog.html?stock=1">Available now</a><a href="catalog.html?sort=new">New arrivals</a><a href="catalog.html?sort=best">Best sellers</a><a href="catalog.html?category=Peptide">Peptides</a><a href="catalog.html?category=Multi-Peptide%20Product">Research blends</a><a href="catalog.html?category=Supply">Supplies</a></details>
  <details><summary>Research focus</summary><a href="catalog.html?focus=performance">Performance</a><a href="catalog.html?focus=recovery">Recovery</a><a href="catalog.html?focus=longevity">Longevity</a></details>
  <details><summary>My account</summary><a href="index.html">My products</a><a href="account.html#orders">Orders &amp; tracking</a><a href="saved.html">Saved items</a><a href="account.html#rewards">Rewards &amp; credit</a><a href="account.html#alerts">Notifications</a></details>
  <details><summary>Help</summary><a href="testing.html">Lab reports</a><a href="shipping.html">Shipping &amp; returns</a><a href="faq.html">FAQ</a><a href="contact.html">Contact</a><a href="about.html">About us</a><a href="bulk-request.html">Bulk requests</a></details>
  </nav>
  <a class="btn ghost wide" href="install.html" data-installlink>${icon("plus", 16)} Get the app</a>
  <p class="ruof" style="margin-top:16px">Research use only · Not for human or veterinary use</p>
</aside></div>`;
  }
  function tabbar(page) {
    const t = (h, k, ic, label) => `<a href="${h}" class="${page === k ? "on" : ""}"${page === k ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span>${k === "cart" ? '<i data-cart-count hidden>0</i>' : ""}${k === "account" ? '<i class="tabbell" data-tabbell hidden>0</i>' : ""}</a>`;
    return `<nav class="tabbar" aria-label="App">${t("index.html", "home", "home", "Home")}${t("catalog.html", "catalog", "shop", "Shop")}${t("cart.html", "cart", "bag", "Bag")}${t("account.html", "account", "user", "Account")}</nav>`;
  }
  function footer() {
    const pay = ["Venmo", "Zelle", "Apple Cash", "PayPal", "Cash", "Bitcoin"];
    return `<footer class="ft"><div class="wrap">
  <section class="news" aria-label="Restock alerts"><div><b class="serif">Restocks &amp; members-only deals</b><span>First word when something's back, plus the occasional code. No spam.</span></div>
  <form class="nform" action="register.html"><label class="sr" for="nem">Email</label><input id="nem" type="email" name="email" placeholder="Your email" autocomplete="email" required><input type="hidden" name="news" value="1"><button class="btn primary sm">Sign me up</button></form></section>
  <div class="fmark"><img src="${EMB2}" alt="" width="64" height="64" loading="lazy"><div class="wm">PEP SHOP<small>TEXAS</small></div><p class="tagl">Premium Purity <span>|</span> Proven Quality <span>|</span> Responsibly Sourced</p></div>
  <div class="fcols f4">
    <nav aria-label="Shop"><b>Shop</b><a href="catalog.html">All products</a><a href="catalog.html?stock=1">Available now</a><a href="catalog.html?sort=new">New arrivals</a><a href="catalog.html?category=Multi-Peptide%20Product">Research blends</a><a href="bulk-request.html">Bulk requests</a></nav>
    <nav aria-label="Help"><b>Help</b><a href="shipping.html">Shipping &amp; returns</a><a href="faq.html">FAQ</a><a href="testing.html">Lab reports</a><a href="contact.html">Contact</a><a href="mailto:${CFG.support}">${CFG.support}</a></nav>
    <nav aria-label="Account"><b>Account</b><a href="account.html">My account</a><a href="account.html#orders">Track an order</a><a href="saved.html">Saved items</a><a href="rewards.html">Researcher rewards</a><a href="install.html">Get the app</a><a href="account.html#alerts">Notifications</a></nav>
    <nav aria-label="Company"><b>Company</b><a href="about.html">About us</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></nav>
  </div>
  <div class="pays" aria-label="Ways to pay">${pay.map(x => `<span>${x}</span>`).join("")}</div>
  <p class="ruof">Research use only <span>·</span> Not for human or veterinary use <span>·</span> Not evaluated by the FDA <span>·</span> ${CFG.minAge}+</p>
  <p class="copy">© ${new Date().getFullYear()} Pep Shop Texas · Texas owned</p></div></footer>`;
  }
  async function mountChrome() {
    const page = document.body.dataset.page || "";
    if (document.body.dataset.chrome === "none") return;
    document.body.insertAdjacentHTML("afterbegin", header(page));
    try { if (localStorage.getItem("pst-is-owner") === "1") mountFlip("shop"); } catch {}
    document.body.insertAdjacentHTML("beforeend", footer() + tabbar(page));
    refreshCount(); refreshSaved();
    getUser().then(async u => {
      const a = $("[data-acct]"); if (!a) return;
      if (!u) { try { localStorage.removeItem("pst-is-owner"); } catch {} document.querySelector(".flipfloat")?.remove(); }
      if (u) { isAdmin(u).then(ok => { try { ok ? localStorage.setItem("pst-is-owner", "1") : localStorage.removeItem("pst-is-owner"); } catch {} if (!ok) document.querySelector(".flipfloat")?.remove(); }, () => {}); const p = await getProfile(u); a.textContent = `Hi, ${firstName(p, u)}`; refreshBell(); appAlertsNudge();
        if (await isAdmin(u)) { // same as his old header: staff see an Admin link (plus the order inbox)
          a.insertAdjacentHTML("beforebegin", `<details class="ownmenu" data-adminlink><summary>Owner</summary><div><a href="owner.html">Owner app</a><a href="admin.html">Admin dashboard</a></div></details>`);
          // owner-only bar with the Shop | Owner switch (phones too), and remember this page so the owner app's "Shop" comes back here
          try { sessionStorage.setItem("pst-last-shop", (location.pathname.split("/").pop() || "index.html") + location.search); } catch {}
          mountFlip("shop");
          document.addEventListener("click", e => { const d = document.querySelector(".ownmenu[open]"); if (d && !d.contains(e.target)) d.open = false; });
          $("#drawer nav")?.insertAdjacentHTML("afterbegin", `<details open><summary>Store owner</summary><a href="owner.html">Owner app (phone)</a><a href="admin.html">Admin dashboard</a></details>`);
        } }
      else a.href = `login.html?redirect=${encodeURIComponent((location.pathname.split("/").pop() || "index.html") + location.search)}`;
      const promo = await activePromotion(u).catch(() => null), el = $("[data-annc]");
      if (el) { el.innerHTML = promo ? `<span>${promo.badge ? `<b>${esc(promo.badge)}</b> ` : ""}${esc(promo.title)}</span>${promo.button_link ? `<a href="${esc(promo.button_link)}">${esc(promo.button_text || "Learn more")} →</a>` : ""}` : `<span>Free local pickup <i>✦</i> Lab-tested<span class="lg"> on every published batch</span> <i>✦</i> Texas owned</span>`; el.hidden = false; }
    });
  }

  /* ---------- Shop | Owner switch (store owner only) ---------- */
  function flipper(on) {
    let back = "index.html"; try { back = sessionStorage.getItem("pst-last-shop") || back; } catch {}
    return `<nav class="flip" aria-label="Switch between the shop and the owner app"><a href="${esc(back)}"${on === "shop" ? ' aria-current="page" class="on"' : ""}>Shop</a><a href="owner.html"${on === "owner" ? ' aria-current="page" class="on"' : ""}>Owner</a></nav>`;
  }
  /* Floating, movable switch: drag the grip to put it anywhere; each device remembers its own spot (screens differ) */
  const FLIPKEY = "pst-flip-pos";
  function mountFlip(on) {
    if (document.querySelector(".flipfloat")) return;
    const el = document.createElement("div"); el.className = "flipfloat"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Store owner: switch between the shop and the owner app");
    el.innerHTML = `<button type="button" class="flipgrip" aria-label="Move this switch. Drag it, or use the arrow keys" title="Drag to move"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg></button>${flipper(on)}`;
    document.body.appendChild(el);
    let probe = null; // measures the iPhone camera / home-bar areas so the switch can never sit under them
    const safe = () => { if (!probe) { probe = document.createElement("div"); probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)"; document.body.appendChild(probe); }
      const cs = getComputedStyle(probe); return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; };
    const clamp = (x, y) => { const m = 8, sa = safe(), w = el.offsetWidth, h = el.offsetHeight; return [Math.min(Math.max(m, x), innerWidth - w - m), Math.min(Math.max(m + sa.t, y), innerHeight - h - m - sa.b)]; };
    const put = (x, y) => { [x, y] = clamp(x, y); el.style.left = x + "px"; el.style.top = y + "px"; el.style.right = "auto"; el.style.bottom = "auto"; return [x, y]; };
    const load = () => { try { const v = JSON.parse(localStorage.getItem(FLIPKEY) || "null"); if (v && isFinite(v.x) && isFinite(v.y)) { put(v.x * innerWidth, v.y * innerHeight); return true; } } catch {} return false; };
    const save = () => { const r = el.getBoundingClientRect(); try { localStorage.setItem(FLIPKEY, JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch {} };
    requestAnimationFrame(() => { if (!load()) { /* default: low on the right, clear of the iPhone camera and the tab bar */ const r = el.getBoundingClientRect(); put(r.left, r.top); } el.classList.add("ready"); });
    addEventListener("resize", () => { const r = el.getBoundingClientRect(); put(r.left, r.top); });
    const g = el.querySelector(".flipgrip"); let d = null;
    g.addEventListener("pointerdown", e => { if (e.button > 0) return; e.preventDefault(); const r = el.getBoundingClientRect(); d = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top }; g.setPointerCapture(e.pointerId); el.classList.add("dragging"); });
    g.addEventListener("pointermove", e => { if (!d || e.pointerId !== d.id) return; e.preventDefault(); put(e.clientX - d.dx, e.clientY - d.dy); });
    const end = e => { if (!d || (e && e.pointerId !== d.id)) return; d = null; el.classList.remove("dragging"); save(); };
    g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
    g.addEventListener("keydown", e => { const k = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key]; if (!k) return; e.preventDefault(); const r = el.getBoundingClientRect(); put(r.left + k[0], r.top + k[1]); save(); });
    g.addEventListener("dblclick", () => { try { localStorage.removeItem(FLIPKEY); } catch {} el.removeAttribute("style"); requestAnimationFrame(() => { const r = el.getBoundingClientRect(); put(r.left, r.top); }); });
  }
  /* ---------- UI helpers ---------- */
  function toast(msg, link) {
    let el = $("#toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    el.innerHTML = `${esc(msg)}${link ? ` <a href="${link[0]}">${esc(link[1])}</a>` : ""}`; el.className = "show"; clearTimeout(toast.t); toast.t = setTimeout(() => el.className = "", 2800);
  }
  // v5.2: real scroll lock for sheets on iPhone (overflow:hidden alone lets the page underneath scroll and shift fixed bars)
  let lockY = 0;
  function lockScroll(on) {
    const b = document.body, locked = b.classList.contains("noscroll");
    if (on && !locked) { lockY = window.scrollY; b.style.top = `-${lockY}px`; b.classList.add("noscroll"); }
    else if (!on && locked) { b.classList.remove("noscroll"); b.style.top = ""; window.scrollTo(0, lockY); }
  }
  // after the keyboard closes, iPhone can leave fixed bars and sheets offset until the next scroll: nudge it back
  if (window.visualViewport) { let vt; const settle = () => { clearTimeout(vt); vt = setTimeout(() => { if (!/input|textarea|select/i.test(document.activeElement?.tagName || "")) window.scrollTo(window.scrollX, window.scrollY); }, 150); };
    visualViewport.addEventListener("resize", settle); document.addEventListener("focusout", settle); }
  function sheet(html, opts = {}) {
    closeSheet();
    const w = document.createElement("div"); w.id = "sheet"; w.className = "sheetwrap";
    w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"${opts.label ? ` aria-label="${esc(opts.label)}"` : ""}><button class="sx" type="button" data-act="close-sheet" aria-label="Close">${icon("x")}</button>${html}</div>`;
    document.body.appendChild(w); lockScroll(true);
    requestAnimationFrame(() => w.classList.add("in"));
    w.addEventListener("click", e => { if (e.target === w) closeSheet(); });
    const f = w.querySelector("input,select,textarea,button:not(.sx)"); if (matchMedia("(hover: hover) and (pointer: fine)").matches) setTimeout(() => f?.focus(), 60); // no auto-keyboard on phones
    return w;
  }
  function closeSheet() { const w = $("#sheet"); if (w) { w.remove(); lockScroll(false); } }
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); openDrawer(false); openMega(false); } if (e.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName || "")) { e.preventDefault(); openSearch(); } });
  document.addEventListener("click", e => {
    if (!e.target.closest(".mega,.mm")) openMega(false);
    if (e.target.id === "drawer") openDrawer(false);
    const sv = e.target.closest("[data-save]"); if (sv) { e.preventDefault(); products().then(all => { const p = all.find(x => x.product_key === sv.dataset.save); if (!p) return; const on = toggleSaved(p); document.querySelectorAll(`[data-save="${sv.dataset.save}"]`).forEach(b => b.setAttribute("aria-pressed", on)); }); }
  });

  /* 21+ / research-use gate (once per device) */
  function gate() {
    if (store.get(CFG.gateKey, 0) || document.body.dataset.gate === "off") return;
    const w = document.createElement("div"); w.id = "gate";
    w.innerHTML = `<div class="gbox" role="dialog" aria-modal="true" aria-labelledby="gt"><img src="${EMB2}" alt="" width="96" height="96"><div class="wm" id="gt">PEP SHOP<small>TEXAS</small></div>
<p>Research compounds for adults ${CFG.minAge} and over. For research use only, not for human or veterinary use.</p>
<button class="btn primary wide" type="button" data-act="gate-yes">I'm ${CFG.minAge}+ and agree</button><button class="btn ghost wide" type="button" data-act="gate-no">Leave</button></div>`;
    document.body.appendChild(w); lockScroll(true);
  }

  /* availability request sheet (same RPC as catalog-display.js) */
  async function openAvailability(p) {
    const u = await getUser(), pr = u ? await getProfile(u) : null;
    const w = sheet(`<h2 class="serif">Request availability</h2><p class="muted">${esc(p.display_name)} · ${esc(p.strength || "")}. This is a request only. No order is placed and nothing is charged.</p>
<form class="form" data-form="avail"><label>Name<input name="name" required autocomplete="name" value="${esc(pr ? customerName(pr, u) : "")}"></label>
<label>Email<input name="email" type="email" required autocomplete="email" value="${esc(pr?.email || u?.email || "")}"></label>
<label>How many vials<input name="quantity" type="number" min="1" max="999" value="1" inputmode="numeric" required></label>
<label class="chk"><input type="checkbox" name="notify" checked> Email me when it's back in stock</label>
<button class="btn primary wide">Send request</button><p class="status" role="status"></p></form>`, { label: "Request availability" });
    w.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.notify = !!e.target.notify.checked;
      const b = e.target.querySelector("button"), s = e.target.querySelector(".status"); b.disabled = true; s.textContent = "Sending…";
      try { await submitAvailability(p, f); e.target.innerHTML = `<div class="okmsg">${icon("check", 28)}<h3>Request received</h3><p class="muted">We'll reach out at ${esc(f.email)}${f.notify ? " and let you know when it's back" : ""}.</p><button class="btn ghost wide" type="button" data-act="close-sheet">Done</button></div>`; }
      catch (err) { s.textContent = err.message || "That didn't send. Try again."; b.disabled = false; }
    });
  }

  /* ---------- PWA: service worker, install, push ---------- */
  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; });
  // v42: the site and the installed app update themselves. Every time the app opens or comes back to the front, it checks
  // for a new version; when one is ready the page reloads once (never while someone is typing in a form).
  // v5.7: a preview copy of an update (hosted on vercel.app) runs on the real shop data so Jimmie can check a fix before it goes live
  const PREVIEW = /\.vercel\.app$|(^|\.)githack\.com$/i.test(location.hostname);
  function previewBanner() { const b = document.createElement("div"); b.className = "pvbar"; b.innerHTML = `PREVIEW of the next update · this is the real shop, so changes you make are real`; document.body.prepend(b); document.body.classList.add("preview"); }
  function registerSW() {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
    if (PREVIEW) { navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(() => {}); previewBanner(); return; } // previews never install or cache
    const sw = navigator.serviceWorker, hadController = !!sw.controller;
    let pending = false, last = 0;
    const busy = () => /input|textarea|select/i.test(document.activeElement?.tagName || "") || !!document.querySelector("#sheet form");
    // v5.21: never reload in front of him. A new version takes over quietly: it is used from the next page he opens,
    // or applied while the app is in the background. Nothing flashes on screen.
    const reload = () => { try { sessionStorage.setItem("pst_updated", "1"); } catch {} if (document.hidden && !window.__holdReload) location.reload(); else pending = true; };
    // v5.3: if they're mid-form when an update lands, offer it instead of waiting silently
    const updateBar = () => { if ($("#updbar")) return; const b = document.createElement("div"); b.id = "updbar"; b.setAttribute("role", "status");
      b.innerHTML = `<span>${icon("check", 16)} A new version is ready</span><button type="button" class="btn primary sm" data-upd>Update</button><button type="button" class="sx" data-updx aria-label="Later">${icon("x", 14)}</button>`;
      b.addEventListener("click", e => { if (e.target.closest("[data-upd]")) { pending = false; try { sessionStorage.setItem("pst_updated", "1"); } catch {} location.reload(); } if (e.target.closest("[data-updx]")) b.remove(); });
      document.body.appendChild(b); };
    sw.addEventListener("controllerchange", () => { if (hadController) reload(); });
    sw.register("sw.js", { updateViaCache: "none" }).then(reg => {
      const check = () => { if (Date.now() - last > 60000) { last = Date.now(); reg.update().catch(() => {}); } };
      document.addEventListener("visibilitychange", () => { if (document.hidden) { if (pending && !window.__holdReload) { pending = false; location.reload(); } return; } check(); });
      window.addEventListener("focus", check); setInterval(() => { if (!document.hidden) check(); }, 5 * 60000); // v5.7: an open app picks up updates within ~5 min
    }).catch(() => {});
    try { if (sessionStorage.getItem("pst_updated")) { sessionStorage.removeItem("pst_updated"); window.PST_JUST_UPDATED = true; if (!document.body.classList.contains("oapp") && !/owner\.html/.test(location.pathname)) setTimeout(() => toast("Pep Shop Texas just updated to the latest version"), 600); } } catch {}
  }
  const canPrompt = () => !!deferredInstall;
  async function promptInstall() {
    if (!deferredInstall) return false;
    deferredInstall.prompt(); const c = await deferredInstall.userChoice.catch(() => ({})); deferredInstall = null;
    return c && c.outcome === "accepted";
  }
  window.addEventListener("appinstalled", () => { store.set("pst_app_installed", Date.now()); $("[data-appbar]")?.remove(); document.dispatchEvent(new Event("pst-installed")); });
  async function install() {
    if (isStandalone()) { toast("You're already using the app"); return; }
    if (deferredInstall) { await promptInstall(); return; }
    if (!/install\.html$/.test(location.pathname)) { location.href = "install.html"; return; }
    sheet(isIOS() ? `<h2 class="serif">Add Pep Shop Texas to your Home Screen</h2>
<ol class="howto"><li><span>1</span>Tap the <b>Share</b> button ${icon("share", 18)} at the bottom of Safari.</li><li><span>2</span>Scroll down and tap <b>Add to Home Screen</b>.</li><li><span>3</span>Tap <b>Add</b>. Open it from your Home Screen, then turn on order alerts in Account.</li></ol>
<p class="muted small">Using Chrome on iPhone? Open pepshoptexas.com in Safari first.</p>`
      : `<h2 class="serif">Get the app</h2><ol class="howto"><li><span>1</span>Open your browser menu <b>⋮</b>.</li><li><span>2</span>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li><span>3</span>Open it from your Home Screen and turn on order alerts in Account.</li></ol>`, { label: "Install" });
  }
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64u = s => { const p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };
  async function pushState() {
    if (!pushSupported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
    if (Notification.permission === "denied") return "blocked";
    const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  }
  async function enablePush(role = "customer") {
    if (PREVIEW) throw new Error("Alerts stay off in a preview. Use the regular app.");
    if (!pushSupported()) { if (isIOS() && !isStandalone()) { install(); return false; } throw new Error("This browser can't show notifications."); }
    const u = await getUser(true); if (!u) { location.href = "login.html?redirect=" + encodeURIComponent(location.pathname.split("/").pop() + location.search); return false; }
    const perm = await Notification.requestPermission(); if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in Settings for this app.");
    const r = await fetch(`${CFG.url}/functions/v1/${CFG.pushFn}`, { headers: { apikey: CFG.key } }).catch(() => null);
    const j = r && r.ok ? await r.json() : null; if (!j?.publicKey) throw new Error("Order alerts aren't switched on for the store yet.");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(j.publicKey) });
    const { data } = await client().auth.getSession();
    const res = await fetch(`${CFG.url}/functions/v1/${CFG.pushFn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: `Bearer ${data?.session?.access_token}` }, body: JSON.stringify({ subscribe: sub.toJSON(), role, ua: navigator.userAgent.slice(0, 160) }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save alerts on the server.");
    return true;
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (!sub) return;
    const { data } = await client().auth.getSession();
    await fetch(`${CFG.url}/functions/v1/${CFG.pushFn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: `Bearer ${data?.session?.access_token}` }, body: JSON.stringify({ unsubscribe: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }

  /* ---------- v3.7: notification center (bell), per-category settings, test alert ---------- */
  const PREFS = {
    customer: [["orders", "Order updates", "Payment confirmed, packed, ready for pickup, shipped, delivered."], ["reminders", "Reorder reminders", "A heads-up a couple of days before you'd run low."]],
    owner: [["new_orders", "New order", "Customer, items, total, payment method and pickup or ship, the moment it's placed."], ["payments", "Customer says they paid", "When a customer taps \u201cI've sent payment\u201d on their order."], ["payments_in", "Venmo payment received", "Venmo says someone paid you, matched to the order by number and amount."], ["cancellations", "Order cancelled", "Including the 24-hour auto-cancel when an order isn't paid."], ["signups", "New account", "Someone signs up, with their email and city."], ["requests", "Requests", "Availability requests (with the running total) and bulk requests."], ["sold_out", "Sold out", "The moment an item hits 0."], ["low_stock", "Low stock", "One note a day when items are running low or out."]]
  };
  async function getPrefs(role = "customer") {
    const u = await getUser(); if (!u) return null;
    const { data } = await client().from("pst_notify_prefs").select("*").eq("user_id", u.id).eq("role", role).maybeSingle();
    const out = {}; PREFS[role].forEach(([k]) => out[k] = data ? data[k] !== false : true); return out;
  }
  async function setPref(role, key, on) {
    const u = await getUser(); if (!u) throw new Error("Sign in first.");
    const cur = await getPrefs(role) || {}; cur[key] = !!on;
    const { error } = await client().from("pst_notify_prefs").upsert({ user_id: u.id, role, ...cur, updated_at: new Date().toISOString() }, { onConflict: "user_id,role" });
    if (error) throw new Error(/relation|does not exist/i.test(error.message) ? "Alert settings aren't switched on for the store yet." : error.message);
  }
  async function testPush(role = "customer") {
    const { data } = await client().auth.getSession(); const t = data?.session?.access_token; if (!t) throw new Error("Sign in first.");
    const r = await fetch(`${CFG.url}/functions/v1/${CFG.pushFn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: `Bearer ${t}` }, body: JSON.stringify({ test: true, role }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {}; if (!r || !r.ok) throw new Error(j.error || "Couldn't send a test right now.");
    refreshBell(); return j;
  }
  const INBOX_IC = { new_order: "bag", paid_notice: "check", low_stock: "box", reminder: "clock", test: "bell", order_paid: "check", order_packed: "box", order_ready: "pin", order_shipped: "truck", order_delivered: "check", order_cancelled: "x" };
  const agoShort = t => { const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 10080 ? `${Math.round(m / 1440)}d` : fmtDate(t); };
  async function inboxRows(limit = 40) {
    const u = await getUser(); if (!u) return [];
    const { data, error } = await client().from("pst_inbox").select("id,role,kind,title,body,url,created_at,read_at").order("created_at", { ascending: false }).limit(limit);
    return error ? [] : data || [];
  }
  async function refreshBell() {
    const rows = await inboxRows(40).catch(() => []), n = rows.filter(r => !r.read_at).length;
    $$("[data-tabbell]").forEach(t => { t.textContent = n > 9 ? "9+" : n; t.hidden = !n; const a = t.closest("a"); if (a) { a.href = n ? "account.html#alerts" : "account.html"; a.setAttribute("aria-label", n ? `Account, ${n} new notification${n === 1 ? "" : "s"}` : "Account"); } }); // phones: the alert count rides on the Account tab
    $$("[data-bell]").forEach(b => { b.hidden = false; const i = b.querySelector("i"); if (i) { i.textContent = n > 9 ? "9+" : n; i.hidden = !n; } b.setAttribute("aria-label", n ? `Notifications, ${n} new` : "Notifications"); });
    return rows;
  }
  async function markAllRead(rows) {
    const ids = rows.filter(r => !r.read_at).map(r => r.id); if (!ids.length) return;
    await client().from("pst_inbox").update({ read_at: new Date().toISOString() }).in("id", ids).then(() => {}, () => {});
    try { navigator.clearAppBadge?.(); } catch {}
  }
  async function openInbox() {
    const rows = await inboxRows(40), admin = document.body.dataset.page === "owner";
    const row = r => `<a class="nrow${r.read_at ? "" : " new"}" href="${esc(r.url || (r.role === "owner" ? "owner.html" : "account.html#orders"))}"><span class="nic">${icon(INBOX_IC[r.kind] || "bell", 18)}</span><span class="ntx"><b>${esc(r.title)}</b>${r.body ? `<small>${esc(r.body)}</small>` : ""}</span><time datetime="${esc(r.created_at)}">${agoShort(r.created_at)}</time></a>`;
    const w = sheet(`<div class="ninbox"><div class="nhead"><h2 class="serif">Notifications</h2><a class="linkish small" href="${admin ? "owner.html#alerts" : "account.html#alerts"}">Settings</a></div>
${rows.length ? `<div class="nlist">${rows.map(row).join("")}</div>` : `<div class="nempty">${icon("bell", 30)}<b>You're all caught up</b><span>Order updates and reminders will show up here.</span></div>`}
<button type="button" class="btn ghost wide" data-act="close-sheet" style="margin-top:14px">Close</button></div>`, { label: "Notifications" });
    w.classList.add("side");
    await markAllRead(rows); refreshBell();
  }
  // v5.4: iPhone doesn't show a banner for an alert while the app is open, so show it in the app too
  function inAppAlert(m) {
    if (document.hidden || !m.title) return; $("#pushnote")?.remove();
    const n = document.createElement("a"); n.id = "pushnote"; n.href = m.url || "#"; n.setAttribute("role", "status");
    n.innerHTML = `${icon("bell", 18)}<span><b>${esc(m.title)}</b>${m.body ? `<small>${esc(m.body)}</small>` : ""}</span><button type="button" class="sx" aria-label="Dismiss">${icon("x", 14)}</button>`;
    n.addEventListener("click", e => { if (e.target.closest(".sx")) { e.preventDefault(); n.remove(); } });
    document.body.appendChild(n); requestAnimationFrame(() => n.classList.add("in")); if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* no vibration */ }
    setTimeout(() => { if (n.isConnected) { n.classList.remove("in"); setTimeout(() => n.remove(), 300); } }, 7000);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener?.("message", e => { if (e.data && e.data.type === "pst-push") { refreshBell(); inAppAlert(e.data); } });

  /* one panel used by Account → Notifications and the owner app */
  async function notifyPanel(el, role = "customer") {
    const st = await pushState().catch(() => "unsupported"), prefs = await getPrefs(role).catch(() => null), ios = isIOS(), app = isStandalone();
    const dev = { on: ["On", "This device will get alerts."], off: ["Off", "Turn on to get alerts on this device."], blocked: ["Blocked", ios ? "Open iPhone Settings → Notifications → Pep Shop TX and allow notifications." : "Click the lock icon by the web address → Notifications → Allow, then reload."], unsupported: ["Not available", "This browser can't show alerts. Try Safari on iPhone (from the app), or Chrome / Edge / Safari on a computer."], "needs-install": ["Add the app first", "iPhone only shows alerts for apps on your Home Screen. It takes about 10 seconds."] }[st] || ["", ""];
    const devIcon = /android|iphone|ipad|mobile/i.test(navigator.userAgent) ? "Phone" : "Computer";
    el.innerHTML = `<div class="npanel">
<div class="ndev ndev-${st}"><span class="nic">${icon("bell", 22)}</span><div><small>This ${devIcon.toLowerCase()}</small><b>${dev[0]}</b><span>${dev[1]}</span></div>
${st === "on" ? `<div class="nbtns"><button class="btn ghost sm" type="button" data-np="test">Send a test</button><button class="btn ghost sm" type="button" data-np="off">Turn off</button></div>`
  : st === "off" ? `<button class="btn primary sm" type="button" data-np="on">Turn on</button>`
  : st === "needs-install" ? `<a class="btn primary sm" href="install.html">Show me how</a>` : ""}</div>
${prefs ? `<p class="kick" style="margin:22px 0 6px">What you'll hear about</p><div class="nprefs">${PREFS[role].map(([k, t, d]) => `<label class="nsw"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" role="switch" data-npref="${k}"${prefs[k] ? " checked" : ""}><i aria-hidden="true"></i></label>`).join("")}</div>` : ""}
<p class="muted small" style="margin-top:14px">${role === "owner" ? "Turn alerts on once on each device you use: your phone and your computer." : "Alerts also land in the bell at the top of the site, so nothing is missed even with alerts off. Order emails still come either way."}</p></div>`;
    if (el.dataset.npWired) return; el.dataset.npWired = 1;
    el.addEventListener("click", async e => {
      const b = e.target.closest("[data-np]"); if (!b) return; b.disabled = true;
      try {
        if (b.dataset.np === "on") { if (await enablePush(role)) toast("Alerts are on for this device"); }
        else if (b.dataset.np === "off") { await disablePush(); toast("Alerts are off for this device"); }
        else if (b.dataset.np === "test") { const j = await testPush(role); toast(j.sent ? "Test sent. It should pop up in a few seconds." : "Saved to your bell. This device didn't take the ping, so turn alerts off and on again."); }
      } catch (err) { toast(err.message || "Something went wrong"); }
      b.disabled = false; notifyPanel(el, role);
    });
    el.addEventListener("change", async e => {
      const c = e.target.closest("[data-npref]"); if (!c) return;
      try { await setPref(role, c.dataset.npref, c.checked); toast("Saved"); } catch (err) { c.checked = !c.checked; toast(err.message); }
    });
  }

  /* app bar: a slim "get the app" card for phone browsers (dismiss = 3 weeks) */
  function appBar() {
    if (isStandalone() || !/iphone|ipad|ipod|android/i.test(navigator.userAgent) || /install\.html$/.test(location.pathname)) return;
    if (!["home", "catalog", "product", "account"].includes(document.body.dataset.page || "")) return;
    if (Date.now() - store.get("pst_appbar_x", 0) < 21 * 864e5 || store.get("pst_app_installed", 0)) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="appbar" data-appbar role="region" aria-label="Get the app"><img src="icons/icon-192.png" alt="" width="40" height="40"><span><b>Pep Shop Texas app</b><small>Signed in, order alerts, reorder in two taps</small></span><a class="btn primary sm" href="install.html">Get it</a><button type="button" class="ax" data-act="appbar-x" aria-label="Not now">${icon("x", 16)}</button></div>`);
    document.body.classList.add("has-appbar");
  }

  /* app launch: open signed in, on the shop. Home Screen apps keep their own sign-in, so the first launch asks once. */
  async function appLaunch() {
    if (!isStandalone()) return false;
    const page = document.body.dataset.page || "", first = !sessionStorage.getItem("pst_launched");
    sessionStorage.setItem("pst_launched", "1");
    if (first && page === "home" && !params.get("source")) { location.replace("catalog.html?source=app"); return true; }
    if (params.get("source") === "app" && !["login", "register", "forgot", "reset"].includes(page) && !sessionStorage.getItem("pst_app_guest")) {
      const { data } = await client().auth.getSession().catch(() => ({ data: null })); // local check: works offline too
      if (!data?.session) { location.replace("login.html?app=1&redirect=" + encodeURIComponent((location.pathname.split("/").pop() || "catalog.html") + location.search.replace(/[?&]source=app/, "").replace(/^&/, "?"))); return true; }
    }
    return false;
  }
  /* first time the app is opened signed in: offer alerts once */
  async function appAlertsNudge() {
    if (!isStandalone() || store.get("pst_alerts_nudged", 0) || document.body.dataset.page === "owner") return;
    const u = await getUser(); if (!u) return;
    if (await pushState().catch(() => "unsupported") !== "off") return;
    store.set("pst_alerts_nudged", Date.now());
    const w = sheet(`<div class="nnudge">${icon("bell", 34)}<h2 class="serif">Know the moment it ships</h2><p class="muted">Get a ping when your payment is confirmed, when your order ships, and a heads-up before you run low.</p>
<button class="btn primary wide" type="button" data-nn="on">Turn on alerts</button><button class="btn ghost wide" type="button" data-act="close-sheet" style="margin-top:8px">Not now</button><p class="muted small" style="margin-top:12px">Change this anytime in Account → Notifications.</p></div>`, { label: "Turn on alerts" });
    w.querySelector("[data-nn]").addEventListener("click", async e => { e.target.disabled = true; try { if (await enablePush("customer")) { toast("Alerts are on"); closeSheet(); } } catch (err) { toast(err.message); e.target.disabled = false; } });
  }

  /* ---------- v3: saved items, recently viewed, menus, predictive search, mini bag ---------- */
  const gkey = p => String(p.display_name || p.product_key).trim().toLowerCase();
  const saved = () => store.get("pst_saved_v1", []);
  function isSaved(p) { return saved().includes(gkey(p)); }
  function toggleSaved(p) { const k = gkey(p), s = saved(), on = !s.includes(k); store.set("pst_saved_v1", on ? [k, ...s] : s.filter(x => x !== k)); refreshSaved(); toast(on ? `Saved ${p.display_name}` : `Removed ${p.display_name}`, on ? ["saved.html", "View saved"] : null); return on; }
  function refreshSaved() { const n = saved().length; $$("[data-saved-count]").forEach(el => { el.textContent = n; el.hidden = !n; }); }
  const heart = (p, cls = "") => `<button type="button" class="heartb ${cls}" data-save="${esc(p.product_key)}" aria-pressed="${isSaved(p)}" aria-label="${isSaved(p) ? "Remove from saved" : "Save"} ${esc(p.display_name)}">${icon("heart", 18)}</button>`;
  function recordRecent(p) { const k = gkey(p), r = store.get("pst_recent_v1", []).filter(x => x !== k); store.set("pst_recent_v1", [k, ...r].slice(0, 12)); }
  const recent = () => store.get("pst_recent_v1", []);
  const badges = (g) => { const p = g[0], now = Date.now(), out = [];
    if (g.some(x => x.created_at && now - new Date(x.created_at) < 45 * 864e5)) out.push("New");
    if (g.some(x => x.hot_peptide || x.featured)) out.push("Best seller");
    if (g.some(onSale)) out.push("Sale");
    return out; };

  function openDrawer(on) { const d = $("#drawer"); if (!d) return; d.hidden = !on; lockScroll(on); if (on) setTimeout(() => d.querySelector(".sx")?.focus(), 30); }
  async function openMega(on) {
    const m = $("#mega"), b = $("[data-act=mega]"); if (!m) return; m.hidden = !on; b?.setAttribute("aria-expanded", on);
    if (on && !m.dataset.filled) { m.dataset.filled = 1; try { const gs = groups(await products()).filter(gIn).sort((a, b) => (b.some(x => x.hot_peptide || x.featured) - a.some(x => x.hot_peptide || x.featured))); const g = gs[0]; if (g) { const p = gBest(g); $("[data-mfeat]").innerHTML = `<a href="${productUrl(p)}" class="mfcard">${vial(p, 60)}<span><small>Featured</small><b>${esc(titleParts(p).main)}</b><em>from ${money(gMin(g))}</em></span></a>`; } } catch {} }
  }
  /* search as you type */
  async function openSearch() {
    openDrawer(false); openMega(false);
    const all = await products().catch(() => []), gs = groups(all);
    const w = sheet(`<div class="srch"><label class="sr" for="sq">Search</label><div class="csearch">${icon("search", 20)}<input id="sq" type="search" placeholder="Search peptides, blends, strengths" autocomplete="off" enterkeyhint="search"></div><div class="sres" data-sres role="listbox" aria-label="Results"></div></div>`, { label: "Search" });
    w.classList.add("top");
    const inp = w.querySelector("#sq"), res = w.querySelector("[data-sres]");
    const popular = gs.filter(g => g.some(x => x.hot_peptide || x.featured) && gIn(g)).slice(0, 6);
    const row = g => { const p = gBest(g), st = gIn(g) ? stock(p) : g.some(x => x.coming_soon) ? { k: "soon", t: "Coming soon" } : { k: "out", t: "Out of stock" }; return `<a class="sr1" href="${productUrl(p)}" role="option">${vial(p, 30)}<span><b>${esc(titleParts(p).main)}</b><small>${esc(g.map(x => x.strength).filter(Boolean).join(" · "))}</small></span><span class="srr"><em>${g.length > 1 ? "from " : ""}${money(gMin(g))}</em><i class="stk stk-${st.k}">${gIn(g) ? st.t : st.k === "soon" ? "Soon" : "Out"}</i></span></a>`; };
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { res.innerHTML = `<p class="kick" style="margin-top:14px">Popular right now</p>${popular.map(row).join("")}`; return; }
      const hit = gs.map(g => { const p = g[0], name = String(p.display_name).toLowerCase(), hay = [p.display_name, p.category, ...g.map(x => x.strength), ...focuses(p)].join(" ").toLowerCase(); const score = name.startsWith(q) ? 3 : name.includes(q) ? 2 : hay.includes(q) ? 1 : 0; return { g, score }; }).filter(x => x.score).sort((a, b) => b.score - a.score || gIn(b.g) - gIn(a.g)).slice(0, 8);
      res.innerHTML = hit.length ? hit.map(x => row(x.g)).join("") + `<a class="srall" href="catalog.html?search=${encodeURIComponent(inp.value.trim())}">See all results for “${esc(inp.value.trim())}” →</a>` : `<p class="muted" style="padding:16px 0">No matches for “${esc(inp.value.trim())}”. Try a shorter name, like “BPC”.</p>`;
    };
    inp.addEventListener("input", draw); inp.addEventListener("keydown", e => { if (e.key === "Enter") { track("search", { term: inp.value.trim().slice(0, 80) }); } if (e.key === "Enter") location.href = `catalog.html?search=${encodeURIComponent(inp.value.trim())}`; });
    draw(); setTimeout(() => inp.focus(), 50);
  }
  /* mini bag: opens after anything is added */
  async function miniBag(addedKey) {
    if (document.body.dataset.page === "cart") return;
    const rows = (await cartRows()).filter(r => r.product), sub = rows.reduce((s, r) => s + unitPrice(r.product) * r.quantity, 0);
    const left = Math.max(0, CFG.freeShip - sub), pct = Math.min(100, sub / CFG.freeShip * 100);
    const w = sheet(`<div class="mbag"><h2 class="serif">${addedKey ? `${icon("check", 22)} Added to your bag` : "Your bag"}</h2>
${rows.length ? `<div class="mbl">${rows.map(r => `<div class="mbr${r.key === addedKey ? " new" : ""}">${vial(r.product, 30)}<span><b>${esc(titleParts(r.product).main)}</b><small>${esc(r.product.strength || "")}</small><span class="mbq"><button type="button" data-mbq="${esc(r.key)}" data-d="-1" aria-label="${r.quantity > 1 ? "One fewer" : "Remove"}">−</button><b>${r.quantity}</b><button type="button" data-mbq="${esc(r.key)}" data-d="1" aria-label="One more"${qty(r.product) > 0 && r.quantity >= qty(r.product) ? " disabled" : ""}>+</button><button type="button" class="mbrm" data-mbrm="${esc(r.key)}">Remove</button></span></span><em>${money(unitPrice(r.product) * r.quantity)}</em></div>`).join("")}</div>
<div class="ship"><div class="shipbar"><i style="width:${pct}%"></i></div><span>${left > 0 ? `${money(left)} away from free shipping` : "You've got free shipping"} <small class="muted">· local pickup is always free</small></span></div>
<div class="sum"><div class="r tot"><span>Subtotal</span><b>${money(sub)}</b></div></div>
<a class="btn primary wide" href="cart.html">Check out</a><button class="btn ghost wide" type="button" data-act="close-sheet" style="margin-top:8px">Keep shopping</button>`
      : `<p class="muted">Nothing in your bag yet.</p><a class="btn primary wide" href="catalog.html">Browse the collection</a>`}</div>`, { label: "Bag" });
    w.classList.add("side");
    // v39: change quantity or remove right from the bag sheet
    w.addEventListener("click", e => {
      const q = e.target.closest("[data-mbq]"), rm = e.target.closest("[data-mbrm]"); if (!q && !rm) return;
      const key = (q || rm).dataset.mbq || rm?.dataset.mbrm, r = rows.find(x => x.key === key); if (!r) return;
      const n = rm ? 0 : r.quantity + Number(q.dataset.d); setQty(key, n);
      if (n <= 0) toast("Removed from your bag"); miniBag(n > 0 ? addedKey : null);
    });
  }
  function addAndShow(key, n = 1) { addToCart(key, n); miniBag(key); }

  /* ---------- global events ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "close-sheet") closeSheet();
    else if (a === "gate-yes") { store.set(CFG.gateKey, 1); $("#gate")?.remove(); lockScroll(false); }
    else if (a === "gate-no") { const p = $("#gate p"); if (p) p.textContent = "No problem. This site is only for adults "+CFG.minAge+"+ purchasing for research."; }
    else if (a === "install") install();
    else if (a === "inbox") openInbox();
    else if (a === "appbar-x") { store.set("pst_appbar_x", Date.now()); $("[data-appbar]")?.remove(); document.body.classList.remove("has-appbar"); }
    else if (a === "drawer") openDrawer(true);
    else if (a === "drawer-close") openDrawer(false);
    else if (a === "mega") { e.stopPropagation(); openMega($("#mega")?.hidden); }
    else if (a === "search") { e.preventDefault(); openSearch(); }
    else if (a === "minibag") miniBag();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && $("[data-bell]:not([hidden])")) refreshBell(); });
  document.addEventListener("DOMContentLoaded", async () => { if (await appLaunch()) return; mountChrome(); appBar(); registerSW(); track("page_view"); if (VIAL_ON) vialAssetsP().catch(() => {}); }); // v3.2: no visit pop-up; 18+ is confirmed at sign-up (his rule)

  // v5.8: the exact words a customer agrees to when they turn on promo texts (saved with their opt-in)
  const SMS_CONSENT = "Text me deals and restocks from Pep Shop Texas at this number. Up to 4 texts a month. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent isn't required to buy.";
  const usPhone = v => { const d = String(v || "").replace(/\D/g, ""); return /^[2-9]\d{9}$/.test(d) ? d : /^1[2-9]\d{9}$/.test(d) ? d.slice(1) : ""; };
  const fmtPhone = v => { const d = usPhone(v); return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ""; };
  window.PST = { giftLines, flipper, mountFlip, activePromotions, SMS_CONSENT, usPhone, fmtPhone, PREVIEW, lockScroll, CFG, FOCUS, REMIND, $, $$, esc, money, round, params, store, fmtDate, isStandalone, isIOS, client, getUser, getProfile, isAdmin, customerName, firstName,
    products, groups, cycles, suggestDays, myHistory, myProducts, isDone, handedOff, stageOf, vialLiquid, paidNotice, gIn, gBest, gMin, unitPrice, onSale, qty, stock, focuses, isBlend, titleParts, productUrl, coaHref, vial, cmpProduct,
    readCart, writeCart, addToCart, setQty, count, refreshCount, cartRows, reminders, setReminder,
    photo: () => VIAL_ON, vialStudio, bakeBottle, vialSig, vialColorName, LABEL_COLORS, track, validateDiscount, discountAmount, payDiscount, payLabel, backordersOn, creditBalance, freeVials, choiceRewards, paymentMethods, payCard, submitOrder, venmoLink, openAvailability,
    icon, toast, sheet, closeSheet, saved, isSaved, toggleSaved, heart, recordRecent, recent, badges, gkey, miniBag, addAndShow, openSearch, install, canPrompt, promptInstall, pushSupported, pushState, enablePush, disablePush, getPrefs, setPref, testPush, openInbox, refreshBell, notifyPanel, PREFS, emailPayload, postEmail };
})();
