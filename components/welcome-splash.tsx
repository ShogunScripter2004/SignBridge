"use client"

export function WelcomeSplash({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={[
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-[#F5F3E7] text-neutral-900", // switch to beige background
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
        style={{ color: "#10B981" }} // switch to green accent
      >
        NAMASTE!
      </div>
    </div>
  )
}
