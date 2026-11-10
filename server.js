const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// আপনার MongoDB কানেকশন লিংক (ইউজারনেম ও পাসওয়ার্ড সহ)
const MONGO_URI = "mongodb+srv://julhason12_db_user:UFyCegIqLkcrT2CK@cluster0.gywx0rw.mongodb.net/";

// ডাটাবেজ কানেক্ট করা
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Database Connected Successfully!"))
.catch(err => console.log("❌ Database Connection Failed: ", err));

app.get('/', (req, res) => {
    res.send("Game Backend Server is Running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
