const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
const CART_KEY = "pst_cart_v1";
const SUPPORT_EMAIL = "support@pepshoptexas.com";
const PRODUCT_FIELDS = "id,product_key,display_name,strength,category,series,description,research_notes,price,current_inventory,is_active,featured,blend_stack,testing_statement,sort_name,created_at,updated_at,hot_peptide,sale_enabled,sale_price,sale_label";
const PROMOTION_FIELDS = "id,title,body,badge,button_text,button_link,image_url,is_active,starts_at,ends_at,sort_order,accent_color";

let pstSupabaseClient = null;
const params = new URLSearchParams(window.location.search);

boot();

async function boot() {
  setupGlobalSearch();
  bindCartButtons();
  refreshCartCount();

  try {
    pstSupabaseClient = await waitForSupabaseClient();
  } catch (error) {
    showProductLoadError(error);
    return;
  }

  revealAdminLinksForAdmins();

  const page = document.body.dataset.page;
  if (page === "home") renderHome();
  if (page === "products") renderCatalog();
  if (page === "product-detail") renderProductDetail();
  if (page === "cart") renderCartPage();
  if (page === "login") setupLoginPage();
}

async function waitForSupabaseClient() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (window.supabase?.createClient) {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Supabase did not load. Check connection and refresh.");
}

function setupGlobalSearch() {
  document.querySelectorAll("[data-product-search-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("input[type='search']");
      const query = input?.value.trim() || "";
      window.location.href = query ? `catalog.html?search=${encodeURIComponent(query)}` : "catalog.html";
    });
  });
}

function requireSupabaseClient() {
  if (!pstSupabaseClient) {
    throw new Error("Product loading script did not start. Please refresh the page.");
  }
  return pstSupabaseClient;
}

async function revealAdminLinksForAdmins() {
  const links = document.querySelectorAll("[data-admin-link]");
  if (!links.length || !pstSupabaseClient) return;

  try {
    const { data: userData } = await pstSupabaseClient.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: admin } = await pstSupabaseClient
      .from("admin_users")
      .select("user_id,email,is_active,active,is_admin")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    const isAdmin = !!admin && (admin.is_active === true || admin.active === true || admin.is_admin === true);
    if (isAdmin) links.forEach((link) => { link.hidden = false; });
  } catch (error) {
    console.warn("Admin link check failed", error);
  }
}

function showProductLoadError(error) {
  const message = escapeHtml(error.message || error);
  document.querySelectorAll("[data-home-list]").forEach((list) => {
    list.innerHTML = `<li class="loading-row">Unable to load products: ${message}</li>`;
  });
  const grid = document.querySelector("[data-catalog-grid]");
  if (grid) grid.innerHTML = `<p class="loading-row">Unable to load products: ${message}</p>`;
  const detail = document.querySelector("[data-product-detail]");
  if (detail) detail.innerHTML = `<p class="loading-row">Unable to load product: ${message}</p>`;
  const cart = document.querySelector("[data-cart-items]");
  if (cart) cart.innerHTML = `<p class="loading-row">Unable to load cart: ${message}</p>`;
}

function setupLoginPage() {
  const form = document.querySelector("[data-login-form]");
  const message = document.querySelector("[data-auth-message]");
  const redirectTo = params.get("redirect") || "account.html";

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    message.textContent = "Signing in...";
    const client = requireSupabaseClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      message.textContent = error.message;
      return;
    }
    window.location.href = redirectTo;
  });
}

async function requireUser(redirectTarget) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    const redirect = encodeURIComponent(redirectTarget || window.location.pathname.split("/").pop() || "account.html");
    window.location.href = `login.html?redirect=${redirect}`;
    return null;
  }
  return data.user;
}

async function signOut() {
  const client = requireSupabaseClient();
  await client.auth.signOut();
  window.location.href = "login.html";
}

async function getProducts() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("product_catalog")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .order("sort_name", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getProduct(productKey) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("product_catalog")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .eq("product_key", productKey)
    .single();
  if (error) throw error;
  return data;
}

async function renderHome() {
  try {
    const [products, promotions] = await Promise.all([getProducts(), getActivePromotions()]);
    const hot = products.filter((p) => p.hot_peptide || p.featured);
    const stacks = products.filter((p) => p.category === "Stack" || p.blend_stack);
    const newest = [...products].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderHomePromotion(promotions[0]);
    fillHomeList("hot", hot.length ? hot : products);
    fillHomeList("stacks", stacks.length ? stacks : products);
    fillHomeList("new", newest.length ? newest : products);
  } catch (error) {
    document.querySelectorAll("[data-home-list]").forEach((list) => list.innerHTML = `<li class="loading-row">${escapeHtml(error.message)}</li>`);
  }
}

async function getActivePromotions() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("site_promotions")
    .select(PROMOTION_FIELDS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (error) {
    console.warn("Promotions unavailable", error);
    return [];
  }
  const now = Date.now();
  return (data || []).filter((promo) => {
    const starts = promo.starts_at ? new Date(promo.starts_at).getTime() : 0;
    const ends = promo.ends_at ? new Date(promo.ends_at).getTime() : Infinity;
    return starts <= now && now <= ends;
  });
}

