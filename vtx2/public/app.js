'use strict';
let ME=null, TAB='opps', SUBTAB='ALL', CUSTOMERS=[];
const $=(s,r=document)=>r.querySelector(s);
const api=async(url,opts={})=>{const isForm=opts.body instanceof FormData;
  const r=await fetch(url,{headers:isForm?{}:{'Content-Type':'application/json'},...opts});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Lỗi máy chủ');return d;};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dt=s=>s?new Date(s).toLocaleString('vi-VN'):'';
const vnd=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})+' VNĐ';
const pct=n=>(Number(n||0)*100).toLocaleString('en-US',{maximumFractionDigits:2})+'%';
const ROLE_LABEL={AE:'AE',GDSALES:'GĐ Sales',GDSX:'GĐ Sản xuất',GDKHOI:'GĐ Khối',CTCEO:'CT / CEO',KETOAN:'Kế toán'};
const CODE_LABEL={TONG:'Mã Tổng',SALE:'Mã Kinh doanh',SX:'Mã Sản xuất',OUTSOURCE:'Mã Outsource'};
const badge=(s,l)=>`<span class="badge b-${String(s).toLowerCase()}">${l||s}</span>`;
const initials=n=>(n||'?').trim().split(/\s+/).slice(-1)[0][0]||'?';
const isViewer=()=>['CTCEO','KETOAN'].includes(ME.role); // CEO/Kế toán chỉ xem

// ===== AUTH =====
async function doLogin(){try{ME=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('#u').value.trim(),password:$('#p').value})});enter();}catch(e){$('#loginErr').textContent=e.message;}}
async function doLogout(){await api('/api/logout',{method:'POST'});location.reload();}
async function boot(){try{ME=await api('/api/me');enter();}catch{$('#login').classList.remove('hidden');$('#app').classList.add('hidden');}}
function enter(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#who').innerHTML=`<b>${esc(ME.full_name)}</b>${ME.role_label}${ME.block?' · '+esc(ME.block):''}`;
  $('#avatar').textContent=initials(ME.full_name);buildNav();render();}
function buildNav(){
  const items=[['opps','Cơ hội kinh doanh']];
  if(ME.role==='GDKHOI')items.push(['inbox','Phê duyệt']);
  items.push(['log_sales','Nhật ký Kinh doanh']);
  if(ME.role!=='AE')items.push(['log_sx','Nhật ký Sản xuất']);
  $('#nav').innerHTML=items.map(([k,l])=>`<div class="navitem ${TAB===k?'active':''}" onclick="go('${k}')"><span class="dash">—</span>${l}</div>`).join('');
}
function go(t){TAB=t;SUBTAB='ALL';buildNav();render();}

// ===== ROUTER =====
async function render(){const v=$('#view');v.innerHTML='<div class="empty">Đang tải…</div>';
  const cr={opps:'Cơ hội kinh doanh',inbox:'Phê duyệt',log_sales:'Nhật ký Kinh doanh',log_sx:'Nhật ký Sản xuất'};
  $('#crumb').textContent=cr[TAB]||'';
  try{
    if(TAB==='opps')await viewOpps(v);
    else if(TAB==='inbox')await viewInbox(v);
    else if(TAB==='log_sales')await viewAudit(v,'SALES');
    else if(TAB==='log_sx')await viewAudit(v,'SX');
  }catch(e){v.innerHTML=`<div class="panel"><div class="panel-b err">${esc(e.message)}</div></div>`;}
}

