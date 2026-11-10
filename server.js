const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const MONGO_URI = 'mongodb+srv://julhasonfire208_db_user:wzkJQGWFvDDj88rM@cluster0.jo6xktb.mongodb.net/?retryWrites=true&w=majority';

// MongoDB কানেকশন
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully!'))
  .catch(err => console.log('❌ DB Connection Failed: ', err));

// ইউজার স্কিমা ও মডেল
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const User = mongoose.model('User', UserSchema);

// রুট চেক
app.get('/', (req, res) => res.send('Server is Running'));

// ১. রেজিস্ট্রেশন এপিআই (ডুপ্লিকেট ইউজার চেক ও প্রপার রেসপন্স সহ)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required!" });
    }

    // আগের কোনো ইউজার আছে কি না চেক করা
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Username already exists!" });
    }

    const newUser = new User({ username, password });
    await newUser.save();
    
    res.status(201).json({ success: true, message: "Registered successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ২. লগইন এপিআই
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required!" });
    }

    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials!" });
    }

    res.status(200).json({ success: true, message: "Login successful", username: user.username });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
