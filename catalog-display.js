/* PST catalog display refinement: smaller supporting blend/stack formula text. */
(function () {
  function formattedCatalogDisplayName(value) {
    const name = String(value || "").trim();
    const match = name.match(/^(.*?)(\s*\([^()]+\))\s*$/);
    if (!match) return escapeHtml(name);
    const primary = match[1].trimEnd();
    const formula = match[2].trim();
    return `${escapeHtml(primary)} <span class="catalog-formula">${escapeHtml(formula)}</span>`;
  }

  /* app.js defines productCard as a global function in this classic-script page.
     Replace only the catalog heading markup; dose/price/cart behavior remains unchanged. */
  window.productCard = function productCard(group) {
    const variants = Array.isArray(group) ? group : [group];
    const selected = variants[0];
    return `
      <article class="catalog-card" data-catalog-card>
        <div class="catalog-card-main">
          <p>${escapeHtml(selected.category || "Research product")}</p>
          <span data-catalog-sale>${saleBadge(selected)}</span>
          <h2><a href="${productUrl(selected)}" data-catalog-link>${formattedCatalogDisplayName(selected.display_name)}</a></h2>
          ${catalogDoseOptions(variants)}
        </div>
      </article>
    `;
  };

  const style = document.createElement("style");
  style.id = "pst-catalog-formula-style";
  style.textContent = `
    .catalog-card h2 .catalog-formula {
      font-family: Arial, Helvetica, sans-serif !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      line-height: 1 !important;
      letter-spacing: 0 !important;
      white-space: nowrap !important;
    }
    @media (max-width: 700px) {
      .catalog-card h2 .catalog-formula {
        font-size: 11px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
