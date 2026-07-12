export async function onRequestGet(context) {
  try {
    const KV = context.env.MY_KV;
    const slug = context.params.slug;

    if (!KV) {
      return new Response("KV Binding missing", { status: 500 });
    }

    const longUrl = await KV.get(slug);

    if (longUrl) {
      return Response.redirect(longUrl, 302);
    }

    // Redirect về trang chủ nếu không tìm thấy
    const url = new URL(context.request.url);
    return Response.redirect(
      url.origin + "/?notfound=" + encodeURIComponent(slug),
      302,
    );
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
