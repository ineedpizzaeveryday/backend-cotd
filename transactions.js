import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const TRANSACTION_DB_PATH = path.resolve('./transactions.db');

// Function to initialize the database and create the transactions table if it does not exist
function initializeDatabase() {
  const db = new sqlite3.Database(TRANSACTION_DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txNumber INTEGER
    )
  `, (err) => {
    if (err) {
      console.error('Błąd inicjalizacji bazy danych:', err);
    } else {
      console.log('Tabela transactions została pomyślnie zainicjalizowana.');
    }
  });
  db.close();
}

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
