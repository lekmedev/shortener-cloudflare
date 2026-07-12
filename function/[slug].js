export async function onRequestGet(context) {
  const KV = context.env.MY_KV;
  const slug = context.params.slug; // Lấy ký tự slug từ URL (ví dụ: abc)

  if (!KV) {
    return new Response("KV Binding missing", { status: 500 });
  }

  // Tìm link gốc trong KV
  const longUrl = await KV.get(slug);

  if (longUrl) {
    // Nếu tìm thấy, chuyển hướng người dùng tới link gốc (HTTP 302 Found)
    return Response.redirect(longUrl, 302);
  }

  // Nếu không tìm thấy link, chuyển hướng về trang chủ giao diện tạo link công cụ
  const url = new URL(context.request.url);
  return Response.redirect(url.origin, 302);
}