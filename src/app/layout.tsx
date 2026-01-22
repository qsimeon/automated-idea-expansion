import type { Metadata } from "next";
import { SessionProvider } from "@/components/providers/session-provider";

export const metadata: Metadata = {
  title: "Automated Idea Expansion",
  description: "Transform your half-formed ideas into polished content automatically",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
