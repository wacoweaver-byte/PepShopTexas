(function () {
  "use strict";

  const footerMarkup = `
    <section class="footer-trust" aria-label="Pep Shop Texas standards">
      <div class="footer-trust-item">
        <strong>INDEPENDENTLY TESTED</strong>
        <span>Identity, purity &amp; content verification</span>
      </div>
      <div class="footer-trust-item">
        <strong>QUALITY STANDARD</strong>
        <span>Responsibly sourced research compounds</span>
      </div>
      <div class="footer-trust-item">
        <strong>SECURED SHIPPING</strong>
        <span>Secure packaging and fulfillment</span>
      </div>
      <div class="footer-trust-item">
        <strong>COA VALIDATION</strong>
        <span>Verify testing documentation</span>
      </div>
    </section>

    <div class="footer-main">
      <div class="footer-main-inner">
        <div class="footer-brand">
          <strong>PEP SHOP TEXAS</strong>
          <span>Premium Purity &nbsp;|&nbsp; Proven Quality &nbsp;|&nbsp; Responsibly Sourced</span>
        </div>

        <nav class="footer-column" aria-label="Footer shop links">
          <strong>SHOP</strong>
          <a href="catalog.html">Peptides A-Z</a>
          <a href="catalog.html?category=Stack">Top Stacks</a>
          <a href="testing.html">Testing / Verification</a>
          <a href="bulk-request.html">Bulk Request</a>
        </nav>

        <nav class="footer-column" aria-label="Footer customer service links">
          <strong>CUSTOMER SERVICE</strong>
          <a href="faq.html">FAQ</a>
          <a href="shipping.html">Shipping</a>
          <a href="returns.html">Returns</a>
          <a href="terms.html">Terms</a>
          <a href="privacy.html">Privacy</a>
        </nav>

        <nav class="footer-column" aria-label="Footer contact links">
          <strong>CONTACT</strong>
          <a href="contact.html">Contact Us</a>
          <span>pepshoptexas.com</span>
        </nav>
      </div>
    </div>

    <div class="footer-legal">RESEARCH USE ONLY <span aria-hidden="true">•</span> NOT FOR HUMAN OR VETERINARY USE</div>`;

  function installScrollRestoration() {
    if (!window.sessionStorage) return;

    const pageKey = `pst-scroll:${window.location.pathname}${window.location.search}`;
    let saveTimer = null;
    let restoring = false;

    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    } catch (_) {}

    function savePosition() {
      if (restoring) return;
      try {
        sessionStorage.setItem(pageKey, String(Math.max(0, Math.round(window.scrollY || 0))));
      } catch (_) {}
    }

    function isBackForwardNavigation(event) {
      if (event?.persisted) return true;
      try {
        const nav = performance.getEntriesByType?.("navigation")?.[0];
        return nav?.type === "back_forward";
      } catch (_) {
        return false;
      }
    }

    function restorePosition(event) {
      if (!isBackForwardNavigation(event)) return;

      let target = 0;
      try { target = Number(sessionStorage.getItem(pageKey) || 0); } catch (_) {}
      if (!Number.isFinite(target) || target <= 0) return;

      restoring = true;
      const started = Date.now();
      let observer = null;
      let timer = null;

      const attempt = () => {
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (maxScroll >= target || Date.now() - started > 2500) {
          window.scrollTo(0, Math.min(target, maxScroll));
          requestAnimationFrame(() => window.scrollTo(0, Math.min(target, Math.max(0, document.documentElement.scrollHeight - window.innerHeight))));
          restoring = false;
          observer?.disconnect();
          if (timer) clearInterval(timer);
        }
      };

      observer = new MutationObserver(attempt);
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setInterval(attempt, 100);
      requestAnimationFrame(attempt);
      setTimeout(attempt, 50);
    }

    window.addEventListener("scroll", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePosition, 80);
    }, { passive: true });

    window.addEventListener("pagehide", savePosition);
    window.addEventListener("beforeunload", savePosition);
    window.addEventListener("pageshow", restorePosition);
  }

  function installProductBackLink() {
    const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
    if (page !== "product.html") return;

    const backLink = document.querySelector(".back-link[href='catalog.html'], .back-link");
    if (!backLink || backLink.dataset.historyBackBound === "true") return;
    backLink.dataset.historyBackBound = "true";

    backLink.addEventListener("click", (event) => {
      let referrer = null;
      try { referrer = document.referrer ? new URL(document.referrer) : null; } catch (_) {}

      const cameFromCatalog = !!referrer &&
        referrer.origin === window.location.origin &&
        /\/catalog\.html$/i.test(referrer.pathname);

      if (!cameFromCatalog) return;

      event.preventDefault();
      history.back();
    });
  }

  function installCustomerHeaderLogo() {
    const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (page === "index.html" || page === "") return;

    const logo = document.querySelector(".pst-customer-header-logo");
    if (!logo) return;

    logo.src = "pst-header-logo.webp";
    logo.alt = "Pep Shop Texas";
    logo.style.width = "54px";
    logo.style.height = "54px";
    logo.style.maxWidth = "54px";
    logo.style.objectFit = "contain";
  }

  function installCustomerHeaderNavigation() {
    document.querySelectorAll(".pst-customer-nav.main-nav").forEach((nav) => {
      if (nav.querySelector('[data-bulk-request-link]')) return;
      const link = document.createElement("a");
      link.href = "bulk-request.html";
      link.textContent = "BULK REQUEST";
      link.dataset.bulkRequestLink = "true";
      const accountLink = nav.querySelector("[data-account-link], a[href='account.html']");
      nav.insertBefore(link, accountLink || nav.querySelector(".cart-link") || null);
    });

    if (!document.getElementById("pst-bulk-request-nav-layout")) {
      const style = document.createElement("style");
      style.id = "pst-bulk-request-nav-layout";
      style.textContent = `
        @media (max-width:700px) {
          .pst-customer-nav a[data-bulk-request-link] {
            grid-column:1 / -1!important;
            grid-row:2!important;
            justify-self:center!important;
          }
          .pst-customer-nav a[data-account-link] {
            grid-row:3!important;
          }
          .pst-customer-nav a[data-admin-link] {
            grid-row:3!important;
          }
          .pst-customer-nav .cart-link {
            grid-row:3!important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  function installCustomerFooter() {
    installCustomerHeaderLogo();
    installCustomerHeaderNavigation();
    installProductBackLink();

    let footer = document.querySelector("footer.site-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      document.body.appendChild(footer);
    }
    footer.innerHTML = footerMarkup;
  }

  installScrollRestoration();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCustomerFooter, { once: true });
  } else {
    installCustomerFooter();
  }
})();
