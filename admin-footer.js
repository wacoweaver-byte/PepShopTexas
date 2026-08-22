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
        <a href="bulk-requests.html">Bulk Requests</a>
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
    installBulkRequestLink();
  }

  function installBulkRequestLink(){
    const nav=document.querySelector(".pst-admin-nav");
    if(!nav)return;
    let link=nav.querySelector('a[href="bulk-requests.html"]');
    if(!link){
      link=document.createElement("a");
      link.href="bulk-requests.html";
      link.textContent="Bulk Requests";
      const reports=nav.querySelector('a[href="reports.html"]');
      reports ? nav.insertBefore(link,reports) : nav.appendChild(link);
    }
    link.classList.toggle("active",document.body.dataset.adminPage==="bulk-requests");
    link.style.position="relative";
    link.dataset.bulkAdminLink="";
    if(!document.getElementById("pst-bulk-admin-badge-style")){
      const style=document.createElement("style");
      style.id="pst-bulk-admin-badge-style";
      style.textContent='.pst-bulk-admin-badge{position:absolute;top:-13px;right:-13px;min-width:19px;height:19px;padding:0 5px;border-radius:20px;background:#b42318;color:#fff;display:inline-grid;place-items:center;font:700 11px/1 Arial,sans-serif}.pst-bulk-admin-badge[hidden]{display:none}';
      document.head.appendChild(style);
    }
    refreshBulkBadge(link);
  }

  async function refreshBulkBadge(link){
    const client=window.pstAuthGuardClient;
    if(!client||!window.pstAuthenticatedUser)return;
    const result=await client.from("bulk_requests").select("request_number",{count:"exact",head:true}).eq("status","new");
    if(result.error)return;
    let badge=link.querySelector(".pst-bulk-admin-badge");
    if(!badge){badge=document.createElement("span");badge.className="pst-bulk-admin-badge";link.appendChild(badge)}
    const count=result.count||0;
    badge.hidden=!count;
    badge.textContent=count>99?"99+":String(count);
    badge.setAttribute("aria-label",count+" new bulk requests");
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",install,{once:true});
  }else{
    install();
  }
  window.addEventListener("pst-auth-ready",installBulkRequestLink,{once:true});
})();
