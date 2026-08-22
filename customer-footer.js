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
        <strong>DISCREET SHIPPING</strong>
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

    let footer = document.querySelector("footer.site-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      document.body.appendChild(footer);
    }
    footer.innerHTML = footerMarkup;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCustomerFooter, { once: true });
  } else {
    installCustomerFooter();
  }
})();
