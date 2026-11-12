export function ProviderLogo({ provider, className }) {
  if (provider.icon) {
    const classes = [className, provider.monochrome ? "model-monochrome-icon" : ""].filter(Boolean).join(" ");
    return <img className={classes} src={provider.icon} alt="" aria-hidden="true" draggable="false" />;
  }
  return <span className={[className, "model-provider-initials"].filter(Boolean).join(" ")} aria-hidden="true">{provider.initials}</span>;
}
