"use client";

import Link from "next/link";
import { ArrowUpRight, Command, LayoutTemplate, LogOut, Orbit } from "lucide-react";
import styles from "./FinanceFutureShell.module.css";

const sectionCopy = {
  expenses: ["Expenses & petty cash", "Every transaction. A clearer perspective."],
  inventory: ["Inventory workspace", "Track movement. Keep every item accounted for."],
  payroll: ["Payroll workspace", "Your people, their time, and every pay period."],
};

export default function FinanceFutureShell({ children, navItems, activeSection, financePath, userEmail, userRole, onLogout, onClassic }) {
  const [title, subtitle] = sectionCopy[activeSection] || sectionCopy.expenses;
  return <div className={styles.shell} data-finance-interface="future">
    <a className={styles.skip} href="#finance-workspace">Skip to workspace</a>
    <aside className={styles.rail}>
      <div className={styles.brand}><span className={styles.mark}><Orbit size={25} /></span><div>JUJA<span>FINANCE / WORKSPACE</span></div></div>
      <div className={styles.railLabel}>CONTROL CENTER</div>
      <nav className={styles.navigation} aria-label="Finance pages">
        {navItems.map(([key, path, label, Icon], index) => <Link key={key} href={financePath(path)} aria-current={activeSection === key ? "page" : undefined} className={styles.navItem}>
          <Icon size={19} /><span>{label}</span><small>0{index + 1}</small>
        </Link>)}
      </nav>
      <div className={styles.railFooter}>
        <div className={styles.mode}><Command size={16} /><span>FUTURE INTERFACE</span></div>
        <button type="button" onClick={onClassic} className={styles.classic}><LayoutTemplate size={16} />Classic interface<ArrowUpRight size={14} /></button>
        <p>Switch back whenever you prefer.</p>
      </div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}>JUJA <span>/</span> FINANCE <span>/</span> <strong>{activeSection}</strong></div>
        <div className={styles.account}><span className={styles.avatar}>{(userEmail || "J").slice(0, 1).toUpperCase()}</span><div><strong>{userEmail}</strong><small>{String(userRole || "Staff").replaceAll("_", " ")}</small></div><button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button></div>
      </header>
      <main id="finance-workspace" className={styles.main}>
        <div className={styles.intro}><div><p className={styles.eyebrow}>FINANCIAL OPERATIONS</p><h1>{title}</h1><p className={styles.subtitle}>{subtitle}</p></div><span className={styles.edition}><span />JUJA FINANCE</span></div>
        <div className={styles.content}>{children}</div>
        <footer className={styles.footer}><span>JUJA BREW & BITES</span><span>Finance workspace / Future interface</span></footer>
      </main>
    </div>
  </div>;
}