// ===== OPPORTUNITIES =====
async function viewOpps(v){
  const opps=await api('/api/opportunities');
  const canCreate=['AE','GDSALES','GDKHOI'].includes(ME.role);
  const ws=opps.map(o=>{const tong=o.codes.find(c=>c.type==='TONG');
    let state='REQUESTED';if(o.status==='OPEN'||o.status==='CLOSED'||(tong&&tong.status!=='PENDING'))state='APPROVED';
    return{...o,_state:state,_tong:tong};});
  const counts={ALL:ws.length,APPROVED:ws.filter(o=>o._state==='APPROVED').length,REQUESTED:ws.filter(o=>o._state==='REQUESTED').length,REJECTED:ws.filter(o=>o._state==='REJECTED').length};
  const filtered=SUBTAB==='ALL'?ws:ws.filter(o=>o._state===SUBTAB);
  const tb=(k,l)=>`<div class="tab ${SUBTAB===k?'active':''}" onclick="setSub('${k}')">${l} <span class="cnt">(${counts[k]||0})</span></div>`;
  const rows=filtered.map((o,i)=>`<tr>
    <td>${i+1}</td><td>${o._tong?`<code>${o._tong.code}</code>`:'<span class="muted">—</span>'}</td>
    <td><b>${esc(o.name)}</b></td><td>${esc(o.customer_name)} <span class="muted">(${esc(o.customer_code)})</span></td>
    <td>${esc(o.ae_name)}</td><td>${esc(o.block)}</td><td>${badge(o.status)}</td>
    <td><button class="sm ghost" onclick="openOpp(${o.id})">👁 Xem</button></td></tr>`).join('');
  v.innerHTML=`<div class="panel">
    <div class="panel-h"><h3>Work Order — Cơ hội kinh doanh</h3>${canCreate?`<button onclick="modalNewOpp()">＋ Mở cơ hội mới</button>`:''}</div>
    <div class="tabs">${tb('ALL','Tất cả')}${tb('REQUESTED','Chờ duyệt')}${tb('APPROVED','Đã duyệt')}${tb('REJECTED','Từ chối')}</div>
    <div class="toolbar"><span class="muted">Tổng ${filtered.length} bản ghi</span><input class="search" id="oppSearch" placeholder="🔍 Tìm kiếm..." oninput="filterRows(this.value)"></div>
    <table id="oppTable"><thead><tr><th>#</th><th>Mã Tổng</th><th>Tên dự án</th><th>Khách hàng</th><th>AE</th><th>Khối</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="8" class="empty">Không có bản ghi.</td></tr>`}</tbody></table></div>`;
}
function setSub(k){SUBTAB=k;render();}
function filterRows(q){q=q.toLowerCase();document.querySelectorAll('#oppTable tbody tr').forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none');}

// ===== OPP DETAIL =====
let CUR=null, DETAIL_TAB='KD';
async function openOpp(id){const v=$('#view');v.innerHTML='<div class="empty">Đang tải…</div>';
  const o=await api('/api/opportunities/'+id);CUR=o;$('#crumb').textContent=o.name;
  if(!o.tong_active){v.innerHTML=`<div class="panel"><div class="panel-h"><button class="sm ghost" onclick="go('opps')">← Danh sách</button><h3>${esc(o.name)}</h3></div>
    <div class="panel-b empty">Mã Tổng chưa được phê duyệt.<br>Màn hình chi tiết chỉ mở khi mã Tổng đã được Giám đốc Khối duyệt.</div></div>`;return;}
  renderDetail(v,o);
}
function renderDetail(v,o){
  const tong=o.codes.find(c=>c.type==='TONG');
  const reqRows=o.requests.length?o.requests.map(r=>`<tr><td>${r.id}</td><td><span class="tag">${r.kind}</span></td><td>${esc(r.title)}</td><td>${stepPills(r)}</td><td>${badge(r.status)}</td></tr>`).join(''):`<tr><td colspan="5" class="empty">Chưa có yêu cầu.</td></tr>`;
  const atts=o.attachments.length?o.attachments.map(a=>`<a class="filechip" href="/api/attachments/${a.id}">📎 ${esc(a.orig_name)} <span class="muted">(${(a.size/1024).toFixed(0)} KB)</span></a>`).join(''):'<span class="muted">Không có file đính kèm</span>';
  v.innerHTML=`
  <div class="panel"><div class="panel-h"><button class="sm ghost" onclick="go('opps')">← Danh sách</button><h3>${esc(o.name)} <code>${tong.code}</code></h3>${badge(o.status)}</div>
    <div class="panel-b"><div class="grid2">
      <div class="kv"><span>Khách hàng / CĐT</span><b>${esc(o.customer_name)}</b></div>
      <div class="kv"><span>Mã khách hàng</span><b>${esc(o.customer_code)}</b></div>
      <div class="kv"><span>Khối / G</span><b>${esc(o.block)}</b></div>
      <div class="kv"><span>AE phụ trách</span><b>${esc(o.ae_name)}</b></div>
      <div class="kv"><span>Căn cứ phê duyệt (BOD)</span><b>${esc(o.bod_basis)||'—'}</b></div>
      <div class="kv"><span>File đính kèm</span><span></span></div>
    </div><div style="margin-top:8px">${atts}</div></div></div>

  <div class="panel"><div class="panel-h"><h3>Yêu cầu của cơ hội</h3>
    ${!isViewer()&&['AE','GDSALES','GDKHOI','GDSX'].includes(ME.role)?`<button class="sm" onclick="modalOpenChild(${o.id})">＋ Mở mã con</button>`:''}
    ${!isViewer()?`<button class="sm ghost" onclick="modalBudget(${o.id})">＋ Yêu cầu ngân sách</button>`:''}</div>
    <table><thead><tr><th>#</th><th>Loại</th><th>Tiêu đề</th><th>Tiến trình</th><th>Trạng thái</th></tr></thead><tbody>${reqRows}</tbody></table>
    ${budgetAdjTable(o)}
  </div>

  <div class="panel">
    <div class="panel-h"><h3>Phương án kinh doanh (PAKD)</h3>
      <div class="seg">
        ${o.perms.seeSales?`<button class="${DETAIL_TAB==='KD'?'active':''}" onclick="setDetailTab('KD')">Kinh doanh</button>`:''}
        ${o.perms.seeSx?`<button class="${DETAIL_TAB==='SX'?'active':''}" onclick="setDetailTab('SX')">Sản xuất</button>`:''}
      </div></div>
    <div class="panel-b" id="pakdBody"></div></div>

  <div class="panel"><div class="panel-h"><h3>Đóng mã dự án</h3></div><div class="panel-b">${closeButtons(o)}</div></div>`;
  if(DETAIL_TAB==='KD'&&!o.perms.seeSales)DETAIL_TAB='SX';
  if(DETAIL_TAB==='SX'&&!o.perms.seeSx)DETAIL_TAB='KD';
  renderPakd(o);
}
function setDetailTab(t){DETAIL_TAB=t;renderPakd(CUR);document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('active',b.textContent.includes(t==='KD'?'Kinh doanh':'Sản xuất')));}

function renderPakd(o){const body=$('#pakdBody');if(!body)return;
  const tong=o.codes.find(c=>c.type==='TONG');
  const canKD=!isViewer()&&['AE','GDSALES','GDKHOI'].includes(ME.role)&&tong.status==='ACTIVE';
  const canSX=!isViewer()&&['GDSX','GDKHOI'].includes(ME.role)&&tong.status==='ACTIVE';
  if(DETAIL_TAB==='KD'){
    if(!o.pakd_sales){body.innerHTML=`<div class="empty">Bạn không có quyền xem giá trị Kinh doanh.</div>`;return;}
    body.innerHTML=pakdSalesTable(o.pakd_sales)+(canKD?`<button class="sm" style="margin-top:12px" onclick="modalPakd(${o.id})">＋ Thêm MVP (PAKD Kinh doanh)</button>`:'')+`<div class="muted" style="margin-top:8px;font-size:12px">Chỉ Giá trị HĐ nhập số; các dòng còn lại nhập %, tiền tự tính. Cần GĐ Khối duyệt mới cộng vào cột Tổng.</div>`;
  }else{
    body.innerHTML=sxBudgetTable(o.sx_budgets||[])+(canSX?`<button class="sm" style="margin-top:12px" onclick="modalSxBudget(${o.id})">＋ Lập ngân sách Sản xuất</button>`:'')+`<div class="muted" style="margin-top:8px;font-size:12px">Ngân sách SX phân bổ chi tiết từ trần (dòng 4 PAKD đã duyệt) theo %. Cần GĐ Khối duyệt.</div>`;
  }
}
function mvpHeader(phases){return phases.map(p=>`<th class="num">${esc(p.label)}<br><span style="font-weight:normal;font-size:10px">${p.status==='APPROVED'?'✓ duyệt':p.status==='REJECTED'?'✕ từ chối':'⏳ chờ'}</span></th>`).join('')+`<th class="num total-col">TỔNG CỘNG DỒN</th>`;}
function rowCalc(phases,field,total){return phases.map(p=>`<td class="num">${vnd(p.calc[field])}</td>`).join('')+`<td class="num total-col">${vnd(total)}</td>`;}
function pakdSalesTable(d){const p=d.phases,t=d.total;
  return `<div style="overflow:auto"><table class="pakd-table"><thead><tr><th style="text-align:left">PAKD TỔNG — Kinh doanh</th><th>Định mức</th>${mvpHeader(p)}</tr></thead><tbody>
    <tr><td class="lbl">1. Giá trị ký HĐ trước VAT</td><td class="muted">nhập tay</td>${p.map(x=>`<td class="num">${vnd(x.calc.cv)}</td>`).join('')}<td class="num total-col">${vnd(t.cv)}</td></tr>
    <tr><td class="lbl">2. R&D</td><td class="muted">% HĐ</td>${rowCalc(p,'rd',t.rd)}</tr>
    <tr><td class="lbl">3. Giá trị net</td><td></td>${p.map(x=>`<td class="num">${vnd(x.calc.net)}</td>`).join('')}<td class="num total-col">${vnd(t.net)}</td></tr>
    <tr style="background:#fff7ed"><td class="lbl"><b>4. Chi phí sản xuất (được cấp phát)</b></td><td class="muted">% net</td>${p.map(x=>`<td class="num">${vnd(x.calc.sx)}</td>`).join('')}<td class="num total-col">${vnd(t.sx)}</td></tr>
    <tr><td class="lbl">5. Chi phí kinh doanh</td><td class="muted">% net</td>${p.map(x=>`<td class="num">${vnd(x.calc.kd)}</td>`).join('')}<td class="num total-col">${vnd(t.kd)}</td></tr>
    <tr><td class="lbl">6. Dự phòng kiểm toán</td><td class="muted">% net</td>${rowCalc(p,'audit',t.audit)}</tr>
    <tr><td class="lbl">7. Chi phí tài chính</td><td class="muted">% net</td>${rowCalc(p,'finance',t.finance)}</tr>
    <tr><td class="lbl">8. Chi phí chung vận hành</td><td class="muted">% net</td>${rowCalc(p,'overhead',t.overhead)}</tr>
    <tr style="border-top:2px solid var(--vtx)"><td class="lbl"><b>9. LỢI NHUẬN TRƯỚC THUẾ</b></td><td></td>${p.map(x=>`<td class="num">${vnd(x.calc.lntt)}</td>`).join('')}<td class="num total-col" style="color:var(--vtx-d)">${vnd(t.lntt)}</td></tr>
    <tr><td class="lbl">Biên lợi nhuận</td><td></td>${p.map(x=>`<td class="num">${pct(x.calc.margin)}</td>`).join('')}<td class="num total-col">${pct(t.margin)}</td></tr>
  </tbody></table></div>`;
}
function sxBudgetTable(list){
  if(!list.length)return `<div class="empty">Chưa có ngân sách Sản xuất nào.</div>`;
  return `<div style="overflow:auto"><table class="pakd-table"><thead><tr><th style="text-align:left">Ngân sách Sản xuất</th>${list.map(b=>`<th class="num">${esc(b._label||('NS#'+b.id))}<br><span style="font-weight:normal;font-size:10px">${b.status==='APPROVED'?'✓ duyệt':b.status==='REJECTED'?'✕':'⏳ chờ'}</span></th>`).join('')}</tr></thead><tbody>
    <tr><td class="lbl">Trần ngân sách (dòng 4 đã duyệt)</td>${list.map(b=>`<td class="num">${vnd(b.ceiling)}</td>`).join('')}</tr>
    <tr><td class="lbl">Chi phí phát triển</td>${list.map(b=>`<td class="num">${vnd(b.calc.dev)} <span class="muted">(${pct(b.pct_dev)})</span></td>`).join('')}</tr>
    <tr><td class="lbl">Chi phí dự phòng</td>${list.map(b=>`<td class="num">${vnd(b.calc.reserve)} <span class="muted">(${pct(b.pct_reserve)})</span></td>`).join('')}</tr>
    <tr><td class="lbl">Chi phí thưởng sản xuất</td>${list.map(b=>`<td class="num">${vnd(b.calc.bonus)} <span class="muted">(${pct(b.pct_bonus)})</span></td>`).join('')}</tr>
    <tr><td class="lbl">Chi phí bảo hành</td>${list.map(b=>`<td class="num">${vnd(b.calc.warranty)} <span class="muted">(${pct(b.pct_warranty)})</span></td>`).join('')}</tr>
    <tr><td class="lbl">Chi phí outsource</td>${list.map(b=>`<td class="num">${vnd(b.calc.outsource)} <span class="muted">(${pct(b.pct_outsource)})</span></td>`).join('')}</tr>
    <tr style="border-top:2px solid var(--vtx)"><td class="lbl"><b>TỔNG PHÂN BỔ</b></td>${list.map(b=>`<td class="num total-col">${vnd(b.calc.total)}</td>`).join('')}</tr>
  </tbody></table></div>`;
}
function budgetAdjTable(o){
  if(!o.budget_adjusts||!o.budget_adjusts.length)return '';
  const kindLabel={ALLOC:'Cấp phát NS',ADJ_SALES:'Điều chỉnh NS KD',ADJ_SX:'Điều chỉnh NS SX'};
  return `<div style="padding:0 18px 14px"><label>Yêu cầu ngân sách</label><table><thead><tr><th>#</th><th>Loại</th><th>MVP</th><th>Lý do</th><th>Trạng thái</th></tr></thead><tbody>
    ${o.budget_adjusts.map(b=>`<tr><td>${b.id}</td><td><span class="tag">${kindLabel[b.kind]||b.kind}</span></td><td>${esc(b.phase_label||'')}</td><td>${esc(b.reason||'')}</td><td>${badge(b.status)}</td></tr>`).join('')}</tbody></table></div>`;
}
function closeButtons(o){
  const canClose=!isViewer()&&['AE','GDSALES','GDKHOI'].includes(ME.role);
  const canCloseSx=!isViewer()&&['GDSX','GDKHOI'].includes(ME.role);
  const items=o.codes.filter(c=>c.status==='ACTIVE').map(c=>{
    const allow=(c.type==='SX'||c.type==='OUTSOURCE')?canCloseSx:canClose;
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><span class="tag">${CODE_LABEL[c.type]}</span><code>${c.code}</code>${badge(c.status)}
      ${allow?`<button class="sm danger" onclick="modalClose(${o.id},${c.id},'${c.type}','${c.code}')">Đóng mã</button>`:''}</div>`;}).join('');
  return items+`<div class="muted" style="font-size:12px;margin-top:8px">Thứ tự: Outsource → Sản xuất → Kinh doanh → Tổng. GĐ Khối phê duyệt đóng.</div>`;
}
function stepPills(r){return `<span class="pill-step"><span class="sdot ${r.status==='APPROVED'?'done':r.status==='PENDING'?'cur':''}">1</span> <span class="muted" style="font-size:11px">GĐ Khối</span></span>`;}

