// lottransactions.js – wersja SQLite (działa na Render bez problemów)
import sqlite3 from 'sqlite3';
import path from 'path';

const IS_RENDER = process.env.RENDER === 'true';
const DB_PATH = IS_RENDER ? '/data/lottery.db' : path.resolve('./lottery.db');

console.log('📍 Lottery DB path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌ Błąd połączenia z lottery.db:', err);
  } else {
    console.log('✅ Połączono z lottery.db');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS lottery_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT UNIQUE NOT NULL,
    wallet TEXT NOT NULL,
    code TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
  )
`, (err) => {
  if (err) console.error('Błąd tworzenia tabeli:', err);
  else console.log('✅ Tabela lottery_transactions gotowa');
});

const generateRandomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

export const addLotteryTransaction = (req, res) => {
  const { signature, wallet } = req.body;

  if (!signature || !wallet) {
    return res.status(400).json({ success: false, error: 'Brak danych' });
  }

  db.get('SELECT code FROM lottery_transactions WHERE signature = ?', [signature], (err, row) => {
    if (err) {
      console.error('Błąd sprawdzania signature:', err);
      return res.status(500).json({ success: false, error: 'DB error' });
    }

    if (row) {
      return res.json({ success: true, code: row.code });
    }

    const code = generateRandomCode();

    db.run(
      'INSERT INTO lottery_transactions (signature, wallet, code) VALUES (?, ?, ?)',
      [signature, wallet, code],
      function (err) {
        if (err) {
          console.error('Błąd INSERT lottery:', err);
          return res.status(500).json({ success: false, error: 'Zapis nieudany' });
        }
        console.log(`🎟 Nowy los: ${code} → ${wallet.slice(0, 8)}...`);
        res.json({ success: true, code });
      }
    );
  });
};

export const getLotteryTransactionCount = (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM lottery_transactions', (err, row) => {
    if (err) {
      console.error('Błąd licznika loterii:', err);
      return res.status(500).json({ error: 'DB error' });
    }

    const realCount = row.count || 0;
    const displayedCount = Math.max(46, realCount); // ← magia tutaj

    res.json({ count: displayedCount });
  });
};