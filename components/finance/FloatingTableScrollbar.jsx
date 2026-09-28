"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function FloatingTableScrollbar({ containerRef }) {
  const barRef = useRef(null);
  const targetRef = useRef(null);
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let target = null;
      let bounds = null;
      for (const table of root.querySelectorAll("table")) {
        let parent = table.parentElement;
        while (parent && root.contains(parent)) {
          if (/auto|scroll/.test(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) {
            const rect = parent.getBoundingClientRect();
            if (rect.top < window.innerHeight - 80 && rect.bottom > window.innerHeight && rect.width > 0) {
              target = parent;
              bounds = rect;
            }
            break;
          }
          parent = parent.parentElement;
        }
      }
      targetRef.current = target;
      if (!target) { setGeometry(null); return; }
      const left = Math.max(8, bounds.left);
      const width = Math.min(window.innerWidth - 8, bounds.right) - left;
      const next = { left, width, scrollWidth: target.scrollWidth - target.clientWidth + width };
      setGeometry((old) => old && old.left === next.left && old.width === next.width && old.scrollWidth === next.scrollWidth ? old : next);
      if (barRef.current && Math.abs(barRef.current.scrollLeft - target.scrollLeft) > 1) barRef.current.scrollLeft = target.scrollLeft;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const observeSizes = () => {
      resize.disconnect();
      resize.observe(root);
      root.querySelectorAll("table").forEach((table) => { resize.observe(table); resize.observe(table.parentElement); });
      schedule();
    };
    const mutation = new MutationObserver(observeSizes);
    mutation.observe(root, { childList: true, subtree: true });
    observeSizes();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [containerRef]);

  useEffect(() => {
    if (geometry && barRef.current && targetRef.current) barRef.current.scrollLeft = targetRef.current.scrollLeft;
  }, [geometry]);

  if (!geometry) return null;
  return createPortal(<div ref={barRef} role="region" aria-label="Scroll finance table horizontally" tabIndex={0}
    onScroll={(event) => { if (targetRef.current) targetRef.current.scrollLeft = event.currentTarget.scrollLeft; }}
    style={{ position: "fixed", bottom: 8, left: geometry.left, width: geometry.width, height: 22, overflowX: "scroll", overflowY: "hidden", zIndex: 90, background: "#e3eeef", border: "1px solid #829ca6", borderRadius: 5, boxShadow: "0 2px 12px #102c3940", scrollbarColor: "#547a83 #e3eeef" }}>
    <div style={{ width: geometry.scrollWidth, height: 1 }} />
  </div>, document.body);
}
