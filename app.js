const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
const CART_KEY = "pst_cart_v1";
const REORDER_NOTICE_KEY = "pst_reorder_notice_v1";
const SUPPORT_EMAIL = "support@pepshoptexas.com";
const ADMIN_ORDER_NOTIFICATION_EMAILS = ["wacoweaver@gmail.com"];
const PRODUCT_FIELDS = "id,product_key,display_name,strength,category,research_focus,series,description,research_notes,price,current_inventory,low_stock_threshold,limited_stock_threshold,is_active,featured,blend_stack,testing_statement,sort_name,created_at,updated_at,hot_peptide,sale_enabled,sale_price,sale_label";
const PROMOTION_FIELDS = "id,title,body,badge,button_text,button_link,image_url,is_active,starts_at,ends_at,sort_order,accent_color";
const EMAIL_FUNCTION_NAME = "send-order-email";
const PAYMENT_OPTIONS_STORAGE_KEY = "pst_payment_options_v2";
const PAYMENT_LEGACY_STORAGE_KEY = "pst_payment_options_v1";
const STANDARD_SHIPPING_RATE = 12.00;
const FREE_SHIPPING_THRESHOLD = 250.00;
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
  { id:"pending", label:"Payment pending", enabled:true, discountPercent:0, account:"", instructions:"Your order will be reviewed and payment instructions will be confirmed before processing." },
  { id:"venmo", label:"Venmo", enabled:false, discountPercent:0, account:"", instructions:"Please include your order number in the Venmo note. Your order will remain pending until payment is verified." },
  { id:"zelle", label:"Zelle", enabled:false, discountPercent:5, account:"", instructions:"Please send payment by Zelle and include your order number if possible. Your order will remain pending until payment is verified." },
  { id:"bitcoin", label:"Bitcoin", enabled:false, discountPercent:10, account:"", instructions:"Send the exact order total. Your order will remain pending until the transaction is confirmed." },
  { id:"credit_card", label:"Credit Card", enabled:false, discountPercent:0, account:"", instructions:"Credit card payment instructions will be provided after order review. Your order will remain pending until payment is verified." },
  { id:"apple_pay", label:"Apple Pay", enabled:false, discountPercent:5, account:"", instructions:"Send payment using Apple Cash / Apple Pay and include your order number. Your order will remain pending until payment is verified." },
  { id:"google_pay", label:"Google Pay", enabled:false, discountPercent:0, account:"", instructions:"Send payment using Google Pay and include your order number. Your order will remain pending until payment is verified." }
];

let pstSupabaseClient = null;
let appliedCartDiscount = null;
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
  const accountLinks = document.querySelectorAll("[data-account-link], .main-nav a[href='account.html']");
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
    placeCustomerHeaderIdentity();
  } catch (error) {
    console.warn("Header account check failed", error);
  }
}

function placeCustomerHeaderIdentity() {
  document.querySelectorAll(".pst-customer-header-inner").forEach((header) => {
    const logo = header.querySelector(".pst-customer-logo-link");
    const account = header.querySelector("[data-account-link]");
    const admin = header.querySelector("[data-admin-link]");
    if (!logo || !account || !admin) return;

    let identity = header.querySelector(".pst-customer-identity");
    if (!identity) {
      identity = document.createElement("div");
      identity.className = "pst-customer-identity";
      identity.setAttribute("aria-label", "Account and administration");
      logo.insertAdjacentElement("afterend", identity);
    }

    identity.append(account, admin);
  });
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
  if (cart) cart.innerHTML = `<p class="loading-row">Unable to load inquiry: ${message}</p>`;
}

