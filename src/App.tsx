import { Capacitor } from "@capacitor/core";
import { usePath, go } from "./lib/router";
import { SessionProvider, useSession } from "./lib/session";
import { ToastProvider } from "./ui/kit";
import { ResetPassword } from "./ui/Auth";
import { Book } from "./customer/Book";
import { Feed } from "./customer/Feed";
import { MessagesPage } from "./ui/Messages";
import { Track } from "./customer/Track";
import { MyJobs } from "./customer/MyJobs";
import { Work } from "./worker/Work";
import { Admin } from "./admin/Admin";
import { Settings } from "./ui/Settings";
import { VerifyPage } from "./ui/Verify";
import { Privacy, Support, Terms } from "./ui/Legal";
import { Pricing } from "./ui/Pricing";
import { lastSide } from "./ui/SideSwitch";
import { Landing } from "./ui/Landing";
import { startPush } from "./lib/push";

void startPush();

function Routes() {
  const path = usePath().split("?")[0];
  const { session, ready, profile } = useSession();
  if (path === "/reset") return <div className="app"><ResetPassword onDone={() => go("/", true)} /></div>;
  // Admin lives on its own address (admin.moremahi.com) and opens for anyone with the admin role. /admin keeps working on the main site until that address is connected.
  if (location.hostname.startsWith("admin.") || path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/work")) return <Work />;
  if (path === "/privacy") return <Privacy />;
  if (path === "/terms") return <Terms />;
  if (path === "/support") return <Support />;
  if (path === "/pricing") return <Pricing />;
  if (path === "/settings") {
    if (ready && !session) { go("/", true); return null; }
    return <Settings />;
  }
  if (path === "/verify") {
    if (ready && !session) { go("/", true); return null; }
    return <VerifyPage onClose={() => (history.length > 1 ? history.back() : go("/"))} />;
  }
  const m = path.match(/^\/job\/([0-9a-f-]{36})$/);
  if (m) {
    if (ready && !session) { go("/", true); return null; }
    return <Track id={m[1]} />;
  }
  if (path === "/jobs") {
    if (ready && !session) { go("/", true); return null; }
    return <MyJobs />;
  }
  if (path === "/messages" || path.startsWith("/messages/")) return <MessagesPage jobId={path.split("/")[2]} />;
  if (path === "/find") return <Feed />;
  if (path === "/") {
    // On the website, someone who isn't signed in sees the landing page first. The app opens straight on Get help.
    if (!Capacitor.isNativePlatform()) { if (!ready) return null; if (!session) return <Landing />; }
    // Opens on the side they used last. Everyone else starts on Get help.
    if (lastSide() === "work") {
      if (!ready || (session && !profile)) return null;
      go(profile?.is_worker ? "/work" : "/find", true); return null;
    }
    return <Book />;
  }
  return <Book />;
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </SessionProvider>
  );
}
