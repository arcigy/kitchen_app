import { validateB2Authorization } from "./backup-core.mjs";

const B2_AUTH_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";

function fail(message) {
  throw new Error(`Arcigy B2 operation failed: ${message}`);
}

async function responseJson(response, action) {
  const text = await response.text();
  if (!response.ok) fail(`${action} returned HTTP ${response.status}.`);
  try {
    return JSON.parse(text);
  } catch {
    fail(`${action} returned invalid JSON.`);
  }
}

export async function authorizeB2(config, purpose = "writer") {
  const basic = Buffer.from(`${config.keyId}:${config.applicationKey}`, "utf8").toString("base64");
  const response = await fetch(B2_AUTH_URL, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15_000) });
  const authorization = await responseJson(response, "B2 authorize");
  const allowed = validateB2Authorization(authorization, config.bucket, purpose);
  const apiUrl = authorization.apiInfo?.storageApi?.apiUrl || authorization.apiUrl;
  const downloadUrl = authorization.apiInfo?.storageApi?.downloadUrl || authorization.downloadUrl;
  const authorizationToken = authorization.authorizationToken;
  if (!apiUrl || !downloadUrl || !authorizationToken || !allowed.bucketId) fail("B2 authorization response is incomplete.");
  return { apiUrl, downloadUrl, authorizationToken, bucketId: allowed.bucketId };
}

export async function b2ApiCall(session, action, body) {
  const response = await fetch(`${session.apiUrl}/b2api/v4/${action}`, {
    method: "POST",
    headers: { Authorization: session.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  return responseJson(response, action);
}

export async function downloadB2File(session, bucket, objectKey) {
  const encodedPath = objectKey.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${session.downloadUrl}/file/${encodeURIComponent(bucket)}/${encodedPath}`, {
    headers: { Authorization: session.authorizationToken },
    signal: AbortSignal.timeout(10 * 60_000)
  });
  if (!response.ok || !response.body) fail(`B2 download returned HTTP ${response.status}.`);
  return response;
}
