const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// আপনার MongoDB কানেকশন লিংক (ইউজারনেম ও পাসওয়ার্ড সহ)
const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegiLkcrT2C@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority";

// ডাটাবেজ কানেক্ট করা
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Failed: ", err));

// বেস রুট
app.get('/', (req, res) => {
    res.send("Game Backend Server is Running!");
});

// ১. লগইন এপিআই রাউট
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // এখানে আপনার MongoDB ডাটাবেজ থেকে ইউজার চেক করার লজিক বসাতে পারবেন
    console.log("Login request received for user:", username);
    
    // সাময়িকভাবে সাকসেস রেসপন্স পাঠানো হচ্ছে
    res.status(200).json({ success: true, message: "Login successful" });
});

// ২. রেজিস্ট্রেশন এপিআই রাউট
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    // এখানে আপনার MongoDB ডাটাবেজে নতুন ইউজার সেভ করার লজিক বসাতে পারবেন
    console.log("Register request received for user:", username);
    
    // সাময়িকভাবে সাকসেস রেসপন্স পাঠানো হচ্ছে
    res.status(201).json({ success: true, message: "Registration successful" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
