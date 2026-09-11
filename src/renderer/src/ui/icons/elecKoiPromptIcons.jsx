// Exact prompt marker glyph used by the current Android setting-library position guide.
// Source glyph: Font Awesome Free, CC BY 4.0 (see the Android repository NOTICE).
export function ElecKoiPromptMarkerIcon({ size = 15, className }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <path
        d="M96 32Q96 18 105 9Q114 0 128 0H384Q398 0 407 9Q416 18 416 32Q416 46 407 55Q398 64 384 64H355L366 212Q423 243 445 307L446 310Q451 325 442 339Q432 352 416 352H96Q80 352 70 339Q61 325 66 310L67 307Q89 243 146 212L158 64H128Q114 64 105 55Q96 46 96 32ZM224 384H288H224H288V480Q288 494 279 503Q270 512 256 512Q242 512 233 503Q224 494 224 480V384Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Dedicated setting-library entry glyph from Android AppIconPaths.PromptPosition.
// It is intentionally separate from both the thumbtack above and generic files.
export function ElecKoiSettingEntryIcon({ size = 18, className }) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 512 512"
      aria-hidden="true"
    >
      <path
        d="M480 96Q479 69 461 51Q443 33 416 32H96Q69 33 51 51Q33 69 32 96V416Q33 443 51 461Q69 479 96 480H416Q443 479 461 461Q479 443 480 416V96ZM288 160Q288 174 279 183Q270 192 256 192H160Q146 192 137 183Q128 174 128 160Q128 146 137 137Q146 128 160 128H256Q270 128 279 137Q288 146 288 160ZM352 224Q366 224 375 233Q384 242 384 256Q384 270 375 279Q366 288 352 288H160Q146 288 137 279Q128 270 128 256Q128 242 137 233Q146 224 160 224H352ZM224 352Q224 366 215 375Q206 384 192 384H160Q146 384 137 375Q128 366 128 352Q128 338 137 329Q146 320 160 320H192Q206 320 215 329Q224 338 224 352Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
