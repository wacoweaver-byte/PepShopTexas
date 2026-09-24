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

  function commonStrengths(variants) {
    const values = variants.map(product => String(product.strength || "").trim().replace(/(\d)\s+(mg|mcg|g|ml|iu)\b/gi, "$1$2")).filter(Boolean);
    return [...new Map(values.map(value => [value.toLowerCase().replace(/\s+/g, ""), value])).values()]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .join(", ");
  }

  window.productCard = function productCard(group) {
    const variants = Array.isArray(group) ? group : [group];
    const selected = variants[0];
    const strengths = commonStrengths(variants);
    const inquiryAction = variants.length > 1
      ? `<a class="catalog-add-button" href="${productUrl(selected)}" aria-label="Choose a strength for ${escapeAttribute(selected.display_name)} to add to inquiry">Add to Inquiry</a>`
      : `<button class="catalog-add-button card-cart-button" data-add-to-cart="${escapeAttribute(selected.product_key)}">Add to Inquiry</button>`;
    return `
      <article class="catalog-card" data-catalog-card>
        <div class="catalog-card-main">
          <p>${escapeHtml(selected.category || "Research product")}</p>
          <h2><a href="${productUrl(selected)}" data-catalog-link>${formattedCatalogDisplayName(selected.display_name)}</a></h2>
          ${strengths ? `<div class="catalog-common-strengths">Common vial strengths are: ${escapeHtml(strengths)}</div>` : ""}
          <a class="catalog-details-link" href="${productUrl(selected)}" data-catalog-detail-link>View product details <span aria-hidden="true">→</span></a>
          <div class="catalog-inquiry-action">${inquiryAction}</div>
        </div>
      </article>
    `;
  };
})();
