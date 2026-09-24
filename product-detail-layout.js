/* Product detail presentation without vial photos or image placeholders. */
(function () {
  const shell = document.querySelector("[data-product-detail]");
  if (!shell) return;

  function formatProductHeading(info) {
    const heading = info.querySelector("h1");
    if (!heading || heading.dataset.pstFormulaFormatted === "true") return;

    const name = String(heading.textContent || "").trim();
    const match = name.match(/^(.*?)(\s*\([^()]+\))\s*$/);
    if (!match) return;

    const primary = match[1].trimEnd();
    const formula = match[2].trim();
    heading.textContent = "";

    const primaryText = document.createTextNode(primary + " ");
    const formulaSpan = document.createElement("span");
    formulaSpan.className = "pst-product-formula";
    formulaSpan.textContent = formula;

    heading.append(primaryText, formulaSpan);
    heading.dataset.pstFormulaFormatted = "true";
  }

  function enhanceProductDetail() {
    const info = shell.querySelector(".product-info");
    if (!info || info.dataset.pstDetailEnhanced === "true") return false;
    info.dataset.pstDetailEnhanced = "true";
    formatProductHeading(info);

    const children = Array.from(info.children);
    const firstSectionIndex = children.findIndex((node) => node.tagName === "SECTION");
    const topChildren = firstSectionIndex >= 0 ? children.slice(0, firstSectionIndex) : children;
    const detailChildren = firstSectionIndex >= 0 ? children.slice(firstSectionIndex) : [];

    const purchase = document.createElement("div");
    purchase.className = "pst-product-purchase";
    topChildren.forEach((node) => purchase.appendChild(node));

    const top = document.createElement("div");
    top.className = "pst-product-top pst-product-text-only";
    top.append(purchase);

    const body = document.createElement("div");
    body.className = "pst-product-detail-body";
    detailChildren.forEach((node) => body.appendChild(node));

    info.replaceChildren(top, body);
    return true;
  }

  if (enhanceProductDetail()) return;

  const observer = new MutationObserver(() => {
    if (enhanceProductDetail()) observer.disconnect();
  });
  observer.observe(shell, { childList: true, subtree: true });
})();
