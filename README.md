# Cloudflare URL Shortener 🚀

Một ứng dụng rút gọn liên kết (URL Shortener) hiện đại, tối giản và hiệu năng cao chạy hoàn toàn trên hạ tầng **Cloudflare Workers / Pages** kết hợp với **Cloudflare KV (Key-Value) Storage**.

## ✨ Tính năng nổi bật

- **Giao diện Hiện đại & Responsive:** Hỗ trợ giao diện sáng/tối (Dark Mode) tự động, thiết kế tối giản, trực quan.
- **Rút gọn nhanh chóng:** Tự động tạo slug ngẫu nhiên (6 ký tự) hoặc tự chọn slug tùy chỉnh (Custom Slug).
- **Tính năng Ghi đè:** Hỗ trợ ghi đè (Overwrite) lên các slug cũ đã tồn tại nếu người dùng xác nhận.
- **Tạo mã QR Code:** Tự động tạo mã QR tương ứng với liên kết đã rút gọn để quét nhanh bằng điện thoại.
- **Lịch sử hoạt động:** Lưu trữ danh sách 6 link rút gọn gần nhất ngay trên trình duyệt (Local Storage) để người dùng tiện quản lý và copy lại.
- **Zero Cost & Serverless:** Chạy hoàn toàn trên hạ tầng Serverless miễn phí của Cloudflare, tốc độ tải cực nhanh và chịu tải lớn.

---

## 🛠️ Yêu cầu hệ thống

Trước khi bắt đầu, bạn cần chuẩn bị:
1. Tài khoản [Cloudflare](https://dash.cloudflare.com/) (Miễn phí).
2. [Node.js](https://nodejs.org/) đã cài đặt trên máy tính (nếu muốn chạy thử ở local).

---

## 🚀 Hướng dẫn Deploy (Triển khai)

Bạn có thể triển khai dự án này theo hai cách: **Cloudflare Workers** hoặc **Cloudflare Pages**.

### Cách 1: Deploy dưới dạng Cloudflare Workers (Khuyên dùng)

Đây là cách nhanh nhất và tự động cấu hình bindings qua file `wrangler.toml`.

#### **Bước 1: Clone dự án**
```bash
git clone <url-github-cua-ban>
cd ShortenerCloudflare
```

#### **Bước 2: Tạo KV Namespace trên Cloudflare**
Chạy lệnh sau để tạo một cơ sở dữ liệu KV mới trên tài khoản Cloudflare của bạn:
```bash
npx wrangler kv:namespace create SHORTENER_KV
```
*Sau khi chạy, lệnh này sẽ trả về một đoạn mã cấu hình dạng:*
```toml
[[kv_namespaces]]
binding = "SHORTENER_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

#### **Bước 3: Cấu hình `wrangler.toml`**
Mở file `wrangler.toml` ở thư mục gốc và cập nhật ID của KV bạn vừa tạo ở Bước 2:
```toml
name = "shortener-cloudflare"
main = "_worker.js"
compatibility_date = "2025-07-13"

[[kv_namespaces]]
binding = "SHORTENER_KV"
id = "điền-id-kv-vừa-tạo-vào-đây"
```

#### **Bước 4: Deploy lên Cloudflare**
Đăng nhập vào Cloudflare (nếu chưa) và thực hiện deploy:
```bash
npx wrangler deploy
```
Sau khi hoàn tất, terminal sẽ hiển thị địa chỉ truy cập (ví dụ: `https://shortener-cloudflare.<subdomain>.workers.dev`).

---

### Cách 2: Deploy dưới dạng Cloudflare Pages

Nếu bạn muốn deploy trực tiếp từ kho lưu trữ GitHub và tự động cập nhật khi push code mới.

#### **Bước 1: Đẩy code lên GitHub**
Tạo một repository trên GitHub và push toàn bộ mã nguồn của bạn lên đó.

#### **Bước 2: Tạo dự án Cloudflare Pages**
1. Truy cập Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
2. Chọn repo bạn vừa push lên.
3. Trong phần **Build settings**:
   - **Framework preset**: Chọn `None`.
   - **Build command**: (Để trống).
   - **Build output directory**: Điền `./` hoặc (Để trống).
4. Nhấn **Save and Deploy**.

#### **Bước 3: Tạo và Bind KV Namespace**
1. Vào Dashboard Cloudflare -> **Workers & Pages** -> **KV** -> **Create a namespace**, đặt tên là `SHORTENER_KV`.
2. Trở lại dự án Pages vừa tạo -> **Settings** -> **Functions**.
3. Cuộn xuống phần **KV namespace bindings** -> Chọn **Add binding**:
   - **Variable name**: Điền chính xác là `SHORTENER_KV`.
   - **KV namespace**: Chọn KV namespace bạn vừa tạo ở trên.
   - *Lưu ý:* Hãy cấu hình binding này ở cả 2 phần **Production** và **Preview**.
4. Vào tab **Deployments**, bấm vào dấu ba chấm bên cạnh bản deploy gần nhất và chọn **Retry deployment** để áp dụng cấu hình KV mới.

---

## 💻 Chạy thử ở môi trường Local (Development)

Bạn có thể chạy thử và phát triển ứng dụng ngay trên máy tính của mình bằng Wrangler:

```bash
# Chạy dev server giả lập KV ở máy local
npx wrangler dev
```

Nếu muốn chạy thử local kết nối trực tiếp với database KV thật trên Cloudflare Cloud:
```bash
npx wrangler dev --remote
```

---

## 📂 Cấu trúc thư mục dự án

```text
├── .wrangler/          # Thư mục tạm của Wrangler
├── _worker.js          # File code chính xử lý routing, API và Redirect
├── wrangler.toml       # File cấu hình của Cloudflare Workers
├── index.html          # File giao diện HTML chính (dùng để phát triển frontend)
└── README.md           # Hướng dẫn sử dụng dự án
```

## 📄 Giấy phép

Dự án này được phân phối dưới giấy phép MIT. Bạn được tự do sao chép, chỉnh sửa và chia sẻ cho mục đích cá nhân hoặc thương mại.
