import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { Connection, PublicKey } from '@solana/web3.js';

import { addRandomTransaction, getTransactionCount } from './transactions.js';
import { addLotteryTransaction, getLotteryTransactionCount } from './lottransactions.js';
import payoutRingRouter from './routes/payoutring.js';
import payoutPresaleRouter from './routes/payoutpresale.js';
import payoutRouter from './routes/payoutslot.js';
import { getDecryptedKeypair } from './secureKey.js';

// ================== KONFIGURACJA ==================
const app = express();
const PORT = process.env.PORT || 10000;

// Ścieżki
const RANKING_DB_PATH = path.resolve('./ranking.db');
const DATA_DIR = path.resolve('./data');
const coinDataPath = path.resolve('./data/coindata.json');

// Utwórz folder data jeśli nie istnieje (kluczowe na Render)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Utworzono folder ./data');
}

// ================== KLUCZ PRYWATNY (odszyfrowany tylko raz) ==================
let keypair;
try {
  keypair = getDecryptedKeypair();
  console.log('💼 Sender Public Key:', keypair.publicKey.toBase58());
} catch (err) {
  console.error('❌ Błąd odszyfrowania klucza prywatnego:', err.message);
  process.exit(1);
}

// ================== BAZA RANKING – trwałe połączenie ==================
const rankingDb = new sqlite3.Database(RANKING_DB_PATH, (err) => {
  if (err) {
    console.error('Błąd połączenia z ranking.db:', err);
    process.exit(1);
  } else {
    console.log('✅ Połączono z ranking.db');
  }
});

// Backup przy starcie
const backupPath = path.resolve('./ranking-backup.db');
if (fs.existsSync(RANKING_DB_PATH)) {
  fs.copyFileSync(RANKING_DB_PATH, backupPath);
  console.log('📀 Kopia zapasowa ranking.db utworzona');
}

// Dodaj brakujące kolumny (bezpieczne ALTER)
['username TEXT', 'shopping INTEGER DEFAULT 0', 'score FLOAT DEFAULT 0'].forEach(col => {
  rankingDb.run(`ALTER TABLE ranking ADD COLUMN ${col}`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error(`Błąd dodawania kolumny ${col}:`, err);
    }
  });
});

// ================== MIDDLEWARE ==================
app.use(cors({
  origin: ['https://cotd-one.vercel.app', 'http://localhost:5173', 'https://www.cookingcrypto.org', 'https://cookingcrypto.org'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json()); // Tylko raz, na początku!


app.use('/api/payoutpresale', payoutPresaleRouter);
app.use('/api/payoutslot', payoutRouter);
app.use('/api/payoutring', payoutRingRouter);

// ================== FUNKCJE POMOCNICZE ==================
const calculateScore = (balance, shopping = 0) => balance * 1.0 + shopping * 2.2;

const isValidSolanaAddress = (addr犹如) => {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
};

// ================== ENDPOINTY RANKING ==================
app.get('/ranking', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  rankingDb.all(
    'SELECT address, balance, username, shopping, score FROM ranking ORDER BY score DESC LIMIT ? OFFSET ?',
    [limit, offset],
    (err, rows) => {
      if (err) {
        console.error('Błąd pobierania rankingu:', err);
        return res.status(500).json({ error: 'Błąd serwera' });
      }
      res.json(rows);
    }
  );
});

app.post('/ranking', (req, res) => {
  const { address, balance, username, shopping = 0 } = req.body;

  if (!address || !username || balance === undefined || !isValidSolanaAddress(address)) {
    return res.status(400).json({ error: 'Nieprawidłowe dane' });
  }

  const score = calculateScore(balance, shopping);

  rankingDb.run(
    `INSERT INTO ranking (address, balance, username, shopping, score)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       balance = excluded.balance,
       username = excluded.username,
       shopping = excluded.shopping,
       score = excluded.score`,
    [address, balance, username, shopping, score],
    function (err) {
      if (err) {
        console.error('Błąd zapisu do rankingu:', err);
        return res.status(500).json({ error: 'Błąd zapisu' });
      }
      res.json({ success: true });
    }
  );
});

app.post('/shopping', (req, res) => {
  const { address, points } = req.body;

  if (!address || points === undefined || !isValidSolanaAddress(address)) {
    return res.status(400).json({ error: 'Nieprawidłowe dane' });
  }

  rankingDb.get('SELECT balance, shopping FROM ranking WHERE address = ?', [address], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Użytkownik nie istnieje' });
    }

    const newShopping = (row.shopping || 0) + points;
    const score = calculateScore(row.balance, newShopping);

    rankingDb.run(
      'UPDATE ranking SET shopping = ?, score = ? WHERE address = ?',
      [newShopping, score, address],
      (err) => {
        if (err) {
          console.error('Błąd aktualizacji shopping:', err);
          return res.status(500).json({ error: 'Błąd aktualizacji' });
        }
        res.json({ success: true, score });
      }
    );
  });
});

