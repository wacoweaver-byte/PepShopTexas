(function(){
  "use strict";

  const markup = `
    <div class="pst-admin-footer-inner">
      <div class="pst-admin-footer-brand">
        <strong>Pep Shop Texas Admin</strong>
        <span>Operational management for orders, inventory, products, customers, promotions, and reporting.</span>
      </div>
      <nav class="pst-admin-footer-column" aria-label="Admin footer navigation">
        <strong>Admin</strong>
        <a href="orders.html">Orders</a>
        <a href="inventory.html">Inventory</a>
        <a href="products.html">Products</a>
        <a href="customers.html">Customers</a>
      </nav>
      <nav class="pst-admin-footer-column" aria-label="Admin footer tools">
        <strong>Tools</strong>
        <a href="discounts.html">Discounts</a>
        <a href="promotions.html">Promotions</a>
        <a href="reports.html">Reports</a>
        <a href="index.html">View Site</a>
      </nav>
    </div>
    <div class="pst-admin-footer-legal">Pep Shop Texas administrative system</div>`;

  function install(){
    let footer=document.querySelector("footer.pst-admin-footer");
    if(!footer){
      footer=document.createElement("footer");
      footer.className="site-footer pst-admin-footer";
      document.body.appendChild(footer);
    }
    footer.innerHTML=markup;
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",install,{once:true});
  }else{
    install();
  }
})();
