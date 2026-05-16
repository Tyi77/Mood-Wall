const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Get messages (newest first)
app.get('/api/messages', (req, res) => {
    db.all('SELECT * FROM messages ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ messages: rows });
    });
});

// Post a new message
app.post('/api/messages', (req, res) => {
    const { content } = req.body;
    if (!content || content.trim() === '') {
        res.status(400).json({ error: 'Content is required' });
        return;
    }
    
    const stmt = db.prepare('INSERT INTO messages (content) VALUES (?)');
    stmt.run([content.trim()], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ 
            id: this.lastID, 
            content: content.trim(),
            created_at: new Date().toISOString()
        });
    });
    stmt.finalize();
});

// Delete a message
app.delete('/api/messages/:id', (req, res) => {
    const id = req.params.id;
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    stmt.run([id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(200).json({ success: true, deletedID: id });
    });
    stmt.finalize();
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
