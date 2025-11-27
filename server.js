import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { addRandomTransaction, getTransactionCount } from './transactions.js';
import { setupLotteryRoutes, addLotteryTransaction, getLotteryTransactionCount } from './lottransactions.js';
import rewardsRouter from './rewards.js';
import payoutringRouter from './routes/payoutring.js';
import payoutpresaleRouter from './routes/payoutpresale.js';

import payoutRouter from './routes/payout.js';
import { getDecryptedKeypair } from './secureKey.js';

const app = express();
const dbPath = path.resolve('./ranking.db');
const backupPath = path.resolve('./ranking-backup.db');

const PORT = process.env.PORT || 10000;



app.use(cors({
  origin: ['https://cotd-one.vercel.app', 'http://localhost:5173','https://www.cookingcrypto.org', 'https://cookingcrypto.org'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));



// 🔐 Odszyfruj klucz prywatny przy starcie serwera
const keypair = getDecryptedKeypair();
console.log('💼 Sender Public Key:', keypair.publicKey.toBase58());

// Middleware

app.use(bodyParser.json());
app.use('/api', rewardsRouter);


// Sprawdź, czy plik bazy danych istnieje
// 🧩 Diagnostyka istniejących baz danych
console.log('🔍 Sprawdzanie baz danych...');
console.log('Ranking DB path:', dbPath);
console.log('Backup DB path:', backupPath);

const transactionDbPath = path.resolve('./data/transactions.db');
const lotTransactionDbPath = path.resolve('./lottransactions.db');

// Sprawdź istnienie plików baz
const missingDbs = [];

if (!fs.existsSync(dbPath)) missingDbs.push('ranking.db');
if (!fs.existsSync(transactionDbPath)) missingDbs.push('transactions.db');
if (!fs.existsSync(lotTransactionDbPath)) missingDbs.push('lottransactions.db');

if (missingDbs.length > 0) {
  console.error('❌ Brakuje następujących baz danych:', missingDbs.join(', '));
  console.error('📂 Szukane ścieżki:');
  console.error(' - ranking.db:', dbPath);
  console.error(' - transactions.db:', transactionDbPath);
  console.error(' - lottransactions.db:', lotTransactionDbPath);
  process.exit(1);
} else {
  console.log('✅ Wszystkie wymagane bazy danych istnieją.');
}

// Tworzenie kopii zapasowej bazy danych
if (fs.existsSync(dbPath)) {
  fs.copyFileSync(dbPath, backupPath);
  console.log('Kopia zapasowa bazy danych została utworzona.');
}

// Inicjalizacja bazy danych
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Błąd połączenia z bazą danych:', err);
  } else {
    console.log(`Połączono z bazą danych SQLite: ${dbPath}`);
  }
});

// Dodaj kolumny, jeśli jeszcze nie istnieją
const addColumnIfNotExists = (columnName, columnType) => {
  db.run(
    `ALTER TABLE ranking ADD COLUMN ${columnName} ${columnType}`,
    [],
    (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error(`Błąd podczas dodawania kolumny ${columnName}:`, err);
      } else {
        console.log(`Kolumna ${columnName} już istnieje lub została dodana.`);
      }
    }
  );
};

addColumnIfNotExists('username', 'TEXT');
addColumnIfNotExists('shopping', 'INTEGER DEFAULT 0');
addColumnIfNotExists('score', 'FLOAT DEFAULT 0');

// Obliczanie wyniku
const calculateScore = (balance, shopping) => {
  const coefBalance = 1.0;
  const coefShopping = 2.2;
  return balance * coefBalance + shopping * coefShopping;
};

// Endpointy

app.get('/check-coindata', (req, res) => {
  const filePath = path.resolve('./data/coindata.json');
  console.log('Checking file at:', filePath); // Log the path
  if (fs.existsSync(filePath)) {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error('Błąd odczytu pliku:', err.message);
        return res.status(500).json({ success: false, error: 'Nie można odczytać pliku', details: err.message });
      }
      res.json({ success: true, exists: true, content: data });
    });
  } else {
    console.log('File does not exist:', filePath); // Log missing file
    res.status(404).json({ success: false, exists: false, error: 'Plik coindata.json nie istnieje', path: filePath });
  }
});

app.get('/debug-files', (req, res) => {
  fs.readdir(path.resolve('./data'), (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot read directory' });
    res.json({ files });
  });
});


app.post('/addTransaction', addRandomTransaction);
app.get('/transactionCount', getTransactionCount);
app.post('/api/lottery/add', addLotteryTransaction);
app.get('/api/lottery/count', getLotteryTransactionCount);

app.get('/ranking', (req, res) => {
  db.all('SELECT address, balance, username, shopping, score FROM ranking ORDER BY score DESC', [], (err, rows) => {
    if (err) {
      console.error('Błąd pobierania danych:', err);
      res.status(500).json({ error: 'Błąd serwera' });
    } else {
      res.json(rows);
    }
  });
});


