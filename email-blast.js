(function(){
  "use strict";
  const FUNCTION_NAME="send-email-blast";
  let blastEligible=[];
  let blastVisible=[];

  function byId(id){return document.getElementById(id)}
  function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function selectedEmails(){return [...document.querySelectorAll("[data-blast-recipient]:checked")].map(input=>input.value)}
  function setBlastStatus(message,tone=""){const el=byId("blastComposerStatus");if(!el)return;el.textContent=message;el.className=`blast-status ${tone}`.trim()}
  function fieldValue(id){return String(byId(id)?.value||"").trim()}
  function normalizeWebUrl(value){const raw=String(value||"").trim();if(!raw)return"";const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:`https://${raw}`;try{const parsed=new URL(candidate);return ["http:","https:"].includes(parsed.protocol)?parsed.toString():""}catch{return""}}
  function payload(previewOnly=false){return{
    preview_only:previewOnly,
    recipients:selectedEmails(),
    subject:fieldValue("blastSubject"),
    category:fieldValue("blastCategory"),
    headline:fieldValue("blastHeadline"),
    message:fieldValue("blastMessage"),
    feature_label:fieldValue("blastFeatureLabel"),
    feature_title:fieldValue("blastFeatureTitle"),
    feature_body:fieldValue("blastFeatureBody"),
    button_text:fieldValue("blastButtonText"),
    button_url:normalizeWebUrl(fieldValue("blastButtonUrl")),
    final_note:fieldValue("blastFinalNote")
  }}

  function installComposer(){
    const oldButton=byId("openBlastModalBtn");
    if(oldButton){
      const button=oldButton.cloneNode(true);
      button.textContent="Create Email Blast";
      oldButton.replaceWith(button);
      button.addEventListener("click",openComposer);
    }
    const modal=document.createElement("div");
    modal.id="blastComposerModal";
    modal.className="blast-composer-backdrop";
    modal.innerHTML=`<div class="blast-composer" role="dialog" aria-modal="true" aria-labelledby="blastComposerTitle">
      <div class="blast-composer-head"><div><h2 id="blastComposerTitle">Create Email Blast</h2><p>The Pep Shop Texas template is built automatically from the fields below.</p></div><button class="blast-composer-close" type="button" id="closeBlastComposerBtn">Close</button></div>
      <div class="blast-composer-grid">
        <section class="blast-compose-pane"><div class="blast-fields">
          <div class="blast-field full"><label for="blastSubject">Email Subject</label><input id="blastSubject" maxlength="140" placeholder="What recipients see in their inbox"></div>
          <div class="blast-field"><label for="blastCategory">Category</label><input id="blastCategory" maxlength="80" value="Pep Shop Texas Update"></div>
          <div class="blast-field"><label for="blastHeadline">Headline</label><input id="blastHeadline" maxlength="140" placeholder="Main email headline"></div>
          <div class="blast-field full"><label for="blastMessage">Opening Message</label><textarea id="blastMessage" maxlength="3000" placeholder="Write the main message here..."></textarea></div>
          <div class="blast-field"><label for="blastFeatureLabel">Feature Label</label><input id="blastFeatureLabel" maxlength="80" placeholder="Optional"></div>
          <div class="blast-field"><label for="blastFeatureTitle">Feature Title</label><input id="blastFeatureTitle" maxlength="160" placeholder="Optional"></div>
          <div class="blast-field full"><label for="blastFeatureBody">Feature Details</label><textarea id="blastFeatureBody" maxlength="3000" placeholder="Optional supporting information..."></textarea></div>
          <div class="blast-field"><label for="blastButtonText">Button Text</label><input id="blastButtonText" maxlength="60" placeholder="Learn More"></div>
          <div class="blast-field"><label for="blastButtonUrl">Button Link</label><input id="blastButtonUrl" type="url" maxlength="500" placeholder="https://www.pepshoptexas.com/"></div>
          <div class="blast-field full"><label for="blastFinalNote">Final Note</label><textarea id="blastFinalNote" maxlength="1200" placeholder="Optional closing note or contact information."></textarea></div>
        </div><p class="blast-template-note">Customer names, Pep Shop Texas branding, the research disclaimer, and each recipient’s unsubscribe link are inserted automatically.</p></section>
        <aside class="blast-recipient-pane"><div class="blast-recipient-title">Recipients</div><input class="blast-recipient-search" id="blastRecipientSearch" type="search" placeholder="Search name or email"><div class="blast-recipient-tools"><button class="blast-mini-button" type="button" id="blastSelectVisibleBtn">Select Visible</button><button class="blast-mini-button" type="button" id="blastClearVisibleBtn">Clear Visible</button></div><div class="blast-count" id="blastRecipientCount">0 selected</div><div class="blast-recipient-list" id="blastRecipientList"></div><iframe class="blast-preview-frame" id="blastPreviewFrame" title="Email preview"></iframe></aside>
      </div>
      <div class="blast-actions"><button class="btn secondary" type="button" id="previewBlastBtn">Preview Email</button><button class="btn primary" type="button" id="sendBlastBtn">Send Email Blast</button><div class="blast-status" id="blastComposerStatus"></div></div>
    </div>`;
    document.body.appendChild(modal);
    byId("closeBlastComposerBtn").addEventListener("click",closeComposer);
    byId("previewBlastBtn").addEventListener("click",previewBlast);
    byId("sendBlastBtn").addEventListener("click",sendBlast);
    byId("blastRecipientSearch").addEventListener("input",renderRecipients);
    byId("blastButtonUrl").addEventListener("blur",event=>{const normalized=normalizeWebUrl(event.target.value);if(normalized)event.target.value=normalized});
    byId("blastSelectVisibleBtn").addEventListener("click",()=>setVisibleSelection(true));
    byId("blastClearVisibleBtn").addEventListener("click",()=>setVisibleSelection(false));
    modal.addEventListener("click",event=>{if(event.target===modal)closeComposer()});
  }

  function openComposer(){
    const source=(typeof filteredCustomers!=="undefined"?filteredCustomers:[]).filter(customer=>customer.email_eligible&&customer.email);
    const unique=new Map();
    source.forEach(customer=>unique.set(String(customer.email).toLowerCase(),customer));
    blastEligible=[...unique.values()].sort((a,b)=>String(a.name||a.email).localeCompare(String(b.name||b.email)));
    byId("blastRecipientSearch").value="";
    renderRecipients(true);
    setBlastStatus(`${blastEligible.length} subscribed customer${blastEligible.length===1?"":"s"} available.`);
    byId("blastPreviewFrame").srcdoc="";
    byId("blastComposerModal").classList.add("active");
  }
  function closeComposer(){byId("blastComposerModal")?.classList.remove("active")}
  function renderRecipients(selectAll=false){
    const current=new Set(selectedEmails());
    const query=String(byId("blastRecipientSearch")?.value||"").trim().toLowerCase();
    blastVisible=blastEligible.filter(customer=>!query||`${customer.name||""} ${customer.email||""}`.toLowerCase().includes(query));
    byId("blastRecipientList").innerHTML=blastVisible.length?blastVisible.map(customer=>{const email=String(customer.email).toLowerCase(),checked=selectAll||current.has(email);return`<label class="blast-recipient-row"><input type="checkbox" data-blast-recipient value="${esc(email)}" ${checked?"checked":""}><span><strong>${esc(customer.name||"Customer")}</strong><span>${esc(email)}</span></span></label>`}).join(""):'<div style="padding:12px;color:#66717d;font-size:13px">No matching subscribed customers.</div>';
    byId("blastRecipientList").querySelectorAll("[data-blast-recipient]").forEach(input=>input.addEventListener("change",updateRecipientCount));
    updateRecipientCount();
  }
  function setVisibleSelection(checked){byId("blastRecipientList").querySelectorAll("[data-blast-recipient]").forEach(input=>{input.checked=checked});updateRecipientCount()}
  function updateRecipientCount(){const count=selectedEmails().length;byId("blastRecipientCount").textContent=`${count} selected of ${blastEligible.length} eligible`}
  function validateContent(data,requireRecipients){
    if(!data.subject)throw new Error("Enter an email subject.");
    if(!data.headline)throw new Error("Enter an email headline.");
    if(!data.message)throw new Error("Enter the opening message.");
    if(requireRecipients&&!data.recipients.length)throw new Error("Select at least one recipient.");
    if((data.button_text&&!data.button_url)||(!data.button_text&&data.button_url))throw new Error("Enter both the button text and button link, or leave both blank.");
  }
  async function callBlastFunction(data){
    const session=(await supabaseClient.auth.getSession()).data?.session;
    if(!session?.access_token)throw new Error("Your admin session expired. Sign in again.");
    const response=await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok===false)throw new Error(result.error||`Email service returned ${response.status}.`);
    return result;
  }
  async function previewBlast(){
    const data=payload(true);
    try{validateContent(data,false);setBlastStatus("Building preview...");const result=await callBlastFunction(data);byId("blastPreviewFrame").srcdoc=result.preview?.html||"";setBlastStatus("Preview updated.","good")}catch(error){setBlastStatus(error.message||String(error),"bad")}
  }
  async function sendBlast(){
    const data=payload(false);
    const button=byId("sendBlastBtn");
    try{
      validateContent(data,true);
      if(!window.confirm(`Send “${data.subject}” to ${data.recipients.length} selected customer${data.recipients.length===1?"":"s"}?`))return;
      button.disabled=true;button.textContent="Sending...";setBlastStatus(`Sending to ${data.recipients.length} selected customer${data.recipients.length===1?"":"s"}...`);
      const result=await callBlastFunction(data);
      const excluded=Number(result.excluded_count||0);
      setBlastStatus(`Email blast sent to ${result.sent_count} customer${result.sent_count===1?"":"s"}.${excluded?` ${excluded} address${excluded===1?" was":"es were"} excluded because consent changed.`:""}`,"good");
    }catch(error){setBlastStatus(error.message||String(error),"bad")}finally{button.disabled=false;button.textContent="Send Email Blast"}
  }

  document.addEventListener("DOMContentLoaded",installComposer);
})();
