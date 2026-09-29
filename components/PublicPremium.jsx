"use client";
import { usePathname } from "next/navigation";
import styles from "./PublicPremium.module.css";
const publicRoutes = new Set(["/", "/menu", "/promos", "/about", "/function-room", "/event-cart"]);
export default function PublicPremium({ children }) {
  const pathname = usePathname();
  return publicRoutes.has(pathname) ? <div className={styles.site}>{children}</div> : children;
}
