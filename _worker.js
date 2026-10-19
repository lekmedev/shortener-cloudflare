// shortener-cloudflare — Worker bản dashboard (phong cách autobrr)
// Tính năng:
//  - Public: rút gọn link + QR + history (localStorage) — giữ nguyên API cũ /api/shorten
//  - Admin: đăng nhập bằng ADMIN_PASSWORD (secret), xem TẤT CẢ link trong KV,
//           thống kê lượt click, ngày tạo, click cuối, sửa URL đích, xóa link
//  - Redirect: /<slug> → đích + đếm click (lưu metadata JSON trong KV)
//  - Tương thích ngược: KV value dạng chuỗi cũ (chỉ URL) vẫn redirect bình thường
// Deploy: wrangler deploy  (secret: npx wrangler secret put ADMIN_PASSWORD)

const HTML = `<!doctype html>
<html lang="vi" class="dark">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Shorten · Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <style>
            body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-thumb { background: #2a3040; border-radius: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
        </style>
    </head>
    <body class="bg-[#0a0c10] text-slate-200 min-h-screen">
        <div id="toast" class="fixed top-5 left-1/2 -translate-x-1/2 bg-[#141821] border border-[#242a36] px-4 py-2 rounded-full text-sm shadow-lg opacity-0 pointer-events-none transition z-50">
            <i id="toast-icon" class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>
            <span id="toast-msg"></span>
        </div>

        <div class="flex min-h-screen">
            <!-- SIDEBAR -->
            <aside class="w-60 shrink-0 border-r border-[#1c212c] bg-[#0d1017] flex flex-col max-md:hidden">
                <div class="px-5 py-5 flex items-center gap-2.5 border-b border-[#1c212c]">
                    <div class="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-[0_0_18px_rgba(16,185,129,0.35)]">
                        <i class="fa-solid fa-link"></i>
                    </div>
                    <div>
                        <div class="font-semibold leading-tight">Shorten</div>
                        <div class="text-[11px] text-slate-500">r.8biz.net</div>
                    </div>
                </div>
                <nav class="p-3 space-y-1 flex-1">
                    <button data-view="shorten" class="nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors">
                        <i class="fa-solid fa-scissors w-4 text-center"></i><span>Rút gọn link</span>
                    </button>
                    <button data-view="admin" class="nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors">
                        <i class="fa-solid fa-table-list w-4 text-center"></i><span>Quản lý link</span>
                    </button>
                    <button data-view="about" class="nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors">
                        <i class="fa-solid fa-circle-info w-4 text-center"></i><span>Giới thiệu</span>
                    </button>
                </nav>
                <div class="p-4 border-t border-[#1c212c] text-[11px] text-slate-600">
                    Cloudflare Workers + KV
                </div>
            </aside>

            <!-- MAIN -->
            <main class="flex-1 min-w-0">
                <!-- mobile top bar -->
                <div class="md:hidden flex items-center gap-2 px-4 py-3 border-b border-[#1c212c] bg-[#0d1017]">
                    <div class="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-sm"><i class="fa-solid fa-link"></i></div>
                    <span class="font-semibold text-sm">Shorten</span>
                    <div class="ml-auto flex gap-1">
                        <button data-view="shorten" class="nav-btn px-3 py-1.5 rounded-lg text-xs cursor-pointer">Rút gọn</button>
                        <button data-view="admin" class="nav-btn px-3 py-1.5 rounded-lg text-xs cursor-pointer">Quản lý</button>
                    </div>
                </div>

                <!-- ============ VIEW: SHORTEN ============ -->
                <section id="view-shorten" class="view p-6 md:p-10">
                    <div class="max-w-2xl mx-auto space-y-6">
                        <div>
                            <h1 class="text-xl font-semibold">Rút gọn link</h1>
                            <p class="text-sm text-slate-500 mt-1">Dán URL dài, nhận link ngắn gọn trên r.8biz.net.</p>
                        </div>

                        <div class="bg-[#10141d] border border-[#1f2530] rounded-xl p-5">
                            <form id="shorten-form" class="space-y-3">
                                <div>
                                    <label class="text-xs font-medium text-slate-400 block mb-1.5">URL dài</label>
                                    <input id="long-url" type="url" required placeholder="https://example.com/rất-dài..."
                                        class="w-full px-4 py-3 rounded-lg bg-[#0a0c10] border border-[#242a36] focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none text-sm placeholder:text-slate-600" />
                                </div>
                                <div>
                                    <label class="text-xs font-medium text-slate-400 block mb-1.5">Slug tùy chỉnh <span class="text-slate-600">(tùy chọn)</span></label>
                                    <input id="custom-slug" type="text" placeholder="vd: sale-2026"
                                        class="w-full px-4 py-3 rounded-lg bg-[#0a0c10] border border-[#242a36] focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none text-sm placeholder:text-slate-600" />
                                </div>
                                <button id="btn-submit" class="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex justify-center items-center gap-2 cursor-pointer transition-colors">
                                    <span id="btn-text">Tạo shortlink</span>
                                    <span id="btn-spinner" class="hidden"><i class="fa-solid fa-spinner animate-spin"></i></span>
                                </button>
                            </form>
                        </div>

                        <div id="result-card" class="hidden bg-[#10141d] border border-[#1f2530] rounded-xl p-5">
                            <div class="flex justify-between items-center mb-3">
                                <span class="text-emerald-500 text-xs font-semibold flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i> ĐÃ TẠO</span>
                                <button onclick="hideResult()" class="text-slate-500 hover:text-slate-300 cursor-pointer"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                            <input id="generated-url" readonly class="w-full px-3 py-3 rounded-lg bg-[#0a0c10] border border-[#242a36] text-emerald-400 font-medium text-sm text-center mb-3 focus:outline-none" />
                            <div class="grid grid-cols-2 gap-3">
                                <button onclick="copyGeneratedUrl()" class="py-2.5 rounded-lg bg-[#1a1f2b] hover:bg-[#222836] text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"><i class="fa-solid fa-copy"></i> Copy link</button>
                                <button onclick="toggleQR()" class="py-2.5 rounded-lg bg-[#1a1f2b] hover:bg-[#222836] text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"><i class="fa-solid fa-qrcode"></i> Mã QR</button>
                            </div>
                            <div id="qrcode-box" class="hidden mt-4 p-4 rounded-lg bg-white w-fit mx-auto flex justify-center"></div>
                        </div>

                        <div>
                            <div class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Gần đây (máy này)</div>
                            <div id="history-list" class="rounded-xl border border-[#1f2530] overflow-hidden bg-[#10141d] divide-y divide-[#1f2530]">
                                <div class="p-4 text-center text-sm text-slate-600">Chưa có link nào</div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ============ VIEW: ADMIN ============ -->
                <section id="view-admin" class="view hidden p-6 md:p-10">
                    <div class="max-w-5xl mx-auto space-y-6">
                        <div class="flex items-end justify-between flex-wrap gap-3">
                            <div>
                                <h1 class="text-xl font-semibold">Quản lý link</h1>
                                <p class="text-sm text-slate-500 mt-1">Toàn bộ shortlink trong hệ thống.</p>
                            </div>
                            <div id="admin-logout-wrap" class="hidden">
                                <button onclick="adminLogout()" class="text-xs text-slate-400 hover:text-red-400 cursor-pointer flex items-center gap-1.5"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</button>
                            </div>
                        </div>

                        <!-- LOGIN -->
                        <div id="admin-login" class="bg-[#10141d] border border-[#1f2530] rounded-xl p-6 max-w-sm mx-auto mt-10">
                            <div class="w-11 h-11 rounded-xl bg-[#1a1f2b] flex items-center justify-center text-emerald-500 mb-4"><i class="fa-solid fa-lock"></i></div>
                            <h2 class="font-semibold mb-1">Đăng nhập quản trị</h2>
                            <p class="text-xs text-slate-500 mb-4">Nhập mật khẩu admin để xem danh sách link.</p>
                            <form id="admin-login-form" class="space-y-3">
                                <input id="admin-pass" type="password" required placeholder="Mật khẩu admin..."
                                    class="w-full px-4 py-3 rounded-lg bg-[#0a0c10] border border-[#242a36] focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none text-sm placeholder:text-slate-600" />
                                <button class="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer transition-colors">Đăng nhập</button>
                            </form>
                        </div>

                        <!-- DASHBOARD -->
                        <div id="admin-dash" class="hidden space-y-4">
                            <div class="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                                <div class="bg-[#10141d] border border-[#1f2530] rounded-xl p-4">
                                    <div class="text-xs text-slate-500 mb-1">Tổng số link</div>
                                    <div id="stat-total" class="text-2xl font-semibold text-emerald-400">–</div>
                                </div>
                                <div class="bg-[#10141d] border border-[#1f2530] rounded-xl p-4">
                                    <div class="text-xs text-slate-500 mb-1">Tổng lượt click</div>
                                    <div id="stat-clicks" class="text-2xl font-semibold">–</div>
                                </div>
                                <div class="bg-[#10141d] border border-[#1f2530] rounded-xl p-4">
                                    <div class="text-xs text-slate-500 mb-1">Click 7 ngày gần đây</div>
                                    <div id="stat-recent" class="text-2xl font-semibold">–</div>
                                </div>
                            </div>

                            <div class="flex gap-2">
                                <input id="admin-search" placeholder="Tìm theo slug hoặc URL..." oninput="renderAdminTable()"
                                    class="flex-1 px-4 py-2.5 rounded-lg bg-[#0a0c10] border border-[#242a36] focus:border-emerald-600 outline-none text-sm placeholder:text-slate-600" />
                                <button onclick="loadLinks(true)" class="px-4 py-2.5 rounded-lg bg-[#1a1f2b] hover:bg-[#222836] text-sm cursor-pointer transition-colors"><i class="fa-solid fa-rotate-right"></i></button>
                                <button onclick="exportCsv()" class="px-4 py-2.5 rounded-lg bg-[#1a1f2b] hover:bg-[#222836] text-sm cursor-pointer transition-colors" title="Xuất CSV"><i class="fa-solid fa-file-csv"></i></button>
                            </div>

                            <div class="rounded-xl border border-[#1f2530] overflow-x-auto bg-[#10141d]">
                                <table class="w-full text-sm">
                                    <thead>
                                        <tr class="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-[#1f2530]">
                                            <th class="px-4 py-3 font-medium">Short link</th>
                                            <th class="px-4 py-3 font-medium">Đích đến</th>
                                            <th class="px-4 py-3 font-medium text-right">Click</th>
                                            <th class="px-4 py-3 font-medium">Tạo lúc</th>
                                            <th class="px-4 py-3 font-medium text-right">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody id="admin-tbody" class="divide-y divide-[#1f2530]">
                                        <tr><td colspan="5" class="px-4 py-8 text-center text-slate-600">Đang tải...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ============ VIEW: ABOUT ============ -->
                <section id="view-about" class="view hidden p-6 md:p-10">
                    <div class="max-w-2xl mx-auto space-y-4">
                        <h1 class="text-xl font-semibold">Giới thiệu</h1>
                        <div class="bg-[#10141d] border border-[#1f2530] rounded-xl p-5 text-sm text-slate-400 space-y-3 leading-relaxed">
                            <p><span class="text-slate-200 font-medium">Shorten</span> là dịch vụ rút gọn link chạy trên Cloudflare Workers + KV, domain <span class="text-emerald-400">r.8biz.net</span>.</p>
                            <p class="text-xs text-slate-500">• Link mặc định giữ hiệu lực 1 năm (tự gia hạn khi có click).<br/>• Mỗi link có slug riêng, hỗ trợ slug tùy chỉnh.<br/>• Quản trị viên đăng nhập để xem, sửa, xóa và theo dõi lượt click.</p>
                        </div>
                    </div>
                </section>
            </main>
        </div>

        <!-- QR MODAL (admin) -->
        <div id="qr-modal" class="hidden fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onclick="if(event.target===this)this.classList.add('hidden')">
            <div class="bg-[#10141d] border border-[#1f2530] rounded-xl p-5 text-center">
                <div id="qr-modal-box" class="bg-white p-3 rounded-lg inline-block"></div>
                <div id="qr-modal-text" class="mt-3 text-sm text-emerald-400 break-all max-w-xs"></div>
            </div>
        </div>

        <script>
            var STORAGE_KEY = "shlink_pro_history";

            /* ---------- NAV ---------- */
            function showView(name) {
                var views = document.querySelectorAll(".view");
                for (var i = 0; i < views.length; i++) views[i].classList.add("hidden");
                document.getElementById("view-" + name).classList.remove("hidden");
                var btns = document.querySelectorAll(".nav-btn");
                for (var i = 0; i < btns.length; i++) {
                    var on = btns[i].getAttribute("data-view") === name;
                    btns[i].classList.toggle("bg-[#161b26]", on);
                    btns[i].classList.toggle("text-white", on);
                    if (!on) btns[i].classList.add("text-slate-400");
                    else btns[i].classList.remove("text-slate-400");
                }
                if (name === "admin") bootAdmin();
            }
            var navBtns = document.querySelectorAll(".nav-btn");
            for (var i = 0; i < navBtns.length; i++) {
                navBtns[i].addEventListener("click", function () { showView(this.getAttribute("data-view")); });
            }
            showView("shorten");

            /* ---------- TOAST ---------- */
            function toast(msg, type) {
                var t = document.getElementById("toast");
                var tMsg = document.getElementById("toast-msg");
                var tIcon = document.getElementById("toast-icon");
                tMsg.innerText = msg;
                tIcon.className = type === "error"
                    ? "fa-solid fa-circle-xmark text-red-500 mr-1"
                    : "fa-solid fa-circle-check text-emerald-500 mr-1";
                t.classList.remove("opacity-0", "pointer-events-none");
                t.classList.add("opacity-100");
                setTimeout(function () {
                    t.classList.remove("opacity-100");
                    t.classList.add("opacity-0", "pointer-events-none");
                }, 2500);
            }

            /* ---------- SHORTEN ---------- */
            document.getElementById("shorten-form").addEventListener("submit", function (e) {
                e.preventDefault();
                processShorten(false);
            });

            function setBtnBusy(busy) {
                document.getElementById("btn-submit").disabled = busy;
                document.getElementById("btn-text").classList.toggle("hidden", busy);
                document.getElementById("btn-spinner").classList.toggle("hidden", !busy);
            }

            async function processShorten(overwrite) {
                var longUrl = document.getElementById("long-url").value.trim();
                var customSlug = document.getElementById("custom-slug").value.trim();
                if (!longUrl) return;
                setBtnBusy(true);
                try {
                    var res = await fetch("/api/shorten", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "create", longUrl: longUrl, customSlug: customSlug, overwrite: overwrite }),
                    });
                    var data = await res.json().catch(function () { return {}; });
                    if (!res.ok) {
                        var detail = (data && data.detail) || "Có lỗi từ server";
                        if (res.status === 409 && customSlug && !overwrite) {
                            if (confirm("Slug '" + customSlug + "' đã tồn tại. Ghi đè link cũ?")) {
                                setBtnBusy(false);
                                return processShorten(true);
                            }
                            return;
                        }
                        throw new Error(detail);
                    }
                    showResult(data.shortUrl, longUrl);
                    document.getElementById("long-url").value = "";
                    document.getElementById("custom-slug").value = "";
                    toast(data.overwritten ? "Đã ghi đè link!" : "Tạo link thành công!");
                } catch (err) {
                    toast(err.message, "error");
                } finally {
                    setBtnBusy(false);
                }
            }

            function showResult(shortUrl, longUrl) {
                document.getElementById("generated-url").value = shortUrl;
                document.getElementById("result-card").classList.remove("hidden");
                var box = document.getElementById("qrcode-box");
                box.innerHTML = "";
                box.classList.add("hidden");
                new QRCode(box, { text: shortUrl, width: 140, height: 140 });
                addHistory(shortUrl, longUrl);
            }

            function hideResult() { document.getElementById("result-card").classList.add("hidden"); }
            function toggleQR() { document.getElementById("qrcode-box").classList.toggle("hidden"); }
            function copyText(txt) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    return navigator.clipboard.writeText(txt);
                }
                var ta = document.createElement("textarea");
                ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
                document.body.appendChild(ta); ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                return Promise.resolve();
            }
            function copyGeneratedUrl() {
                copyText(document.getElementById("generated-url").value);
                toast("Đã copy vào bộ nhớ tạm");
            }

            /* ---------- HISTORY (localStorage) ---------- */
            function addHistory(shortUrl, longUrl) {
                var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
                data = data.filter(function (i) { return i.shortUrl !== shortUrl; });
                data.unshift({ shortUrl: shortUrl, longUrl: longUrl });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data.slice(0, 8)));
                renderHistory();
            }
            function renderHistory() {
                var box = document.getElementById("history-list");
                var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
                box.innerHTML = "";
                if (!data.length) {
                    box.innerHTML = '<div class="p-4 text-center text-sm text-slate-600">Chưa có link nào</div>';
                    return;
                }
                data.forEach(function (i) {
                    var div = document.createElement("div");
                    div.className = "p-3 flex justify-between items-center gap-3 hover:bg-[#161b26] cursor-pointer transition-colors";
                    var g = document.createElement("div");
                    g.className = "min-w-0";
                    var s = document.createElement("div");
                    s.className = "text-sm text-emerald-400 font-medium truncate";
                    s.textContent = i.shortUrl;
                    var l = document.createElement("div");
                    l.className = "text-xs text-slate-500 truncate";
                    l.textContent = i.longUrl;
                    g.appendChild(s); g.appendChild(l);
                    var c = document.createElement("span");
                    c.className = "text-xs text-slate-500 shrink-0";
                    c.textContent = "Copy";
                    div.appendChild(g); div.appendChild(c);
                    div.addEventListener("click", function () {
                        copyText(i.shortUrl); toast("Đã copy");
                    });
                    box.appendChild(div);
                });
            }
            renderHistory();

            /* ---------- ADMIN ---------- */
            var allLinks = [];

            function bootAdmin() {
                fetch("/api/admin/links").then(function (r) {
                    if (r.status === 401) { showAdminLogin(); throw { silent: true }; }
                    return r.json();
                }).then(function (d) {
                    if (!d || !d.links) return;
                    showAdminDash();
                    allLinks = d.links;
                    renderAdminTable();
                }).catch(function (e) { if (!e || !e.silent) console.error(e); });
            }

            function showAdminLogin() {
                document.getElementById("admin-login").classList.remove("hidden");
                document.getElementById("admin-dash").classList.add("hidden");
                document.getElementById("admin-logout-wrap").classList.add("hidden");
            }
            function showAdminDash() {
                document.getElementById("admin-login").classList.add("hidden");
                document.getElementById("admin-dash").classList.remove("hidden");
                document.getElementById("admin-logout-wrap").classList.remove("hidden");
            }

            document.getElementById("admin-login-form").addEventListener("submit", async function (e) {
                e.preventDefault();
                var pass = document.getElementById("admin-pass").value;
                var res = await fetch("/api/admin/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: pass }),
                });
                if (res.ok) {
                    document.getElementById("admin-pass").value = "";
                    bootAdmin();
                    toast("Đăng nhập thành công");
                } else {
                    toast("Sai mật khẩu", "error");
                }
            });

            function adminLogout() {
                fetch("/api/admin/logout", { method: "POST" }).then(function () {
                    allLinks = [];
                    showAdminLogin();
                    toast("Đã đăng xuất");
                });
            }

            function esc(s) {
                return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            }

            function fmtDate(iso) {
                if (!iso) return "—";
                try {
                    var d = new Date(iso);
                    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                } catch (e) { return "—"; }
            }

            function loadLinks(force) {
                var tbody = document.getElementById("admin-tbody");
                if (force) tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-600">Đang tải...</td></tr>';
                fetch("/api/admin/links").then(function (r) {
                    if (r.status === 401) { showAdminLogin(); throw { silent: true }; }
                    return r.json();
                }).then(function (d) {
                    allLinks = d.links || [];
                    renderAdminTable();
                }).catch(function (e) { if (!e || !e.silent) console.error(e); });
            }

            function renderAdminTable() {
                var q = (document.getElementById("admin-search").value || "").toLowerCase();
                var tbody = document.getElementById("admin-tbody");
                var rows = allLinks.filter(function (l) {
                    return !q || (l.slug + " " + l.url).toLowerCase().indexOf(q) !== -1;
                });
                var totalClicks = 0, recent = 0, week = Date.now() - 7 * 86400000;
                allLinks.forEach(function (l) { totalClicks += l.clicks || 0; if (l.lastClick && new Date(l.lastClick).getTime() > week) recent++; });
                document.getElementById("stat-total").textContent = allLinks.length;
                document.getElementById("stat-clicks").textContent = totalClicks;
                document.getElementById("stat-recent").textContent = recent;

                if (!rows.length) {
                    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-600">Không có link nào</td></tr>';
                    return;
                }
                tbody.innerHTML = rows.map(function (l) {
                    return '<tr class="hover:bg-[#161b26] transition-colors">'
                        + '<td class="px-4 py-3 align-top"><a href="/' + esc(l.slug) + '" target="_blank" class="text-emerald-400 font-medium hover:underline">/' + esc(l.slug) + '</a>'
                        + '<div class="mt-1 flex gap-2"><button onclick="copyText(location.origin+\'/' + esc(l.slug) + '\').then(function(){toast(\'Đã copy\')})" class="text-[11px] text-slate-500 hover:text-emerald-400 cursor-pointer"><i class="fa-solid fa-copy"></i> copy</button>'
                        + '<button onclick="showQR(location.origin+\'/' + esc(l.slug) + '\')" class="text-[11px] text-slate-500 hover:text-emerald-400 cursor-pointer"><i class="fa-solid fa-qrcode"></i> QR</button></div></td>'
                        + '<td class="px-4 py-3 align-top"><div class="editable flex items-center gap-2" data-slug="' + esc(l.slug) + '">'
                        + '<span class="url-text text-slate-300 break-all max-w-[340px]">' + esc(l.url) + '</span>'
                        + '<button onclick="editUrl(this)" class="text-[11px] text-slate-500 hover:text-emerald-400 cursor-pointer shrink-0"><i class="fa-solid fa-pen"></i></button>'
                        + '</div></td>'
                        + '<td class="px-4 py-3 align-top text-right"><span class="inline-block px-2 py-0.5 rounded-md bg-[#1a1f2b] text-xs font-semibold">' + (l.clicks || 0) + '</span>'
                        + (l.lastClick ? '<div class="text-[10px] text-slate-600 mt-1">' + fmtDate(l.lastClick) + '</div>' : '') + '</td>'
                        + '<td class="px-4 py-3 align-top text-slate-400 text-xs">' + fmtDate(l.created) + '</td>'
                        + '<td class="px-4 py-3 align-top text-right whitespace-nowrap">'
                        + '<button onclick="deleteLink(\'' + esc(l.slug) + '\')" class="text-xs text-slate-500 hover:text-red-400 cursor-pointer px-2 py-1 rounded-md hover:bg-[#2a1520]"><i class="fa-solid fa-trash"></i> Xóa</button>'
                        + '</td></tr>';
                }).join("");
            }

            function showQR(url) {
                var box = document.getElementById("qr-modal-box");
                box.innerHTML = "";
                new QRCode(box, { text: url, width: 180, height: 180 });
                document.getElementById("qr-modal-text").textContent = url;
                document.getElementById("qr-modal").classList.remove("hidden");
            }

            function editUrl(btn) {
                var wrap = btn.closest(".editable");
                var slug = wrap.getAttribute("data-slug");
                var span = wrap.querySelector(".url-text");
                if (wrap.querySelector("input")) return;
                var input = document.createElement("input");
                input.type = "url";
                input.value = span.textContent;
                input.className = "flex-1 min-w-0 px-2 py-1.5 rounded-md bg-[#0a0c10] border border-emerald-700 outline-none text-xs text-slate-200";
                span.replaceWith(input);
                input.focus();
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                btn.onclick = async function () {
                    var nu = input.value.trim();
                    if (!nu || nu === span.textContent) { renderAdminTable(); return; }
                    try {
                        var res = await fetch("/api/admin/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ slug: slug, longUrl: nu }),
                        });
                        if (!res.ok) throw new Error("fail");
                        toast("Đã cập nhật URL đích");
                        loadLinks();
                    } catch (e) { toast("Cập nhật thất bại", "error"); renderAdminTable(); }
                };
            }

            async function deleteLink(slug) {
                if (!confirm("Xóa link /" + slug + "?")) return;
                var res = await fetch("/api/shorten", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete", customSlug: slug }),
                });
                if (res.ok) { toast("Đã xóa /" + slug); loadLinks(); }
                else toast("Xóa thất bại", "error");
            }

            function exportCsv() {
                var lines = ["slug,short_url,long_url,clicks,created,last_click"];
                allLinks.forEach(function (l) {
                    function q(s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; }
                    lines.push([q(l.slug), q(location.origin + "/" + l.slug), q(l.url), l.clicks || 0, q(l.created), q(l.lastClick)].join(","));
                });
                var blob = new Blob([lines.join("\\n")], { type: "text/csv" });
                var a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "shortlinks.csv";
                a.click();
            }
        </script>
    </body>
</html>`;

