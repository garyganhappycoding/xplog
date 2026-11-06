import "./globals.css";
import "./screens.css";
import "./dump.css";
import { AuthProvider } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import RegisterSW from "@/components/RegisterSW";

export const metadata = {
  title: "XPLog",
  description: "管理好你的生活:日程、待办、倒出箱和日记",
  applicationName: "XPLog",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "XPLog", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
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