function setupLoginPage() {
  const form = document.querySelector("[data-login-form]");
  const message = document.querySelector("[data-auth-message]");
  const redirectTo = safeLocalRedirect(params.get("redirect"), "account.html");

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

function safeLocalRedirect(value, fallback = "account.html") {
  const target = String(value || "").trim();
  if (!target || target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return fallback;
  try {
    const resolved = new URL(target, window.location.href);
    if (resolved.origin !== window.location.origin) return fallback;
    const page = resolved.pathname.split("/").pop() || fallback;
    return `${page}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
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
  const productKeys = Array.from(new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean)));
  if (!productKeys.length) return [];

  const { data, error } = await client.rpc("get_public_product_incoming_status", {
    p_product_keys: productKeys
  });

  if (error) throw error;
  return data || [];
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
    const products = await getProducts();
    const hot = products.filter((p) => p.hot_peptide || p.featured);
    const stacks = products.filter((p) => p.category === "Stack" || p.blend_stack);
    const newest = [...products].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderHomePromotion(null);
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

function normalizedResearchFocuses(value) {
  const allowed = new Set(["performance", "recovery", "longevity"]);
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(raw.map((item) => String(item || "").trim().toLowerCase()).filter((item) => allowed.has(item)))];
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
    categoryFilter.innerHTML = `<option value="">All categories</option>${categories.map((c) => `<option value="${escapeAttribute(c)}">${escapeHtml(catalogCategoryLabel(c))}</option>`).join("")}`;
    const requestedCategoryParam = params.get("category") || "";
    const requestedCategory = ["Blend", "Stack"].includes(requestedCategoryParam) ? "Multi-Peptide Product" : requestedCategoryParam;
    const requestedFocus = String(params.get("focus") || "").trim().toLowerCase();
    const validFocus = ["performance", "recovery", "longevity"].includes(requestedFocus) ? requestedFocus : "";
    categoryFilter.value = categories.includes(requestedCategory) ? requestedCategory : "";

    const draw = () => {
      const query = searchInput.value.trim().toLowerCase();
      const category = categoryFilter.value;
      const filtered = sortProductsForCatalog(products.filter((product) => {
        const productFocuses = normalizedResearchFocuses(product.research_focus);
        const haystack = [product.display_name, product.strength, product.category, ...productFocuses, product.series, product.product_key].filter(Boolean).join(" ").toLowerCase();
        return (!query || haystack.includes(query))
          && (!category || product.category === category)
          && (!validFocus || productFocuses.includes(validFocus));
      }));
      const groups = groupCatalogProducts(filtered);
      updateCatalogHeading({ heading, eyebrow, category, focus: validFocus, query: searchInput.value.trim(), count: groups.length });
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

function catalogCategoryLabel(category, plural = false) {
  const value = String(category || "");
  if (value === "Stack" || value === "Blend" || value === "Multi-Peptide Product") return "Research Blends";
  if (!plural) return value;
  return { Peptide: "Peptides", Blend: "Blends", Supply: "Supplies" }[value] || `${value}s`;
}

function updateCatalogHeading({ heading, eyebrow, category, focus, query, count }) {
  if (!heading || !eyebrow) return;
  const focusLabel = focus ? focus.charAt(0).toUpperCase() + focus.slice(1) : "";
  const label = focusLabel || (category ? catalogCategoryLabel(category, true) : "Peptides A-Z");
  heading.textContent = query ? `Search: ${query}` : label;
  eyebrow.textContent = category || focus || query ? `${count} research product${count === 1 ? "" : "s"}` : "Research products";
}


function researchNotesMarkup(notes = "") {
  const text = String(notes || "").trim();
  if (!text) return "";

  const sanitizeRichText = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    const allowed = new Set(["P", "DIV", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "BR"]);
    [...template.content.querySelectorAll("*")].forEach((el) => {
      if (!allowed.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    });
    return template.innerHTML;
  };

  if (/<\/?(?:p|div|ul|ol|li|strong|b|em|i)\b/i.test(text)) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeRichText(text);

    // Normalize editor-generated rich text so the storefront always matches
    // the intended Research Notes hierarchy.
    [...template.content.querySelectorAll("p, div")].forEach((el) => {
      const label = String(el.textContent || "").trim();
      if (/^(?:mechanism of action|benefits)$/i.test(label)) {
        const heading = document.createElement("h3");
        heading.className = "research-notes-heading";
        heading.textContent = label;
        el.replaceWith(heading);
      }
    });

    const firstTextBlock = template.content.querySelector("p, div");
    if (firstTextBlock && !firstTextBlock.querySelector("strong, b")) {
      const label = String(firstTextBlock.textContent || "").trim();
      if (/^[A-Z0-9][A-Za-z0-9+\- ]{1,40}$/.test(label) && !/[.!?]$/.test(label)) {
        firstTextBlock.classList.add("research-notes-title");
        firstTextBlock.innerHTML = `<strong>${escapeHtml(label)}</strong>`;
      }
    }

    template.content.querySelectorAll("ul").forEach((list) => list.classList.add("research-notes-list"));
    template.content.querySelectorAll("li").forEach((item) => {
      if (item.querySelector("strong, b")) return;
      const value = String(item.textContent || "").trim();
      const match = value.match(/^(.+?)\s+[—–-]\s+(.+)$/);
      if (match) {
        item.innerHTML = `<strong>${escapeHtml(match[1].trim())}</strong> — ${escapeHtml(match[2].trim())}`;
      }
    });

    return sanitizeRichText(template.innerHTML);
  }

  // Legacy plain text: preserve headings/paragraphs and turn benefit lines into
  // the same rich-text hierarchy used by the Products editor.
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    let html = "";
    let inList = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    lines.forEach((line) => {
      const bullet = line.match(/^(?:[-•*]\s*)(.+)$/);
      if (bullet) {
        if (!inList) { html += '<ul class="research-notes-list">'; inList = true; }
        const item = bullet[1];
        const parts = item.split(/\s+[—–-]\s+/, 2);
        html += parts.length === 2
          ? `<li><strong>${escapeHtml(parts[0])}</strong> — ${escapeHtml(parts[1])}</li>`
          : `<li>${escapeHtml(item)}</li>`;
        return;
      }
      closeList();
      if (/^(?:mechanism of action|benefits)$/i.test(line)) {
        html += `<h3 class="research-notes-heading">${escapeHtml(line)}</h3>`;
      } else if (/^[A-Z0-9][A-Za-z0-9+\- ]{1,40}$/.test(line) && !/[.!?]$/.test(line)) {
        html += `<p class="research-notes-title"><strong>${escapeHtml(line)}</strong></p>`;
      } else {
        html += `<p>${escapeHtml(line)}</p>`;
      }
    });
    closeList();
    return html;
  }

  return `<p>${escapeHtml(text)}</p>`;
}

function productDetailVariantLabel(product = {}) {
  const strength = product.strength || product.product_key;
  return strength;
}

function productDetailVariantSelector(variants = [], selected = {}) {
  if (variants.length <= 1) {
    return `<p class="strength">${escapeHtml(selected.strength || "")}</p>`;
  }

  return `
    <label class="detail-variant-picker">
      <span>Strength</span>
      <select class="detail-variant-select" data-detail-variant-select aria-label="Select strength">
        ${variants.map((variant) => `
          <option value="${escapeAttribute(productUrl(variant))}" ${variant.product_key === selected.product_key ? "selected" : ""}>${escapeHtml(productDetailVariantLabel(variant))}</option>
        `).join("")}
      </select>
    </label>
  `;
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
    const variants = (await getProducts()).filter((item) =>
      String(item.display_name || "").trim().toLowerCase() === String(product.display_name || "").trim().toLowerCase()
    );
    document.title = `${productTitle(product)} | PEP Shop Texas`;
    shell.innerHTML = `
      <div class="product-info">
        <p class="eyebrow">${escapeHtml(product.category || "Research product")}</p>
        ${saleBadge(product)}
        <h1>${escapeHtml(product.display_name)}</h1>
        ${productDetailVariantSelector(variants, product)}
        <div class="purchase-panel">
          <label>Quantity <input type="number" min="1" max="9999" step="1" value="1" data-detail-qty></label>
          <button class="primary-action" data-add-to-cart="${escapeAttribute(product.product_key)}">Add to Inquiry</button>
          <a class="secondary-action" href="cart.html">View Inquiry</a>
        </div>
        <p class="research-use">Research use only. Not for human consumption.</p>
        ${product.description ? `<section><h2>Description</h2><p>${escapeHtml(product.description)}</p></section>` : ""}
        ${product.research_notes ? `<section><h2>Research Notes</h2>${researchNotesMarkup(product.research_notes)}</section>` : ""}
      </div>
    `;
    shell.querySelector("[data-detail-variant-select]")?.addEventListener("change", (event) => {
      const target = String(event.target.value || "");
      if (target) window.location.href = target;
    });
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
  const draft = {};
  summaryNode.querySelectorAll("input, textarea").forEach(input => draft[input.name] = input.value);
  try {
    const products = cart.length ? await getProducts() : [];
    const aliases = await productKeyAliasesForCart(cart);
    const rows = cart.map(item => ({
      product: products.find(p => p.product_key === (aliases[item.key] || item.key)),
      quantity: item.quantity, cartKey: item.key
    }));
    itemsNode.innerHTML = rows.length ? rows.map(inquiryRow).join("") :
      '<div class="empty-cart"><h2>Your inquiry is empty</h2><p>Add products to request information.</p><a class="primary-action" href="catalog.html">Browse Products</a></div>';
    summaryNode.innerHTML = `<h2>Email Your Inquiry</h2>
      <p>Request pricing and availability for your selected items.</p>
      <form class="inquiry-form" data-inquiry-form>
        <label>Name<input name="name" autocomplete="name" required maxlength="120"></label>
        <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>Notes (optional)<textarea name="notes" rows="4" maxlength="2000"></textarea></label>
        <button type="submit" class="primary-action" ${rows.length ? "" : "disabled"}>Email Inquiry Request</button>
        <p>Opens your email app with your item list. Review the message and press Send to email ${escapeHtml(SUPPORT_EMAIL)}.</p>
        <p>This is an inquiry, not an order. No payment is collected.</p>
        <label>Inquiry details<textarea data-inquiry-copy rows="7" readonly aria-label="Inquiry details to copy"></textarea></label>
        <p>If your email app does not open, copy these details into an email to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
        <p role="status" data-inquiry-status></p>
      </form>`;
    const form = summaryNode.querySelector("form");
    Object.entries(draft).forEach(([name, value]) => { if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value; });
    const update = () => {
      const body = inquiryEmailBody(rows, new FormData(form));
      form.querySelector("[data-inquiry-copy]").value = body;
      return body;
    };
    form.addEventListener("input", update);
    update();
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!rows.length || !form.reportValidity()) return;
      const body = update();
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Product Inquiry Request — PEP Shop Texas")}&body=${encodeURIComponent(body)}`;
      form.querySelector("[data-inquiry-status]").textContent = "Your inquiry is ready in your email app. Press Send there to complete it. Your selected items have been kept.";
    });
    bindCartPageButtons();
  } catch (error) {
    itemsNode.innerHTML = `<p class="loading-row">Unable to load inquiry: ${escapeHtml(error.message)}</p>`;
    summaryNode.innerHTML = "";
  }
}

