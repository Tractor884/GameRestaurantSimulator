/**
 * МИНИ-СЕРВИС ОБЩЕГО РЕЙТИНГА ИГРОКОВ «Симулятор ресторана» (Task 31).
 * ============================================================================
 * Зачем: игра на VPS раздаётся как статика (nginx), у статики нет своего
 * API — поэтому общий рейтинг среди друзей живёт в этом маленьком сервисе.
 *
 * Что делает (контракт 1-в-1 с /api/leaderboard из Next.js-версии):
 *   GET  /api/leaderboard  → топ-50 финалов { results: [...] }
 *                            (score ↓, при равных очках раньше сыгравший выше)
 *   POST /api/leaderboard  → сохранить результат финала → 201 { result }
 *                            (валидация как zod-схема в Next.js, 400 { error })
 *   GET  /api/health       → { ok: true, entries, ... } — проверка живости
 *
 * Хранение: обычный JSON-файл data/leaderboard.json рядом со скриптом.
 * Зависимости: НЕТ — только встроенный модуль http/fs/path. Работает на
 * Node.js 10+ (Ubuntu 20.04/22.04/24.04, Debian 11/12) одним способом:
 *     node index.js        (на VPS: см. systemd-юнит restsim-api.service)
 * В песочнице: bun --hot index.js (авто-перезапуск при правках).
 *
 * Порт: 3001 (см. константу ниже). nginx проксирует /api/ сюда же.
 * Безопасность: база хранится рядом со скриптом; в веб её не отдаём —
 * nginx блокирует путь /server/ (см. deploy/nginx-restsim.conf).
 * Сервис пишет максимум 1000 записей (старейшие сверх лимита удаляются).
 * ============================================================================
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

// ---------- Настройки -------------------------------------------------------

/** Порт. На VPS совпадает с proxy_pass в nginx-restsim.conf. */
var PORT = 3001;
/** Интерфейс. На VPS systemd задаёт HOST=127.0.0.1 (наружу не торчит). */
var HOST = process.env.HOST || '0.0.0.0';
/** Файл базы рейтинга — рядом со скриптом (не зависит от рабочей папки). */
var DATA_DIR = path.join(__dirname, 'data');
var DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');
/** Сколько записей храним (защита от бесконечного роста файла). */
var MAX_STORED = 1000;
/** Сколько записей отдаём (как в Next.js-версии: топ-50). */
var TOP_N = 50;
/** Лимит тела запроса — результат финала заведомо меньше. */
var MAX_BODY = 64 * 1024;

var SERVICE_VERSION = '1.0.0';
var STARTED_AT = new Date().toISOString();

// Допустимые ранги финальной оценки (ключи RANK_PRESENTATION движка, A+…D−).
var RANK_IDS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];
// Допустимые сложности (ключи DIFFICULTIES движка).
var DIFFICULTY_IDS = ['novice', 'standard', 'professional'];

// ---------- База (JSON-файл) ------------------------------------------------

/**
 * Формат файла: { "version": 1, "seq": 12, "results": [ ... ] }
 * seq — счётчик для коротких монотонных id ("r13"), переживает перезапуск.
 */
var db = { version: 1, seq: 0, results: [] };

function loadDb() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.results)) {
      db.version = 1;
      db.seq = typeof parsed.seq === 'number' && parsed.seq >= 0 ? parsed.seq : 0;
      db.results = parsed.results.filter(isValidEntryLoose);
      log('База загружена: ' + db.results.length + ' записей (seq=' + db.seq + ')');
      return;
    }
    throw new Error('неверный формат');
  } catch (e) {
    if (e.code === 'ENOENT') {
      log('Базы ещё нет — начнём с пустой (создастся при первом результате)');
      return;
    }
    // Файл есть, но повреждён: не падаем — бэкапим и начинаем заново.
    var broken = DATA_FILE + '.broken-' + Date.now();
    try {
      fs.renameSync(DATA_FILE, broken);
      log('ВНИМАНИЕ: база не читалась (' + e.message + ') — сохранена как ' + path.basename(broken) + ', начинаю с пустой');
    } catch (e2) {
      log('ВНИМАНИЕ: база не читалась и не перенесена: ' + e2.message);
    }
  }
}

/** Грубая проверка при загрузке (чужой/старый файл не должен уронить сервис). */
function isValidEntryLoose(e) {
  return e && typeof e === 'object' &&
    typeof e.id !== 'undefined' &&
    typeof e.nick === 'string' &&
    typeof e.score === 'number';
}

/** Атомарная запись: сначала во временный файл, потом переименование. */
function saveDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  var tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Валидация (зеркало zod-схемы Next.js, те же тексты ошибок) ------

function isNonEmptyObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Проверка полей результата; null = всё ок, иначе текст первой ошибки. */
function validateEntry(body) {
  if (!isNonEmptyObject(body)) return 'Некорректные данные результата';

  // ник: строка 2–24 (после trim)
  if (typeof body.nick !== 'string') return 'Ник обязателен';
  var nick = body.nick.trim();
  if (nick.length < 2) return 'Ник: минимум 2 символа';
  if (nick.length > 24) return 'Ник: максимум 24 символов';

  // название ресторана: строка 1–60 (после trim)
  if (typeof body.restaurantName !== 'string') return 'Название ресторана обязательно';
  var restaurantName = body.restaurantName.trim();
  if (restaurantName.length < 1) return 'Название ресторана: минимум 1 символ';
  if (restaurantName.length > 60) return 'Название ресторана: максимум 60 символов';

  // уровень: один из рангов A+…D−
  if (typeof body.level !== 'string' || RANK_IDS.indexOf(body.level) === -1) {
    return 'Недопустимый уровень (ранг A+…D−)';
  }

  // очки: целое 0–1000
  if (typeof body.score !== 'number') return 'Очки должны быть числом';
  if (!Number.isInteger(body.score)) return 'Очки должны быть целым числом';
  if (body.score < 0) return 'Очки: минимум 0';
  if (body.score > 1000) return 'Очки: максимум 1000';

  // сложность: novice | standard | professional
  if (typeof body.difficulty !== 'string' || DIFFICULTY_IDS.indexOf(body.difficulty) === -1) {
    return 'Недопустимая сложность';
  }

  // недель прожито: целое 1–52
  if (typeof body.weeksLived !== 'number') return 'Недели должны быть числом';
  if (!Number.isInteger(body.weeksLived)) return 'Недели должны быть целым числом';
  if (body.weeksLived < 1) return 'Недель прожито: минимум 1';
  if (body.weeksLived > 52) return 'Недель прожито: максимум 52';

  return null; // ошибок нет
}

// ---------- HTTP ------------------------------------------------------------

function sendJson(res, status, payload) {
  var body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // CORS: игра может лежать и на другом адресе — разрешаем чтение всем.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Топ-N: очки ↓, при равных — раньше сыгравший выше (createdAt ↑). */
function topResults() {
  var sorted = db.results.slice().sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
  return sorted.slice(0, TOP_N);
}

function readBody(req, cb) {
  var chunks = [];
  var size = 0;
  req.on('data', function (chunk) {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.destroy(); // слишком большое тело — обрываем
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', function () {
    cb(null, Buffer.concat(chunks).toString('utf8'));
  });
  req.on('error', function (e) {
    cb(e, null);
  });
}

function handleLeaderboard(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { results: topResults() });
    return;
  }
  if (req.method === 'POST') {
    readBody(req, function (err, raw) {
      if (err) {
        sendJson(res, 400, { error: 'Не удалось прочитать запрос' });
        return;
      }
      var body;
      try {
        body = JSON.parse(raw);
      } catch (e) {
        sendJson(res, 400, { error: 'Тело запроса — не JSON' });
        return;
      }
      var problem = validateEntry(body);
      if (problem) {
        sendJson(res, 400, { error: problem });
        return;
      }
      try {
        var now = new Date().toISOString();
        db.seq += 1;
        var entry = {
          id: 'r' + db.seq,
          nick: body.nick.trim(),
          restaurantName: body.restaurantName.trim(),
          level: body.level,
          score: body.score,
          difficulty: body.difficulty,
          weeksLived: body.weeksLived,
          createdAt: now,
          updatedAt: now,
        };
        db.results.push(entry);
        // Лимит хранилища: старейшие записи (по createdAt) уходят первыми.
        if (db.results.length > MAX_STORED) {
          db.results.sort(function (a, b) {
            return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
          });
          db.results = db.results.slice(db.results.length - MAX_STORED);
        }
        saveDb();
        log('Новый результат: ' + entry.nick + ' — ' + entry.score + ' очков (' + entry.level + ')');
        sendJson(res, 201, { result: entry });
      } catch (e) {
        log('ОШИБКА записи: ' + e.message);
        sendJson(res, 500, { error: 'Не удалось сохранить результат — попробуйте позже' });
      }
    });
    return;
  }
  sendJson(res, 405, { error: 'Метод не поддерживается' });
}

var server = http.createServer(function (req, res) {
  var started = Date.now();
  var url = req.url || '/';
  // Маршрут — без строки запроса: через nginx/шлюз запрос может прийти с
  // доп. query-параметрами (напр., ?XTransformPort=3001 в песочнице).
  var pathname = url.split('?')[0];

  // Префлайт CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    logLine(req.method, url, 204, started);
    return;
  }

  // Маршруты (как в Next.js-версии + health для мониторинга)
  if (pathname === '/api/leaderboard' || pathname === '/api/leaderboard/') {
    handleLeaderboard(req, res);
    logLine(req.method, url, res.statusCode, started);
    return;
  }
  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'restsim-leaderboard',
      version: SERVICE_VERSION,
      entries: db.results.length,
      startedAt: STARTED_AT,
    });
    logLine(req.method, url, 200, started);
    return;
  }

  sendJson(res, 404, { error: 'Не найдено' });
  logLine(req.method, url, 404, started);
});

// ---------- Логи и запуск ---------------------------------------------------

function log(msg) {
  console.log('[' + new Date().toISOString() + '] ' + msg);
}
function logLine(method, url, status, started) {
  log(method + ' ' + url + ' → ' + status + ' (' + (Date.now() - started) + ' мс)');
}

loadDb();

// Проверка прав записи при старте: если www-data не может создать data/,
// это сразу видно в логах (systemctl status restsim-api), а не молчаливые
// 500-е при попытке сохранить результат.
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch (e) {
  log('ВНИМАНИЕ: нет прав на запись в ' + DATA_DIR + ' — результаты сохраняться НЕ БУДУТ! ' +
    'Выполните: chown -R www-data:www-data <папка-server> (' + e.message + ')');
}

server.listen(PORT, HOST, function () {
  log('Сервис рейтинга запущен: http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
  log('GET  /api/leaderboard — топ-' + TOP_N + '; POST /api/leaderboard — новый результат');
  log('База: ' + DATA_FILE + ' (лимит ' + MAX_STORED + ' записей)');
});

// Аккуратное завершение (systemd restart/reload)
function shutdown() {
  log('Останавливаюсь (получен сигнал завершения)…');
  server.close(function () {
    process.exit(0);
  });
  setTimeout(function () {
    process.exit(0);
  }, 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
