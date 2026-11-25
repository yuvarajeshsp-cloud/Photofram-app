// Shared by the AR components and the /ar-files route (kept free of three.js).

/** Previews live for this many days; the R2 bucket's lifecycle rule deletes older ones. */
export const AR_LINK_DAYS = 7;

/** An AR preview's file name in the photofram-ar bucket: <uuid>.glb */
export const AR_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.glb$/;
