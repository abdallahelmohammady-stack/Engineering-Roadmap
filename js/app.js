/* ============================ DATA ============================ */
const ICONS = ['building-2','landmark','ruler','cpu','cog','zap','radio','flask-conical','wrench','hammer','layers','network','circuit-board','hard-hat','pyramid','mountain','droplets','atom','satellite','boxes','pencil-ruler','factory','gauge','plug'];
const COLORS = {
  sky:'#38bdf8', amber:'#fbbf24', rose:'#fb7185', violet:'#a78bfa',
  emerald:'#34d399', orange:'#fb923c', lime:'#a3e635', fuchsia:'#e879f9', cyan:'#22d3ee'
};
const defaultImage = 'data:image/svg+xml,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='#0d2137'/><g stroke='#1b3650' stroke-width='1'><path d='M0 60H640M0 120H640M0 180H640M0 240H640M0 300H640M80 0V360M160 0V360M240 0V360M320 0V360M400 0V360M480 0V360M560 0V360'/></g><text x='50%' y='50%' font-family='monospace' font-size='22' fill='#38618a' text-anchor='middle' dy='.3em'>PARTITION</text></svg>");

// ---- EXPORT TARGET (DO NOT DELETE THIS LINE) ----
const defaultDepartments = DEFAULT_DEPTS;

const STORAGE_KEY = 'engBlueprintData_Roadmaps_v1';
const safeOriginal = defaultDepartments;

let depts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || JSON.parse(JSON.stringify(safeOriginal));
let current = 'home';      // 'home' or dept id
let currentPartition = null; // selected partition id
let currentCategory = null; // selected category id
let isAdmin = false;
let collapsed = {};        // category/partition collapse state
let tempImg = null;

/* ============================ HELPERS ============================ */
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const $ = id => document.getElementById(id);
const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(depts)); render(); };
const acc = c => COLORS[c] || COLORS.sky;

function stats(node){
  let t=0,d=0;
  const walkCats = cats => cats.forEach(cat=>{
    (cat.courses||[]).forEach(co=>{ t++; if(co.completed) d++; });
    if(cat.subCategories) walkCats(cat.subCategories);
  });
  if(node.partitions) node.partitions.forEach(p=>walkCats(p.categories||[]));
  else if(node.categories) walkCats(node.categories);
  else if(node.courses||node.subCategories) walkCats([node]);
  return { t, d, pct: t? Math.round(d/t*100):0 };
}

// locate any node by id -> {node, arr, index, kind}
function locate(id){
  for(let i=0;i<depts.length;i++){ if(depts[i].id===id) return {node:depts[i], arr:depts, index:i, kind:'dept'}; }
  for(const dep of depts) for(let i=0;i<(dep.partitions||[]).length;i++){
    if(dep.partitions[i].id===id) return {node:dep.partitions[i], arr:dep.partitions, index:i, kind:'partition', dept:dep};
  }
  for(const dep of depts) for(const part of (dep.partitions||[])) for(let i=0;i<(part.categories||[]).length;i++){
    if(part.categories[i].id===id) return {node:part.categories[i], arr:part.categories, index:i, kind:'category', part, dept:dep};
  }
  for(const dep of depts) for(const part of (dep.partitions||[])) for(const cat of (part.categories||[])) for(let i=0;i<(cat.subCategories||[]).length;i++){
    if(cat.subCategories[i].id===id) return {node:cat.subCategories[i], arr:cat.subCategories, index:i, kind:'subcategory', cat, part, dept:dep};
  }
  for(const dep of depts) for(const part of (dep.partitions||[])) for(const cat of (part.categories||[])){
    const arrs=[cat.courses, ...(cat.subCategories||[]).map(s=>s.courses)];
    for(const a of arrs){ if(!a) continue; const idx=a.findIndex(c=>c.id===id); if(idx>-1) return {node:a[idx], arr:a, index:idx, kind:'course'}; }
  }
  return null;
}
function findNode(id){ const r=locate(id); return r?r.node:null; }
const uid = p => p + '_' + Date.now() + Math.floor(Math.random()*999);

/* ============================================================
   إضافات النسخة المقسّمة: توست + ضغط صور + جوجل فوتوز + حساب الأدمن
   ============================================================ */
