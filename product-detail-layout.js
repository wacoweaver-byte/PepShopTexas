/* PST product detail presentation layer.
   Keeps the existing product/cart renderer intact, then organizes its output into
   a restrained two-column layout with a predictable per-variant vial image path. */
(function () {
  const shell = document.querySelector("[data-product-detail]");
  if (!shell) return;

  function productImagePath() {
    const params = new URLSearchParams(window.location.search);
    const key = String(params.get("key") || params.get("id") || "product").trim();
    return `images/products/${encodeURIComponent(key)}.webp`;
  }

  function enhanceProductDetail() {
    const info = shell.querySelector(".product-info");
    if (!info || info.dataset.pstDetailEnhanced === "true") return false;
    info.dataset.pstDetailEnhanced = "true";

    const children = Array.from(info.children);
    const firstSectionIndex = children.findIndex((node) => node.tagName === "SECTION");
    const topChildren = firstSectionIndex >= 0 ? children.slice(0, firstSectionIndex) : children;
    const detailChildren = firstSectionIndex >= 0 ? children.slice(firstSectionIndex) : [];

    const media = document.createElement("div");
    media.className = "pst-product-media";
    media.innerHTML = `
      <div class="pst-product-image-stage">
        <img class="pst-product-vial-image" src="${productImagePath()}" alt="Product vial" loading="eager">
        <div class="pst-product-image-placeholder" aria-hidden="true">
          <span>Product image coming soon</span>
        </div>
      </div>
    `;

    const image = media.querySelector(".pst-product-vial-image");
    const placeholder = media.querySelector(".pst-product-image-placeholder");
    image.addEventListener("load", () => {
      image.hidden = false;
      placeholder.hidden = true;
    });
    image.addEventListener("error", () => {
      image.hidden = true;
      placeholder.hidden = false;
    });

    const purchase = document.createElement("div");
    purchase.className = "pst-product-purchase";
    topChildren.forEach((node) => purchase.appendChild(node));

    const top = document.createElement("div");
    top.className = "pst-product-top";
    top.append(media, purchase);

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
