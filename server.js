const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegiLkcrT2C@cluster0.gwyx0rm.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected Successfully!"))
.catch(err => console.log("❌ DB Connection Failed: ", err));

// একদম সাধারণ ইউজার স্কিমা
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

app.get('/', (req, res) => {
    res.send("Server is Running!");
});

// রেজিস্ট্রেশন এপিআই
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ success: true, message: "Registration successful!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// লগইন এপিআই
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
