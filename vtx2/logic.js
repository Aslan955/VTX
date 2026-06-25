'use strict';
const { db } = require('./db');
const now = () => new Date().toISOString();

function log(opportunity_id, actor_id, branch, change_type, detail) {
  db.prepare('INSERT INTO audit_log(opportunity_id,actor_id,branch,change_type,detail,created_at) VALUES(?,?,?,?,?,?)')
    .run(opportunity_id, actor_id, branch, change_type, detail, now());
}

// --- Sinh mã ---
function genTongCode(customer_code) {
  for (let i = 0; i < 300; i++) {
    const xxx = String(Math.floor(100 + Math.random() * 900));
    const code = `${customer_code}.${xxx}`;
    if (!db.prepare('SELECT 1 FROM codes WHERE code=?').get(code)) return code;
  }
  throw new Error('Không sinh được mã tổng duy nhất');
}
function childCode(parent, type) {
  if (type === 'SALE') return `${parent.code}.1`;
  if (type === 'SX') return `${parent.code}.2`;
  if (type === 'OUTSOURCE') {
    const sib = db.prepare("SELECT COUNT(*) c FROM codes WHERE parent_id=? AND type='OUTSOURCE'").get(parent.id).c;
    return `${parent.code}.${sib + 1}`;
  }
  throw new Error('Loại mã con không hợp lệ');
}

// --- Luồng duyệt: TẤT CẢ chỉ do GĐ Khối duyệt (1 bước) ---
function stepRole() { return 'GDKHOI'; }
function lastStep() { return 1; }

function createRequest({ opportunity_id, kind, title, payload, requested_by, branch = 'SALES' }) {
  const r = db.prepare(
    `INSERT INTO requests(opportunity_id,kind,title,payload,requested_by,step,status,created_at,updated_at)
     VALUES(?,?,?,?,?,1,'PENDING',?,?)`
  ).run(opportunity_id, kind, title, JSON.stringify(payload), requested_by, now(), now());
  log(opportunity_id, requested_by, branch, 'REQUEST_CREATE', `Tạo yêu cầu [${kind}]: ${title}`);
  return r.lastInsertRowid;
}

function actOnRequest(request_id, actor, decision, comment) {
  const req = db.prepare('SELECT * FROM requests WHERE id=?').get(request_id);
  if (!req || req.status !== 'PENDING') throw new Error('Yêu cầu không tồn tại hoặc đã xử lý');
  if (actor.role !== 'GDKHOI') throw new Error('Chỉ Giám đốc Khối được phê duyệt');

  db.prepare('INSERT INTO approvals(request_id,step,actor_id,decision,comment,created_at) VALUES(?,?,?,?,?,?)')
    .run(request_id, 1, actor.id, decision, comment || '', now());
  const p = JSON.parse(req.payload);
  const branch = p.branch || 'SALES';

  if (decision === 'REJECT') {
    db.prepare("UPDATE requests SET status='REJECTED',updated_at=? WHERE id=?").run(now(), request_id);
    if (req.kind === 'PAKD_PHASE') db.prepare("UPDATE pakd_phases SET status='REJECTED' WHERE id=?").run(p.phase_id);
    if (req.kind === 'SX_BUDGET') db.prepare("UPDATE sx_budgets SET status='REJECTED' WHERE id=?").run(p.sx_budget_id);
    if (req.kind === 'BUDGET_ADJ') db.prepare("UPDATE budget_adjust SET status='REJECTED' WHERE id=?").run(p.adj_id);
    log(req.opportunity_id, actor.id, branch, 'REQUEST_REJECT', `Từ chối #${request_id}`);
    return { status: 'REJECTED' };
  }
  db.prepare("UPDATE requests SET status='APPROVED',updated_at=? WHERE id=?").run(now(), request_id);
  applyApproved(req, p, actor, branch);
  return { status: 'APPROVED' };
}

