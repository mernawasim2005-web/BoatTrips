const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = process.env.PORT || 3001;

function getLanUrls() {
    const localUrls = new Set();
    const interfaces = os.networkInterfaces();

    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (entry.family === "IPv4" && !entry.internal) {
                localUrls.add(`http://${entry.address}:${PORT}/`);
            }
        }
    }

    if (localUrls.size === 0) {
        localUrls.add(`http://localhost:${PORT}/`);
    }

    return [...localUrls];
}

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".ico": "image/x-icon",
    ".webp": "image/webp"
};

// Route aliases for the standalone Fleet website
const ROUTE_ALIASES = {
    "/": "/fleet.html",
    "/index.html": "/fleet.html",
    "/our-fleet": "/fleet.html",
    "/our_fleet": "/fleet.html",
    "/ourfleet": "/fleet.html",
    "/fleet": "/fleet.html",
    "/boats": "/boats-only.html",
    "/boat": "/boat-details.html",
    "/boat-details": "/boat-details.html",
    "/admin": "/admin.html",
    "/login": "/owner-login.html",
    "/owner-login": "/owner-login.html"
};

const server = http.createServer((req, res) => {
    let safeUrl = decodeURIComponent(req.url.split("?")[0]);

    // Check route aliases (Root / immediately opens Our Fleet!)
    if (ROUTE_ALIASES[safeUrl.toLowerCase()]) {
        safeUrl = ROUTE_ALIASES[safeUrl.toLowerCase()];
    }

    let filePath = path.normalize(path.join(__dirname, safeUrl));

    // Support extension-less URLs (e.g. /boat-details -> /boat-details.html)
    if (!path.extname(filePath) && fs.existsSync(filePath + ".html")) {
        filePath = filePath + ".html";
    }

    // Prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("403 Forbidden");
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`
                <div style="font-family:sans-serif; text-align:center; padding:50px;">
                    <h1>404 Not Found</h1>
                    <p>The requested page was not found.</p>
                    <p><a href="/" style="display:inline-block; padding:10px 20px; background:#087ea4; color:white; text-decoration:none; border-radius:6px;">Go to Our Fleet Home</a></p>
                </div>
            `);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        res.writeHead(200, {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*"
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    const lanUrls = getLanUrls();

    console.log(`\n========================================================`);
    console.log(`  STANDALONE OUR FLEET WEBSITE RUNNING ON PORT ${PORT}`);
    console.log(`========================================================`);
    for (const url of lanUrls) {
        console.log(`  Open on device: ${url}`);
    }
    console.log(`  Fleet Website (Home): http://localhost:${PORT}/`);
    console.log(`  Our Fleet Direct:     http://localhost:${PORT}/our-fleet`);
    console.log(`  Private Admin Area:   http://localhost:${PORT}/admin`);
    console.log(`  Private Owner Login:  http://localhost:${PORT}/owner-login`);
    console.log(`========================================================\n`);
});
