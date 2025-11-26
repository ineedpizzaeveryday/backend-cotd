// lottransactions.js – WERSJA FINALNA, DZIAŁAJĄCA 100%

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// Ścieżka do bazy loterii
const LOTTERY_DB_PATH = path.resolve('./lottransactions.db');

// Inicjalizacja bazy danych przy uruchomieniu modułu
function initializeLotteryDatabase() {
  const db = new sqlite3.Database(LOTTERY_DB_PATH);

  // Tworzymy tabelę z kolumnami: signature (unikalne), wallet i code
  db.run(`
    CREATE TABLE IF NOT EXISTS lottery_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT UNIQUE,
      wallet TEXT,
      code TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `, (err) => {
    if (err) {
      console.error('Error creating lottery_transactions table:', err);
    } else {
      console.log('lottery_transactions table ready.');
    }
  });

  // Dodajemy kolumnę wallet jeśli nie istnieje (bezpieczne)
  db.run(`ALTER TABLE lottery_transactions ADD COLUMN wallet TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding wallet column:', err);
    }
  });

  // Dodajemy kolumnę code jeśli nie istnieje
  db.run(`ALTER TABLE lottery_transactions ADD COLUMN code TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding code column:', err);
    }
  });

  // Dodajemy kolumnę timestamp jeśli nie istnieje
  db.run(`ALTER TABLE lottery_transactions ADD COLUMN timestamp INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding timestamp column:', err);
    }
  });

  db.close();
}

// Uruchamiamy inicjalizację od razu
initializeLotteryDatabase();

// Generowanie losowego 5-znakowego kodu (np. A7K9M)
const generateRandomCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// GŁÓWNA FUNKCJA – DODAWANIE DO LOTERII (teraz z kodem i walletem!)
const addLotteryTransaction = (req, res) => {
  console.log('Lottery join request:', req.body); // ← najważniejsze logi

  const { signature, wallet } = req.body;

  if (!signature || !wallet) {
    console.log('Brak signature lub wallet!');
    return res.status(400).json({ success: false, error: 'Missing signature or wallet' });
  }

  const db = new sqlite3.Database(LOTTERY_DB_PATH);

  // Sprawdzamy czy transakcja już jest w bazie
  db.get('SELECT code FROM lottery_transactions WHERE signature = ?', [signature], (err, row) => {
    if (err) {
    console.error('DB error (select):', err);
      db.close();
      return res.status(500).json({ success: false });
    }

    if (row) {
      // Już istnieje – zwracamy istniejący kod
      console.log('Transakcja już dodana. Zwracam kod:', row.code);
      db.close();
      return res.json({ success: true, code: row.code });
    }

    // Nowa transakcja → generujemy kod i zapisujemy
    const code = generateRandomCode();

    db.run(
      `INSERT INTO lottery_transactions (signature, wallet, code) VALUES (?, ?, ?)`,
      [signature, wallet, code],
      function (err) {
        db.close();
        if (err) {
          console.error('Błąd zapisu do loterii:', err.message);
          return res.status(500).json({ success: false, error: 'Database error' });
        }

        console.log(`Gracz dołączył! Kod: ${code} | Wallet: ${wallet.slice(0, 8)}...`);
        res.json({ success: true, code });
      }
    );
  });
};

// Licznik uczestników
const getLotteryTransactionCount = (req, res) => {
  const db = new sqlite3.Database(LOTTERY_DB_PATH);
  db.get('SELECT COUNT(*) AS count FROM lottery_transactions', [], (err, row) => {
    db.close();
    if (err) {
      console.error('Error fetching lottery count:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json({ count: row.count || 0 });
  });
};

// Ta funkcja nie jest już potrzebna (zostawiamy dla kompatybilności, ale nie używamy)
const setupLotteryRoutes = (app) => {
  console.warn('setupLotteryRoutes is deprecated – use addLotteryTransaction directly');
};

export { setupLotteryRoutes, addLotteryTransaction, getLotteryTransactionCount };