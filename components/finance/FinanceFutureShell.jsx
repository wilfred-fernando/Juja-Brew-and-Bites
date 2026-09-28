"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Command, LayoutTemplate, LogOut } from "lucide-react";
import styles from "./FinanceFutureShell.module.css";

export default function FinanceFutureShell({ children, navItems, activeSection, financePath, userEmail, userRole, onLogout, onClassic }) {
  return <div className={styles.shell} data-finance-interface="future">
    <a className={styles.skip} href="#finance-workspace">Skip to workspace</a>
    <aside className={styles.rail}>
      <div className={styles.logoBrand}><Image src="/finance/juja-logo.png" alt="JUJA Brew & Bites" width={8640} height={2160} sizes="320px" priority className={styles.logoImage} /><span>FINANCE / WORKSPACE</span></div>
      <div className={styles.railLabel}>CONTROL CENTER</div>
      <nav className={styles.navigation} aria-label="Finance pages">
        {navItems.map(([key, path, label, Icon], index) => <Link key={key} href={financePath(path)} aria-current={activeSection === key ? "page" : undefined} className={styles.navItem}>
          <Icon size={19} /><span>{label}</span><small>0{index + 1}</small>
        </Link>)}
      </nav>
      <div className={styles.railFooter}>
        <div className={styles.sidebarAccount}>
          <div className={styles.accountIdentity}><span className={styles.avatar}>{(userEmail || "J").slice(0, 1).toUpperCase()}</span><div><strong>{userEmail}</strong><small>{String(userRole || "Staff").replaceAll("_", " ")}</small></div></div>
          <button type="button" onClick={onLogout} className={styles.signOut}><LogOut size={16} />Sign Out</button>
        </div>
        <div className={styles.mode}><Command size={16} /><span>FUTURE INTERFACE</span></div>
        <button type="button" onClick={onClassic} className={styles.classic}><LayoutTemplate size={16} />Classic interface<ArrowUpRight size={14} /></button>
        <p>Switch back whenever you prefer.</p>
      </div>
    </aside>
    <div className={styles.workspace}>
      <main id="finance-workspace" className={styles.main}>
        <div className={styles.content}>{children}</div>
        <footer className={styles.footer}><span>JUJA BREW & BITES</span><span>Finance workspace / Future interface</span></footer>
      </main>
    </div>
  </div>;
}
