import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

/**
 * Button Component
 *
 * A reusable button with multiple variants and sizes.
 * Uses Tailwind classes for consistent styling across the app.
 *
 * Variants:
 * - primary: Blue background, white text (default)
 * - secondary: Gray background, dark text
 * - ghost: Transparent background, hover effect
 * - danger: Red background, white text
 *
 * Sizes:
 * - sm: Small padding (mobile-friendly)
 * - md: Medium padding (default)
 * - lg: Large padding (CTAs)
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold rounded-lg ' +
      'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

    const variants = {
      primary: 'bg-primary-500 text-white hover:bg-primary-600 hover:shadow-lg focus:ring-primary-500',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
      ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
      danger: 'bg-red-500 text-white hover:bg-red-600 hover:shadow-lg focus:ring-red-500',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    if (asChild) {
      // If asChild, return a slot for composition (like with Next.js Link)
      return (
        <span
          ref={ref as any}
          className={cn(baseStyles, variants[variant], sizes[size], className)}
          {...props}
        />
      );
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
