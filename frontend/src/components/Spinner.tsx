export default function Spinner({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em] ${className}`}
    />
  );
}
