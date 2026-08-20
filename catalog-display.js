/* PST catalog display refinement: compact blend names + strength dropdowns. */
(function () {
  function formattedCatalogDisplayName(value) {
    const name = String(value || "").trim();
    const match = name.match(/^(.*?)(\s*\([^()]+\))\s*$/);
    if (!match) return escapeHtml(name);
    const primary = match[1].trimEnd();
    const formula = match[2].trim();
    return `${escapeHtml(primary)} <span class="catalog-formula">${escapeHtml(formula)}</span>`;
  }

  function variantOption(product) {
    return `<option value="${escapeAttribute(product.product_key)}" data-url="${escapeAttribute(productUrl(product))}" data-price-html="${escapeAttribute(priceHtml(product))}">${escapeHtml(product.strength || product.product_key)}</option>`;
  }

  function catalogVariantPicker(variants) {
    const selected = variants[0];
    if (variants.length === 1) {
      return `
        <div class="catalog-variant-picker catalog-variant-picker-single">
          <a class="catalog-single-strength" href="${productUrl(selected)}">${escapeHtml(selected.strength || selected.product_key)}</a>
          <strong class="catalog-selected-price">${priceHtml(selected)}</strong>
        </div>
      `;
    }

    return `
      <div class="catalog-variant-picker" data-catalog-variant-picker>
        <select class="catalog-strength-select" aria-label="Select strength">
          ${variants.map(variantOption).join("")}
        </select>
        <strong class="catalog-selected-price" data-catalog-selected-price>${priceHtml(selected)}</strong>
      </div>
    `;
  }

  /* app.js groups variants by display name. Keep that grouping, but render one
     compact selector instead of one visible row per strength. */
  window.productCard = function productCard(group) {
    const variants = Array.isArray(group) ? group : [group];
    const selected = variants[0];
    return `
      <article class="catalog-card" data-catalog-card>
        <div class="catalog-card-main">
          <p>${escapeHtml(selected.category || "Research product")}</p>
          <span data-catalog-sale>${saleBadge(selected)}</span>
          <h2><a href="${productUrl(selected)}" data-catalog-link>${formattedCatalogDisplayName(selected.display_name)}</a></h2>
          ${catalogVariantPicker(variants)}
        </div>
      </article>
    `;
  };

  document.addEventListener("change", (event) => {
    const select = event.target.closest(".catalog-strength-select");
    if (!select) return;

    const option = select.selectedOptions[0];
    const card = select.closest("[data-catalog-card]");
    const productLink = card?.querySelector("[data-catalog-link]");
    const price = card?.querySelector("[data-catalog-selected-price]");
    const url = option?.dataset?.url || "";

    if (productLink && url) productLink.href = url;
    if (price) price.innerHTML = option?.dataset?.priceHtml || "";
  });

  document.addEventListener("dblclick", (event) => {
    const select = event.target.closest(".catalog-strength-select");
    if (!select) return;
    const url = select.selectedOptions[0]?.dataset?.url;
    if (url) window.location.href = url;
  });
})();
