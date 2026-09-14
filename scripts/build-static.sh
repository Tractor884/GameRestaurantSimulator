#!/usr/bin/env bash
# scripts/build-static.sh — статическая сборка игры для деплоя (nginx на VPS).
#
# Как работает:
#   1. Копирует проект (src, public, конфиги) в deploy-build/ — НЕ трогая живой
#      dev-сервер и его .next (в песочнице нельзя запускать прод-сборку в корне).
#   2. Вырезает из копии рабочие материалы (game-art/_review, _prompts.md) —
#      игрокам они не нужны, на сервер не едут.
#   3. Вырезает из копии API-роуты (src/app/api) — output:"export" их не умеет,
#      а рейтинг в оффлайн-версии работает через локальную историю (Task 30).
#   4. Подменяет next.config.ts на статический вариант (output: "export"):
#      основной конфиг проекта остаётся дев-режимным (API + Prisma в песочнице).
#   5. Запускает `next build` → deploy-build/out/.
#   6. Пакует out/ в public/deploy/<имя>.tar.gz — архив скачивается с dev-сервера
#      через URL /deploy/<имя>.tar.gz и раскатывается на VPS (см. worklog).
#
# Использование: bash scripts/build-static.sh [имя-архива-без-расширения]
#   по умолчанию имя = restsim-game

set -euo pipefail

ROOT="/home/z/my-project"
BUILD="$ROOT/deploy-build"
NAME="${1:-restsim-game}"

echo "==> 1/6: подготовка копии проекта"
rm -rf "$BUILD"
mkdir -p "$BUILD"
cd "$ROOT"
cp -r src public next.config.ts package.json tsconfig.json postcss.config.mjs tailwind.config.ts components.json "$BUILD/"

echo "==> 2/6: чистка рабочих материалов из копии"
rm -rf "$BUILD/public/game-art/_review" "$BUILD/public/game-art/_prompts.md"
rm -rf "$BUILD/public/deploy"

echo "==> 3/6: вырезаем API-роуты (статика их не поддерживает)"
rm -rf "$BUILD/src/app/api"

echo "==> 4/6: подменяем next.config.ts на статический (output: export)"
cat > "$BUILD/next.config.ts" <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Статическая сборка: игра на 100% клиентская, сервер только раздаёт файлы.
  // Этот конфиг живёт ТОЛЬКО в deploy-копии (scripts/build-static.sh);
  // основной next.config.ts проекта — дев-режимный (API + Prisma).
  output: "export",
  images: {
    // для output:export оптимизатор next/image недоступен — все ассеты уже WebP
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
EOF

echo "==> 5/6: статическая сборка Next.js (output: export)"
cd "$BUILD"
node "$ROOT/node_modules/next/dist/bin/next" build

echo "==> 6/6: проверка out/ и упаковка"
test -f "$BUILD/out/index.html" || { echo "ОШИБКА: out/index.html не найден"; exit 1; }
du -sh "$BUILD/out"
mkdir -p "$ROOT/public/deploy"
git -C "$ROOT" log -1 --format="commit %h от %ad" --date=short > "$BUILD/out/VERSION"
tar -czf "$ROOT/public/deploy/${NAME}.tar.gz" -C "$BUILD/out" .
ls -lh "$ROOT/public/deploy/${NAME}.tar.gz"
echo ""
echo "OK. Архив: public/deploy/${NAME}.tar.gz"
echo "Скачивание: открыть <адрес-превью>/deploy/${NAME}.tar.gz"
