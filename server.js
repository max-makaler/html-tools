import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { sorting } from './main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ 
    logger: true,
    bodyLimit: 52428800 // 50 MB 
});

fastify.register(multipart, {
    limits: {
        fileSize: 52428800 // 50 MB
    }
});
fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

fastify.post('/upload', async (request, reply) => {
    // 1. Принимаем файл из запроса
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'Файл не найден' });

    try {
        const inputBuffer = await data.toBuffer();

        // 2. Отдаем в функцию-обработчик
        const resultBuffer = sorting(inputBuffer);

        // 3. Отдаем результат пользователю
        return reply
            .header('Content-Type', 'application/zip')
            .header('Content-Disposition', 'attachment; filename=organized_site.zip')
            .send(resultBuffer);

    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Ошибка при обработке архива' });
    }
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
    if (err) throw err;
    console.log('🚀 Server is running on http://localhost:3000');
});