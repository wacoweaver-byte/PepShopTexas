// Pep Shop Texas · pst-weekly (v549): the Thursday report to Mike and Jimmie.
// Part 1, Marketing: what we did (marketing/efforts.json in the site repo, written by Claude's weekly run),
//   shop updates (the owner app's What's new), visitors, where they came from, the funnel, top searches
//   on the site and most viewed products.
// Part 2, Sales sheet: paid revenue, orders, units, average order, new vs returning customers, products
//   sold, payment methods, unpaid / cancelled / refunded, restock requests, all-time totals.
// Sent with Resend from the shop's domain, in the same Black Label shell as the order emails.
// Runs: pg_cron every Thursday (x-hook-key = pst_app_secrets.hook_key). Owners can also ask for
//   { action: "preview" } (returns the HTML) or { action: "send_me" } (sends only to the caller).
// Deploy with "Verify JWT" OFF (cron sends the hook key, not a login).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("WEEKLY_FROM") || "Pep Shop Texas <reports@pepshoptexas.com>";
const TO = (Deno.env.get("WEEKLY_TO") || "mike.weaver2013@gmail.com,wacoweaver@gmail.com").split(",").map(s => s.trim()).filter(Boolean);
const REPLY_TO = Deno.env.get("WEEKLY_REPLY_TO") || "mike.weaver2013@gmail.com";
const REPO_RAW = "https://raw.githubusercontent.com/wacoweaver-byte/PepShopTexas/main";
const SITE = "https://www.pepshoptexas.com", TZ = "America/Chicago";
const db = createClient(SB_URL, SRK, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-hook-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- brand (same shell as the order and restock emails) ---------- */
const C = { page: "#eceae4", navy: "#0a101c", card: "#ffffff", ink: "#1c2230", muted: "#6b6f78", line: "#ece4d3", soft: "#faf6ec", gold: "#a8822f", goldBtn: "#c9a45c", goldLight: "#d9bb78", up: "#1f6b3d", upBg: "#dff3e7", down: "#9b2c2c", downBg: "#fbe3e3" };
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", SERIF = "Georgia,'Times New Roman',serif";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const usd = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "");
const num = (n: number) => Number(n || 0).toLocaleString("en-US");
const pct = (n: number) => `${(Number(n || 0) * 100).toFixed(1).replace(/\.0$/, "")}%`;
const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });

