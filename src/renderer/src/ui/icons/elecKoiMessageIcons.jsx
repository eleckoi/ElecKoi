function StrokeIcon({ paths, size = 18, className, viewBox = '0 0 24 24', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} className={className} viewBox={viewBox} fill="none" aria-hidden="true">
      {paths.map((path) => <path key={path} d={path} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  )
}

function FilledIcon({ paths, size = 18, className, viewBox = '0 0 24 24' }) {
  return <svg width={size} height={size} className={className} viewBox={viewBox} aria-hidden="true">
    {paths.map((path) => <path key={path} d={path} fill="currentColor" />)}
  </svg>;
}

export const MoreDotsIcon = ({ size = 22, className }) => <svg width={size} height={size} className={className} viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="5" cy="12" r="2.25" fill="currentColor" />
  <circle cx="12" cy="12" r="2.25" fill="currentColor" />
  <circle cx="19" cy="12" r="2.25" fill="currentColor" />
</svg>;

export const MessagePencilIcon = (props) => <FilledIcon {...props} viewBox="0 0 512 512" paths={[
  'M410 231 422 220 410 231 422 220 388 186 326 124 292 90 280 101 258 124 59 323Q43 339 36 360L1 481Q-3 494 7 504Q17 514 31 511L151 475Q173 469 189 453L388 254L410 231ZM160 399 151 422 160 399 151 422Q145 427 138 429L59 452L82 374Q85 367 89 361L112 352V384Q113 398 128 400H160ZM363 19 348 33 363 19 348 33 326 56 314 67 348 101 410 163 444 197 455 186 478 163 493 149Q511 129 511 103Q511 78 493 58L453 19Q434 0 408 0Q383 0 363 19ZM315 187 171 331 315 187 171 331Q160 340 149 331Q139 319 149 308L293 164Q304 155 315 164Q325 175 315 187Z',
]} />;
export const HistoryIcon = (props) => <StrokeIcon {...props} paths={['M4.8 12a7.2 7.2 0 1 0 2.1-5.1', 'M4.8 5.2v4.1h4.1', 'M12 7.8v4.55l3.1 1.85']} />;
export const CopyIcon = (props) => <StrokeIcon {...props} paths={['M8.2 8.2h10.3v10.3H8.2z', 'M5.5 15.8V7.5a2 2 0 0 1 2-2h8.3']} />;
export const RefreshMessageIcon = (props) => <StrokeIcon {...props} paths={['M18.9 8.4A7.45 7.45 0 0 0 5.8 7.2L4.6 9.2', 'M4.4 5.35v4h4', 'M5.1 15.6a7.45 7.45 0 0 0 13.1 1.2l1.2-2', 'M19.6 18.65v-4h-4']} />;
export const SpeakerIcon = (props) => <StrokeIcon {...props} paths={['M5 14.5h3.2l4.3 3.8V5.7L8.2 9.5H5a1.5 1.5 0 0 0-1.5 1.5v2A1.5 1.5 0 0 0 5 14.5Z', 'M16.2 9.2a4.2 4.2 0 0 1 0 5.6M18.8 6.8a7.6 7.6 0 0 1 0 10.4']} />;
export const TranslateIcon = (props) => <StrokeIcon {...props} paths={['M4.5 5.2h7.8M8.4 3.8v1.4M6.1 8.4c1 2.2 2.7 4 5.1 5.2', 'M11.9 8.4c-.75 1.85-2.35 3.72-4.9 5.65', 'M13.3 20.2 17 10.8l3.7 9.4M14.4 17.4h5.2']} />;
export const MessageChevronRightIcon = (props) => <StrokeIcon {...props} paths={['m9 5.5 6.5 6.5L9 18.5']} />;
export const MessageChevronLeftIcon = (props) => <StrokeIcon {...props} paths={['m15 5.5-6.5 6.5 6.5 6.5']} />;

export function SearchSettingIcon({ size = 20, className }) {
  return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5.2 3.5h9.5c.93 0 1.4.47 1.4 1.4v7.33M5.2 3.5c-.93 0-1.4.47-1.4 1.4v13.3c0 1 .5 1.5 1.5 1.5H14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 3.5V9l1.8-1.2L10.6 9V3.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16.6" cy="16.4" r="4.2" stroke="currentColor" strokeWidth="1.75" /><path d="m19.57 19.37 2.43 2.43" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>;
}

export function ToolWrenchIcon({ size = 18, className }) {
  return <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M14 3.3a3.8 3.8 0 0 1-4.8 4.8l-5.1 5.1a1.6 1.6 0 1 1-2.3-2.3l5.1-5.1A3.8 3.8 0 0 1 11.7 1L9.4 3.3l2.3 2.3L14 3.3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
