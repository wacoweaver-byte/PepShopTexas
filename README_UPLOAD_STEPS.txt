PST Single On Order Badge Fix

This package corrects the On Order behavior:

Expected:
- Desktop/PC catalog: On Order appears once, not twice.
- Mobile catalog: On Order appears once, not twice.
- Add and Out buttons keep the same sizing.

Upload/replace these files in the repo root:
1. catalog.html
2. catalog-mobile-fix.css
3. catalog-inventory-fix.js

Important:
- catalog.html bumps cache versions to:
  catalog-mobile-fix.css?v=3
  catalog-inventory-fix.js?v=4

After GitHub Pages finishes, test:
https://pepshoptexas.com/catalog.html?v=6
