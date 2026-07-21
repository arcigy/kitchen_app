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
    expect(captain).toContain("RUN rm -rf /app/node_modules");
    expect(captain).toContain("RUN npm ci --omit=dev");
    expect(captain).toContain("RUN test -x /app/node_modules/.bin/tsx");
    expect(captain).toContain("COPY deploy/nginx.conf /etc/nginx/nginx.conf");
    expect(captain).toContain("COPY deploy/nginx-security-headers.conf /etc/nginx/arcigy-security-headers.conf");
    expect(captain).toContain('CMD [\\"/app/scripts/startCapRover.sh\\"]');
    expect(nginx).toContain("location ^~ /assets/");
    expect(nginx).toContain("public, max-age=31536000, immutable");
    const versionedModuleIcons = nginx.indexOf("location ~ ^/module-icons/furniture/v[0-9]+/");
    const genericStaticFiles = nginx.indexOf("location ~* \\.[a-z0-9]+$");
    expect(versionedModuleIcons).toBeGreaterThan(-1);
    expect(genericStaticFiles).toBeGreaterThan(versionedModuleIcons);
    expect(nginx).toContain("location ~ ^/(?:api|storage)(?:/|$)");
    expect(nginx).toContain("proxy_pass http://arcigy_worker");
    expect(nginx).toContain("client_max_body_size 256m");
    expect(nginx).toContain("sendfile off");
    expect(nginx).toContain("gzip on");
    expect(nginx).toContain("gzip_proxied any");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $arcigy_forwarded_proto");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Host $arcigy_forwarded_host");
    expect(nginx).toContain("location = /organization/default-user.png");
    expect(nginx).toContain("try_files $uri $uri/ /index.html");
    expect(nginx).toContain('return 404 "Static asset not found.\\n"');
    expect(securityHeaders).toContain("Content-Security-Policy");
    expect(securityHeaders).toContain("X-Content-Type-Options \"nosniff\"");
    expect(startScript).toContain("BLENDER_WORKER_HOST=127.0.0.1");
    expect(startScript).toContain("BLENDER_WORKER_PORT=5191");
    expect(startScript).toContain("nginx -g 'daemon off;'");
  });
});
