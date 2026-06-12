export default function SocialIcons({ settings, className = "", iconClassName = "social-icon", size = 19 }) {
  if (!settings) return null;
  if (!settings.instagram && !settings.facebook && !settings.tiktok) return null;
  return (
    <div className={`social-icons ${className}`.trim()}>
      {settings.instagram && (
        <a href={settings.instagram} target="_blank" rel="noopener noreferrer" className={iconClassName} title="Instagram">
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
        </a>
      )}
      {settings.facebook && (
        <a href={settings.facebook} target="_blank" rel="noopener noreferrer" className={iconClassName} title="Facebook">
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        </a>
      )}
      {settings.tiktok && (
        <a href={settings.tiktok} target="_blank" rel="noopener noreferrer" className={iconClassName} title="TikTok">
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.79a8.18 8.18 0 004.78 1.52V6.84a4.86 4.86 0 01-1.01-.15z"/></svg>
        </a>
      )}
    </div>
  );
}
