import { RefObject, useCallback, useEffect, useRef, useState } from "react";

interface PanOptions {
  /** Elements matching this selector keep normal drag behavior (text selection) unless hand mode is on. */
  textSelector?: string;
}

/**
 * Drag-to-pan for a scrollable container. Dragging on empty areas pans; dragging on text
 * (when `textSelector` is given) selects it, unless hand mode is toggled or Space is held.
 */
export function usePanScroll(ref: RefObject<HTMLElement | null>, { textSelector }: PanOptions = {}) {
  const [handMode, setHandMode] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const hovering = useRef(false);
  const handRef = useRef(false);
  const spaceRef = useRef(false);
  handRef.current = handMode;

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const tag = (t as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !hovering.current || isTyping(e.target)) return;
      e.preventDefault();
      spaceRef.current = true;
      setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button,input,a")) return;
      const forced = handRef.current || spaceRef.current;
      if (!forced && textSelector && target.closest(textSelector)) return;

      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = el.scrollLeft;
      const startTop = el.scrollTop;
      el.setPointerCapture(e.pointerId);
      setPanning(true);

      const onMove = (ev: PointerEvent) => {
        el.scrollLeft = startLeft - (ev.clientX - startX);
        el.scrollTop = startTop - (ev.clientY - startY);
      };
      const onUp = (ev: PointerEvent) => {
        el.releasePointerCapture?.(ev.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        setPanning(false);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [ref, textSelector],
  );

  const className = `pan-scroll${panning ? " is-panning" : handMode || spaceDown ? " pan-forced" : ""}`;

  return {
    handMode,
    toggleHand: () => setHandMode((v) => !v),
    panProps: {
      className,
      onPointerDown,
      onPointerEnter: () => {
        hovering.current = true;
      },
      onPointerLeave: () => {
        hovering.current = false;
      },
    },
  };
}
