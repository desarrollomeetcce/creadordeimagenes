import type { Metadata } from "next";
import "./globals.css";
import { ThemeToggle } from "./components/theme-toggle";
export const metadata: Metadata = {
  title: "Estudio · Fábrica de afiches",
  description: "Producción publicitaria con inteligencia artificial",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("estudio-appearance");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}` }} /></head>
      <body>{children}<ThemeToggle /></body>
    </html>
  );
}
