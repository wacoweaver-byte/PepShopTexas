/* PST product detail presentation layer.
   Keeps the existing product/cart renderer intact, then organizes its output into
   a restrained two-column layout with product-specific vial images. */
(function () {
  const shell = document.querySelector("[data-product-detail]");
  if (!shell) return;

  const PRODUCT_IMAGE_PATHS = Object.freeze({
    PSTP100034: "assets/images/products/mots-c-10mg.png",
    PSTP100013: "assets/images/products/wolverine-10mg.png",
    PSTP100042: "assets/images/products/pt-141-10mg.png",
    PSTP100010: "assets/images/products/tide-3P-60mg.png",
    PSTP100054: "assets/images/products/glow-70mg.png"
  });

  function productKey() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("key") || params.get("id") || "").trim();
  }

  function productImagePath() {
    return PRODUCT_IMAGE_PATHS[productKey()] || "";
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
        <img class="pst-product-vial-image" alt="Product vial" loading="eager" hidden>
        <div class="pst-product-image-placeholder" aria-hidden="true">
          <span>Product image coming soon</span>
        </div>
      </div>
    `;

    const image = media.querySelector(".pst-product-vial-image");
    const placeholder = media.querySelector(".pst-product-image-placeholder");
    const imagePath = productImagePath();

    image.addEventListener("load", () => {
      image.hidden = false;
      placeholder.hidden = true;
    });
    image.addEventListener("error", () => {
      image.hidden = true;
      placeholder.hidden = false;
    });

    if (imagePath) image.src = imagePath;

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
