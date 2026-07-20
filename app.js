const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
const CART_KEY = "pst_cart_v1";
const SUPPORT_EMAIL = "support@pepshoptexas.com";
const ADMIN_ORDER_NOTIFICATION_EMAILS = ["wacoweaver@gmail.com"];
const PRODUCT_FIELDS = "id,product_key,display_name,strength,category,series,description,research_notes,price,current_inventory,is_active,featured,blend_stack,testing_statement,coa_url,coa_label,sort_name,created_at,updated_at,hot_peptide,sale_enabled,sale_price,sale_label";
const PROMOTION_FIELDS = "id,title,body,badge,button_text,button_link,image_url,is_active,starts_at,ends_at,sort_order,accent_color";
const EMAIL_FUNCTION_NAME = "send-order-email";
const PAYMENT_OPTIONS_STORAGE_KEY = "pst_payment_options_v2";
const PAYMENT_LEGACY_STORAGE_KEY = "pst_payment_options_v1";
const STANDARD_SHIPPING_RATE = 12.00;
const TAX_RATES = {
  AL:0.04, AK:0, AZ:0.056, AR:0.065, CA:0.0725,
  CO:0.029, CT:0.0635, DE:0, FL:0.06, GA:0.04,
  HI:0.04, ID:0.06, IL:0.0625, IN:0.07, IA:0.06,
  KS:0.065, KY:0.06, LA:0.05, ME:0.055, MD:0.06,
  MA:0.0625, MI:0.06, MN:0.06875, MS:0.07, MO:0.04225,
  MT:0, NE:0.055, NV:0.0685, NH:0, NJ:0.06625,
  NM:0.04875, NY:0.04, NC:0.0475, ND:0.05, OH:0.0575,
  OK:0.045, OR:0, PA:0.06, RI:0.07, SC:0.06,
  SD:0.042, TN:0.07, TX:0.0625, UT:0.061, VT:0.06,
  VA:0.053, WA:0.065, WV:0.06, WI:0.05, WY:0.04
};
const STATE_ABBREVIATIONS = {
  ALABAMA:"AL", ALASKA:"AK", ARIZONA:"AZ", ARKANSAS:"AR", CALIFORNIA:"CA",
  COLORADO:"CO", CONNECTICUT:"CT", DELAWARE:"DE", FLORIDA:"FL", GEORGIA:"GA",
  HAWAII:"HI", IDAHO:"ID", ILLINOIS:"IL", INDIANA:"IN", IOWA:"IA",
  KANSAS:"KS", KENTUCKY:"KY", LOUISIANA:"LA", MAINE:"ME", MARYLAND:"MD",
  MASSACHUSETTS:"MA", MICHIGAN:"MI", MINNESOTA:"MN", MISSISSIPPI:"MS", MISSOURI:"MO",
  MONTANA:"MT", NEBRASKA:"NE", NEVADA:"NV", "NEW HAMPSHIRE":"NH", "NEW JERSEY":"NJ",
  "NEW MEXICO":"NM", "NEW YORK":"NY", "NORTH CAROLINA":"NC", "NORTH DAKOTA":"ND", OHIO:"OH",
  OKLAHOMA:"OK", OREGON:"OR", PENNSYLVANIA:"PA", "RHODE ISLAND":"RI", "SOUTH CAROLINA":"SC",
  "SOUTH DAKOTA":"SD", TENNESSEE:"TN", TEXAS:"TX", UTAH:"UT", VERMONT:"VT",
  VIRGINIA:"VA", WASHINGTON:"WA", "WEST VIRGINIA":"WV", WISCONSIN:"WI", WYOMING:"WY"
};
const DEFAULT_TAX_REGION = "";
const DEFAULT_PAYMENT_METHODS = [
  { id:"pending", label:"Payment pending", enabled:true, account:"", instructions:"Your order will be reviewed and payment instructions will be confirmed before processing." },
  { id:"venmo", label:"Venmo", enabled:false, account:"", instructions:"Please include your order number in the Venmo note. Your order will remain pending until payment is verified." },
  { id:"zelle", label:"Zelle", enabled:false, account:"", instructions:"Please send payment by Zelle and include your order number if possible. Your order will remain pending until payment is verified." },
  { id:"bitcoin", label:"Bitcoin", enabled:false, account:"", instructions:"Send the exact order total. Your order will remain pending until the transaction is confirmed." },
  { id:"credit_card", label:"Credit Card", enabled:false, account:"", instructions:"Credit card payment instructions will be provided after order review. Your order will remain pending until payment is verified." },
  { id:"apple_pay", label:"Apple Pay", enabled:false, account:"", instructions:"Send payment using Apple Cash / Apple Pay and include your order number. Your order will remain pending until payment is verified." },
  { id:"google_pay", label:"Google Pay", enabled:false, account:"", instructions:"Send payment using Google Pay and include your order number. Your order will remain pending until payment is verified." }
];

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

  setupHeaderAuthState();

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

async function setupHeaderAuthState() {
  const accountLinks = document.querySelectorAll(".main-nav a[href='account.html']");
  if (!pstSupabaseClient) return;

  try {
    const { data: userData } = await pstSupabaseClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      accountLinks.forEach((link) => {
        link.textContent = "LOGIN";
        link.href = `login.html?redirect=${encodeURIComponent(currentPageForRedirect())}`;
      });
      setHeaderAdminLink(false);
      return;
    }

    const profile = await getCustomerProfile(user);
    const firstName = firstNameForHeader(profile, user);
    accountLinks.forEach((link) => {
      link.textContent = `Hello ${firstName}`;
      link.href = "account.html";
    });

    const admin = await getAdminRecordForUser(user);
    const isAdmin = !!admin && (admin.is_active === true || admin.active === true || admin.is_admin === true);
    setHeaderAdminLink(isAdmin);
  } catch (error) {
    console.warn("Header account check failed", error);
  }
}

function setHeaderAdminLink(isAdmin) {
  document.querySelectorAll("[data-admin-link]").forEach((link) => link.remove());
  if (!isAdmin) return;
  document.querySelectorAll(".main-nav").forEach((nav) => {
    const cartLink = nav.querySelector(".cart-link");
    const adminLink = document.createElement("a");
    adminLink.href = "admin.html";
    adminLink.textContent = "ADMIN";
    adminLink.dataset.adminLink = "true";
    nav.insertBefore(adminLink, cartLink || null);
  });
}

async function getAdminRecordForUser(user) {
  const checks = [
    pstSupabaseClient.from("admin_users").select("*").eq("user_id", user.id).maybeSingle(),
    pstSupabaseClient.from("admin_users").select("*").eq("email", user.email).maybeSingle()
  ];
  const results = await Promise.allSettled(checks);
  const rows = results.filter((result) => result.status === "fulfilled" && result.value?.data).map((result) => result.value.data);
  return rows.find((row) => row && (row.is_active === true || row.active === true || row.is_admin === true || row.email === user.email)) || null;
}

function currentPageForRedirect() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  return `${page}${window.location.search || ""}`;
}

