(() => {
  "use strict";

  const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
  const mode = document.documentElement.dataset.authGuard || "";
  const style = document.getElementById("pst-auth-guard-style");

  function reveal() { document.documentElement.style.visibility = "visible"; style?.remove(); }
  function currentTarget() { const file = window.location.pathname.split("/").pop() || "account.html"; return `${file}${window.location.search || ""}${window.location.hash || ""}`; }
  function loginUrl() { return `login.html?redirect=${encodeURIComponent(currentTarget())}`; }
  function redirect(url) { window.location.replace(url); }
  function showGuardError(message) { reveal(); document.body.innerHTML = `<main style="max-width:680px;margin:12vh auto;padding:32px;font-family:Arial,sans-serif;color:#102a43"><h1 style="margin:0 0 12px">Unable to verify access</h1><p style="line-height:1.6">${String(message || "Please refresh and try again.")}</p><p><a href="login.html">Return to login</a></p></main>`; }

  function installBulkRequestAdminLink(client) {
    const nav = document.querySelector(".pst-admin-nav"); if (!nav) return;
    let link = nav.querySelector('a[href="bulk-requests.html"]');
    if (!link) { link = document.createElement("a"); link.href = "bulk-requests.html"; link.textContent = "Bulk Requests"; const reports = nav.querySelector('a[href="reports.html"]'); reports ? nav.insertBefore(link, reports) : nav.appendChild(link); }
    const currentFile = window.location.pathname.split("/").pop(); link.classList.toggle("active", currentFile === "bulk-requests.html"); link.style.position = "relative";
    if (!document.getElementById("pst-bulk-admin-link-style")) { const badgeStyle = document.createElement("style"); badgeStyle.id = "pst-bulk-admin-link-style"; badgeStyle.textContent = ".pst-auth-bulk-badge{position:absolute;top:-13px;right:-13px;min-width:19px;height:19px;padding:0 5px;border-radius:20px;background:#b42318;color:#fff;display:inline-grid;place-items:center;font:700 11px/1 Arial,sans-serif}.pst-auth-bulk-badge[hidden]{display:none}"; document.head.appendChild(badgeStyle); }
    client.from("bulk_requests").select("request_number", { count: "exact", head: true }).eq("status", "new").then(({ count, error }) => { if (error) return; let badge = link.querySelector(".pst-auth-bulk-badge, .pst-bulk-admin-badge, .nav-badge"); if (!badge) { badge = document.createElement("span"); link.appendChild(badge); } badge.classList.add("pst-auth-bulk-badge"); const total = count || 0; badge.hidden = total === 0; badge.textContent = total > 99 ? "99+" : String(total); badge.setAttribute("aria-label", total + " new bulk requests"); });
  }

  function installAdminDashboardStyling() {
    const currentFile = window.location.pathname.split("/").pop() || "";
    if (currentFile !== "admin.html") return;

    if (!document.getElementById("pst-admin-orders-style-v2")) {
      document.getElementById("pst-admin-orders-style-v1")?.remove();
      const css = document.createElement("style");
      css.id = "pst-admin-orders-style-v2";
      css.textContent = `
        .status.good.pst-orders-loaded-plain,
        .status.pst-orders-loaded-plain,
        .pst-orders-loaded-plain{
          margin:8px 0 18px!important;
          padding:0!important;
          min-height:0!important;
          height:auto!important;
          border:0!important;
          border-radius:0!important;
          background:transparent!important;
          color:#102a43!important;
          font-family:"Avenir Next","Segoe UI",Arial,Helvetica,sans-serif!important;
          font-size:18px!important;
          font-weight:600!important;
          line-height:1.3!important;
          box-shadow:none!important;
        }
        .pst-global-lookup-card{
          background:#0b2d4f!important;
          border:1px solid #0b2d4f!important;
          border-radius:14px!important;
          box-shadow:none!important;
          color:#fff!important;
        }
        .pst-global-lookup-card h1,.pst-global-lookup-card h2,.pst-global-lookup-card h3,
        .pst-global-lookup-card .pst-global-lookup-title{
          color:#c9a45c!important;
          font-family:"Avenir Next","Segoe UI",Arial,Helvetica,sans-serif!important;
          font-weight:600!important;
        }
        .pst-global-lookup-card p,.pst-global-lookup-card .subtitle,.pst-global-lookup-card .muted,
        .pst-global-lookup-card label,.pst-global-lookup-card div:not(.field):not(.btn){color:#fff}
        .pst-global-lookup-card input{
          background:#fff!important;
          color:#102a43!important;
          border:1px solid #d9e2ec!important;
          border-radius:6px!important;
        }
        .pst-global-lookup-card .btn,
        .pst-global-lookup-card button{
          background:#0b2d4f!important;
          color:#fff!important;
          border:1px solid #c9a45c!important;
          border-radius:4px!important;
          box-shadow:none!important;
        }
        .pst-global-lookup-card .btn:hover,
        .pst-global-lookup-card button:hover{
          background:#c9a45c!important;
          color:#0b2d4f!important;
          border-color:#c9a45c!important;
        }
        .admin-dashboard-nav,
        .admin-dashboard-nav.pst-order-jump-wrap{
          background:transparent!important;
          border:0!important;
          border-radius:0!important;
          box-shadow:none!important;
          padding-left:0!important;
          padding-right:0!important;
        }
        .admin-dashboard-nav strong,
        .admin-dashboard-nav .pst-jump-label{
          color:#596579!important;
          font-family:"Avenir Next","Segoe UI",Arial,Helvetica,sans-serif!important;
          font-weight:600!important;
        }
        .admin-dashboard-nav .btn,
        .admin-dashboard-nav a.btn,
        .admin-dashboard-nav button.btn,
        .admin-dashboard-nav.pst-order-jump-wrap .btn,
        .admin-dashboard-nav.pst-order-jump-wrap a,
        .admin-dashboard-nav.pst-order-jump-wrap button{
          background:#102a43!important;
          color:#fff!important;
          border:1px solid #102a43!important;
          border-radius:2px!important;
          min-height:40px!important;
          padding:9px 13px!important;
          font-family:"Avenir Next","Segoe UI",Arial,Helvetica,sans-serif!important;
          font-size:11px!important;
          font-weight:650!important;
          line-height:1!important;
          letter-spacing:.055em!important;
          text-transform:uppercase!important;
          text-decoration:none!important;
          box-shadow:none!important;
        }
        .admin-dashboard-nav .btn:hover,
        .admin-dashboard-nav a.btn:hover,
        .admin-dashboard-nav button.btn:hover,
        .admin-dashboard-nav .btn:focus-visible,
        .admin-dashboard-nav a.btn:focus-visible,
        .admin-dashboard-nav button.btn:focus-visible{
          background:#b79a63!important;
          color:#102a43!important;
          border-color:#b79a63!important;
        }
      `;
      document.head.appendChild(css);
    }

    function apply() {
      document.querySelectorAll(".status").forEach(el => {
        if (/^Loaded\s+\d+\s+orders\.?$/i.test((el.textContent || "").trim())) {
          el.classList.add("pst-orders-loaded-plain");
        }
      });

      const all = Array.from(document.querySelectorAll("body *"));
      const loaded = all.find(el => /^Loaded\s+\d+\s+orders\.?$/i.test((el.textContent || "").trim()) && el.children.length === 0);
      if (loaded) {
        const bar = loaded.closest(".status") || loaded;
        bar.classList.add("pst-orders-loaded-plain");
      }

      const lookupTitle = all.find(el => (el.textContent || "").trim() === "Global Lookup");
      if (lookupTitle) {
        lookupTitle.classList.add("pst-global-lookup-title");
        let card = lookupTitle.closest(".card,section,div");
        while (card && card !== document.body) {
          const text = card.textContent || "";
          if (/Search any reference a customer gives you/i.test(text) && card.querySelector("input")) break;
          card = card.parentElement;
        }
        if (card && card !== document.body) card.classList.add("pst-global-lookup-card");
      }

      const jumpNav = document.querySelector(".admin-dashboard-nav");
      if (jumpNav) jumpNav.classList.add("pst-order-jump-wrap");
      const jumpLabel = Array.from(document.querySelectorAll(".admin-dashboard-nav strong, .admin-dashboard-nav *")).find(el => (el.textContent || "").trim().toUpperCase() === "JUMP TO" && el.children.length === 0);
      if (jumpLabel) jumpLabel.classList.add("pst-jump-label");
    }

    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    setTimeout(apply, 250);
    setTimeout(apply, 800);
    setTimeout(apply, 1600);
  }

  function installInventoryTrackingDisplay(client) {
    const currentFile = window.location.pathname.split("/").pop() || ""; if (currentFile !== "inventory.html") return;
    let trackingByPo = new Map(); let refreshTimer = null; let observerAttached = false;

    if (!document.getElementById("pst-incoming-vendor-layout-fix")) {
      const vendorStyle = document.createElement("style");
      vendorStyle.id = "pst-incoming-vendor-layout-fix";
      vendorStyle.textContent = `
        @media(min-width:1151px){.incoming-form-grid{grid-template-columns:1.2fr .55fr .7fr .7fr .7fr .75fr .9fr 1.25fr .8fr .9fr auto minmax(170px,auto)!important}}
        #incomingVendorSelect{min-width:170px!important}
        #incomingVendorInfo{display:none!important}
        #addIncomingBtn{min-width:168px!important;width:max-content!important;max-width:none!important;white-space:nowrap!important;padding-left:14px!important;padding-right:14px!important;justify-self:end!important;overflow:visible!important}
        #addIncomingLineBtn{white-space:nowrap!important}
        @media(max-width:1150px){#addIncomingBtn{width:100%!important;justify-self:stretch!important}}
      `;
      document.head.appendChild(vendorStyle);
    }

    if (!document.getElementById("pst-po-track-package-style")) {
      const linkStyle = document.createElement("style"); linkStyle.id = "pst-po-track-package-style";
      linkStyle.textContent = `.pst-track-package-link{display:inline-flex;align-items:center;margin-left:8px;padding:2px 7px;border:1px solid #cfd8e3;border-radius:999px;background:#fff;color:#003f9e;font-size:11px;font-weight:800;line-height:1.35;text-decoration:none;white-space:nowrap}.pst-track-package-link:hover,.pst-track-package-link:focus-visible{background:#f2f7ff;text-decoration:none}@media(max-width:700px){.pst-track-package-link{margin-left:6px;font-size:10px;padding:2px 6px}}`;
      document.head.appendChild(linkStyle);
    }

    function packageTrackingUrl(trackingNumber) {
      const compact = String(trackingNumber || "").trim().replace(/\s+/g, ""); const encoded = encodeURIComponent(compact);
      if (/^1Z[0-9A-Z]{16}$/i.test(compact)) return `https://www.ups.com/track?loc=en_US&tracknum=${encoded}`;
      if (/^(9[2345]\d{18,20}|\d{20,22})$/.test(compact)) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
      if (/^\d{12,15}$/.test(compact)) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
      if (/^\d{10}$/.test(compact) || /^JJD\d+/i.test(compact)) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
      return `https://www.17track.net/en?nums=${encoded}`;
    }

    function applyTrackingLabels() {
      document.querySelectorAll("[data-po-apply-tracking]").forEach(button => {
        const poNumber = String(button.dataset.poApplyTracking || "").trim().toLowerCase(); const trackingNumber = trackingByPo.get(poNumber) || "";
        button.textContent = trackingNumber ? "Edit Tracking" : "Add Tracking Number"; button.title = trackingNumber ? `Tracking number: ${trackingNumber}` : "Add tracking number"; button.setAttribute("aria-label", trackingNumber ? `Edit tracking number ${trackingNumber}` : "Add tracking number");
        const poGroup = button.closest(".incoming-po-group"); const summaryNote = poGroup?.querySelector(".incoming-po-selection-tools .note"); if (!summaryNote) return;
        let baseText = summaryNote.dataset.baseSummaryText || summaryNote.textContent || ""; baseText = baseText.replace(/\s*·\s*Tracking:\s*[^·]+$/i, "").replace(/\s*Track Package\s*$/i, "").trim(); summaryNote.dataset.baseSummaryText = baseText;
        summaryNote.textContent = trackingNumber ? `${baseText} · Tracking: ${trackingNumber}` : baseText;
        if (trackingNumber) { const trackLink = document.createElement("a"); trackLink.className = "pst-track-package-link"; trackLink.href = packageTrackingUrl(trackingNumber); trackLink.target = "_blank"; trackLink.rel = "noopener noreferrer"; trackLink.textContent = "Track Package"; trackLink.setAttribute("aria-label", `Track package ${trackingNumber} in a new tab`); summaryNote.appendChild(trackLink); }
      });
    }

    async function refreshTrackingLabels() {
      const { data, error } = await client.from("incoming_inventory").select("po_number,tracking_number").not("po_number", "is", null); if (error) { console.warn("Could not load PO tracking labels", error); return; }
      const next = new Map(); (data || []).forEach(row => { const poNumber = String(row.po_number || "").trim().toLowerCase(); const trackingNumber = String(row.tracking_number || "").trim(); if (poNumber && trackingNumber && !next.has(poNumber)) next.set(poNumber, trackingNumber); }); trackingByPo = next; applyTrackingLabels();
    }
    function scheduleRefresh(delay = 120) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { refreshTrackingLabels().catch(error => console.warn("PO tracking refresh failed", error)); }, delay); }
    function attachObserver() { if (observerAttached) return; const poCenter = document.getElementById("incomingPoCenterList"); if (!poCenter) { setTimeout(attachObserver, 200); return; } observerAttached = true; const observer = new MutationObserver(() => scheduleRefresh(80)); observer.observe(poCenter, { childList: true }); scheduleRefresh(0); setTimeout(() => scheduleRefresh(0), 400); setTimeout(() => scheduleRefresh(0), 1000); }
    attachObserver();
  }

  async function run() {
    if (!mode) { reveal(); return; }
    if (!window.supabase?.createClient) { showGuardError("Supabase did not load. Check your connection and refresh the page."); return; }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY); window.pstAuthGuardClient = client;
    try {
      const { data, error } = await client.auth.getUser(); if (error || !data?.user) { redirect(loginUrl()); return; }
      const user = data.user;
      if (mode === "admin") {
        const { data: admin, error: adminError } = await client.from("admin_users").select("user_id,is_active").eq("user_id", user.id).eq("is_active", true).maybeSingle();
        if (adminError || !admin) { redirect("account.html?access=denied"); return; }
        installBulkRequestAdminLink(client); installAdminDashboardStyling(); installInventoryTrackingDisplay(client);
      }
      window.pstAuthenticatedUser = user; reveal(); window.dispatchEvent(new CustomEvent("pst-auth-ready", { detail: { mode, user } })); client.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") redirect(loginUrl()); });
    } catch (error) { console.error("Authentication guard failed", error); showGuardError("Pep Shop Texas could not verify your login. Refresh the page and try again."); }
  }
  run();
})();
