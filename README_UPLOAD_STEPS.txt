PST Product Detail Pill Parity Fix

Upload/replace these files in the repo root:
1. styles.css
2. product.html
3. catalog.html

What changed:
- Product detail status chips and purchase-panel buttons now share:
  same font
  same font size
  same height
  same border radius
  same outline weight
  same center alignment
- Top stock status is now a true pill, not loose text.
- On Order has the same dimensions as the other pills.
- Purchase-panel Out of Stock and View Cart match the same pill system.
- Mobile product detail rules were updated so these controls stay clean on phones.
- product.html and catalog.html bump styles.css to v=50.

No GitHub writes were performed by ChatGPT.

Test after GitHub Pages finishes:
https://pepshoptexas.com/product.html?key=PSTP100017&v=15
https://pepshoptexas.com/catalog.html?v=15
