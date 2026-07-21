const STATIC_ASSET_PREFIX = "/assets/";
const FILE_EXTENSION_PATTERN = /(?:^|\/)[^/]+\.[^/]+$/;

export function shouldServeSpaIndex(pathname: string): boolean {
  if (pathname.startsWith(STATIC_ASSET_PREFIX)) return false;
  return !FILE_EXTENSION_PATTERN.test(pathname);
}

export function staticCacheControl(filePath: string): string {
  return filePath.toLowerCase().endsWith(".html")
    ? "no-store"
    : "public, max-age=31536000, immutable";
}
