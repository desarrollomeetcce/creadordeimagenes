export function AdvisorProgressIllustration({
  kind,
  state,
}: {
  kind: "effectiveness" | "sales";
  state: "met" | "close" | "progress" | "pending" | "unset";
}) {
  const symbol = state === "met" ? "star" : state === "close" ? "flag" : kind;
  return (
    <svg
      viewBox="0 0 76 76"
      className="advisor-goal-art"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M13 25C20 12 36 9 49 14c14 4 24 17 20 32-4 13-16 19-33 18C17 63 5 48 13 25Z"
        fill="currentColor"
        opacity=".16"
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {symbol === "star" && (
          <>
            <path
              d="m38 19 6 12 14 2-10 10 2 14-12-7-12 6 2-13-10-10 14-2Z"
              fill="currentColor"
              fillOpacity=".22"
            />
            <path d="m33 40 4 4 7-9M17 21l-4-3m47 4 5-4m-8 37 4 4" />
          </>
        )}
        {symbol === "flag" && (
          <>
            <path
              d="M17 58c10-3 11-15 23-15 7 0 8 5 20 4M38 42V18c8-7 14 6 24 0l-3 13c-9 5-14-6-21-1"
              fill="currentColor"
              fillOpacity=".16"
            />
            <path d="m13 48 5-3m11 14 5-4" />
          </>
        )}
        {symbol === "effectiveness" && (
          <>
            <path d="M54 36a18 18 0 1 1-15-15m8 22a10 10 0 1 1-11-13m2 10 19-20m-3-6 1 7 7 1" />
            <path d="m19 56-4 5m11-1-2 5" />
          </>
        )}
        {symbol === "sales" && (
          <>
            <path d="m18 40 12-7 12 7-12 7Zm0 0v14l12 7 12-7V40M30 47v14m12-22 10-6 12 7-12 7-10-6m10 6v13l12-7V40M29 27l12-7 12 7-11 7Z" />
            <path d="M17 25l4 3m39-7 4-4" />
          </>
        )}
      </g>
    </svg>
  );
}
