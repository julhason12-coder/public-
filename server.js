const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// আপনার MongoDB কানেকশন লিংক
const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegiLkcrT2C@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Failed: ", err));

// ==========================================
// ১. ডাটাবেজ স্কিমা ও মডেল (ইউজার ও অ্যাডমিন সেটিংস)
// ==========================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    withdrawalPassword: { type: String, default: "" }, // উত্তোলনের জন্য আলাদা পাসওয়ার্ড
    balance: { type: Number, default: 0 },
    bonusBalance: { type: Number, default: 10 }, // রেজিস্ট্রেশনে ফ্রি ১০ টাকা বোনাস
    totalDeposited: { type: Number, default: 0 }, // মোট ডিপোজিট অ্যামাউন্ট
    turnoverRequired: { type: Number, default: 0 }, // উত্তোলনের জন্য প্রয়োজনীয় টার্নওভার
    turnoverCompleted: { type: Number, default: 0 }, // বর্তমান কমপ্লিট টার্নওভার
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
    res.send("Game Backend, Admin & Security Server is Running!");
});

// ==========================================
// ২. ইউজার অথেন্টিকেশন (রেজিস্ট্রেশন ও লগইন)
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ success: false, message: "Username already exists!" });

        // নতুন ইউজারের জন্য ফ্রি ১০ টাকা বোনাসসহ অ্যাকাউন্ট তৈরি
        const newUser = new User({ username, password, balance: 0, bonusBalance: 10 });
        await newUser.save();
        
        res.status(201).json({ success: true, message: "Registration successful! You received 10 BDT bonus." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ success: false, message: "Invalid username or password!" });

        res.status(200).json({ success: true, message: "Login successful", user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ৩. উত্তোলনের আলাদা পাসওয়ার্ড সেট করার লজিক
// ==========================================
app.post('/api/user/set-withdrawal-password', async (req, res) => {
    try {
        const { username, withdrawalPassword } = req.body;
        await User.findOneAndUpdate({ username }, { withdrawalPassword });
        res.status(200).json({ success: true, message: "Withdrawal password saved successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ৪. ডিপোজিট ও টার্নওভার (Turnover) লজিক
// ==========================================
app.post('/api/user/deposit', async (req, res) => {
    try {
        const { username, amount } = req.body;
        if (amount <= 0) return res.status(400).json({ success: false, message: "Invalid deposit amount!" });

        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        // ডিপোজিট ব্যালেন্স যোগ হবে এবং ঠিক সমপরিমাণ টার্নওভার রিকোয়ারমেন্ট যোগ হবে
        user.balance += amount;
        user.totalDeposited += amount;
        user.turnoverRequired += amount; // ডিপোজিট করার পর সমপরিমাণ টার্নওভার দিতে হবে
        await user.save();

        res.status(200).json({ success: true, message: `Deposit of ${amount} BDT successful! Turnover target updated.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// গেম খেলার সময় টার্নওভার প্রোগ্রেস আপডেট করার এপিআই
app.post('/api/game/play-bet', async (req, res) => {
    try {
        const { username, betAmount } = req.body;
        const user = await User.findOne({ username });
        if (!user || user.balance < betAmount) return res.status(400).json({ success: false, message: "Insufficient balance!" });

        user.balance -= betAmount;
        user.turnoverCompleted += betAmount; // গেমে বেট ধরার সাথে সাথে টার্নওভার কমপ্লিট হতে থাকবে
        await user.save();

        res.status(200).json({ success: true, message: "Bet placed and turnover updated", user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ৫. উত্তোলন (Withdrawal) সিকিউরিটি ও কন্ডিশন লজিক
// ==========================================
app.post('/api/user/withdraw', async (req, res) => {
    try {
        const { username, amount, withdrawalPassword } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, message: "User not found!" });

        // কন্ডিশন ১: উত্তোলন পাসওয়ার্ড সঠিক হতে হবে
        if (!user.withdrawalPassword || user.withdrawalPassword !== withdrawalPassword) {
            return res.status(400).json({ success: false, message: "সঠিক উত্তোলন পাসওয়ার্ড দিন! এই পাসওয়ার্ড ছাড়া টাকা উত্তোলন করা যাবে না।" });
        }

        // কন্ডিশন ২: শুধু ফ্রি বোনাস নিয়ে উত্তোলন করা যাবে না (১০০ থেকে ৫০০ টাকা ডিপোজিট করার শর্ত)
        if (user.totalDeposited < 100) {
            return res.status(400).json({ 
                success: false, 
                message: "আগে আপনি ১০০ থেকে ৫০০ টাকা ডিপোজিট করুন, তারপর সম্পূর্ণ টাকা উত্তোলন করুন।" 
            });
        }

        // কন্ডিশন ৩: ডিপোজিট করার পর সমপরিমাণ টার্নওভার (Turnover) কমপ্লিট করতে হবে
        if (user.turnoverCompleted < user.turnoverRequired) {
            return res.status(400).json({ 
                success: false, 
                message: `উত্তোলনের জন্য আপনার টার্নওভার শর্ত পূরণ হয়নি! আপনার প্রয়োজন: ${user.turnoverRequired}, সম্পন্ন হয়েছে: ${user.turnoverCompleted}` 
            });
        }

        if (user.balance < amount) {
            return res.status(400).json({ success: false, message: "Insufficient balance for withdrawal!" });
        }

        user.balance -= amount;
        await user.save();

        res.status(200).json({ success: true, message: "Withdrawal request submitted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ৬. অ্যাডমিন প্যানেল কন্ট্রোল (লগইন, সেটিংস ও নম্বর আপডেট)
// ==========================================
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "admin123") {
        res.status(200).json({ success: true, message: "Admin login successful", token: "admin_token_secure" });
    } else {
        res.status(401).json({ success: false, message: "Invalid admin credentials!" });
    }
});

// অ্যাডমিন প্যানেল থেকে ডিপোজিট/উত্তোলন নম্বর দেখার বা পরিবর্তনের এপিআই
app.get('/api/admin/settings', async (req, res) => {
    let settings = await Settings.findOne({ key: "global_settings" });
    if (!settings) settings = await Settings.create({ key: "global_settings" });
    res.status(200).json({ success: true, settings });
});

app.post('/api/admin/update-settings', async (req, res) => {
    try {
        const { depositNumber, withdrawalNumber, minDeposit, minWithdraw } = req.body;
        let settings = await Settings.findOne({ key: "global_settings" });
        if (!settings) {
            settings = new Settings({ key: "global_settings" });
        }
        if (depositNumber) settings.depositNumber = depositNumber;
        if (withdrawalNumber) settings.withdrawalNumber = withdrawalNumber;
        if (minDeposit) settings.minDeposit = minDeposit;
        if (minWithdraw) settings.minWithdraw = minWithdraw;
        
        await settings.save();
        res.status(200).json({ success: true, message: "Admin settings & payment numbers updated successfully!", settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ৭. ২৪ ঘণ্টা অটোমেটিক গেম ইঞ্জিন (৬০% প্রফিট + ৪০% পুল + ৫০০০x জ্যাকপট)
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

    // ২৪ ঘণ্টার ভেতরে সর্বোচ্চ ২ বার ১x থেকে ৫০০০x জ্যাকপট হিট করার লজিক
    if (specialJackpotCountToday < 2 && Math.random() < 0.05 && totalBetAmount < 80000) {
        multiplier = (Math.random() * (5000.00 - 1.00) + 1.00).toFixed(2);
        specialJackpotCountToday++;
        roundType = `🔥 SPECIAL JACKPOT (${gameName}) #${specialJackpotCountToday} 🔥`;
    } 
    else if (totalBetAmount > 100000 || activeUsersCount > 1000) {
        // অতিরিক্ত ট্রাফিক বা বেট বেশি হলে কোম্পানি সেফ রাখতে দ্রুত ক্র্যাশ (১.০০x - ১.৫০x)
        multiplier = (Math.random() * (1.50 - 1.00) + 1.00).toFixed(2);
        roundType = `Safe Company Round (${gameName})`;
    } 
    else {
        multiplier = (Math.random() * (10.00 - 2.00) + 2.00).toFixed(2);
        roundType = `Normal Round (${gameName})`;
    }

    const companyProfit = totalBetAmount * 0.60;
    const userDistributionPool = totalBetAmount * 0.40;

    console.log(`--------------------------------------------------`);
    console.log(`🔄 [${roundType}] Time: ${new Date().toLocaleTimeString()}`);
    console.log(`👥 Active Users: ${activeUsersCount} | 💰 Total Bet: ${totalBetAmount}`);
    console.log(`💥 Crash Multiplier: ${multiplier}x`);
    console.log(`🏢 Company Share (60%): ${companyProfit.toFixed(2)}`);
    console.log(`👥 User Payout Pool (40%): ${userDistributionPool.toFixed(2)}`);
}

// ২৪ ঘণ্টা ব্যাকগ্রাউন্ডে গেমের জন্য এই ইঞ্জিন রান করবে
setInterval(() => {
    runGameEngine("Aviator-Game-1");
}, 15000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running smoothly on port ${PORT}`);
});
