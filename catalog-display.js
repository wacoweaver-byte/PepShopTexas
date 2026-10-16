/* Pep Shop Texas split catalog. Uses shared Supabase products, existing branding and cart. */
(function () {
  const css=document.createElement("style");
  css.textContent=`
  html:has(.pst-split-catalog),body:has(.pst-split-catalog){overflow-x:clip!important}\n  .catalog-page:has(.pst-split-catalog){max-width:none!important;width:calc(100% - 48px)!important;margin-left:auto!important;margin-right:auto!important;padding-left:0!important;padding-right:0!important;box-sizing:border-box!important}
  .catalog-page:has(.pst-split-catalog) .page-heading{margin-bottom:18px}
  .catalog-page:has(.pst-split-catalog) .catalog-toolbar{display:none}
  .catalog-page .catalog-grid.pst-split-catalog{width:100%!important;max-width:none!important;display:grid!important;grid-template-columns:minmax(260px,300px) minmax(0,1fr)!important;gap:0!important;align-items:stretch;border:1px solid #dbe2e8;border-radius:12px;overflow:clip;background:#fff;min-height:620px}
  .pst-catalog-sidebar{border-right:1px solid #dbe2e8;position:sticky;top:0;background:#fff;max-height:calc(100vh - 100px);display:flex;flex-direction:column}
  .pst-sidebar-controls{padding:18px;border-bottom:1px solid #e4e9ed;display:grid;gap:12px}\n  .pst-focus-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}\n  .pst-focus-filters button{border:1px solid #cbd5df;border-radius:6px;background:#fff;color:#102a43;padding:9px 2px;font-size:11px;cursor:pointer}\n  .pst-focus-filters button[aria-pressed="true"]{background:#102a43;color:#fff;border-color:#102a43}
  .pst-sidebar-controls input,.pst-sidebar-controls select{width:100%;border:1px solid #cbd5df;border-radius:7px;padding:12px;font:inherit;background:#fff;color:#102a43}
  .pst-list{overflow-y:auto;max-height:75vh}
  .pst-list-button{width:100%;padding:13px 19px;background:transparent;border:0;border-bottom:1px solid #e9edf0;display:block;text-align:left;cursor:pointer;color:#102a43;font:inherit}
  .pst-list-button strong{font-size:1rem;display:block}.pst-list-button small{font:inherit;font-size:.77rem;color:#6c7886}
  .pst-list-button[aria-current="true"]{background:#eef4f9;border-left:4px solid #102a43;padding-left:15px}
  .pst-split-detail{min-width:0;width:100%;max-width:none;box-sizing:border-box;padding:30px 34px;color:#102a43}
  .pst-split-detail h2{font-size:2rem;margin:0 0 6px;color:#102a43}
  .pst-blend-subtitle{font-size:1.3rem;font-weight:600;line-height:1.35;color:#102a43;margin:0 0 10px}\n  .pst-split-category{color:#627487;margin:0 0 16px}
  .pst-split-detail p{line-height:1.55}
  .pst-split-detail h3{font-size:1.08rem;margin:20px 0 12px}
  .pst-split-strengths{display:grid;grid-template-columns:repeat(auto-fill,145px);gap:10px;justify-content:start}
  .pst-split-strength{padding:12px;border:1px solid #cdd7e0;border-radius:8px;background:white;color:#102a43;font:inherit;cursor:pointer;min-height:55px}
  .pst-split-strength strong,.pst-split-strength span{display:block}
  .pst-split-strength .pst-strength-stock{font-size:.73rem;font-weight:700;margin-top:6px;color:#a73525}
  .pst-split-strength.pst-strength-available .pst-strength-stock{color:#176639}
  .pst-split-strength.pst-strength-unavailable{background:#f5f6f8;border-color:#d7dce2}
  .pst-strength-summary{margin:-3px 0 12px;font-weight:700;color:#176639}
  .pst-strength-summary.pst-none-available{color:#a73525}.pst-split-strength span{font-size:.84rem;margin-top:4px}
  .pst-split-strength[aria-pressed="true"]{border:2px solid #102a43;background:#eff5fa}
  .pst-split-price{background:#f3f6f9;padding:14px 18px;border-radius:9px;margin:18px 0;display:flex;justify-content:space-between;align-items:center;gap:24px;width:min(100%,420px);max-width:100%;box-sizing:border-box}
  .pst-split-price strong{font-size:1.7rem}
  .pst-split-purchase{display:flex;align-items:end;gap:14px;flex-wrap:wrap}
  .pst-split-purchase label{display:grid;gap:6px}.pst-split-purchase input{max-width:90px;padding:10px;border:1px solid #ccd6df;border-radius:6px}
  .pst-split-purchase button{padding:13px 22px;min-height:46px;background:#102a43;color:white;border:0;border-radius:4px;font:inherit;font-weight:bold;cursor:pointer}
  .pst-mobile-back{display:none}
  .pst-split-notes{margin-top:22px}
  @media(max-width:760px){
   .catalog-page:has(.pst-split-catalog){width:calc(100% - 24px)}
   .catalog-page .catalog-grid.pst-split-catalog{display:block!important;min-height:380px}
   .pst-catalog-sidebar{border-right:0;max-height:none;position:static}
   .pst-list{max-height:none}
   .pst-split-detail{display:none;padding:18px}
   .pst-split-catalog.pst-mobile-open .pst-catalog-sidebar{display:none}
   .pst-split-catalog.pst-mobile-open .pst-split-detail{display:block}
   .pst-mobile-back{display:inline-flex;gap:6px;margin-bottom:18px;border:0;background:none;color:#102a43;font:inherit;font-weight:bold;padding:10px 0;cursor:pointer}
   .pst-split-strengths{grid-template-columns:repeat(auto-fill,minmax(125px,145px))}
   .pst-split-purchase button{flex:1 1 100%}
  }`;
  document.head.appendChild(css);
  window.pstOpenAvailabilityRequest=window.pstOpenAvailabilityRequest||function(product){
    if(document.getElementById("pstAvailabilityOverlay"))document.getElementById("pstAvailabilityOverlay").remove();
    const wrap=document.createElement("div");wrap.id="pstAvailabilityOverlay";
    wrap.style.cssText="position:fixed;z-index:99999;inset:0;background:#101820b8;display:grid;place-items:center;padding:16px";
    wrap.innerHTML='<form style="background:white;border-radius:14px;padding:26px;max-width:460px;width:100%;box-sizing:border-box;display:grid;gap:14px;color:#102a43;max-height:90vh;overflow:auto"><h2 style="margin:0">Request Availability</h2><p style="margin:0">'+escapeHtml(product.display_name||"Product")+' — '+escapeHtml(product.strength||"")+'</p><p style="margin:0;font-size:14px">This is an inquiry only. No order will be placed or payment collected.</p><label>Name<input name="name" required maxlength="120" style="display:block;width:100%;padding:10px;box-sizing:border-box"></label><label>Email<input name="email" type="email" required maxlength="250" style="display:block;width:100%;padding:10px;box-sizing:border-box"></label><label>Quantity<input name="quantity" type="number" min="1" max="500" value="1" required style="display:block;width:100%;padding:10px;box-sizing:border-box"></label><label><input type="checkbox" name="notify"> Email me when this product is available</label><p data-availability-status style="margin:0"></p><div style="display:flex;gap:12px"><button type="button" data-close style="padding:12px">Cancel</button><button type="submit" style="background:#102a43;color:white;padding:12px;border:0;border-radius:5px">Submit Request</button></div></form>';
    document.body.appendChild(wrap);
    const form=wrap.querySelector("form");wrap.querySelector("[data-close]").onclick=()=>wrap.remove();
    wrap.addEventListener("click",e=>{if(e.target===wrap)wrap.remove();});
    form.addEventListener("submit",async e=>{
      e.preventDefault();const btn=form.querySelector('[type="submit"]'),status=form.querySelector("[data-availability-status]");btn.disabled=true;status.textContent="Submitting…";
      try{const {error}=await requireSupabaseClient().rpc("pst_submit_availability_request",{p_product_key:product.product_key,p_quantity:Number(form.elements.quantity.value),p_name:form.elements.name.value,p_email:form.elements.email.value,p_notify:form.elements.notify.checked});if(error)throw error;form.innerHTML='<h2>Request Received</h2><p>We recorded your availability inquiry. No order or payment has been created.</p><button type="button" data-done style="padding:12px">Close</button>';form.querySelector("[data-done]").onclick=()=>wrap.remove();}
      catch(err){status.textContent=err.message||"Request could not be sent.";btn.disabled=false;}
    });
  };
  window.pstRenderSplitCatalog = async function () {
    const grid=document.querySelector("[data-catalog-grid]");
    if(!grid)return;
    const originalSearch=document.querySelector("[data-catalog-search]");
    const originalCategory=document.querySelector("[data-category-filter]");
    const heading=document.querySelector(".page-heading h1");
    try{
      const all=await getProducts();
      const categories=[...new Set(all.map(p=>p.category).filter(Boolean))].sort();
      const requestedCategory=new URLSearchParams(location.search).get("category")||"";
      const categoryParam=["Blend","Stack"].includes(requestedCategory)?"Multi-Peptide Product":requestedCategory;
      const focus=(new URLSearchParams(location.search).get("focus")||"").toLowerCase();
      let focusFilter=["performance","recovery","longevity"].includes(focus)?focus:"";
      let query=new URLSearchParams(location.search).get("search")||"";
      let cat=categories.includes(categoryParam)?categoryParam:"";
      let selectedKey="";
      let currentGroups=[];
      grid.classList.add("pst-split-catalog");
      grid.innerHTML='<aside class="pst-catalog-sidebar"><div class="pst-sidebar-controls"><input type="search" aria-label="Search products" placeholder="Search peptides..."><div class="pst-focus-filters" role="group" aria-label="Research focus"><button type="button" data-focus="" aria-pressed="false">All</button><button type="button" data-focus="performance" aria-pressed="false">Performance</button><button type="button" data-focus="recovery" aria-pressed="false">Recovery</button><button type="button" data-focus="longevity" aria-pressed="false">Longevity</button></div></div><div class="pst-list" role="navigation" aria-label="Product list"></div></aside><article class="pst-split-detail" aria-live="polite"></article>';
      const search=grid.querySelector(".pst-sidebar-controls input");

      const list=grid.querySelector(".pst-list");
      const detail=grid.querySelector(".pst-split-detail");
      search.value=query;

      const focusButtons=[...grid.querySelectorAll("[data-focus]")];
      function syncFocus(){focusButtons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.focus===focusFilter)));}
      syncFocus();
      focusButtons.forEach(b=>b.addEventListener("click",()=>{focusFilter=b.dataset.focus;syncFocus();grid.classList.remove("pst-mobile-open");drawList();}));
      function drawDetail(group){
        if(!group||!group.length){detail.innerHTML='<p>Select a product to view details.</p>';return;}
        let active=group.find(p=>p.product_key===selectedKey)||group[0];
        const title=active.display_name||"";
        const blend=String(title).trim().match(/^(.+?)\s*\(([^()]+)\)\s*$/);
        const wolverine=/^wolverine$/i.test(String(title).trim());
        const mainTitle=blend ? blend[1].trim() : title;
        const subtitle=blend ? blend[2].replace(/\s*\/\s*/g," ").trim() : (wolverine ? "BPC-157 TB-500" : "");
        detail.innerHTML='<button type="button" class="pst-mobile-back">← All Products</button>'+
          '<h2>'+escapeHtml(mainTitle)+'</h2>'+(subtitle ? '<div class="pst-blend-subtitle">'+escapeHtml(subtitle)+'</div>' : '')+'<p class="pst-split-category">'+escapeHtml(active.category||"Research product")+'</p>'+
          '<p>'+escapeHtml(active.description||"")+'</p><h3>Choose vial strength</h3><p class="pst-strength-summary" aria-live="polite"></p>'+
          '<div class="pst-split-strengths" role="group" aria-label="Choose a vial strength"></div>'+
          '<div class="pst-split-price" aria-live="polite"><span class="pst-selected-strength"></span><strong class="pst-selected-price"></strong></div>'+
          '<div class="pst-split-purchase"><label>Quantity<input type="number" data-detail-qty min="1" max="9999" value="1"></label><button type="button" data-add-to-cart="">Add to Cart</button></div>'+
          (active.research_notes?'<section class="pst-split-notes"><h3>Research Notes</h3>'+researchNotesMarkup(active.research_notes)+'</section>':'');
        const strengths=detail.querySelector(".pst-split-strengths");
        const price=detail.querySelector(".pst-selected-price");
        const strengthLabel=detail.querySelector(".pst-selected-strength");
        const add=detail.querySelector("[data-add-to-cart]");
        const variants=[...group].sort((a,b)=>String(a.strength||"").localeCompare(String(b.strength||""),undefined,{numeric:true}));
        const availableVariants=variants.filter(p=>Number(p.current_inventory||0)>0);
        const summary=detail.querySelector(".pst-strength-summary");
        summary.textContent=availableVariants.length+" of "+variants.length+" strengths in stock"+(availableVariants.length===1?" — "+(availableVariants[0].strength||"Standard")+" available":"");
        summary.classList.toggle("pst-none-available",availableVariants.length===0);
        function choose(p){
          active=p;selectedKey=p.product_key;
          price.textContent=formatMoney(unitPrice(p));
          strengthLabel.textContent="Selected strength: "+(p.strength||"Standard");
          const unavailable=Number(p.current_inventory||0)<=0;
          if(unavailable){delete add.dataset.addToCart;add.dataset.requestAvailability=p.product_key;}else{delete add.dataset.requestAvailability;add.dataset.addToCart=p.product_key;}
          add.textContent=unavailable?"Request Availability":"Add to Cart";add.classList.remove("is-added");
          if(!unavailable)bindCartButtons();
          strengths.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.key===p.product_key)));
        }
        variants.forEach(p=>{
          const b=document.createElement("button");b.type="button";b.className="pst-split-strength";b.dataset.key=p.product_key;
          const available=Number(p.current_inventory||0)>0;
          b.classList.toggle('pst-strength-available',available);b.classList.toggle('pst-strength-unavailable',!available);
          b.innerHTML='<strong>'+escapeHtml(p.strength||"Standard")+'</strong><span>'+formatMoney(unitPrice(p))+'</span><span class="pst-strength-stock">'+(available?'In Stock':'Out of Stock')+'</span>';
          b.addEventListener("click",()=>choose(p));strengths.appendChild(b);
        });
        choose(availableVariants.find(p=>p.product_key===selectedKey)||availableVariants[0]||active);
        detail.querySelector(".pst-mobile-back").addEventListener("click",()=>grid.classList.remove("pst-mobile-open"));
        bindCartButtons();
        add.addEventListener("click",()=>{if(add.dataset.requestAvailability&&typeof window.pstOpenAvailabilityRequest==="function")window.pstOpenAvailabilityRequest(active);});
      }
      function drawList(){
        query=search.value.trim().toLowerCase();
        const filtered=sortProductsForCatalog(all.filter(p=>{
          const focuses=typeof normalizedResearchFocuses==="function"?normalizedResearchFocuses(p.research_focus):[];
          const hay=[p.display_name,p.strength,p.category,p.series,p.product_key,...focuses].filter(Boolean).join(" ").toLowerCase();
          return (!query||hay.includes(query))&&(!cat||p.category===cat)&&(!focusFilter||focuses.includes(focusFilter));
        }));
        currentGroups=groupCatalogProducts(filtered);
        if(heading)heading.textContent="Peptide Catalog";
        list.replaceChildren();
        if(!currentGroups.length){list.innerHTML='<p style="padding:20px">No matching products.</p>';detail.innerHTML='<p>No matching products.</p>';return;}
        let chosen=currentGroups.find(g=>g.some(p=>p.product_key===selectedKey));
        if(!chosen){chosen=currentGroups[0];selectedKey=chosen[0].product_key;}
        currentGroups.forEach(g=>{
          const p=g[0];const b=document.createElement("button");b.type="button";b.className="pst-list-button";
          b.dataset.key=p.product_key;b.setAttribute("aria-current",String(g===chosen));
          b.innerHTML='<strong>'+escapeHtml(p.display_name||"")+'</strong><small>'+escapeHtml(p.category||"Research product")+'</small>';
          b.addEventListener("click",()=>{
            selectedKey=p.product_key;
            list.querySelectorAll("button").forEach(el=>el.setAttribute("aria-current",String(el===b)));
            drawDetail(g);grid.classList.add("pst-mobile-open");
            const header=document.querySelector(".pst-customer-header");
            const offset=(header ? header.getBoundingClientRect().height : 0)+16;
            const target=Math.max(0,window.scrollY+grid.getBoundingClientRect().top-offset);
            window.scrollTo({left:0,top:target,behavior:"instant"});
          });
          list.appendChild(b);
        });
        drawDetail(chosen);
      }
      window.scrollTo({left:0,top:window.scrollY,behavior:"instant"});
      search.addEventListener("input",()=>{grid.classList.remove("pst-mobile-open");drawList()});

      if(originalSearch)originalSearch.value=query;

      drawList();
    }catch(error){grid.innerHTML='<p class="loading-row">Unable to load products: '+escapeHtml(error.message)+'</p>';}
  };
})();