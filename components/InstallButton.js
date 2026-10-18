"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

// Shows an "install" button when the browser says the app can be installed (Android/Chrome,
// desktop Chrome). Hidden once installed. iOS has no such event - use Share > Add to Home Screen.
export default function InstallButton() {
  const [promptEvent, setPromptEvent] = useState(null);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPromptEvent(e); };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  const install = async () => {
    promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  };

  return (
    <button className="xl-topbar__logout" onClick={install} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Download size={13} />安装
    </button>
  );
}