function firstNameForHeader(profile = {}, user = {}) {
  const fullName = profile.first_name || profile.full_name || user.user_metadata?.first_name || user.user_metadata?.full_name || user.email || "there";
  return String(fullName).trim().split(/\s+/)[0] || "there";
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
    .order("display_name", { ascending: true })
    .order("strength", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return sortProductsForCatalog(await mergeIncomingInventoryStatus(data || []));
}

async function mergeIncomingInventoryStatus(products = []) {
  const keys = [...new Set((products || []).map((p) => p.product_key).filter(Boolean))];
  if (!keys.length) return products;

  try {
    const incomingRows = await fetchIncomingStatusRows(keys);
    const byKey = new Map((incomingRows || []).map((row) => [String(row.product_key || "").trim(), row]));

    return products.map((product) => {
      const incoming = byKey.get(product.product_key);
      if (!incoming || Number(incoming.incoming_quantity || 0) <= 0) return product;
      return {
        ...product,
        incoming_quantity: Number(incoming.incoming_quantity || 0),
        incoming_status: String(incoming.incoming_status || "ordered").toLowerCase(),
        incoming_expected_arrival_date: incoming.incoming_expected_arrival_date || ""
      };
    });
  } catch (error) {
    console.warn("Incoming inventory status unavailable", error);
    return products;
  }
}

async function fetchIncomingStatusRows(keys = []) {
  const client = requireSupabaseClient();

  const viewResult = await client
    .from("product_incoming_status")
    .select("product_key,incoming_quantity,incoming_status,incoming_expected_arrival_date")
    .in("product_key", keys);

  if (!viewResult.error) return viewResult.data || [];

  console.warn("Incoming status view unavailable; trying safe incoming inventory fallback", viewResult.error);

  const rawResult = await client
    .from("incoming_inventory")
    .select("product_key,ordered_quantity,received_quantity,status,expected_arrival_date")
    .in("product_key", keys)
    .in("status", ["ordered", "in_transit"]);

  if (rawResult.error) throw rawResult.error;

  const byKey = new Map();
  (rawResult.data || []).forEach((row) => {
    const key = String(row.product_key || "").trim();
    if (!key) return;
    const orderedQty = Number(row.ordered_quantity || 0);
    const receivedQty = Number(row.received_quantity || 0);
    const openQty = Math.max(0, orderedQty - receivedQty);
    if (openQty <= 0) return;

    const current = byKey.get(key) || { product_key:key, incoming_quantity:0, statuses:new Set(), dates:[] };
    current.incoming_quantity += openQty;
    current.statuses.add(String(row.status || "ordered").toLowerCase());
    if (row.expected_arrival_date) current.dates.push(row.expected_arrival_date);
    byKey.set(key, current);
  });

  return [...byKey.values()].map((row) => ({
    product_key: row.product_key,
    incoming_quantity: row.incoming_quantity,
    incoming_status: row.statuses.has("in_transit") ? "in_transit" : "ordered",
    incoming_expected_arrival_date: row.dates.sort()[0] || ""
  }));
}

function sortProductsForCatalog(products) {
  return [...products].sort(compareProductsForCatalog);
}

function compareProductsForCatalog(a, b) {
  const nameCompare = compareCatalogText(a?.display_name, b?.display_name);
  if (nameCompare) return nameCompare;
  const strengthCompare = compareDoseStrength(a?.strength, b?.strength);
  if (strengthCompare) return strengthCompare;
  return compareCatalogText(a?.product_key, b?.product_key);
}

function compareCatalogText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function compareDoseStrength(a, b) {
  const aValue = doseSortValue(a);
  const bValue = doseSortValue(b);
  if (aValue !== bValue) return aValue - bValue;
  return compareCatalogText(a, b);
}

function doseSortValue(value) {
  const matches = String(value || "").match(/\d+(?:\.\d+)?/g);
  if (!matches) return Number.POSITIVE_INFINITY;
  return matches.reduce((sum, part) => sum + Number(part || 0), 0);
}

async function getProduct(productKey) {
  const client = requireSupabaseClient();
  const resolvedKey = await resolveProductKey(productKey);
  const { data, error } = await client
    .from("product_catalog")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .eq("product_key", resolvedKey)
    .single();
  if (error) throw error;
  const merged = await mergeIncomingInventoryStatus(data ? [data] : []);
  return merged[0] || data;
}

async function resolveProductKey(productKey) {
  const key = String(productKey || "").trim();
  if (!key || /^PSTP\d+$/i.test(key)) return key;
  try {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("product_key_aliases")
      .select("new_product_key")
      .eq("old_product_key", key)
      .maybeSingle();
    if (!error && data?.new_product_key) return data.new_product_key;
  } catch (error) {
    console.warn("Product key alias lookup failed", error);
  }
  return key;
}

async function renderHome() {
  try {
    const [products, promotions, currentUser] = await Promise.all([getProducts(), getActivePromotions(), getSignedInUser()]);
    const isAdmin = currentUser ? await isAdminUser(currentUser) : false;
    const hot = products.filter((p) => p.hot_peptide || p.featured);
    const stacks = products.filter((p) => p.category === "Stack" || p.blend_stack);
    const newest = [...products].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderHomePromotion(firstVisiblePromotion(promotions, currentUser, { isAdmin }), { isAdmin });
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

function firstVisiblePromotion(promotions, user, context = {}) {
  return (promotions || []).find((promo) => shouldShowPromotion(promo, user, context));
}

function shouldShowPromotion(promo, user, context = {}) {
  if (!promo) return false;
  if (context.isAdmin) return true;
  if (!user) return true;
  return !isAccountCreationPromotion(promo);
}

async function isAdminUser(user) {
  if (!user) return false;
  try {
    const admin = await getAdminRecordForUser(user);
    return !!admin && (admin.is_active === true || admin.active === true || admin.is_admin === true || admin.email === user.email);
  } catch (error) {
    console.warn("Admin promotion preview check failed", error);
    return false;
  }
}

function isAccountCreationPromotion(promo) {
  const href = String(promo.button_link || "").trim().toLowerCase();
  const button = String(promo.button_text || "").trim().toLowerCase();
  const title = String(promo.title || "").trim().toLowerCase();
  const body = String(promo.body || "").trim().toLowerCase();
  return href.includes("register.html") || href.includes("login.html") || button.includes("create account") || title.includes("welcome") || body.includes("create an account");
}
function renderHomePromotion(promo, context = {}) {
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
      ${context.isAdmin ? `<p class="admin-promo-preview-note">Admin preview: this promotion may not apply to your personal account.</p>` : ""}
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
  const heading = document.querySelector(".page-heading h1");
  const eyebrow = document.querySelector(".page-heading p");

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
      const filtered = sortProductsForCatalog(products.filter((product) => {
        const haystack = [product.display_name, product.strength, product.category, product.series, product.product_key].filter(Boolean).join(" ").toLowerCase();
        return (!query || haystack.includes(query)) && (!category || product.category === category);
      }));
      const groups = groupCatalogProducts(filtered);
      updateCatalogHeading({ heading, eyebrow, category, query: searchInput.value.trim(), count: groups.length });
      grid.innerHTML = groups.length ? groups.map(productCard).join("") : `<p class="loading-row">No active products match that filter.</p>`;
      bindCartButtons();
    };

    searchInput.addEventListener("input", draw);
    categoryFilter.addEventListener("change", draw);
    draw();
  } catch (error) {
    grid.innerHTML = `<p class="loading-row">Unable to load products: ${escapeHtml(error.message)}</p>`;
  }
}

function updateCatalogHeading({ heading, eyebrow, category, query, count }) {
  if (!heading || !eyebrow) return;
  const label = category ? `${category}s` : "Peptides A-Z";
  heading.textContent = query ? `Search: ${query}` : label;
  eyebrow.textContent = category || query ? `${count} research product${count === 1 ? "" : "s"}` : "Research products";
}


function productCoaUrl(product = {}) {
  return String(product.coa_url || product.coaUrl || product.testing_url || product.test_report_url || "").trim();
}

function productCoaLabel(product = {}) {
  return String(product.coa_label || product.coaLabel || "").trim() || "View COA";
}

function productCoaMarkup(product = {}) {
  const url = productCoaUrl(product);
  if (!url) return "";
  return `<section class="coa-section"><h2>Testing Documentation</h2><p>Third-party analytical report available for research documentation.</p><a class="coa-button" href="${escapeAttribute(url)}" target="_blank" rel="noopener">${escapeHtml(productCoaLabel(product))}</a></section>`;
}

async function renderProductDetail() {
  const shell = document.querySelector("[data-product-detail]");
  const productKey = params.get("key");
  const legacyId = params.get("id");
  const requestedProduct = productKey || legacyId;
  if (!requestedProduct) {
    shell.innerHTML = `<p class="loading-row">No product was provided.</p>`;
    return;
  }

  try {
    const product = productKey ? await getProduct(productKey) : await getLegacyProduct(legacyId);
    document.title = `${productTitle(product)} | PEP Shop Texas`;
    shell.innerHTML = `
      <div class="product-info">
        <p class="eyebrow">${escapeHtml(product.category || "Research product")}</p>
        ${saleBadge(product)}
        <h1>${escapeHtml(product.display_name)}</h1>
        <p class="strength">${escapeHtml(product.strength || "")}</p>
        <div class="price-line">${priceHtml(product)}</div>
        <p class="stock ${stockClass(product)}"><span class="stock-text">${stockText(product)}</span>${productIncomingPill(product)}</p>
        ${productIncomingNotice(product)}
        <div class="purchase-panel">
          <label>Quantity <input type="number" min="1" max="${Math.max(Number(product.current_inventory || 1), 1)}" value="1" data-detail-qty ${Number(product.current_inventory || 0) <= 0 ? "disabled" : ""}></label>
          <button class="primary-action" data-add-to-cart="${escapeAttribute(product.product_key)}" ${Number(product.current_inventory || 0) <= 0 ? "disabled aria-disabled=\"true\"" : ""}>${Number(product.current_inventory || 0) <= 0 ? "Out of Stock" : "Add to Cart"}</button>
          <a class="secondary-action" href="cart.html">View Cart</a>
        </div>
        <p class="research-use">Research use only. Not for human consumption.</p>
        ${product.description ? `<section><h2>Description</h2><p>${escapeHtml(product.description)}</p></section>` : ""}
        ${product.research_notes ? `<section><h2>Research Notes</h2><p>${escapeHtml(product.research_notes)}</p></section>` : ""}
        ${product.testing_statement ? `<section><h2>Testing</h2><p>${escapeHtml(product.testing_statement)}</p></section>` : ""}
        ${productCoaMarkup(product)}
      </div>
    `;
    bindCartButtons();
  } catch (error) {
    shell.innerHTML = `<p class="loading-row">Unable to load product: ${escapeHtml(error.message)}</p>`;
  }
}

async function getLegacyProduct(value) {
  const requested = normalizeProductLookup(value);
  const products = await getProducts();
  const product = products.find((item) => {
    const candidates = [item.id, item.product_key, productTitle(item), item.display_name].map(normalizeProductLookup);
    return candidates.includes(requested);
  });
  if (!product) throw new Error("That product link is no longer active. Please browse the catalog.");
  return product;
}

function normalizeProductLookup(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function renderCartPage() {
  const itemsNode = document.querySelector("[data-cart-items]");
  const summaryNode = document.querySelector("[data-cart-summary]");
  const cart = readCart();

  try {
    const [products, user, paymentMethods] = await Promise.all([cart.length ? getProducts() : Promise.resolve([]), getSignedInUser(), getPaymentMethods()]);
    const profile = user ? await getCustomerProfile(user) : null;
    const storeCredit = user ? await getAvailableStoreCredit(user, profile) : { balance:0, credits:[] };
    const keyAliases = await productKeyAliasesForCart(cart);
    const rows = cart.map((item) => {
      const resolvedKey = keyAliases[item.key] || item.key;
      const product = products.find((p) => p.product_key === resolvedKey);
      return product ? { product, quantity: item.quantity, cartKey: item.key } : null;
    }).filter(Boolean);

    if (!cart.length) {
      itemsNode.innerHTML = `<div class="empty-cart"><h2>Your cart is empty</h2><p>Add products from the catalog to begin an order.</p><a class="primary-action" href="catalog.html">Browse Products</a></div>`;
    } else {
      itemsNode.innerHTML = rows.map(cartRow).join("");
    }
    summaryNode.innerHTML = summaryHtml(rows, { user, profile, paymentMethods, storeCredit });
    bindCartPageButtons();
  } catch (error) {
    itemsNode.innerHTML = `<p class="loading-row">Unable to load cart: ${escapeHtml(error.message)}</p>`;
    summaryNode.innerHTML = "";
  }
}

function groupCatalogProducts(products) {
  const groups = new Map();
  products.forEach((product) => {
    const key = String(product.display_name || product.product_key || "").trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  });
  return [...groups.values()]
    .map(sortProductsForCatalog)
    .sort((a, b) => compareProductsForCatalog(a[0], b[0]));
}

function productCard(group) {
  const variants = Array.isArray(group) ? group : [group];
  const selected = variants[0];
  return `
    <article class="catalog-card" data-catalog-card>
      <div class="catalog-card-main">
        <p>${escapeHtml(selected.category || "Research product")}</p>
        <span data-catalog-sale>${saleBadge(selected)}</span>
        <h2><a href="${productUrl(selected)}" data-catalog-link>${escapeHtml(selected.display_name)}</a></h2>
        ${catalogDoseOptions(variants)}
      </div>
    </article>
  `;
}

function catalogDoseOptions(variants) {
  const singleClass = variants.length === 1 ? " single-dose" : "";
  return `
    <div class="catalog-dose-options${singleClass}">
      ${variants.map((product) => `
        <div class="catalog-dose-option">
          <a class="catalog-dose-name" href="${productUrl(product)}">${escapeHtml(product.strength || product.product_key)}</a>
          <strong>${priceHtml(product)}</strong>
          <span class="catalog-stock ${stockClass(product)}">${stockText(product)}</span>
          <span class="catalog-row-actions">
            ${productIncomingPill(product)}
            <button class="card-cart-button" data-add-to-cart="${escapeAttribute(product.product_key)}" ${Number(product.current_inventory || 0) <= 0 ? "disabled aria-disabled=\"true\"" : ""}>${Number(product.current_inventory || 0) <= 0 ? "Out" : "Add to Cart"}</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function bindCartButtons() {
  document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
    if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
      const qtyInput = document.querySelector("[data-detail-qty]");
      const quantity = Math.max(Number(qtyInput?.value || 1), 1);
      addToCart(button.dataset.addToCart, quantity);
      button.classList.add("is-added");
      button.innerHTML = "✓ Added";
      button.setAttribute("aria-label", "Added to cart");
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
  const form = document.querySelector("[data-checkout-form]");
  if (form) {
    form.addEventListener("submit", handleCheckoutSubmit);
    const select = form.querySelector("[name='payment_method']");
    const instructions = form.querySelector("[data-payment-instructions]");
    const qrBox = form.querySelector("[data-payment-qr]");
    const addressChoices = form.querySelectorAll("[name='shipping_address_choice']");
    const newAddressFields = form.querySelector("[data-new-shipping-address]");
    const syncPaymentInstructions = () => {
      const option = select?.selectedOptions?.[0];
      const text = option?.dataset?.instructions || "";
      const qr = option?.dataset?.qr || "";
      if (instructions) instructions.textContent = text;
      if (qrBox) qrBox.innerHTML = paymentQrMarkup(qr);
    };
    select?.addEventListener("change", syncPaymentInstructions);
    syncPaymentInstructions();
    const syncShippingAddressChoice = () => {
      const choice = form.querySelector("[name='shipping_address_choice']:checked")?.value || "";
      if (newAddressFields) newAddressFields.hidden = choice !== "new";
      updateCheckoutTaxPreview(form);
    };
    addressChoices.forEach((input) => input.addEventListener("change", syncShippingAddressChoice));
    form.querySelector("[name='new_shipping_state']")?.addEventListener("input", () => updateCheckoutTaxPreview(form));
    syncShippingAddressChoice();
  }
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

function cartRow({ product, quantity, cartKey }) {
  const key = cartKey || product.product_key;
  const available = Number(product.current_inventory || 0);
  const out = available <= 0;
  const over = Number(quantity || 0) > available && available > 0;
  const rowWarning = out
    ? `<p class="checkout-status bad">This item is out of stock and cannot be ordered. ${productIncomingPlainText(product)}</p>`
    : over
      ? `<p class="checkout-status bad">Only ${available} vial(s) available. Reduce quantity before checkout.</p>`
      : productIncomingPlainText(product) ? `<p class="checkout-note">${productIncomingPlainText(product)}</p>` : "";
  return `
    <article class="cart-row">
      <div><h2><a href="${productUrl(product)}">${escapeHtml(productTitle(product))}</a></h2><p>${priceHtml(product)}</p>${rowWarning}</div>
      <input type="number" min="1" max="${Math.max(available, 1)}" value="${quantity}" data-cart-qty="${escapeAttribute(key)}" ${out ? "disabled" : ""}>
      <strong>${formatMoney(unitPrice(product) * quantity)}</strong>
      <button class="cart-remove-button" data-remove-cart="${escapeAttribute(key)}">Remove</button>
    </article>
  `;
}

function summaryHtml(rows, context = {}) {
  const profile = context.profile || {};
  const user = context.user || null;
  const paymentMethods = context.paymentMethods || enabledPaymentMethods(DEFAULT_PAYMENT_METHODS);
  const storeCredit = context.storeCredit || { balance:0, credits:[] };
  const totals = calculateCartTotals(rows, {});
  const unavailable = unavailableCartRows(rows);
  const insufficient = insufficientCartRows(rows);
  const cartBlocked = unavailable.length > 0 || insufficient.length > 0;
  const blockMessage = cartBlocked
    ? `${unavailable.length ? `Out of stock: ${unavailableCartMessage(unavailable)}. ` : ""}${insufficient.length ? `Quantity exceeds available stock: ${unavailableCartMessage(insufficient)}. ` : ""}Remove or update these items before checkout.`
    : "";
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "";
  const email = profile.email || user?.email || "";
  const phone = profile.phone || "";
  const address = profile.shipping_address || profile.address || [profile.address1, profile.address2, profile.shipping_city || profile.city, profile.shipping_state || profile.state, profile.shipping_zip || profile.zip].filter(Boolean).join(", ");
  return `
    <h2>Order Summary</h2>
    <div class="summary-line"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
    <div class="summary-line"><span>Shipping — USPS Priority Mail 3 Day</span><strong>${formatMoney(totals.shipping)}</strong></div>
    <div class="summary-line"><span data-summary-tax-label>Tax ${escapeHtml(totals.taxLabel)}</span><strong data-summary-tax-amount>${totals.taxRegion ? formatMoney(totals.tax) : ""}</strong></div>
    ${storeCredit.balance > 0 ? `<div class="summary-line"><span>Available Store Credit</span><strong>${formatMoney(storeCredit.balance)}</strong></div>` : ""}
    <div class="summary-line summary-total"><span>Total Before Store Credit</span><strong data-summary-total>${formatMoney(totals.total)}</strong></div>
    ${cartBlocked ? `<p class="checkout-status bad">${escapeHtml(blockMessage)}</p>` : `<p class="checkout-note">Submit your order to PEP Shop Texas. It will appear in Order Management for review and payment confirmation.</p>`}
    ${!rows.length ? `
      <p class="checkout-note">${user ? "You are signed in. Add products to your cart when you are ready to place an order." : "Add products to your cart, then log in or create an account to place the order."}</p>
      <a class="primary-action" href="catalog.html">Browse Products</a>
    ` : user ? checkoutFormHtml(rows, { name, email, phone, address, profile, paymentMethods, storeCredit, totals, cartBlocked, blockMessage }) : `
      <p class="checkout-note">Log in or create an account before placing an order so it can be saved to your account.</p>
      <a class="primary-action ${rows.length ? "" : "disabled"}" href="login.html?redirect=cart.html">Log In to Checkout</a>
      <a class="secondary-action" href="register.html">Create Account</a>
    `}
  `;
}

function calculateCartTotals(rows, profile = {}) {
  const subtotal = rows.reduce((sum, row) => sum + unitPrice(row.product) * row.quantity, 0);
  const shipping = rows.length ? STANDARD_SHIPPING_RATE : 0;
  const discount = 0;
  const taxRegion = customerTaxRegion(profile);
  const taxRate = TAX_RATES[taxRegion] || 0;
  const tax = roundMoney(subtotal * taxRate);
  const total = roundMoney(subtotal + shipping + tax - discount);
  return {
    subtotal: roundMoney(subtotal),
    shipping,
    discount,
    tax,
    total,
    taxRate,
    taxRegion,
    taxLabel: taxRate ? `(${taxRegion} ${(taxRate * 100).toFixed(2)}%)` : ""
  };
}

function customerTaxRegion(profile = {}) {
  const rawState = profile.shipping_state || profile.state || DEFAULT_TAX_REGION;
  const state = String(rawState || DEFAULT_TAX_REGION).trim().toUpperCase();
  return STATE_ABBREVIATIONS[state] || state || DEFAULT_TAX_REGION;
}

function updateCheckoutTaxPreview(form) {
  if (!form) return;
  const choice = form.querySelector("[name='shipping_address_choice']:checked")?.value || "";
  const rawState = choice === "on_file"
    ? form.dataset.profileShippingState || ""
    : choice === "new"
      ? form.querySelector("[name='new_shipping_state']")?.value || ""
      : "";
  const taxRegion = customerTaxRegion({ shipping_state:rawState });
  const hasState = Object.prototype.hasOwnProperty.call(TAX_RATES, taxRegion);
  const taxRate = hasState ? TAX_RATES[taxRegion] : 0;
  const subtotal = Number(form.dataset.subtotal || 0);
  const shipping = Number(form.dataset.shipping || 0);
  const tax = hasState ? roundMoney(subtotal * taxRate) : 0;
  const label = document.querySelector("[data-summary-tax-label]");
  const amount = document.querySelector("[data-summary-tax-amount]");
  const total = document.querySelector("[data-summary-total]");
  if (label) label.textContent = hasState ? `Tax (${taxRegion} ${(taxRate * 100).toFixed(2)}%)` : "Tax";
  if (amount) amount.textContent = hasState ? formatMoney(tax) : "";
  if (total) total.textContent = formatMoney(roundMoney(subtotal + shipping + tax));
}

function checkoutShippingAddress(formData, profile = {}, user = {}) {
  const choice = String(formData.get("shipping_address_choice") || "");
  if (choice === "on_file") {
    const address = {
      recipientName: accountCustomerName(profile, user),
      line1: String(profile.shipping_address || profile.address1 || profile.address || "").trim(),
      line2: String(profile.shipping_address2 || profile.address2 || "").trim(),
      city: String(profile.shipping_city || profile.city || "").trim(),
      state: String(profile.shipping_state || profile.state || "").trim(),
      zip: String(profile.shipping_zip || profile.zip || "").trim()
    };
    if (!address.line1 || !address.city || !address.state || !address.zip) throw new Error("The shipping address on file is incomplete. Select a new shipping address.");
    return { ...address, state:validatedShippingState(address.state), save:false };
  }
  if (choice === "new") {
    const address = {
      recipientName: String(formData.get("new_shipping_name") || accountCustomerName(profile, user)).trim(),
      line1: String(formData.get("new_shipping_address1") || "").trim(),
      line2: String(formData.get("new_shipping_address2") || "").trim(),
      city: String(formData.get("new_shipping_city") || "").trim(),
      state: String(formData.get("new_shipping_state") || "").trim(),
      zip: String(formData.get("new_shipping_zip") || "").trim()
    };
    if (!address.recipientName || !address.line1 || !address.city || !address.state || !address.zip) throw new Error("Complete every required new shipping-address field.");
    return { ...address, state:validatedShippingState(address.state), save:true };
  }
  throw new Error("Confirm the shipping address on file or select a new shipping address.");
}

function validatedShippingState(value) {
  const region = customerTaxRegion({ shipping_state:value });
  if (!Object.prototype.hasOwnProperty.call(TAX_RATES, region)) throw new Error("Enter a valid U.S. shipping state.");
  return region;
}

function formattedShippingAddress(address) {
  return [address.line1, address.line2, address.city, address.state, address.zip].filter(Boolean).join(", ");
}

async function saveAdditionalShippingAddress(user, address) {
  const client = requireSupabaseClient();
  const { error } = await client.from("customer_addresses").insert({
    user_id:user.id,
    label:"Additional address",
    recipient_name:address.recipientName,
    address_line1:address.line1,
    address_line2:address.line2 || null,
    city:address.city,
    state:address.state,
    zip:address.zip,
    updated_at:new Date().toISOString()
  });
  if (error) throw new Error(`The additional shipping address could not be saved. ${error.message || error}`);
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getAvailableStoreCredit(user, profile = {}) {
  if (!user) return { balance:0, credits:[] };
  try {
    const client = requireSupabaseClient();
    const email = accountCustomerEmail(profile || {}, user).toLowerCase();
    let query = client
      .from("customer_credits")
      .select("*")
      .eq("status", "available")
      .gt("remaining_amount", 0)
      .order("created_at", { ascending:true });

    const filters = [`user_id.eq.${user.id}`];
    if (email) filters.push(`customer_email.eq.${email}`);
    query = query.or(filters.join(","));

    const { data, error } = await query;
    if (error) throw error;
    const credits = (data || []).map((row) => ({
      ...row,
      remaining_amount: roundMoney(row.remaining_amount ?? row.amount ?? 0)
    })).filter((row) => row.remaining_amount > 0);
    const balance = roundMoney(credits.reduce((sum, row) => sum + row.remaining_amount, 0));
    return { balance, credits };
  } catch (error) {
    console.warn("Store credit unavailable", error);
    return { balance:0, credits:[] };
  }
}

async function consumeStoreCreditForOrder({ user, profile, order, amount, note }) {
  const appliedTotal = roundMoney(amount);
  if (!user || !order || appliedTotal <= 0) return { applied:0, entries:[] };

  const client = requireSupabaseClient();
  const summary = await getAvailableStoreCredit(user, profile);
  let remainingToApply = Math.min(appliedTotal, summary.balance);
  const used = [];
  const now = new Date().toISOString();

  for (const credit of summary.credits) {
    if (remainingToApply <= 0) break;
    const before = roundMoney(credit.remaining_amount);
    const usedAmount = roundMoney(Math.min(before, remainingToApply));
    const after = roundMoney(before - usedAmount);

    const { error:updateError } = await client
      .from("customer_credits")
      .update({
        remaining_amount: after,
        status: after > 0 ? "available" : "used",
        updated_at: now
      })
      .eq("id", credit.id);

    if (updateError) throw updateError;

    await insertWithColumnFallback("customer_credits", {
      id: crypto.randomUUID(),
      user_id: user.id,
      customer_email: accountCustomerEmail(profile || {}, user).toLowerCase(),
      customer_name: accountCustomerName(profile || {}, user),
      amount: -usedAmount,
      remaining_amount: 0,
      reason: note || `Store credit applied to order ${order.order_number || order.id}`,
      related_order_id: order.id,
      related_order_number: order.order_number || "",
      source: "checkout_store_credit",
      status: "used",
      parent_credit_id: credit.id,
      created_at: now,
      updated_at: now
    }).catch((error) => console.warn("Store credit usage ledger row skipped", error));

    used.push({ id: credit.id, amount: usedAmount });
    remainingToApply = roundMoney(remainingToApply - usedAmount);
  }

  return { applied: roundMoney(used.reduce((sum, row) => sum + row.amount, 0)), entries: used };
}

async function getSignedInUser() {
  if (!pstSupabaseClient) return null;
  try {
    const { data } = await pstSupabaseClient.auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

async function getCustomerProfile(user) {
  if (!user) return null;
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("customer_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.warn("Customer profile unavailable", error);
    return { user_id: user.id, email: user.email };
  }
  return data || { user_id: user.id, email: user.email };
}

function accountCustomerName(profile = {}, user = {}) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || user.user_metadata?.full_name || user.email || "Customer";
}

function accountCustomerEmail(profile = {}, user = {}) {
  return profile.email || user.email || "";
}

function accountCustomerPhone(profile = {}) {
  return profile.phone || "";
}

function accountShippingAddress(profile = {}) {
  return profile.shipping_address || profile.address || [
    profile.address1,
    profile.address2,
    profile.shipping_city || profile.city,
    profile.shipping_state || profile.state,
    profile.shipping_zip || profile.zip
  ].filter(Boolean).join(", ");
}

function normalizePaymentMethods(row) {
  let methods = null;
  if (Array.isArray(row)) methods = row;
  else if (row && Array.isArray(row.payment_methods)) methods = row.payment_methods;
  else if (row?.payment_methods && typeof row.payment_methods === "string") {
    try { methods = JSON.parse(row.payment_methods); } catch {}
  }

  const defaults = DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method }));
  const byId = Object.fromEntries(defaults.map((method) => [method.id, method]));
  (methods || []).forEach((method) => {
    const id = String(method.id || method.key || "").trim();
    if (!id || !byId[id]) return;
    byId[id] = {
      ...byId[id],
      ...method,
      enabled: method.enabled === true || String(method.enabled || "").toLowerCase() === "true",
      account: String(method.account || method.handle || method.wallet || method.value || "").trim(),
      instructions: String(method.instructions || method.note || method.notes || byId[id].instructions || "").trim(),
      qr_image: String(method.qr_image || method.qrUrl || method.qr_url || method.qr || method.qr_code || method.qr_code_image || method.qr_image_url || method.image || method.image_url || method.payment_image || "").trim()
    };
  });
  if (row && !Array.isArray(row)) {
    const venmo = byId.venmo;
    if (venmo) {
      venmo.enabled = venmo.enabled || row.venmo_enabled === true || String(row.venmo_enabled || "").toLowerCase() === "true";
      venmo.account = venmo.account || String(row.venmo_handle || "").trim();
      venmo.instructions = venmo.instructions || String(row.venmo_note || "").trim();
      venmo.qr_image = venmo.qr_image || String(row.venmo_qr || row.venmo_qr_image || row.venmo_image || row.qr_image || "").trim();
    }
  }

  return defaults.map((method) => byId[method.id]);
}

function enabledPaymentMethods(methods) {
  const enabled = normalizePaymentMethods(methods).filter((method) => method.enabled);
  return enabled.length ? enabled : [DEFAULT_PAYMENT_METHODS[0]];
}

async function getPaymentMethods() {
  let settings = DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method }));
  try {
    const local = localStorage.getItem(PAYMENT_OPTIONS_STORAGE_KEY) || localStorage.getItem(PAYMENT_LEGACY_STORAGE_KEY);
    if (local) settings = normalizePaymentMethods(JSON.parse(local));
  } catch {}

  try {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("site_payment_options")
      .select("payment_methods, venmo_enabled, venmo_handle, venmo_note, venmo_qr, venmo_qr_image, venmo_image, qr_image")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) settings = normalizePaymentMethods(data);
  } catch (error) {
    console.warn("Payment methods unavailable", error);
  }

  return enabledPaymentMethods(settings);
}

