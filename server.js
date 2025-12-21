import dotenv from 'dotenv';
dotenv.config();

import express from 'express';                // ← DODANE!
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { Connection, PublicKey } from '@solana/web3.js';  // Usunąłem Transaction i SystemProgram – nie są używane w server.js

import { addRandomTransaction, getTransactionCount } from './transactions.js';
import { addLotteryTransaction, getLotteryTransactionCount } from './lottransactions.js';
import payoutRingRouter from './routes/payoutring.js';
import payoutPresaleRouter from './routes/payoutpresale.js';
import payoutRouter from './routes/payoutslot.js';
import { getDecryptedKeypair } from './secureKey.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

// ================== KONFIGURACJA ==================
const app = express();
const PORT = process.env.PORT || 10000;

// Ścieżki
const RANKING_DB_PATH = path.resolve('./ranking.db');
const DATA_DIR = path.resolve('./data');
const coinDataPath = path.resolve('./data/coindata.json');

// ================== STAŁE ==================
const MINT_ADDRESS = 'DWPLeuggJtGAJ4dGLXnH94653f1xGE1Nf9TVyyiR5U35';
const MINIMUM_INSTANT = 0.1;

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
const calculateScore = (balance, shopping = 0) => balance + shopping; 

const isValidSolanaAddress = (addr) => {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
};

// ================== ENDPOINTY RANKING ==================


// POST /ranking – dołączenie
app.post('/ranking', async (req, res) => {
  const { address, username } = req.body;
  if (!address || !username || !isValidSolanaAddress(address)) return res.status(400).json({ error: 'Bad data' });

  const trimmed = username.trim();
  if (trimmed.length === 0) return res.status(400).json({ error: 'Empty nickname' });

  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const mint = new PublicKey(MINT_ADDRESS);
    const userPk = new PublicKey(address);

    const ata = await getAssociatedTokenAddress(
      mint,
      userPk,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    let balance = 0;
    try {
      const acc = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      balance = Number(acc.amount) / Math.pow(10, mintInfo.decimals);
    } catch {}

    if (balance < MINIMUM_INSTANT) {
      return res.status(400).json({ error: `Min 0.1 $INSTANT required. Current: ${balance.toFixed(4)}` });
    }

    rankingDb.run(
      `INSERT INTO ranking (address, username) VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET username = excluded.username`,
      [address, trimmed],
      (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blockchain error' });
  }
});

// GET /ranking
app.get('/ranking', (req, res) => {
  rankingDb.all(
    `SELECT address, username, shopping FROM ranking ORDER BY shopping DESC LIMIT 100`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(rows);
    }
  );
});

// POST /shopping
app.post('/shopping', async (req, res) => {
  const { address, points } = req.body;
  if (!address || !points || !isValidSolanaAddress(address)) {
    return res.status(400).json({ error: 'Bad data' });
  }

  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const mint = new PublicKey(MINT_ADDRESS);
    const userPk = new PublicKey(address);

    const ata = await getAssociatedTokenAddress(mint, userPk, true, TOKEN_2022_PROGRAM_ID);
    let balance = 0;
    try {
      const acc = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      balance = Number(acc.amount) / Math.pow(10, mintInfo.decimals);
    } catch {}

    if (balance < MINIMUM_INSTANT) {
      return res.status(400).json({ error: 'Min 0.1 $INSTANT required to buy gifts' });
    }

    rankingDb.run(
      `UPDATE ranking SET shopping = shopping + ? WHERE address = ?`,
      [points, address],
      function (err) {
        if (err || this.changes === 0) {
          return res.status(404).json({ error: 'User not in ranking' });
        }
        res.json({ success: true });
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blockchain error' });
  }
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

// Baza odblokowanych użytkowników Coin of the Day – trwała na Render (/data)
const UNLOCKED_DB_PATH = IS_RENDER ? '/data/unlocked_coin.db' : path.resolve('./data/unlocked_coin.db');

if (!fs.existsSync(path.dirname(UNLOCKED_DB_PATH))) {
  fs.mkdirSync(path.dirname(UNLOCKED_DB_PATH), { recursive: true });
}

const unlockedDb = new sqlite3.Database(UNLOCKED_DB_PATH, (err) => {
  if (err) {
    console.error('Błąd unlocked_coin.db:', err);
  } else {
    console.log('✅ Połączono z unlocked_coin.db');
  }
});

unlockedDb.run(`
  CREATE TABLE IF NOT EXISTS unlocked_users (
    address TEXT PRIMARY KEY,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error('Błąd tabeli unlocked_users:', err);
});

// Sprawdza czy dany address już odblokował Coin of the Day
app.get('/api/is-coin-unlocked', (req, res) => {
  const { address } = req.query;
  if (!address || !isValidSolanaAddress(address)) {
    return res.status(400).json({ unlocked: false });
  }

  unlockedDb.get('SELECT address FROM unlocked_users WHERE address = ?', [address], (err, row) => {
    if (err) return res.status(500).json({ unlocked: false });
    res.json({ unlocked: !!row });
  });
});

// Odblokowuje po płatności (wywoływane po sukcesie tx)
app.post('/api/unlock-coin', (req, res) => {
  const { address } = req.body;
  if (!address || !isValidSolanaAddress(address)) {
    return res.status(400).json({ success: false });
  }

  unlockedDb.run(
    'INSERT OR IGNORE INTO unlocked_users (address) VALUES (?)',
    [address],
    function (err) {
      if (err) {
        console.error('Błąd odblokowania:', err);
        return res.status(500).json({ success: false });
      }
      console.log(`Coin of the Day odblokowany dla: ${address}`);
      res.json({ success: true });
    }
  );
});

export { keypair, rankingDb };

// ================== START SERWERA ==================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});