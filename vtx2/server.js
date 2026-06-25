'use strict';
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, ROLES } = require('./db');
const L = require('./logic');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 20 * 1024 * 1024 } });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'vtx-pqa', resave: false, saveUninitialized: false, cookie: { maxAge: 8 * 3600e3 } }));

const cur = req => req.session.uid ? db.prepare('SELECT id,username,full_name,role,block FROM users WHERE id=?').get(req.session.uid) : null;
const auth = (req, res, next) => { const u = cur(req); if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' }); req.user = u; next(); };
const role = (...rs) => (req, res, next) => rs.includes(req.user.role) ? next() : res.status(403).json({ error: 'Không đủ quyền' });

function visibleOpps(u) {
  const base = `SELECT o.*, c.code customer_code, c.name customer_name, uu.full_name ae_name
    FROM opportunities o JOIN customers c ON c.id=o.customer_id JOIN users uu ON uu.id=o.ae_id`;
  if (['GDKHOI', 'CTCEO', 'KETOAN', 'GDSX'].includes(u.role)) return db.prepare(base + ' ORDER BY o.id DESC').all();
  return db.prepare(base + ' WHERE o.block=? ORDER BY o.id DESC').all(u.block);
}

// ---- AUTH ----
app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.body.username);
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  req.session.uid = u.id;
  res.json({ id: u.id, full_name: u.full_name, role: u.role, block: u.block, role_label: ROLES[u.role] });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => { const u = cur(req); u ? res.json({ ...u, role_label: ROLES[u.role] }) : res.status(401).json({ error: 'Chưa đăng nhập' }); });

// ---- CUSTOMERS ----
app.get('/api/customers', auth, (req, res) => res.json(db.prepare('SELECT * FROM customers ORDER BY name').all()));
app.post('/api/customers', auth, role('AE', 'GDSALES', 'GDKHOI'), (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Thiếu mã/tên khách hàng' });
  const r = db.prepare('INSERT INTO customers(code,name) VALUES(?,?)').run(code.trim(), name.trim());
  res.json({ id: r.lastInsertRowid, code: code.trim(), name: name.trim() });
});

// ---- OPPORTUNITIES ----
app.get('/api/opportunities', auth, (req, res) => {
  res.json(visibleOpps(req.user).map(o => ({ ...o, codes: db.prepare('SELECT * FROM codes WHERE opportunity_id=? ORDER BY id').all(o.id) })));
});

app.get('/api/opportunities/:id', auth, (req, res) => {
  const o = db.prepare(`SELECT o.*, c.code customer_code, c.name customer_name, uu.full_name ae_name
    FROM opportunities o JOIN customers c ON c.id=o.customer_id JOIN users uu ON uu.id=o.ae_id WHERE o.id=?`).get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy' });
  const codes = db.prepare('SELECT * FROM codes WHERE opportunity_id=? ORDER BY id').all(o.id);
  const tong = codes.find(c => c.type === 'TONG');
  const tong_active = tong && tong.status === 'ACTIVE';
  const reqs = db.prepare('SELECT * FROM requests WHERE opportunity_id=? ORDER BY id DESC').all(o.id).map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  const atts = db.prepare('SELECT id,orig_name,size FROM attachments WHERE opportunity_id=?').all(o.id);
  const seeSales = req.user.role !== 'GDSX';
  const seeSx = req.user.role !== 'AE' && req.user.role !== 'GDSALES';
  const out = { ...o, codes, tong_active, requests: reqs, attachments: atts, perms: { seeSales, seeSx } };
  if (seeSales) out.pakd_sales = L.rollupSales(o.id);
  if (seeSx) out.sx_budgets = L.listSxBudgets(o.id).map(b => {
    const sp = db.prepare('SELECT label FROM pakd_phases WHERE id=?').get(b.sales_phase_id);
    return { ...b, _label: sp ? 'NS ' + sp.label : 'NS#' + b.id };
  });
  out.budget_adjusts = db.prepare('SELECT * FROM budget_adjust WHERE opportunity_id=? ORDER BY id DESC').all(o.id).map(b => ({ ...b, items: JSON.parse(b.items) }));
  res.json(out);
});