function renderHomePromotion(promo) {
  const shell = document.querySelector("[data-home-promotion]");
  if (!shell) return;
  if (!promo) {
    shell.hidden = true;
    shell.innerHTML = "";
    return;
  }

  const accent = validHexColor(promo.accent_color) || "#bd0000";
  const buttonHref = escapeAttribute(promoButtonHref(promo));
  const buttonText = promo.button_text || promoButtonText(promo);
  shell.hidden = false;
  shell.style.setProperty("--promo-accent", accent);
  shell.innerHTML = `
    <div class="promo-copy">
      ${promo.badge ? `<span>${escapeHtml(promo.badge)}</span>` : ""}
      <strong>${escapeHtml(promo.title || "Current Promotion")}</strong>
      ${promo.body ? `<p>${escapeHtml(promo.body)}</p>` : ""}
    </div>
    ${promo.image_url ? `<img src="${escapeAttribute(promo.image_url)}" alt="">` : ""}
    <a href="${buttonHref}">${escapeHtml(buttonText)}</a>
  `;
}

function promoButtonHref(promo) {
  const href = String(promo.button_link || "").trim();
  if (!href) return "catalog.html";
  return href;
}

function promoButtonText(promo) {
  const href = String(promo.button_link || "").trim().toLowerCase();
  if (href === "register.html" || href === "account.html") return "Create Account";
  return href ? "Learn More" : "Browse Products";
}

function fillHomeList(name, products) {
  const list = document.querySelector(`[data-home-list="${name}"]`);
  list.innerHTML = products.slice(0, 5).map((product) => `
    <li><a href="${productUrl(product)}"><span>${saleText(product)}${escapeHtml(productTitle(product))}</span><strong>${priceHtml(product)}</strong><span>&gt;</span></a></li>
  `).join("");
}

