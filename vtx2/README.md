# IMIS Portal — Hệ thống Quản lý Mã dự án (PQA)

## Chạy
```bash
npm install
npm start          # node --experimental-sqlite server.js → http://localhost:3000
```
Node.js >= 22. DB tự reset mới mỗi lần khởi động.

## Tài khoản demo (mật khẩu: 123456)
ae (Trịnh Văn A) · sales (Trịnh Văn Doanh) · sanxuat (Trịnh Văn Xuất) ·
khoi (Trịnh Văn Khối) · ceo (CT/CEO) · ketoan (Lê Thị Toán)

## Phân quyền
- **Phê duyệt**: CHỈ Giám đốc Khối duyệt cả 3 loại mã + PAKD + ngân sách (1 bước).
- **CT/CEO, Kế toán**: chỉ xem tình trạng & chi tiết mã (không thao tác).
- **Tạo mã**: AE/GĐ Sales/GĐ Khối tạo Tổng/KD/SX; GĐ Sản xuất chỉ tạo SX + Outsource.
- **PAKD Kinh doanh**: AE/GĐ Sales/GĐ Khối lập. Chỉ Giá trị HĐ nhập số, còn lại nhập %,
  tiền tự tính (đúng định mức biểu mẫu BM_PAKD_GĐ1). Dòng 4 "Chi phí sản xuất được cấp phát"
  là trần ngân sách Sản xuất.
- **Ngân sách Sản xuất**: GĐ Sản xuất lập, phân bổ chi tiết trần dòng-4 đã duyệt theo % (tổng ≤ 100%).
- AE/Sales không xem giá trị Sản xuất; GĐ Sản xuất không xem giá trị Kinh doanh.

## Màn hình
- **Mở cơ hội** (mẫu BM_YC_MO_MA): combo box khách hàng + tạo mới (tự thêm vào dropdown),
  upload nhiều file căn cứ BOD (xem chi tiết tải về được), checkbox mở luôn mã KD/SX.
- **Chi tiết** (chỉ mở khi mã Tổng đã duyệt): thông tin + file, Yêu cầu của cơ hội (gồm bảng
  yêu cầu ngân sách), PAKD 2 tab Kinh doanh / Sản xuất — mỗi MVP 1 cột + cột Tổng cộng dồn.
- **Lập PAKD**: nhập % realtime, hiển thị thành tiền + Net + LNTT + biên LN.
- **Ngân sách Sản xuất**: chọn MVP đã duyệt → lấy trần → nhập % phân bổ.
- **Yêu cầu ngân sách**: cấp phát / điều chỉnh NS Kinh doanh / điều chỉnh NS Sản xuất
  (mẫu BM_DC_NS_SALES / BM_DC_NS_SANXUAT) — bảng so sánh trước/sau.
- **Nhật ký**: 2 tab Kinh doanh / Sản xuất với quyền xem riêng (AE ẩn tab Sản xuất).
- Tiền hiển thị `1,000,000.00 VNĐ`.
