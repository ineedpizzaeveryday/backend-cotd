// lottransactions.js – WERSJA DZIAŁAJĄCA NA RENDER.COM (i lokalnie)

import path from 'path';
import sqlite3 from 'sqlite3';

// KLUCZOWA ZMIANA – na Renderze baza MUSI być w /data
const IS_RENDER = process.env.RENDER === 'true';
const LOTTERY_DB_PATH = IS_RENDER 
  ? '/data/lottransactions.db' 
  : path.resolve('./lottransactions.db');

console.log('Baza loterii będzie w:', LOTTERY_DB_PATH);

// Inicjalizacja bazy
function initializeLotteryDatabase() {
  const db = new sqlite3.Database(LOTTERY_DB_PATH);

  db.run(`
    CREATE TABLE IF NOT EXISTS lottery_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT UNIQUE,
      wallet TEXT,
      code TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `, (err) => {
    if (err) console.error('Błąd tworzenia tabeli:', err);
    else console.log('Tabela lottery_transactions gotowa');
  });

  // Dodajemy brakujące kolumny (bezpiecznie)
  ['wallet TEXT', 'code TEXT', 'timestamp INTEGER'].forEach(col => {
    db.run(`ALTER TABLE lottery_transactions ADD COLUMN ${col.split(' ')[0]} ${col.split(' ')[1]}`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Błąd dodawania kolumny:', err);
      }
    });
  });

  db.close();
}

initializeLotteryDatabase();

// Generowanie kodu
const generateRandomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

// GŁÓWNA FUNKCJA – TERAZ BEZPIECZNA I Z LOGAMI
export const addLotteryTransaction = (req, res) => {
  console.log('Lottery add → request:', req.body);

  const { signature, wallet } = req.body;

  if (!signature || !wallet) {
    console.log('Brak danych!');
    return res.status(400).json({ success: false, error: 'Missing signature or wallet' });
  }

  const db = new sqlite3.Database(LOTTERY_DB_PATH, (err) => {
    if (err) {
      console.error('Nie można otworzyć bazy loterii!', err);
      return res.status(500).json({ success: false, error: 'Database connection failed' });
    }
  });

  // Czy już istnieje?
  db.get('SELECT code FROM lottery_transactions WHERE signature = ?', [signature], (err, row) => {
    if (err) {
      console.error('Błąd SELECT:', err);
      db.close();
      return res.status(500).json({ success: false });
    }

    if (row) {
      console.log('Już jest w bazie → zwracam kod:', row.code);
      db.close();
      return res.json({ success: true, code: row.code });
    }

    // Nowa transakcja
    const code = generateRandomCode();

    db.run(
      'INSERT INTO lottery_transactions (signature, wallet, code) VALUES (?, ?, ?)',
      [signature, wallet, code],
      function (err) {
        db.close();
        if (err) {
          console.error('Błąd INSERT:', err.message);
          return res.status(500).json({ success: false, error: 'Failed to save' });
        }
        console.log(`Nowy gracz! Kod: ${code} | ${wallet.slice(0,8)}...`);
        res.json({ success: true, code });
      }
    );
  });
};

// Licznik
export const getLotteryTransactionCount = (req, res) => {
  const db = new sqlite3.Database(LOTTERY_DB_PATH, (err) => {
    if (err) {
      console.error('Baza niedostępna (count):', err);
      return res.status(500).json({ error: 'DB error' });
    }
  });

  db.get('SELECT COUNT(*) AS count FROM lottery_transactions', (err, row) => {
    db.close();
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ count: row.count || 0 });
  });
};

export const setupLotteryRoutes = () => {};