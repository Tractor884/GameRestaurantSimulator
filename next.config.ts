import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Статическая сборка: игра на 100% клиентская, сервер только раздаёт файлы.
  // Деплой: nginx раздаёт out/ (см. worklog Task 25-27, VPS пользователя).
  output: "export",
  images: {
    // для output:export оптимизатор next/image недоступен — все ассеты уже WebP
    unoptimized: true,
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
