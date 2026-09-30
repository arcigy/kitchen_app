export function localDatabaseUrl(runtimeDatabaseUrl: string, databaseAppName: string, localPort: number): string {
  let url: URL;
  try {
    url = new URL(runtimeDatabaseUrl);
  } catch {
    throw new Error("Runtime app DATABASE_URL is invalid.");
  }
  if (!(["postgresql:", "postgres:"].includes(url.protocol)) ||
      url.hostname !== `srv-captain--${databaseAppName}` ||
      !url.username || !url.password || url.pathname.length < 2 ||
      url.search || url.hash) {
    throw new Error("Runtime app DATABASE_URL does not match the selected database service.");
  }
  url.hostname = "127.0.0.1";
  url.port = String(localPort);
  return url.toString();
}