function inquiryRow({ product, quantity, cartKey }) {
  const title = product ? productTitle(product) : cartKey;
  return `<article class="inquiry-row">
    <div><h2>${product ? `<a href="${productUrl(product)}">${escapeHtml(title)}</a>` : escapeHtml(title)}</h2>
    <p>${product ? escapeHtml(stockText(product) || "Availability on request") : "Product unavailable in the current catalog; we can review your request."}</p></div>
    <label>Quantity<input type="number" min="1" max="9999" step="1" value="${quantity}" data-cart-qty="${escapeAttribute(cartKey)}" aria-label="Quantity for ${escapeAttribute(title)}"></label>
    <button type="button" class="cart-remove-button" data-remove-cart="${escapeAttribute(cartKey)}">Remove</button>
  </article>`;
}

function inquiryEmailBody(rows, data) {
  return ["Product Inquiry Request", "", `Name: ${data.get("name") || ""}`, `Email: ${data.get("email") || ""}`, "", "Requested items:",
    ...rows.map(({product, quantity, cartKey}) => `- ${product ? productTitle(product) : cartKey} | Item: ${product?.product_key || cartKey} | Quantity: ${quantity}`),
    "", "Notes:", data.get("notes") || "None", "", "This is an inquiry, not an order."
  ].join("\n");
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
          <span class="catalog-row-actions">
            <button class="card-cart-button" data-add-to-cart="${escapeAttribute(product.product_key)}">Add to Inquiry</button>
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
      const quantity = Math.min(9999, Math.max(1, Math.floor(Number(qtyInput?.value) || 1)));
      addToCart(button.dataset.addToCart, quantity);
      button.classList.add("is-added");
      button.innerHTML = "✓ Added";
      button.setAttribute("aria-label", "Added to inquiry");
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
    const discountInput = form.querySelector("[name='discount_code']");
    const discountStatus = form.querySelector("[data-discount-status]");
    const applyDiscountButton = form.querySelector("[data-apply-discount]");
    const removeDiscountButton = form.querySelector("[data-remove-discount]");
    applyDiscountButton?.addEventListener("click", async () => {
      const code = String(discountInput?.value || "").trim();
      if (!code) {
        if (discountStatus) {
          discountStatus.textContent = "Enter a discount code first.";
          discountStatus.className = "checkout-status bad";
        }
        return;
      }
      try {
        applyDiscountButton.disabled = true;
        if (discountStatus) {
          discountStatus.textContent = "Checking discount code...";
          discountStatus.className = "checkout-status";
        }
        appliedCartDiscount = await validateCartDiscountCode(code);
        renderCartPage();
      } catch (error) {
        appliedCartDiscount = null;
        if (discountStatus) {
          discountStatus.textContent = error.message || "This discount code cannot be applied.";
          discountStatus.className = "checkout-status bad";
        }
        applyDiscountButton.disabled = false;
      }
    });
    removeDiscountButton?.addEventListener("click", () => {
      appliedCartDiscount = null;
      renderCartPage();
    });
    const select = form.querySelector("[name='payment_method']");
    const instructions = form.querySelector("[data-payment-instructions]");
    const qrBox = form.querySelector("[data-payment-qr]");
    const addressChoices = form.querySelectorAll("[name='shipping_address_choice']");
    const newAddressFields = form.querySelector("[data-new-shipping-address]");
    const newAddressHost = document.querySelector("[data-new-shipping-address-host]");
    newAddressFields?.querySelectorAll("input").forEach((input) => input.setAttribute("form", "checkoutForm"));
    const syncPaymentInstructions = () => {
      const option = select?.selectedOptions?.[0];
      const text = option?.dataset?.instructions || "";
      const qr = option?.dataset?.qr || "";
      if (instructions) instructions.textContent = text;
      if (qrBox) {
        qrBox.innerHTML = paymentQrMarkup(qr);
        qrBox.hidden = !String(qr || "").trim();
      }
    };
    select?.addEventListener("change", syncPaymentInstructions);
    syncPaymentInstructions();
    const syncShippingAddressChoice = () => {
      const choice = form.querySelector("[name='shipping_address_choice']:checked")?.value || "";
      if (newAddressFields && newAddressHost && !newAddressHost.contains(newAddressFields)) newAddressHost.appendChild(newAddressFields);
      if (newAddressFields) newAddressFields.hidden = choice !== "new";
      if (newAddressHost) newAddressHost.hidden = choice !== "new";
      updateCheckoutTaxPreview(form);
    };
    addressChoices.forEach((input) => input.addEventListener("change", syncShippingAddressChoice));
    const newShippingStateInput = form.querySelector("[name='new_shipping_state']");
    newShippingStateInput?.addEventListener("input", () => updateCheckoutTaxPreview(form, newShippingStateInput.value));
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
  quantity = Math.min(9999, Math.max(0, Math.floor(Number(quantity) || 0)));
  const next = readCart().map((item) => item.key === key ? { ...item, quantity } : item).filter((item) => item.quantity > 0);
  writeCart(next);
  renderCartPage();
}

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.key === "string" && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0).map(item => ({key:item.key, quantity:Math.min(9999, Math.max(1, Math.floor(Number(item.quantity))))})) : [];
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
    ${totals.discount > 0 ? `<div class="summary-line" data-promo-discount-line><span>Discount (${escapeHtml(appliedCartDiscount?.code || "Code")})</span><strong>-${formatMoney(totals.discount)}</strong></div>` : ""}
    <div class="summary-line"><span>Shipping — USPS Priority Mail 3 Day</span><strong>${formatMoney(totals.shipping)}</strong></div>
    <div class="summary-line"><span data-summary-tax-label>Tax ${escapeHtml(totals.taxLabel)}</span><strong data-summary-tax-amount>${totals.taxRegion ? formatMoney(totals.tax) : ""}</strong></div>
    ${storeCredit.balance > 0 ? `<div class="summary-line" data-available-store-credit="${Number(storeCredit.balance || 0)}"><span>Available Store Credit</span><strong>${formatMoney(storeCredit.balance)}</strong></div><div class="summary-line" data-store-credit-applied-line hidden><span>Store Credit Applied</span><strong>-${formatMoney(0)}</strong></div>` : ""}
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
  const shipping = rows.length && subtotal < FREE_SHIPPING_THRESHOLD ? STANDARD_SHIPPING_RATE : 0;
  const discount = cartDiscountAmount(subtotal);
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

