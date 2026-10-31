/* Pep Shop Texas · owner app stage 3 (v5.0), part 1: email blast (= customers.html + email-blast.js),
   catalog ads (= catalog-ads.html), and What's new. Same tables, buckets and edge function as his pages. */
(function () {
  "use strict";
  const P = window.PST, { $$, esc, money } = P;
  const sheet = (html, label) => { const w = P.sheet(html, { label }); w.classList.add("full"); return w; };
  const pick = (o, ks) => { for (const k of ks) if (o && o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== "") return o[k]; return ""; };
  const normEmail = v => String(v || "").trim().toLowerCase();
  const yes = v => v === true || ["true", "yes"].includes(String(v).toLowerCase());
  function subscription(p) { // = deriveSubscription
    if (yes(pick(p, ["marketing_opt_out", "email_opt_out", "newsletter_opt_out", "unsubscribe", "unsubscribed", "opted_out"]))) return "opted_out";
    if (yes(pick(p, ["marketing_opt_in", "email_opt_in", "newsletter_opt_in", "subscribed", "email_subscribed", "subscribe"]))) return "subscribed";
    return "unknown";
  }
  const daysSince = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null;

  /* ================= EMAIL BLAST ================= */
  let people = [];
  async function loadPeople() { // = loadCustomers + buildCustomerRows (only what the blast needs)
    const [pr, mc, od] = await Promise.all([P.client().from("customer_profiles").select("*"), P.client().from("manual_customers").select("*"), P.client().from("orders").select("*")]);
    if (pr.error) throw pr.error; if (mc.error) throw mc.error; if (od.error) throw od.error;
    const byEmail = new Map(), byId = new Map();
    (od.data || []).forEach(o => { const e = normEmail(pick(o, ["customer_email", "email", "billing_email"])), u = String(pick(o, ["user_id", "customer_id", "profile_id"])), t = Number(pick(o, ["total_amount", "grand_total", "order_total", "total", "amount"]) || 0), d = pick(o, ["created_at", "order_date", "placed_at", "updated_at"]), s = String(pick(o, ["status", "order_status"]) || "").toLowerCase();
      const add = (m, k) => { if (!k) return; const x = m.get(k) || { count: 0, spent: 0, last: null }; x.count++; if (!["cancelled", "canceled", "refunded", "void"].includes(s)) x.spent += t; if (d && (!x.last || new Date(d) > new Date(x.last))) x.last = d; m.set(k, x); };
      add(byEmail, e); add(byId, u); });
    const reg = new Set((pr.data || []).map(p => normEmail(p.email)).filter(Boolean));
    people = [...(pr.data || []), ...(mc.data || []).filter(p => !p.email || !reg.has(normEmail(p.email))).map(p => ({ ...p, _manual: true }))].map(p => {
      const email = normEmail(pick(p, ["email", "customer_email"])), uid = String(pick(p, ["user_id", "id", "customer_id", "profile_id"])), s = byEmail.get(email) || byId.get(uid) || { count: 0, spent: 0, last: null };
      const name = pick(p, ["full_name", "name"]) || [pick(p, ["first_name", "firstname", "given_name"]), pick(p, ["last_name", "lastname", "family_name"])].filter(Boolean).join(" ") || "Customer", sub = subscription(p);
      return { email, name, sub, eligible: sub === "subscribed" && !!email, count: s.count, spent: s.spent, last: s.last };
    });
  }
  const SEG = [["all", "Everyone subscribed", () => true], ["repeat", "Repeat", c => c.count >= 2], ["vip", "VIP", c => c.count >= 5 || c.spent >= 500], ["first", "First-time", c => c.count === 1],
    ["none", "No orders yet", c => c.count === 0], ["in60", "Quiet 60+ days", c => { const d = daysSince(c.last); return d !== null && d >= 60; }], ["in90", "Quiet 90+ days", c => { const d = daysSince(c.last); return d !== null && d >= 90; }]];
  async function callBlast(body) {
    const { data: { session } } = await P.client().auth.getSession(); if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
    const r = await fetch(`${P.CFG.url}/functions/v1/send-email-blast`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) throw new Error(j.error || `Email service returned ${r.status}.`); return j;
  }
  async function blastPane(el) {
    el.innerHTML = `<p class="muted small">Loading customers…</p>`;
    try { await loadPeople(); } catch (e) { el.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; return; }
    const elig = people.filter(c => c.eligible), uniq = [...new Map(elig.map(c => [c.email, c])).values()].sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
    const out = people.filter(c => c.sub === "opted_out").length, unk = people.filter(c => c.sub === "unknown").length;
    let seg = "all", imageUrl = "";
    el.innerHTML = `<div class="tiles otiles"><div class="tile"><small>Subscribed</small><b>${uniq.length}</b></div><div class="tile"><small>Opted out</small><b>${out}</b></div><div class="tile"><small>Never said</small><b>${unk}</b></div></div>
<p class="muted small">Only people who said yes to emails can be picked. Their name, your branding, the research note and an unsubscribe link are added for you.</p>
<form class="osheet bform" data-bf><label>Subject<input name="subject" maxlength="140" placeholder="What they see in their inbox"></label>
<div class="pm2"><label>Small heading<input name="category" maxlength="80" value="Pep Shop Texas Update"></label><label>Headline<input name="headline" maxlength="140" placeholder="Main headline"></label></div>
<label>Message<textarea name="message" rows="5" maxlength="3000" placeholder="Write the main message"></textarea></label>
<details class="omore"><summary>Feature box, button, picture (optional)</summary>
<div class="pm2"><label>Feature label<input name="feature_label" maxlength="80"></label><label>Feature title<input name="feature_title" maxlength="160"></label></div>
<label>Feature details<textarea name="feature_body" rows="3" maxlength="3000"></textarea></label>
<div class="pm2"><label>Button text<input name="button_text" maxlength="60" placeholder="Shop now"></label><label>Button link<input name="button_url" type="url" maxlength="500" placeholder="https://www.pepshoptexas.com/catalog.html"></label></div>
<label>Picture (up to 5 MB)<input name="img" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><p class="muted small" data-bimg></p>
<label>Closing note<textarea name="final_note" rows="2" maxlength="1200"></textarea></label></details>
<p class="kick" style="margin:10px 0 4px">Send to</p><div class="chips" data-bseg>${SEG.map(([k, l]) => `<button type="button" class="chip${k === "all" ? " on" : ""}" data-sg="${k}">${l}</button>`).join("")}</div>
<input class="psearch" type="search" data-bq placeholder="Search name or email" aria-label="Search recipients"><div class="austools"><span class="muted small" data-bn></span><button type="button" class="linkish" data-bsv>Select shown</button><button type="button" class="linkish" data-bcv>Clear shown</button></div>
<div class="aulist" data-bl></div>
<div class="obar"><button class="btn ghost wide" type="button" data-bpv>Preview</button><button class="btn primary wide" type="button" data-bsend>Send</button></div><p class="status" data-bs role="status"></p>
<iframe class="eframe" data-bfr title="Email preview" hidden></iframe></form>`;
    const f = el.querySelector("[data-bf]"), st = f.querySelector("[data-bs]"), list = f.querySelector("[data-bl]");
    list.innerHTML = uniq.map(c => `<label class="aurow" data-bk="${esc(`${c.name} ${c.email}`.toLowerCase())}" data-bsg="${SEG.filter(s => s[2](c)).map(s => s[0]).join(" ")}"><input type="checkbox" value="${esc(c.email)}" checked><span><b>${esc(c.name)}</b><small>${esc(c.email)} · ${c.count} order${c.count === 1 ? "" : "s"}${c.last ? ` · last ${P.fmtDate(c.last)}` : ""}</small></span></label>`).join("") || `<p class="muted small" style="padding:10px">No subscribed customers yet.</p>`;
    const inSeg = r => r.dataset.bsg.split(" ").includes(seg), chosen = () => $$(".aurow", list).filter(r => inSeg(r) && r.querySelector("input").checked).map(r => r.querySelector("input").value);
    const count = () => { const all = $$(".aurow", list).filter(inSeg).length, n = chosen().length; f.querySelector("[data-bn]").textContent = `${n} of ${all} will get it`; f.querySelector("[data-bsend]").textContent = n ? `Send to ${n}` : "Send"; return n; };
    const filter = () => { const q = f.querySelector("[data-bq]").value.trim().toLowerCase(); $$(".aurow", list).forEach(r => r.hidden = !inSeg(r) || (!!q && !r.dataset.bk.includes(q))); };
    const body = prev => { const g = n => String(f[n].value || "").trim(); return { preview_only: prev, recipients: chosen(), subject: g("subject"), category: g("category"), headline: g("headline"), message: g("message"), feature_label: g("feature_label"), feature_title: g("feature_title"), feature_body: g("feature_body"), button_text: g("button_text"), button_url: g("button_url"), final_note: g("final_note"), image_url: imageUrl }; };
    const check = (d, need) => { if (!d.subject) return "Add a subject."; if (!d.headline) return "Add a headline."; if (!d.message) return "Write the message."; if (need && !d.recipients.length) return "Pick at least one person."; if (!!d.button_text !== !!d.button_url) return "Fill in both the button text and link, or leave both blank."; return ""; };
    const preview = async () => { const d = body(true), m = check(d, false); if (m) { st.textContent = m; return false; } st.textContent = "Building preview…";
      try { const r = await callBlast(d); const fr = f.querySelector("[data-bfr]"); fr.hidden = false; fr.srcdoc = r.preview?.html || ""; st.textContent = "Preview below. This is what each person gets, with their own name."; return true; } catch (e) { st.textContent = e.message; return false; } };
    count();
    f.addEventListener("input", e => { if (e.target.matches("[data-bq]")) { filter(); count(); } });
    f.addEventListener("change", async e => {
      if (e.target.closest("[data-bl]")) { count(); return; }
      if (e.target.name === "img") { const file = e.target.files?.[0], info = f.querySelector("[data-bimg]"); if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 5242880) { e.target.value = ""; info.textContent = "Pick a PNG, JPEG, WebP or GIF under 5 MB."; return; }
        info.textContent = "Uploading…";
        try { const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
          const r = await callBlast({ action: "upload_image", image_type: file.type, image_base64: b64 }); if (!r.image_url) throw new Error("Upload didn't return a picture link."); imageUrl = r.image_url; info.innerHTML = `Added: ${esc(file.name)} · <button type="button" class="linkish" data-bix>Remove</button>`; }
        catch (err) { e.target.value = ""; info.textContent = err.message; } }
    });
    f.addEventListener("click", async e => {
      const sg = e.target.closest("[data-sg]"); if (sg) { seg = sg.dataset.sg; $$("[data-sg]", f).forEach(b => b.classList.toggle("on", b === sg)); filter(); count(); return; }
      if (e.target.closest("[data-bsv]")) { $$(".aurow:not([hidden]) input", list).forEach(i => i.checked = true); count(); return; }
      if (e.target.closest("[data-bcv]")) { $$(".aurow:not([hidden]) input", list).forEach(i => i.checked = false); count(); return; }
      if (e.target.closest("[data-bix]")) { imageUrl = ""; f.img.value = ""; f.querySelector("[data-bimg]").textContent = ""; return; }
      if (e.target.closest("[data-bpv]")) { preview(); return; }
      if (e.target.closest("[data-bsend]")) {
        const d = body(false), m = check(d, true); if (m) { st.textContent = m; return; }
        if (!(await preview())) return;
        const ok = await window.PSTOps.confirmSheet(`Send to ${d.recipients.length} ${d.recipients.length === 1 ? "person" : "people"}?`, `<b>${esc(d.subject)}</b><br><br>This can't be unsent. Anyone who unsubscribed since this list loaded is skipped automatically.`, `Send to ${d.recipients.length}`);
        if (!ok) { P.toast("Not sent"); return; }
        P.toast("Sending…");
        try { const r = await callBlast(d); const x = Number(r.excluded_count || 0); P.toast(`Sent to ${r.sent_count}${x ? ` · ${x} skipped (unsubscribed)` : ""}`); blastPane(el); }
        catch (err) { P.toast(err.message); }
      }
    });
  }

  /* ================= CATALOG ADS (= catalog-ads.html) ================= */
  const BUCKET = "catalog-carousel";
  async function adsPane(el) {
    el.innerHTML = `<p class="muted small">Loading…</p>`;
    const { data, error } = await P.client().from("catalog_carousel_ads").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    if (error) { el.innerHTML = `<p class="notice err">${esc(error.message)}</p>`; return; }
    const ads = data || [], url = a => P.client().storage.from(BUCKET).getPublicUrl(a.image_path).data.publicUrl;
    el.innerHTML = `<p class="muted small">The picture carousel on the shop. ${ads.filter(a => a.is_active).length} showing. They rotate in the order below.</p>
<form class="adup" data-adf><label class="btn primary wide adpick">+ Add a picture<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label><input name="title" maxlength="120" placeholder="Title (optional)" aria-label="Ad title"><p class="status" data-ads role="status"></p></form>
<div class="adlist">${ads.map((a, i) => `<article class="adcard${a.is_active ? "" : " off"}"><img src="${esc(url(a))}" alt="${esc(a.title || "Ad")}" loading="lazy"><div class="adrow"><b>${esc(a.title || "Untitled")}</b>
<span class="adctl"><button type="button" class="ibtn" data-adup="${a.id}" aria-label="Move up"${i ? "" : " disabled"}>↑</button><button type="button" class="ibtn" data-addn="${a.id}" aria-label="Move down"${i < ads.length - 1 ? "" : " disabled"}>↓</button>
<label class="toggle"><input type="checkbox" data-adon="${a.id}"${a.is_active ? " checked" : ""}> Showing</label><button type="button" class="linkish" data-adx="${a.id}">Remove</button></span></div></article>`).join("") || `<p class="muted small">No pictures yet.</p>`}</div>`;
    const st = el.querySelector("[data-ads]"), f = el.querySelector("[data-adf]");
    f.file.addEventListener("change", async () => { const file = f.file.files[0]; if (!file) return; // = uploadForm submit
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 10485760) { st.textContent = "Pick a JPG, PNG, WebP or GIF under 10 MB."; f.file.value = ""; return; }
      st.textContent = "Uploading…"; const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type], path = crypto.randomUUID() + "." + ext;
      const up = await P.client().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false }); if (up.error) { st.textContent = up.error.message; return; }
      const { error: e2 } = await P.client().from("catalog_carousel_ads").insert({ image_path: path, title: f.title.value.trim() || file.name, sort_order: ads.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 1, is_active: true });
      if (e2) { await P.client().storage.from(BUCKET).remove([path]); st.textContent = e2.message; return; }
      P.toast("Picture added and showing"); adsPane(el); });
    el.onclick = async e => {
      const mv = e.target.closest("[data-adup],[data-addn]"); if (mv) { // swap sort_order with the neighbor (his page: type a number)
        const id = mv.dataset.adup || mv.dataset.addn, i = ads.findIndex(a => a.id === id), j = mv.dataset.adup ? i - 1 : i + 1, A = ads[i], B = ads[j]; if (!B) return;
        const ordered = ads.map(a => a.id); [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        const res = await Promise.all(ordered.map((aid, k) => ads.find(a => a.id === aid).sort_order === k + 1 ? { error: null } : P.client().from("catalog_carousel_ads").update({ sort_order: k + 1 }).eq("id", aid)));
        const bad = res.find(r => r.error); if (bad) { P.toast(bad.error.message); } adsPane(el); void A; return; }
      const x = e.target.closest("[data-adx]"); if (x) { const a = ads.find(v => v.id === x.dataset.adx);
        if (!(await window.PSTOps.confirmSheet("Remove this picture?", "It comes off the shop and the file is deleted.", "Remove", true))) return;
        const { error } = await P.client().from("catalog_carousel_ads").delete().eq("id", a.id); if (error) { P.toast(error.message); return; }
        const { error: fe } = await P.client().storage.from(BUCKET).remove([a.image_path]); P.toast(fe ? "Removed from the shop; the file itself couldn't be deleted" : "Picture removed"); adsPane(el); }
    };
    el.onchange = async e => { const t = e.target.closest("[data-adon]"); if (!t) return;
      const { error } = await P.client().from("catalog_carousel_ads").update({ is_active: t.checked }).eq("id", t.dataset.adon); P.toast(error ? error.message : t.checked ? "Showing" : "Hidden"); if (error) t.checked = !t.checked; adsPane(el); };
  }

  /* ================= WHAT'S NEW ================= */
  const L = (t, h) => ({ t, h });
  const RELEASES = [
    { v: "5.20", d: "Oct 31, 2026", title: "Gold Standard lab in the app", items: [L("More → Gold Standard lab: tap Connect once. New certificates then show up by themselves", "#gsa"), L("When the lot has the item # (like PSTP100063), the certificate goes on that product by itself and you get a notification", "#gsa"), L("No item #? It waits under Needs you: pick the product, or Not ours", "#gsa"), L("Order a test: pick products and tests, see the price with the shipping label, pay by card. The item # goes on each sample's lot for you", "#gsa"), L("Track an order and print its shipping label from Test orders", "#gsa")] },
    { v: "5.19", d: "Oct 31, 2026", title: "Pick the vial picture (report #15)", items: [L("Edit a product → Vial picture: clear glass 3ml, 5ml or 10ml, or amber 10ml", "#products"), L("Fill: powder or liquid, in white, blue, orange or red. The preview changes as you pick", "#products"), L("Left on Auto, a product keeps the picture it has today", "#products")] },
    { v: "5.18", d: "Oct 30, 2026", title: "Gold Standard lab reports", items: [L("Paste a Gold Standard number (GSA-2026-…) in a product's Lab report link. The app checks it with the lab as you type", "#products"), L("Shoppers see a Verified by Gold Standard box with every test result, read live from the lab", ""), L("A withdrawn or failed certificate turns back into COA pending by itself", "")] },
    { v: "5.17", d: "Oct 29, 2026", title: "Restock requests go by item #", items: [L("Each restock request shows its item #, and today's product name. If you renamed it since, you also see what the customer asked for", "#requests")] },
    { v: "5.16", d: "Oct 29, 2026", title: "Restock emails on record", items: [L("Restock requests show when the confirmation and back-in-stock emails went out", "#requests"), L("Tap View to see the email, then Print or save as PDF if a customer calls", "#requests")] },
    { v: "5.15", d: "Oct 29, 2026", title: "Vendor price lists: replace, clear, PDF", items: [L("Uploading a newer list replaces the vendor's old one, so nothing doubles up (or pick Only add and update)", "#vprices"), L("Clear a vendor's whole list, or Remove one item", "#vprices"), L("Upload the vendor's PDF price list, not just Excel or CSV", "#vprices"), L("The file you upload is kept with that vendor (one per vendor): View it any time", "#vprices")] },
    { v: "5.14", d: "Oct 28, 2026", title: "Purchase orders look official", items: [L("Every printed or saved PO shows your logo, name, address, phone and email, and leaves cancelled lines off (report #12)", "#stock"), L("Notifications: the Settings link no longer sits under the close X", "")] },
    { v: "5.13", d: "Oct 27, 2026", title: "Compare suppliers, arrange More", items: [L("Every product with each supplier's 10-vial kit price side by side, the cheapest one marked, and your margin", "#compare"), L("Tick products, pick a supplier, set kits, and tap PO to open a purchase order already filled in, one per supplier", "#compare"), L("Also under Stock: Compare prices", "#stock"), L("Arrange More your way: drag the handle on any card to move it. Your order follows you to the computer", "#more")] },
    { v: "5.12", d: "Oct 27, 2026", title: "Fixes from your reports", items: [L("Print or save a purchase order as a PDF (report #9)", "#stock"), L("Live deals now show on the home page and every product page (report #8)", ""), L("Fresh share images with current product names (report #7)", "")] },
    { v: "5.11", d: "Oct 26, 2026", title: "Menu bar stays put", items: [L("The bottom menu bar stays on the bottom of the screen when you scroll after typing (report #6)", ""), L("While you type, the menu bar steps out of the way and comes back when the keyboard closes", "")] },
    { v: "5.10", d: "Oct 26, 2026", title: "Fixes from your reports", items: [L("Windows close properly on iPhone: the X is no longer hidden under the clock (report #5)", ""), L("Products list A to Z, smallest dose first (report #3)", "#products"), L("Purchase orders: \"Match to a product\" links a line to one of your products so you can receive it (report #2)", "#stock"), L("Report writer: Save as PDF, to print, save or send (report #4)", "#writer")] },
    { v: "5.9", d: "Oct 26, 2026", title: "Promos in emails + text blasts", items: [L("Promos in emails: partner and sale boxes at the bottom of your order emails. PepKeep is on to start", "#emailpromos"), L("Text blast: promo texts to customers who said yes, with Send a test to myself first", "#texts"), L("Customers can say yes to texts at checkout and in their account (never required to buy)", "#texts") ] },
    { v: "5.8", d: "Oct 26, 2026", title: "Insights, marketing style", items: [L("Insights is now a real marketing dashboard: visitors, sessions, bounce rate, time on site, each with ▲▼ vs the period before", "#insights"), L("Where visitors come from: Google, Facebook, direct, email, PepKeep, plus campaigns and landing pages", "#insights"), L("Conversion rate, sales per visitor, the shopping funnel with numbers, busiest hours", "#insights"), L("Report a problem: the Talk buttons are gone. Use the 🎤 on your keyboard instead", "#help")] },
    { v: "5.7", d: "Oct 26, 2026", title: "How fixes reach you now", items: [L("Report a problem (More → Report a problem): talk or type, add screenshots", "#help"), L("When a fix is ready, a \"Fix ready to check\" card shows on Today with a preview link", "#today"), L("Try it in the preview, then tap Looks good (or Something's off)", "#updates"), L("Mike publishes it, your app updates itself, and your report shows Fixed", "#help")] },
    { v: "5.6", d: "Oct 26, 2026", title: "Report a problem, by voice", items: [L("Talk instead of type: tap Talk, or the mic on your keyboard", "#help"), L("Each report shows its progress: Sent → Looking → Fix being checked → Fixed", "#help"), L("A heads-up when one of your reports gets an answer, and you confirm it's fixed", "#help")] },
    { v: "5.5", d: "Oct 26, 2026", title: "Report a problem", items: [L("More → Report a problem (or the link at the bottom of Today): say what happened, add screenshots, send", "#help"), L("Your phone and app details go with it, and replies show up right there", "#help")] },
    { v: "5.4", d: "Oct 26, 2026", title: "Alerts while the app is open", items: [L("New-order and other alerts now pop up inside the app when it's open, not just on the lock screen", "#more")] },
    { v: "5.3", d: "Oct 26, 2026", title: "Update notices", items: [L("A heads-up like this one whenever your app updates", "#whatsnew"), L("If you're in the middle of something, an Update button waits for you instead", "#today")] },
    { v: "5.2", d: "Oct 26, 2026", title: "Faster purchase orders, smoother scrolling", items: [L("Pick a vendor and their whole price list shows up, tap to add", "#stock"), L("Search finds your products by the vendor's name too (tirz, TR10…)", "#stock"), L("Pop-up screens no longer let the page slide around underneath", "#customers"), L("Bottom bar stays put after typing", "#today"), L("A few words of encouragement on Today", "#today")] },
    { v: "5.1", d: "Oct 26, 2026", title: "Protocols, emails, light mode", items: [L("Green dot on products that have a protocol", "#products"), L("Protocols now set when running-low reminders go out", "#protos"), L("Emails & reminders: everything your shop sends, with previews", "#emails"), L("Purchase orders show up as expenses on their own", "#reports"), L("Light or dark look (bottom of More)", "#more"), L("Fixed: white boxes on iPhone when adding to a purchase order", "#stock")] },
    { v: "5.0", d: "Oct 26, 2026", title: "Reports, email blasts, products and more", items: [L("Reports: sales, profit, products, customers", "#reports"), L("Report writer: build your own lists and save them", "#writer"), L("Email blast: write, preview and send to subscribers", "#blast"), L("Shop pictures (the carousel)", "#ads"), L("Vendor price lists: upload, match, order", "#vprices"), L("Payment methods and their discounts", "#paymethods"), L("Full product details: cost, profit, notes, lab report link", "#products"), L("This What's new page", "#whatsnew")] },
    { v: "4.9", d: "Oct 25, 2026", title: "Purchase orders and promotions", items: [L("New purchase orders with vendor prices filled in", "#stock"), L("Receive some or all of a shipment, add tracking, edit", "#stock"), L("Reorder: what's selling and running out", "#reorder"), L("Vendors", "#vendors"), L("Discount codes", "#discounts"), L("Promotions", "#promos")] },
    { v: "4.8", d: "Oct 25, 2026", title: "Every order tool on your phone", items: [L("Edit items, reduce, add a free item, refund", "#orders"), L("Email tools with preview", "#orders"), L("Find anything from the search button", "#today"), L("Restock and bulk requests", "#requests"), L("Lab reports with QR links", "#coa")] },
    { v: "4.7", d: "Oct 25, 2026", title: "Updates itself", items: [L("Your app and your customers' apps update on their own", ""), L("Live visitor count on Insights", "#insights")] }
  ];
  const NEXT = ["Fixes reach you in a couple of taps: report → check the preview → published", "Running-low reminders by email, not just phone alerts", "An email address for invoices that turns them into expenses", "Then the old computer admin pages come out of the menus (kept as a backup)"];
  const SEEN = "pst-owner-seen";
  const unseen = () => { try { return localStorage.getItem(SEEN) !== RELEASES[0].v; } catch { return false; } };
  function whatsNew(el) {
    try { localStorage.setItem(SEEN, RELEASES[0].v); } catch { /* private mode */ }
    el.innerHTML = `${RELEASES.map((r, i) => `<article class="wncard${i ? "" : " now"}"><div class="wnhd"><span class="opill ${i ? "pend" : "ok"}">v${r.v}</span><small class="muted">${r.d}</small></div><h2 class="serif">${esc(r.title)}</h2>
<ul class="wnlist">${r.items.map(x => `<li>${x.h ? `<a href="owner.html${x.h}">${esc(x.t)}</a>` : esc(x.t)}</li>`).join("")}</ul></article>`).join("")}
<article class="wncard"><h2 class="serif">Coming next</h2><ul class="wnlist">${NEXT.map(t => `<li>${esc(t)}</li>`).join("")}</ul></article>`;
  }

  window.PSTOps4 = { blastPane, adsPane, whatsNew, unseen, RELEASES, money };
})();