// ===== INBOX =====
async function viewInbox(v){
  const inbox=await api('/api/requests/inbox');
  const rows=inbox.map(r=>`<tr><td>${r.id}</td><td><b>${esc(r.opp.name)}</b></td><td><span class="tag">${r.kind}</span></td><td>${esc(r.title)}</td><td>${payloadSummary(r)}</td>
    <td><button class="sm ok" onclick="act(${r.id},'APPROVE')">Duyệt</button><button class="sm danger" onclick="act(${r.id},'REJECT')">Từ chối</button></td></tr>`).join('');
  v.innerHTML=`<div class="panel"><div class="panel-h"><h3>Hàng chờ phê duyệt — Giám đốc Khối</h3></div>
    <table><thead><tr><th>#</th><th>Dự án</th><th>Loại</th><th>Tiêu đề</th><th>Chi tiết</th><th>Thao tác</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="6" class="empty">Không có yêu cầu chờ duyệt.</td></tr>`}</tbody></table></div>`;
}
function payloadSummary(r){const p=r.payload;
  if(r.kind==='OPEN_CODE')return `Mở ${CODE_LABEL[p.code_type]||p.code_type}`;
  if(r.kind==='CLOSE_CODE')return 'Đóng mã';
  if(r.kind==='PAKD_PHASE')return `PAKD ${esc(p.label||'')}`;
  if(r.kind==='SX_BUDGET')return 'Ngân sách Sản xuất';
  if(r.kind==='BUDGET_ADJ')return {ALLOC:'Cấp phát NS',ADJ_SALES:'Điều chỉnh NS KD',ADJ_SX:'Điều chỉnh NS SX'}[p.kind]||'Ngân sách';
  return '';}
async function act(id,decision){let comment='';if(decision==='REJECT')comment=prompt('Lý do từ chối:')??'';
  try{await api(`/api/requests/${id}/act`,{method:'POST',body:JSON.stringify({decision,comment})});render();}catch(e){alert(e.message);}}

// ===== AUDIT =====
async function viewAudit(v,branch){
  const rows=await api('/api/audit?branch='+branch);const label=branch==='SX'?'Sản xuất':'Kinh doanh';
  const body=rows.map(r=>`<tr><td class="muted">${dt(r.created_at)}</td><td>${esc(r.actor||'')}</td><td>${esc(r.opp_name||'')}</td><td><span class="tag">${r.change_type}</span></td><td>${esc(r.detail)}</td></tr>`).join('');
  v.innerHTML=`<div class="panel"><div class="panel-h"><h3>Nhật ký ${label}</h3></div>
    <table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Dự án</th><th>Loại</th><th>Nội dung</th></tr></thead>
    <tbody>${body||`<tr><td colspan="5" class="empty">Chưa có bản ghi.</td></tr>`}</tbody></table></div>`;
}

// ===== MODALS =====
function modal(h){$('#modalRoot').innerHTML=`<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">${h}</div></div>`;}
function closeModal(){$('#modalRoot').innerHTML='';}

