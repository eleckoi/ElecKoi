import { assetSrc, avatarSources } from "../../app/services/assets.js";
import { useState } from "react";
import { avatarCropStyle } from "./avatarCropStyle.js";

export function Avatar({ src, name, crop, className = "", as: Element = "div", loading, thumbnail = true, ...elementProps }) {
  const resolvedSrc = assetSrc(src);
  const sources = thumbnail ? avatarSources(src) : { src: resolvedSrc };
  const [failure, setFailure] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const stage = failure && failure.src === src ? failure.stage : 0;
  const hasThumbnail = sources.src !== resolvedSrc;

  return (
    <Element {...elementProps} className={`avatar ${className}`}>
      {resolvedSrc && stage < 2 ? (
        <img src={stage ? resolvedSrc : sources.src} srcSet={stage ? undefined : sources.srcSet}
          loading={loading} decoding="async" alt={name || "avatar"}
          style={avatarCropStyle(crop, geometry?.src === src ? geometry : null)}
          onLoad={crop ? event => setGeometry({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }) : undefined}
          onError={() => setFailure({ src, stage: hasThumbnail && stage === 0 ? 1 : 2 })} />
      ) : (
        <span>{(name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </Element>
  );
}
