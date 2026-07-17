/**
 * ReadSettings — reading view settings using shadcn components
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAppStore } from "@/stores/app-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useFontStore } from "@readany/core/stores";
import { type RubyMode, useRubyStore } from "@readany/core/stores/ruby-store";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

export function ReadSettingsPanel() {
  const { t } = useTranslation();
  const { readSettings, updateReadSettings } = useSettingsStore();
  const customFonts = useFontStore((s) => s.fonts);
  const selectedFontId = useFontStore((s) => s.selectedFontId);
  const setSelectedFont = useFontStore((s) => s.setSelectedFont);

  const currentFontValue = selectedFontId ?? "system";

  const handleFontChange = (v: string) => {
    if (v === "system") {
      setSelectedFont(null);
    } else {
      setSelectedFont(v);
    }
  };

  return (
    <div className="space-y-6 p-4 pt-3">
      <section className="rounded-lg bg-muted/60 p-4">
        <h2 className="mb-4 text-sm font-medium text-foreground">{t("settings.reading_title")}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{t("settings.reading_desc")}</p>
        <p className="mb-4 text-xs text-muted-foreground/60">{t("settings.readingNotice")}</p>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t("settings.viewMode")}</span>
            <Select
              value={readSettings.viewMode ?? "paginated"}
              onValueChange={(v) => updateReadSettings({ viewMode: v as "paginated" | "scroll" })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paginated">{t("settings.paginated")}</SelectItem>
                <SelectItem value="scroll">{t("settings.scroll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t("settings.paginatedLayout")}</span>
            <Select
              value={readSettings.paginatedLayout ?? "double"}
              onValueChange={(v) =>
                updateReadSettings({ paginatedLayout: v as "single" | "double" })
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">{t("settings.singlePage")}</SelectItem>
                <SelectItem value="double">{t("settings.doublePage")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font */}
          <div className="flex items-center justify-between">
            <!-- Font theme removed -->
      </section>

    </div>
  );
}