function paymentInstructionsText(method = {}) {
  const accountLine = method.account ? `${method.accountLabel || "Send payment to"}: ${method.account}` : "";
  return [accountLine, method.instructions || ""].filter(Boolean).join(" | ");
}

function paymentQrImage(method = {}) {
  return String(method.qr_image || method.qrUrl || method.qr_url || method.qr || method.qr_code || method.qr_code_image || method.qr_image_url || method.image || method.image_url || method.payment_image || "").trim();
}

function paymentQrMarkup(src = "") {
  const image = String(src || "").trim();
  if (!image) return "";
  return `<div class="payment-qr-wrap" data-payment-qr-wrap style="margin:10px 0 0;"><img data-payment-qr-image src="${escapeAttribute(image)}" alt="Payment QR code" style="width:150px;max-width:100%;border:1px solid #d9e2ec;border-radius:12px;padding:8px;background:#fff;display:block;"></div>`;
}

function unavailableCartRows(rows) {
  return rows.filter((row) => Number(row.product?.current_inventory || 0) <= 0);
}

function insufficientCartRows(rows) {
  return rows.filter((row) => Number(row.quantity || 0) > Number(row.product?.current_inventory || 0));
}

function unavailableCartMessage(rows) {
  if (!rows.length) return "";
  return rows.map((row) => `${productTitle(row.product)} (${stockText(row.product)})`).join(", ");
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("[data-checkout-status]");
  const button = form.querySelector("button[type='submit']");
  const setStatus = (message, tone = "") => {
    if (!status) return;
    status.textContent = message;
    status.className = `checkout-status ${tone}`.trim();
  };

  try {
    if (button) { button.disabled = true; button.textContent = "Submitting..."; }
    setStatus("Submitting order...");

    const user = await requireUser("cart.html");
    if (!user) return;
    const profile = await getCustomerProfile(user);

    const cart = readCart();
    if (!cart.length) throw new Error("Your cart is empty.");

    const products = await getProducts();
    const keyAliases = await productKeyAliasesForCart(cart);
    const rows = cart.map((item) => {
      const resolvedKey = keyAliases[item.key] || item.key;
      const product = products.find((p) => p.product_key === resolvedKey);
      return product ? { product, quantity: Number(item.quantity || 1) } : null;
    }).filter(Boolean);
    if (!rows.length) throw new Error("The products in your cart are no longer available.");

    const unavailable = unavailableCartRows(rows);
    if (unavailable.length) {
      throw new Error(`The following item is currently out of stock and cannot be ordered: ${unavailableCartMessage(unavailable)}. Please remove it from your cart before checkout.`);
    }

    const insufficient = insufficientCartRows(rows);
    if (insufficient.length) {
      throw new Error(`The requested quantity is higher than available inventory for: ${unavailableCartMessage(insufficient)}. Please update your cart quantity before checkout.`);
    }

    const formData = new FormData(form);
    const selectedShippingAddress = checkoutShippingAddress(formData, profile, user);
    if (selectedShippingAddress.save) await saveAdditionalShippingAddress(user, selectedShippingAddress);
    const selectedOption = form.querySelector("[name='payment_method']")?.selectedOptions?.[0];
    const paymentMethod = selectedOption?.dataset?.label || String(formData.get("payment_method") || "Payment pending");
    const paymentInstructions = selectedOption?.dataset?.instructions || "";
    const paymentQr = selectedOption?.dataset?.qr || "";
    const totals = calculateCartTotals(rows, { shipping_state:selectedShippingAddress.state });
    const baseTotal = totals.total;
    const wantsStoreCredit = formData.get("apply_store_credit") === "yes";
    const storeCredit = wantsStoreCredit ? await getAvailableStoreCredit(user, profile) : { balance:0, credits:[] };
    const storeCreditApplied = wantsStoreCredit ? roundMoney(Math.min(storeCredit.balance, baseTotal)) : 0;
    const { subtotal, shipping, tax, discount, taxRate, taxRegion } = totals;
    const total = roundMoney(baseTotal - storeCreditApplied);
    const orderNumberValue = null;
    const now = new Date().toISOString();
    const customerName = accountCustomerName(profile, user);
    const customerEmail = accountCustomerEmail(profile, user);
    const customerPhone = accountCustomerPhone(profile);
    const shippingAddressValue = formattedShippingAddress(selectedShippingAddress);
    const customerNotes = String(formData.get("customer_notes") || "").trim();
    const paymentNote = [
      paymentInstructions ? `Payment method selected: ${paymentMethod} | ${paymentInstructions}` : `Payment method selected: ${paymentMethod}`,
      storeCreditApplied > 0 ? `Store credit applied: ${formatMoney(storeCreditApplied)}` : ""
    ].filter(Boolean).join("\n");
    const orderId = crypto.randomUUID();

    const orderPayload = {
      id: orderId,
      order_number: orderNumberValue,
      user_id: user.id,
      customer_id: user.id,
      customer_uuid: user.id,
      profile_id: profile?.id || user.id,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      shipping_address: shippingAddressValue,
      shipping_name: selectedShippingAddress.recipientName,
      shipping_email: customerEmail,
      shipping_phone: customerPhone,
      shipping_address_line1: selectedShippingAddress.line1,
      shipping_address_line2: selectedShippingAddress.line2 || null,
      shipping_city: selectedShippingAddress.city,
      shipping_state: selectedShippingAddress.state,
      shipping_zip: selectedShippingAddress.zip,
      status: "pending",
      order_status: "pending",
      payment_status: "pending",
      payment_method: paymentMethod,
      payment_instructions_snapshot: paymentInstructions,
      payment_qr_image: paymentQr || null,
      customer_notes: [customerNotes, paymentNote].filter(Boolean).join("\n\n"),
      subtotal,
      discount,
      store_credit_applied: storeCreditApplied,
      shipping,
      tax,
      tax_rate: taxRate,
      tax_region: taxRegion,
      tax_jurisdiction: taxRegion,
      total,
      source: "website_cart",
      created_at: now,
      updated_at: now
    };

    const order = await insertWithColumnFallback("orders", orderPayload);
    const itemPayloads = rows.map(({ product, quantity }) => ({
      order_id: order.id,
      user_id: user.id,
      customer_id: user.id,
      product_id: product.id,
      product_key: product.product_key,
      product_name: product.display_name,
      product_strength: product.strength || "",
      product_category: product.category || "",
      quantity,
      unit_price: unitPrice(product),
      line_total: unitPrice(product) * quantity,
      created_at: now,
      updated_at: now
    }));

    await insertRowsWithColumnFallback("order_items", itemPayloads);

    if (storeCreditApplied > 0) {
      await consumeStoreCreditForOrder({
        user,
        profile,
        order,
        amount: storeCreditApplied,
        note: `Store credit applied to order ${order.order_number || orderNumberValue}`
      });
    }

await sendOrderReceivedEmail(
  { ...order, items: itemPayloads },
  {
    customerName,
    customerEmail,
    customerNumber: profile?.customer_number
      ? `PST-C${profile.customer_number}`
      : "",
    paymentMethod,
    paymentInstructions,
    paymentQr
  }
);

    writeCart([]);
    setStatus(`Order ${order.order_number || orderNumberValue} submitted. It is now in Order Management.`, "good");
    form.innerHTML = `
      <h3>Order Submitted</h3>
      <p class="checkout-status good">Order ${escapeHtml(order.order_number || orderNumberValue)} is now in Order Management.</p>
      <a class="primary-action" href="account.html">View My Account</a>
    `;
    const itemsNode = document.querySelector("[data-cart-items]");
    if (itemsNode) itemsNode.innerHTML = `<div class="empty-cart"><h2>Order submitted</h2><p>Your cart has been cleared.</p><a class="primary-action" href="catalog.html">Browse Products</a></div>`;
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not submit order.", "bad");
    if (button) { button.disabled = false; button.textContent = "Place Order"; }
  }
}

