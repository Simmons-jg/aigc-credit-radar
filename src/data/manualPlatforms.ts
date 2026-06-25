import type { Language } from "../types";

export const customManualPlatformId = "custom";

export interface ManualPlatformOption {
  id: string;
  labels: Record<Language, string>;
  defaultUnit: "credits" | "tokens";
  websiteUrl?: string;
}

export const manualPlatformOptions: ManualPlatformOption[] = [
  {
    id: "openart",
    labels: { zh: "OpenArt", en: "OpenArt" },
    defaultUnit: "credits",
    websiteUrl: "https://openart.ai/",
  },
  {
    id: "lovart",
    labels: { zh: "Lovart", en: "Lovart" },
    defaultUnit: "credits",
    websiteUrl: "https://www.lovart.ai/",
  },
  {
    id: "tapnow",
    labels: { zh: "TapNow", en: "TapNow" },
    defaultUnit: "tokens",
    websiteUrl: "https://app.tapnow.ai/",
  },
  {
    id: "updream",
    labels: { zh: "Updream", en: "Updream" },
    defaultUnit: "credits",
    websiteUrl: "https://www.updream.cn/",
  },
  {
    id: "libtv",
    labels: { zh: "LibTV / Liblib", en: "LibTV / Liblib" },
    defaultUnit: "credits",
    websiteUrl: "https://www.liblib.art/",
  },
  {
    id: "keling",
    labels: { zh: "可灵 / Kling", en: "Kling" },
    defaultUnit: "credits",
    websiteUrl: "https://kling.ai/",
  },
  {
    id: "shotlab",
    labels: { zh: "ShotLab", en: "ShotLab" },
    defaultUnit: "credits",
    websiteUrl: "https://aigc.xinpianchang.com/",
  },
];

export function manualPlatformLabel(platform: string, language: Language) {
  return manualPlatformOptions.find((option) => option.id === platform)?.labels[language];
}

export function manualPlatformDefaultUnit(platform: string) {
  return manualPlatformOptions.find((option) => option.id === platform)?.defaultUnit ?? "credits";
}

export function manualPlatformWebsiteUrl(platform: string) {
  return manualPlatformOptions.find((option) => option.id === platform)?.websiteUrl;
}

export function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function customPlatformIdFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `custom-${slug}` : `custom-${Date.now()}`;
}
