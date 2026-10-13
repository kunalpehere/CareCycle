// Provider metadata is injected by Render, never read from request headers.
export const renderOrigin = source => {
    if (source.RENDER !== "true" || source.RENDER_SERVICE_TYPE !== "web") throw new Error("Render web-service metadata is required.");
    const url = new URL(source.RENDER_EXTERNAL_URL);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.onrender\.com$/.test(url.hostname) || url.hostname !== source.RENDER_EXTERNAL_HOSTNAME || url.username || url.password || url.pathname !== "/" || url.port || url.search || url.hash) throw new Error("Render's assigned HTTPS origin is required.");
    return url.origin;
};
