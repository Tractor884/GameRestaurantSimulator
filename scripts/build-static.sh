#!/usr/bin/env bash
# scripts/build-static.sh — статическая сборка игры для деплоя (nginx на VPS).
#
# Как работает:
#   1. Копирует проект (src, public, конфиги) в deploy-build/ — НЕ трогая живой
#      dev-сервер и его .next (в песочнице нельзя запускать прод-сборку в корне).
#   2. Вырезает из копии рабочие материалы (game-art/_review, _prompts.md) —
#      игрокам они не нужны, на сервер не едут.
#   3. Запускает `next build` (output: "export" в next.config.ts) → deploy-build/out/.
#   4. Пакует out/ в public/deploy/<имя>.tar.gz — архив скачивается с dev-сервера
#      через URL /deploy/<имя>.tar.gz и раскатывается на VPS (см. worklog).
#
# Использование: bash scripts/build-static.sh [имя-архива-без-расширения]
#   по умолчанию имя = restsim-game

set -euo pipefail

ROOT="/home/z/my-project"
BUILD="$ROOT/deploy-build"
NAME="${1:-restsim-game}"

echo "==> 1/5: подготовка копии проекта"
rm -rf "$BUILD"
mkdir -p "$BUILD"
cd "$ROOT"
cp -r src public next.config.ts package.json tsconfig.json postcss.config.mjs tailwind.config.ts components.json "$BUILD/"

echo "==> 2/5: чистка рабочих материалов из копии"
rm -rf "$BUILD/public/game-art/_review" "$BUILD/public/game-art/_prompts.md"
rm -rf "$BUILD/public/deploy"

echo "==> 3/5: статическая сборка Next.js (output: export)"
cd "$BUILD"
node "$ROOT/node_modules/next/dist/bin/next" build

echo "==> 4/5: проверка out/"
test -f "$BUILD/out/index.html" || { echo "ОШИБКА: out/index.html не найден"; exit 1; }
du -sh "$BUILD/out"

echo "==> 5/5: упаковка"
mkdir -p "$ROOT/public/deploy"
git -C "$ROOT" log -1 --format="commit %h от %ad" --date=short > "$BUILD/out/VERSION"
tar -czf "$ROOT/public/deploy/${NAME}.tar.gz" -C "$BUILD/out" .
ls -lh "$ROOT/public/deploy/${NAME}.tar.gz"
echo ""
echo "OK. Архив: public/deploy/${NAME}.tar.gz"
echo "Скачивание: открыть <адрес-превью>/deploy/${NAME}.tar.gz"
