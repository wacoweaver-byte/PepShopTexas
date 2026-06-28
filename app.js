const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
const CART_KEY = "pst_cart_v1";
const SUPPORT_EMAIL = "support@pepshoptexas.com";
const PRODUCT_FIELDS = "id,product_key,display_name,strength,category,series,description,research_notes,price,current_inventory,is_active,featured,blend_stack,testing_statement,sort_name,created_at,updated_at,hot_peptide,sale_enabled,sale_price,sale_label";
const PROMOTION_FIELDS = "id,title,body,badge,button_text,button_link,image_url,is_active,starts_at,ends_at,sort_order,accent_color";
const EMAIL_FUNCTION_NAME = "send-order-email";
const PAYMENT_OPTIONS_STORAGE_KEY = "pst_payment_options_v2";
const PAYMENT_LEGACY_STORAGE_KEY = "pst_payment_options_v1";
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
    const [products, user, paymentMethods] = await Promise.all([getProducts(), getSignedInUser(), getPaymentMethods()]);
    const profile = user ? await getCustomerProfile(user) : null;
    const rows = cart.map((item) => {
      const product = products.find((p) => p.product_key === item.key);
      return product ? { product, quantity: item.quantity } : null;
    }).filter(Boolean);

    itemsNode.innerHTML = rows.map(cartRow).join("");
    summaryNode.innerHTML = summaryHtml(rows, { user, profile, paymentMethods });
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
  const form = document.querySelector("[data-checkout-form]");
  if (form) {
    form.addEventListener("submit", handleCheckoutSubmit);
    const select = form.querySelector("[name='payment_method']");
    const instructions = form.querySelector("[data-payment-instructions]");
    const syncPaymentInstructions = () => {
      const option = select?.selectedOptions?.[0];
      const text = option?.dataset?.instructions || "";
      if (instructions) instructions.textContent = text;
    };
    select?.addEventListener("change", syncPaymentInstructions);
    syncPaymentInstructions();
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

function summaryHtml(rows, context = {}) {
  const subtotal = rows.reduce((sum, row) => sum + unitPrice(row.product) * row.quantity, 0);
  const profile = context.profile || {};
  const user = context.user || null;
  const paymentMethods = context.paymentMethods || enabledPaymentMethods(DEFAULT_PAYMENT_METHODS);
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "";
  const email = profile.email || user?.email || "";
  const phone = profile.phone || "";
  const address = profile.shipping_address || profile.address || [profile.address1, profile.address2, profile.shipping_city || profile.city, profile.shipping_state || profile.state, profile.shipping_zip || profile.zip].filter(Boolean).join(", ");
  return `
    <h2>Order Summary</h2>
    <div class="summary-line"><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
    <p class="checkout-note">Submit your order to PEP Shop Texas. It will appear in Order Management for review and payment confirmation.</p>
    ${user ? checkoutFormHtml(rows, { name, email, phone, address, paymentMethods }) : `
      <p class="checkout-note">Log in or create an account before placing an order so it can be saved to your account.</p>
      <a class="primary-action ${rows.length ? "" : "disabled"}" href="login.html?redirect=cart.html">Log In to Checkout</a>
      <a class="secondary-action" href="register.html">Create Account</a>
    `}
  `;
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
      instructions: String(method.instructions || method.note || method.notes || byId[id].instructions || "").trim()
    };
  });
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
      .select("payment_methods, venmo_enabled, venmo_handle, venmo_note")
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
    const rows = cart.map((item) => {
      const product = products.find((p) => p.product_key === item.key);
      return product ? { product, quantity: Number(item.quantity || 1) } : null;
    }).filter(Boolean);
    if (!rows.length) throw new Error("The products in your cart are no longer available.");

    const formData = new FormData(form);
    const selectedOption = form.querySelector("[name='payment_method']")?.selectedOptions?.[0];
    const paymentMethod = selectedOption?.dataset?.label || String(formData.get("payment_method") || "Payment pending");
    const paymentInstructions = selectedOption?.dataset?.instructions || "";
    const subtotal = rows.reduce((sum, row) => sum + unitPrice(row.product) * row.quantity, 0);
    const shipping = 0;
    const tax = 0;
    const discount = 0;
    const total = subtotal + shipping + tax - discount;
    const orderNumberValue = await nextOrderNumber();
    const now = new Date().toISOString();
    const customerName = accountCustomerName(profile, user);
    const customerEmail = accountCustomerEmail(profile, user);
    const customerPhone = accountCustomerPhone(profile);
    const shippingAddressValue = accountShippingAddress(profile);
    const customerNotes = String(formData.get("customer_notes") || "").trim();
    const paymentNote = paymentInstructions ? `Payment method selected: ${paymentMethod} | ${paymentInstructions}` : `Payment method selected: ${paymentMethod}`;
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
      status: "pending",
      order_status: "pending",
      payment_status: "pending",
      payment_method: paymentMethod,
      payment_instructions_snapshot: paymentInstructions,
      customer_notes: [customerNotes, paymentNote].filter(Boolean).join("\n\n"),
      subtotal,
      discount,
      shipping,
      tax,
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
    await sendOrderReceivedEmail({ ...order, items: itemPayloads }, { customerName, customerEmail, paymentMethod, paymentInstructions });

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
    const { error } = await client.from(tableName).insert(working);
    if (!error) return working;
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
    const client = requireSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token || SUPABASE_KEY;
    const payload = {
      type: "order_received",
      originalType: "order_received",
      to: context.customerEmail || order.customer_email || order.email,
      customerName: context.customerName || order.customer_name || order.name || "Customer",
      orderNumber: order.order_number || order.id,
      orderDate: order.created_at,
      subtotal: order.subtotal ?? order.subtotal_amount ?? 0,
      discount: order.discount ?? order.discount_amount ?? 0,
      shipping: order.shipping ?? order.shipping_amount ?? 0,
      tax: order.tax ?? order.tax_amount ?? 0,
      total: order.total ?? order.total_amount ?? order.grand_total ?? 0,
      statusNote: context.paymentInstructions || "Your order has been received and is pending payment/processing.",
      paymentMethod: context.paymentMethod || order.payment_method || "Payment pending",
      paymentStatus: order.payment_status || "pending",
      paymentInstructions: context.paymentInstructions || order.payment_instructions_snapshot || "",
      items: (order.items || []).map((item) => ({
        name: item.product_name || item.name || item.product_key || "Item",
        quantity: item.quantity || item.qty || 1,
        price: item.unit_price || item.price || 0,
        total: item.line_total || item.total || null
      }))
    };
    await fetch(`${SUPABASE_URL}/functions/v1/${EMAIL_FUNCTION_NAME}`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.warn("Order received email did not send", error);
  }
}

function checkoutFormHtml(rows, context) {
  const methods = context.paymentMethods.length ? context.paymentMethods : enabledPaymentMethods(DEFAULT_PAYMENT_METHODS);
  return `
    <form class="checkout-form" data-checkout-form>
      <p class="account-checkout-note">This order will use the contact email and shipping details saved on your account.</p>
      <label>Payment Method <select name="payment_method">${methods.map((method) => `<option value="${escapeAttribute(method.id)}" data-label="${escapeAttribute(method.label)}" data-instructions="${escapeAttribute(paymentInstructionsText(method))}">${escapeHtml(method.label)}</option>`).join("")}</select></label>
      <p class="payment-instructions" data-payment-instructions></p>
      <label>Order Notes <textarea name="customer_notes" placeholder="Optional notes for support"></textarea></label>
      <button class="primary-action" type="submit" ${rows.length ? "" : "disabled"}>Place Order</button>
      <p class="checkout-status" data-checkout-status></p>
    </form>
  `;
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
