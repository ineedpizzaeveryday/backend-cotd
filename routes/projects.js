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
    initializeDatabase(); // ← wywołujemy poza callbackiem
  }
});

// Funkcja inicjalizująca bazę – osobno, aby uniknąć race condition
function initializeDatabase() {
  db.serialize(() => {  // ← kolejność gwarantowana
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet          TEXT NOT NULL UNIQUE,
        project_name    TEXT NOT NULL,
        ticker          TEXT NOT NULL CHECK(length(ticker) <= 8),
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

    db.run(`CREATE INDEX IF NOT EXISTS idx_projects_score ON projects(score DESC)`, (err) => {
      if (err) {
        console.error('❌ Błąd tworzenia indeksu:', err.message);
      } else {
        console.log('✅ Indeks score utworzony');
      }
    });
  });
}

// Pomocnicza funkcja sprawdzająca cooldown głosowania (3 godziny)
function canVote(wallet, lastVoteByStr) {
  try {
    const votes = JSON.parse(lastVoteByStr || '{}');
    const lastVoteTime = votes[wallet.toLowerCase()];
    if (!lastVoteTime) return true;

    const diffMs = Date.now() - new Date(lastVoteTime).getTime();
    return diffMs >= 3 * 60 * 60 * 1000; // 3 godziny w milisekundach
  } catch (e) {
    return true; // w razie błędnego JSON → pozwalamy głosować
  }
}

// 1. Dodanie projektu (jeden na portfel)
router.post('/add', (req, res) => {
  const { wallet, project_name, ticker } = req.body;

  if (!wallet || !project_name || !ticker) {
    return res.status(400).json({ error: 'Brak wymaganych pól: wallet, project_name, ticker' });
  }

  const cleanWallet = wallet.toLowerCase().trim();
  const cleanName = project_name.trim().slice(0, 120);
  const cleanTicker = ticker.trim().toUpperCase().slice(0, 8);

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
      `INSERT INTO projects (wallet, project_name, ticker, score)
       VALUES (?, ?, ?, 0)`,
      [cleanWallet, cleanName, cleanTicker],
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

// 2. Lista top 30 (aktywnych projektów)
router.get('/top', (req, res) => {
  db.all(
    `SELECT id, wallet, project_name, ticker, score
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

// 3. Głosowanie (up/down)
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

    // Sprawdzamy cooldown
    if (!canVote(cleanWallet, row.last_vote_by)) {
      return res.status(429).json({ error: 'Możesz głosować raz na 3 godziny' });
    }

    const newScore = row.score + direction;

    // Jeśli ≤ -10 → usuwamy projekt
    if (newScore <= -10) {
      db.run('DELETE FROM projects WHERE id = ?', [id], (delErr) => {
        if (delErr) console.error('Błąd usuwania projektu:', delErr);
      });
      return res.json({ success: true, deleted: true });
    }

    // Aktualizacja głosu i timestampu
    let votes = {};
    try {
      votes = JSON.parse(row.last_vote_by || '{}');
    } catch {}

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