async function nextOrderNumber() {
  const client = requireSupabaseClient();
  const { data } = await client
    .from("orders")
    .select("order_number,created_at")
    .like("order_number", "PST-O%")
    .order("created_at", { ascending: false })
    .limit(100);
  const max = (data || []).reduce((highest, row) => {
    const match = String(row.order_number || "").match(/^PST-O(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 100000);
  return `PST-O${String(max + 1).padStart(6, "0")}`;
}

function missingColumnFromError(error, tableName) {
  const msg = String(error?.message || error || "");
  const patterns = [
    new RegExp(`column\\s+${tableName}\\.([a-zA-Z0-9_]+)\\s+does\\s+not\\s+exist`, "i"),
    new RegExp(`column\\s+\\"?([a-zA-Z0-9_]+)\\"?\\s+of\\s+relation\\s+\\"?${tableName}\\"?\\s+does\\s+not\\s+exist`, "i"),
    new RegExp(`Could not find the ['"]([a-zA-Z0-9_]+)['"] column of ['"]${tableName}['"]`, "i"),
    new RegExp(`Could not find ['"]([a-zA-Z0-9_]+)['"] in the schema cache`, "i"),
    /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i
  ];
  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function insertWithColumnFallback(tableName, payload) {
  const client = requireSupabaseClient();
  const working = { ...payload };
  const maxAttempts = Object.keys(working).length + 5;
  const droppedColumns = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
const { data, error } = await client
  .from(tableName)
  .insert(working)
  .select()
  .single();

if (!error) return data;
    const missing = missingColumnFromError(error, tableName);
    if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
      delete working[missing];
      droppedColumns.push(missing);
      continue;
    }
    throw error;
  }
  throw new Error(`Could not submit ${tableName}; Supabase kept rejecting columns (${droppedColumns.join(", ")}).`);
}

async function insertRowsWithColumnFallback(tableName, rows) {
  if (!rows.length) return [];
  const client = requireSupabaseClient();
  let working = rows.map((row) => ({ ...row }));
  const columnCount = Object.keys(working[0] || {}).length;
  const maxAttempts = columnCount + 5;
  const droppedColumns = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { error } = await client.from(tableName).insert(working);
    if (!error) return working;
    const missing = missingColumnFromError(error, tableName);
    if (missing && working.some((row) => Object.prototype.hasOwnProperty.call(row, missing))) {
      working = working.map((row) => {
        const next = { ...row };
        delete next[missing];
        return next;
      });
      droppedColumns.push(missing);
      continue;
    }
    throw error;
  }
  throw new Error(`Could not submit ${tableName}; Supabase kept rejecting columns (${droppedColumns.join(", ")}).`);
}

async function sendOrderReceivedEmail(order, context = {}) {
  try {
    const payload = buildOrderEmailPayload(order, context, {
      type: "order_placed",
      originalType: "order_placed",
      to: context.customerEmail || order.customer_email || order.email,
      statusNote: context.paymentInstructions || "Your order has been received and is pending payment/processing."
    });

    await postOrderEmailPayload(payload);
    await sendAdminOrderNotificationEmail(order, context, payload);
  } catch (error) {
    console.warn("Order received email did not send", error);
  }
}

function buildOrderEmailPayload(order, context = {}, overrides = {}) {
  return {
    type: overrides.type || "order_placed",
    originalType: overrides.originalType || overrides.type || "order_placed",
    to: overrides.to || context.customerEmail || order.customer_email || order.email,
customerName: context.customerName || order.customer_name || order.name || "Customer",
customerEmail: context.customerEmail || order.customer_email || order.email || "",
customerNumber:
  context.customerNumber ||
  order.customer_number ||
  "",
orderNumber: order.order_number || order.id,
    orderDate: order.created_at,
    subtotal: order.subtotal ?? order.subtotal_amount ?? 0,
    discount: order.discount ?? order.discount_amount ?? 0,
    shipping: order.shipping ?? order.shipping_amount ?? 0,
    tax: order.tax ?? order.tax_amount ?? 0,
    total: order.total ?? order.total_amount ?? order.grand_total ?? 0,
    statusNote: overrides.statusNote || context.paymentInstructions || "Your order has been received and is pending payment/processing.",
    paymentMethod: context.paymentMethod || order.payment_method || "Payment pending",
    paymentStatus: order.payment_status || "pending",
    paymentInstructions: context.paymentInstructions || order.payment_instructions_snapshot || "",
    paymentQr: context.paymentQr || order.payment_qr_image || "",
    paymentQrImage: context.paymentQr || order.payment_qr_image || "",
    items: (order.items || []).map((item) => ({
      name: item.product_name || item.name || item.product_key || "Item",
      quantity: item.quantity || item.qty || 1,
      price: item.unit_price || item.price || 0,
      total: item.line_total || item.total || null
    })),
    ...overrides
  };
}

async function postOrderEmailPayload(payload) {
  const client = requireSupabaseClient();
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData?.session?.access_token || SUPABASE_KEY;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${EMAIL_FUNCTION_NAME}`, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email function failed: ${response.status}${detail ? ` — ${detail}` : ""}`);
  }
}

