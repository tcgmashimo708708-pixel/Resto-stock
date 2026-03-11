"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Carrot,
    UtensilsCrossed,
    ClipboardList,
    Calculator,
    BarChart3,
    Database,
    DatabaseZap,
    Menu,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
    { name: "ダッシュボード", href: "/", icon: LayoutDashboard },
    { name: "食材管理", href: "/ingredients", icon: Carrot },
    { name: "メニュー管理", href: "/menu-items", icon: UtensilsCrossed },
    { name: "レシピ管理", href: "/recipes", icon: ClipboardList },
    { name: "棚卸入力", href: "/inventory", icon: Calculator },
    { name: "仕入入力", href: "/purchases", icon: Calculator },
    { name: "売上入力", href: "/sales", icon: Calculator },
    { name: "ABC分析", href: "/abc-analysis", icon: BarChart3 },
    { name: "GSバックアップ", href: "/backup", icon: Database },
    { name: "GS同期", href: "/sync", icon: DatabaseZap },
];

export function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // ページ遷移時にモバイルメニューを閉じる
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // PC・モバイル共通のサイドバー中身
    const NavigationContent = () => (
        <>
            <div className="flex h-14 items-center justify-between border-b px-4">
                <h1 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <UtensilsCrossed className="w-5 h-5 text-primary" />
                    <span>RestoStock</span>
                </h1>
                {/* モバイルメニューを閉じるボタン (PCでは隠す) */}
                <button
                    onClick={() => setIsOpen(false)}
                    className="md:hidden p-2 -mr-2 text-muted-foreground hover:bg-accent rounded-md"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
                {items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                            )}
                        >
                            <item.icon className="h-5 w-5" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t text-xs text-muted-foreground">
                © 2026 Admin
            </div>
        </>
    );

    return (
        <>
            {/* 1. モバイル用 上部ヘッダー（ハンバーガーアイコン付き） */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 border-b bg-card z-40 flex items-center px-4 justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2 -ml-2 text-foreground hover:bg-accent rounded-md"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <h1 className="font-bold text-lg tracking-tight flex items-center gap-2">
                        <UtensilsCrossed className="w-5 h-5 text-primary" />
                        <span>RestoStock</span>
                    </h1>
                </div>
            </div>

            {/* 2. モバイル用 オーバーレイ背景（メニューが開いている時） */}
            {isOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* 3. サイドバー本体（PC用は常時表示、モバイル用はスライド式） */}
            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-64 flex-col border-r bg-card text-card-foreground transition-transform duration-300 ease-in-out md:static md:translate-x-0",
                    isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
                )}
            >
                <NavigationContent />
            </div>
        </>
    );
}
