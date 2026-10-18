const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = 3000;
const DATA_FILE = path.join(__dirname, 'expenses.json');

app.use(cors());
app.use(express.json());

// serve all HTML files from this folder
app.use(express.static(__dirname));

// ── helpers ────────────────────────────────────────────────────

function readExpenses() {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
}

function writeExpenses(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── who-owes-whom calculation ──────────────────────────────────

function calculateBalances(expenses) {
    if (!expenses.length) return [];

    const paid = {};
    let total = 0;

    expenses.forEach(e => {
        paid[e.payer] = (paid[e.payer] || 0) + e.amount;
        total += e.amount;
    });

    const members = Object.keys(paid);
    const share   = total / members.length;

    const balances = {};
    members.forEach(m => { balances[m] = paid[m] - share; });

    const creditors = members
        .filter(m => balances[m] > 0.005)
        .map(m => ({ name: m, amount: balances[m] }));

    const debtors = members
        .filter(m => balances[m] < -0.005)
        .map(m => ({ name: m, amount: -balances[m] }));

    const settlements = [];
    let ci = 0, di = 0;

    while (ci < creditors.length && di < debtors.length) {
        const settle = Math.min(creditors[ci].amount, debtors[di].amount);
        settlements.push({
            from:   debtors[di].name,
            to:     creditors[ci].name,
            amount: parseFloat(settle.toFixed(2))
        });

        creditors[ci].amount -= settle;
        debtors[di].amount   -= settle;
        if (creditors[ci].amount < 0.005) ci++;
        if (debtors[di].amount   < 0.005) di++;
    }

    return settlements;
}

// ── routes ─────────────────────────────────────────────────────

// GET /api/expenses  — return all expenses
app.get('/api/expenses', (req, res) => {
    try {
        const expenses = readExpenses();
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: 'Could not read expenses.' });
    }
});

// POST /api/expenses  — add a new expense
app.post('/api/expenses', (req, res) => {
    const { description, payer, amount } = req.body;

    if (!description || !payer || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'description, payer, and a positive amount are required.' });
    }

    try {
        const expenses = readExpenses();
        const newExpense = {
            id:          Date.now(),
            description,
            payer,
            amount:      parseFloat(amount.toFixed(2)),
            created_at:  new Date().toISOString()
        };
        expenses.push(newExpense);
        writeExpenses(expenses);
        res.status(201).json(newExpense);
    } catch (err) {
        res.status(500).json({ error: 'Could not save expense.' });
    }
});

// GET /api/balances  — return calculated settlements
app.get('/api/balances', (req, res) => {
    try {
        const expenses    = readExpenses();
        const settlements = calculateBalances(expenses);
        res.json(settlements);
    } catch (err) {
        res.status(500).json({ error: 'Could not calculate balances.' });
    }
});

// ── start ──────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`KT-Impact: SplitExpense server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/homepage.html in your browser`);
});