async function modalNewOpp(){
  CUSTOMERS=await api('/api/customers');
  const opts=CUSTOMERS.map(c=>`<option value="${c.id}">${esc(c.name)} (${esc(c.code)})</option>`).join('');
  modal(`<h3>PHIẾU YÊU CẦU PHÊ DUYỆT MỞ MÃ DỰ ÁN</h3>
    <div class="muted" style="font-size:12px;margin-bottom:10px">Mở mã theo cây mã thống nhất (Tổng → Sale / Sản xuất → Outsource)</div>
    <div class="err" id="mErr"></div>
    <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:8px"><b style="font-size:13px">A. THÔNG TIN CƠ HỘI / DỰ ÁN</b>
      <label>Tên cơ hội / dự án</label><input id="m_name">
      <label>Khách hàng / Chủ đầu tư</label>
      <div class="row"><div class="col"><select id="m_cust">${opts}</select></div><button class="sm ghost" type="button" onclick="toggleNewCust()">＋ KH mới</button></div>
      <div id="newCustWrap" class="hidden" style="margin-top:8px;padding:10px;background:#fff;border-radius:8px;border:1px solid var(--line)">
        <div class="row"><div class="col"><label>Mã KH</label><input id="nc_code" placeholder="022"></div>
          <div class="col" style="flex:2"><label>Tên KH</label><input id="nc_name"></div>
          <button class="sm" type="button" onclick="addCust()" style="align-self:flex-end">Lưu KH</button></div></div>
      <label>Sales (AE) đề nghị</label><input value="${esc(ME.full_name)}" disabled>
      <label>Căn cứ phê duyệt mở cơ hội (BOD) — file đính kèm</label><input type="file" id="m_files" multiple>
      <label>Ghi chú căn cứ BOD</label><input id="m_bod" placeholder="VD: Nghị quyết HĐQT số...">
    </div>
    <div style="background:#f8fafc;padding:12px;border-radius:8px"><b style="font-size:13px">C. ĐỀ NGHỊ MỞ MÃ</b>
      <div class="ck"><input type="checkbox" id="m_sale"><label style="margin:0">Mở luôn mã Kinh doanh (.1)</label></div>
      <div class="ck"><input type="checkbox" id="m_sx"><label style="margin:0">Mở luôn mã Sản xuất (.2)</label></div>
      <div class="muted" style="font-size:12px">Mã Tổng chỉ mở sau khi GĐ Khối phê duyệt. Mã con (nếu tích) tự gửi duyệt sau đó.</div>
    </div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="ghost" onclick="closeModal()">Hủy</button><button onclick="submitNewOpp()">Tạo & gửi duyệt</button></div>`);
}
function toggleNewCust(){$('#newCustWrap').classList.toggle('hidden');}
async function addCust(){try{const c=await api('/api/customers',{method:'POST',body:JSON.stringify({code:$('#nc_code').value.trim(),name:$('#nc_name').value.trim()})});
  CUSTOMERS.push(c);const sel=$('#m_cust');const op=document.createElement('option');op.value=c.id;op.textContent=`${c.name} (${c.code})`;op.selected=true;sel.appendChild(op);
  $('#newCustWrap').classList.add('hidden');$('#nc_code').value='';$('#nc_name').value='';
}catch(e){$('#mErr').textContent=e.message;}}
async function submitNewOpp(){try{const fd=new FormData();
  fd.append('name',$('#m_name').value.trim());fd.append('customer_id',$('#m_cust').value);fd.append('bod_basis',$('#m_bod').value.trim());
  fd.append('want_sale',$('#m_sale').checked?'1':'0');fd.append('want_sx',$('#m_sx').checked?'1':'0');
  for(const f of($('#m_files').files||[]))fd.append('files',f);
  await api('/api/opportunities',{method:'POST',body:fd});closeModal();render();
}catch(e){$('#mErr').textContent=e.message;}}

