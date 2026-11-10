const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegiLkcrT2C@cluster0.gwyx0rm.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected Successfully!"))
.catch(err => console.log("❌ DB Connection Failed: ", err));

// ডাটাবেজ স্কিমা
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

// বেস রুট
app.get('/', (req, res) => {
    res.send("Game Backend Server is Running Perfectly!");
});

// ১. রেজিস্ট্রেশন (১০ টাকা বোনাস)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already exists!" });
        }
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ success: true, message: "Registration successful! 10 BDT added." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ২. লগইন
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

// ৩. উত্তোলনের আলাদা পাসওয়ার্ড সেট করা
app.post('/api/user/set-withdrawal-password', async (req, res) => {
    try {
        const { username, withdrawalPassword } = req.body;
        await User.findOneAndUpdate({ username }, { withdrawalPassword });
        res.status(200).json({ success: true, message: "Withdrawal password saved!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ৪. ডিপোজিট ও টার্নওভার আপডেট
app.post('/api/user/deposit', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        const numAmount = Number(amount);
        user.balance += numAmount;
        user.totalDeposited += numAmount;
        user.turnoverRequired += numAmount; // সমপরিমাণ টার্নওভার যুক্ত হলো
        await user.save();

        res.status(200).json({ success: true, message: "Deposit successful!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ৫. উত্তোলন শর্ত ও সিকিউরিটি চেক
app.post('/api/user/withdraw', async (req, res) => {
    try {
        const { username, amount, withdrawalPassword } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        // পাসওয়ার্ড চেক
        if (!user.withdrawalPassword || user.withdrawalPassword !== withdrawalPassword) {
            return res.status(400).json({ success: false, message: "সঠিক উত্তোলন পাসওয়ার্ড দিন!" });
        }
        // ডিপোজিট শর্ত চেক (কমপক্ষে ১০০ টাকা)
        if (user.totalDeposited < 100) {
            return res.status(400).json({ success: false, message: "আগে আপনি ১০০ থেকে ৫০০ টাকা ডিপোজিট করুন, তারপর সম্পূর্ণ টাকা উত্তোলন করুন।" });
        }
        // টার্নওভার শর্ত চেক
        if (user.turnoverCompleted < user.turnoverRequired) {
            return res.status(400).json({ success: false, message: `টার্নওভার শর্ত পূরণ হয়নি! প্রয়োজন: ${user.turnoverRequired}, সম্পন্ন: ${user.turnoverCompleted}` });
        }
        // ব্যালেন্স চেক
        if (user.balance < Number(amount)) {
            return res.status(400).json({ success: false, message: "অপর্যাপ্ত ব্যালেন্স!" });
        }

        user.balance -= Number(amount);
        await user.save();
        res.status(200).json({ success: true, message: "Withdrawal request submitted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ৬. অ্যাডমিন প্যানেল সেটিংস
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
        res.status(200).json({ success: true, message: "Settings updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ৭. ২৪ ঘণ্টা লাইভ গেম ও অটো এভিয়েটর ইঞ্জিন (৬০% প্রফিট + ৫০০০x জ্যাকপট)
let specialJackpotCountToday = 0;
let lastResetDate = new Date().toDateString();

function runGameEngine(gameName) {
    const currentDate = new Date().toDateString();
    if (currentDate !== lastResetDate) {
        specialJackpotCountToday = 0;
        lastResetDate = currentDate;
    }

    const totalBet = Math.floor(Math.random() * 100000) + 10000;
    let multiplier = 1.00;

    if (specialJackpotCountToday < 2 && Math.random() < 0.05 && totalBet < 80000) {
        multiplier = (Math.random() * 4999 + 1).toFixed(2);
        specialJackpotCountToday++;
        console.log(`🔥 [JACKPOT ${gameName}] #${specialJackpotCountToday} Hit: ${multiplier}x`);
    } else if (totalBet > 80000) {
        multiplier = (Math.random() * 0.5 + 1).toFixed(2); // সেফ ক্র্যাশ
    } else {
        multiplier = (Math.random() * 8 + 2).toFixed(2);
    }

    const companyProfit = totalBet * 0.60;
    console.log(`[Live Engine - ${gameName}] Total Bet: ${totalBet} | Crash: ${multiplier}x | Company Profit (60%): ${companyProfit.toFixed(2)}`);
}

// ব্যাকগ্রাউন্ডে ২৪ ঘণ্টা গেম চলতে থাকবে (ভবিষ্যতের অন্য এভিয়েটর গেমেও এই ইঞ্জিন ব্যবহার করতে পারবেন)
setInterval(() => {
    runGameEngine("Aviator-Classic");
}, 15000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Clean Server running on port ${PORT}`);
});
