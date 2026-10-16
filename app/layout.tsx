import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Estudio · Fábrica de afiches",
  description: "Producción publicitaria con inteligencia artificial",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
