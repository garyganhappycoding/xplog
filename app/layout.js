import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "XPLog 累经簿",
  description: "记录每日行动,累积经验值,复盘成长",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
