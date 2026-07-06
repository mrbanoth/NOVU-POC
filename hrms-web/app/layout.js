import "./globals.css";

export const metadata = {
  title: "HRMS Notifications - Novu POC",
  description: "Multi-tenant HRMS notification POC on self-hosted Novu",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
