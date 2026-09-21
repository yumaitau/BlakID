export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#191715" />
      <path d="M14 44V20h10c8 0 13 4 13 12s-5 12-13 12H14zm8-8h2c3.2 0 5-1.6 5-4s-1.8-4-5-4h-2v8z" fill="#D7C1A1" />
      <path d="M40 20h10v24H40z" fill="#D74C2E" />
    </svg>
  );
}
