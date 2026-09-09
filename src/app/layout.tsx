import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Симулятор ресторана — управленческая игра",
  description:
    "Браузерный экономический симулятор ресторана casual dining в Москве: спрос, кухня, склад FIFO, персонал, финансы и репутация. 52 недели до финальной оценки.",
  keywords: ["симулятор ресторана", "экономическая игра", "управление рестораном", "P&L", "food cost", "калькуляция"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Симулятор ресторана",
    description: "Экономический симулятор ресторана: 52 недели управления — от закупок до BSC",
    url: "https://chat.z.ai",
    siteName: "Z.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Симулятор ресторана",
    description: "Экономический симулятор ресторана: 52 недели управления — от закупок до BSC",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
