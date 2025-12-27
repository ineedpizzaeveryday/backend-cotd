// routes/projects.js
import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';

const router = express.Router();
const PROJECTS_DB_PATH = path.resolve('./data/projects.db');

const db = new sqlite3.Database(PROJECTS_DB_PATH, (err) => {
  if (err) {
    console.error('❌ Błąd połączenia z projects.db:', err.message);
  } else {
    console.log('✅ Połączono z projects.db');
    initializeDatabase();
  }
});

// Pomocnicze funkcje
function isValidWebsite(str) {
  if (!str) return true;
  str = str.trim();
  if (str.length > 200 || str.length < 4) return false;
  
  try {
    // Próbujemy stworzyć obiekt URL – najpewniejsza walidacja
    new URL(str.startsWith('http') ? str : 'https://' + str);
    return true;
  } catch {
    return false;
  }
}

function getVotesMap(lastVoteByStr) {
  if (!lastVoteByStr) return {};
  try {
    const parsed = JSON.parse(lastVoteByStr);
    return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
  } catch {
    return {};
  }
}

// Inicjalizacja bazy + migracja
function initializeDatabase() {
  db.serialize(() => {
    // Tworzenie tabeli
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet          TEXT NOT NULL UNIQUE,
        project_name    TEXT NOT NULL,
        ticker          TEXT NOT NULL CHECK(length(ticker) <= 8),
        website         TEXT,
        score           INTEGER DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_vote_by    TEXT DEFAULT '{}'
      )
    `, (err) => {
      if (err) {
        console.error('❌ Błąd tworzenia tabeli:', err.message);
        return;
      }
      console.log('✅ Tabela projects gotowa');
    });

    // Migracja - dodanie kolumny website jeśli jeszcze nie istnieje
    db.run(`ALTER TABLE projects ADD COLUMN website TEXT`, (err) => {
      // Ignorujemy błąd jeśli kolumna już istnieje
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Błąd migracji - dodanie kolumny website:', err.message);
      }
    });

    // Indeks dla sortowania po score
    db.run(`CREATE INDEX IF NOT EXISTS idx_projects_score ON projects(score DESC)`, (err) => {
      if (err) {
        console.error('❌ Błąd tworzenia indeksu:', err.message);
      } else {
        console.log('✅ Indeks score utworzony');
      }
    });
  });
}

// Sprawdzenie cooldownu głosowania
function canVote(wallet, lastVoteByStr) {
  const votes = getVotesMap(lastVoteByStr);
  const lastVoteTime = votes[wallet.toLowerCase()];
  if (!lastVoteTime) return true;

  const diffMs = Date.now() - new Date(lastVoteTime).getTime();
  return diffMs >= 3 * 60 * 60 * 1000; // 3 godziny
}

// 1. Dodanie projektu
router.post('/add', (req, res) => {
  const { wallet, project_name, ticker, website } = req.body;

  if (!wallet || !project_name || !ticker) {
    return res.status(400).json({ error: 'Brak wymaganych pól: wallet, project_name, ticker' });
  }

  if (website && !isValidWebsite(website)) {
    return res.status(400).json({ error: 'Nieprawidłowy format strony WWW' });
  }

  const cleanWallet = wallet.toLowerCase().trim();
  const cleanName = project_name.trim().slice(0, 120);
  const cleanTicker = ticker.trim().toUpperCase().slice(0, 8);
  const finalWebsite = website ? website.trim() : null;

  if (cleanTicker.length < 2) {
    return res.status(400).json({ error: 'Ticker musi mieć minimum 2 znaki' });
  }

  if (cleanName.length < 3) {
    return res.status(400).json({ error: 'Nazwa projektu musi mieć minimum 3 znaki' });
  }

  db.get('SELECT id FROM projects WHERE wallet = ?', [cleanWallet], (err, row) => {
    if (err) {
      console.error('Błąd sprawdzania portfela:', err);
      return res.status(500).json({ error: 'Błąd bazy danych' });
    }
    if (row) {
      return res.status(403).json({ error: 'Ten portfel już dodał projekt' });
    }

    db.run(
      `INSERT INTO projects (wallet, project_name, ticker, website, score)
       VALUES (?, ?, ?, ?, 0)`,
      [cleanWallet, cleanName, cleanTicker, finalWebsite, 0],
      function (err) {
        if (err) {
          console.error('Błąd dodawania projektu:', err);
          return res.status(500).json({ error: 'Nie udało się dodać projektu' });
        }
        res.json({ success: true, id: this.lastID });
      }
    );
  });
});

// 2. Lista top 30
router.get('/top', (req, res) => {
  db.all(
    `SELECT id, wallet, project_name, ticker, website, score
     FROM projects
     WHERE score > -10
     ORDER BY score DESC
     LIMIT 30`,
    [],
    (err, rows) => {
      if (err) {
        console.error('Błąd pobierania listy:', err);
        return res.status(500).json({ error: 'Błąd bazy danych' });
      }
      res.json(rows);
    }
  );
});

// 3. Głosowanie
router.post('/vote', (req, res) => {
  const { id, wallet, direction } = req.body;

  if (!id || !wallet || ![1, -1].includes(direction)) {
    return res.status(400).json({ error: 'Nieprawidłowe dane głosowania' });
  }

  const cleanWallet = wallet.toLowerCase().trim();

  db.get('SELECT score, last_vote_by FROM projects WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Błąd pobierania projektu:', err);
      return res.status(500).json({ error: 'Błąd bazy danych' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }

    if (!canVote(cleanWallet, row.last_vote_by)) {
      return res.status(429).json({ error: 'Możesz głosować raz na 3 godziny' });
    }

    const newScore = row.score + direction;

    // Usuwamy projekt jeśli score <= -10
    if (newScore <= -10) {
      db.run('DELETE FROM projects WHERE id = ?', [id], (delErr) => {
        if (delErr) console.error('Błąd usuwania projektu:', delErr);
      });
      return res.json({ success: true, deleted: true });
    }

    // Aktualizacja głosowania
    const votes = getVotesMap(row.last_vote_by);
    votes[cleanWallet] = new Date().toISOString();

    db.run(
      `UPDATE projects 
       SET score = ?, last_vote_by = ? 
       WHERE id = ?`,
      [newScore, JSON.stringify(votes), id],
      (updateErr) => {
        if (updateErr) {
          console.error('Błąd aktualizacji głosu:', updateErr);
          return res.status(500).json({ error: 'Błąd zapisu głosu' });
        }
        res.json({ success: true, newScore });
      }
    );
  });
});

export default router;