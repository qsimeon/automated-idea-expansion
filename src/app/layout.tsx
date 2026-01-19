import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
