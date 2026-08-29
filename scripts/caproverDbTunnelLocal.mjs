import net from "node:net";

const token = process.env.TUNNEL_TOKEN;
if (!token) throw new Error("TUNNEL_TOKEN is required.");

const localHost = process.env.LOCAL_HOST || "127.0.0.1";
const localPort = Number(process.env.LOCAL_PORT || 55432);
const remoteHost = process.env.REMOTE_HOST;
const remotePort = Number(process.env.REMOTE_PORT || 55432);

if (!remoteHost) throw new Error("REMOTE_HOST is required.");

function close(socket) {
  socket.destroy();
}

const server = net.createServer((local) => {
  const remote = net.connect({ host: remoteHost, port: remotePort }, () => {
    remote.write(`TOKEN ${token}\n`);
    local.pipe(remote);
    remote.pipe(local);
  });
  local.on("error", () => close(remote));
  remote.on("error", () => close(local));
});

server.listen(localPort, localHost, () => {
  console.log(`[db-tunnel] local ${localHost}:${localPort} -> ${remoteHost}:${remotePort}`);
});
