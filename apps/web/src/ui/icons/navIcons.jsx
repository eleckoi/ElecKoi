const messageBubblePath = 'M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963L2.0377 14.3334Z';

const navSvg = size => ({ width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' });

export function MessageNavIcon({ size = 24 } = {}) {
  return (
    <svg {...navSvg(size)} strokeWidth={1.2} className="message-nav-icon" viewBox="0 0 16 16" aria-hidden="true">
      <g transform="translate(16 0) scale(-1 1)">
        <path className="nav-fill" opacity="0" d={messageBubblePath} />
        <path d={messageBubblePath} />
      </g>
      <circle className="nav-cutout message-nav-dot" fill="currentColor" stroke="none" cx="6" cy="7.6" r="0.7" />
      <circle className="nav-cutout message-nav-dot" fill="currentColor" stroke="none" cx="10" cy="7.6" r="0.7" />
    </svg>
  );
}

export function PersonNavIcon({ size = 24 } = {}) {
  return (
    <svg {...navSvg(size)} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="nav-fill" opacity="0" cx="11.3" cy="7.7" r="4.2" />
      <path className="nav-fill" opacity="0" d="M4.1 20.2c.72-4.25 3.15-6.35 7.2-6.35 2.3 0 4.15.68 5.42 2.04l-1.3 4.31H4.1Z" />
      <path d="M11.3 11.9a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z" />
      <path d="M4.1 20.2c.72-4.25 3.15-6.35 7.2-6.35 2.3 0 4.15.68 5.42 2.04" />
      <path d="M17.6 8.1h3.2M17.6 11h2.35" />
    </svg>
  );
}

export function PresetNavIcon({ size = 24 } = {}) {
  return (
    <svg {...navSvg(size)} className="preset-nav-agent" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.69 5.7a8 8 0 0 1 4.28 7.8M16 19.73a8 8 0 0 1-8 0M4.03 13.5a8 8 0 0 1 4.28-7.8" />
      <circle cx="12" cy="4.8" r="2.55" />
      <circle cx="5.25" cy="17.1" r="2.55" />
      <circle cx="18.75" cy="17.1" r="2.55" />
    </svg>
  );
}

export function ModelNavIcon({ size = 24 } = {}) {
  return (
    <svg {...navSvg(size)} className="model-nav-cube" viewBox="0 0 24 24" aria-hidden="true">
      <path className="nav-fill model-cube-face" opacity="0" d="M12 2.9 20.2 7.35 12 11.9 3.8 7.35Z" />
      <path className="nav-fill model-cube-face" opacity="0" d="M3.8 7.35 12 11.9v9.2l-8.2-4.45Z" />
      <path className="nav-fill model-cube-face" opacity="0" d="M12 11.9 20.2 7.35v9.3L12 21.1Z" />
      <path d="M12 2.9 20.2 7.35v9.3L12 21.1 3.8 16.65v-9.3Z" />
      <path className="model-cube-inner" d="M3.8 7.35 12 11.9l8.2-4.55M12 11.9v9.2" />
    </svg>
  );
}

export function PluginNavIcon() {
  return <svg className="plugin-nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942" stroke="currentColor" />
    <path d="M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037" stroke="currentColor" />
    <path d="M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798" stroke="currentColor" />
    <path d="M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723" stroke="currentColor" />
  </svg>;
}

export function CreatorStudioNavIcon({ size = 24 } = {}) {
  return (
    <svg {...navSvg(size)} className="creator-studio-nav" viewBox="0 0 24 24" aria-hidden="true">
      <rect className="nav-fill" opacity="0" x="2.5" y="4" width="19" height="16" rx="4.75" />
      <rect x="2.5" y="4" width="19" height="16" rx="4.75" />
      <path
        className="creator-studio-star"
        fill="currentColor" stroke="none"
        d="M240 128a15.79 15.79 0 0 1-10.5 15l-63.44 23.07L143 229.5a16 16 0 0 1-30 0l-23.06-63.44L26.5 143a16 16 0 0 1 0-30l63.44-23.06L113 26.5a16 16 0 0 1 30 0l23.06 63.44L229.5 113A15.79 15.79 0 0 1 240 128Z"
        transform="translate(8 8) scale(.03125)"
      />
    </svg>
  );
}

export function CommunityNavIcon({ size = 24 } = {}) {
  return (
    <svg {...navSvg(size)} className="community-nav-group" viewBox="0 0 24 24" aria-hidden="true">
      <g className="nav-fill" opacity="0">
        <circle cx="9" cy="8" r="3.15" />
        <path d="M3.4 19.4c.55-3.72 2.42-5.58 5.6-5.58s5.05 1.86 5.6 5.58Z" />
        <path d="M14.6 5.45a3 3 0 0 1 0 5.1Z" />
        <path d="M16.15 13.7c2.55.42 4 2.32 4.45 5.7h-3.7c-.15-2.35-.5-4.25-1.45-5.7Z" />
      </g>
      <circle cx="9" cy="8" r="3.15" />
      <path d="M3.4 19.4c.55-3.72 2.42-5.58 5.6-5.58s5.05 1.86 5.6 5.58" />
      <path d="M14.6 5.45a3 3 0 0 1 0 5.1" />
      <path d="M16.15 13.7c2.55.42 4 2.32 4.45 5.7" />
    </svg>
  );
}
