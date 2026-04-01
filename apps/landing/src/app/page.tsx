import { headers } from "next/headers";
import { Hero } from "~/components/Hero";
import { Features } from "~/components/Features";
import { Footer } from "~/components/Footer";
import { detectOS } from "~/lib/detectOS";

export default async function LandingPage() {
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") ?? "";
  const os = detectOS(userAgent);

  return (
    <main className="min-h-screen">
      <Hero os={os} />
      <Features />
      <Footer />
    </main>
  );
}
