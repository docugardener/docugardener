// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * DocuGardener brand logo component.
 *
 * Mark + wordmark rendered as inline SVG — transparent background, scales
 * cleanly at any size, and respects dark mode via CSS currentColor/explicit
 * color props.
 *
 * Usage:
 *   <Logo />                          — default (32 px mark height, light)
 *   <Logo variant="mark" />           — mark only (icon slot in Sidebar)
 *   <Logo variant="lockup" dark />    — lockup on dark background
 */

interface LogoProps {
  /** "lockup" = mark + wordmark (default). "mark" = icon only. */
  variant?: "lockup" | "mark"
  /** Adjust rendered height in px. Width scales proportionally. */
  height?: number
  /** Use light-on-dark colour scheme. */
  dark?: boolean
  className?: string
}

/** The mark paths — shared between lockup and mark-only variants. */
function MarkPaths({ stroke, green }: { stroke: string; green: string }) {
  return (
    <>
      <path
        d="M12 52 L12 28 C 12 18, 22 12, 36 12 L52 12 L52 28 C 52 40, 42 52, 28 52 Z"
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M16 48 L44 20" stroke={green} strokeWidth="3" strokeLinecap="round" />
      <path d="M24 40 L34 40" stroke={green} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 34 L40 34" stroke={green} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="48" r="3" fill={green} />
      <circle cx="44" cy="20" r="3" fill={green} />
      <circle cx="34" cy="40" r="2.5" fill={green} />
      <circle cx="40" cy="34" r="2.5" fill={green} />
    </>
  )
}

export function Logo({ variant = "lockup", height = 32, dark = false, className }: LogoProps) {
  const stroke = dark ? "#F1F5F9" : "#0B1220"
  const green = "#4E8C5E"
  const wordmarkFill = dark ? "#F1F5F9" : "#0B1220"

  if (variant === "mark") {
    // Square mark — viewBox 64×64, height = prop
    return (
      <svg
        width={height}
        height={height}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="DocuGardener"
        role="img"
        className={className}
      >
        <MarkPaths stroke={stroke} green={green} />
      </svg>
    )
  }

  // Lockup — mark (64 wide) + gap (12) + text. Text rendered as SVG text so
  // it scales proportionally with the height. The 64-unit viewBox mark sits
  // in an 520×96 canvas matching the reference SVG aspect ratio.
  const scale = height / 96
  const width = Math.round(520 * scale)

  return (
    <svg
      width={width}
      height={height}
      viewBox="16 4 492 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DocuGardener"
      role="img"
      className={className}
    >
      {/* Mark positioned at 28,16 matching the reference lockup SVG */}
      <g transform="translate(28 16)">
        <MarkPaths stroke={stroke} green={green} />
      </g>
      {/* Wordmark */}
      <text
        x="104"
        y="59"
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fontSize="30"
        letterSpacing="-0.6"
        fill={wordmarkFill}
        fontWeight="400"
      >
        Docu
        <tspan fontWeight="600" fill={green}>
          Gardener
        </tspan>
      </text>
    </svg>
  )
}
