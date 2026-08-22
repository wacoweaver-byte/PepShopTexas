(() => {
  "use strict";

  const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
  const mode = document.documentElement.dataset.authGuard || "";
  const style = document.getElementById("pst-auth-guard-style");

  function reveal() {
    document.documentElement.style.visibility = "visible";
    style?.remove();
  }

  function currentTarget() {
    const file = window.location.pathname.split("/").pop() || "account.html";
    return `${file}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function loginUrl() {
    return `login.html?redirect=${encodeURIComponent(currentTarget())}`;
  }

  function redirect(url) {
    window.location.replace(url);
  }

  function showGuardError(message) {
    reveal();
    document.body.innerHTML = `
      <main style="max-width:680px;margin:12vh auto;padding:32px;font-family:Arial,sans-serif;color:#102a43">
        <h1 style="margin:0 0 12px">Unable to verify access</h1>
        <p style="line-height:1.6">${String(message || "Please refresh and try again.")}</p>
        <p><a href="login.html">Return to login</a></p>
      </main>`;
  }

  function installBulkRequestAdminLink(client) {
    const nav = document.querySelector(".pst-admin-nav");
    if (!nav) return;

    let link = nav.querySelector('a[href="bulk-requests.html"]');
    if (!link) {
      link = document.createElement("a");
      link.href = "bulk-requests.html";
      link.textContent = "Bulk Requests";
      const reports = nav.querySelector('a[href="reports.html"]');
      reports ? nav.insertBefore(link, reports) : nav.appendChild(link);
    }

    const currentFile = window.location.pathname.split("/").pop();
    link.classList.toggle("active", currentFile === "bulk-requests.html");
    link.style.position = "relative";

    if (!document.getElementById("pst-bulk-admin-link-style")) {
      const badgeStyle = document.createElement("style");
      badgeStyle.id = "pst-bulk-admin-link-style";
      badgeStyle.textContent = ".pst-auth-bulk-badge{position:absolute;top:-13px;right:-13px;min-width:19px;height:19px;padding:0 5px;border-radius:20px;background:#b42318;color:#fff;display:inline-grid;place-items:center;font:700 11px/1 Arial,sans-serif}.pst-auth-bulk-badge[hidden]{display:none}";
      document.head.appendChild(badgeStyle);
    }

    client
      .from("bulk_requests")
      .select("request_number", { count: "exact", head: true })
      .eq("status", "new")
      .then(({ count, error }) => {
        if (error) return;
        let badge = link.querySelector(".pst-auth-bulk-badge, .pst-bulk-admin-badge, .nav-badge");
        if (!badge) {
          badge = document.createElement("span");
          link.appendChild(badge);
        }
        badge.classList.add("pst-auth-bulk-badge");
        const total = count || 0;
        badge.hidden = total === 0;
        badge.textContent = total > 99 ? "99+" : String(total);
        badge.setAttribute("aria-label", total + " new bulk requests");
      });
  }

  function installInventoryTrackingDisplay(client) {
    const currentFile = window.location.pathname.split("/").pop() || "";
    if (currentFile !== "inventory.html") return;

    let trackingByPo = new Map();
    let refreshTimer = null;
    let observerAttached = false;

    if (!document.getElementById("pst-po-track-package-style")) {
      const linkStyle = document.createElement("style");
      linkStyle.id = "pst-po-track-package-style";
      linkStyle.textContent = `
        .pst-track-package-link{
          display:inline-flex;
          align-items:center;
          margin-left:8px;
          padding:2px 7px;
          border:1px solid #cfd8e3;
          border-radius:999px;
          background:#fff;
          color:#003f9e;
          font-size:11px;
          font-weight:800;
          line-height:1.35;
          text-decoration:none;
          white-space:nowrap;
        }
        .pst-track-package-link:hover,.pst-track-package-link:focus-visible{
          background:#f2f7ff;
          text-decoration:none;
        }
        @media(max-width:700px){
          .pst-track-package-link{margin-left:6px;font-size:10px;padding:2px 6px;}
        }`;
      document.head.appendChild(linkStyle);
    }

    function packageTrackingUrl(trackingNumber) {
      const raw = String(trackingNumber || "").trim();
      const compact = raw.replace(/\s+/g, "");
      const encoded = encodeURIComponent(compact);

      if (/^1Z[0-9A-Z]{16}$/i.test(compact)) {
        return `https://www.ups.com/track?loc=en_US&tracknum=${encoded}`;
      }
      if (/^(9[2345]\d{18,20}|\d{20,22})$/.test(compact)) {
        return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
      }
      if (/^\d{12,15}$/.test(compact)) {
        return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
      }
      if (/^\d{10}$/.test(compact) || /^JJD\d+/i.test(compact)) {
        return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
      }
      return `https://www.17track.net/en?nums=${encoded}`;
    }

    function applyTrackingLabels() {
      document.querySelectorAll("[data-po-apply-tracking]").forEach(button => {
        const poNumber = String(button.dataset.poApplyTracking || "").trim().toLowerCase();
        const trackingNumber = trackingByPo.get(poNumber) || "";

        button.textContent = trackingNumber ? "Edit Tracking Number" : "Add Tracking Number";
        button.title = trackingNumber ? `Tracking number: ${trackingNumber}` : "Add tracking number";
        button.setAttribute("aria-label", trackingNumber
          ? `Edit tracking number ${trackingNumber}`
          : "Add tracking number");

        const poGroup = button.closest(".incoming-po-group");
        const summaryNote = poGroup?.querySelector(".incoming-po-selection-tools .note");
        if (!summaryNote) return;

        let baseText = summaryNote.dataset.baseSummaryText || summaryNote.textContent || "";
        baseText = baseText
          .replace(/\s*·\s*Tracking:\s*[^·]+$/i, "")
          .replace(/\s*Track Package\s*$/i, "")
          .trim();
        summaryNote.dataset.baseSummaryText = baseText;

        summaryNote.textContent = trackingNumber
          ? `${baseText} · Tracking: ${trackingNumber}`
          : baseText;

        if (trackingNumber) {
          const trackLink = document.createElement("a");
          trackLink.className = "pst-track-package-link";
          trackLink.href = packageTrackingUrl(trackingNumber);
          trackLink.target = "_blank";
          trackLink.rel = "noopener noreferrer";
          trackLink.textContent = "Track Package";
          trackLink.setAttribute("aria-label", `Track package ${trackingNumber} in a new tab`);
          summaryNote.appendChild(trackLink);
        }
      });
    }

    async function refreshTrackingLabels() {
      const { data, error } = await client
        .from("incoming_inventory")
        .select("po_number,tracking_number")
        .not("po_number", "is", null);

      if (error) {
        console.warn("Could not load PO tracking labels", error);
        return;
      }

      const next = new Map();
      (data || []).forEach(row => {
        const poNumber = String(row.po_number || "").trim().toLowerCase();
        const trackingNumber = String(row.tracking_number || "").trim();
        if (poNumber && trackingNumber && !next.has(poNumber)) next.set(poNumber, trackingNumber);
      });
      trackingByPo = next;
      applyTrackingLabels();
    }

    function scheduleRefresh(delay = 120) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTrackingLabels().catch(error => console.warn("PO tracking refresh failed", error));
      }, delay);
    }

    function attachObserver() {
      if (observerAttached) return;
      const poCenter = document.getElementById("incomingPoCenterList");
      if (!poCenter) {
        setTimeout(attachObserver, 200);
        return;
      }
      observerAttached = true;
      const observer = new MutationObserver(() => scheduleRefresh(80));
      observer.observe(poCenter, { childList: true });
      scheduleRefresh(0);
      setTimeout(() => scheduleRefresh(0), 400);
      setTimeout(() => scheduleRefresh(0), 1000);
    }

    attachObserver();
  }

  async function run() {
    if (!mode) {
      reveal();
      return;
    }

    if (!window.supabase?.createClient) {
      showGuardError("Supabase did not load. Check your connection and refresh the page.");
      return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.pstAuthGuardClient = client;

    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) {
        redirect(loginUrl());
        return;
      }

      const user = data.user;
      if (mode === "admin") {
        const { data: admin, error: adminError } = await client
          .from("admin_users")
          .select("user_id,is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (adminError || !admin) {
          redirect("account.html?access=denied");
          return;
        }

        installBulkRequestAdminLink(client);
        installInventoryTrackingDisplay(client);
      }

      window.pstAuthenticatedUser = user;
      reveal();
      window.dispatchEvent(new CustomEvent("pst-auth-ready", { detail: { mode, user } }));

      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") redirect(loginUrl());
      });
    } catch (error) {
      console.error("Authentication guard failed", error);
      showGuardError("Pep Shop Texas could not verify your login. Refresh the page and try again.");
    }
  }

  run();
})();
