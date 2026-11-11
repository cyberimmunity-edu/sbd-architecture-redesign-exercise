import type { NextConfig } from "next";

/**
 * Приложение без серверной части (8.1, 10.1 ТЗ): сборка `next build` с
 * `output: "export"` создаёт полностью статический каталог out/, который
 * обслуживается nginx в Docker (10.2) и подходит для статического хостинга (В1).
 * BASE_PATH поддерживает публикацию в подпапке (варианты В1 и В4).
 */

const basePath = process.env.BASE_PATH && process.env.BASE_PATH.trim() !== "/"
  ? process.env.BASE_PATH.replace(/\/$/, "")
  : undefined;

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
