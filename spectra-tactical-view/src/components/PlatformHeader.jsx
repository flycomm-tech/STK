export default function PlatformHeader() {
  return (
    <div className="flex flex-col items-start gap-1 group pointer-events-none w-full">
      <img
        src="/fcic.png"
        alt="Spectra"
        className="w-28 h-28 object-contain flex-shrink-0"
      />
      <p className="text-[9px] text-slate-400 uppercase tracking-widest leading-tight whitespace-nowrap">Spectral Awareness SOC</p>
    </div>
  );
}