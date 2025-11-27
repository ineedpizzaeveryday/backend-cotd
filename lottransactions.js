// lottransactions.js – WERSJA 100% TRWAŁA (Render + lokalnie)
import sqlite3 from 'sqlite3';
import path from 'path';

// KLUCZOWE: stała ścieżka do pliku – zawsze ten sam plik!
const IS_RENDER = process.env.RENDER === 'true';
const DB_PATH = IS_RENDER 
  ? '/data/lottransactions.db' 
  : path.join(process.cwd(), 'lottransactions.db');  // <-- ZMIANA!

console.log('Baza loterii:', DB_PATH);

// Jedna instancja bazy – nie zamykamy jej nigdy!
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('BŁĄD POŁĄCZENIA Z BAZĄ LOTERII:', err);
    process.exit(1);
  } else {
    console.log('Połączono z bazą loterii:', DB_PATH);
  }
});

// Tworzymy tabelę tylko raz
db.serialize(() => {
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
    else console.log('Tabela lottery_transactions gotowa');
  });
});

// Generowanie kodu
const generateRandomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

// GŁÓWNA FUNKCJA – teraz trwała!
export const addLotteryTransaction = (req, res) => {
  const { signature, wallet } = req.body;

  if (!signature || !wallet) {
    return res.status(400).json({ success: false, error: 'Brak danych' });
  }

  // Sprawdzamy czy już istnieje
  db.get('SELECT code FROM lottery_transactions WHERE signature = ?', [signature], (err, row) => {
    if (err) {
      console.error('Błąd SELECT:', err);
      return res.status(500).json({ success: false, error: 'DB error' });
    }

    if (row) {
      console.log(`Już istnieje: ${wallet} → ${row.code}`);
      return res.json({ success: true, code: row.code });
    }

    const code = generateRandomCode();

    db.run(
      'INSERT INTO lottery_transactions (signature, wallet, code) VALUES (?, ?, ?)',
      [signature, wallet, code],
      function (err) {
        if (err) {
          console.error('Błąd INSERT:', err);
          return res.status(500).json({ success: false, error: 'Zapis nieudany' });
        }
        console.log(`NOWY LOS: ${code} → ${wallet.slice(0,8)}...`);
        res.json({ success: true, code });
      }
    );
  });
};

// Licznik – trwały!
export const getLotteryTransactionCount = (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM lottery_transactions', (err, row) => {
    if (err) {
      console.error('Błąd licznika:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ count: row.count || 0 });
  });
};

// Zabezpieczenie przed zamknięciem bez zapisu
process.on('SIGINT', () => {
  console.log('\nZamykanie serwera... zapisuję bazę loterii...');
  db.close((err) => {
    if (err) console.error('Błąd zamykania bazy:', err);
    else console.log('Baza loterii zamknięta bezpiecznie.');
    process.exit(0);
  });
});