function cartDiscountAmount(subtotal, discount = appliedCartDiscount) {
  const base = Math.max(0, Number(subtotal || 0));
  if (!discount || base <= 0) return 0;
  const type = String(discount.discount_type || "").toLowerCase();
  const percent = Math.max(0, Number(discount.percent_off || 0));
  const amount = Math.max(0, Number(discount.amount_off || 0));
  if (type === "percent" || percent > 0) return roundMoney(Math.min(base, base * percent / 100));
  if (type === "amount" || type === "fixed" || amount > 0) return roundMoney(Math.min(base, amount));
  return 0;
}

async function validateCartDiscountCode(code) {
  const client = requireSupabaseClient();
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) throw new Error("Enter a discount code first.");
  const { data, error } = await client.rpc("validate_cart_discount_code", { p_code:normalizedCode });
  if (error) throw error;
  const result = data && typeof data === "object" ? data : {};
  if (!result.valid) throw new Error(result.message || "This discount code is not valid for this account.");
  return {
    id: result.discount_id,
    code: result.code,
    discount_type: result.discount_type,
    percent_off: Number(result.percent_off || 0),
    amount_off: Number(result.amount_off || 0)
  };
}

function customerTaxRegion(profile = {}) {
  const rawState = profile.shipping_state || profile.state || DEFAULT_TAX_REGION;
  const state = String(rawState || DEFAULT_TAX_REGION).trim().toUpperCase();
  return STATE_ABBREVIATIONS[state] || state || DEFAULT_TAX_REGION;
}