function modalOpenChild(oppId){const o=CUR,tong=o.codes.find(c=>c.type==='TONG');const sx=o.codes.filter(c=>c.type==='SX'&&c.status==='ACTIVE');
  const typeOpts=ME.role==='GDSX'
    ?`<option value="SX">Mã Sản xuất (con của Tổng)</option><option value="OUTSOURCE">Mã Outsource (con của Sản xuất)</option>`
    :`<option value="SALE">Mã Kinh doanh (con của Tổng)</option><option value="SX">Mã Sản xuất (con của Tổng)</option><option value="OUTSOURCE">Mã Outsource (con của Sản xuất)</option>`;
  modal(`<h3>Mở mã con</h3><div class="err" id="mErr"></div>
    <label>Loại mã</label><select id="m_type" onchange="childParent()">${typeOpts}</select><div id="m_pwrap"></div>
    <label>Mục đích sử dụng</label><input id="m_purpose">
    <div class="muted" style="font-size:12px">GĐ Khối phê duyệt (1 bước).</div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="ghost" onclick="closeModal()">Hủy</button><button onclick="submitChild(${oppId})">Gửi duyệt</button></div>`);
  window._sx=sx;window._tong=tong.id;childParent();}
function childParent(){const t=$('#m_type').value,w=$('#m_pwrap');
  if(t==='OUTSOURCE')w.innerHTML=window._sx.length?`<label>Mã Sản xuất cha</label><select id="m_parent">${window._sx.map(c=>`<option value="${c.id}">${c.code}</option>`).join('')}</select>`:`<div class="err">Cần có mã Sản xuất trước.</div>`;
  else w.innerHTML=`<label>Mã cha</label><input value="Mã Tổng (tự gán)" disabled>`;}
