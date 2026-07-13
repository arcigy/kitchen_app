import net from "node:net";

const token = process.env.TUNNEL_TOKEN;
if (!token) throw new Error("TUNNEL_TOKEN is required.");

const listenPort = Number(process.env.TUNNEL_PORT || 15432);
const dbHost = process.env.DB_HOST || "srv-captain--kitchenapp-db";
const dbPort = Number(process.env.DB_PORT || 5432);

function close(socket) {
  socket.destroy();
}

const server = net.createServer((client) => {
  client.setTimeout(10_000);
  let buffer = Buffer.alloc(0);

  const onData = (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 4096) return close(client);
    const newlineIndex = buffer.indexOf(10);
    if (newlineIndex === -1) return;

    client.off("data", onData);
    const header = buffer.subarray(0, newlineIndex).toString("utf8").trim();
    const rest = buffer.subarray(newlineIndex + 1);
    if (header === `PING ${token}`) {
      const db = net.connect({ host: dbHost, port: dbPort }, () => {
        client.end("OK\n");
        close(db);
      });
      db.on("error", (error) => {
        client.end(`ERR ${error.message}\n`);
      });
      return;
    }

    if (header !== `TOKEN ${token}`) return close(client);

    // The authentication deadline must not become an idle timeout for an
    // authenticated PostgreSQL connection. Pools intentionally keep sockets
    // idle between requests and would otherwise reconnect every ten seconds.
    client.setTimeout(0);
    client.setKeepAlive(true, 10_000);
    const db = net.connect({ host: dbHost, port: dbPort }, () => {
      db.setKeepAlive(true, 10_000);
      if (rest.length) db.write(rest);
      client.pipe(db);
      db.pipe(client);
    });
    db.on("error", () => close(client));
    client.on("error", () => close(db));
  };

  client.on("data", onData);
  client.on("timeout", () => close(client));
  client.on("error", () => close(client));
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`[db-tunnel] listening on ${listenPort}, forwarding to ${dbHost}:${dbPort}`);
});
