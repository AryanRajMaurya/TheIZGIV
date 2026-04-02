import React from 'react';

interface GlassCardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick }) => (
  <div 
    onClick={onClick}
    className={`
      bg-gradient-to-br from-white/[0.08] to-white/[0.03] 
      backdrop-blur-2xl border border-white/10 
      shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)] 
      rounded-[32px] p-6 transition-all duration-500 
      hover:from-white/[0.12] hover:to-white/[0.05] 
      hover:border-white/20 hover:scale-[1.01] hover:shadow-[0_30px_60px_rgba(0,0,0,0.6)]
      ${className}
    `}
  >
    {children}
  </div>
);

interface GlassButtonProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  className?: string;
  accent?: string;
  title?: string;
}

export const GlassButton: React.FC<GlassButtonProps> = ({ children, onClick, active = false, className = '', accent, title }) => (
  <button 
    onClick={onClick}
    title={title}
    className={`
      flex items-center justify-center p-3 rounded-full transition-all duration-500
      backdrop-blur-xl border relative group
      ${active 
        ? 'bg-white text-black border-white shadow-[0_10px_30px_rgba(255,255,255,0.3)]' 
        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20'
      }
      ${className}
    `}
    style={active && accent ? { boxShadow: `0 0 25px ${accent}88`, borderColor: accent } : {}}
  >
    <div className="relative z-10">{children}</div>
    {!active && (
      <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-gradient-to-br from-white/10 to-transparent transition-opacity duration-500" />
    )}
  </button>
);

export const GlassInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="relative group">
    <input 
      {...props}
      className={`
        w-full bg-white/[0.03] backdrop-blur-3xl border border-white/10
        rounded-2xl px-8 py-4 text-white placeholder-white/20
        focus:outline-none focus:bg-white/[0.07] focus:border-white/20
        shadow-2xl transition-all duration-700 font-medium
        ${props.className}
      `}
    />
    <div className="absolute inset-0 rounded-2xl bg-white/5 opacity-0 group-focus-within:opacity-100 pointer-events-none transition-opacity duration-700" />
  </div>
);
