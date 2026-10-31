// Pep Shop Texas · SEO build (v551, v554 share pages). Run: node tools/seo/build.mjs  (GitHub Action runs it nightly too)
// Makes, from the live product list (public read with the site's publishable key):
//   1. one indexable page per product family at the site root, e.g. /bpc-157.html, with real HTML Google can read
//      (title, description, canonical, H1, strengths, prices, stock, lab report, pickup and shipping, research-use text)
//      plus Product/Offer and Breadcrumb data. The shop script loads on top and turns it into the normal product page.
//   2. js/pst-seo-map.js: item # -> page, so links across the shop point at these pages.
//   3. sitemap.xml with the indexable pages, local pages and main pages.
// Products in the "not promoted" list are built (so links work) but marked noindex and left out of the sitemap.
// See marketing/backlog.md, rule 2.
import { writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";

const SITE = "https://www.pepshoptexas.com";
const SB = "https://ucejjztsbmrogiteivxl.supabase.co", KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
const ROOT = new URL("../../", import.meta.url).pathname;
const MARK = "<!-- pst-seo-page -->";
// Not promoted in search (FDA 2026 warning letters / Lilly suits name these, or they're Rx/injection supplies). Pages exist, noindex.
const NOINDEX = /^(pst-2tr|pst-3rt|cagrilintide|cg5\/sm5|survodutide|pst-cg1|tesamorelin|pt-141|ss-31|pst-recon|oxytocin|b12)$/i;
const LOCAL = [["peptides-waco-tx.html", "Waco"], ["peptides-temple-killeen-tx.html", "Temple and Killeen"], ["peptides-austin-tx.html", "Austin"], ["peptides-dallas-fort-worth-tx.html", "Dallas–Fort Worth"]];
const MAIN = ["", "catalog.html", "testing.html", "about.html", "faq.html", "shipping.html", "contact.html", "rewards.html", "bulk-request.html", "terms.html", "privacy.html"];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => `$${Number(n || 0).toFixed(2).replace(/\.00$/, "")}`;
const slugOf = name => String(name || "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/\+/g, "-plus").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
const shortName = name => String(name || "").replace(/\s*\(.*\)\s*/, "").trim();
const strengthNum = s => { const m = String(s || "").match(/[\d.]+/); return m ? Number(m[0]) : 0; };
const unitPrice = p => (p.sale_enabled && Number(p.sale_price) > 0 ? Number(p.sale_price) : Number(p.price || 0));
const inStock = p => Number(p.current_inventory || 0) > 0;
const today = new Date().toISOString().slice(0, 10);

async function rest(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

function head({ title, desc, canonical, robots, ogImage, jsonld }) {
  return `<!doctype html>
<html lang="en">
<head>
${MARK}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${robots ? `<meta name="robots" content="${robots}">\n` : ""}<meta name="color-scheme" content="dark"><meta name="theme-color" content="#0a101c">
<meta property="og:type" content="website"><meta property="og:site_name" content="Pep Shop Texas"><meta property="og:locale" content="en_US"><meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ""}
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="${SB}" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/pst-bl.css?v=542">
<style>.seo{max-width:1100px;margin:0 auto;padding:28px 20px 40px;color:var(--ink,#f3ede1)}.seo h1{font:600 44px/1.1 "Cormorant Garamond",Georgia,serif;margin:6px 0 10px}.seo h2{font:600 26px/1.2 "Cormorant Garamond",Georgia,serif;margin:28px 0 8px}.seo p,.seo li{color:var(--muted,#a59f93);line-height:1.6}.seo .kick{letter-spacing:.2em;text-transform:uppercase;font-size:12px;color:var(--gold,#c9a45c)}.seo table{border-collapse:collapse;width:100%;max-width:560px}.seo td,.seo th{padding:8px 10px;border-bottom:1px solid var(--line,#1f2838);text-align:left}.seo a{color:var(--gold,#c9a45c)}.seo .ruo{margin-top:26px;font-size:13px}</style>
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
<script defer src="js/pst-seo-map.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script defer src="js/pst-core.js?v=551"></script>`;
}

const SHIP = `Free local pickup in Waco (we text you when it's ready). Orders ship the same night once paid, by USPS Priority Mail from Waco: usually 1–3 days across Texas.`;
const RUO = `For laboratory research use only. Not for human or veterinary use. Not a drug, food, cosmetic or supplement. Pep Shop Texas is not a compounding pharmacy and does not give dosing or preparation guidance.`;
const ORG = { "@type": "Organization", "@id": `${SITE}/#org`, name: "Pep Shop Texas", url: `${SITE}/`, logo: `${SITE}/android-chrome-512x512.png`, areaServed: ["Waco, TX", "Central Texas", "Texas", "United States"], address: { "@type": "PostalAddress", addressLocality: "Waco", addressRegion: "TX", addressCountry: "US" }, email: "support@pepshoptexas.com" };

function productPage(group, slug, local) {
  const g = [...group].sort((a, b) => strengthNum(a.strength) - strengthNum(b.strength));
  const p0 = g.find(inStock) || g[0], name = shortName(p0.display_name), full = p0.display_name;
  const strengths = g.map(p => String(p.strength || "").replace(/\s+/g, "")).filter(Boolean);
  const anyStock = g.some(inStock), blend = p0.blend_stack || /multi-peptide/i.test(p0.category || "");
  const coa = g.find(p => p.coa_url && !/pending/i.test(p.coa_url));
  const gsa = (coa?.coa_url || "").match(/GSA-\d{4}-\d{6}/i)?.[0];
  const noindex = NOINDEX.test(String(p0.display_name).trim());
  const canonical = `${SITE}/${slug}.html`;
  const title = `${full} ${blend ? "Research Blend" : "Research Peptide"}${strengths.length ? ` ${strengths.join(" · ")}` : ""} | Pep Shop Texas, Waco TX`;
  const desc = `${full} ${blend ? "research blend" : "research peptide"}${strengths.length ? ` in ${strengths.join(", ")} vials` : ""}${coa ? ", third-party lab tested" : ""}. ${anyStock ? "In stock" : "Restocking soon"}. Free local pickup in Waco, fast shipping across Texas. Research use only.`;
  const img = p0.bottle_url || `${SITE}/img/${slug}-${String(g[0].product_key).toLowerCase()}.jpg`;
  const offers = g.map(p => ({ "@type": "Offer", sku: p.product_key, name: `${full} ${p.strength || ""}`.trim(), price: unitPrice(p).toFixed(2), priceCurrency: "USD", availability: inStock(p) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${canonical}?key=${encodeURIComponent(p.product_key)}`, seller: { "@id": `${SITE}/#org` }, areaServed: "US" }));
  const jsonld = { "@context": "https://schema.org", "@graph": [ORG,
    { "@type": "Product", name: full, sku: p0.product_key, category: blend ? "Research peptide blend" : "Research peptide", image: img, description: `${full} for laboratory research.${coa ? " Third-party certificate of analysis on file." : ""} ${RUO}`, brand: { "@type": "Brand", name: "Pep Shop Texas" }, offers },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: "Collection", item: `${SITE}/catalog.html` }, { "@type": "ListItem", position: 3, name, item: canonical }] }] };
  const rows = g.map(p => `<tr><td>${esc(p.strength || "Standard")}</td><td>${money(unitPrice(p))}</td><td>${inStock(p) ? "In stock" : "Restocking"}</td></tr>`).join("");
  const summary = p0.research_summary ? `<p>${esc(p0.research_summary)}</p>` : "";
  const body = `<div class="seo"><nav class="kick"><a href="./">Home</a> / <a href="catalog.html">Collection</a> / ${esc(name)}</nav>
<h1>${esc(full)}</h1>
<p>${esc(full)} is supplied as a lyophilized (freeze-dried) ${blend ? "multi-peptide research blend" : "research peptide"} in sealed vials${strengths.length ? `: ${esc(strengths.join(", "))}` : ""}. Sold by Pep Shop Texas, a Texas-owned research supply shop in Waco.</p>${summary}
<h2>Strengths and price</h2><table><thead><tr><th>Vial</th><th>Price</th><th>Stock</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Lab report</h2><p>${gsa ? `Verified by Gold Standard Analytics, an independent lab in Houston: certificate ${esc(gsa)}.` : coa ? "A third-party certificate of analysis for the current batch is on file and opens from the product page." : "The certificate of analysis for the current batch is in progress at an independent lab."} <a href="testing.html">How we test</a>.</p>
<h2>Pickup and shipping</h2><p>${esc(SHIP)} See <a href="${local[0][0]}">research peptides in Waco</a>, or shipping to <a href="${local[2][0]}">Austin</a>, <a href="${local[1][0]}">Temple and Killeen</a> and <a href="${local[3][0]}">Dallas–Fort Worth</a>.</p>
<p class="ruo">${esc(RUO)}</p>
<p><a href="catalog.html">Browse the full collection</a></p></div>`;
  const html = `${head({ title, desc, canonical, robots: noindex ? "noindex,follow" : "", ogImage: img, jsonld })}
<script defer src="js/pst-gsa.js?v=543"></script><script defer src="js/pst-shop.js?v=551"></script><script defer src="js/pst-coa-peek.js?v=543"></script>
</head>
<body data-page="product" data-key="${esc(p0.product_key)}">
<main id="main">
<div data-pdp>${body}</div>
</main>
</body>
</html>
`;
  return { html, noindex, keys: g.map(p => p.product_key) };
}

function localPage(file, city, groups, map) {
  const inS = groups.filter(g => g.some(inStock) && !NOINDEX.test(String(g[0].display_name).trim()));
  const list = inS.map(g => `<li><a href="${map[g[0].product_key]}">${esc(g[0].display_name)}</a> · ${esc(g.filter(inStock).map(p => p.strength).join(", "))}</li>`).join("");
  const canonical = `${SITE}/${file}`;
  const W = city === "Waco";
  const intro = {
    "Waco": `Pep Shop Texas is a Waco-owned research peptide shop. Order online and pick up locally for free, usually the same or next day. We text you when your order is ready. Serving Waco, Hewitt, Woodway, Robinson, Lorena, McGregor, China Spring and Bellmead.`,
    "Temple and Killeen": `Researchers in Temple, Belton, Killeen and Harker Heights order from Pep Shop Texas in Waco, about 35 to 60 minutes up I-35. Orders ship the same night by USPS Priority Mail and usually arrive in 1 to 2 days, or pick up free in Waco.`,
    "Austin": `Pep Shop Texas ships research peptides to Austin, Round Rock, Georgetown, Cedar Park and Pflugerville from Waco, about 100 miles up I-35. Orders ship the same night once paid by USPS Priority Mail and usually arrive in 1 to 2 days.`,
    "Dallas–Fort Worth": `Pep Shop Texas ships research peptides to Dallas, Fort Worth, Arlington, Plano and the rest of the Metroplex from Waco, about 95 miles south on I-35. Orders ship the same night once paid by USPS Priority Mail and usually arrive in 1 to 2 days.`,
  }[city];
  const title = `Research Peptides ${W ? "in Waco, TX · Free Local Pickup" : `Shipped to ${city}, TX`} | Pep Shop Texas`;
  const desc = W ? "Waco research peptide shop: lab-tested peptides, free local pickup in Waco, same or next day. Hewitt, Woodway, Robinson and nearby. Research use only." : `Lab-tested research peptides shipped to ${city} from Waco, Texas: same-night shipping, usually 1–2 days. Research use only.`;
  const jsonld = { "@context": "https://schema.org", "@graph": [ORG, { "@type": "WebPage", name: title, url: canonical, about: { "@id": `${SITE}/#org` }, areaServed: city }] };
  const faq = W ? `<h2>Questions</h2><p><b>Where do I pick up?</b> After you order, we text you the pickup details and when it's ready. Pickup is free.</p><p><b>How fast?</b> Usually the same or the next day.</p><p><b>How do I pay?</b> Venmo is fastest; other options show at checkout. Orders are held 24 hours for payment.</p>`
    : `<h2>Questions</h2><p><b>How fast does it get to ${esc(city)}?</b> We ship the same night once your order is paid, by USPS Priority Mail. Most Texas addresses get it in 1 to 2 days.</p><p><b>Can I pick up instead?</b> Yes, pickup in Waco is free. Choose pickup at checkout and we text you when it's ready.</p><p><b>Is everything lab tested?</b> Third-party certificates of analysis are on each product page when they're on file. See <a href="testing.html">how we test</a>.</p>`;
  const html = `${head({ title, desc, canonical, robots: "", ogImage: `${SITE}/android-chrome-512x512.png`, jsonld })}
<script defer src="js/pst-shop.js?v=551"></script>
</head>
<body data-page="local">
<main id="main"><div class="seo"><nav class="kick"><a href="./">Home</a> / ${esc(W ? "Waco" : city)}</nav>
<h1>${esc(W ? "Research peptides in Waco, Texas" : `Research peptides shipped to ${city}`)}</h1>
<p>${esc(intro)}</p>
<h2>In stock now</h2><ul>${list || "<li>Check the <a href=\"catalog.html\">collection</a> for what's in stock.</li>"}</ul>
${faq}
<h2>Also serving</h2><p>${LOCAL.filter(([f]) => f !== file).map(([f, c]) => `<a href="${f}">${esc(c)}</a>`).join(" · ")}</p>
<p class="ruo">${esc(RUO)}</p>
<p><a href="catalog.html">Shop the full collection</a></p></div></main>
</body>
</html>
`;
  return html;
}

const prods = await rest("product_catalog?select=product_key,display_name,strength,category,price,sale_enabled,sale_price,current_inventory,is_active,coming_soon,coa_url,blend_stack,research_summary,bottle_url&is_active=eq.true&order=display_name");
const groups = Object.values(prods.reduce((m, p) => { const k = String(p.display_name || "").trim().toLowerCase(); (m[k] ||= []).push(p); return m; }, {}));
const RESERVED = new Set(readdirSync(ROOT).filter(f => f.endsWith(".html") && !readFileSync(ROOT + f, "utf8").includes(MARK)));
const map = {}, built = [], indexable = [];
// v552: every page address a product has had (tools/seo/slugs.json). If Jimmie renames a product, the old address
// keeps working: it forwards to the new page (noindex, canonical to the new page), so links and ranking aren't lost.
const HIST = ROOT + "tools/seo/slugs.json", hist = existsSync(HIST) ? JSON.parse(readFileSync(HIST, "utf8")) : {};
for (const g of groups) {
  let slug = slugOf(g[0].display_name); if (RESERVED.has(`${slug}.html`)) slug = `${slug}-research-peptide`;
  const { html, noindex, keys } = productPage(g, slug, LOCAL);
  writeFileSync(ROOT + `${slug}.html`, html); built.push(`${slug}.html`); if (!noindex) indexable.push(`${slug}.html`);
  keys.forEach(k => { map[k] = `${slug}.html`; (hist[k] ||= []).includes(slug) || hist[k].push(slug); });
}
const forward = (from, to) => `<!doctype html>\n<html lang="en"><head>${MARK}<meta charset="utf-8"><title>Moved | Pep Shop Texas</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="${SITE}/${to}"><meta http-equiv="refresh" content="0; url=${to}"><script>location.replace(${JSON.stringify(to)} + location.search + location.hash)</script></head><body><p>This product moved: <a href="${to}">${to}</a></p></body></html>\n`;
for (const [k, slugs] of Object.entries(hist)) { const cur = map[k]; if (!cur) continue;
  for (const old of slugs) { const f = `${old}.html`; if (f === cur || built.includes(f) || RESERVED.has(f)) continue; writeFileSync(ROOT + f, forward(f, cur)); built.push(f); } }
writeFileSync(HIST, JSON.stringify(hist, null, 1) + "\n");
// v554: the older share pages (e.g. /bpc-157-pstp100063.html, they carry the picture for texts and social posts) forward to the
// product's own page now, not product.html, and name it as their canonical. Their picture and preview text are left as they are.
let shares = 0;
for (const f of readdirSync(ROOT)) { const m = f.match(/-(pstp\d+)\.html$/i); if (!m) continue;
  const k = m[1].toUpperCase(), to = map[k], src = readFileSync(ROOT + f, "utf8"); if (!to || src.includes(MARK)) continue;
  const out = src.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}/${to}">`)
    .replace(new RegExp(`(?:product|[a-z0-9-]+)\\.html\\?key=${k}`, "gi"), `${to}?key=${k}`);
  if (out !== src) { writeFileSync(ROOT + f, out); shares++; } }
for (const [file, city] of LOCAL) { writeFileSync(ROOT + file, localPage(file, city, groups, map)); built.push(file); }
// remove pages this build made before for products that are gone
for (const f of readdirSync(ROOT)) if (f.endsWith(".html") && !built.includes(f) && readFileSync(ROOT + f, "utf8").includes(MARK)) unlinkSync(ROOT + f);
writeFileSync(ROOT + "js/pst-seo-map.js", `/* generated by tools/seo/build.mjs on ${today}: item # -> product page */\nwindow.PST_SEO = ${JSON.stringify(map)};\n`);
const urls = [...MAIN.map(u => `${SITE}/${u}`), ...LOCAL.map(([f]) => `${SITE}/${f}`), ...indexable.map(f => `${SITE}/${f}`)];
writeFileSync(ROOT + "sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
console.log(`share pages forwarded: ${shares}; built ${built.length} pages (${indexable.length} product pages indexable), ${urls.length} sitemap URLs`);
