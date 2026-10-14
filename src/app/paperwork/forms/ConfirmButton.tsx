"use client";

// A submit button that asks first, for changes that are hard to take back.
export default function ConfirmButton({ children, message, className = "btn" }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button type="submit" className={className} onClick={(e) => !confirm(message) && e.preventDefault()}>
      {children}
    </button>
  );
}
