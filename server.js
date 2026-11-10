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

// গেম হিস্ট্রি পার্মানেন্ট বা সাময়িকভাবে ধরে রাখার জন্য স্কিমা বা অ্যারে
const flightHistory = []; // সাম্প্রতিক ক্র্যাশ হিস্ট্রি ধরে রাখার জন্য (সর্বোচ্চ ২০টি)

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

// --- ২৪ ঘণ্টা সেন্ট্রালাইজড রিয়েল-টাইম এভিয়েটর গেম লুপ ---
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

function startAviatorGameLoop() {
  gameState = "WAITING";
  multiplier = 1.00;
  countdown = 5;
  roundStartTime = Date.now();

  io.emit("game_countdown", { countdown, gameState, history: flightHistory });

  const countdownInterval = setInterval(() => {
    countdown--;
    io.emit("game_countdown", { countdown, gameState, history: flightHistory });

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
  
  const flightInterval = setInterval(() => {
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    
    // আপনার চাহিদা অনুযায়ী স্পিড লজিক: 
    // ২x এর নিচে একরকম স্পিড থাকবে, ২x পার হওয়ার পর স্পিড ও প্রোগ্রেস আরও স্মুথ ও স্টেপ বাই স্টেপ বাড়বে
    if (multiplier < 2.00) {
      multiplier = parseFloat((1.00 + (elapsedSeconds * 0.15)).toFixed(2));
    } else {
      // ২x এর পর প্রোগ্রেসিভলি স্পিড বাড়তে থাকবে
      multiplier = parseFloat((2.00 + ((elapsedSeconds - 5) * 0.3)).toFixed(2));
    }
    
    if (multiplier >= crashPoint) {
      multiplier = crashPoint;
      clearInterval(flightInterval);
      gameState = "CRASHED";

      // নতুন ক্র্যাশ পয়েন্ট হিস্ট্রিতে যোগ করা হলো এবং সর্বশেষ ২০টি রাখা হলো
      flightHistory.unshift(multiplier);
      if (flightHistory.length > 20) flightHistory.pop();

      io.emit("game_crash", { gameState, multiplier, crashPoint, history: flightHistory });

      setTimeout(() => {
        startAviatorGameLoop();
      }, 3000);
      return;
    }

    io.emit("game_update", { gameState, multiplier, history: flightHistory });
  }, 100);
}

// ইউজার যখনই কানেক্ট করবে, তাকে বর্তমান স্টেট ও পুরনো হিস্ট্রি পাঠিয়ে দেওয়া হবে
io.on('connection', (socket) => {
  console.log('⚡ A user connected to live game:', socket.id);
  
  let currentMultiplier = 1.00;
  if (gameState === "RUNNING") {
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    if (multiplier < 2.00) {
      currentMultiplier = parseFloat((1.00 + (elapsedSeconds * 0.15)).toFixed(2));
    } else {
      currentMultiplier = parseFloat((2.00 + ((elapsedSeconds - 5) * 0.3)).toFixed(2));
    }
  } else if (gameState === "CRASHED") {
    currentMultiplier = multiplier;
  }

  socket.emit("sync_game", { 
    gameState, 
    multiplier: currentMultiplier, 
    countdown, 
    history: flightHistory, // হিস্ট্রি পাঠানো হলো যাতে রিফ্রেশ করলেই দেখতে পায়
    serverTime: Date.now() 
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

startAviatorGameLoop();

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
