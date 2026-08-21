(function(){
  "use strict";

  const links = [
    ["orders", "Orders", "orders.html"],
    ["inventory", "Inventory", "inventory.html"],
    ["products", "Products", "products.html"],
    ["discounts", "Discounts", "discounts.html"],
    ["promotions", "Promotions", "promotions.html"],
    ["reports", "Reports", "reports.html"],
    ["customers", "Customers", "customers.html"],
    ["site", "View Site", "index.html"]
  ];

  function pageKey(){
    const explicit = document.body?.dataset?.adminPage;
    if(explicit) return explicit;
    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    if(file === "admin.html" || file === "orders.html" || !file) return "orders";
    return file.replace(/\.html$/i, "");
  }

  function install(){
    const current = pageKey();
    const nav = links.map(([key,label,href]) => {
      const active = key === current;
      return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ""}>${label}</a>`;
    }).join("");

    const markup = `
      <div class="pst-admin-nav-wrap">
        <a class="pst-admin-logo-link" href="orders.html" aria-label="Pep Shop Texas Admin Orders">
          <img src="pst-header-logo.png" alt="PST Pep Shop Texas" class="pst-admin-header-logo">
        </a>
        <nav class="pst-admin-nav" aria-label="Admin navigation">${nav}</nav>
      </div>`;

    let header = document.querySelector("body > header");
    if(!header){
      header = document.createElement("header");
      document.body.prepend(header);
    }
    header.className = "pst-admin-header";
    header.innerHTML = markup;
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", install, {once:true});
  }else{
    install();
  }
})();
