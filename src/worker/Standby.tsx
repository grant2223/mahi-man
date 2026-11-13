// What a worker sees while they're online and no job is open yet. Uber shows "Finding trips",
// DoorDash shows "Looking for offers" with a pulse around your spot. This is ours: a radar around their pin.
export function Standby() {
  return (
    <div className="sb-a" aria-live="polite">
      <div className="sb-radar" aria-hidden="true">
        <span className="ring" /><span className="ring" /><span className="ring" />
        <span className="sweep" />
        <span className="dot" style={{ left: "22%", top: "30%" }} />
        <span className="dot" style={{ left: "74%", top: "24%", animationDelay: "1.1s" }} />
        <span className="dot" style={{ left: "66%", top: "72%", animationDelay: "2.3s" }} />
        <span className="dot" style={{ left: "28%", top: "70%", animationDelay: "3.2s" }} />
        <span className="pin"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg></span>
      </div>
      <p className="sb-h">Looking for jobs near you<span className="sb-dots"><i>.</i><i>.</i><i>.</i></span></p>
      <p className="sb-s">Stand by. Your phone buzzes the moment one comes in.</p>
    </div>
  );
}
