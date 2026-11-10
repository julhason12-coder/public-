const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegiLkcrT2C@cluster0.gwyx0rm.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Failed: ", err));

// ইউজার ও সেটিংস স্কিমা
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    withdrawalPassword: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    bonusBalance: { type: Number, default: 10 },
    totalDeposited: { type: Number, default: 0 },
    turnoverRequired: { type: Number, default: 0 },
    turnoverCompleted: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: "global_settings" },
    depositNumber: { type: String, default: "01700000000" },
    withdrawalNumber: { type: String, default: "01800000000" },
    minDeposit: { type: Number, default: 100 },
    minWithdraw: { type: Number, default: 500 }
});
const Settings = mongoose.model('Settings', settingsSchema);

app.get('/', (req, res) => {
    res.send("Game Server is Running Perfectly!");
});

// রেজিস্ট্রেশন
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already exists!" });
        }
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ success: true, message: "Registration successful!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// লগইন
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid username or password!" });
        }
        res.status(200).json({ success: true, message: "Login successful", user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// উত্তোলনের পাসওয়ার্ড সেট
app.post('/api/user/set-withdrawal-password', async (req, res) => {
    try {
        const { username, withdrawalPassword } = req.body;
        await User.findOneAndUpdate({ username }, { withdrawalPassword });
        res.status(200).json({ success: true, message: "Withdrawal password saved!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ডিপোজিট
app.post('/api/user/deposit', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        user.balance += Number(amount);
        user.totalDeposited += Number(amount);
        user.turnoverRequired += Number(amount);
        await user.save();
        res.status(200).json({ success: true, message: "Deposit successful!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// উত্তোলন
app.post('/api/user/withdraw', async (req, res) => {
    try {
        const { username, amount, withdrawalPassword } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        if (!user.withdrawalPassword || user.withdrawalPassword !== withdrawalPassword) {
            return res.status(400).json({ success: false, message: "সঠিক উত্তোলন পাসওয়ার্ড দিন!" });
        }
        if (user.totalDeposited < 100) {
            return res.status(400).json({ success: false, message: "আগে ১০০ থেকে ৫০০ টাকা ডিপোজিট করুন।" });
        }
        if (user.turnoverCompleted < user.turnoverRequired) {
            return res.status(400).json({ success: false, message: "টার্নওভার শর্ত পূরণ হয়নি!" });
        }
        if (user.balance < amount) {
            return res.status(400).json({ success: false, message: "অপর্যাপ্ত ব্যালেন্স!" });
        }

        user.balance -= Number(amount);
        await user.save();
        res.status(200).json({ success: true, message: "Withdrawal successful!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// অ্যাডমিন সেটিংস
app.get('/api/admin/settings', async (req, res) => {
    let settings = await Settings.findOne({ key: "global_settings" });
    if (!settings) settings = await Settings.create({ key: "global_settings" });
    res.status(200).json({ success: true, settings });
});

app.post('/api/admin/update-settings', async (req, res) => {
    try {
        const { depositNumber, withdrawalNumber } = req.body;
        let settings = await Settings.findOne({ key: "global_settings" });
        if (!settings) settings = new Settings({ key: "global_settings" });
        if (depositNumber) settings.depositNumber = depositNumber;
        if (withdrawalNumber) settings.withdrawalNumber = withdrawalNumber;
        await settings.save();
        res.status(200).json({ success: true, message: "Settings updated!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ২৪ ঘণ্টা অটো গেম ইঞ্জিন
setInterval(() => {
    const totalBet = Math.floor(Math.random() * 100000) + 10000;
    const multiplier = totalBet > 80000 ? (Math.random() * 0.5 + 1).toFixed(2) : (Math.random() * 8 + 2).toFixed(2);
    console.log(`[Auto Game] Bet: ${totalBet} | Crash: ${multiplier}x`);
}, 15000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
