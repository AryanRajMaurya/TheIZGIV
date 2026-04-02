import React from 'react';
import { GlassCard } from './GlassUI';
import { Sliders, Zap, Music, Volume2 } from 'lucide-react';

interface EqualizerProps {
  gains: number[];
  onGainChange: (index: number, gain: number) => void;
  accent: string;
}

const PRESETS = [
  { name: 'Flat', values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', values: [8, 7, 6, 4, 2, 0, 0, 0, 0, 0] },
  { name: 'Pop', values: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
  { name: 'Rock', values: [4, 3, 2, 1, 0, -1, 1, 2, 3, 4] },
  { name: 'Electronic', values: [6, 5, 0, -2, -3, 0, 2, 4, 5, 6] },
];

export const Equalizer: React.FC<EqualizerProps> = ({ gains, onGainChange, accent }) => {
  const bands = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

  const applyPreset = (values: number[]) => {
    values.forEach((v, i) => onGainChange(i, v));
  };

  return (
    <GlassCard className="!p-8 !rounded-[40px] border-white/5 bg-black/40 overflow-hidden relative group">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Sliders size={20} className="text-white/40" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">10-Band EQ</h2>
        </div>
        <div className="flex gap-2">
          {PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p.values)}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all border border-white/5"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-end h-48 gap-2 md:gap-4 lg:gap-6 px-2">
        {bands.map((label, i) => (
          <div key={label} className="flex flex-col items-center flex-1 h-full group/band">
            <div className="relative flex-1 w-full flex justify-center">
              {/* Track */}
              <div className="absolute inset-y-0 w-1 bg-white/10 rounded-full" />
              {/* Value Highlight */}
              <div 
                className="absolute w-1 rounded-full bg-gradient-to-t"
                style={{ 
                  bottom: '50%',
                  height: `${Math.abs(gains[i]) * 4}%`,
                  background: `linear-gradient(to ${gains[i] >= 0 ? 'top' : 'bottom'}, ${accent}, transparent)`,
                  transform: gains[i] < 0 ? 'translateY(100%)' : 'none'
                }}
              />
              {/* Slider Input (Vertical Hack) */}
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={gains[i]}
                onChange={(e) => onGainChange(i, parseFloat(e.target.value))}
                className="vertical-slider absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-10"
                style={{ appearance: 'none', writingMode: 'bt-lr' } as any}
              />
              {/* Thumb Visual */}
              <div 
                className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all group-hover/band:scale-125 z-20"
                style={{ bottom: `calc(${((gains[i] + 12) / 24) * 100}% - 6px)` }}
              />
            </div>
            <span className="mt-4 text-[8px] font-black text-white/30 uppercase tracking-tighter group-hover/band:text-white/60 transition-colors">{label}</span>
          </div>
        ))}
      </div>
      
      <div className="mt-6 pt-6 border-t border-white/5 flex justify-center gap-12">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em]">Purity</span>
          <Music size={12} className="text-white/20" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em]">Impact</span>
          <Zap size={12} className="text-white/20" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em]">Volume</span>
          <Volume2 size={12} className="text-white/20" />
        </div>
      </div>
    </GlassCard>
  );
};
