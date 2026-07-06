PST Product + Customer Style Unification Patch

Upload/replace these files in the repository root:
1. styles.css
2. app.js
3. catalog-inventory-fix.js
4. product.html
5. catalog.html

What this fixes:
- product.html no longer loads catalog-mobile-fix.css. That file is catalog-only.
- product.html now loads current styles/app/inventory patch versions:
  styles.css?v=49
  app.js?v=40
  catalog-inventory-fix.js?v=6
- catalog.html cache versions are also bumped for styles/app/inventory patch while keeping the working catalog-mobile-fix.css?v=7.
- Product detail stock line now has stock classes, so Out of Stock / Limited / In Stock can use the same status system.
- Product detail On Order pill is aligned with the stock text using flex/gap instead of being jammed beside the words.
- catalog-inventory-fix.js now injects On Order badges only inside catalog dose rows. It will not inject an extra On Order pill into product detail purchase panels.
- Product detail mobile layout is tightened so the big name, stock line, and purchase panel fit better.

Test after GitHub Pages finishes:
- https://pepshoptexas.com/product.html?key=PSTP100017&v=14
- https://pepshoptexas.com/catalog.html?v=14

Admin note:
- The customer-facing shared style fixes are included here.
- Admin pages mostly use inline CSS inside each admin HTML page. To safely unify every admin page, upload/send the current admin HTML files together and I will package those separately without writing to GitHub.
