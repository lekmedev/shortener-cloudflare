export async function onRequestPost(context) {
  const KV = context.env.MY_KV;
  const urlObj = new URL(context.request.url);
  const domain = urlObj.origin;

  if (!KV) {
    return new Response(
      JSON.stringify({ detail: "KV Namespace binding missing." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await context.request.json();
    const { action, longUrl: rawUrl, customSlug, overwrite } = body;

    if (!action || !["create", "delete"].includes(action)) {
      return new Response(JSON.stringify({ detail: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- DELETE ---
    if (action === "delete") {
      if (!customSlug?.trim()) {
        return new Response(
          JSON.stringify({ detail: "customSlug is required for delete" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      await KV.delete(customSlug.trim());
      return new Response(null, { status: 204 });
    }

    // --- CREATE ---
    if (!rawUrl?.trim()) {
      return new Response(JSON.stringify({ detail: "longUrl is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const longUrl = rawUrl.trim();

    // Validate URL format
    try {
      new URL(longUrl);
    } catch {
      return new Response(JSON.stringify({ detail: "Invalid URL format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine slug
    let slug = customSlug?.trim() || "";
    if (!slug) {
      for (let i = 0; i < 5; i++) {
        slug = Math.random().toString(36).substring(2, 8);
        const existing = await KV.get(slug);
        if (!existing) break;
        slug = "";
      }
      if (!slug) {
        return new Response(
          JSON.stringify({
            detail: "Could not generate unique slug, try again",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (slug.length > 64) {
      return new Response(
        JSON.stringify({ detail: "Slug too long (max 64 chars)" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check collision for custom slugs
    const existing = await KV.get(slug);
    if (existing && customSlug) {
      if (overwrite) {
        await KV.delete(slug);
        await KV.put(slug, longUrl, { expirationTtl: 86400 * 365 });
        return new Response(
          JSON.stringify({
            shortUrl: `${domain}/${slug}`,
            longUrl,
            overwritten: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          detail: `Short URL with slug '${slug}' already exists`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    await KV.put(slug, longUrl, { expirationTtl: 86400 * 365 });

    return new Response(
      JSON.stringify({ shortUrl: `${domain}/${slug}`, longUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
