import React from 'react';

export interface CyberMetadataItem {
  label: string;
  value?: string | number;
  highlight?: boolean;
}

export interface CyberMetadataProps {
  items: (CyberMetadataItem | string)[];
  separator?: string;
  className?: string;
}

/**
 * Renders metadata according to strict Zero-Pill discipline:
 * Clean, unboxed text with subtle typographic separators, no pill capsules.
 */
export const CyberMetadata: React.FC<CyberMetadataProps> = ({
  items,
  separator = '·',
  className = '',
}) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-xs font-mono tracking-widest text-[#6b7280] ${className}`}
    >
      {items.map((item, index) => {
        const isString = typeof item === 'string';
        const label = isString ? item : item.label;
        const value = !isString ? item.value : undefined;
        const isHighlighted = !isString && item.highlight;

        return (
          <React.Fragment key={index}>
            <span
              className={`inline-flex items-center gap-1.5 uppercase ${
                isHighlighted ? 'text-[#00ff88] font-semibold' : 'text-[#a0a0b0]'
              }`}
            >
              <span>{label}</span>
              {value !== undefined && (
                <span className="text-[#e0e0e0] font-bold">{value}</span>
              )}
            </span>
            {index < items.length - 1 && (
              <span aria-hidden="true" className="text-[#404055] select-none">
                {separator}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export interface CyberFilterTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface CyberFilterTabsProps<T extends string> {
  tabs: CyberFilterTab<T>[];
  activeTab: T;
  onTabChange: (id: T) => void;
  className?: string;
}

/**
 * Functional interactive filter control with cyber chamfer styling
 */
export const CyberFilterTabs = <T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: CyberFilterTabsProps<T>) => {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 p-1 bg-[#12121a] border border-[#2a2a3a] cyber-chamfer-sm ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all duration-150 whitespace-nowrap cursor-pointer cyber-chamfer-sm select-none ${
              isActive
                ? 'bg-[#00ff88] text-[#0a0a0f] font-bold shadow-[0_0_10px_rgba(0,255,136,0.5)]'
                : 'text-[#6b7280] hover:text-[#e0e0e0] hover:bg-[#1c1c2e]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-1.5 tabular-nums text-[10px] ${
                  isActive ? 'text-[#0a0a0f]' : 'text-[#00d4ff]'
                }`}
              >
                ({tab.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
