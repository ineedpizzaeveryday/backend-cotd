// transactions.js
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// Ścieżka dostosowana do Render i lokalnie
const IS_RENDER = process.env.RENDER === 'true';
const DB_PATH = IS_RENDER ? '/data/transactions.db' : path.resolve('./data/transactions.db');

console.log('📍 Transactions DB path:', DB_PATH);

// Folder data
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Utworzono folder dla transactions.db');
}

// Globalna, trwała instancja bazy
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌ Błąd połączenia z transactions.db:', err);
    process.exit(1);
  } else {
    console.log('✅ Połączono z transactions.db');
  }
});

// Tworzenie tabeli przy starcie
db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txNumber INTEGER
  )
`, (err) => {
  if (err) console.error('Błąd tworzenia tabeli transactions:', err);
  else console.log('✅ Tabela transactions gotowa');
});

export const addRandomTransaction = (req, res) => {
  const randomTxNumber = Math.floor(Math.random() * 1000000);

  db.run('INSERT INTO transactions (txNumber) VALUES (?)', [randomTxNumber], function (err) {
    if (err) {
      console.error('Błąd dodawania transakcji:', err);
      return res.status(500).json({ error: 'Nie udało się dodać transakcji' });
    }
    res.json({ success: true, id: this.lastID });
  });
};

export const getTransactionCount = (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM transactions', (err, row) => {
    if (err) {
      console.error('Błąd pobierania liczby transakcji:', err);
      return res.status(500).json({ error: 'Błąd serwera' });
    }
    res.json({ count: row.count || 0 });
  });
};

// Opcjonalnie: bezpieczne zamknięcie przy shutdownie
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('Błąd zamykania transactions.db:', err);
    else console.log('Transactions DB zamknięta bezpiecznie');
    process.exit(0);
  });
});