import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";

const PRODUCT_FIELDS = [
  "id",
  "product_key",
  "display_name",
  "strength",
  "category",
  "series",
  "description",
  "research_notes",
  "price",
  "current_inventory",
  "is_active",
  "featured",
  "blend_stack",
  "image_file",
  "image_data",
  "testing_statement",
  "sort_name",
  "created_at",
  "updated_at",
  "hot_peptide",
  "sale_enabled",
  "sale_price",
  "sale_label"
].join(",");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const params = new URLSearchParams(window.location.search);

setupGlobalSearch();

if (document.body.dataset.page === "home") {
  renderHome();
}

if (document.body.dataset.page === "products") {
  renderCatalog();
}

if (document.body.dataset.page === "product-detail") {
  renderProductDetail();
}

function setupGlobalSearch() {
  document.querySelectorAll("[data-product-search-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("input[type='search']");
      const query = input.value.trim();
      const suffix = query ? `?search=${encodeURIComponent(query)}` : "";
      window.location.href = `products.html${suffix}`;
    });
  });
}

async function getProducts() {
  const { data, error } = await supabase
    .from("product_catalog")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .order("sort_name", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getProduct(productKey) {
  const { data, error } = await supabase
    .from("product_catalog")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .eq("product_key", productKey)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function renderHome() {
  try {
    const products = await getProducts();
    const hot = products.filter((product) => product.hot_peptide || product.featured);
    const stacks = products.filter((product) => product.blend_stack || product.category === "Blend");
    const newest = [...products].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    fillHomeList("hot", hot.length ? hot : products, "View");
    fillHomeList("stacks", stacks.length ? stacks : products, "View");
    fillHomeList("new", newest.length ? newest : products, "View");
  } catch (error) {
    showListError("hot", error);
    showListError("stacks", error);
    showListError("new", error);
  }
}

function fillHomeList(name, products, label) {
  const list = document.querySelector(`[data-home-list="${name}"]`);
  if (!list) return;

  list.innerHTML = products.slice(0, 5).map((product) => `
    <li>
      <a href="${productUrl(product)}">
        <span>${escapeHtml(productTitle(product))}</span>
        <strong>${escapeHtml(label)}</strong>
        <span aria-hidden="true">›</span>
      </a>
    </li>
  `).join("");
}

function showListError(name, error) {
  const list = document.querySelector(`[data-home-list="${name}"]`);
  if (list) {
    list.innerHTML = `<li class="loading-row">Unable to load products: ${escapeHtml(error.message)}</li>`;
  }
}

async function renderCatalog() {
  const grid = document.querySelector("[data-catalog-grid]");
  const searchInput = document.querySelector("[data-catalog-search]");
  const categoryFilter = document.querySelector("[data-category-filter]");

  try {
    const products = await getProducts();
    const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
    const startingSearch = params.get("search") ?? "";
    const startingCategory = params.get("category") ?? "";

    searchInput.value = startingSearch;
    categoryFilter.innerHTML = `<option value="">All categories</option>${categories.map((category) => (
      `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`
    )).join("")}`;
    categoryFilter.value = startingCategory;

    const draw = () => {
      const query = searchInput.value.trim().toLowerCase();
      const category = categoryFilter.value;
      const filtered = products.filter((product) => {
        const haystack = [
          product.display_name,
          product.strength,
          product.category,
          product.series,
          product.product_key
        ].filter(Boolean).join(" ").toLowerCase();

        return (!query || haystack.includes(query)) && (!category || product.category === category);
      });

      grid.innerHTML = filtered.length
        ? filtered.map(productCard).join("")
        : `<p class="loading-row">No active products match that filter.</p>`;
    };

    searchInput.addEventListener("input", draw);
    categoryFilter.addEventListener("change", draw);
    draw();
  } catch (error) {
    grid.innerHTML = `<p class="loading-row">Unable to load products: ${escapeHtml(error.message)}</p>`;
  }
}

async function renderProductDetail() {
  const shell = document.querySelector("[data-product-detail]");
  const productKey = params.get("key");

  if (!productKey) {
    shell.innerHTML = `<p class="loading-row">No product key was provided.</p>`;
    return;
  }

  try {
    const product = await getProduct(productKey);
    document.title = `${productTitle(product)} | PEP Shop Texas`;
    shell.innerHTML = `
      <div class="product-media">
        ${productImage(product)}
      </div>
      <div class="product-info">
        <p class="eyebrow">${escapeHtml(product.category || "Research product")}</p>
        <h1>${escapeHtml(product.display_name)}</h1>
        <p class="strength">${escapeHtml(product.strength || "")}</p>
        <div class="price-line">${priceHtml(product)}</div>
        <p class="stock">${stockText(product)}</p>
        <p class="research-use">Research use only. Not for human consumption.</p>
        ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
        ${product.research_notes ? `<section><h2>Research Notes</h2><p>${escapeHtml(product.research_notes)}</p></section>` : ""}
        ${product.testing_statement ? `<section><h2>Testing</h2><p>${escapeHtml(product.testing_statement)}</p></section>` : ""}
      </div>
    `;
  } catch (error) {
    shell.innerHTML = `<p class="loading-row">Unable to load product: ${escapeHtml(error.message)}</p>`;
  }
}

function productCard(product) {
  return `
    <a class="catalog-card" href="${productUrl(product)}">
      <div class="catalog-image">${productImage(product)}</div>
      <div>
        <p>${escapeHtml(product.category || "Research product")}</p>
        <h2>${escapeHtml(product.display_name)}</h2>
        <span>${escapeHtml(product.strength || "")}</span>
        <strong>${priceHtml(product)}</strong>
      </div>
    </a>
  `;
}

function productUrl(product) {
  return `product.html?key=${encodeURIComponent(product.product_key)}`;
}

function productTitle(product) {
  return [product.display_name, product.strength].filter(Boolean).join(" ");
}

function priceHtml(product) {
  const regular = formatMoney(product.price);
  if (product.sale_enabled && product.sale_price) {
    return `<span class="sale-price">${formatMoney(product.sale_price)}</span> <s>${regular}</s>`;
  }
  return regular;
}

function formatMoney(value) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function stockText(product) {
  const count = Number(product.current_inventory ?? 0);
  if (count <= 0) return "Out of stock";
  if (count <= 10) return "Limited stock";
  return "In stock";
}

function productImage(product) {
  const src = product.image_data || product.image_file;
  if (src) {
    return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(productTitle(product))}">`;
  }
  return `<div class="image-placeholder"><span>PST</span><small>${escapeHtml(product.strength || "Research")}</small></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
