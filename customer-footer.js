(function () {
  "use strict";

  const trustBarMarkup = `
    <div class="trust-bar" aria-label="Customer assurances">
      <div><span><strong>RESEARCH USE ONLY</strong>Not for human consumption. Not for use in diagnostic procedures.</span></div>
      <div><span><strong>QUALITY</strong>Third-party tested</span></div>
      <div><span><strong>PRIVACY</strong>Secure &amp; discreet</span></div>
      <div><span><strong>SHIPPING</strong>Fast &amp; reliable</span></div>
    </div>`;

  const footerInnerMarkup = `
    <div class="site-footer-inner">
      <div class="site-footer-brand">
        <strong>Pep Shop Texas</strong>
        <span>Research-use catalog. Not for human or veterinary use.</span>
      </div>
      <nav class="site-footer-links" aria-label="Footer policies">
        <a href="terms.html">Terms</a>
        <a href="privacy.html">Privacy</a>
        <a href="shipping.html">Shipping</a>
        <a href="returns.html">Returns</a>
        <a href="contact.html">Contact</a>
      </nav>
    </div>`;

  function installCustomerFooter() {
    let footer = document.querySelector("footer.site-footer");

    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      footer.innerHTML = trustBarMarkup + footerInnerMarkup;
      document.body.appendChild(footer);
      return;
    }

    if (!footer.querySelector(".trust-bar")) {
      footer.insertAdjacentHTML("afterbegin", trustBarMarkup);
    }

    if (!footer.querySelector(".site-footer-inner")) {
      footer.insertAdjacentHTML("beforeend", footerInnerMarkup);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCustomerFooter, { once: true });
  } else {
    installCustomerFooter();
  }
})();
