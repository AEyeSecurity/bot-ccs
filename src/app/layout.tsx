import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOT CCS",
  description: "Panel de control para Clínica Cruz del Sur",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