app.post('/ranking', (req, res) => {
  const { address, balance, username, shopping = 0 } = req.body;
  if (!address || balance === undefined || !username) {
    return res.status(400).json({ error: 'Nieprawidłowe dane wejściowe' });
  }
  const score = calculateScore(balance, shopping);
  db.run(
    `INSERT INTO ranking (address, balance, username, shopping, score)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET balance = excluded.balance, username = excluded.username, shopping = excluded.shopping, score = excluded.score`,
    [address, balance, username, shopping, score],
    (err) => {
      if (err) {
        console.error('Błąd zapisu do bazy danych:', err);
        res.status(500).json({ error: 'Błąd serwera' });
      } else {
        res.json({ success: true });
      }
    }
  );
});

app.post('/refresh-balances', async (req, res) => {
  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  try {
    db.all('SELECT id, address, shopping FROM ranking', [], async (err, rows) => {
      if (err) {
        console.error('Błąd pobierania danych:', err);
        return res.status(500).json({ error: 'Błąd serwera' });
      }
      const updatedBalances = [];
      for (const row of rows) {
        try {
          const publicKey = new PublicKey(row.address);
          const balanceLamports = await connection.getBalance(publicKey);
          const balanceSOL = balanceLamports / 1_000_000_000;
          const score = calculateScore(balanceSOL, row.shopping);
          db.run(
            `UPDATE ranking SET balance = ?, score = ? WHERE id = ?`,
            [balanceSOL, score, row.id],
            (updateErr) => {
              if (updateErr) {
                console.error('Błąd aktualizacji salda:', updateErr);
              }
            }
          );
          updatedBalances.push({ address: row.address, balance: balanceSOL, score });
        } catch (fetchErr) {
          console.error(`Błąd pobierania salda dla adresu ${row.address}:`, fetchErr);
        }
      }
      res.json({ success: true, updated: updatedBalances });
    });
  } catch (error) {
    console.error('Błąd podczas odświeżania sald:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.post('/shopping', (req, res) => {
  const { address, points } = req.body;
  if (!address || points === undefined) {
    return res.status(400).json({ error: 'Nieprawidłowe dane wejściowe' });
  }
  db.get('SELECT balance, shopping FROM ranking WHERE address = ?', [address], (err, row) => {
    if (err || !row) {
      console.error('Błąd podczas pobierania danych użytkownika:', err);
      return res.status(500).json({ error: 'Użytkownik nie istnieje' });
    }
    const newShopping = row.shopping + points;
    const score = calculateScore(row.balance, newShopping);
    db.run(
      `UPDATE ranking SET shopping = ?, score = ? WHERE address = ?`,
      [newShopping, score, address],
      (updateErr) => {
        if (updateErr) {
          console.error('Błąd podczas aktualizacji shopping:', updateErr);
          res.status(500).json({ error: 'Błąd serwera' });
        } else {
          res.json({ success: true, score });
        }
      }
    );
  });
});

app.get('/coinOfDay', (req, res) => {
  const filePath = path.resolve('./data/coindata.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Błąd odczytu pliku JSON:', err);
      return res.status(500).json({ error: 'Nie można odczytać danych monety dnia' });
    }
    try {
      const coinOfTheDay = JSON.parse(data);
      res.json(coinOfTheDay);
    } catch (parseErr) {
      console.error('Błąd parsowania JSON:', parseErr);
      res.status(500).json({ error: 'Nieprawidłowy format danych w pliku JSON' });
    }
  });
});

app.use('/api', payoutpresaleRouter);
app.use('/api', payoutRouter);
app.use('/api', payoutringRouter);



app.use(express.json());

app.post('/update-coin-visibility', (req, res) => {
  const filePath = path.resolve('./data/coindata.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Błąd odczytu pliku:', err);
      return res.status(500).json({ error: 'Nie można odczytać pliku coindata.json' });
    }
    try {
      let coinData = JSON.parse(data);
      coinData.isHidden = false;
      fs.writeFile(filePath, JSON.stringify(coinData, null, 2), (writeErr) => {
        if (writeErr) {
          console.error('Błąd zapisu pliku JSON:', writeErr.message);
          return res.status(500).json({ error: `Nie można zapisać danych: ${writeErr.message}` });
        }
        res.status(200).json({ message: 'Moneta została odblokowana!' });
      });
    } catch (parseErr) {
      console.error('Błąd parsowania JSON:', parseErr);
      res.status(500).json({ error: 'Nieprawidłowy format danych w pliku JSON' });
    }
  });
});

app.post('/reset-coin-of-day', (req, res) => {
  const filePath = path.resolve('./data/coindata.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Błąd odczytu pliku JSON:', err);
      return res.status(500).json({ error: 'Nie można odczytać danych monety dnia' });
    }
    try {
      const coinData = JSON.parse(data);
      coinData.isHidden = true;
      fs.writeFile(filePath, JSON.stringify(coinData, null, 2), (writeErr) => {
        if (writeErr) {
          console.error('Błąd zapisu pliku JSON:', writeErr);
          return res.status(500).json({ error: 'Nie można zapisać danych monety dnia' });
        }
        res.json({ message: 'Moneta dnia została zresetowana i ukryta' });
      });
    } catch (parseErr) {
      console.error('Błąd parsowania JSON:', parseErr);
      res.status(500).json({ error: 'Nieprawidłowy format danych w pliku JSON' });
    }
  });
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
