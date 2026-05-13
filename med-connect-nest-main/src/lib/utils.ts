import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prefix a doctor's name with "Dr. " unless it already starts with a title. */
export function doctorName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "—";
  if (/^(dr\.?|prof\.?|doctor)\s/i.test(n)) return n;
  return `Dr. ${n}`;
}
