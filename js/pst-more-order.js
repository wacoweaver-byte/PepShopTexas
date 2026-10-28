/* Pep Shop Texas · owner app: arrange the More cards (v1.0)
   Every card on More gets a grip handle. Press the handle and drag the card where you want it (mouse or finger),
   or focus the handle and use the arrow keys. The order is saved on this device right away and to the owner's
   account (auth user metadata), so phone and computer match. "Reset order" puts the default back. */
(() => {
  const P = window.PST, KEY = "pst-more-order", META = "pst_more_order";
  const GRIP = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></g></svg>`;
  const keyOf = c => c.dataset.more || c.getAttribute("href") || c.textContent.trim();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const write = a => { try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY); } catch {} };
  let box = null, defaults = [], syncT = 0;

  const current = () => [...box.querySelectorAll(":scope > .mrow")].map(r => r.dataset.mk);
  function apply(order) {
    if (!box || !Array.isArray(order)) return;
    const rows = Object.fromEntries([...box.querySelectorAll(":scope > .mrow")].map(r => [r.dataset.mk, r]));
    order.forEach(k => { if (rows[k]) { box.appendChild(rows[k]); delete rows[k]; } });
    defaults.forEach(k => { if (rows[k]) box.appendChild(rows[k]); }); // cards added in later updates go at the end
    resetBtn();
  }
  function save() {
    const a = current(), same = a.join("|") === defaults.join("|");
    write(same ? null : a); resetBtn();
    clearTimeout(syncT); syncT = setTimeout(() => { P.client()?.auth.updateUser({ data: { [META]: same ? null : a } }).catch(() => {}); }, 800);
  }
  function resetBtn() {
    if (!box) return; let b = box.parentElement.querySelector("[data-mreset]");
    const custom = current().join("|") !== defaults.join("|");
    if (!b) { box.insertAdjacentHTML("afterend", `<p class="mresetp"><button type="button" class="linkish small" data-mreset>Reset card order</button></p>`); b = box.parentElement.querySelector("[data-mreset]"); b.addEventListener("click", () => { apply(defaults); save(); P.toast?.("Cards back in the original order"); }); }
    b.parentElement.hidden = !custom;
  }

  function setup(el) {
    if (el.dataset.mready) return; el.dataset.mready = "1"; box = el;
    [...el.children].forEach(c => {
      if (!c.classList.contains("mcard")) return;
      const row = document.createElement("div"); row.className = "mrow"; row.dataset.mk = keyOf(c);
      const name = c.querySelector("b")?.textContent || "card";
      row.innerHTML = `<button type="button" class="mgrip" aria-label="Move ${name.replace(/"/g, "")}. Drag, or use the arrow keys" title="Drag to move">${GRIP}</button>`;
      c.replaceWith(row); row.appendChild(c);
    });
    defaults = current();
    apply(read());
    P.client()?.auth.getUser().then(({ data }) => { const a = data?.user?.user_metadata?.[META]; if (Array.isArray(a)) { apply(a); write(a); } }).catch(() => {});
  }

  /* ---------- dragging (pointer events: works for mouse, finger and pen) ---------- */
  let drag = null;
  const se = () => document.scrollingElement || document.documentElement;
  document.addEventListener("pointerdown", e => {
    const g = e.target.closest(".mgrip"); if (!g || !box || !box.contains(g) || e.button > 0) return;
    e.preventDefault(); const row = g.closest(".mrow");
    drag = { row, g, id: e.pointerId, y0: e.clientY + se().scrollTop, off: 0, lastY: e.clientY, moved: false, raf: 0 };
    g.setPointerCapture(e.pointerId); row.classList.add("dragging"); box.classList.add("sorting");
    if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
    const tick = () => { if (!drag) return; const y = drag.lastY, h = innerHeight, edge = 70;
      const v = y < edge ? -Math.ceil((edge - y) / 6) : y > h - edge ? Math.ceil((y - (h - edge)) / 6) : 0;
      if (v) { se().scrollTop += v; move(); } drag.raf = requestAnimationFrame(tick); };
    drag.raf = requestAnimationFrame(tick);
  });
  function move() {
    if (!drag) return; const { row } = drag, gap = parseFloat(getComputedStyle(box).rowGap) || 12;
    let dy = drag.lastY + se().scrollTop - drag.y0;
    for (let n = 0; n < 60; n++) { // swap with a neighbour once the card passes its middle (same threshold both ways, so it never flips back)
      const nx = row.nextElementSibling, pv = row.previousElementSibling;
      if (dy > 0 && nx && nx.classList.contains("mrow") && dy > (nx.offsetHeight + gap) / 2) { const s = nx.offsetHeight + gap; box.insertBefore(nx, row); drag.y0 += s; dy -= s; drag.moved = true; continue; }
      if (dy < 0 && pv && pv.classList.contains("mrow") && -dy > (pv.offsetHeight + gap) / 2) { const s = pv.offsetHeight + gap; box.insertBefore(row, pv); drag.y0 -= s; dy += s; drag.moved = true; continue; }
      break;
    }
    if (!row.nextElementSibling && dy > 0) dy = Math.min(dy, 24); if (!row.previousElementSibling && dy < 0) dy = Math.max(dy, -24);
    row.style.transform = `translateY(${dy}px)`;
  }
  document.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.id) return; e.preventDefault(); drag.lastY = e.clientY; move(); }, { passive: false });
  const end = e => { if (!drag || (e && e.pointerId !== drag.id)) return; const { row, raf, moved } = drag; cancelAnimationFrame(raf); drag = null;
    row.style.transform = ""; row.classList.remove("dragging"); box.classList.remove("sorting"); if (moved) save(); };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  document.addEventListener("click", e => { if (e.target.closest(".mgrip")) e.preventDefault(); }, true);

  /* ---------- keyboard: arrow keys on a focused handle ---------- */
  document.addEventListener("keydown", e => {
    const g = e.target.closest?.(".mgrip"); if (!g || !box || !box.contains(g)) return;
    const row = g.closest(".mrow");
    if (e.key === "ArrowUp" && row.previousElementSibling) { e.preventDefault(); box.insertBefore(row, row.previousElementSibling); g.focus(); save(); }
    if (e.key === "ArrowDown" && row.nextElementSibling) { e.preventDefault(); box.insertBefore(row.nextElementSibling, row); g.focus(); save(); }
  });

  /* the More screen is drawn after sign-in, so watch for its card list */
  const look = () => { const el = document.querySelector("[data-morehome] .mcards"); if (el && !el.dataset.mready) setup(el); };
  new MutationObserver(look).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", look); look();
})();
