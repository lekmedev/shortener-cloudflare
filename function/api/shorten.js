export async function onRequestPost(context) {
  // Kết nối với KV Namespace thông qua ràng buộc (Binding) có tên là MY_KV
  const KV = context.env.MY_KV;
  
  if (!KV) {
    return new Response(JSON.stringify({ detail: "KV Namespace binding missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await context.request.json();
    const { action, longUrl, customSlug } = body;
    const urlObj = new URL(context.request.url);
    const domain = urlObj.origin; // Lấy domain hiện tại của Pages (vd: https://short.pages.dev)

    // 1. CHỨC NĂNG TẠO SHORTLINK
    if (action === "create") {
      // Nếu không nhập customSlug, tự động tạo ngẫu nhiên một chuỗi 6 ký tự
      let slug = customSlug ? customSlug.trim() : "";
      if (!slug) {
        slug = Math.random().toString(36).substring(2, 8);
      }

      // Kiểm tra xem slug này đã tồn tại trong database KV chưa
      const existing = await KV.get(slug);
      if (existing && customSlug) {
        // Trả về lỗi trùng đúng định dạng để Frontend bắt được và hiển thị Confirm xóa
        return new Response(JSON.stringify({ detail: `Short URL with slug '${slug}' already exists` }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Lưu vào KV (Key: slug, Value: longUrl)
      await KV.put(slug, longUrl);

      // Trả về kết quả giống cấu trúc cấu hình cũ của Shlink để khớp với Frontend
      return new Response(JSON.stringify({
        shortUrl: `${domain}/${slug}`,
        longUrl: longUrl
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. CHỨC NĂNG XÓA SHORTLINK CŨ
    if (action === "delete" && customSlug) {
      await KV.delete(customSlug.trim());
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ detail: "Invalid action" }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}