async function sendAdminOrderNotificationEmail(order, context = {}, customerPayload = null) {
  const recipients = [...new Set((ADMIN_ORDER_NOTIFICATION_EMAILS || []).map((email) => String(email || "").trim()).filter(Boolean))];
  if (!recipients.length) return;

  const customerName = context.customerName || order.customer_name || order.name || "Customer";
  const customerEmail = context.customerEmail || order.customer_email || order.email || "";
  const orderNumber = order.order_number || order.id;
  const paymentMethod = context.paymentMethod || order.payment_method || "Payment pending";
  const total = order.total ?? order.total_amount ?? order.grand_total ?? 0;
  const itemCount = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);

  const adminStatusNote = [
    `New order placed: ${orderNumber}`,
    `Customer: ${customerName}${customerEmail ? ` (${customerEmail})` : ""}`,
    `Payment method: ${paymentMethod}`,
    `Total: ${formatMoney(total)}`,
    `Items: ${itemCount}`
  ].join("\n");

  for (const recipient of recipients) {
    const adminPayload = {
      ...(customerPayload || buildOrderEmailPayload(order, context)),
      type: "order_received",
      originalType: "admin_new_order",
      to: recipient,
      adminNotification: true,
      notificationType: "new_order",
      subject: `New PST order ${orderNumber} — ${customerName}`,
      statusNote: adminStatusNote,
      paymentInstructions: context.paymentInstructions || order.payment_instructions_snapshot || "",
      paymentQr: context.paymentQr || order.payment_qr_image || "",
      paymentQrImage: context.paymentQr || order.payment_qr_image || "",
      paymentMethod,
      customerName,
      customerEmail
    };

    try {
      await postOrderEmailPayload(adminPayload);
    } catch (error) {
      console.warn(`Admin order notification did not send to ${recipient}`, error);
    }
  }
}


