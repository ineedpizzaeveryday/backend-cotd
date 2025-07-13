import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import crypto from 'crypto'; // For generating random codes

const LOTTERY_DB_PATH = path.resolve('./lottransactions.db');

function initializeLotteryDatabase() {
  const db = new sqlite3.Database(LOTTERY_DB_PATH);
  
  // Zmieniamy definicję tabeli, dodając kolumnę 'code'
  db.run(`
    CREATE TABLE IF NOT EXISTS lottery_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT,
      code TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error initializing lottery database:', err);
    } else {
      console.log('lottery_transactions table initialized successfully.');
    }
  });

  // Jeśli chcesz, aby baza została zaktualizowana o kolumnę 'code', musisz dodać ALTER TABLE, jeśli kolumna 'code' nie istnieje:
  db.run(`
    ALTER TABLE lottery_transactions ADD COLUMN code TEXT
  `, (err) => {
    if (err) {
      console.error('Error adding column "code":', err);
    } else {
      console.log('Column "code" added successfully.');
    }
  });
  
  db.close();
}

// Call initialize function when the module loads
initializeLotteryDatabase();

// Function to add lottery transaction
const addLotteryTransaction = (req, res) => {
  const { signature } = req.body;

  if (!signature) {
    return res.status(400).json({ error: 'Transaction signature is required' });
  }

  const db = new sqlite3.Database(LOTTERY_DB_PATH);
  db.run('INSERT INTO lottery_transactions (signature) VALUES (?)', [signature], (err) => {
    if (err) {
      console.error('Error adding lottery transaction:', err);
      return res.status(500).json({ error: 'Failed to add lottery transaction' });
    }
    res.json({ success: true });
  });
  db.close();
};

// Function to get lottery transaction count
const getLotteryTransactionCount = (req, res) => {
  const db = new sqlite3.Database(LOTTERY_DB_PATH);
  db.get('SELECT COUNT(*) AS count FROM lottery_transactions', [], (err, row) => {
    if (err) {
      console.error('Error fetching lottery transaction count:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json({ count: row.count });
  });
  db.close();
};

// Generate random 5-character code (A-Z, 0-9)
const generateRandomCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Setup lottery routes
const setupLotteryRoutes = (app) => {
  // Endpoint do dodawania transakcji
  app.post('/api/lottery/add', async (req, res) => {
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).send({ error: "Signature is required" });
    }

    try {
      // Wygeneruj losowy kod
      const randomCode = generateRandomCode();

      // Dodaj transakcję do bazy danych
      const db = new sqlite3.Database(LOTTERY_DB_PATH);
      const query = `
        INSERT INTO lottery_transactions (signature, code)
        VALUES (?, ?)
      `;
      db.run(query, [signature, randomCode], (err) => {
        if (err) {
          console.error('Error adding lottery transaction:', err);
          return res.status(500).send({ error: "Failed to add lottery transaction" });
        }
        res.status(200).send({ message: "Transaction added successfully", code: randomCode });
      });
      db.close();
    } catch (error) {
      console.error('Error adding lottery transaction:', error);
      res.status(500).send({ error: "Failed to add lottery transaction" });
    }
  });
};


// Named exports
export { setupLotteryRoutes, addLotteryTransaction, getLotteryTransactionCount };
