"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  FileText,
  MessageSquare,
  Settings,
  Activity,
  Upload,
  Code,
  Plus,
  HelpCircle,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
  { href: "/sources", label: "Sources", icon: FileText },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/dev", label: "Developer Tools", icon: Code },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 flex flex-col py-6 bg-[var(--color-sidebar-bg)] flex-shrink-0 transition-theme">
      {/* Brand */}
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg premium-gradient flex items-center justify-center">
          <BookOpen className="h-4 w-4 text-[var(--color-on-primary)]" />
        </div>
        <div>
          <h1 className="text-base font-bold text-[var(--color-sidebar-text-active)] tracking-tighter">
            BrainDump
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-foreground-muted)] font-bold opacity-60">
            Digital Curator
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all group",
                isActive
                  ? "text-[var(--color-sidebar-text-active)] font-semibold border-l-4 border-[var(--color-tertiary-fixed)] bg-[var(--color-surface-container-high)]"
                  : "text-[var(--color-sidebar-text)] hover:text-[var(--color-sidebar-text-active)] hover:bg-[var(--color-sidebar-hover)]"
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", isActive && "text-[var(--color-tertiary-fixed)]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 mt-auto">
        <Link
          href="/sources"
          className="w-full premium-gradient text-[var(--color-on-primary)] py-3 rounded-xl font-semibold flex items-center justify-center gap-2 mb-6 hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          <span>New Entry</span>
        </Link>

        <div className="space-y-1">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-4 py-2 text-sm text-[var(--color-sidebar-text)] hover:text-[var(--color-sidebar-text-active)] transition-colors",
              pathname === "/settings" && "text-[var(--color-sidebar-text-active)] font-semibold"
            )}
          >
            <Settings className="h-[18px] w-[18px]" />
            <span>Settings</span>
          </Link>
          <div className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--color-sidebar-text)]">
            <HelpCircle className="h-[18px] w-[18px]" />
            <span>Support</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
