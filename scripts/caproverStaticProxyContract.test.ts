import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CapRover static proxy contract", () => {
  it("serves frontend assets outside the memory-heavy application worker", async () => {
    const [captain, nginx, securityHeaders, startScript] = await Promise.all([
      readFile(path.join(process.cwd(), "captain-definition"), "utf-8"),
      readFile(path.join(process.cwd(), "deploy", "nginx.conf"), "utf-8"),
      readFile(path.join(process.cwd(), "deploy", "nginx-security-headers.conf"), "utf-8"),
      readFile(path.join(process.cwd(), "scripts", "startCapRover.sh"), "utf-8")
    ]);

    expect(captain).toContain("apk add --no-cache nginx");
    expect(captain).toContain("COPY deploy/nginx.conf /etc/nginx/nginx.conf");
    expect(captain).toContain("COPY deploy/nginx-security-headers.conf /etc/nginx/arcigy-security-headers.conf");
    expect(captain).toContain('CMD [\\"/app/scripts/startCapRover.sh\\"]');
    expect(nginx).toContain("location ^~ /assets/");
    expect(nginx).toContain("public, max-age=31536000, immutable");
    expect(nginx).toContain("location ~ ^/(?:api|storage)(?:/|$)");
    expect(nginx).toContain("proxy_pass http://arcigy_worker");
    expect(nginx).toContain("client_max_body_size 256m");
    expect(nginx).toContain("try_files $uri $uri/ /index.html");
    expect(nginx).toContain('return 404 "Static asset not found.\\n"');
    expect(securityHeaders).toContain("Content-Security-Policy");
    expect(securityHeaders).toContain("X-Content-Type-Options \"nosniff\"");
    expect(startScript).toContain("BLENDER_WORKER_HOST=127.0.0.1");
    expect(startScript).toContain("BLENDER_WORKER_PORT=5191");
    expect(startScript).toContain("nginx -g 'daemon off;'");
  });
});
