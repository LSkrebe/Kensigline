import "dotenv/config";
import http from "node:http";
const port = Number(process.env.PORT ?? "3001");
const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Kensigline backend running\n");
});
server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map