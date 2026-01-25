import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function for merging Tailwind CSS classes
 *
 * Combines clsx (for conditional classes) with tailwind-merge
 * (for intelligent Tailwind class deduplication).
 *
 * Example:
 * cn("px-2 py-1", condition && "bg-blue-500", "px-4")
 * // Result: "py-1 bg-blue-500 px-4" (px-4 overwrites px-2)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
