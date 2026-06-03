type MilesPageProps = {
  onBack: () => void
}

export default function MilesPage({ onBack }: MilesPageProps) {
  return (
    <div className="min-h-screen bg-[#efeff4] p-4">
      <button
        onClick={onBack}
        className="mb-4 h-[50px] px-5 rounded-[16px] bg-white font-bold"
      >
        Back
      </button>

      <div className="bg-white rounded-[20px] p-5">
        <h1 className="text-[24px] font-bold">
          Miles
        </h1>

        <p className="mt-2 text-zinc-500">
          Miles page coming soon
        </p>
      </div>
    </div>
  )
}