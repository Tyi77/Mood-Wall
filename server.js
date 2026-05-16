require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('FATAL ERROR: DATABASE_URL is not defined in environment variables.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for many managed Postgres services like Neon
    }
});

// Initialize DB Table
pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).then(() => console.log('Connected to PostgreSQL and verified table.'))
  .catch(err => console.error('Database initialization error:', err));

// Get messages (newest first)
app.get('/api/messages', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM messages ORDER BY created_at DESC');
        res.json({ messages: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Post a new message
app.post('/api/messages', async (req, res) => {
    const { content } = req.body;
    if (!content || content.trim() === '') {
        res.status(400).json({ error: 'Content is required' });
        return;
    }
    
    try {
        const result = await pool.query(
            'INSERT INTO messages (content) VALUES ($1) RETURNING *',
            [content.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a message
app.delete('/api/messages/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [id]);
        res.status(200).json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
