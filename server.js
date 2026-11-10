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

// ইউজার স্কিমা
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// গেম হিস্ট্রি পার্মানেন্ট ডাটাবেস স্কিমা (যাতে অ্যাপ থেকে বের হয়ে আবার ঢুকলেও হিস্ট্রি মুছে না যায়)
const HistorySchema = new mongoose.Schema({
  multiplier: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const GameHistory = mongoose.model('GameHistory', HistorySchema);

app.get('/', (req, res) => res.send('Server is Running'));

// রেজিস্ট্রেশন এপিআই
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

    const newUser = new User({ username, password });
    await newUser.save();
    res.status(201).json({ success: true, message: "Registered successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// লগইন এপিআই
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

// --- গেম লুপ ভেরিয়েবল ---
let gameState = "WAITING"; // WAITING, RUNNING, CRASHED
let multiplier = 1.00;
let countdown = 5;
let roundStartTime = Date.now();

// ক্র্যাশ পয়েন্ট লজিক
function generateCrashPoint() {
  const randomChance = Math.random() * 100;
  if (randomChance < 0.1) {
    return parseFloat((Math.random() * (1000.0 - 500.0) + 500.0).toFixed(2)); 
  } else if (randomChance < 0.6) {
    return parseFloat((Math.random() * (500.0 - 100.0) + 100.0).toFixed(2));
  } else {
    const normalChance = Math.random();
    if (normalChance < 0.60) {
      return parseFloat((Math.random() * (2.00 - 1.01) + 1.01).toFixed(2));
    } else {
      return parseFloat((Math.random() * (15.00 - 2.00) + 2.00).toFixed(2));
    }
  }
}

// ডাটাবেস থেকে সাম্প্রতিক হিস্ট্রি ফেচ করার ফাংশন
async function getRecentHistory() {
  try {
    const histories = await GameHistory.find().sort({ createdAt: -1 }).limit(15);
    return histories.map(h => h.multiplier);
  } catch (err) {
    console.error("History fetch error:", err);
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
    
    // স্মুথ প্রগ্রেসিভ স্পিড লজিক
    if (elapsedSeconds <= 2) {
      multiplier = parseFloat((1.00 + (elapsedSeconds * 0.1)).toFixed(2));
    } else {
      multiplier = parseFloat((1.20 + ((elapsedSeconds - 2) * 0.25)).toFixed(2));
    }
    
    if (multiplier >= crashPoint) {
      multiplier = crashPoint;
      clearInterval(flightInterval);
      gameState = "CRASHED";

      // ডাটাবেসে নতুন ক্র্যাশ পয়েন্ট পার্মানেন্টলি সেভ করা হলো
      try {
        await GameHistory.create({ multiplier });
      } catch (err) {
        console.error("History save error:", err);
      }

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

// ইউজার যখনই কানেক্ট করবে, সাথে সাথে সঠিক পজিশন ও হিস্ট্রি পাঠানো হবে (যাতে কোনো ডিলে বা ০ থেকে শুরু না হয়)
io.on('connection', async (socket) => {
  console.log('⚡ A user connected to live game:', socket.id);
  
  let currentMultiplier = 1.00;
  if (gameState === "RUNNING") {
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    if (elapsedSeconds <= 2) {
      currentMultiplier = parseFloat((1.00 + (elapsedSeconds * 0.1)).toFixed(2));
    } else {
      currentMultiplier = parseFloat((1.20 + ((elapsedSeconds - 2) * 0.25)).toFixed(2));
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