function checkoutFormHtml(rows, context) {
  const methods = context.paymentMethods.length ? context.paymentMethods : enabledPaymentMethods(DEFAULT_PAYMENT_METHODS);
  const storeCredit = context.storeCredit || { balance:0, credits:[] };
  const totals = context.totals || calculateCartTotals(rows, {});
  const cartBlocked = context.cartBlocked === true;
  const blockMessage = context.blockMessage || "Update your cart before checkout.";
  const creditPreview = storeCredit.balance > 0 ? Math.min(storeCredit.balance, totals.total) : 0;
  const profile = context.profile || {};
  const profileState = profile.shipping_state || profile.state || "";
  const savedAddress = context.address || "No complete shipping address is currently saved.";
  return `
    <form class="checkout-form" data-checkout-form data-subtotal="${Number(totals.subtotal || 0)}" data-shipping="${Number(totals.shipping || 0)}" data-profile-shipping-state="${escapeAttribute(profileState)}">
      <p class="account-checkout-note">This order will use the contact email and shipping details saved on your account.</p>
      ${storeCredit.balance > 0 ? `
        <label style="display:flex;gap:10px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:14px;color:#101820;">
          <input name="apply_store_credit" type="checkbox" value="yes" style="width:18px;min-height:18px;margin-top:1px;">
          <span><strong>Apply available store credit</strong><br><span class="checkout-note">Available: ${formatMoney(storeCredit.balance)}. This order can use up to ${formatMoney(creditPreview)}.</span></span>
        </label>
      ` : ""}
      <fieldset class="shipping-address-checkout">
        <legend>Confirm Shipping Address</legend>
        <label class="shipping-address-choice"><input type="radio" name="shipping_address_choice" value="on_file" required> <span>${escapeHtml(savedAddress)}</span></label>
        <label class="shipping-address-choice"><input type="radio" name="shipping_address_choice" value="new" required> <span>New address</span></label>
        <div class="new-shipping-address" data-new-shipping-address hidden>
          <label>Recipient Name<input name="new_shipping_name" autocomplete="shipping name"></label>
          <label>Address<input name="new_shipping_address1" autocomplete="shipping address-line1"></label>
          <label>Address Line 2 <span class="optional-field">Optional</span><input name="new_shipping_address2" autocomplete="shipping address-line2"></label>
          <label>City<input name="new_shipping_city" autocomplete="shipping address-level2"></label>
          <label>State<input name="new_shipping_state" autocomplete="shipping address-level1"></label>
          <label>ZIP Code<input name="new_shipping_zip" autocomplete="shipping postal-code"></label>
          <p>This address will be saved to your account as an additional address.</p>
        </div>
      </fieldset>
      <label>Payment Method <select name="payment_method">${methods.map((method) => `<option value="${escapeAttribute(method.id)}" data-label="${escapeAttribute(method.label)}" data-instructions="${escapeAttribute(paymentInstructionsText(method))}" data-qr="${escapeAttribute(paymentQrImage(method))}">${escapeHtml(method.label)}</option>`).join("")}</select></label>
      <p class="payment-instructions" data-payment-instructions></p>
      <div data-payment-qr></div>
      <p class="checkout-note">Shipping is standard flat fee for anywhere in US. Any charges over 12.00 will be paid by PepShopTexas.</p>
      <label>Order Notes <textarea name="customer_notes" placeholder="Optional notes for support"></textarea></label>
      ${cartBlocked ? `<p class="checkout-status bad">${escapeHtml(blockMessage)}</p>` : ""}
      <button class="primary-action" type="submit" ${rows.length && !cartBlocked ? "" : "disabled"}>${cartBlocked ? "Update Cart Before Checkout" : "Place Order"}</button>
      <p class="checkout-status" data-checkout-status></p>
    </form>
  `;
}