async function submitChild(oppId){try{const type=$('#m_type').value;const parent_id=type==='OUTSOURCE'?Number($('#m_parent').value):window._tong;
  await api('/api/requests',{method:'POST',body:JSON.stringify({opportunity_id:oppId,kind:'OPEN_CODE',payload:{code_type:type,parent_id,purpose:$('#m_purpose').value.trim()}})});
  closeModal();openOpp(oppId);}catch(e){$('#mErr').textContent=e.message;}}

// PAKD Kinh doanh: nhập %, xem tiền tự tính realtime
function pctRow(id,label,norm){return `<tr><td class="lbl">${label}</td><td><input type="number" step="0.0001" id="${id}" value="${norm||0}" style="width:90px" oninput="recalcPakd()"> <span class="muted">×100%</span></td><td class="num" id="amt_${id}">0 VNĐ</td></tr>`;}
function modalPakd(oppId){
  modal(`<h3>Lập PAKD — Giai đoạn (MVP) · Kinh doanh</h3><div class="muted" style="font-size:12px;margin-bottom:8px">Chỉ Giá trị HĐ nhập số tiền; còn lại nhập tỷ lệ (vd 0.1 = 10%), tiền tự tính.</div><div class="err" id="mErr"></div>
    <label>Tên MVP / giai đoạn</label><input id="f_label" placeholder="MVP1">
    <label>1. Giá trị ký HĐ trước VAT (VNĐ)</label><input type="number" id="f_contract_value" value="0" oninput="recalcPakd()">
    <table class="pakd-table" style="margin-top:10px"><thead><tr><th style="text-align:left">Nội dung</th><th>Tỷ lệ</th><th class="num">Thành tiền</th></tr></thead><tbody>
      ${pctRow('pct_rd','2. R&D (% giá trị HĐ)',0.1)}
      <tr style="background:#fff7ed"><td class="lbl" colspan="3"><b>4. Chi phí sản xuất được cấp phát (% net)</b></td></tr>
      ${pctRow('pct_dev','— Chi phí phát triển',0.4)}
      ${pctRow('pct_reserve','— Chi phí dự phòng',0.08)}
      ${pctRow('pct_bonus','— Chi phí thưởng sản xuất',0)}
      ${pctRow('pct_warranty','— Chi phí bảo hành',0.1)}
      <tr style="background:#f0f6ff"><td class="lbl" colspan="3"><b>5. Chi phí kinh doanh (% net)</b></td></tr>
      ${pctRow('pct_sal','— Lương kinh doanh',0.0476)}
      ${pctRow('pct_external','— Đối ngoại',0.01)}
      ${pctRow('pct_travel','— Công tác phí',0.005)}
      ${pctRow('pct_contingency','— Dự phòng',0.02)}
      ${pctRow('pct_sales_bonus','— Thưởng kinh doanh',0)}
      ${pctRow('pct_audit','6. Dự phòng kiểm toán (% net)',0.0469)}
      ${pctRow('pct_finance','7. Chi phí tài chính (% net)',0.05)}
      ${pctRow('pct_overhead','8. Chi phí chung vận hành (% net)',0.0587)}
    </tbody></table>
    <div class="kv" style="margin-top:8px;font-size:14px"><b>Net</b><b id="calc_net">0 VNĐ</b></div>
    <div class="kv" style="font-size:14px"><b>9. LỢI NHUẬN TRƯỚC THUẾ</b><b id="calc_lntt" style="color:var(--vtx-d)">0 VNĐ</b></div>
    <div class="kv" style="font-size:13px"><span>Biên LN</span><b id="calc_margin">0%</b></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="ghost" onclick="closeModal()">Hủy</button><button onclick="submitPakd(${oppId})">Gửi GĐ Khối duyệt</button></div>`);
  recalcPakd();
}
function gv(id){return Number($('#'+id).value)||0;}
function recalcPakd(){
  const cv=gv('f_contract_value'),rd=cv*gv('pct_rd'),net=cv-rd;
  const fields=['pct_rd','pct_dev','pct_reserve','pct_bonus','pct_warranty','pct_sal','pct_external','pct_travel','pct_contingency','pct_sales_bonus','pct_audit','pct_finance','pct_overhead'];
  fields.forEach(f=>{const base=(f==='pct_rd')?cv:net;const el=$('#amt_'+f);if(el)el.textContent=vnd(base*gv(f));});
  const sx=net*(gv('pct_dev')+gv('pct_reserve')+gv('pct_bonus')+gv('pct_warranty'));
  const kd=net*(gv('pct_sal')+gv('pct_external')+gv('pct_travel')+gv('pct_contingency')+gv('pct_sales_bonus'));
  const lntt=net-sx-kd-net*gv('pct_audit')-net*gv('pct_finance')-net*gv('pct_overhead');
  $('#calc_net').textContent=vnd(net);$('#calc_lntt').textContent=vnd(lntt);$('#calc_margin').textContent=cv>0?pct(lntt/cv):'0%';
}
async function submitPakd(oppId){try{const body={label:$('#f_label').value.trim(),contract_value:gv('f_contract_value')};
  ['pct_rd','pct_dev','pct_reserve','pct_bonus','pct_warranty','pct_sal','pct_external','pct_travel','pct_contingency','pct_sales_bonus','pct_audit','pct_finance','pct_overhead'].forEach(k=>body[k]=gv(k));
  await api('/api/pakd/'+oppId,{method:'POST',body:JSON.stringify(body)});closeModal();openOpp(oppId);
}catch(e){$('#mErr').textContent=e.message;}}

