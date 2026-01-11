import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

import Database from 'better-sqlite3'; // Импортируем базу
import 'dotenv/config'; // Автоматически подгружает .env

// Импорт логики инструментов
import { sorting } from './tools/zip-tool/main.js';
import { transformCode } from './tools/m1-nl/processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ---
// Создаем файл базы в папке data (удобно для Docker volumes)
const db = new Database(path.join(__dirname, 'jira_queue.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS jira_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_key TEXT,
    comment TEXT,
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const fastify = Fastify({ 
    logger: true,
    bodyLimit: 52428800 // 50MB
});

// Регистрируем multipart глобально
fastify.register(multipart, {
    limits: { fileSize: 52428800 }
});





// --- TOOL 1: ZIP-TOOL (Сортировка архивов) ---
fastify.register(async function (instance) {
    // Статика для zip-tool лежит в public/zip-tool
    instance.register(fastifyStatic, {
        root: path.join(__dirname, 'public/zip-tool'),
        prefix: '/', 
    });

    instance.post('/upload', async (request, reply) => {
        const data = await request.file();
        if (!data) return reply.code(400).send({ error: 'Файл не найден' });

        try {
            const inputBuffer = await data.toBuffer();
            const resultBuffer = sorting(inputBuffer);

            return reply
                .header('Content-Type', 'application/zip')
                .header('Content-Disposition', 'attachment; filename=organized_site.zip')
                .send(resultBuffer);
        } catch (err) {
            return reply.code(500).send({ error: 'Ошибка обработки' });
        }
    });
}, { prefix: '/zip-tool' });





// --- TOOL 2: M1-NL (PHP Реплейсер) ---
fastify.register(async function (instance) {
    // Статика для m1-nl лежит в public/m1-nl
    instance.register(fastifyStatic, {
        root: path.join(__dirname, 'public/m1-nl'),
        prefix: '/',
        decorateReply: false // Важно, так как static уже зарегистрирован выше
    });

    // Маршрут для трансформации текста
    instance.post('/transform', async (request, reply) => {
        const { code } = request.body; // Получаем текст из textarea
        
        if (!code) {
            return reply.code(400).send({ error: 'Код пуст' });
        }

        try {
            const transformedData = transformCode(code); // Получаем { result, fonts }
            return { 
                success: true, 
                result: transformedData.result, 
                fonts: transformedData.fonts 
            };
        } catch (err) {
            return reply.code(500).send({ error: 'Ошибка при трансформации' });
        }
    });
}, { prefix: '/m1-nl' });





// --- TOOL 3: JIRA BRIDGE (Очередь для VPN) ---
fastify.register(async function (instance) {
    
    // 1. Прием данных из Google Sheets
    instance.post('/update', async (request, reply) => {
        const { key, message, token } = request.body;

        // Проверка токена из .env
        if (!token || token !== process.env.JIRA_BRIDGE_TOKEN) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!key || !message) {
            return reply.code(400).send({ error: 'Missing key or message' });
        }

        const stmt = db.prepare('INSERT INTO jira_queue (issue_key, comment) VALUES (?, ?)');
        stmt.run(key, message);

        return { success: true, message: 'Added to queue' };
    });

    // 2. Раздача данных для скрипта внутри VPN
    instance.get('/pending', async (request, reply) => {
        const { token } = request.query;

        if (!token || token !== process.env.JIRA_BRIDGE_TOKEN) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const getAndUpdate = db.transaction(() => {
            // 1. Берем новые задачи
            const rows = db.prepare("SELECT id, issue_key, comment FROM jira_queue WHERE status = 'new'").all();
            
            if (rows.length > 0) {
                const ids = rows.map(r => r.id).join(',');
                // 2. Помечаем их как отправленные
                db.prepare(`UPDATE jira_queue SET status = 'sent' WHERE id IN (${ids})`).run();
            }

            // 3. АВТО-ОЧИСТКА: Удаляем всё, что было отправлено более 30 дней назад
            db.prepare("DELETE FROM jira_queue WHERE status = 'sent' AND created_at < datetime('now', '-30 days')").run();

            return rows;
        });

        const tasks = getAndUpdate();
        return tasks;
    });

}, { prefix: '/jira-bridge' });




fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
    if (err) throw err;
    console.log('🚀 Hub started!');
    console.log('📦 Zip-Tool: http://localhost:3000/zip-tool/');
    console.log('📝 M1-NL:    http://localhost:3000/m1-nl/');
    console.log('🔗 Jira Bridge: http://localhost:3000/jira-bridge/');
});