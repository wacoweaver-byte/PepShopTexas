
  /* IMPORTANT: use the same Supabase URL and anon key already used in index.html/products.html. */
  const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
  const EMAIL_FUNCTION_NAME = "send-order-email";

  let supabaseClient = null;
  const $ = (id) => document.getElementById(id);
  let currentUser = null;
  let allOrders = [];
  let filteredOrders = [];
  let activeOrderId = null;
  let selectedOrderIds = new Set();

  const orderStatuses = ["pending","awaiting_payment","processing","packed","shipped","delivered","cancelled","rejected"];
  const paymentStatuses = ["pending","paid","failed","refunded","manual_review"];

  function setStatus(message, type="") { const el = $("statusLine"); el.textContent = message; el.className = `status ${type}`.trim(); }
  function esc(value){return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
  function money(value){ const n = Number(value ?? 0); return n.toLocaleString(undefined,{style:"currency",currency:"USD"}); }
  function fmtDate(value){ if(!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(); }
  function norm(value, fallback="pending"){ return String(value || fallback).toLowerCase().replace(/\s+/g,"_"); }
  function pill(value){ const v = norm(value); return `<span class="pill ${esc(v)}">${esc(v.replaceAll("_"," "))}</span>`; }
  function orderNumber(order){ return order.order_number || order.order_no || order.id || "—"; }
  function orderTotal(order){ return order.total ?? order.total_amount ?? order.order_total ?? order.grand_total ?? 0; }
  function orderStatus(order){ return order.order_status || order.status || "pending"; }
  function paymentStatus(order){ return order.payment_status || "pending"; }
  function profileOf(order){ return order.profile || {}; }
  function customerName(order){ const p=profileOf(order); return order.customer_name || order.name || [p.first_name,p.last_name].filter(Boolean).join(" ") || p.full_name || "Customer"; }
  function customerEmail(order){ const p=profileOf(order); return order.customer_email || order.email || p.email || ""; }
  function customerPhone(order){ const p=profileOf(order); return order.customer_phone || order.phone || p.phone || "—"; }
  function shippingAddress(order){ const p=profileOf(order); return order.shipping_address || order.address || p.shipping_address || p.address || [p.address1,p.address2,p.city,p.state,p.zip].filter(Boolean).join(", ") || "—"; }
  function trackingUrl(carrier, number, provided){ if(provided) return provided; if(!number) return ""; const n=encodeURIComponent(number); const c=String(carrier||"").toLowerCase(); if(c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`; if(c.includes("ups")) return `https://www.ups.com/track?tracknum=${n}`; if(c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${n}`; return ""; }

  function selectedOrdersArray(){ return Array.from(selectedOrderIds); }
  function renderSelectedCount(){ $("selectedCount").textContent = `${selectedOrderIds.size} selected`; const allVisible = filteredOrders.length && filteredOrders.every(o => selectedOrderIds.has(o.id)); $("selectAllOrders").checked = !!allVisible; }

  async function checkAdminAccess(){
    setStatus("Checking admin access...");
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    const session = sessionData?.session;
    if(!session?.user){ setStatus("You are not logged in. Log in from the website first, then return to admin.html.", "bad"); return false; }
    currentUser = session.user;
    const checks = [
      supabaseClient.from("admin_users").select("*").eq("user_id", currentUser.id).maybeSingle(),
      supabaseClient.from("admin_users").select("*").eq("email", currentUser.email).maybeSingle()
    ];
    const results = await Promise.allSettled(checks);
    const rows = results.filter(r => r.status === "fulfilled" && r.value?.data).map(r => r.value.data);
    const admin = rows.find(r => r && (r.is_active === true || r.active === true || r.is_admin === true || r.email === currentUser.email));
    if(!admin){ setStatus("Access denied. This login is not listed as an active Pep Shop Texas admin.", "bad"); return false; }
    setStatus(`Admin access confirmed for ${currentUser.email}.`, "good");
    return true;
  }

  async function withTimeout(promise, label, ms=12000){
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out. Refresh the page or check Supabase/RLS access.`)), ms);
    });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(timer); }
  }

  async function loadOrders(){
    try{
      setStatus("Loading orders...");
      const body = $("ordersBody");
      if(body) body.innerHTML = `<tr><td colspan="8" class="muted">Loading orders from Supabase...</td></tr>`;

      const ordersResult = await withTimeout(
        supabaseClient.from("orders").select("*").order("created_at", { ascending:false }),
        "Orders query"
      );
      if(ordersResult.error) throw ordersResult.error;

      const orders = ordersResult.data || [];
      const orderIds = orders.map(o=>o.id).filter(Boolean);
      const userIds = [...new Set(orders.flatMap(o=>[o.user_id,o.customer_id]).filter(Boolean))];
      const profileIds = [...new Set(orders.flatMap(o=>[o.profile_id,o.customer_profile_id]).filter(Boolean))];
      let itemsByOrder = {}, profilesByUser = {}, profilesById = {};

      /* Render the order rows immediately. The item/profile lookups below are helpful,
         but they should never leave the Orders screen stuck on "Loading orders...". */
      allOrders = orders.map(o => ({...o, items: [], profile: {}}));
      selectedOrderIds = new Set([...selectedOrderIds].filter(id => allOrders.some(o => o.id === id)));
      applyFilters();
      setStatus(`Loaded ${allOrders.length} order${allOrders.length===1?"":"s"}. Loading order details...`, "good");

      if(orderIds.length){
        const itemsResult = await withTimeout(
          supabaseClient.from("order_items").select("*").in("order_id", orderIds),
          "Order items query"
        ).catch(err => ({ data: [], error: err }));
        if(itemsResult.error) console.warn("Order items could not be loaded:", itemsResult.error.message || itemsResult.error);
        (itemsResult.data||[]).forEach(item => { const k=item.order_id; if(!itemsByOrder[k]) itemsByOrder[k]=[]; itemsByOrder[k].push(item); });
      }
      if(userIds.length){
        const profilesByUserResult = await withTimeout(
          supabaseClient.from("customer_profiles").select("*").in("user_id", userIds),
          "Customer profiles by user query"
        ).catch(err => ({ data: [], error: err }));
        if(profilesByUserResult.error) console.warn("Customer profiles by user_id could not be loaded:", profilesByUserResult.error.message || profilesByUserResult.error);
        (profilesByUserResult.data||[]).forEach(p => { if(p.user_id) profilesByUser[p.user_id]=p; if(p.id) profilesById[p.id]=p; });
      }
      if(profileIds.length){
        const profilesByIdResult = await withTimeout(
          supabaseClient.from("customer_profiles").select("*").in("id", profileIds),
          "Customer profiles by id query"
        ).catch(err => ({ data: [], error: err }));
        if(profilesByIdResult.error) console.warn("Customer profiles by id could not be loaded:", profilesByIdResult.error.message || profilesByIdResult.error);
        (profilesByIdResult.data||[]).forEach(p => { if(p.user_id) profilesByUser[p.user_id]=p; if(p.id) profilesById[p.id]=p; });
      }

      allOrders = orders.map(o => ({
        ...o,
        items: itemsByOrder[o.id] || [],
        profile: profilesByUser[o.user_id] || profilesById[o.profile_id] || profilesById[o.customer_profile_id] || profilesById[o.customer_id] || {}
      }));
      selectedOrderIds = new Set([...selectedOrderIds].filter(id => allOrders.some(o => o.id === id)));
      applyFilters();
      setStatus(`Loaded ${allOrders.length} order${allOrders.length===1?"":"s"}.`, "good");
    }catch(error){
      console.error(error);
      const body = $("ordersBody");
      if(body) body.innerHTML = `<tr><td colspan="8" class="muted">Could not load orders. ${esc(error.message || error)}</td></tr>`;
      setStatus(error.message || "Could not load orders from Supabase.", "bad");
    }
  }

  function applyFilters(){
    const q = $("searchInput").value.trim().toLowerCase();
    const s = $("statusFilter").value;
    const p = $("paymentFilter").value;
    const d = $("dateFilter").value;
    const now = new Date();
    filteredOrders = allOrders.filter(order => {
      const hay = [orderNumber(order), customerName(order), customerEmail(order), customerPhone(order), order.tracking_number, order.carrier, order.tracking_carrier, order.admin_note, order.customer_notes].join(" ").toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(s && norm(orderStatus(order)) !== s) return false;
      if(p && norm(paymentStatus(order)) !== p) return false;
      if(d){ const created = new Date(order.created_at || order.order_date || 0); if(Number.isNaN(created.getTime())) return false; if(d === "today" && created.toDateString() !== now.toDateString()) return false; if(d !== "today" && ((now-created)/(1000*60*60*24) > Number(d))) return false; }
      return true;
    });
    renderOrders(); renderSelectedCount();
  }

  function renderOrders(){
    const body = $("ordersBody");
    if(!filteredOrders.length){ body.innerHTML = `<tr><td colspan="8" class="muted">No orders match the current filters.</td></tr>`; return; }
    body.innerHTML = filteredOrders.map(order => {
      const id = esc(order.id);
      const track = order.tracking_number || order.tracking || "";
      return `<tr class="order-row ${activeOrderId===order.id?"active":""}" data-order-id="${id}">
        <td onclick="event.stopPropagation()"><input class="row-check" type="checkbox" data-check-id="${id}" ${selectedOrderIds.has(order.id)?"checked":""}></td>
        <td><strong>#${esc(String(orderNumber(order)).slice(0,18))}</strong><div class="muted">${esc((order.items||[]).length)} item row(s)</div></td>
        <td>${esc(fmtDate(order.created_at || order.order_date))}</td>
        <td><strong>${esc(customerName(order))}</strong><div class="muted">${esc(customerEmail(order) || "No email")}</div></td>
        <td><strong>${money(orderTotal(order))}</strong></td>
        <td>${pill(orderStatus(order))}</td>
        <td>${pill(paymentStatus(order))}</td>
        <td>${track ? `<strong>${esc(track)}</strong><div class="muted">${esc(order.tracking_carrier || order.carrier || "Carrier not set")}</div>` : `<span class="muted">Not added</span>`}</td>
      </tr>`;
    }).join("");
    document.querySelectorAll("tr.order-row").forEach(row => row.addEventListener("click", () => { const order = allOrders.find(o => o.id === row.dataset.orderId); if(order) renderOrderDetail(order); }));
    document.querySelectorAll(".row-check").forEach(cb => cb.addEventListener("change", e => { const id=e.target.dataset.checkId; e.target.checked ? selectedOrderIds.add(id) : selectedOrderIds.delete(id); renderSelectedCount(); }));
  }

  function itemsMarkup(order){
    const items = order.items || [];
    if(!items.length) return `<div class="muted">No item rows found for this order.</div>`;
    return `<div class="item-list">${items.map(item => {
      const name = item.product_name || item.name || item.display_name || item.product_key || "Item";
      const qty = item.quantity ?? item.qty ?? 1;
      const price = item.unit_price ?? item.price ?? 0;
      const line = item.line_total ?? item.total ?? (Number(qty)*Number(price));
      return `<div class="item"><div class="item-top"><span>${esc(name)}</span><span>${money(line)}</span></div><div class="muted">Qty: ${esc(qty)} · Unit: ${money(price)} ${item.strength ? `· ${esc(item.strength)}` : ""}</div></div>`;
    }).join("")}</div>`;
  }

  function historyMarkup(order){
    const events = [];
    if(order.created_at) events.push(["Order created", order.created_at]);
    if(order.paid_at) events.push(["Payment received", order.paid_at]);
    if(order.processing_at) events.push(["Marked processing", order.processing_at]);
    if(order.packed_at) events.push(["Marked packed", order.packed_at]);
    if(order.shipped_at) events.push(["Marked shipped", order.shipped_at]);
    if(order.shipping_email_sent_at) events.push(["Shipping email sent", order.shipping_email_sent_at]);
    if(order.delivered_at) events.push(["Marked delivered", order.delivered_at]);
    if(order.cancelled_at) events.push(["Cancelled", order.cancelled_at]);
    if(order.rejected_at) events.push(["Rejected", order.rejected_at]);
    if(order.updated_at) events.push(["Last updated", order.updated_at]);
    if(!events.length) return `<div class="muted">No timeline fields are currently saved for this order.</div>`;
    return `<div class="audit-list">${events.map(([label,date])=>`<div class="audit-item"><strong>${esc(label)}</strong><span class="muted">${esc(fmtDate(date))}</span></div>`).join("")}</div>`;
  }

  function renderOrderDetail(order){
    activeOrderId = order.id; renderOrders();
    const carrier = order.tracking_carrier || order.carrier || "";
    const tracking = order.tracking_number || order.tracking || "";
    const turl = trackingUrl(carrier, tracking, order.tracking_url);
    const detail = $("detailCard");
    detail.innerHTML = `
      <div class="card-header"><h2>Manage Order #${esc(orderNumber(order))}</h2><button class="btn secondary" id="reloadDetailBtn" type="button">Reload</button></div>
      <div class="detail-section"><h3>Customer</h3><div class="kv-grid"><div class="kv"><strong>Name</strong>${esc(customerName(order))}</div><div class="kv"><strong>Email</strong>${esc(customerEmail(order)||"—")}</div><div class="kv"><strong>Phone</strong>${esc(customerPhone(order))}</div><div class="kv"><strong>Address</strong>${esc(shippingAddress(order))}</div></div></div>
      <div class="detail-section"><h3>Order Summary</h3><div class="kv-grid"><div class="kv"><strong>Date</strong>${esc(fmtDate(order.created_at || order.order_date))}</div><div class="kv"><strong>Total</strong>${money(orderTotal(order))}</div><div class="kv"><strong>Order Status</strong>${pill(orderStatus(order))}</div><div class="kv"><strong>Payment Status</strong>${pill(paymentStatus(order))}</div></div></div>
      <div class="detail-section"><h3>Items</h3>${itemsMarkup(order)}</div>
      <div class="detail-section"><h3>Update Order</h3>
        <div class="edit-grid">
          <div class="field"><label for="editOrderStatus">Order Status</label><select id="editOrderStatus">${orderStatuses.map(s=>`<option value="${s}" ${norm(orderStatus(order))===s?"selected":""}>${s.replaceAll("_"," ")}</option>`).join("")}</select></div>
          <div class="field"><label for="editPaymentStatus">Payment Status</label><select id="editPaymentStatus">${paymentStatuses.map(s=>`<option value="${s}" ${norm(paymentStatus(order))===s?"selected":""}>${s.replaceAll("_"," ")}</option>`).join("")}</select></div>
          <div class="field"><label for="editCarrier">Carrier</label><input id="editCarrier" value="${esc(carrier)}" placeholder="USPS, UPS, FedEx..." /></div>
          <div class="field"><label for="editTracking">Tracking Number</label><input id="editTracking" value="${esc(tracking)}" placeholder="Tracking number" /></div>
          <div class="field full"><label for="editTrackingUrl">Tracking URL</label><input id="editTrackingUrl" value="${esc(order.tracking_url || turl)}" placeholder="Optional tracking URL" /></div>
          <div class="field full"><label for="editAdminNote">Internal Admin Note</label><textarea id="editAdminNote" placeholder="Internal note for this order only">${esc(order.admin_note || "")}</textarea></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn success" id="saveOrderBtn" type="button">Save Order Updates</button><button class="btn warning" id="saveAndEmailBtn" type="button">Save + Send Matching Email</button></div>
        <div class="note" style="margin-top:12px"><strong>Shipping protection:</strong> If you choose Shipped, add a carrier and tracking number first. The page will block a shipped save without tracking.</div>
      </div>
      <div class="detail-section"><h3>Email Actions</h3><div class="email-box"><h4>Send a specific customer email</h4><p>Uses your Supabase Edge Function: <strong>${esc(EMAIL_FUNCTION_NAME)}</strong>. Order Shipped includes carrier/tracking.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary email-action" data-email-type="payment_accepted">Payment Accepted</button><button class="btn secondary email-action" data-email-type="payment_issue">Payment Issue</button><button class="btn secondary email-action" data-email-type="order_processing">Processing</button><button class="btn secondary email-action" data-email-type="order_shipped">Shipped</button><button class="btn secondary email-action" data-email-type="order_delivered">Delivered</button><button class="btn secondary email-action" data-email-type="order_cancelled">Cancelled</button><button class="btn secondary email-action" data-email-type="order_rejected">Rejected</button></div>${turl ? `<a class="tracking-link" href="${esc(turl)}" target="_blank" rel="noopener">Open tracking link</a>` : ""}</div></div>
      <div class="detail-section"><h3>History</h3>${historyMarkup(order)}</div>`;

    $("reloadDetailBtn").addEventListener("click", loadOrders);
    $("saveOrderBtn").addEventListener("click", () => saveOrder(order, false));
    $("saveAndEmailBtn").addEventListener("click", () => saveOrder(order, true));
    document.querySelectorAll(".email-action").forEach(btn => btn.addEventListener("click", () => sendOrderEmail(order, btn.dataset.emailType)));
  }

  function buildUpdatesFromForm(){
    const os = $("editOrderStatus").value;
    const ps = $("editPaymentStatus").value;
    const carrier = $("editCarrier").value.trim();
    const tracking = $("editTracking").value.trim();
    const url = $("editTrackingUrl").value.trim();
    const note = $("editAdminNote").value.trim();
    if(os === "shipped" && (!carrier || !tracking)) throw new Error("Carrier and tracking number are required before marking an order as shipped.");
    const now = new Date().toISOString();
    const updates = { order_status: os, status: os, payment_status: ps, tracking_carrier: carrier || null, carrier: carrier || null, tracking_number: tracking || null, tracking: tracking || null, tracking_url: url || null, admin_note: note || null, updated_at: now };
    if(ps === "paid") updates.paid_at = now;
    if(os === "processing") updates.processing_at = now;
    if(os === "packed") updates.packed_at = now;
    if(os === "shipped") updates.shipped_at = now;
    if(os === "delivered") updates.delivered_at = now;
    if(os === "cancelled") updates.cancelled_at = now;
    if(os === "rejected") updates.rejected_at = now;
    return updates;
  }

  async function safeUpdateOrder(id, updates){
    const attempts = [
      updates,
      Object.fromEntries(Object.entries(updates).filter(([k]) => !["status","carrier","tracking","paid_at","processing_at","packed_at","shipped_at","delivered_at","cancelled_at","rejected_at"].includes(k))),
      Object.fromEntries(Object.entries(updates).filter(([k]) => ["order_status","payment_status","tracking_carrier","tracking_number","tracking_url","admin_note","updated_at"].includes(k))),
      Object.fromEntries(Object.entries(updates).filter(([k]) => ["status","payment_status","updated_at"].includes(k)))
    ];
    let lastError = null;
    for(const payload of attempts){
      const { error } = await supabaseClient.from("orders").update(payload).eq("id", id);
      if(!error) return;
      lastError = error;
      if(!/column|schema|could not find|does not exist/i.test(error.message || "")) break;
    }
    throw lastError || new Error("Unable to update order.");
  }

  function emailTypeFor(orderStatusValue, paymentStatusValue){
    if(paymentStatusValue === "paid") return "payment_accepted";
    if(paymentStatusValue === "failed") return "payment_issue";
    if(orderStatusValue === "processing" || orderStatusValue === "packed") return "order_processing";
    if(orderStatusValue === "shipped") return "order_shipped";
    if(orderStatusValue === "delivered") return "order_delivered";
    if(orderStatusValue === "cancelled") return "order_cancelled";
    if(orderStatusValue === "rejected") return "order_rejected";
    return "order_processing";
  }

  async function saveOrder(order, sendEmail){
    try{
      const updates = buildUpdatesFromForm();
      setStatus("Saving order updates...");
      await safeUpdateOrder(order.id, updates);
      setStatus("Order updates saved.", "good");
      await loadOrders();
      const fresh = allOrders.find(o => o.id === order.id) || order;
      renderOrderDetail(fresh);
      if(sendEmail){ await sendOrderEmail(fresh, emailTypeFor(updates.order_status, updates.payment_status)); }
    }catch(error){ console.error(error); setStatus(error.message || "Could not save order updates.", "bad"); alert(error.message || "Could not save order updates."); }
  }

  async function sendOrderEmail(order, type){
    const email = customerEmail(order);
    if(!email){ alert("This order does not have a customer email address."); return; }
    const carrier = $("editCarrier")?.value?.trim() || order.tracking_carrier || order.carrier || "";
    const trackingNumber = $("editTracking")?.value?.trim() || order.tracking_number || order.tracking || "";
    if(type === "order_shipped" && (!carrier || !trackingNumber)){ alert("Carrier and tracking number are required before sending a shipped email."); return; }
    setStatus("Sending customer email...");
    const payload = { type, to: email, customerName: customerName(order), orderNumber: orderNumber(order), orderDate: order.created_at || order.order_date, total: money(orderTotal(order)), carrier, trackingNumber, trackingUrl: $("editTrackingUrl")?.value?.trim() || trackingUrl(carrier, trackingNumber, order.tracking_url), statusNote: $("editAdminNote")?.value?.trim() || order.admin_note || "", rejectionReason: order.rejection_reason || "", items: (order.items || []).map(i => ({ name: i.product_name || i.name || i.product_key || "Item", quantity: i.quantity || i.qty || 1, price: i.unit_price || i.price || 0 })) };
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token || SUPABASE_ANON_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${EMAIL_FUNCTION_NAME}`, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${token}` }, body: JSON.stringify(payload) });
    const text = await res.text();
    if(!res.ok) { setStatus(`Email failed: ${text}`, "bad"); throw new Error(text || "Email function failed."); }
    if(type === "order_shipped") await safeUpdateOrder(order.id, { shipping_email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(()=>{});
    setStatus("Customer email sent successfully.", "good");
  }

  async function bulkUpdate(updates, message){
    const ids = selectedOrdersArray();
    if(!ids.length){ alert("Select one or more orders first."); return; }
    if(updates.order_status === "shipped" && !confirm("Bulk marking as shipped does not add tracking numbers. Continue only if tracking was already added to these orders.")) return;
    setStatus("Saving bulk updates...");
    const payload = { ...updates, updated_at: new Date().toISOString() };
    let failed = 0;
    for(const id of ids){ try{ await safeUpdateOrder(id, payload); } catch(e){ console.error(e); failed++; } }
    await loadOrders();
    setStatus(failed ? `${message} ${failed} order(s) could not be updated.` : message, failed ? "bad" : "good");
  }

  function wireEvents(){
    $("refreshBtn").addEventListener("click", loadOrders);
    $("signOutBtn").addEventListener("click", async () => { await supabaseClient.auth.signOut(); window.location.href = "index.html"; });
    ["searchInput","statusFilter","paymentFilter","dateFilter"].forEach(id => $(id).addEventListener(id==="searchInput"?"input":"change", applyFilters));
    $("clearFiltersBtn").addEventListener("click", () => { $("searchInput").value=""; $("statusFilter").value=""; $("paymentFilter").value=""; $("dateFilter").value=""; applyFilters(); });
    $("selectAllOrders").addEventListener("change", e => { if(e.target.checked) filteredOrders.forEach(o=>selectedOrderIds.add(o.id)); else filteredOrders.forEach(o=>selectedOrderIds.delete(o.id)); renderOrders(); renderSelectedCount(); });
    $("bulkPaidBtn").addEventListener("click", () => bulkUpdate({ payment_status:"paid" }, "Selected orders marked paid."));
    $("bulkProcessingBtn").addEventListener("click", () => bulkUpdate({ order_status:"processing", status:"processing" }, "Selected orders marked processing."));
    $("bulkPackedBtn").addEventListener("click", () => bulkUpdate({ order_status:"packed", status:"packed" }, "Selected orders marked packed."));
    $("bulkDeliveredBtn").addEventListener("click", () => bulkUpdate({ order_status:"delivered", status:"delivered" }, "Selected orders marked delivered."));
    $("bulkShippedBtn").addEventListener("click", () => bulkUpdate({ order_status:"shipped", status:"shipped" }, "Selected orders marked shipped."));
    $("bulkRejectedBtn").addEventListener("click", () => bulkUpdate({ order_status:"rejected", status:"rejected" }, "Selected orders marked rejected."));
    $("bulkClearBtn").addEventListener("click", () => { selectedOrderIds.clear(); renderOrders(); renderSelectedCount(); });
  }

  function showOrdersTableMessage(message){
    const body = $("ordersBody");
    if(body) body.innerHTML = `<tr><td colspan="8" class="muted">${esc(message)}</td></tr>`;
  }

  async function init(){
    try{
      wireEvents();

      if(!window.supabase || !window.supabase.createClient){
        const msg = "Supabase library did not load. Check your internet connection or the Supabase CDN script.";
        setStatus(msg, "bad");
        showOrdersTableMessage(msg);
        return;
      }

      if(!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("PASTE_") || SUPABASE_ANON_KEY.includes("PASTE_")){
        const msg = "Supabase URL/key are missing in admin.html. Paste the same SUPABASE_URL and SUPABASE_ANON_KEY from your working index.html/products.html.";
        setStatus(msg, "bad");
        showOrdersTableMessage(msg);
        return;
      }

      try{
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }catch(createError){
        const msg = `Supabase could not initialize: ${createError.message || createError}`;
        setStatus(msg, "bad");
        showOrdersTableMessage(msg);
        return;
      }

      if(await checkAdminAccess()) await loadOrders();
    }catch(error){
      console.error(error);
      const msg = error.message || "Something went wrong loading Admin Orders.";
      setStatus(msg, "bad");
      showOrdersTableMessage(msg);
    }
  }
  init();