async function renderCatalog() {
  const grid = document.querySelector("[data-catalog-grid]");
  const searchInput = document.querySelector("[data-catalog-search]");
  const categoryFilter = document.querySelector("[data-category-filter]");

  try {
    const products = await getProducts();
    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
    searchInput.value = params.get("search") || "";
    categoryFilter.innerHTML = `<option value="">All categories</option>${categories.map((c) => `<option value="${escapeAttribute(c)}">${escapeHtml(c)}</option>`).join("")}`;
    const requestedCategory = params.get("category") || "";
    categoryFilter.value = categories.includes(requestedCategory) ? requestedCategory : "";

    const draw = () => {
      const query = searchInput.value.trim().toLowerCase();
      const category = categoryFilter.value;
      const filtered = products.filter((product) => {
        const haystack = [product.display_name, product.strength, product.category, product.series, product.product_key].filter(Boolean).join(" ").toLowerCase();
        return (!query || haystack.includes(query)) && (!category || product.category === category);
      });
      grid.innerHTML = filtered.length ? filtered.map(productCard).join("") : `<p class="loading-row">No active products match that filter.</p>`;
      bindCartButtons();
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
      <div class="product-info">
        <p class="eyebrow">${escapeHtml(product.category || "Research product")}</p>
        ${saleBadge(product)}
        <h1>${escapeHtml(product.display_name)}</h1>
        <p class="strength">${escapeHtml(product.strength || "")}</p>
        <div class="price-line">${priceHtml(product)}</div>
        <p class="stock">${stockText(product)}</p>
        <div class="purchase-panel">
          <label>Quantity <input type="number" min="1" max="${Math.max(Number(product.current_inventory || 1), 1)}" value="1" data-detail-qty></label>
          <button class="primary-action" data-add-to-cart="${escapeAttribute(product.product_key)}">Add to Cart</button>
          <a class="secondary-action" href="cart.html">View Cart</a>
        </div>
        <p class="research-use">Research use only. Not for human consumption.</p>
        ${product.description ? `<section><h2>Description</h2><p>${escapeHtml(product.description)}</p></section>` : ""}
        ${product.research_notes ? `<section><h2>Research Notes</h2><p>${escapeHtml(product.research_notes)}</p></section>` : ""}
        ${product.testing_statement ? `<section><h2>Testing</h2><p>${escapeHtml(product.testing_statement)}</p></section>` : ""}
      </div>
    `;
    bindCartButtons();
  } catch (error) {
    shell.innerHTML = `<p class="loading-row">Unable to load product: ${escapeHtml(error.message)}</p>`;
  }
}

async function renderCartPage() {
  const itemsNode = document.querySelector("[data-cart-items]");
  const summaryNode = document.querySelector("[data-cart-summary]");
  const cart = readCart();
  if (!cart.length) {
    itemsNode.innerHTML = `<div class="empty-cart"><h2>Your cart is empty</h2><p>Add products from the catalog to begin an order.</p><a class="primary-action" href="catalog.html">Browse Products</a></div>`;
    summaryNode.innerHTML = summaryHtml([]);
    return;
  }

  try {
    const products = await getProducts();
    const rows = cart.map((item) => {
      const product = products.find((p) => p.product_key === item.key);
      return product ? { product, quantity: item.quantity } : null;
    }).filter(Boolean);

    itemsNode.innerHTML = rows.map(cartRow).join("");
    summaryNode.innerHTML = summaryHtml(rows);
    bindCartPageButtons();
  } catch (error) {
    itemsNode.innerHTML = `<p class="loading-row">Unable to load cart: ${escapeHtml(error.message)}</p>`;
    summaryNode.innerHTML = "";
  }
}

function productCard(product) {
  return `
    <article class="catalog-card">
      <a class="catalog-card-main" href="${productUrl(product)}">
        <div><p>${escapeHtml(product.category || "Research product")}</p>${saleBadge(product)}<h2>${escapeHtml(product.display_name)}</h2><span>${escapeHtml(product.strength || "")}</span><strong>${priceHtml(product)}</strong></div>
      </a>
      <button class="card-cart-button" data-add-to-cart="${escapeAttribute(product.product_key)}">Add to Cart</button>
    </article>
  `;
}

function bindCartButtons() {
  document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const qtyInput = document.querySelector("[data-detail-qty]");
      const quantity = Math.max(Number(qtyInput?.value || 1), 1);
      addToCart(button.dataset.addToCart, quantity);
      button.textContent = "Added";
      setTimeout(() => button.textContent = "Add to Cart", 900);
    });
  });
}

function bindCartPageButtons() {
  document.querySelectorAll("[data-cart-qty]").forEach((input) => {
    input.addEventListener("change", () => setCartQuantity(input.dataset.cartQty, Number(input.value)));
  });
  document.querySelectorAll("[data-remove-cart]").forEach((button) => {
    button.addEventListener("click", () => setCartQuantity(button.dataset.removeCart, 0));
  });
}

function addToCart(key, quantity) {
  const cart = readCart();
  const existing = cart.find((item) => item.key === key);
  if (existing) existing.quantity += quantity;
  else cart.push({ key, quantity });
  writeCart(cart);
}

function setCartQuantity(key, quantity) {
  const next = readCart().map((item) => item.key === key ? { ...item, quantity } : item).filter((item) => item.quantity > 0);
  writeCart(next);
  renderCartPage();
}

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item.key && item.quantity > 0) : [];
  } catch {
    return [];
  }
}

function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  refreshCartCount();
}

function refreshCartCount() {
  const count = readCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => node.textContent = String(count));
}

function cartRow({ product, quantity }) {
  return `
    <article class="cart-row">
      <div><h2><a href="${productUrl(product)}">${escapeHtml(productTitle(product))}</a></h2><p>${priceHtml(product)}</p></div>
      <input type="number" min="1" value="${quantity}" data-cart-qty="${escapeAttribute(product.product_key)}">
      <strong>${formatMoney(unitPrice(product) * quantity)}</strong>
      <button data-remove-cart="${escapeAttribute(product.product_key)}">Remove</button>
    </article>
  `;
}

function summaryHtml(rows) {
  const subtotal = rows.reduce((sum, row) => sum + unitPrice(row.product) * row.quantity, 0);
  const body = encodeURIComponent(orderEmailBody(rows, subtotal));
  return `
    <h2>Order Summary</h2>
    <div class="summary-line"><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
    <p>Checkout is not connected yet. Use this cart to prepare the order, then send it to support.</p>
    <a class="primary-action ${rows.length ? "" : "disabled"}" href="mailto:${SUPPORT_EMAIL}?subject=PEP%20Shop%20Texas%20Order&body=${body}">Email Order</a>
  `;
}

function orderEmailBody(rows, subtotal) {
  if (!rows.length) return "Cart is empty.";
  const lines = rows.map(({ product, quantity }) => `${quantity} x ${productTitle(product)} (${product.product_key}) - ${formatMoney(unitPrice(product) * quantity)}`);
  return [`Research product order request:`, "", ...lines, "", `Subtotal: ${formatMoney(subtotal)}`].join("\n");
}

function productUrl(product) {
  return `product.html?key=${encodeURIComponent(product.product_key)}`;
}

function productTitle(product) {
  return [product.display_name, product.strength].filter(Boolean).join(" ");
}

function unitPrice(product) {
  return Number(product.sale_enabled && product.sale_price ? product.sale_price : product.price || 0);
}

function priceHtml(product) {
  const regular = formatMoney(product.price);
  if (product.sale_enabled && product.sale_price) return `<span class="sale-price">${formatMoney(product.sale_price)}</span> <s>${regular}</s>`;
  return regular;
}

function saleBadge(product) {
  if (!product.sale_enabled) return "";
  return `<span class="sale-badge">${escapeHtml(product.sale_label || "Sale")}</span>`;
}

function saleText(product) {
  if (!product.sale_enabled) return "";
  return `${escapeHtml(product.sale_label || "Sale")}: `;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function stockText(product) {
  const count = Number(product.current_inventory || 0);
  if (count <= 0) return "Out of stock";
  if (count <= 10) return "Limited stock";
  return "In stock";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function validHexColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}
