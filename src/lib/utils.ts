import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CATEGORIES = [
  "Overdraft & Bank Fees",
  "Late Fees & Payment Cascades",
  "Financial Visibility",
  "Budgeting & Planning Overwhelm",
  "Goal Setting & Savings Inability",
  "Income Volatility & Timing",
  "Debt Spiral",
  "Emergency Expense Shock",
  "Subscription & Recurring Charge Traps",
  "Financial Tool Frustration",
] as const;

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export const SUBREDDITS = [
  "povertyfinance",
  "personalfinance",
  "YNAB",
  "Frugal",
  "FinancialPlanning",
  "MoneyDiariesACTIVE",
  "antiwork",
  "payroll",
  "x/twitter",
] as const;

// Muted, corporate-friendly palette — desaturated, low-key
export const CATEGORY_COLORS: Record<string, string> = {
  "Overdraft & Bank Fees": "#dc2626",
  "Late Fees & Payment Cascades": "#ea580c",
  "Financial Visibility": "#ca8a04",
  "Budgeting & Planning Overwhelm": "#65a30d",
  "Goal Setting & Savings Inability": "#16a34a",
  "Income Volatility & Timing": "#0d9488",
  "Debt Spiral": "#0891b2",
  "Emergency Expense Shock": "#2563eb",
  "Subscription & Recurring Charge Traps": "#7c3aed",
  "Financial Tool Frustration": "#db2777",
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: "#16a34a",
  medium: "#ca8a04",
  high: "#ea580c",
  critical: "#dc2626",
};
