import type { Configuration } from "../types/product";
import type { RulePackage } from "../types/rulePackage";
import { migrateSharedPayload } from "./migrate";

function toBase64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

export interface EncodedConfiguration extends Partial<Configuration> {
  v?: number;
  rulePackageId?: string;
  rulePackageVersion?: string;
}

export function encodeConfiguration(configuration: Configuration, rulePackage?: RulePackage): string {
  const payload: Record<string, unknown> = { v: 1, ...configuration };
  if (rulePackage) {
    payload.rulePackageId = rulePackage.id;
    payload.rulePackageVersion = rulePackage.version;
  }
  return toBase64Url(JSON.stringify(payload));
}

export function decodeConfiguration(payload: string): EncodedConfiguration {
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as EncodedConfiguration;
    const keys: Array<keyof Configuration> = ["color", "material", "filter", "battery", "stand", "trim"];
    if (keys.some((key) => typeof parsed[key] !== "string")) return {};
    const migrated = migrateSharedPayload(parsed as Record<string, unknown>);
    return { ...parsed, ...migrated };
  } catch {
    return {};
  }
}

export function createShareUrl(configuration: Configuration, rulePackage?: RulePackage): string {
  return `${window.location.origin}${window.location.pathname}#/share/${encodeConfiguration(configuration, rulePackage)}`;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(price);
}