app.post('/api/opportunities', auth, role('AE', 'GDSALES', 'GDKHOI'), upload.array('files', 10), (req, res) => {
  try {
    const { name, customer_id, bod_basis, want_sale, want_sx, purpose } = req.body;
    if (!name || !customer_id) return res.status(400).json({ error: 'Thiếu tên dự án / khách hàng' });
    const tv = v => v === 'true' || v === '1' || v === 1 || v === true;
    const r = db.prepare(`INSERT INTO opportunities(name,customer_id,block,ae_id,bod_basis,status,want_sale,want_sx,created_at)
      VALUES(?,?,?,?,?,'DRAFT',?,?,?)`).run(name, Number(customer_id), req.user.block || 'Khối A', req.user.id, bod_basis || '', tv(want_sale) ? 1 : 0, tv(want_sx) ? 1 : 0, L.now());
    const oid = r.lastInsertRowid;
    (req.files || []).forEach(f => db.prepare('INSERT INTO attachments(opportunity_id,orig_name,stored_name,size,uploaded_at) VALUES(?,?,?,?,?)')
      .run(oid, Buffer.from(f.originalname, 'latin1').toString('utf8'), f.filename, f.size, L.now()));
    L.log(oid, req.user.id, 'SALES', 'OPP_CREATE', `Tạo cơ hội: ${name}`);
    const reqId = L.createRequest({ opportunity_id: oid, kind: 'OPEN_CODE', title: `Mở mã Tổng — ${name}`, payload: { code_type: 'TONG', purpose: purpose || 'Mã gom dự án' }, requested_by: req.user.id });
    res.json({ opportunity_id: oid, request_id: reqId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/attachments/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).end();
  res.download(path.join(UPLOAD_DIR, a.stored_name), a.orig_name);
});

// ---- REQUESTS (mở/đóng mã) ----
app.post('/api/requests', auth, (req, res) => {
  try {
    const { opportunity_id, kind, payload } = req.body;
    if (!db.prepare('SELECT 1 FROM opportunities WHERE id=?').get(opportunity_id)) return res.status(404).json({ error: 'Cơ hội không tồn tại' });
    let title = '';
    if (kind === 'OPEN_CODE') {
      const t = payload.code_type;
      if (req.user.role === 'GDSX') { if (!['SX', 'OUTSOURCE'].includes(t)) return res.status(403).json({ error: 'GĐ Sản xuất chỉ tạo mã Sản xuất/Outsource' }); }
      else if (!['AE', 'GDSALES', 'GDKHOI'].includes(req.user.role)) return res.status(403).json({ error: 'Vai trò này không tạo được mã' });
      title = `Mở mã ${t}`;
      if (['SX', 'OUTSOURCE'].includes(t)) payload.branch = 'SX';
    } else if (kind === 'CLOSE_CODE') {
      const c = db.prepare('SELECT * FROM codes WHERE id=?').get(payload.code_id);
      title = `Đóng mã ${c ? c.type + ' ' + c.code : ''}`;
      if (c && (c.type === 'SX' || c.type === 'OUTSOURCE')) payload.branch = 'SX';
    } else return res.status(400).json({ error: 'kind không hợp lệ' });
    const id = L.createRequest({ opportunity_id, kind, title, payload, requested_by: req.user.id, branch: payload.branch || 'SALES' });
    res.json({ request_id: id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/requests/inbox', auth, role('GDKHOI'), (req, res) => {
  const pend = db.prepare("SELECT * FROM requests WHERE status='PENDING' ORDER BY id").all();
  const out = pend.map(r => {
    const opp = db.prepare('SELECT name,block FROM opportunities WHERE id=?').get(r.opportunity_id);
    const by = db.prepare('SELECT full_name FROM users WHERE id=?').get(r.requested_by);
    return { ...r, payload: JSON.parse(r.payload), opp, requester: by?.full_name, last_step: 1 };
  });
  res.json(out);
});
app.post('/api/requests/:id/act', auth, role('GDKHOI'), (req, res) => {
  try { res.json(L.actOnRequest(Number(req.params.id), req.user, req.body.decision, req.body.comment)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- PAKD (branch SALES: AE/Sales/Khối ; branch SX bỏ — SX qua sx_budgets) ----
app.post('/api/pakd/:oppId', auth, role('AE', 'GDSALES', 'GDKHOI'), (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM opportunities WHERE id=?').get(req.params.oppId);
    if (!o) return res.status(404).json({ error: 'Không tìm thấy cơ hội' });
    const tong = db.prepare("SELECT * FROM codes WHERE opportunity_id=? AND type='TONG'").get(o.id);
    if (!tong || tong.status !== 'ACTIVE') return res.status(400).json({ error: 'Chỉ tạo PAKD khi mã Tổng đã được phê duyệt' });
    const b = req.body, n = v => { const x = Number(v); return isNaN(x) ? 0 : x; };
    const mvp_no = db.prepare("SELECT COALESCE(MAX(mvp_no),0) m FROM pakd_phases WHERE opportunity_id=? AND branch='SALES'").get(o.id).m + 1;
    const label = b.label || `MVP${mvp_no}`;
    const r = db.prepare(`INSERT INTO pakd_phases(opportunity_id,branch,mvp_no,label,status,contract_value,
      pct_rd,pct_dev,pct_reserve,pct_bonus,pct_warranty,pct_sal,pct_external,pct_travel,pct_contingency,pct_sales_bonus,pct_audit,pct_finance,pct_overhead,created_by,created_at)
      VALUES(?,?,?,?,'PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      o.id, 'SALES', mvp_no, label, n(b.contract_value),
      n(b.pct_rd), n(b.pct_dev), n(b.pct_reserve), n(b.pct_bonus), n(b.pct_warranty),
      n(b.pct_sal), n(b.pct_external), n(b.pct_travel), n(b.pct_contingency), n(b.pct_sales_bonus),
      n(b.pct_audit), n(b.pct_finance), n(b.pct_overhead), req.user.id, L.now());
    const phase_id = r.lastInsertRowid;
    L.log(o.id, req.user.id, 'SALES', 'PAKD_CREATE', `Lập PAKD Kinh doanh ${label} (chờ GĐ Khối duyệt)`);
    L.createRequest({ opportunity_id: o.id, kind: 'PAKD_PHASE', title: `Duyệt PAKD ${label}`, payload: { phase_id, label, branch: 'SALES' }, requested_by: req.user.id, branch: 'SALES' });
    res.json({ ok: true, phase_id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- NGÂN SÁCH SẢN XUẤT (GĐ SX tạo; phân bổ chi tiết trần dòng-4 đã duyệt) ----
app.get('/api/sx/:oppId/approved-phases', auth, role('GDSX', 'GDKHOI'), (req, res) => {
  // trả các MVP Sales đã duyệt + trần CP sản xuất (dòng 4) để GĐ SX chọn phân bổ
  const phases = db.prepare("SELECT * FROM pakd_phases WHERE opportunity_id=? AND branch='SALES' AND status='APPROVED' ORDER BY mvp_no").all(req.params.oppId);
  res.json(phases.map(p => { const c = L.computeSalesPhase(p); return { id: p.id, label: p.label, ceiling: c.sx }; }));
});
app.post('/api/sx/:oppId', auth, role('GDSX', 'GDKHOI'), (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM opportunities WHERE id=?').get(req.params.oppId);
    if (!o) return res.status(404).json({ error: 'Không tìm thấy' });
    const sp = db.prepare("SELECT * FROM pakd_phases WHERE id=? AND branch='SALES' AND status='APPROVED'").get(req.body.sales_phase_id);
    if (!sp) return res.status(400).json({ error: 'MVP Sales chưa được duyệt — chưa có trần ngân sách SX' });
    const ceiling = L.computeSalesPhase(sp).sx;
    const b = req.body, n = v => { const x = Number(v); return isNaN(x) ? 0 : x; };
    const pcts = [n(b.pct_dev), n(b.pct_reserve), n(b.pct_bonus), n(b.pct_warranty), n(b.pct_outsource)];
    const sumPct = pcts.reduce((a, x) => a + x, 0);
    if (sumPct > 1.0001) return res.status(400).json({ error: `Tổng % phân bổ (${(sumPct * 100).toFixed(1)}%) vượt 100% trần ngân sách SX` });
    const r = db.prepare(`INSERT INTO sx_budgets(opportunity_id,sales_phase_id,ceiling,pct_dev,pct_reserve,pct_bonus,pct_warranty,pct_outsource,status,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,'PENDING',?,?)`).run(o.id, sp.id, ceiling, ...pcts, req.user.id, L.now());
    const sx_budget_id = r.lastInsertRowid;
    L.log(o.id, req.user.id, 'SX', 'SX_BUDGET_CREATE', `Phân bổ ngân sách Sản xuất cho ${sp.label} (trần ${ceiling.toLocaleString('en-US')} VNĐ)`);
    L.createRequest({ opportunity_id: o.id, kind: 'SX_BUDGET', title: `Duyệt phân bổ NS Sản xuất ${sp.label}`, payload: { sx_budget_id, branch: 'SX' }, requested_by: req.user.id, branch: 'SX' });
    res.json({ ok: true, sx_budget_id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- ĐIỀU CHỈNH / CẤP PHÁT NGÂN SÁCH ----
// kind: ALLOC (yêu cầu cấp phát) | ADJ_SALES | ADJ_SX
app.post('/api/budget-adjust/:oppId', auth, (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM opportunities WHERE id=?').get(req.params.oppId);
    if (!o) return res.status(404).json({ error: 'Không tìm thấy' });
    const { kind, phase_label, reason, impact_schedule, impact_profit, source_cover, items } = req.body;
    if (kind === 'ADJ_SX' || (kind === 'ALLOC' && req.body.scope === 'SX')) {
      if (!['GDSX', 'GDKHOI'].includes(req.user.role)) return res.status(403).json({ error: 'Chỉ GĐ Sản xuất/GĐ Khối' });
    } else {
      if (!['AE', 'GDSALES', 'GDKHOI'].includes(req.user.role)) return res.status(403).json({ error: 'Chỉ AE/GĐ Sales/GĐ Khối' });
    }
    const branch = (kind === 'ADJ_SX' || req.body.scope === 'SX') ? 'SX' : 'SALES';
    const r = db.prepare(`INSERT INTO budget_adjust(opportunity_id,kind,phase_label,reason,impact_schedule,impact_profit,source_cover,items,status,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,'PENDING',?,?)`).run(o.id, kind, phase_label || '', reason || '', impact_schedule || '', impact_profit || '', source_cover || '', JSON.stringify(items || []), req.user.id, L.now());
    const adj_id = r.lastInsertRowid;
    const label = { ALLOC: 'Yêu cầu cấp phát ngân sách', ADJ_SALES: 'Điều chỉnh NS Kinh doanh', ADJ_SX: 'Điều chỉnh NS Sản xuất' }[kind] || kind;
    L.log(o.id, req.user.id, branch, 'BUDGET_ADJ_CREATE', `${label} (${phase_label || ''})`);
    L.createRequest({ opportunity_id: o.id, kind: 'BUDGET_ADJ', title: label, payload: { adj_id, kind, branch }, requested_by: req.user.id, branch });
    res.json({ ok: true, adj_id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- AUDIT ----
app.get('/api/audit', auth, (req, res) => {
  const branch = req.query.branch === 'SX' ? 'SX' : 'SALES';
  if (branch === 'SX' && req.user.role === 'AE') return res.status(403).json({ error: 'AE không xem nhật ký Sản xuất' });
  const rows = db.prepare(`SELECT a.*, u.full_name actor, o.name opp_name, o.block, o.ae_id
    FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN opportunities o ON o.id=a.opportunity_id
    WHERE a.branch=? ORDER BY a.id DESC LIMIT 500`).all(branch);
  let filtered = rows;
  if (branch === 'SALES') {
    if (['GDKHOI', 'CTCEO', 'KETOAN'].includes(req.user.role)) filtered = rows;
    else filtered = rows.filter(r => !r.block || r.block === req.user.block);
    if (req.user.role === 'AE') filtered = filtered.filter(r => r.ae_id === req.user.id);
  }
  res.json(filtered);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VTX PQA chạy http://localhost:${PORT}`));