// Ngân sách Sản xuất: chọn MVP Sales đã duyệt -> trần; nhập % phân bổ
async function modalSxBudget(oppId){
  let phases=[];try{phases=await api(`/api/sx/${oppId}/approved-phases`);}catch(e){}
  if(!phases.length){modal(`<h3>Lập ngân sách Sản xuất</h3><div class="empty">Chưa có MVP Kinh doanh nào được duyệt để lấy trần ngân sách Sản xuất.</div><div class="row" style="justify-content:flex-end"><button class="ghost" onclick="closeModal()">Đóng</button></div>`);return;}
  const opts=phases.map(p=>`<option value="${p.id}" data-ceil="${p.ceiling}">${esc(p.label)} — trần ${vnd(p.ceiling)}</option>`).join('');
  modal(`<h3>Lập ngân sách Sản xuất (phân bổ chi tiết)</h3><div class="muted" style="font-size:12px;margin-bottom:8px">Phân bổ trần (dòng 4 PAKD đã duyệt) theo %. Tổng % ≤ 100%.</div><div class="err" id="mErr"></div>
    <label>MVP Kinh doanh (lấy trần)</label><select id="sx_phase" onchange="recalcSx()">${opts}</select>
    <table class="pakd-table" style="margin-top:10px"><thead><tr><th style="text-align:left">Hạng mục</th><th>Tỷ lệ</th><th class="num">Thành tiền</th></tr></thead><tbody>
      ${pctRowSx('pct_dev','Chi phí phát triển',0.7)}
      ${pctRowSx('pct_reserve','Chi phí dự phòng',0.1)}
      ${pctRowSx('pct_bonus','Chi phí thưởng sản xuất',0)}
      ${pctRowSx('pct_warranty','Chi phí bảo hành',0.15)}
      ${pctRowSx('pct_outsource','Chi phí outsource',0.05)}
    </tbody></table>
    <div class="kv" style="margin-top:8px"><b>Tổng phân bổ</b><b id="sx_total">0 VNĐ</b></div>
    <div class="kv"><span>Tổng %</span><b id="sx_pct">0%</b></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="ghost" onclick="closeModal()">Hủy</button><button onclick="submitSxBudget(${oppId})">Gửi GĐ Khối duyệt</button></div>`);
  recalcSx();
}
function pctRowSx(id,label,norm){return `<tr><td class="lbl">${label}</td><td><input type="number" step="0.01" id="${id}" value="${norm||0}" style="width:90px" oninput="recalcSx()"></td><td class="num" id="sxamt_${id}">0 VNĐ</td></tr>`;}
function recalcSx(){const sel=$('#sx_phase');const ceil=Number(sel.options[sel.selectedIndex].dataset.ceil)||0;
  const fs=['pct_dev','pct_reserve','pct_bonus','pct_warranty','pct_outsource'];let sum=0;
  fs.forEach(f=>{const p=gv(f);sum+=p;$('#sxamt_'+f).textContent=vnd(ceil*p);});
  $('#sx_total').textContent=vnd(ceil*sum);$('#sx_pct').textContent=pct(sum)+(sum>1?' ⚠ vượt 100%':'');
}
async function submitSxBudget(oppId){try{const body={sales_phase_id:Number($('#sx_phase').value)};
  ['pct_dev','pct_reserve','pct_bonus','pct_warranty','pct_outsource'].forEach(k=>body[k]=gv(k));
  await api('/api/sx/'+oppId,{method:'POST',body:JSON.stringify(body)});closeModal();openOpp(oppId);
}catch(e){$('#mErr').textContent=e.message;}}

