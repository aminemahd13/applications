"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";

export interface PublicPlatformSettings {
  platformName: string;
  platformUrl: string;
  primaryColor: string;
  footerText: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  emailVerificationRequired: boolean;
  supportEmail: string;
}

const DEFAULT_SETTINGS: PublicPlatformSettings = {
  platformName: "Math&Maroc",
  platformUrl: "",
  primaryColor: "#2563eb",
  footerText: "",
  maintenanceMode: false,
  registrationEnabled: true,
  emailVerificationRequired: true,
  supportEmail: "",
};

const PlatformSettingsContext = createContext<PublicPlatformSettings>(DEFAULT_SETTINGS);

export function usePlatformSettings() {
  return useContext(PlatformSettingsContext);
}

interface PlatformSettingsProviderProps {
  children: React.ReactNode;
  initialSettings?: PublicPlatformSettings;
}

export function PlatformSettingsProvider({
  children,
  initialSettings,
}: PlatformSettingsProviderProps) {
  const [settings, setSettings] = useState<PublicPlatformSettings>(
    initialSettings || DEFAULT_SETTINGS
  );
  const pathname = usePathname();

  // If we didn't get initial settings (e.g. error fetching), use defaults
  // Realistically we might want to refetch client-side but for now server-provided is best

  const isMaintenanceMode = settings.maintenanceMode;
  const isExcludedRoute =
    pathname?.startsWith("/admin") || pathname?.startsWith("/login");

  if (isMaintenanceMode && !isExcludedRoute) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <div className="mb-4 rounded-full bg-yellow-500/10 p-4">
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Under Maintenance
        </h1>
        <p className="max-w-[500px] text-muted-foreground">
          We are currently performing scheduled maintenance to improve our
          platform. Please check back soon.
        </p>
        <div className="mt-8 text-sm text-muted-foreground">
            {settings.platformName}
        </div>
      </div>
    );
  }

  return (
    <PlatformSettingsContext.Provider value={settings}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}
