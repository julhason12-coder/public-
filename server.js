const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

const MONGO_URI = 'mongodb+srv://julhasonfire208_db_user:wzkJQGWFvDDj88rM@cluster0.jo6xktb.mongodb.net/?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully!'))
  .catch(err => console.log('❌ DB Connection Failed: ', err));

// ইউজার স্কিমা - ব্যালেন্স, টার্নওভার ও উইথড্রল পাসওয়ার্ড সহ
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 10 }, // নতুনদের ১০ টাকা ফ্রি বোনাস
  totalDeposited: { type: Number, default: 0 },
  turnoverRequired: { type: Number, default: 0 },
  turnoverProgress: { type: Number, default: 0 },
  withdrawPassword: { type: String, default: null }
});
const User = mongoose.model('User', UserSchema);

// ট্রানজেকশন হিস্ট্রি স্কিমা
const TransactionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BET', 'BONUS'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'SUCCESS' },
  createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// পার্মানেন্ট গেম হিস্ট্রি ডাটাবেস স্কিমা
const HistorySchema = new mongoose.Schema({
  multiplier: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const GameHistory = mongoose.model('GameHistory', HistorySchema);

app.get('/', (req, res) => res.send('Server is Running'));

// --- ইউজার ব্যালেন্স ও ট্রানজেকশন এপিআই ---

// প্রোফাইল ও ব্যালেন্স চেক
app.post('/api/profile', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });
    
    res.status(200).json({
      success: true,
      balance: user.balance,
      totalDeposited: user.totalDeposited,
      turnoverRequired: user.turnoverRequired,
      turnoverProgress: user.turnoverProgress,
      hasWithdrawPassword: !!user.withdrawPassword
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ডিপোজিট রিকোয়েস্ট
app.post('/api/deposit', async (req, res) => {
  try {
    const { username, amount } = req.body;
    const depositAmount = parseFloat(amount);
    if (!username || isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount!" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });

    user.balance += depositAmount;
    user.totalDeposited += depositAmount;
    user.turnoverRequired += depositAmount; 
    await user.save();

    await Transaction.create({ username, type: 'DEPOSIT', amount: depositAmount });

    res.status(200).json({ success: true, message: "Deposit successful!", balance: user.balance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// উত্তোলনের পাসওয়ার্ড সেট করা
app.post('/api/set-withdraw-password', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Missing fields!" });
    }
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });

    user.withdrawPassword = password;
    await user.save();
    res.status(200).json({ success: true, message: "Withdraw password set successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// উত্তোলন রিকোয়েস্ট (টার্নওভার ও পাসওয়ার্ড ভ্যালিডেশন সহ)
app.post('/api/withdraw', async (req, res) => {
  try {
    const { username, amount, withdrawPassword } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (!username || isNaN(withdrawAmount) || withdrawAmount <= 0 || !withdrawPassword) {
      return res.status(400).json({ success: false, message: "Invalid request!" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });

    if (user.withdrawPassword !== withdrawPassword) {
      return res.status(400).json({ success: false, message: "Incorrect withdrawal password!" });
    }

    if (user.balance < withdrawAmount) {
      return res.status(400).json({ success: false, message: "Insufficient balance!" });
    }

    if (user.totalDeposited < 100) {
      return res.status(400).json({ 
        success: false, 
        message: "শর্ত পূরণ হয়নি! উত্তোলন করতে আগে ১০০ থেকে ৫০০ টাকা ডিপোজিট করুন।" 
      });
    }

    if (user.turnoverProgress < user.turnoverRequired) {
      return res.status(400).json({ 
        success: false, 
        message: "টার্নওভার বাকি আছে! রিকোয়েয়ারমেন্ট সম্পূর্ণ করে উত্তোলন করুন।" 
      });
    }

    user.balance -= withdrawAmount;
    await user.save();

    await Transaction.create({ username, type: 'WITHDRAW', amount: withdrawAmount });

    res.status(200).json({ success: true, message: "Withdrawal request submitted successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ট্রানজেকশন হিস্ট্রি দেখার এন্ডপয়েন্ট
app.post('/api/transactions', async (req, res) => {
  try {
    const { username } = req.body;
    const transactions = await Transaction.find({ username }).sort({ createdAt: -1 }).limit(20);
    res.status(200).json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- গেম হিস্ট্রি ও অথেনটিকেশন এপিআই ---

app.get('/api/history', async (req, res) => {
  try {
    const histories = await GameHistory.find().sort({ createdAt: -1 }).limit(15);
    const historyList = histories.map(h => h.multiplier);
    res.status(200).json({ success: true, history: historyList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password required!" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists!" });
    }

    const newUser = new User({ username, password, balance: 10, totalDeposited: 0 });
    await newUser.save();
    
    await Transaction.create({ username, type: 'BONUS', amount: 10 });

    res.status(201).json({ success: true, message: "Registered successfully with 10 BDT bonus!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password required!" });
    }

    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid username or password!" });
    }

    res.status(200).json({ success: true, message: "Login successful", username: user.username });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- গেম লুপ ---
let gameState = "WAITING";
let multiplier = 1.00;
let countdown = 5;
let roundStartTime = Date.now();
let crashPool = [];

function generateCrashPoint() {
  if (crashPool.length === 0) {
    let pool = [];
    for (let i = 0; i < 12; i++) pool.push(1.00);
    for (let i = 0; i < 8; i++) {
      pool.push(parseFloat((Math.random() * (15.00 - 2.00) + 2.00).toFixed(2)));
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    crashPool = pool;
  }
  return crashPool.shift();
}

async function getRecentHistory() {
  try {
    const histories = await GameHistory.find().sort({ createdAt: -1 }).limit(15);
    return histories.map(h => h.multiplier);
  } catch (err) {
    return [];
  }
}

async function startAviatorGameLoop() {
  gameState = "WAITING";
  multiplier = 1.00;
  countdown = 5;
  roundStartTime = Date.now();

  const history = await getRecentHistory();
  io.emit("game_countdown", { countdown, gameState, history });

  const countdownInterval = setInterval(async () => {
    countdown--;
    const currentHistory = await getRecentHistory();
    io.emit("game_countdown", { countdown, gameState, history: currentHistory });

    if (countdown <= 0) {
      clearInterval(countdownInterval);
      runFlight();
    }
  }, 1000);
}

function runFlight() {
  gameState = "RUNNING";
  multiplier = 1.00;
  roundStartTime = Date.now();
  const crashPoint = generateCrashPoint();
  
  const flightInterval = setInterval(async () => {
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    
    if (crashPoint === 1.00) {
      multiplier = 1.00;
    } else {
      if (elapsedSeconds <= 2) {
        multiplier = parseFloat((1.00 + (elapsedSeconds * 0.15)).toFixed(2));
      } else {
        multiplier = parseFloat((1.30 + ((elapsedSeconds - 2) * 0.3)).toFixed(2));
      }
    }
    
    if (multiplier >= crashPoint) {
      multiplier = crashPoint;
      clearInterval(flightInterval);
      gameState = "CRASHED";

      try {
        await GameHistory.create({ multiplier });
      } catch (err) {}

      const history = await getRecentHistory();
      io.emit("game_crash", { gameState, multiplier, crashPoint, history });

      setTimeout(() => {
        startAviatorGameLoop();
      }, 3000);
      return;
    }

    const history = await getRecentHistory();
    io.emit("game_update", { gameState, multiplier, history });
  }, 100);
}

io.on('connection', async (socket) => {
  console.log('⚡ A user connected to live game:', socket.id);
  
  let currentMultiplier = 1.00;
  if (gameState === "RUNNING") {
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    if (multiplier > 1.00) {
      if (elapsedSeconds <= 2) {
        currentMultiplier = parseFloat((1.00 + (elapsedSeconds * 0.15)).toFixed(2));
      } else {
        currentMultiplier = parseFloat((1.30 + ((elapsedSeconds - 2) * 0.3)).toFixed(2));
      }
    }
  } else if (gameState === "CRASHED") {
    currentMultiplier = multiplier;
  }

  const history = await getRecentHistory();

  socket.emit("sync_game", { 
    gameState, 
    multiplier: currentMultiplier, 
    countdown, 
    history, 
    serverTime: Date.now() 
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

startAviatorGameLoop();

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
