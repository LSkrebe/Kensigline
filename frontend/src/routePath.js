/** Static hosts may add a trailing slash to prerendered route directories. */
export const routePath = (pathname) => pathname.replace(/\/+$/, "") || "/";
