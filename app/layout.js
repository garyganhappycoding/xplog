import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { GraphWindowProvider } from "@/context/GraphWindowContext";
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
          <GraphWindowProvider>
            <AppShell>{children}</AppShell>
          </GraphWindowProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
