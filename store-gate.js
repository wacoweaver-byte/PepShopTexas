(() => {
  "use strict";

  const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  const protectedPages = new Set([
    "index.html",
    "catalog.html",
    "product.html",
    "cart.html",
    "bulk-request.html",
    "research-library.html"
  ]);

  if (!protectedPages.has(currentFile)) return;

  const style = document.createElement("style");
  style.id = "pst-store-gate-style";
  style.textContent = "html{visibility:hidden!important}";
  document.head.appendChild(style);

  function reveal() {
    document.documentElement.style.visibility = "visible";
    style.remove();
  }

  function redirectToGate() {
    const target = `${currentFile}${window.location.search || ""}${window.location.hash || ""}`;
    window.location.replace(`access.html?redirect=${encodeURIComponent(target)}`);
  }

  async function run() {
    try {
      for (let i = 0; i < 40 && !window.supabase?.createClient; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!window.supabase?.createClient) throw new Error("Supabase unavailable");
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data?.session) {
        redirectToGate();
        return;
      }
      reveal();
    } catch (error) {
      console.warn("Store access check failed", error);
      redirectToGate();
    }
  }

  run();
})();
