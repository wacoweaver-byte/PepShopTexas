/* PST_CART_STORE_CREDIT_AUTO_V1
   Store credit checkout rule:
   - Customers do not choose whether to apply available store credit.
   - If available credit exists, it is applied automatically up to the order total.
   - If no credit exists, the summary says Total, not Total Before Store Credit.
   This file intentionally runs after app.js and cart-payment-discounts.js. */
(function () {
  const MONEY_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  let pending = false;

  function moneyValue(text) {
    const raw = String(text || "").replace(/[^0-9.\-]/g, "");
    const value = Number(raw || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function money(value) {
    return MONEY_FORMATTER.format(Math.max(0, Math.round((Number(value) || 0) * 100) / 100));
  }

  function negativeMoney(value) {
    return `-${money(value)}`;
  }

  function allSummaryLines(summary) {
    return Array.from(summary.querySelectorAll(".summary-line"));
  }

  function lineLabel(line) {
    return String(line.querySelector("span")?.textContent || "").trim();
  }

  function lineAmount(line) {
    return moneyValue(line.querySelector("strong")?.textContent || "0");
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function isCreditLine(line) {
    const label = lineLabel(line);
    return /^(Available Store Credit|Store Credit Applied)$/i.test(label);
  }

  function subtotalBeforeCredit(summary) {
    return allSummaryLines(summary).reduce((sum, line) => {
      if (line.classList.contains("summary-total")) return sum;
      if (isCreditLine(line)) return sum;
      return sum + lineAmount(line);
    }, 0);
  }

  function forceStoreCreditInput(summary) {
    const input = summary.querySelector("input[name='apply_store_credit']");
    if (!input) return false;

    input.checked = true;
    input.setAttribute("checked", "checked");
    input.value = "yes";

    const label = input.closest("label");
    if (label) {
      label.hidden = true;
      label.style.display = "none";
    }
    return true;
  }

  function normalizeStoreCreditSummary() {
    const summary = document.querySelector("[data-cart-summary]");
    if (!summary) return;

    const totalLine = summary.querySelector(".summary-line.summary-total");
    if (!totalLine) return;

    const totalLabel = totalLine.querySelector("span");
    const totalValue = totalLine.querySelector("strong");
    const creditInputExists = forceStoreCreditInput(summary);

    const creditLine = allSummaryLines(summary).find(isCreditLine);
    const creditBalance = creditLine ? Math.abs(lineAmount(creditLine)) : 0;
    const baseTotal = Math.max(0, subtotalBeforeCredit(summary));
    const appliedCredit = creditInputExists || creditBalance > 0 ? Math.min(creditBalance, baseTotal) : 0;

    if (appliedCredit > 0 && creditLine) {
      setText(creditLine.querySelector("span"), "Store Credit Applied");
      setText(creditLine.querySelector("strong"), negativeMoney(appliedCredit));
      setText(totalLabel, "Total");
      setText(totalValue, money(baseTotal - appliedCredit));
    } else {
      setText(totalLabel, "Total");
      if (baseTotal > 0) setText(totalValue, money(baseTotal));
    }
  }

  function scheduleNormalize() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      normalizeStoreCreditSummary();
    });
  }

  document.addEventListener("submit", (event) => {
    const form = event.target?.closest?.("[data-checkout-form]");
    if (!form) return;
    const input = form.querySelector("input[name='apply_store_credit']");
    if (input) {
      input.checked = true;
      input.setAttribute("checked", "checked");
      input.value = "yes";
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("[name='payment_method'], input[name='apply_store_credit']")) {
      scheduleNormalize();
      setTimeout(scheduleNormalize, 50);
      setTimeout(scheduleNormalize, 250);
    }
  }, true);

  const observer = new MutationObserver(scheduleNormalize);

  function start() {
    const summary = document.querySelector("[data-cart-summary]");
    if (summary) observer.observe(summary, { childList: true, subtree: true, characterData: true });
    scheduleNormalize();
    setTimeout(scheduleNormalize, 50);
    setTimeout(scheduleNormalize, 250);
    setTimeout(scheduleNormalize, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
