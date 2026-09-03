import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sidebar — every answer, plus a second opinion",
  description:
    "A two-panel chatbot: one side answers, the other side reviews the answer, pushes back, and points you to what to learn next.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
