import Link from "next/link";

import { AdminGameList } from "@/components/admin/AdminGameList";

export const metadata = {
  title: "Admin — Stream Prize Games",
};

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/" className="underline">
          ← Back to games
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold">Streamer config</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-600 dark:text-neutral-400">
        Edit each game&apos;s payout table and odds. Saved config is read live by the overlay views,
        so an OBS Browser Source that is already open picks up changes without a restart.
      </p>

      <AdminGameList />
    </main>
  );
}
