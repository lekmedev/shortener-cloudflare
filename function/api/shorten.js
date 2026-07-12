function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function onRequestPost(context) {
  const KV = context.env.MY_KV;
  const urlObj = new URL(context.request.url);
  const domain = urlObj.origin;
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(domain),
  };

  if (!KV) {
    return new Response(
      JSON.stringify({ detail: "KV Namespace binding missing." }),
      {
        status: 500,
        headers,
      },
    );
  }

  // Handle preflight
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const body = await context.request.json();
    const { action, longUrl: rawUrl, customSlug, overwrite } = body;

    // Validate action
    if (!action || !["create", "delete"].includes(action)) {
      return new Response(JSON.stringify({ detail: "Invalid action" }), {
        status: 400,
        headers,
      });
    }

    // --- DELETE ---
    if (action === "delete") {
      if (!customSlug?.trim()) {
        return new Response(
          JSON.stringify({ detail: "customSlug is required for delete" }),
          { status: 400, headers },
        );
      }
      await KV.delete(customSlug.trim());
      return new Response(null, { status: 204, headers });
    }

    // --- CREATE ---
    if (!rawUrl?.trim()) {
      return new Response(JSON.stringify({ detail: "longUrl is required" }), {
        status: 400,
        headers,
      });
    }
    const longUrl = rawUrl.trim();

    // Validate URL format
    try {
      new URL(longUrl);
    } catch {
      return new Response(JSON.stringify({ detail: "Invalid URL format" }), {
        status: 400,
        headers,
      });
    }

    // Determine slug
    let slug = customSlug?.trim() || "";
    if (!slug) {
      // Auto-generate with collision check (max 5 attempts)
      for (let i = 0; i < 5; i++) {
        slug = Math.random().toString(36).substring(2, 8);
        const existing = await KV.get(slug);
        if (!existing) break;
        slug = ""; // reset if still colliding after loop
      }
      if (!slug) {
        return new Response(
          JSON.stringify({
            detail: "Could not generate unique slug, try again",
          }),
          {
            status: 500,
            headers,
          },
        );
      }
    }

    // Validate slug length
    if (slug.length > 64) {
      return new Response(
        JSON.stringify({ detail: "Slug too long (max 64 chars)" }),
        { status: 400, headers },
      );
    }

    // Check collision for custom slugs
    const existing = await KV.get(slug);
    if (existing && customSlug) {
      // If overwrite flag is set, do delete + recreate atomically
      if (overwrite) {
        await KV.delete(slug);
        await KV.put(slug, longUrl, { expirationTtl: 86400 * 365 });
        return new Response(
          JSON.stringify({
            shortUrl: `${domain}/${slug}`,
            longUrl,
            overwritten: true,
          }),
          { status: 200, headers },
        );
      }

      return new Response(
        JSON.stringify({
          detail: `Short URL with slug '${slug}' already exists`,
        }),
        { status: 409, headers },
      );
    }

    // Save to KV with 1-year TTL
    await KV.put(slug, longUrl, { expirationTtl: 86400 * 365 });

    return new Response(
      JSON.stringify({ shortUrl: `${domain}/${slug}`, longUrl }),
      { status: 200, headers },
    );
  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), {
      status: 500,
      headers,
    });
  }
}

export async function onRequestOptions(context) {
  const urlObj = new URL(context.request.url);
  return new Response(null, {
    status: 204,
    headers: corsHeaders(urlObj.origin),
  });
}
