(() => {
  const VIEWER_ID = "pst-coa-viewer";
  let previousFocus = null;
  let previousOverflow = "";

  function buildViewer() {
    let viewer = document.getElementById(VIEWER_ID);
    if (viewer) return viewer;

    viewer = document.createElement("div");
    viewer.id = VIEWER_ID;
    viewer.className = "pst-coa-viewer";
    viewer.hidden = true;
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-labelledby", "pst-coa-viewer-title");
    viewer.innerHTML = `
      <div class="pst-coa-viewer-panel">
        <header class="pst-coa-viewer-header">
          <h2 id="pst-coa-viewer-title">Certificate of Analysis</h2>
          <button type="button" class="pst-coa-viewer-close" data-close-coa aria-label="Close certificate of analysis">× Close</button>
        </header>
        <iframe class="pst-coa-viewer-frame" title="Certificate of Analysis" loading="eager"></iframe>
      </div>
    `;

    viewer.addEventListener("click", (event) => {
      if (event.target === viewer || event.target.closest("[data-close-coa]")) closeViewer();
    });

    document.body.appendChild(viewer);
    return viewer;
  }

  function openViewer(url, label) {
    const viewer = buildViewer();
    const frame = viewer.querySelector(".pst-coa-viewer-frame");
    const title = viewer.querySelector("#pst-coa-viewer-title");

    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    title.textContent = label || "Certificate of Analysis";
    frame.src = url;
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    viewer.querySelector(".pst-coa-viewer-close").focus();
  }

  function closeViewer() {
    const viewer = document.getElementById(VIEWER_ID);
    if (!viewer || viewer.hidden) return;

    const frame = viewer.querySelector(".pst-coa-viewer-frame");
    viewer.hidden = true;
    frame.src = "about:blank";
    document.body.style.overflow = previousOverflow;

    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.coa-button");
    if (!link || !link.href) return;

    event.preventDefault();
    openViewer(link.href, link.textContent.trim() || "Certificate of Analysis");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeViewer();
  });
})();
