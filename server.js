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
    res.status(201).json({ success: false, message: "Registered successfully!" }); // Note: Keep success true or as needed
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

// --- ২৪ ঘণ্টা রিয়েল-টাইম এভিয়েটর গেম লুপ (প্রফিট ও মেগা মাল্টিপ্লেয়ার রেশিও সহ) ---
let gameState = "WAITING"; // WAITING, RUNNING, CRASHED
let multiplier = 1.00;
let countdown = 5;

// ক্র্যাশ পয়েন্ট নির্ধারণের জন্য এনালাইটিক্যাল লজিক
function generateCrashPoint() {
  const randomChance = Math.random() * 100;

  // ২৪ ঘণ্টার মধ্যে খুব কম ফ্রিকোয়েন্সিতে ১০০০x বা মেগা মাল্টিপ্লেয়ার আসার লজিক (যেমন ০.১% চান্স)
  if (randomChance < 0.1) {
    return parseFloat((Math.random() * (1000.0 - 500.0) + 500.0).toFixed(2)); // ৫০০x থেকে ১০০০x
  } 
  // ১০০x থেকে ৫০০x আসার চান্স (যেমন ০.৫%)
  else if (randomChance < 0.6) {
    return parseFloat((Math.random() * (500.0 - 100.0) + 100.0).toFixed(2));
  } 
  // বাকি সাধারণ সময়ে কোম্পানি ৬০% প্রফিট এবং ইউজারদের ৪০-৩৫% উইনিং ধরে ছোট বা মাঝারি মাল্টিপ্লেয়ার (১.০১x থেকে ১০.০০x)
  else {
    // হাউজ এজ বা কোম্পানির প্রফিট ৬০% নিশ্চিত করতে বেশিরভাগ ক্র্যাশ দ্রুত (১.০১x - ২.০০x এর মধ্যে) সেট করা হয়
    const normalChance = Math.random();
    if (normalChance < 0.60) {
      // ৬০% ক্ষেত্রে দ্রুত ক্র্যাশ (কোম্পানির প্রফিট নিশ্চিত করতে)
      return parseFloat((Math.random() * (2.00 - 1.01) + 1.01).toFixed(2));
    } else {
      // বাকি ৪০% ক্ষেত্রে ইউজারদের প্রফিট দেওয়ার জন্য একটু বেশি মাল্টিপ্লেয়ার (২.০০x থেকে ১৫.০০x)
      return parseFloat((Math.random() * (15.00 - 2.00) + 2.00).toFixed(2));
    }
  }
}

function startAviatorGameLoop() {
  gameState = "WAITING";
  multiplier = 1.00;
  countdown = 5;

  const countdownInterval = setInterval(() => {
    countdown--;
    io.emit("game_countdown", { countdown });

    if (countdown <= 0) {
      clearInterval(countdownInterval);
      runFlight();
    }
  }, 1000);
}

function runFlight() {
  gameState = "RUNNING";
  const crashPoint = generateCrashPoint();
  
  const flightInterval = setInterval(() => {
    // মাল্টিপ্লেয়ার বৃদ্ধির গতি (বড় মাল্টিপ্লেয়ারের ক্ষেত্রে গতি মানিয়ে নেওয়া)
    const increment = multiplier > 10 ? 0.5 : (multiplier > 5 ? 0.2 : 0.05);
    multiplier = parseFloat((multiplier + increment).toFixed(2));
    
    io.emit("game_update", { gameState, multiplier });

    if (multiplier >= crashPoint) {
      clearInterval(flightInterval);
      gameState = "CRASHED";
      io.emit("game_crash", { gameState, multiplier, crashPoint });

      // ৩ সেকেন্ড ক্র্যাশ স্ক্রিন দেখিয়ে পরবর্তী রাউন্ড শুরু হবে
      setTimeout(() => {
        startAviatorGameLoop();
      }, 3000);
    }
  }, 100);
}

// ইউজার কানেক্ট হলে লাইভ গেম স্টেট পাঠানো
io.on('connection', (socket) => {
  console.log('⚡ A user connected to live game:', socket.id);
  
  socket.emit("sync_game", { gameState, multiplier, countdown });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// গেম লুপ চালু করা হলো
startAviatorGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
