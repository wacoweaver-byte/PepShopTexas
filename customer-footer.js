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

  function installCustomerFooter() {
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
