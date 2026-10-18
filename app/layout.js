import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import RegisterSW from "@/components/RegisterSW";

export const metadata = {
  title: "XPLog 累经簿",
  description: "记录每日行动,累积经验值,复盘成长",
  applicationName: "XPLog",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "XPLog", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#100D0B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
