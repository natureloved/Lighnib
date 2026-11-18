"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/login", label: "Login" },
  { href: "/pay", label: "Pay" },
  { href: "/wallet", label: "Wallet" },
  { href: "/receipts", label: "Receipts" },
  { href: "/dispute", label: "Dispute" },
];

/** Floating bottom nav pill. The active route gets a gold dot. */
export default function Nav() {
  const pathname = usePathname();
  return (
    <nav>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={pathname === l.href ? "active" : undefined}
          aria-current={pathname === l.href ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
