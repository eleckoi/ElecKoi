import { modelIdentityMeta } from "../model/modelIdentity.js";

export function ModelIdentityIcon({ modelName, providerId, className = "" }) {
  const identity = modelIdentityMeta(modelName, providerId);
  if (identity.icon) {
    const classes = [className, identity.monochrome ? "model-monochrome-icon" : ""].filter(Boolean).join(" ");
    return <img className={classes} src={identity.icon} alt="" aria-hidden="true" draggable="false" />;
  }
  return <span className={`${className} model-identity-fallback`} aria-hidden="true">{identity.initials}</span>;
}
