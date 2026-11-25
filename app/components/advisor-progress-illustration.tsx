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

export function AdvisorOverallIllustration({
  stage,
}: {
  stage: "goal" | "near" | "half" | "decline" | "start" | "pending";
}) {
  const color =
    stage === "goal" || stage === "near"
      ? "#28a782"
      : stage === "decline"
        ? "#db9060"
        : stage === "pending"
          ? "#8399ad"
          : "#9176d4";
  return (
    <svg
      viewBox="0 0 70 70"
      className="advisor-stage-illustration"
      aria-hidden="true"
      focusable="false"
      style={{ color }}
    >
      <path
        d="M11 29C16 12 32 9 45 12c16 4 25 21 18 36-5 12-17 15-30 13C15 59 5 46 11 29Z"
        fill="currentColor"
        opacity=".15"
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {stage === "goal" && (
          <path d="M24 22h23v13a11 11 0 0 1-23 0Zm0 3H16v5q0 10 10 10m21-15h8v5q0 10-10 10M35 46v9m-9 0h18M32 17l3-5 3 5" />
        )}
        {stage === "near" && (
          <path d="M15 57q10 0 14-11t13-12m0 1V16q8-4 17 1l-3 9q-7-3-14 1m-7 31h10" />
        )}
        {stage === "half" && (
          <path d="M13 51h44M18 51l11-20 8 12 8-17 13 25M29 31l4 3m8 18h-7m-13-4 7-6" />
        )}
        {stage === "decline" && (
          <path d="M17 49q8-14 17-8 8 5 17-14m-9 2 10-3-1 10M17 20h13m-13 6h8m29 29h-9" />
        )}
        {stage === "start" && (
          <path d="M35 56V36Q35 22 51 21q2 13-15 17m-1 4q-18 1-18-13 13-1 17 11M22 56h26" />
        )}
        {stage === "pending" && (
          <path d="M24 20h23v33H24Zm8 9h8m-8 8h8m-8 8h5m1-29v8m-5-4h10" />
        )}
      </g>
    </svg>
  );
}
