"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const EXIT_DURATION = 140;
const ENTER_DURATION = 220;

function isModifiedNavigation(event) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function shouldAnimateAnchor(anchor) {
  if (!anchor || typeof window === "undefined") return false;
  if (anchor.dataset.pageTransition === "off") return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  try {
    const destination = new URL(href, window.location.href);
    const current = new URL(window.location.href);

    if (destination.origin !== current.origin) return false;
    if (
      destination.pathname === current.pathname &&
      destination.search === current.search &&
      destination.hash
    ) {
      return false;
    }

    return destination.href !== current.href;
  } catch {
    return false;
  }
}

export default function PageTransition({ children }) {
  const pathname = usePathname();
  const shellRef = useRef(null);
  const exitTimerRef = useRef(null);
  const enterTimerRef = useRef(null);
  const [phase, setPhase] = useState("enter");

  useEffect(() => {
    window.clearTimeout(exitTimerRef.current);
    window.clearTimeout(enterTimerRef.current);
    setPhase("enter");
    enterTimerRef.current = window.setTimeout(() => setPhase("idle"), ENTER_DURATION);

    return () => {
      window.clearTimeout(enterTimerRef.current);
    };
  }, [pathname]);

  useEffect(() => {
    return () => {
      window.clearTimeout(exitTimerRef.current);
      window.clearTimeout(enterTimerRef.current);
    };
  }, []);

  function handleClickCapture(event) {
    if (event.defaultPrevented || event.button !== 0 || isModifiedNavigation(event)) return;
    if (event.target?.closest?.("[data-page-transition='off']")) return;

    const anchor = event.target?.closest?.("a");
    if (!shouldAnimateAnchor(anchor)) return;

    setPhase("exit");
    window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => setPhase("idle"), EXIT_DURATION);
  }

  return (
    <div
      ref={shellRef}
      className="page-transition-shell"
      data-page-transition-phase={phase}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  );
}