app.post('/refresh-balances', async (req, res) => {
  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

  rankingDb.all('SELECT address, shopping FROM ranking', async (err, rows) => {
    if (err) return res.status(500).json({ error: 'Błąd odczytu bazy' });

    const batchSize = 40; // trochę mniej niż 50 – bezpieczniej dla RPC
    let updated = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      const balancePromises = batch.map(async ({ address }) => {
        try {
          const balanceLamports = await connection.getBalance(new PublicKey(address));
          return { address, balanceSOL: balanceLamports / 1_000_000_000 };
        } catch (e) {
          console.error(`Błąd pobierania salda ${address}:`, e.message);
          return null;
        }
      });

      const balances = (await Promise.all(balancePromises)).filter(Boolean);

      for (const { address, balanceSOL } of balances) {
        const user = rows.find(r => r.address === address);
        const score = calculateScore(balanceSOL, user.shopping || 0);

        rankingDb.run(
          'UPDATE ranking SET balance = ?, score = ? WHERE address = ?',
          [balanceSOL, score, address]
        );
        updated++;
      }
    }

    res.json({ success: true, updated });
  });
});

// ================== POZOSTAŁE ENDPOINTY ==================
app.post('/addTransaction', addRandomTransaction);
app.get('/transactionCount', getTransactionCount);

app.post('/api/lottery/add', addLotteryTransaction);
app.get('/api/lottery/count', getLotteryTransactionCount);

// Coin of the Day
app.get('/coinOfDay', (req, res) => {
  fs.readFile(coinDataPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Błąd odczytu coindata.json' });
    try {
      res.json(JSON.parse(data));
    } catch {
      res.status(500).json({ error: 'Błąd parsowania JSON' });
    }
  });
});

app.post('/update-coin-visibility', (req, res) => {
  fs.readFile(coinDataPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Nie można odczytać pliku' });
    try {
      const coinData = JSON.parse(data);
      coinData.isHidden = false;
      fs.writeFile(coinDataPath, JSON.stringify(coinData, null, 2), (writeErr) => {
        if (writeErr) return res.status(500).json({ error: 'Błąd zapisu' });
        res.json({ message: 'Moneta została odblokowana!' });
      });
    } catch (e) {
      res.status(500).json({ error: 'Błąd parsowania JSON' });
    }
  });
});

app.post('/reset-coin-of-day', (req, res) => {
  fs.readFile(coinDataPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Nie można odczytać pliku' });
    try {
      const coinData = JSON.parse(data);
      coinData.isHidden = true;
      fs.writeFile(coinDataPath, JSON.stringify(coinData, null, 2), (writeErr) => {
        if (writeErr) return res.status(500).json({ error: 'Błąd zapisu' });
        res.json({ message: 'Moneta dnia została zresetowana i ukryta' });
      });
    } catch (e) {
      res.status(500).json({ error: 'Błąd parsowania JSON' });
    }
  });
});

export { keypair, rankingDb };

// ================== START SERWERA ==================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});