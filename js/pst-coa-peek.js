/* Pep Shop Texas · COA peek (v1.0, shared with Patriot)
   A "Lab report" badge sits on the product's vial ([data-coapeek="<url>"]).
   Computer (mouse): hovering the badge opens a large preview of that product's COA next to it; it stays open while the
   pointer is on the badge or the preview and closes when the pointer leaves. Clicking still opens the full report.
   Phone / tablet (touch): tapping opens the report full screen with a Close button; the phone's Back button closes it too.
   Works for PDFs (shown in the browser's PDF viewer) and image COAs. */
(() => {
  const isPdf = u => /\.pdf(\?|#|$)/i.test(u);
  const canHover = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  let pop = null, popUrl = "", hideT = 0, sheet = null;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // PDFs are drawn with pdf.js (same look on Chrome, Safari, iPhone and Android, every page, no browser toolbar)
  const PDFJS = "js/vendor/pdfjs-3.11.174/"; // hosted with the site (Mozilla pdf.js, Apache-2.0)
  let libP = null;
  const lib = () => libP ||= new Promise((ok, no) => { if (window.pdfjsLib) return ok(window.pdfjsLib); const sc = document.createElement("script"); sc.src = PDFJS + "pdf.min.js"; sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(window.pdfjsLib); }; sc.onerror = no; document.head.appendChild(sc); });
  const docs = {};
  async function draw(box, u) {
    try {
      const L = await lib(), doc = await (docs[u] ||= L.getDocument(new URL(u, location.href).href).promise);
      const w = box.clientWidth - 16, dpr = Math.min(2.5, devicePixelRatio || 1); box.innerHTML = "";
      for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
        const pg = await doc.getPage(i), v0 = pg.getViewport({ scale: 1 }), sc = w / v0.width, v = pg.getViewport({ scale: sc * dpr });
        const c = document.createElement("canvas"); c.width = v.width; c.height = v.height; c.style.width = w + "px"; c.style.height = v.height / dpr + "px"; c.setAttribute("aria-label", `Page ${i} of the lab report`);
        box.appendChild(c); await pg.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
      }
    } catch (e) { box.innerHTML = `<p class="coaerr">Couldn't show the preview here. <a href="${esc(u)}" target="_blank" rel="noopener">Open the full report</a>.</p>`; }
  }
  const view = (u, title) => isPdf(u)
    ? `<div class="coapages" data-pdf="${esc(u)}"><p class="coaload">Loading lab report…</p></div>`
    : `<img src="${esc(u)}" alt="${esc(title)}">`;
  const fill = root => { const b = root.querySelector("[data-pdf]"); if (b && !b.dataset.done) { b.dataset.done = "1"; requestAnimationFrame(() => draw(b, b.dataset.pdf)); } };

  /* ---------- computer: hover preview ---------- */
  function place(btn) {
    const r = btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const w = Math.min(760, Math.max(420, vw * .46)), h = Math.min(vh - 32, 1000);
    let left = r.right + 14; if (left + w > vw - 12) left = Math.max(12, r.left - w - 14); if (left < 12) left = 12;
    const top = Math.max(16, Math.min(vh - h - 16, r.top + r.height / 2 - h / 2));
    Object.assign(pop.style, { left: left + "px", top: top + "px", width: w + "px", height: h + "px" });
  }
  function show(btn) {
    clearTimeout(hideT);
    const u = btn.dataset.coapeek, title = btn.dataset.coatitle || "Lab report";
    if (!pop) { pop = document.createElement("div"); pop.className = "coapop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Lab report preview");
      pop.addEventListener("mouseenter", () => clearTimeout(hideT)); pop.addEventListener("mouseleave", hideSoon); document.body.appendChild(pop); }
    if (popUrl !== u) { popUrl = u; pop.innerHTML = `<header><b>${esc(title)}</b><a href="${esc(u)}" target="_blank" rel="noopener">Open full report ↗</a></header><div class="coaview">${view(u, title)}</div>`; }
    place(btn); pop.classList.add("on"); fill(pop);
  }
  function hideSoon() { clearTimeout(hideT); hideT = setTimeout(() => pop?.classList.remove("on"), 220); }
  document.addEventListener("mouseover", e => { const b = e.target.closest?.("[data-coapeek]"); if (b && canHover()) show(b); });
  // warm up pdf.js as soon as a page with a COA badge loads, so the first hover is instant
  const warm = () => { if (document.querySelector("[data-coapeek]")) lib().catch(() => {}); };
  new MutationObserver(() => { if (document.querySelector("[data-coapeek]")) { warm(); } }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("mouseout", e => { const b = e.target.closest?.("[data-coapeek]"); if (b && !b.contains(e.relatedTarget) && canHover()) hideSoon(); });
  document.addEventListener("focusin", e => { const b = e.target.closest?.("[data-coapeek]"); if (b && canHover()) show(b); });
  document.addEventListener("focusout", e => { if (e.target.closest?.("[data-coapeek]")) hideSoon(); });
  addEventListener("scroll", () => pop?.classList.remove("on"), { passive: true });
  addEventListener("resize", () => pop?.classList.remove("on"));

  /* ---------- phone: full-screen sheet, Back closes it ---------- */
  function openSheet(u, title) {
    closeSheet(true);
    sheet = document.createElement("div"); sheet.className = "coasheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", title);
    sheet.innerHTML = `<header><b>${esc(title)}</b><a href="${esc(u)}" target="_blank" rel="noopener">Open</a><button type="button" data-coaclose aria-label="Close lab report">Close</button></header><div class="coaview">${view(u, title)}</div>`;
    document.body.appendChild(sheet); document.documentElement.classList.add("coalock"); fill(sheet);
    history.pushState({ coapeek: 1 }, ""); sheet.querySelector("[data-coaclose]").focus();
  }
  function closeSheet(silent) {
    if (!sheet) return; sheet.remove(); sheet = null; document.documentElement.classList.remove("coalock");
    if (!silent && history.state?.coapeek) history.back();
  }
  addEventListener("popstate", () => { if (sheet) { sheet.remove(); sheet = null; document.documentElement.classList.remove("coalock"); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (sheet) closeSheet(); else pop?.classList.remove("on"); } });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-coaclose]")) { e.preventDefault(); closeSheet(); return; }
    const b = e.target.closest("[data-coapeek]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (canHover()) window.open(b.dataset.coapeek, "_blank", "noopener"); // computer: click = full report in a new tab
    else openSheet(b.dataset.coapeek, b.dataset.coatitle || "Lab report");
  }, true);
})();
