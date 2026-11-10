const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// আপনার আসল MongoDB কানেকশন লিংক (ইউজারনেম ও পাসওয়ার্ড সহ)
const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegiLkcrT2C@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Failed: ", err));

// ==========================================
// ১. ডাটাবেজ স্কিমা ও মডেল
// ==========================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    withdrawalPassword: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    bonusBalance: { type: Number, default: 10 },
    totalDeposited: { type: Number, default: 0 },
    turnoverRequired: { type: Number, default: 0 },
    turnoverCompleted: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: "global_settings" },
    depositNumber: { type: String, default: "01700000000 (bKash/Nagad)" },
    withdrawalNumber: { type: String, default: "01800000000" },
    minDeposit: { type: Number, default: 100 },
    minWithdraw: { type: Number, default: 500 }
});
const Settings = mongoose.model('Settings', settingsSchema);

// বেস রুট
app.get('/', (req, res) => {
    res.send("Game Backend & Security Server is Running!");
});

// ==========================================
// ২. ইউজার রেজিস্ট্রেশন
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already exists!" });
        }

        const newUser = new User({ 
            username, 
            password, 
            balance: 0, 
            bonusBalance: 10 
        });
        await newUser.save();
        
        res.status(201).json({ success: true, message: "Registration successful! You received 10 BDT bonus." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// ৩. ইউজার লগইন
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid username or password!" });
        }

        res.status(200).json({ 
            success: true, 
            message: "Login successful", 
            user: {
                username: user.username,
                balance: user.balance,
                bonusBalance: user.bonusBalance,
                totalDeposited: user.totalDeposited
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// ৪. উত্তোলনের পাসওয়ার্ড ও টার্নওভার লজিক
// ==========================================
app.post('/api/user/set-withdrawal-password', async (req, res) => {
    try {
        const { username, withdrawalPassword } = req.body;
        await User.findOneAndUpdate({ username }, { withdrawalPassword });
        res.status(200).json({ success: true, message: "Withdrawal password saved successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/user/deposit', async (req, res) => {
    try {
        const { username, amount } = req.body;
        if (amount <= 0) return res.status(400).json({ success: false, message: "Invalid deposit amount!" });

        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        user.balance += amount;
        user.totalDeposited += amount;
        user.turnoverRequired += amount; 
        await user.save();

        res.status(200).json({ success: true, message: `Deposit of ${amount} BDT successful!` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/user/withdraw', async (req, res) => {
    try {
        const { username, amount, withdrawalPassword } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        if (!user.withdrawalPassword || user.withdrawalPassword !== withdrawalPassword) {
            return res.status(400).json({ success: false, message: "সঠিক উত্তোলন পাসওয়ার্ড দিন!" });
        }

        if (user.totalDeposited < 100) {
            return res.status(400).json({ 
                success: false, 
                message: "আগে আপনি ১০০ থেকে ৫০০ টাকা ডিপোজিট করুন, তারপর সম্পূর্ণ টাকা উত্তোলন করুন।" 
            });
        }

        if (user.turnoverCompleted < user.turnoverRequired) {
            return res.status(400).json({ 
                success: false, 
                message: `উত্তোলনের জন্য টার্নওভার শর্ত পূরণ হয়নি! প্রয়োজন: ${user.turnoverRequired}, সম্পন্ন: ${user.turnoverCompleted}` 
            });
        }

        if (user.balance < amount) {
            return res.status(400).json({ success: false, message: "Insufficient balance!" });
        }

        user.balance -= amount;
        await user.save();

        res.status(200).json({ success: true, message: "Withdrawal request submitted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// ৫. অ্যাডমিন প্যানেল কন্ট্রোল
// ==========================================
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "admin123") {
        res.status(200).json({ success: true, message: "Admin login successful" });
    } else {
        res.status(401).json({ success: false, message: "Invalid admin credentials!" });
    }
});

app.get('/api/admin/settings', async (req, res) => {
    let settings = await Settings.findOne({ key: "global_settings" });
    if (!settings) settings = await Settings.create({ key: "global_settings" });
    res.status(200).json({ success: true, settings });
});

app.post('/api/admin/update-settings', async (req, res) => {
    try {
        const { depositNumber, withdrawalNumber, minDeposit, minWithdraw } = req.body;
        let settings = await Settings.findOne({ key: "global_settings" });
        if (!settings) settings = new Settings({ key: "global_settings" });
        
        if (depositNumber) settings.depositNumber = depositNumber;
        if (withdrawalNumber) settings.withdrawalNumber = withdrawalNumber;
        if (minDeposit) settings.minDeposit = minDeposit;
        if (minWithdraw) settings.minWithdraw = minWithdraw;
        
        await settings.save();
        res.status(200).json({ success: true, message: "Settings updated successfully!", settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// ৬. ২৪ ঘণ্টা অটোমেটিক গেম ইঞ্জিন (৬০% প্রফিট + ৫০০০x জ্যাকপট)
// ==========================================
let specialJackpotCountToday = 0;
let lastResetDate = new Date().toDateString();

function runGameEngine(gameName) {
    const currentDate = new Date().toDateString();
    if (currentDate !== lastResetDate) {
        specialJackpotCountToday = 0;
        lastResetDate = currentDate;
    }

    const totalBetAmount = Math.floor(Math.random() * (150000 - 20000 + 1)) + 20000; 
    const activeUsersCount = Math.floor(Math.random() * (5000 - 50 + 1)) + 50; 

    let multiplier = 1.00;
    let roundType = "Standard Round";

    if (specialJackpotCountToday < 2 && Math.random() < 0.05 && totalBetAmount < 80000) {
        multiplier = (Math.random() * (5000.00 - 1.00) + 1.00).toFixed(2);
        specialJackpotCountToday++;
        roundType = `🔥 SPECIAL JACKPOT (${gameName}) #${specialJackpotCountToday} 🔥`;
    } 
    else if (totalBetAmount > 100000 || activeUsersCount > 1000) {
        multiplier = (Math.random() * (1.50 - 1.00) + 1.00).toFixed(2);
        roundType = `Safe Company Round (${gameName})`;
    } 
    else {
        multiplier = (Math.random() * (10.00 - 2.00) + 2.00).toFixed(2);
        roundType = `Normal Round (${gameName})`;
    }

    const companyProfit = totalBetAmount * 0.60;
    const userDistributionPool = totalBetAmount * 0.40;

    console.log(`[${roundType}] Bet: ${totalBetAmount} | Multiplier: ${multiplier}x | Company Profit: ${companyProfit.toFixed(2)}`);
}

setInterval(() => {
    runGameEngine("Aviator-Game-1");
}, 15000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
