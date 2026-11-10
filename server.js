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

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const User = mongoose.model('User', UserSchema);

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

// ক্র্যাশ পয়েন্ট এবং কোম্পানির ৬০% ও ইউজারের প্রফিট ব্যালেন্স লজিক
function generateCrashPoint() {
  const randomChance = Math.random() * 100;

  // ২৪ ঘণ্টার মধ্যে মেগা মাল্টিপ্লেয়ার (১০০x থেকে ১০০০x) আসার বিরল সুযোগ
  if (randomChance < 0.1) {
    return parseFloat((Math.random() * (1000.0 - 500.0) + 500.0).toFixed(2)); 
  } else if (randomChance < 0.6) {
    return parseFloat((Math.random() * (500.0 - 100.0) + 100.0).toFixed(2));
  } else {
    // ৬০% ক্ষেত্রে দ্রুত ক্র্যাশ (কোম্পানির প্রফিট সিকিউর করতে) এবং বাকি ৪০% ইউজারদের জন্য
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

  const countdownInterval = setInterval(() => {
    countdown--;
    io.emit("game_countdown", { countdown, gameState });

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
    // সময়ের সাথে নিখুঁতভাবে মাল্টিপ্লেয়ার বাড়ানো
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    multiplier = parseFloat((1.00 + (elapsedSeconds * 0.1)).toFixed(2));
    
    if (multiplier >= crashPoint) {
      multiplier = crashPoint;
      clearInterval(flightInterval);
      gameState = "CRASHED";
      io.emit("game_crash", { gameState, multiplier, crashPoint });

      // ৩ সেকেন্ড ক্র্যাশ দেখিয়ে আবার নতুন কাউন্টডাউন ও রাউন্ড শুরু হবে
      setTimeout(() => {
        startAviatorGameLoop();
      }, 3000);
      return;
    }

    io.emit("game_update", { gameState, multiplier });
  }, 100);
}

// যেকোনো ইউজার যখনই গেমে প্রবেশ করবে, সার্ভার তাকে বর্তমান রিয়েল-টাইম সঠিক পজিশন পাঠিয়ে দিবে
io.on('connection', (socket) => {
  console.log('⚡ A user connected to live game:', socket.id);
  
  let currentMultiplier = 1.00;
  if (gameState === "RUNNING") {
    const elapsedSeconds = (Date.now() - roundStartTime) / 1000;
    currentMultiplier = parseFloat((1.00 + (elapsedSeconds * 0.1)).toFixed(2));
  } else if (gameState === "CRASHED") {
    currentMultiplier = multiplier;
  }

  socket.emit("sync_game", { 
    gameState, 
    multiplier: currentMultiplier, 
    countdown, 
    serverTime: Date.now() 
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// গেম লুপ চালু করা হলো
startAviatorGameLoop();

// Render-এর ডায়নামিক পোর্ট নেওয়ার জন্য process.env.PORT ব্যবহার করা হয়েছে
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
