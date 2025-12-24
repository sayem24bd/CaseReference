const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ১. CORS এবং কুকি পার্সার সবার আগে থাকবে
app.use(cors({
    origin: "*", // টেস্ট করার জন্য সব ডোমেইন ওপেন রাখা হলো
    credentials: true
}));
app.use(cookieParser());

// ২. ইন-মেমোরি কাউন্টার ভেরিয়েবল
let visitorCount = 0;

// ৩. [গুরুত্বপূর্ণ] API রাউটটি অবশ্যই স্ট্যাটিক ফাইলের *উপরে* থাকতে হবে
app.get("/api/visitor", (req, res) => {
  try {
    const lastVisit = req.cookies.__last_visit_ts;
    const now = Date.now();
    
    // ১ মিনিটের লজিক
    if (!lastVisit || (now - Number(lastVisit)) > 60000) { 
      visitorCount++;
      res.cookie("__last_visit_ts", String(now), { 
        httpOnly: true, 
        sameSite: 'none', 
        secure: true 
      });
    }
    
    // নিশ্চিত করুন এটি JSON পাঠাচ্ছে
    res.setHeader('Content-Type', 'application/json');
    res.json({ count: visitorCount });

  } catch (err) {
    console.error(err);
    res.status(500).json({ count: 0, error: "Server error" });
  }
});

// ৪. এরপর স্ট্যাটিক ফাইল সেটআপ (API এর নিচে)
const INDEX_FILE = path.join(__dirname, "public", "index.html");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, "public")));

// ৫. সবশেষে রুট রাউট (HTML সার্ভ করা)
app.get("/", (req, res) => {
  try {
    if (!fs.existsSync(INDEX_FILE)) {
       return res.send("index.html missing");
    }
    let html = fs.readFileSync(INDEX_FILE, "utf8");
    const nonce = crypto.randomBytes(16).toString("base64");
    
    // CSP হেডার সেট করা... (আপনার আগের কোডের মতো)
    html = html.replace(/%NONCE%/g, nonce);
    res.send(html);
  } catch (err) {
    res.status(500).send("Error loading page");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
