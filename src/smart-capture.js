// Taylor Scout Smart Capture — core Scout Log capture workflow.
// Works with the existing React editor by driving its controlled fields through native input events,
// so captured information is saved by the normal Save Location flow.
const categories=[
  ['parking','Crew Parking'],['basecamp','Basecamp'],['truck','Truck Access'],['access','Access'],
  ['power','Power / Generator'],['noise','Noise'],['neighbor','Neighborhood / Sensitivity'],
  ['restroom','Restrooms'],['cell','Cell Service'],['holding','Holding'],['safety','Safety'],['general','General']
];

function reactSet(el,value){
  if(!el)return;
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  setter?.call(el,value);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
function fieldByLabel(root,label){
  return [...root.querySelectorAll('label')].find(x=>x.childNodes?.[0]?.textContent?.trim().toLowerCase()===label.toLowerCase())?.querySelector('input,textarea,select');
}
function classify(text){
  const t=String(text||'').toLowerCase();
  if(/crew park|parking lot|\bparking\b/.test(t))return'Crew Parking';
  if(/base ?camp/.test(t))return'Basecamp';
  if(/truck|loading|load[- ]?in|stakebed/.test(t))return'Truck Access';
  if(/generator|power|electric|amp|shore power/.test(t))return'Power / Generator';
  if(/noise|flight path|airplane|train|freeway|traffic sound/.test(t))return'Noise';
  if(/neighbor|sensitive|residential|school|church|business/.test(t))return'Neighborhood / Sensitivity';
  if(/restroom|bathroom|toilet/.test(t))return'Restrooms';
  if(/cell|signal|reception|wifi|wi-fi/.test(t))return'Cell Service';
  if(/holding|background holding|extras holding/.test(t))return'Holding';
  if(/fire lane|hazard|safety|emergency|egress/.test(t))return'Safety';
  if(/gate|entrance|access|driveway|stairs|elevator/.test(t))return'Access';
  return'General';
}
function extractContact(text){
  const email=String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'';
  const phone=String(text).match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0]||'';
  const contact=String(text).match(/(?:contact(?: is)?|property contact(?: is)?|ask for)\s*[:\-]?\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})/i)?.[1]||'';
  return{email,phone,contact};
}
function appendCaptureToNotes(editor,entries,photoNames=[]){
  const notes=fieldByLabel(editor,'Notes'); if(!notes)return;
  const grouped=new Map();
  entries.forEach(entry=>{const key=classify(entry);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(entry.trim())});
  let block='';
  grouped.forEach((items,key)=>{block+=`\n${key.toUpperCase()}\n${items.map(x=>`• ${x}`).join('\n')}\n`});
  if(photoNames.length)block+=`\nSCOUT PHOTOS\n${photoNames.map(x=>`• ${x}`).join('\n')}\n`;
  const stamp=new Date().toLocaleString();
  const next=`${notes.value||''}${notes.value?'\n\n':''}SMART CAPTURE · ${stamp}${block}`.trim();
  reactSet(notes,next);
}
function applyStructuredFields(editor,text){
  const found=extractContact(text);
  if(found.contact&&!fieldByLabel(editor,'Contact')?.value)reactSet(fieldByLabel(editor,'Contact'),found.contact);
  if(found.phone&&!fieldByLabel(editor,'Phone')?.value)reactSet(fieldByLabel(editor,'Phone'),found.phone);
  if(found.email&&!fieldByLabel(editor,'Email')?.value)reactSet(fieldByLabel(editor,'Email'),found.email);
}
function createPanel(editor){
  if(editor.querySelector('.smart-capture'))return;
  const panel=document.createElement('section'); panel.className='smart-capture';
  panel.innerHTML=`<div class="smart-capture-head"><div><span>✨ SMART CAPTURE</span><h3>Capture the scout while you walk it</h3><p>Talk, type, or add photos. Taylor Scout organizes the notes into production-ready Scout Log categories.</p></div><button type="button" class="smart-collapse">Hide</button></div>
  <div class="smart-mode-tabs"><button type="button" class="active" data-smart-mode="quick">Quick Capture</button><button type="button" data-smart-mode="guided">Guided Scout</button><button type="button" data-smart-mode="voice">Voice Scout</button></div>
  <div class="smart-capture-body">
    <textarea class="smart-raw" placeholder="Example: Crew can park in the east lot, about 80 cars. Trucks enter off Colorado. Neighbors on the south side may be sensitive. Generator can sit behind the building."></textarea>
    <div class="smart-guided" hidden>${categories.slice(0,-1).map(([id,label])=>`<label><span>${label}</span><textarea data-guide="${id}" placeholder="Add ${label.toLowerCase()} notes…"></textarea></label>`).join('')}</div>
    <div class="smart-actions"><label class="smart-photo">＋ Photos<input type="file" accept="image/*" multiple hidden></label><button type="button" class="smart-voice">🎙 Start Voice</button><button type="button" class="smart-apply">✨ Organize into Scout Log</button></div>
    <div class="smart-photo-list"></div><div class="smart-status">Smart Capture writes through the existing Scout Log fields; nothing is finalized until you save the location.</div>
  </div>`;
  const anchor=editor.querySelector('.set-link-section')||editor.querySelector('.form'); anchor?.before(panel);
  let photos=[]; let recognition=null;
  panel.querySelector('.smart-collapse').onclick=e=>{const body=panel.querySelector('.smart-capture-body');const hidden=!body.hidden;body.hidden=hidden;e.currentTarget.textContent=hidden?'Show':'Hide'};
  panel.querySelectorAll('[data-smart-mode]').forEach(btn=>btn.onclick=()=>{panel.querySelectorAll('[data-smart-mode]').forEach(x=>x.classList.toggle('active',x===btn));const mode=btn.dataset.smartMode;panel.querySelector('.smart-raw').hidden=mode==='guided';panel.querySelector('.smart-guided').hidden=mode!=='guided';panel.querySelector('.smart-voice').style.display=mode==='voice'?'inline-flex':''});
  panel.querySelector('.smart-photo input').onchange=e=>{photos=[...e.target.files];const list=panel.querySelector('.smart-photo-list');list.innerHTML=photos.map(file=>`<span>📷 ${file.name}</span>`).join('');};
  panel.querySelector('.smart-voice').onclick=e=>{
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){panel.querySelector('.smart-status').textContent='Voice transcription is not supported in this browser. Use Quick Capture instead.';return}
    if(recognition){recognition.stop();recognition=null;e.currentTarget.textContent='🎙 Start Voice';return}
    recognition=new SpeechRecognition();recognition.continuous=true;recognition.interimResults=true;
    recognition.onresult=event=>{let final='';for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)final+=event.results[i][0].transcript+' ';if(final){const raw=panel.querySelector('.smart-raw');raw.value=(raw.value+' '+final).trim()}};
    recognition.onerror=event=>{panel.querySelector('.smart-status').textContent=event.error==='not-allowed'?'Microphone permission was blocked. Allow microphone access in Chrome, then try again.':`Voice transcription error: ${event.error||'unknown error'}. Your Scout Log has not been changed.`;recognition=null;e.currentTarget.textContent='🎙 Start Voice'};
    recognition.onend=()=>{recognition=null;e.currentTarget.textContent='🎙 Start Voice'};
    try{recognition.start();panel.querySelector('.smart-status').textContent='Listening… speak naturally. Live transcription will appear above.';e.currentTarget.textContent='■ Stop Voice'}catch(error){recognition=null;e.currentTarget.textContent='🎙 Start Voice';panel.querySelector('.smart-status').textContent=`Could not start voice capture: ${error.message}`;}
  };
  panel.querySelector('.smart-apply').onclick=()=>{
    const active=panel.querySelector('[data-smart-mode].active')?.dataset.smartMode||'quick';
    const entries=active==='guided'?[...panel.querySelectorAll('.smart-guided textarea')].map(x=>x.value.trim()).filter(Boolean):(panel.querySelector('.smart-raw').value||'').split(/\n+|(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
    if(!entries.length&&!photos.length){panel.querySelector('.smart-status').textContent='Add a note, voice capture, or photo first.';return}
    const combined=entries.join(' ');applyStructuredFields(editor,combined);appendCaptureToNotes(editor,entries,photos.map(x=>x.name));
    panel.querySelector('.smart-status').textContent=`Captured ${entries.length} note${entries.length===1?'':'s'}${photos.length?` and ${photos.length} photo reference${photos.length===1?'':'s'}`:''}. Review the Scout Log and Save Location.`;
  };
}
function mount(){document.querySelectorAll('.location-editor').forEach(createPanel)}
new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
