/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статическая сборка: `npm run export` кладёт готовые файлы в static/ бэкенда Здравушки,
  // FastAPI отдаёт их с порта 8000 вместе с API.
  output: "export",
  trailingSlash: true, // /staff/ → staff/index.html — так StaticFiles находит страницы
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
