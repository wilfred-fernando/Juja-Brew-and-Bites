"use client";
import { useEffect } from "react";
import "./PosPremium.css";

export default function PosPremium({ children }) {
  useEffect(() => {
    document.body.setAttribute("data-pos-premium", "true");
    return () => document.body.removeAttribute("data-pos-premium");
  }, []);
  return <div className="pos-premium">{children}</div>;
}