function showToast(msg, isError){
  const t=$('mini-toast'); if(!t) return;
  t.textContent=(isError?'⚠️ ':'✅ ')+msg;
  t.classList.add('show');
  if(isError) t.classList.add('err'); else t.classList.remove('err');
  clearTimeout(window.__toastT);
  window.__toastT=setTimeout(()=>t.classList.remove('show'),3000);
}
function compressImageFromUrl(srcUrl, maxW, quality){
  maxW=maxW||1200; quality=quality||0.82;
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{ try{
      let w=img.naturalWidth,h=img.naturalHeight;
      if(w>maxW){ h=Math.round(h*maxW/w); w=maxW; }
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      resolve(c.toDataURL('image/jpeg',quality));
    }catch(e){ reject(e); } };
    img.onerror=reject; img.src=srcUrl;
  });
}
function isGPhotoPage(u){ try{ const h=new URL(u).hostname; return h==='photos.app.goo.gl'||h==='photos.google.com'; }catch(e){ return false; } }
function normalizeGPhotoSize(u,w){
  w=w||1200;
  if(u.indexOf('lh3.googleusercontent.com')===-1) return u;
  if(/=w\d+(-h\d+)?/.test(u)) return u.replace(/=w\d+(-h\d+)?[^=]*$/,'=w'+w);
  if(u.indexOf('=')===-1 || u.lastIndexOf('=')<u.lastIndexOf('/')) return u+'=w'+w;
  return u;
}
async function resolveGooglePhotosLink(pageUrl){
  const proxies=[
    'https://api.allorigins.win/raw?url='+encodeURIComponent(pageUrl),
    'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(pageUrl),
    'https://corsproxy.io/?url='+encodeURIComponent(pageUrl)
  ];
  for(const p of proxies){
    try{
      const res=await fetch(p); if(!res.ok) continue;
      const html=await res.text();
      const m=html.match(/https:\/\/lh3\.googleusercontent\.com\/[^"'\s\\<>]+/);
      if(m) return normalizeGPhotoSize(m[0].replace(/&amp;/g,'&'));
    }catch(e){}
  }
  throw new Error('gphoto resolve failed');
}
async function shrinkOldImages(){
  let changed=false,count=0; const jobs=[];
  (depts||[]).forEach(d=>(d.partitions||[]).forEach(p=>{
    if(p.image && String(p.image).indexOf('data:')===0 && p.image!==defaultImage && p.image.length>200000){
      jobs.push(compressImageFromUrl(p.image,1000,0.82).then(u=>{p.image=u;changed=true;count++;}).catch(()=>{}));
    }
  }));
  if(jobs.length){ await Promise.all(jobs); if(changed){ save(); showToast('قمنا بتصغير '+count+' صورة قديمة تلقائياً 🗜️'); } }
}

/* ---- حساب الأدمن الواحد (SHA-256 نقي — يشتغل في أي بيئة) ---- */
function sha256(ascii){
  function rr(v,a){ return (v>>>a)|(v<<(32-a)); }
  const maxWord=Math.pow(2,32); let result='';
  const words=[]; const asciiBitLength=ascii.length*8;
  let hash=sha256.h=sha256.h||[]; const k=sha256.k=sha256.k||[];
  let primeCounter=k.length; const isComposite={};
  for(let candidate=2;primeCounter<64;candidate++){
    if(!isComposite[candidate]){
      for(let i=0;i<313;i+=candidate) isComposite[i]=candidate;
      hash[primeCounter]=(Math.pow(candidate,0.5)*maxWord)|0;
      k[primeCounter++]=(Math.pow(candidate,1/3)*maxWord)|0;
    }
  }
  ascii+='\x80';
  while(ascii.length%64-56) ascii+='\x00';
  for(let i=0;i<ascii.length;i++){
    const j=ascii.charCodeAt(i);
    if(j>>8) return sha256(unescape(encodeURIComponent(ascii)));
    words[i>>2]|=j<<((3-i)%4)*8;
  }
  words[words.length]=(asciiBitLength/maxWord)|0;
  words[words.length]=asciiBitLength;
  for(let j=0;j<words.length;){
    const w=words.slice(j,j+=16); const oldHash=hash; hash=hash.slice(0,8);
    for(let i=0;i<64;i++){
      const w15=w[i-15],w2=w[i-2]; const a=hash[0],e=hash[4];
      const temp1=hash[7]
        +(rr(e,6)^rr(e,11)^rr(e,25))
        +((e&hash[5])^((~e)&hash[6]))
        +k[i]
        +(w[i]=(i<16)?w[i]:(w[i-16]+(rr(w15,7)^rr(w15,18)^(w15>>>3))+w[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10)))|0);
      const temp2=(rr(a,2)^rr(a,13)^rr(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
      hash=[(temp1+temp2)|0].concat(hash);
      hash[4]=(hash[4]+temp1)|0;
    }
    for(let i=0;i<8;i++) hash[i]=(hash[i]+oldHash[i])|0;
  }
  for(let i=0;i<8;i++){
    for(let j=3;j+1;j--){
      const b=(hash[i]>>(j*8))&255;
      result+=((b<16)?0:'')+b.toString(16);
    }
  }
  return result;
}
function getSession(){ try{ const s=JSON.parse(sessionStorage.getItem(SESSION_KEY)); if(s&&s.user) return s; }catch(e){} return null; }
function doLogout(){ sessionStorage.removeItem(SESSION_KEY); location.reload(); }
function showLoginView(){ const v=$('login-view'); if(v) v.style.display='flex'; const si=$('login-user'); if(si) setTimeout(()=>si.focus(),50); }
function hideLoginView(){ const v=$('login-view'); if(v) v.style.display='none'; }
function submitLogin(){
  const user=($('login-user').value||'').trim();
  const pass=$('login-pass').value||'';
  if(!user||!pass){ showToast('اكتب اليوزر والباسورد', true); return; }
  const h=sha256(pass);
  const acc=ADMIN_ACCOUNTS.find(a=>a.user===user&&a.pass===h);
  if(!acc){
    const c=$('login-card'); if(c){ c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
    showToast('اليوزر أو الباسورد غير صحيحة ❌', true);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({user:acc.user,label:acc.label||''}));
  bootApp();
  showToast('أهلاً بيك يا هندسة 👋');
}
function bootApp(){
  hideLoginView();
  isAdmin=true; syncAdminUI();
  initFromHash(); render();
  shrinkOldImages();
}

/* ============================ ROUTING ============================ */
function go(target){ currentPartition=null; currentCategory=null; current=target; history.pushState(null,'', target==='home'? location.pathname : location.pathname+'#'+target); render(); window.scrollTo({top:0}); }
function openPartition(id){ const r=locate(id); if(!r || r.kind!=='partition') return; current=r.dept.id; currentPartition=id; currentCategory=null; history.pushState(null,'',location.pathname+'#'+current+'/'+id); render(); window.scrollTo({top:0}); }
function openCategory(id){ const r=locate(id); if(!r || r.kind!=='category') return; current=r.dept.id; currentPartition=r.part.id; currentCategory=id; history.pushState(null,'',location.pathname+'#'+current+'/'+currentPartition+'/'+id); render(); window.scrollTo({top:0}); }
window.addEventListener('popstate', ()=>{ const [deptId, partId, catId]=location.hash.replace('#','').split('/'); current=(deptId && depts.find(d=>d.id===deptId))?deptId:'home'; currentPartition=(partId && locate(partId)?.kind==='partition')?partId:null; currentCategory=(catId && locate(catId)?.kind==='category')?catId:null; render(); });

/* ============================ ADMIN / RESET ============================ */
function syncAdminUI(){
  $('admin-text').innerText = isAdmin? 'وضع الأدمن' : 'وضع المشاهد';
  $('admin-toggle').classList.toggle('border-sky-400', isAdmin);
  $('admin-toggle').classList.toggle('text-sky-400', isAdmin);
  const _ap=$('add-part-btn'); if(_ap) _ap.classList.toggle('hidden', !isAdmin);
}
function toggleAdmin(){
  isAdmin=!isAdmin;
  syncAdminUI();
  render();
}
function resetData(){
  if(confirm('هل أنت متأكد من إعادة ضبط كل البيانات؟ سيتم حذف جميع تعديلاتك.')){ localStorage.removeItem(STORAGE_KEY); location.reload(); }
}

/* ============================ MOVE / DELETE / COMPLETE ============================ */
function move(id, dir){
  const r=locate(id); if(!r) return;
  const ni=r.index+dir; if(ni<0||ni>=r.arr.length) return;
  [r.arr[r.index], r.arr[ni]] = [r.arr[ni], r.arr[r.index]];
  save();
}
function del(id){
  const r=locate(id); if(!r) return;
  if(!confirm('هل أنت متأكد من الحذف؟')) return;
  r.arr.splice(r.index,1);
  if(r.kind==='dept' && current===id){ current='home'; }
  save();
}
function toggleCourse(id){
  const r=locate(id); if(!r||r.kind!=='course') return;
  r.node.completed=!r.node.completed; save();
}
function toggleCollapse(id){
  const isCat = String(id).indexOf('C_')===0;
  const cur = isCat ? (collapsed[id] !== false) : !!collapsed[id];
  collapsed[id] = !cur;
  render();
}

/* ============================ EXPORT ============================ */
function exportFinal(){
  const payload = { app:'eng-roadmap', version:1, exportedAt:Date.now(), exportedBy:(getSession()||{}).user||'admin', depts: depts };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const al = document.createElement('a');
  al.href = URL.createObjectURL(blob);
  al.download = 'sites.json';
  document.body.appendChild(al); al.click(); document.body.removeChild(al);
  setTimeout(()=>URL.revokeObjectURL(al.href), 1000);
  showToast('تم تصدير sites.json — ارفعه على نسخة الزوار 📤');
}
function importJSON(input){
  const file = input.files && input.files[0]; if(!file) return;
  const rd = new FileReader();
  rd.onload = ev => {
    try{
      const data = JSON.parse(ev.target.result);
      const incoming = Array.isArray(data) ? data : (data && data.depts);
      if(!Array.isArray(incoming)) throw new Error('bad json');
      depts = incoming;
      save();
      showToast('تم استيراد ' + incoming.length + ' قسم بنجاح ✅');
    }catch(e){ console.error(e); showToast('ملف JSON غير صالح', true); }
    input.value = '';
  };
  rd.readAsText(file);
}

/* ============================ CRUD MODAL ============================ */
const colorOptions = () => Object.keys(COLORS).map(k=>({val:k,txt:k}));
const iconOptions = () => ICONS.map(i=>({val:i,txt:i}));

function openModal(type, id=null, parentId=null){
  const fields=$('modal-fields'); $('modal-fields').innerHTML='';
  tempImg=null;
  $('f-type').value=type; $('f-id').value=id||''; $('f-parent').value=parentId||current||'';
  let data = id ? (findNode(id)||{}) : {};
  if(type==='note' && id){ const c=findNode(parentId); data = (c&&c.notes)? (c.notes.find(n=>n.id===id)||{}) : {}; }
  $('f-img').value = data.image||'';
  const titleIcon = ({dept:'building-2',partition:'layout-panel-top',category:'folder',subcategory:'git-branch',course:'book-open',note:'sticky-note'}[type]);
  $('modal-title').innerHTML = `<i data-lucide="${titleIcon}" class="w-6 h-6 shrink-0" style="color:var(--brand)"></i><span>${(id?'تعديل ':'إضافة ') + ({dept:'قسم',partition:'بارتيشن',category:'تصنيف',subcategory:'تصنيف فرعي',course:'كورس',note:'ملاحظة'}[type])}</span>`;

  const inp=(label,key,ph='',type2='text')=>`<div class="field"><label>${label}</label><input type="${type2}" name="${key}" value="${esc(data[key]??'')}" placeholder="${ph}"></div>`;
  const ta=(label,key,ph='')=>`<div class="field"><label>${label}</label><textarea name="${key}" rows="2" placeholder="${ph}">${esc(data[key]??'')}</textarea></div>`;
  const sel=(label,key,opts)=>`<div class="field"><label>${label}</label><select name="${key}">${opts.map(o=>`<option value="${o.val}" ${data[key]===o.val?'selected':''}>${o.txt}</option>`).join('')}</select></div>`;
  const colorSel=(key)=>{
    const cur=data[key]||'sky';
    return `<div class="field"><label>اللون</label><input type="hidden" name="${key}" id="color-input" value="${cur}">
      <div class="flex flex-wrap gap-2">${colorOptions().map(o=>`<div class="colorchip ${cur===o.val?'sel':''}" style="background:${COLORS[o.val]}" onclick="pickColor('${o.val}')"></div>`).join('')}</div></div>`;
  };
  const iconSel=(key)=>{
    const cur=data[key]||ICONS[0];
    const prvCol=(document.getElementById('color-input') && document.getElementById('color-input').value)||'sky';
    const prvBg=(COLORS[prvCol]||'#38bdf8')+'22', prvFg=COLORS[prvCol]||'#38bdf8';
    return `<div class="field"><label>الأيقونة</label><input type="hidden" name="${key}" id="icon-input" value="${cur}">
      <div class="flex items-center gap-3 mb-3 p-3 rounded-xl border border-[rgba(120,180,230,.2)] bg-[rgba(255,255,255,.03)]">
        <div id="icon-preview" class="w-12 h-12 rounded-xl grid place-items-center shrink-0" style="background:${prvBg};color:${prvFg}"><i data-lucide="${cur}" class="w-7 h-7"></i></div>
        <div class="text-[12px] text-[#9fb6cb] font-mono" id="icon-preview-name">${cur}</div>
      </div>
      <div class="flex flex-wrap gap-1.5">${iconOptions().map(o=>`<div onclick="pickIcon('${o.val}')" class="iconchip w-9 h-9 rounded-lg grid place-items-center cursor-pointer border transition ${cur===o.val?'border-sky-400 bg-[rgba(56,189,248,.15)]':'border-[rgba(120,180,230,.18)] bg-[rgba(255,255,255,.03)] hover:border-sky-400'}" data-ic="${o.val}"><i data-lucide="${o.val}" class="w-4 h-4"></i></div>`).join('')}</div></div>`;
  };

  if(type==='dept'){
    fields.innerHTML = inp('اسم القسم','title','مثال: الهندسة المدنية') + inp('العنوان الفرعي','subtitle','Civil Engineering') + ta('الوصف','description') + colorSel('color') + iconSel('icon');
  } else if(type==='partition'){
    const curImg=data.image||'';
    fields.innerHTML = inp('اسم البارتيشن','title') + inp('العنوان الفرعي','subtitle') + ta('الوصف','description') + colorSel('color') + iconSel('icon') +
      `<div class="field"><label>صورة الغلاف</label>
        <div id="upload-area" class="upl ${curImg?'has':''}" onclick="$('img-upload').click()">
          <input type="file" id="img-upload" accept="image/*" class="hidden" onchange="handleImg(event)">
          <img id="image-preview" src="${curImg}" class="${curImg?'':'hidden'} w-full h-40 object-cover rounded-lg mb-1">
          <div id="image-placeholder" class="${curImg?'hidden':''} py-6"><i data-lucide="image-plus" class="w-8 h-8 mx-auto text-[#7f9bb3] mb-2"></i><p class="text-sm text-[#9fb6cb]">اضغط لرفع صورة</p><p class="text-xs text-[#7f9bb3] mt-1">PNG / JPG / WEBP</p></div>
        </div>
        <button type="button" onclick="removeImg()" class="mt-2 text-xs text-rose-400 hover:underline ${curImg?'':'hidden'}" id="remove-img-btn">حذف الصورة</button>
        <input type="url" id="img-url-input" placeholder="🔗 أو حط لينك صورة مباشر (جوجل فوتوز يتدعم)" class="mt-2 w-full px-3 py-2 rounded-lg bg-[rgba(255,255,255,.04)] border border-[rgba(120,180,230,.2)] text-[#e8f1f8] text-sm outline-none focus:border-sky-400">
        <p class="text-[11px] text-[#7f9bb3] mt-1">اللينك له الأولوية على الملف المرفوع — ولينك جوجل فوتوز بيتحوّل تلقائياً لرابط مباشر ✨</p>
      </div>`;
  } else if(type==='category' || type==='subcategory'){
    fields.innerHTML = inp('اسم التصنيف','title') + iconSel('icon');
  } else if(type==='course'){
    fields.innerHTML = inp('اسم الكورس','title') + inp('رابط المصدر','link','https://...','url');
  } else if(type==='note'){
    fields.innerHTML = `<div class="field"><label>نص الملاحظة</label><textarea name="text" rows="4" placeholder="اكتب ملاحظتك هنا...">${esc(data.text||'')}</textarea></div>`;
  }
  const _li=$('img-url-input');
  if(_li){
    const _mi=(data.image||'');
    if(_mi && _mi.indexOf('data:')!==0 && _mi!==defaultImage) _li.value=_mi;
    _li.addEventListener('change', ()=>{
      let v=_li.value.trim(); if(!v) return;
      if(isGPhotoPage(v)){
        showToast('⏳ بنحوّل لينك جوجل فوتوز لرابط مباشر...');
        resolveGooglePhotosLink(v).then(u=>{
          _li.value=u; const p=$('image-preview'); if(p){ p.src=u; p.classList.remove('hidden'); }
          $('image-placeholder').classList.add('hidden'); $('upload-area').classList.add('has');
          $('remove-img-btn').classList.remove('hidden');
          showToast('تم تحويل اللينك بنجاح ✓');
        }).catch(()=>showToast('تعذّر الجلب من جوجل فوتوز — تأكد إن المشاركة عامة', true));
      } else {
        const p=$('image-preview'); if(p){ p.src=v; p.classList.remove('hidden'); }
        $('image-placeholder').classList.add('hidden'); $('upload-area').classList.add('has');
        $('remove-img-btn').classList.remove('hidden');
      }
    });
  }
  $('modal').classList.remove('hidden'); lucide.createIcons();
}
function pickColor(v){ $('color-input').value=v; document.querySelectorAll('.colorchip').forEach(c=>c.classList.remove('sel')); event.target.classList.add('sel'); const prev=$('icon-preview'); if(prev){ prev.style.background=(COLORS[v]||'#38bdf8')+'22'; prev.style.color=COLORS[v]||'#38bdf8'; } }
function pickIcon(v){ $('icon-input').value=v; document.querySelectorAll('.iconchip').forEach(c=>{c.classList.remove('border-sky-400','bg-[rgba(56,189,248,.15)]');c.classList.add('border-[rgba(120,180,230,.18)]');}); const el=document.querySelector(`.iconchip[data-ic="${v}"]`); if(el){el.classList.add('border-sky-400','bg-[rgba(56,189,248,.15)]');el.classList.remove('border-[rgba(120,180,230,.18)]');} const prev=$('icon-preview'); if(prev){ const col=(document.getElementById('color-input')&&document.getElementById('color-input').value)||'sky'; prev.style.background=(COLORS[col]||'#38bdf8')+'22'; prev.style.color=COLORS[col]||'#38bdf8'; prev.innerHTML=`<i data-lucide="${v}" class="w-7 h-7"></i>`; const nm=$('icon-preview-name'); if(nm) nm.innerText=v; lucide.createIcons(); } }
function handleImg(e){
  const f=e.target.files[0]; if(!f) return;
  if(f.size > 10*1024*1024){ showToast('الصورة كبيرة جداً (أقصى حجم 10 ميجا)', true); return; }
  const r=new FileReader();
  r.onload=ev=>{
    compressImageFromUrl(ev.target.result, 1000, 0.82).then(data=>{
      tempImg=data;
      $('image-preview').src=data; $('image-preview').classList.remove('hidden');
      $('image-placeholder').classList.add('hidden'); $('upload-area').classList.add('has');
      $('remove-img-btn').classList.remove('hidden');
      const li=$('img-url-input'); if(li) li.value='';
      showToast('تم ضغط الصورة وتجهيزها ✓');
    }).catch(()=>showToast('حصلت مشكلة في قراءة الصورة', true));
  };
  r.readAsDataURL(f);
}
function removeImg(){
  tempImg='REMOVED';
  const li=$('img-url-input'); if(li) li.value='';
  $('image-preview').classList.add('hidden'); $('image-preview').src='';
  $('image-placeholder').classList.remove('hidden'); $('upload-area').classList.remove('has');
  $('remove-img-btn').classList.add('hidden');
}
function closeModal(){ $('modal').classList.add('hidden'); tempImg=null; }

async function submitForm(e){
  e.preventDefault();
  const fd=new FormData(e.target);
  const type=$('f-type').value, id=$('f-id').value, parent=$('f-parent').value;
  const curImg=$('f-img').value;

  if(type==='dept'){
    if(id){ const d=findNode(id); if(d){ d.title=fd.get('title')||d.title; d.subtitle=fd.get('subtitle')||''; d.description=fd.get('description')||''; d.color=fd.get('color')||d.color; d.icon=fd.get('icon')||d.icon; } }
    else depts.push({ id:uid('dep'), title:fd.get('title')||'قسم جديد', subtitle:fd.get('subtitle')||'', description:fd.get('description')||'', color:fd.get('color')||'sky', icon:fd.get('icon')||'boxes', partitions:[] });
  }
  else if(type==='partition'){
    let urlV=($('img-url-input')&&$('img-url-input').value||'').trim();
    let img = curImg||defaultImage;
    if(tempImg==='REMOVED') img=defaultImage;
    else if(urlV){
      if(isGPhotoPage(urlV)){
        try{ urlV = await resolveGooglePhotosLink(urlV); }
        catch(err){ showToast('تعذّر الجلب من جوجل فوتوز — تأكد إن المشاركة عامة', true); return; }
      }
      img = urlV;
    }
    else if(tempImg) img=tempImg;
    if(img && img!==defaultImage && img.indexOf('data:')===0 && img.length>200000){
      try{ img = await compressImageFromUrl(img, 1000, 0.82); }catch(err){}
    }
    const dep=findNode(parent); if(!dep){ alert('القسم غير موجود'); closeModal(); return; }
    if(id){ const p=findNode(id); if(p){ p.title=fd.get('title')||p.title; p.subtitle=fd.get('subtitle')||''; p.description=fd.get('description')||''; p.color=fd.get('color')||p.color; p.icon=fd.get('icon')||p.icon; p.image=img; } }
    else { if(!dep.partitions) dep.partitions=[]; dep.partitions.push({ id:uid('part'), title:fd.get('title')||'بارتيشن جديد', subtitle:fd.get('subtitle')||'', description:fd.get('description')||'', color:fd.get('color')||dep.color, icon:fd.get('icon')||'layers', image:img, categories:[] }); }
  }
  else if(type==='category'){
    const part=findNode(parent); if(!part){ alert('البارتيشن غير موجود'); closeModal(); return; }
    if(id){ const c=findNode(id); if(c){ c.title=fd.get('title')||c.title; c.icon=fd.get('icon')||c.icon; } }
    else { if(!part.categories) part.categories=[]; part.categories.push({ id:uid('cat'), title:fd.get('title')||'تصنيف جديد', icon:fd.get('icon')||'folder', courses:[] }); }
  }
  else if(type==='subcategory'){
    const cat=findNode(parent); if(!cat){ alert('التصنيف غير موجود'); closeModal(); return; }
    if(id){ const s=findNode(id); if(s){ s.title=fd.get('title')||s.title; s.icon=fd.get('icon')||s.icon; } }
    else { if(!cat.subCategories) cat.subCategories=[]; cat.subCategories.push({ id:uid('sub'), title:fd.get('title')||'تصنيف فرعي جديد', icon:fd.get('icon')||'folder', courses:[] }); }
  }
  else if(type==='course'){
    const cat=findNode(parent); if(!cat){ alert('التصنيف غير موجود'); closeModal(); return; }
    if(!cat.courses) cat.courses=[];
    if(id){ const c=findNode(id); if(c){ c.title=fd.get('title')||c.title; c.link=fd.get('link')||c.link; } }
    else cat.courses.push({ id:uid('cou'), title:fd.get('title')||'كورس جديد', link:fd.get('link')||'#', completed:false });
  }
  else if(type==='note'){
    const cat=findNode(parent); if(!cat){ alert('التصنيف غير موجود'); closeModal(); return; }
    if(!cat.notes) cat.notes=[];
    const text=(fd.get('text')||'').trim();
    if(!text){ alert('من فضلك اكتب نص الملاحظة'); return; }
    if(id){ const n=cat.notes.find(x=>x.id===id); if(n) n.text=text; }
    else cat.notes.push({ id:uid('note'), text, date:new Date().toISOString() });
  }
  save(); closeModal();
}

/* ============================ ADD SHORTCUTS ============================ */
function addPartition(){ openModal('partition', null, current); }

/* ============================ RENDER ============================ */
function renderTabs(){
  const t=$('tabs'); t.innerHTML='';
  // home tab
  t.insertAdjacentHTML('beforeend',
    `<button class="tab ${current==='home'?'active':''}" style="--acc:#38bdf8" onclick="go('home')"><i data-lucide="layout-grid" class="ic"></i> الرئيسية</button>`);
  depts.forEach((d,i)=>{
    const st=stats(d);
    const active = current===d.id;
    let ctrl='';
    if(isAdmin){
      ctrl = `<span class="tab-ctrl" onclick="event.stopPropagation()">
        <button title="تقديم" onclick="move('${d.id}',-1)" ${i===0?'disabled style="opacity:.3"':''}><i data-lucide="chevron-right" class="w-3 h-3"></i></button>
        <button title="تأخير" onclick="move('${d.id}',1)" ${i===depts.length-1?'disabled style="opacity:.3"':''}><i data-lucide="chevron-left" class="w-3 h-3"></i></button>
        <button title="تعديل" onclick="openModal('dept','${d.id}')"><i data-lucide="edit-3" class="w-3 h-3"></i></button>
        <button class="del" title="حذف" onclick="del('${d.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </span>`;
    }
    t.insertAdjacentHTML('beforeend',
      `<button class="tab ${active?'active':''}" style="--acc:${acc(d.color)}" onclick="go('${d.id}')">
        <i data-lucide="${d.icon}" class="ic"></i>
        <span>${esc(d.title)}</span>
        <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[rgba(255,255,255,.08)] text-[#9fb6cb]">${st.t}</span>
        ${ctrl}
      </button>`);
  });
  if(isAdmin){
    t.insertAdjacentHTML('beforeend',
      `<button class="tab tab-add" onclick="openModal('dept')"><i data-lucide="plus" class="ic"></i> قسم جديد</button>`);
  }
}

function renderHome(){
  const g=$('dept-grid'); g.innerHTML='';
  if(!depts.length){ g.innerHTML=`<div class="col-span-full text-center py-16 text-[#7f9bb3]">لا توجد أقسام بعد. ${isAdmin?'اضغط "قسم جديد" في الشريط العلوي للإضافة.':''}</div>`; return; }
  depts.forEach(d=>{
    const st=stats(d); const c=acc(d.color);
    g.insertAdjacentHTML('beforeend',
      `<div onclick="go('${d.id}')" class="sheet cursor-pointer hover:-translate-y-1 transition-transform" style="--acc:${c}">
        <div class="sheet-head p-6">
          <div class="flex items-start justify-between mb-4">
            <div class="w-12 h-12 rounded-xl grid place-items-center border" style="background:${c}1f;border-color:${c}55;color:${c}"><i data-lucide="${d.icon}" class="w-6 h-6"></i></div>
            <div class="ring" style="--acc:${c};--p:${st.pct}"><span>${st.pct}%</span></div>
          </div>
          <h3 class="text-xl font-black text-white mb-1">${esc(d.title)}</h3>
          <p class="text-[11px] font-mono uppercase tracking-widest mb-3" style="color:${c}">${esc(d.subtitle)}</p>
          <p class="text-sm text-[#9fb6cb] line-clamp-2 mb-4">${esc(d.description)}</p>
          <div class="flex items-center justify-between text-[11px] font-mono text-[#7f9bb3]">
            <span>${(d.partitions||[]).length} بارتيشن · ${st.d}/${st.t} مكتمل</span>
            <span class="flex items-center gap-1" style="color:${c}">دخول <i data-lucide="arrow-left" class="w-4 h-4"></i></span>
          </div>
        </div>
      </div>`);
  });
}

function renderDept(){
  const d=depts.find(x=>x.id===current); if(!d){ go('home'); return; }
  const c=acc(d.color); const st=stats(d);
  let headAdmin = isAdmin ? `<div class="flex gap-2">
      <button class="icobtn" title="تعديل القسم" onclick="openModal('dept','${d.id}')"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
      <button class="icobtn del" title="حذف القسم" onclick="del('${d.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    </div>` : '';
  $('dept-head').innerHTML =
    `<div class="titleblock sheet" style="--acc:${c}">
      <div class="diag"></div>
      <div class="relative p-6 sm:p-8 flex flex-col md:flex-row md:items-center gap-6">
        <div class="w-16 h-16 rounded-2xl grid place-items-center border shrink-0" style="background:${c}1f;border-color:${c}55;color:${c}"><i data-lucide="${d.icon}" class="w-8 h-8"></i></div>
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-1"><span class="stamp" style="--acc:${c}">DEPT · ${esc(d.subtitle||'')}</span>${headAdmin}</div>
          <h2 class="text-2xl sm:text-4xl font-black text-white">${esc(d.title)}</h2>
          <p class="text-[#9fb6cb] mt-2 max-w-2xl text-sm">${esc(d.description)}</p>
        </div>
        <div class="ring shrink-0" style="--acc:${c};--p:${st.pct}"><span>${st.pct}%</span></div>
      </div>
    </div>`;

  // partitions
  const wrap=$('partitions'); wrap.innerHTML='';
  if(!(d.partitions||[]).length){
    wrap.innerHTML=`<div class="sheet p-12 text-center col-span-full" style="--acc:${c}">
      <i data-lucide="layout-panel-top" class="w-10 h-10 mx-auto mb-3" style="color:${c}"></i>
      <p class="text-[#9fb6cb]">لا توجد بارتيشنات بعد.</p>
      ${isAdmin?`<button onclick="addPartition()" class="pillbtn pill-primary mt-4"><i data-lucide="plus" class="w-4 h-4"></i> إضافة أول بارتيشن</button>`:''}
    </div>`;
    lucide.createIcons(); return;
  }
  d.partitions.forEach((p,i)=>{
    const pc=acc(p.color); const pst=stats(p); const col=collapsed['P_'+p.id];
    const first=i===0, last=i===d.partitions.length-1;
    let pAdmin = isAdmin ? `<div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
        <button class="move" title="تحريك لأعلى" onclick="move('${p.id}',-1)" ${first?'disabled':''}><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>
        <button class="move" title="تحريك لأسفل" onclick="move('${p.id}',1)" ${last?'disabled':''}><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>
        <button class="icobtn" title="تعديل" onclick="openModal('partition','${p.id}')"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
        <button class="icobtn del" title="حذف" onclick="del('${p.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>` : '';
    

    const el=document.createElement('div');
    el.className='sheet partition-card cursor-pointer'; el.style.setProperty('--acc',pc); el.onclick=()=>openPartition(p.id);
    el.innerHTML = `
      <div class="partition-cover">
        <img src="${p.image||defaultImage}" alt="${esc(p.title)}" onerror="this.src=defaultImage">
        <div class="cover-icon" style="background:${pc}2b;border-color:${pc}80;color:${pc}"><i data-lucide="${p.icon}" class="w-5 h-5"></i></div>
      </div>
      <div class="sheet-head p-6">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap"><span class="stamp" style="--acc:${pc}">PARTITION ${String(i+1).padStart(2,'0')}</span><span class="text-[10px] font-mono uppercase tracking-widest" style="color:${pc}">${esc(p.subtitle||'')}</span></div>
            <h3 class="text-xl font-black text-white">${esc(p.title)}</h3>
          </div>
          <div class="ring !w-12 !h-12" style="--acc:${pc};--p:${pst.pct}"><span class="!w-[38px] !h-[38px] !text-[11px]">${pst.pct}%</span></div>
        </div>
        <p class="text-[14px] text-[#9fb6cb] mt-2 min-h-[44px]">${esc(p.description||'')}</p>
        <div class="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-[rgba(120,180,230,.12)]">
          <span class="flex items-center gap-1 text-[12px] font-bold" style="color:${pc}">دخول <i data-lucide="arrow-left" class="w-4 h-4"></i></span>
          <div onclick="event.stopPropagation()">${pAdmin}</div>
        </div>
      </div>`;

    // محتوى البارتيشن يظهر في صفحة مستقلة عند الضغط على البطاقة.
    wrap.appendChild(el);
  });
  lucide.createIcons();
}

function renderPartition(){
  const r=locate(currentPartition); if(!r || r.kind!=='partition'){ currentPartition=null; render(); return; }
  const p=r.node, d=r.dept, pc=acc(p.color), pst=stats(p);
  let pAdmin=isAdmin ? `<div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
    <button class="icobtn" title="تعديل" onclick="openModal('partition','${p.id}')"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
    <button class="icobtn del" title="حذف" onclick="del('${p.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
  </div>` : '';
  const addCat=isAdmin ? `<button onclick="openModal('category',null,'${p.id}')" class="pillbtn pill-primary"><i data-lucide="folder-plus" class="w-4 h-4"></i> إضافة تصنيف</button>` : '';
  const wrap=$('partition-detail');
  wrap.innerHTML=`
    <div class="flex items-center justify-between flex-wrap gap-3 mb-6">
      <button onclick="go('${d.id}')" class="flex items-center gap-2 text-[12px] font-bold text-[#9fb6cb] hover:text-sky-400 transition uppercase tracking-wide"><i data-lucide="arrow-right" class="w-4 h-4"></i> رجوع إلى ${esc(d.title)}</button>
      ${addCat}
    </div>
    <div class="sheet" style="--acc:${pc}">
      <div class="partition-cover !h-56 sm:!h-72"><img src="${p.image||defaultImage}" alt="${esc(p.title)}" onerror="this.src=defaultImage"><div class="cover-icon" style="background:${pc}2b;border-color:${pc}80;color:${pc}"><i data-lucide="${p.icon}" class="w-6 h-6"></i></div></div>
      <div class="sheet-head p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4"><div><div class="flex items-center gap-2 mb-2 flex-wrap"><span class="stamp" style="--acc:${pc}">PARTITION</span><span class="text-[11px] font-mono uppercase tracking-widest" style="color:${pc}">${esc(p.subtitle||'')}</span></div><h2 class="text-2xl sm:text-3xl font-black text-white">${esc(p.title)}</h2><p class="text-[#9fb6cb] mt-2 text-sm">${esc(p.description||'')}</p></div><div class="flex items-center gap-3"><div class="ring" style="--acc:${pc};--p:${pst.pct}"><span>${pst.pct}%</span></div>${pAdmin}</div></div>
      </div>
    </div>
    <div class="flex items-center justify-between flex-wrap gap-2 mt-9 mb-5">
      <h3 class="text-xl font-black text-white flex items-center gap-2"><i data-lucide="layers" class="w-5 h-5" style="color:${pc}"></i> التصنيفات</h3>
      <span class="text-[11px] font-mono text-[#7f9bb3]">${(p.categories||[]).length} تصنيف</span>
    </div>
    <div class="categories-grid" id="partition-categories"></div>`;
  const body=$('partition-categories');
  if(!(p.categories||[]).length) body.innerHTML=`<div class="sheet p-12 text-center col-span-full" style="--acc:${pc}"><i data-lucide="folder-open" class="w-10 h-10 mx-auto mb-3" style="color:${pc}"></i><p class="text-[#9fb6cb]">لا توجد تصنيفات بعد.</p>${isAdmin?`<button onclick="openModal('category',null,'${p.id}')" class="pillbtn pill-primary mt-4"><i data-lucide="plus" class="w-4 h-4"></i> إضافة أول تصنيف</button>`:''}</div>`;
  else p.categories.forEach((cat,ci)=>body.appendChild(renderCategory(cat,p,ci,p.categories.length,pc)));
  lucide.createIcons();
}

function renderCategory(cat, part, ci, total, pc){
  const first=ci===0, last=ci===total-1;
  const box=document.createElement('div');
  box.className='cat-card cursor-pointer';
  box.style.setProperty('--acc',pc);
  let admin = isAdmin ? `<div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
      <button class="move" title="أعلى" onclick="move('${cat.id}',-1)" ${first?'disabled':''}><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>
      <button class="move" title="أسفل" onclick="move('${cat.id}',1)" ${last?'disabled':''}><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>
      <button class="icobtn" title="تعديل" onclick="openModal('category','${cat.id}')"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
      <button class="icobtn del" title="حذف" onclick="del('${cat.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    </div>` : '';
  const cnt=(cat.courses||[]).length + (cat.subCategories||[]).reduce((a,s)=>a+(s.courses||[]).length,0);
  box.innerHTML = `<div class="cat-card-head" onclick="openCategory('${cat.id}')">
    <div class="flex items-center gap-3 min-w-0">
      <i data-lucide="arrow-left" class="w-5 h-5 text-[#7f9bb3] shrink-0"></i>
      <div class="w-11 h-11 rounded-xl grid place-items-center shrink-0" style="background:${pc}1f;color:${pc}"><i data-lucide="${cat.icon}" class="w-6 h-6"></i></div>
      <h4 class="text-[16px] font-bold text-white truncate">${esc(cat.title)}</h4>
      <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-[rgba(255,255,255,.06)] text-[#9fb6cb] shrink-0">${cnt}</span>
    </div>
    <div class="shrink-0">${admin}</div>
  </div>`;
  return box;
}

function renderCategoryDetail(){
  const r=locate(currentCategory);
  if(!r || r.kind!=='category'){ currentCategory=null; render(); return; }
  const cat=r.node, part=r.part, d=r.dept, pc=acc(part.color), cst=stats(cat);
  let cAdmin=isAdmin ? `<div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
    <button class="icobtn" title="تعديل" onclick="openModal('category','${cat.id}')"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
    <button class="icobtn del" title="حذف" onclick="del('${cat.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
  </div>` : '';
  const addBtn=isAdmin ? `<button onclick="openModal('course',null,'${cat.id}')" class="pillbtn pill-primary"><i data-lucide="plus" class="w-4 h-4"></i> إضافة كورس</button>
    <button onclick="openModal('subcategory',null,'${cat.id}')" class="pillbtn pill-ghost"><i data-lucide="git-branch" class="w-4 h-4"></i> تصنيف فرعي</button>` : '';
  const wrap=$('category-detail');
  wrap.innerHTML=`
    <div class="flex items-center justify-between flex-wrap gap-3 mb-6">
      <button onclick="openPartition('${part.id}')" class="flex items-center gap-2 text-[12px] font-bold text-[#9fb6cb] hover:text-sky-400 transition uppercase tracking-wide"><i data-lucide="arrow-right" class="w-4 h-4"></i> رجوع إلى ${esc(part.title)}</button>
      <div class="flex gap-2 flex-wrap">${addBtn}</div>
    </div>
    <div class="sheet" style="--acc:${pc}">
      <div class="sheet-head p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4"><div><div class="flex items-center gap-2 mb-2 flex-wrap"><span class="stamp" style="--acc:${pc}">CATEGORY</span><span class="text-[11px] font-mono uppercase tracking-widest" style="color:${pc}">${esc(part.title)}</span></div><h2 class="text-2xl sm:text-3xl font-black text-white">${esc(cat.title)}</h2></div><div class="flex items-center gap-3"><div class="ring" style="--acc:${pc};--p:${cst.pct}"><span>${cst.pct}%</span></div>${cAdmin}</div></div>
      </div>
      <div class="cat-card-body divide-y divide-[rgba(120,180,230,.06)] bg-[rgba(0,0,0,.15)]" id="category-content"></div>
    </div>`;
  const body=$('category-content');
  (cat.courses||[]).forEach((co,i)=> body.appendChild(renderCourse(co, cat.id, i, cat.courses.length, pc)));
  (cat.subCategories||[]).forEach(sub=>{
    const subHead=document.createElement('div');
    subHead.className='px-5 py-3 bg-[rgba(0,0,0,.25)] flex items-center justify-between gap-2 flex-wrap';
    let subAdmin = isAdmin ? `<div class="flex items-center gap-1.5">
        <button class="pillbtn pill-ghost !py-0.5 !px-2 !text-[10px]" onclick="openModal('course',null,'${sub.id}')"><i data-lucide="plus" class="w-3 h-3"></i> كورس</button>
        <button class="icobtn !w-7 !h-7" title="تعديل" onclick="openModal('subcategory','${sub.id}')"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
        <button class="icobtn del !w-7 !h-7" title="حذف" onclick="del('${sub.id}')"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>` : '';
    subHead.innerHTML=`<div class="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider" style="color:${pc}"><i data-lucide="${sub.icon}" class="w-4 h-4"></i> ${esc(sub.title)}</div>${subAdmin}`;
    body.appendChild(subHead);
    (sub.courses||[]).forEach((co,i)=> body.appendChild(renderCourse(co, sub.id, i, sub.courses.length, pc)));
  });
    if(!(cat.courses||[]).length && !(cat.subCategories||[]).length){
      body.insertAdjacentHTML('beforeend', `<div class="p-6 text-center text-[#7f9bb3] text-sm italic">لا توجد كورسات بعد.</div>`);
    }

    // قسم ملاحظات مخصص ومنفصل عن المحتوى
    const notesPanel=document.createElement('div');
    notesPanel.className='sheet mt-8';
    notesPanel.style.setProperty('--acc', pc);
    notesPanel.appendChild(renderNotes(cat, pc));
    wrap.appendChild(notesPanel);

    lucide.createIcons();
  }

function renderCourse(co, parentId, i, total, pc){
  const first=i===0, last=i===total-1;
  const row=document.createElement('div');
  row.className='row group p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
  let mv = isAdmin ? `<div class="flex gap-1" onclick="event.stopPropagation()">
      <button class="move" title="أعلى" onclick="move('${co.id}',-1)" ${first?'disabled':''}><i data-lucide="arrow-up" class="w-3 h-3"></i></button>
      <button class="move" title="أسفل" onclick="move('${co.id}',1)" ${last?'disabled':''}><i data-lucide="arrow-down" class="w-3 h-3"></i></button>
    </div>` : '';
  let adm = isAdmin ? `<div class="flex gap-1.5 sm:opacity-0 group-hover:opacity-100 transition" onclick="event.stopPropagation()">
      <button class="icobtn !w-8 !h-8" title="تعديل" onclick="openModal('course','${co.id}','${parentId}')"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></button>
      <button class="icobtn del !w-8 !h-8" title="حذف" onclick="del('${co.id}')"><i data-lucide="trash" class="w-3.5 h-3.5"></i></button>
    </div>` : '';
  row.innerHTML = `
    <div class="flex items-center gap-3 min-w-0 flex-1">
      ${mv}
      <button onclick="toggleCourse('${co.id}')" class="chk ${co.completed?'done':''}" style="--acc:${pc}"><i data-lucide="check" class="w-4 h-4"></i></button>
      <span class="text-[14.5px] truncate ${co.completed?'text-[#7f9bb3] line-through':'text-[#e8f1f8]'}">${esc(co.title)}</span>
    </div>
    <div class="flex items-center gap-3 justify-end">
      <a href="${esc(co.link)}" target="_blank" class="pillbtn pill-ghost !py-1.5 !text-[12px]" style="color:${pc};border-color:${pc}55">فتح المصدر <i data-lucide="external-link" class="w-3.5 h-3.5"></i></a>
      ${adm}
    </div>`;
  return row;
}

function fmtDate(s){
  try{ const d=new Date(s);
    return d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
  }catch(e){ return ''; }
}
function addNote(catId){ openModal('note', null, catId); }
function editNote(catId, noteId){ openModal('note', noteId, catId); }
function delNote(catId, noteId){
  const cat=findNode(catId); if(!cat||!cat.notes) return;
  if(!confirm('هل أنت متأكد من حذف الملاحظة؟')) return;
  cat.notes=cat.notes.filter(n=>n.id!==noteId);
  save();
}
function renderNotes(cat, pc){
  const sec=document.createElement('div');
  sec.className='notes-section';
  const notes=cat.notes||[];
  let html=`<div class="flex items-center justify-between gap-2 mb-3">
      <div class="flex items-center gap-2 text-[13px] font-bold" style="color:${pc}"><i data-lucide="sticky-note" class="w-4 h-4"></i> الملاحظات <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(255,255,255,.06)] text-[#9fb6cb]">${notes.length}</span></div>
      ${isAdmin?`<button onclick="addNote('${cat.id}')" class="pillbtn pill-ghost !py-1.5 !text-[12px]" style="color:${pc};border-color:${pc}55"><i data-lucide="plus" class="w-4 h-4"></i> إضافة ملاحظة</button>`:''}
    </div>`;
  if(!notes.length){
    html+=`<div class="text-center text-[#7f9bb3] text-[13px] italic py-1">لا توجد ملاحظات بعد.</div>`;
  } else {
    html+='<div class="space-y-2.5">';
    notes.forEach(n=>{
      html+=`<div class="note-card">
        <p class="note-text text-[13.5px] text-[#e8f1f8] leading-relaxed">${esc(n.text)}</p>
        ${n.date?`<div class="text-[10px] font-mono text-[#7f9bb3] mt-2">${fmtDate(n.date)}</div>`:''}
        ${isAdmin?`<div class="flex items-center gap-3 mt-2 pt-2 border-t border-[rgba(120,180,230,.1)]">
          <button class="text-[12px] font-bold flex items-center gap-1.5 text-[#9fb6cb] hover:text-sky-400 transition" onclick="editNote('${cat.id}','${n.id}')"><i data-lucide="edit-2" class="w-4 h-4"></i> تعديل</button>
          <button class="text-[12px] font-bold flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition" onclick="delNote('${cat.id}','${n.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i> حذف</button>
        </div>`:''}
      </div>`;
    });
    html+='</div>';
  }
  sec.innerHTML=html;
  return sec;
}

function render(){
  renderTabs();
  const home=$('view-home'), dept=$('view-dept'), partition=$('view-partition'), category=$('view-category');
  home.classList.add('hidden'); dept.classList.add('hidden'); partition.classList.add('hidden'); category.classList.add('hidden');
  if(current==='home'){ home.classList.remove('hidden'); renderHome(); }
  else if(currentCategory){ category.classList.remove('hidden'); renderCategoryDetail(); }
  else if(currentPartition){ partition.classList.remove('hidden'); renderPartition(); }
  else { dept.classList.remove('hidden'); renderDept(); }
  lucide.createIcons();
}

/* ============================ INIT ============================ */
function initFromHash(){
  const [deptId, partId, catId]=location.hash.replace('#','').split('/');
  current=(deptId && depts.find(d=>d.id===deptId))?deptId:'home';
  currentPartition=(partId && locate(partId)?.kind==='partition')?partId:null;
  currentCategory=(catId && locate(catId)?.kind==='category')?catId:null;
}
(function init(){
  if(!getSession()){ showLoginView(); return; }
  bootApp();
})();

// Safety net: re-initialize icons after a short delay in case of CDN timing issues
setTimeout(function() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}, 500);
