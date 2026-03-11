import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RestoStock - 在庫管理＆売上分析",
  description: "飲食店向け在庫管理＆売上分析システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <div className="flex h-[100dvh] overflow-hidden bg-background">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 md:pt-8 relative">
            {children}
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
