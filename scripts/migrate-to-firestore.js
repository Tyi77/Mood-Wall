/**
 * migrate-to-firestore.js
 * 將 messages.json 的舊資料上傳到 Firestore
 * 用法: node scripts/migrate-to-firestore.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'mood-wall';
const API_KEY = 'AIzaSyAc1sLk453TLHhYOJfdys58RSq-XNsi0lk';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/messages`;

// 讀取 messages.json
const messagesPath = path.join(__dirname, '..', 'messages.json');
const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));

// 將 "2026-05-27 10:23:35.919399" 轉成 ISO 8601 timestamp
function parseTimestamp(str) {
    // PostgreSQL format: "YYYY-MM-DD HH:MM:SS.microseconds"
    const iso = str.replace(' ', 'T') + '+08:00'; // 台灣時區 UTC+8
    return new Date(iso).toISOString();
}

// 用 Firestore REST API 新增一筆文件
function addDocument(msg) {
    return new Promise((resolve, reject) => {
        const isoTimestamp = parseTimestamp(msg.created_at);
        const body = JSON.stringify({
            fields: {
                content: { stringValue: msg.content },
                created_at: { timestampValue: isoTimestamp },
                original_id: { integerValue: String(msg.id) }
            }
        });

        const url = `${FIRESTORE_URL}?key=${API_KEY}`;
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// 循序上傳，避免超過 API 速率限制
async function migrate() {
    console.log(`開始遷移 ${messages.length} 筆留言到 Firestore...\n`);
    let success = 0;
    let failed = 0;

    for (const msg of messages) {
        try {
            await addDocument(msg);
            success++;
            process.stdout.write(`\r進度: ${success + failed}/${messages.length} ✓ ${success} 成功`);
            // 每筆之間稍微延遲，避免觸發速率限制
            await new Promise(r => setTimeout(r, 100));
        } catch (err) {
            failed++;
            console.error(`\n✗ id=${msg.id} 失敗: ${err.message}`);
        }
    }

    console.log(`\n\n✅ 遷移完成！成功 ${success} 筆，失敗 ${failed} 筆`);
}

migrate();
