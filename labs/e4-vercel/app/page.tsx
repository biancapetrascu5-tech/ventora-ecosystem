export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>E4 — Test conexiuni Vercel</h1>
      <ul>
        <li>
          <a href="/api/health">/api/health</a> — deployment ok, fără DB
        </li>
        <li>
          <a href="/api/a/booking">/api/a/booking</a> — Varianta A, lab_booking_user
        </li>
        <li>
          <a href="/api/a/core">/api/a/core</a> — Varianta A, lab_core_user
        </li>
        <li>
          <a href="/api/a/combined">/api/a/combined</a> — Varianta A, 2 clienți în paralel
        </li>
        <li>
          <a href="/api/b/combined">/api/b/combined</a> — Varianta B, lab_multi_user
        </li>
      </ul>
    </main>
  );
}