const ADMIN_COOKIE = "sh_admin";
const DAY_TTL = 86400; // seconds

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sessionToken(password) {
  // Token chỉ có thể tạo ra bởi người biết đúng mật khẩu
  return hmacHex(password, "shortener-admin-session-v1");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const tok = getCookie(request, ADMIN_COOKIE);
  if (!tok) return false;
  const expect = await sessionToken(env.ADMIN_PASSWORD);
  if (tok.length !== expect.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expect.length; i++) diff |= tok.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "GET" && (path === "/" || path === "/admin")) {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/api/shorten") return handleApi(request, env);

    if (path.startsWith("/api/admin/")) return handleAdminApi(request, env, url);

    if (method === "GET") {
      const slug = path.slice(1);
      if (slug && !slug.includes("/")) {
        return handleRedirect(request, slug, env);
      }
    }

    return new Response(HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

/* ---------------- REDIRECT + CLICK TRACKING ---------------- */

function parseValue(val) {
  // value mới: JSON {u, c, t, lc} ; value cũ: chuỗi URL thuần
  if (val && typeof val === "string" && val.startsWith("{")) {
    try {
      const o = JSON.parse(val);
      if (o && o.u) return { url: o.u, clicks: o.c || 0, created: o.t || null, lastClick: o.lc || null };
    } catch {
      /* fallthrough */
    }
  }
  return { url: val, clicks: 0, created: null, lastClick: null };
}

async function handleRedirect(request, slug, env) {
  try {
    const KV = env.SHORTENER_KV;
    if (!KV) return new Response("KV Binding missing", { status: 500 });

    const val = await KV.get(slug);
    if (!val) {
      const url = new URL(request.url);
      return Response.redirect(url.origin, 302);
    }

    const meta = parseValue(val);

    // Đếm click (best-effort, không chặn redirect)
    try {
      await KV.put(
        slug,
        JSON.stringify({
          u: meta.url,
          c: (meta.clicks || 0) + 1,
          t: meta.created || new Date().toISOString(),
          lc: new Date().toISOString(),
        }),
        { expirationTtl: DAY_TTL * 365 },
      );
    } catch {
      /* ignore counter failure */
    }

    return Response.redirect(meta.url, 302);
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}

/* ---------------- PUBLIC API (giữ tương thích bản cũ) ---------------- */

async function handleApi(request, env) {
  const KV = env.SHORTENER_KV;
  const urlObj = new URL(request.url);
  const domain = urlObj.origin;

  if (!KV) return json({ detail: "KV Namespace binding missing." }, 500);

  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const { action, longUrl: rawUrl, customSlug, overwrite } = body;

    if (!action || !["create", "delete"].includes(action)) {
      return json({ detail: "Invalid action" }, 400);
    }

    // --- DELETE (bảo vệ: chỉ admin được xóa từ bản dashboard) ---
    if (action === "delete") {
      if (!(await isAdmin(request, env))) {
        return json({ detail: "Chỉ admin mới được xóa link" }, 401);
      }
      if (!customSlug?.trim()) return json({ detail: "customSlug is required for delete" }, 400);
      await KV.delete(customSlug.trim());
      return new Response(null, { status: 204 });
    }

    // --- CREATE ---
    if (!rawUrl?.trim()) return json({ detail: "longUrl is required" }, 400);
    const longUrl = rawUrl.trim();

    try {
      new URL(longUrl);
    } catch {
      return json({ detail: "Invalid URL format" }, 400);
    }

    let slug = customSlug?.trim() || "";
    if (!slug) {
      for (let i = 0; i < 5; i++) {
        slug = Math.random().toString(36).substring(2, 8);
        const existing = await KV.get(slug);
        if (!existing) break;
        slug = "";
      }
      if (!slug) return json({ detail: "Could not generate unique slug, try again" }, 500);
    }

    if (slug.length > 64) return json({ detail: "Slug too long (max 64 chars)" }, 400);
    if (!/^[a-zA-Z0-9._~-]+$/.test(slug)) return json({ detail: "Slug chỉ gồm chữ, số, . _ ~ -" }, 400);

    const existing = await KV.get(slug);
    if (existing && customSlug) {
      if (overwrite) {
        const old = parseValue(existing);
        await KV.put(
          slug,
          JSON.stringify({ u: longUrl, c: old.clicks || 0, t: old.created || new Date().toISOString(), lc: old.lastClick || null }),
          { expirationTtl: DAY_TTL * 365 },
        );
        return json({ shortUrl: `${domain}/${slug}`, longUrl, overwritten: true });
      }
      return json({ detail: `Short URL with slug '${slug}' already exists` }, 409);
    }

    await KV.put(
      slug,
      JSON.stringify({ u: longUrl, c: 0, t: new Date().toISOString(), lc: null }),
      { expirationTtl: DAY_TTL * 365 },
    );

    return json({ shortUrl: `${domain}/${slug}`, longUrl });
  } catch (err) {
    return json({ detail: err.message }, 500);
  }
}

/* ---------------- ADMIN API ---------------- */

async function handleAdminApi(request, env, urlObj) {
  const KV = env.SHORTENER_KV;
  const path = urlObj.pathname;
  const method = request.method;

  if (!KV) return json({ detail: "KV Namespace binding missing." }, 500);

  // Đăng nhập
  if (path === "/api/admin/login" && method === "POST") {
    if (!env.ADMIN_PASSWORD) {
      return json({ detail: "Chưa cấu hình ADMIN_PASSWORD (wrangler secret put ADMIN_PASSWORD)" }, 500);
    }
    try {
      const body = await request.json();
      if (body.password !== env.ADMIN_PASSWORD) return json({ detail: "Sai mật khẩu" }, 401);
      const tok = await sessionToken(env.ADMIN_PASSWORD);
      return json(
        { ok: true },
        200,
        {
          "Set-Cookie": `${ADMIN_COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAY_TTL * 7}`,
        },
      );
    } catch {
      return json({ detail: "Bad request" }, 400);
    }
  }

  // Đăng xuất
  if (path === "/api/admin/logout" && method === "POST") {
    return json(
      { ok: true },
      200,
      { "Set-Cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` },
    );
  }

  // Từ đây trở xuống cần đăng nhập
  if (!(await isAdmin(request, env))) return json({ detail: "Unauthorized" }, 401);

  // Danh sách link
  if (path === "/api/admin/links" && method === "GET") {
    const links = [];
    let cursor;
    do {
      const page = await KV.list({ cursor, limit: 1000 });
      for (const key of page.keys) {
        const val = await KV.get(key.name);
        if (!val) continue;
        const meta = parseValue(val);
        if (!meta.url) continue;
        links.push({
          slug: key.name,
          url: meta.url,
          clicks: meta.clicks || 0,
          created: meta.created,
          lastClick: meta.lastClick,
          legacy: !val.startsWith("{"),
        });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    links.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    return json({ links });
  }

  // Sửa URL đích
  if (path === "/api/admin/update" && method === "POST") {
    try {
      const { slug, longUrl } = await request.json();
      if (!slug || !longUrl) return json({ detail: "slug và longUrl là bắt buộc" }, 400);
      try {
        new URL(longUrl);
      } catch {
        return json({ detail: "Invalid URL format" }, 400);
      }
      const val = await KV.get(slug);
      if (!val) return json({ detail: "Không tìm thấy slug" }, 404);
      const meta = parseValue(val);
      await KV.put(
        slug,
        JSON.stringify({ u: longUrl.trim(), c: meta.clicks || 0, t: meta.created || new Date().toISOString(), lc: meta.lastClick || null }),
        { expirationTtl: DAY_TTL * 365 },
      );
      return json({ ok: true });
    } catch (err) {
      return json({ detail: err.message }, 500);
    }
  }

  return json({ detail: "Not found" }, 404);
}
