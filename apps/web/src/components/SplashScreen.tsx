import { SPLASH_LOGO_PATH } from "~/branding";

export function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex size-24 items-center justify-center" aria-label="MarCode splash screen">
        <img alt="MarCode" className="size-16 object-contain" src={SPLASH_LOGO_PATH} />
      </div>
    </div>
  );
}