function applyApproved(req, p, actor, branch) {
  if (req.kind === 'OPEN_CODE') applyOpenCode(req, p, actor, branch);
  else if (req.kind === 'CLOSE_CODE') applyCloseCode(req, p, actor, branch);
  else if (req.kind === 'PAKD_PHASE') {
    db.prepare("UPDATE pakd_phases SET status='APPROVED' WHERE id=?").run(p.phase_id);
    log(req.opportunity_id, actor.id, branch, 'PAKD_APPROVE', `Duyệt PAKD ${branch === 'SX' ? 'Sản xuất' : 'Kinh doanh'} ${p.label} → cộng vào tổng`);
  } else if (req.kind === 'SX_BUDGET') {
    db.prepare("UPDATE sx_budgets SET status='APPROVED' WHERE id=?").run(p.sx_budget_id);
    log(req.opportunity_id, actor.id, 'SX', 'SX_BUDGET_APPROVE', `Duyệt phân bổ ngân sách Sản xuất`);
  } else if (req.kind === 'BUDGET_ADJ') {
    db.prepare("UPDATE budget_adjust SET status='APPROVED' WHERE id=?").run(p.adj_id);
    log(req.opportunity_id, actor.id, branch, 'BUDGET_ADJ_APPROVE', `Duyệt điều chỉnh ngân sách (${p.kind})`);
  }
}

function applyOpenCode(req, p, actor, branch) {
  const opp = db.prepare('SELECT o.*, c.code customer_code FROM opportunities o JOIN customers c ON c.id=o.customer_id WHERE o.id=?').get(req.opportunity_id);
  let code, parent_id = null;
  if (p.code_type === 'TONG') {
    code = genTongCode(opp.customer_code);
    db.prepare("UPDATE opportunities SET status='OPEN' WHERE id=?").run(opp.id);
  } else {
    const parent = db.prepare('SELECT * FROM codes WHERE id=?').get(p.parent_id);
    if (!parent) throw new Error('Không tìm thấy mã cha');
    if ((p.code_type === 'SALE' || p.code_type === 'SX') && parent.type !== 'TONG') throw new Error('Mã Sale/Sản xuất phải là con của mã Tổng');
    if (p.code_type === 'OUTSOURCE' && parent.type !== 'SX') throw new Error('Mã Outsource phải là con của mã Sản xuất');
    code = childCode(parent, p.code_type); parent_id = parent.id;
  }
  db.prepare(`INSERT INTO codes(opportunity_id,code,type,parent_id,purpose,status,created_at) VALUES(?,?,?,?,?,'ACTIVE',?)`)
    .run(req.opportunity_id, code, p.code_type, parent_id, p.purpose || '', now());
  log(req.opportunity_id, actor.id, branch, 'CODE_OPEN', `Mở mã ${p.code_type}: ${code}`);

  if (p.code_type === 'TONG') {
    const tong = db.prepare("SELECT * FROM codes WHERE opportunity_id=? AND type='TONG'").get(opp.id);
    if (opp.want_sale) createRequest({ opportunity_id: opp.id, kind: 'OPEN_CODE', title: 'Mở mã Kinh doanh',
      payload: { code_type: 'SALE', parent_id: tong.id, purpose: 'Pipeline/Sales' }, requested_by: req.requested_by, branch: 'SALES' });
    if (opp.want_sx) createRequest({ opportunity_id: opp.id, kind: 'OPEN_CODE', title: 'Mở mã Sản xuất',
      payload: { code_type: 'SX', parent_id: tong.id, purpose: 'Sản xuất/Triển khai', branch: 'SX' }, requested_by: req.requested_by, branch: 'SX' });
  }
}

function assertClosable(c) {
  const open = db.prepare("SELECT COUNT(*) c FROM codes WHERE parent_id=? AND status!='CLOSED'").get(c.id).c;
  if (open > 0) throw new Error(`Không thể đóng ${c.code}: còn ${open} mã con chưa đóng`);
  if (c.type === 'TONG') {
    const sib = db.prepare("SELECT COUNT(*) c FROM codes WHERE opportunity_id=? AND type!='TONG' AND status!='CLOSED'").get(c.opportunity_id).c;
    if (sib > 0) throw new Error('Mã Tổng chỉ đóng sau cùng');
  }
}
function applyCloseCode(req, p, actor, branch) {
  const c = db.prepare('SELECT * FROM codes WHERE id=?').get(p.code_id);
  if (!c) throw new Error('Không tìm thấy mã');
  assertClosable(c);
  db.prepare("UPDATE codes SET status='CLOSED',closed_at=? WHERE id=?").run(now(), c.id);
  log(req.opportunity_id, actor.id, branch, 'CODE_CLOSE', `Đóng mã ${c.type}: ${c.code}`);
  if (c.type === 'TONG') db.prepare("UPDATE opportunities SET status='CLOSED' WHERE id=?").run(req.opportunity_id);
}

