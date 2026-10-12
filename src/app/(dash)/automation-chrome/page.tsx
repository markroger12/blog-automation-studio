import { PageHeader } from '@/components/ui';

export default function SetupHelp() {
  return (
    <>
      <PageHeader title="Setup & help" description="One-time setup on Windows. Nothing here stores passwords." />
      <div className="card max-w-3xl space-y-4 text-sm leading-6">
        <section><h2 className="font-semibold">1. Automation Chrome (for ChatGPT)</h2>
          <p>Use a dedicated Chrome profile so automation never touches your personal browsing. In PowerShell:</p>
          <pre className="overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`& "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="$PWD\\data\\chatgpt-chrome" --no-first-run https://chatgpt.com/`}</pre>
          <p>Sign in to ChatGPT manually in that window. Keep it open (minimized is fine) while tasks run.</p></section>
        <section><h2 className="font-semibold">2. Install the extension</h2>
          <ol className="list-decimal pl-5"><li>In the Automation Chrome window open <code>chrome://extensions</code> and enable Developer mode.</li><li>Click “Load unpacked” and choose the <code>extension</code> folder of this project.</li><li>Settings → “Generate new key”, paste it into the extension popup, set worker tabs (start with 2), tick “Process jobs”, Save, then “Test connection”.</li></ol></section>
        <section><h2 className="font-semibold">3. WordPress sites</h2>
          <p>Websites → Add website → “Login (manual)”. A Chrome window opens on wp-admin; sign in yourself (2FA is fine). Then “Sync categories”. Drafts only — publishing requires typing the site name under “Allow publishing…”.</p></section>
        <section><h2 className="font-semibold">If something stops</h2>
          <ul className="list-disc pl-5"><li><b>Login required</b>: sign in again in the relevant window, then “Resume” the task.</li><li><b>Human verification</b>: complete it manually; the app never solves CAPTCHAs.</li><li><b>Usage limit</b>: the app backs off account-wide automatically (Dashboard shows until when).</li><li>Crashes/restarts: just run <code>npm run dev:all</code> again — work resumes from the last completed stage without resending prompts or duplicating drafts.</li></ul></section>
      </div>
    </>
  );
}