function shell(pre: string, inner: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>@media only screen and (max-width:480px){.pn{width:62px!important}.pin{padding:22px 16px!important}.pout{padding:12px 6px 20px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}"><tr><td align="center" class="pout" style="padding:18px 10px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:${C.card};border-radius:14px;overflow:hidden;font-family:${F};color:${C.ink}">
<tr><td bgcolor="${C.navy}" style="background:${C.navy};padding:16px 20px" align="center"><a href="${SITE}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;vertical-align:middle"><img src="${SITE}/email/pst-emblem-email.png" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0"></td>
<td style="vertical-align:middle;font:400 17px/1 ${SERIF};letter-spacing:.32em;color:#ffffff;white-space:nowrap">PEP SHOP <span style="color:${C.goldLight}">TEXAS</span></td></tr></table></a></td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:${C.goldBtn}" bgcolor="${C.goldBtn}">&nbsp;</td></tr>
<tr><td class="pin" style="padding:26px 24px 26px">${inner}</td></tr>
<tr><td bgcolor="${C.navy}" style="background:${C.navy};padding:18px 20px;text-align:center;font:12px/1.6 ${F};color:#a7adbb">
<a href="${SITE}/owner.html" style="color:#ffffff;text-decoration:none;font-weight:600">Owner app</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${SITE}" style="color:#ffffff;text-decoration:none;font-weight:600">Shop</a><br>
Weekly report for the Pep Shop Texas owners. Reply to talk it over.</td></tr>
</table></td></tr></table></body></html>`;
}
const kick = (t: string) => `<div style="font:800 11px/1 ${F};letter-spacing:.14em;text-transform:uppercase;color:${C.gold};margin:0 0 8px">${esc(t)}</div>`;
const h2 = (t: string) => `<div style="font:600 22px/1.25 ${SERIF};color:${C.ink};margin:30px 0 4px;padding-top:18px;border-top:1px solid ${C.line}">${esc(t)}</div>`;
const h3 = (t: string) => `<div style="font:700 13px/1.3 ${F};color:${C.ink};margin:18px 0 6px;letter-spacing:.02em">${esc(t)}</div>`;
const p = (t: string, muted = false) => `<p style="margin:0 0 10px;font:14px/1.55 ${F};color:${muted ? C.muted : C.ink}">${t}</p>`;
function delta(now: number, before: number) {
  if (!before && !now) return "";
  if (!before) return `<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:${C.upBg};color:${C.up};font:700 11px/1.3 ${F}">new</span>`;
  const d = (now - before) / before, up = d >= 0;
  return `<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:${up ? C.upBg : C.downBg};color:${up ? C.up : C.down};font:700 11px/1.3 ${F}">${up ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(0)}%</span>`;
}
function tiles(list: [string, string, string][]) { // [label, value, delta]: equal-height boxes, flush with the text edges
  const n = list.length, gap = 2, w = (100 - gap * (n - 1)) / n;
  const box = ([l, v, d]: [string, string, string]) => `<td width="${w}%" valign="top" bgcolor="${C.soft}" style="width:${w}%;background:${C.soft};border:1px solid ${C.line};border-radius:10px;padding:12px 10px 11px;vertical-align:top">
<div style="font:700 10px/1.2 ${F};letter-spacing:.1em;text-transform:uppercase;color:${C.muted};white-space:nowrap">${esc(l)}</div><div style="font:700 21px/1.25 ${F};color:${C.ink};margin:5px 0 4px;white-space:nowrap">${v}</div><div style="height:18px;line-height:18px">${d || "&nbsp;"}</div></td>`;
  const cells = list.map(box).join(`<td width="${gap}%" style="width:${gap}%;font-size:0;line-height:0">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;table-layout:fixed;margin:8px 0 6px"><tr>${cells}</tr></table>`;
}
// week-over-week traffic: one row per week, visitors as a gold bar (email-safe: plain table cells, no images or scripts)
function trafficChart(weeks: { label: string; visitors: number; views: number }[]) {
  const max = Math.max(1, ...weeks.map(w => w.visitors));
  const rows = weeks.map((w, i) => { const pctW = Math.max(w.visitors ? 2 : 0, Math.round(w.visitors / max * 100)), last = i === weeks.length - 1;
    return `<tr><td width="92" style="width:92px;padding:6px 8px 6px 0;font:${last ? 700 : 400} 12.5px/1.2 ${F};color:${last ? C.ink : C.muted};white-space:nowrap">${esc(w.label)}</td>
<td style="padding:6px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed"><tr>${pctW ? `<td width="${pctW}%" height="14" bgcolor="${last ? C.goldBtn : C.goldLight}" style="width:${pctW}%;height:14px;background:${last ? C.goldBtn : C.goldLight};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>` : ""}${pctW < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table></td>
<td width="86" align="right" class="pn" style="width:86px;padding:6px 0 6px 10px;font:${last ? 700 : 400} 13px/1.2 ${F};color:${C.ink};white-space:nowrap">${num(w.visitors)}</td>
<td width="86" align="right" class="pn" style="width:86px;padding:6px 0 6px 10px;font:13px/1.2 ${F};color:${C.muted};white-space:nowrap">${num(w.views)}</td></tr>`; }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:4px 0 2px">
<tr><td width="92" style="width:92px;padding:0 8px 6px 0;font:700 11px/1.2 ${F};letter-spacing:.06em;text-transform:uppercase;color:${C.muted};border-bottom:2px solid ${C.line}">Week</td><td style="padding:0 0 6px;border-bottom:2px solid ${C.line}">&nbsp;</td><td width="86" align="right" class="pn" style="width:86px;padding:0 0 6px 10px;font:700 11px/1.2 ${F};letter-spacing:.06em;text-transform:uppercase;color:${C.muted};border-bottom:2px solid ${C.line}">Visitors</td><td width="86" align="right" class="pn" style="width:86px;padding:0 0 6px 10px;font:700 11px/1.2 ${F};letter-spacing:.06em;text-transform:uppercase;color:${C.muted};border-bottom:2px solid ${C.line}">Page views</td></tr>${rows}</table>`;
}
function table(head: string[], rows: (string | number)[][], align: ("l" | "r")[] = []) {
  if (!rows.length) return p("Nothing this week.", true);
  // flush with the text: first column starts at the left edge, number columns are fixed width and end at the right edge
  const pad = (i: number) => i === 0 ? "0 8px 0 0" : "0 0 0 10px"; // same 10px + 86px as the traffic chart, so number columns line up across every table
  const wide = (i: number) => i === 0 ? "" : ` width="86" class="pn" style="width:86px;`;
  const cell = (i: number, base: string) => i === 0 ? ` style="${base}"` : `${wide(i)}${base}"`;
  const th = head.map((h, i) => `<th align="${align[i] === "r" ? "right" : "left"}"${cell(i, `padding:${pad(i)};padding-bottom:6px;border-bottom:2px solid ${C.line};font:700 11px/1.2 ${F};letter-spacing:.06em;text-transform:uppercase;color:${C.muted}`)}>${esc(h)}</th>`).join("");
  const tr = rows.map(r => `<tr>${r.map((c, i) => `<td align="${align[i] === "r" ? "right" : "left"}"${cell(i, `padding:${pad(i)};padding-top:8px;padding-bottom:8px;border-bottom:1px solid ${C.line};font:13.5px/1.35 ${F};color:${C.ink};${i ? "white-space:nowrap;" : ""}`)}>${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:4px 0 8px">${th ? `<tr>${th}</tr>` : ""}${tr}</table>`;
}
const bullets = (items: string[]) => items.length ? `<ul style="margin:4px 0 10px;padding-left:20px">${items.map(i => `<li style="margin:0 0 6px;font:14px/1.5 ${F};color:${C.ink}">${i}</li>`).join("")}</ul>` : p("Nothing logged this week.", true);

/* ---------- data ---------- */
async function allRows(table: string, cols: string, since?: string, sinceCol = "created_at") {
  const rows: any[] = [];
  for (let i = 0; i < 200000; i += 1000) {
    let q = db.from(table).select(cols).order(sinceCol, { ascending: true }).range(i, i + 999);
    if (since) q = q.gte(sinceCol, since);
    const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || [])); if ((data || []).length < 1000) break;
  }
  return rows;
}
const PAID = (o: any) => o.payment_status === "paid" && !["cancelled", "refunded", "rejected"].includes(o.status);
const who = (o: any) => String(o.customer_email || o.shipping_email || o.customer_id || o.user_id || o.id).toLowerCase();
const host = (h: string | null) => { const s = String(h || "").toLowerCase().replace(/^www\./, ""); if (!s) return "Direct / typed in"; if (/google\./.test(s)) return "Google"; if (/bing\./.test(s)) return "Bing"; if (/duckduckgo/.test(s)) return "DuckDuckGo"; if (/facebook|fb\.|instagram|l\.facebook/.test(s)) return "Facebook / Instagram"; if (/reddit/.test(s)) return "Reddit"; if (/t\.co$|twitter|x\.com/.test(s)) return "X"; if (/pepkeep/.test(s)) return "PepKeep"; if (/pepshoptexas/.test(s)) return "Direct / typed in"; return s; };

async function build(end = new Date()) {
  const start = new Date(end.getTime() - 7 * 864e5), prev = new Date(start.getTime() - 7 * 864e5);
  const [orders, items, events, products, reqs, efforts, ops4] = await Promise.all([
    allRows("orders", "id,created_at,status,payment_status,total,subtotal,discount_amount,shipping,payment_method,customer_email,shipping_email,customer_id,user_id,shipping_city,shipping_state,tracking_number"),
    allRows("order_items", "order_id,product_key,product_name,product_strength,quantity,line_total,created_at", prev.toISOString()),
    allRows("pst_web_events", "at,visitor,session,event,path,product_key,term,ref_host,utm_source,device", new Date(end.getTime() - 56 * 864e5).toISOString(), "at"),
    db.from("product_catalog").select("product_key,display_name,strength").then(r => r.data || []),
    db.from("product_availability_requests").select("product_key,product_name,product_strength,requested_quantity,created_at").gte("created_at", start.toISOString()).then(r => r.data || [], () => []),
    fetch(`${REPO_RAW}/marketing/efforts.json?cb=${Date.now()}`).then(r => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
    fetch(`${REPO_RAW}/js/pst-owner-ops4.js?cb=${Date.now()}`).then(r => r.ok ? r.text() : "").catch(() => ""),
  ]);
  const pname = Object.fromEntries(products.map((x: any) => [x.product_key, `${x.display_name}${x.strength ? ` ${x.strength}` : ""}`]));
  const inW = (t: string, a: Date, b: Date) => { const d = new Date(t); return d >= a && d < b; };
  const wk = (a: Date, b: Date) => {
    const os = orders.filter(o => inW(o.created_at, a, b)), paid = os.filter(PAID);
    const ids = new Set(paid.map(o => o.id)), its = items.filter(i => ids.has(i.order_id));
    const ev = events.filter(e => inW(e.at, a, b));
    const cnt = (k: string) => ev.filter(e => e.event === k);
    const firstPaid = new Map<string, number>(); for (const o of orders.filter(PAID)) { const k = who(o), t = new Date(o.created_at).getTime(); if (!firstPaid.has(k) || t < firstPaid.get(k)!) firstPaid.set(k, t); }
    const buyers = new Set(paid.map(who)); let newC = 0; buyers.forEach(k => { const t = firstPaid.get(k)!; if (t >= a.getTime() && t < b.getTime()) newC++; });
    const visitors = new Set(ev.map(e => e.visitor)).size, sessions = new Set(ev.map(e => e.session)).size;
    return { os, paid, its, ev, revenue: paid.reduce((s, o) => s + Number(o.total || 0), 0), units: its.filter(i => Number(i.line_total || 0) > 0).reduce((s, i) => s + Number(i.quantity || 0), 0), free: its.filter(i => !(Number(i.line_total || 0) > 0)).reduce((s, i) => s + Number(i.quantity || 0), 0),
      discounts: paid.reduce((s, o) => s + Number(o.discount_amount || 0), 0), buyers: buyers.size, newC, visitors, sessions,
      pv: cnt("page_view").length, prodViews: cnt("product_view"), adds: cnt("add_to_bag"), checkouts: cnt("checkout_start"), placed: cnt("order_placed"), searches: cnt("search"), signups: cnt("signup").length };
  };
  const W = wk(start, end), P = wk(prev, start);
  // the last 8 weeks (only weeks since tracking began on Oct 25, 2026)
  const firstEv = events.length ? new Date(events[0].at).getTime() : end.getTime();
  const weeks: { label: string; visitors: number; views: number }[] = [];
  for (let i = 7; i >= 0; i--) { const a = new Date(end.getTime() - (i + 1) * 7 * 864e5), b = new Date(end.getTime() - i * 7 * 864e5); if (b.getTime() <= firstEv) continue;
    const ev = events.filter(e => { const t = new Date(e.at); return t >= a && t < b; });
    weeks.push({ label: `${day(a)} – ${day(new Date(b.getTime() - 1))}`, visitors: new Set(ev.map(e => e.visitor)).size, views: ev.filter(e => e.event === "page_view").length }); }
  const aov = W.paid.length ? W.revenue / W.paid.length : 0, aovP = P.paid.length ? P.revenue / P.paid.length : 0;
  const conv = W.visitors ? W.paid.length / W.visitors : 0, convP = P.visitors ? P.paid.length / P.visitors : 0;

  // efforts (marketing log) and shop updates (What's new in the owner app)
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in Texas time
  const s0 = ymd(start), e0 = ymd(end);
  const effs = (efforts.entries || []).filter((e: any) => e.date && e.date >= s0 && e.date <= e0);
  const nextUp: string[] = (efforts.next || []).slice(0, 6);
  const rel: { title: string; items: string[] }[] = [];
  for (const m of ops4.matchAll(/\{ v: "([\d.]+)", d: "([^"]+)", title: "([^"]+)", items: \[(.*?)\] \}/g)) {
    const d = ymd(new Date(`${m[2]} 12:00`)); if (!(d >= s0 && d <= e0)) continue;
    rel.push({ title: m[3], items: [...m[4].matchAll(/L\("((?:[^"\\]|\\.)*)"/g)].map(x => x[1].replace(/\\"/g, '"')).slice(0, 3) });
  }

  // tops
  const tally = <T,>(arr: T[], key: (t: T) => string) => { const m = new Map<string, number>(); arr.forEach(x => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  // week over week is the standard: every list shows this week next to last week
  const starts = (X: any) => { const m = new Map<string, any>(); X.ev.filter((e: any) => e.event === "page_view").forEach((e: any) => { if (!m.has(e.session)) m.set(e.session, e); }); return [...m.values()]; };
  const srcKey = (e: any) => e.utm_source ? `${e.utm_source} (campaign link)` : host(e.ref_host);
  const termKey = (e: any) => String(e.term || "").trim().toLowerCase();
  const sources = tally(starts(W), srcKey).slice(0, 6), srcP = new Map(tally(starts(P), srcKey));
  const searches = tally(W.searches, termKey).slice(0, 10), srchP = new Map(tally(P.searches, termKey));
  const viewed = tally(W.prodViews, e => e.product_key).slice(0, 10), viewP = new Map(tally(P.prodViews, e => e.product_key));
  const addsBy = new Map(tally(W.adds, e => e.product_key));
  const devices = tally(W.ev.filter(e => e.event === "page_view"), e => e.device || "unknown");
  const sold = new Map<string, { key: string; units: number; rev: number; name: string }>();
  W.its.forEach(i => { const k = i.product_key || i.product_name; const s = sold.get(k) || { key: k, units: 0, rev: 0, name: pname[i.product_key] || `${i.product_name}${i.product_strength ? ` ${i.product_strength}` : ""}` }; s.units += Number(i.quantity || 0); s.rev += Number(i.line_total || 0); sold.set(k, s); });
  const soldRows = [...sold.values()].sort((a, b) => b.rev - a.rev || b.units - a.units);
  const soldP = new Map<string, number>(); P.its.forEach(i => { const k = i.product_key || i.product_name; soldP.set(k, (soldP.get(k) || 0) + Number(i.quantity || 0)); });
  const pays = tally(W.paid, o => o.payment_method || "Other");
  const unpaid = W.os.filter(o => o.payment_status === "pending" && !["cancelled", "rejected"].includes(o.status));
  const lost = W.os.filter(o => ["cancelled", "rejected"].includes(o.status)), refunded = W.os.filter(o => o.status === "refunded");
  const allPaid = orders.filter(PAID), allRev = allPaid.reduce((s, o) => s + Number(o.total || 0), 0), allCust = new Set(allPaid.map(who)).size;
  const reqTally = tally(reqs, (r: any) => pname[r.product_key] || `${r.product_name || ""} ${r.product_strength || ""}`.trim()).slice(0, 6);

  const range = `${day(start)} – ${day(new Date(end.getTime() - 1))}`;
  const inner = `${kick(`Weekly report · ${range}`)}
<div style="font:600 26px/1.2 ${SERIF};color:${C.ink};margin:0 0 6px">${W.paid.length ? `${usd(W.revenue)} from ${W.paid.length} paid order${W.paid.length === 1 ? "" : "s"}` : "No paid orders this week"}</div>
${p(`${num(W.visitors)} people visited the shop${W.searches.length ? ` and searched ${num(W.searches.length)} times` : ""}. Every number in this report is compared with the week before.`, true)}
${tiles([["Revenue", usd(W.revenue), delta(W.revenue, P.revenue)], ["Paid orders", num(W.paid.length), delta(W.paid.length, P.paid.length)], ["Visitors", num(W.visitors), delta(W.visitors, P.visitors)], ["Buy rate", pct(conv), delta(conv, convP)]])}

${h2("Part 1 · Marketing")}
${h3("What we did this week")}${bullets(effs.map((e: any) => `<b>${esc(e.title)}</b>${e.detail ? ` · ${esc(e.detail)}` : ""}`))}
${h3("Shop updates")}${rel.length ? `${bullets(rel.slice(0, 6).map(r => `<b>${esc(r.title)}</b>${r.items[0] ? ` · ${esc(r.items[0].length > 110 ? r.items[0].slice(0, 107) + "…" : r.items[0])}` : ""}`))}${rel.length > 6 ? p(`And ${rel.length - 6} more. Full notes: owner app → More → What's new.`, true) : ""}` : p("No app or site releases this week.", true)}
${h3("Traffic, week over week")}${trafficChart(weeks)}${weeks.length < 3 ? p("Tracking started Oct 25, 2026, so the chart fills in week by week.", true) : ""}
${tiles([["Visits", num(W.sessions), delta(W.sessions, P.sessions)], ["Page views", num(W.pv), delta(W.pv, P.pv)], ["Sign-ups", num(W.signups), delta(W.signups, P.signups)]])}
${h3("Where visits came from")}${table(["Source", "This week", "Last week"], sources.map(([k, v]) => [esc(k), num(v), num(srcP.get(k) || 0)]), ["l", "r", "r"])}
${devices.length ? p(`Devices: ${devices.map(([k, v]) => `${esc(k)} ${pct(v / Math.max(1, W.pv))}`).join(" · ")}`, true) : ""}
${h3("From looking to buying")}${table(["Step", "This week", "Last week"], [["Viewed a product", num(new Set(W.prodViews.map(e => e.session)).size), num(new Set(P.prodViews.map(e => e.session)).size)], ["Added to bag", num(new Set(W.adds.map(e => e.session)).size), num(new Set(P.adds.map(e => e.session)).size)], ["Started checkout", num(new Set(W.checkouts.map(e => e.session)).size), num(new Set(P.checkouts.map(e => e.session)).size)], ["Placed an order", num(W.os.length), num(P.os.length)], ["Paid", num(W.paid.length), num(P.paid.length)]], ["l", "r", "r"])}
${p("Counted in visits, so one person looking at five products counts once.", true)}
${h3("Top searches on the site")}${table(["Searched for", "This week", "Last week"], searches.map(([k, v]) => [esc(k), num(v), num(srchP.get(k) || 0)]), ["l", "r", "r"])}
${h3("Most viewed products")}${table(["Product", "Views", "Last week", "Added to bag"], viewed.map(([k, v]) => [esc(pname[k] || k), num(v), num(viewP.get(k) || 0), num(addsBy.get(k) || 0)]), ["l", "r", "r", "r"])}
${nextUp.length ? `${h3("Next week")}${bullets(nextUp.map(esc))}` : ""}

${h2("Part 2 · Sales sheet")}
${tiles([["Avg order", usd(aov), delta(aov, aovP)], ["Paid vials", num(W.units), delta(W.units, P.units)], ["Customers", num(W.buyers), delta(W.buyers, P.buyers)]])}
${p(`${num(W.newC)} new customer${W.newC === 1 ? "" : "s"} and ${num(W.buyers - W.newC)} returning.${W.discounts ? ` Discounts given: ${usd(W.discounts)}.` : ""}${W.free ? ` Free vials given (promos and comps): ${num(W.free)}.` : ""}`)}
${h3("Products sold")}${table(["Product", "Vials", "Last week", "Revenue"], soldRows.map(s => [esc(s.name), num(s.units), num(soldP.get(s.key) || 0), s.rev > 0 ? usd(s.rev) : "Free"]), ["l", "r", "r", "r"])}
${h3("How they paid")}${table(["Method", "Orders"], pays.map(([k, v]) => [esc(k), num(v)]), ["l", "r"])}
${h3("Needs a look")}${table(["", "Orders", "Amount"], [["Waiting on payment", num(unpaid.length), usd(unpaid.reduce((s, o) => s + Number(o.total || 0), 0))], ["Cancelled or rejected", num(lost.length), usd(lost.reduce((s, o) => s + Number(o.total || 0), 0))], ["Refunded", num(refunded.length), usd(refunded.reduce((s, o) => s + Number(o.total || 0), 0))]], ["l", "r", "r"])}
${h3("Restock requests")}${table(["Product", "Requests"], reqTally.map(([k, v]) => [esc(k), num(v)]), ["l", "r"])}
${h3("All time")}${p(`${usd(allRev)} from ${num(allPaid.length)} paid orders and ${num(allCust)} customers.`)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0"><tr><td style="border-radius:6px;background:${C.goldBtn}" bgcolor="${C.goldBtn}"><a href="${SITE}/owner.html#today" style="display:inline-block;padding:13px 22px;font:700 14px/1 ${F};color:${C.navy};text-decoration:none;border-radius:6px">Open the owner app</a></td></tr></table>`;
  const subject = `Pep Shop Texas weekly · ${range} · ${usd(W.revenue)}, ${W.paid.length} order${W.paid.length === 1 ? "" : "s"}, ${num(W.visitors)} visitors`;
  return { subject, html: shell(`${usd(W.revenue)} revenue, ${W.paid.length} paid orders, ${num(W.visitors)} visitors this week.`, inner) };
}

async function send(to: string[], subject: string, html: string) {
  if (!RESEND) throw new Error("RESEND_API_KEY isn't set.");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, reply_to: REPLY_TO, subject, html }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.message || `Resend ${r.status}`); return j;
}

async function owner(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""); if (!t) return null;
  const { data } = await db.auth.getUser(t); const u = data?.user; if (!u) return null;
  let { data: a } = await db.from("admin_users").select("is_active").eq("user_id", u.id).maybeSingle();
  if (!a && u.email) ({ data: a } = await db.from("admin_users").select("is_active").eq("email", u.email).maybeSingle());
  return a && a.is_active !== false ? u : null;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ ok: true, service: "pst-weekly" });
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  try {
    const hk = req.headers.get("x-hook-key") || "";
    if (hk) {
      const { data } = await db.from("pst_app_secrets").select("value").eq("key", "hook_key").maybeSingle();
      if (!data?.value || hk !== data.value) return out({ error: "bad key" }, 401);
      const r = await build(); const sent = await send(TO, r.subject, r.html); return out({ ok: true, to: TO, id: sent.id });
    }
    const u = await owner(req); if (!u) return out({ error: "Owners only." }, 401);
    const r = await build(body.end ? new Date(body.end) : new Date());
    if (body.action === "send_me") { const sent = await send([u.email!], r.subject, r.html); return out({ ok: true, to: u.email, id: sent.id }); }
    return out({ ok: true, subject: r.subject, html: r.html });
  } catch (e) { console.error("pst-weekly", (e as Error).message); return out({ error: (e as Error).message }, 500); }
});
