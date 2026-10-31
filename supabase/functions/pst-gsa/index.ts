// Pep Shop Texas · pst-gsa (v545/v546): the bridge to Gold Standard Analytics.
//
// 1) Webhook (Gold Standard → here). Signed with HMAC-SHA256 over "<t>.<raw body>" in X-GSA-Signature
//    (t=<unix seconds>,v1=<hex>); deduped on X-GSA-Event-Id. A published certificate is matched to a
//    product by the item # written in its lot ("PSTP100063 · vendor lot") and attached to that product's
//    lab report link. Without an item #, a name match becomes a suggestion Jimmie approves with one tap.
//    A failed or retracted certificate is never attached. Every outcome lands in the owners' bell.
// 2) Owner actions (owner app → here, signed-in owner only): connect, status, attach, dismiss, and
//    ordering tests (catalog, quote + shipping price, order with the item # on each sample's lot).
//
// Secrets: GSA_API_KEY (Edge Function secret). The webhook signing secret Gold Standard returns when we
// connect is kept in public.pst_app_secrets (key 'gsa_webhook_secret'), like the existing hook key.
// Deploy with "Verify JWT" OFF: Gold Standard can't send a Supabase login; owner actions check the
// caller's login against admin_users here instead.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("GSA_API_KEY") || "";
const GSA = "https://www.goldstandardanalytics.com", API = `${GSA}/api/v1/agent`;
const SELF = `${SB_URL}/functions/v1/pst-gsa`;
const db = createClient(SB_URL, SRK, { auth: { persistSession: false } });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const now = () => new Date().toISOString();
const idem = (p: string) => `pst-${p}-${crypto.randomUUID()}`;

