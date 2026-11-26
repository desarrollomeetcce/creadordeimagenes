"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function WorkspaceHeaderNavigation({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("workspace-navigation-slot"));
  }, []);
  return slot ? createPortal(children, slot) : null;
}