// =====================================================================
// PAKD: tính tiền từ % theo công thức biểu mẫu BM_PAKD_GĐ1
// net = HĐ - R&D ; các CP = net * % ; CP sản xuất (dòng 4) = net*(dev+reserve+bonus+warranty)
//       CP kinh doanh (dòng 5) = net*(sal+external+travel+contingency+sales_bonus)
//       LNTT = net - CP_SX - CP_KD - audit - finance - overhead
// =====================================================================
function computeSalesPhase(p) {
  const cv = p.contract_value || 0;
  const rd = cv * (p.pct_rd || 0);
  const net = cv - rd;
  const sx = net * ((p.pct_dev || 0) + (p.pct_reserve || 0) + (p.pct_bonus || 0) + (p.pct_warranty || 0));
  const kd = net * ((p.pct_sal || 0) + (p.pct_external || 0) + (p.pct_travel || 0) + (p.pct_contingency || 0) + (p.pct_sales_bonus || 0));
  const audit = net * (p.pct_audit || 0);
  const finance = net * (p.pct_finance || 0);
  const overhead = net * (p.pct_overhead || 0);
  const lntt = net - sx - kd - audit - finance - overhead;
  return { cv, rd, net,
    dev: net * (p.pct_dev || 0), reserve: net * (p.pct_reserve || 0), bonus: net * (p.pct_bonus || 0), warranty: net * (p.pct_warranty || 0), sx,
    sal: net * (p.pct_sal || 0), external: net * (p.pct_external || 0), travel: net * (p.pct_travel || 0), contingency: net * (p.pct_contingency || 0), sales_bonus: net * (p.pct_sales_bonus || 0), kd,
    audit, finance, overhead, lntt, margin: cv > 0 ? lntt / cv : 0 };
}

function rollupSales(opportunity_id) {
  const rows = db.prepare("SELECT * FROM pakd_phases WHERE opportunity_id=? AND branch='SALES' ORDER BY mvp_no").all(opportunity_id);
  const phases = rows.map(p => ({ ...p, calc: computeSalesPhase(p) }));
  const appr = phases.filter(p => p.status === 'APPROVED');
  const sum = f => appr.reduce((a, p) => a + p.calc[f], 0);
  const total = { cv: sum('cv'), rd: sum('rd'), net: sum('net'), sx: sum('sx'), kd: sum('kd'),
    audit: sum('audit'), finance: sum('finance'), overhead: sum('overhead'), lntt: sum('lntt') };
  total.margin = total.cv > 0 ? total.lntt / total.cv : 0;
  return { phases, total };
}

function computeSxBudget(b) {
  const c = b.ceiling || 0;
  return { dev: c * (b.pct_dev || 0), reserve: c * (b.pct_reserve || 0), bonus: c * (b.pct_bonus || 0),
    warranty: c * (b.pct_warranty || 0), outsource: c * (b.pct_outsource || 0),
    total: c * ((b.pct_dev || 0) + (b.pct_reserve || 0) + (b.pct_bonus || 0) + (b.pct_warranty || 0) + (b.pct_outsource || 0)) };
}
function listSxBudgets(opportunity_id) {
  const rows = db.prepare('SELECT * FROM sx_budgets WHERE opportunity_id=? ORDER BY id').all(opportunity_id);
  return rows.map(b => ({ ...b, calc: computeSxBudget(b) }));
}

module.exports = { now, log, createRequest, actOnRequest, stepRole, lastStep,
  genTongCode, computeSalesPhase, rollupSales, computeSxBudget, listSxBudgets };
