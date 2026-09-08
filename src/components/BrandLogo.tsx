import React from "react";

interface BrandLogoProps {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showName?: boolean;
  appIcon?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = "",
  markClassName = "h-9 w-9",
  wordmarkClassName = "text-lg",
  showName = true,
  appIcon = false,
}) => (
  <div className={`inline-flex items-center gap-2.5 ${className}`} aria-label="AfiliHub">
    <img
      src={appIcon ? "/icon.svg" : "/afilihub-mark.svg"}
      alt=""
      aria-hidden="true"
      className={`${markClassName} shrink-0 object-contain`}
    />
    {showName && (
      <span className={`font-brand font-black leading-none tracking-[-0.045em] text-brand-gradient ${wordmarkClassName}`}>
        AfiliHub
      </span>
    )}
  </div>
);