/* ---------- Gold Standard API ---------- */
class GsaError extends Error { status = 0; code = ""; details: unknown = null; }
async function gsa(path: string, init: RequestInit & { idemKey?: string } = {}) {
  if (!KEY) { const e = new GsaError("The Gold Standard key (GSA_API_KEY) isn't set on the server yet."); e.status = 500; throw e; }
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY}`, Accept: "application/json", "Content-Type": "application/json" };
  if (init.idemKey) headers["Idempotency-Key"] = init.idemKey;
  const r = await fetch(API + path, { ...init, headers });
  const ct = r.headers.get("content-type") || "";
  if (r.ok && /pdf/i.test(ct)) return { pdfBase64: btoa(String.fromCharCode(...new Uint8Array(await r.arrayBuffer()))) };
  const t = await r.text(); let j: any; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t.slice(0, 500) }; }
  if (!r.ok) { const e = new GsaError(j?.error?.message || `Gold Standard answered ${r.status}`); e.status = r.status; e.code = j?.error?.code || ""; e.details = j?.error?.details ?? null; throw e; }
  return j;
}
const unwrap = (j: any) => (j && typeof j === "object" && "data" in j && j.data && typeof j.data === "object" ? j.data : j);

/* ---------- small helpers ---------- */
const secret = async (k: string) => (await db.from("pst_app_secrets").select("value").eq("key", k).maybeSingle()).data?.value || "";
const setSecret = (k: string, v: string) => db.from("pst_app_secrets").upsert({ key: k, value: v }, { onConflict: "key" });
async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// same name rules as the shop's lab report matching (coded names map to the real peptide)
const ALIAS: Record<string, string> = { pstcg1: "hcg", pst2tr: "tirzepatide", pst3rt: "retatrutide" };
const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cname = (n: unknown) => { const k = norm(String(n || "").split("(")[0]); return ALIAS[k] || k; };
const sameCompound = (display: string, compound: string) => { const a = cname(display), b = cname(compound); return !!a && !!b && (a.includes(b) || b.includes(a)); };
const KEY_RX = /PSTP\d{4,8}/i;
const certUrl = (acc: string) => `${GSA}/coa/${acc}`;
const lotLabel = (lot: string) => { const v = String(lot || "").replace(KEY_RX, "").replace(/^[\s·|:,\-]+|[\s·|:,\-]+$/g, "").trim(); return (v ? `View COA · Lot ${v}` : "View COA").slice(0, 40); };

async function products() {
  const { data } = await db.from("product_catalog").select("product_key,display_name,strength").limit(2000);
  return (data || []) as { product_key: string; display_name: string; strength: string | null }[];
}
const pname = (p: { display_name: string; strength: string | null }) => `${p.display_name}${p.strength ? ` ${p.strength}` : ""}`;

async function bell(title: string, body: string) {
  const { data: owners } = await db.from("admin_users").select("user_id,is_active");
  const rows = (owners || []).filter((o: any) => o.user_id && o.is_active !== false).map((o: any) => ({ user_id: o.user_id, role: "owner", kind: "coa", title, body, url: "owner.html#gsa" }));
  if (rows.length) await db.from("pst_inbox").insert(rows);
}

async function attach(acc: string, key: string, lot: string) {
  const fields = { coa_url: certUrl(acc), coa_label: lotLabel(lot), updated_at: now() };
  const a = await db.from("product_catalog").update(fields).eq("product_key", key); if (a.error) throw a.error;
  await db.from("product_inventory").update(fields).eq("product_key", key); // the owner app keeps both in step
}

async function verdictOf(acc: string) {
  try { const r = unwrap(await gsa(`/results/${encodeURIComponent(acc)}`)); return String(r?.verdict ?? r?.coa?.verdict ?? r?.result?.verdict ?? "unknown").toLowerCase(); }
  catch { try { const p = await fetch(`${GSA}/api/coa/${acc}.json`); if (p.ok) return String((await p.json()).verdict || "unknown").toLowerCase(); } catch { /* ignore */ } return "unknown"; }
}

/* ---------- a published certificate ---------- */
async function onPublished(d: any) {
  const acc = String(d.accession_number || d.accession || "").toUpperCase(); if (!acc) return;
  const lot = String(d.lot_number || d.lot || ""), compound = String(d.compound || "");
  const verdict = await verdictOf(acc), prods = await products(), km = lot.match(KEY_RX);
  let status = "unmatched", product_key: string | null = null, candidates: string[] = [], note = "";
  if (verdict === "fail") { status = "failed"; note = "Did not pass at the lab, so it wasn't attached."; }
  else if (km) {
    const p = prods.find(x => x.product_key.toUpperCase() === km[0].toUpperCase());
    if (!p) { candidates = prods.filter(x => sameCompound(x.display_name, compound)).map(x => x.product_key); status = candidates.length ? "suggested" : "unmatched"; note = `Item # ${km[0].toUpperCase()} isn't one of your products.`; }
    else if (!compound || sameCompound(p.display_name, compound)) { product_key = p.product_key; status = "attached"; }
    else { candidates = [p.product_key, ...prods.filter(x => x.product_key !== p.product_key && sameCompound(x.display_name, compound)).map(x => x.product_key)]; status = "suggested"; note = `The lot says ${p.product_key} (${pname(p)}), but the certificate is for ${compound}.`; }
  } else {
    candidates = prods.filter(x => sameCompound(x.display_name, compound)).map(x => x.product_key);
    status = candidates.length ? "suggested" : "unmatched"; note = candidates.length ? "No item # on the lot, so it needs your OK." : `No item # on the lot and no product named ${compound || "like this"}.`;
  }
  if (status === "attached" && product_key) await attach(acc, product_key, lot);
  await db.from("pst_gsa_coas").upsert({ accession: acc, coa_id: d.coa_id ?? null, submission_id: d.submission_id ?? null, compound, lot, verdict, product_key, status, candidates, note, updated_at: now() }, { onConflict: "accession" });
  const p = product_key ? prods.find(x => x.product_key === product_key) : null;
  if (status === "attached" && p) await bell(`${pname(p)} is verified by Gold Standard`, `${acc} is on the product page now.`);
  else if (status === "suggested") await bell(`New Gold Standard certificate: ${compound}`, `Tap to pick which product ${acc} belongs to.`);
  else if (status === "failed") await bell(`${compound} did not pass at Gold Standard`, `${acc} was not put on your site.`);
  else await bell(`New Gold Standard certificate: ${compound || acc}`, `${acc} didn't match a product. Tap to attach it.`);
}

async function onRetracted(d: any) {
  const acc = String(d.accession_number || d.accession || "").toUpperCase(); if (!acc) return;
  const { data: row } = await db.from("pst_gsa_coas").select("product_key,compound").eq("accession", acc).maybeSingle();
  await db.from("pst_gsa_coas").upsert({ accession: acc, status: "retracted", verdict: "retracted", product_key: row?.product_key ?? null, compound: row?.compound ?? d.compound ?? null, note: "Withdrawn by the lab. The product page shows COA pending until a new one is attached.", updated_at: now() }, { onConflict: "accession" });
  await bell(`Gold Standard withdrew ${acc}`, `${row?.compound || d.compound || "That product"} now shows "COA pending" on your site.`);
}

async function onOrderEvent(type: string, d: any) {
  const ref = String(d.reference || d.order_reference || d.submission_reference || d.order_id || d.submission_id || ""); if (!ref) return;
  const to = String(d.to_status || d.status || type);
  await db.from("pst_gsa_orders").update({ status: to, updated_at: now() }).eq("reference", ref);
  const say: Record<string, string> = { label_generated: "Shipping label is ready to print", sample_received: "Your samples arrived at the lab", in_lab: "Testing has started", completed: "Testing is complete" };
  if (say[to]) await bell(`Gold Standard order ${ref}`, say[to]);
}

