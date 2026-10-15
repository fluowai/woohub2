import React from "react";

interface WooTechLogoProps {
    variant?: "full" | "sidebar" | "icon";
    className?: string;
    iconSize?: number;
    colorMode?: "dark" | "light"; // "dark" = for dark sidebar/backgrounds, "light" = for white backgrounds
    showTagline?: boolean;
}

export function WooTechLogo({
    variant = "sidebar",
    className = "",
    iconSize = 36,
    colorMode = "dark",
    showTagline = false,
}: WooTechLogoProps) {
    const isDark = colorMode === "dark";

    // 3D folded ribbon W with upper-right pixel cubes
    const renderIcon = () => (
        <svg
            width={iconSize}
            height={iconSize * 0.75}
            viewBox="0 0 160 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 drop-shadow-sm select-none"
        >
            <defs>
                {/* Radiant Orange Ribbon Gradient */}
                <linearGradient id="wt-ribbon-orange-left" x1="15%" y1="0%" x2="55%" y2="100%">
                    <stop offset="0%" stopColor="#FFA23A" />
                    <stop offset="50%" stopColor="#FF6600" />
                    <stop offset="100%" stopColor="#E64A00" />
                </linearGradient>

                <linearGradient id="wt-ribbon-orange-right" x1="0%" y1="20%" x2="100%" y2="80%">
                    <stop offset="0%" stopColor="#FF7A1A" />
                    <stop offset="60%" stopColor="#FF5500" />
                    <stop offset="100%" stopColor="#E63E00" />
                </linearGradient>

                {/* Dark Inner Fold Gradient */}
                <linearGradient id="wt-ribbon-dark-fold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#252D3B" />
                    <stop offset="50%" stopColor="#181F2A" />
                    <stop offset="100%" stopColor="#0F141D" />
                </linearGradient>

                {/* Drop shadow filter */}
                <filter id="wt-shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
                </filter>
            </defs>

            {/* Left loop downward fold */}
            <path
                d="M 12 28 
                   C 18 28, 25 38, 30 52 
                   L 46 88 
                   C 50 96, 56 100, 62 98 
                   C 68 96, 73 88, 77 78 
                   L 95 36 
                   C 91 33, 85 32, 78 35 
                   L 60 76 
                   C 57 82, 53 84, 50 82 
                   C 47 80, 44 74, 41 66 
                   L 26 34 
                   C 23 28, 17 28, 12 28 Z"
                fill="url(#wt-ribbon-orange-left)"
            />

            {/* Inner Dark Fold (Loop 1 reverse side) */}
            <path
                d="M 60 76 
                   L 78 35 
                   C 82 33, 87 34, 91 37 
                   L 84 54 
                   C 80 62, 76 70, 72 78 
                   L 60 76 Z"
                fill="url(#wt-ribbon-dark-fold)"
            />

            {/* Middle to right loop upward fold */}
            <path
                d="M 72 78 
                   C 76 88, 83 98, 92 100 
                   C 100 102, 107 96, 114 85 
                   L 134 50 
                   C 131 46, 124 45, 118 48 
                   L 102 78 
                   C 98 84, 95 86, 92 84 
                   C 89 82, 86 76, 83 68 
                   L 72 78 Z"
                fill="url(#wt-ribbon-orange-right)"
            />

            {/* Upper Right Back Fold */}
            <path
                d="M 118 48 
                   L 134 50 
                   C 137 54, 138 60, 136 67 
                   L 125 78 
                   L 118 48 Z"
                fill="url(#wt-ribbon-dark-fold)"
            />

            {/* 5 Pixel Blocks / Cubes floating top-right */}
            {/* Cube 1: Main Orange block */}
            <rect x="126" y="32" width="9" height="9" rx="1.5" fill="#FF6600" />
            {/* Cube 2: Dark Charcoal block */}
            <rect x="138" y="24" width="7.5" height="7.5" rx="1" fill="#1E2530" />
            {/* Cube 3: Small Orange block */}
            <rect x="128" y="19" width="7" height="7" rx="1" fill="#FF7700" />
            {/* Cube 4: Medium Orange block */}
            <rect x="136" y="9" width="7" height="7" rx="1" fill="#FFA000" />
            {/* Cube 5: Top-right Orange block */}
            <rect x="145" y="2" width="7.5" height="7.5" rx="1" fill="#FF5500" />
        </svg>
    );

    if (variant === "icon") {
        return <div className={`inline-flex items-center justify-center ${className}`}>{renderIcon()}</div>;
    }

    if (variant === "sidebar") {
        return (
            <div className={`flex items-center gap-2.5 ${className}`}>
                {renderIcon()}
                <div className="flex flex-col leading-none">
                    <div className="flex items-center tracking-tight">
                        <span className={`text-[19px] font-black ${isDark ? "text-white" : "text-slate-900"} tracking-tight`}>
                            WOO
                        </span>
                        <span className="text-[19px] font-black text-[#FF6600] tracking-tight ml-0.5">
                            TECH
                        </span>
                    </div>
                    {showTagline && (
                        <span className="text-[8px] font-semibold text-slate-400 tracking-wider uppercase mt-1">
                            TECNOLOGIA
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // Full Brand Version (Image 2 style)
    return (
        <div className={`flex flex-col items-center text-center ${className}`}>
            <div className="transform scale-110 mb-2">{renderIcon()}</div>
            <div className="flex items-center tracking-tight text-3xl font-black mt-1">
                <span className={isDark ? "text-white" : "text-slate-900"}>WOO</span>
                <span className="text-[#FF6600] ml-0.5">TECH</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase mt-2">
                <span>IA</span>
                <span className="text-[#FF6600]">|</span>
                <span>WEB</span>
                <span className="text-[#FF6600]">|</span>
                <span>SEGURANÇA</span>
                <span className="text-[#FF6600]">|</span>
                <span>SUPORTE</span>
            </div>
            <div className="w-12 h-0.5 bg-[#FF6600] rounded-full my-2.5" />
            <p className="text-[9px] font-semibold text-slate-500 tracking-[0.25em] uppercase">
                TECNOLOGIA QUE IMPULSIONA RESULTADOS
            </p>
        </div>
    );
}
