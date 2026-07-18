const PST_SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
const PST_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
const pstAccountSupabase = window.supabase.createClient(PST_SUPABASE_URL, PST_SUPABASE_PUBLISHABLE_KEY);

let pstAccountOrders = [];
let pstAccountItemsByOrder = {};
let pstCurrentUser = null;
let pstCurrentProfile = null;

function refreshAccountCartCount() {
  try {
    const cart = JSON.parse(localStorage.getItem("pst_cart_v1") || "[]");
    const count = Array.isArray(cart) ? cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
    document.querySelectorAll("[data-cart-count]").forEach(node => { node.textContent = String(count); });
  } catch {
    document.querySelectorAll("[data-cart-count]").forEach(node => { node.textContent = "0"; });
  }
}

function pstEsc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function pstMoney(value) { return "$" + Number(value || 0).toFixed(2); }
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
}
function setStatus(message, type = "info") {
  const el = document.getElementById("pageStatus");
  if (!el) return;
  el.className = "status active " + type;
  el.innerHTML = message;
}
function pstCustomerNumber(value) {
  const clean = String(value ?? "").trim();
  if (!clean || clean === "0" || clean.toLowerCase() === "null" || clean.toLowerCase() === "undefined") return "—";
  return clean.startsWith("PST-C") ? clean : `PST-C${clean}`;
}
function getProfileValue(profile, ...keys) {
  if (!profile) return "";
  for (const key of keys) if (profile[key] !== undefined && profile[key] !== null && String(profile[key]).trim() !== "") return profile[key];
  return "";
}
function formatAddress(line1, line2, city, state, zip) {
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  return [line1, line2, cityStateZip].filter(Boolean).map(pstEsc).join("<br>") || "—";
}
function accountFirstName(profile = {}, user = {}) {
  const name = profile.first_name || profile.full_name || user.user_metadata?.first_name || user.user_metadata?.full_name || user.email || "there";
  return String(name).trim().split(/\s+/)[0] || "there";
}
async function accountAdminRecordForUser(user) {
  const checks = [
    pstAccountSupabase.from("admin_users").select("*").eq("user_id", user.id).maybeSingle(),
    pstAccountSupabase.from("admin_users").select("*").eq("email", user.email).maybeSingle()
  ];
  const results = await Promise.allSettled(checks);
  const rows = results.filter(result => result.status === "fulfilled" && result.value?.data).map(result => result.value.data);
  return rows.find(row => row && (row.is_active === true || row.active === true || row.is_admin === true || row.email === user.email)) || null;
}
function billingAddressFromProfile(profile) {
  if (!profile) return "—";
  return formatAddress(getProfileValue(profile,"billing_address","address_line1"),getProfileValue(profile,"billing_address2","address_line2"),getProfileValue(profile,"billing_city","city"),getProfileValue(profile,"billing_state","state"),getProfileValue(profile,"billing_zip","zip"));
}
function shippingAddressFromProfile(profile) {
  if (!profile) return "—";
  return formatAddress(getProfileValue(profile,"shipping_address","address_line1","billing_address"),getProfileValue(profile,"shipping_address2","address_line2","billing_address2"),getProfileValue(profile,"shipping_city","city","billing_city"),getProfileValue(profile,"shipping_state","state","billing_state"),getProfileValue(profile,"shipping_zip","zip","billing_zip"));
}
function formEl(name) { return document.querySelector(`#profileForm [name="${name}"]`); }
function setFormValue(name, value) { const el = formEl(name); if (el) el.value = value || ""; }
function populateProfileForm(profile, user) {
  setFormValue("first_name", getProfileValue(profile,"first_name"));
  setFormValue("last_name", getProfileValue(profile,"last_name"));
  setFormValue("email", getProfileValue(profile,"email") || user?.email || "");
  setFormValue("phone", getProfileValue(profile,"phone"));
  setFormValue("username", getProfileValue(profile,"username"));
  setFormValue("billing_address", getProfileValue(profile,"billing_address","address_line1"));
  setFormValue("billing_city", getProfileValue(profile,"billing_city","city"));
  setFormValue("billing_state", getProfileValue(profile,"billing_state","state"));
  setFormValue("billing_zip", getProfileValue(profile,"billing_zip","zip"));
  setFormValue("shipping_address", getProfileValue(profile,"shipping_address","address_line1","billing_address"));
  setFormValue("shipping_city", getProfileValue(profile,"shipping_city","city","billing_city"));
  setFormValue("shipping_state", getProfileValue(profile,"shipping_state","state","billing_state"));
  setFormValue("shipping_zip", getProfileValue(profile,"shipping_zip","zip","billing_zip"));
  updateSameAsBillingChecked();
}
function updateProfileDisplay(profile, user) {
  const name = [getProfileValue(profile,"first_name"), getProfileValue(profile,"last_name")].filter(Boolean).join(" ");
  document.getElementById("profileName").textContent = name || "Customer";
  const customerNumEl = document.getElementById("profileCustomerNumber");
  if (customerNumEl) customerNumEl.textContent = pstCustomerNumber(getProfileValue(profile,"customer_number"));
  document.getElementById("profileEmail").textContent = getProfileValue(profile,"email") || user?.email || "—";
  document.getElementById("profileUsername").textContent = getProfileValue(profile,"username") || "—";
  document.getElementById("profilePhone").textContent = getProfileValue(profile,"phone") || "—";
  document.getElementById("profileBillingAddress").innerHTML = billingAddressFromProfile(profile);
  document.getElementById("profileShippingAddress").innerHTML = shippingAddressFromProfile(profile);
  updateEmailPreferenceDisplay(profile);
}
function copyBillingToShipping() {
  setFormValue("shipping_address", formEl("billing_address")?.value || "");
  setFormValue("shipping_city", formEl("billing_city")?.value || "");
  setFormValue("shipping_state", formEl("billing_state")?.value || "");
  setFormValue("shipping_zip", formEl("billing_zip")?.value || "");
}
function shippingMatchesBilling() {
  return [["billing_address","shipping_address"],["billing_city","shipping_city"],["billing_state","shipping_state"],["billing_zip","shipping_zip"]].every(([b,s]) => String(formEl(b)?.value || "").trim() === String(formEl(s)?.value || "").trim());
}
function updateSameAsBillingChecked() { const cb=document.getElementById("sameAsBilling"); if(cb) cb.checked=shippingMatchesBilling(); }
function setEditMode(active) {
  document.getElementById("profileView")?.classList.toggle("hidden", !!active);
  document.getElementById("profileForm")?.classList.toggle("active", !!active);
  if (active) populateProfileForm(pstCurrentProfile, pstCurrentUser);
}
function deriveMarketingPreference(profile) {
  const optOut=getProfileValue(profile,"marketing_opt_out","email_opt_out","newsletter_opt_out","unsubscribed");
  const optIn=getProfileValue(profile,"marketing_opt_in","email_opt_in","newsletter_opt_in","subscribed");
  if(optOut===true||String(optOut).toLowerCase()==="true"||String(optOut).toLowerCase()==="yes") return {checked:false,label:"Opted out of promotional emails."};
  if(optIn===true||String(optIn).toLowerCase()==="true"||String(optIn).toLowerCase()==="yes") return {checked:true,label:"Subscribed to promotional emails."};
  return {checked:false,label:"Not subscribed to promotional emails."};
}
function updateEmailPreferenceDisplay(profile) {
  const pref=deriveMarketingPreference(profile);
  const checkbox=document.getElementById("marketingOptInCheckbox");
  const display=document.getElementById("profileEmailPreference");
  if(checkbox) checkbox.checked=!!pref.checked;
  if(display) display.textContent=pref.label;
}
function setEmailPrefsStatus(message,type="info") { const el=document.getElementById("emailPrefsStatus"); if(!el)return; el.className="email-pref-status active "+type; el.innerHTML=message; }
async function saveEmailPreferences() {
  if(!pstCurrentUser){setEmailPrefsStatus("You must be logged in to update email preferences.","error");return;}
  const btn=document.getElementById("saveEmailPrefsBtn");
  const optedIn=!!document.getElementById("marketingOptInCheckbox")?.checked;
  const now=new Date().toISOString();
  if(btn){btn.disabled=true;btn.textContent="Saving...";}
  setEmailPrefsStatus("Saving email preferences...","info");
  try {
    const payload={user_id:pstCurrentUser.id,email:pstCurrentUser.email||getProfileValue(pstCurrentProfile,"email")||"",marketing_opt_in:optedIn,marketing_opt_out:!optedIn,marketing_source:optedIn?"account_preferences_opt_in":"account_preferences_opt_out"};
    if(optedIn){payload.marketing_opt_in_at=now;payload.marketing_opt_out_at=null;}else{payload.marketing_opt_out_at=now;}
    let result=await pstAccountSupabase.from("customer_profiles").update(payload).eq("user_id",pstCurrentUser.id).select("*").maybeSingle();
    if(result.error) throw result.error;
    if(!result.data){const insertPayload={...payload,first_name:pstCurrentUser.user_metadata?.first_name||"",last_name:pstCurrentUser.user_metadata?.last_name||"",username:pstCurrentUser.user_metadata?.username||"",account_status:"active"};const insertResult=await pstAccountSupabase.from("customer_profiles").insert(insertPayload).select("*").maybeSingle();if(insertResult.error)throw insertResult.error;result=insertResult;}
    pstCurrentProfile=result.data||{...(pstCurrentProfile||{}),...payload};
    updateEmailPreferenceDisplay(pstCurrentProfile);
    updateProfileDisplay(pstCurrentProfile,pstCurrentUser);
    setEmailPrefsStatus(optedIn?"Email preferences saved. You are subscribed to updates.":"Email preferences saved. You are opted out of promotional emails.","success");
  } catch(err){setEmailPrefsStatus("Email preferences could not be saved. "+pstEsc(err.message||err),"error");}
  finally{if(btn){btn.disabled=false;btn.textContent="Save Email Preferences";}}
}
async function loadAccount() {
  setStatus("Loading your account...","info");
  const grid=document.getElementById("accountGrid");
  if(grid) grid.style.display="none";
  const {data:sessionData,error:sessionError}=await pstAccountSupabase.auth.getSession();
  const session=sessionData&&sessionData.session;
  if(sessionError||!session||!session.user){setStatus('Please <a href="login.html">login</a> to view your account and previous orders.',"error");setTimeout(()=>{window.location.href="login.html?redirect=account.html";},900);return;}
  const user=session.user; pstCurrentUser=user;
  const adminRecord=await accountAdminRecordForUser(user);
  document.getElementById("accountAdminLink")?.remove();
  const isAdmin=!!adminRecord&&(adminRecord.is_active===true||adminRecord.active===true||adminRecord.is_admin===true||adminRecord.email===user.email);
  if(isAdmin){const nav=document.querySelector(".pst-customer-header .main-nav");if(nav){const adminLink=document.createElement("a");adminLink.href="admin.html";adminLink.id="accountAdminLink";adminLink.textContent="ADMIN";const cartLink=nav.querySelector(".cart-link");nav.insertBefore(adminLink,cartLink||null);}}
  const {data:profile,error:profileError}=await pstAccountSupabase.from("customer_profiles").select("*").eq("user_id",user.id).maybeSingle();
  if(profileError) setStatus("Could not load your profile details. "+pstEsc(profileError.message),"error");
  pstCurrentProfile=profile||{user_id:user.id,email:user.email,first_name:user.user_metadata?.first_name||"",last_name:user.user_metadata?.last_name||"",username:user.user_metadata?.username||""};
  const accountGreetingLink=document.getElementById("accountGreetingLink"); if(accountGreetingLink) accountGreetingLink.textContent="Hello "+accountFirstName(pstCurrentProfile,user);
  updateProfileDisplay(pstCurrentProfile,user); populateProfileForm(pstCurrentProfile,user);
  const {data:orders,error:ordersError}=await pstAccountSupabase.from("orders").select("id,order_number,status,total,subtotal,shipping,tax,payment_status,tracking_number,tracking_carrier,created_at").order("created_at",{ascending:false});
  if(ordersError){setStatus("Could not load orders. "+pstEsc(ordersError.message),"error");if(grid)grid.style.display="grid";return;}
  pstAccountOrders=orders||[]; const orderIds=pstAccountOrders.map(order=>order.id); pstAccountItemsByOrder={};
  if(orderIds.length){const {data:items,error:itemsError}=await pstAccountSupabase.from("order_items").select("id,order_id,product_id,product_name,product_strength,product_category,quantity,unit_price,line_total").in("order_id",orderIds);if(itemsError){setStatus("Orders loaded, but order items could not be loaded. "+pstEsc(itemsError.message),"error");}else{(items||[]).forEach(item=>{if(!pstAccountItemsByOrder[item.order_id])pstAccountItemsByOrder[item.order_id]=[];pstAccountItemsByOrder[item.order_id].push(item);});}}
  renderOrders(); setEditMode(false); if(grid)grid.style.display="grid"; setStatus("Account loaded successfully.","success");
}
async function saveProfile(event) {
  event.preventDefault(); if(!pstCurrentUser)return;
  const saveBtn=document.getElementById("saveProfileBtn");if(saveBtn){saveBtn.disabled=true;saveBtn.textContent="Saving...";}setStatus("Saving profile...","info");
  try{if(document.getElementById("sameAsBilling")?.checked)copyBillingToShipping();const payload={user_id:pstCurrentUser.id,first_name:formEl("first_name")?.value.trim()||"",last_name:formEl("last_name")?.value.trim()||"",email:formEl("email")?.value.trim()||pstCurrentUser.email||"",phone:formEl("phone")?.value.trim()||"",username:formEl("username")?.value.trim()||"",billing_address:formEl("billing_address")?.value.trim()||"",billing_city:formEl("billing_city")?.value.trim()||"",billing_state:formEl("billing_state")?.value.trim()||"",billing_zip:formEl("billing_zip")?.value.trim()||"",shipping_address:formEl("shipping_address")?.value.trim()||"",shipping_city:formEl("shipping_city")?.value.trim()||"",shipping_state:formEl("shipping_state")?.value.trim()||"",shipping_zip:formEl("shipping_zip")?.value.trim()||"",account_status:"active"};let result=await pstAccountSupabase.from("customer_profiles").update(payload).eq("user_id",pstCurrentUser.id).select("*").maybeSingle();if(result.error)throw result.error;if(!result.data){const insertResult=await pstAccountSupabase.from("customer_profiles").insert(payload).select("*").maybeSingle();if(insertResult.error)throw insertResult.error;result=insertResult;}pstCurrentProfile=result.data||payload;updateProfileDisplay(pstCurrentProfile,pstCurrentUser);populateProfileForm(pstCurrentProfile,pstCurrentUser);setEditMode(false);setStatus("Profile updated successfully.","success");}catch(err){setStatus("Profile could not be saved. "+pstEsc(err.message||err),"error");}finally{if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save Profile";}}
}
function renderOrders() {
  const list=document.getElementById("ordersList");if(!list)return;
  if(!pstAccountOrders.length){list.className="empty-state";list.innerHTML="No previous orders yet. When you checkout, your orders will appear here.";return;}
  list.className="";
  list.innerHTML=pstAccountOrders.map(order=>{const items=pstAccountItemsByOrder[order.id]||[];const tracking=order.tracking_number?`${pstEsc(order.tracking_carrier||"Tracking")}: ${pstEsc(order.tracking_number)}`:"Not added yet";return `<article class="order-card"><div class="order-head"><div class="order-meta"><strong>Order</strong><span class="order-number">${pstEsc(order.order_number||order.id)}</span></div><div class="order-meta"><strong>Date</strong><span>${formatDate(order.created_at)}</span></div><div class="order-meta"><strong>Status</strong><span class="badge">${pstEsc(order.status||"Pending")}</span></div><div class="order-meta"><strong>Total</strong><span>${pstMoney(order.total)}</span></div></div><div class="order-actions"><button class="btn" type="button" onclick="toggleOrderDetails('${order.id}')">View Order</button><button class="btn primary" type="button" onclick="reorder('${order.id}')">Reorder</button><span class="badge">Payment: ${pstEsc(order.payment_status||"Pending")}</span><span class="badge">Tracking: ${tracking}</span></div><div id="items-${order.id}" class="order-items">${items.length?items.map(item=>`<div class="item-line"><div class="item-name"><strong>${pstEsc(item.product_name)}</strong><span>${pstEsc(item.product_strength||item.product_category||"")}</span></div><div>Qty ${Number(item.quantity||0)}</div><div>${pstMoney(item.unit_price)}</div><div><strong>${pstMoney(item.line_total)}</strong></div></div>`).join(""):`<div class="item-line"><div>No item details found for this order.</div></div>`}<div class="item-line"><div><strong>Subtotal</strong></div><div></div><div></div><div>${pstMoney(order.subtotal)}</div></div><div class="item-line"><div><strong>Shipping</strong></div><div></div><div></div><div>${pstMoney(order.shipping)}</div></div><div class="item-line"><div><strong>Tax</strong></div><div></div><div></div><div>${pstMoney(order.tax)}</div></div><div class="item-line"><div><strong>Total</strong></div><div></div><div></div><div><strong>${pstMoney(order.total)}</strong></div></div></div></article>`;}).join("");
}
function toggleOrderDetails(orderId){document.getElementById("items-"+orderId)?.classList.toggle("active");}
function reorder(orderId){const items=pstAccountItemsByOrder[orderId]||[];if(!items.length){setStatus("This order has no items available to reorder.","error");return;}const cartItems=items.map(item=>{const productId=item.product_id||"";const isStack=String(productId).startsWith("stack:")||item.product_category==="Stack";return{id:String(productId).startsWith("product:")||String(productId).startsWith("stack:")?productId:"product:"+productId,key:isStack?undefined:productId,type:isStack?"stack":"product",display:item.product_name,strength:item.product_strength||"",price:Number(item.unit_price||0),quantity:Number(item.quantity||1),product_id:productId,product_name:item.product_name,product_strength:item.product_strength,product_category:item.product_category,unit_price:Number(item.unit_price||0)};});localStorage.setItem("pstPendingReorderCart",JSON.stringify(cartItems));window.location.href="index.html?reorder=1";}
function wireProfileEditor(){document.getElementById("saveEmailPrefsBtn")?.addEventListener("click",saveEmailPreferences);document.getElementById("editProfileBtn")?.addEventListener("click",()=>setEditMode(true));document.getElementById("cancelEditBtn")?.addEventListener("click",()=>setEditMode(false));document.getElementById("profileForm")?.addEventListener("submit",saveProfile);document.getElementById("sameAsBilling")?.addEventListener("change",event=>{if(event.target.checked)copyBillingToShipping();});["billing_address","billing_city","billing_state","billing_zip"].forEach(name=>{formEl(name)?.addEventListener("input",()=>{if(document.getElementById("sameAsBilling")?.checked)copyBillingToShipping();});});["shipping_address","shipping_city","shipping_state","shipping_zip"].forEach(name=>{formEl(name)?.addEventListener("input",updateSameAsBillingChecked);});}
document.getElementById("logoutBtn")?.addEventListener("click",async()=>{await pstAccountSupabase.auth.signOut();window.location.href="index.html?loggedout=1";});
document.addEventListener("DOMContentLoaded",()=>{refreshAccountCartCount();wireProfileEditor();loadAccount();});