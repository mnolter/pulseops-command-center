import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseOps | Incident Command Center",
  description:
    "A full-stack DevOps command center for services, monitors, alerts and incidents.",
  openGraph: {
    title: "PulseOps | Incident Command Center",
    description:
      "A portfolio-grade SaaS dashboard with live incident response workflows.",
    type: "website"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
