import { assetSrc } from "../../app/services/assets.js";
import { useEffect, useState } from "react";

export function Avatar({ src, name, className = "", as: Element = "div", ...elementProps }) {
  const resolvedSrc = assetSrc(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  return (
    <Element {...elementProps} className={`avatar ${className}`}>
      {resolvedSrc && !failed ? (
        <img src={resolvedSrc} alt={name || "avatar"} onError={() => setFailed(true)} />
      ) : (
        <span>{(name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </Element>
  );
}
