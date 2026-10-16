import type { ComponentType } from "react";
export interface DatabaseUIServices {
  getStudioSession(): Promise<{ preview?: unknown } | null>;
  AreaNavigation: ComponentType<{
    label?: string;
    links: { href: string; label: string; exact?: boolean }[];
  }>;
}
