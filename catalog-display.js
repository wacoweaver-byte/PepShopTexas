/* PST catalog display refinement: compact blend names + quick-buy variant selectors. */
(function () {
  function formattedCatalogDisplayName(value) {
    const name = String(value || "").trim();
    const match = name.match(/^(.*?)(\s*\([^()]+\))\s*$/);
    if (!match) return escapeHtml(name);
    const primary = match[1].trimEnd();
    const formula = match[2].trim();
    return `${escapeHtml(primary)} <span class="catalog-formula">${escapeHtml(formula)}</span>`;
  }

  function variantLabel(product) {
    const strength = product.strength || product.product_key;
    return strength;
  }

  function variantOption(product) {
    return `<option value="${escapeAttribute(product.product_key)}" data-url="${escapeAttribute(productUrl(product))}" data-cart-key="${escapeAttribute(product.product_key)}">${escapeHtml(variantLabel(product))}</option>`;
  }

  function firstAvailableVariant(variants) {
    return variants.find((product) => Number(product.current_inventory || 0) > 0) || variants[0];
  }

  function catalogQuickBuy(variants) {
    const selected = firstAvailableVariant(variants);

    if (variants.length === 1) {
      return `
        <div class="catalog-quick-buy catalog-quick-buy-single" data-catalog-variant-picker>
          <div class="catalog-variant-box catalog-single-variant">${escapeHtml(variantLabel(selected))}</div>
          <button class="catalog-add-button card-cart-button" data-add-to-cart="${escapeAttribute(selected.product_key)}">Add to Inquiry</button>
        </div>
      `;
    }

    return `
      <div class="catalog-quick-buy" data-catalog-variant-picker>
        <select class="catalog-strength-select catalog-variant-box" aria-label="Select strength">
          ${variants.map(variantOption).join("")}
        </select>
        <button class="catalog-add-button card-cart-button" data-add-to-cart="${escapeAttribute(selected.product_key)}">Add to Inquiry</button>
      </div>
    `;
  }

  window.productCard = function productCard(group) {
    const variants = Array.isArray(group) ? group : [group];
    const selected = firstAvailableVariant(variants);
    return `
      <article class="catalog-card" data-catalog-card>
        <div class="catalog-card-main">
          <p>${escapeHtml(selected.category || "Research product")}</p>
          <span data-catalog-sale>${saleBadge(selected)}</span>
          <h2><a href="${productUrl(selected)}" data-catalog-link>${formattedCatalogDisplayName(selected.display_name)}</a></h2>
          <a class="catalog-details-link" href="${productUrl(selected)}" data-catalog-detail-link>View product details <span aria-hidden="true">→</span></a>
          ${catalogQuickBuy(variants)}
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
    const detailLink = card?.querySelector("[data-catalog-detail-link]");
    const button = card?.querySelector(".catalog-add-button");
    const url = option?.dataset?.url || "";
    const key = option?.dataset?.cartKey || option?.value || "";

    if (productLink && url) productLink.href = url;
    if (detailLink && url) detailLink.href = url;
    if (button) {
      button.dataset.addToCart = key;
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.textContent = "Add to Inquiry";
      button.classList.remove("is-added");
      bindCartButtons();
    }
  });
})();
