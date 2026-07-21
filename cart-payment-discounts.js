/* Pep Shop Texas cart payment-method discounts.
   Styling intentionally unchanged: this script reuses existing cart classes. */
(function () {
  const PAYMENT_DISCOUNT_RATES = {
    bitcoin: 0.10,
    zelle: 0.05,
    apple_pay: 0.05,
    apple_cash: 0.05
  };

  const PAYMENT_DISPLAY_LABELS = {
    bitcoin: "Bitcoin — Save 10% 🔥",
    zelle: "Zelle — Save 5%",
    apple_pay: "Apple Cash — Save 5%",
    apple_cash: "Apple Cash — Save 5%",
    credit_card: "Credit Card",
    google_pay: "Google Pay",
    pending: "Payment pending"
  };

  const PAYMENT_BASE_LABELS = {
    bitcoin: "Bitcoin",
    venmo: "Venmo",
    zelle: "Zelle",
    apple_pay: "Apple Cash",
    apple_cash: "Apple Cash",
    credit_card: "Credit Card",
    google_pay: "Google Pay",
    pending: "Payment pending"
  };

  function methodIdFromSelect() {
    const select = document.querySelector("[data-checkout-form] [name='payment_method']");
    return String(select?.value || "").trim();
  }

  function paymentDiscountRate(methodId) {
    return PAYMENT_DISCOUNT_RATES[String(methodId || "").trim()] || 0;
  }

  function paymentDisplayLabel(method = {}) {
    const id = String(method.id || method.key || "").trim();
    return PAYMENT_DISPLAY_LABELS[id] || method.label || id || "Payment method";
  }

  function paymentBaseLabel(method = {}) {
    const id = String(method.id || method.key || "").trim();
    return PAYMENT_BASE_LABELS[id] || method.label || id || "Payment method";
  }

  function paymentDiscountLabel(methodId) {
    const rate = paymentDiscountRate(methodId);
    if (!rate) return "";
    const base = PAYMENT_BASE_LABELS[methodId] || "Payment";
    return `${base} Savings (-${Math.round(rate * 100)}%)`;
  }

  function roundPaymentDiscount(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function parsePaymentMoney(text) {
    return Number(String(text || "").replace(/[^0-9.-]/g, "")) || 0;
  }

  function formatPaymentMoney(value) {
    if (typeof formatMoney === "function") return formatMoney(value);
    return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function patchCalculateCartTotals() {
    if (typeof calculateCartTotals !== "function" || calculateCartTotals.pstPaymentDiscountPatched) return;
    const originalCalculateCartTotals = calculateCartTotals;

    calculateCartTotals = function patchedCalculateCartTotals(rows, profile = {}) {
      const base = originalCalculateCartTotals(rows, profile);
      const methodId = methodIdFromSelect();
      const rate = paymentDiscountRate(methodId);
      const existingPromoDiscount = Number(base.discount || 0);
      const paymentDiscount = existingPromoDiscount > 0 ? 0 : roundPaymentDiscount(Number(base.subtotal || 0) * rate);
      const discount = roundPaymentDiscount(existingPromoDiscount + paymentDiscount);
      const total = roundPaymentDiscount(Number(base.total || 0) - paymentDiscount);

      return {
        ...base,
        discount,
        paymentDiscount,
        paymentDiscountRate: rate,
        paymentDiscountMethod: methodId,
        paymentDiscountBlocked: existingPromoDiscount > 0 && rate > 0,
        total
      };
    };

    calculateCartTotals.pstPaymentDiscountPatched = true;
  }

  function patchSummaryHtml() {
    if (typeof summaryHtml !== "function" || summaryHtml.pstPaymentDiscountPatched) return;
    const originalSummaryHtml = summaryHtml;

    summaryHtml = function patchedSummaryHtml(rows, context = {}) {
      const html = originalSummaryHtml(rows, context);
      const profile = context.profile || {};
      const totals = calculateCartTotals(rows, profile);
      const baseTotal = roundPaymentDiscount(Number(totals.total || 0) + Number(totals.paymentDiscount || 0));
      const paymentLine = totals.paymentDiscount > 0
        ? `<div class="summary-line" data-payment-discount-line><span>${escapeHtml(paymentDiscountLabel(totals.paymentDiscountMethod))}</span><strong>-${formatPaymentMoney(totals.paymentDiscount)}</strong></div>`
        : `<div class="summary-line" data-payment-discount-line hidden><span>Payment Savings</span><strong>-${formatPaymentMoney(0)}</strong></div>`;

      return html
        .replace(`<div class="summary-line"><span>Subtotal</span><strong>${formatPaymentMoney(totals.subtotal)}</strong></div>`, `<div class="summary-line"><span>Subtotal</span><strong>${formatPaymentMoney(totals.subtotal)}</strong></div>${paymentLine}`)
        .replace(/<div class="summary-line summary-total"><span>Total Before Store Credit<\/span><strong>[^<]*<\/strong><\/div>/, `<div class="summary-line summary-total"><span>Total Before Store Credit</span><strong data-cart-total-display data-base-total="${baseTotal}">${formatPaymentMoney(totals.total)}</strong></div>`);
    };

    summaryHtml.pstPaymentDiscountPatched = true;
  }

  function patchCheckoutFormHtml() {
    if (typeof checkoutFormHtml !== "function" || checkoutFormHtml.pstPaymentDiscountPatched) return;
    const originalCheckoutFormHtml = checkoutFormHtml;

    checkoutFormHtml = function patchedCheckoutFormHtml(rows, context) {
      const nextContext = { ...context };
      const methods = (context.paymentMethods || []).map((method) => ({
        ...method,
        label: paymentBaseLabel(method),
        displayLabel: paymentDisplayLabel(method)
      }));
      nextContext.paymentMethods = methods;

      let html = originalCheckoutFormHtml(rows, nextContext);

      methods.forEach((method) => {
        const base = paymentBaseLabel(method);
        const display = paymentDisplayLabel(method);
        if (display !== base) {
          html = html.replace(`>${escapeHtml(base)}</option>`, `>${escapeHtml(display)}</option>`);
        }
      });

      html = html.replace(
        `<label>Payment Method <select name="payment_method">`,
        `<p class="checkout-note">Choose a payment method below. Eligible payment discounts are applied automatically and cannot be combined with promotional discounts.</p><label>Payment Method <select name="payment_method">`
      );

      html = html.replace(
        `<p class="payment-instructions" data-payment-instructions></p>`,
        `<p class="payment-instructions" data-payment-instructions></p><p class="checkout-note" data-payment-discount-message hidden></p>`
      );

      return html;
    };

    checkoutFormHtml.pstPaymentDiscountPatched = true;
  }

  function updatePaymentDiscountDisplay() {
    const select = document.querySelector("[data-checkout-form] [name='payment_method']");
    if (!select) return;

    const methodId = String(select.value || "").trim();
    const subtotalText = document.querySelector("[data-cart-summary] .summary-line:first-of-type strong")?.textContent || "";
    const subtotal = parsePaymentMoney(subtotalText);
    const rate = paymentDiscountRate(methodId);
    const discount = roundPaymentDiscount(subtotal * rate);
    const line = document.querySelector("[data-payment-discount-line]");
    const message = document.querySelector("[data-payment-discount-message]");
    const totalDisplay = document.querySelector("[data-cart-total-display]");
    const storeCreditCheckbox = document.querySelector("[data-checkout-form] [name='apply_store_credit']");
    const availableStoreCredit = Number(document.querySelector("[data-available-store-credit]")?.dataset?.availableStoreCredit || 0);
    const storeCreditLine = document.querySelector("[data-store-credit-applied-line]");

    if (line) {
      if (discount > 0) {
        line.hidden = false;
        line.querySelector("span").textContent = paymentDiscountLabel(methodId);
        line.querySelector("strong").textContent = `-${formatPaymentMoney(discount)}`;
      } else {
        line.hidden = true;
      }
    }

    if (totalDisplay) {
      const baseTotal = parsePaymentMoney(totalDisplay.dataset.baseTotal || totalDisplay.textContent);
      totalDisplay.dataset.baseTotal = String(baseTotal);
      totalDisplay.textContent = formatPaymentMoney(roundPaymentDiscount(baseTotal - discount));
    }

    if (storeCreditLine) {
      const discountedTotal = totalDisplay ? parsePaymentMoney(totalDisplay.textContent) : 0;
      const storeCreditApplied = storeCreditCheckbox?.checked
        ? roundPaymentDiscount(Math.min(availableStoreCredit, discountedTotal))
        : 0;
      storeCreditLine.hidden = storeCreditApplied <= 0;
      storeCreditLine.querySelector("strong").textContent = `-${formatPaymentMoney(storeCreditApplied)}`;
    }

    if (message) {
      if (discount > 0) {
        const base = PAYMENT_BASE_LABELS[methodId] || "this payment method";
        message.hidden = false;
        message.textContent = `✓ Payment discount applied. You saved ${formatPaymentMoney(discount)} by paying with ${base}.`;
      } else {
        message.textContent = "";
        message.hidden = true;
      }
    }
  }

  function patchBindCartPageButtons() {
    if (typeof bindCartPageButtons !== "function" || bindCartPageButtons.pstPaymentDiscountPatched) return;
    const originalBindCartPageButtons = bindCartPageButtons;

    bindCartPageButtons = function patchedBindCartPageButtons() {
      originalBindCartPageButtons();
      const select = document.querySelector("[data-checkout-form] [name='payment_method']");
      if (select && !select.dataset.paymentDiscountBound) {
        select.dataset.paymentDiscountBound = "true";
        select.addEventListener("change", updatePaymentDiscountDisplay);
      }
      const storeCreditCheckbox = document.querySelector("[data-checkout-form] [name='apply_store_credit']");
      if (storeCreditCheckbox && !storeCreditCheckbox.dataset.storeCreditDisplayBound) {
        storeCreditCheckbox.dataset.storeCreditDisplayBound = "true";
        storeCreditCheckbox.addEventListener("change", updatePaymentDiscountDisplay);
      }
      updatePaymentDiscountDisplay();
    };

    bindCartPageButtons.pstPaymentDiscountPatched = true;
  }

  function applyPatches() {
    patchCalculateCartTotals();
    patchSummaryHtml();
    patchCheckoutFormHtml();
    patchBindCartPageButtons();
  }

  applyPatches();

  document.addEventListener("DOMContentLoaded", function () {
    applyPatches();
    if (document.body?.dataset?.page === "cart" && typeof renderCartPage === "function") {
      renderCartPage();
    }
  });
})();
