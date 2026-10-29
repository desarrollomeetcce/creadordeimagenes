"use client";
import { useId } from "react";
import type { AdvisorTrend } from "../../lib/meta-ads/advisor-motivation";

/** Decorative scenes; the adjacent text carries the actual values and trend. */
export function AdvisorProgressIllustration({
  trend,
  met,
}: {
  trend: AdvisorTrend;
  met: boolean;
}) {
  const id = useId();
  const celebrate = trend === "improved" || (met && trend !== "declined");
  const warm = trend === "declined";
  const accent = met && !warm ? "#d6a03e" : warm ? "#ce8e3d" : "#45a793";
  const bars =
    trend === "declined"
      ? [45, 32, 21]
      : trend === "steady"
        ? [31, 31, 31]
        : [19, 32, 46];
  return (
    <svg
      className="advisor-progress-illustration"
      viewBox="0 0 260 200"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={warm ? "#f6d6a4" : "#c2e7dd"} />
          <stop offset="1" stopColor={warm ? "#efc1a6" : "#c8d4f6"} />
        </linearGradient>
      </defs>
      <path
        d="M30 65C32 17 108 12 155 23c54 12 85 38 74 87-10 47-56 69-109 62C62 165 15 134 30 65Z"
        fill={`url(#${id})`}
        opacity=".55"
      />
      <ellipse cx="131" cy="180" rx="97" ry="8" fill="#536582" opacity=".12" />
      <path
        d="M174 177h57v-30h-19v-22h-19v-21h-19Z"
        fill={accent}
        opacity=".16"
      />
      <path
        d="M174 104h19v21h19v22h19"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        opacity=".55"
        strokeLinejoin="round"
      />
      {trend === "pending" ? (
        <g transform="translate(164 40)">
          <rect width="63" height="60" rx="10" fill="#fff" />
          <rect width="63" height="16" rx="7" fill="#8c7cc6" />
          <path
            d="M16-4v12m30-12v12"
            stroke="#655391"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="32" cy="38" r="14" fill="#f0edf8" />
          <path
            d="M32 29v10l7 4"
            fill="none"
            stroke="#8c7cc6"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g transform="translate(164 39)">
          <rect width="70" height="63" rx="12" fill="#fff" />
          <path
            d="M10 50h51"
            stroke="#dce5eb"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {bars.map((h, i) => (
            <rect
              key={i}
              x={13 + i * 16}
              y={50 - h}
              width="10"
              height={h}
              rx="3"
              fill={accent}
              opacity={0.45 + i * 0.23}
            />
          ))}
        </g>
      )}
      <g className="advisor-progress-person">
        <path
          d="M103 133 99 167m24-34 14 33"
          fill="none"
          stroke="#405f82"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d="M98 165h-7q-7 0-8 8h23v-7m30-1h8q8 0 9 8h-24v-7"
          fill="#263d59"
        />
        <path d="M90 88Q112 79 134 88l7 49q-28 9-58 0Z" fill="#8172c5" />
        <path
          d="M95 89q17 13 34 0"
          fill="none"
          stroke="#a99de0"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={
            celebrate
              ? "M91 94 72 77 65 54M133 94 151 74 157 54"
              : warm
                ? "M91 94 77 112 96 117M132 94 149 111 162 104"
                : "M91 94 79 113 93 124M132 94 144 113 127 123"
          }
          fill="none"
          stroke="#b77957"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {celebrate ? (
          <>
            <circle cx="64" cy="51" r="7" fill="#d59a75" />
            <circle cx="158" cy="51" r="7" fill="#d59a75" />
          </>
        ) : warm ? (
          <>
            <circle cx="98" cy="117" r="7" fill="#d59a75" />
            <path
              d="m162 104 5-8m-5 8 9-3"
              stroke="#d59a75"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <rect
              x="95"
              y="105"
              width="33"
              height="31"
              rx="4"
              fill="#fbf7ed"
              transform="rotate(-6 112 120)"
            />
            <path
              d="m102 115 4 4 8-10m-10 18h15"
              stroke="#68a598"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="94" cy="124" r="5" fill="#d59a75" />
            <circle cx="129" cy="123" r="5" fill="#d59a75" />
          </>
        )}
        <path d="M105 72v15q8 7 15 0V72" fill="#b77957" />
        <ellipse cx="112" cy="57" rx="25" ry="28" fill="#dca480" />
        <circle cx="87" cy="59" r="5" fill="#dca480" />
        <circle cx="137" cy="59" r="5" fill="#dca480" />
        <path
          d="M87 55q-7-28 16-29 9-14 24-2 22 0 13 33l-7-14q-19 8-32-2l-10 17Z"
          fill="#3b3449"
        />
        <path
          d="M98 53q4-3 8-1m14 0q4-2 8 1"
          stroke="#65453e"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        {celebrate ? (
          <path
            d="M99 59q3-5 7 0m14 0q3-5 7 0"
            stroke="#443444"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          <>
            <ellipse cx="103" cy="59" rx="2" ry="2.5" fill="#443444" />
            <ellipse cx="123" cy="59" rx="2" ry="2.5" fill="#443444" />
          </>
        )}
        <ellipse cx="95" cy="65" rx="4" ry="2.2" fill="#cb7e70" opacity=".55" />
        <ellipse
          cx="130"
          cy="65"
          rx="4"
          ry="2.2"
          fill="#cb7e70"
          opacity=".55"
        />
        <path
          d={celebrate ? "M104 69q9 12 18 0Z" : "M106 70q7 6 14 0"}
          fill={celebrate ? "#8e4c49" : "none"}
          stroke="#8e4c49"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      {met ? (
        <g transform="translate(43 107)">
          <path d="m-8 18-6 23 14-8 14 8-6-23" fill="#b49ce1" />
          <circle r="23" fill="#f6d778" stroke="#d7a33c" strokeWidth="3" />
          <path
            d="m0-13 4 9 10 1-8 7 3 10-9-5-9 5 2-10-7-7 10-1Z"
            fill="#d39a30"
          />
        </g>
      ) : warm ? (
        <g transform="translate(45 146)">
          <path d="M-15 6h30l-4 22h-22Z" fill="#c18562" />
          <path
            d="M0 6v-29"
            stroke="#438e76"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0-8q-19-1-18-16Q0-24 0-8M0-17q0-17 17-20 4 17-17 20Z"
            fill="#61ad8e"
          />
        </g>
      ) : (
        <path
          d="m47 117 5 12 13 1-10 9 3 13-11-7-12 7 3-13-10-9 14-1Z"
          fill="#e6b857"
          opacity=".9"
        />
      )}
      <g
        className="advisor-progress-sparkles"
        fill={warm ? "#dca34f" : "#8b7ac3"}
      >
        <path d="m51 29 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <path d="m226 119 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
        <circle cx="71" cy="91" r="3" />
        <circle cx="186" cy="20" r="3" />
      </g>
    </svg>
  );
}