// Yêu cầu / điều chỉnh ngân sách
function modalBudget(oppId){
  const canSx=['GDSX','GDKHOI'].includes(ME.role);
  const canKd=['AE','GDSALES','GDKHOI'].includes(ME.role);
  modal(`<h3>Yêu cầu ngân sách</h3><div class="err" id="mErr"></div>
    <label>Loại yêu cầu</label><select id="bk" onchange="budgetFields()">
      ${canKd?`<option value="ALLOC">Yêu cầu cấp phát ngân sách</option><option value="ADJ_SALES">Điều chỉnh ngân sách Kinh doanh</option>`:''}
      ${canSx?`<option value="ADJ_SX">Điều chỉnh ngân sách Sản xuất</option>`:''}
    </select>
    <label>MVP / giai đoạn liên quan</label><input id="b_phase" placeholder="MVP1">
    <div id="bFields"></div>
    <label>Lý do điều chỉnh</label><textarea id="b_reason" rows="2"></textarea>
    <label>Tác động đến tiến độ / phạm vi</label><input id="b_sched">
    <label>Tác động đến lợi nhuận</label><input id="b_profit">
    <label>Nguồn bù đắp (nếu tăng)</label><input id="b_source">
    <div class="muted" style="font-size:12px">GĐ Khối phê duyệt. Sau duyệt sẽ ghi nhật ký tương ứng.</div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="ghost" onclick="closeModal()">Hủy</button><button onclick="submitBudget(${oppId})">Gửi GĐ Khối duyệt</button></div>`);
  budgetFields();
}
function budgetFields(){const k=$('#bk').value;const w=$('#bFields');
  const itemsKD=['Chi phí lương kinh doanh','Chi phí đối ngoại','Công tác phí','Chi phí dự phòng','Chi phí thưởng kinh doanh'];
  const itemsSX=['Chi phí phát triển','Chi phí dự phòng','Chi phí thưởng sản xuất','Chi phí bảo hành','Chi phí outsource'];
  const items=k==='ADJ_SX'?itemsSX:itemsKD;
  if(k==='ALLOC'){w.innerHTML=`<label>Số tiền đề nghị cấp phát (VNĐ)</label><input type="number" id="alloc_amt" value="0">
    <input type="hidden" id="b_scope" value="SALES">`;return;}
  w.innerHTML=`<input type="hidden" id="b_scope" value="${k==='ADJ_SX'?'SX':'SALES'}">
    <label>So sánh ngân sách trước/sau</label>
    <table class="pakd-table"><thead><tr><th style="text-align:left">Hạng mục</th><th class="num">Hiện tại</th><th class="num">Đề nghị</th></tr></thead><tbody>
    ${items.map((it,i)=>`<tr><td class="lbl">${it}</td><td><input type="number" id="cur_${i}" value="0"></td><td><input type="number" id="prop_${i}" value="0"></td></tr>`).join('')}
    </tbody></table>`;
}
async function submitBudget(oppId){try{const kind=$('#bk').value;const scope=$('#b_scope')?$('#b_scope').value:'SALES';
  let items=[];
  if(kind==='ALLOC'){items=[{name:'Cấp phát',current:0,proposed:gv('alloc_amt')}];}
  else{const names=kind==='ADJ_SX'?['Chi phí phát triển','Chi phí dự phòng','Chi phí thưởng sản xuất','Chi phí bảo hành','Chi phí outsource']:['Chi phí lương kinh doanh','Chi phí đối ngoại','Công tác phí','Chi phí dự phòng','Chi phí thưởng kinh doanh'];
    items=names.map((n,i)=>({name:n,current:gv('cur_'+i),proposed:gv('prop_'+i)}));}
  await api('/api/budget-adjust/'+oppId,{method:'POST',body:JSON.stringify({kind,scope,phase_label:$('#b_phase').value.trim(),reason:$('#b_reason').value.trim(),impact_schedule:$('#b_sched').value.trim(),impact_profit:$('#b_profit').value.trim(),source_cover:$('#b_source').value.trim(),items})});
  closeModal();openOpp(oppId);
}catch(e){$('#mErr').textContent=e.message;}}

function modalClose(oppId,codeId,type,code){modal(`<h3>Đóng ${CODE_LABEL[type]} <code>${code}</code></h3><div class="err" id="mErr"></div>
  <div class="muted" style="font-size:12px">GĐ Khối phê duyệt. Hệ thống chặn nếu còn mã con chưa đóng.</div>
  <label>Lý do / kết quả đóng</label><textarea id="m_reason" rows="3"></textarea>
  <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="ghost" onclick="closeModal()">Hủy</button><button class="danger" onclick="submitClose(${oppId},${codeId})">Gửi duyệt đóng</button></div>`);}
async function submitClose(oppId,codeId){try{await api('/api/requests',{method:'POST',body:JSON.stringify({opportunity_id:oppId,kind:'CLOSE_CODE',payload:{code_id:codeId,reason:$('#m_reason').value.trim()}})});closeModal();openOpp(oppId);}catch(e){$('#mErr').textContent=e.message;}}

$('#p').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
boot();
