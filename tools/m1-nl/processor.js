export function transformCode(html) {
    let res = html.trim();
    const foundFonts = new Set(); // тута шрифты

    const initCode = `<?php
$cms = require_once $_SERVER['DOCUMENT_ROOT'] . '/init.php';
$cms->landing( 1, 2 ); // Идентификаторы оффера и сайта
?>\n`;

    // 1. Очистка ДО <!DOCTYPE
    const doctypeIndex = res.search(/<!DOCTYPE/i);
    if (doctypeIndex !== -1) {
        res = initCode + res.substring(doctypeIndex);
    } else if (!res.includes('$cms->landing')) {
        res = initCode + res;
    }

    // 2. Удаление аналитики (Безопасное)
    res = res.replace(/<\?(?:php|=)?(?:(?!\?>)[\s\S])*\$(ya_metrika|vk_analitika|popup_script|popup_win)(?:(?!\?>)[\s\S])*\?>/gi, '');

    // 3. Удаление картинок копирайта
    res = res.replace(/<img[^>]+src=['"]<\?(?:php\s+echo|php|=)(?:(?!\?>)[\s\S])*\$copyright\['[bw]-320'\](?:(?!\?>)[\s\S])*\?>['"][^>]*>/gi, '');

    // 4. Замена ссылок Privacy/Agreement
    res = res.replace(/<a[^>]+page=politics[^>]*>[\s\S]*?<\/a>[\s\n\r]*<a[^>]+page=agreement[^>]*>[\s\S]*?<\/a>/gi, "<?php $cms->copyright(' '); ?>");

    // 5. Замены одиночных переменных (ИСПРАВЛЕНО ЭКРАНИРОВАНИЕ <\\?)
    const phpV = (v) => new RegExp("<\\?(?:php\\s+echo|php|=)\\s*\\$" + v + "\\s*;?\\s*\\?>", 'gi');

    res = res.replace(phpV('price_land'), '<?=$cms->price;?>');
    res = res.replace(phpV('price_val'), '<?=$cms->currency;?>');
    res = res.replace(phpV('price_old_land'), '<?=$cms->oldpr;?>');
    res = res.replace(phpV('percent_land'), '<?=$cms->discount;?>');
    res = res.replace(phpV('last'), '12');
    
    // Правило 12: Экономия
    res = res.replace(phpV('economy_land'), '<?=$cms->oldpr - $cms->price;?>');

    // 6. Склейки цен внутри одного PHP блока (ИСПРАВЛЕНО ЭКРАНИРОВАНИЕ)
    // Эти регулярки написаны через /.../, здесь один слеш \? — это норма
    const concatRegexOld = /<\?(?:php|=)\s*(?:(?!\?>)[\s\S])*\$price_old_land(?:(?!\?>)[\s\S])*\$price_val(?:(?!\?>)[\s\S])*\?>/gi;
    const concatRegexNew = /<\?(?:php|=)\s*(?:(?!\?>)[\s\S])*\$price_land(?:(?!\?>)[\s\S])*\$price_val(?:(?!\?>)[\s\S])*\?>/gi;
    
    res = res.replace(concatRegexOld, '<?=$cms->oldpr;?> <?=$cms->currency;?>');
    res = res.replace(concatRegexNew, '<?=$cms->price;?> <?=$cms->currency;?>');

    // 7. Статика
    res = res.replace(/\/\/static\.(?:<\?[\s\S]*?\?>|\$static_domain)\/land\/(.*?)(["'])/gi, (match, path, quote) => {
        if (path.startsWith('fonts/')) {
            // Извлекаем название шрифта: fonts/Akrobat/Akrobat.css -> Akrobat
            const parts = path.split('/');
            if (parts[1]) {
                foundFonts.add(parts[1]);
            }
            return path + quote;
        }
        return '/assets_pages/' + path + quote;
    });

    // 8. Обязательные вставки
    if (res.includes('</head>') && !res.includes('$cms->header()')) {
        res = res.replace('</head>', '<?php $cms->header(); ?>\n</head>');
    }
    if (res.includes('</body>') && !res.includes('$cms->footer()')) {
        res = res.replace('</body>', '<?php $cms->footer(); ?>\n</body>');
    }

    // Формы
    res = res.replace(/<form([^>]*)>/gi, (match, attributes) => {
        let newAttrs = attributes.replace(/action=['"][^'"]*['"]/i, '').replace(/method=['"][^'"]*['"]/i, '');
        return `<form action="" method="post" ${newAttrs.trim()}>\n<?=$cms->params();?>`;
    });

    // Чистка лишних пустых строк
    res = res.replace(/^\s*[\r\n]/gm, '\n');

    return {
        result: res,
        fonts: Array.from(foundFonts)
    };
}