function updateCheckoutTaxPreview(form, newShippingStateValue = null) {
  if (!form) return;
  const choice = form.querySelector("[name='shipping_address_choice']:checked")?.value || "";
  const rawState = choice === "on_file"
    ? form.dataset.profileShippingState || ""
    : choice === "new"
      ? newShippingStateValue !== null
        ? newShippingStateValue
        : document.querySelector("[name='new_shipping_state'][form='checkoutForm']")?.value || form.querySelector("[name='new_shipping_state']")?.value || ""
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
  if (total) total.textContent = formatMoney(roundMoney(subtotal + shipping + tax - cartDiscountAmount(subtotal)));
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

function normalizePaymentDiscountPercent(value, fallback=0) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? number : Number(fallback || 0);
  return Math.min(100, Math.max(0, resolved));
}

function normalizePaymentMethods(row) {
  let methods = null;
  if (Array.isArray(row)) methods = row;
  else if (row && Array.isArray(row.payment_methods)) methods = row.payment_methods;
  else if (row?.payment_methods && typeof row.payment_methods === "string") {
    try { methods = JSON.parse(row.payment_methods); } catch {}
  }

  const defaults = DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method }));
  const orderedIds = defaults.map((method) => method.id);
  const byId = Object.fromEntries(defaults.map((method) => [method.id, method]));
  (methods || []).forEach((method) => {
    const id = String(method.id || method.key || "").trim();
    if (!id) return;
    const existing = byId[id] || {
      id,
      label:String(method.label || id).trim(),
      enabled:false,
      discountPercent:0,
      account:"",
      instructions:"Order will remain pending until payment is confirmed."
    };
    if (!byId[id]) orderedIds.push(id);
    byId[id] = {
      ...existing,
      ...method,
      enabled: method.enabled === true || String(method.enabled || "").toLowerCase() === "true",
      discountPercent: normalizePaymentDiscountPercent(method.discountPercent ?? method.discount_percent, existing.discountPercent),
      account: String(method.account || method.handle || method.wallet || method.value || "").trim(),
      instructions: String(method.instructions || method.note || method.notes || existing.instructions || "").trim(),
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

  return orderedIds.map((id) => byId[id]);
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
  window.location.href = "cart.html";
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
    <form id="checkoutForm" class="checkout-form" data-checkout-form data-subtotal="${Number(totals.subtotal || 0)}" data-shipping="${Number(totals.shipping || 0)}" data-profile-shipping-state="${escapeAttribute(profileState)}">
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
        <label class="shipping-address-choice"><input type="radio" name="shipping_address_choice" value="new" required> <span>new address</span></label>
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
      <div class="cart-discount-box">
        <label>Discount Code
          <span style="display:flex;gap:8px;align-items:center;">
            <input name="discount_code" type="text" autocomplete="off" value="${escapeAttribute(appliedCartDiscount?.code || "")}" placeholder="Enter code" ${appliedCartDiscount ? "readonly" : ""}>
            ${appliedCartDiscount
              ? `<button class="secondary-action" type="button" data-remove-discount>Remove</button>`
              : `<button class="secondary-action" type="button" data-apply-discount>Apply</button>`}
          </span>
        </label>
        <p class="checkout-status ${appliedCartDiscount ? "good" : ""}" data-discount-status>${appliedCartDiscount ? `${escapeHtml(appliedCartDiscount.code)} applied. The discount appears in the order summary.` : "Codes assigned to an email require that customer to be logged in."}</p>
      </div>
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
  return "";
}

function saleBadge(product) {
  return "";
}

function saleText(product) {
  return "";
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
  return `${label} / pending arrival. Availability will be confirmed in response to your inquiry.`;
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

function productStockThresholds(product = {}) {
  const low = Math.max(0, Number(product.low_stock_threshold ?? 5) || 0);
  const limited = Math.max(low, Number(product.limited_stock_threshold ?? 10) || 0);
  return { low, limited };
}

function stockText(product) {
  const count = Number(product.current_inventory || 0);
  const { low, limited } = productStockThresholds(product);
  if (count <= 0) return "Out of Stock";
  if (count <= low) return "Low Stock";
  if (count <= limited) return "Limited";
  return "";
}

function stockClass(product) {
  const count = Number(product.current_inventory || 0);
  const { limited } = productStockThresholds(product);
  if (count <= 0) return productIncomingLabel(product) ? "out incoming" : "out";
  if (count <= limited) return "limited";
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
