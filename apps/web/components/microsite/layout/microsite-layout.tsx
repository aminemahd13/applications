import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { MicrositeSettings } from "@event-platform/shared";
import { MicrositeCustomCode } from "../custom-code";
import { cn } from "@/lib/utils";
import {
  micrositeInter,
  micrositeNeco,
  micrositePally,
  micrositePoppins,
  micrositeSfPro,
} from "../theme/fonts";
import {
  getMicrositeStyleVariables,
  MICROSITE_RUNTIME_CSS,
  normalizeMicrositeSettings,
  resolveMicrositeBodyClass,
  resolveMicrositeHeadingClass,
  resolveMicrositeMotionClass,
  resolveMicrositeThemeClass,
} from "../theme/runtime";

export function MicrositeLayout({
  children,
  settings,
  basePath,
}: {
  children: React.ReactNode;
  settings: MicrositeSettings;
  basePath?: string;
}) {
  const normalizedSettings = normalizeMicrositeSettings(settings);
  const customCode = normalizedSettings.customCode ?? {};
  const styleVariables = getMicrositeStyleVariables(normalizedSettings);
  const themeClass = resolveMicrositeThemeClass(normalizedSettings.theme);
  const headingClass = resolveMicrositeHeadingClass(normalizedSettings);
  const bodyClass = resolveMicrositeBodyClass(normalizedSettings);
  const motionClass = resolveMicrositeMotionClass(normalizedSettings);
  const isStickyNavbar = normalizedSettings.navigation?.sticky ?? true;

  return (
    <div
      data-microsite-root="true"
      className={cn(
        "relative flex min-h-screen flex-col antialiased",
        micrositeInter.variable,
        micrositeSfPro.variable,
        micrositePoppins.variable,
        micrositePally.variable,
        micrositeNeco.variable,
        themeClass,
        bodyClass,
        headingClass,
        motionClass,
      )}
      style={styleVariables}
    >
      <MicrositeCustomCode html={customCode.headHtml} css={customCode.css} />
      <MicrositeCustomCode html={customCode.bodyStartHtml} />
      <MicrositeBackground patternStyle={normalizedSettings.design?.patternStyle} />
      <Navbar
        settings={normalizedSettings.navigation}
        basePath={basePath}
        siteName={normalizedSettings.branding?.siteName}
        tagline={normalizedSettings.branding?.tagline}
        themePreference={normalizedSettings.theme}
      />
      <main className={cn("flex-grow pb-12", isStickyNavbar ? "pt-16" : "pt-0")}>{children}</main>
      <Footer
        settings={normalizedSettings.footer}
        basePath={basePath}
        branding={normalizedSettings.branding}
        logoAssetKey={normalizedSettings.navigation?.logoAssetKey}
      />
      <MicrositeCustomCode html={customCode.bodyEndHtml} />
      <style
        dangerouslySetInnerHTML={{
          __html: MICROSITE_RUNTIME_CSS,
        }}
      />
    </div>
  );
}

function MicrositeBackground({
  patternStyle,
}: {
  patternStyle?: NonNullable<MicrositeSettings["design"]>["patternStyle"];
}) {
  const safePattern = patternStyle ?? "circuits";

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-30 bg-[var(--mm-bg)]" />
      {safePattern === "circuits" && (
        <div
          className="pointer-events-none fixed inset-0 -z-20 overflow-hidden"
          style={{ opacity: "var(--mm-pattern-opacity)" }}
        >
          <div className="absolute -top-6 left-1/2 h-[44rem] w-[32rem] -translate-x-full">
            <div
              className="absolute inset-0 bg-contain bg-no-repeat bg-right-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-lines.png)" }}
            />
            <div
              className="absolute inset-0 bg-contain bg-no-repeat bg-right-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-components.webp)" }}
            />
          </div>
          <div className="absolute -top-6 right-1/2 h-[44rem] w-[32rem] translate-x-full">
            <div
              className="absolute inset-0 -scale-x-100 bg-contain bg-no-repeat bg-left-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-lines.png)" }}
            />
            <div
              className="absolute inset-0 -scale-x-100 bg-contain bg-no-repeat bg-left-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-components.webp)" }}
            />
          </div>
        </div>
      )}
      {safePattern === "dots" && (
        <div
          className="pointer-events-none fixed inset-0 -z-20"
          style={{
            opacity: "var(--mm-pattern-opacity)",
            backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--mm-accent) 38%, transparent) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      )}
      {safePattern === "grid" && (
        <div
          className="pointer-events-none fixed inset-0 -z-20"
          style={{
            opacity: "var(--mm-pattern-opacity)",
            backgroundImage:
              "linear-gradient(color-mix(in oklab, var(--mm-accent) 16%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--mm-accent) 16%, transparent) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
      )}
      {safePattern === "none" && (
        <div
          className="pointer-events-none fixed inset-0 -z-20"
          style={{ opacity: 0 }}
        />
      )}
      {safePattern !== "none" && (
        <div className="pointer-events-none fixed inset-0 -z-10 mm-bg-overlay" />
      )}
      {safePattern === "none" && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              "radial-gradient(40rem 20rem at 10% -10%, color-mix(in oklab, var(--mm-accent) 18%, transparent), transparent 70%), radial-gradient(32rem 16rem at 100% 0%, color-mix(in oklab, var(--mm-accent-2) 18%, transparent), transparent 72%)",
          }}
        />
      )}
    </>
  );
}
