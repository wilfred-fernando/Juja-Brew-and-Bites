"use client";
import { useEffect } from "react";
import "./PosPremium.css";

export default function PosPremium({ children }) {
  useEffect(() => {
    document.body.setAttribute("data-pos-premium", "true");
    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      document.body.style.setProperty("--pos-viewport-height", `${viewport?.height || window.innerHeight}px`);
    };
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    viewport?.addEventListener("resize", updateViewportHeight);
    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      viewport?.removeEventListener("resize", updateViewportHeight);
      document.body.style.removeProperty("--pos-viewport-height");
      document.body.removeAttribute("data-pos-premium");
    };
  }, []);
  return <div className="pos-premium">{children}</div>;
}
