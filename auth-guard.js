(() => {
  "use strict";

  const SUPABASE_URL = "https://ucejjztsbmrogiteivxl.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZZweuz4h3PMhOGrs0hBpiA_jruqk4dX";
  const mode = document.documentElement.dataset.authGuard || "";
  const style = document.getElementById("pst-auth-guard-style");

  function reveal() {
    document.documentElement.style.visibility = "visible";
    style?.remove();
  }

  function currentTarget() {
    const file = window.location.pathname.split("/").pop() || "account.html";
    return `${file}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function loginUrl() {
    return `login.html?redirect=${encodeURIComponent(currentTarget())}`;
  }

  function redirect(url) {
    window.location.replace(url);
  }

  function showGuardError(message) {
    reveal();
    document.body.innerHTML = `
      <main style="max-width:680px;margin:12vh auto;padding:32px;font-family:Arial,sans-serif;color:#102a43">
        <h1 style="margin:0 0 12px">Unable to verify access</h1>
        <p style="line-height:1.6">${String(message || "Please refresh and try again.")}</p>
        <p><a href="login.html">Return to login</a></p>
      </main>`;
  }

  async function run() {
    if (!mode) {
      reveal();
      return;
    }

    if (!window.supabase?.createClient) {
      showGuardError("Supabase did not load. Check your connection and refresh the page.");
      return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.pstAuthGuardClient = client;

    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) {
        redirect(loginUrl());
        return;
      }

      const user = data.user;
      if (mode === "admin") {
        const { data: admin, error: adminError } = await client
          .from("admin_users")
          .select("user_id,is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (adminError || !admin) {
          redirect("account.html?access=denied");
          return;
        }
      }

      window.pstAuthenticatedUser = user;
      reveal();
      window.dispatchEvent(new CustomEvent("pst-auth-ready", { detail: { mode, user } }));

      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") redirect(loginUrl());
      });
    } catch (error) {
      console.error("Authentication guard failed", error);
      showGuardError("Pep Shop Texas could not verify your login. Refresh the page and try again.");
    }
  }

  run();
})();
