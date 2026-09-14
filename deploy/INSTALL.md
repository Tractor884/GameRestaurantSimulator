# Установка и обновление игры на сервере (VPS)

Эта инструкция самодостаточная: «как в первый раз». Просто выполняйте шаги
по порядку, копируя команды целиком. Ничего программировать не нужно.

---

## Что в архиве

| Файл / папка                  | Что это                                        |
| ----------------------------- | ---------------------------------------------- |
| `index.html`, `_next/` и др.  | Сама игра (статические файлы)                  |
| `server/server.js`            | Мини-сервис общего рейтинга игроков (Node.js)  |
| `server/data/leaderboard.json`| База рейтинга — создаётся сама при первом результате |
| `server/restsim-api.service`  | Файл автозапуска сервиса (systemd)             |
| `server/nginx-restsim.conf`   | Конфиг веб-сервера nginx (порт 8080 + API)     |
| `VERSION`                     | Версия сборки (хэш и дата) — для справки       |

После установки общий рейтинг игроков работает так: игра на сервере
обращается к `/api/leaderboard`, nginx передаёт запрос мини-сервису на
порт 3001, сервис хранит результаты в JSON-файле. Друзья, играющие с
разных компьютеров, видят общий рейтинг.

---

## Что понадобится

- Ваш сервер (VPS), доступ по SSH (вы уже играли по адресу `http://IP-СЕРВЕРА:8080`)
- На сервере: nginx (уже установлен с игрой) и Node.js (проверим на шаге 3)

> **Примечание про sudo.** Команды ниже написаны для входа на сервер под
> пользователем `root`. Если вы входите под другим пользователем, добавьте
> `sudo ` в начало каждой команды (например: `sudo mkdir -p /var/www/restsim`).

---

## Шаг 1. Скачайте архив на сервер

Архив `restsim-game.tar.gz` нужно скачать на сервер. Два способа —
используйте любой один.

**Способ А (проще): прямо на сервере.** Подключитесь к серверу по SSH и
выполните (подставьте адрес вашей превью-панели, по которой вы открываете
игру в песочнице):

```bash
wget -O /root/restsim-game.tar.gz "АДРЕС-ПРЕВЬЮ/deploy/restsim-game.tar.gz"
```

Пример, если превью открывается по адресу `https://abc123.example.com`:

```bash
wget -O /root/restsim-game.tar.gz "https://abc123.example.com/deploy/restsim-game.tar.gz"
```

**Способ Б: через компьютер.** Откройте в браузере
`АДРЕС-ПРЕВЬЮ/deploy/restsim-game.tar.gz` — архив скачается. Затем
загрузите его на сервер так же, как вы делали при первой установке игры
(например, через WinSCP или команду на своём компьютере):

```bash
scp restsim-game.tar.gz root@IP-СЕРВЕРА:/root/
```

---

## Шаг 2. Распакуйте архив поверх игры

```bash
mkdir -p /var/www/restsim
tar -xzf /root/restsim-game.tar.gz -C /var/www/restsim
```

Старые файлы игры заменятся новыми, ваши сохранения и рейтинг не в папке
игры — они в браузере и в `server/data/`, ничего не потеряется.

---

## Шаг 3. Проверьте Node.js

Мини-сервису рейтинга нужен Node.js (любая версия от 10-й, есть почти
везде). Проверьте:

```bash
node -v
```

- Если вывелось что-то вроде `v18.19.0` — всё готово, идите к шагу 4.
- Если вывелось `command not found` — установите:

```bash
apt-get update
apt-get install -y nodejs
node -v
```

---

## Шаг 4. Дайте сервису права на папку базы

```bash
chown -R www-data:www-data /var/www/restsim/server
```

(Это одна команда: сервис будет писать результаты в
`/var/www/restsim/server/data/leaderboard.json` от имени пользователя
веб-сервера.)

---

## Шаг 5. Включите автозапуск сервиса рейтинга

```bash
cp /var/www/restsim/server/restsim-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now restsim-api
systemctl status restsim-api
```

В выводе последней команды должно быть `active (running)` зелёным.
Выход из просмотра: нажмите клавишу `q`.

---

## Шаг 6. Обновите конфиг nginx

Новый конфиг добавляет к игре адрес `/api/` (рейтинг) и закрывает от
интернета служебную папку `server/`:

```bash
cp /var/www/restsim/server/nginx-restsim.conf /etc/nginx/conf.d/restsim.conf
nginx -t
systemctl reload nginx
```

`nginx -t` должен написать `syntax is ok` и `test is successful`.

---

## Шаг 7. Проверьте, что всё работает

На сервере:

```bash
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:8080/api/leaderboard
```

- Первая команда должна вывести `{"ok":true,...}`
- Вторая — `{"results":[...]}` (пока пустой список `[]` — так и должно
  быть, записи появятся после первых финалов года)

Затем откройте в браузере `http://IP-СЕРВЕРА:8080` — игра загрузилась.
Зайдите: **Настройки → Рейтинг игроков**. Жёлтой плашки «Оффлайн-версия»
быть не должно. После того как кто-нибудь доиграет год до финала, его
результат появится в таблице у всех игроков.

---

## Если что-то пошло не так

**`systemctl status restsim-api` показывает `failed`**

```bash
journalctl -u restsim-api -n 30
```

Частые причины:
- `node: not found` — Node.js не установлен (вернитесь к шагу 3);
- нет прав на запись — повторите шаг 4 и затем `systemctl restart restsim-api`;
- в файле `/etc/systemd/system/restsim-api.service` путь `/usr/bin/node`
  не совпадает с вашим — проверьте `which node` и поправьте строку
  `ExecStart=` (команда: `nano /etc/systemd/system/restsim-api.service`,
  после правки `systemctl daemon-reload && systemctl restart restsim-api`).

**Игра открывается, но рейтинг с плашкой «Оффлайн-версия»**

```bash
curl http://127.0.0.1:8080/api/leaderboard
```

Если пишет ошибку nginx — конфиг из шага 6 не применился: повторите
`nginx -t` и `systemctl reload nginx`, смотрите их вывод.

**Порт 8080 вдруг перестал открываться**

```bash
nginx -t
systemctl status nginx
```

---

## Резервная копия рейтинга

Весь рейтинг — один файл. Периодически можно сохранять его копию:

```bash
cp /var/www/restsim/server/data/leaderboard.json /root/leaderboard-backup.json
```

Восстановление — обратным копированием и перезапуском:

```bash
cp /root/leaderboard-backup.json /var/www/restsim/server/data/leaderboard.json
chown www-data:www-data /var/www/restsim/server/data/leaderboard.json
systemctl restart restsim-api
```

---

## Как обновлять игру в будущем

1. Скачать новый архив (шаг 1) и распаковать (шаг 2).
2. Повторить шаг 4 (права) и перезапустить сервис:

```bash
chown -R www-data:www-data /var/www/restsim/server
systemctl restart restsim-api
```

3. Шаги 3, 5, 6 повторять не нужно (Node и конфиги уже на месте).

---

## Приложение: установка с нуля (если сервер пустой)

Если игры на сервере ещё нет (чистый Ubuntu/Debian), перед шагом 1
установите nginx:

```bash
apt-get update
apt-get install -y nginx nodejs
```

и дальше выполняйте шаги 1–7 этой инструкции как есть.
