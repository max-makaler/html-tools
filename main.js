import AdmZip from 'adm-zip';
import path from 'path';
import { processHtml, processCss } from './editFiles.js';


// 2. Добавил видео в список
function getTargetFolder(ext) {
    if (ext === '.css') return 'css/';
    if (['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif'].includes(ext)) return 'img/';
    if (['.js'].includes(ext)) return 'js/';
    if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) return 'fonts/';
    if (['.mp4', '.webm', '.ogg'].includes(ext)) return 'video/'; // Добавил видео
    return '';
}

export function sorting(zipBuffer) {
    try {
        const oldZip = new AdmZip(zipBuffer);
        const newZip = new AdmZip();
        const oldFiles = oldZip.getEntries();

        oldFiles.forEach(entry => {
            if (entry.isDirectory) return;

            // Берем только имя файла (без старых папок, если они были)
            const fileName = path.basename(entry.entryName);
            const ext = path.extname(fileName).toLowerCase();
            const folder = getTargetFolder(ext);
            let content = entry.getData();

            // Магия трансформации текста
            if (ext === '.html') {
                content = Buffer.from(processHtml(content.toString()));
            } 
            else if (ext === '.css') {
                content = Buffer.from(processCss(content.toString()));
            }
            // folder будет либо 'css/', 'img/', и т.д., либо '' для index.html
            newZip.addFile(folder + fileName, content);
        });
        
        console.log('🚀 Обработка завершена успешно');
        
        // ВАЖНО: возвращаем Buffer, чтобы server.js мог его отправить
        return newZip.toBuffer(); 

    } catch (e) {
        console.error("Ошибка в функции sorting:", e.message);
        throw e; // Пробрасываем ошибку дальше, чтобы сервер знал о ней
    }
}