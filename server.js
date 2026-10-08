const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let SYSTEM_CONFIG = {
    BASE_URL: "https://panel.lamix.org/api/v1",
    TOKEN: "cSpzR9cFwnJjXECqcYTmqWvwDIfpyQ9wIAn3pkNYDN0",
    DEFAULT_PAYOUT: 0.05,
    ADMIN_PIN: "1234"
};

let receivedMessages = [];
let userWallet = {
    balance: 0.00,
    todayEarnings: 0.00,
    sevenDayEarnings: 0.00,
    totalSms: 0
};

app.get('/api/ranges', async (req, res) => {
    try {
        const response = await axios.get(`${SYSTEM_CONFIG.BASE_URL}/ranges`, {
            headers: { 'Authorization': `Bearer ${SYSTEM_CONFIG.TOKEN}` },
            timeout: 7000
        });
        res.json({ success: true, ranges: response.data });
    } catch (err) {
        res.json({
            success: true,
            ranges: [
                { id: "us_1", country: "United States (Virtual)", rate: SYSTEM_CONFIG.DEFAULT_PAYOUT },
                { id: "uk_1", country: "United Kingdom", rate: SYSTEM_CONFIG.DEFAULT_PAYOUT }
            ]
        });
    }
});

app.get('/api/refresh-otp', async (req, res) => {
    try {
        const response = await axios.get(`${SYSTEM_CONFIG.BASE_URL}/messages`, {
            headers: { 'Authorization': `Bearer ${SYSTEM_CONFIG.TOKEN}` },
            timeout: 8000
        });

        const messages = Array.isArray(response.data) ? response.data : (response.data.messages || []);
        let newCount = 0;

        messages.forEach(msg => {
            const exists = receivedMessages.some(m => m.id === msg.id);
            if (!exists && msg.id) {
                const payoutAmount = SYSTEM_CONFIG.DEFAULT_PAYOUT;
                userWallet.balance += payoutAmount;
                userWallet.todayEarnings += payoutAmount;
                userWallet.sevenDayEarnings += payoutAmount;
                userWallet.totalSms += 1;

                receivedMessages.unshift({
                    id: msg.id,
                    number: msg.number || "N/A",
                    sender: msg.sender || msg.cli || "OTP Sender",
                    text: msg.text || msg.message || "No Text",
                    earned: payoutAmount,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                });
                newCount++;
            }
        });

        res.json({
            success: true,
            newCount,
            wallet: userWallet,
            messages: receivedMessages
        });
    } catch (err) {
        if (err.response && err.response.status === 429) {
            return res.status(429).json({ error: "Wait 5s before refreshing." });
        }
        res.status(500).json({ error: "Error fetching messages" });
    }
});

app.get('/api/admin/get-config', (req, res) => {
    res.json({
        baseUrl: SYSTEM_CONFIG.BASE_URL,
        token: SYSTEM_CONFIG.TOKEN,
        defaultPayout: SYSTEM_CONFIG.DEFAULT_PAYOUT,
        wallet: userWallet
    });
});

app.post('/api/admin/update-config', (req, res) => {
    const { pin, baseUrl, token, defaultPayout } = req.body;
    if (pin !== SYSTEM_CONFIG.ADMIN_PIN) {
        return res.status(403).json({ error: "ভুল এডমিন পিন!" });
    }
    if (baseUrl) SYSTEM_CONFIG.BASE_URL = baseUrl.trim();
    if (token) SYSTEM_CONFIG.TOKEN = token.trim();
    if (defaultPayout) SYSTEM_CONFIG.DEFAULT_PAYOUT = parseFloat(defaultPayout);

    res.json({ success: true, message: "সেটিংস আপডেট হয়েছে!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
