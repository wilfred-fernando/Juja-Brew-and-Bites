"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import styles from "./PublicPremium.module.css";

const links = [["home", "Home", "/"], ["menu", "Menu", "/menu"], ["promo", "Promos", "/promos"], ["function room", "Function Room", "/function-room"], ["event-cart", "Event Cart", "/event-cart"], ["about", "About Us", "/about"]];
export function PublicNav({ active }) {
  const [open, setOpen] = useState(false);
  return <header className={styles.header}>
    <Link href="/" className={styles.brand} aria-label="JUJA home"><Image src="/finance/juja-logo.png" width={8640} height={2160} sizes="190px" priority alt="JUJA Brew & Bites" /></Link>
    <button type="button" className={styles.toggle} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="public-navigation" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
    <nav id="public-navigation" aria-label="Main navigation" className={`${styles.nav} ${open ? styles.open : ""}`}>
      {links.map(([id,label,href]) => <Link key={id} href={href} aria-current={active === id ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
      <Link href="https://customer.jujabrewandbites.com/login" className={styles.login} onClick={() => setOpen(false)}>Login / Signup <ArrowUpRight size={14} /></Link>
    </nav>
  </header>;
}
