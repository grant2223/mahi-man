import { usePath, go } from "./lib/router";
import { SessionProvider, useSession } from "./lib/session";
import { ToastProvider } from "./ui/kit";
import { ResetPassword } from "./ui/Auth";
import { Book } from "./customer/Book";
import { Track } from "./customer/Track";
import { MyJobs } from "./customer/MyJobs";
import { Work } from "./worker/Work";
import { Admin } from "./admin/Admin";

function Routes() {
  const path = usePath().split("?")[0];
  const { session, ready } = useSession();
  if (path === "/reset") return <div className="app"><ResetPassword onDone={() => go("/", true)} /></div>;
  if (path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/work")) return <Work />;
  const m = path.match(/^\/job\/([0-9a-f-]{36})$/);
  if (m) {
    if (ready && !session) { go("/", true); return null; }
    return <Track id={m[1]} />;
  }
  if (path === "/jobs") {
    if (ready && !session) { go("/", true); return null; }
    return <MyJobs />;
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
