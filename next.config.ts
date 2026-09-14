import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Деплой (VPS, nginx, статика) НЕ использует этот конфиг напрямую:
     scripts/build-static.sh собирает копию проекта с output:"export"
     (без API-роутов) — здесь конфиг остаётся дев-режимным, чтобы
     /api/leaderboard (Prisma + общий рейтинг) работал в песочнице. */
  images: {
    // все игровые ассеты уже WebP — оптимизатор не нужен (паритет с прод-статикой)
    unoptimized: true,
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
