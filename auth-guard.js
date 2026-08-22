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

    if (!document.getElementById("pst-po-tracking-mobile-style")) {
      const trackingStyle = document.createElement("style");
      trackingStyle.id = "pst-po-tracking-mobile-style";
      trackingStyle.textContent = `
        [data-po-apply-tracking] .pst-tracking-number{display:block;margin-top:4px;font-size:11px;font-weight:800;letter-spacing:.02em;text-transform:none;white-space:normal;overflow-wrap:anywhere;line-height:1.25}
        @media (max-width:700px){
          [data-po-apply-tracking]{white-space:normal!important;min-width:0!important;width:100%!important;max-width:100%!important;padding:10px 8px!important;line-height:1.15!important;text-align:center!important}
          [data-po-apply-tracking] .pst-tracking-action{display:block;font-size:11px;line-height:1.1}
          [data-po-apply-tracking] .pst-tracking-number{font-size:10px;line-height:1.2;word-break:break-all}
        }`;
      document.head.appendChild(trackingStyle);
    }

    function applyTrackingLabels() {
      document.querySelectorAll("[data-po-apply-tracking]").forEach(button => {
        const poNumber = String(button.dataset.poApplyTracking || "").trim().toLowerCase();
        const trackingNumber = trackingByPo.get(poNumber) || "";
        button.innerHTML = trackingNumber
          ? `<span class="pst-tracking-action">Edit Tracking</span><span class="pst-tracking-number"></span>`
          : `<span class="pst-tracking-action">Add Tracking</span>`;
        const numberEl = button.querySelector(".pst-tracking-number");
        if (numberEl) numberEl.textContent = trackingNumber;
        button.title = trackingNumber ? `Tracking number: ${trackingNumber}` : "Add tracking number";
        button.setAttribute("aria-label", trackingNumber
          ? `Edit tracking number ${trackingNumber}`
          : "Add tracking number");
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

    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTrackingLabels().catch(error => console.warn("PO tracking refresh failed", error));
      }, 120);
    }

    function attachObserver() {
      if (observerAttached) return;
      const inventoryBody = document.getElementById("incomingInventoryBody");
      if (!inventoryBody) {
        setTimeout(attachObserver, 250);
        return;
      }
      observerAttached = true;
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(inventoryBody, { childList: true });
      scheduleRefresh();
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