async function webhook(req: Request, raw: string) {
  const sec = await secret("gsa_webhook_secret");
  if (!sec) return out({ error: "not connected" }, 503);
  const parts = Object.fromEntries(String(req.headers.get("x-gsa-signature") || "").split(",").map(p => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return out({ error: "bad signature" }, 401);
  if (!safeEq(parts.v1, await hmacHex(sec, `${parts.t}.${raw}`))) return out({ error: "bad signature" }, 401);
  let ev: any; try { ev = JSON.parse(raw); } catch { return out({ error: "bad json" }, 400); }
  const id = req.headers.get("x-gsa-event-id") || ev.id || "", type = String(ev.type || ev.event || "");
  if (id) { const ins = await db.from("pst_gsa_events").insert({ event_id: id, type }); if (ins.error && /duplicate|unique/i.test(ins.error.message)) return out({ ok: true, duplicate: true }); }
  const d = ev.data || ev.payload || {};
  try {
    if (type === "coa.published" || type === "results.published") { if (type === "results.published") { const acc = String(d.accession_number || "").toUpperCase(); const { data: seen } = await db.from("pst_gsa_coas").select("accession").eq("accession", acc).maybeSingle(); if (seen) return out({ ok: true }); } await onPublished(d); }
    else if (type === "coa.retracted") await onRetracted(d);
    else if (/^(order|shipment|sample|testing)\./.test(type)) await onOrderEvent(type, d);
  } catch (e) { console.error("pst-gsa webhook", type, (e as Error).message); if (id) await db.from("pst_gsa_events").delete().eq("event_id", id); return out({ error: "retry" }, 500); }
  return out({ ok: true });
}

/* ---------- owner actions ---------- */
async function ownerOf(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""); if (!t) return null;
  const { data } = await db.auth.getUser(t); const u = data?.user; if (!u) return null;
  let { data: a } = await db.from("admin_users").select("is_active").eq("user_id", u.id).maybeSingle();
  if (!a && u.email) ({ data: a } = await db.from("admin_users").select("is_active").eq("email", u.email).maybeSingle());
  return a && a.is_active !== false ? u : null;
}

async function action(req: Request, body: any) {
  const u = await ownerOf(req); if (!u) return out({ error: "Owners only. Sign in to the owner app." }, 401);
  const act = String(body.action || "");
  if (act === "status") {
    const [hook, coas, orders] = await Promise.all([secret("gsa_webhook_id"), db.from("pst_gsa_coas").select("*").order("updated_at", { ascending: false }).limit(60), db.from("pst_gsa_orders").select("*").order("created_at", { ascending: false }).limit(30)]);
    let account: any = null, accountError = ""; try { account = unwrap(await gsa("/account")); } catch (e) { accountError = (e as Error).message; }
    return out({ connected: !!hook, keySet: !!KEY, account, accountError, coas: coas.data || [], orders: orders.data || [] });
  }
  if (act === "connect") {
    const have = await secret("gsa_webhook_id"); if (have && !body.force) return out({ connected: true, id: have });
    const k = idem("hook");
    const r = unwrap(await gsa("/webhooks", { method: "POST", idemKey: k, body: JSON.stringify({ url: SELF, events: ["coa.published", "coa.retracted", "order.status_changed", "shipment.updated", "sample.received"], description: "Pep Shop Texas (pst-gsa)", idempotencyKey: k, confirm: true }) }));
    const ep = r.endpoint || r.webhook || r;
    const sec = ep.secret || ep.signingSecret || ep.signing_secret || r.secret || r.signingSecret || r.signing_secret || "";
    const id = ep.id || ep.endpointId || r.id || "";
    if (!sec || !id) return out({ error: "Gold Standard didn't return the signing secret. Nothing was saved; try again.", got: Object.keys(ep) }, 502);
    await setSecret("gsa_webhook_secret", String(sec)); await setSecret("gsa_webhook_id", String(id));
    return out({ connected: true, id });
  }
  if (act === "test") { const id = await secret("gsa_webhook_id"); if (!id) return out({ error: "Not connected yet." }, 400); const k = idem("test"); return out(unwrap(await gsa(`/webhooks/${id}/test`, { method: "POST", idemKey: k, body: JSON.stringify({ idempotencyKey: k, confirm: true }) }))); }
  if (act === "attach") {
    const acc = String(body.accession || "").toUpperCase(), key = String(body.product_key || "");
    const { data: row } = await db.from("pst_gsa_coas").select("*").eq("accession", acc).maybeSingle();
    if (!row) return out({ error: "Certificate not found." }, 404);
    if (["failed", "retracted"].includes(row.status)) return out({ error: "This certificate didn't pass or was withdrawn, so it can't go on the site." }, 400);
    if (!(await products()).some(p => p.product_key === key)) return out({ error: "Pick one of your products." }, 400);
    await attach(acc, key, row.lot || "");
    await db.from("pst_gsa_coas").update({ status: "attached", product_key: key, note: null, updated_at: now() }).eq("accession", acc);
    return out({ ok: true });
  }
  if (act === "dismiss") { await db.from("pst_gsa_coas").update({ status: "dismissed", updated_at: now() }).eq("accession", String(body.accession || "").toUpperCase()); return out({ ok: true }); }
  if (act === "add") { // paste a GSA number by hand: runs the same matching as the webhook
    const acc = String(body.accession || "").toUpperCase(); if (!/^GSA-\d{4}-\d{6}$/.test(acc)) return out({ error: "That isn't a Gold Standard number (GSA-2026-000000)." }, 400);
    let r: any = null; try { r = unwrap(await gsa(`/results/${acc}`)); } catch { const p = await fetch(`${GSA}/api/coa/${acc}.json`); if (p.ok) r = await p.json(); }
    if (!r) return out({ error: `Gold Standard doesn't have ${acc} on your account.` }, 404);
    await onPublished({ accession_number: acc, compound: r.compound, lot_number: r.lot ?? r.lot_number, coa_id: r.id ?? null });
    return out({ ok: true });
  }
  /* --- v546: ordering --- */
  if (act === "catalog") return out(await gsa(`/catalog?category=${encodeURIComponent(body.category || "peptides")}&limit=200`));
  if (act === "quote") {
    const q = unwrap(await gsa("/quotes", { method: "POST", body: JSON.stringify({ categoryId: body.categoryId || "peptides", compoundNames: body.compoundNames, testIds: body.testIds, turnaround: body.turnaround || "standard", conformitySamples: 0 }) }));
    const qid = q.id || q.quoteId || q.quote?.id;
    let shipping: any = null, shippingError = ""; try { shipping = unwrap(await gsa(`/quotes/${qid}/shipping`)).shipping ?? null; } catch (e) { shippingError = (e as Error).message; }
    return out({ quote: q, quoteId: qid, shipping, shippingError });
  }
  if (act === "order") {
    const items = (body.items || []) as { product_key: string; compound: string; lot: string }[];
    const k = String(body.idempotencyKey || idem("order"));
    const req2: any = { quoteId: body.quoteId, paymentMethod: "stripe_checkout", clientReference: k.slice(0, 120), confirm: true,
      sampleMetadata: items.map(i => ({ compoundName: i.compound, lotNumber: String(i.lot || i.product_key).slice(0, 200) })) };
    if (body.quoteToken) req2.shipping = { quoteToken: body.quoteToken };
    try {
      const r = unwrap(await gsa("/orders", { method: "POST", idemKey: k, body: JSON.stringify(req2) }));
      const o = r.order || r, pay = r.payment || {}, ref = String(o.reference || o.publicReference || o.id || "");
      await db.from("pst_gsa_orders").upsert({ reference: ref, quote_id: body.quoteId, items, tests: body.tests || [], total_cents: (typeof o.amount === "number" ? o.amount : o.amount?.cents ?? o.amount?.total?.cents ?? o.amount?.total) ?? o.totalCents ?? null, payment_url: pay.hostedUrl || null, status: o.status || "placed", created_by: u.id, updated_at: now() }, { onConflict: "reference" });
      return out({ ok: true, reference: ref, paymentUrl: pay.hostedUrl || null, shipping: r.shipping || null, nextAction: r.nextAction || r.shipping?.nextAction || null });
    } catch (e) { const g = e as GsaError; return out({ error: g.message, code: g.code, details: g.details }, g.status || 500); }
  }
  if (act === "order_detail") { const ref = encodeURIComponent(String(body.reference || "")); const [o, eta] = await Promise.all([gsa(`/orders/${ref}`).then(unwrap), gsa(`/orders/${ref}/eta`).then(unwrap).catch(() => null)]); return out({ order: o, eta }); }
  if (act === "label") return out(await gsa(`/orders/${encodeURIComponent(String(body.reference || ""))}/shipment/label`));
  return out({ error: "Unknown action." }, 400);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ ok: true, service: "pst-gsa" });
  const raw = await req.text();
  try {
    if (req.headers.get("x-gsa-signature")) return await webhook(req, raw);
    let body: any = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return out({ error: "bad json" }, 400); }
    return await action(req, body);
  } catch (e) { const g = e as GsaError; console.error("pst-gsa", g.message); return out({ error: g.message || "Something went wrong.", code: g.code || undefined }, g.status && g.status < 600 ? g.status : 500); }
});
