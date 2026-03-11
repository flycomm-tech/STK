export default function PlatformHeader() {
  return (
    <div className="flex items-center gap-2.5 group pointer-events-none">
      <img 
        src="/Favicon.png"
        alt="Spectra"
        className="w-8 h-8 object-contain flex-shrink-0 brightness-200 invert opacity-90"
      />
      <div className="overflow-hidden">
        <p className="text-sm font-bold text-slate-100 tracking-tight leading-tight">FLYCOMM</p>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest leading-tight">Spectral Awareness SOC</p>
      </div>
    </div>
  );
}