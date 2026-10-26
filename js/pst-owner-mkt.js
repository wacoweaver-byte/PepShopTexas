/* Pep Shop Texas · owner app v5.8: Insights rebuilt as a marketing dashboard (report #1).
   Reads the shop's own cookie-free visit log (pst_web_events, owner-only) and the sales numbers from pst_insights.
   Every number shows its change vs the period before. Charts carry their numbers. No database changes needed. */
(function () {
  "use strict";
  const P = window.PST, { esc, money } = P;
  const TZ = "America/Chicago";
  const dayKey = d => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in Texas time
  const hourOf = d => Number(new Date(d).toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24;
  const nf = n => Number(n || 0).toLocaleString("en-US");
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const p1 = n => `${(Math.round(n * 10) / 10).toLocaleString("en-US")}%`;
  const dur = s => { s = Math.round(s || 0); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
  const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|search\.aol|yandex)\./i;
  const SOCIAL = /(^|\.)(facebook|fb|instagram|t\.co|twitter|x\.com|tiktok|reddit|youtube|pinterest|linkedin|threads|snapchat|discord)\b/i;
  const SOCIAL_SRC = /^(facebook|fb|instagram|ig|twitter|x|tiktok|reddit|youtube|threads|social)$/i;
  function channel(s) {
    const src = String(s.utm_source || "").toLowerCase(), med = String(s.utm_medium || "").toLowerCase(), ref = String(s.ref_host || "").toLowerCase();
    if (/pepkeep/.test(src) || /pepkeep\.io$/.test(ref)) return "PepKeep";
    if (/^(cpc|ppc|paid|paidsocial|paid_social|display|ads?)$/.test(med)) return "Paid ads";
    if (med === "email" || /mail\.|outlook|gmail/.test(ref)) return "Email";
    if (med === "sms" || src === "sms") return "Text";
    if (SOCIAL_SRC.test(src) || /social/.test(med) || SOCIAL.test(ref)) return "Social";
    if (SEARCH.test(ref) || med === "organic") return "Search (Google etc.)";
    if (ref || src) return "Referral";
    return "Direct";
  }
  const CH_COLOR = { "Direct": "#c9a45c", "Search (Google etc.)": "#6fa8dc", "Social": "#c27ba0", "Email": "#7fcf9f", "Text": "#e9c46a", "Referral": "#a59f93", "PepKeep": "#ce1126", "Paid ads": "#f6b26b" };

  async function events(from, to) {
    const out = []; let page = 0;
    for (;;) { // page through (1000 per request)
      const { data, error } = await P.client().from("pst_web_events").select("at,visitor,session,event,path,product_key,value,term,ref_host,utm_source,utm_medium,utm_campaign,device,app")
        .gte("at", from.toISOString()).lt("at", to.toISOString()).order("at").range(page * 1000, page * 1000 + 999);
      if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000 || page > 60) break; page++;
    }
    return out;
  }
  // roll raw events into sessions + headline numbers
  function digest(ev) {
    const S = new Map();
    for (const e of ev) {
      let s = S.get(e.session); if (!s) { s = { id: e.session, visitor: e.visitor, first: e.at, last: e.at, views: 0, events: [], landing: null, device: e.device, app: e.app }; S.set(e.session, s); }
      s.last = e.at; s.events.push(e);
      if (e.event === "page_view") { s.views++; if (!s.landing) s.landing = e.path; }
      if (!s.ref_host && e.ref_host) s.ref_host = e.ref_host; ["utm_source", "utm_medium", "utm_campaign"].forEach(k => { if (!s[k] && e[k]) s[k] = e[k]; });
    }
    const sessions = [...S.values()];
    sessions.forEach(s => { s.ch = channel(s); s.secs = (new Date(s.last) - new Date(s.first)) / 1000; s.bounce = s.events.length <= 1; s.ordered = s.events.some(e => e.event === "order_placed"); s.landing = s.landing || s.events[0].path; });
    const visitors = new Set(ev.map(e => e.visitor)), views = ev.filter(e => e.event === "page_view").length;
    const engaged = sessions.filter(s => !s.bounce);
    return { ev, sessions, visitors, views, n: sessions.length,
      bounce: pct(sessions.filter(s => s.bounce).length, sessions.length),
      avgSecs: engaged.length ? engaged.reduce((a, s) => a + s.secs, 0) / sessions.length : 0,
      ppv: sessions.length ? views / sessions.length : 0,
      orders: sessions.filter(s => s.ordered).length,
      conv: pct(sessions.filter(s => s.ordered).length, sessions.length) };
  }
  function delta(cur, prev, { invert = false, unit = "%" } = {}) {
    if (prev == null || (!prev && !cur)) return `<em class="mkd flat">–</em>`;
    if (!prev) return `<em class="mkd up">new</em>`;
    const d = unit === "pts" ? cur - prev : ((cur - prev) / prev) * 100, good = invert ? d < 0 : d > 0;
    if (Math.abs(d) < 0.5) return `<em class="mkd flat">±0${unit === "pts" ? " pts" : "%"}</em>`;
    return `<em class="mkd ${good ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d))}${unit === "pts" ? " pts" : "%"}</em>`;
  }
  const kpi = (label, val, d, hint) => `<div class="mkk"><small>${label}</small><b>${val}</b>${d}${hint ? `<span>${hint}</span>` : ""}</div>`;
  // SVG line chart with its numbers: y-axis ticks, x labels, value labels on each point when there's room
  function lineChart(days, series, fmt = nf) {
    const W = 340, H = 150, L = 30, R = 8, T = 14, B = 22, n = days.length, max = Math.max(1, ...series.flatMap(s => s.vals));
    const mag = 10 ** Math.max(0, Math.floor(Math.log10(max / 4))), step = max <= 4 ? 1 : Math.ceil(max / 4 / mag) * mag, top = Math.ceil(max / step) * step;
    const x = i => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), y = v => T + (H - T - B) * (1 - v / top);
    const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    const every = Math.ceil(n / 6), lbl = d => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `<svg class="mkchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(" and "))} by day">
${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" class="t">${fmt(v, true)}</text>`).join("")}
${days.map((d, i) => { const last = i === n - 1, show = (i % every === 0 && !(n > 1 && !last && n - 1 - i <= every * 0.8)) || last; return show ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${n > 1 && last ? "end" : i === 0 && n > 1 ? "start" : "middle"}" class="t">${lbl(d)}</text>` : ""; }).join("")}
${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" points="${s.vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>${s.vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${n > 31 ? 0 : 2.5}" fill="${s.color}"><title>${lbl(days[i])}: ${fmt(v)} ${s.name.toLowerCase()}</title></circle>${n <= 10 && v ? `<text x="${x(i)}" y="${y(v) - 6}" text-anchor="middle" class="v" fill="${s.color}">${fmt(v, true)}</text>` : ""}`).join("")}`).join("")}
</svg><div class="mkleg">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${s.total ?? fmt(s.vals.reduce((a, b) => a + b, 0))}</b></span>`).join("")}</div>`;
  }
  // horizontal bars with the number and share on every row
  const hbars = (rows, { val, label, sub, color, fmt = nf } = {}) => {
    if (!rows.length) return `<p class="muted small">No data in this period yet.</p>`;
    const mx = Math.max(1, ...rows.map(val));
    return `<div class="mkbars">${rows.map(r => `<div class="mkbar"><div class="mkbl"><span>${label(r)}</span><b>${fmt(val(r))}</b></div><div class="mkbt"><i style="width:${Math.max(2, (val(r) / mx) * 100)}%;${color ? `background:${color(r)}` : ""}"></i></div>${sub ? `<small>${sub(r)}</small>` : ""}</div>`).join("")}</div>`;
  };
  const table = (head, rows) => rows.length ? `<div class="mktbl"><table><thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No data in this period yet.</p>`;
  let NAMES = {};
  const pageName = p => { const s = String(p || "").replace(/\.html.*$/, ""), m = s.match(/-(pstp\d+)$/i); if (m && NAMES[m[1].toUpperCase()]) return NAMES[m[1].toUpperCase()]; return s === "index" || !s ? "Home" : s === "product" ? "Product page" : s.replace(/-pstp\d+$/, "").replace(/-/g, " ").replace(/^\w/, c => c.toUpperCase()); };
  const group = (arr, key) => { const m = new Map(); arr.forEach(x => { const k = key(x); if (k == null) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; };

  const RANGES = [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]];
  async function pane(el, days, names, liveNow) {
    el.innerHTML = `<p class="muted small">Loading…</p>`; NAMES = names || {};
    const now = new Date(), start = new Date(new Date().toLocaleDateString("en-US", { timeZone: TZ }) + " 00:00"); // local midnight (Texas ≈ phone)
    start.setDate(start.getDate() - (days - 1));
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
    const d10 = x => x.toLocaleDateString("en-CA");
    let cur, prev, sales, salesPrev, firstEver;
    try {
      const [a, b, r1, r2, f] = await Promise.all([events(start, now), events(prevStart, start),
        P.client().rpc("pst_insights", { p_from: d10(start), p_to: d10(now) }), P.client().rpc("pst_insights", { p_from: d10(prevStart), p_to: d10(new Date(start - 864e5)) }),
        P.client().from("pst_web_events").select("at").order("at").limit(1)]);
      cur = digest(a); prev = digest(b); sales = r1.data; salesPrev = r2.data; firstEver = f.data?.[0]?.at || null;
      if (r1.error) throw r1.error;
    } catch (err) { el.innerHTML = `<p class="notice err">Couldn't load Insights: ${esc(err.message || err)}</p>`; return; }
    const tracked = firstEver && new Date(firstEver) > prevStart;
    const r = sales.retail, rp = salesPrev?.retail || null, w = sales, st = sales.stock;
    // returning visitors: seen before this period
    const vids = [...cur.visitors]; let returning = new Set();
    for (let i = 0; i < vids.length; i += 150) { const { data } = await P.client().from("pst_web_events").select("visitor").lt("at", start.toISOString()).in("visitor", vids.slice(i, i + 150)).limit(5000); (data || []).forEach(x => returning.add(x.visitor)); }
    const newV = vids.length - returning.size;
    // daily series (every day in range, zeros included)
    const dayList = []; for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) dayList.push(dayKey(d));
    const byDay = k => dayList.map(d => k(d));
    const vByDay = new Map(), sByDay = new Map(); cur.ev.forEach(e => { const k = dayKey(e.at); (vByDay.get(k) || vByDay.set(k, new Set()).get(k)).add(e.visitor); }); cur.sessions.forEach(s => { const k = dayKey(s.first); sByDay.set(k, (sByDay.get(k) || 0) + 1); });
    const paidByDay = new Map((r.by_day || []).map(x => [x.d, +x.paid || 0])), ordByDay = new Map((r.by_day || []).map(x => [x.d, +x.orders || 0]));
    // channels
    const chRows = group(cur.sessions, s => s.ch).map(([k, v]) => ({ k, n: v.length, orders: v.filter(s => s.ordered).length, bounce: pct(v.filter(s => s.bounce).length, v.length), prev: prev.sessions.filter(s => s.ch === k).length })).sort((a, b) => b.n - a.n);
    const srcRows = group(cur.sessions.filter(s => s.ref_host || s.utm_source), s => (s.utm_source || s.ref_host).replace(/^www\./, "")).map(([k, v]) => ({ k, n: v.length, orders: v.filter(s => s.ordered).length })).sort((a, b) => b.n - a.n).slice(0, 10);
    const campRows = group(cur.sessions.filter(s => s.utm_campaign), s => s.utm_campaign).map(([k, v]) => ({ k, src: v[0].utm_source || "", n: v.length, orders: v.filter(s => s.ordered).length })).sort((a, b) => b.n - a.n).slice(0, 10);
    const landRows = group(cur.sessions, s => s.landing).map(([k, v]) => ({ k, n: v.length, bounce: pct(v.filter(s => s.bounce).length, v.length), orders: v.filter(s => s.ordered).length })).sort((a, b) => b.n - a.n).slice(0, 10);
    const pageRows = group(cur.ev.filter(e => e.event === "page_view"), e => e.path).map(([k, v]) => ({ k, n: v.length, u: new Set(v.map(e => e.visitor)).size })).sort((a, b) => b.n - a.n).slice(0, 10);
    const prodRows = group(cur.ev.filter(e => e.product_key && ["product_view", "add_to_bag"].includes(e.event)), e => e.product_key).map(([k, v]) => ({ k, views: v.filter(e => e.event === "product_view").length, adds: v.filter(e => e.event === "add_to_bag").length }))
      .map(x => ({ ...x, sold: (r.top_products || []).find(p => p.product_key === x.k)?.units || 0 })).sort((a, b) => b.views - a.views).slice(0, 10);
    const f = { s: cur.n, v: new Set(cur.ev.filter(e => e.event === "product_view").map(e => e.session)).size, a: new Set(cur.ev.filter(e => e.event === "add_to_bag").map(e => e.session)).size, c: new Set(cur.ev.filter(e => e.event === "checkout_start").map(e => e.session)).size, o: cur.orders };
    const fz = [["Visits", f.s], ["Viewed a product", f.v], ["Added to bag", f.a], ["Started checkout", f.c], ["Placed an order", f.o]];
    const dev = group(cur.sessions, s => s.device || "unknown").map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n), appN = cur.sessions.filter(s => s.app).length;
    const hours = Array.from({ length: 24 }, (_, h) => cur.sessions.filter(s => hourOf(s.first) === h).length), hMax = Math.max(1, ...hours);
    const searches = group(cur.ev.filter(e => e.event === "search" && e.term), e => e.term.toLowerCase().trim()).map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n).slice(0, 10);
    const rpv = cur.visitors.size ? r.revenue_paid / cur.visitors.size : 0, rpvP = prev.visitors.size && rp ? rp.revenue_paid / prev.visitors.size : null;
    const vsLabel = days === 1 ? "vs yesterday" : `vs the ${days} days before`;

    el.innerHTML = `<div class="ilive" data-ilive><span class="ldot"></span><div><b data-livenum>…</b><small>on the site right now</small></div><span class="muted small" data-livewhere></span></div>
<div class="oseg">${RANGES.map(([n, l]) => `<button type="button" class="${n === days ? "on" : ""}" data-range="${n}">${l}</button>`).join("")}</div>
<p class="muted small mkvs">${esc(new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} – today · arrows compare ${vsLabel}${tracked ? `. Visit tracking started ${esc(new Date(firstEver).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}, so earlier comparisons are partial.` : "."}</p>
<h2 class="serif osec">Traffic</h2>
<div class="mkkpis">
${kpi("Visitors", nf(cur.visitors.size), delta(cur.visitors.size, prev.visitors.size), `${nf(newV)} new · ${nf(returning.size)} returning`)}
${kpi("Sessions", nf(cur.n), delta(cur.n, prev.n), `${p1(pct(appN, cur.n))} in the app`)}
${kpi("Page views", nf(cur.views), delta(cur.views, prev.views), `${(Math.round(cur.ppv * 10) / 10).toLocaleString()} per session`)}
${kpi("Bounce rate", p1(cur.bounce), delta(cur.bounce, prev.n ? prev.bounce : null, { invert: true, unit: "pts" }), "left after one page")}
${kpi("Avg. time on site", dur(cur.avgSecs), delta(cur.avgSecs, prev.n ? prev.avgSecs : null), "per session")}
</div>
<section class="mkcard"><h3 class="kick">Visitors and sessions by day</h3>${lineChart(dayList, [{ name: "Visitors", color: "#c9a45c", vals: byDay(d => vByDay.get(d)?.size || 0), total: `${nf(cur.visitors.size)} unique` }, { name: "Sessions", color: "#6fa8dc", vals: byDay(d => sByDay.get(d) || 0) }])}</section>
<h2 class="serif osec">Sales from traffic</h2>
<div class="mkkpis">
${kpi("Conversion rate", p1(cur.conv), delta(cur.conv, prev.n ? prev.conv : null, { unit: "pts" }), `${nf(cur.orders)} of ${nf(cur.n)} sessions ordered`)}
${kpi("Paid sales", money(r.revenue_paid), delta(+r.revenue_paid, rp ? +rp.revenue_paid : null), `${money(r.revenue_pending)} waiting on payment`)}
${kpi("Orders", nf(r.orders), delta(r.orders, rp ? rp.orders : null), `${r.cancelled} cancelled`)}
${kpi("Avg. order", money(r.avg_order), delta(+r.avg_order, rp ? +rp.avg_order : null), "paid orders")}
${kpi("Sales per visitor", money(rpv), delta(rpv, rpvP), "paid sales ÷ visitors")}
${kpi("Customers", nf(r.customers), delta(r.customers, rp ? rp.customers : null), `${r.new_customers} new · ${r.repeat_customers} returning`)}
</div>
<section class="mkcard"><h3 class="kick">Paid sales by day</h3>${lineChart(dayList, [{ name: "Paid sales", color: "#7fcf9f", vals: byDay(d => paidByDay.get(d) || 0) }], (v, short) => short && v >= 1000 ? `$${(Math.round(v / 100) / 10).toLocaleString()}k` : short ? `$${Math.round(v)}` : money(v))}</section>
<section class="mkcard"><h3 class="kick">Orders by day</h3>${lineChart(dayList, [{ name: "Orders", color: "#6fa8dc", vals: byDay(d => ordByDay.get(d) || 0) }])}</section>
<section class="mkcard"><h3 class="kick">Shopping funnel</h3><div class="mkfun">${fz.map(([l, n], i) => `<div><span>${l}</span><div class="mkbt"><i style="width:${f.s ? Math.max(2, (n / f.s) * 100) : 0}%"></i></div><b>${nf(n)}</b><small>${i ? `${p1(pct(n, fz[i - 1][1]))} of the step before` : "100%"}</small></div>`).join("")}</div></section>
<h2 class="serif osec">Where visitors come from</h2>
<section class="mkcard"><h3 class="kick">Channels</h3>${hbars(chRows, { val: x => x.n, label: x => `<i class="mkdot" style="background:${CH_COLOR[x.k] || "#888"}"></i>${esc(x.k)}`, color: x => CH_COLOR[x.k], sub: x => `${p1(pct(x.n, cur.n))} of sessions · ${x.orders} order${x.orders === 1 ? "" : "s"} · ${p1(x.bounce)} bounce · ${x.prev ? `${x.prev} before` : "new"}` })}</section>
<div class="igrid">
<section class="mkcard"><h3 class="kick">Top sources</h3>${table(["Source", "Sessions", "Orders"], srcRows.map(x => [esc(x.k), nf(x.n), nf(x.orders)]))}</section>
<section class="mkcard"><h3 class="kick">Campaigns (utm links)</h3>${campRows.length ? table(["Campaign", "Sessions", "Orders"], campRows.map(x => [`${esc(x.k)}<small>${esc(x.src)}</small>`, nf(x.n), nf(x.orders)])) : `<p class="muted small">None yet. Add <code>?utm_source=facebook&amp;utm_campaign=fall-sale</code> to a link you post and it shows up here.</p>`}</section>
<section class="mkcard"><h3 class="kick">Landing pages</h3>${table(["First page", "Sessions", "Bounce", "Orders"], landRows.map(x => [esc(pageName(x.k)), nf(x.n), p1(x.bounce), nf(x.orders)]))}</section>
<section class="mkcard"><h3 class="kick">Most viewed pages</h3>${table(["Page", "Views", "Visitors"], pageRows.map(x => [esc(pageName(x.k)), nf(x.n), nf(x.u)]))}</section>
<section class="mkcard"><h3 class="kick">Products: viewed → added → sold</h3>${table(["Product", "Views", "Added", "Sold"], prodRows.map(x => [esc(names[x.k] || x.k), nf(x.views), nf(x.adds), nf(x.sold)]))}</section>
<section class="mkcard"><h3 class="kick">What people search for</h3>${table(["Search", "Times"], searches.map(x => [esc(x.k), nf(x.n)]))}</section>
<section class="mkcard"><h3 class="kick">Devices</h3>${hbars(dev, { val: x => x.n, label: x => esc(x.k[0].toUpperCase() + x.k.slice(1)), sub: x => p1(pct(x.n, cur.n)) + " of sessions" })}<p class="muted small">${nf(appN)} sessions in the installed app (${p1(pct(appN, cur.n))})</p></section>
<section class="mkcard"><h3 class="kick">Busiest hours (Texas time)</h3><div class="mkhours">${hours.map((n, h) => `<div title="${h % 12 || 12}${h < 12 ? "am" : "pm"}: ${n} sessions"><i style="height:${Math.round((n / hMax) * 100)}%"></i><b>${n || ""}</b><small>${h % 6 === 0 ? `${h % 12 || 12}${h < 12 ? "a" : "p"}` : ""}</small></div>`).join("")}</div></section>
</div>
<h2 class="serif osec">Sales detail</h2>
<div class="igrid">
<section class="mkcard"><h3 class="kick">Top products · sales</h3>${table(["Product", "Sales", "Units"], (r.top_products || []).slice(0, 10).map(x => [esc(names[x.product_key] || `${x.name} ${x.strength || ""}`), money(x.revenue), nf(x.units)]))}</section>
<section class="mkcard"><h3 class="kick">How they pay and get it</h3>${table(["", "Orders"], [...Object.entries(r.payment_mix || {}), ["Local pickup", r.pickup], ["Shipped", r.shipped]].map(([k, v]) => [esc(k), nf(v)]))}<p class="muted small">Discounts ${money(r.discounts)} · store credit ${money(r.store_credit)} · ${r.backorder_units} vials backordered · ${r.auto_cancelled} auto-cancelled unpaid</p></section>
<section class="mkcard"><h3 class="kick">Running low</h3>${table(["Product", "Left"], (st.low || []).map(x => [esc(`${x.display_name} ${x.strength || ""}`), nf(x.current_inventory)]))}<p class="muted small">${st.out} products out of stock</p></section>
</div>
<p class="muted small" style="margin-top:12px">Counted on the shop itself: no cookies, no Google tracking. Your owner app and admin pages aren't counted. A session ends after 30 minutes without activity.</p>`;
    liveNow(names);
  }
  window.PSTMkt = { pane, channel, digest };
})();
