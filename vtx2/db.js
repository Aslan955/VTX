'use strict';
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vtx.db');
try { fs.unlinkSync(DB_PATH); } catch (e) {} // reset DB mới mỗi lần chạy

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const ROLES = {
  AE: 'Account Executive (AE)', GDSALES: 'Giám đốc Sales', GDSX: 'Giám đốc Sản xuất',
  GDKHOI: 'Giám đốc Khối', CTCEO: 'CT / CEO', KETOAN: 'Kế toán',
};

db.exec(`
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL, block TEXT);
CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE opportunities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, customer_id INTEGER NOT NULL,
  block TEXT NOT NULL, ae_id INTEGER NOT NULL, bod_basis TEXT, status TEXT NOT NULL DEFAULT 'DRAFT',
  want_sale INTEGER DEFAULT 0, want_sx INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL,
  orig_name TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER, uploaded_at TEXT NOT NULL);
CREATE TABLE codes (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL, code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, parent_id INTEGER, purpose TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL, closed_at TEXT);
CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, payload TEXT NOT NULL, requested_by INTEGER NOT NULL, step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, step INTEGER NOT NULL,
  actor_id INTEGER NOT NULL, decision TEXT NOT NULL, comment TEXT, created_at TEXT NOT NULL);
CREATE TABLE pakd_phases (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL,
  branch TEXT NOT NULL, mvp_no INTEGER NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  contract_value REAL DEFAULT 0,
  pct_rd REAL DEFAULT 0,
  pct_dev REAL DEFAULT 0, pct_reserve REAL DEFAULT 0, pct_bonus REAL DEFAULT 0, pct_warranty REAL DEFAULT 0,
  pct_sal REAL DEFAULT 0, pct_external REAL DEFAULT 0, pct_travel REAL DEFAULT 0, pct_contingency REAL DEFAULT 0, pct_sales_bonus REAL DEFAULT 0,
  pct_audit REAL DEFAULT 0, pct_finance REAL DEFAULT 0, pct_overhead REAL DEFAULT 0,
  created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE sx_budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL,
  sales_phase_id INTEGER NOT NULL, ceiling REAL NOT NULL,
  pct_dev REAL DEFAULT 0, pct_reserve REAL DEFAULT 0, pct_bonus REAL DEFAULT 0, pct_warranty REAL DEFAULT 0, pct_outsource REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING', created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE budget_adjust (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL,
  kind TEXT NOT NULL, phase_label TEXT, reason TEXT, impact_schedule TEXT, impact_profit TEXT, source_cover TEXT,
  items TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER, actor_id INTEGER,
  branch TEXT NOT NULL DEFAULT 'SALES', change_type TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
`);

const pw = bcrypt.hashSync('123456', 8);
const insU = db.prepare('INSERT INTO users(username,password_hash,full_name,role,block) VALUES(?,?,?,?,?)');
[['ae','Trịnh Văn A','AE','Khối A'],['sales','Trịnh Văn Doanh','GDSALES','Khối A'],
 ['sanxuat','Trịnh Văn Xuất','GDSX','Khối A'],['khoi','Trịnh Văn Khối','GDKHOI','Khối A'],
 ['ceo','CT / CEO','CTCEO',null],['ketoan','Lê Thị Toán','KETOAN',null]]
  .forEach(([u,n,r,b]) => insU.run(u,pw,n,r,b));
const insC = db.prepare('INSERT INTO customers(code,name) VALUES(?,?)');
[['012','Sở TT&TT tỉnh Bắc Giang'],['002','UBND tỉnh Quảng Ninh'],['022','Bộ Tài chính']]
  .forEach(([c,n]) => insC.run(c,n));

module.exports = { db, ROLES };
