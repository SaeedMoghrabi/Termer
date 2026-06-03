type TermerMarkProps = {
  className?: string;
  title?: string;
  decorative?: boolean;
};

type TermerBrandProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  subtitleClassName?: string;
  subtitle?: string;
};

const SLOT_RADIUS = 6;

export function TermerMark({
  className = "",
  title = "Termer",
  decorative = false,
}: TermerMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 196 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      {!decorative && <title>{title}</title>}
      <rect className="termerMark__slot termerMark__slot--white" x="0" y="0" width="46" height="28" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--primary" x="54" y="0" width="46" height="28" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--secondary" x="108" y="0" width="46" height="28" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--highlight" x="162" y="0" width="34" height="28" rx={SLOT_RADIUS} />

      <rect className="termerMark__slot termerMark__slot--white" x="54" y="40" width="32" height="32" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--secondary" x="96" y="40" width="74" height="32" rx={SLOT_RADIUS} />

      <rect className="termerMark__slot termerMark__slot--white" x="54" y="88" width="32" height="32" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--accent" x="96" y="88" width="74" height="32" rx={SLOT_RADIUS} />

      <rect className="termerMark__slot termerMark__slot--white" x="54" y="136" width="32" height="32" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--primary" x="96" y="136" width="74" height="32" rx={SLOT_RADIUS} />

      <rect className="termerMark__slot termerMark__slot--white" x="54" y="184" width="32" height="32" rx={SLOT_RADIUS} />
      <rect className="termerMark__slot termerMark__slot--support" x="96" y="184" width="74" height="32" rx={SLOT_RADIUS} />
    </svg>
  );
}

export function TermerBrand({
  className = "",
  markClassName = "",
  wordmarkClassName = "",
  subtitleClassName = "",
  subtitle,
}: TermerBrandProps) {
  return (
    <span className={`termerBrand ${className}`.trim()}>
      <TermerMark className={`termerBrand__mark ${markClassName}`.trim()} decorative />
      <span className="termerBrand__copy">
        <span className={`termerBrand__wordmark ${wordmarkClassName}`.trim()}>Termer</span>
        {subtitle ? (
          <span className={`termerBrand__subtitle ${subtitleClassName}`.trim()}>{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
