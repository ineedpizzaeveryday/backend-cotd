import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// 🔹 Plik bazy danych w folderze /data
const TRANSACTION_DB_PATH = path.resolve('./data/transactions.db');

// 🔹 Upewnij się, że folder 'data' istnieje
const dataDir = path.dirname(TRANSACTION_DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Utworzono folder /data');
}

// 🔹 Upewnij się, że plik bazy danych istnieje
if (!fs.existsSync(TRANSACTION_DB_PATH)) {
  console.warn('⚠️ Plik transactions.db nie istnieje – tworzę nowy...');
  fs.writeFileSync(TRANSACTION_DB_PATH, '');
}

// 🔹 Inicjalizacja bazy danych
function initializeDatabase() {
  const db = new sqlite3.Database(TRANSACTION_DB_PATH);
  db.run(
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txNumber INTEGER
    )`,
    (err) => {
      if (err) {
        console.error('❌ Błąd inicjalizacji bazy danych:', err);
      } else {
        console.log('✅ Tabela transactions została pomyślnie zainicjalizowana.');
      }
    }
  );
  db.close();
}

initializeDatabase();


// 🔹 Uruchom inicjalizację przy starcie
initializeDatabase();


// Call the initialization function when this module is loaded
initializeDatabase();

export const addRandomTransaction = (req, res) => {
  const db = new sqlite3.Database(TRANSACTION_DB_PATH);
  const randomTxNumber = Math.floor(Math.random() * 1000000);
  db.run('INSERT INTO transactions (txNumber) VALUES (?)', [randomTxNumber], (err) => {
    if (err) {
      console.error('Błąd dodawania transakcji:', err);
      res.status(500).json({ error: 'Nie udało się dodać transakcji' });
    } else {
      res.json({ success: true });
    }
  });
  db.close();
};

export const getTransactionCount = (req, res) => {
  const db = new sqlite3.Database(TRANSACTION_DB_PATH);
  db.get('SELECT COUNT(*) AS count FROM transactions', [], (err, row) => {
    if (err) {
      console.error('Błąd pobierania liczby transakcji:', err);
      res.status(500).json({ error: 'Błąd serwera' });
    } else {
      res.json({ count: row.count });
    }
  });
  db.close();
};
