import EducatorStudio from "@/components/live/educator-studio"

export default function LiveSessionsStudioPage() {
  return (
    <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-[#D2A63C] mb-2">Live Sessions Studio</h1>
        <p className="text-sm text-gray-300 mb-6">
          Login independente para educadores com gestão de RTMPS/OBS key e estado online/offline.
        </p>
        <EducatorStudio />
      </div>
    </main>
  )
}

