import type { Configuration } from "../types/product";

function toBase64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

export interface DecodedShare {
  configuration: Partial<Configuration>;
  /** 链接引用的规则包版本；旧版链接没有该字段，为 null（升级时补成首版） */
  ruleVersion: number | null;
}

const CONFIGURATION_KEYS: Array<keyof Configuration> = ["color", "material", "filter", "battery", "stand", "trim"];

/** 把配置和当前规则包版本一起编码进分享链接 */
export function encodeConfiguration(configuration: Configuration, ruleVersion: number): string {
  return toBase64Url(JSON.stringify({ v: 2, rv: ruleVersion, ...configuration }));
}

export function decodeConfiguration(payload: string): DecodedShare | null {
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as Partial<Configuration> & { v?: number; rv?: number };
    if (CONFIGURATION_KEYS.some((key) => typeof parsed[key] !== "string")) return null;
    const configuration = Object.fromEntries(CONFIGURATION_KEYS.map((key) => [key, parsed[key]])) as Partial<Configuration>;
    return { configuration, ruleVersion: typeof parsed.rv === "number" ? parsed.rv : null };
  } catch {
    return null;
  }
}

export function createShareUrl(configuration: Configuration, ruleVersion: number): string {
  return `${window.location.origin}${window.location.pathname}#/share/${encodeConfiguration(configuration, ruleVersion)}`;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(price);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
