// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;
// Simple in-memory visitor count (demo only)
let visitorCount = 0;

// Define index.html path
const INDEX_FILE = path.join(__dirname, "public", "index.html");

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // We'll set CSP manually
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Root route with nonce injection
app.get("/", (req, res) => {
  try {
    let html = fs.readFileSync(INDEX_FILE, "utf8");

    const nonce = crypto.randomBytes(16).toString("base64");

    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://www.gstatic.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `img-src 'self' data:`,
      `font-src 'self' https://fonts.gstatic.com`,
      `connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://cdn.jsdelivr.net`,
      `form-action 'self'`
    ].join("; ");

    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
    res.setHeader("Permissions-Policy", "geolocation=()");

    html = html.replace(/%NONCE%/g, nonce);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);

  } catch (err) {
    console.error("Serve index error:", err);
    res.status(500).send("Server error");
  }
});

// Visitor API
app.get("/api/visitor", (req, res) => {
  try {
    const lastVisit = req.cookies.__last_visit_ts;
    const now = Date.now();
    if (!lastVisit || (now - Number(lastVisit)) > 60000) { // 1 min throttle
      visitorCount++;
      res.cookie("__last_visit_ts", String(now), { httpOnly: true, sameSite: "Lax" });
    }
    res.json({ value: visitorCount });
  } catch {
    res.status(500).json({ value: 0 });
  }
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

