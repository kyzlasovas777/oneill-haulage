"use client"

type TrucksManagerProps = {
  onClose: () => void
}

export function TrucksManager({ onClose }: TrucksManagerProps) {
return (
  <div className="fixed inset-0 bg-black/20 z-[90] flex items-center justify-center px-4">
    <div className="w-full max-w-[360px] bg-[#efeff4] rounded-[30px] px-4 pt-6 pb-5 shadow-xl">
      <h2 className="text-center text-[24px] font-bold text-black mb-5">
        Trucks
      </h2>

      <button className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold mb-3">
        + Add Truck
      </button>

      <button
        onClick={onClose}
        className="w-full h-[46px] rounded-[20px] text-zinc-500 text-[17px] font-semibold"
      >
        Close
      </button>
    </div>
  </div>
)
}