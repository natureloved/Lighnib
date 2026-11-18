/** LockSeal, the one memorable mark of the product: a padlock in a gold ring,
 * whose keyhole is a lightning bolt. The ring comes from the .seal CSS;
 * this SVG is the padlock + bolt keyhole, matching the Lighnib logo mark. */
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
        <path
          d="M12.8 13.2 L10 16 H11.6 L10.8 18.4 L14 15.2 H12.4 Z"
          fill="#0b1f14"
        />
      </svg>
    </span>
  );
}
