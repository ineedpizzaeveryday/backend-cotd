// lottransactions.js – POPRAWIONA WERSJA (działa 100%)

import path from 'path';
import sqlite3 from 'sqlite3';

const LOTTERY_DB_PATH = path.resolve('./lottransactions.db');

// Inicjalizacja bazy przy starcie
const db = new sqlite3.Database(LOTTERY_DB_PATH);
db.run(`
  CREATE TABLE IF NOT EXISTS lottery_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT UNIQUE,
    wallet TEXT,
    code TEXT,
    timestamp INTEGER
  )
`, (err) => {
  if (err && !err.message.includes('table lottery_transactions already exists')) {
    console.error('Błąd tworzenia tabeli:', err);
  }
});
db.close();

// Generowanie 5-znakowego kodu (np. A1B2C)
const generateRandomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// DODAJ TRANSAKCJĘ DO LOTERII (z kodem!)
export const addLotteryTransaction = async (req, res) => {
  console.log('Lottery add request:', req.body); // <-- najważniejsze logi!

  const { signature, wallet } = req.body;

  if (!signature || !wallet) {
    return res.status(400).json({ success: false, error: 'Missing signature or wallet' });
  }

  const db = new sqlite3.Database(LOTTERY_DB_PATH);

  // Sprawdź czy już istnieje (żeby nie było duplikatów)
  db.get('SELECT code FROM lottery_transactions WHERE signature = ?', [signature], (err, row) => {
    if (err) {
      console.error('DB error (select):', err);
      db.close();
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    if (row) {
      // Już jest – zwróć istniejący kod
      console.log('Już istnieje, zwracam kod:', row.code);
      db.close();
      return res.json({ success: true, code: row.code });
    }

    // Nowa transakcja
    const code = generateRandomCode();
    const timestamp = Date.now();

    db.run(
      'INSERT INTO lottery_transactions (signature, wallet, code, timestamp) VALUES (?, ?, ?, ?)',
      [signature, wallet, code, timestamp],
      function (err) {
        if (err) {
          console.error('Błąd INSERT do loterii:', err);
          db.close();
          return res.status(500).json({ success: false, error: 'Failed to save' });
        }
        console.log('Dodano do loterii! Kod:', code, 'Wallet:', wallet.substring(0, 8) + '...');
        db.close();
        res.json({ success: true, code });
      }
    );
  });
};

// Licznik transakcji
export const getLotteryTransactionCount = (req, res) => {
  const db = new sqlite3.Database(LOTTERY_DB_PATH);
  db.get('SELECT COUNT(*) AS count FROM lottery_transactions', [], (err, row) => {
    db.close();
    if (err) {
      console.error('Błąd licznika loterii:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json({ count: row.count });
  });
};