async function productKeyAliasesForCart(cart) {
  const legacyKeys = [...new Set(cart.map((item) => String(item.key || "").trim()).filter((key) => key && !/^PSTP\d+$/i.test(key)))];
  if (!legacyKeys.length) return {};
  try {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("product_key_aliases")
      .select("old_product_key,new_product_key")
      .in("old_product_key", legacyKeys);
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [row.old_product_key, row.new_product_key]));
  } catch (error) {
    console.warn("Cart product key alias lookup failed", error);
    return {};
  }
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

function productIncomingLabel(product = {}) {
  const qty = Number(product.incoming_quantity || 0);
  if (qty <= 0) return "";
  const status = String(product.incoming_status || "ordered").toLowerCase();
  if (status === "in_transit") return "In Transit";
  return "On Order";
}

function productIncomingPlainText(product = {}) {
  const label = productIncomingLabel(product);
  if (!label) return "";
  return `${label} / pending arrival. Not available for checkout until received into inventory.`;
}

function productIncomingNotice(product = {}) {
  const text = productIncomingPlainText(product);
  return text ? `<p class="checkout-note">${escapeHtml(text)}</p>` : "";
}

function productIncomingPill(product = {}) {
  const label = productIncomingLabel(product);
  if (!label) return "";
  const text = label === "In Transit" ? "In Transit" : "On Order";
  return `<span class="catalog-incoming-pill">${escapeHtml(text)}</span>`;
}

function stockText(product) {
  const count = Number(product.current_inventory || 0);
  const incoming = productIncomingLabel(product);
  if (count <= 0) return "Out of Stock";
  if (count <= 10) return "Limited";
  return "In Stock";
}

function stockClass(product) {
  const count = Number(product.current_inventory || 0);
  if (count <= 0) return productIncomingLabel(product) ? "out incoming" : "out";
  if (count <= 10) return "limited";
  return "available";
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
