import { headers } from "next/headers";
import { Hero } from "~/components/Hero";
import { Features } from "~/components/Features";
import { Installation } from "~/components/Installation";
import { Footer } from "~/components/Footer";
import { detectOS } from "~/lib/detectOS";
import { fetchLatestRelease } from "~/lib/github";

export default async function LandingPage() {
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") ?? "";
  const os = detectOS(userAgent);
  const release = await fetchLatestRelease();

  return (
    <main className="min-h-screen">
      <Hero os={os} release={release} />
      <Features />
      <Installation />
      <Footer />
    </main>
  );
}
