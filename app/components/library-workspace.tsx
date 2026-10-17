"use client";
import { Library } from "./library-explorer";
/** Legacy production URLs resolve to the same folder, never a second gallery. */
export function LibraryWorkspace(_props: { production?: boolean }) {
  return <Library />;
}
