"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Award, History, PenTool } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CertificatesSectionShellProps {
  activeTab: "studio" | "operations";
  basePath: string;
  description: string;
  children: ReactNode;
}

const TAB_CONFIG = [
  {
    value: "studio" as const,
    label: "Studio",
    icon: PenTool,
  },
  {
    value: "operations" as const,
    label: "Operations",
    icon: History,
  },
];

export function CertificatesSectionShell(props: CertificatesSectionShellProps) {
  const { activeTab, basePath, description, children } = props;
  const router = useRouter();

  return (
    <div className="space-y-4">
      <PageHeader title="Certificates" description={description} />

      <div className="rounded-xl border bg-card/60 p-3">
        <Tabs
          value={activeTab}
          onValueChange={(value) => router.push(`${basePath}/${value}`)}
          className="gap-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Award className="h-4 w-4 text-primary" />
              Certificates workspace
            </div>
            <TabsList variant="line" className="w-full sm:w-auto">
              {TAB_CONFIG.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>
      </div>

      {children}
    </div>
  );
}
