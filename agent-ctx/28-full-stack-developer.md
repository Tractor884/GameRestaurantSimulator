# Task ID: 28 — Регистрация по нику + рейтинг игроков (игра с друзьями)

Agent: full-stack-developer
Дата: 2026-09-14
Основной worklog: /home/z/my-project/worklog.md (Task ID: 28 — полная запись там)

## Что сделано (кратко)

1. **Prisma**: User/Post → `PlayerResult` (nick 2–24, restaurantName, level, score 0–1000, difficulty, weeksLived, @@index([score])); `bun run db:push` OK; использование User/Post в src/ не найдено (rg — 0).
2. **API** `src/app/api/leaderboard/route.ts`: GET топ-50 (score desc, createdAt asc), POST c zod-валидацией (ранги и сложности берутся из движка: `Object.keys(RANK_PRESENTATION)` / `Object.keys(DIFFICULTIES)`); 400/500 с понятными ошибками; дубль не перезаписывается — каждый финал = отдельная строка.
3. **Движок**: `GameState.playerNick?`, `SetupOptions.nick?`, `createGame: playerNick: opts.nick?.trim() || undefined`. Детерминизм не затронут (full-game ×2 байт-в-байт, эталон 185.3 млн/13.4 млн/568).
4. **SetupWizard**: поле «Ваш ник (для рейтинга среди друзей)» на ПЕРВОМ шаге (шаг «Сложность» — фактический первый шаг визарда; название ресторана вводится на последнем), обязательное, 2–24 симв., «Далее» disabled + красная подсказка; автоподстановка из localStorage `rest-sim-nick` через `useSyncExternalStore` (без hydration mismatch и без setState-в-effect); на шаге «Запуск» — строка «Ник в рейтинге» + подпись под названием; кнопка «Открыть ресторан!» тоже блокируется без ника.
5. **LeaderboardTable** (новый общий компонент): fetch GET /api/leaderboard + кнопка «Обновить», скелетоны, пустое состояние «Рейтинг пуст — вы будете первыми», ошибка + «Повторить», медали 🥇🥈🥉, бейдж уровня (A emerald / B amber / C-D stone), очки tabular, своя строка подсвечена bg-amber-50 + бейдж «это вы» (совпадение nick+score), ScrollArea max-h-64 (паттерн 26-ui: type=always + max-h на Viewport).
6. **GameOverDialog**: однократная авто-отправка POST при phase==='gameover' (useRef + условие; плюс отпечаток `nick|seed|score|weeks` в localStorage `rest-sim-submitted` — защита от дубля после ПЕРЕЗАГРУЗКИ страницы, useRef один reload не переживает); статусы «⏳ Отправляем…» / «✓ Результат отправлен в рейтинг» (emerald) / «Не удалось отправить» + «Повторить» (red); старый сейв без ника → поле ручного ввода + «Отправить в рейтинг»; секция «Рейтинг игроков» перед кнопками действий (refreshKey подтягивает свежие данные после отправки).
7. **SettingsScreen**: секция «Рейтинг игроков» + диалог с той же таблицей (общий компонент) — сравниться с друзьями до конца года.

## Верификация

- tsc: 0 ошибок src/; lint: чисто (2 ошибки react-hooks/set-state-in-effect в моих новых файлах исправлены: useSyncExternalStore вместо эффекта, setState в асинхронных колбэках промиса).
- curl: POST валидный → 201; nick 'a' → 400 «Ник: минимум 2 символа»; score 5000 → 400; level 'S'/difficulty 'hardcore' → 400; weeksLived 0 → 400; битый JSON → 400; GET → отсортированный массив.
- e2e agent-browser (изолированная сессия t28 — параллельный агент 27-b работал в дефолтной): визард → «Далее» disabled без ника → «ТестРейтинг» → 7 шагов → «Открыть ресторан!» → localStorage rest-sim-nick=ТестРейтинг, автосейв playerNick=ТестРейтинг. Settings → «Рейтинг игроков»: все 5 curl-записей с местами/уровнями/очками. Финальный экран проверен импортом сейва (scripts/make-final-save.ts — движковый прогон 49 недель с gameover): авто-отправка 557/C+/49 нед → «✓ отправлен», строка с «это вы», повторное открытие диалога НЕ дублирует запись, перезагрузка страницы НЕ дублирует (отпечаток). Старый сейв без ника: ручной ввод, кнопка disabled при 1 символе, «ВетеранКухни» отправлен, localStorage обновлён. Консоль 0 errors/warnings, page errors 0. Мобайл 390×844: scrollWidth=clientWidth=390 на визарде, финальном диалоге и диалоге рейтинга.
- VLM-QA скриншотов (download/28-qa.md): визард (ник+подсказка+disabled Далее+карточки сложности — все true), таблица рейтинга (колонки, медаль, бейджи, счётчик — все true), финал (✓ строка, «это вы», 557/1000 C+ — все true).
- Тестовые записи БД вычищены (deleteMany), download/28-final-save*.json удалены, dev-сервер упал во время работы параллельного агента — перезапущен nohup (HTTP 200).

## Файлы

- prisma/schema.prisma, src/app/api/leaderboard/route.ts (новый), src/lib/game/types.ts, src/lib/game/engine/setup.ts, src/components/game/SetupWizard.tsx, src/components/game/LeaderboardTable.tsx (новый), src/components/game/GameOverDialog.tsx, src/components/game/screens/SettingsScreen.tsx, scripts/make-final-save.ts (новый), scripts/qa-28.ts (новый).
- Скриншоты: download/28-wizard-nick.png, 28-leaderboard.png, 28-final-leaderboard.png, 28-final-desktop.png, 28-manual-nick-sent.png, 28-leaderboard-empty.png, 28-wizard-mobile.png, 28-leaderboard-mobile.png, 28-final-mobile.png, отчёт download/28-qa.md.

## Наблюдения следующим агентам

- Dev-сервер на 3000 умирал в 07:35 (вероятно, из-за параллельной работы/перекомпиляции) — я перезапустил `nohup bun run dev` (фон, detached). Если увидите порт занят/свободен — проверьте ps aux.
- Параллельный агент 27-b гонял e2e в ДЕФОЛТНОЙ сессии agent-browser (ник «Тестер27b» в дефолтном localStorage) — для своих e2e используйте `--session <name>`, дефолтную не трогайте.
- `agent-browser close` стирает localStorage сессии (контекст уничтожается) — для сохранения состояния между прогонами используйте `state save/load`.
- Правило react-hooks/set-state-in-effect (React Compiler lint) запрещает синхронный setState в теле эффекта: для чтения localStorage при монтировании юзайте useSyncExternalStore (getServerSnapshot → '' решает hydration), для fetch — setState только в .then/.catch.
