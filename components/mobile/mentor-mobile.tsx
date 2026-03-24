"use client"

import MentorImmersivePanel from "@/components/mentor/mentor-immersive-panel"

export default function MentorMobile() {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-950/80 p-4">
        <h2 className="text-lg font-semibold text-white">Mentor MTM</h2>
        <p className="mt-1 text-sm text-gray-300">
          Continuidade do teu onboarding e fast-start, com plano de execução até Rising Star e Bronze Star.
        </p>
      </div>
      <MentorImmersivePanel compact />
    </div>
  )
}

