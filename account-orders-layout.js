/* Replaces Recent Orders markup with one controlled layout. */
(() => {
  const css = `
    .account-orders-panel .recent-orders-list{display:grid;gap:0}
    .account-orders-panel .pst-order-row{padding:20px 0!important;border:0!important;border-bottom:1px solid #e8e3da!important;background:#fff!important;border-radius:0!important;box-shadow:none!important}
    .account-orders-panel .pst-order-summary-grid{display:grid;grid-template-columns:1.15fr 1.15fr 126px .8fr;gap:10px;align-items:end;background:#fff!important}
    .account-orders-panel .pst-order-field{min-width:0;display:grid;gap:6px;background:#fff!important}
    .account-orders-panel .pst-order-field>strong{color:#66707b;font:700 10px/1 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase}
    .account-orders-panel .pst-order-field>span:not(.pst-order-control){color:var(--pst-navy);font:400 14px/1.2 Arial,Helvetica,sans-serif;white-space:nowrap}
    .account-orders-panel .pst-order-number{white-space:nowrap!important}
    .account-orders-panel .pst-order-controls{display:grid!important;grid-template-columns:repeat(2,126px)!important;gap:8px!important;margin-top:14px!important;background:#fff!important}
    .account-orders-panel .pst-order-control{box-sizing:border-box!important;width:126px!important;height:38px!important;min-width:126px!important;max-width:126px!important;min-height:38px!important;max-height:38px!important;margin:0!important;padding:0 8px!important;border:1px solid var(--pst-navy)!important;border-radius:2px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font:700 9.5px/1 Arial,Helvetica,sans-serif!important;letter-spacing:0!important;white-space:nowrap!important;text-align:center!important;box-shadow:none!important;overflow:visible!important;text-overflow:clip!important}
    .account-orders-panel .pst-order-action{background:var(--pst-navy)!important;color:#fff!important;text-transform:uppercase!important;cursor:pointer!important;appearance:none!important;-webkit-appearance:none!important}
    .account-orders-panel .pst-order-action:hover,.account-orders-panel .pst-order-action:focus-visible{background:var(--pst-gold)!important;border-color:var(--pst-gold)!important;color:var(--pst-navy)!important;outline:none!important}
    .account-orders-panel .pst-order-info{background:#fff!important;color:var(--pst-navy)!important;text-transform:none!important;cursor:default!important}
    .account-orders-panel .pst-order-summary-grid .pst-order-info{justify-self:start}
    .account-orders-panel .order-items{margin-top:14px}
    @media(max-width:620px){.account-orders-panel .pst-order-summary-grid{grid-template-columns:1fr 1fr}.account-orders-panel .pst-order-controls{grid-template-columns:repeat(2,minmax(0,126px))!important}}
  `;
  const style = document.createElement('style');
  style.id = 'pst-recent-orders-style';
  style.textContent = css;
  document.head.appendChild(style);

  window.renderOrders = function renderOrders() {
    const list = document.getElementById('ordersList');
    if (!list) return;
    if (!pstAccountOrders.length) {
      list.className = 'empty-state';
      list.innerHTML = 'No previous orders yet. When you checkout, your orders will appear here.';
      return;
    }
    list.className = 'recent-orders-list';
    list.innerHTML = pstAccountOrders.map(order => {
      const items = pstAccountItemsByOrder[order.id] || [];
      const tracking = order.tracking_number ? `${pstEsc(order.tracking_carrier || 'Tracking')}: ${pstEsc(order.tracking_number)}` : 'Not added yet';
      return `<article class="pst-order-row">
        <div class="pst-order-summary-grid">
          <div class="pst-order-field"><strong>Order</strong><span class="pst-order-number">${pstEsc(order.order_number || order.id)}</span></div>
          <div class="pst-order-field"><strong>Date</strong><span>${formatDate(order.created_at)}</span></div>
          <div class="pst-order-field"><strong>Status</strong><span class="pst-order-control pst-order-info">${pstEsc(order.status || 'Pending')}</span></div>
          <div class="pst-order-field"><strong>Total</strong><span>${pstMoney(order.total)}</span></div>
        </div>
        <div class="pst-order-controls">
          <button class="pst-order-control pst-order-action" type="button" onclick="toggleOrderDetails('${order.id}')">View Order</button>
          <button class="pst-order-control pst-order-action" type="button" onclick="reorder('${order.id}')">Reorder</button>
          <span class="pst-order-control pst-order-info">Payment: ${pstEsc(order.payment_status || 'Pending')}</span>
          <span class="pst-order-control pst-order-info">Tracking: ${tracking}</span>
        </div>
        <div id="items-${order.id}" class="order-items">${items.length ? items.map(item => `<div class="item-line"><div class="item-name"><strong>${pstEsc(item.product_name)}</strong><span>${pstEsc(item.product_strength || item.product_category || '')}</span></div><div>Qty ${Number(item.quantity || 0)}</div><div>${pstMoney(item.unit_price)}</div><div><strong>${pstMoney(item.line_total)}</strong></div></div>`).join('') : `<div class="item-line"><div>No item details found for this order.</div></div>`}<div class="item-line"><div><strong>Subtotal</strong></div><div></div><div></div><div>${pstMoney(order.subtotal)}</div></div><div class="item-line"><div><strong>Shipping</strong></div><div></div><div></div><div>${pstMoney(order.shipping)}</div></div><div class="item-line"><div><strong>Tax</strong></div><div></div><div></div><div>${pstMoney(order.tax)}</div></div><div class="item-line"><div><strong>Total</strong></div><div></div><div></div><div><strong>${pstMoney(order.total)}</strong></div></div></div>
      </article>`;
    }).join('');
  };
})();
