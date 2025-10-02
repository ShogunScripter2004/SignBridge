"use client"

export function WelcomeSplash({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={[
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-[#f6f6f6] text-neutral-900",
        "transition-opacity duration-500",
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <div
        className={[
          "text-4xl font-semibold tracking-wide select-none",
          "transition-transform duration-500",
          visible ? "scale-100" : "scale-95",
        ].join(" ")}
        style={{ color: "#007AFF" }}
      >
        NAMASTE!
      </div>
    </div>
  )
}
