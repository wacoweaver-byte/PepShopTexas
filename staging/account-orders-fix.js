(function(){
  "use strict";
  function normalizeOrders(){
    const root=document.getElementById("ordersList");
    if(!root) return;
    const all=[...root.querySelectorAll("a,button,span,div")];
    all.forEach(el=>{
      const text=(el.textContent||"").trim();
      if(/^PST-/i.test(text) && text.length<24) el.classList.add("pst-order-number");
      if(/^(VIEW ORDER|REORDER)$/i.test(text)) el.classList.add("pst-order-control","pst-order-action");
      else if(/^(complete|pending|processing|cancelled|canceled|shipped)$/i.test(text)) el.classList.add("pst-order-control","pst-order-info");
      else if(/^Payment:/i.test(text)) el.classList.add("pst-order-control","pst-order-info");
      else if(/^Tracking:/i.test(text)) el.classList.add("pst-order-control","pst-order-info");
    });
  }
  const start=()=>{
    const root=document.getElementById("ordersList");
    if(!root) return;
    normalizeOrders();
    new MutationObserver(normalizeOrders).observe(root,{childList:true,subtree:true,characterData:true});
  };
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true}); else start();
})();