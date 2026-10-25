/* Pep Shop Texas · Get the app (install.html). Picks the right steps for the device; one-tap install where the browser allows it. */
(function () {
  "use strict";
  const P = window.PST, { $, $$, esc } = P;
  const ua = navigator.userAgent;
  const ios = P.isIOS(), android = /android/i.test(ua);
  const iosOther = ios && /crios|fxios|edgios|opios/i.test(ua);           // Chrome/Firefox/Edge on iPhone
  const samsung = /samsungbrowser/i.test(ua);
  const macSafari = !ios && /macintosh/i.test(ua) && /safari/i.test(ua) && !/chrome|chromium|edg\//i.test(ua);
  const firefoxDesk = !ios && !android && /firefox/i.test(ua);
  const edge = /edg\//i.test(ua);
  const dev0 = ios ? "ios" : android ? "android" : "desktop";

  /* ---- small drawings: each one shows the exact button, ringed in gold ---- */
  const G = "#c9a45c", L = "#3a4256", T = "#a59f93";
  const frame = (inner, h = 112) => `<svg class="ill" viewBox="0 0 280 ${h}" role="img" aria-hidden="true"><rect x="1" y="1" width="278" height="${h - 2}" rx="14" fill="#0d1525" stroke="#1f2838"/>${inner}</svg>`;
  const ring = (x, y, r = 19) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${G}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${r + 6}" fill="none" stroke="${G}" stroke-opacity=".28" stroke-width="2"/>`;
  const shareIc = (x, y, c = G) => `<g transform="translate(${x - 9} ${y - 11})" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1v13M4.5 5.5 9 1l4.5 4.5"/><path d="M3 9v10.5h12V9"/></g>`;
  const dots = (x, y, c = T) => `<g fill="${c}"><circle cx="${x - 7}" cy="${y}" r="2"/><circle cx="${x}" cy="${y}" r="2"/><circle cx="${x + 7}" cy="${y}" r="2"/></g>`;
  const vdots = (x, y, c = T) => `<g fill="${c}"><circle cx="${x}" cy="${y - 7}" r="2"/><circle cx="${x}" cy="${y}" r="2"/><circle cx="${x}" cy="${y + 7}" r="2"/></g>`;
  const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.c || "#f3ede1"}" font-family="Manrope,system-ui,sans-serif" font-size="${o.s || 13}" font-weight="${o.w || 600}"${o.a ? ` text-anchor="${o.a}"` : ""}>${esc(s)}</text>`;
  const bar = (y = 62) => `<rect x="16" y="${y}" width="248" height="36" rx="18" fill="#16213a"/>`;
  const ILL = {
    iosShare: () => frame(`${bar()}${txt(140, 84, "pepshoptexas.com", { a: "middle", s: 11, c: T, w: 500 })}<path d="M34 74l-6 6 6 6" stroke="${T}" stroke-width="1.8" fill="none"/>${shareIc(234, 80)}${ring(234, 80)}${txt(18, 34, "Safari, bottom of the screen", { s: 11, c: T, w: 500 })}`),
    iosDots: () => frame(`${bar()}${txt(132, 84, "pepshoptexas.com", { a: "middle", s: 11, c: T, w: 500 })}${dots(240, 80)}${ring(240, 80)}${txt(18, 34, "Newer iPhones: tap ••• first", { s: 11, c: T, w: 500 })}`),
    iosAdd: () => frame(`<rect x="16" y="16" width="248" height="80" rx="12" fill="#16213a"/>${txt(32, 42, "Copy", { c: T, w: 500 })}<line x1="32" y1="54" x2="248" y2="54" stroke="${L}"/>${txt(32, 80, "Add to Home Screen")}<rect x="226" y="66" width="20" height="20" rx="5" fill="none" stroke="#f3ede1" stroke-width="1.6"/><path d="M236 71v10M231 76h10" stroke="#f3ede1" stroke-width="1.6"/><rect x="22" y="58" width="236" height="32" rx="9" fill="none" stroke="${G}" stroke-width="2"/>`),
    iosConfirm: () => frame(`${txt(30, 36, "Cancel", { c: T, w: 500 })}${txt(140, 36, "Add to Home Screen", { a: "middle", s: 12 })}${txt(252, 36, "Add", { a: "end", c: G, w: 800 })}${ring(240, 31, 17)}<image href="icons/icon-192.png" x="30" y="54" width="38" height="38"/>${txt(80, 70, "Pep Shop TX")}${txt(80, 87, "pepshoptexas.com", { s: 11, c: T, w: 500 })}`),
    andMenu: () => frame(`${bar(18)}${txt(120, 40, "pepshoptexas.com", { a: "middle", s: 11, c: T, w: 500 })}${vdots(246, 36)}${ring(246, 36)}${txt(18, 86, "Chrome, top right corner", { s: 11, c: T, w: 500 })}`),
    andInstall: () => frame(`<rect x="16" y="16" width="248" height="80" rx="12" fill="#16213a"/>${txt(32, 42, "Bookmarks", { c: T, w: 500 })}<line x1="32" y1="54" x2="248" y2="54" stroke="${L}"/>${txt(32, 80, "Add to Home screen")}<rect x="22" y="58" width="236" height="32" rx="9" fill="none" stroke="${G}" stroke-width="2"/>`),
    andConfirm: () => frame(`<image href="icons/icon-192.png" x="30" y="24" width="38" height="38"/>${txt(80, 40, "Install app")}${txt(80, 57, "Pep Shop TX", { s: 11, c: T, w: 500 })}${txt(170, 92, "Cancel", { a: "middle", c: T, w: 500 })}${txt(240, 92, "Install", { a: "middle", c: G, w: 800 })}<rect x="210" y="76" width="60" height="26" rx="13" fill="none" stroke="${G}" stroke-width="2"/>`),
    deskBar: () => frame(`${bar(26)}${txt(36, 48, "pepshoptexas.com", { s: 11, c: T, w: 500 })}<g transform="translate(212 34)" stroke="${G}" stroke-width="1.6" fill="none"><rect x="0" y="1" width="18" height="13" rx="2"/><path d="M5 18h8M9 4v6M6 7.5 9 10.5 12 7.5"/></g>${ring(221, 44, 17)}${txt(18, 92, "Right side of the address bar", { s: 11, c: T, w: 500 })}`),
    deskDock: () => frame(`<rect x="16" y="16" width="248" height="80" rx="12" fill="#16213a"/>${txt(32, 42, "File", { w: 800 })}<line x1="32" y1="54" x2="248" y2="54" stroke="${L}"/>${txt(32, 80, "Add to Dock…")}<rect x="22" y="58" width="236" height="32" rx="9" fill="none" stroke="${G}" stroke-width="2"/>`)
  };

  const step = (n, title, body, ill) => `<li class="istep"><div class="inum">${n}</div><div class="ibody"><b>${title}</b><p>${body}</p></div>${ill ? `<div class="iill">${ill}</div>` : ""}</li>`;
  const panes = {
    ios: () => `${iosOther ? `<p class="inote">You're in ${/crios/i.test(ua) ? "Chrome" : /fxios/i.test(ua) ? "Firefox" : /edgios/i.test(ua) ? "Edge" : "another browser"}. The steps are the same: the Share button is in the address bar. If you don't see <b>Add to Home Screen</b>, open <b>pepshoptexas.com</b> in Safari.</p>` : ""}
<ol class="isteplist">
${step(1, "Tap Share", `Tap the Share button <span class="ik">${P.icon("share", 16)}</span> ${iosOther ? "in the address bar" : "at the bottom of Safari"}. On newer iPhones, tap <span class="ik">•••</span> first, then <b>Share</b>.`, ILL.iosShare() + ILL.iosDots())}
${step(2, "Add to Home Screen", "Scroll down the list and tap <b>Add to Home Screen</b>. Don't see it? Tap <b>View More</b> or <b>Edit Actions</b>.", ILL.iosAdd())}
${step(3, "Tap Add", "Leave <b>Open as Web App</b> on if you see it, then tap <b>Add</b> in the top corner. The Pep Shop TX icon is now on your Home Screen.", ILL.iosConfirm())}
</ol>`,
    android: () => `${P.canPrompt() ? `<div class="ione"><button class="btn primary" type="button" data-install>${P.icon("plus", 16)} Install the app</button><span class="muted small">One tap. Your phone does the rest.</span></div>` : ""}
<ol class="isteplist">
${step(1, "Open the menu", samsung ? "Tap the menu <span class=\"ik\">≡</span> at the bottom of Samsung Internet." : "Tap the menu <span class=\"ik\">⋮</span> at the top right of Chrome.", samsung ? "" : ILL.andMenu())}
${step(2, samsung ? "Add page to" : "Add to Home screen", samsung ? "Tap <b>Add page to</b>, then <b>Home screen</b>." : "Tap <b>Add to Home screen</b> (some phones say <b>Install app</b>).", samsung ? "" : ILL.andInstall())}
${step(3, "Tap Install", "Confirm with <b>Install</b> (or <b>Add</b>). Pep Shop TX shows up with your other apps.", ILL.andConfirm())}
</ol>`,
    desktop: () => `${P.canPrompt() ? `<div class="ione"><button class="btn primary" type="button" data-install>${P.icon("plus", 16)} Install on this computer</button><span class="muted small">Opens in its own window, signed in.</span></div>` : ""}
<p class="inote">On a computer, installing is optional. <b>Order alerts work right in your browser</b> (Chrome, Edge, Safari or Firefox): <a class="linkish" href="account.html#alerts">turn them on in Notifications</a>.</p>
<ol class="isteplist">
${macSafari ? `${step(1, "Open the File menu", "In Safari's menu bar, click <b>File</b>.", "")}${step(2, "Add to Dock", "Click <b>Add to Dock…</b>, then <b>Add</b>. It opens like any other app on your Mac.", ILL.deskDock())}`
  : firefoxDesk ? `${step(1, "Bookmark it", "Firefox doesn't install sites as apps. Press <b>Ctrl+D</b> (<b>⌘D</b> on Mac) to bookmark Pep Shop Texas.", "")}${step(2, "Turn on alerts", "Alerts work in Firefox. Turn them on in <a class=\"linkish\" href=\"account.html#alerts\">Notifications</a>.", "")}`
  : `${step(1, "Find the install icon", `Click the install icon at the right end of the address bar.${edge ? " In Edge, you can also use <b>…</b> → <b>Apps</b> → <b>Install this site as an app</b>." : " Or use the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b>."}`, ILL.deskBar())}${step(2, "Click Install", "Pep Shop TX opens in its own window and gets a spot in your Start menu, Dock or taskbar.", "")}`}
</ol>`
  };
  function cta() {
    const el = $("[data-icta]");
    if (P.isStandalone()) { el.innerHTML = `<div class="iok">${P.icon("check", 20)}<span><b>You're in the app.</b> It opens right here on the shop, signed in.</span></div><a class="btn primary" href="catalog.html">Go to the shop</a> <a class="btn ghost" href="account.html#alerts">Notifications</a>`; return; }
    if (P.store.get("pst_app_installed", 0) && !ios) { el.innerHTML = `<div class="iok">${P.icon("check", 20)}<span><b>Installed.</b> Open Pep Shop TX from your ${android ? "Home screen" : "apps"}.</span></div>`; return; }
    el.innerHTML = P.canPrompt() ? `<button class="btn primary" type="button" data-install>${P.icon("plus", 16)} Install the app</button>` : `<a class="btn primary" href="#steps" data-go>Show me how</a>`;
  }
  function show(dev) {
    $$("[data-dev]").forEach(b => { const on = b.dataset.dev === dev; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $("[data-devpane]").innerHTML = panes[dev]();
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("[data-steps]").id = "steps";
    cta(); show(dev0);
    document.addEventListener("click", async e => {
      const d = e.target.closest("[data-dev]"); if (d) { show(d.dataset.dev); return; }
      const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); $("#steps").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const i = e.target.closest("[data-install]"); if (i) { i.disabled = true; const ok = await P.promptInstall(); if (ok) P.toast("Installed. Open Pep Shop TX from your Home Screen."); cta(); show($("[data-dev].on")?.dataset.dev || dev0); }
    });
    window.addEventListener("beforeinstallprompt", () => setTimeout(() => { cta(); show($("[data-dev].on")?.dataset.dev || dev0); }, 0));
    document.addEventListener("pst-installed", () => { cta(); show($("[data-dev].on")?.dataset.dev || dev0); });
  });
})();
