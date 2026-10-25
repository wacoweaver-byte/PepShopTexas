/* PST product details: responsive strength pricing; preserve site branding and cart. */
(function () {
  const shell = document.querySelector("[data-product-detail]");
  if (!shell) return;
  const style = document.createElement("style");
  style.textContent = `
    .pst-strength-options{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 18px}
    .pst-strength-option{border:1px solid #bdcbd6;background:#fff;color:#102a43;border-radius:9px;padding:12px 16px;min-height:44px;font:inherit;font-weight:650;cursor:pointer}
    .pst-strength-option[aria-pressed="true"]{background:#102a43;color:white;border-color:#102a43}
    .pst-strength-price{border:1px solid #d9e2e9;background:#f5f8fa;border-radius:12px;padding:18px;margin:12px 0 20px}
    .pst-strength-price strong{font-size:1.7rem;color:#102a43;display:block;margin-top:6px}
    .pst-strength-price .pst-price-label{font-size:.85rem;color:#536a7b}
    .pst-product-text-only .detail-variant-picker{display:none}
    .pst-product-purchase .purchase-panel{display:flex;align-items:end;gap:12px;flex-wrap:wrap}
    .pst-product-purchase .purchase-panel .primary-action{min-height:44px}
    .pst-product-detail-body{margin-top:22px}
    @media(max-width:700px){.pst-strength-option{flex:1 1 calc(33.33% - 10px);text-align:center}.pst-product-purchase .purchase-panel .primary-action{flex:1 1 100%}.pst-strength-price{padding:15px}}
  `;
  document.head.appendChild(style);
  function formatHeading(info) {
    const heading=info.querySelector("h1");
    if(!heading)return;
    const match=String(heading.textContent||"").trim().match(/^(.*?)(\\s*\\([^()]+\\))\\s*$/);
    if(!match)return;
    heading.textContent=match[1].trimEnd()+" ";
    const detail=document.createElement("span");
    detail.className="pst-product-formula";
    detail.textContent=match[2].trim();
    heading.appendChild(detail);
  }
  async function enhance(){
    const info=shell.querySelector(".product-info");
    if(!info||info.dataset.pstDetailEnhanced)return false;
    info.dataset.pstDetailEnhanced="true";
    formatHeading(info);
    const children=Array.from(info.children);
    const index=children.findIndex(node=>node.tagName==="SECTION");
    const topChildren=index>=0?children.slice(0,index):children;
    const detailChildren=index>=0?children.slice(index):[];
    const purchase=document.createElement("div");
    purchase.className="pst-product-purchase";
    topChildren.forEach(node=>purchase.appendChild(node));
    const top=document.createElement("div");
    top.className="pst-product-top pst-product-text-only";
    top.appendChild(purchase);
    const body=document.createElement("div");
    body.className="pst-product-detail-body";
    detailChildren.forEach(node=>body.appendChild(node));
    info.replaceChildren(top,body);
    const addButton=purchase.querySelector("[data-add-to-cart]");
    if(addButton){addButton.textContent="Add to Cart";addButton.setAttribute("aria-label","Add to Cart");}
    const viewCart=purchase.querySelector(".secondary-action");
    if(viewCart)viewCart.textContent="View Cart";
    const selector=purchase.querySelector("[data-detail-variant-select]");
    const purchasePanel=purchase.querySelector(".purchase-panel");
    if(!purchasePanel)return true;
    const options=document.createElement("div");
    options.className="pst-strength-options";
    options.setAttribute("role","group");
    options.setAttribute("aria-label","Available vial strengths");
    const label=document.createElement("h2");
    label.textContent="Available strengths";
    label.style.fontSize="1rem";
    label.style.margin="12px 0 4px";
    const priceBox=document.createElement("div");
    priceBox.className="pst-strength-price";
    priceBox.setAttribute("aria-live","polite");
    purchasePanel.before(label,options,priceBox);
    try {
      const products=await getProducts();
      const key=new URLSearchParams(location.search).get("key");
      const current=products.find(p=>String(p.product_key)===key) || products.find(p=>String(p.product_key)===String(addButton?.dataset.addToCart));
      if(!current)throw new Error("Product not found");
      const variants=products.filter(p=>String(p.display_name||"").trim().toLowerCase()===String(current.display_name||"").trim().toLowerCase())
        .sort((a,b)=>String(a.strength||"").localeCompare(String(b.strength||""),undefined,{numeric:true}));
      let active=current;
      function select(p){
        active=p;
        options.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.productKey===p.product_key)));
        const amount=typeof unitPrice==="function"?unitPrice(p):Number(p.price||0);
        priceBox.replaceChildren();
        const small=document.createElement("div");small.className="pst-price-label";small.textContent="Selected vial: "+(p.strength||"Standard");
        const strong=document.createElement("strong");strong.textContent=Number.isFinite(amount)?amount.toLocaleString("en-US",{style:"currency",currency:"USD"}):"Price unavailable";
        priceBox.append(small,strong);
        if(addButton){addButton.dataset.addToCart=p.product_key;addButton.textContent="Add to Cart";addButton.classList.remove("is-added");}
        if(selector)selector.value=productUrl(p);
        const url=new URL(location.href);url.searchParams.set("key",p.product_key);url.searchParams.delete("id");history.replaceState(null,"",url);
      }
      variants.forEach(p=>{
        const b=document.createElement("button");
        b.type="button";b.className="pst-strength-option";b.textContent=p.strength||"Standard";b.dataset.productKey=p.product_key;
        b.addEventListener("click",()=>select(p));options.appendChild(b);
      });
      select(active);
    } catch(err) {
      if(selector){selector.style.display="block";selector.parentElement.style.display="block";}
      label.remove();options.remove();priceBox.remove();
      console.warn("Product pricing unavailable",err);
    }
    return true;
  }
  if(enhance())return;
  const observer=new MutationObserver(()=>{if(enhance())observer.disconnect()});
  observer.observe(shell,{childList:true,subtree:true});
})();
