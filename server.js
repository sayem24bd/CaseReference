// server.js — সংস্কারকৃত সংস্করণ
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors"); // ১. CORS প্যাকেজ যুক্ত করা হয়েছে

const app = express();

// ২. Render-এর জন্য ডাইনামিক পোর্ট সেটআপ
const PORT = process.env.PORT || 3000;

// ৩. CORS এনাবল করা (যাতে GitHub Pages থেকে ডাটা এক্সেস করা যায়)
app.use(cors());

// ৪. স্ট্যাটিক ফাইল পাথ (নিশ্চিত করুন আপনার public ফোল্ডারটি সঠিক জায়গায় আছে)
const publicPath = path.join(__dirname, "public");
const INDEX_FILE = path.join(publicPath, "index.html");

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); 
app.use(cookieParser());
app.use(express.static(publicPath));

// ৫. ভিজিটর কাউন্টার API (এটি অবশ্যই অন্য রাউটের উপরে থাকতে হবে)
let visitorCount = 0;
app.get("/api/visitor", (req, res) => {
  try {
    const lastVisit = req.cookies.__last_visit_ts;
    const now = Date.now();
    
    // ১ মিনিটের ভেতর পুনরায় আসলে কাউন্ট বাড়বে না
    if (!lastVisit || (now - Number(lastVisit)) > 60000) { 
      visitorCount++;
      res.cookie("__last_visit_ts", String(now), { 
        httpOnly: true, 
        sameSite: 'none', // কস-সাইট কুকির জন্য
        secure: true      // HTTPS প্রয়োজন
      });
    }
    
    // সরাসরি JSON পাঠানো নিশ্চিত করা
    res.json({ count: visitorCount });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: "Visitor counter error" });
  }
});

// Root route with nonce injection
app.get("/", (req, res) => {
  try {
    if (!fs.existsSync(INDEX_FILE)) {
        return res.status(404).send("index.html not found in public folder");
    }

    let html = fs.readFileSync(INDEX_FILE, "utf8");
    const nonce = crypto.randomBytes(16).toString("base64");

    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://www.gstatic.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `img-src 'self' data:`,
      `font-src 'self' https://fonts.gstatic.com`,
      `connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://cdn.jsdelivr.net https://casereference.onrender.com`,
      `form-action 'self'`
    ].join("; ");

    res.setHeader("Content-Security-Policy", csp);
    html = html.replace(/%NONCE%/g, nonce);
    res.send(html);

  } catch (err) {
    console.error("Serve index error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
