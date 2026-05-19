"use client";

import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";

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
  const settings = initialSettings ?? DEFAULT_SETTINGS;
  const pathname = usePathname();

  const isMaintenanceMode = settings.maintenanceMode;
  const isExcludedRoute =
    pathname?.startsWith("/admin") || pathname?.startsWith("/login");

  if (isMaintenanceMode && !isExcludedRoute) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <EmptyState
          tone="maintenance"
          title="Under maintenance"
          description="We are currently performing scheduled maintenance to improve our platform. Please check back soon."
          footer={
            <div className="text-xs text-muted-foreground">
              {settings.platformName}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <PlatformSettingsContext.Provider value={settings}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}
