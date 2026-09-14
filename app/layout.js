import "./globals.css";

export const metadata = {
  title: "DeusADS",
  description: "Place ads inside your game and change them without shipping a build.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
