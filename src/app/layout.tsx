import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { APP_VERSION } from "../engine/types";

export const metadata: Metadata = {
  // Версия в заголовке страницы — единый источник APP_VERSION (v0.01.04):
  // раньше здесь стояла устаревшая захардкоженная строка.
  title: `Конструктор СКИБ — v${APP_VERSION}`,
  description:
    "Лабораторный веб-инструмент для практических занятий по проектированию систем с конструктивной информационной безопасностью: домены безопасности, доверенная вычислительная база, функции безопасности, светофор покрытия целей и модель стоимости.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Тема применяется до гидратации: тёмная по умолчанию (5.1 ТЗ v0.01.01),
 * светлая — если выбор сохранён в localStorage (ключ skib-theme).
 */
const themeBootstrap = `
try {
  var t = localStorage.getItem('skib-theme');
  if (t === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
