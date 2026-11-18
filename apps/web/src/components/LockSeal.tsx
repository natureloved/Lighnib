/** LockSeal, the one memorable mark of the product: a padlock in a gold ring.
 * Used on the home hero and on the locked-till (scope) cards. */
export default function LockSeal({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "seal small" : "seal"} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" role="img" aria-label="Locked">
        <path
          d="M8 10V7a4 4 0 0 1 8 0v3"
          stroke="#f2b705"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect x="5" y="10" width="14" height="10" rx="2.5" fill="#f2b705" />
        <circle cx="12" cy="14.5" r="1.6" fill="#0b1f14" />
        <path d="M12 15.5v2" stroke="#0b1f14" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
